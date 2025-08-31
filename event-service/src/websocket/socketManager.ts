import { Server as SocketIOServer } from "socket.io";
import { Server } from "http";
import { verifyAccessToken } from "../utils/jwt";

export class SocketManager {
  private io: SocketIOServer;
  private userSockets = new Map<string, string[]>(); // userId -> socketIds[]

  constructor(server: Server) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true,
      },
    });

    this.setupAuthentication();
    this.setupEventHandlers();
  }

  private setupAuthentication() {
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        const payload = await verifyAccessToken(token);
        socket.data.userId = payload.sub;
        socket.data.roles = payload.roles || [];
        socket.data.displayName = payload.displayName || "";
        
        next();
      } catch (error) {
        next(new Error('Authentication failed'));
      }
    });
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket) => {
      const userId = socket.data.userId;
      
      // Track user socket connections
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, []);
      }
      this.userSockets.get(userId)!.push(socket.id);

      console.log(`User ${userId} connected with socket ${socket.id}`);

      // Join user-specific room
      socket.join(`user:${userId}`);

      // Join role-specific rooms
      const roles = socket.data.roles || [];
      roles.forEach((role: string) => {
        socket.join(`role:${role.toLowerCase()}`);
      });

      socket.on('disconnect', () => {
        // Remove socket from user tracking
        const userSocketIds = this.userSockets.get(userId);
        if (userSocketIds) {
          const index = userSocketIds.indexOf(socket.id);
          if (index > -1) {
            userSocketIds.splice(index, 1);
          }
          if (userSocketIds.length === 0) {
            this.userSockets.delete(userId);
          }
        }
        
        console.log(`User ${userId} disconnected socket ${socket.id}`);
      });
    });
  }

  // Event creation notifications
  notifyEventSubmitted(studentId: string, eventData: any) {
    this.io.to(`user:${studentId}`).emit('event:submitted', {
      type: 'event_submitted',
      message: 'Your event has been submitted for approval',
      event: eventData,
      timestamp: new Date(),
    });
  }

  notifyEventApprovalPending(adminId: string, eventData: any) {
    this.io.to(`user:${adminId}`).emit('event:approval_pending', {
      type: 'event_approval_pending',
      message: 'New event pending your approval',
      event: eventData,
      timestamp: new Date(),
    });
  }

  // Approval workflow notifications
  notifyEventApproved(studentId: string, eventData: any, mentorInfo?: any) {
    this.io.to(`user:${studentId}`).emit('event:approved', {
      type: 'event_approved',
      message: 'Your event has been approved!',
      event: eventData,
      mentor: mentorInfo,
      timestamp: new Date(),
    });

    // Notify mentor if assigned
    if (mentorInfo?.id) {
      this.io.to(`user:${mentorInfo.id}`).emit('event:mentor_assigned', {
        type: 'mentor_assigned',
        message: `You've been assigned as mentor for "${eventData.title}"`,
        event: eventData,
        timestamp: new Date(),
      });
    }
  }

  notifyEventRejected(studentId: string, eventData: any, reason?: string) {
    this.io.to(`user:${studentId}`).emit('event:rejected', {
      type: 'event_rejected',
      message: 'Your event has been rejected',
      event: eventData,
      reason,
      timestamp: new Date(),
    });
  }

  // Escalation notifications
  notifyEventEscalated(fromAdminId: string, toAdminId: string, eventData: any) {
    this.io.to(`user:${toAdminId}`).emit('event:escalated', {
      type: 'event_escalated',
      message: 'Event has been escalated to you for approval',
      event: eventData,
      escalatedFrom: fromAdminId,
      timestamp: new Date(),
    });
  }

  // Badge achievement notifications (cross-service)
  notifyBadgeEarned(userId: string, badgeData: any) {
    this.io.to(`user:${userId}`).emit('badge:earned', {
      type: 'badge_earned',
      message: `Congratulations! You earned the "${badgeData.name}" badge`,
      badge: badgeData,
      timestamp: new Date(),
    });
  }

  notifyEventEligibilityUnlocked(userId: string) {
    this.io.to(`user:${userId}`).emit('event:eligibility_unlocked', {
      type: 'event_eligibility_unlocked',
      message: 'You can now create events! You have earned enough badges.',
      timestamp: new Date(),
    });
  }

  // Broadcast to all dept admins in a college
  notifyDeptAdmins(collegeId: string, department: string, eventData: any) {
    // This would require tracking college/department info in socket connections
    // For now, broadcast to all dept_admin role holders
    this.io.to('role:dept_admin').emit('event:approval_pending', {
      type: 'event_approval_pending',
      message: 'New event pending approval in your department',
      event: eventData,
      collegeId,
      department,
      timestamp: new Date(),
    });
  }

  // Get connected users count
  getConnectedUsersCount(): number {
    return this.userSockets.size;
  }

  // Check if user is online
  isUserOnline(userId: string): boolean {
    return this.userSockets.has(userId);
  }
}

export let socketManager: SocketManager | null = null;

export function initializeSocketManager(server: Server): SocketManager {
  socketManager = new SocketManager(server);
  return socketManager;
}

export function getSocketManager(): SocketManager | null {
  return socketManager;
}
