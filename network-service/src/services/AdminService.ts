import { prisma } from '@/lib/prisma';
import { PostResponse, PostType, PostVisibility } from '@/types';
import { PostService } from './PostService';
import { UserRole } from '@/middleware/auth';

export interface AdminStats {
  totalPosts: number;
  postsToday: number;
  totalUsers: number;
  activeUsers: number;
  postsByType: Record<PostType, number>;
  recentActivity: {
    posts: number;
    comments: number;
    likes: number;
  };
}

export interface ModerationAction {
  postId: string;
  action: 'hide' | 'delete' | 'approve' | 'flag';
  reason?: string;
}

export class AdminService {
  private postService = new PostService();

  async getAdminStats(userRole: string, collegeId?: string): Promise<AdminStats> {
    const isHeadAdmin = userRole === UserRole.HEAD_ADMIN;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Base filter - Head Admin sees all, others see college-scoped
    const baseWhere = isHeadAdmin ? {} : { authorCollegeId: collegeId };

    const [
      totalPosts,
      postsToday,
      postsByType,
      recentActivity
    ] = await Promise.all([
      // Total posts
      prisma.post.count({ where: baseWhere }),

      // Posts today
      prisma.post.count({
        where: {
          ...baseWhere,
          createdAt: { gte: today }
        }
      }),

      // Posts by type
      prisma.post.groupBy({
        by: ['type'],
        where: baseWhere,
        _count: { type: true }
      }),

      // Recent activity (last 7 days)
      this.getRecentActivity(baseWhere)
    ]);

    // Transform posts by type
    const postTypeStats: Record<PostType, number> = {} as any;
    Object.values(PostType).forEach(type => {
      postTypeStats[type] = 0;
    });
    
    postsByType.forEach(item => {
      postTypeStats[item.type] = item._count.type;
    });

    return {
      totalPosts,
      postsToday,
      totalUsers: 0, // Would need user service integration
      activeUsers: 0, // Would need user service integration
      postsByType: postTypeStats,
      recentActivity
    };
  }

  async getFlaggedContent(userRole: string, collegeId?: string, cursor?: string, limit: number = 20) {
    const isHeadAdmin = userRole === UserRole.HEAD_ADMIN;
    const baseWhere = isHeadAdmin ? {} : { authorCollegeId: collegeId };

    // For now, we'll return posts with high engagement that might need review
    // In a full implementation, you'd have a flagging system
    let whereClause = {
      ...baseWhere,
      OR: [
        { likeCount: { gte: 100 } },
        { commentCount: { gte: 50 } },
        { viewCount: { gte: 1000 } }
      ]
    };

    if (cursor) {
      (whereClause as any).id = { lt: cursor };
    }

    const posts = await prisma.post.findMany({
      where: whereClause,
      include: {
        media: {
          include: { media: true },
          orderBy: { order: 'asc' }
        },
        tags: true,
        links: { orderBy: { order: 'asc' } }
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    return {
      items: posts.map(post => this.postService['transformPost'](post)),
      nextCursor: posts.length === limit ? posts[posts.length - 1].id : null,
      hasMore: posts.length === limit
    };
  }

  async moderatePost(postId: string, action: ModerationAction, moderatorId: string) {
    const post = await prisma.post.findUniqueOrThrow({
      where: { id: postId }
    });

    switch (action.action) {
      case 'delete':
        await prisma.post.delete({
          where: { id: postId }
        });
        break;

      case 'hide':
        await prisma.post.update({
          where: { id: postId },
          data: { visibility: PostVisibility.PRIVATE }
        });
        break;

      case 'approve':
        await prisma.post.update({
          where: { id: postId },
          data: { visibility: PostVisibility.PUBLIC }
        });
        break;

      case 'flag':
        // In a full implementation, you'd create a moderation record
        break;
    }

    // Log moderation action (you'd want a proper audit log table)
    console.log(`Moderation action: ${action.action} on post ${postId} by ${moderatorId}. Reason: ${action.reason}`);

    return { success: true, action: action.action };
  }

  async getUserPosts(userId: string, cursor?: string, limit: number = 20) {
    let whereClause: any = { authorId: userId };

    if (cursor) {
      whereClause.id = { lt: cursor };
    }

    const posts = await prisma.post.findMany({
      where: whereClause,
      include: {
        media: {
          include: { media: true },
          orderBy: { order: 'asc' }
        },
        tags: true,
        links: { orderBy: { order: 'asc' } }
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    return {
      items: posts.map(post => this.postService['transformPost'](post)),
      nextCursor: posts.length === limit ? posts[posts.length - 1].id : null,
      hasMore: posts.length === limit
    };
  }

  async bulkDeletePosts(postIds: string[], moderatorId: string) {
    const result = await prisma.post.deleteMany({
      where: {
        id: { in: postIds }
      }
    });

    console.log(`Bulk delete: ${result.count} posts deleted by ${moderatorId}`);

    return { deleted: result.count };
  }

  private async getRecentActivity(baseWhere: any) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [posts, comments, likes] = await Promise.all([
      prisma.post.count({
        where: {
          ...baseWhere,
          createdAt: { gte: sevenDaysAgo }
        }
      }),

      prisma.postComment.count({
        where: {
          createdAt: { gte: sevenDaysAgo },
          post: baseWhere
        }
      }),

      prisma.postLike.count({
        where: {
          likedAt: { gte: sevenDaysAgo },
          post: baseWhere
        }
      })
    ]);

    return { posts, comments, likes };
  }
}
