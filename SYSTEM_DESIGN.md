# Nexus Backend System Design

This document summarizes the backend system design and data schemas across services in one place for quick onboarding and review.

- Services covered: `auth-service`, `profile-service`, `projects-service`, `event-service`.
- Datastore: PostgreSQL (one DB per service), modeled with Prisma.
- Communication: REST over HTTP. Frontend authenticates via bearer token; refresh via HttpOnly cookie.

## Architecture Overview
- AuthN/AuthZ and identity are centralized in `auth-service`.
- Domain data is owned by feature services:
  - `profile-service`: user profile, colleges, personal projects, publications, badges.
  - `projects-service`: collaborative projects, applications, tasks, attachments, comments.
  - `event-service`: events, registrations, moderation, CSV export.
- Cross-service linkage uses shared identifiers (e.g., `userId`, `projectId`, `eventId`) as strings; no cross-DB FK constraints.

```
Frontend (Next.js) ────────► Service APIs (REST)
        ▲                          ▲
        │                          │
 NextAuth session            Bearer token (access),
 (JWT) + refresh cookie      refresh via auth-service
```

## Security & Authorization
- Roles (from `auth-service`): `STUDENT`, `FACULTY`, `DEPT_ADMIN`, `PLACEMENTS_ADMIN`, `HEAD_ADMIN`.
- Typical capabilities (enforced by each service):
  - Students: manage own profile, apply to projects, register for events.
  - Faculty: manage profile/publications, create projects/events.
  - Admins: moderate projects/events, award badges, export registrations.
- Token model:
  - Access token (bearer) returned on login/registration/OAuth exchange.
  - Refresh token stored as HttpOnly cookie; `POST /v1/auth/refresh` rotates access token.

---

# Prisma Schemas by Service (Concise)

## auth-service (`auth-service/prisma/schema.prisma`)

- Enums
  - `Role`: STUDENT, FACULTY, DEPT_ADMIN, PLACEMENTS_ADMIN, HEAD_ADMIN
  - `UserStatus`: PENDING_VERIFICATION, ACTIVE, SUSPENDED, DELETED
  - `TokenType`: EMAIL_VERIFICATION, PASSWORD_RESET, REFRESH_TOKEN

- Models
  - `User`
    - Fields: `id`, `email (unique citext)`, `emailVerifiedAt?`, `passwordHash?`, `displayName`, `avatarUrl?`, `roles Role[]`, `status`, `tokenVersion`, `lastLoginAt?`, timestamps, `deletedAt?`
    - Relations: `preferences (UserPreference?)`, `accounts (OAuthAccount[])`, `securityTokens (SecurityToken[])`
    - Indexes: `(status)`, `(emailVerifiedAt)`
  - `OAuthAccount`
    - Fields: `id`, `userId`, `provider`, `providerAccountId`, `accessToken?`, `refreshToken?`, `expiresAt?`
    - Constraints: unique `(provider, providerAccountId)`
    - Indexes: `(userId)`
  - `SecurityToken`
    - Fields: `id`, `userId`, `tokenHash (unique)`, `type`, `expiresAt`, `usedAt?`, `createdAt`
    - Indexes: `(userId, type, expiresAt)`
  - `UserPreference`
    - Fields: `userId (PK)`, notification toggles, `timezone`, `locale`

## profile-service (`profile-service/prisma/schema.prisma`)

- Models
  - `College`
    - Fields: `id`, `name (unique)`, `createdAt`
    - Relations: `profiles (Profile[])`
  - `Profile`
    - Fields: `id`, `userId (unique)`, `collegeId`, `department`, `year?`, arrays `skills`, `expertise`, links (`linkedIn?`, `github?`, `twitter?`), `resumeUrl?`, `bio?`, `avatar?`, `contactInfo?`, `collegeMemberId?`, timestamps
    - Relations: `college (College)`, `publications (Publication[])`, `personalProjects (PersonalProject[])`, `studentBadges (StudentBadge[])`
    - Indexes: `(collegeId, department, year)`
  - `Publication`
    - Fields: `id`, `userId`, `title`, `link?`, `year`, `createdAt`
    - Relation: `profile (Profile by userId)`
    - Indexes: `(userId)`, `(year)`
  - `PersonalProject`
    - Fields: `id`, `userId`, `title`, `description`, `github?`, `demoLink?`, `image?`, `createdAt`
    - Relation: `profile (Profile by userId)`
    - Indexes: `(userId)`
  - `BadgeDefinition`
    - Fields: `id`, `name`, `description`, `icon?`, `color?`, `category?`, `rarity (string)`, `criteria?`, `createdAt`, `createdBy?`
    - Relations: `awards (StudentBadge[])`
  - `StudentBadge`
    - Fields: `id`, `studentId`, `badgeId`, `awardedBy`, `awardedByName?`, `reason`, `awardedAt`, `projectId?`, `eventId?`
    - Relations: `badge (BadgeDefinition)`, `student (Profile by userId)`
    - Indexes: `(studentId)`, `(badgeId)`, `(awardedBy)`, `(awardedAt)`

## projects-service (`projects-service/prisma/schema.prisma`)

- Enums
  - `ProjectType`: PROJECT, RESEARCH, PAPER_PUBLISH, OTHER
  - `ModerationStatus`: PENDING_APPROVAL, APPROVED, REJECTED
  - `ProgressStatus`: OPEN, IN_PROGRESS, COMPLETED
  - `ApplicationStatus`: PENDING, ACCEPTED, REJECTED
  - `TaskStatus`: TODO, IN_PROGRESS, DONE

- Models
  - `Project`
    - Fields: identity/ownership (`id`, `collegeId`, `authorId`, `authorName`, `authorAvatar?`), content (`title`, `description`, `projectDuration?`), classification arrays (`skills`, `departments`, `tags`, `requirements`, `outcomes`), visibility (`visibleToAllDepts`), lifecycle (`projectType`, `moderationStatus`, `progressStatus`, `maxStudents`, `deadline?`, `archivedAt?`), timestamps
    - Relations: `applications (AppliedProject[])`, `tasks (ProjectTask[])`, `attachments (ProjectAttachment[])`, `comments (Comment[])`
    - Indexes: `(collegeId)`, `(authorId)`, `(projectType)`, `(moderationStatus)`, `(progressStatus)`, `(createdAt)`
  - `AppliedProject`
    - Fields: `id`, `projectId`, `studentId`, `studentName`, `studentDepartment`, `status`, `message?`, `appliedAt`
    - Constraints: unique `(projectId, studentId)`
    - Indexes: `(projectId)`, `(studentId)`, `(status)`
  - `ProjectTask`
    - Fields: `id`, `projectId`, `title`, `assignedToId?`, `status`, `createdAt`
    - Indexes: `(projectId)`, `(assignedToId)`, `(status)`
  - `ProjectAttachment`
    - Fields: `id`, `projectId`, `uploaderId`, `fileName`, `fileUrl`, `fileType`, `createdAt`
    - Indexes: `(projectId)`, `(uploaderId)`
  - `Comment`
    - Fields: `id`, `projectId`, `taskId?`, `authorId`, `authorName`, `body`, `createdAt`, `updatedAt`
    - Indexes: `(projectId)`, `(taskId)`, `(authorId)`

## event-service (`event-service/prisma/schema.prisma`)

- Enums
  - `EventType`: WORKSHOP, SEMINAR, HACKATHON, MEETUP
  - `EventMode`: ONLINE, ONSITE, HYBRID
  - `ModerationStatus`: PENDING_REVIEW, APPROVED, REJECTED

- Models
  - `Event`
    - Fields: identity/ownership (`id`, `collegeId`, `authorId`, `authorName`, `authorRole`), content (`title`, `description`), schedule (`startAt`, `endAt`), classification (`type`, `mode`, `departments[]`, `tags[]`), logistics (`location?`, `meetingUrl?`, `capacity?`), visibility (`visibleToAllDepts`), moderation (`moderationStatus`, `monitorId?`, `monitorName?`), lifecycle (`archivedAt?`), timestamps
    - Relations: `registrations (EventRegistration[])`
    - Indexes: `(collegeId)`, `(type)`, `(startAt)`, `(moderationStatus)`, `(createdAt)`
  - `EventRegistration`
    - Fields: `id`, `eventId`, `userId`, `joinedAt`
    - Constraints: unique `(eventId, userId)`
    - Indexes: `(eventId)`, `(userId)`

---

# Cross-Service Relationships
- `userId` originates in `auth-service` and is referenced across profile, projects, events.
- `StudentBadge.projectId` and `.eventId` can reference resources in other services by string ID.
- Referential integrity across services is enforced at the application layer (no cross-DB FKs).

# Core Flows (High-Level)

- Login (email/password)
  1. Client calls `POST /v1/auth/login` (auth-service).
  2. Response: access token (bearer). Refresh token set as HttpOnly cookie.
  3. Client attaches bearer to subsequent service calls.

- OAuth exchange
  1. Client signs in with provider; receives provider tokens.
  2. Client calls `POST /v1/auth/oauth/exchange` to obtain backend access token + refresh cookie.

- Token refresh
  1. On 401, client calls `POST /v1/auth/refresh` (auth-service) with cookie.
  2. Receives new access token; retries original request.

- Project application
  1. Student calls `POST /v1/projects/:id/applications`.
  2. Backend enforces uniqueness and eligibility; creates `AppliedProject`.
  3. Owner/admin can update status via `PUT /v1/applications/:id/status`.

- Event registration
  1. Student calls `POST /v1/events/:id/register`.
  2. Backend enforces capacity/uniqueness; creates `EventRegistration`.
  3. CSV export via `GET /v1/events/:id/export` (authorized roles only).

- Badges (award)
  1. Admin/staff calls `POST /v1/badges/awards` with `studentId`, `badgeId`, reason.
  2. Record persisted as `StudentBadge`; visible in profile contexts.

# Indexing & Performance Notes
- Critical indexes exist on status fields, ownership IDs, and time fields across services to support common queries.
- Use server-side pagination envelopes in listing endpoints (projects/events).

# Configuration & Environments
- Each service config
  - Prisma datasource: `DATABASE_URL` (PostgreSQL)
  - Some services enable Postgres `citext` extension for case-insensitive fields.
- Typical frontend base URLs (for reference):
  - `NEXT_PUBLIC_API_BASE_URL` (auth-service)
  - `NEXT_PUBLIC_PROFILE_API_BASE_URL`
  - `NEXT_PUBLIC_PROJECTS_API_BASE_URL`
  - `NEXT_PUBLIC_EVENTS_API_BASE_URL`

# Future Enhancements
- Centralized authorization policy docs (mapping endpoints to roles).
- Audit trails for sensitive operations (awards, moderation).
- Soft-delete strategies and archival policies across services.
- Async notifications for project/application and event changes.
