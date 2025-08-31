# Nexus Profile Service

Microservice managing user profiles, badges, publications, and personal projects with college-scoped data access.

## 🚀 Features

- **User Profiles**: Comprehensive academic profiles with bio, skills, social links
- **Badge System**: Achievement tracking with rarity levels and award management
- **Publications**: Faculty publication management with year-based organization
- **Personal Projects**: Student project showcase with GitHub/demo links
- **College Integration**: Multi-college support with department-based filtering
- **Role-Based Access**: Different profile sections for students vs faculty

## 🛠️ Installation & Setup

```bash
# Navigate to service directory
cd nexusbackend/profile-service

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
PORT=4002
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nexus?schema=profilesvc

# Auth Service Integration
AUTH_JWKS_URL=http://localhost:4001/.well-known/jwks.json
AUTH_JWT_ISSUER=nexus-auth
AUTH_JWT_AUDIENCE=nexus

# Optional Redis Caching
REDIS_URL=redis://localhost:6379
REDIS_DISABLED=false
```

## 📊 Database Schema

### Core Models
- **College**: Institution data with unique names
- **Profile**: User profile data linked to auth service users
- **Publication**: Faculty research publications with links and years
- **PersonalProject**: Student project showcase with GitHub/demo links
- **BadgeDefinition**: Badge templates with rarity and criteria
- **StudentBadge**: Badge awards with reason and context

### Key Relationships
- Profile ↔ College (many-to-one)
- Profile ↔ Publications (one-to-many)
- Profile ↔ PersonalProjects (one-to-many)
- Profile ↔ StudentBadges (one-to-many)
- BadgeDefinition ↔ StudentBadges (one-to-many)

## 🔗 API Endpoints

### Profile Management
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/v1/profile/me` | Get my profile | ✅ |
| PUT | `/v1/profile/me` | Update my profile | ✅ |
| GET | `/v1/profile/:userId` | Get user profile | ✅ |
| GET | `/v1/profile/user/:userId` | Enhanced profile with auth data | ✅ |

### Publications (Faculty)
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/v1/profile/me/publications` | My publications | ✅ Faculty |
| POST | `/v1/profile/publications` | Create publication | ✅ Faculty |
| PUT | `/v1/profile/publications/:id` | Update publication | ✅ Faculty |
| DELETE | `/v1/profile/publications/:id` | Delete publication | ✅ Faculty |
| GET | `/v1/profile/publications/:userId` | User publications | ✅ |

### Personal Projects (Students)
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/v1/profile/me/projects` | My projects | ✅ Student |
| POST | `/v1/profile/projects` | Create project | ✅ Student |
| PUT | `/v1/profile/projects/:id` | Update project | ✅ Student |
| DELETE | `/v1/profile/projects/:id` | Delete project | ✅ Student |
| GET | `/v1/profile/projects/:userId` | User projects | ✅ |

### Badge System
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/v1/badges/definitions` | List badge definitions | ✅ |
| POST | `/v1/badges/definitions` | Create badge definition | ✅ Faculty+ |
| GET | `/v1/badges/recent` | Recent badge awards | ✅ Faculty+ |
| POST | `/v1/badges/awards` | Award badge to student | ✅ Faculty+ |
| GET | `/v1/badges/export` | Export badges CSV | ✅ Admin |
| GET | `/v1/profile/badges/:userId` | User badges | ✅ |

### Administrative
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/v1/profiles` | List profiles (filtered) | ✅ Admin |
| GET | `/v1/colleges` | List colleges | ✅ |

## 🏆 Badge System

### Badge Rarity Levels
- **Common**: Basic achievements (blue theme)
- **Rare**: Notable accomplishments (green theme)
- **Epic**: Significant achievements (purple theme)
- **Legendary**: Exceptional accomplishments (gold theme)

### Default Badge Definitions
The service includes 8 default badges required for student event creation:
1. Team Player
2. Leadership
3. Innovation
4. Problem Solver
5. Research Excellence
6. Community Impact
7. Outstanding Presentation
8. Top Contributor

### Badge Award Context
Badges can be awarded in context of:
- **Projects**: Linked to specific project IDs
- **Events**: Linked to specific event IDs
- **General**: Standalone achievements

## 🔐 Security & Authorization

### Role-Based Access
- **Students**: Manage own profile, view others, create personal projects
- **Faculty**: Full profile access, publication management, badge awarding
- **Admins**: User management, badge definitions, data export

### Data Isolation
- College-scoped data access
- Profile ownership validation
- Cross-service user identity verification

## 🎯 Integration Points

### Auth Service Integration
- JWT validation via JWKS endpoint
- User identity resolution
- Role-based authorization

### Cross-Service References
- Badge awards reference project/event IDs from other services
- Profile data consumed by other services via API calls
- College member ID used as primary student identifier

## 📈 Performance Features

- **Redis Caching**: Optional caching for frequently accessed data
- **Indexed Queries**: Optimized database queries with proper indexing
- **Pagination**: Cursor-based pagination for large datasets
- **Lazy Loading**: Efficient data loading patterns

## 🧪 Development

### Database Migrations
```bash
# Create new migration
npx prisma migrate dev --name migration_name

# Reset database (development only)
npx prisma migrate reset

# Deploy migrations (production)
npx prisma migrate deploy
```

### Testing
```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage
```

## 🔍 Troubleshooting

### Common Issues
- **Database Connection**: Verify PostgreSQL is running and accessible
- **JWT Validation**: Ensure auth service JWKS endpoint is reachable
- **Redis Connection**: Non-fatal if Redis is unavailable (graceful fallback)
- **College Data**: Ensure college records exist before creating profiles

### Debug Logging
Set `NODE_ENV=development` for detailed logging of:
- JWT validation steps
- Database queries
- Cross-service API calls
- Cache operations
