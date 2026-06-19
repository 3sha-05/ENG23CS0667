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

---

# Stage 2

## Database Design & Persistent Storage

### Database Choice: PostgreSQL (SQL)

**Rationale:**
- ACID compliance ensures notification data integrity
- Strong schema enforcement prevents data inconsistencies
- Excellent for relational queries (user → notifications, metadata)
- Proven scalability with proper indexing and partitioning
- JSON support for flexible metadata storage
- Cost-effective and open-source

**Alternatives considered:**
- MongoDB: Less suitable due to lack of transaction support for complex operations
- Redis: In-memory, not ideal for long-term persistent storage
- Cassandra: Better for time-series, overkill for this use case

### Database Schema

```sql
-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notifications table
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  type VARCHAR(50) NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for performance
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(user_id, is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at DESC);

-- Partitioning by user_id for scalability
CREATE TABLE notifications_p1 PARTITION OF notifications
  FOR VALUES FROM (MINVALUE) TO ('50000000-0000-0000-0000-000000000000');

CREATE TABLE notifications_p2 PARTITION OF notifications
  FOR VALUES FROM ('50000000-0000-0000-0000-000000000000') TO (MAXVALUE);
```

### Scalability Challenges & Solutions

#### Challenge 1: High Write Volume
**Problem:** As users increase, notification creation rate grows exponentially.

**Solution:**
- **Partitioning:** Distribute notifications across multiple tables by user_id
- **Connection pooling:** Use PgBouncer to manage database connections
- **Batch inserts:** Group notifications for bulk insert operations
- **Async workers:** Use message queues (RabbitMQ, Kafka) to decouple creation from persistence

#### Challenge 2: Query Performance on Large Datasets
**Problem:** Fetching user notifications becomes slow as table grows.

**Solution:**
- **Composite indexes:** Index on (user_id, is_read, created_at)
- **Time-based partitioning:** Archive old notifications to separate table
- **Pagination:** Implement cursor-based pagination for API responses
- **Caching:** Use Redis for frequently accessed notification lists

#### Challenge 3: Storage Growth
**Problem:** Disk usage increases rapidly with millions of notifications.

**Solution:**
- **Data archival:** Move notifications older than 90 days to archive table
- **Compression:** Use table compression for historical data
- **TTL policies:** Automatically delete notifications after retention period
- **Vacuum & analyze:** Regular maintenance to reclaim disk space

#### Challenge 4: Concurrent Updates
**Problem:** Race conditions when marking notifications as read.

**Solution:**
- **Row-level locking:** PostgreSQL handles this automatically
- **Optimistic locking:** Add version field and check before update
- **Batch updates:** Group mark-as-read operations

---

## SQL Queries for REST API Operations

### 1. Fetch Notifications (GET /api/notifications)
```sql
SELECT 
  id, 
  title, 
  body, 
  type, 
  is_read, 
  created_at, 
  metadata
FROM notifications
WHERE user_id = $1
ORDER BY created_at DESC
LIMIT 20 OFFSET $2;
```

### 2. Mark Notification as Read (PATCH /api/notifications/:id/read)
```sql
UPDATE notifications
SET is_read = TRUE, updated_at = CURRENT_TIMESTAMP
WHERE id = $1 AND user_id = $2
RETURNING id, is_read;
```

### 3. Delete Notification (DELETE /api/notifications/:id)
```sql
DELETE FROM notifications
WHERE id = $1 AND user_id = $2
RETURNING id;
```

### 4. Create Notification (POST /api/notifications)
```sql
INSERT INTO notifications (user_id, title, body, type, metadata)
VALUES ($1, $2, $3, $4, $5::jsonb)
RETURNING id, created_at;
```

### 5. Get Unread Count
```sql
SELECT COUNT(*) as unread_count
FROM notifications
WHERE user_id = $1 AND is_read = FALSE;
```

### 6. Mark All Notifications as Read
```sql
UPDATE notifications
SET is_read = TRUE, updated_at = CURRENT_TIMESTAMP
WHERE user_id = $1 AND is_read = FALSE;
```

### 7. Batch Delete Notifications
```sql
DELETE FROM notifications
WHERE user_id = $1 AND id = ANY($2::uuid[])
RETURNING id;
```

### 8. Archive Old Notifications
```sql
INSERT INTO notifications_archive
SELECT * FROM notifications
WHERE created_at < CURRENT_DATE - INTERVAL '90 days';

DELETE FROM notifications
WHERE created_at < CURRENT_DATE - INTERVAL '90 days';
```

---

## Performance Tuning Recommendations

1. **Enable pg_stat_statements** to monitor slow queries
2. **Set shared_buffers to 25% of available RAM**
3. **Configure autovacuum** for regular maintenance
4. **Use read replicas** for read-heavy workloads
5. **Implement connection pooling** with PgBouncer or pgpool
6. **Monitor query execution plans** with EXPLAIN ANALYZE

---

## Data Retention Policy

- **Active notifications:** Keep indefinitely or until user deletes
- **Read notifications:** Archive after 90 days
- **Deleted notifications:** Hard delete immediately or soft delete with flag
- **Metadata:** Compress and archive after 180 days
