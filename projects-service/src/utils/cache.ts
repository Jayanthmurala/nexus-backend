import { env } from "../config/env";

// Cache interface for both Redis and in-memory implementations
export interface Cache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

// In-memory cache implementation for development
class InMemoryCache implements Cache {
  private cache = new Map<string, { value: string; expiresAt: number }>();

  async get(key: string): Promise<string | null> {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    
    return item.value;
  }

  async set(key: string, value: string, ttlSeconds = 1800): Promise<void> {
    const expiresAt = Date.now() + (ttlSeconds * 1000);
    this.cache.set(key, { value, expiresAt });
  }

  async del(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    const item = this.cache.get(key);
    if (!item) return false;
    
    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }
}

// Redis cache implementation for production
class RedisCache implements Cache {
  private client: any;
  private connected = false;

  constructor() {
    this.initRedis();
  }

  private async initRedis() {
    try {
      const { createClient } = await import('redis');
      this.client = createClient({
        url: env.REDIS_URL,
      });

      this.client.on('error', (err: any) => {
        console.error('Redis Client Error:', err);
        this.connected = false;
      });

      this.client.on('connect', () => {
        console.log('Redis Client Connected');
        this.connected = true;
      });

      await this.client.connect();
    } catch (error) {
      console.warn('Redis not available, falling back to in-memory cache:', error);
      this.connected = false;
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.connected || !this.client) return null;
    try {
      return await this.client.get(key);
    } catch (error) {
      console.warn('Redis get error:', error);
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds = 1800): Promise<void> {
    if (!this.connected || !this.client) return;
    try {
      await this.client.setEx(key, ttlSeconds, value);
    } catch (error) {
      console.warn('Redis set error:', error);
    }
  }

  async del(key: string): Promise<void> {
    if (!this.connected || !this.client) return;
    try {
      await this.client.del(key);
    } catch (error) {
      console.warn('Redis del error:', error);
    }
  }

  async exists(key: string): Promise<boolean> {
    if (!this.connected || !this.client) return false;
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      console.warn('Redis exists error:', error);
      return false;
    }
  }
}

// Cache factory
let cacheInstance: Cache | null = null;

export function getCache(): Cache {
  if (!cacheInstance) {
    if (env.NODE_ENV === 'production' && env.REDIS_URL) {
      cacheInstance = new RedisCache();
    } else {
      cacheInstance = new InMemoryCache();
    }
  }
  return cacheInstance;
}

// Cache utilities for user scope data
export const CACHE_KEYS = {
  USER_SCOPE: (userId: string) => `user_scope:${userId}`,
  USER_IDENTITY: (userId: string) => `user_identity:${userId}`,
} as const;

export const CACHE_TTL = {
  USER_SCOPE: 30 * 60, // 30 minutes
  USER_IDENTITY: 30 * 60, // 30 minutes
  BACKGROUND_REFRESH_THRESHOLD: 0.8, // Refresh when 80% of TTL elapsed
} as const;
