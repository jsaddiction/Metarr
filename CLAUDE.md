# Metarr - Metadata Management Application

## Comprehensive Documentation

Detailed architecture documentation is located in `docs/`. **Read specific files only when needed for the current task** to avoid context overload.

### Application Overview
Metarr is an application that integrates with various media players and media managers. It maintains **two sources of truth protected from external interference**:

1. **Database**: All metadata (titles, plots, cast, crew, ratings, etc.)
2. **Cache Directory**: All assets (images, trailers, subtitles, etc.)

These are **protected from Radarr/Sonarr/Lidarr deletion** and preserved even if web sources disappear. Metarr can rebuild the entire library directory from these sources in response to most failures.

The application provides media players with a complete media experience through a web UI that allows users to modify content. Changes (manual or automatic) are relayed to media players for inclusion.

### Architecture & Design
- `docs/DATABASE_SCHEMA.md` - Complete database schema with tables, relationships, and query patterns
- `docs/API_ARCHITECTURE.md` - REST API + SSE communication architecture, endpoints, error handling
- `docs/WORKFLOWS.md` - Core application workflows (webhook processing, library scans, scheduled updates)
- `docs/FIELD_LOCKING.md` - Field-level locking system and computed monitoring state

### External Integrations
- `docs/KODI_API.md` - Kodi JSON-RPC API reference (WebSocket + HTTP communication)
- `docs/METADATA_PROVIDERS.md` - TMDB, TVDB, MusicBrainz API integration patterns
- `docs/NFO_PARSING.md` - Kodi NFO file format parsing and validation

### Feature-Specific Documentation
- `docs/IMAGE_MANAGEMENT.md` - Three-tier image storage (Provider → Cache → Library)
- `docs/PATH_MAPPING.md` - Path translation for media managers and players (includes Kodi shared groups)
- `docs/NOTIFICATIONS_AND_LOGGING.md` - Notification channels, activity logging, authentication system

### Frontend Implementation
- `docs/UI_DESIGN.md` - Layout system, color scheme, navigation patterns
- `docs/FRONTEND_COMPONENTS.md` - React components, view modes, routing

## Executive Summary

Metarr is a **"set it and forget it"** metadata management application that bridges downloader tools (Sonarr/Radarr/Lidarr) and media players (Kodi/Jellyfin/Plex). It automates metadata enrichment while preserving manual user edits through a sophisticated field-locking system.

### Core Concepts

**Two-Copy Architecture (Database + Cache as Source of Truth)**
- **Database**: Stores all metadata. NFO files and provider APIs populate it, but database is authoritative
- **Cache Directory**: Stores all assets (images, trailers, subtitles). Protected from external deletion
- **Library Directory**: Ephemeral working directory. Contains media files (not backed up) + assets (rebuilt from cache)
- **Disaster Recovery**: Can rebuild library assets from cache even if web sources are unavailable

**Protection from Media Manager Interference**
- Radarr/Sonarr/Lidarr may delete files during upgrades or cleanup operations
- Metarr preserves assets by maintaining cache copies hidden from media managers
- Database entries and cache files survive media manager operations

**Field-Level Locking**
- Manual user edits automatically lock fields
- Automated processes only update unlocked fields
- Preserves user customization while allowing automatic enrichment

### Primary Workflow
1. **Download Complete** → Sonarr/Radarr sends webhook to Metarr
2. **Parse NFO** → Extract metadata, images, actors, directors from Kodi-format NFO files
3. **Enrich Metadata** → Optionally fetch additional data from TMDB/TVDB
4. **Update Media Players** → Trigger library scan on configured Kodi/Jellyfin/Plex instances
5. **Monitor & Update** → Scheduled updates respect field locks (only update unlocked, incomplete fields)

### Key Features
- **Two-Copy Asset Storage**:
  - Cache copy (source of truth, protected from deletion)
  - Library copy (for media player scans, can be rebuilt)
  - All assets: images, trailers, subtitles
- **Field-Level Locking**: Manual edits automatically lock fields; automated processes only update unlocked fields
- **Computed Monitoring State**: No explicit "monitored" flag - computed from locked fields + completeness config
- **Disaster Recovery**: Rebuild library from database + cache if:
  - Radarr/Sonarr deletes assets during cleanup
  - Web sources (TMDB/TVDB) remove images
  - User accidentally deletes library directory
  - Only requirement: media file must still exist
- **Path Mapping**: Translate filesystem paths between Metarr, downloaders, and media players
- **NFO Hash Validation**: Re-parse NFO files only when content changes (SHA-256 hash comparison)
- **Priority-Based Task System**: Webhooks (critical) > User actions (high) > Scheduled updates (normal) > Library scans (low)
- **Real-Time Communication**: REST API for CRUD operations, SSE for status updates and progress monitoring

## Technology Stack

### Backend
- **Runtime**: Node.js with TypeScript
- **Web Framework**: Express.js
- **Database**: Multi-database support (SQLite3 for development, PostgreSQL for production)
- **Communication**: REST API + Server-Sent Events (SSE)

### Frontend
- **Framework**: React with Vite
- **Language**: TypeScript
- **Styling**: Tailwind CSS with purple theme (matching Sonarr/Radarr design patterns)
- **State Management**: React hooks + EventSource for real-time updates

### Integrations
- **Media Players**: Kodi (WebSocket + HTTP), Jellyfin (REST), Plex (future)
- **Metadata Providers**: TMDB (movies/TV), TVDB (TV shows), MusicBrainz (music - future)
- **Downloaders**: Sonarr, Radarr, Lidarr (webhook receivers)

## Development Commands

### Essential Commands
```bash
# Backend Development
npm run dev              # Start backend development server with hot reload
npm run build           # Build TypeScript to JavaScript
npm start              # Run production build

# Frontend Development
npm run dev:frontend     # Start frontend development server (Vite on port 3001)
npm run build:frontend   # Build frontend for production
npm run dev:all         # Run both backend and frontend concurrently

# Code Quality
npm run lint           # Run ESLint
npm run lint:fix       # Fix ESLint issues automatically
npm run format         # Format code with Prettier
npm run typecheck      # Type check without building
```

### Development Workflow
1. Run `npm run dev:all` to start both backend and frontend servers
2. Backend runs on `http://localhost:3000`
3. Frontend runs on `http://localhost:3001` with proxy to backend
4. Use `npm run lint` before committing changes
5. Run `npm run typecheck` to ensure type safety
6. Format code with `npm run format`
7. **Always delete contents of logs when restarting development server**

## Project Structure
```
src/
├── config/           # Configuration management
├── controllers/      # Request handlers and business logic
├── database/        # Database setup and management
│   ├── migrations/  # Database schema migrations
│   └── seeders/     # Database seed data
├── middleware/      # Express middleware functions
├── models/          # Data models and database entities
├── routes/          # API route definitions
├── services/        # Business logic and external integrations
├── types/           # TypeScript type definitions
└── utils/           # Utility functions and helpers

public/
├── frontend/        # React frontend application
│   ├── src/
│   │   ├── components/  # React components
│   │   │   ├── layout/     # Layout components (Sidebar, Header, Layout)
│   │   │   ├── movie/      # Movie-specific components (MovieTableView)
│   │   │   └── ui/         # Reusable UI components (ViewControls)
│   │   ├── pages/       # Page components
│   │   │   ├── metadata/   # Metadata management pages (Movies)
│   │   │   ├── settings/   # Settings submenu pages (General, Providers, etc.)
│   │   │   └── system/     # System submenu pages (Status, Tasks, etc.)
│   │   ├── styles/      # CSS and styling
│   │   └── utils/       # Frontend utilities
│   └── index.html       # Frontend entry point
└── dist/           # Built frontend assets

docs/               # Comprehensive documentation
vite.config.ts      # Frontend build configuration

data/               # Runtime data (NOT in git)
├── cache/          # Protected asset storage (SOURCE OF TRUTH)
│   ├── images/     # {entityId}/poster_hash.jpg, fanart_hash.jpg
│   ├── trailers/   # {entityId}/trailer_hash.mp4
│   └── subtitles/  # {entityId}/subtitle_lang_hash.srt
└── metarr.sqlite   # Database (metadata SOURCE OF TRUTH)
```

## Two-Copy Architecture: Asset Management

### Core Principle
**Metarr maintains TWO copies of every asset for resilience and disaster recovery:**

1. **Cache Copy** (Source of Truth)
   - Location: `data/cache/{type}/{entityId}/`
   - Purpose: Protected from Radarr/Sonarr/Lidarr deletion
   - Survives: Media manager cleanup, web source removal
   - Never deleted by Metarr except during explicit entity removal

2. **Library Copy** (Working Copy)
   - Location: Movie directory with media file
   - Purpose: For media player scans (Kodi/Jellyfin/Plex)
   - Naming: Kodi naming convention (`moviename-poster.jpg`)
   - Can be: Deleted by media managers, rebuilt from cache

### Asset Flow

**Discovery in Library** (Most Common)
```
User places file → Metarr scans directory → Copies to cache → Keeps library copy
                                          → Stores both paths in database
```

**Download from Web** (TMDB/TVDB)
```
Download to temp → Process (hash, dimensions) → Move to cache → Copy to library
                                               → Store both paths in database
```

**User Assignment** (Unknown Files)
```
Unknown file in library → User identifies type → Copy to cache → Rename/move library copy to Kodi naming
                                                → Store both paths in database
```

### Disaster Recovery Scenarios

**Scenario 1: Radarr Deletes Images During Upgrade**
```
Before: Library has poster.jpg, fanart.jpg (both in cache too)
Radarr: Deletes all images during movie quality upgrade
Metarr: Detects missing files during next scan
Action: Copies from cache → library (uses cached files)
Result: Images restored, no web API calls needed
```

**Scenario 2: TMDB Removes Image from API**
```
Before: Image URL stored in database, cached locally
TMDB:   Removes image from their servers (happens occasionally)
Metarr: Cannot re-download, but has cache copy
Action: Can still rebuild library from cache
Result: Image preserved despite web source removal
```

**Scenario 3: User Accidentally Deletes Movie Directory**
```
Before: Database has metadata, cache has all assets
User:   rm -rf "/movies/The Matrix (1999)/"
Metarr: Database still has movie entry, cache intact
Action: User re-downloads movie file via Radarr
        Metarr receives webhook, rebuilds directory from cache
Result: All metadata and assets restored (only movie file re-downloaded)
```

### Database Schema (Two Paths)

```sql
-- Images table
CREATE TABLE images (
  cache_path TEXT,      -- /data/cache/images/123/poster_abc.jpg (SOURCE OF TRUTH)
  library_path TEXT     -- /movies/The Matrix/The Matrix-poster.jpg (WORKING COPY)
);

-- Trailers table
CREATE TABLE trailers (
  cache_path TEXT,      -- /data/cache/trailers/123/trailer_def.mp4
  local_path TEXT       -- /movies/The Matrix/The Matrix-trailer.mp4
);

-- Subtitles table
CREATE TABLE subtitle_streams (
  cache_path TEXT,      -- /data/cache/subtitles/123/subtitle_eng_ghi.srt
  file_path TEXT        -- /movies/The Matrix/The Matrix.en.srt
);
```

### What Metarr DOES NOT Backup
- **Media files themselves** (movies, TV episodes, music files)
- Reason: Too large, user has Radarr/Sonarr for this
- Metarr only tracks the file path to generate proper asset naming

### Backup Strategy
**Critical to backup:**
1. Database (`data/metarr.sqlite` or PostgreSQL database)
2. Cache directory (`data/cache/`)

**Optional to backup:**
3. Configuration files

**Do NOT need to backup:**
- Media files (user's responsibility via Radarr/Sonarr backups)
- Library directory assets (can be rebuilt from cache)
- Logs

## Configuration

### Environment Variables
```env
# Server
PORT=3000
NODE_ENV=development

# Database
DB_TYPE=sqlite3                    # sqlite3 | postgres | mysql
DB_HOST=localhost                  # For postgres/mysql
DB_PORT=5432                       # For postgres/mysql
DB_NAME=metarr                     # Database name
DB_USER=metarr                     # For postgres/mysql
DB_PASSWORD=password               # For postgres/mysql
DB_FILE=./data/metarr.sqlite       # For SQLite3

# API Keys
TMDB_API_KEY=your_tmdb_key

# Media Players
KODI_HOST=192.168.1.100
KODI_PORT=8080
KODI_USERNAME=kodi
KODI_PASSWORD=password

JELLYFIN_HOST=192.168.1.101
JELLYFIN_PORT=8096
JELLYFIN_API_KEY=your_jellyfin_key
```

## Development Notes

### Adding New Providers
1. Create provider class in `src/services/providers/`
2. Implement `IMetadataProvider` interface
3. Add provider configuration to `src/config/providers.ts`
4. Register provider in `src/services/providerService.ts`

### Adding New Media Players
1. Create player class in `src/services/players/`
2. Implement `IMediaPlayer` interface
3. Add player configuration to `src/config/players.ts`
4. Register player in `src/services/playerService.ts`

### Database Migrations
1. Create migration file in `src/database/migrations/`
2. Follow naming convention: `YYYYMMDD_HHmmss_description.ts`
3. Implement `up()` and `down()` methods
4. Run with migration service

## Troubleshooting

### Common Issues
1. **Database Connection**: Check DB_TYPE and connection settings
2. **API Keys**: Verify provider API key validity
3. **Media Player Connection**: Test network connectivity and credentials
4. **Webhook Delivery**: Check firewall and port accessibility

### Logging
- Application logs: `logs/app.log`
- Error logs: `logs/error.log`
- Job processing: `logs/jobs.log`
- Database queries: Debug mode only
- See `docs/NOTIFICATIONS_AND_LOGGING.md` for log rotation and retention

**Monitoring Logs During Development (Windows):**
```bash
# Tail logs in real-time using PowerShell
powershell -Command "Get-Content logs/app.log -Tail 50 -Wait"
powershell -Command "Get-Content logs/error.log -Tail 50 -Wait"
```

**IMPORTANT:** Always monitor both `app.log` and `error.log` when troubleshooting backend server issues. Run these commands in background terminals to capture real-time activity.

## Future Enhancements
- Plex media player support
- Advanced metadata matching algorithms
- Custom metadata provider plugins
- Bulk library processing
- Mobile application companion
