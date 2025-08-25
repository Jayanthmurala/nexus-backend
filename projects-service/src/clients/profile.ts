import { env } from "../config/env";
import type { AccessTokenPayload } from "../utils/jwt";

// Simple in-memory cache for user scope
const SCOPE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const scopeCache = new Map<string, { collegeId: string; department: string; avatar?: string; displayName?: string; expiresAt: number }>();

export async function getUserScope(req: any, payload: AccessTokenPayload): Promise<{ collegeId: string; department: string; avatar?: string; displayName?: string }> {
  const cacheKey = payload.sub;
  const now = Date.now();
  const cached = cacheCacheGet(cacheKey, now);
  if (cached) return cached;

  const auth = req.headers["authorization"] as string | undefined;
  if (!auth) throw new Error("Missing Authorization header for profile lookup");

  const res = await fetch(`${env.PROFILE_BASE_URL}/v1/profile/me`, {
    headers: { Authorization: auth },
  });
  if (!res.ok) {
    throw new Error(`Profile service responded ${res.status}`);
  }
  const data = await res.json();
  const profile = data?.profile as { collegeId?: string; department?: string; avatar?: string } | null;
  if (!profile?.collegeId || !profile?.department) {
    throw new Error("Profile is missing collegeId or department");
  }
  const scope = {
    collegeId: profile.collegeId,
    department: profile.department,
    avatar: profile.avatar,
    displayName: payload.name ?? (payload as any).displayName,
  };
  scopeCache.set(cacheKey, { ...scope, expiresAt: now + SCOPE_TTL_MS });
  return scope;
}

function cacheCacheGet(key: string, now: number) {
  const v = scopeCache.get(key);
  if (v && v.expiresAt > now) return { collegeId: v.collegeId, department: v.department, avatar: v.avatar, displayName: v.displayName };
  if (v) scopeCache.delete(key);
  return null;
}
