# Metarr - Metadata Management Application

## Comprehensive Documentation

Detailed architecture documentation is located in `docs/`. **Read specific files only when needed for the current task** to avoid context overload.

### Application Overview

Metarr is a web-based metadata management application inspired by MediaElch, designed for Docker deployment. It provides intelligent metadata management with **user control first**, bridging media managers (Sonarr/Radarr/Lidarr) and media players (Kodi/Jellyfin/Plex).

**Core Principle**: "Intelligent Defaults with Manual Override Capability"
- Initial setup: User chooses automation level (Manual, YOLO, or Hybrid)
- Manual edits are sacred: Locks prevent automation from overwriting user changes
- Webhooks (if enabled): Fully automated for hands-off operation
- Cache as source of truth: Immutable, content-addressed storage protects against data loss

### Quick Start Documentation

**For Resuming Work** (Most Important):
1. **[PROJECT_ROADMAP.md](docs/PROJECT_ROADMAP.md)** - **START HERE** - Current status, what's done, what's next
2. **[STAGE_DEFINITIONS.md](docs/STAGE_DEFINITIONS.md)** - Detailed stage plans and tasks
3. **[GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md)** - Branch strategy, commit conventions, development rules

**For Understanding Design**:
1. **[DESIGN_DECISIONS.md](docs/DESIGN_DECISIONS.md)** - Why we made specific architectural choices
2. **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** - Complete architectural vision and design principles

**Core Architecture**:
- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** - System design, data flow, technology stack
- **[DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md)** - Complete schema with new tables (asset_candidates, cache_inventory, publish_log)
- **[WORKFLOWS.md](docs/WORKFLOWS.md)** - Two-phase scanning, enrichment pipeline, operational workflows
- **[API_ARCHITECTURE.md](docs/API_ARCHITECTURE.md)** - REST API + WebSocket communication

**Feature Areas**:
- **[ASSET_MANAGEMENT.md](docs/ASSET_MANAGEMENT.md)** - Three-tier asset system (Candidates → Cache → Library)
- **[AUTOMATION_AND_WEBHOOKS.md](docs/AUTOMATION_AND_WEBHOOKS.md)** - Automation levels, webhook handling, field locking
- **[PUBLISHING_WORKFLOW.md](docs/PUBLISHING_WORKFLOW.md)** - Dirty state, transactional publishing, player notification
- **[FIELD_LOCKING.md](docs/FIELD_LOCKING.md)** - Field-level locking system

**External Integrations**:
- **[METADATA_PROVIDERS.md](docs/METADATA_PROVIDERS.md)** - TMDB, TVDB integration, rate limiting
- **[KODI_API.md](docs/KODI_API.md)** - Kodi JSON-RPC reference
- **[WEBHOOKS.md](docs/WEBHOOKS.md)** - Radarr/Sonarr webhook handling
- **[NFO_PARSING.md](docs/NFO_PARSING.md)** - Kodi NFO format

**System**:
- **[PATH_MAPPING.md](docs/PATH_MAPPING.md)** - Path translation between systems
- **[NOTIFICATIONS_AND_LOGGING.md](docs/NOTIFICATIONS_AND_LOGGING.md)** - Logging, notifications
- **[TESTING.md](docs/TESTING.md)** - Test infrastructure, writing tests, current status

**Frontend**:
- **[UI_DESIGN.md](docs/UI_DESIGN.md)** - Layout, color scheme
- **[FRONTEND_COMPONENTS.md](docs/FRONTEND_COMPONENTS.md)** - React components

## Executive Summary

Metarr is a **web-based metadata management application** inspired by MediaElch, designed to give users complete control over media library metadata while optionally leveraging intelligent automation. It bridges media managers (Sonarr/Radarr/Lidarr) and media players (Kodi/Jellyfin/Plex) with a flexible workflow system.

### Design Philosophy

**"Intelligent Defaults with Manual Override Capability"**

1. **User Control First**: Choose your automation level
   - **Manual Mode**: Full MediaElch-style control (scan → review → edit → publish)
   - **YOLO Mode**: Full automation (trust the algorithm, fix mistakes later)
   - **Hybrid Mode**: Auto-process but review before publishing (recommended default)

2. **Manual Edits are Sacred**: Any user change locks that field/asset permanently
   - Locked fields excluded from all future automation
   - Visual indicators: 🔒 User Selected vs 🤖 Auto Selected
   - Unlock capability when user wants automation back

3. **Webhooks = Full Automation**: If enabled, new downloads auto-publish
   - User opted in because they want automation
   - Seamless integration with existing *arr stack
   - Upgrades restore from cache (disaster recovery built-in)

### Core Architecture

**Three-Tier Asset System** (replaces two-copy architecture)

```
Tier 1: CANDIDATES (Provider URLs + Metadata)
  ↓ User selects or algorithm chooses
Tier 2: CACHE (Content-Addressed Immutable Storage)
  ↓ User clicks "Publish"
Tier 3: LIBRARY (Published Assets for Players)
```

**Two-Phase Scanning** (fast feedback, non-blocking)

```
Phase 1: FAST LOCAL SCAN (minutes)
  - Filesystem discovery, NFO parsing, FFprobe
  - No provider API calls
  - User sees library immediately

Phase 2: LAZY ENRICHMENT (hours to days, background)
  - Provider metadata fetch (rate-limited)
  - Asset candidate collection
  - Auto-selection (if enabled)
  - Non-blocking, resumable
```

**Data State Machine**

```
DISCOVERED → IDENTIFIED → ENRICHING → ENRICHED → SELECTED → PUBLISHED
                                                             ↑
                                                    (dirty state tracking)
```

### Key Features

- **Content-Addressed Cache**: SHA256-based naming, automatic deduplication, immutable storage
- **Dirty State Tracking**: `has_unpublished_changes` flag, batch publishing, rollback capability
- **Field & Asset Locking**: Per-field and per-asset granular locking preserves user intent
- **Transactional Publishing**: Atomic writes, rollback on failure, player notification
- **Disaster Recovery**: Restore from cache when Radarr/Sonarr deletes assets during upgrades
- **Background Jobs**: Priority queue (webhooks > user actions > auto-enrichment > library scans)
- **Rate Limiting**: Respect provider quotas (50/sec TMDB, 1/sec TVDB), reserved capacity for webhooks
- **Real-Time Updates**: WebSocket for progress tracking, connection state awareness
- **Scale-Aware**: Virtual scrolling, pagination, indexed queries (target: 32k items)

## Technology Stack

### Backend
- **Runtime**: Node.js with TypeScript
- **Web Framework**: Express.js
- **Database**: Multi-database support (SQLite3 for development, PostgreSQL for production)
- **Communication**: REST API + WebSocket

### Frontend
- **Framework**: React with Vite
- **Language**: TypeScript
- **Styling**: Tailwind CSS with purple theme (matching Sonarr/Radarr design patterns)
- **State Management**: React hooks + WebSocket for real-time updates

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

# API Keys (Optional - defaults provided)
# TMDB_API_KEY=your_personal_tmdb_key  # Optional: Uses default project key if not set
# FANART_TV_API_KEY=your_personal_key  # Optional: Uses default project key if not set

# Media Players
KODI_HOST=192.168.1.100
KODI_PORT=8080
KODI_USERNAME=kodi
KODI_PASSWORD=password

JELLYFIN_HOST=192.168.1.101
JELLYFIN_PORT=8096
JELLYFIN_API_KEY=your_jellyfin_key
```

### Zero-Configuration Philosophy

**Metarr works completely out-of-the-box with ZERO required environment variables for local development.**

The application includes embedded default API keys for services that offer free project-level keys. This means:
- Clone the repo → `npm install` → `npm run dev` → **It just works!**
- No API key signup required to start developing
- No configuration files to create
- Environment variables are **optional** and only needed for Docker deployment or personal preferences

**Providers with Embedded Keys:**

- **TMDB (The Movie Database)**
  - Embedded: Project API key (40 requests per 10 seconds)
  - Override: Set `TMDB_API_KEY` environment variable for personal usage tracking
  - Get yours: https://www.themoviedb.org/settings/api

- **TVDB (The TV Database)**
  - Embedded: Project API key (30 requests per 10 seconds)
  - Override: Set `TVDB_API_KEY` environment variable for personal usage tracking
  - Get yours: https://thetvdb.com/api-information

- **FanArt.tv**
  - Embedded: Project API key (10 requests per second)
  - Override: Set `FANART_TV_API_KEY` for 2x faster rate limits (20 req/sec)
  - Get yours: https://fanart.tv/get-an-api-key/

**Why Override with Your Own Key?**
- Track your personal API usage and analytics
- Support the provider services by registering as a user
- Get higher rate limits (FanArt.tv: 20 req/sec vs 10 req/sec)
- All keys are completely free for personal/open-source use

**Implementation:**
- Default keys: `src/config/providerDefaults.ts`
- Fallback logic: `src/config/ConfigManager.ts`
- User overrides via environment variables take precedence
- Logs indicate which key type is being used (default vs user-provided)

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

## ⚠️ Critical Development Rules for Claude (AI Assistant)

### Server Management - DO NOT TOUCH!

**YOU (the human) control all Node.js servers. Claude NEVER runs server commands.**

**Claude Must NEVER Run**:
- `npm run dev`, `npm run dev:backend`, `npm run dev:frontend`, `npm start`
- `pkill node`, `killall node`, or any process killing commands
- Any command that starts/stops/restarts servers

**Why**: Killing Node processes terminates Claude's session, losing all context. This is catastrophic during troubleshooting.

**What Claude Should Do**:
- ✅ Ask you to restart servers when needed
- ✅ Tell you when hot-reload should handle changes
- ✅ Read logs to diagnose issues
- ✅ Make code changes and let you test

**See [docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md) for complete Claude rules and development workflow.**

## Future Enhancements
- Plex media player support
- Advanced metadata matching algorithms
- Custom metadata provider plugins
- Bulk library processing
- Mobile application companion
