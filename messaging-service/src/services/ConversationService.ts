import { PrismaClient } from '@prisma/client';

export interface ConversationWithParticipants {
  id: string;
  type: string;
  name: string | null;
  createdAt: Date;
  updatedAt: Date;
  participants: Array<{
    id: string;
    userId: string;
    joinedAt: Date;
    lastReadAt: Date | null;
    isActive: boolean;
    user: {
      id: string;
      firstName: string;
      lastName: string;
      avatarUrl: string | null;
    };
  }>;
  messages: Array<{
    id: string;
    content: string;
    createdAt: Date;
    senderId: string;
  }>;
  _count: {
    messages: number;
  };
}

export interface UserConversation {
  id: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  lastMessage: string | null;
  lastMessageTime: string | null;
  unreadCount: number;
  isOnline: boolean;
}

export class ConversationService {
  constructor(private prisma: PrismaClient) {}

  async getUserConversations(userId: string, options: {
    cursor?: string;
    limit: number;
  }) {
    const conversations = await this.prisma.conversation.findMany({
      where: {
        participants: {
          some: {
            userId: userId,
            isActive: true
          }
        }
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatarUrl: true
              }
            }
          }
        },
        messages: {
          orderBy: {
            createdAt: 'desc'
          },
          take: 1,
          select: {
            id: true,
            content: true,
            createdAt: true,
            senderId: true
          }
        },
        _count: {
          select: {
            messages: true
          }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      },
      take: options.limit + 1,
      ...(options.cursor && {
        cursor: {
          id: options.cursor
        },
        skip: 1
      })
    });

    const hasMore = conversations.length > options.limit;
    const resultConversations = hasMore ? conversations.slice(0, -1) : conversations;
    const nextCursor = hasMore ? resultConversations[resultConversations.length - 1].id : null;

    // Transform to user-friendly format
    const userConversations: UserConversation[] = await Promise.all(
      resultConversations.map(async (conv) => {
        // Find the other participant (for direct messages)
        const otherParticipant = conv.participants.find(p => p.userId !== userId);
        
        if (!otherParticipant) {
          throw new Error('Invalid conversation structure');
        }

        // Get unread count for this user
        const unreadCount = await this.getUnreadCount(conv.id, userId);

        // Check if user is online (this would be handled by Socket.IO service)
        const isOnline = false; // TODO: Integrate with Socket.IO service

        return {
          id: conv.id,
          userId: otherParticipant.userId,
          displayName: `${otherParticipant.user.firstName} ${otherParticipant.user.lastName}`,
          avatarUrl: otherParticipant.user.avatarUrl,
          lastMessage: conv.messages[0]?.content || null,
          lastMessageTime: conv.messages[0]?.createdAt.toISOString() || null,
          unreadCount,
          isOnline
        };
      })
    );

    return {
      conversations: userConversations,
      hasMore,
      nextCursor
    };
  }

  async createConversation(createdById: string, participantIds: string[], type: 'DIRECT' | 'GROUP' = 'DIRECT', name?: string) {
    const conversation = await this.prisma.conversation.create({
      data: {
        type,
        name,
        createdById,
        participants: {
          create: participantIds.map(userId => ({
            userId
          }))
        }
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatarUrl: true
              }
            }
          }
        }
      }
    });

    return conversation;
  }

  async getConversation(conversationId: string, userId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        participants: {
          some: {
            userId: userId,
            isActive: true
          }
        }
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatarUrl: true
              }
            }
          }
        }
      }
    });

    return conversation;
  }

  async addParticipant(conversationId: string, userId: string, addedById: string) {
    // Check if the person adding has permission (is already a participant)
    const existingParticipant = await this.prisma.conversationParticipant.findFirst({
      where: {
        conversationId,
        userId: addedById,
        isActive: true
      }
    });

    if (!existingParticipant) {
      throw new Error('Permission denied');
    }

    // Add new participant
    const participant = await this.prisma.conversationParticipant.create({
      data: {
        conversationId,
        userId
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true
          }
        }
      }
    });

    return participant;
  }

  async removeParticipant(conversationId: string, userId: string, removedById: string) {
    // Check permissions (user can remove themselves, or admin can remove others)
    if (userId !== removedById) {
      // TODO: Add admin check logic
      throw new Error('Permission denied');
    }

    await this.prisma.conversationParticipant.updateMany({
      where: {
        conversationId,
        userId
      },
      data: {
        isActive: false
      }
    });

    return true;
  }

  private async getUnreadCount(conversationId: string, userId: string): Promise<number> {
    const participant = await this.prisma.conversationParticipant.findFirst({
      where: {
        conversationId,
        userId
      }
    });

    if (!participant) return 0;

    const count = await this.prisma.message.count({
      where: {
        conversationId,
        senderId: {
          not: userId
        },
        createdAt: {
          gt: participant.lastReadAt || new Date(0)
        }
      }
    });

    return count;
  }

  async updateLastRead(conversationId: string, userId: string) {
    await this.prisma.conversationParticipant.updateMany({
      where: {
        conversationId,
        userId
      },
      data: {
        lastReadAt: new Date()
      }
    });
  }
}
