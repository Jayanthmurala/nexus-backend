# Event Service API Testing Guide

Comprehensive Postman test collection for the Event Service with real-world scenarios, edge cases, and automated test scripts.

## Quick Setup

1. **Import Collection**: Use the JSON collection at the bottom of this document
2. **Configure Environment**: Set up the required Postman environment variables
3. **Run Authentication**: Execute login to get access tokens
4. **Execute Test Suite**: Run the complete test scenarios

## Environment Variables

Create a Postman environment with these variables:

```json
{
  "event_service_url": "http://localhost:4004",
  "auth_service_url": "http://localhost:4001",
  "profile_service_url": "http://localhost:4002",
  "access_token": "",
  "refresh_token": "",
  "event_id": "",
  "user_id": "",
  "student_token": "",
  "faculty_token": "",
  "admin_token": ""
}
```

## Test User Accounts

Set up these test accounts in your system:

```json
{
  "student_email": "student@college.edu",
  "student_password": "password123",
  "faculty_email": "faculty@college.edu", 
  "faculty_password": "password123",
  "dept_admin_email": "deptadmin@college.edu",
  "dept_admin_password": "password123",
  "head_admin_email": "headadmin@college.edu",
  "head_admin_password": "password123"
}
```

## Test Scenarios

### Scenario 1: Multi-Role Authentication Flow

**1.1 Student Login**
```http
POST {{auth_service_url}}/v1/auth/login
Content-Type: application/json

{
  "email": "{{student_email}}",
  "password": "{{student_password}}"
}
```

**Test Script:**
```javascript
pm.test("Student login successful", function () {
    pm.response.to.have.status(200);
    const response = pm.response.json();
    pm.environment.set("student_token", response.accessToken);
    pm.environment.set("access_token", response.accessToken);
});
```

**1.2 Faculty Login**
```http
POST {{auth_service_url}}/v1/auth/login
Content-Type: application/json

{
  "email": "{{faculty_email}}",
  "password": "{{faculty_password}}"
}
```

**Test Script:**
```javascript
pm.test("Faculty login successful", function () {
    pm.response.to.have.status(200);
    const response = pm.response.json();
    pm.environment.set("faculty_token", response.accessToken);
});
```

**1.3 Admin Login**
```http
POST {{auth_service_url}}/v1/auth/login
Content-Type: application/json

{
  "email": "{{dept_admin_email}}",
  "password": "{{dept_admin_password}}"
}
```

**Test Script:**
```javascript
pm.test("Admin login successful", function () {
    pm.response.to.have.status(200);
    const response = pm.response.json();
    pm.environment.set("admin_token", response.accessToken);
});
```

### Scenario 2: Student Badge Eligibility & Event Creation

**2.1 Check Badge Eligibility (Student)**
```http
GET {{event_service_url}}/v1/events/eligibility
Authorization: Bearer {{student_token}}
```

**Test Script:**
```javascript
pm.test("Eligibility check successful", function () {
    pm.response.to.have.status(200);
    const response = pm.response.json();
    pm.expect(response).to.have.property('canCreate');
    pm.expect(response).to.have.property('missingBadges');
    
    if (!response.canCreate) {
        console.log("Missing badges:", response.missingBadges);
        pm.test.skip("Student needs badges to create events");
    }
});
```

**2.2 Create Event (Student - Badge Gated)**
```http
POST {{event_service_url}}/v1/events
Authorization: Bearer {{student_token}}
Content-Type: application/json

{
  "title": "Student Workshop: Web Development Basics",
  "description": "Learn HTML, CSS, and JavaScript fundamentals",
  "startAt": "{{$isoTimestamp}}",
  "endAt": "{{$isoTimestamp}}",
  "type": "WORKSHOP",
  "mode": "HYBRID",
  "location": "Computer Lab 1",
  "meetingUrl": "https://meet.google.com/student-workshop",
  "capacity": 30,
  "visibleToAllDepts": false,
  "departments": ["Computer Science", "Information Technology"],
  "tags": ["web-development", "beginner", "hands-on"]
}
```

**Pre-request Script:**
```javascript
// Generate future timestamps
const now = new Date();
const startTime = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 1 week from now
const endTime = new Date(startTime.getTime() + 4 * 60 * 60 * 1000); // 4 hours later

pm.environment.set("event_start", startTime.toISOString());
pm.environment.set("event_end", endTime.toISOString());
```

**Test Script:**
```javascript
pm.test("Student event creation", function () {
    if (pm.response.code === 403) {
        pm.test("Badge requirement enforced", function () {
            const response = pm.response.json();
            pm.expect(response.message).to.include("badge");
        });
    } else {
        pm.response.to.have.status(200);
        const response = pm.response.json();
        pm.environment.set("student_event_id", response.event.id);
        pm.expect(response.event.moderationStatus).to.eql("PENDING_REVIEW");
    }
});
```

### 3. Get Event by ID
```http
GET {{event_service_url}}/v1/events/{{event_id}}
Authorization: Bearer {{access_token}}
```

**Test Script:**
```javascript
pm.test("Get event successful", function () {
    pm.response.to.have.status(200);
    const response = pm.response.json();
    pm.expect(response).to.have.property('event');
    pm.expect(response.event).to.have.property('id');
    pm.expect(response.event).to.have.property('title');
    pm.expect(response.event).to.have.property('registrationCount');
    pm.expect(response.event).to.have.property('isRegistered');
});
```

### 4. Create Event
```http
POST {{event_service_url}}/v1/events
Authorization: Bearer {{access_token}}
Content-Type: application/json

{
  "title": "Test Workshop",
  "description": "A comprehensive workshop on modern web development",
  "startAt": "2024-12-01T10:00:00Z",
  "endAt": "2024-12-01T16:00:00Z",
  "type": "WORKSHOP",
  "mode": "HYBRID",
  "location": "Room 101, Main Building",
  "meetingUrl": "https://meet.google.com/abc-def-ghi",
  "capacity": 50,
  "visibleToAllDepts": true,
  "departments": [],
  "tags": ["web-development", "javascript", "react"]
}
```

**Test Script:**
```javascript
pm.test("Create event successful", function () {
    pm.response.to.have.status(200);
    const response = pm.response.json();
    pm.expect(response).to.have.property('event');
    pm.environment.set("event_id", response.event.id);
});

pm.test("Event has correct properties", function () {
    const response = pm.response.json();
    pm.expect(response.event.title).to.eql("Test Workshop");
    pm.expect(response.event.type).to.eql("WORKSHOP");
    pm.expect(response.event.mode).to.eql("HYBRID");
});
```

### 5. Update Event
```http
PUT {{event_service_url}}/v1/events/{{event_id}}
Authorization: Bearer {{access_token}}
Content-Type: application/json

{
  "title": "Updated Workshop Title",
  "description": "Updated description",
  "capacity": 75
}
```

**Test Script:**
```javascript
pm.test("Update event successful", function () {
    pm.response.to.have.status(200);
    const response = pm.response.json();
    pm.expect(response.event.title).to.eql("Updated Workshop Title");
    pm.expect(response.event.capacity).to.eql(75);
});
```

### 6. Delete Event
```http
DELETE {{event_service_url}}/v1/events/{{event_id}}
Authorization: Bearer {{access_token}}
```

**Test Script:**
```javascript
pm.test("Delete event successful", function () {
    pm.response.to.have.status(200);
    const response = pm.response.json();
    pm.expect(response.success).to.be.true;
});
```

## Event Registration Endpoints

### 7. Register for Event
```http
POST {{event_service_url}}/v1/events/{{event_id}}/register
Authorization: Bearer {{access_token}}
```

**Test Script:**
```javascript
pm.test("Registration successful", function () {
    pm.response.to.have.status(200);
    const response = pm.response.json();
    pm.expect(response).to.have.property('registration');
    pm.expect(response.registration).to.have.property('eventId');
    pm.expect(response.registration).to.have.property('userId');
});
```

### 8. Unregister from Event
```http
DELETE {{event_service_url}}/v1/events/{{event_id}}/register
Authorization: Bearer {{access_token}}
```

**Test Script:**
```javascript
pm.test("Unregistration successful", function () {
    pm.response.to.have.status(200);
    const response = pm.response.json();
    pm.expect(response.success).to.be.true;
});
```

## Event Moderation (Admin Only)

### 9. Moderate Event - Approve
```http
PATCH {{event_service_url}}/v1/events/{{event_id}}/moderate
Authorization: Bearer {{access_token}}
Content-Type: application/json

{
  "action": "APPROVE",
  "mentorId": "mentor_user_id",
  "mentorName": "Dr. John Smith"
}
```

**Test Script:**
```javascript
pm.test("Event approval successful", function () {
    pm.response.to.have.status(200);
    const response = pm.response.json();
    pm.expect(response.event.moderationStatus).to.eql("APPROVED");
});
```

### 10. Moderate Event - Reject
```http
PATCH {{event_service_url}}/v1/events/{{event_id}}/moderate
Authorization: Bearer {{access_token}}
Content-Type: application/json

{
  "action": "REJECT",
  "rejectionReason": "Event does not meet quality standards"
}
```

**Test Script:**
```javascript
pm.test("Event rejection successful", function () {
    pm.response.to.have.status(200);
    const response = pm.response.json();
    pm.expect(response.event.moderationStatus).to.eql("REJECTED");
});
```

### 11. Moderate Event - Assign
```http
PATCH {{event_service_url}}/v1/events/{{event_id}}/moderate
Authorization: Bearer {{access_token}}
Content-Type: application/json

{
  "action": "ASSIGN",
  "monitorId": "dept_admin_user_id",
  "monitorName": "Prof. Jane Doe"
}
```

## Personal Event Endpoints

### 12. Get My Events
```http
GET {{event_service_url}}/v1/events/mine
Authorization: Bearer {{access_token}}
```

**Test Script:**
```javascript
pm.test("Get my events successful", function () {
    pm.response.to.have.status(200);
    const response = pm.response.json();
    pm.expect(response).to.have.property('events');
    pm.expect(Array.isArray(response.events)).to.be.true;
});
```

### 13. Check Event Creation Eligibility
```http
GET {{event_service_url}}/v1/events/eligibility
Authorization: Bearer {{access_token}}
```

**Test Script:**
```javascript
pm.test("Eligibility check successful", function () {
    pm.response.to.have.status(200);
    const response = pm.response.json();
    pm.expect(response).to.have.property('canCreate');
    pm.expect(response).to.have.property('missingBadges');
});
```

## Export Endpoints (Faculty Only)

### 14. Export Event Registrations
```http
GET {{event_service_url}}/v1/events/{{event_id}}/export
Authorization: Bearer {{access_token}}
```

**Test Script:**
```javascript
pm.test("Export successful", function () {
    pm.response.to.have.status(200);
    pm.expect(pm.response.headers.get('Content-Type')).to.include('text/csv');
    pm.expect(pm.response.headers.get('Content-Disposition')).to.include('attachment');
});
```

## Error Scenarios

### 15. Unauthorized Access
```http
GET {{event_service_url}}/v1/events
```

**Test Script:**
```javascript
pm.test("Unauthorized access blocked", function () {
    pm.response.to.have.status(401);
});
```

### 16. Event Not Found
```http
GET {{event_service_url}}/v1/events/non-existent-id
Authorization: Bearer {{access_token}}
```

**Test Script:**
```javascript
pm.test("Event not found", function () {
    pm.response.to.have.status(404);
    const response = pm.response.json();
    pm.expect(response.message).to.eql("Not found");
});
```

### 17. Invalid Event Data
```http
POST {{event_service_url}}/v1/events
Authorization: Bearer {{access_token}}
Content-Type: application/json

{
  "title": "",
  "description": "",
  "startAt": "invalid-date",
  "endAt": "2024-12-01T10:00:00Z",
  "type": "INVALID_TYPE"
}
```

**Test Script:**
```javascript
pm.test("Validation error", function () {
    pm.response.to.have.status(400);
});
```

### 18. Capacity Full Registration
```http
POST {{event_service_url}}/v1/events/{{event_id}}/register
Authorization: Bearer {{access_token}}
```

**Test Script (when event is full):**
```javascript
pm.test("Event full error", function () {
    pm.response.to.have.status(400);
    const response = pm.response.json();
    pm.expect(response.message).to.eql("Event is full");
});
```

### 19. Duplicate Registration
```http
POST {{event_service_url}}/v1/events/{{event_id}}/register
Authorization: Bearer {{access_token}}
```

**Test Script (when already registered):**
```javascript
pm.test("Duplicate registration error", function () {
    pm.response.to.have.status(409);
    const response = pm.response.json();
    pm.expect(response.message).to.eql("Already registered");
});
```

## Collection Variables for Testing

Set these in your Postman collection variables:

```json
{
  "student_email": "student@example.com",
  "student_password": "password123",
  "faculty_email": "faculty@example.com",
  "faculty_password": "password123",
  "admin_email": "admin@example.com",
  "admin_password": "password123"
}
```

## Pre-request Scripts

### Global Authentication
Add this to your collection's pre-request script:

```javascript
// Auto-refresh token if expired
const token = pm.environment.get("access_token");
if (!token) {
    // Redirect to login if no token
    pm.test.skip("No access token available");
}
```

### Date Helpers
```javascript
// Generate future dates for event testing
const now = new Date();
const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

pm.environment.set("tomorrow_iso", tomorrow.toISOString());
pm.environment.set("next_week_iso", nextWeek.toISOString());
```

## Test Data Cleanup

### Cleanup Script
Add this to your collection's test script for cleanup:

```javascript
// Clean up test events after test suite
pm.test("Cleanup test data", function () {
    if (pm.environment.get("event_id")) {
        pm.sendRequest({
            url: pm.environment.get("event_service_url") + "/v1/events/" + pm.environment.get("event_id"),
            method: 'DELETE',
            header: {
                'Authorization': 'Bearer ' + pm.environment.get("access_token")
            }
        }, function (err, response) {
            console.log("Cleanup completed");
        });
    }
});
```

## Running Tests

1. **Import Collection**: Import this as a Postman collection
2. **Set Environment**: Configure the environment variables
3. **Run Authentication**: Execute login request first
4. **Run Test Suite**: Execute all requests in sequence
5. **Check Results**: Review test results and response data

## Notes

- Ensure the event service is running on `localhost:4004`
- Some endpoints require specific roles (FACULTY, DEPT_ADMIN, HEAD_ADMIN)
- Student event creation requires badge eligibility
- Event capacity is enforced with database transactions
- All datetime fields should be in ISO 8601 format
