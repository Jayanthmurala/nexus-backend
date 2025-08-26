import { createHmac, timingSafeEqual } from "crypto";
import type { FastifyRequest } from "fastify";

const WINDOW_SECONDS = 5 * 60; // 5 minutes

const seen = new Map<string, number>(); // signature -> expiresAt epoch seconds

function purge() {
  const now = Math.floor(Date.now() / 1000);
  for (const [sig, exp] of seen.entries()) {
    if (exp <= now) seen.delete(sig);
  }
}

export function buildPayload(method: string, path: string, timestamp: string, body: any) {
  const bodyStr = body ? JSON.stringify(body) : "";
  return `${method.toUpperCase()}:${path}:${timestamp}:${bodyStr}`;
}

export function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function verifySignedRequest(req: FastifyRequest, secret: string) {
  if (!secret) {
    const err: any = new Error("Server HMAC not configured");
    err.statusCode = 500;
    throw err;
  }
  const ts = (req.headers["x-timestamp"] as string | undefined) || "";
  const sig = (req.headers["x-signature"] as string | undefined) || "";
  if (!ts || !sig) {
    const err: any = new Error("Missing signature headers");
    err.statusCode = 401;
    throw err;
  }
  const now = Math.floor(Date.now() / 1000);
  const t = Number(ts);
  if (!Number.isFinite(t) || Math.abs(now - t) > WINDOW_SECONDS) {
    const err: any = new Error("Signature expired");
    err.statusCode = 401;
    throw err;
  }
  purge();
  const existing = seen.get(sig);
  if (existing && existing > now) {
    const err: any = new Error("Replay detected");
    err.statusCode = 401;
    throw err;
  }
  const payload = buildPayload(req.method, (req as any).url, ts, (req as any).body ?? {});
  const expected = sign(secret, payload);
  const ok = timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  if (!ok) {
    const err: any = new Error("Invalid signature");
    err.statusCode = 401;
    throw err;
  }
  seen.set(sig, now + WINDOW_SECONDS);
}
