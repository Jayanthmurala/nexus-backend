import { PrismaClient } from '@prisma/client';
import axios from 'axios';

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
}

export class UserSyncService {
  constructor(
    private prisma: PrismaClient,
    private authServiceUrl: string = process.env.AUTH_SERVICE_URL || 'http://localhost:4001'
  ) {}

  async syncUserFromAuth(userId: string): Promise<UserProfile | null> {
    try {
      // Fetch user from auth service
      const response = await axios.get(`${this.authServiceUrl}/v1/profile/user/${userId}`);
      const userData = response.data;

      if (!userData) {
        console.warn(`User ${userId} not found in auth service`);
        return null;
      }

      // Transform auth service data to messaging service format
      const userProfile: UserProfile = {
        id: userData.id,
        email: userData.email,
        username: userData.username || userData.email.split('@')[0],
        firstName: userData.firstName || userData.name?.split(' ')[0] || 'User',
        lastName: userData.lastName || userData.name?.split(' ').slice(1).join(' ') || '',
        avatarUrl: userData.avatarUrl || userData.profilePicture
      };

      // Upsert user in messaging database
      await this.prisma.user.upsert({
        where: { id: userId },
        update: {
          email: userProfile.email,
          username: userProfile.username,
          firstName: userProfile.firstName,
          lastName: userProfile.lastName,
          avatarUrl: userProfile.avatarUrl,
          updatedAt: new Date()
        },
        create: {
          id: userProfile.id,
          email: userProfile.email,
          username: userProfile.username,
          firstName: userProfile.firstName,
          lastName: userProfile.lastName,
          avatarUrl: userProfile.avatarUrl
        }
      });

      console.log(`User ${userId} synced successfully`);
      return userProfile;
    } catch (error) {
      console.error(`Failed to sync user ${userId}:`, error);
      return null;
    }
  }

  async ensureUserExists(userId: string): Promise<boolean> {
    try {
      // Check if user exists in messaging database
      const existingUser = await this.prisma.user.findUnique({
        where: { id: userId }
      });

      if (existingUser) {
        return true;
      }

      // Sync user from auth service
      const syncedUser = await this.syncUserFromAuth(userId);
      return syncedUser !== null;
    } catch (error) {
      console.error(`Failed to ensure user ${userId} exists:`, error);
      return false;
    }
  }

  async bulkSyncUsers(userIds: string[]): Promise<void> {
    console.log(`Starting bulk sync for ${userIds.length} users`);
    
    const syncPromises = userIds.map(userId => 
      this.syncUserFromAuth(userId).catch(error => {
        console.error(`Failed to sync user ${userId}:`, error);
        return null;
      })
    );

    await Promise.all(syncPromises);
    console.log('Bulk user sync completed');
  }

  async getUserProfile(userId: string): Promise<UserProfile | null> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          username: true,
          firstName: true,
          lastName: true,
          avatarUrl: true
        }
      });

      return user;
    } catch (error) {
      console.error(`Failed to get user profile ${userId}:`, error);
      return null;
    }
  }

  async searchUsers(query: string, limit: number = 10): Promise<UserProfile[]> {
    try {
      const users = await this.prisma.user.findMany({
        where: {
          OR: [
            { firstName: { contains: query, mode: 'insensitive' } },
            { lastName: { contains: query, mode: 'insensitive' } },
            { username: { contains: query, mode: 'insensitive' } },
            { email: { contains: query, mode: 'insensitive' } }
          ]
        },
        select: {
          id: true,
          email: true,
          username: true,
          firstName: true,
          lastName: true,
          avatarUrl: true
        },
        take: limit
      });

      return users;
    } catch (error) {
      console.error(`Failed to search users with query "${query}":`, error);
      return [];
    }
  }
}
