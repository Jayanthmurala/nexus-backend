# Backend Admin API Documentation

This document provides comprehensive documentation for the Backend Admin APIs used for system administration tasks including college and user management.

## Base URL
```
http://localhost:4001
```

## Authentication
Backend admin endpoints require specific roles and valid JWT token in the Authorization header:

- **College Management APIs**: Require **SUPER_ADMIN** role (backend-only, not for frontend access)
- **User Management APIs**: Require **HEAD_ADMIN** role

```
Authorization: Bearer <jwt_token>
```

**Note**: SUPER_ADMIN is a backend-only administrative role for system-level operations like college creation. It should not be used for frontend application access.

---

## College Management APIs

### 1. Create College
**POST** `/v1/admin/colleges`

Creates a new college with departments.

**Request Body:**
```json
{
  "name": "University of Technology",
  "code": "UOT",
  "location": "New York, NY",
  "website": "https://uot.edu",
  "departments": [
    "Computer Science",
    "Electrical Engineering",
    "Mechanical Engineering",
    "Business Administration"
  ],
  "isActive": true
}
```

**Response (201):**
```json
{
  "id": "clxxxxx",
  "name": "University of Technology",
  "code": "UOT",
  "location": "New York, NY",
  "website": "https://uot.edu",
  "departments": ["Computer Science", "Electrical Engineering", "Mechanical Engineering", "Business Administration"],
  "isActive": true,
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

**Error Responses:**
- `400` - Invalid request data
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (insufficient permissions)
- `409` - Conflict (college name or code already exists)

### 2. List Colleges with Statistics
**GET** `/v1/admin/colleges`

Retrieves all colleges with user statistics.

**Query Parameters:**
- `includeInactive` (optional): `"true"` | `"false"` - Include inactive colleges (default: false)

**Response (200):**
```json
{
  "colleges": [
    {
      "id": "clxxxxx",
      "name": "University of Technology",
      "code": "UOT",
      "location": "New York, NY",
      "website": "https://uot.edu",
      "departments": ["Computer Science", "Electrical Engineering"],
      "isActive": true,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z",
      "userCount": 1250,
      "studentCount": 1000,
      "facultyCount": 250
    }
  ]
}
```

---

## User Management APIs

### 3. Create User
**POST** `/v1/admin/users`

Creates a new user account with role and college assignment.

**Request Body:**
```json
{
  "displayName": "John Doe",
  "email": "john.doe@uot.edu",
  "password": "SecurePassword123!",
  "roles": ["STUDENT"],
  "collegeId": "clxxxxx",
  "department": "Computer Science",
  "year": 2024,
  "collegeMemberId": "CS2024001",
  "status": "ACTIVE",
  "emailVerifiedAt": "2024-01-15T10:30:00.000Z"
}
```

**Field Descriptions:**
- `displayName`: Full name of the user
- `email`: Unique email address
- `password`: Plain text password (optional, random generated if not provided)
- `roles`: Array of roles (`STUDENT`, `FACULTY`, `DEPT_ADMIN`, `PLACEMENTS_ADMIN`, `HEAD_ADMIN`)
- `collegeId`: Valid college ID
- `department`: Department name (must exist in the college)
- `year`: Graduation year (optional, for students)
- `collegeMemberId`: College-specific ID (optional, e.g., student ID, employee ID)
- `status`: Account status (optional, default: `ACTIVE`)
- `emailVerifiedAt`: Email verification timestamp (optional, auto-set if not provided)

**Response (201):**
```json
{
  "id": "cluxxxxx",
  "email": "john.doe@uot.edu",
  "displayName": "John Doe",
  "roles": ["STUDENT"],
  "status": "ACTIVE",
  "collegeId": "clxxxxx",
  "department": "Computer Science",
  "year": 2024,
  "collegeMemberId": "CS2024001",
  "emailVerifiedAt": "2024-01-15T10:30:00.000Z",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

**Error Responses:**
- `400` - Invalid request data or college/department not found
- `401` - Unauthorized
- `403` - Forbidden
- `409` - Conflict (email or college member ID already exists)

### 4. Create Multiple Users (Bulk)
**POST** `/v1/admin/users/bulk`

Creates multiple user accounts in a single request. Maximum 1000 users per batch.

**Request Body:**
```json
{
  "users": [
    {
      "displayName": "Alice Smith",
      "email": "alice.smith@uot.edu",
      "roles": ["STUDENT"],
      "collegeId": "clxxxxx",
      "department": "Computer Science",
      "year": 2024,
      "collegeMemberId": "CS2024002"
    },
    {
      "displayName": "Bob Johnson",
      "email": "bob.johnson@uot.edu",
      "roles": ["FACULTY"],
      "collegeId": "clxxxxx",
      "department": "Computer Science",
      "collegeMemberId": "FAC001"
    }
  ],
  "defaultPassword": "TempPassword123!",
  "autoVerifyEmails": true
}
```

**Field Descriptions:**
- `users`: Array of user objects (same structure as single user creation)
- `defaultPassword`: Default password for users without individual passwords (optional)
- `autoVerifyEmails`: Automatically verify all user emails (optional, default: false)

**Response (200):**
```json
{
  "created": [
    {
      "id": "cluxxxxx",
      "email": "alice.smith@uot.edu",
      "displayName": "Alice Smith",
      "roles": ["STUDENT"],
      "status": "ACTIVE",
      "collegeId": "clxxxxx",
      "department": "Computer Science",
      "year": 2024,
      "collegeMemberId": "CS2024002",
      "emailVerifiedAt": "2024-01-15T10:30:00.000Z",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "failed": [
    {
      "email": "bob.johnson@uot.edu",
      "error": "Email already exists"
    }
  ],
  "summary": {
    "total": 2,
    "successful": 1,
    "failed": 1
  }
}
```

**Error Responses:**
- `400` - Invalid request data
- `401` - Unauthorized
- `403` - Forbidden

---

## Usage Examples

### Example 1: Setting up a new college with users

1. **Create College:**
```bash
curl -X POST http://localhost:4001/v1/admin/colleges \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Tech University",
    "code": "TECH",
    "departments": ["Computer Science", "Data Science", "AI/ML"]
  }'
```

2. **Create Faculty Users:**
```bash
curl -X POST http://localhost:4001/v1/admin/users/bulk \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "users": [
      {
        "displayName": "Dr. Jane Smith",
        "email": "jane.smith@tech.edu",
        "roles": ["FACULTY"],
        "collegeId": "clxxxxx",
        "department": "Computer Science",
        "collegeMemberId": "FAC001"
      }
    ],
    "defaultPassword": "FacultyPass123!",
    "autoVerifyEmails": true
  }'
```

3. **Create Student Users:**
```bash
curl -X POST http://localhost:4001/v1/admin/users/bulk \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "users": [
      {
        "displayName": "John Doe",
        "email": "john.doe@tech.edu",
        "roles": ["STUDENT"],
        "collegeId": "clxxxxx",
        "department": "Computer Science",
        "year": 2024,
        "collegeMemberId": "CS2024001"
      }
    ],
    "defaultPassword": "StudentPass123!",
    "autoVerifyEmails": true
  }'
```

### Example 2: CSV Import Workflow

For importing users from CSV files, you can:

1. Parse CSV data into the bulk user format
2. Split large datasets into batches of 1000 users
3. Use the bulk create endpoint for each batch
4. Handle failed records appropriately

---

## Security Notes

- All endpoints require HEAD_ADMIN role
- Passwords are automatically hashed using bcrypt
- Email addresses are automatically converted to lowercase
- College and department validation is enforced
- Duplicate email and college member ID prevention
- Rate limiting should be implemented for bulk operations

---

## Development Notes

### TypeScript Type Issues

When working with Prisma nullable fields and function parameters, be aware of type mismatches:

**Issue**: Prisma nullable fields (`String?`) return `string | null`, but functions expecting optional parameters use `string | undefined`.

**Example Problem**:
```typescript
// Prisma schema: collegeId String?
// Function signature: canCreateRole(userRoles: string[], targetRole: string, userCollegeId?: string, targetCollegeId?: string)

// This causes TypeScript error:
canCreateRole(adminUser.roles, data.roles[0], adminUser.collegeId, data.collegeId)
// Error: Argument of type 'string | null' is not assignable to parameter of type 'string | undefined'
```

**Solution**: Use nullish coalescing to convert `null` to `undefined`:
```typescript
canCreateRole(adminUser.roles, data.roles[0], adminUser.collegeId ?? undefined, data.collegeId)
```

This pattern applies to any Prisma nullable field being passed to functions expecting optional parameters.

---

## Error Handling

All endpoints return consistent error responses:

```json
{
  "message": "Error description",
  "details": "Additional error context (optional)"
}
```

Common HTTP status codes:
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (insufficient permissions)
- `409` - Conflict (duplicate data)
- `500` - Internal Server Error
- `fac002@vishnu.edu.in` -> 123456789
