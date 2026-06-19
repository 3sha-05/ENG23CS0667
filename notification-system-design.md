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

---

# Stage 3

## Query Performance Analysis & Optimization

### Problem Query
```sql
SELECT * FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt ASC;
```

**Current state:**
- 50,000 students
- 5,000,000 notifications
- Query is slow and blocking the API

---

### Why Is This Query Slow?

1. **No Index on WHERE clause:** 
   - Requires full table scan of 5M rows
   - CPU cost: O(n) where n = 5,000,000

2. **SELECT * (Anti-pattern):**
   - Unnecessary column retrieval
   - Increases network I/O and memory usage
   - Wider rows = fewer fit in memory cache

3. **No Index on ORDER BY:**
   - Results must be sorted after filtering
   - Full sort on potentially large result set
   - Cost: O(n log n) for sort operation

4. **Missing composite index:**
   - Database can't use index-based filtering + ordering
   - Falls back to inefficient query plan

**Estimated cost with current schema:**
- Table scan: ~2-3 seconds (5M rows)
- Sort operation: ~1-2 seconds
- Network transfer: ~500ms - 2s (depending on result size)
- **Total: 3.5 - 7+ seconds per request**

---

### Optimized Query & Solution

#### Step 1: Create Composite Index
```sql
CREATE INDEX idx_notifications_student_unread_created 
ON notifications(studentID, isRead, createdAt DESC)
WHERE isRead = false;

-- Partial index to reduce size
-- Only indexes unread notifications (smaller, faster)
-- Descending on createdAt for faster recent-first queries
```

#### Step 2: Optimized Query
```sql
SELECT 
  id, 
  title, 
  body, 
  type, 
  is_read, 
  created_at
FROM notifications
WHERE studentID = $1 AND isRead = false
ORDER BY createdAt DESC
LIMIT 20 OFFSET $2;
```

**Why this is faster:**
- Index covers all WHERE + ORDER BY columns
- Partial index only stores ~10-20% of data
- Descending order matches user expectation (newest first)
- LIMIT/OFFSET enables pagination
- Selected columns only, no SELECT *

**New estimated cost:**
- Index lookup: ~10-50ms (binary search on indexed subset)
- Fetch 20 rows: ~5-20ms
- Network transfer: ~10-50ms
- **Total: 50-120ms (30-100x faster)**

---

### Index Strategy: Effective or Not?

**Question:** Should we index every column?

**Answer: NO**

**Why indexing every column is ineffective:**

1. **Write Performance Penalty:**
   - Every INSERT, UPDATE, DELETE must update ALL indexes
   - 100 indexes = 100x slower writes
   - Current: INSERT could take 2-5ms → becomes 200-500ms

2. **Storage Overhead:**
   - Each index = copy of data
   - 100 indexes on 5M rows = massive storage cost
   - Index maintenance becomes expensive

3. **Query Planner Confusion:**
   - Too many options → suboptimal plan selection
   - More indexes = longer optimization time

4. **Maintenance Burden:**
   - Regular ANALYZE on 100 indexes
   - VACUUM becomes slower
   - Disk I/O increases significantly

**Best Practice:** Index only columns used in:
- WHERE clauses (filter predicates)
- JOIN conditions
- ORDER BY clauses
- UNIQUE constraints

---

## Query: Find Students with Placement Notifications (Last 7 Days)

```sql
SELECT DISTINCT
  studentID,
  title,
  body,
  created_at
FROM notifications
WHERE 
  notificationType = 'Placement'
  AND created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
ORDER BY created_at DESC;
```

**Supporting index:**
```sql
CREATE INDEX idx_notifications_placement_recent
ON notifications(notificationType, created_at DESC)
WHERE notificationType IN ('Placement', 'Result', 'Event');
```

**Query explanation:**
- **Enum filter:** `notificationType = 'Placement'` matches enum constraint
- **Time range:** `created_at >= NOW() - INTERVAL '7 days'`
- **DISTINCT:** Removes duplicate notifications per student
- **Partial index:** Only indexes the 3 enum types, reducing size

**Expected performance:**
- Execution time: ~50-200ms (even on 5M rows)
- Returns ~1,000-5,000 rows (students with placement in last 7 days)
- Index size: ~50-100MB (small compared to full 5M row table)

---

### Index Recommendations Summary

| Column(s) | Type | Rationale |
|-----------|------|-----------|
| `(studentID, isRead, createdAt)` | Composite | Primary query filtering + sorting |
| `(notificationType, createdAt)` | Composite | Event type queries + recency |
| `studentID` | Single | Foreign key join performance |
| `createdAt` | Single | Archive/retention queries |

**Total indexes: 4** (not 100)
**Total overhead: ~10-15% of table size**
**Write performance impact: ~5-10%** (acceptable for read-heavy workload)

---

## Monitoring & Future Optimization

1. **Enable slow query log:**
   ```sql
   SET log_min_duration_statement = 1000; -- queries > 1 second
   ```

2. **Use EXPLAIN ANALYZE:**
   ```sql
   EXPLAIN ANALYZE
   SELECT * FROM notifications
   WHERE studentID = 1042 AND isRead = false
   ORDER BY createdAt DESC;
   ```

3. **Set up query monitoring:**
   - pg_stat_statements extension
   - DataGrip query analyzer
   - New Relic / DataDog APM

4. **Scale when needed:**
   - Read replicas for API reads
   - Connection pooling (PgBouncer)
   - Caching layer (Redis) for top 10% of students

---

# Stage 4

## Caching Strategy for High-Traffic Notification Fetches

### Problem Statement

**Current scenario:**
- 50,000 students fetching notifications on every page load
- Each student hits the database with: `SELECT * FROM notifications WHERE studentID = ? AND isRead = false`
- Peak traffic: 50,000 students × 5-10 page loads/day = **250K-500K requests/day**
- Even with optimized indexes, **this overwhelms the database**

**Symptoms of overload:**
- Database CPU at 95-100%
- Connection pool exhausted (too many idle connections)
- Average response time: 500ms-2 seconds
- Cascading failures during peak hours
- Poor user experience (slow page loads)

---

### Solution 1: In-Memory Caching (Redis)

**Architecture:**
```
Client → API Server → Redis Cache → Database
```

**Implementation:**
```python
# Pseudocode for caching layer

def get_student_notifications(student_id):
    # Check cache first
    cache_key = f"notifications:{student_id}"
    cached = redis.get(cache_key)
    
    if cached:
        return json.loads(cached)  # Hit! Return in ~5ms
    
    # Cache miss, query database
    notifications = db.query(
        "SELECT * FROM notifications WHERE studentID = ? AND isRead = false",
        student_id
    )
    
    # Store in cache for 5 minutes
    redis.setex(cache_key, 300, json.dumps(notifications))
    return notifications
```

**Cache invalidation triggers:**
```sql
-- When notification is marked as read
UPDATE notifications SET isRead = true WHERE id = ?;
PUBLISH cache_channel f"invalidate:notifications:{studentID}";

-- Subscriber invalidates cache
def on_notification_change(channel, message):
    redis.delete(message)  -- e.g., "notifications:1042"
```

**Tradeoffs:**

| Aspect | Impact |
|--------|--------|
| **Pros** | - Sub-5ms response time for cache hits<br>- Reduces DB load by 95%<br>- Simple to implement<br>- Can scale horizontally |
| **Cons** | - Stale data (5-min window)<br>- Memory cost: ~5GB for 50K students<br>- Cache invalidation complexity<br>- Network round-trip to Redis (~1ms) |
| **Cost** | ~$200/month for Redis cluster (16GB) |
| **Best for** | High read volume, tolerable staleness |

---

### Solution 2: HTTP-Level Caching (ETags & Cache-Control)

**Implementation:**
```javascript
// Backend API
app.get('/api/notifications', (req, res) => {
  const studentId = req.user.id;
  const data = getNotifications(studentId);
  
  // Generate ETag (hash of response)
  const etag = crypto.createHash('md5')
    .update(JSON.stringify(data))
    .digest('hex');
  
  res.set('ETag', `"${etag}"`);
  res.set('Cache-Control', 'private, max-age=300'); // 5 minutes
  res.set('Last-Modified', new Date().toUTCString());
  
  // Client sends If-None-Match header on next request
  if (req.get('If-None-Match') === `"${etag}"`) {
    return res.status(304).send(); // Not Modified
  }
  
  return res.json(data);
});
```

**Browser caching headers:**
```
Cache-Control: private, max-age=300, must-revalidate
ETag: "abc123def456"
Last-Modified: Wed, 19 Jun 2026 10:00:00 GMT
```

**Tradeoffs:**

| Aspect | Impact |
|--------|--------|
| **Pros** | - Browser caches responses<br>- Reduces network bandwidth by 70%<br>- 304 Not Modified = ~100ms vs 1-2s<br>- No server-side cache needed |
| **Cons** | - Still hits API on every page load<br>- ETag validation takes time<br>- Doesn't work for offline scenarios<br>- Client-dependent (browser/mobile) |
| **Cost** | Zero (native HTTP feature) |
| **Best for** | Bandwidth reduction, moderate staleness tolerance |

---

### Solution 3: Content Delivery Network (CDN)

**Architecture:**
```
Student → CDN Edge (Los Angeles) → Origin Server → Database
```

**Benefits:**
- Requests served from nearest geographic location
- Response time: 50-100ms (vs 500ms from distant server)
- Automatic cache purging via versioning

**Implementation (Cloudflare example):**
```
Cache Key: /api/notifications?studentId=1042
Cache TTL: 5 minutes
Purge on: New notification event
```

**Tradeoffs:**

| Aspect | Impact |
|--------|--------|
| **Pros** | - Reduces latency by 80%<br>- Global distribution<br>- DDoS protection<br>- Reduces origin bandwidth |
| **Cons** | - Expensive ($200-1000/month)<br>- All students share same cache<br>- Privacy concerns (CDN sees data)<br>- Complex cache purging rules |
| **Cost** | ~$500/month for global CDN |
| **Best for** | Public data or non-sensitive content |

⚠️ **Not recommended for notifications** (student-specific data, privacy).

---

### Solution 4: WebSocket + Server Push (Real-time Updates)

**Architecture:**
```
Client ← → Server (WebSocket)
         ↓
      Database
```

**Implementation:**
```javascript
// Backend - establish WebSocket connection
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

wss.on('connection', (ws, req) => {
  const studentId = extractStudentId(req);
  
  // Subscribe to student's notification channel
  pubsub.subscribe(`notifications:${studentId}`, (message) => {
    ws.send(JSON.stringify({
      event: 'notification.new',
      data: message
    }));
  });
  
  ws.on('close', () => {
    pubsub.unsubscribe(`notifications:${studentId}`);
  });
});

// Client - receive notifications
const ws = new WebSocket('wss://api.example.com/ws');

ws.onmessage = (event) => {
  const {event, data} = JSON.parse(event.data);
  
  if (event === 'notification.new') {
    updateUI(data); // Real-time update
  }
};
```

**Tradeoffs:**

| Aspect | Impact |
|--------|--------|
| **Pros** | - Real-time updates (instant)<br>- No polling needed<br>- Reduces API calls to near zero<br>- Better UX (notifications appear immediately) |
| **Cons** | - Higher server resource usage<br>- Connection management complexity<br>- Mobile battery drain (always connected)<br>- Fallback to polling needed |
| **Cost** | ~$300/month for WebSocket infrastructure |
| **Best for** | Real-time notifications, engagement-critical apps |

---

### Solution 5: Hybrid Approach (Recommended)

**Combine multiple strategies:**

```
┌─ Browser Cache (HTTP Cache-Control)
├─ Redis Cache (in-memory, 5-min TTL)
├─ WebSocket (real-time updates)
└─ Database (indexed, optimized queries)
```

**Recommended Architecture:**

1. **Initial page load:**
   - Fetch from cache layer (Redis)
   - If miss, query DB with optimized index
   - Return with Cache-Control headers
   - Time: 50-200ms

2. **Subsequent page loads (same session):**
   - Browser cache serves from disk
   - Validation via ETag (304 Not Modified)
   - Time: 20-50ms

3. **Real-time updates:**
   - WebSocket connection established on login
   - New notifications pushed instantly
   - No polling needed

4. **Cache invalidation:**
   - Event-driven (new notification → publish event)
   - TTL-based (5 minutes max)
   - Manual purge for admin operations

**Performance comparison:**

| Strategy | Response Time | DB Load | Cost | Staleness |
|----------|---------------|---------|------|-----------|
| **No caching** | 500-2000ms | 100% | $0 | 0 min |
| **Redis only** | 5-50ms | 5% | $200 | 5 min |
| **HTTP cache only** | 100-500ms | 80% | $0 | 5 min |
| **WebSocket only** | 0-100ms | 20% | $300 | 0 sec |
| **Hybrid** | 5-100ms | 2% | $500 | 0-5 min |

---

### Implementation Roadmap

**Phase 1 (Week 1-2):**
- Add Redis cache layer
- Implement cache invalidation via pub/sub
- Expected improvement: 5-10x faster, 80% fewer DB queries

**Phase 2 (Week 3-4):**
- Add HTTP Cache-Control headers
- Implement ETag validation
- Expected improvement: Additional 5% DB load reduction

**Phase 3 (Week 5-6):**
- Implement WebSocket connection
- Real-time notification delivery
- Expected improvement: Instant updates, near-zero polling

**Phase 4 (Week 7-8):**
- Load testing and optimization
- Monitor cache hit rates
- Fine-tune TTLs and strategies

---

### Monitoring & Metrics

```sql
-- Cache hit rate (should be > 80%)
SELECT COUNT(*) as cache_hits FROM metrics WHERE cache_status = 'HIT';
SELECT COUNT(*) as total_requests FROM metrics;
-- Hit rate = cache_hits / total_requests

-- Database query reduction
SELECT COUNT(*) as db_queries FROM metrics WHERE source = 'database';
-- Should be < 20% of total requests with caching
```

---

### Cost-Benefit Summary

| Strategy | Cost | Effort | Benefit | Recommended |
|----------|------|--------|---------|-------------|
| Redis Caching | $200/mo | Medium | **Excellent** | ✅ Yes |
| HTTP Cache | $0 | Low | **Good** | ✅ Yes |
| CDN | $500/mo | Medium | **Fair** (privacy concern) | ❌ No |
| WebSocket | $300/mo | High | **Excellent** | ✅ Yes (phase 2) |
| **Hybrid Total** | **$500/mo** | **High** | **95% improvement** | ✅ **Recommended** |
