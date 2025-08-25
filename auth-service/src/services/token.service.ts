import crypto from "node:crypto";
import { prisma } from "../db";
import { TokenType } from "@prisma/client";
import { hashSecret, verifySecret } from "../utils/crypto";
import { env } from "../config/env";

const REFRESH_COOKIE = "rt";

export function getRefreshCookieName() {
  return REFRESH_COOKIE;
}

export function getRefreshCookieOptions() {
  const maxAgeDays = parseExpiryToDays(env.AUTH_JWT_REFRESH_EXPIRES_IN);
  return {
    httpOnly: true,
    secure: env.NODE_ENV !== "development",
    sameSite: "lax" as const,
    path: "/",
    domain: env.COOKIE_DOMAIN,
    maxAge: maxAgeDays * 24 * 60 * 60,
  };
}

function parseExpiryToDays(exp: string): number {
  // very small parser supporting d/h/m
  const match = exp.match(/^(\d+)([dhm])$/);
  if (!match) return 30;
  const val = Number(match[1]);
  const unit = match[2];
  if (unit === "d") return val;
  if (unit === "h") return Math.ceil(val / 24);
  return Math.ceil(val / (24 * 60));
}

export async function issueRefreshToken(userId: string) {
  const tokenId = crypto.randomUUID();
  const secret = crypto.randomBytes(32).toString("base64url");
  const value = `${tokenId}.${secret}`;
  const secretHash = await hashSecret(secret);
  const expiresAt = new Date(Date.now() + parseExpiryToDays(env.AUTH_JWT_REFRESH_EXPIRES_IN) * 24 * 60 * 60 * 1000);

  await prisma.securityToken.create({
    data: {
      id: tokenId,
      userId,
      tokenHash: secretHash,
      type: TokenType.REFRESH_TOKEN,
      expiresAt,
    },
  });

  return { token: value, expiresAt };
}

export async function rotateRefreshToken(oldValue: string) {
  const parsed = parseRefreshToken(oldValue);
  if (!parsed) return null;
  const record = await prisma.securityToken.findUnique({ where: { id: parsed.id } });
  if (!record || record.type !== TokenType.REFRESH_TOKEN || record.usedAt || record.expiresAt < new Date()) return null;
  const ok = await verifySecret(record.tokenHash, parsed.secret);
  if (!ok) return null;

  // mark used
  await prisma.securityToken.update({ where: { id: parsed.id }, data: { usedAt: new Date() } });
  // issue new
  return issueRefreshToken(record.userId);
}

export function parseRefreshToken(value: string | undefined | null): { id: string; secret: string } | null {
  if (!value) return null;
  const [id, secret] = value.split(".");
  if (!id || !secret) return null;
  return { id, secret };
}

export async function revokeAllRefreshTokens(userId: string) {
  await prisma.securityToken.updateMany({
    where: { userId, type: TokenType.REFRESH_TOKEN, usedAt: null },
    data: { usedAt: new Date() },
  });
}
