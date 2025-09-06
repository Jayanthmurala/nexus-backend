import { FastifyRequest, FastifyReply } from 'fastify';
import { jwtVerify, createRemoteJWKSet } from 'jose';

const JWKS_URL = process.env.AUTH_JWKS_URL || 'http://localhost:4001/.well-known/jwks.json';
const JWT_ISSUER = process.env.AUTH_JWT_ISSUER || 'nexus-auth';
const JWT_AUDIENCE = process.env.AUTH_JWT_AUDIENCE || 'nexus';

const JWKS = createRemoteJWKSet(new URL(JWKS_URL));

export interface JWTPayload {
  sub: string;
  email?: string;
  name?: string;
  displayName?: string;
  avatarUrl?: string;
  role?: string;
  department?: string;
  collegeId?: string;
}

// Extend FastifyRequest to include user
declare module 'fastify' {
  interface FastifyRequest {
    user?: JWTPayload;
  }
}

export async function authenticateUser(request: FastifyRequest, reply: FastifyReply) {
  try {
    const authHeader = request.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ 
        error: 'Unauthorized', 
        message: 'Missing or invalid authorization header' 
      });
    }

    const token = authHeader.substring(7);
    
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    request.user = payload as JWTPayload;
  } catch (error) {
    console.error('JWT verification error:', error);
    return reply.status(401).send({ 
      error: 'Unauthorized', 
      message: 'Invalid or expired token' 
    });
  }
}

export async function optionalAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    const authHeader = request.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      const { payload } = await jwtVerify(token, JWKS, {
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });

      request.user = payload as JWTPayload;
    }
    // If no auth or invalid auth, just continue without setting user
  } catch (error) {
    // Optional auth fails silently
    console.debug('Optional auth failed:', error);
  }
}

// Role definitions
export enum UserRole {
  STUDENT = 'STUDENT',
  FACULTY = 'FACULTY',
  DEPT_ADMIN = 'DEPT_ADMIN',
  PLACEMENTS_ADMIN = 'PLACEMENTS_ADMIN',
  HEAD_ADMIN = 'HEAD_ADMIN'
}

// Role hierarchy for permissions
const ROLE_HIERARCHY = {
  [UserRole.STUDENT]: 1,
  [UserRole.FACULTY]: 2,
  [UserRole.DEPT_ADMIN]: 3,
  [UserRole.PLACEMENTS_ADMIN]: 4,
  [UserRole.HEAD_ADMIN]: 5
};

export function requireRole(requiredRole: UserRole | UserRole[]) {
  return async function(request: FastifyRequest, reply: FastifyReply) {
    if (!request.user) {
      return reply.status(401).send({ 
        error: 'Unauthorized', 
        message: 'Authentication required' 
      });
    }

    const userRole = request.user.role as UserRole;
    const requiredRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    
    const hasPermission = requiredRoles.some(role => {
      return userRole === role || ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[role];
    });

    if (!hasPermission) {
      return reply.status(403).send({ 
        error: 'Forbidden', 
        message: `Insufficient permissions. Required: ${requiredRoles.join(' or ')}, Current: ${userRole}` 
      });
    }
  };
}

export function requireAdminRole() {
  return requireRole([UserRole.DEPT_ADMIN, UserRole.PLACEMENTS_ADMIN, UserRole.HEAD_ADMIN]);
}

export function requireFacultyOrAdmin() {
  return requireRole([UserRole.FACULTY, UserRole.DEPT_ADMIN, UserRole.PLACEMENTS_ADMIN, UserRole.HEAD_ADMIN]);
}

// Check if user can modify content (either owner or admin)
export function canModifyContent(userId: string, authorId: string, userRole: string): boolean {
  if (userId === authorId) return true;
  
  const roleLevel = ROLE_HIERARCHY[userRole as UserRole] || 0;
  return roleLevel >= ROLE_HIERARCHY[UserRole.DEPT_ADMIN];
}
