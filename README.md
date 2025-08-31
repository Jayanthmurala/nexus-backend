# Nexus Backend Services

Microservices architecture for the Nexus Academic Collaboration Platform. Each service is independently deployable and manages its own domain.

## 🏗️ Architecture Overview

```
Frontend (Next.js) ──────────► Service APIs (REST)
        ▲                          ▲
        │                          │
 NextAuth session            Bearer token (access),
 (JWT) + refresh cookie      refresh via auth-service
```

## 🚀 Services

| Service | Port | Purpose | Status |
|---------|------|---------|--------|
| **auth-service** | 4001 | Authentication, authorization, JWT management | ✅ Active |
| **profile-service** | 4002 | User profiles, badges, publications, personal projects | ✅ Active |
| **projects-service** | 4003 | Project management, applications, collaboration | ✅ Active |
| **event-service** | 4004 | Event creation, registration, moderation | ✅ Active |
| **network-service** | 4005 | Social features, messaging, feeds | ✅ Active |

## 🛠️ Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL database
- Redis (optional, for caching)

### Development Setup

1. **Install Dependencies**
```bash
cd nexusbackend
npm install
npm run install:backend
```

2. **Generate Prisma Clients**
```bash
npm run prisma:generate:all
```

3. **Setup Databases**
Each service needs its own schema in PostgreSQL:
- `authsvc` - Auth service
- `profilesvc` - Profile service  
- `projectsvc` - Projects service
- `eventsvc` - Event service
- `networksvc` - Network service

4. **Start All Services**
```bash
npm run dev:all
```

Or start individual services:
```bash
# Individual service startup
cd auth-service && npm run dev
cd profile-service && npm run dev
cd projects-service && npm run dev
cd event-service && npm run dev
cd network-service && npm run dev
```

## 📊 Database Architecture

- **Database**: PostgreSQL with separate schemas per service
- **ORM**: Prisma with code-first migrations
- **Relationships**: Cross-service via string IDs (no FK constraints)
- **Caching**: Redis for performance optimization

## 🔐 Security Model

### Authentication Flow
1. Client authenticates via auth-service
2. Receives RS256 JWT access token + HttpOnly refresh cookie
3. Access token used as Bearer token for service requests
4. Refresh token rotated on each refresh

### Authorization
- **Role-Based Access Control**: STUDENT, FACULTY, DEPT_ADMIN, PLACEMENTS_ADMIN, HEAD_ADMIN
- **College-Scoped Data**: Users only access data from their college
- **Service-Level Enforcement**: Each service validates JWT and enforces permissions

## 🔧 Configuration

Each service requires environment configuration. See individual service README files for details.

### Common Environment Variables
```bash
# Database (per service)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nexus?schema={servicename}

# Auth Integration
AUTH_JWKS_URL=http://localhost:4001/.well-known/jwks.json
AUTH_JWT_ISSUER=nexus-auth
AUTH_JWT_AUDIENCE=nexus

# Redis (optional)
REDIS_URL=redis://localhost:6379
REDIS_DISABLED=false
```

## 📖 Service Documentation

- [Auth Service](./auth-service/README.md) - Authentication & user management
- [Profile Service](./profile-service/README.md) - User profiles & badges
- [Projects Service](./projects-service/README.md) - Project collaboration
- [Event Service](./event-service/README.md) - Event management
- [Network Service](./network-service/README.md) - Social networking

## 🎯 Development Scripts

```bash
# Install all service dependencies
npm run install:backend

# Generate all Prisma clients
npm run prisma:generate:all

# Start all services in development
npm run dev:all

# Individual service commands
npm run dev:auth
npm run dev:profile
npm run dev:projects
npm run dev:events
npm run dev:network
```

## 🔄 Data Flow Examples

### Project Application Flow
1. Student applies via projects-service
2. Faculty receives notification via WebSocket
3. Application status updated in real-time
4. Badge awarded via profile-service on completion

### Event Registration Flow
1. Event created via event-service (badge-gated for students)
2. Registration opens with capacity management
3. Real-time updates via Socket.IO
4. CSV export for administrators

## 🚀 Deployment Notes

- Each service is independently deployable
- No Docker Compose (deprecated) - run services directly
- Environment-specific configuration per service
- Database migrations handled per service via Prisma

## 🤝 Contributing

1. Follow microservice boundaries - don't cross-reference databases
2. Use string IDs for cross-service relationships
3. Implement proper JWT validation in each service
4. Add comprehensive error handling and logging
5. Update API documentation when adding endpoints

## 📄 System Design

For detailed architecture and data schemas, see [SYSTEM_DESIGN.md](./SYSTEM_DESIGN.md).
