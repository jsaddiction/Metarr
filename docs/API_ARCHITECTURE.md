# API & Communication Architecture

## Communication Architecture

Metarr uses a **hybrid communication architecture** combining REST API for configuration/CRUD operations and Server-Sent Events (SSE) for real-time state updates.

### Design Principle
**All configuration changes and CRUD operations use REST API. All backend state changes are communicated to the frontend over Server-Sent Events (SSE).**

## REST API - Request/Response Pattern

Used for all operations that require explicit user actions with clear success/failure responses.

### When to Use REST:
1. **Configuration Management** - Settings, preferences, connections
2. **CRUD Operations** - Create, read, update, delete entities
3. **Actions/Commands** - Test connection, refresh library, retry job
4. **Incoming Webhooks** - Third-party services (Sonarr/Radarr/Lidarr)

### REST Endpoint Examples:
```typescript
// Configuration
POST   /api/media-players              // Create media player
PUT    /api/media-players/:id          // Update settings
DELETE /api/media-players/:id          // Remove player

// CRUD Operations
GET    /api/movies                     // List movies
POST   /api/movies                     // Add movie
GET    /api/movies/:id                 // Get single movie
PATCH  /api/movies/:id/metadata        // Update movie metadata (with field locking)
DELETE /api/movies/:id                 // Delete movie

// Actions
POST   /api/media-players/:id/test     // Test connection
POST   /api/media-players/:id/connect  // Manual connect
POST   /api/jobs/:id/retry             // Retry failed job
POST   /api/library/refresh            // Refresh library

// Webhooks
POST   /webhooks/sonarr                // Receive download notification
POST   /webhooks/radarr                // Receive download notification
```

## Server-Sent Events (SSE) - Event Streaming Pattern

Used for pushing real-time backend state changes and long-running operation updates to the frontend.

### When to Use SSE:
1. **Connection Status Updates** - Media player connect/disconnect/error
2. **Job Processing Updates** - Background task progress and completion
3. **Library Scan Progress** - Long-running scan operations
4. **Media Player Notifications** - Playback events, library updates from Kodi/Jellyfin
5. **Activity Streams** - Real-time activity feed and monitoring

### SSE Endpoint Examples:
```typescript
// Media Player Status (Implemented ✅)
GET /api/media-players/status          // SSE stream
// Events: playerConnected, playerDisconnected, playerError

// Library Scanning (Implemented ✅)
GET /api/libraries/scan-status         // SSE stream
// Events: scanProgress, scanCompleted, scanFailed, activeScans

// Job Processing (Future)
GET /api/jobs/stream                   // SSE stream
// Events: jobStarted, jobProgress, jobCompleted, jobFailed

// Media Player Notifications (Future)
GET /api/notifications/stream          // SSE stream
// Events: playbackStarted, playbackStopped, libraryUpdated

// Activity Log (Future)
GET /api/activity/stream               // SSE stream
// Events: downloadComplete, metadataUpdated, errorOccurred
```

## Backend Event Flow

The backend uses EventEmitter to propagate state changes from services to the SSE endpoints:

```
Service Layer                Controller Layer               Frontend
─────────────                ────────────────               ────────
MediaPlayerConnectionManager  → mediaPlayerController.streamStatus() → EventSource
├─ emit('playerConnected')    ├─ listen for events                    ├─ onmessage
├─ emit('playerDisconnected') ├─ forward via SSE                      ├─ addEventListener
└─ emit('playerError')         └─ send as named events                └─ handle updates

LibraryScanService            → libraryController.streamScanStatus() → EventSource
├─ emit('scanProgress')       ├─ listen for events                    ├─ onmessage
├─ emit('scanCompleted')      ├─ forward via SSE                      ├─ addEventListener
└─ emit('scanFailed')          └─ send as named events                └─ handle updates

KodiWebSocketClient           MediaPlayerConnectionManager   SSE Stream
├─ emit('connected')      →   ├─ emit('playerConnected')  → Frontend
├─ emit('disconnected')   →   ├─ emit('playerDisconnected')→ Frontend
├─ emit('notification')   →   ├─ emit('playerNotification')→ Frontend
└─ emit('stateChange')    →   └─ emit('playerStateChange') → Frontend
```

## Frontend Implementation Pattern

### REST API Calls (Configuration Changes):
```typescript
// Use REST for CRUD operations
const handleSave = async () => {
  await mediaPlayerApi.create(formData);      // REST: POST
  await loadPlayers();                        // REST: GET
};

const handleDelete = async (id: number) => {
  await mediaPlayerApi.delete(id);            // REST: DELETE
  await loadPlayers();                        // REST: GET
};
```

### SSE Subscriptions (Real-time Updates):
```typescript
// Subscribe to real-time status updates
useEffect(() => {
  const cleanup = mediaPlayerApi.subscribeToStatus((statuses) => {
    // Update UI in real-time as backend state changes
    setPlayers(prev => updatePlayerStatuses(prev, statuses));
  });

  return cleanup; // Cleanup on unmount
}, []);
```

## Why Hybrid Over Alternatives?

### ❌ Full WebSocket Architecture:
- **Cons**: Complex, loses HTTP semantics (status codes, caching), overkill for CRUD, harder to debug
- **Not Needed**: Bi-directional communication not required for Metarr's use cases

### ❌ Pure REST with Polling:
- **Cons**: High latency (5-10s delays), inefficient resource usage, poor UX for real-time updates
- **Not Suitable**: Can't provide instant feedback for connection status or job progress

### ✅ Hybrid Approach (REST + SSE):
- **Pros**: Best of both worlds, standard HTTP benefits, simple implementation, efficient resource usage
- **Perfect Fit**: Transactional operations use REST, streaming updates use SSE

## Technology Stack
- **Backend**: Express.js REST endpoints + SSE via `res.write()` with EventEmitter
- **Frontend**: `fetch()` API for REST + `EventSource` API for SSE subscriptions
- **Already Installed**: No additional dependencies required (`ws` library only for Kodi backend communication)

## Current Implementation Status
✅ **Implemented**:
- REST API for media player CRUD operations
- SSE endpoint for media player status (`/api/media-players/status`)
- Frontend `subscribeToStatus()` function in `api.ts`
- Backend EventEmitter in `MediaPlayerConnectionManager`

⏳ **Pending**:
- Connect frontend `MediaPlayers.tsx` page to SSE endpoint
- Add SSE endpoints for jobs, library scans, and notifications
- Implement activity stream for monitoring

## Development Guidelines

### Adding New REST Endpoints:
1. Define route in `src/routes/api.ts`
2. Implement controller method in `src/controllers/`
3. Add service logic in `src/services/`
4. Follow RESTful conventions (GET, POST, PUT, DELETE)
5. Return proper HTTP status codes and JSON responses

### Adding New SSE Endpoints:
1. Create SSE endpoint in controller: `streamXYZ(req: Request, res: Response)`
2. Set SSE headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`
3. Listen to EventEmitter events from service layer
4. Send events: `res.write(`event: eventName\ndata: ${JSON.stringify(data)}\n\n`)`
5. Clean up on client disconnect: `req.on('close', ...)`
6. Add frontend subscription function in `utils/api.ts`

### Testing:
- **REST**: Use Postman, curl, or browser DevTools Network tab
- **SSE**: Use EventSource in browser console or SSE testing tools
- **Integration**: Test that configuration changes (REST) trigger status updates (SSE)

---

## SSE Reconnection Strategy

EventSource API automatically reconnects on connection loss, but Metarr implements additional logic for robust recovery.

### Automatic Reconnection

```typescript
class SSEConnection {
  private eventSource: EventSource | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private baseDelay = 1000; // 1 second

  connect(url: string, onMessage: (event: MessageEvent) => void): void {
    this.eventSource = new EventSource(url);

    this.eventSource.onmessage = onMessage;

    this.eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      this.handleReconnect(url, onMessage);
    };

    this.eventSource.onopen = () => {
      console.log('SSE connection established');
      this.reconnectAttempts = 0; // Reset on successful connection
    };
  }

  private handleReconnect(url: string, onMessage: (event: MessageEvent) => void): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.baseDelay * Math.pow(2, this.reconnectAttempts - 1),
      30000 // Max 30 seconds
    );

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.disconnect();
      this.connect(url, onMessage);
    }, delay);
  }

  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }
}
```

### Backend SSE Implementation

```typescript
export function streamSSE(
  req: Request,
  res: Response,
  eventEmitter: EventEmitter,
  eventName: string
): void {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

  // Send keepalive every 30 seconds to prevent timeout
  const keepaliveInterval = setInterval(() => {
    res.write(`:keepalive\n\n`);
  }, 30000);

  // Listen for events and forward to client
  const eventHandler = (data: any) => {
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  eventEmitter.on(eventName, eventHandler);

  // Cleanup on client disconnect
  req.on('close', () => {
    clearInterval(keepaliveInterval);
    eventEmitter.off(eventName, eventHandler);
    res.end();
  });
}
```

### Reconnection Backoff Strategy

| Attempt | Delay | Total Time |
|---------|-------|------------|
| 1 | 1s | 1s |
| 2 | 2s | 3s |
| 3 | 4s | 7s |
| 4 | 8s | 15s |
| 5 | 16s | 31s |
| 6+ | 30s (max) | 61s+ |

**After 10 failed attempts:** Stop reconnecting, display error to user

---

## REST API Error Response Format

All REST endpoints return consistent error responses with proper HTTP status codes.

### Error Response Structure

```typescript
interface ErrorResponse {
  error: string;           // Short error type
  message: string;         // Human-readable error message
  details?: any;           // Optional additional context
  timestamp: string;       // ISO 8601 timestamp
  path: string;            // Request path that caused error
  statusCode: number;      // HTTP status code
}
```

### Error Response Examples

**400 Bad Request:**
```json
{
  "error": "ValidationError",
  "message": "Invalid library path: path must be absolute",
  "details": {
    "field": "path",
    "value": "relative/path",
    "constraint": "must start with / or drive letter"
  },
  "timestamp": "2025-10-04T10:30:00Z",
  "path": "/api/libraries",
  "statusCode": 400
}
```

**404 Not Found:**
```json
{
  "error": "NotFound",
  "message": "Movie with ID 12345 not found",
  "timestamp": "2025-10-04T10:30:00Z",
  "path": "/api/movies/12345",
  "statusCode": 404
}
```

**409 Conflict:**
```json
{
  "error": "Conflict",
  "message": "Movie already exists at this path",
  "details": {
    "existingId": 67890,
    "path": "/movies/The Matrix (1999)/"
  },
  "timestamp": "2025-10-04T10:30:00Z",
  "path": "/api/movies",
  "statusCode": 409
}
```

**500 Internal Server Error:**
```json
{
  "error": "InternalServerError",
  "message": "Failed to connect to TMDB API",
  "details": {
    "provider": "tmdb",
    "originalError": "ECONNREFUSED"
  },
  "timestamp": "2025-10-04T10:30:00Z",
  "path": "/api/movies/12345/refresh",
  "statusCode": 500
}
```

### HTTP Status Code Usage

| Code | Usage | Example |
|------|-------|---------|
| 200 | Success (GET, PUT) | Movie details retrieved |
| 201 | Created (POST) | New library created |
| 204 | No Content (DELETE) | Movie deleted successfully |
| 400 | Bad Request | Invalid JSON body, missing required fields |
| 401 | Unauthorized | Missing or invalid session token |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate entry, concurrent modification |
| 422 | Unprocessable Entity | Valid JSON but business logic validation failed |
| 500 | Internal Server Error | Database error, provider API failure |
| 503 | Service Unavailable | Database offline, rate limit exhausted |

### Error Handler Middleware

```typescript
import { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Log error for debugging
  console.error('API Error:', err);

  // Determine status code
  const statusCode = err instanceof ApiError
    ? err.statusCode
    : 500;

  // Build error response
  const errorResponse: ErrorResponse = {
    error: err.name || 'InternalServerError',
    message: err.message || 'An unexpected error occurred',
    details: err instanceof ApiError ? err.details : undefined,
    timestamp: new Date().toISOString(),
    path: req.path,
    statusCode
  };

  // Send response
  res.status(statusCode).json(errorResponse);
}

// Custom error class
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

// Specific error types
export class NotFoundError extends ApiError {
  constructor(message: string, details?: any) {
    super(404, message, details);
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: any) {
    super(400, message, details);
  }
}

export class ConflictError extends ApiError {
  constructor(message: string, details?: any) {
    super(409, message, details);
  }
}
```

### Frontend Error Handling

```typescript
async function fetchMovies(): Promise<Movie[]> {
  try {
    const response = await fetch('/api/movies');

    if (!response.ok) {
      const error: ErrorResponse = await response.json();
      throw new ApiError(error.statusCode, error.message, error.details);
    }

    return response.json();
  } catch (error) {
    if (error instanceof ApiError) {
      // Handle specific error types
      if (error.statusCode === 401) {
        // Redirect to login
        window.location.href = '/login';
      } else if (error.statusCode === 503) {
        // Show service unavailable message
        showErrorNotification('Service temporarily unavailable. Please try again later.');
      } else {
        // Generic error message
        showErrorNotification(error.message);
      }
    } else {
      // Network error
      showErrorNotification('Network error. Please check your connection.');
    }
    throw error;
  }
}
```

---

## API Endpoints

### Webhooks
- `POST /webhooks/sonarr` - Sonarr download notifications
- `POST /webhooks/radarr` - Radarr download notifications
- `POST /webhooks/lidarr` - Lidarr download notifications (future)

### Library Management
- `GET /api/libraries` - List all configured libraries
- `GET /api/libraries/:id` - Get library details
- `POST /api/libraries` - Create new library
- `PUT /api/libraries/:id` - Update library configuration
- `DELETE /api/libraries/:id` - Delete library and associated media entries
- `POST /api/libraries/:id/scan` - Start library scan
- `GET /api/libraries/scan-status` - SSE stream for scan progress
- `GET /api/libraries/drives` - Get available drives (Windows)
- `GET /api/libraries/browse?path=` - Browse filesystem directories
- `POST /api/libraries/validate-path` - Validate directory path

### Media Player Management
- `GET /api/media-players` - List configured media players
- `GET /api/media-players/:id` - Get player details
- `POST /api/media-players` - Create new player
- `PUT /api/media-players/:id` - Update player configuration
- `DELETE /api/media-players/:id` - Delete player
- `POST /api/media-players/test` - Test connection (unsaved config)
- `POST /api/media-players/:id/test` - Test connection (saved player)
- `POST /api/media-players/:id/connect` - Manually connect player
- `POST /api/media-players/:id/disconnect` - Manually disconnect player
- `GET /api/media-players/status` - SSE stream for player status

### Metadata Management
- `GET /api/movies` - List all movies with filtering/sorting
- `GET /api/movies/:id` - Get movie details with full metadata
- `GET /api/movies/:id/unknown-files` - Get unknown files for specific movie
- `PATCH /api/movies/:id/metadata` - Update movie metadata (auto-locks modified fields)
- `DELETE /api/movies/:id` - Delete movie from library
- `POST /api/movies/:id/lock` - Lock specific fields (`{fields: ['plot', 'poster']}`)
- `POST /api/movies/:id/unlock` - Unlock specific fields
- `GET /api/movies/:id/completeness` - Get completeness percentage
- `GET /api/movies/monitored` - List monitored movies (computed state)
- `POST /api/movies/:id/refresh` - Trigger metadata refresh from providers

### Completeness Configuration
- `GET /api/completeness/:mediaType` - Get completeness config for media type
- `PUT /api/completeness/:mediaType` - Update completeness requirements

### Image Management
- `GET /api/images/:entityType/:entityId` - Get all images for entity
- `GET /api/images/:entityType/:entityId/:imageType` - Get specific image type
- `POST /api/images/:entityType/:entityId/:imageType/select` - Select image as active
- `POST /api/images/:entityType/:entityId/upload` - Upload custom image
- `DELETE /api/images/:id` - Delete image from database and cache
- `POST /api/images/:id/lock` - Lock image (prevent auto-replacement)
- `POST /api/images/:id/unlock` - Unlock image

### Path Mappings
- `GET /api/path-mappings/players/:playerId` - Get player path mappings
- `POST /api/path-mappings/players/:playerId` - Add player path mapping
- `PUT /api/path-mappings/players/:playerId/:mappingId` - Update mapping
- `DELETE /api/path-mappings/players/:playerId/:mappingId` - Delete mapping
- `POST /api/path-mappings/test` - Test path translation (`{playerId, path}`)
- `GET /api/path-mappings/managers` - Get manager path mappings
- `POST /api/path-mappings/managers` - Add manager path mapping

### Media Player Groups (Kodi Shared Libraries)
- `GET /api/media-player-groups` - List all groups
- `GET /api/media-player-groups/:id` - Get group details with members
- `POST /api/media-player-groups` - Create new group
- `PUT /api/media-player-groups/:id` - Update group
- `DELETE /api/media-player-groups/:id` - Delete group
- `POST /api/media-player-groups/:id/members` - Add player to group
- `DELETE /api/media-player-groups/:id/members/:playerId` - Remove player

### Activity Log & Monitoring
- `GET /api/activity` - List recent activity (paginated)
- `GET /api/activity/:entityType/:entityId` - Get activity for specific entity
- `GET /api/activity/stream` - SSE stream for real-time activity feed
- `DELETE /api/activity/:id` - Delete specific activity log entry
- `POST /api/activity/cleanup` - Manually trigger retention cleanup

### Notifications
- `GET /api/notifications/config` - Get notification configuration
- `PUT /api/notifications/config` - Update notification settings
- `POST /api/notifications/test` - Send test notification (`{channel, event}`)

### Log Files
- `GET /api/logs` - List available log files
- `GET /api/logs/:filename` - Download log file
- `DELETE /api/logs/:filename` - Delete log file

### Backup & Restore
- `POST /api/backup/create` - Create database backup (returns download URL)
- `POST /api/backup/restore` - Restore from backup file (multipart/form-data)
- `GET /api/backup/list` - List available backups
- `DELETE /api/backup/:filename` - Delete backup file

### Jobs & Task Queue
- `GET /api/jobs` - List all jobs with filtering
- `GET /api/jobs/:id` - Get job details
- `POST /api/jobs/:id/retry` - Retry failed job
- `DELETE /api/jobs/:id` - Cancel pending job
- `GET /api/jobs/stream` - SSE stream for job status updates

## Movie Metadata Update Endpoint

### `PATCH /api/movies/:id/metadata`

Updates movie metadata with automatic field locking. When a field is manually updated via this endpoint, the corresponding lock field is automatically set to prevent future automated updates from overwriting the user's changes.

#### Request

**Method:** `PATCH`  
**Path:** `/api/movies/:id/metadata`  
**Content-Type:** `application/json`

**Path Parameters:**
- `id` (number, required) - Movie ID

**Request Body:**

Any combination of the following fields can be included. Only the fields provided in the request will be updated. Each metadata field has a corresponding `*_locked` field that is automatically set to `true` when the metadata field is updated.

```typescript
interface MovieMetadataUpdate {
  // Basic metadata fields
  title?: string;
  original_title?: string;
  sort_title?: string;
  year?: number;
  plot?: string;
  outline?: string;
  tagline?: string;
  mpaa?: string;
  premiered?: string;          // YYYY-MM-DD format
  user_rating?: number;        // 0-10
  trailer_url?: string;
  
  // Explicit lock fields (optional)
  title_locked?: boolean;
  original_title_locked?: boolean;
  sort_title_locked?: boolean;
  year_locked?: boolean;
  plot_locked?: boolean;
  outline_locked?: boolean;
  tagline_locked?: boolean;
  mpaa_locked?: boolean;
  premiered_locked?: boolean;
  user_rating_locked?: boolean;
  trailer_url_locked?: boolean;
}
```

**Example Request:**

```bash
curl -X PATCH http://localhost:3000/api/movies/1/metadata \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Kick-Ass",
    "year": 2010,
    "plot": "A teenager decides to become a superhero even though he has no powers or training.",
    "plot_locked": true,
    "mpaa": "R",
    "user_rating": 8.5
  }'
```

#### Response

**Success (200 OK):**

Returns the updated movie object with all metadata and current lock states.

```json
{
  "id": 1,
  "title": "Kick-Ass",
  "original_title": "Kick-Ass",
  "sort_title": "Kick-Ass",
  "year": 2010,
  "plot": "A teenager decides to become a superhero even though he has no powers or training.",
  "outline": "Teen becomes superhero",
  "tagline": "Shut up. Kick ass.",
  "mpaa": "R",
  "premiered": "2010-04-16",
  "user_rating": 8.5,
  "trailer_url": "plugin://plugin.video.youtube/?action=play_video&videoid=...",
  "tmdb_id": 12345,
  "imdb_id": "tt1250777",
  "file_path": "M:\Movies\Kick-Ass (2010)\Kick-Ass.mkv",
  "title_locked": true,
  "original_title_locked": false,
  "sort_title_locked": false,
  "year_locked": true,
  "plot_locked": true,
  "outline_locked": false,
  "tagline_locked": false,
  "mpaa_locked": true,
  "premiered_locked": false,
  "user_rating_locked": true,
  "trailer_url_locked": false,
  "created_at": "2025-10-05T10:30:00Z",
  "updated_at": "2025-10-05T20:54:40Z"
}
```

**Error Responses:**

- `404 Not Found` - Movie with specified ID doesn't exist
- `400 Bad Request` - Invalid field values or malformed request
- `500 Internal Server Error` - Database error or server issue

**Error Example:**

```json
{
  "error": "NotFound",
  "message": "Movie with ID 999 not found",
  "timestamp": "2025-10-05T20:54:40Z",
  "path": "/api/movies/999/metadata",
  "statusCode": 404
}
```

#### Field Locking Behavior

When updating metadata through this endpoint:

1. **Automatic Locking:** When a metadata field is updated (e.g., `plot`), its corresponding lock field (`plot_locked`) is automatically set to `true`
2. **Explicit Lock Control:** Lock fields can be explicitly set in the request (e.g., set `plot_locked: false` to unlock the field)
3. **Automated Updates:** Fields with locks set to `true` will NOT be updated during:
   - NFO file rescans
   - Provider metadata refreshes
   - Scheduled metadata updates
4. **No Partial Updates:** Only fields included in the request body are updated; omitted fields remain unchanged

#### Use Cases

**Manual Correction:**
User corrects incorrect plot summary from NFO file, automatically locking it to prevent future rescans from reverting the change.

```json
{
  "plot": "Corrected and improved plot summary",
  "plot_locked": true
}
```

**Unlock for Re-enrichment:**
User wants to allow automated updates to refresh stale metadata.

```json
{
  "plot_locked": false,
  "tagline_locked": false
}
```

**Bulk Field Update:**
Update multiple fields at once with selective locking.

```json
{
  "mpaa": "R",
  "mpaa_locked": true,
  "premiered": "2010-04-16",
  "premiered_locked": false,
  "user_rating": 9.0,
  "user_rating_locked": true
}
```

#### Implementation Notes

- The endpoint uses dynamic SQL generation to build UPDATE statements with only the provided fields
- All updates are executed within a database transaction
- The endpoint returns the full movie object after update for immediate UI sync
- Frontend should optimistically update UI and rollback on error
- Lock state changes trigger completeness and monitoring recalculation

