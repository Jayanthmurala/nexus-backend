import { createClient, RedisClientType } from 'redis';

class CacheManager {
  private client: RedisClientType | null = null;
  private isConnected = false;
  private connectionAttempted = false;

  async connect() {
    if (this.isConnected || this.connectionAttempted) return;
    
    this.connectionAttempted = true;

    // Skip Redis if explicitly disabled
    if (process.env.REDIS_DISABLED === 'true') {
      console.log('⚠️  Redis disabled - running without cache');
      return;
    }

    try {
      this.client = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
      });

      this.client.on('error', (err) => {
        console.error('Redis Client Error:', err.message);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('✅ Redis Client Connected');
        this.isConnected = true;
      });

      await this.client.connect();
    } catch (error) {
      console.warn('⚠️  Redis unavailable - running without cache:', error instanceof Error ? error.message : String(error));
      this.client = null;
      this.isConnected = false;
    }
  }

  async disconnect() {
    if (this.client && this.isConnected) {
      await this.client.disconnect();
      this.isConnected = false;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.client || !this.isConnected) return null;

    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  async set(key: string, value: any, ttlSeconds = 300): Promise<boolean> {
    if (!this.client || !this.isConnected) return false;

    try {
      await this.client.setEx(key, ttlSeconds, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error('Cache set error:', error);
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    if (!this.client || !this.isConnected) return false;

    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      console.error('Cache delete error:', error);
      return false;
    }
  }

  async invalidatePattern(pattern: string): Promise<void> {
    if (!this.client || !this.isConnected) return;

    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
    } catch (error) {
      console.error('Cache pattern invalidation error:', error);
    }
  }

  // Helper methods for common cache patterns
  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttlSeconds = 300
  ): Promise<T | null> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    try {
      const fresh = await fetchFn();
      await this.set(key, fresh, ttlSeconds);
      return fresh;
    } catch (error) {
      console.error('Cache getOrSet error:', error);
      return null;
    }
  }

  // Cache key generators
  static authUserKey(userId: string): string {
    return `auth:user:${userId}`;
  }

  static profileUserKey(userId: string): string {
    return `profile:user:${userId}`;
  }

  static badgeEligibilityKey(userId: string, collegeId: string): string {
    return `badge:eligibility:${userId}:${collegeId}`;
  }

  static deptAdminsKey(collegeId: string, department: string): string {
    return `dept:admins:${collegeId}:${department}`;
  }

  static headAdminsKey(collegeId: string): string {
    return `head:admins:${collegeId}`;
  }
}

export const cache = new CacheManager();
export default cache;
