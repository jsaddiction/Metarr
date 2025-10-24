# API Architecture

**Purpose**: REST API and WebSocket communication patterns for Metarr.

**Framework**: Express.js with TypeScript

## Overview

Metarr provides a RESTful API for CRUD operations and WebSocket connections for real-time updates. The API follows consistent patterns for authentication, error handling, and response formatting.

## REST API Structure

### Base URL
```
Development: http://localhost:3000/api
Production:  https://your-domain/api
```

### API Versioning
```
/api/v1/movies       # Current version
/api/v2/movies       # Future version
```

### Standard Response Format

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    timestamp: string;
  };
}
```

### Success Response Example
```json
{
  "success": true,
  "data": {
    "id": 123,
    "title": "The Matrix",
    "year": 1999
  },
  "meta": {
    "timestamp": "2024-01-24T10:30:00Z"
  }
}
```

### Error Response Example
```json
{
  "success": false,
  "error": {
    "code": "MOVIE_NOT_FOUND",
    "message": "Movie with ID 999 not found",
    "details": {
      "id": 999
    }
  }
}
```

## Core Endpoints

### Movies

```typescript
// List movies with pagination and filtering
GET /api/v1/movies
Query params:
  - page: number (default: 1)
  - limit: number (default: 50, max: 200)
  - sort: string (title, year, rating, added)
  - order: asc | desc
  - monitored: boolean
  - library_id: number

// Get single movie with full details
GET /api/v1/movies/:id
Includes: cast, crew, genres, streams, assets

// Create new movie
POST /api/v1/movies
Body: {
  file_path: string,
  title: string,
  year: number,
  tmdb_id?: number
}

// Update movie metadata
PUT /api/v1/movies/:id
Body: Partial<Movie>

// Delete movie
DELETE /api/v1/movies/:id
Query params:
  - delete_files: boolean (move to recycle)

// Trigger movie enrichment
POST /api/v1/movies/:id/enrich
Body: {
  force: boolean,
  providers?: string[]
}

// Publish movie assets
POST /api/v1/movies/:id/publish
Body: {
  clean_unknown: boolean
}
```

### Assets

```typescript
// Get asset candidates for selection
GET /api/v1/movies/:id/assets/:type
Params:
  - type: poster | fanart | logo | banner
Returns: Array of candidates with scores

// Select asset for movie
POST /api/v1/movies/:id/assets/:type/select
Body: {
  candidate_id: number,
  lock: boolean
}

// Upload custom asset
POST /api/v1/movies/:id/assets/:type/upload
Body: multipart/form-data with file

// Download asset
GET /api/v1/assets/:hash
Returns: Binary image data
```

### Jobs

```typescript
// List jobs with filtering
GET /api/v1/jobs
Query params:
  - status: pending | running | completed | failed
  - type: scan | enrich | publish | sync
  - limit: number

// Get job details
GET /api/v1/jobs/:id

// Create manual job
POST /api/v1/jobs
Body: {
  type: string,
  entity_type?: string,
  entity_id?: number,
  priority?: number
}

// Cancel running job
DELETE /api/v1/jobs/:id

// Retry failed job
POST /api/v1/jobs/:id/retry
```

### Libraries

```typescript
// List libraries
GET /api/v1/libraries

// Create library
POST /api/v1/libraries
Body: {
  name: string,
  path: string,
  type: 'movie' | 'tv' | 'music'
}

// Scan library
POST /api/v1/libraries/:id/scan
Body: {
  deep: boolean,
  auto_enrich: boolean
}
```

### Media Players

```typescript
// List player groups
GET /api/v1/player-groups

// Test player connection
POST /api/v1/players/:id/test

// Sync specific player
POST /api/v1/players/:id/sync
Body: {
  items?: number[],
  type?: 'movie' | 'tv'
}

// Update player config
PUT /api/v1/players/:id
Body: {
  host?: string,
  port?: number,
  enabled?: boolean
}
```

### Webhooks

```typescript
// Radarr webhook receiver
POST /api/v1/webhooks/radarr
Headers:
  - X-Radarr-Event: string
Body: Radarr webhook payload

// Sonarr webhook receiver
POST /api/v1/webhooks/sonarr
Headers:
  - X-Sonarr-Event: string
Body: Sonarr webhook payload

// Lidarr webhook receiver
POST /api/v1/webhooks/lidarr
Headers:
  - X-Lidarr-Event: string
Body: Lidarr webhook payload
```

## WebSocket Events

### Connection

```typescript
// Client connection
const socket = io('http://localhost:3000', {
  transports: ['websocket'],
  auth: {
    token: 'optional-auth-token'
  }
});

// Server acknowledgment
socket.on('connected', (data) => {
  console.log('Connected with ID:', data.id);
});
```

### Job Progress Events

```typescript
// Subscribe to job updates
socket.emit('jobs:subscribe', {
  types: ['scan', 'enrich'],
  entity_id: 123
});

// Receive job progress
socket.on('job:progress', (data) => {
  // data: {
  //   job_id: number,
  //   type: string,
  //   status: string,
  //   progress: number (0-100),
  //   message: string
  // }
});

// Job completed
socket.on('job:complete', (data) => {
  // data: {
  //   job_id: number,
  //   result: any
  // }
});

// Job failed
socket.on('job:failed', (data) => {
  // data: {
  //   job_id: number,
  //   error: string
  // }
});
```

### Real-time Updates

```typescript
// Entity updates (movie/show changed)
socket.on('entity:updated', (data) => {
  // data: {
  //   type: 'movie' | 'series',
  //   id: number,
  //   changes: string[]
  // }
});

// Asset changes
socket.on('asset:selected', (data) => {
  // data: {
  //   entity_type: string,
  //   entity_id: number,
  //   asset_type: string,
  //   asset_id: number
  // }
});

// Library scan events
socket.on('scan:file', (data) => {
  // data: {
  //   path: string,
  //   status: 'discovered' | 'classified' | 'error'
  // }
});
```

### Player Events

```typescript
// Player status changes
socket.on('player:status', (data) => {
  // data: {
  //   player_id: number,
  //   status: 'connected' | 'disconnected' | 'error',
  //   message?: string
  // }
});

// Sync progress
socket.on('sync:progress', (data) => {
  // data: {
  //   player_id: number,
  //   items_synced: number,
  //   items_total: number
  // }
});
```

## Authentication & Security

### API Key Authentication

```typescript
// Header-based
Headers: {
  'X-API-Key': 'your-api-key'
}

// Query parameter (less secure)
GET /api/v1/movies?api_key=your-api-key
```

### Session Authentication

```typescript
// Login
POST /api/v1/auth/login
Body: {
  username: string,
  password: string
}
Returns: {
  token: string,
  expires: string
}

// Use token
Headers: {
  'Authorization': 'Bearer your-token'
}
```

### CORS Configuration

```typescript
const corsOptions = {
  origin: [
    'http://localhost:3001',  // Frontend dev
    'https://your-domain.com'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
};
```

## Error Handling

### HTTP Status Codes

```
200 OK              - Success
201 Created         - Resource created
204 No Content      - Success, no response body
400 Bad Request     - Invalid request data
401 Unauthorized    - Missing/invalid auth
403 Forbidden       - No permission
404 Not Found       - Resource not found
409 Conflict        - Resource conflict
422 Unprocessable   - Validation failed
429 Too Many        - Rate limited
500 Server Error    - Internal error
```

### Error Codes

```typescript
enum ErrorCode {
  // Validation
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  MISSING_REQUIRED = 'MISSING_REQUIRED',
  INVALID_FORMAT = 'INVALID_FORMAT',

  // Resources
  NOT_FOUND = 'NOT_FOUND',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  LOCKED = 'LOCKED',

  // Auth
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',

  // System
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  PROVIDER_ERROR = 'PROVIDER_ERROR'
}
```

## Rate Limiting

```typescript
// Default limits
const rateLimits = {
  global: 1000,          // Requests per minute
  auth: 5,               // Login attempts per minute
  webhook: 100,          // Webhook events per minute
  upload: 10             // File uploads per minute
};

// Response headers
Headers: {
  'X-RateLimit-Limit': '1000',
  'X-RateLimit-Remaining': '999',
  'X-RateLimit-Reset': '1706096400'
}
```

## Pagination

```typescript
// Request
GET /api/v1/movies?page=2&limit=50

// Response
{
  "data": [...],
  "meta": {
    "page": 2,
    "limit": 50,
    "total": 523,
    "pages": 11,
    "has_next": true,
    "has_prev": true
  },
  "links": {
    "first": "/api/v1/movies?page=1&limit=50",
    "prev": "/api/v1/movies?page=1&limit=50",
    "next": "/api/v1/movies?page=3&limit=50",
    "last": "/api/v1/movies?page=11&limit=50"
  }
}
```

## Filtering & Sorting

```typescript
// Complex filtering
GET /api/v1/movies?filter[year][gte]=2000&filter[year][lte]=2010&filter[rating][gt]=7.5

// Nested sorting
GET /api/v1/movies?sort=year,rating&order=desc,asc

// Field selection
GET /api/v1/movies?fields=id,title,year,rating

// Relationship inclusion
GET /api/v1/movies/123?include=cast,crew,genres
```

## Bulk Operations

```typescript
// Bulk update
PATCH /api/v1/movies/bulk
Body: {
  ids: [1, 2, 3],
  updates: {
    monitored: false
  }
}

// Bulk delete
DELETE /api/v1/movies/bulk
Body: {
  ids: [1, 2, 3]
}

// Bulk enrich
POST /api/v1/jobs/bulk
Body: {
  type: 'enrich',
  entity_type: 'movie',
  entity_ids: [1, 2, 3]
}
```

## Implementation Example

```typescript
// Route definition
router.get('/movies/:id',
  authenticate,
  validate(movieSchema),
  async (req, res, next) => {
    try {
      const movie = await movieService.findById(req.params.id);

      if (!movie) {
        throw new NotFoundError('Movie not found');
      }

      res.json({
        success: true,
        data: movie,
        meta: {
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// Error middleware
app.use((err, req, res, next) => {
  const status = err.status || 500;
  const code = err.code || 'INTERNAL_ERROR';

  res.status(status).json({
    success: false,
    error: {
      code,
      message: err.message,
      details: err.details
    }
  });
});
```

## Related Documentation

### Phases with APIs
- [Scanning Phase](phases/SCANNING.md) - Scan endpoints
- [Enrichment Phase](phases/ENRICHMENT.md) - Enrichment endpoints
- [Publishing Phase](phases/PUBLISHING.md) - Publish endpoints
- [Player Sync Phase](phases/PLAYER_SYNC.md) - Sync endpoints
- [Verification Phase](phases/VERIFICATION.md) - Verification endpoints

### Related Systems
- [Database Schema](DATABASE.md) - Data model details
- [Webhooks](technical/WEBHOOKS.md) - External integrations
- [Development](DEVELOPMENT.md) - API patterns