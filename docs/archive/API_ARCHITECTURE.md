# API & Communication Architecture

## Communication Architecture

Metarr uses a **hybrid communication architecture** combining REST API for configuration/CRUD operations and WebSockets for real-time bidirectional communication.

### Design Principle
**All configuration changes and CRUD operations use REST API. All backend state changes are communicated to the frontend over WebSocket connections.**

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

## WebSocket - Bidirectional Event Streaming

Used for pushing real-time backend state changes to the frontend and monitoring client connection state.

### When to Use WebSocket:
1. **Connection Status Updates** - Media player connect/disconnect/error
2. **Job Processing Updates** - Background task progress and completion
3. **Library Scan Progress** - Long-running scan operations
4. **Media Player Notifications** - Playback events, library updates from Kodi/Jellyfin
5. **Activity Streams** - Real-time activity feed and monitoring
6. **Client Connection State** - Monitor frontend connectivity with ping/pong heartbeat

### WebSocket Event Types:
```typescript
// Server → Client Events
interface ServerEvents {
  // Media Player Status
  'player:connected': { playerId: number; name: string; timestamp: string };
  'player:disconnected': { playerId: number; reason: string };
  'player:error': { playerId: number; error: string };

  // Library Scanning
  'scan:started': { libraryId: number; totalFiles: number };
  'scan:progress': { libraryId: number; current: number; total: number; currentFile: string };
  'scan:completed': { libraryId: number; filesProcessed: number; duration: number };
  'scan:failed': { libraryId: number; error: string };

  // Job Processing
  'job:started': { jobId: number; type: string; priority: number };
  'job:progress': { jobId: number; percent: number; message: string };
  'job:completed': { jobId: number; result: any };
  'job:failed': { jobId: number; error: string };

  // Media Player Notifications
  'playback:started': { playerId: number; title: string; mediaType: string };
  'playback:stopped': { playerId: number; position: number };
  'library:updated': { playerId: number; changeType: string };

  // Activity Log
  'activity:new': { type: string; message: string; entityId?: number };

  // Connection Management
  'connection:established': { clientId: string; timestamp: string };
  'pong': { timestamp: string };
}

// Client → Server Events
interface ClientEvents {
  // Connection Management
  'ping': { timestamp: string };
  'subscribe': { channels: string[] };
  'unsubscribe': { channels: string[] };
}
```

## Backend Event Flow

The backend uses EventEmitter to propagate state changes from services to the WebSocket server:

```
Service Layer                WebSocket Server               Frontend
─────────────                ────────────────               ────────
MediaPlayerConnectionManager  → WebSocketBroadcaster        → WebSocket Client
├─ emit('playerConnected')    ├─ listen for events          ├─ onmessage
├─ emit('playerDisconnected') ├─ broadcast to subscribed    ├─ handle 'player:*'
└─ emit('playerError')         └─ clients as typed events   └─ update UI state

LibraryScanService            → WebSocketBroadcaster        → WebSocket Client
├─ emit('scanProgress')       ├─ listen for events          ├─ onmessage
├─ emit('scanCompleted')      ├─ broadcast to subscribed    ├─ handle 'scan:*'
└─ emit('scanFailed')          └─ clients as typed events   └─ show progress bar

KodiWebSocketClient           MediaPlayerConnectionManager   WebSocket Stream
├─ emit('connected')      →   ├─ emit('playerConnected')  → broadcast('player:connected')
├─ emit('disconnected')   →   ├─ emit('playerDisconnected')→ broadcast('player:disconnected')
├─ emit('notification')   →   ├─ emit('playerNotification')→ broadcast('playback:*')
└─ emit('stateChange')    →   └─ emit('playerStateChange') → broadcast('player:*')
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

### WebSocket Subscriptions (Real-time Updates):
```typescript
import { useWebSocket } from '@/hooks/useWebSocket';

// Subscribe to real-time status updates
function MediaPlayersPage() {
  const { subscribe, isConnected } = useWebSocket();
  const [players, setPlayers] = useState<MediaPlayer[]>([]);

  useEffect(() => {
    // Subscribe to player events
    const unsubscribe = subscribe({
      'player:connected': (data) => {
        setPlayers(prev => updatePlayerStatus(prev, data.playerId, 'connected'));
      },
      'player:disconnected': (data) => {
        setPlayers(prev => updatePlayerStatus(prev, data.playerId, 'disconnected'));
      },
      'player:error': (data) => {
        showErrorNotification(`Player ${data.playerId} error: ${data.error}`);
      }
    });

    return unsubscribe; // Cleanup on unmount
  }, [subscribe]);

  // Show connection status indicator in UI
  return (
    <div>
      <ConnectionIndicator connected={isConnected} />
      {/* ... rest of UI ... */}
    </div>
  );
}
```

## Why Hybrid Over Alternatives?

### ❌ Pure REST with Polling:
- **Cons**: High latency (5-10s delays), inefficient resource usage, poor UX for real-time updates
- **Not Suitable**: Can't provide instant feedback for connection status or job progress

### ✅ Hybrid Approach (REST + WebSocket):
- **Pros**: Best of both worlds, real-time bidirectional communication, connection state awareness
- **Perfect Fit**: Transactional operations use REST, streaming updates use WebSocket
- **Connection State**: Client knows immediately when disconnected (no stale data)
- **Simple Troubleshooting**: Network tab shows single WebSocket connection for all events
- **Ping/Pong**: Client sends ping, server replies pong for connection health monitoring

## WebSocket Connection State Management

### Connection Status Awareness

Unlike SSE (unidirectional), WebSocket provides **immediate connection state detection** through ping/pong heartbeat:

```typescript
class WebSocketManager {
  private ws: WebSocket | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private pongTimeout: NodeJS.Timeout | null = null;
  private connectionState: 'connected' | 'disconnected' | 'reconnecting' = 'disconnected';

  connect(url: string): void {
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.connectionState = 'connected';
      this.startHeartbeat();
      this.emit('connection:established');
    };

    this.ws.onclose = () => {
      this.connectionState = 'disconnected';
      this.stopHeartbeat();
      this.handleReconnect(url);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.connectionState = 'disconnected';
    };

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      if (message.type === 'pong') {
        this.handlePong();
      } else {
        this.handleEvent(message);
      }
    };
  }

  // Ping every 30 seconds, expect pong within 5 seconds
  private startHeartbeat(): void {
    this.pingInterval = setInterval(() => {
      this.sendPing();

      // Set timeout for pong response
      this.pongTimeout = setTimeout(() => {
        console.error('Pong timeout - connection lost');
        this.connectionState = 'disconnected';
        this.ws?.close();
      }, 5000);
    }, 30000);
  }

  private sendPing(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'ping',
        timestamp: Date.now()
      }));
    }
  }

  private handlePong(): void {
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
    // Connection is healthy
    this.connectionState = 'connected';
  }

  private stopHeartbeat(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
  }

  getConnectionState(): 'connected' | 'disconnected' | 'reconnecting' {
    return this.connectionState;
  }

  isConnected(): boolean {
    return this.connectionState === 'connected' && this.ws?.readyState === WebSocket.OPEN;
  }
}
```

### User-Facing Connection Indicator

```typescript
function ConnectionIndicator({ connected }: { connected: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${
        connected ? 'bg-green-500' : 'bg-red-500'
      }`} />
      <span className="text-sm">
        {connected ? 'Connected' : 'Disconnected - Data may be stale'}
      </span>
    </div>
  );
}
```

### Why This Matters:

1. **User Awareness**: User immediately knows if their UI is showing stale data
2. **Debugging**: Network tab shows single WebSocket connection with all events
3. **Reliability**: Ping/pong detects silent connection failures (firewall, proxy, network switch)
4. **UX**: Client can show "reconnecting..." state instead of silently displaying outdated info

## Technology Stack

- **Backend**: Express.js REST endpoints + WebSocket server (`ws` library)
- **Frontend**: `fetch()` API for REST + native `WebSocket` API for real-time updates
- **Already Installed**: `ws` library already in dependencies (used for Kodi communication)

## Reconnection Strategy

### Automatic Reconnection with Exponential Backoff

```typescript
class WebSocketConnection {
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private baseDelay = 1000; // 1 second

  private handleReconnect(url: string): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      this.emit('reconnection:failed');
      return;
    }

    this.reconnectAttempts++;
    this.connectionState = 'reconnecting';

    const delay = Math.min(
      this.baseDelay * Math.pow(2, this.reconnectAttempts - 1),
      30000 // Max 30 seconds
    );

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.emit('reconnecting', { attempt: this.reconnectAttempts, delay });

    setTimeout(() => {
      this.disconnect();
      this.connect(url);
    }, delay);
  }

  // Reset reconnect attempts on successful connection
  private onConnectionEstablished(): void {
    this.reconnectAttempts = 0;
    this.connectionState = 'connected';
    this.emit('connection:established');
  }
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

**After 10 failed attempts:** Stop reconnecting, display error to user with manual reconnect button

## Backend WebSocket Implementation

### WebSocket Server Setup

```typescript
import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { EventEmitter } from 'events';

export class WebSocketBroadcaster extends EventEmitter {
  private wss: WebSocketServer;
  private clients: Map<string, WebSocket> = new Map();

  constructor(httpServer: Server) {
    super();
    this.wss = new WebSocketServer({
      server: httpServer,
      path: '/ws'
    });

    this.wss.on('connection', (ws: WebSocket) => {
      const clientId = this.generateClientId();
      this.clients.set(clientId, ws);

      // Send connection confirmation
      this.sendToClient(ws, {
        type: 'connection:established',
        clientId,
        timestamp: new Date().toISOString()
      });

      // Handle ping messages
      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());

        if (message.type === 'ping') {
          this.sendToClient(ws, {
            type: 'pong',
            timestamp: new Date().toISOString()
          });
        }
      });

      // Handle client disconnect
      ws.on('close', () => {
        this.clients.delete(clientId);
        console.log(`Client ${clientId} disconnected`);
      });

      ws.on('error', (error) => {
        console.error(`WebSocket error for client ${clientId}:`, error);
        this.clients.delete(clientId);
      });
    });
  }

  // Broadcast event to all connected clients
  broadcast(eventType: string, data: any): void {
    const message = JSON.stringify({
      type: eventType,
      data,
      timestamp: new Date().toISOString()
    });

    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  // Send to specific client
  private sendToClient(client: WebSocket, message: any): void {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  }

  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Clean up
  close(): void {
    this.clients.forEach((client) => client.close());
    this.clients.clear();
    this.wss.close();
  }
}
```

### Integrating with Services

```typescript
// In src/index.ts
import { WebSocketBroadcaster } from './services/websocketBroadcaster.js';

const server = http.createServer(app);
const wsBroadcaster = new WebSocketBroadcaster(server);

// Services emit events, broadcaster forwards to clients
libraryScanService.on('scanProgress', (data) => {
  wsBroadcaster.broadcast('scan:progress', data);
});

mediaPlayerConnectionManager.on('playerConnected', (data) => {
  wsBroadcaster.broadcast('player:connected', data);
});

jobQueueService.on('jobCompleted', (data) => {
  wsBroadcaster.broadcast('job:completed', data);
});
```

## Current Implementation Status

✅ **Implemented**:
- REST API for media player CRUD operations
- WebSocket infrastructure (`ws` library already installed)
- Backend EventEmitter in services

⏳ **Pending**:
- Create `WebSocketBroadcaster` service
- Connect service EventEmitters to WebSocket broadcaster
- Create frontend `useWebSocket` hook
- Implement ping/pong heartbeat
- Add connection state indicator to UI

## Development Guidelines

### Adding New REST Endpoints:
1. Define route in `src/routes/api.ts`
2. Implement controller method in `src/controllers/`
3. Add service logic in `src/services/`
4. Follow RESTful conventions (GET, POST, PUT, DELETE)
5. Return proper HTTP status codes and JSON responses

### Adding New WebSocket Events:
1. Define event type in service layer EventEmitter
2. Emit event with typed data: `this.emit('eventName', data)`
3. WebSocketBroadcaster automatically forwards to connected clients
4. Update TypeScript interfaces for type safety
5. Add event handler in frontend `useWebSocket` hook

### Testing:
- **REST**: Use Postman, curl, or browser DevTools Network tab
- **WebSocket**: Use browser console (`new WebSocket('ws://localhost:3000/ws')`)
- **Integration**: Test that configuration changes (REST) trigger status updates (WebSocket)
- **Connection State**: Test reconnection by killing server or using DevTools network throttling

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
  "timestamp": "2025-10-05T10:30:00Z",
  "path": "/api/libraries",
  "statusCode": 400
}
```

**404 Not Found:**
```json
{
  "error": "NotFound",
  "message": "Movie with ID 12345 not found",
  "timestamp": "2025-10-05T10:30:00Z",
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
  "timestamp": "2025-10-05T10:30:00Z",
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
  "timestamp": "2025-10-05T10:30:00Z",
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

### WebSocket Connection
- `WS /ws` - WebSocket endpoint for real-time bidirectional communication

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
