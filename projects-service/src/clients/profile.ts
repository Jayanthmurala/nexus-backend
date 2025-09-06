import { env } from "../config/env";
import type { AccessTokenPayload } from "../utils/jwt";
import { getUserScopeFromJWT, getUserIdentity } from "./auth";
import { getCache, CACHE_KEYS, CACHE_TTL } from "../utils/cache";

// Cache instance
const cache = getCache();

export async function getUserScope(req: any, payload: AccessTokenPayload): Promise<{ collegeId?: string; department?: string; avatar?: string; displayName?: string; year?: number }> {
  const cacheKey = CACHE_KEYS.USER_SCOPE(payload.sub);
  
  // Check Redis/cache first
  const cached = await getCachedScope(cacheKey);
  if (cached) return cached;

  // Try JWT-first approach (new tokens with profile object)
  const jwtScope = getUserScopeFromJWT(payload);
  console.log(`[DEBUG] JWT scope for user ${payload.sub}:`, JSON.stringify(jwtScope));
  if (jwtScope.collegeId && jwtScope.department) {
    const scope = {
      collegeId: jwtScope.collegeId,
      department: jwtScope.department,
      year: jwtScope.year,
      displayName: jwtScope.displayName,
      avatar: (payload as any).avatarUrl || (payload as any).picture,
    };
    await setCachedScope(cacheKey, scope);
    console.log(`[DEBUG] Using JWT scope for user ${payload.sub}:`, JSON.stringify(scope));
    return scope;
  }

  // Fallback to profile service for backward compatibility
  const auth = req.headers["authorization"] as string | undefined;
  if (!auth) throw new Error("Missing Authorization header for profile lookup");

  try {
    // Try auth service first for identity data
    const identity = await getUserIdentity(payload.sub, auth);
    console.log(`[DEBUG] Auth service identity for user ${payload.sub}:`, JSON.stringify(identity));
    const scope = {
      collegeId: identity.collegeId,
      department: identity.department,
      year: identity.year,
      displayName: identity.displayName,
      avatar: identity.avatarUrl,
    };
    await setCachedScope(cacheKey, scope);
    console.log(`[DEBUG] Using auth service scope for user ${payload.sub}:`, JSON.stringify(scope));
    return scope;
  } catch (authError) {
    console.warn("Auth service fallback failed, trying profile service:", authError);
    
    // Final fallback to profile service
    const res = await fetch(`${env.PROFILE_BASE_URL}/v1/profile/me`, {
      headers: { Authorization: auth },
    });
    if (!res.ok) {
      console.warn(`Profile service responded ${res.status}, returning minimal scope`);
      // Return minimal scope for new users without complete profiles
      return {
        displayName: payload.name ?? (payload as any).displayName,
      };
    }
    const data = await res.json();
    const profile = data?.profile as { collegeId?: string; department?: string; avatar?: string } | null;
    
    // Return whatever profile data is available, even if incomplete
    const scope = {
      collegeId: profile?.collegeId,
      department: profile?.department,
      avatar: profile?.avatar,
      displayName: payload.name ?? (payload as any).displayName,
    };
    await setCachedScope(cacheKey, scope);
    return scope;
  }
}

async function getCachedScope(cacheKey: string) {
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

async function setCachedScope(cacheKey: string, scope: any) {
  try {
    await cache.set(cacheKey, JSON.stringify(scope), CACHE_TTL.USER_SCOPE);
  } catch (error) {
    console.warn("Cache set error:", error);
  }
}
