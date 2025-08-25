import { verifyAccessToken, AccessTokenPayload } from "../utils/jwt";

export async function requireAuth(req: any): Promise<AccessTokenPayload> {
  const auth = req.headers["authorization"] as string | undefined;
  if (!auth?.startsWith("Bearer ")) {
    const err: any = new Error("Unauthorized");
    err.statusCode = 401;
    throw err;
  }
  const token = auth.slice("Bearer ".length);
  return verifyAccessToken(token);
}

export function requireRole(payload: { roles?: string[] }, allowed: string[]) {
  const has = (payload.roles || []).some((r) => allowed.includes(r));
  if (!has) {
    const err: any = new Error("Forbidden");
    err.statusCode = 403;
    throw err;
  }
}
