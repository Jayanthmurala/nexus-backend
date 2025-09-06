import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface FollowStats {
  followersCount: number;
  followingCount: number;
  isFollowing?: boolean;
  profileViews: number;
  searchAppearances: number;
}

export interface FollowUser {
  id: string;
  name: string;
  avatarUrl?: string;
  department?: string;
  college?: string;
  collegeName?: string;
  collegeMemberId?: string;
  roles?: string[];
  followedAt: Date;
}

export interface FollowSuggestion {
  id: string;
  name: string;
  avatarUrl?: string;
  department?: string;
  college?: string;
  mutualFollowersCount: number;
  reason: 'same_college' | 'same_department' | 'mutual_followers' | 'popular';
}

export class FollowService {
  private prisma = prisma;

  // CRUD Operations for Users
  async createUser(userData: {
    email: string;
    displayName: string;
    password: string;
    roles: string[];
    collegeId?: string;
    department?: string;
    year?: number;
    collegeMemberId?: string;
  }) {
    try {
      const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:4001';
      const response = await fetch(`${authServiceUrl}/v1/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(userData)
      });

      if (!response.ok) {
        const errorData = await response.json() as any;
        throw new Error(errorData.message || 'Failed to create user');
      }

      return await response.json();
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  async updateUser(userId: string, updateData: any, currentUserId: string, currentUserRole?: string) {
    try {
      // Check if user can update (admin or self)
      if (currentUserId !== userId && !['HEAD_ADMIN', 'SUPER_ADMIN'].includes(currentUserRole || '')) {
        throw new Error('Unauthorized to update this user');
      }

      const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:4001';
      const response = await fetch(`${authServiceUrl}/v1/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });

      if (!response.ok) {
        const errorData = await response.json() as any;
        throw new Error(errorData.message || 'Failed to update user');
      }

      return await response.json();
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  }

  async deleteUser(userId: string, currentUserId: string) {
    try {
      // Prevent self-deletion
      if (currentUserId === userId) {
        throw new Error('Cannot delete your own account');
      }

      const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:4001';
      const response = await fetch(`${authServiceUrl}/v1/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json() as any;
        throw new Error(errorData.message || 'Failed to delete user');
      }

      // Also remove all follow relationships for this user
      await Promise.all([
        this.prisma.userFollow.deleteMany({
          where: { followerId: userId }
        }),
        this.prisma.userFollow.deleteMany({
          where: { followingId: userId }
        })
      ]);

      return { success: true, message: 'User deleted successfully' };
    } catch (error) {
      console.error('Error deleting user:', error);
      throw error;
    }
  }

  async getUserById(userId: string, currentUserId?: string) {
    try {
      const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:4001';
      const response = await fetch(`${authServiceUrl}/v1/users/${userId}`, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('User not found');
      }

      const userData = await response.json() as any;
      const followStats = await this.getFollowStats(userId, currentUserId);

      return {
        ...userData,
        followersCount: followStats.followersCount,
        followingCount: followStats.followingCount,
        isFollowing: followStats.isFollowing
      };
    } catch (error) {
      console.error('Error fetching user:', error);
      throw error;
    }
  }
  async followUser(followerId: string, followingId: string): Promise<{ success: boolean; message: string }> {
    if (followerId === followingId) {
      throw new Error('Cannot follow yourself');
    }

    // Check if already following
    const existingFollow = await prisma.userFollow.findUnique({
      where: {
        followerId_followingId: {
          followerId,
          followingId
        }
      }
    });

    if (existingFollow) {
      return { success: false, message: 'Already following this user' };
    }

    await prisma.userFollow.create({
      data: {
        followerId,
        followingId
      }
    });

    return { success: true, message: 'Successfully followed user' };
  }

  async unfollowUser(followerId: string, followingId: string): Promise<{ success: boolean; message: string }> {
    const existingFollow = await prisma.userFollow.findUnique({
      where: {
        followerId_followingId: {
          followerId,
          followingId
        }
      }
    });

    if (!existingFollow) {
      return { success: false, message: 'Not following this user' };
    }

    await prisma.userFollow.delete({
      where: {
        followerId_followingId: {
          followerId,
          followingId
        }
      }
    });

    return { success: true, message: 'Successfully unfollowed user' };
  }

  async getFollowStats(userId: string, currentUserId?: string): Promise<FollowStats> {
    const [followersCount, followingCount, isFollowing] = await Promise.all([
      prisma.userFollow.count({
        where: { followingId: userId }
      }),
      prisma.userFollow.count({
        where: { followerId: userId }
      }),
      currentUserId && currentUserId !== userId ? prisma.userFollow.findUnique({
        where: {
          followerId_followingId: {
            followerId: currentUserId,
            followingId: userId
          }
        }
      }) : null
    ]);

    // For now, we'll set profileViews and searchAppearances to 0
    // These could be implemented later with proper tracking
    return {
      followersCount,
      followingCount,
      isFollowing: !!isFollowing,
      profileViews: 0,
      searchAppearances: 0
    };
  }

  async getFollowers(userId: string, cursor?: string, limit: number = 20): Promise<{ users: FollowUser[]; nextCursor?: string }> {
    const follows = await prisma.userFollow.findMany({
      where: { followingId: userId },
      orderBy: { followedAt: 'desc' },
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      select: {
        id: true,
        followerId: true,
        followedAt: true
      }
    });

    const hasMore = follows.length > limit;
    const items = hasMore ? follows.slice(0, -1) : follows;

    // Get user profiles from auth service with enhanced data
    const userIds = items.map(f => f.followerId);
    const users: FollowUser[] = await this.getUserProfilesEnhanced(userIds, items);

    return {
      users,
      nextCursor: hasMore ? items[items.length - 1].id : undefined
    };
  }

  async getFollowing(userId: string, cursor?: string, limit: number = 20): Promise<{ users: FollowUser[]; nextCursor?: string }> {
    const follows = await prisma.userFollow.findMany({
      where: { followerId: userId },
      orderBy: { followedAt: 'desc' },
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      select: {
        id: true,
        followingId: true,
        followedAt: true
      }
    });

    const hasMore = follows.length > limit;
    const items = hasMore ? follows.slice(0, -1) : follows;

    // Get user profiles from auth service with enhanced data
    const userIds = items.map(f => f.followingId);
    const users: FollowUser[] = await this.getUserProfilesEnhanced(userIds, items);

    return {
      users,
      nextCursor: hasMore ? items[items.length - 1].id : undefined
    };
  }

  async getFollowSuggestions(userId: string, limit: number = 10): Promise<FollowSuggestion[]> {
    try {
      // Get current user's info from auth service
      const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:4001';
      const userResponse = await fetch(`${authServiceUrl}/v1/users/${userId}`);
      
      if (!userResponse.ok) {
        console.error('Failed to fetch current user info');
        return [];
      }
      
      const currentUser = await userResponse.json() as any;
      
      // Get all users from auth service
      const allUsersResponse = await fetch(`${authServiceUrl}/v1/users`);
      
      if (!allUsersResponse.ok) {
        console.error('Failed to fetch all users');
        return [];
      }
      
      const allUsersData = await allUsersResponse.json() as any;
      const allUsers = allUsersData.users || [];
      
      // Get users already being followed
      const followingIds = await this.getFollowingIds(userId);
      
      // Filter out current user, already followed users, and admin users
      const candidateUsers = allUsers.filter((user: any) => 
        user.id !== userId && 
        !followingIds.includes(user.id) &&
        user.roles && 
        (user.roles.includes('STUDENT') || user.roles.includes('FACULTY')) // Only students and faculty
      );
      
      // Calculate suggestions with college-based algorithm
      const suggestions = await Promise.all(candidateUsers.map(async (user: any) => {
        let score = 0;
        let reason: 'same_college' | 'same_department' | 'mutual_followers' | 'popular' = 'popular';
        
        // Same college gets highest priority
        if (user.college && currentUser.college && user.college === currentUser.college) {
          score += 100;
          reason = 'same_college';
          
          // Same department within same college gets bonus
          if (user.department && currentUser.department && user.department === currentUser.department) {
            score += 50;
            reason = 'same_department';
          }
        }
        
        // Add randomness for variety
        score += Math.random() * 10;
        
        return {
          id: user.id,
          name: user.displayName || user.name,
          email: user.email,
          avatarUrl: user.avatarUrl,
          department: user.department,
          college: user.college,
          collegeName: user.collegeName,
          collegeMemberId: user.collegeMemberId,
          roles: user.roles,
          bio: user.bio,
          mutualFollowersCount: await this.getMutualFollowersCount(userId, user.id),
          reason,
          score,
          isFollowing: false
        };
      }));
      
      // Sort by score (highest first) and return top suggestions
      return suggestions
        .sort((a: any, b: any) => b.score - a.score)
        .slice(0, limit);
        
    } catch (error) {
      console.error('Error fetching follow suggestions:', error);
      return [];
    }
  }
  
  async getFollowingIds(userId: string): Promise<string[]> {
    try {
      const following = await this.prisma.userFollow.findMany({
        where: { followerId: userId },
        select: { followingId: true }
      });
      return following.map(f => f.followingId);
    } catch (error) {
      console.error('Error fetching following IDs:', error);
      return [];
    }
  }

  private async getUserProfile(userId: string): Promise<any> {
    try {
      const profileServiceUrl = process.env.PROFILE_SERVICE_URL || 'http://localhost:3002';
      const response = await fetch(`${profileServiceUrl}/v1/profiles/${userId}`);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Failed to fetch user profile:', error);
    }
    return null;
  }

  private async getUserProfiles(userIds: string[], followData: any[]): Promise<FollowUser[]> {
    // This would typically call the profile service
    // For now, return basic user data
    return followData.map((follow, index) => ({
      id: userIds[index],
      name: `User ${userIds[index].slice(0, 8)}`,
      avatarUrl: undefined,
      department: undefined,
      college: undefined,
      followedAt: follow.followedAt
    }));
  }

  private async getUserProfilesEnhanced(userIds: string[], followData: any[]): Promise<FollowUser[]> {
    try {
      const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:4001';
      const users: FollowUser[] = [];
      
      // Fetch each user's profile from auth service
      for (let i = 0; i < userIds.length; i++) {
        const userId = userIds[i];
        const followInfo = followData[i];
        
        try {
          const response = await fetch(`${authServiceUrl}/v1/users/${userId}`);
          if (response.ok) {
            const userData = await response.json() as any;
            users.push({
              id: userData.id,
              name: userData.displayName || userData.name,
              avatarUrl: userData.avatarUrl,
              department: userData.department,
              college: userData.college,
              collegeName: userData.collegeName,
              collegeMemberId: userData.collegeMemberId,
              roles: userData.roles,
              followedAt: followInfo.followedAt
            });
          } else {
            // Fallback for failed requests
            users.push({
              id: userId,
              name: `User ${userId.slice(0, 8)}`,
              avatarUrl: undefined,
              department: undefined,
              college: undefined,
              followedAt: followInfo.followedAt
            });
          }
        } catch (error) {
          console.error(`Failed to fetch user ${userId}:`, error);
          // Fallback for failed requests
          users.push({
            id: userId,
            name: `User ${userId.slice(0, 8)}`,
            avatarUrl: undefined,
            department: undefined,
            college: undefined,
            followedAt: followInfo.followedAt
          });
        }
      }
      
      return users;
    } catch (error) {
      console.error('Error fetching enhanced user profiles:', error);
      // Fallback to basic implementation
      return this.getUserProfiles(userIds, followData);
    }
  }

  private async getSuggestionsByCollege(collegeId: string, excludeIds: string[], limit: number): Promise<FollowSuggestion[]> {
    // This would query the profile service for users in the same college
    // For now, return empty array
    return [];
  }

  private async getSuggestionsByDepartment(department: string, excludeIds: string[], limit: number): Promise<FollowSuggestion[]> {
    // This would query the profile service for users in the same department
    return [];
  }

  async getUsersDirectory(params: {
    offset?: number;
    limit?: number;
    search?: string;
    collegeId?: string;
  }) {
    const { offset = 0, limit = 50, search, collegeId } = params;

    try {
      // Call auth service directly to get users from user model
      const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:4001';
      const queryParams = new URLSearchParams();
      queryParams.append('offset', offset.toString());
      queryParams.append('limit', limit.toString());
      // Enhanced search to include collegeMemberId
      if (search) {
        queryParams.append('search', search);
        queryParams.append('searchFields', 'displayName,email,collegeMemberId');
      }
      if (collegeId) queryParams.append('collegeId', collegeId);
      if (search) queryParams.append('collegeName', search); // Also search by college name
      // Exclude admin users from networking
      queryParams.append('excludeRoles', 'HEAD_ADMIN,DEPT_ADMIN,PLACEMENTS_ADMIN');
      queryParams.append('includeRoles', 'STUDENT,FACULTY');

      console.log(`[FollowService] Calling auth service: ${authServiceUrl}/v1/users?${queryParams}`);
      const response = await fetch(`${authServiceUrl}/v1/users?${queryParams}`, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        console.error(`[FollowService] Auth service error: ${response.status} ${response.statusText}`);
        const errorText = await response.text();
        console.error(`[FollowService] Error response: ${errorText}`);
        throw new Error(`Auth service error: ${response.status}`);
      }

      const data = await response.json() as {
        users: Array<{
          id: string;
          displayName: string;
          email: string;
          avatarUrl?: string;
          college?: string;
          collegeName?: string;
          department?: string;
          year?: number;
          collegeMemberId?: string;
          roles?: string[];
          bio?: string;
        }>;
        nextOffset?: number;
        hasMore?: boolean;
        totalCount?: number;
      };
      
      console.log(`[FollowService] Auth service returned ${data.users?.length || 0} users`);
      
      // Filter to only include students and faculty, exclude admins
      const filteredUsers = data.users.filter(user => 
        user.roles && 
        (user.roles.includes('STUDENT') || user.roles.includes('FACULTY'))
      );
      
      // Add follow counts for each user using UserFollow model
      const usersWithFollowCounts = await Promise.all(
        filteredUsers.map(async (user) => {
          const followStats = await this.getFollowStats(user.id);
          return {
            id: user.id,
            name: user.displayName,
            email: user.email,
            avatarUrl: user.avatarUrl,
            college: user.college,
            collegeName: user.collegeName,
            department: user.department,
            year: user.year,
            collegeMemberId: user.collegeMemberId,
            roles: user.roles,
            bio: user.bio,
            followersCount: followStats.followersCount,
            followingCount: followStats.followingCount,
            isFollowing: false // Will be set by caller if needed
          };
        })
      );

      return {
        users: usersWithFollowCounts,
        total: usersWithFollowCounts.length,
        hasMore: data.hasMore || false
      };
    } catch (error) {
      console.error('Error fetching users directory:', error);
      // Return empty result on error
      return {
        users: [],
        total: 0,
        hasMore: false
      };
    }
  }

  // Calculate mutual followers between two users
  async getMutualFollowersCount(userId1: string, userId2: string): Promise<number> {
    try {
      // Get followers of user1
      const user1Followers = await this.prisma.userFollow.findMany({
        where: { followingId: userId1 },
        select: { followerId: true }
      });

      // Get followers of user2
      const user2Followers = await this.prisma.userFollow.findMany({
        where: { followingId: userId2 },
        select: { followerId: true }
      });

      // Find mutual followers
      const user1FollowerIds = new Set(user1Followers.map(f => f.followerId));
      const mutualCount = user2Followers.filter(f => 
        user1FollowerIds.has(f.followerId)
      ).length;

      return mutualCount;
    } catch (error) {
      console.error('Error calculating mutual followers:', error);
      return 0;
    }
  }

}
