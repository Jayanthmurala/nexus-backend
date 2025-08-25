# Nexus Event Service

Standalone microservice for events with college-scoped visibility, RBAC, moderation, and registration. Enforces student badge eligibility for event creation.

## Features
- Event types: WORKSHOP, SEMINAR, HACKATHON, MEETUP
- Modes: ONLINE, ONSITE, HYBRID
- RBAC via JWT (NextAuth-compatible): STUDENT, FACULTY, DEPT_ADMIN, HEAD_ADMIN
- Student creation gated by required badges (from profile-service)
- Moderation (Dept Admin, Head Admin): approve, reject, assign monitor
- Registration with strict capacity enforcement
- Department visibility: visibleToAllDepts + departments[]

## Env
Copy `.env.example` to `.env` and adjust as needed:
- PORT: default 4004
- DATABASE_URL: include `?schema=eventsvc` (dedicated schema)
- AUTH_*: JWKS, issuer, audience
- PROFILE_BASE_URL: profile-service URL
- EVENT_REQUIRED_BADGE_NAMES: comma-separated list

## Install & Run
```bash
# from nexusbackend/event-service
npm install
npm run prisma:generate
npm run db:migrate
npm run dev
```

Swagger docs: http://localhost:4004/docs

## Endpoints (prefix: /v1)
- GET `/events` list (students see approved + dept-allowed)
- GET `/events/:id` get by id (visibility rules)
- POST `/events` create (students require all badges)
- PUT `/events/:id` update (students own + pending; faculty/admin within college)
- PATCH `/events/:id/moderate` approve/reject/assign (DEPT_ADMIN, HEAD_ADMIN)
- POST `/events/:id/register` register (capacity enforced)
- DELETE `/events/:id/register` unregister
- GET `/events/mine` my events (students: authored or registered)
- GET `/events/eligibility` returns { canCreate, missingBadges }

## Notes
- Data isolation by `collegeId` from profile-service `GET /v1/profile/me`.
- Uses Prisma client; tables created via `scripts/migrate.ts` in `eventsvc` schema.
- For local dev ensure Postgres is running and reachable by DATABASE_URL.
