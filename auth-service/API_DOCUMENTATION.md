# Auth Service API Documentation

This document provides comprehensive documentation for the Auth Service APIs including authentication and college management endpoints.

## Base URL

```
http://localhost:4001
```

## Authentication APIs

### 1. Register User

**POST** `/v1/auth/register`

Creates a new user account with college and department validation.

**Request Body:**

```json
{
  "displayName": "John Doe",
  "email": "john.doe@example.com",
  "password": "SecurePassword123!",
  "role": "STUDENT",
  "collegeId": "clxxxxx",
  "department": "Computer Science",
  "collegeMemberId": "CS2024001",
  "year": 2024
}
```

**Response (201):**

```json
{
  "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "clxxxxx",
    "email": "john.doe@example.com",
    "displayName": "John Doe",
    "roles": ["STUDENT"],
    "avatarUrl": null
  }
}
```

**Validation Rules:**

- Email must be unique
- College must exist and be active
- Department must exist in the selected college
- Year is required for STUDENT role
- collegeMemberId must be unique within the college (if provided)

**Available Roles:**

- `STUDENT`
- `FACULTY`
- `DEPT_ADMIN`
- `PLACEMENTS_ADMIN`
- `HEAD_ADMIN`

### 2. Login User

**POST** `/v1/auth/login`

Authenticates a user and returns access token.

**Request Body:**

```json
{
  "email": "john.doe@example.com",
  "password": "SecurePassword123!"
}
```

**Response (200):**

```json
{
  "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "clxxxxx",
    "email": "john.doe@example.com",
    "displayName": "John Doe",
    "roles": ["STUDENT"],
    "avatarUrl": null
  }
}
```

### 3. Get Current User

**GET** `/v1/auth/me`

Returns current authenticated user information.

**Headers:**

```
Authorization: Bearer <access_token>
```

**Response (200):**

```json
{
  "id": "clxxxxx",
  "email": "john.doe@example.com",
  "displayName": "John Doe",
  "roles": ["STUDENT"],
  "avatarUrl": null,
  "collegeId": "clxxxxx",
  "department": "Computer Science",
  "year": 2024,
  "collegeMemberId": "CS2024001"
}
```

### 4. Refresh Token

**POST** `/v1/auth/refresh`

Refreshes the access token using the refresh token cookie.

**Response (200):**

```json
{
  "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### 5. Logout

**POST** `/v1/auth/logout`

Logs out the user and invalidates the refresh token.

**Headers:**

```
Authorization: Bearer <access_token>
```

**Response (200):**

```json
{
  "message": "Logged out successfully"
}
```

### 6. Forgot Password

**POST** `/v1/auth/forgot-password`

Sends a password reset email to the user.

**Request Body:**

```json
{
  "email": "john.doe@example.com"
}
```

**Response (200):**

```json
{
  "message": "Password reset email sent"
}
```

### 7. Reset Password

**POST** `/v1/auth/reset-password`

Resets the user's password using a reset token.

**Request Body:**

```json
{
  "token": "reset_token_here",
  "newPassword": "NewSecurePassword123!"
}
```

**Response (200):**

```json
{
  "message": "Password reset successfully"
}
```

### 8. Verify Email

**POST** `/v1/auth/verify-email`

Verifies a user's email address using a verification token.

**Request Body:**

```json
{
  "token": "verification_token_here"
}
```

**Response (200):**

```json
{
  "message": "Email verified successfully"
}
```

### 9. Resend Verification Email

**POST** `/v1/auth/resend-verification`

Resends the email verification email.

**Request Body:**

```json
{
  "email": "john.doe@example.com"
}
```

**Response (200):**

```json
{
  "message": "Verification email sent"
}
```

### 10. OAuth Exchange

**POST** `/v1/auth/oauth/exchange`

Exchanges OAuth provider tokens for application tokens.

**Request Body:**

```json
{
  "provider": "google",
  "accessToken": "google_access_token_here"
}
```

**Response (200):**

```json
{
  "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "clxxxxx",
    "email": "john.doe@gmail.com",
    "displayName": "John Doe",
    "roles": ["STUDENT"],
    "avatarUrl": "https://lh3.googleusercontent.com/..."
  }
}
```

**Supported Providers:**

- `google`
- `github`

<<<<<<< HEAD

## User Management APIs

### 11. Update User Profile

**PUT** `/v1/users/:userId`

Updates user profile information including displayName, avatarUrl, year, and department.

**Request Headers:**

```
Authorization: Bearer <access_token>
```

**Request Body:**

```json
{
  "displayName": "John Smith",
  "avatarUrl": "https://example.com/avatar.jpg",
  "year": 3,
  "department": "Computer Science"
}
```

**Response (200):**

```json
{
  "id": "clxxxxx",
  "email": "john.doe@example.com",
  "displayName": "John Smith",
  "avatarUrl": "https://example.com/avatar.jpg",
  "roles": ["STUDENT"],
  "collegeId": "clxxxxx",
  "department": "Computer Science",
  "year": 3,
  "collegeMemberId": "CS2024001",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

**Validation Rules:**

- Only the user themselves or admins can update user profiles
- Year must be between 1-6 for students
- Department must exist in the user's college
- displayName must be 1-100 characters
- avatarUrl must be a valid URL

=======

> > > > > > > 091fbe9419d7afb4051128fac039f76cbc90d0b4

## College Management APIs

### 1. List Colleges

**GET** `/v1/colleges`

Returns a paginated list of colleges (public endpoint).

**Query Parameters:**

- `active` (optional): "true" or "false" to filter by active status
- `limit` (optional): Number of results (max 100, default 50)
- `offset` (optional): Number of results to skip (default 0)

**Example Request:**

```
GET /v1/colleges?active=true&limit=10&offset=0
```

**Response (200):**

```json
{
  "colleges": [
    {
      "id": "clxxxxx",
      "name": "MIT College of Engineering",
      "code": "MITCOE",
      "location": "Pune, Maharashtra",
      "website": "https://mitcoe.edu.in",
      "departments": [
        "Computer Science",
        "Information Technology",
        "Electronics",
        "Mechanical"
      ],
      "isActive": true,
      "createdAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 1
}
```

### 2. Get College by ID

**GET** `/v1/colleges/:id`

Returns details of a specific college (public endpoint).

**Example Request:**

```
GET /v1/colleges/clxxxxx
```

**Response (200):**

```json
{
  "id": "clxxxxx",
  "name": "MIT College of Engineering",
  "code": "MITCOE",
  "location": "Pune, Maharashtra",
  "website": "https://mitcoe.edu.in",
  "departments": [
    "Computer Science",
    "Information Technology",
    "Electronics",
    "Mechanical"
  ],
  "isActive": true,
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

### 3. Create College

**POST** `/v1/colleges`

Creates a new college (HEAD_ADMIN only).

**Headers:**

```
Authorization: Bearer <head_admin_access_token>
```

**Request Body:**

```json
{
  "name": "MIT College of Engineering",
  "code": "MITCOE",
  "location": "Pune, Maharashtra",
  "website": "https://mitcoe.edu.in",
  "departments": [
    "Computer Science",
    "Information Technology",
    "Electronics",
    "Mechanical"
  ],
  "isActive": true
}
```

**Response (201):**

```json
{
  "id": "clxxxxx",
  "name": "MIT College of Engineering",
  "code": "MITCOE",
  "location": "Pune, Maharashtra",
  "website": "https://mitcoe.edu.in",
  "departments": [
    "Computer Science",
    "Information Technology",
    "Electronics",
    "Mechanical"
  ],
  "isActive": true,
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

### 4. Update College

**PUT** `/v1/colleges/:id`

Updates an existing college (HEAD_ADMIN only).

**Headers:**

```
Authorization: Bearer <head_admin_access_token>
```

**Request Body (all fields optional):**

```json
{
  "name": "MIT College of Engineering - Updated",
  "location": "Pune, Maharashtra, India",
  "departments": [
    "Computer Science",
    "Information Technology",
    "Electronics",
    "Mechanical",
    "Civil"
  ]
}
```

**Response (200):**

```json
{
  "id": "clxxxxx",
  "name": "MIT College of Engineering - Updated",
  "code": "MITCOE",
  "location": "Pune, Maharashtra, India",
  "website": "https://mitcoe.edu.in",
  "departments": [
    "Computer Science",
    "Information Technology",
    "Electronics",
    "Mechanical",
    "Civil"
  ],
  "isActive": true,
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T12:45:00Z"
}
```

### 5. Delete College

**DELETE** `/v1/colleges/:id`

Deletes a college (HEAD_ADMIN only). Cannot delete if college has users.

**Headers:**

```
Authorization: Bearer <head_admin_access_token>
```

**Response (204):**
No content

**Error Response (409) - College has users:**

```json
{
  "message": "Cannot delete college with existing users"
}
```

### 6. Get College Departments

**GET** `/v1/colleges/:id/departments`

Returns the list of departments for a specific college (public endpoint).

**Example Request:**

```
GET /v1/colleges/clxxxxx/departments
```

**Response (200):**

```json
{
  "departments": [
    "Computer Science",
    "Information Technology",
    "Electronics",
    "Mechanical"
  ]
}
```

## Error Responses

All endpoints may return the following error responses:

### 400 Bad Request

```json
{
  "message": "Invalid request data"
}
```

### 401 Unauthorized

```json
{
  "message": "Unauthorized"
}
```

### 403 Forbidden

```json
{
  "message": "Insufficient permissions - HEAD_ADMIN required"
}
```

### 404 Not Found

```json
{
  "message": "Resource not found"
}
```

### 409 Conflict

```json
{
  "message": "Email already in use"
}
```

### 500 Internal Server Error

```json
{
  "message": "Internal server error"
}
```

## Authentication Flow

1. **Registration**: User registers with college and department details
2. **Login**: User authenticates and receives access token + refresh cookie
3. **API Calls**: Include `Authorization: Bearer <access_token>` header
4. **Token Refresh**: When access token expires, use refresh endpoint
5. **Logout**: Invalidate refresh token

## Security Notes

- Access tokens are JWT with RS256 signing
- Refresh tokens are stored as httpOnly cookies
- Passwords are hashed with Argon2
- Email verification required for new accounts
- Rate limiting applied to sensitive endpoints
- CORS configured for frontend domains

<<<<<<< HEAD

## JWT Token Structure

### Access Token Claims

```json
{
  "sub": "user_id",
  "email": "user@example.com",
  "displayName": "User Name",
  "roles": ["STUDENT"],
  "collegeId": "college_id",
  "department": "Computer Science",
  "year": 2024,
  "collegeMemberId": "CS2024001",
  "tokenVersion": 1,
  "iss": "nexus-auth",
  "aud": "nexus",
  "iat": 1640995200,
  "exp": 1640998800
}
```

### Token Validation

- **Algorithm**: RS256
- **Public Key**: Available at `/.well-known/jwks.json`
- **Expiry**: 1 hour for access tokens
- **Refresh**: 7 days for refresh tokens

## Rate Limiting

| Endpoint                       | Rate Limit   | Window     |
| ------------------------------ | ------------ | ---------- |
| `/v1/auth/login`               | 5 requests   | 15 minutes |
| `/v1/auth/register`            | 3 requests   | 15 minutes |
| `/v1/auth/forgot-password`     | 3 requests   | 15 minutes |
| `/v1/auth/resend-verification` | 3 requests   | 15 minutes |
| All other endpoints            | 100 requests | 15 minutes |

=======

> > > > > > > 091fbe9419d7afb4051128fac039f76cbc90d0b4

## Development Notes

### TypeScript Type Issues

When working with Prisma nullable fields and function parameters, be aware of type mismatches:

**Issue**: Prisma nullable fields (`String?`) return `string | null`, but functions expecting optional parameters use `string | undefined`.

# <<<<<<< HEAD

**Example Problem**:

```typescript
// Prisma schema: collegeId String?
// Function signature: canCreateRole(userRoles: string[], targetRole: string, userCollegeId?: string, targetCollegeId?: string)

// This causes TypeScript error:
canCreateRole(
  adminUser.roles,
  data.roles[0],
  adminUser.collegeId,
  data.collegeId
);
// Error: Argument of type 'string | null' is not assignable to parameter of type 'string | undefined'
```

> > > > > > > 091fbe9419d7afb4051128fac039f76cbc90d0b4
> > > > > > > **Solution**: Use nullish coalescing to convert `null` to `undefined`:

```typescript
canCreateRole(
  adminUser.roles,
  data.roles[0],
  adminUser.collegeId ?? undefined,
  data.collegeId
);
```

<<<<<<< HEAD

### Email Configuration

For development, if `SMTP_HOST` is not configured, the service uses Ethereal Email:

- Test emails are captured and viewable via debug URLs
- Response includes `debugPreviewUrl` for easy email testing
- Production should use real SMTP configuration

## Development Setup

1. **Environment Setup**

```bash
cp .env.example .env
# Configure DATABASE_URL, JWT keys, and optional SMTP
```

2. **Generate RSA Keys**

```bash
npx tsx scripts/generate-keys.ts
# Copy output to .env AUTH_JWT_* variables
```

3. **Database Setup**

```bash
npm install
npx prisma generate
npx prisma migrate dev --name init
```

4. **Start Server**

```bash
npm run dev
```

**Service URLs:**

- API: http://localhost:4001
- Swagger Documentation: http://localhost:4001/docs
- JWKS Endpoint: http://localhost:4001/.well-known/jwks.json
- # Health Check: http://localhost:4001/health
  This pattern applies to any Prisma nullable field being passed to functions expecting optional parameters.

## Development Setup

1. Set environment variables in `.env`
2. Run database migrations: `npm run db:migrate`
3. Generate Prisma client: `npx prisma generate`
4. Start server: `npm run dev`

Server runs on `http://localhost:4001` with Swagger docs at `/docs`.

> > > > > > > 091fbe9419d7afb4051128fac039f76cbc90d0b4
