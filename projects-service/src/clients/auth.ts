import { env } from "../config/env";
import type { AccessTokenPayload } from "../utils/jwt";
import { getCache, CACHE_KEYS, CACHE_TTL } from "../utils/cache";

// Auth service client for identity data
export interface UserIdentity {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  roles: string[];
  collegeId: string;
  department: string;
  year?: number;
}

// Cache instance
const cache = getCache();

export async function getUserIdentity(userId: string, authHeader: string): Promise<UserIdentity> {
  const cacheKey = CACHE_KEYS.USER_IDENTITY(userId);
  
  // Check cache first
  const cached = await getCachedIdentity(cacheKey);
  if (cached) return cached;

  const res = await fetch(`${env.AUTH_BASE_URL}/v1/users/${userId}`, {
    headers: { Authorization: authHeader },
  });
  
  if (!res.ok) {
    throw new Error(`Auth service responded ${res.status}`);
  }
  
  const userData = await res.json();
  const user = userData.user; // Auth service returns { user: {...} }
  const identity: UserIdentity = {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    roles: user.roles,
    collegeId: user.collegeId,
    department: user.department,
    year: user.year,
  };

  // Cache the identity
  await setCachedIdentity(cacheKey, identity);
  return identity;
}

export function getUserScopeFromJWT(payload: AccessTokenPayload): {
  collegeId?: string;
  department?: string;
  year?: number;
  displayName?: string;
} {
  // Extract from new JWT structure with profile object
  const profile = (payload as any).profile;
  if (profile) {
    return {
      collegeId: profile.collegeId,
      department: profile.department,
      year: profile.year,
      displayName: payload.displayName || (payload as any).name,
    };
  }

  // Fallback for old JWT structure (backward compatibility)
  return {
    displayName: payload.displayName || (payload as any).name,
  };
}

async function getCachedIdentity(cacheKey: string): Promise<UserIdentity | null> {
  try {
    const cached = await cache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (error) {
    console.warn("Cache get error:", error);
  }
  return null;
}

async function setCachedIdentity(cacheKey: string, identity: UserIdentity): Promise<void> {
  try {
    await cache.set(cacheKey, JSON.stringify(identity), CACHE_TTL.USER_IDENTITY);
  } catch (error) {
    console.warn("Cache set error:", error);
  }
}

// Background refresh for cache (to be called periodically)
export function refreshIdentityInBackground(userId: string, authHeader: string): void {
  getUserIdentity(userId, authHeader).catch(error => {
    console.warn(`Background refresh failed for user ${userId}:`, error);
  });
}
