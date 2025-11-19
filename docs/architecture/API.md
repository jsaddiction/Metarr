# API Architecture

**Purpose**: REST API and WebSocket communication patterns for Metarr.

**Related Docs**:
- Parent: [Architecture Overview](OVERVIEW.md)
- Database: [Database Schema](DATABASE.md)
- Job Queue: [Job Queue System](JOB_QUEUE.md)

## Quick Reference

- **Protocol**: REST + WebSocket
- **Base URL**: `/api/v1/`
- **Response Format**: Standardized JSON (`success`, `data`, `error`, `meta`)
- **Authentication**: API key or session token
- **WebSocket**: Real-time job progress and entity updates

## REST API Design

### Base URL

```
Development: http://localhost:3000/api/v1
Production:  https://your-domain/api/v1
```

### Standard Response Format

All API responses follow consistent structure:

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

**Success Example**:
```json
{
  "success": true,
  "data": {
    "id": 123,
    "title": "The Matrix",
    "year": 1999
  },
  "meta": {
    "timestamp": "2025-01-24T10:30:00Z"
  }
}
```

**Error Example**:
```json
{
  "success": false,
  "error": {
    "code": "MOVIE_NOT_FOUND",
    "message": "Movie with ID 999 not found",
    "details": { "id": 999 }
  }
}
```

## Core Endpoints

### Movies

**List Movies**:
```
GET /api/v1/movies
Query: page, limit, sort, order, monitored, library_id

Response: {
  data: Movie[],
  meta: { page, limit, total, pages }
}
```

**Get Movie**:
```
GET /api/v1/movies/:id
Includes: cast, crew, genres, streams, assets

Response: { data: MovieDetails }
```

**Update Movie**:
```
PUT /api/v1/movies/:id
Body: Partial<Movie> (title, plot, year, etc.)

Response: { data: Movie }
```

**Delete Movie**:
```
DELETE /api/v1/movies/:id
Query: delete_files (boolean, move to recycle)

Response: { success: true }
```

**Enrich Movie**:
```
POST /api/v1/movies/:id/enrich
Body: { force?: boolean, providers?: string[] }

Response: { data: { job_id: number } }
```

**Publish Movie Assets**:
```
POST /api/v1/movies/:id/publish
Body: { clean_unknown?: boolean }

Response: { data: { job_id: number } }
```

### TV Shows

**List Series**:
```
GET /api/v1/series
Query: page, limit, sort, monitored

Response: { data: Series[] }
```

**Get Series**:
```
GET /api/v1/series/:id
Includes: seasons, episodes, cast, crew

Response: { data: SeriesDetails }
```

**Get Season**:
```
GET /api/v1/series/:series_id/seasons/:season_number

Response: { data: SeasonDetails }
```

**Get Episode**:
```
GET /api/v1/episodes/:id

Response: { data: EpisodeDetails }
```

### Assets

**Get Asset Candidates**:
```
GET /api/v1/movies/:id/assets/:type
Params: type (poster, fanart, logo, etc.)

Response: {
  data: AssetCandidate[] (sorted by score)
}
```

**Select Asset**:
```
POST /api/v1/movies/:id/assets/:type/select
Body: { candidate_id: number, lock?: boolean }

Response: { data: { selected: true } }
```

**Upload Custom Asset**:
```
POST /api/v1/movies/:id/assets/:type/upload
Body: multipart/form-data (file)

Response: { data: { cache_file_id: number } }
```

**Download Asset**:
```
GET /api/v1/assets/:hash

Response: Binary image data (Content-Type: image/jpeg|png)
```

### Jobs

**List Jobs**:
```
GET /api/v1/jobs
Query: status, type, limit, entity_type, entity_id

Response: { data: Job[] }
```

**Get Job**:
```
GET /api/v1/jobs/:id

Response: { data: JobDetails }
```

**Create Job**:
```
POST /api/v1/jobs
Body: {
  type: string,
  priority?: number,
  entity_type?: string,
  entity_id?: number,
  payload: object
}

Response: { data: { job_id: number } }
```

**Cancel Job**:
```
DELETE /api/v1/jobs/:id

Response: { success: true }
```

**Retry Failed Job**:
```
POST /api/v1/jobs/:id/retry

Response: { data: { job_id: number } }
```

### Libraries

**List Libraries**:
```
GET /api/v1/libraries

Response: { data: Library[] }
```

**Create Library**:
```
POST /api/v1/libraries
Body: {
  name: string,
  path: string,
  type: 'movie' | 'tv' | 'music'
}

Response: { data: Library }
```

**Scan Library**:
```
POST /api/v1/libraries/:id/scan
Body: { deep?: boolean, auto_enrich?: boolean }

Response: { data: { job_id: number } }
```

### Settings

**Get Phase Configuration**:
```
GET /api/v1/settings/phase-config
GET /api/v1/settings/phase-config/:phase

Response: {
  data: {
    enrichment: { fetchProviderAssets: true, ... },
    publish: { publishAssets: true, ... },
    general: { autoPublish: false }
  }
}
```

**Update Phase Configuration**:
```
PATCH /api/v1/settings/phase-config
Body: {
  'enrichment.fetchProviderAssets': true,
  'publish.assets': false
}

Response: { success: true }
```

**Get Asset Limits**:
```
GET /api/v1/settings/asset-limits
GET /api/v1/settings/asset-limits/:assetType

Response: {
  data: { poster: 3, fanart: 4, ... }
}
```

**Set Asset Limit**:
```
PUT /api/v1/settings/asset-limits/:assetType
Body: { limit: number }

Response: { data: { assetType, limit } }
```

### Webhooks

**Radarr Webhook**:
```
POST /api/v1/webhooks/radarr
Headers: X-Radarr-Event
Body: Radarr webhook payload

Response: { success: true }
```

**Sonarr Webhook**:
```
POST /api/v1/webhooks/sonarr
Headers: X-Sonarr-Event
Body: Sonarr webhook payload

Response: { success: true }
```

## WebSocket Events

### Connection

**Client Connect**:
```typescript
const socket = io('http://localhost:3000', {
  transports: ['websocket'],
  auth: { token: 'optional-auth-token' }
});

socket.on('connected', (data) => {
  console.log('Connected:', data.id);
});
```

### Job Progress

**Subscribe to Job Updates**:
```typescript
socket.emit('jobs:subscribe', {
  types: ['scan', 'enrich'],
  entity_id: 123
});
```

**Job Progress Event**:
```typescript
socket.on('job:progress', (data) => {
  // data: {
  //   job_id: number,
  //   type: string,
  //   status: string,
  //   progress: number (0-100),
  //   message: string
  // }
});
```

**Job Complete Event**:
```typescript
socket.on('job:complete', (data) => {
  // data: {
  //   job_id: number,
  //   result: any
  // }
});
```

**Job Failed Event**:
```typescript
socket.on('job:failed', (data) => {
  // data: {
  //   job_id: number,
  //   error: string,
  //   attempts: number
  // }
});
```

### Real-Time Updates

**Entity Updated**:
```typescript
socket.on('entity:updated', (data) => {
  // data: {
  //   type: 'movie' | 'series',
  //   id: number,
  //   changes: string[]
  // }
});
```

**Asset Selected**:
```typescript
socket.on('asset:selected', (data) => {
  // data: {
  //   entity_type: string,
  //   entity_id: number,
  //   asset_type: string,
  //   asset_id: number
  // }
});
```

**Scan Progress**:
```typescript
socket.on('scan:file', (data) => {
  // data: {
  //   path: string,
  //   status: 'discovered' | 'classified' | 'error'
  // }
});
```

**Player Status**:
```typescript
socket.on('player:status', (data) => {
  // data: {
  //   player_id: number,
  //   status: 'connected' | 'disconnected' | 'error'
  // }
});
```

## Authentication

### API Key Authentication

**Header-Based** (preferred):
```
Headers: {
  'X-API-Key': 'your-api-key'
}
```

**Query Parameter** (less secure):
```
GET /api/v1/movies?api_key=your-api-key
```

### Session Authentication

**Login**:
```
POST /api/v1/auth/login
Body: { username: string, password: string }

Response: { data: { token: string, expires: string } }
```

**Use Token**:
```
Headers: {
  'Authorization': 'Bearer your-token'
}
```

## Error Handling

### HTTP Status Codes

| Code | Meaning | Usage |
|------|---------|-------|
| 200 | OK | Success |
| 201 | Created | Resource created |
| 204 | No Content | Success, no response body |
| 400 | Bad Request | Invalid request data |
| 401 | Unauthorized | Missing/invalid auth |
| 403 | Forbidden | No permission |
| 404 | Not Found | Resource not found |
| 409 | Conflict | Resource conflict |
| 422 | Unprocessable | Validation failed |
| 429 | Too Many Requests | Rate limited |
| 500 | Server Error | Internal error |

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

## Pagination

**Request**:
```
GET /api/v1/movies?page=2&limit=50
```

**Response**:
```json
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

**Complex Filtering**:
```
GET /api/v1/movies?filter[year][gte]=2000&filter[year][lte]=2010&filter[rating][gt]=7.5
```

**Sorting**:
```
GET /api/v1/movies?sort=year,rating&order=desc,asc
```

**Field Selection**:
```
GET /api/v1/movies?fields=id,title,year,rating
```

**Relationship Inclusion**:
```
GET /api/v1/movies/123?include=cast,crew,genres
```

## Bulk Operations

**Bulk Update**:
```
PATCH /api/v1/movies/bulk
Body: {
  ids: [1, 2, 3],
  updates: { monitored: false }
}
```

**Bulk Delete**:
```
DELETE /api/v1/movies/bulk
Body: { ids: [1, 2, 3] }
```

**Bulk Enrich**:
```
POST /api/v1/jobs/bulk
Body: {
  type: 'enrich',
  entity_type: 'movie',
  entity_ids: [1, 2, 3]
}
```

## Rate Limiting

**Default Limits**:
```typescript
const rateLimits = {
  global: 1000,          // Requests per minute
  auth: 5,               // Login attempts per minute
  webhook: 100,          // Webhook events per minute
  upload: 10             // File uploads per minute
};
```

**Response Headers**:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1706096400
```

## CORS Configuration

```typescript
const corsOptions = {
  origin: [
    'http://localhost:3001',  // Frontend dev
    'https://your-domain.com'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
};
```

## Implementation Patterns

### Route Handler

```typescript
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
        meta: { timestamp: new Date().toISOString() }
      });
    } catch (error) {
      next(error);
    }
  }
);
```

### Error Middleware

```typescript
app.use((err, req, res, next) => {
  const status = err.status || 500;
  const code = err.code || 'INTERNAL_ERROR';

  logger.error('API Error', { error: err, path: req.path });

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

### WebSocket Handler

```typescript
io.on('connection', (socket) => {
  logger.info('Client connected', { id: socket.id });

  socket.emit('connected', { id: socket.id });

  socket.on('jobs:subscribe', ({ types, entity_id }) => {
    const room = `jobs:${types.join(',')}:${entity_id}`;
    socket.join(room);
  });

  socket.on('disconnect', () => {
    logger.info('Client disconnected', { id: socket.id });
  });
});

// Emit job progress
function emitJobProgress(job: Job, progress: number, message: string) {
  const room = `jobs:${job.type}:${job.entity_id}`;
  io.to(room).emit('job:progress', {
    job_id: job.id,
    type: job.type,
    status: job.status,
    progress,
    message
  });
}
```

## API Versioning

Future-proofing for breaking changes:

```
/api/v1/movies       # Current version
/api/v2/movies       # Future version
```

**Version Strategy**:
- v1: Current implementation
- v2: Introduced when breaking changes needed
- Both versions maintained during transition
- v1 deprecated after transition period

## Performance Optimization

### Response Caching

Cache stable responses:
- Static assets
- Configuration
- Provider metadata

**Cache Headers**:
```
Cache-Control: public, max-age=3600
ETag: "abc123"
```

### Database Query Optimization

- Use indexes for common queries
- Eager load relationships with `include`
- Limit fields with `fields` parameter
- Paginate large result sets

### Rate Limiting by Endpoint

Different limits for different endpoints:
- **Read endpoints**: Higher limits (1000/min)
- **Write endpoints**: Lower limits (100/min)
- **Upload endpoints**: Strict limits (10/min)

## See Also

- [Architecture Overview](OVERVIEW.md) - System design
- [Database Schema](DATABASE.md) - Data model
- [Job Queue](JOB_QUEUE.md) - Background processing
- [Phase Documentation](../phases/) - API usage by phase
