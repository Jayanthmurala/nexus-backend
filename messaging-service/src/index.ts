import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import staticFiles from '@fastify/static';
import websocket from '@fastify/websocket';
import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

// Services
import { MessageService } from './services/MessageService';
import { ConversationService } from './services/ConversationService';
import { SocketService } from './services/SocketService';
import { UserSyncService } from './services/UserSyncService';

// Types
import type { FastifyRequest, FastifyReply } from 'fastify';

const prisma = new PrismaClient();
const messageService = new MessageService(prisma);
const conversationService = new ConversationService(prisma);
const userSyncService = new UserSyncService(prisma);

const fastify = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
  }
});

// Register plugins
fastify.register(cors, {
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
});

fastify.register(jwt, {
  secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key'
});

fastify.register(multipart, {
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760') // 10MB
  }
});

fastify.register(staticFiles, {
  root: path.join(__dirname, '../uploads'),
  prefix: '/uploads/'
});

// Authentication middleware
const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    await request.jwtVerify();
    
    // Ensure user exists in messaging database
    const userId = (request.user as any).userId;
    if (userId) {
      await userSyncService.ensureUserExists(userId);
    }
  } catch (err) {
    reply.code(401).send({ error: 'Unauthorized' });
  }
};

// Validation schemas
const sendMessageSchema = z.object({
  receiverId: z.string().cuid(),
  content: z.string().min(1).max(5000),
  type: z.enum(['TEXT', 'IMAGE', 'FILE']).default('TEXT')
});

const getMessagesSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().min(1).max(100).default(50)
});

// Routes

// Health check
fastify.get('/health', async () => {
  return { status: 'ok', service: 'messaging-service' };
});

// Get conversations for current user
fastify.get<{
  Querystring: { cursor?: string; limit?: string }
}>('/v1/messages/conversations', {
  preHandler: authenticate
}, async (request, reply) => {
  try {
    const userId = (request.user as any).userId;
    const { cursor, limit = '20' } = request.query;
    
    const conversations = await conversationService.getUserConversations(userId, {
      cursor,
      limit: parseInt(limit)
    });
    
    return conversations;
  } catch (error) {
    fastify.log.error(error);
    return reply.code(500).send({ error: 'Failed to fetch conversations' });
  }
});

// Get messages for a conversation
fastify.get<{
  Params: { userId: string };
  Querystring: { cursor?: string; limit?: string }
}>('/v1/messages/:userId', {
  preHandler: authenticate
}, async (request, reply) => {
  try {
    const currentUserId = (request.user as any).userId;
    const { userId } = request.params;
    const { cursor, limit = '50' } = request.query;
    
    const messages = await messageService.getMessages(currentUserId, userId, {
      cursor,
      limit: parseInt(limit)
    });
    
    return messages;
  } catch (error) {
    fastify.log.error(error);
    return reply.code(500).send({ error: 'Failed to fetch messages' });
  }
});

// Send a message
fastify.post<{
  Body: { receiverId: string; content: string; type?: string }
}>('/v1/messages', {
  preHandler: authenticate
}, async (request, reply) => {
  try {
    const senderId = (request.user as any).userId;
    const validation = sendMessageSchema.safeParse(request.body);
    
    if (!validation.success) {
      return reply.code(400).send({ 
        error: 'Invalid request data',
        details: validation.error.errors
      });
    }
    
    const { receiverId, content, type } = validation.data;
    
    const message = await messageService.sendMessage({
      senderId,
      receiverId,
      content,
      type: type as any
    });
    
    // Emit to Socket.IO for real-time delivery
    const socketService = SocketService.getInstance();
    socketService.sendMessageToUser(receiverId, 'message', message);
    
    return { message };
  } catch (error) {
    fastify.log.error(error);
    return reply.code(500).send({ error: 'Failed to send message' });
  }
});

// Mark messages as read
fastify.put<{
  Params: { userId: string }
}>('/v1/messages/:userId/read', {
  preHandler: authenticate
}, async (request, reply) => {
  try {
    const currentUserId = (request.user as any).userId;
    const { userId } = request.params;
    
    await messageService.markMessagesAsRead(currentUserId, userId);
    
    return { success: true };
  } catch (error) {
    fastify.log.error(error);
    return reply.code(500).send({ error: 'Failed to mark messages as read' });
  }
});

// Get online users
fastify.get('/v1/messages/online', {
  preHandler: authenticate
}, async () => {
  const socketService = SocketService.getInstance();
  const onlineUsers = socketService.getOnlineUsers();
  
  return { users: Array.from(onlineUsers) };
});

// Search users for new conversations
fastify.get<{
  Querystring: { q?: string; limit?: string }
}>('/v1/messages/users/search', {
  preHandler: authenticate
}, async (request, reply) => {
  try {
    const { q = '', limit = '10' } = request.query;
    
    if (!q.trim()) {
      return { users: [] };
    }
    
    const users = await userSyncService.searchUsers(q.trim(), parseInt(limit));
    
    return { users };
  } catch (error) {
    fastify.log.error(error);
    return reply.code(500).send({ error: 'Failed to search users' });
  }
});

// Get user profile
fastify.get<{
  Params: { userId: string }
}>('/v1/messages/users/:userId', {
  preHandler: authenticate
}, async (request, reply) => {
  try {
    const { userId } = request.params;
    
    const user = await userSyncService.getUserProfile(userId);
    
    if (!user) {
      return reply.code(404).send({ error: 'User not found' });
    }
    
    return { user };
  } catch (error) {
    fastify.log.error(error);
    return reply.code(500).send({ error: 'Failed to get user profile' });
  }
});

// File upload for messages
fastify.post('/v1/messages/upload', {
  preHandler: authenticate
}, async (request, reply) => {
  try {
    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ error: 'No file uploaded' });
    }
    
    const fileUrl = await messageService.uploadFile(data);
    
    return { fileUrl };
  } catch (error) {
    fastify.log.error(error);
    return reply.code(500).send({ error: 'Failed to upload file' });
  }
});

// Start HTTP server
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '4006');
    const host = process.env.HOST || '0.0.0.0';
    
    await fastify.listen({ port, host });
    fastify.log.info(`Messaging service running on ${host}:${port}`);
    
    // Start Socket.IO server
    const socketPort = parseInt(process.env.SOCKET_PORT || '3001');
    const socketService = new SocketService(prisma);
    await socketService.start(socketPort);
    
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGINT', async () => {
  fastify.log.info('Received SIGINT, shutting down gracefully...');
  await fastify.close();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  fastify.log.info('Received SIGTERM, shutting down gracefully...');
  await fastify.close();
  await prisma.$disconnect();
  process.exit(0);
});

start();
