# Nexus Network Service

Microservice for social networking features including posts, follows, messaging, and feeds with real-time capabilities.

## 🚀 Features

- **Social Posts**: Create and manage posts with visibility controls (PUBLIC/COLLEGE)
- **Follow System**: Build academic networks by following peers and faculty
- **Real-time Messaging**: Private messaging with typing indicators and online status
- **Feed Management**: Personalized feeds with following, college, and global scopes
- **Media Sharing**: Upload and share images and documents in posts
- **Post Interactions**: Like, bookmark, and comment on posts
- **User Discovery**: Find and connect with students and faculty

## 🛠️ Installation & Setup

```bash
# Navigate to service directory
cd nexusbackend/network-service

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
PORT=4005
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nexus?schema=networksvc

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
- **Post**: Social posts with content, visibility, and media attachments
- **Follow**: User follow relationships for network building
- **Message**: Private messaging between users
- **Conversation**: Message threads between users
- **PostLike**: Post interaction tracking
- **PostBookmark**: Saved posts functionality

### Post Visibility
- **PUBLIC**: Visible to all users across colleges
- **COLLEGE**: Visible only to users in the same college

## 🔗 API Endpoints

### Posts Management
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/v1/posts` | Get posts feed | ✅ |
| POST | `/v1/posts` | Create post | ✅ |
| PUT | `/v1/posts/:id` | Update post | ✅ Owner |
| DELETE | `/v1/posts/:id` | Delete post | ✅ Owner |
| POST | `/v1/posts/:id/like` | Like/unlike post | ✅ |
| POST | `/v1/posts/:id/bookmark` | Bookmark/unbookmark post | ✅ |

### Feed Management
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/v1/network/feed` | Get personalized feed | ✅ |
| GET | `/v1/network/trending` | Get trending posts | ✅ |
| GET | `/v1/network/bookmarks` | Get bookmarked posts | ✅ |

### Follow System
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/v1/network/follow/:userId` | Follow user | ✅ |
| DELETE | `/v1/network/follow/:userId` | Unfollow user | ✅ |
| GET | `/v1/network/followers/:userId` | Get user followers | ✅ |
| GET | `/v1/network/following/:userId` | Get user following | ✅ |
| GET | `/v1/network/suggestions` | Get follow suggestions | ✅ |

### Messaging
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/v1/messages/conversations` | Get conversations | ✅ |
| GET | `/v1/messages/:conversationId` | Get conversation messages | ✅ |
| POST | `/v1/messages` | Send message | ✅ |
| PUT | `/v1/messages/:id/read` | Mark message as read | ✅ |

### User Discovery
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/v1/network/users` | Search users | ✅ |
| GET | `/v1/network/directory` | User directory with filters | ✅ |

## 🔄 Real-time Features

### WebSocket Events
- **message-received**: New private message
- **typing-start/stop**: Typing indicators
- **user-online/offline**: Online status updates
- **post-created**: New post in feed
- **follow-update**: New follower notifications

### Room Management
- **User Rooms**: `user:{userId}` for personal notifications
- **Conversation Rooms**: `conversation:{conversationId}` for messaging
- **College Rooms**: `college:{collegeId}` for college-wide updates

## 🎯 Social Features

### Feed Algorithm
1. **Following Feed**: Posts from followed users (chronological)
2. **College Feed**: Posts from same college users (recent activity)
3. **Global Feed**: Public posts across all colleges (trending)

### Post Visibility Rules
- **PUBLIC**: Visible in global and college feeds
- **COLLEGE**: Visible only in college feed for same college users
- **Author**: Always visible in author's profile and following feed

### Messaging System
- **Real-time Delivery**: Instant message delivery via WebSocket
- **Read Receipts**: Track message read status
- **Typing Indicators**: Show when users are typing
- **Online Status**: Display user online/offline status

## 🔐 Security & Authorization

### Role-Based Access
- **All Users**: Create posts, follow others, send messages
- **College Scoping**: Users only see college-appropriate content
- **Privacy Controls**: Post visibility and messaging permissions

### Data Protection
- **Message Encryption**: Messages stored securely
- **Content Moderation**: Post content validation
- **Privacy Settings**: User-controlled visibility options

## 📈 Performance Features

### Caching Strategy
- **Feed Caching**: Redis caching for frequently accessed feeds
- **User Data**: Cached profile information for quick lookups
- **Message History**: Optimized message retrieval

### Real-time Optimization
- **Connection Pooling**: Efficient WebSocket connection management
- **Event Batching**: Optimized real-time event delivery
- **Presence Management**: Efficient online status tracking

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
# Test messaging system
npm run test:messaging

# Monitor real-time events
npm run dev:debug
```

### API Documentation
Access interactive API docs at: http://localhost:4005/docs

## 🔍 Troubleshooting

### Common Issues
- **Database Connection**: Verify PostgreSQL schema `networksvc` exists
- **WebSocket Connection**: Check CORS configuration for frontend
- **File Upload**: Verify Cloudinary credentials for media uploads
- **Real-time Features**: Ensure Redis is running for optimal performance

### Debug Logging
Enable detailed logging:
```bash
NODE_ENV=development
DEBUG=network:*
```

Includes:
- WebSocket connection events
- Message delivery tracking
- Feed generation performance
- User interaction analytics

