import { Server as SocketIOServer, Socket } from 'socket.io';
import { createServer } from 'http';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

export interface AuthenticatedSocket extends Socket {
  userId: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

export class SocketService {
  private static instance: SocketService;
  private io: SocketIOServer | null = null;
  private connectedUsers = new Map<string, string>(); // socketId -> userId
  private userSockets = new Map<string, Set<string>>(); // userId -> Set of socketIds
  private typingUsers = new Map<string, Set<string>>(); // conversationId -> Set of userIds

  constructor(private prisma: PrismaClient) {
    if (SocketService.instance) {
      return SocketService.instance;
    }
    SocketService.instance = this;
  }

  static getInstance(): SocketService {
    if (!SocketService.instance) {
      throw new Error('SocketService not initialized');
    }
    return SocketService.instance;
  }

  async start(port: number): Promise<void> {
    const server = createServer();
    
    this.io = new SocketIOServer(server, {
      cors: {
        origin: process.env.SOCKET_CORS_ORIGIN || 'http://localhost:3000',
        credentials: true
      }
    });

    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        if (!token) {
          throw new Error('No token provided');
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-super-secret-jwt-key') as any;
        const userId = decoded.userId;

        // Fetch user details
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        });

        if (!user) {
          throw new Error('User not found');
        }

        (socket as any).userId = userId;
        (socket as any).user = user;
        next();
      } catch (err) {
        console.error('Socket authentication error:', err);
        next(new Error('Authentication failed'));
      }
    });

    this.io.on('connection', (socket) => {
      this.handleConnection(socket as any);
    });

    server.listen(port, () => {
      console.log(`Socket.IO server running on port ${port}`);
    });
  }

  private handleConnection(socket: AuthenticatedSocket): void {
    const userId = socket.userId;
    
    console.log(`User ${userId} connected with socket ${socket.id}`);

    // Track connection
    this.connectedUsers.set(socket.id, userId);
    
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(socket.id);

    // Notify others that user is online
    socket.broadcast.emit('userOnline', { userId });

    // Handle message sending
    socket.on('sendMessage', (data) => {
      this.handleSendMessage(socket, data);
    });

    // Handle typing indicators
    socket.on('typing', (data) => {
      this.handleTyping(socket, data);
    });

    // Handle joining conversation rooms
    socket.on('joinConversation', (conversationId: string) => {
      socket.join(`conversation:${conversationId}`);
    });

    // Handle leaving conversation rooms
    socket.on('leaveConversation', (conversationId: string) => {
      socket.leave(`conversation:${conversationId}`);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      this.handleDisconnection(socket);
    });
  }

  private handleSendMessage(socket: AuthenticatedSocket, data: any): void {
    const { receiverId, message } = data;
    
    // Send to specific user
    this.sendMessageToUser(receiverId, 'message', message);
    
    // Also send back to sender for confirmation
    socket.emit('messageDelivered', { messageId: message.id });
  }

  private handleTyping(socket: AuthenticatedSocket, data: { receiverId: string; isTyping: boolean }): void {
    const { receiverId, isTyping } = data;
    const userId = socket.userId;

    // Send typing indicator to receiver
    this.sendMessageToUser(receiverId, 'typing', { userId, isTyping });
  }

  private handleDisconnection(socket: AuthenticatedSocket): void {
    const userId = socket.userId;
    
    console.log(`User ${userId} disconnected from socket ${socket.id}`);

    // Remove from tracking
    this.connectedUsers.delete(socket.id);
    
    const userSocketSet = this.userSockets.get(userId);
    if (userSocketSet) {
      userSocketSet.delete(socket.id);
      
      // If user has no more connections, mark as offline
      if (userSocketSet.size === 0) {
        this.userSockets.delete(userId);
        socket.broadcast.emit('userOffline', { userId });
      }
    }

    // Remove from typing indicators
    this.typingUsers.forEach((typingSet, conversationId) => {
      if (typingSet.has(userId)) {
        typingSet.delete(userId);
        socket.broadcast.to(`conversation:${conversationId}`).emit('typing', { userId, isTyping: false });
      }
    });
  }

  public sendMessageToUser(userId: string, event: string, data: any): void {
    const userSocketSet = this.userSockets.get(userId);
    if (userSocketSet && this.io) {
      userSocketSet.forEach(socketId => {
        this.io!.to(socketId).emit(event, data);
      });
    }
  }

  public sendMessageToConversation(conversationId: string, event: string, data: any): void {
    if (this.io) {
      this.io.to(`conversation:${conversationId}`).emit(event, data);
    }
  }

  public getOnlineUsers(): Set<string> {
    return new Set(this.userSockets.keys());
  }

  public isUserOnline(userId: string): boolean {
    return this.userSockets.has(userId);
  }

  public getUserSocketCount(userId: string): number {
    return this.userSockets.get(userId)?.size || 0;
  }

  public broadcastToAll(event: string, data: any): void {
    if (this.io) {
      this.io.emit(event, data);
    }
  }

  public getConnectedUsersCount(): number {
    return this.userSockets.size;
  }
}
