import { prisma } from '@/lib/prisma';
import { CreatePostRequest, PostResponse, PostType, PostStatus } from '@/types';
import { JWTPayload } from '@/middleware/auth';

interface UserProfile {
  collegeId?: string;
  department?: string;
  role?: string;
  avatarUrl?: string;
}

export class PostService {
  
  private async getUserProfile(userId: string): Promise<UserProfile | null> {
    try {
      const response = await fetch(`${process.env.PROFILE_SERVICE_URL || 'http://localhost:4002'}/v1/profile/user/${userId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        console.warn(`Profile service returned ${response.status} for user ${userId}`);
        // Return default values if profile service is unavailable
        return {
          collegeId: 'default-college',
          department: 'Unknown',
          role: 'student'
        };
      }
      
      const profileData = await response.json() as any;
      console.log('Profile service response structure:', JSON.stringify(profileData, null, 2));
      
      return {
        collegeId: profileData.collegeId || 'default-college',
        department: profileData.department || 'Unknown',
        role: profileData.roles?.[0] || 'student', // roles is an array, take first role
        avatarUrl: profileData.avatarUrl
      };
    } catch (error) {
      console.error('Failed to get user profile:', error);
      // Return default values on error
      return {
        collegeId: 'default-college',
        department: 'Unknown',
        role: 'student'
      };
    }
  }
  async createPost(data: CreatePostRequest, user: JWTPayload): Promise<PostResponse> {
    // Get complete user profile information as fallback
    const userProfile = await this.getUserProfile(user.sub);
    
    console.log('=== POST CREATION AUTHOR FIELDS ===');
    console.log('Request data authorCollegeId:', data.authorCollegeId);
    console.log('Request data authorDepartment:', data.authorDepartment);
    console.log('Request data authorAvatarUrl:', data.authorAvatarUrl);
    console.log('JWT user collegeId:', user.collegeId);
    console.log('JWT user department:', user.department);
    console.log('JWT user avatarUrl:', user.avatarUrl);
    console.log('Profile service data:', userProfile);
    
    // Create the post with complete author information
    const post = await prisma.post.create({
      data: {
        type: data.type,
        content: data.content,
        visibility: data.visibility || 'PUBLIC',
        status: (data.status as any) || 'PUBLISHED',
        
        // Author info - prioritize request data, then JWT, then profile service
        authorId: user.sub,
        authorDisplayName: user.displayName || user.name || 'Unknown User',
        authorAvatarUrl: data.authorAvatarUrl || user.avatarUrl || userProfile?.avatarUrl || null,
        authorRole: user.role || userProfile?.role || 'student',
        authorDepartment: data.authorDepartment || user.department || userProfile?.department || null,
        authorCollegeId: data.authorCollegeId || user.collegeId || userProfile?.collegeId || 'default-college',
        
        // Type-specific data
        badgeData: data.badgeData || undefined,
        collaborationData: data.collaborationData || undefined,
        projectData: data.projectData || undefined,
        eventData: data.eventData || undefined,
        jobData: data.jobData || undefined,
      }
    });

    // Add tags if provided
    if (data.tags && data.tags.length > 0) {
      await prisma.postTag.createMany({
        data: data.tags.map(tag => ({
          postId: post.id,
          tag: tag.toLowerCase()
        }))
      });
    }

    // Add links if provided
    if (data.links && data.links.length > 0) {
      await prisma.postLink.createMany({
        data: data.links.map((link, index) => ({
          postId: post.id,
          url: link.url,
          title: link.title,
          order: index
        }))
      });
    }

    // Link media to post through PostMedia junction table
    if (data.mediaIds && data.mediaIds.length > 0) {
      console.log(`Linking ${data.mediaIds.length} media files to post ${post.id}`);
      
      // Verify all media exists and belongs to the user
      const existingMedia = await prisma.media.findMany({
        where: { 
          id: { in: data.mediaIds },
          ownerUserId: user.sub
        }
      });
      
      if (existingMedia.length !== data.mediaIds.length) {
        throw new Error('Some media files not found or not owned by user');
      }
      
      // Create PostMedia junction records
      await prisma.postMedia.createMany({
        data: existingMedia.map((media, index) => ({
          postId: post.id,
          mediaId: media.id,
          order: index
        }))
      });
      
      console.log(`Successfully linked ${existingMedia.length} media files to post`);
    }

    // Fetch the complete post with all relations
    return this.getPostById(post.id, user.sub);
  }

  async getPostById(postId: string, userId?: string): Promise<PostResponse> {
    const post = await prisma.post.findUniqueOrThrow({
      where: { id: postId },
      include: {
        media: {
          include: {
            media: true
          },
          orderBy: { order: 'asc' }
        },
        tags: true,
        links: {
          orderBy: { order: 'asc' }
        },
        likes: userId ? {
          where: { userId }
        } : false,
        bookmarks: userId ? {
          where: { userId }
        } : false
      }
    });

    return this.transformPost(post, userId);
  }

  async getFeed(params: {
    scope: 'global' | 'college' | 'following';
    userId?: string;
    cursor?: string;
    limit: number;
    postTypes?: PostType[];
    search?: string;
    authorId?: string;
  }) {
    const { scope, userId, cursor, limit, postTypes, search, authorId } = params;

    let whereClause: any = {};

    // Filter by post types if specified
    if (postTypes && postTypes.length > 0) {
      whereClause.type = { in: postTypes };
    }

    // Search functionality
    if (search && search.trim()) {
      const searchTerm = search.trim();
      whereClause.OR = [
        ...(whereClause.OR || []),
        { content: { contains: searchTerm, mode: 'insensitive' } },
        { authorDisplayName: { contains: searchTerm, mode: 'insensitive' } },
        { tags: { some: { name: { contains: searchTerm, mode: 'insensitive' } } } },
        { projectData: { path: ['projectTitle'], string_contains: searchTerm } },
        { eventData: { path: ['title'], string_contains: searchTerm } }
      ];
    }

    // Filter by specific author if provided
    if (authorId) {
      whereClause.authorId = authorId;
    }

    // Scope filtering with visibility rules
    switch (scope) {
      case 'college':
        if (userId) {
          // Get user's college ID from profile service or JWT
          const userProfile = await this.getUserProfile(userId);
          if (userProfile?.collegeId) {
            // Show PUBLIC posts + COLLEGE posts from same college
            whereClause.OR = [
              { visibility: 'PUBLIC' },
              { 
                AND: [
                  { visibility: 'COLLEGE' },
                  { authorCollegeId: userProfile.collegeId }
                ]
              }
            ];
          } else {
            // If no college ID, only show PUBLIC posts
            whereClause.visibility = 'PUBLIC';
          }
        } else {
          // Unauthenticated users only see PUBLIC posts
          whereClause.visibility = 'PUBLIC';
        }
        break;
      case 'following':
        if (userId) {
          // Get posts from users that this user follows
          const following = await prisma.userFollow.findMany({
            where: { followerId: userId },
            select: { followingId: true }
          });
          
          if (following.length > 0) {
            const userProfile = await this.getUserProfile(userId);
            whereClause.AND = [
              { authorId: { in: following.map(f => f.followingId) } },
              {
                OR: [
                  { visibility: 'PUBLIC' },
                  { 
                    AND: [
                      { visibility: 'COLLEGE' },
                      { authorCollegeId: userProfile?.collegeId || 'no-college' }
                    ]
                  }
                ]
              }
            ];
          } else {
            // If not following anyone, return empty
            whereClause.authorId = 'never-match';
          }
        } else {
          // Unauthenticated users can't see following feed
          whereClause.authorId = 'never-match';
        }
        break;
      case 'global':
        // Global scope only shows PUBLIC posts
        whereClause.visibility = 'PUBLIC';
        break;
    }

    // Cursor pagination
    if (cursor) {
      whereClause.id = { lt: cursor };
    }

    const posts = await prisma.post.findMany({
      where: whereClause,
      include: {
        media: {
          include: {
            media: true
          },
          orderBy: { order: 'asc' }
        },
        tags: true,
        links: {
          orderBy: { order: 'asc' }
        },
        likes: userId ? {
          where: { userId }
        } : false,
        bookmarks: userId ? {
          where: { userId }
        } : false
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    const transformedPosts = posts.map(post => this.transformPost(post, userId));
    
    return {
      items: transformedPosts,
      nextCursor: posts.length === limit ? posts[posts.length - 1].id : null,
      hasMore: posts.length === limit
    };
  }

  async likePost(postId: string, userId: string): Promise<{ liked: boolean, likeCount: number }> {
    const existingLike = await prisma.postLike.findUnique({
      where: {
        postId_userId: {
          postId,
          userId
        }
      }
    });

    let liked: boolean;

    if (existingLike) {
      // Unlike
      await prisma.postLike.delete({
        where: {
          postId_userId: {
            postId,
            userId
          }
        }
      });
      
      await prisma.post.update({
        where: { id: postId },
        data: { likeCount: { decrement: 1 } }
      });
      
      liked = false;
    } else {
      // Like
      await prisma.postLike.create({
        data: { postId, userId }
      });
      
      await prisma.post.update({
        where: { id: postId },
        data: { likeCount: { increment: 1 } }
      });
      
      liked = true;
    }

    const post = await prisma.post.findUnique({
      where: { id: postId }
    });

    return { liked, likeCount: post?.likeCount || 0 };
  }

  async updatePost(postId: string, data: Partial<CreatePostRequest>, userId: string): Promise<PostResponse> {
    const post = await prisma.post.findUnique({
      where: { id: postId }
    });

    if (!post) {
      throw new Error('Post not found');
    }

    if (post.authorId !== userId) {
      throw new Error('Unauthorized to update this post');
    }

    // Update the post
    const updatedPost = await prisma.post.update({
      where: { id: postId },
      data: {
        content: data.content,
        visibility: data.visibility,
        badgeData: data.badgeData,
        collaborationData: data.collaborationData,
        projectData: data.projectData,
        eventData: data.eventData,
        jobData: data.jobData
      }
    });

    // Handle tags update
    if (data.tags !== undefined) {
      await prisma.postTag.deleteMany({
        where: { postId }
      });

      if (data.tags.length > 0) {
        await prisma.postTag.createMany({
          data: data.tags.map(tag => ({
            postId,
            tag: tag.trim()
          }))
        });
      }
    }

    // Handle links update
    if (data.links !== undefined) {
      await prisma.postLink.deleteMany({
        where: { postId }
      });

      if (data.links.length > 0) {
        await prisma.postLink.createMany({
          data: data.links.map((link, index) => ({
            postId,
            url: link.url,
            title: link.title || `Link ${index + 1}`,
            order: index
          }))
        });
      }
    }

    // Handle media update
    if (data.mediaIds !== undefined) {
      await prisma.postMedia.deleteMany({
        where: { postId }
      });

      if (data.mediaIds.length > 0) {
        const existingMedia = await prisma.media.findMany({
          where: {
            id: { in: data.mediaIds },
            ownerUserId: userId
          }
        });
        
        if (existingMedia.length !== data.mediaIds.length) {
          throw new Error('Some media files not found or not owned by user');
        }
        
        await prisma.postMedia.createMany({
          data: existingMedia.map((media, index) => ({
            postId,
            mediaId: media.id,
            order: index
          }))
        });
      }
    }

    return this.getPostById(postId, userId);
  }

  async bookmarkPost(postId: string, userId: string): Promise<{ bookmarked: boolean }> {
    const existingBookmark = await prisma.postBookmark.findUnique({
      where: {
        postId_userId: {
          postId,
          userId
        }
      }
    });

    let bookmarked: boolean;

    if (existingBookmark) {
      // Remove bookmark
      await prisma.postBookmark.delete({
        where: {
          postId_userId: {
            postId,
            userId
          }
        }
      });
      bookmarked = false;
    } else {
      // Add bookmark
      await prisma.postBookmark.create({
        data: {
          postId,
          userId
        }
      });
      bookmarked = true;
    }

    return { bookmarked };
  }

  async getTrendingTopics(limit: number = 5) {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const posts = await prisma.post.findMany({
        where: {
          createdAt: { gte: sevenDaysAgo },
          status: 'PUBLISHED'
        },
        include: { tags: true }
      });
      
      const tagCounts = new Map();
      posts.forEach(post => {
        if (post.tags && post.tags.length > 0) {
          post.tags.forEach(tagObj => {
            const tag = tagObj.tag;
            const current = tagCounts.get(tag) || { count: 0, interactions: 0 };
            tagCounts.set(tag, {
              count: current.count + 1,
              interactions: current.interactions + (post.likeCount || 0) + (post.commentCount || 0)
            });
          });
        }
      });
      
      const trending = Array.from(tagCounts.entries())
        .map(([tag, data]) => ({
          tags: [tag],
          likeCount: Math.floor(data.interactions * 0.7),
          commentCount: Math.floor(data.interactions * 0.3),
          postCount: data.count
        }))
        .sort((a, b) => (b.likeCount + b.commentCount) - (a.likeCount + a.commentCount))
        .slice(0, limit);
      
      return trending;
    } catch (error) {
      console.error('Error fetching trending topics:', error);
      return [];
    }
  }

  async deletePost(postId: string, userId: string): Promise<{ deleted: boolean }> {
    const post = await prisma.post.findUnique({
      where: { id: postId }
    });

    if (!post) {
      throw new Error('Post not found');
    }

    if (post.authorId !== userId) {
      throw new Error('Unauthorized to delete this post');
    }

    await prisma.post.delete({
      where: { id: postId }
    });

    return { deleted: true };
  }

  async saveDraft(data: CreatePostRequest, user: JWTPayload): Promise<PostResponse> {
    const draftData = { ...data };
    draftData.status = 'DRAFT' as any;
    draftData.visibility = 'PRIVATE' as any;
    return this.createPost(draftData, user);
  }

  async getDrafts(userId: string, cursor?: string, limit: number = 20): Promise<{ items: PostResponse[], nextCursor?: string, hasMore: boolean }> {
    const posts = await prisma.post.findMany({
      where: {
        authorId: userId,
        status: 'DRAFT',
        visibility: 'PRIVATE'
      },
      include: {
        media: { include: { media: true }, orderBy: { order: 'asc' } },
        tags: true,
        links: { orderBy: { order: 'asc' } },
        likes: userId ? { where: { userId } } : false,
        bookmarks: userId ? { where: { userId } } : false
      },
      orderBy: { updatedAt: 'desc' },
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined
    });

    const hasMore = posts.length > limit;
    const items = hasMore ? posts.slice(0, -1) : posts;
    const nextCursor = hasMore ? items[items.length - 1].id : undefined;

    return {
      items: items.map(post => this.transformPost(post, userId)),
      nextCursor,
      hasMore
    };
  }

  async updateDraft(postId: string, data: Partial<CreatePostRequest>, userId: string): Promise<PostResponse> {
    const post = await prisma.post.findUnique({
      where: { id: postId }
    });

    if (!post) {
      throw new Error('Post not found');
    }

    if (post.authorId !== userId) {
      throw new Error('Unauthorized to update this post');
    }

    if (post.status !== 'DRAFT') {
      throw new Error('Post is not a draft');
    }

    const updatedPost = await prisma.post.update({
      where: { id: postId },
      data: {
        content: data.content,
        visibility: data.visibility,
        badgeData: data.badgeData,
        collaborationData: data.collaborationData,
        projectData: data.projectData,
        eventData: data.eventData,
        jobData: data.jobData
      },
      include: {
        media: { include: { media: true }, orderBy: { order: 'asc' } },
        tags: true,
        links: { orderBy: { order: 'asc' } },
        likes: userId ? { where: { userId } } : false,
        bookmarks: userId ? { where: { userId } } : false
      }
    });

    return this.transformPost(updatedPost, userId);
  }

  async publishDraft(postId: string, userId: string): Promise<PostResponse> {
    const post = await prisma.post.findUnique({
      where: { id: postId }
    });

    if (!post) {
      throw new Error('Post not found');
    }

    if (post.authorId !== userId) {
      throw new Error('Unauthorized to publish this post');
    }

    if (post.status !== 'DRAFT') {
      throw new Error('Post is not a draft');
    }

    await prisma.post.update({
      where: { id: postId },
      data: { status: 'PUBLISHED' as any }
    });

    return this.getPostById(postId, userId);
  }

  // Comment System Methods
  async createComment(postId: string, content: string, userId: string, parentCommentId?: string) {
    // Verify post exists
    const post = await prisma.post.findUnique({
      where: { id: postId }
    });

    if (!post) {
      throw new Error('Post not found');
    }

    // Get user profile for comment author info
    const userProfile = await this.getUserProfile(userId);

    const comment = await prisma.postComment.create({
      data: {
        postId,
        content,
        userId,
        userDisplayName: userProfile?.role || 'Unknown User',
        userAvatarUrl: userProfile?.avatarUrl || null
      }
    });

    // Update comment count on post
    await prisma.post.update({
      where: { id: postId },
      data: { commentCount: { increment: 1 } }
    });

    return this.transformComment(comment, userId);
  }

  async getComments(postId: string, userId?: string, cursor?: string, limit: number = 20) {
    const comments = await prisma.postComment.findMany({
      where: {
        postId
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined
    });

    const hasMore = comments.length > limit;
    const items = hasMore ? comments.slice(0, -1) : comments;
    const nextCursor = hasMore ? items[items.length - 1].id : undefined;

    return {
      items: items.map(comment => this.transformComment(comment, userId)),
      nextCursor,
      hasMore
    };
  }

  async updateComment(commentId: string, content: string, userId: string) {
    const comment = await prisma.postComment.findUnique({
      where: { id: commentId }
    });

    if (!comment) {
      throw new Error('Comment not found');
    }

    if (comment.userId !== userId) {
      throw new Error('Unauthorized to update this comment');
    }

    const updatedComment = await prisma.postComment.update({
      where: { id: commentId },
      data: { content }
    });

    return this.transformComment(updatedComment, userId);
  }

  async deleteComment(commentId: string, userId: string) {
    const comment = await prisma.postComment.findUnique({
      where: { id: commentId }
    });

    if (!comment) {
      throw new Error('Comment not found');
    }

    if (comment.userId !== userId) {
      throw new Error('Unauthorized to delete this comment');
    }

    // Count total comments to delete (just this comment since no nested replies in schema)
    const totalCommentsToDelete = 1;

    // Delete the comment (cascade will handle replies)
    await prisma.postComment.delete({
      where: { id: commentId }
    });

    // Update comment count on post
    await prisma.post.update({
      where: { id: comment.postId },
      data: { commentCount: { decrement: totalCommentsToDelete } }
    });

    return { deleted: true };
  }

  async likeComment(commentId: string, userId: string) {
    // Comment likes not implemented in schema - return early
    return { success: false, message: 'Comment likes not implemented' };
  }

  async sharePost(postId: string, userId: string, shareType: string = 'SHARE') {
    try {
      // Check if post exists
      const post = await prisma.post.findUnique({
        where: { id: postId }
      });

      if (!post) {
        throw new Error('Post not found');
      }

      // For now, just increment share count since we don't have a shares table
      const updatedPost = await prisma.post.update({
        where: { id: postId },
        data: {
          shareCount: {
            increment: 1
          }
        }
      });

      console.log(`PostService: Post ${postId} shared by user ${userId}, new share count: ${updatedPost.shareCount}`);

      return { 
        shared: true, 
        shareCount: updatedPost.shareCount,
        success: true 
      };
    } catch (error) {
      console.error('Error sharing post:', error);
      throw error;
    }
  }

  async reportPost(postId: string, userId: string, reason: string, description?: string) {
    // Report functionality not implemented in schema - return early
    return { success: false, message: 'Report functionality not implemented' };
  }

  async searchPosts(query: string, filters: any = {}) {
    // Search functionality not implemented - return early
    return { posts: [], total: 0, hasMore: false };
  }

  // Transform methods (placeholder implementations)
  private transformComment(comment: any, userId?: string) {
    return {
      id: comment.id,
      content: comment.content,
      authorId: comment.userId,
      authorDisplayName: comment.userDisplayName,
      authorAvatarUrl: comment.userAvatarUrl,
      createdAt: comment.createdAt,
      updatedAt: comment.createdAt,
      likeCount: 0,
      likedByMe: false,
      replies: []
    };
  }

  private transformPost(post: any, userId?: string) {
    // Transform the nested media structure to flat array
    const transformedMedia = post.media?.map((postMedia: any) => ({
      id: postMedia.media.id,
      url: postMedia.media.url,
      mimeType: postMedia.media.mimeType,
      width: postMedia.media.width,
      height: postMedia.media.height,
      sizeBytes: postMedia.media.sizeBytes
    })) || [];

    // Transform tags to simple string array
    const transformedTags = post.tags?.map((tag: any) => tag.tag) || [];

    // Transform links
    const transformedLinks = post.links?.map((link: any) => ({
      url: link.url,
      title: link.title,
      order: link.order
    })) || [];

    // Check if user liked this post
    const likedByMe = post.likes?.some((like: any) => like.userId === userId) || false;

    // Check if user bookmarked this post
    const bookmarkedByMe = post.bookmarks?.some((bookmark: any) => bookmark.userId === userId) || false;

    return {
      id: post.id,
      type: post.type,
      content: post.content,
      visibility: post.visibility,
      status: post.status,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      
      // Author info
      authorId: post.authorId,
      authorDisplayName: post.authorDisplayName,
      authorAvatarUrl: post.authorAvatarUrl,
      authorRole: post.authorRole,
      authorDepartment: post.authorDepartment,
      authorCollegeId: post.authorCollegeId,
      
      // Engagement
      likeCount: post.likeCount,
      commentCount: post.commentCount,
      shareCount: post.shareCount,
      viewCount: post.viewCount,
      
      // User interactions
      likedByMe,
      bookmarkedByMe,
      
      // Content
      media: transformedMedia,
      tags: transformedTags,
      links: transformedLinks,
      
      // Type-specific data
      badgeData: post.badgeData,
      collaborationData: post.collaborationData,
      projectData: post.projectData,
      eventData: post.eventData,
      jobData: post.jobData
    };
  }
}
