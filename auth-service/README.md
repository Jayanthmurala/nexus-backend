# Nexus Auth Service

Fastify + TypeScript + Prisma service issuing RS256 JWT access tokens and rotating httpOnly refresh tokens, exposing JWKS for verification.

## Quickstart

1. Copy `.env.example` to `.env` and fill DB + RSA keys. To generate keys fast:
   ```bash
   npx tsx scripts/generate-keys.ts
   ```
   Paste the printed AUTH_JWT_* values into `.env`.
2. Install deps and set up Prisma:
   ```bash
   npm i
   npx prisma generate
   npx prisma migrate dev --name init
   ```
3. Run the service:
   ```bash
   npm run dev
   ```

Note: Docker Compose in `nexusbackend/docker-compose.yml` is deprecated — run services directly.

## Endpoints

- GET /health
- GET /docs (OpenAPI UI)
- GET /.well-known/jwks.json
- POST /v1/auth/register { email, password, displayName }
- POST /v1/auth/login { email, password }
- POST /v1/auth/refresh (refresh from cookie "rt")
- POST /v1/auth/logout
- GET /v1/auth/me (requires Bearer access token)
- POST /v1/auth/oauth/exchange { provider: "google"|"github", accessToken }
- POST /v1/auth/forgot-password { email }
- POST /v1/auth/reset-password { token, password }
- POST /v1/auth/resend-verification { email }
- POST /v1/auth/verify-email { token }

## JWT
- Algorithm: RS256
- Claims: sub (user id), email, displayName, roles[], tokenVersion
- Issuer: `nexus-auth`, Audience: `nexus`

## Notes
- Passwords hashed with Argon2id
- Refresh tokens are rotating, stored as {id, secretHash} with expiry; cookie `rt` httpOnly
- Use Postgres CITEXT extension for case-insensitive emails
- Emails: if SMTP is not configured (`SMTP_HOST` empty), Ethereal is used in dev; responses include `debugUrl` and `debugPreviewUrl` for easy testing.

## Next Steps
- Publish user.created/updated events (RabbitMQ)
