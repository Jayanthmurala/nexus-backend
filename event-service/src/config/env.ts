import dotenv from "dotenv";

dotenv.config();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: Number(process.env.PORT ?? 4004),
  DATABASE_URL: requireEnv("DATABASE_URL"),

  AUTH_JWKS_URL: process.env.AUTH_JWKS_URL ?? "http://localhost:4001/.well-known/jwks.json",
  AUTH_JWT_ISSUER: process.env.AUTH_JWT_ISSUER ?? "nexus-auth",
  AUTH_JWT_AUDIENCE: process.env.AUTH_JWT_AUDIENCE ?? "nexus",

  PROFILE_BASE_URL: process.env.PROFILE_BASE_URL ?? "http://localhost:4002",

  // Optional: comma-separated badge names to require for student event creation
  EVENT_REQUIRED_BADGE_NAMES: (process.env.EVENT_REQUIRED_BADGE_NAMES ?? "Team Player,Leadership,Innovation,Problem Solver,Research Excellence,Community Impact,Outstanding Presentation,Top Contributor")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};
