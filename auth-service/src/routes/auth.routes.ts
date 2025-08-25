import type { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import crypto from "node:crypto";
import { prisma } from "../db";
import { env } from "../config/env";
import { hashPassword, verifyPassword, hashSecret, verifySecret } from "../utils/crypto";
import { signAccessToken, verifyAccessToken } from "../utils/jwt";
import { authSuccessResponseSchema, loginBodySchema, registerBodySchema, errorResponseSchema, oauthExchangeBodySchema, forgotPasswordBodySchema, resetPasswordBodySchema, verifyEmailBodySchema, resendVerificationBodySchema, messageResponseSchema } from "../schemas/auth.schemas";
import { sendPasswordResetEmail, sendVerificationEmail } from "../emails/mailer";

const REFRESH_COOKIE = "rt";

function parseExpiryToMs(input: string): number {
  const m = input.trim().match(/^(\d+)([smhd])$/i);
  if (!m) return 0;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  switch (unit) {
    case "s": return n * 1000;
    case "m": return n * 60 * 1000;
    case "h": return n * 60 * 60 * 1000;
    case "d": return n * 24 * 60 * 60 * 1000;
    default: return 0;
  }
}

function buildCookieOptions(expiresAt: Date) {
  const secure = env.NODE_ENV === "production";
  const opts: any = {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
  if (env.COOKIE_DOMAIN) {
    opts.domain = env.COOKIE_DOMAIN;
  }
  return opts;
}

async function issueRefreshTokenCookie(userId: string, reply: any) {
  const secret = crypto.randomBytes(32).toString("base64url");
  const expiresInMs = parseExpiryToMs(env.AUTH_JWT_REFRESH_EXPIRES_IN);
  const expiresAt = new Date(Date.now() + (expiresInMs || 30 * 24 * 60 * 60 * 1000));

  const token = await prisma.securityToken.create({
    data: {
      userId,
      tokenHash: await hashSecret(secret),
      type: "REFRESH_TOKEN",
      expiresAt,
    },
  });

  const cookieVal = `${token.id}.${secret}`;
  reply.setCookie(REFRESH_COOKIE, cookieVal, buildCookieOptions(expiresAt));
}

async function rotateRefreshToken(oldCookie: string | undefined, reply: any) {
  if (!oldCookie) return null;
  const [id, secret] = oldCookie.split(".");
  if (!id || !secret) return null;

  const record = await prisma.securityToken.findUnique({ where: { id } });
  if (!record || record.type !== "REFRESH_TOKEN") return null;
  if (record.usedAt || record.expiresAt < new Date()) return null;

  const ok = await verifySecret(record.tokenHash, secret);
  if (!ok) return null;

  // mark old token used and create a new one (rotation)
  await prisma.securityToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
  await issueRefreshTokenCookie(record.userId, reply);
  return record.userId;
}

// Fetch minimal profile from OAuth providers
async function getGoogleProfile(accessToken: string) {
  const resp = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) return null;
  const j: any = await resp.json();
  return {
    providerId: j.sub as string,
    email: j.email as string | null,
    emailVerified: Boolean(j.email_verified),
    name: (j.name as string) || null,
    avatarUrl: (j.picture as string) || null,
  };
}

async function getGithubProfile(accessToken: string) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "User-Agent": "nexus-auth-service",
    Accept: "application/vnd.github+json",
  } as any;
  const uResp = await fetch("https://api.github.com/user", { headers });
  if (!uResp.ok) return null;
  const u: any = await uResp.json();
  let email: string | null = u.email ?? null;
  if (!email) {
    const eResp = await fetch("https://api.github.com/user/emails", { headers });
    if (eResp.ok) {
      const emails: any[] = await eResp.json();
      const primary = Array.isArray(emails)
        ? emails.find((e: any) => e.primary && e.verified) || emails.find((e: any) => e.verified) || emails[0]
        : null;
      email = primary?.email ?? null;
    }
  }
  return {
    providerId: String(u.id),
    email,
    emailVerified: true,
    name: (u.name as string) || (u.login as string) || null,
    avatarUrl: (u.avatar_url as string) || null,
  };
}

export async function authRoutes(app: FastifyInstance) {
  const f = app.withTypeProvider<ZodTypeProvider>();

  f.post("/v1/auth/register", {
    schema: {
      tags: ["auth"],
      body: registerBodySchema,
      response: { 200: authSuccessResponseSchema, 409: errorResponseSchema },
    },
  }, async (req, reply) => {
    const { email, password, displayName } = req.body as z.infer<typeof registerBodySchema>;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return reply.code(409).send({ message: "Email already in use" });
    }

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        displayName,
        roles: ["STUDENT"],
        status: "ACTIVE",
        preferences: { create: {} },
      },
    });

    const accessToken = await signAccessToken(user.id, {
      email: user.email,
      roles: user.roles,
      displayName: user.displayName,
      tokenVersion: user.tokenVersion,
    });

    await issueRefreshTokenCookie(user.id, reply);

    return reply.send({
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        roles: user.roles,
        avatarUrl: user.avatarUrl ?? null,
      },
    });
  });

  f.post("/v1/auth/login", {
    schema: {
      tags: ["auth"],
      body: loginBodySchema,
      response: { 200: authSuccessResponseSchema, 400: errorResponseSchema, 403: errorResponseSchema },
    },
  }, async (req, reply) => {
    const { email, password } = req.body as z.infer<typeof loginBodySchema>;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      return reply.code(400).send({ message: "Invalid credentials" });
    }
    if (user.status === "SUSPENDED" || user.status === "DELETED") {
      return reply.code(403).send({ message: "User is not allowed to login" });
    }

    const ok = await verifyPassword(user.passwordHash, password);
    if (!ok) {
      return reply.code(400).send({ message: "Invalid credentials" });
    }

    const accessToken = await signAccessToken(user.id, {
      email: user.email,
      roles: user.roles,
      displayName: user.displayName,
      tokenVersion: user.tokenVersion,
    });

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await issueRefreshTokenCookie(user.id, reply);

    return reply.send({
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        roles: user.roles,
        avatarUrl: user.avatarUrl ?? null,
      },
    });
  });

  // OAuth exchange: client sends provider accessToken; we return backend-issued tokens
  f.post("/v1/auth/oauth/exchange", {
    schema: {
      tags: ["auth"],
      body: oauthExchangeBodySchema,
      response: { 200: authSuccessResponseSchema, 400: errorResponseSchema },
    },
  }, async (req, reply) => {
    const { provider, accessToken } = req.body as z.infer<typeof oauthExchangeBodySchema>;
    let profile: any = null;
    try {
      profile = provider === "google" ? await getGoogleProfile(accessToken) : await getGithubProfile(accessToken);
    } catch {
      profile = null;
    }
    if (!profile || !profile.email) {
      return reply.code(400).send({ message: "Invalid provider token or email not available" });
    }

    // Find or create user by email
    let user = await prisma.user.findUnique({ where: { email: profile.email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: profile.email,
          passwordHash: null,
          displayName: profile.name || profile.email.split("@")[0],
          avatarUrl: profile.avatarUrl ?? null,
          roles: ["STUDENT"],
          status: "ACTIVE",
          preferences: { create: {} },
        },
      });
    }

    // Upsert OAuthAccount link
    await prisma.oAuthAccount.upsert({
      where: { provider_providerAccountId: { provider, providerAccountId: profile.providerId } },
      update: { userId: user.id, accessToken },
      create: { userId: user.id, provider, providerAccountId: profile.providerId, accessToken },
    });

    const jwt = await signAccessToken(user.id, {
      email: user.email,
      roles: user.roles,
      displayName: user.displayName,
      tokenVersion: user.tokenVersion,
    });

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await issueRefreshTokenCookie(user.id, reply);

    return reply.send({
      accessToken: jwt,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        roles: user.roles,
        avatarUrl: user.avatarUrl ?? null,
      },
    });
  });

  f.post("/v1/auth/refresh", {
    schema: {
      tags: ["auth"],
      response: { 200: authSuccessResponseSchema, 401: errorResponseSchema },
    },
  }, async (req, reply) => {
    const userId = await rotateRefreshToken((req.cookies as any)?.[REFRESH_COOKIE], reply);
    if (!userId) {
      reply.clearCookie(REFRESH_COOKIE, { path: "/" });
      return reply.code(401).send({ message: "Invalid refresh token" });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      reply.clearCookie(REFRESH_COOKIE, { path: "/" });
      return reply.code(401).send({ message: "Invalid refresh token" });
    }

    const accessToken = await signAccessToken(user.id, {
      email: user.email,
      roles: user.roles,
      displayName: user.displayName,
      tokenVersion: user.tokenVersion,
    });

    return reply.send({
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        roles: user.roles,
        avatarUrl: user.avatarUrl ?? null,
      },
    });
  });

  f.post("/v1/auth/logout", {
    schema: {
      tags: ["auth"],
      response: { 204: z.null() },
    },
  }, async (req, reply) => {
    const cookieVal = (req.cookies as any)?.[REFRESH_COOKIE] as string | undefined;
    if (cookieVal) {
      const [id] = cookieVal.split(".");
      if (id) {
        await prisma.securityToken.updateMany({ where: { id }, data: { usedAt: new Date() } }).catch(() => {});
      }
      reply.clearCookie(REFRESH_COOKIE, { path: "/" });
    }
    return reply.code(204).send();
  });

  f.get("/v1/auth/me", {
    schema: {
      tags: ["auth"],
      response: {
        200: z.object({
          id: z.string(),
          email: z.string().email(),
          displayName: z.string(),
          roles: z.array(z.string()),
        }),
        401: errorResponseSchema,
      },
    },
  }, async (req, reply) => {
    const auth = req.headers["authorization"];
    if (!auth?.startsWith("Bearer ")) {
      return reply.code(401).send({ message: "Missing token" });
    }
    try {
      const token = auth.slice("Bearer ".length);
      const payload = await verifyAccessToken(token);
      const user = await prisma.user.findUnique({ where: { id: String(payload.sub) } });
      if (!user) return reply.code(401).send({ message: "Invalid token" });
      return reply.send({ id: user.id, email: user.email, displayName: user.displayName, roles: user.roles });
    } catch {
      return reply.code(401).send({ message: "Invalid token" });
    }
  });

  // Forgot password: send reset link (debugUrl in response for dev)
  f.post("/v1/auth/forgot-password", {
    schema: {
      tags: ["auth"],
      body: forgotPasswordBodySchema,
      response: { 200: messageResponseSchema },
    },
  }, async (req, reply) => {
    const { email } = req.body as z.infer<typeof forgotPasswordBodySchema>;
    const user = await prisma.user.findUnique({ where: { email } });
    // Always respond 200 to prevent user enumeration
    if (!user) {
      return reply.send({ message: "If the email is registered, a reset link has been sent." });
    }

    const secret = crypto.randomBytes(32).toString("base64url");
    const expiresMs = parseExpiryToMs(env.PASSWORD_RESET_EXPIRES_IN);
    const expiresAt = new Date(Date.now() + (expiresMs || 60 * 60 * 1000));
    const token = await prisma.securityToken.create({
      data: {
        userId: user.id,
        tokenHash: await hashSecret(secret),
        type: "PASSWORD_RESET",
        expiresAt,
      },
    });
    const raw = `${token.id}.${secret}`;
    const url = `${env.FRONTEND_URL}/reset-password?token=${raw}`;
    let previewUrl: string | undefined;
    try {
      const sent = await sendPasswordResetEmail(user.email, url);
      previewUrl = typeof sent.previewUrl === "string" ? sent.previewUrl : undefined;
    } catch (err) {
      reply.log.error(err, "Failed to send password reset email");
    }
    return reply.send({ message: "If the email is registered, a reset link has been sent.", debugUrl: url, debugPreviewUrl: previewUrl });
  });

  // Reset password: consume token, update password, issue session
  f.post("/v1/auth/reset-password", {
    schema: {
      tags: ["auth"],
      body: resetPasswordBodySchema,
      response: { 200: authSuccessResponseSchema, 400: errorResponseSchema },
    },
  }, async (req, reply) => {
    const { token: rawToken, password } = req.body as z.infer<typeof resetPasswordBodySchema>;
    const [id, secret] = String(rawToken).split(".");
    if (!id || !secret) return reply.code(400).send({ message: "Invalid token" });

    const record = await prisma.securityToken.findUnique({ where: { id } });
    if (!record || record.type !== "PASSWORD_RESET" || record.usedAt || record.expiresAt < new Date()) {
      return reply.code(400).send({ message: "Invalid or expired token" });
    }
    const ok = await verifySecret(record.tokenHash, secret);
    if (!ok) return reply.code(400).send({ message: "Invalid token" });

    const user = await prisma.user.findUnique({ where: { id: record.userId } });
    if (!user) return reply.code(400).send({ message: "Invalid token" });

    await prisma.$transaction([
      prisma.securityToken.update({ where: { id }, data: { usedAt: new Date() } }),
      prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password), tokenVersion: { increment: 1 } } }),
    ]);

    const accessToken = await signAccessToken(user.id, {
      email: user.email,
      roles: user.roles,
      displayName: user.displayName,
      tokenVersion: user.tokenVersion + 1,
    });
    await issueRefreshTokenCookie(user.id, reply);

    return reply.send({
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        roles: user.roles,
        avatarUrl: user.avatarUrl ?? null,
      },
    });
  });

  // Resend verification email
  f.post("/v1/auth/resend-verification", {
    schema: {
      tags: ["auth"],
      body: resendVerificationBodySchema,
      response: { 200: messageResponseSchema },
    },
  }, async (req, reply) => {
    const { email } = req.body as z.infer<typeof resendVerificationBodySchema>;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.emailVerifiedAt) {
      return reply.send({ message: "If verification is pending, an email has been sent." });
    }
    const secret = crypto.randomBytes(32).toString("base64url");
    const expiresMs = parseExpiryToMs(env.EMAIL_VERIFICATION_EXPIRES_IN);
    const expiresAt = new Date(Date.now() + (expiresMs || 24 * 60 * 60 * 1000));
    const token = await prisma.securityToken.create({
      data: {
        userId: user.id,
        tokenHash: await hashSecret(secret),
        type: "EMAIL_VERIFICATION",
        expiresAt,
      },
    });
    const raw = `${token.id}.${secret}`;
    const url = `${env.FRONTEND_URL}/verify-email?token=${raw}`;
    let previewUrl: string | undefined;
    try {
      const sent = await sendVerificationEmail(user.email, url);
      previewUrl = typeof sent.previewUrl === "string" ? sent.previewUrl : undefined;
    } catch (err) {
      reply.log.error(err, "Failed to send verification email");
    }
    return reply.send({ message: "If verification is pending, an email has been sent.", debugUrl: url, debugPreviewUrl: previewUrl });
  });

  // Verify email token and sign the user in
  f.post("/v1/auth/verify-email", {
    schema: {
      tags: ["auth"],
      body: verifyEmailBodySchema,
      response: { 200: authSuccessResponseSchema, 400: errorResponseSchema },
    },
  }, async (req, reply) => {
    const { token: rawToken } = req.body as z.infer<typeof verifyEmailBodySchema>;
    const [id, secret] = String(rawToken).split(".");
    if (!id || !secret) return reply.code(400).send({ message: "Invalid token" });

    const record = await prisma.securityToken.findUnique({ where: { id } });
    if (!record || record.type !== "EMAIL_VERIFICATION" || record.usedAt || record.expiresAt < new Date()) {
      return reply.code(400).send({ message: "Invalid or expired token" });
    }
    const ok = await verifySecret(record.tokenHash, secret);
    if (!ok) return reply.code(400).send({ message: "Invalid token" });

    const user = await prisma.user.findUnique({ where: { id: record.userId } });
    if (!user) return reply.code(400).send({ message: "Invalid token" });

    await prisma.$transaction([
      prisma.securityToken.update({ where: { id }, data: { usedAt: new Date() } }),
      prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date(), status: user.status === "PENDING_VERIFICATION" ? "ACTIVE" : user.status } }),
    ]);

    const accessToken = await signAccessToken(user.id, {
      email: user.email,
      roles: user.roles,
      displayName: user.displayName,
      tokenVersion: user.tokenVersion,
    });
    await issueRefreshTokenCookie(user.id, reply);

    return reply.send({
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        roles: user.roles,
        avatarUrl: user.avatarUrl ?? null,
      },
    });
  });
}

export default authRoutes;
