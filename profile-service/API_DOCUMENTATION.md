# Profile Service API Documentation

## Overview

The Profile Service manages user profiles, personal projects, publications, experiences, and badges for the Nexus platform. It integrates with the Auth Service to provide enhanced profile data.

## Base URL

```
http://localhost:4002
```

## Authentication

Most endpoints require JWT authentication via the `Authorization` header:

```
Authorization: Bearer <jwt_token>
```

---

## Endpoints

### 1. Colleges

#### GET /v1/colleges

Get list of all colleges (public endpoint).

**Authentication:** None required

**Response:**

```json
{
  "colleges": [
    {
      "id": "college_id",
      "name": "College Name",
      "domain": "college.edu"
    }
  ]
}
```

---

### 2. Profile Management

#### GET /v1/profile/me

Get current user's profile with all related data.

**Authentication:** Required

**Response:**

```json
{
  "profile": {
    "id": "profile_id",
    "userId": "user_id",
    "name": "John Doe",
    "bio": "Software Developer passionate about AI",
    "skills": ["JavaScript", "Python", "React"],
<<<<<<< HEAD
    "expertise": ["Machine Learning", "Web Development"],
=======
>>>>>>> 091fbe9419d7afb4051128fac039f76cbc90d0b4
    "linkedIn": "https://linkedin.com/in/johndoe",
    "github": "https://github.com/johndoe",
    "twitter": "https://twitter.com/johndoe",
    "resumeUrl": "https://example.com/resume.pdf",
    "avatar": "https://example.com/avatar.jpg",
    "contactInfo": "Available for freelance work",
    "phoneNumber": "+1234567890",
    "alternateEmail": "john.alt@email.com",
    "personalProjects": [...],
    "publications": [...],
    "studentBadges": [...]
  }
}
```

#### PUT /v1/profile/me

Create or update current user's profile.

**Authentication:** Required

**Request Body:**

```json
{
<<<<<<< HEAD
  "displayName": "John Smith",
  "avatarUrl": "https://example.com/avatar.jpg",
  "year": 3,
  "department": "Computer Science",
  "name": "John Doe",
  "bio": "Updated bio",
  "skills": ["JavaScript", "Python", "React", "Node.js"],
  "expertise": ["Machine Learning", "Web Development"],
=======
  "name": "John Doe",
  "bio": "Updated bio",
  "skills": ["JavaScript", "Python", "React", "Node.js"],
>>>>>>> 091fbe9419d7afb4051128fac039f76cbc90d0b4
  "linkedIn": "https://linkedin.com/in/johndoe",
  "github": "https://github.com/johndoe",
  "twitter": "https://twitter.com/johndoe",
  "resumeUrl": "https://example.com/resume.pdf",
<<<<<<< HEAD
=======
  "avatar": "https://example.com/avatar.jpg",
>>>>>>> 091fbe9419d7afb4051128fac039f76cbc90d0b4
  "contactInfo": "Available for freelance work",
  "phoneNumber": "+1234567890",
  "alternateEmail": "john.alt@email.com"
}
```

<<<<<<< HEAD
**Field Descriptions:**

- **User Model Fields** (updated via Auth Service):
  - `displayName`: User's display name (1-100 characters)
  - `avatarUrl`: Profile picture URL
  - `year`: Academic year for students (1-6)
  - `department`: Department name
- **Profile Model Fields** (stored in Profile Service):
  - `name`: Editable display name separate from auth displayName
  - `bio`: User biography (max 1000 characters)
  - `skills`: Array of skills for students
  - `expertise`: Array of expertise areas for faculty
  - `linkedIn`, `github`, `twitter`: Social media URLs
  - `resumeUrl`: Resume/CV URL for students
  - `contactInfo`: Contact information (max 500 characters)
  - `phoneNumber`: Phone number (max 20 characters)
  - `alternateEmail`: Alternative email address

=======

> > > > > > > 091fbe9419d7afb4051128fac039f76cbc90d0b4
> > > > > > > **Response:**

```json
{
  "profile": {
    "id": "profile_id",
    "userId": "user_id"
    // ... updated profile data
  }
}
```

#### GET /v1/profile/user/:userId

Get enhanced profile for any user (combines profile + auth service data).

**Authentication:** Required

**Parameters:**

- `userId` (string): Target user ID

**Response:**

```json
{
  "profile": {
    "id": "profile_id",
    "userId": "user_id",
    "displayName": "John Doe",
    "email": "john@example.com",
    "roles": ["STUDENT"],
    "collegeName": "MIT",
    "department": "Computer Science",
    "year": 3,
    "collegeMemberId": "MIT2021001",
    "phone": "+1234567890",
    "joinedAt": "2021-09-01T00:00:00.000Z",
    // ... profile fields
    "personalProjects": [...],
    "publications": [...],
    "experience": [...],
    "studentBadges": [...]
  }
}
```

---

### 3. Personal Projects

#### GET /v1/profile/me/projects

Get current user's personal projects.

**Authentication:** Required

**Response:**

```json
{
  "projects": [
    {
      "id": "project_id",
      "userId": "user_id",
      "title": "E-commerce Platform",
      "description": "Full-stack e-commerce solution with React and Node.js",
      "github": "https://github.com/johndoe/ecommerce",
      "demoLink": "https://myecommerce.com",
      "image": "https://example.com/project-image.jpg",
      "createdAt": "2023-01-15T10:30:00.000Z"
    }
  ]
}
```

<<<<<<< HEAD

#### POST /v1/profile/projects

=======

#### POST /v1/profiles/me/projects

> > > > > > > 091fbe9419d7afb4051128fac039f76cbc90d0b4
> > > > > > > Create a new personal project.

**Authentication:** Required

**Request Body:**

```json
{
  "title": "New Project",
  "description": "Project description",
  "github": "https://github.com/johndoe/newproject",
  "demoLink": "https://newproject.com",
  "image": "https://example.com/image.jpg"
}
```

**Response:**

```json
{
  "project": {
    "id": "new_project_id",
    "userId": "user_id",
    "title": "New Project",
    // ... project data
    "createdAt": "2023-12-01T10:30:00.000Z"
  }
}
```

<<<<<<< HEAD

#### PUT /v1/profile/projects/:id

=======

#### PUT /v1/profiles/me/projects/:id

> > > > > > > 091fbe9419d7afb4051128fac039f76cbc90d0b4
> > > > > > > Update a personal project.

**Authentication:** Required (must own the project)

**Parameters:**

- `id` (string): Project ID

**Request Body:**

```json
{
  "title": "Updated Project Title",
  "description": "Updated description"
}
```

<<<<<<< HEAD

#### DELETE /v1/profile/projects/:id

=======

#### DELETE /v1/profiles/me/projects/:id

> > > > > > > 091fbe9419d7afb4051128fac039f76cbc90d0b4
> > > > > > > Delete a personal project.

**Authentication:** Required (must own the project)

**Parameters:**

- `id` (string): Project ID

**Response:**

```json
{
  "success": true
}
```

<<<<<<< HEAD

#### GET /v1/profile/projects/:userId

Get personal projects for a specific user.

**Authentication:** Required

**Parameters:**

- `userId` (string): Target user ID

**Response:**

```json
{
  "projects": [
    {
      "id": "project_id",
      "userId": "user_id",
      "title": "E-commerce Platform",
      "description": "Full-stack e-commerce solution",
      "github": "https://github.com/johndoe/ecommerce",
      "demoLink": "https://myecommerce.com",
      "image": "https://example.com/project-image.jpg",
      "createdAt": "2023-01-15T10:30:00.000Z"
    }
  ]
}
```

=======

> > > > > > > 091fbe9419d7afb4051128fac039f76cbc90d0b4

---

### 4. Publications (Faculty Only)

#### GET /v1/profile/me/publications

Get current user's publications.

**Authentication:** Required
**Roles:** FACULTY, HEAD_ADMIN

**Response:**

```json
{
  "publications": [
    {
      "id": "pub_id",
      "userId": "user_id",
      "title": "Machine Learning in Healthcare",
      "year": 2023,
      "link": "https://journal.com/article",
      "createdAt": "2023-06-15T10:30:00.000Z"
    }
  ]
}
```

<<<<<<< HEAD

#### POST /v1/profile/publications

=======

#### POST /v1/profiles/me/publications

> > > > > > > 091fbe9419d7afb4051128fac039f76cbc90d0b4
> > > > > > > Create a new publication.

**Authentication:** Required
**Roles:** FACULTY, HEAD_ADMIN

**Request Body:**

```json
{
  "title": "AI in Education",
  "year": 2023,
  "link": "https://journal.com/ai-education"
}
```

<<<<<<< HEAD

#### PUT /v1/profile/publications/:id

=======

#### PUT /v1/profiles/me/publications/:id

> > > > > > > 091fbe9419d7afb4051128fac039f76cbc90d0b4
> > > > > > > Update a publication.

**Authentication:** Required (must own the publication)
**Roles:** FACULTY, HEAD_ADMIN

<<<<<<< HEAD

#### DELETE /v1/profile/publications/:id

=======

#### DELETE /v1/profiles/me/publications/:id

> > > > > > > 091fbe9419d7afb4051128fac039f76cbc90d0b4
> > > > > > > Delete a publication.

**Authentication:** Required (must own the publication)
**Roles:** FACULTY, HEAD_ADMIN

<<<<<<< HEAD

#### GET /v1/profile/publications/:userId

Get publications for a specific user.

**Authentication:** Required

**Parameters:**

- `userId` (string): Target user ID

**Response:**

```json
{
  "publications": [
    {
      "id": "pub_id",
      "userId": "user_id",
      "title": "Machine Learning in Healthcare",
      "year": 2023,
      "link": "https://journal.com/article",
      "createdAt": "2023-06-15T10:30:00.000Z"
    }
  ]
}
```

=======

> > > > > > > 091fbe9419d7afb4051128fac039f76cbc90d0b4

---

### 5. Experience Management

#### GET /v1/profile/me/experiences

Get current user's experiences.

**Authentication:** Required

**Response:**

```json
{
  "experiences": [
    {
      "id": "exp_id",
      "userId": "user_id",
      "area": "Machine Learning",
      "level": "Advanced",
      "yearsExp": 3,
      "description": "Worked on ML models for healthcare",
      "createdAt": "2023-01-01T00:00:00.000Z"
    }
  ]
}
```

#### POST /v1/profile/experiences

Create a new experience.

**Authentication:** Required

**Request Body:**

```json
{
  "area": "Artificial Intelligence",
  "level": "Intermediate",
  "yearsExp": 2,
  "description": "Experience with neural networks and deep learning"
}
```

#### PUT /v1/profile/experiences/:id

Update an experience.

**Authentication:** Required (must own the experience)

#### DELETE /v1/profile/experiences/:id

Delete an experience.

**Authentication:** Required (must own the experience)

---

### 6. Badge System

<<<<<<< HEAD

#### GET /v1/badges/definitions

Get all badge definitions.

# **Authentication:** Required

#### GET /v1/badge-definitions

Get all badge definitions.

**Authentication:** None required (public endpoint)

> > > > > > > 091fbe9419d7afb4051128fac039f76cbc90d0b4

**Response:**

```json
{
  "badgeDefinitions": [
    {
      "id": "badge_def_id",
      "name": "Code Master",
      "description": "Completed 10 coding challenges",
      "iconUrl": "https://example.com/badge-icon.png",
      "color": "#FFD700",
      "category": "Programming",
      "rarity": "RARE",
      "createdAt": "2023-01-01T00:00:00.000Z"
    }
  ]
}
```

<<<<<<< HEAD

#### POST /v1/badges/definitions

=======

#### POST /v1/badge-definitions

> > > > > > > 091fbe9419d7afb4051128fac039f76cbc90d0b4
> > > > > > > Create a new badge definition.

**Authentication:** Required
**Roles:** FACULTY, DEPT_ADMIN, HEAD_ADMIN

**Request Body:**

```json
{
  "name": "Innovation Award",
  "description": "Awarded for innovative project solutions",
  "icon": "https://example.com/innovation-badge.png",
  "color": "#FF6B35",
  "category": "Innovation",
  "rarity": "EPIC"
}
```

<<<<<<< HEAD

#### GET /v1/badges/recent

Get recent badge awards (for faculty/admin).

**Authentication:** Required
**Roles:** FACULTY, DEPT_ADMIN, HEAD_ADMIN

**Query Parameters:**

- `limit` (optional): Number of results (default: 20)

**Response:**

```json
{
  "awards": [
    {
      "id": "award_id",
      "studentId": "user_id",
      "studentName": "John Doe",
      "collegeMemberId": "CS2024001",
      "badgeId": "badge_def_id",
      "awardedBy": "faculty_id",
      "reason": "Outstanding project work",
      "awardedAt": "2023-11-15T10:30:00.000Z",
      "badge": {
        "name": "Innovation Award",
        "category": "Innovation",
        "rarity": "EPIC"
      }
    }
  ]
}
```

#### POST /v1/badges/awards

=======

#### POST /v1/badges/award

> > > > > > > 091fbe9419d7afb4051128fac039f76cbc90d0b4
> > > > > > > Award a badge to a user.

**Authentication:** Required
**Roles:** FACULTY, DEPT_ADMIN, HEAD_ADMIN

**Request Body:**

```json
{
  "badgeDefinitionId": "badge_def_id",
  "userId": "user_id",
  "reason": "Excellent performance in hackathon"
}
```

<<<<<<< HEAD

#### GET /v1/badges/export

Export badge awards as CSV.

**Authentication:** Required
**Roles:** DEPT_ADMIN, HEAD_ADMIN

**Response:** CSV file download with headers:

- College Member ID
- Student Name
- Department
- Badge Name
- Badge Category
- Badge Rarity
- Awarded Date
- Awarded By
- Reason

=======

> > > > > > > 091fbe9419d7afb4051128fac039f76cbc90d0b4
> > > > > > > **Response:**

```json
{
  "badge": {
    "id": "student_badge_id",
    "studentId": "user_id",
    "badgeId": "badge_def_id",
    "awardedBy": "admin_user_id",
    "reason": "Excellent performance in hackathon",
    "awardedAt": "2023-11-15T10:30:00.000Z",
    "badge": {
      "id": "badge_def_id",
      "name": "Code Master",
      "description": "Completed 10 coding challenges",
      "rarity": "RARE"
    }
  }
}
```

---

### 7. Getting User Badges

#### GET /v1/profile/badges/:userId

Get badges awarded to a specific user.

**Authentication:** Required

**Parameters:**

- `userId` (string): Target user ID

**Response:**

```json
{
  "badges": [
    {
      "id": "student_badge_id",
      "studentId": "user_id",
      "badgeId": "badge_def_id",
      "awardedBy": "admin_user_id",
      "reason": "Excellent performance in hackathon",
      "awardedAt": "2023-11-15T10:30:00.000Z",
      "badge": {
        "id": "badge_def_id",
        "name": "Code Master",
        "description": "Completed 10 coding challenges",
        "icon": "https://example.com/badge-icon.png",
        "color": "#FFD700",
        "category": "Programming",
        "rarity": "RARE"
      }
    }
  ]
}
```

**Alternative ways to get user badges:**

- **GET /v1/profile/me** - Returns your badges in the `badges` array
- **GET /v1/profile/user/:userId** - Returns user's badges in the `badges` array

---

### 7. Admin Endpoints

#### GET /v1/profiles

List all profiles with filtering (Admin only).

**Authentication:** Required
**Roles:** HEAD_ADMIN, SUPER_ADMIN

**Query Parameters:**

- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 10)
- `search` (string): Search by name or email
- `role` (string): Filter by role
- `college` (string): Filter by college

**Response:**

```json
{
  "profiles": [...],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "totalPages": 10
  }
}
```

---

## Error Responses

All endpoints return consistent error responses:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": "Additional error details"
}
```

### Common HTTP Status Codes:

- `200` - Success
- `201` - Created
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error

---

## Data Models

### Profile

```typescript
interface Profile {
  id: string;
  userId: string;
  name?: string;
  bio?: string;
  skills?: string[];
  linkedIn?: string;
  github?: string;
  twitter?: string;
  resumeUrl?: string;
  avatar?: string;
  contactInfo?: string;
  phoneNumber?: string;
  alternateEmail?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### PersonalProject

```typescript
interface PersonalProject {
  id: string;
  userId: string;
  title: string;
  description: string;
  github?: string;
  demoLink?: string;
  image?: string;
  createdAt: Date;
}
```

### Publication

```typescript
interface Publication {
  id: string;
  userId: string;
  title: string;
  year: number;
  link?: string;
  createdAt: Date;
}
```

### Experience

```typescript
interface Experience {
  id: string;
  userId: string;
  area: string;
  level: "Beginner" | "Intermediate" | "Advanced" | "Expert";
  yearsExp?: number;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### BadgeDefinition

```typescript
interface BadgeDefinition {
  id: string;
  name: string;
  description: string;
  iconUrl?: string;
  color?: string;
  category?: string;
  rarity: "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY";
  createdAt: Date;
}
```

### StudentBadge

```typescript
interface StudentBadge {
  id: string;
  userId: string;
  badgeId: string;
  awardedBy: string;
  reason: string;
  awardedAt: Date;
  badge: BadgeDefinition;
}
```

---

## Integration Notes

1. **Auth Service Integration**: The `/v1/profile/user/:userId` endpoint fetches additional user data from the Auth Service to provide enhanced profile information.

2. **Role-Based Access**: Many endpoints require specific roles (FACULTY, HEAD_ADMIN, SUPER_ADMIN) for access.

3. **Ownership Validation**: Users can only modify their own resources (projects, publications, experiences).

4. **Cross-Service Communication**: The service communicates with the Auth Service for user data and college information.

---

## Environment Variables

```env
DATABASE_URL=postgresql://username:password@localhost:5432/profile_db
AUTH_SERVICE_URL=http://localhost:4001
JWT_SECRET=your_jwt_secret
PORT=4002
```
