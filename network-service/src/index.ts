import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { config } from 'dotenv';
import { authenticateUser, optionalAuth, requireRole, requireAdminRole, requireFacultyOrAdmin, UserRole } from '@/middleware/auth';
import { PostService } from './services/PostService';
import { AdminService } from './services/AdminService';
import { MediaService } from './services/MediaService';
import { FollowService } from './services/FollowService';
import { CreatePostRequest, FeedParams, PostType } from '@/types';

// Load environment variables
config();

const PORT = parseInt(process.env.PORT || '4005');

// Service instances
const postService = new PostService();
const adminService = new AdminService();
const mediaService = new MediaService();
const followService = new FollowService();

async function buildServer() {
  const app = Fastify({ 
    logger: {
      level: 'info'
    },
    bodyLimit: 10485760, // 10MB
    disableRequestLogging: false
  });

  // Register plugins
  await app.register(cors, {
    origin: true,
    credentials: true
  });

  // Add content type parser for multipart/form-data
  app.addContentTypeParser('multipart/form-data', {}, (req, payload, done) => {
    const chunks: Buffer[] = [];
    payload.on('data', (chunk) => chunks.push(chunk));
    payload.on('end', () => {
      done(null, Buffer.concat(chunks));
    });
    payload.on('error', done);
  });

  // Register static file serving for uploads
  await app.register(fastifyStatic, {
    root: path.join(process.cwd(), 'uploads'),
    prefix: '/uploads/'
  });

  // Health check
  app.get('/health', async () => {
    return { 
      status: 'ok', 
      service: 'network', 
      timestamp: new Date().toISOString(),
      version: '2.0.0'
    };
  });

  // Feed endpoints
  app.get('/v1/network/feed', { preHandler: optionalAuth }, async (request) => {
    const query = request.query as any;
    const user = request.user;
    
    const scope = (query.scope || 'global') as 'global' | 'college' | 'following';
    
    return postService.getFeed({
      scope,
      userId: user?.sub,
      cursor: query.cursor,
      limit: Math.min(parseInt(query.limit) || 20, 100),
      postTypes: query.postTypes ? (Array.isArray(query.postTypes) ? query.postTypes : [query.postTypes]) : undefined,
      search: query.search
    });
  });

  // Create post
  app.post('/v1/posts/specialized', { preHandler: authenticateUser }, async (request) => {
    const body = request.body as CreatePostRequest;
    const user = request.user!;
    
    console.log('=== POST CREATION REQUEST ===');
    console.log('User ID:', user.sub);
    console.log('User JWT data:', JSON.stringify({
      sub: user.sub,
      collegeId: user.collegeId,
      department: user.department,
      avatarUrl: user.avatarUrl,
      displayName: user.displayName,
      role: user.role
    }, null, 2));
    console.log('Request body:', JSON.stringify(body, null, 2));
    console.log('Author fields in request:');
    console.log('  - authorCollegeId:', body.authorCollegeId);
    console.log('  - authorDepartment:', body.authorDepartment);
    console.log('  - authorAvatarUrl:', body.authorAvatarUrl);
    console.log('MediaIds in request:', body.mediaIds);
    console.log('MediaIds type:', typeof body.mediaIds);
    console.log('MediaIds is array:', Array.isArray(body.mediaIds));
    
    try {
      const result = await postService.createPost(body, user);
      console.log('=== POST CREATION SUCCESS ===');
      console.log('Post created with ID:', result.id);
      console.log('Media in response:', result.media);
      console.log('Media count:', result.media?.length || 0);
      
      return result;
    } catch (error) {
      console.error('=== POST CREATION ERROR ===');
      console.error('Error:', error);
      throw error;
    }
  });

  // Get single post
  app.get('/v1/posts/:postId', { preHandler: optionalAuth }, async (request) => {
    const { postId } = request.params as { postId: string };
    const user = request.user;
    
    return postService.getPostById(postId, user?.sub);
  });

  // Delete post
  app.delete('/v1/posts/:postId', { preHandler: authenticateUser }, async (request) => {
    const { postId } = request.params as { postId: string };
    const user = request.user!;
    
    return postService.deletePost(postId, user.sub);
  });

  // Like/unlike post
  app.post('/v1/posts/:postId/like', { preHandler: authenticateUser }, async (request) => {
    const { postId } = request.params as { postId: string };
    const user = request.user!;
    
    const result = await postService.likePost(postId, user.sub);
    return { ok: true, ...result };
  });

  app.delete('/v1/posts/:postId/like', { preHandler: authenticateUser }, async (request) => {
    const { postId } = request.params as { postId: string };
    const user = request.user!;
    
    const result = await postService.likePost(postId, user.sub);
    return { ok: true, unliked: !result.liked, likeCount: result.likeCount };
  });

  // =================== MEDIA UPLOAD ===================
  
  // Upload media file and save to database
  app.post('/v1/media/upload', { preHandler: authenticateUser }, async (request, reply) => {
    try {
      const user = request.user!;
      
      // Upload file and create Media record
      const media = await mediaService.uploadAndCreateMedia(request, user.sub);
      
      reply.code(201).send({
        id: media.id,
        url: media.url,
        mimeType: media.mimeType,
        sizeBytes: media.sizeBytes,
        width: media.width,
        height: media.height
      });
    } catch (error: any) {
      console.error('Media upload error:', error);
      reply.code(400).send({ error: error.message });
    }
  });

  // =================== DRAFTS CRUD ===================
  
  // Save draft
  app.post('/v1/posts/draft', { preHandler: authenticateUser }, async (request) => {
    const body = request.body as CreatePostRequest;
    const user = request.user!;
    
    return postService.saveDraft(body, user);
  });

  // Get user's drafts
  app.get('/v1/posts/drafts', { preHandler: authenticateUser }, async (request) => {
    const user = request.user!;
    const { cursor, limit } = request.query as { cursor?: string, limit?: string };
    
    return postService.getDrafts(user.sub, cursor, limit ? parseInt(limit) : 20);
  });

  // Update draft
  app.put('/v1/posts/:postId/draft', { preHandler: authenticateUser }, async (request) => {
    const { postId } = request.params as { postId: string };
    const body = request.body as Partial<CreatePostRequest>;
    const user = request.user!;
    
    return postService.updateDraft(postId, body, user.sub);
  });

  // Publish draft
  app.post('/v1/posts/:postId/publish', { preHandler: authenticateUser }, async (request) => {
    const { postId } = request.params as { postId: string };
    const user = request.user!;
    
    return postService.publishDraft(postId, user.sub);
  });

  // =================== COMMENTS CRUD ===================
  // Comment endpoints are implemented below in the COMMENT ENDPOINTS section

  // =================== BOOKMARKS CRUD ===================
  
  // Toggle bookmark
  app.post('/v1/posts/:postId/bookmark', { preHandler: authenticateUser }, async (request) => {
    const { postId } = request.params as { postId: string };
    const user = request.user!;
    
    return postService.bookmarkPost(postId, user.sub);
  });

  app.get('/v1/bookmarks', { preHandler: authenticateUser }, async (request, reply) => {
    reply.code(501).send({ error: 'Bookmarks not implemented yet' });
  });

  app.delete('/v1/posts/:postId/bookmark', { preHandler: authenticateUser }, async (request, reply) => {
    reply.code(501).send({ error: 'Bookmarks not implemented yet' });
  });

  // =================== POST MANAGEMENT ===================
  
  // Update post (author or admin only)
  app.put('/v1/posts/:postId', { preHandler: authenticateUser }, async (request) => {
    const { postId } = request.params as { postId: string };
    const updateData = request.body as Partial<CreatePostRequest>;
    const user = request.user!;
    
    console.log('=== POST UPDATE REQUEST ===');
    console.log('Post ID:', postId);
    console.log('User ID:', user.sub);
    console.log('Update data:', JSON.stringify(updateData, null, 2));
    
    try {
      const result = await postService.updatePost(postId, updateData, user.sub);
      console.log('=== POST UPDATE SUCCESS ===');
      console.log('Updated post ID:', result.id);
      
      return result;
    } catch (error) {
      console.error('=== POST UPDATE ERROR ===');
      console.error('Error:', error);
      throw error;
    }
  });

  // Get user's own posts
  app.get('/v1/user/posts', { preHandler: authenticateUser }, async (request) => {
    const user = request.user!;
    const query = request.query as any;
    
    return adminService.getUserPosts(
      user.sub,
      query.cursor,
      Math.min(parseInt(query.limit) || 20, 100)
    );
  });

  // =================== ADMIN ENDPOINTS ===================
  
  // Get admin dashboard stats
  app.get('/v1/admin/stats', { preHandler: [authenticateUser, requireAdminRole()] }, async (request) => {
    const user = request.user!;
    
    return adminService.getAdminStats(user.role || 'STUDENT', user.collegeId);
  });

  // Get flagged content for review
  app.get('/v1/admin/flagged', { preHandler: [authenticateUser, requireAdminRole()] }, async (request) => {
    const user = request.user!;
    const query = request.query as any;
    
    return adminService.getFlaggedContent(
      user.role || 'STUDENT',
      user.collegeId,
      query.cursor,
      Math.min(parseInt(query.limit) || 20, 100)
    );
  });

  // Moderate post (admin only)
  app.post('/v1/admin/moderate/:postId', { preHandler: [authenticateUser, requireAdminRole()] }, async (request) => {
    const { postId } = request.params as { postId: string };
    const { action, reason } = request.body as { action: 'hide' | 'delete' | 'approve' | 'flag'; reason?: string };
    const user = request.user!;
    
    return adminService.moderatePost(postId, { postId, action, reason }, user.sub);
  });

  // Get user posts (admin view)
  app.get('/v1/admin/users/:userId/posts', { preHandler: [authenticateUser, requireAdminRole()] }, async (request) => {
    const { userId } = request.params as { userId: string };
    const query = request.query as any;
    
    return adminService.getUserPosts(
      userId,
      query.cursor,
      Math.min(parseInt(query.limit) || 20, 100)
    );
  });

  // Bulk delete posts (admin only)
  app.delete('/v1/admin/posts/bulk', { preHandler: [authenticateUser, requireAdminRole()] }, async (request) => {
    const { postIds } = request.body as { postIds: string[] };
    const user = request.user!;
    
    return adminService.bulkDeletePosts(postIds, user.sub);
  });

  // =================== USER CRUD ENDPOINTS ===================
  
  // Create user (admin only)
  app.post('/v1/users', { preHandler: [authenticateUser, requireAdminRole()] }, async (request) => {
    const userData = request.body as {
      email: string;
      displayName: string;
      password: string;
      roles: string[];
      collegeId?: string;
      department?: string;
      year?: number;
      collegeMemberId?: string;
    };
    
    return followService.createUser(userData);
  });

  // Update user (admin or self)
  app.put('/v1/users/:userId', { preHandler: authenticateUser }, async (request) => {
    const { userId } = request.params as { userId: string };
    const updateData = request.body as Partial<{
      displayName: string;
      email: string;
      avatarUrl: string;
      department: string;
      year: number;
      collegeMemberId: string;
    }>;
    const user = request.user!;
    
    return followService.updateUser(userId, updateData, user.sub, user.role);
  });

  // Delete user (admin only)
  app.delete('/v1/users/:userId', { preHandler: [authenticateUser, requireAdminRole()] }, async (request) => {
    const { userId } = request.params as { userId: string };
    const user = request.user!;
    
    return followService.deleteUser(userId, user.sub);
  });

  // Get single user details
  app.get('/v1/users/:userId', { preHandler: optionalAuth }, async (request) => {
    const { userId } = request.params as { userId: string };
    const user = request.user;
    
    return followService.getUserById(userId, user?.sub);
  });

  // =================== FOLLOW/NETWORK ENDPOINTS ===================
  
  // Follow user
  app.post('/v1/users/:userId/follow', { preHandler: authenticateUser }, async (request) => {
    const { userId } = request.params as { userId: string };
    const user = request.user!;
    
    return followService.followUser(user.sub, userId);
  });

  // Unfollow user
  app.delete('/v1/users/:userId/follow', { preHandler: authenticateUser }, async (request) => {
    const { userId } = request.params as { userId: string };
    const user = request.user!;
    
    return followService.unfollowUser(user.sub, userId);
  });

  // Get user's followers
  app.get('/v1/users/:userId/followers', { preHandler: optionalAuth }, async (request) => {
    const { userId } = request.params as { userId: string };
    const query = request.query as any;
    
    return followService.getFollowers(
      userId,
      query.cursor,
      Math.min(parseInt(query.limit) || 20, 100)
    );
  });

  // Get user's following
  app.get('/v1/users/:userId/following', { preHandler: optionalAuth }, async (request) => {
    const { userId } = request.params as { userId: string };
    const query = request.query as any;
    
    return followService.getFollowing(
      userId,
      query.cursor,
      Math.min(parseInt(query.limit) || 20, 100)
    );
  });

  // Get follow stats for user
  app.get('/v1/users/:userId/stats', { preHandler: optionalAuth }, async (request) => {
    const { userId } = request.params as { userId: string };
    const user = request.user;
    
    return followService.getFollowStats(userId, user?.sub);
  });

  // Get users directory
  app.get('/v1/users/directory', { preHandler: optionalAuth }, async (request) => {
    const query = request.query as any;
    const user = request.user;
    
    console.log(`[Directory API] Query params:`, query);
    console.log(`[Directory API] Offset: ${query.offset}, Limit: ${query.limit}, Search: ${query.search}`);
    
    const result = await followService.getUsersDirectory({
      offset: parseInt(query.offset) || 0,
      limit: parseInt(query.limit) || 50,
      search: query.search || query.q, // Support both search and q parameters
      collegeId: query.collegeId
    });
    
    // Set follow status for each user if current user is logged in
    if (user?.sub && result.users.length > 0) {
      const followingIds = await followService.getFollowingIds(user.sub);
      result.users = result.users.map(u => ({
        ...u,
        isFollowing: followingIds.includes(u.id)
      }));
    }
    
    console.log(`[Directory API] Returning ${result.users.length} users, hasMore: ${result.hasMore}`);
    return result;
  });

  // Search users endpoint (alias for directory with search)
  app.get('/v1/users/search', { preHandler: optionalAuth }, async (request) => {
    const query = request.query as any;
    const user = request.user;
    
    const result = await followService.getUsersDirectory({
      offset: 0,
      limit: parseInt(query.limit) || 20,
      search: query.q,
      collegeId: query.collegeId
    });
    return result;
  });

  // Get colleges list
  app.get('/v1/colleges', { preHandler: optionalAuth }, async (request) => {
    try {
      const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:4001';
      const response = await fetch(`${authServiceUrl}/v1/colleges`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch colleges');
      }
      
      const colleges = await response.json();
      return colleges;
    } catch (error) {
      console.error('Error fetching colleges:', error);
      return { colleges: [] };
    }
  });

  // Get follow suggestions
  app.get('/v1/users/suggestions', { preHandler: authenticateUser }, async (request) => {
    const user = request.user!;
    const query = request.query as any;
    
    const suggestions = await followService.getFollowSuggestions(user.sub, query.limit || 10);
    return { suggestions };
  });

  // Get user's posts
  app.get('/v1/users/:userId/posts', { preHandler: optionalAuth }, async (request) => {
    const { userId } = request.params as { userId: string };
    const query = request.query as any;
    const user = request.user;
    
    return postService.getFeed({
      scope: 'global',
      userId: user?.sub,
      cursor: query.cursor,
      limit: Math.min(parseInt(query.limit) || 20, 100),
      authorId: userId // Filter by specific author
    });
  });

  // =================== FACULTY ENDPOINTS ===================
  
  // Create announcement (faculty and admin only)
  app.post('/v1/posts/announcement', { preHandler: [authenticateUser, requireFacultyOrAdmin()] }, async (request) => {
    const body = request.body as CreatePostRequest;
    const user = request.user!;
    
    // Force announcement type
    body.type = PostType.ANNOUNCEMENT;
    
    return postService.createPost(body, user);
  });

  // Create job posting (placements admin and head admin only)
  app.post('/v1/posts/job', { preHandler: [authenticateUser, requireRole([UserRole.PLACEMENTS_ADMIN, UserRole.HEAD_ADMIN])] }, async (request) => {
    const body = request.body as CreatePostRequest;
    const user = request.user!;
    
    // Force job posting type
    body.type = PostType.JOB_POSTING;
    
    return postService.createPost(body, user);
  });

  // =================== TRENDING ENDPOINTS ===================
  
  // Get trending topics
  app.get('/v1/network/trending', { preHandler: optionalAuth }, async (request) => {
    const query = request.query as any;
    const limit = Math.min(parseInt(query.limit) || 5, 20);
    
    try {
      const trending = await postService.getTrendingTopics(limit);
      return { items: trending };
    } catch (error) {
      console.error('Error fetching trending topics:', error);
      return { items: [] };
    }
  });

  // =================== COMMENT ENDPOINTS ===================
  
  // Get comments for a post
  app.get('/v1/posts/:postId/comments', { preHandler: optionalAuth }, async (request) => {
    const { postId } = request.params as { postId: string };
    const query = request.query as any;
    const user = request.user;
    
    const cursor = query.cursor;
    const limit = Math.min(parseInt(query.limit) || 20, 50);
    
    const result = await postService.getComments(postId, user?.sub, cursor, limit);
    return { ok: true, ...result };
  });

  // Create a comment
  app.post('/v1/posts/:postId/comments', { preHandler: authenticateUser }, async (request) => {
    const { postId } = request.params as { postId: string };
    const { content, parentCommentId } = request.body as { content: string; parentCommentId?: string };
    const user = request.user!;
    
    const comment = await postService.createComment(postId, content, user.sub, parentCommentId);
    return { ok: true, comment };
  });

  // Update a comment
  app.put('/v1/comments/:commentId', { preHandler: authenticateUser }, async (request) => {
    const { commentId } = request.params as { commentId: string };
    const { content } = request.body as { content: string };
    const user = request.user!;
    
    const comment = await postService.updateComment(commentId, content, user.sub);
    return { ok: true, comment };
  });

  // Delete a comment
  app.delete('/v1/comments/:commentId', { preHandler: authenticateUser }, async (request) => {
    const { commentId } = request.params as { commentId: string };
    const user = request.user!;
    
    const result = await postService.deleteComment(commentId, user.sub);
    return { ok: true, ...result };
  });

  // Like/unlike a comment
  app.post('/v1/comments/:commentId/like', { preHandler: authenticateUser }, async (request) => {
    const { commentId } = request.params as { commentId: string };
    const user = request.user!;
    
    const result = await postService.likeComment(commentId, user.sub);
    return { ok: true, ...result };
  });

  // =================== SHARE ENDPOINTS ===================
  
  // Share a post
  app.post('/v1/posts/:postId/share', { preHandler: authenticateUser }, async (request) => {
    const { postId } = request.params as { postId: string };
    const { shareType } = request.body as { shareType?: 'SHARE' | 'REPOST' };
    const user = request.user!;
    
    const result = await postService.sharePost(postId, user.sub, shareType);
    return { ok: true, ...result };
  });

  // =================== REPORT ENDPOINTS ===================
  
  // Report a post
  app.post('/v1/posts/:postId/report', { preHandler: authenticateUser }, async (request) => {
    const { postId } = request.params as { postId: string };
    const { reason, description } = request.body as { reason: string; description?: string };
    const user = request.user!;
    
    const result = await postService.reportPost(postId, user.sub, reason, description);
    return { ok: true, ...result };
  });

  // =================== SEARCH ENDPOINTS ===================
  
  // Enhanced search posts
  app.get('/v1/search/posts', { preHandler: optionalAuth }, async (request) => {
    const query = request.query as any;
    const user = request.user;
    
    // This would need to be implemented with full-text search
    return { 
      message: 'Search endpoint - to be implemented with full-text search',
      query: query.q,
      filters: {
        type: query.type,
        tags: query.tags,
        dateRange: query.dateRange
      }
    };
  });

  // =================== ANALYTICS ENDPOINTS ===================
  
  // Get post analytics (author or admin only)
  app.get('/v1/posts/:postId/analytics', { preHandler: authenticateUser }, async (request) => {
    const { postId } = request.params as { postId: string };
    const user = request.user!;
    
    // This would need to be implemented with proper analytics
    return { 
      message: 'Analytics endpoint - to be implemented',
      postId,
      views: 0,
      engagement: 0,
      demographics: {}
    };
  });

  // Error handling
  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    
    if (error.validation) {
      reply.status(400).send({
        error: 'Validation Error',
        message: error.message
      });
      return;
    }

    if (error.message.includes('Unauthorized')) {
      reply.status(401).send({
        error: 'Unauthorized',
        message: error.message
      });
      return;
    }

    if (error.message.includes('not found') || error.message.includes('NotFound')) {
      reply.status(404).send({
        error: 'Not Found',
        message: error.message
      });
      return;
    }

    reply.status(500).send({
      error: 'Internal Server Error',
      message: 'Something went wrong'
    });
  });

  return app;
}

async function startServer() {
  try {
    const app = await buildServer();
    
    const address = await app.listen({ 
      port: PORT, 
      host: '0.0.0.0' 
    });
    
    console.log(`🚀 Network Service v2.0.0 running at ${address}`);
    console.log(`🔍 Health Check: http://localhost:${PORT}/health`);
    console.log(`📡 Feed API: http://localhost:${PORT}/v1/network/feed`);
    console.log(`📤 Upload API: http://localhost:${PORT}/v1/media/upload`);
    console.log('✨ Database connected and ready!');
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
