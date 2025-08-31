import axios from "axios";
import { env } from "../config/env";
import cache from "../utils/cache";

interface AuthUser {
  id: string;
  displayName: string;
  roles: string[];
  collegeId: string;
  department: string;
}

export async function fetchUserIdentity(req: any, userId: string): Promise<AuthUser | null> {
  const cacheKey = `auth:user:${userId}`;
  
  // Try Redis cache first
  const cached = await cache.get<AuthUser>(cacheKey);
  if (cached) return cached;

  try {
    const response = await axios.get(`${env.AUTH_BASE_URL}/v1/users/${userId}`, {
      headers: {
        Authorization: req.headers.authorization,
      },
    });

    const userData = response.data.user;
    const authUser: AuthUser = {
      id: userData.id,
      displayName: userData.displayName || userData.email,
      roles: userData.roles || [],
      collegeId: userData.collegeId || "",
      department: userData.department || "",
    };

    // Cache for 5 minutes
    await cache.set(cacheKey, authUser, 300);
    return authUser;
  } catch (error) {
    console.error("Failed to fetch user identity:", error);
    return null;
  }
}

export async function fetchUsersByRole(req: any, collegeId: string, role: string): Promise<AuthUser[]> {
  const cacheKey = `auth:role:${collegeId}:${role}`;
  
  // Try Redis cache first
  const cached = await cache.get<AuthUser[]>(cacheKey);
  if (cached) return cached;

  try {
    const response = await axios.get(`${env.AUTH_BASE_URL}/v1/users/by-role/${role}`, {
      headers: {
        Authorization: req.headers.authorization,
      },
      params: { collegeId },
    });

    const users = response.data.users.map((user: any) => ({
      id: user.id,
      displayName: user.displayName || user.email,
      roles: user.roles || [],
      collegeId: user.collegeId || "",
      department: user.department || "",
    }));

    // Cache for 10 minutes
    await cache.set(cacheKey, users, 600);
    return users;
  } catch (error) {
    console.error(`Failed to fetch users by role ${role}:`, error);
    return [];
  }
}

// Alias for backward compatibility
export const getUserIdentity = fetchUserIdentity;
