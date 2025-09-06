import { PrismaClient } from '@prisma/client';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import type { MultipartFile } from '@fastify/multipart';

export interface SendMessagePayload {
  senderId: string;
  receiverId: string;
  content: string;
  type: 'TEXT' | 'IMAGE' | 'FILE';
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
}

export interface MessageWithUser {
  id: string;
  senderId: string;
  receiverId: string | null;
  content: string;
  type: string;
  fileUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
  status: string;
  createdAt: Date;
  sender: {
    id: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
  };
}

export class MessageService {
  constructor(private prisma: PrismaClient) {}

  async sendMessage(payload: SendMessagePayload): Promise<MessageWithUser> {
    // Find or create conversation between users
    let conversation = await this.prisma.conversation.findFirst({
      where: {
        type: 'DIRECT',
        participants: {
          every: {
            userId: {
              in: [payload.senderId, payload.receiverId]
            }
          }
        }
      },
      include: {
        participants: true
      }
    });

    if (!conversation) {
      // Create new conversation
      conversation = await this.prisma.conversation.create({
        data: {
          type: 'DIRECT',
          createdById: payload.senderId,
          participants: {
            create: [
              { userId: payload.senderId },
              { userId: payload.receiverId }
            ]
          }
        },
        include: {
          participants: true
        }
      });
    }

    // Create message
    const message = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: payload.senderId,
        receiverId: payload.receiverId,
        content: payload.content,
        type: payload.type,
        fileUrl: payload.fileUrl,
        fileName: payload.fileName,
        fileSize: payload.fileSize,
        status: 'SENT'
      },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true
          }
        }
      }
    });

    return message;
  }

  async getMessages(userId1: string, userId2: string, options: {
    cursor?: string;
    limit: number;
  }) {
    // Find conversation between users
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        type: 'DIRECT',
        participants: {
          every: {
            userId: {
              in: [userId1, userId2]
            }
          }
        }
      }
    });

    if (!conversation) {
      return {
        messages: [],
        hasMore: false,
        nextCursor: null
      };
    }

    const messages = await this.prisma.message.findMany({
      where: {
        conversationId: conversation.id,
        ...(options.cursor && {
          id: {
            lt: options.cursor
          }
        })
      },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: options.limit + 1
    });

    const hasMore = messages.length > options.limit;
    const resultMessages = hasMore ? messages.slice(0, -1) : messages;
    const nextCursor = hasMore ? resultMessages[resultMessages.length - 1].id : null;

    return {
      messages: resultMessages.reverse(), // Return in chronological order
      hasMore,
      nextCursor
    };
  }

  async markMessagesAsRead(currentUserId: string, otherUserId: string): Promise<void> {
    // Find conversation
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        type: 'DIRECT',
        participants: {
          every: {
            userId: {
              in: [currentUserId, otherUserId]
            }
          }
        }
      }
    });

    if (!conversation) return;

    // Update messages as read
    await this.prisma.message.updateMany({
      where: {
        conversationId: conversation.id,
        senderId: otherUserId,
        receiverId: currentUserId,
        status: {
          in: ['SENT', 'DELIVERED']
        }
      },
      data: {
        status: 'READ'
      }
    });

    // Update participant's last read timestamp
    await this.prisma.conversationParticipant.updateMany({
      where: {
        conversationId: conversation.id,
        userId: currentUserId
      },
      data: {
        lastReadAt: new Date()
      }
    });
  }

  async uploadFile(file: MultipartFile): Promise<string> {
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    const filename = `${randomUUID()}-${file.filename}`;
    const filepath = path.join(uploadDir, filename);
    
    // Ensure upload directory exists
    const fs = await import('fs/promises');
    await fs.mkdir(uploadDir, { recursive: true });
    
    // Save file
    await pipeline(file.file, createWriteStream(filepath));
    
    // Return URL
    const baseUrl = process.env.BASE_URL || 'http://localhost:4006';
    return `${baseUrl}/uploads/${filename}`;
  }

  async getUnreadCount(userId: string): Promise<number> {
    const count = await this.prisma.message.count({
      where: {
        receiverId: userId,
        status: {
          in: ['SENT', 'DELIVERED']
        }
      }
    });

    return count;
  }

  async deleteMessage(messageId: string, userId: string): Promise<boolean> {
    const message = await this.prisma.message.findFirst({
      where: {
        id: messageId,
        senderId: userId
      }
    });

    if (!message) return false;

    await this.prisma.message.delete({
      where: { id: messageId }
    });

    return true;
  }
}
