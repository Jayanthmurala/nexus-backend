import { FastifyRequest, FastifyReply } from "fastify";
import { verifyAccessToken } from "../utils/jwt";

declare module "fastify" {
  interface FastifyRequest {
    user?: {
      sub: string;
      id: string;
      email: string;
      roles: string[];
      displayName?: string;
    };
  }
}

export interface AuthenticatedRequest extends FastifyRequest {
  user: {
    sub: string;
    id: string;
    email: string;
    roles: string[];
    displayName?: string;
  };
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const auth = request.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) {
    return reply.code(401).send({ message: "Missing authorization token" });
  }
  
  try {
    const token = auth.slice("Bearer ".length);
    const payload = await verifyAccessToken(token);
    
    (request as AuthenticatedRequest).user = {
      sub: String(payload.sub),
      id: String(payload.sub),
      email: payload.email || "",
      roles: payload.roles || [],
      displayName: payload.name,
    };
  } catch (error) {
    return reply.code(401).send({ message: "Invalid or expired token" });
  }
}

export function requireRole(roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await requireAuth(request, reply);
    
    const user = (request as AuthenticatedRequest).user;
    const hasRole = roles.some(role => user.roles.includes(role));
    
    if (!hasRole) {
      return reply.code(403).send({ message: "Insufficient permissions" });
    }
  };
}
