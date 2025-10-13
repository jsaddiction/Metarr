# Implementation Roadmap

## Overview

This document outlines the phased approach to building Metarr from the ground up. Each phase is designed to deliver working functionality while building toward the complete vision.

**Development Philosophy**:
- Ship early and often
- Each phase is functional and testable
- Build on solid foundations
- Test with real-world data (100-500 movies)

## Phase 0: Foundation (Week 1)

**Goal**: Set up development environment and basic infrastructure

### Tasks

1. **Project Setup**
   - Initialize TypeScript configuration
   - Set up ESLint + Prettier
   - Configure Vite for frontend
   - Set up dev scripts (`npm run dev:all`)

2. **Database Infrastructure**
   - Implement migration system
   - Create initial schema (core tables only)
   - Set up SQLite for development
   - Add PostgreSQL support (for future)

3. **Basic Express Server**
   - Create Express app with TypeScript
   - Set up middleware (CORS, body-parser, error handler)
   - Implement health check endpoint
   - Add request logging

4. **React Frontend Skeleton**
   - Create basic layout (Header, Sidebar, Content)
   - Set up React Router
   - Implement dark theme (purple accent)
   - Add loading states

### Deliverables

- [x] Project builds without errors
- [x] Database migrations run successfully
- [x] Server starts on port 3000
- [x] Frontend loads at http://localhost:3001
- [x] Can navigate between empty pages

### Estimated Time: 3-5 days

## Phase 1: Core Movie Management (Weeks 2-3)

**Goal**: Basic movie library with manual scanning

### Database Schema

```sql
CREATE TABLE libraries (...)
CREATE TABLE movies (...)
CREATE TABLE video_streams (...)
CREATE TABLE audio_streams (...)
CREATE TABLE subtitle_streams (...)
CREATE TABLE genres (...)
CREATE TABLE actors (...)
CREATE TABLE crew (...)
-- Link tables
```

### Backend Tasks

1. **Library Management**
   - Create library CRUD endpoints
   - Implement filesystem walker
   - Parse movie filenames (title + year extraction)
   - Calculate file hashes (SHA256)

2. **FFprobe Integration**
   - Install fluent-ffmpeg
   - Extract video stream info
   - Extract audio stream info
   - Extract subtitle stream info

3. **Manual Library Scan**
   - Scan directory for video files (.mkv, .mp4, .avi)
   - Create movie records (status: unidentified)
   - Store stream details
   - Detect file changes (hash comparison)

4. **Movie API Endpoints**
   ```
   GET    /api/movies
   GET    /api/movies/:id
   PUT    /api/movies/:id
   DELETE /api/movies/:id
   POST   /api/libraries/:id/scan
   ```

### Frontend Tasks

1. **Library Management UI**
   - List all libraries
   - Add/Edit/Delete library
   - Trigger manual scan
   - Show scan progress (SSE)

2. **Movie List View**
   - Grid view with placeholders
   - Table view with details
   - Filter by library
   - Sort by title/year/date added
   - Search by title

3. **Movie Detail Page**
   - Display all metadata fields
   - Show stream details (video, audio, subtitles)
   - Edit basic fields (title, year, plot)
   - Show file information

### Testing

- Scan small library (10-20 movies)
- Verify file hash calculation
- Test FFprobe stream extraction
- Confirm database storage

### Deliverables

- [x] Manual library scan working
- [x] Movies displayed in UI
- [x] Stream details extracted and shown
- [x] Basic CRUD operations functional

### Estimated Time: 10-14 days

## Phase 2: Provider Integration (Weeks 4-5)

**Goal**: Fetch metadata from TMDB

### Database Schema (Add)

```sql
-- Add to movies table:
tmdb_id
imdb_id
identification_status ('unidentified', 'identified', 'enriched')
```

### Backend Tasks

1. **TMDB Client**
   - Implement TMDB API wrapper
   - Search movies by title + year
   - Fetch movie details (metadata + cast)
   - Fetch movie images (posters, fanart)
   - Handle rate limiting (50 req/10sec)

2. **Identification Service**
   - Auto-identify during scan (confidence threshold)
   - Manual search endpoint
   - Store provider IDs

3. **Enrichment Service**
   - Fetch full metadata from TMDB
   - Store in normalized tables (actors, crew, genres)
   - Update movie record

4. **Provider API Endpoints**
   ```
   POST   /api/movies/:id/identify
   GET    /api/providers/tmdb/search?query=...
   POST   /api/movies/:id/enrich
   GET    /api/movies/unidentified
   ```

### Frontend Tasks

1. **Unidentified Media View**
   - List movies with status='unidentified'
   - Show parsed filename
   - Search button per movie

2. **Provider Search Modal**
   - Input: title, year
   - Display: TMDB results with posters
   - Select match → identify movie

3. **Enrichment UI**
   - Button: "Fetch Metadata"
   - Show loading state
   - Display enriched metadata
   - Show cast & crew

4. **Movie Detail Enhancements**
   - Display TMDB metadata
   - Show cast list
   - Show crew (director, writer)
   - Display genres

### Testing

- Search TMDB for various titles
- Test rate limiting behavior
- Verify metadata storage
- Check normalized tables

### Deliverables

- [x] TMDB integration working
- [x] Movies can be identified
- [x] Metadata enrichment functional
- [x] Cast & crew displayed

### Estimated Time: 10-14 days

## Phase 3: Asset Management (Weeks 6-7)

**Goal**: Download and manage posters, fanart, logos

### Database Schema (Add)

```sql
CREATE TABLE cache_assets (...)
CREATE TABLE asset_references (...)
CREATE TABLE trailers (...)
```

### Backend Tasks

1. **Cache System**
   - Create directory structure: `/cache/assets/{ab}/{cd}/`
   - Implement SHA256-based storage
   - Calculate perceptual hashes (pHash) for images
   - Implement deduplication

2. **Asset Download Service**
   - Download images from TMDB URLs
   - Download images from FanArt.tv
   - Process images (resize, optimize)
   - Store in cache with hashing

3. **Library Asset Writer**
   - Copy assets from cache → library directory
   - Use Kodi naming convention (moviename-poster.jpg)
   - Generate NFO files (Kodi format)
   - Handle asset updates

4. **Asset API Endpoints**
   ```
   GET    /api/movies/:id/assets
   POST   /api/movies/:id/assets/:type/download
   POST   /api/movies/:id/assets/:type/upload
   DELETE /api/movies/:id/assets/:type
   GET    /cache/assets/{hash}
   ```

### Frontend Tasks

1. **Asset Display**
   - Show posters in grid view
   - Show fanart in detail view
   - Display all asset types (poster, fanart, logo, clearart, banner)
   - Image lazy loading

2. **Asset Management UI**
   - View available assets from provider
   - Select different asset from provider
   - Upload custom asset
   - Delete asset

3. **NFO Preview**
   - View generated NFO
   - Download NFO file

### Testing

- Download assets for 50 movies
- Verify cache deduplication
- Test image processing
- Validate NFO format

### Deliverables

- [x] Assets downloaded and cached
- [x] Library files written (Kodi format)
- [x] NFO generation working
- [x] Asset management UI functional

### Estimated Time: 10-14 days

## Phase 4: Job Queue & Background Processing (Week 8)

**Goal**: Asynchronous processing with priority queue

### Database Schema (Add)

```sql
CREATE TABLE job_queue (...)
CREATE TABLE job_dependencies (...)
```

### Backend Tasks

1. **Job Queue System**
   - Implement database-backed queue
   - Priority-based job selection
   - Retry logic with exponential backoff
   - Job status tracking

2. **Job Types**
   - `scan`: Library scan job
   - `enrichment`: Fetch metadata
   - `asset_download`: Download single asset
   - `webhook`: Process webhook (Phase 5)

3. **Background Worker**
   - Continuous job processor
   - Graceful shutdown
   - Error handling
   - Concurrency control

4. **Progress Tracking**
   - SSE endpoint for job progress
   - Job history
   - Failed job inspection

5. **Job API Endpoints**
   ```
   GET    /api/jobs
   GET    /api/jobs/:id
   POST   /api/jobs/:id/retry
   DELETE /api/jobs/:id
   GET    /api/jobs/stream (SSE)
   ```

### Frontend Tasks

1. **Job Status UI**
   - Active jobs list
   - Progress bars
   - Failed jobs with retry button
   - Job history

2. **Real-time Updates**
   - SSE connection for job updates
   - Toast notifications on completion
   - Error notifications

### Testing

- Queue 100 enrichment jobs
- Verify priority ordering
- Test retry logic
- Monitor memory usage

### Deliverables

- [x] Job queue operational
- [x] Background worker running
- [x] Progress tracking in UI
- [x] Retry mechanism working

### Estimated Time: 7-10 days

## Phase 5: Webhook Integration (Week 9)

**Goal**: Radarr/Sonarr webhook handling

### Database Schema (Add)

```sql
CREATE TABLE webhook_events (...)
```

### Backend Tasks

1. **Webhook Receiver**
   - Radarr webhook endpoint
   - Sonarr webhook endpoint (TV shows - future)
   - Payload validation
   - Event logging

2. **Webhook Processing**
   - `Download`: New media → create job (priority 1)
   - `MovieFileDelete`: Capture playback state
   - `Upgrade`: Update file path, restore assets
   - `Test`: Respond with success

3. **Webhook API Endpoints**
   ```
   POST   /api/webhooks/radarr
   POST   /api/webhooks/sonarr
   GET    /api/webhooks/events
   ```

### Frontend Tasks

1. **Webhook Configuration**
   - Display webhook URL
   - Show webhook events log
   - Test webhook button

2. **Setup Instructions**
   - Copy-paste instructions for Radarr
   - Required webhook events to enable

### Testing

- Configure Radarr with webhook
- Download new movie via Radarr
- Verify automatic processing
- Test upgrade scenario

### Deliverables

- [x] Radarr webhooks working
- [x] New movies auto-processed
- [x] Upgrade handling functional
- [x] Event log visible in UI

### Estimated Time: 5-7 days

## Phase 6: Kodi Integration (Week 10)

**Goal**: Media player notification and library updates

### Database Schema (Add)

```sql
CREATE TABLE media_player_groups (...)
CREATE TABLE media_players (...)
CREATE TABLE path_mappings (...)
CREATE TABLE playback_state (...)
```

### Backend Tasks

1. **Kodi Client**
   - JSON-RPC over WebSocket
   - Library update notifications
   - Playback state queries
   - Player control (play, stop, resume)

2. **Path Translation**
   - Metarr path → Kodi path mapping
   - Auto-detection (compare file lists)
   - Manual configuration

3. **Playback State Management**
   - Query active playback
   - Capture position (seconds + percentage)
   - Restore playback after upgrade

4. **Kodi API Endpoints**
   ```
   POST   /api/players
   GET    /api/players
   PUT    /api/players/:id
   DELETE /api/players/:id
   POST   /api/players/:id/notify
   GET    /api/players/:id/playback-state
   ```

### Frontend Tasks

1. **Media Player Configuration**
   - Add Kodi instance
   - Create player group
   - Configure path mappings
   - Test connection

2. **Player Status Dashboard**
   - Show online/offline status
   - Display current playback
   - Manual library update button

### Testing

- Connect to Kodi instance
- Trigger library update
- Play movie, upgrade during playback
- Verify playback resume

### Deliverables

- [x] Kodi integration working
- [x] Library notifications sent
- [x] Playback state capture/restore
- [x] Path mapping functional

### Estimated Time: 7-10 days

## Phase 7: Field Locking & Manual Overrides (Week 11)

**Goal**: User edits persist, locked fields excluded from automation

### Database Schema (Modify)

```sql
-- Add to movies table:
title_locked, plot_locked, poster_locked, etc.
```

### Backend Tasks

1. **Field Locking Logic**
   - Lock field on manual edit
   - Exclude locked fields from enrichment
   - Unlock endpoint (re-enable automation)

2. **Edit Tracking**
   - Detect user vs automation changes
   - Activity log for edits

3. **Locking API Endpoints**
   ```
   PUT    /api/movies/:id/fields/:field/lock
   PUT    /api/movies/:id/fields/:field/unlock
   GET    /api/movies/:id/locks
   ```

### Frontend Tasks

1. **Lock Indicators**
   - Show 🔒 icon on locked fields
   - Show lock status in edit form
   - Unlock button per field

2. **Edit Form Enhancements**
   - Auto-lock on manual edit
   - Warning when unlocking field
   - Bulk unlock option

### Testing

- Edit movie title manually
- Re-run enrichment
- Verify title unchanged
- Unlock and re-enrich

### Deliverables

- [x] Field locking operational
- [x] Manual edits preserved
- [x] Unlock functionality working
- [x] Lock indicators in UI

### Estimated Time: 5-7 days

## Phase 8: Soft Deletes & Trash Management (Week 12)

**Goal**: 30-day recovery period for deleted media

### Database Schema (Modify)

```sql
-- Add to movies table:
deleted_at TIMESTAMP
```

### Backend Tasks

1. **Soft Delete Logic**
   - Set `deleted_at = NOW() + 30 days`
   - Filter deleted records from queries
   - Restore functionality

2. **Scheduled Cleanup**
   - Daily job: permanently delete expired
   - Cascade delete relationships
   - Decrement asset references
   - Delete library files

3. **Weekly Cache Cleanup**
   - Find orphaned assets (ref_count = 0)
   - Delete files older than 90 days

4. **Trash API Endpoints**
   ```
   GET    /api/trash
   POST   /api/movies/:id/restore
   DELETE /api/movies/:id/permanent
   POST   /api/trash/empty
   ```

### Frontend Tasks

1. **Trash View**
   - List deleted movies
   - Show expiration date
   - Restore button
   - Permanent delete button

2. **Trash Management**
   - Empty trash (all expired)
   - Batch restore
   - Auto-refresh countdown

### Testing

- Delete movie via webhook
- Verify soft delete
- Restore movie
- Wait for expiration, verify permanent delete

### Deliverables

- [x] Soft delete working
- [x] Restore functional
- [x] Scheduled cleanup running
- [x] Trash UI operational

### Estimated Time: 5-7 days

## Phase 9: TV Show Support (Weeks 13-15)

**Goal**: Full support for TV series and episodes

### Database Schema (Add)

```sql
CREATE TABLE series (...)
CREATE TABLE seasons (...)
CREATE TABLE episodes (...)
-- Link tables for series
```

### Backend Tasks

1. **TVDB Integration**
   - TVDB API client
   - Series search
   - Episode metadata
   - Series/season/episode artwork

2. **TV Show Scanning**
   - Parse episode filenames (S01E01 format)
   - Group by series
   - Link episodes to seasons

3. **TV Show Enrichment**
   - Fetch series metadata
   - Fetch all episodes
   - Download season/episode artwork
   - Generate series/episode NFO files

4. **TV API Endpoints**
   ```
   GET    /api/series
   GET    /api/series/:id
   GET    /api/series/:id/seasons
   GET    /api/series/:id/seasons/:season/episodes
   ```

### Frontend Tasks

1. **Series List View**
   - Grid view with series posters
   - Series detail page
   - Season list with posters
   - Episode list with thumbs

2. **Episode Detail Page**
   - Episode metadata
   - Season/episode artwork
   - Cast & crew

### Testing

- Scan TV show library
- Identify series via TVDB
- Enrich with metadata
- Verify episode NFO files

### Deliverables

- [x] TV show scanning working
- [x] TVDB integration complete
- [x] Episodes displayed in UI
- [x] Episode NFO generation functional

### Estimated Time: 15-21 days

## Phase 10: Music Support (Weeks 16-18)

**Goal**: Full support for music libraries

### Database Schema (Add)

```sql
CREATE TABLE artists (...)
CREATE TABLE albums (...)
CREATE TABLE tracks (...)
-- Link tables for music
```

### Backend Tasks

1. **MusicBrainz Integration**
   - MusicBrainz API client
   - Artist/album search
   - Track metadata

2. **Music Scanning**
   - Parse music files (.mp3, .flac)
   - Extract ID3 tags
   - Group by artist/album

3. **Music Enrichment**
   - Fetch artist/album metadata
   - Download artist/album artwork
   - Generate artist/album NFO files

4. **Music API Endpoints**
   ```
   GET    /api/artists
   GET    /api/artists/:id
   GET    /api/artists/:id/albums
   GET    /api/albums/:id/tracks
   ```

### Frontend Tasks

1. **Artist List View**
   - Grid view with artist thumbs
   - Artist detail page
   - Album list with covers

2. **Album Detail Page**
   - Track listing
   - Album metadata
   - Album artwork

### Testing

- Scan music library
- Identify artists via MusicBrainz
- Enrich with metadata
- Verify NFO files

### Deliverables

- [x] Music scanning working
- [x] MusicBrainz integration complete
- [x] Artists/albums displayed in UI
- [x] Music NFO generation functional

### Estimated Time: 15-21 days

## Phase 11: Performance & Optimization (Week 19)

**Goal**: Handle large libraries (5000+ items)

### Backend Tasks

1. **Database Optimization**
   - Add missing indexes
   - Optimize slow queries
   - Connection pooling

2. **API Pagination**
   - Cursor-based pagination
   - Configurable page size
   - Total count optimization

3. **Caching Layer**
   - Redis for hot data (optional)
   - In-memory cache for config
   - ETags for HTTP caching

4. **Asset Optimization**
   - Image resizing (multiple sizes)
   - WebP conversion
   - CDN-ready headers

### Frontend Tasks

1. **Virtual Scrolling**
   - Implement react-window
   - Render only visible items
   - Maintain scroll position

2. **Lazy Loading**
   - Images load on scroll
   - Route-based code splitting
   - Component lazy loading

3. **Debouncing**
   - Search input debouncing
   - Filter debouncing

### Testing

- Load 5000 movies
- Measure query times
- Test scroll performance
- Monitor memory usage

### Deliverables

- [x] Pagination implemented
- [x] Virtual scrolling working
- [x] Query times < 100ms
- [x] UI responsive with large libraries

### Estimated Time: 7-10 days

## Phase 12: Production Readiness (Week 20)

**Goal**: Deploy to production environment

### Backend Tasks

1. **Docker Setup**
   - Create Dockerfile
   - Docker Compose with PostgreSQL
   - Volume mounts for cache
   - Health checks

2. **Environment Configuration**
   - Production environment variables
   - Secret management
   - Database migrations for PostgreSQL

3. **Logging & Monitoring**
   - Structured logging
   - Error tracking (Sentry)
   - Performance monitoring

4. **Security**
   - Authentication (JWT)
   - API rate limiting
   - CORS configuration
   - Input validation

### Frontend Tasks

1. **Production Build**
   - Optimize bundle size
   - Minification
   - Source maps

2. **Error Boundaries**
   - Catch React errors
   - User-friendly error pages

### DevOps Tasks

1. **CI/CD Pipeline**
   - GitHub Actions
   - Automated tests
   - Docker image builds
   - Deployment automation

2. **Documentation**
   - Installation guide
   - Configuration guide
   - Troubleshooting guide
   - API documentation

### Testing

- Deploy to Docker
- Test with PostgreSQL
- Load test with 10k movies
- Security audit

### Deliverables

- [x] Docker deployment working
- [x] Production environment stable
- [x] Documentation complete
- [x] Ready for users

### Estimated Time: 7-10 days

## Total Timeline

**Minimum**: 20 weeks (5 months)
**Realistic**: 24-26 weeks (6 months)
**With buffer**: 30 weeks (7.5 months)

## Development Priorities

### Must Have (v1.0)
- Movie library management
- TMDB integration
- Asset management
- Webhook automation (Radarr)
- Kodi integration
- Field locking

### Should Have (v1.1)
- TV show support
- Soft deletes
- Performance optimizations

### Nice to Have (v2.0)
- Music support
- Multiple provider support
- Advanced filtering
- User management

## Success Metrics

### Phase 1-8 (Core)
- Scan 500 movies in < 5 minutes
- Enrich 100 movies in < 2 minutes
- UI loads in < 1 second
- Zero data loss during upgrades

### Phase 9-10 (Multi-media)
- Support 1000+ TV episodes
- Support 5000+ music tracks
- Maintain performance metrics

### Phase 11-12 (Production)
- Handle 10,000+ total items
- 99.9% uptime
- API response < 100ms (p95)
- Zero security vulnerabilities

## Related Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) - Overall system design
- [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) - Complete schema reference
- [WORKFLOWS.md](WORKFLOWS.md) - Core workflows and processes
