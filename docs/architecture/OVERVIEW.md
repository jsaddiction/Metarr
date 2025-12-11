# Architecture Overview

**Purpose**: High-level system design, phase-based architecture, and technology stack overview for Metarr.

**Related Docs**:
- Details: [Database](DATABASE.md), [Job Queue](JOB_QUEUE.md), [API](API.md)
- Asset System: [Asset Management](ASSET_MANAGEMENT/)
- Operational Concepts: [Job Documentation](../concepts/)

## Quick Reference

- **Architecture Style**: Phase-based, job-driven automation
- **Core Philosophy**: Intelligent defaults with manual override capability
- **Data Protection**: Two-copy system (protected cache + working library)
- **Automation**: Chainable phases via job queue
- **Communication**: REST API + WebSocket for real-time updates

## System Design Philosophy

Metarr follows a **phase-based architecture** where independent, idempotent operations chain together to form an automated workflow. Each phase can run standalone, can be disabled, and communicates via a job queue.

### Core Principles

1. **User Control First**: Every automated decision can be overridden
2. **Field-Level Locking**: Manual edits are sacred and preserved from automation
3. **Protected Cache**: Source of truth that survives all external changes
4. **Graceful Degradation**: Each phase (except scanning) is optional
5. **Idempotency**: Phases can run multiple times safely without corruption
6. **Observable**: All phases emit progress events via WebSocket

### Three-Tier Asset Architecture

```
CANDIDATES → CACHE → LIBRARY
(Database)   (Protected)  (Working)

Provider APIs → Store URLs in DB
                     ↓
              Download to cache
              (content-addressed)
                     ↓
              Copy to library
              (Kodi naming)
```

This three-tier system ensures:
- Provider assets can be evaluated before download
- Downloaded assets are protected from media manager deletions
- Library files can be rebuilt from cache at any time
- Automatic deduplication via content addressing

See [Asset Management](ASSET_MANAGEMENT/) for complete details.

## Phase-Based Architecture

### Phase Overview

Metarr operates through six independent phases:

| Phase | Required | Purpose | Triggers |
|-------|----------|---------|----------|
| **Scanning** | Yes | Discover & classify media files | Manual, webhook, schedule |
| **Enrichment** | No | Fetch metadata & download assets | Post-scan, manual |
| **Publishing** | No | Deploy assets to library | Post-enrich, manual |
| **Player Sync** | No | Update media players | Post-publish, manual |
| **Verification** | No | Ensure cache↔library consistency | Manual, schedule |
| **Notification** | No | Send filtered event notifications | Any phase event |

### Phase Rules

1. **Independence**: Each phase can run standalone without dependencies
2. **Idempotency**: Safe to run multiple times without data corruption
3. **Recoverable**: Destructive operations use recycle bin (30-day retention)
4. **Optional**: All phases except scanning can be disabled
5. **Observable**: All phases emit WebSocket progress events
6. **Chainable**: Phases trigger subsequent phases via job creation

### Phase Workflow

```
User Action / Webhook
         ↓
    Create Job
         ↓
  Job Queue (priority-based)
         ↓
    Worker Pool
         ↓
   Phase Handler
         ↓
   Check Config
         ↓
  Phase Enabled? ──No──→ Skip to next phase
         ↓ Yes
   Execute Phase
         ↓
  Emit Progress (WebSocket)
         ↓
  Phase Complete
         ↓
  Create Next Job (if configured)
         ↓
  (Optional) Create Notification Job
```

**Key Behavior**: Each phase checks if the **next** phase is enabled before creating its job. The next phase can still decide to skip processing, but this prevents unnecessary job creation.

## Job Queue System

Metarr uses a priority-based job queue built on SQLite/PostgreSQL for reliable background processing.

### Job Queue Features

- **Priority-based**: Jobs execute by priority (1=highest, 10=lowest)
- **Worker pool**: Configurable concurrent workers
- **Retry logic**: Automatic retry with exponential backoff
- **Job chaining**: Phases trigger subsequent phases
- **Progress tracking**: Real-time WebSocket updates
- **Failure handling**: Dead letter queue for failed jobs

### Job States

```
pending → running → completed
              ↓
            failed → retrying
              ↓
        permanently failed
```

### Common Job Types

- `scan-library`: Discover media files in library directories
- `enrich-metadata`: Fetch metadata and asset candidates from providers
- `publish-assets`: Deploy cache assets to library
- `sync-player`: Update media player libraries
- `verify-cache`: Ensure cache↔library consistency
- `cleanup-orphans`: Remove orphaned cache files

See [Job Queue](JOB_QUEUE.md) for implementation details.

## Data Architecture

### Database Design

- **Primary**: SQLite (development/small deployments)
- **Production**: PostgreSQL (high-volume deployments)
- **Migration system**: Version-controlled schema changes
- **Content addressing**: SHA256 hashing with sharding
- **Soft deletes**: 30-day recycle bin for all deletions

### Key Tables

- `movies`, `series`, `seasons`, `episodes` - Media metadata
- `cache_image_files` - Protected asset storage (source of truth)
- `library_image_files` - Published working copies
- `asset_candidates` - Provider URLs and selection state
- `jobs` - Background task queue
- `people`, `genres`, `studios` - Normalized metadata
- `video_streams`, `audio_streams`, `subtitle_streams` - Media technical info
- `recycle_bin` - Soft deletes with recovery

See [Database](DATABASE.md) for complete schema.

## Technology Stack

### Backend

- **Runtime**: Node.js 20+ with TypeScript
- **Framework**: Express.js
- **Database**: SQLite (default) / PostgreSQL (optional)
- **ORM**: Knex.js for query building and migrations
- **Job Queue**: Custom implementation using database
- **WebSocket**: Socket.io for real-time updates
- **Image Processing**: sharp for analysis and manipulation
- **Video Analysis**: ffprobe for stream information

### Frontend

- **Framework**: React 18+ with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS v4 (violet primary theme)
- **Components**: shadcn/ui + custom components
- **State Management**: TanStack Query (React Query) for server state
- **WebSocket**: Socket.io-client for real-time updates
- **Forms**: React Hook Form with Zod validation

### External Integrations

**Metadata Providers**:
- TMDB (The Movie Database) - Movies, TV shows
- TVDB (TheTVDB) - TV shows (detailed)
- Fanart.tv - High-quality artwork
- MusicBrainz - Music metadata

**Media Players**:
- Kodi (JSON-RPC API)
- Jellyfin (REST API)
- Plex (REST API)

**Download Managers**:
- Radarr (webhooks)
- Sonarr (webhooks)
- Lidarr (webhooks)

## Communication Architecture

### REST API

- **Base**: `/api/v1/`
- **Authentication**: API key or session token
- **Response format**: Standardized JSON with `success`, `data`, `error`, `meta`
- **Pagination**: Offset-based with metadata
- **Filtering**: Query parameter-based with operators
- **Rate limiting**: Configurable per endpoint

### WebSocket Events

Real-time updates for:
- Job progress (`job:progress`, `job:complete`, `job:failed`)
- Entity changes (`entity:updated`)
- Asset selection (`asset:selected`)
- Scan progress (`scan:file`)
- Player status (`player:status`, `sync:progress`)

See [API Architecture](API.md) for endpoint details.

## File System Structure

```
/data/
├── cache/                     # Protected storage
│   ├── assets/                # Media assets (content-addressed)
│   │   └── ab/c1/abc123...jpg  # SHA256 sharding (2/2/full)
│   └── actors/                # Actor images
│       └── ab/c1/abc123...jpg
├── recycle/                   # Deleted files (30-day retention)
│   └── 2025-01-19/
└── metarr.sqlite             # Database (or PostgreSQL)

/media/                        # Library directories
├── movies/
│   └── Movie (2024)/
│       ├── movie.mkv
│       ├── movie-poster.jpg   # Published from cache
│       └── movie-fanart.jpg
└── tv/
    └── Show Name/
        └── Season 01/
            └── episode.mkv
```

### Path Conventions

- **Cache**: Content-addressed with SHA256 sharding (`/data/cache/assets/ab/c1/abc123...jpg`)
- **Library**: Kodi naming convention for player compatibility
- **Recycle**: Date-organized for easy cleanup

## Monitoring & Observability

### Logging

- **Winston**: Structured JSON logging
- **Levels**: error, warn, info, debug
- **Destinations**: File rotation + console
- **Locations**: `logs/app.log`, `logs/error.log`

### Metrics

- Job queue depth and processing time
- Provider API response times
- Asset download success rates
- Player sync status
- Database query performance

### Health Checks

- `/api/v1/health` - System health
- `/api/v1/status` - Detailed component status
- Database connectivity
- Provider API availability
- Media player connectivity

## Configuration System

### Configuration Levels

1. **Environment variables**: System-level settings (DB connection, API keys)
2. **Database configuration**: User-configurable settings via API
3. **Phase configuration**: Enable/disable phases, behavior settings
4. **Provider configuration**: API keys, rate limits, priorities

### Key Configuration Areas

- **Phase Control**: Enable/disable each phase
- **Asset Limits**: Max candidates to fetch per asset type
- **Provider Priority**: Order of provider fetching
- **Webhook Settings**: Enable/disable webhook handlers
- **Player Connections**: Configure media player endpoints
- **Recycle Bin**: Retention days, auto-cleanup

## Security Considerations

### Authentication

- API key authentication for external integrations
- Session-based auth for web interface
- CORS configuration for frontend

### Data Protection

- Secrets stored in environment variables (never in database)
- Provider API keys configurable but optional (embedded defaults provided)
- No sensitive data in logs

### File System

- Content-addressed storage prevents tampering
- Recycle bin prevents accidental permanent deletion
- Path mapping prevents directory traversal

## Performance Characteristics

### Scalability

- **Small libraries** (< 1000 items): SQLite sufficient
- **Large libraries** (> 10000 items): PostgreSQL recommended
- **Worker pool**: Configurable concurrency for job processing
- **Asset caching**: Content addressing provides automatic deduplication

### Optimization Strategies

- Database indexes on all foreign keys and common queries
- Lazy loading for large asset lists
- Pagination for API responses
- WebSocket subscriptions to reduce polling
- Image processing queue to prevent memory spikes

## Deployment Models

### Development

```bash
npm run dev:all  # Backend (3000) + Frontend (3001)
```

### Docker

```bash
docker-compose up  # Production-ready container
```

### Bare Metal

```bash
npm run build && npm run build:frontend
npm start
```

## Related Documentation

### Architecture Details
- [Asset Management System](ASSET_MANAGEMENT/) - Three-tier asset architecture
- [Database Schema](DATABASE.md) - Complete data model
- [Job Queue](JOB_QUEUE.md) - Background processing system
- [API Architecture](API.md) - REST + WebSocket reference

### Operational Concepts
- [Operational Concepts](../concepts/) - Design principles for each job
- [Scanning](../concepts/Scanning/) - File discovery, classification, identity
- [Enrichment](../concepts/Enrichment/) - Metadata & asset fetching
- [Publishing](../concepts/Publishing/) - Asset deployment

### Job System
- [Job Queue](JOB_QUEUE.md) - Job priorities, workers, configuration

### Integration
- [Provider Concepts](../concepts/Enrichment/Providers/) - Provider capabilities
- [Provider Implementation](../implementation/Providers/) - API integration details
- [Player Sync Implementation](../implementation/PlayerSync/) - Media player integrations
- [Webhooks](../reference/WEBHOOKS.md) - Download manager webhooks
