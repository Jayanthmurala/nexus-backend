import dotenv from "dotenv";

dotenv.config();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: Number(process.env.PORT ?? 4001),
  DATABASE_URL: requireEnv("DATABASE_URL"),
  
  // Support keys stored in .env with escaped newlines ("\n")
  AUTH_JWT_PRIVATE_KEY: requireEnv("AUTH_JWT_PRIVATE_KEY").replace(/\\n/g, "\n"),
  AUTH_JWT_PUBLIC_KEY: requireEnv("AUTH_JWT_PUBLIC_KEY").replace(/\\n/g, "\n"),
  AUTH_JWT_KID: process.env.AUTH_JWT_KID ?? "auth-key-1",
  AUTH_JWT_ISSUER: process.env.AUTH_JWT_ISSUER ?? "nexus-auth",
  AUTH_JWT_AUDIENCE: process.env.AUTH_JWT_AUDIENCE ?? "nexus",
  AUTH_JWT_ACCESS_EXPIRES_IN: process.env.AUTH_JWT_ACCESS_EXPIRES_IN ?? "15m",
  AUTH_JWT_REFRESH_EXPIRES_IN: process.env.AUTH_JWT_REFRESH_EXPIRES_IN ?? "30d",

  COOKIE_DOMAIN: process.env.COOKIE_DOMAIN ?? "",

  // Frontend origin for building verification/reset URLs
  FRONTEND_URL: process.env.FRONTEND_URL ?? "http://localhost:3000",

  // One-time token expirations
  EMAIL_VERIFICATION_EXPIRES_IN: process.env.EMAIL_VERIFICATION_EXPIRES_IN ?? "24h",
  PASSWORD_RESET_EXPIRES_IN: process.env.PASSWORD_RESET_EXPIRES_IN ?? "1h",

  // Mailing configuration
  APP_NAME: process.env.APP_NAME ?? "Nexus",
  EMAIL_FROM: process.env.EMAIL_FROM ?? "Nexus <no-reply@localhost>",
  SUPPORT_EMAIL: process.env.SUPPORT_EMAIL ?? "support@localhost",
  SMTP_HOST: process.env.SMTP_HOST ?? "",
  SMTP_PORT: Number(process.env.SMTP_PORT ?? 587),
  SMTP_SECURE: /^(true|1)$/i.test(String(process.env.SMTP_SECURE ?? "false")),
  SMTP_USER: process.env.SMTP_USER ?? "",
  SMTP_PASS: process.env.SMTP_PASS ?? "",
};
