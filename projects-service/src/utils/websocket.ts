import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import { verifyAccessToken } from './jwt';
import { getUserScopeFromJWT } from '../clients/auth';

export interface ProjectUpdateEvent {
  type: 'new-project' | 'project-updated' | 'project-deleted';
  project: any;
  collegeId: string;
  departments: string[];
  visibleToAllDepts: boolean;
}

export interface ApplicationUpdateEvent {
  type: 'new-application' | 'application-status-changed';
  application: any;
  projectId: string;
  collegeId: string;
}

let io: SocketIOServer | null = null;

export function initializeWebSocket(server: HttpServer): SocketIOServer {
  io = new SocketIOServer(server, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const payload = await verifyAccessToken(token);
      const userScope = getUserScopeFromJWT(payload);
      
      socket.data = {
        userId: payload.sub,
        collegeId: userScope.collegeId,
        department: userScope.department,
        roles: payload.roles || [],
      };

      next();
    } catch (error) {
      console.error('WebSocket authentication error:', error);
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    const { userId, collegeId, department, roles } = socket.data;
    console.log(`User ${userId} connected to WebSocket`);

    // Join college-specific room for project updates
    if (collegeId) {
      socket.join(`projects:${collegeId}`);
      console.log(`User ${userId} joined room: projects:${collegeId}`);
    }

    // Join department-specific room if needed
    if (collegeId && department) {
      socket.join(`projects:${collegeId}:${department}`);
      console.log(`User ${userId} joined room: projects:${collegeId}:${department}`);
    }

    // Faculty join their own project rooms for application updates
    if (roles.includes('FACULTY') && collegeId) {
      socket.join(`faculty:${userId}:applications`);
      console.log(`Faculty ${userId} joined application updates room`);
    }

    socket.on('disconnect', () => {
      console.log(`User ${userId} disconnected from WebSocket`);
    });
  });

  return io;
}

export function getWebSocketInstance(): SocketIOServer | null {
  return io;
}

// Emit project updates to relevant users
export function emitProjectUpdate(event: ProjectUpdateEvent): void {
  if (!io) return;

  const { collegeId, departments, visibleToAllDepts } = event;

  // Emit to college room (all users in college will receive)
  io!.to(`projects:${collegeId}`).emit('project-update', event);

  // If not visible to all departments, emit to specific department rooms
  if (!visibleToAllDepts && departments.length > 0) {
    departments.forEach(dept => {
      io!.to(`projects:${collegeId}:${dept}`).emit('project-update', event);
    });
  }

  console.log(`Emitted project update to college ${collegeId}, departments: ${departments.join(', ')}`);
}

// Emit application updates to faculty
export function emitApplicationUpdate(event: ApplicationUpdateEvent, facultyUserId: string): void {
  if (!io) return;

  io!.to(`faculty:${facultyUserId}:applications`).emit('application-update', event);
  console.log(`Emitted application update to faculty ${facultyUserId}`);
}

// Emit real-time notifications
export function emitNotification(userId: string, notification: any): void {
  if (!io) return;

  // The null check above ensures io is not null at this point
  io!.to(`user:${userId}`).emit('notification', notification);
  console.log(`Emitted notification to user ${userId}`);
}
