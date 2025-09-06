# Feed and Posts API Documentation

## Overview
The Network Service provides comprehensive feed and post management APIs for the Nexus platform. This service handles social media-style posts, feeds, media uploads, user interactions, and content moderation.

## Table of Contents
- [Post Types](#post-types)
- [Visibility Rules](#visibility-rules)
- [Feed Endpoints](#feed-endpoints)
- [Post Management](#post-management)
- [Media Upload](#media-upload)
- [User Interactions](#user-interactions)
- [Admin & Moderation](#admin--moderation)
- [Authentication & Authorization](#authentication--authorization)
- [Data Models](#data-models)
- [Error Handling](#error-handling)
- [Examples](#examples)

## Post Types

The system supports 8 different post types, each with specific data structures and role-based permissions:

### 1. GENERAL *(All Roles)*
Basic text/media posts for general sharing.
**Permissions:** Students, Faculty, Admin
```json
{
  "type": "GENERAL",
  "content": "Your post content here",
  "visibility": "PUBLIC"
}
```

### 2. PROJECT_UPDATE *(All Roles)*
Project milestone and progress updates.
**Permissions:** Students, Faculty, Admin
```json
{
  "type": "PROJECT_UPDATE",
  "content": "Project update description",
  "projectData": {
    "projectTitle": "My Awesome Project",
    "milestone": "MVP Complete",
    "progress": 75,
    "teamMembers": ["user1", "user2"],
    "githubUrl": "https://github.com/user/project",
    "demoUrl": "https://demo.example.com",
    "techStack": ["React", "Node.js", "MongoDB"]
  }
}
```

### 3. COLLABORATION *(All Roles)*
Collaboration requests and team formation.
**Permissions:** Students, Faculty, Admin
```json
{
  "type": "COLLABORATION",
  "content": "Looking for team members",
  "collaborationData": {
    "requiredSkills": ["React", "Python", "UI/UX"],
    "capacity": 3,
    "deadline": "2024-12-31T23:59:59Z",
    "applyInApp": true,
    "applyLink": "https://forms.google.com/..."
  }
}
```

### 4. EVENT *(Faculty/Admin Only)*
Event announcements and invitations.
**Permissions:** Faculty, Admin (NOT Students)
```json
{
  "type": "EVENT",
  "content": "Join our workshop!",
  "eventData": {
    "title": "React Workshop",
    "date": "2024-12-15T14:00:00Z",
    "location": "Room 101, CS Building",
    "type": "workshop",
    "registrationRequired": true,
    "capacity": 50,
    "registrationUrl": "https://events.college.edu/register"
  }
}
```

### 5. JOB_POSTING *(Faculty/Admin Only)*
Job opportunities and internship postings.
**Permissions:** Faculty, Admin (NOT Students)
```json
{
  "type": "JOB_POSTING",
  "content": "Exciting opportunity at TechCorp",
  "jobData": {
    "title": "Software Engineer Intern",
    "company": "TechCorp Inc.",
    "location": "San Francisco, CA",
    "type": "internship",
    "deadline": "2024-12-01T23:59:59Z",
    "applyUrl": "https://techcorp.com/careers/123",
    "salaryRange": "$80k - $120k"
  }
}
```

### 6. BADGE_AWARD *(Faculty/Admin Only)*
Badge achievements and recognitions.
**Permissions:** Faculty, Admin (NOT Students)
  "adData": {
    "title": "Premium Coding Bootcamp",
    "bannerUrl": "https://cdn.example.com/ad-banner.jpg",
    "ctaText": "Learn More",
    "ctaUrl": "https://bootcamp.example.com/enroll",
    "sponsored": true,
    "impressionGoal": 10000,
    "targetAudience": ["student", "faculty"]
  }
}
```

## Visibility Rules

### PUBLIC
- Visible to all users (authenticated and unauthenticated)
- Appears in global feeds
- No restrictions

### COLLEGE
- Visible only to users from the same college
- Requires authentication
- Author and viewer must share the same `collegeId`

### PRIVATE
- Visible only to the author
- Not implemented in current version

## API Endpoints

### Feed Endpoints

#### GET /v1/feed
Retrieve posts for the user's feed with filtering and pagination.

**Query Parameters:**
- `scope` (optional): `global` | `college` | `following` (default: `global`)
- `cursor` (optional): Pagination cursor for next page
- `limit` (optional): Number of posts to return (default: 20, max: 50)
- `postTypes` (optional): Comma-separated list of post types to filter
- `search` (optional): Search term for content filtering
- `authorId` (optional): Filter posts by specific author

**Authentication:** Optional (affects visibility and user-specific data)
- Uses user's `collegeId` from profile service

#### Following Scope
- Shows posts from users you follow
- Respects visibility rules (PUBLIC + COLLEGE if same college)
- Requires authentication
- Returns empty if not following anyone

**Response:**
```json
{
  "items": [PostResponse],
  "nextCursor": "post_id_123",
  "hasMore": true
}
```

## Post Management

### POST /v1/posts/specialized
Create a new post with type-specific data.

**Authentication:** Required
**Body:** `CreatePostRequest`

**Validation Rules:**
- `type` is required and must be valid PostType
- `content` is optional but recommended
- `visibility` defaults to PUBLIC
- Type-specific data validated based on post type
- Media files must be pre-uploaded and owned by user

### GET /v1/posts/:postId
Retrieve a single post by ID.

**Authentication:** Optional
**Response:** `PostResponse` with user interaction flags

### PUT /v1/posts/:postId
Update an existing post (author only).

**Authentication:** Required
**Authorization:** Must be post author
**Body:** Partial `CreatePostRequest`

### DELETE /v1/posts/:postId
Delete a post (author only).

**Authentication:** Required
**Authorization:** Must be post author

## Media Upload

### POST /v1/media/upload
Upload media files for use in posts.

**Authentication:** Required
**Content-Type:** `multipart/form-data`
**Body:** File upload with form field `file`

**Supported Formats:**
- Images: JPEG, PNG, GIF, WebP
- Videos: MP4, WebM
- Documents: PDF (limited support)

**File Size Limits:**
- Images: 10MB
- Videos: 50MB
- Documents: 5MB

**Response:**
```json
{
  "id": "media_123",
  "url": "/uploads/media_123.jpg",
  "mimeType": "image/jpeg",
  "sizeBytes": 1024000,
  "width": 1920,
  "height": 1080
}
```

**Usage in Posts:**
```json
{
  "type": "GENERAL",
  "content": "Check out this image!",
  "mediaIds": ["media_123", "media_456"]
}
```

## User Interactions

### POST /v1/posts/:postId/like
Toggle like status on a post.

**Authentication:** Required
**Response:**
```json
{
  "ok": true,
  "liked": true,
  "likeCount": 42
}
```

### DELETE /v1/posts/:postId/like
Unlike a post (same as POST, toggles status).

### POST /v1/posts/:postId/bookmark
Toggle bookmark status on a post.

**Authentication:** Required
**Response:**
```json
{
  "bookmarked": true
}
```

### Comments (Not Implemented)
Comment endpoints return 501 status:
- `POST /v1/posts/:postId/comments`
- `GET /v1/posts/:postId/comments`
- `PUT /v1/posts/:postId/comments/:commentId`
- `DELETE /v1/posts/:postId/comments/:commentId`

## Admin & Moderation

### GET /v1/admin/stats
Get admin dashboard statistics.

**Authentication:** Required
**Authorization:** Admin roles only
**Response:** Platform statistics and metrics

### GET /v1/admin/flagged
Get flagged content for review.

**Authentication:** Required
**Authorization:** Admin roles only

### POST /v1/admin/moderate/:postId
Moderate a specific post.

**Authentication:** Required
**Authorization:** Admin roles only
**Body:**
```json
{
  "action": "hide|delete|approve|flag",
  "reason": "Violation of community guidelines"
}
```

### DELETE /v1/admin/posts/bulk
Bulk delete multiple posts.

**Authentication:** Required
**Authorization:** Admin roles only
**Body:**
```json
{
  "postIds": ["post_1", "post_2", "post_3"]
}
```

## Authentication & Authorization

### Authentication Methods
- JWT Bearer tokens in `Authorization` header
- Tokens issued by auth-service
- Optional authentication for public endpoints

### Role-Based Access Control

#### Student
- Create: GENERAL, PROJECT_UPDATE, COLLABORATION
- Read: All posts based on visibility rules
- Update/Delete: Own posts only

#### Faculty
- Create: GENERAL, PROJECT_UPDATE, COLLABORATION, EVENT, JOB_POSTING, BADGE_AWARD, ANNOUNCEMENT
- Read: All posts based on visibility rules
- Update/Delete: Own posts only
- Access to faculty-specific endpoints

#### Admin Roles (dept_admin)
- All faculty permissions
- Access to moderation endpoints
- Bulk operations
- User management

#### Placements Admin
- Create: GENERAL, PROJECT_UPDATE, COLLABORATION, EVENT, JOB_POSTING, BADGE_AWARD, ANNOUNCEMENT
- Access to job-related analytics

#### Super Admin (head_admin)
- All admin permissions
- Create: All post types including AD_POST
- Access to ad campaign management
- Platform-wide analytics and controls

### Authorization Headers
```
Authorization: Bearer <jwt_token>
```

## Data Models

### PostResponse
```typescript
interface PostResponse {
  id: string;
  type: PostType;
  content?: string;
  visibility: PostVisibility;
  createdAt: string;
  updatedAt: string;
  
  // Author info
  authorId: string;
  authorDisplayName: string;
  authorAvatarUrl?: string;
  authorRole: string;
  authorDepartment?: string;
  authorCollegeId: string;
  
  // Engagement
  likeCount: number;
  commentCount: number;
  shareCount: number;
  viewCount: number;
  
  // User interactions
  likedByMe: boolean;
  bookmarkedByMe: boolean;
  
  // Content
  media: MediaResponse[];
  tags: string[];
  links: Array<{
    url: string;
    title?: string;
    order: number;
  }>;
  
  // Type-specific data
  badgeData?: any;
  collaborationData?: any;
  projectData?: any;
  eventData?: any;
  jobData?: any;
}
```

### CreatePostRequest
```typescript
interface CreatePostRequest {
  type: PostType;
  content?: string;
  visibility?: PostVisibility;
  tags?: string[];
  links?: Array<{
    url: string;
    title?: string;
  }>;
  mediaIds?: string[];
  
  // Type-specific data (see Post Types section)
  badgeData?: BadgeData;
  collaborationData?: CollaborationData;
  projectData?: ProjectData;
  eventData?: EventData;
  jobData?: JobData;
}
```

## Error Handling

### HTTP Status Codes
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (authentication required)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `409` - Conflict (duplicate action)
- `413` - Payload Too Large (file size exceeded)
- `415` - Unsupported Media Type
- `422` - Unprocessable Entity (business logic errors)
- `500` - Internal Server Error
- `501` - Not Implemented

### Error Response Format
```json
{
  "error": "Error Type",
  "message": "Detailed error description",
  "details": {
    "field": "validation error details"
  }
}
```

### Common Errors

#### Authentication Errors
```json
{
  "error": "Unauthorized",
  "message": "Authentication token required"
}
```

#### Validation Errors
```json
{
  "error": "Validation Error",
  "message": "Invalid post type",
  "details": {
    "type": "Must be one of: GENERAL, PROJECT_UPDATE, ..."
  }
}
```

#### Permission Errors
```json
{
  "error": "Forbidden",
  "message": "Insufficient permissions to create ANNOUNCEMENT posts"
}
```

## Examples

### Creating a Project Update Post
```bash
curl -X POST http://localhost:4005/v1/posts/specialized \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "PROJECT_UPDATE",
    "content": "Just completed the authentication module!",
    "visibility": "PUBLIC",
    "tags": ["project", "milestone", "auth"],
    "projectData": {
      "projectTitle": "Nexus Social Platform",
      "milestone": "Authentication Complete",
      "progress": 30,
      "teamMembers": ["john_doe", "jane_smith"],
      "githubUrl": "https://github.com/team/nexus",
      "techStack": ["React", "Node.js", "PostgreSQL"]
    }
  }'
```

### Getting College Feed
```bash
curl -X GET "http://localhost:4005/v1/network/feed?scope=college&limit=10" \
  -H "Authorization: Bearer <token>"
```

### Uploading and Using Media
```bash
# 1. Upload media
curl -X POST http://localhost:4005/v1/media/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@image.jpg"

# Response: {"id": "media_123", "url": "/uploads/media_123.jpg", ...}

# 2. Create post with media
curl -X POST http://localhost:4005/v1/posts/specialized \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "GENERAL",
    "content": "Check out this awesome screenshot!",
    "mediaIds": ["media_123"]
  }'
```

### Searching Posts
```bash
curl -X GET "http://localhost:4005/v1/network/feed?search=react&postTypes=PROJECT_UPDATE,COLLABORATION" \
  -H "Authorization: Bearer <token>"
```

## Rate Limiting & Performance

### Rate Limits (Recommended Implementation)
- Post creation: 10 posts per hour per user
- Media upload: 50 files per hour per user
- Like/bookmark: 1000 actions per hour per user
- Feed requests: 100 requests per minute per user

### Performance Considerations
- Feed queries use cursor-based pagination
- Media files are served statically from `/uploads/`
- Database indexes on `createdAt`, `authorId`, `type`, `visibility`
- Caching recommended for frequently accessed feeds

### Monitoring Endpoints
- `GET /health` - Service health check
- Logs include request timing and error details
- Metrics available for post creation, feed requests, and user interactions

## Integration Notes

### Profile Service Integration
- User profile data fetched from profile-service
- Fallback to default values if profile-service unavailable
- Author information cached in post records for performance

### Auth Service Integration
- JWT token validation
- User role and permission resolution
- College membership verification

### Event Service Integration
- EVENT posts can link to event-service records
- Cross-service data consistency maintained

## Future Enhancements

### Planned Features
- Full-text search with Elasticsearch
- Real-time notifications
- Post analytics and insights
- Advanced content moderation with AI
- Post scheduling
- Rich text editor support
- Video processing and thumbnails
- Comment system implementation
- Post sharing and reposting
- Trending topics algorithm

### API Versioning
Current version: `v1`
All endpoints prefixed with `/v1/`
Breaking changes will increment version number.
