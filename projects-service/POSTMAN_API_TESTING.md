# Project Service API Testing with Postman

## Overview

This document provides comprehensive Postman testing instructions for the Project Service API endpoints, including authentication, project management, and application workflows.

## Base Configuration

**Base URL:** `http://localhost:4003`
**Content-Type:** `application/json`

## Authentication Setup

### 1. Get JWT Token from Auth Service

First, get a valid JWT token from the auth service:

```http
POST http://localhost:4001/v1/auth/login
Content-Type: application/json

{
  "email": "faculty@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "...",
  "user": {
    "id": "user-id",
    "email": "faculty@example.com",
    "roles": ["FACULTY"],
    "profile": {
      "collegeId": "college-123",
      "department": "Computer Science",
      "year": 3
    }
  }
}
```

### 2. Set Authorization Header

For all subsequent requests, include the JWT token:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Project Endpoints

### 1. Create Project (Faculty Only)

```http
POST http://localhost:4003/v1/projects
Authorization: Bearer <your-jwt-token>
Content-Type: application/json

{
  "title": "AI-Powered Student Assistant",
  "description": "Develop an AI chatbot to help students with academic queries and course recommendations.",
  "projectDuration": "6 months",
  "skills": ["Python", "Machine Learning", "Natural Language Processing", "React"],
  "departments": ["Computer Science", "Information Technology"],
  "visibleToAllDepts": false,
  "projectType": "RESEARCH",
  "maxStudents": 3,
  "deadline": "2024-12-31T23:59:59.000Z",
  "tags": ["AI", "Education", "Chatbot"],
  "requirements": [
    "Strong programming skills in Python",
    "Basic understanding of ML concepts",
    "Experience with web development"
  ],
  "outcomes": [
    "Functional AI chatbot prototype",
    "Research paper submission",
    "Deployment on university platform"
  ]
}
```

**Expected Response:**
```json
{
  "project": {
    "id": "project-123",
    "collegeId": "college-123",
    "authorId": "user-id",
    "authorName": "Dr. John Smith",
    "authorAvatar": "https://example.com/avatar.jpg",
    "title": "AI-Powered Student Assistant",
    "description": "Develop an AI chatbot...",
    "projectDuration": "6 months",
    "skills": ["Python", "Machine Learning", "Natural Language Processing", "React"],
    "departments": ["Computer Science", "Information Technology"],
    "visibleToAllDepts": false,
    "projectType": "RESEARCH",
    "maxStudents": 3,
    "deadline": "2024-12-31T23:59:59.000Z",
    "tags": ["AI", "Education", "Chatbot"],
    "moderationStatus": "APPROVED",
    "requirements": [...],
    "outcomes": [...],
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### 2. Get All Projects (Students)

```http
GET http://localhost:4003/v1/projects
Authorization: Bearer <student-jwt-token>
```

**Query Parameters:**
- `department` (optional): Filter by department
- `skills` (optional): Comma-separated skills
- `projectType` (optional): RESEARCH, DEVELOPMENT, INTERNSHIP
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)

**Example with filters:**
```http
GET http://localhost:4003/v1/projects?department=Computer Science&skills=Python,React&projectType=RESEARCH&page=1&limit=5
Authorization: Bearer <student-jwt-token>
```

### 3. Get My Projects (Faculty)

```http
GET http://localhost:4003/v1/projects/mine
Authorization: Bearer <faculty-jwt-token>
```

### 4. Get Project by ID

```http
GET http://localhost:4003/v1/projects/{project-id}
Authorization: Bearer <your-jwt-token>
```

### 5. Update Project (Faculty Owner Only)

```http
PUT http://localhost:4003/v1/projects/{project-id}
Authorization: Bearer <faculty-jwt-token>
Content-Type: application/json

{
  "title": "Updated AI-Powered Student Assistant",
  "description": "Enhanced AI chatbot with voice recognition capabilities.",
  "maxStudents": 4,
  "deadline": "2025-01-31T23:59:59.000Z",
  "skills": ["Python", "Machine Learning", "Speech Recognition", "React", "Node.js"]
}
```

### 6. Delete Project (Faculty Owner Only)

```http
DELETE http://localhost:4003/v1/projects/{project-id}
Authorization: Bearer <faculty-jwt-token>
```

## Application Endpoints

### 1. Apply to Project (Students Only)

```http
POST http://localhost:4003/v1/projects/{project-id}/applications
Authorization: Bearer <student-jwt-token>
Content-Type: application/json

{
  "message": "I am very interested in this AI project. I have experience with Python and machine learning from my coursework and personal projects. I would love to contribute to developing this educational tool."
}
```

**Expected Response:**
```json
{
  "application": {
    "id": "application-123",
    "projectId": "project-123",
    "studentId": "student-id",
    "studentName": "Jane Doe",
    "studentDepartment": "Computer Science",
    "status": "PENDING",
    "message": "I am very interested in this AI project...",
    "appliedAt": "2024-01-15T11:00:00.000Z"
  }
}
```

### 2. Get Applications for Project (Faculty Owner)

```http
GET http://localhost:4003/v1/projects/{project-id}/applications
Authorization: Bearer <faculty-jwt-token>
```

**Query Parameters:**
- `status` (optional): PENDING, ACCEPTED, REJECTED

### 3. Update Application Status (Faculty Owner)

```http
PUT http://localhost:4003/v1/applications/{application-id}/status
Authorization: Bearer <faculty-jwt-token>
Content-Type: application/json

{
  "status": "ACCEPTED"
}
```

### 4. Get My Applications (Students)

```http
GET http://localhost:4003/v1/applications/mine
Authorization: Bearer <student-jwt-token>
```

## WebSocket Testing

### 1. Connect to WebSocket

**URL:** `ws://localhost:4003`
**Authentication:** Include JWT token in connection auth

```javascript
// JavaScript example for testing WebSocket
const socket = io('http://localhost:4003', {
  auth: {
    token: 'your-jwt-token'
  }
});

socket.on('connect', () => {
  console.log('Connected to WebSocket');
});

socket.on('project-update', (event) => {
  console.log('Project update:', event);
});

socket.on('application-update', (event) => {
  console.log('Application update:', event);
});
```

### 2. Test Real-Time Events

1. **Create a project** using the POST endpoint above
2. **Listen for `project-update` events** on connected WebSocket clients
3. **Apply to the project** using a student account
4. **Listen for `application-update` events** on faculty WebSocket connection

## Sample Test Scenarios

### Scenario 1: Complete Project Workflow

1. **Faculty Login**
   ```http
   POST http://localhost:4001/v1/auth/login
   {
     "email": "faculty@university.edu",
     "password": "faculty123"
   }
   ```

2. **Create Project**
   ```http
   POST http://localhost:4003/v1/projects
   Authorization: Bearer <faculty-token>
   {
     "title": "Mobile App Development",
     "description": "Build a mobile app for campus navigation",
     "projectType": "DEVELOPMENT",
     "maxStudents": 2,
     "skills": ["React Native", "JavaScript", "UI/UX"],
     "departments": ["Computer Science"]
   }
   ```

3. **Student Login**
   ```http
   POST http://localhost:4001/v1/auth/login
   {
     "email": "student@university.edu",
     "password": "student123"
   }
   ```

4. **View Available Projects**
   ```http
   GET http://localhost:4003/v1/projects
   Authorization: Bearer <student-token>
   ```

5. **Apply to Project**
   ```http
   POST http://localhost:4003/v1/projects/{project-id}/apply
   Authorization: Bearer <student-token>
   {
     "message": "I have experience with React Native and would love to work on this project."
   }
   ```

6. **Faculty Reviews Applications**
   ```http
   GET http://localhost:4003/v1/projects/{project-id}/applications
   Authorization: Bearer <faculty-token>
   ```

7. **Accept Application**
   ```http
   PUT http://localhost:4003/v1/applications/{application-id}/status
   Authorization: Bearer <faculty-token>
   {
     "status": "ACCEPTED",
     "feedback": "Welcome to the team!"
   }
   ```

### Scenario 2: Testing Caching and Performance

1. **Multiple Requests** - Make several requests to test Redis caching
2. **User Identity Calls** - Verify auth service integration
3. **WebSocket Events** - Test real-time notifications

## Environment Variables

Ensure these environment variables are set in your project service:

```bash
# Project Service (.env)
PORT=4003
DATABASE_URL="postgresql://username:password@localhost:5432/projects_db"
JWT_SECRET="your-jwt-secret"
AUTH_BASE_URL="http://localhost:4001"
PROFILE_BASE_URL="http://localhost:4002"
REDIS_URL="redis://localhost:6379"
FRONTEND_URL="http://localhost:3000"
```

## Error Responses

### Common Error Codes

- **400 Bad Request**: Invalid request data
- **401 Unauthorized**: Missing or invalid JWT token
- **403 Forbidden**: Insufficient permissions
- **404 Not Found**: Resource not found
- **409 Conflict**: Already applied to project
- **500 Internal Server Error**: Server error

### Example Error Response

```json
{
  "error": "Unauthorized",
  "message": "Invalid or expired token",
  "statusCode": 401
}
```

## Testing Checklist

- [ ] Faculty can create projects
- [ ] Students can view and filter projects
- [ ] Students can apply to projects
- [ ] Faculty can view applications
- [ ] Faculty can accept/reject applications
- [ ] WebSocket events are emitted correctly
- [ ] Caching works (Redis/in-memory fallback)
- [ ] JWT authentication works across services
- [ ] Error handling works properly
- [ ] Rate limiting and validation work

## Troubleshooting

### Common Issues

1. **401 Unauthorized**: Check JWT token validity and format
2. **403 Forbidden**: Verify user role permissions
3. **WebSocket Connection Failed**: Check CORS settings and token
4. **Cache Issues**: Verify Redis connection or in-memory fallback
5. **Service Integration**: Ensure auth/profile services are running

### Debug Endpoints

```http
GET http://localhost:4003/health
GET http://localhost:4003/v1/debug/cache-stats
```

This comprehensive testing guide should help you validate all project service functionality using Postman!
