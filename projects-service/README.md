# Nexus Projects Service

Microservice for collaborative project management, student applications, task tracking, and file sharing with real-time WebSocket integration.

## 🚀 Features

- **Project Management**: Create and manage research projects with detailed requirements
- **Application System**: Student application workflow with status tracking
- **Collaboration Hub**: Real-time team workspace with tasks, comments, and file sharing
- **File Attachments**: Upload and share project files with progress tracking
- **WebSocket Integration**: Live updates for project changes and team activities
- **Role-Based Access**: Faculty project creation, student applications, admin moderation

## 🛠️ Installation & Setup

```bash
# Navigate to service directory
cd nexusbackend/projects-service

# Install dependencies
npm install

# Generate Prisma client
npm run prisma:generate

# Run database migrations
npm run db:migrate

# Start development server
npm run dev
```

## 🔧 Environment Configuration

Copy `.env.example` to `.env` and configure:

```bash
# Server Configuration
PORT=4003
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nexus?schema=projectsvc

# Auth Service Integration
AUTH_JWKS_URL=http://localhost:4001/.well-known/jwks.json
AUTH_JWT_ISSUER=nexus-auth
AUTH_JWT_AUDIENCE=nexus

# Profile Service Integration
PROFILE_BASE_URL=http://localhost:4002

# File Upload Configuration
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# WebSocket Configuration
SOCKET_IO_CORS_ORIGIN=http://localhost:3000

# Optional Redis Caching
REDIS_URL=redis://localhost:6379
REDIS_DISABLED=false
```

## 📊 Database Schema

### Core Models
- **Project**: Main project entity with metadata, requirements, and status
- **AppliedProject**: Student applications to projects with status tracking
- **ProjectTask**: Task management within projects
- **ProjectAttachment**: File attachments with metadata
- **Comment**: Discussion threads on projects and tasks

### Project Types
- **PROJECT**: General collaborative projects
- **RESEARCH**: Research-focused initiatives
- **PAPER_PUBLISH**: Publication-oriented projects
- **OTHER**: Custom project types

### Status Workflows
- **Moderation**: PENDING_APPROVAL → APPROVED/REJECTED
- **Progress**: OPEN → IN_PROGRESS → COMPLETED
- **Applications**: PENDING → ACCEPTED/REJECTED

## 🔗 API Endpoints

### Project Management
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/v1/projects` | List projects (filtered by role) | ✅ |
| GET | `/v1/projects/:id` | Get project details | ✅ |
| POST | `/v1/projects` | Create project | ✅ Faculty |
| PUT | `/v1/projects/:id` | Update project | ✅ Owner/Admin |
| DELETE | `/v1/projects/:id` | Delete project | ✅ Owner/Admin |

### Application Management
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/v1/projects/:id/applications` | Apply to project | ✅ Student |
| GET | `/v1/applications/mine` | My applications | ✅ Student |
| GET | `/v1/projects/:id/applications` | Project applications | ✅ Faculty |
| PUT | `/v1/applications/:id/status` | Update application status | ✅ Faculty |

### Collaboration Features
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/v1/projects/:id/tasks` | List project tasks | ✅ Member |
| POST | `/v1/projects/:id/tasks` | Create task | ✅ Member |
| PUT | `/v1/tasks/:id` | Update task | ✅ Member |
| DELETE | `/v1/tasks/:id` | Delete task | ✅ Member |

### File Management
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/v1/projects/:id/attachments` | List project files | ✅ Member |
| POST | `/v1/projects/:id/attachments` | Upload file | ✅ Member |
| DELETE | `/v1/attachments/:id` | Delete file | ✅ Uploader |

### Comments & Discussion
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/v1/projects/:id/comments` | Project comments | ✅ Member |
| POST | `/v1/projects/:id/comments` | Add comment | ✅ Member |
| GET | `/v1/tasks/:id/comments` | Task comments | ✅ Member |
| POST | `/v1/tasks/:id/comments` | Add task comment | ✅ Member |

## 🔄 Real-time Features

### WebSocket Events
- **project-update**: Project status/details changed
- **application-update**: Application status changed
- **task-update**: Task created/updated/completed
- **comment-added**: New comment posted
- **file-uploaded**: New file attachment

### Room-based Targeting
- **College Rooms**: `projects:{collegeId}`
- **Department Rooms**: `projects:{collegeId}:{department}`
- **Project Rooms**: `project:{projectId}`

### Authentication
WebSocket connections authenticated via JWT tokens with automatic reconnection and exponential backoff.

## 🎯 Project Workflow

### Faculty Project Creation
1. Faculty creates project with requirements and deadlines
2. Project enters moderation queue (if required)
3. Admin approves/rejects project
4. Approved projects visible to eligible students

### Student Application Process
1. Student browses project marketplace
2. Submits application with message
3. Faculty reviews applications
4. Application accepted/rejected with notifications
5. Accepted students join project collaboration

### Collaboration Phase
1. Project moves to IN_PROGRESS status
2. Team members access collaboration hub
3. Tasks created and assigned
4. Files shared and discussed
5. Real-time updates via WebSocket

## 🔐 Security & Authorization

### Role-Based Access
- **Students**: Apply to projects, participate in accepted projects
- **Faculty**: Create projects, manage applications, mentor teams
- **Admins**: Moderate projects, access all college data

### Data Isolation
- College-scoped project visibility
- Department-based filtering options
- Project membership validation for collaboration features

### File Security
- Cloudinary integration for secure file storage
- File type validation and size limits
- Access control based on project membership

## 📈 Performance Features

### Caching Strategy
- **Redis Caching**: User identity and profile data
- **Background Refresh**: Automatic cache invalidation
- **Graceful Fallback**: Service continues without cache

### Database Optimization
- **Indexed Queries**: Optimized for common access patterns
- **Pagination**: Cursor-based pagination for large datasets
- **Connection Pooling**: Efficient database connection management

## 🧪 Development

### Database Migrations
```bash
# Create migration
npx prisma migrate dev --name migration_name

# Deploy migrations
npx prisma migrate deploy

# Reset database (dev only)
npx prisma migrate reset
```

### WebSocket Testing
```bash
# Test WebSocket connection
npm run test:websocket

# Monitor WebSocket events
npm run dev:debug
```

### API Testing
See [POSTMAN_API_TESTING.md](./POSTMAN_API_TESTING.md) for comprehensive API testing scenarios.

## 🔍 Troubleshooting

### Common Issues
- **Database Connection**: Verify PostgreSQL schema `projectsvc` exists
- **JWT Validation**: Ensure auth service is running and accessible
- **WebSocket Connection**: Check CORS configuration for frontend domain
- **File Upload**: Verify Cloudinary credentials and network access

### Debug Logging
Enable detailed logging with:
```bash
NODE_ENV=development
DEBUG=projects:*
```

Logs include:
- JWT validation steps
- Database query performance
- WebSocket connection events
- File upload progress
- Cross-service API calls
