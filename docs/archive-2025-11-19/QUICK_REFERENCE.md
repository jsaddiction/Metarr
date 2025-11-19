# Metarr Quick Reference

## Essential Commands

```bash
# Development
npm run dev:all          # Start everything
npm run lint            # Check code
npm run typecheck       # Type validation
npm run format          # Format code

# Building
npm run build           # Build backend
npm run build:frontend  # Build frontend

# Database
npm run db:init         # Initialize database
npm run db:migrate      # Run migrations
```

## API Endpoints Cheat Sheet

### Movies
```http
GET    /api/v1/movies              # List all
GET    /api/v1/movies/:id          # Get one
POST   /api/v1/movies              # Create
PUT    /api/v1/movies/:id          # Update
DELETE /api/v1/movies/:id          # Delete

POST   /api/v1/movies/:id/enrich   # Trigger enrichment
POST   /api/v1/movies/:id/publish  # Trigger publishing
POST   /api/v1/movies/:id/verify   # Trigger verification
```

### Jobs
```http
GET    /api/v1/jobs                # List jobs
POST   /api/v1/jobs                # Create job
DELETE /api/v1/jobs/:id            # Cancel job
POST   /api/v1/jobs/:id/retry      # Retry failed
```

### Libraries
```http
GET    /api/v1/libraries           # List libraries
POST   /api/v1/libraries/:id/scan  # Trigger scan
```

### Webhooks
```http
POST   /api/v1/webhooks/radarr     # Radarr webhook
POST   /api/v1/webhooks/sonarr     # Sonarr webhook
```

## WebSocket Events

```javascript
// Subscribe to updates
socket.emit('jobs:subscribe', { types: ['scan', 'enrich'] });

// Listen for progress
socket.on('job:progress', (data) => {
  console.log(`Job ${data.job_id}: ${data.progress}%`);
});

// Entity updates
socket.on('entity:updated', (data) => {
  console.log(`${data.type} ${data.id} changed`);
});
```

## Database Queries

### Common Queries
```sql
-- Find unprocessed movies
SELECT * FROM movies
WHERE identification_status = 'discovered'
AND monitored = 1;

-- Check job queue
SELECT type, status, priority, created_at
FROM jobs
WHERE status IN ('pending', 'running')
ORDER BY priority, created_at;

-- Find locked fields
SELECT id, title, title_locked, poster_locked
FROM movies
WHERE title_locked = 1 OR poster_locked = 1;

-- Asset usage
SELECT ca.content_hash, ca.reference_count, ca.file_path
FROM cache_assets ca
WHERE reference_count > 1;
```

## Configuration Keys

```javascript
// Scanner
'scan.auto_enrich': true,          // Auto-enrich after scan
'scan.confidence_threshold': 0.8,   // Min confidence

// Enrichment
'enrich.auto_publish': false,       // Auto-publish after enrich
'enrich.auto_select': true,         // Auto-select best assets
'enrich.providers': ['tmdb', 'tvdb', 'fanart'],

// Publishing
'publish.use_kodi_naming': true,    // Kodi file naming
'publish.clean_unknown': false,     // Remove unknown files

// Recycle Bin
'recycle.enabled': true,
'recycle.retention_days': 30,

// Verification
'verify.schedule': '0 3 * * *',     // Daily at 3am
'verify.auto_repair': true,
```

## Job Types & Priorities

| Job Type | Priority | Triggered By |
|----------|----------|--------------|
| webhook | 1 | Radarr/Sonarr webhooks |
| user_scan | 2 | Manual scan button |
| user_enrich | 2 | Manual enrich button |
| auto_enrich | 5 | After scan completion |
| auto_publish | 5 | After enrichment |
| scheduled_scan | 8 | Cron schedule |
| verification | 9 | Background maintenance |

## File Patterns

### Kodi Naming Convention
```
Movies:
/The Matrix (1999)/
  The Matrix (1999).mkv
  The Matrix (1999)-poster.jpg
  The Matrix (1999)-fanart.jpg
  The Matrix (1999).nfo

TV Shows:
/Breaking Bad/
  poster.jpg
  fanart.jpg
  tvshow.nfo
  Season 01/
    Breaking Bad S01E01.mkv
    Breaking Bad S01E01.nfo
```

### Cache Structure
```
/data/cache/
  images/
    {uuid}/
      poster_{hash}.jpg
      fanart_{hash}.jpg
  trailers/
    {uuid}/
      trailer_{hash}.mp4
```

## Provider Rate Limits

| Provider | Limit | Period | With Key |
|----------|-------|--------|----------|
| TMDB | 40 | 10 sec | Same |
| TVDB | 30 | 10 sec | Same |
| Fanart.tv | 10 | 1 sec | 20/sec |

## Field Locking

```javascript
// Lockable metadata fields
{
  title_locked: false,
  plot_locked: false,
  release_date_locked: false,
  rating_locked: false,

  // Lockable assets
  poster_locked: false,
  fanart_locked: false,
  logo_locked: false,
  trailer_locked: false
}
```

## Error Codes

| Code | Meaning | HTTP Status |
|------|---------|-------------|
| NOT_FOUND | Resource not found | 404 |
| VALIDATION_FAILED | Invalid input | 400 |
| UNAUTHORIZED | Missing auth | 401 |
| FORBIDDEN | No permission | 403 |
| PROVIDER_ERROR | External API fail | 502 |
| DATABASE_ERROR | DB operation fail | 500 |
| RATE_LIMITED | Too many requests | 429 |

## Path Mappings

```javascript
// Example mappings
{
  // Metarr sees (Docker volume)
  metarr_path: '/data/media/movies',

  // Kodi sees (Network share)
  kodi_path: 'smb://nas/movies',

  // Jellyfin sees (Local mount)
  jellyfin_path: '/mnt/movies',

  // Plex sees (Different mount)
  plex_path: '/media/movies'
}
```

## Troubleshooting

### Check Services
```bash
# Logs
tail -f logs/app.log
tail -f logs/error.log

# Database
sqlite3 data/metarr.sqlite "SELECT COUNT(*) FROM movies;"

# Job queue
sqlite3 data/metarr.sqlite "SELECT * FROM jobs WHERE status='failed';"

# Port usage
netstat -tulpn | grep -E "3000|3001"
```

### Common Fixes

| Issue | Solution |
|-------|----------|
| Port in use | Kill process or change PORT env |
| DB locked | Ensure single instance running |
| API 429 | Check rate limits, add delays |
| No images | Check provider API keys |
| Scan missing files | Check path mappings |
| Job stuck | Check logs, retry or cancel |

## Environment Variables

```bash
# Essential
NODE_ENV=development|production
PORT=3000
DATABASE_URL=sqlite:./data/metarr.sqlite

# Optional
TMDB_API_KEY=xxx          # Your key (default provided)
TVDB_API_KEY=xxx          # Your key (default provided)
FANART_TV_API_KEY=xxx     # Your key (default provided)

LOG_LEVEL=info|debug|error
CACHE_PATH=/data/cache
LIBRARY_PATH=/media
```

---
*Quick reference for Metarr v1.0*