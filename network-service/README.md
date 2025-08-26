# Network Service

Fastify + Zod + Prisma service for posts, follows, connections, ads, and feed APIs.

## Getting started

1. Copy .env.example to .env and set DATABASE_URL (schema=networksvc) and secrets
2. Install deps and generate Prisma client

```
npm i
npm run prisma:generate
```

3. Run DB migration to create schema/tables

```
npm run db:migrate
```

4. Start in dev

```
npm run dev
```

Docs at http://localhost:4005/docs

