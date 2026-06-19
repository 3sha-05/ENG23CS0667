# Stage 1

## Notification System Design

Assume a front-end developer colleague has asked for REST API design, contract, and structure to display notifications to users when they are logged in. This document defines the core actions the notification platform should support, the REST endpoints, request and response schemas, headers, and a real-time notification mechanism.

### Core platform actions
- Fetch user notifications
- Mark a notification as read
- Delete a notification
- Create/send a notification (backend/service)
- Subscribe to real-time notification updates

## API Endpoints

### 1. Fetch Notifications
- Endpoint: `GET /api/notifications`
- Purpose: Return the authenticated user's notification list.
- Headers:
  - `Authorization: Bearer <access_token>`
  - `Accept: application/json`
- Response:
```json
{
  "notifications": [
    {
      "id": "notif-123",
      "title": "New message",
      "body": "You have a new message from John.",
      "type": "message",
      "isRead": false,
      "createdAt": "2026-06-19T10:00:00Z",
      "meta": {
        "source": "chat",
        "priority": "normal"
      }
    }
  ]
}
```

### 2. Mark Notification as Read
- Endpoint: `PATCH /api/notifications/:id/read`
- Purpose: Mark a single notification as read.
- Headers:
  - `Authorization: Bearer <access_token>`
  - `Content-Type: application/json`
- Request body: none
- Response:
```json
{
  "id": "notif-123",
  "isRead": true
}
```

### 3. Delete Notification
- Endpoint: `DELETE /api/notifications/:id`
- Purpose: Remove a notification from the user's list.
- Headers:
  - `Authorization: Bearer <access_token>`
  - `Content-Type: application/json`
- Response:
```json
{
  "id": "notif-123",
  "deleted": true
}
```

### 4. Create Notification (Backend/Service)
- Endpoint: `POST /api/notifications`
- Purpose: Create a new notification for a target user.
- Headers:
  - `Authorization: Bearer <service_token>`
  - `Content-Type: application/json`
- Request body:
```json
{
  "userId": "user-456",
  "title": "Account update",
  "body": "Your profile has been updated.",
  "type": "system",
  "meta": {
    "priority": "high"
  }
}
```
- Response:
```json
{
  "id": "notif-456",
  "createdAt": "2026-06-19T10:05:00Z"
}
```

## JSON Schemas

### Notification Object
```json
{
  "id": "string",
  "title": "string",
  "body": "string",
  "type": "string",
  "isRead": "boolean",
  "createdAt": "string",
  "meta": {
    "source": "string",
    "priority": "string"
  }
}
```

### Auth Headers
- `Authorization: Bearer <access_token>` for user-facing endpoints
- `Authorization: Bearer <service_token>` for backend/service endpoints

## Real-time Notification Mechanism
- Recommended transport: Server-Sent Events (SSE) or WebSocket
- Client connects after login using:
  - `GET /api/notifications/stream` for SSE
  - or `ws://.../api/notifications/ws` for WebSocket
- Real-time payload example:
```json
{
  "event": "notification.created",
  "data": {
    "id": "notif-789",
    "title": "New alert",
    "body": "Your report is ready.",
    "type": "alert",
    "createdAt": "2026-06-19T10:10:00Z"
  }
}
```
- Client updates the UI immediately when a new event arrives.

## Notes
- Use predictable RESTful naming conventions.
- Protect notification endpoints with bearer token authentication.
- Return consistent JSON payloads and HTTP status codes.
