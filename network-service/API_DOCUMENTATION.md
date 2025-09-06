# Network Service API Documentation

## Base URL
```
http://localhost:4005
```

## Authentication
All protected endpoints require a Bearer token in the Authorization header:
```
Authorization: Bearer <jwt_token>
```

## Role-Based Access Control

### Roles Hierarchy (lowest to highest)
1. **STUDENT** - Basic user privileges
2. **FACULTY** - Can create announcements + student privileges
3. **DEPT_ADMIN** - Department-level moderation + faculty privileges
4. **PLACEMENTS_ADMIN** - Job posting management + faculty privileges
5. **HEAD_ADMIN** - Full system access

---

## 📡 Feed Endpoints

### GET /v1/network/feed
Get paginated social feed with various scopes and filters.

**Authentication:** Optional
**Query Parameters:**
- `scope` (string): `global` | `college` | `following` (default: global)
- `cursor` (string): Pagination cursor
- `limit` (number): Items per page (max 100, default 20)
- `postTypes` (string[]): Filter by post types

**Response:**
```json
{
  "items": [
    {
      "id": "post-uuid",
      "type": "GENERAL",
      "content": "Post content",
      "authorId": "user-uuid",
      "authorDisplayName": "John Doe",
      "authorRole": "STUDENT",
      "likeCount": 15,
      "likedByMe": false,
      "bookmarkedByMe": false,
      "media": [],
      "tags": ["tech", "collaboration"],
      "createdAt": "2024-01-15T10:00:00Z"
    }
  ],
  "nextCursor": "cursor-string",
  "hasMore": true
}
```

---

## 📝 Post Management

### POST /v1/posts/specialized
Create a new post with type-specific data.

**Authentication:** Required
**Body:**
```json
{
  "type": "PROJECT_UPDATE",
  "content": "Just completed the authentication module!",
  "visibility": "PUBLIC",
  "tags": ["project", "milestone"],
  "projectData": {
    "projectTitle": "Nexus Platform",
    "milestone": "Authentication Complete",
    "progress": 75,
    "techStack": ["TypeScript", "React", "Prisma"]
  }
}
```

**Post Types & Required Data:**
- `GENERAL`: Basic post, only content required
- `BADGE_AWARD`: Requires `badgeData` object
- `PROJECT_UPDATE`: Requires `projectData` object
- `COLLABORATION`: Requires `collaborationData` object
- `JOB_POSTING`: Requires `jobData` object (Admin only)
- `EVENT`: Requires `eventData` object
- `ANNOUNCEMENT`: Faculty+ only

### GET /v1/posts/:postId
Get a single post by ID.

**Authentication:** Optional

### PUT /v1/posts/:postId
Update a post (author or admin only).

**Authentication:** Required

### DELETE /v1/posts/:postId
Delete a post (author or admin only).

**Authentication:** Required

---

## ❤️ Post Interactions

### POST /v1/posts/:postId/like
Like/unlike a post (toggle).

**Authentication:** Required
**Response:**
```json
{
  "ok": true,
  "liked": true,
  "likeCount": 16
}
```

### POST /v1/posts/:postId/bookmark
Bookmark/unbookmark a post (toggle).

**Authentication:** Required

### DELETE /v1/posts/:postId/bookmark
Remove bookmark from a post.

**Authentication:** Required
**Response:**
```json
{
  "removed": true,
  "bookmarked": false
}
```

### GET /v1/user/bookmarks
Get user's bookmarked posts.

**Authentication:** Required
**Query Parameters:**
- `cursor` (string): Pagination cursor
- `limit` (number): Items per page

**Response:** Same format as feed endpoint

---

## 💬 Comments CRUD

### POST /v1/posts/:postId/comments
Create a new comment on a post.

**Authentication:** Required
**Body:**
```json
{
  "content": "Great project! Would love to collaborate."
}
```

### GET /v1/posts/:postId/comments
Get comments for a post.

**Authentication:** None
**Query Parameters:**
- `cursor` (string): Pagination cursor
- `limit` (number): Items per page

### PUT /v1/comments/:commentId
Update a comment (author or admin only).

**Authentication:** Required
**Body:**
```json
{
  "content": "Updated comment content"
}
```

### DELETE /v1/comments/:commentId
Delete a comment (author or admin only).

**Authentication:** Required

---

## 📁 Media Management

### POST /v1/media/upload
Upload media files (images, videos).

**Authentication:** Required
**Content-Type:** multipart/form-data
**Response:**
```json
{
  "id": "media-uuid",
  "url": "/uploads/filename.jpg",
  "mimeType": "image/jpeg",
  "width": 1920,
  "height": 1080
}
```

### POST /v1/posts/:postId/media
Associate uploaded media with a post.

**Authentication:** Required
**Body:**
```json
{
  "mediaIds": ["media-uuid-1", "media-uuid-2"]
}
```

---

## 👥 User Content

### GET /v1/user/posts
Get current user's posts.

**Authentication:** Required
**Query Parameters:**
- `cursor` (string): Pagination cursor
- `limit` (number): Items per page

---

## 👤 User CRUD (Admin Only)

### POST /v1/users
Create a new user account.

**Authentication:** Required (Admin roles only)
**Body:**
```json
{
  "email": "newuser@college.edu",
  "displayName": "New User",
  "password": "securepassword",
  "roles": ["STUDENT"],
  "collegeId": "college-uuid",
  "department": "Computer Science",
  "year": 2,
  "collegeMemberId": "CS2023001"
}
```

### PUT /v1/users/:userId
Update user information.

**Authentication:** Required (Admin or self)
**Body:**
```json
{
  "displayName": "Updated Name",
  "email": "updated@college.edu",
  "avatarUrl": "/uploads/new-avatar.jpg",
  "department": "Data Science",
  "year": 3,
  "collegeMemberId": "DS2023001"
}
```

### DELETE /v1/users/:userId
Delete a user account.

**Authentication:** Required (Admin roles only)
**Response:**
```json
{
  "success": true,
  "message": "User deleted successfully"
}
```

---

## 🛡️ Admin Endpoints

### GET /v1/admin/stats
Get admin dashboard statistics.

**Authentication:** Required (Admin roles only)
**Response:**
```json
{
  "totalPosts": 1250,
  "postsToday": 45,
  "totalUsers": 500,
  "activeUsers": 89,
  "postsByType": {
    "GENERAL": 800,
    "PROJECT_UPDATE": 200,
    "JOB_POSTING": 50
  },
  "recentActivity": {
    "posts": 120,
    "comments": 340,
    "likes": 1200
  }
}
```

### GET /v1/admin/flagged
Get content flagged for review.

**Authentication:** Required (Admin roles only)

### POST /v1/admin/moderate/:postId
Moderate a post.

**Authentication:** Required (Admin roles only)
**Body:**
```json
{
  "action": "hide",
  "reason": "Inappropriate content"
}
```
**Actions:** `hide` | `delete` | `approve` | `flag`

### GET /v1/admin/users/:userId/posts
Get posts by a specific user (admin view).

**Authentication:** Required (Admin roles only)

### DELETE /v1/admin/posts/bulk
Bulk delete posts.

**Authentication:** Required (Admin roles only)
**Body:**
```json
{
  "postIds": ["post-uuid-1", "post-uuid-2"]
}
```

---

## 🎓 Faculty Endpoints

### POST /v1/posts/announcement
Create an announcement post.

**Authentication:** Required (Faculty+ roles)
**Body:** Same as specialized post, but type is forced to `ANNOUNCEMENT`

### POST /v1/posts/job
Create a job posting.

**Authentication:** Required (Placements Admin+ only)
**Body:** 
```json
{
  "content": "Exciting internship opportunity!",
  "jobData": {
    "title": "Software Developer Intern",
    "company": "Tech Corp",
    "location": "Remote",
    "type": "internship",
    "deadline": "2024-02-15",
    "applyUrl": "https://company.com/apply",
    "salaryRange": "₹20,000-30,000/month"
  }
}
```

---

## 👥 User Management & Discovery

### GET /v1/users/directory
Get paginated list of students and faculty for networking discovery. Excludes admin users.

**Authentication:** Optional
**Query Parameters:**
- `offset` (number): Pagination offset (default: 0)
- `limit` (number): Items per page (max 100, default: 20)
- `q` (string): Search by name or email
- `collegeId` (string): Filter by college ID

**Response:**
```json
{
  "users": [
    {
      "id": "user-uuid",
      "name": "John Doe",
      "email": "john@college.edu",
      "avatarUrl": "/uploads/avatar.jpg",
      "department": "Computer Science",
      "college": "MIT",
      "collegeName": "Massachusetts Institute of Technology",
      "collegeMemberId": "CS2023001",
      "roles": ["STUDENT"],
      "bio": "CS student passionate about AI",
      "isFollowing": false
    }
  ],
  "total": 150,
  "hasMore": true
}
```

**Note:** Only returns users with STUDENT or FACULTY roles. Admin users are excluded from networking discovery.

### GET /v1/users/search
Search users by name, email, or college member ID.

**Authentication:** Optional
**Query Parameters:**
- `q` (string): Search query - matches name, email, or collegeMemberId (required)
- `limit` (number): Items per page (max 100, default: 20)
- `collegeId` (string): Filter by college ID

**Response:** Same as `/v1/users/directory`

**Search Fields:**
- User display name (partial match)
- Email address (partial match)
- College member ID (exact or partial match)

**Note:** Only returns STUDENT and FACULTY users, excludes admins.

### GET /v1/users/suggestions
Get AI-powered follow suggestions prioritizing same college, department, and mutual connections.

**Authentication:** Required
**Query Parameters:**
- `limit` (number): Number of suggestions (default: 10, max: 50)

**Response:**
```json
{
  "suggestions": [
    {
      "id": "user-uuid",
      "name": "Jane Smith",
      "email": "jane@college.edu",
      "avatarUrl": "/uploads/jane.jpg",
      "department": "Computer Science",
      "college": "MIT",
      "collegeName": "Massachusetts Institute of Technology",
      "collegeMemberId": "CS2023002",
      "roles": ["STUDENT"],
      "bio": "Full-stack developer",
      "mutualFollowersCount": 5,
      "reason": "same_department",
      "isFollowing": false
    }
  ],
  "total": 25
}
```

**Suggestion Priority (in order):**
1. `same_college` - Users from same college (highest priority)
2. `same_department` - Users from same department within college
3. `mutual_connections` - Users with mutual followers/following
4. `popular` - Popular users in the network (lowest priority)

**Note:** Only suggests STUDENT and FACULTY users, excludes admins.

### GET /v1/users/:userId
Get detailed information about a specific user.

**Authentication:** Optional
**Response:**
```json
{
  "id": "user-uuid",
  "name": "John Doe",
  "email": "john@college.edu",
  "displayName": "John D.",
  "avatarUrl": "/uploads/avatar.jpg",
  "department": "Computer Science",
  "college": "MIT",
  "collegeName": "Massachusetts Institute of Technology",
  "bio": "Passionate about AI and machine learning",
  "year": 3,
  "roles": ["STUDENT"],
  "isFollowing": false,
  "followersCount": 45,
  "followingCount": 32
}
```

---

## 🤝 Follow/Network Management

### POST /v1/users/:userId/follow
Follow a user.

**Authentication:** Required
**Response:**
```json
{
  "success": true,
  "message": "Successfully followed user",
  "isFollowing": true
}
```

### DELETE /v1/users/:userId/follow
Unfollow a user.

**Authentication:** Required
**Response:**
```json
{
  "success": true,
  "message": "Successfully unfollowed user",
  "isFollowing": false
}
```

### GET /v1/users/:userId/followers
Get list of users who follow the specified user.

**Authentication:** Optional
**Query Parameters:**
- `cursor` (string): Pagination cursor
- `limit` (number): Items per page (max 100, default: 20)

**Response:**
```json
{
  "users": [
    {
      "id": "follower-uuid",
      "name": "Alice Johnson",
      "avatarUrl": "/uploads/alice.jpg",
      "department": "Computer Science",
      "college": "MIT",
      "collegeName": "Massachusetts Institute of Technology",
      "collegeMemberId": "CS2023001",
      "roles": ["STUDENT"],
      "isFollowing": true
    }
  ],
  "total": 45,
  "hasMore": true
}
```

### GET /v1/users/:userId/following
Get list of users that the specified user follows.

**Authentication:** Optional
**Query Parameters:**
- `cursor` (string): Pagination cursor
- `limit` (number): Items per page (max 100, default: 20)

**Response:**
```json
{
  "users": [
    {
      "id": "following-uuid",
      "name": "Bob Wilson",
      "avatarUrl": "/uploads/bob.jpg",
      "department": "Data Science",
      "college": "MIT",
      "collegeName": "Massachusetts Institute of Technology",
      "collegeMemberId": "DS2023003",
      "roles": ["FACULTY"],
      "isFollowing": true
    }
  ],
  "total": 32,
  "hasMore": true
}
```

### GET /v1/users/:userId/stats
Get network statistics for a user.

**Authentication:** Optional
**Response:**
```json
{
  "followersCount": 45,
  "followingCount": 32,
  "profileViews": 120,
  "searchAppearances": 15
}
```

### GET /v1/users/:userId/posts
Get posts created by a specific user.

**Authentication:** Optional
**Query Parameters:**
- `cursor` (string): Pagination cursor
- `limit` (number): Items per page (max 100, default: 20)

**Response:** Same format as feed endpoint

---

## 🔍 Search & Discovery

### GET /v1/search/posts
Search posts (to be implemented).

**Authentication:** Optional
**Query Parameters:**
- `q` (string): Search query
- `type` (string): Filter by post type
- `tags` (string): Filter by tags
- `dateRange` (string): Date range filter

---

## 📊 Analytics

### GET /v1/posts/:postId/analytics
Get post analytics (to be implemented).

**Authentication:** Required (Author or Admin)

---

## Error Responses

### Standard Error Format
```json
{
  "error": "Error Type",
  "message": "Detailed error message"
}
```

### HTTP Status Codes
- `400` - Validation Error
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error

---

## Post Types Reference

### GENERAL
Basic social post with text content, media, and tags.

### BADGE_AWARD
Celebrates achievement badges.
```json
{
  "badgeData": {
    "badgeId": "badge-uuid",
    "badgeName": "Project Completion",
    "description": "Completed first project",
    "criteria": "Submit and get approved",
    "rarity": "common"
  }
}
```

### PROJECT_UPDATE
Progress updates on projects.
```json
{
  "projectData": {
    "projectTitle": "E-commerce Platform",
    "milestone": "Payment Integration",
    "progress": 60,
    "teamMembers": ["user1", "user2"],
    "githubUrl": "https://github.com/user/repo",
    "techStack": ["React", "Node.js", "MongoDB"]
  }
}
```

### COLLABORATION
Team formation and collaboration requests.
```json
{
  "collaborationData": {
    "requiredSkills": ["React", "TypeScript"],
    "capacity": 3,
    "deadline": "2024-02-01",
    "applyInApp": true
  }
}
```

### EVENT
Campus events and activities.
```json
{
  "eventData": {
    "title": "Tech Talk: AI in Education",
    "date": "2024-01-20T14:00:00Z",
    "location": "Auditorium Hall",
    "type": "seminar",
    "registrationRequired": true,
    "capacity": 200,
    "registrationUrl": "https://college.edu/events/register"
  }
}
```

---

## Frontend Integration Examples

### Fetch Feed
```javascript
const response = await fetch('/v1/network/feed?scope=college&limit=10', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
const feed = await response.json();
```

### Create Post
```javascript
const response = await fetch('/v1/posts/specialized', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    type: 'GENERAL',
    content: 'Hello Nexus!',
    tags: ['introduction']
  })
});
```

### Upload and Attach Media
```javascript
// 1. Upload media
const formData = new FormData();
formData.append('file', selectedFile);

const mediaResponse = await fetch('/v1/media/upload', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: formData
});
const media = await mediaResponse.json();

// 2. Create post with media
const postResponse = await fetch('/v1/posts/specialized', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    type: 'PROJECT_SHOWCASE',
    content: 'Check out my latest project!',
    mediaIds: [media.id]
  })
});
```
