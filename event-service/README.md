# Nexus Event Service

Standalone microservice for events with college-scoped visibility, RBAC, moderation, and registration. Enforces student badge eligibility for event creation.

## Features
- **Event Management**: WORKSHOP, SEMINAR, HACKATHON, MEETUP types
- **Multi-Mode Support**: ONLINE, ONSITE, HYBRID events
- **Role-Based Access**: STUDENT, FACULTY, DEPT_ADMIN, HEAD_ADMIN via JWT
- **Badge Gating**: Students need required badges to create events
- **Moderation Workflow**: Approval, rejection, mentor assignment
- **Registration System**: Capacity enforcement with real-time updates
- **Department Visibility**: Flexible department-based access control
- **Real-time Notifications**: Socket.IO integration for live updates
- **Redis Caching**: Optional performance optimization (can be disabled)

## Environment Configuration

Copy `.env.example` to `.env` and configure:

### Required Settings
```bash
PORT=4004
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nexus?schema=eventsvc

# Auth Service Integration
AUTH_JWKS_URL=http://localhost:4001/.well-known/jwks.json
AUTH_JWT_ISSUER=nexus-auth
AUTH_JWT_AUDIENCE=nexus

# Profile Service Integration
PROFILE_BASE_URL=http://localhost:4002

# Badge Requirements (comma-separated)
EVENT_REQUIRED_BADGE_NAMES=Team Player,Leadership,Innovation,Problem Solver,Research Excellence,Community Impact,Outstanding Presentation,Top Contributor
```

### Optional Redis Configuration
```bash
# Redis for caching (optional)
REDIS_URL=redis://localhost:6379
REDIS_DISABLED=true  # Set to true to disable Redis entirely
```

## Installation & Setup

```bash
# Navigate to service directory
cd nexusbackend/event-service

# Install dependencies
npm install

# Generate Prisma client
npm run prisma:generate

# Run database migrations
npm run db:migrate

# Start development server
npm run dev
```

**Service URLs:**
- API: http://localhost:4004
- Swagger Documentation: http://localhost:4004/docs
- Health Check: http://localhost:4004/health

## API Endpoints

### Core Event Operations
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/v1/events` | List events (filtered by role/dept) | ✅ |
| GET | `/v1/events/:id` | Get event details | ✅ |
| POST | `/v1/events` | Create event (badge-gated for students) | ✅ |
| PUT | `/v1/events/:id` | Update event (owner/admin only) | ✅ |
| DELETE | `/v1/events/:id` | Delete event (owner/admin only) | ✅ |

### Registration Management
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/v1/events/:id/register` | Register for event | ✅ |
| DELETE | `/v1/events/:id/register` | Unregister from event | ✅ |

### Personal & Admin Operations
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/v1/events/mine` | My created/registered events | ✅ |
| GET | `/v1/events/eligibility` | Check badge eligibility | ✅ |
| PATCH | `/v1/events/:id/moderate` | Approve/reject/assign (admin) | ✅ Admin |
| GET | `/v1/events/:id/export` | Export registrations CSV | ✅ Faculty+ |

## Architecture Notes

- **Database**: PostgreSQL with dedicated `eventsvc` schema
- **Authentication**: JWT-based with NextAuth compatibility
- **Authorization**: Role-based with college-scoped data isolation
- **Caching**: Optional Redis for performance (graceful fallback)
- **Real-time**: Socket.IO for live notifications
- **API Documentation**: Auto-generated Swagger/OpenAPI docs

## Development

For detailed testing scenarios and Postman collections, see [`docs/postman-testing.md`](./docs/postman-testing.md).

### Prerequisites
- Node.js 18+
- PostgreSQL database
- Auth service running on port 4001
- Profile service running on port 4002
- Redis (optional, for caching)

### Troubleshooting
- Ensure PostgreSQL is accessible via `DATABASE_URL`
- Verify auth service JWKS endpoint is reachable
- Check profile service connectivity for badge validation
- Redis connection errors are non-fatal (service runs without cache)
