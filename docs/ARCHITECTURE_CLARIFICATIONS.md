# Architecture Clarifications & Design Decisions

This document clarifies architectural decisions and resolves ambiguities identified during the comprehensive review (2025-10-21).

---

## Table of Contents

1. [Storage Architecture](#storage-architecture)
2. [State Management](#state-management)
3. [Authentication Strategy](#authentication-strategy)
4. [API Key Philosophy](#api-key-philosophy)
5. [Database Strategy](#database-strategy)
6. [Virtual Scrolling](#virtual-scrolling)
7. [Health Check Design](#health-check-design)
8. [Field Management](#field-management)

---

## Storage Architecture

### Decision: UUID-Based Storage with Hash Verification

**NOT** content-addressed storage. Files are named with UUIDs to prevent collisions during concurrent operations.

```
Cache Directory Structure:
/data/cache/
├── images/
│   ├── {movieId}/
│   │   ├── poster_{uuid}.jpg       # UUID prevents collision
│   │   ├── fanart_{uuid}.jpg       # SHA256 hash stored in DB
│   │   └── logo_{uuid}.png         # pHash for similarity detection
```

### How It Works

1. **Download Phase**: Files downloaded to temp with UUID names
2. **Processing Phase**: Calculate SHA256 hash
3. **Deduplication Check**: Query DB for existing hash
4. **Storage Phase**:
   - If duplicate: Link to existing cache entry
   - If unique: Move to cache with UUID name

```sql
-- Database stores hashes for deduplication
CREATE TABLE cache_image_files (
    id TEXT PRIMARY KEY,          -- UUID
    file_path TEXT NOT NULL,      -- /cache/images/{movieId}/poster_{uuid}.jpg
    file_hash TEXT NOT NULL,      -- SHA256 for exact match
    perceptual_hash TEXT,         -- pHash for visual similarity
    width INTEGER,
    height INTEGER,
    file_size INTEGER
);
```

### Why This Approach?

- **UUID naming**: Prevents race conditions during concurrent downloads
- **SHA256 hash**: Detects exact duplicates without filename comparison
- **Perceptual hash**: Finds visually similar images (different quality/format)
- **Database deduplication**: Happens during enrichment, not storage

---

## State Management

### Decision: Job Queue as State Machine

**No explicit state tracking in database**. State is derived from:
1. Active/pending jobs in queue
2. Facts stored in database (tmdb_id, last_enriched_at, etc.)

### What We Track vs What We Don't

```typescript
// ✅ FACTS (stored in database)
{
    tmdb_id: "456",           // We identified this
    identified_at: timestamp,  // When we identified it
    last_enriched_at: date,    // When we last enriched
    poster_cache_id: "xyz",    // Asset we selected
    monitored: boolean         // User's preference
}

// ❌ STATES (NOT stored, derived from jobs)
{
    processing_state: "enriching",  // Job queue knows this
    is_processing: true,             // Check active jobs
    needs_enrichment: true,          // Check last_enriched_at
    queued_for_publish: true         // Check pending jobs
}
```

### The Monitored Flag

**Single master control for automation**:
- `monitored = true`: Full automation with field lock respect
- `monitored = false`: Complete bypass, manual control only

No per-item workflow configuration. Simple on/off switch.

---

## Authentication Strategy

### Decision: External Authentication Proxy

Metarr **does not implement authentication**. Security is handled by reverse proxy.

```nginx
# Example: Nginx with Authelia
location /metarr {
    # Authelia handles authentication
    auth_request /authelia;
    auth_request_set $user $upstream_http_remote_user;

    # Pass authenticated user to Metarr
    proxy_set_header X-Forwarded-User $user;
    proxy_pass http://metarr:3000;
}
```

### Why External Auth?

1. **Separation of Concerns**: Auth is not Metarr's responsibility
2. **Flexibility**: Users choose their auth solution (Authelia, Authentik, etc.)
3. **Home Lab Friendly**: Integrates with existing SSO setups
4. **Simpler Codebase**: No user management, sessions, or password handling

### Frontend/Backend Security

While no user auth, we still secure the frontend/backend communication:
- **CORS restrictions**: Only accept from same origin
- **Bind to localhost**: Only accessible through reverse proxy
- **CSP headers**: Prevent XSS attacks

---

## API Key Philosophy

### Decision: Embedded Keys are a Feature

**Zero-configuration philosophy**: Metarr works out-of-the-box with embedded API keys.

```typescript
// src/config/providerDefaults.ts
export const PROVIDER_DEFAULTS = {
    tmdb: {
        apiKey: 'project_key_abc123',  // Free tier, 40 req/10s
        baseUrl: 'https://api.themoviedb.org/3'
    },
    tvdb: {
        apiKey: 'project_key_xyz789',  // Free tier, 30 req/10s
        baseUrl: 'https://api4.thetvdb.com/v4'
    }
};
```

### Override Hierarchy

1. **Environment variable** (highest priority)
2. **Configuration file**
3. **Embedded defaults** (lowest priority)

```typescript
const apiKey = process.env.TMDB_API_KEY ||      // User's personal key
               config.providers.tmdb.apiKey ||   // Config file
               PROVIDER_DEFAULTS.tmdb.apiKey;    // Embedded fallback
```

### Benefits

- **New users**: Can try Metarr immediately without API signup
- **Developers**: Can contribute without managing keys
- **Production users**: Can override with personal keys for:
  - Higher rate limits
  - Usage tracking
  - Supporting providers

This follows successful projects like Jellyfin and Plex.

---

## Database Strategy

### Decision: Dual Database Support

Support **both** SQLite and PostgreSQL, selected at runtime.

```typescript
// Automatic selection based on environment
const dbType = process.env.DB_TYPE || 'sqlite3';

if (dbType === 'postgres') {
    // Production: PostgreSQL for scale
    return new PostgresConnection(config);
} else {
    // Development: SQLite for simplicity
    return new SqliteConnection(config);
}
```

### Configuration

```yaml
# Docker Compose - PostgreSQL
environment:
  - DB_TYPE=postgres
  - DB_HOST=postgres
  - DB_NAME=metarr

# Local Development - SQLite (default)
# No configuration needed, uses ./data/metarr.sqlite
```

### Migration Path

1. **Start**: SQLite for all users (simple)
2. **Growth**: User outgrows SQLite (>10k items)
3. **Migration**: Export/import tool provided
4. **Scale**: PostgreSQL for large libraries

---

## Virtual Scrolling

### Current State: Named but Not Implemented

The component `VirtualizedMovieTable` exists but doesn't actually virtualize. This is **both** a naming issue and a planned feature.

### Implementation Plan

```typescript
// Current (all rows rendered)
<tbody>
  {movies.map(movie => <MovieRow movie={movie} />)}
</tbody>

// Target (virtualized with react-window)
import { FixedSizeList } from 'react-window';

<FixedSizeList
  height={600}
  itemCount={movies.length}
  itemSize={48}
>
  {({ index, style }) => (
    <MovieRow style={style} movie={movies[index]} />
  )}
</FixedSizeList>
```

### When Virtualization Kicks In

- **<500 movies**: Regular rendering (fast enough)
- **500-2000 movies**: TanStack Virtual (lighter weight)
- **2000+ movies**: react-window (maximum performance)

---

## Health Check Design

### Decision: Aggregated System Health

Single endpoint that checks all subsystems.

```typescript
GET /api/health

{
  "status": "healthy" | "degraded" | "unhealthy",
  "timestamp": "2025-10-21T12:00:00Z",
  "components": {
    "database": {
      "status": "healthy",
      "latencyMs": 5
    },
    "jobQueue": {
      "status": "healthy",
      "pending": 45,
      "active": 3,
      "failed": 2
    },
    "cache": {
      "status": "healthy",
      "freeSpaceGB": 234,
      "usedSpaceGB": 66
    },
    "providers": {
      "tmdb": { "status": "healthy", "rateLimitRemaining": 35 },
      "tvdb": { "status": "degraded", "error": "Circuit breaker open" }
    },
    "mediaPlayers": {
      "kodi_living": "connected",
      "kodi_bedroom": "disconnected"
    }
  }
}
```

### Status Determination

- **Healthy**: All components operational
- **Degraded**: Some non-critical components failing (e.g., one provider down)
- **Unhealthy**: Critical components failing (database, job queue)

---

## Field Management

### Decision: No "Dirty State" Tracking

Publishing is handled through job queue, not state flags.

**Already removed from codebase**:
- `has_unpublished_changes` - Removed from services and database
- `needs_publish` - Never implemented
- Publishing is now triggered by job completion events

**Still tracked for auditing**:
- `last_published_at` - Kept for user visibility
- `published_nfo_hash` - Kept for change detection

### How Publishing Works

1. User makes changes → Creates facts in DB
2. User clicks "Publish" → Queues publish job
3. Job processes → Copies assets to library
4. Job completes → Media player notified

No intermediate state tracking needed.

### Field Locking Remains

Field locks (`title_locked`, `poster_locked`) still exist for monitored items:
- Prevents automation from overwriting user selections
- Only applies to monitored items
- Unmonitored items ignore locks (nothing automatic runs anyway)

---

## Summary of Key Decisions

1. **Storage**: UUID names, SHA256 deduplication in DB
2. **State**: Job queue is the state machine, no state columns
3. **Auth**: External proxy (Authelia, etc.), not built-in
4. **API Keys**: Embedded for zero-config, overridable
5. **Database**: SQLite default, PostgreSQL optional
6. **UI**: Virtual scrolling at 2000+ items
7. **Health**: Aggregated endpoint for all components
8. **Publishing**: Job-driven, no dirty state flags
9. **Control**: Single "monitored" flag, no complex workflow config

These decisions prioritize:
- **Simplicity** over complexity
- **Convention** over configuration
- **User control** with sensible defaults
- **Scalability** when needed, not premature optimization