# Nexus Auth Service

Fastify + TypeScript + Prisma service issuing RS256 JWT access tokens and rotating httpOnly refresh tokens, exposing JWKS for verification.

## Quickstart

1. Copy `.env.example` to `.env` and fill DB + RSA keys.
2. Install deps and generate Prisma:
   ```bash
   npm i
   npx prisma generate
   npx prisma migrate dev --name init
   npm run dev
   ```
3. Or with Docker Compose (requires RSA keys exported as env):
   ```bash
   docker compose up --build
   ```

## Endpoints

- GET /health
- GET /docs (OpenAPI UI)
- GET /.well-known/jwks.json
- POST /v1/auth/register { email, password, displayName }
- POST /v1/auth/login { email, password }
- POST /v1/auth/refresh (refresh from cookie)
- POST /v1/auth/logout
- GET /v1/auth/me (dev helper)

## JWT
- Algorithm: RS256
- Claims: sub, email, name, picture, roles[], tv (tokenVersion)
- Issuer: `nexus-auth`, Audience: `nexus`

## Notes
- Passwords hashed with Argon2id
- Refresh tokens are rotating, stored as {id, secretHash} with expiry; cookie `rt` httpOnly
- Use Postgres CITEXT extension for case-insensitive emails

## Next Steps
- Email verification + password reset flows
- OAuth (Google/GitHub) via `OAuthAccount`
- Publish user.created/updated events (RabbitMQ)
