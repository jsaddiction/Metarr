# Metarr Architecture

**Last Updated**: 2025-01-13
**Status**: Design Phase - Ready for Implementation

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Core Principle](#core-principle)
3. [System Architecture](#system-architecture)
4. [Core Workflows](#core-workflows)
5. [Technology Stack](#technology-stack)
6. [Directory Structure](#directory-structure)
7. [Key Concepts](#key-concepts)
8. [Related Documentation](#related-documentation)

---

## Executive Summary

**What Metarr Does:**

Metarr is an intelligent bridge between the *arr stack (Radarr/Sonarr/Lidarr) and media players (Kodi/Jellyfin/Plex). It automatically enriches media libraries with high-quality metadata and artwork from multiple providers (TMDB, TVDB, Fanart.tv, MusicBrainz, etc.), maintains a local cache to protect against data loss, and gives users authoritative control to override any automatically-selected content.

**The Problem Metarr Solves:**

1. **Limited Metadata Sources**: *arr stack only uses TMDB, missing high-quality artwork from Fanart.tv and other providers
2. **Data Loss**: *arr stack deletes artwork during quality upgrades
3. **No User Control**: Can't manually select better artwork without external tools
4. **Provider Availability**: Online resources can remove images, breaking libraries
5. **Manual Management**: MediaElch requires full manual curation for every item

**How Metarr Works:**

- **Webhook-Driven Automation**: *arr downloads media → webhook → Metarr enriches automatically → notifies players
- **Cache Protection**: All assets stored locally with content-addressable naming (SHA256 hashing)
- **Manual Override**: Don't like the poster? Click and replace it. Your choice is locked from future automation
- **Disaster Recovery**: *arr upgrades media → Metarr detects and restores your cached selections
- **Scheduled Realignment**: Daily/weekly scans ensure library stays in sync with Metarr's database
- **Standalone Mode**: Works without *arr stack using filesystem watchers or scheduled scans

---

## Core Principle

```
┌─────────────────────────────────────────────────────────────┐
│         "Automate Everything, Override Anything"             │
└─────────────────────────────────────────────────────────────┘
```

**Primary Use Case (95%)**: Hands-off automation via webhooks
**Secondary Use Case (5%)**: Manual asset replacement when auto-selection isn't perfect

### Key Tenets

1. **Automation First**: Webhooks trigger immediate, fully-automated enrichment
2. **Manual Override Capability**: User can replace any asset at any time
3. **Field Locking**: Manual edits are sacred - automation never overwrites them
4. **Cache as Source of Truth**: All assets cached locally, library is ephemeral
5. **Disaster Recovery**: Restore from cache when *arr deletes assets during upgrades
6. **Concurrent Processing**: Download assets in parallel (10+ concurrent workers)
7. **Path Mapping**: Support different paths between Metarr and media players
8. **Multi-Media Support**: Movies, TV Shows, Music with specialized workers

---

## System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        METARR SYSTEM                         │
└─────────────────────────────────────────────────────────────┘

INPUT SOURCES:
├─ Webhooks (*arr stack) ──────► Process immediately (priority queue)
├─ Manual Library Scan ─────────► User-triggered full scan
├─ Scheduled Realignment ───────► Daily/weekly verification
└─ Filesystem Watcher ──────────► Standalone mode (no *arr)

PROCESSING PIPELINE:
├─ 1. Identify Media (TMDB ID via NFO → *arr API → filename parsing)
├─ 2. Scrape Providers (TMDB, TVDB, Fanart.tv, MusicBrainz)
├─ 3. Score & Select Best Assets (configurable algorithm)
├─ 4. Download to Cache (concurrent workers, content-addressed)
└─ 5. Deploy to Library (Kodi naming conventions, path mapping)

OUTPUT:
├─ Library Assets (poster.jpg, fanart.jpg, etc.)
├─ NFO Files (Kodi-compatible XML with metadata)
└─ Player Notifications (Kodi JSON-RPC, Jellyfin API, Plex API)
```

### Component Diagram

```
┌──────────────┐
│   Frontend   │  React + Vite + TailwindCSS + shadcn/ui
│   (Port      │  - Virtual scrolling (react-window)
│    3001)     │  - Real-time progress (WebSocket)
└──────┬───────┘  - Manual asset selection
       │
       │ REST API
       ↓
┌──────────────┐
│   Backend    │  Node.js + Express + TypeScript
│   (Port      │  - API routes
│    3000)     │  - Webhook receivers
└──────┬───────┘  - Background job processor
       │
       ├─────────────┬─────────────┬─────────────┬─────────────┐
       ↓             ↓             ↓             ↓             ↓
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│ Database │  │  Cache   │  │ Library  │  │ External │  │  Job     │
│(SQLite3/ │  │(Content  │  │(Media    │  │(TMDB,    │  │  Queue   │
│Postgres) │  │Address)  │  │Files +   │  │TVDB,     │  │(Database)│
│          │  │          │  │Assets)   │  │Players)  │  │          │
└──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘
```

### Core Services

```typescript
ScanService
  ├─ scanLibrary(libraryId)          // Full library scan
  ├─ scanDirectory(path)             // Single directory
  ├─ discoverLocalAssets()           // Find existing posters/fanart
  └─ parseNFO()                      // Extract metadata from NFO

EnrichmentService
  ├─ enrichMovie(movieId)            // Fetch from providers
  ├─ enrichSeries(seriesId)          // TV show enrichment
  ├─ enrichAlbum(albumId)            // Music enrichment
  ├─ fetchAssetURLs()                // Get candidate URLs
  └─ respectLocks()                  // Skip locked fields

AssetSelectionService
  ├─ autoSelectAssets()              // Algorithm-based selection
  ├─ scoreCandidate()                // Resolution + votes + language + provider
  ├─ filterDuplicates()              // pHash similarity check
  └─ downloadAssets()                // Concurrent downloads

CacheService
  ├─ storeAsset()                    // Save with SHA256 naming
  ├─ retrieveAsset()                 // Get by hash
  ├─ getCachePath()                  // /cache/assets/{ab}/{cd}/{hash}.ext
  └─ deduplicateAsset()              // Check if hash exists

PublishService
  ├─ publishMovie(movieId)           // Copy cache → library
  ├─ publishSeries(seriesId)         // Handle seasons/episodes
  ├─ publishAlbum(albumId)           // Music deployment
  ├─ generateNFO()                   // Build NFO from database
  ├─ applyPathMapping()              // Convert local → player paths
  └─ notifyPlayers()                 // Trigger library scans

DisasterRecoveryService
  ├─ detectMissingAssets()           // Check for deleted files
  ├─ restoreFromCache()              // Copy cache → library
  └─ validateIntegrity()             // Verify file hashes

WebhookService
  ├─ handleDownload()                // New media or upgrade
  ├─ handleDelete()                  // Soft delete (recycling)
  ├─ handleRename()                  // Update file paths
  └─ prioritizeJob()                 // Add to high-priority queue

JobQueueService
  ├─ addJob(type, priority, payload) // Enqueue job
  ├─ processJobs()                   // Worker loop
  ├─ retryFailedJob()                // Exponential backoff
  └─ cancelJob()                     // User cancellation

PathMappingService
  ├─ detectMappings()                // Auto-detect from Kodi sources
  ├─ validateMapping()               // Test path with real file
  ├─ convertPath()                   // local → remote
  └─ suggestMappings()               // Intelligent recommendations

NotificationService
  ├─ notifyKodiGroup()               // All Kodi instances in group
  ├─ notifyJellyfin()                // Single Jellyfin instance
  ├─ notifyPlex()                    // Single Plex instance
  └─ handlePlaybackState()           // Pause during upgrades
```

---

## Core Workflows

### 1. Webhook: New Media

**Trigger**: Radarr/Sonarr sends webhook when download completes

**Payload**: `{ eventType: "Download", tmdbId: 603, path: "/movies/The Matrix.mkv" }`

**Flow**:
```
Webhook received → Add to high-priority job queue
  ↓
Check database: tmdb_id NOT found → New media
  ↓
Scan directory:
  - Locate video file
  - Parse NFO if exists (extract tmdb_id, basic metadata)
  - FFprobe video file (stream details: resolution, codecs, audio tracks, subtitles)
  - Discover local assets (poster.jpg, fanart.jpg if already present)
  ↓
Scrape providers (concurrent API calls):
  - TMDB: metadata + 15 poster URLs + 20 fanart URLs
  - TVDB: additional metadata (for TV shows)
  - Fanart.tv: high-res clearlogo, clearart, disc art
  ↓
Auto-select best assets:
  - Score each candidate: resolution (30%) + votes (40%) + language (20%) + provider (10%)
  - Filter duplicates (pHash similarity < 90%)
  - Select: top 1 poster, top 3 fanarts, top 1 logo, etc.
  ↓
Download assets (concurrent, 10 workers):
  - Download from provider URLs
  - Calculate SHA256 hash
  - Check cache: if hash exists, skip download (deduplication)
  - Save: /cache/assets/{ab}/{cd}/{hash}.jpg (first 4 chars of hash)
  - Calculate perceptual hash (pHash) for similarity detection
  ↓
Copy cache → library:
  - Apply path mapping (Metarr path → player path)
  - poster.jpg (top poster)
  - fanart.jpg (top fanart)
  - fanart1.jpg, fanart2.jpg (additional fanarts)
  - clearlogo.png, clearart.png (if available)
  ↓
Generate NFO:
  - All metadata fields (title, plot, genres, actors, directors, etc.)
  - <thumb> tags pointing to asset URLs (backup references)
  - <fileinfo><streamdetails> from FFprobe
  ↓
Write to library: movie.nfo
  ↓
Notify media players:
  - Get all Kodi instances in group (even if just 1)
  - For each Kodi: VideoLibrary.Scan(directory)
  - Jellyfin: Library.Refresh(libraryId)
  - Plex: Library.Refresh(sectionId)
  ↓
DONE ✓ (User sees new movie in player within 30-60 seconds)
```

---

### 2. Webhook: Upgrade

**Trigger**: Radarr upgrades quality (720p → 1080p)

**Payload**: `{ eventType: "Download", isUpgrade: true, tmdbId: 603, path: "..." }`

**Flow**:
```
Webhook received → High priority
  ↓
Check database: tmdb_id=603 FOUND → Existing media
  ↓
Check if anyone is watching (Kodi only):
  - Query each Kodi: Player.GetActivePlayers
  - If playing this movie:
      ├─ Get playback position (Player.GetProperties)
      ├─ Store resume point in database
      ├─ Stop playback (Player.Stop)
      └─ Notify user: "Upgrading quality, will resume shortly"
  ↓
Get previously selected assets from database:
  - Load movie_assets records (selected poster, fanarts, etc.)
  ↓
FFprobe new video file:
  - Stream details changed (1080p vs 720p)
  - Audio tracks may differ
  - Update video_streams, audio_streams tables
  ↓
Copy cache → library:
  - Use existing cached assets (no re-download!)
  - poster.jpg, fanart.jpg, fanart1.jpg, etc.
  - Apply path mapping
  ↓
Regenerate NFO:
  - Use existing metadata
  - Update <fileinfo><streamdetails> with new video specs
  ↓
Write to library: movie.nfo
  ↓
Notify media players (same as new media)
  ↓
Trigger playback resume (if was watching):
  - Wait 5 seconds for library scan to complete
  - Kodi: Player.Open({ movieid, resume: { percentage } })
  ↓
DONE ✓ (Seamless upgrade, no data loss, optional resume)
```

---

### 3. Manual Library Scan / Scheduled Realignment

**Trigger**: User clicks "Scan Library" OR daily cron job

**Flow**:
```
Scan initiated → Add to normal-priority job queue
  ↓
Iterate all directories in library:
  ↓
  For each directory:
    ├─ Check if movie exists in database (by file path)
    │
    ├─ Movie exists:
    │   ├─ Compare NFO hash (detect external edits)
    │   ├─ Check if assets exist in library directory
    │   ├─ If missing:
    │   │   ├─ Copy from cache → library (restore)
    │   │   └─ Regenerate NFO if needed
    │   └─ Skip if everything matches
    │
    └─ Movie not found:
        ├─ New discovery → Process as new media
        ├─ Identify (NFO → *arr API → filename parsing)
        └─ Enrich if identified
  ↓
Progress updates (WebSocket):
  - "Scanning 1234/5000 (Processing: The Matrix)"
  - "Restored 15 missing assets"
  - "Found 5 new movies"
  ↓
After all directories processed:
  - Notify media players (single notification per library)
  ↓
DONE ✓
```

---

### 4. Manual Asset Replacement

**Trigger**: User opens movie detail page and clicks "Replace Poster"

**Flow**:
```
User opens movie detail page
  ↓
UI shows current assets with badges:
  - poster.jpg (badge: "TMDB - Auto Selected")
  - fanart.jpg (badge: "Fanart.tv - Auto Selected")
  - fanart1.jpg (badge: "TMDB - Auto Selected")
  ↓
User clicks "Replace Poster" button
  ↓
Modal opens:
  - Grid of all available posters from providers
  - Current poster highlighted
  - Thumbnails lazy-loaded from provider URLs
  - "Search More Providers" button
  - "Let Algorithm Choose" button
  ↓
User selects poster #7 (from Fanart.tv)
  ↓
Download to cache (if not already cached):
  - Download from provider URL
  - Calculate SHA256 hash
  - Save to cache: /cache/assets/{ab}/{cd}/{hash}.jpg
  ↓
Update database:
  - Mark old poster: is_selected=0
  - Mark new poster: is_selected=1, selected_by='manual'
  - Set poster_locked=1 (prevent future automation)
  ↓
Copy cache → library:
  - Replace poster.jpg with new asset
  - Apply path mapping
  ↓
Regenerate NFO:
  - Update <thumb> tag to new poster URL
  ↓
Notify media players:
  - Kodi: VideoLibrary.Scan(directory)
  - Or fake scan: VideoLibrary.Scan("/doesNotExist") to refresh UI
  ↓
UI updates immediately:
  - Badge changes to "Fanart.tv - Manual Override 🔒"
  - New poster displayed
  ↓
DONE ✓ (Immediately visible in both Metarr and player)
```

---

### 5. Delete Webhook → Recycling

**Trigger**: Radarr sends delete webhook

**Payload**: `{ eventType: "MovieDelete", tmdbId: 603 }`

**Flow**:
```
Webhook received
  ↓
Lookup database: tmdb_id=603 found
  ↓
Soft delete (recycling):
  - UPDATE movies SET deleted_at=NOW(), deleted_reason='arr_delete'
  - Assets stay in cache
  - Library files remain (for now)
  ↓
Trash Day (scheduled weekly):
  ├─ Find items deleted > 30 days ago
  ├─ For each item:
  │   ├─ Get all associated cache files
  │   ├─ Delete files from cache
  │   ├─ DELETE FROM movies (CASCADE deletes movie_assets, etc.)
  │   └─ Clean up orphaned actors/genres
  └─ Clean up orphaned cache assets
  ↓
DONE ✓ (30-day recovery window)
```

---

### 6. Unidentified Media Workflow

**Trigger**: Scan finds movie with no NFO and can't auto-identify

**Flow**:
```
Scan finds: /movies/SomeObscureMovie/movie.mkv
  ↓
Identification attempts:
  1. Parse NFO → No NFO found
  2. Query *arr API by path → Not found
  3. Parse filename: "SomeObscureMovie" → Search TMDB
     ├─ Single match → Auto-accept, continue enrichment
     ├─ Multiple matches → Mark needs_identification
     └─ No matches → Mark needs_identification
  ↓
If needs_identification:
  - INSERT movies (needs_identification=1, file_path, parsed_title)
  - Skip enrichment
  ↓
UI: "Unidentified Media" page shows entry
  ↓
User clicks "Identify"
  ↓
Modal: Search TMDB by title
  - Pre-filled with parsed title
  - User can edit search query
  ↓
Results shown (with posters, year, plot)
  ↓
User selects correct movie
  ↓
Update database:
  - SET tmdb_id, identified_by='user_manual'
  - SET needs_identification=0
  ↓
Queue enrichment job (high priority)
  ↓
Process as normal (scrape → select → download → publish)
  ↓
DONE ✓
```

---

## Technology Stack

### Backend

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Runtime | Node.js 20+ | Async I/O, concurrent downloads, large ecosystem |
| Language | TypeScript | Type safety, better DX, refactoring confidence |
| Framework | Express.js | Mature, simple, extensible, middleware support |
| Database (Dev) | SQLite3 | Zero-config, single file, perfect for development |
| Database (Prod) | PostgreSQL | Scalable, JSON support, full-text search, transactions |
| Job Queue | Database-backed | Simple, no Redis dependency, polling-based |
| Real-time Updates | WebSocket | Bidirectional communication, connection state awareness, ping/pong heartbeat |
| HTTP Client | axios | Proven, interceptors, automatic retries |
| File Hashing | crypto (built-in) | SHA256 for content addressing |
| Image Processing | sharp | Fast, perceptual hashing, thumbnails |

### Frontend

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Framework | React 18 | Component model, hooks, large ecosystem |
| Build Tool | Vite | Fast dev server, HMR, modern |
| Language | TypeScript | Type safety, autocomplete |
| Styling | TailwindCSS + shadcn/ui | Utility-first, consistent with *arr stack aesthetic |
| State Management | TanStack Query | Server state caching, automatic refetching |
| Routing | React Router 6 | Standard, mature, nested routes |
| Virtual Scrolling | react-window | Handle 10k+ item lists efficiently |
| Forms | React Hook Form | Performant, simple validation |

### External Integrations

| Service | Purpose | API Rate Limit | Notes |
|---------|---------|----------------|-------|
| TMDB | Movie/TV metadata, images | 50 requests/second | Primary provider for movies |
| TVDB | TV show metadata | 1 request/second | Primary for TV shows |
| Fanart.tv | High-quality artwork | 2 req/sec (with key) | Best for clearlogos, clearart |
| MusicBrainz | Music metadata | 1 req/sec | Music library support |
| TheAudioDB | Music artwork | 1 req/sec | Album covers, artist images |
| Kodi | Media player | Unlimited (local) | JSON-RPC over HTTP/WebSocket |
| Jellyfin | Media player | Unlimited (local) | REST API |
| Plex | Media player | Unlimited (local) | XML API |
| Radarr | Movie manager | Unlimited (local) | REST API (identification helper) |
| Sonarr | TV manager | Unlimited (local) | REST API (identification helper) |
| Lidarr | Music manager | Unlimited (local) | REST API (identification helper) |

---

## Directory Structure

### Application Structure

```
metarr/
├── src/
│   ├── config/              # Configuration management
│   │   ├── ConfigManager.ts
│   │   ├── defaults.ts
│   │   └── providerDefaults.ts
│   ├── controllers/         # Request handlers
│   │   ├── movieController.ts
│   │   ├── seriesController.ts
│   │   ├── webhookController.ts
│   │   └── assetController.ts
│   ├── database/
│   │   ├── migrations/      # Schema migrations
│   │   │   └── 20250113_001_initial_schema.ts
│   │   └── connection.ts
│   ├── middleware/          # Express middleware
│   │   ├── auth.ts
│   │   └── errorHandler.ts
│   ├── routes/              # API routes
│   │   ├── api.ts
│   │   └── webhooks.ts
│   ├── services/            # Business logic
│   │   ├── scanService.ts
│   │   ├── enrichmentService.ts
│   │   ├── assetSelectionService.ts
│   │   ├── cacheService.ts
│   │   ├── publishService.ts
│   │   ├── webhookService.ts
│   │   ├── jobQueueService.ts
│   │   ├── pathMappingService.ts
│   │   └── notificationService.ts
│   ├── workers/             # Media-type specific workers
│   │   ├── MovieWorker.ts
│   │   ├── TVShowWorker.ts
│   │   └── MusicWorker.ts
│   ├── providers/           # External API clients
│   │   ├── TMDBClient.ts
│   │   ├── TVDBClient.ts
│   │   ├── FanartTVClient.ts
│   │   └── MusicBrainzClient.ts
│   ├── players/             # Media player clients
│   │   ├── KodiClient.ts
│   │   ├── JellyfinClient.ts
│   │   └── PlexClient.ts
│   ├── types/               # TypeScript definitions
│   │   ├── models.ts
│   │   ├── provider.ts
│   │   └── job.ts
│   └── utils/               # Utility functions
│       ├── fileHash.ts
│       ├── perceptualHash.ts
│       └── pathMapping.ts
├── public/
│   └── frontend/            # React application
│       ├── src/
│       │   ├── components/  # React components
│       │   │   ├── layout/
│       │   │   ├── movie/
│       │   │   ├── library/
│       │   │   └── ui/      # shadcn components
│       │   ├── pages/
│       │   ├── hooks/
│       │   └── utils/
│       └── index.html
├── data/                    # Runtime data (NOT in git)
│   ├── cache/
│   │   └── assets/          # Content-addressed storage
│   │       ├── 00/
│   │       │   ├── 01/
│   │       │   │   └── 0001abc...def.jpg
│   │       │   └── 02/
│   │       ├── ab/
│   │       │   └── cd/
│   │       │       └── abcdef123...xyz.jpg
│   │       └── ff/
│   │           └── fe/
│   └── metarr.sqlite        # Development database
├── docs/                    # Documentation
│   ├── ARCHITECTURE.md      # This file
│   ├── DATABASE_SCHEMA.md
│   ├── WORKFLOWS.md
│   └── IMPLEMENTATION_PLAN.md
└── tests/
    ├── unit/
    └── integration/
```

### Cache Directory Structure (Content-Addressed)

```
data/cache/assets/
  ab/                        ← First 2 chars of SHA256 hash
    cd/                      ← Next 2 chars of SHA256 hash
      abcdef123456789...xyz.jpg  ← Full hash filename
      abcd9876543210...uvw.png
  12/
    34/
      1234567890abcd...efg.jpg
  ff/
    fe/
      fffedcba098765...432.mp4

Benefits:
- Even distribution across 65,536 leaf directories (256 × 256)
- ~100-200 files per directory at scale
- OS-agnostic, proven approach (Git uses similar structure)
- No file system limits on single directory file count
```

---

## Key Concepts

### 1. Content-Addressed Cache

**Purpose**: Ensure integrity, enable deduplication within same media, detect corruption

**How It Works**:
```typescript
// Download asset
const buffer = await downloadFromURL(url);

// Calculate hash
const contentHash = crypto
  .createHash('sha256')
  .update(buffer)
  .digest('hex');
// Result: "abcdef1234567890..."

// Generate cache path
const dir1 = contentHash.substring(0, 2);  // "ab"
const dir2 = contentHash.substring(2, 4);  // "cd"
const extension = getExtension(url);        // ".jpg"
const cachePath = `/data/cache/assets/${dir1}/${dir2}/${contentHash}${extension}`;
// Result: /data/cache/assets/ab/cd/abcdef1234567890....jpg

// Check if already cached
if (await fs.exists(cachePath)) {
  console.log('Already cached, skipping download');
  return cachePath;
}

// Create directories and save
await fs.mkdir(path.dirname(cachePath), { recursive: true });
await fs.writeFile(cachePath, buffer);
```

**Deduplication Rules**:
- Within same media: If user replaces fanart1 with fanart3's image, both cache files remain
- Cache size grows based on unique selections per media item, not total selections
- Example: Movie has 1 poster + 3 fanarts = 4 cache files (even if fanarts visually similar)

**Benefits**:
- Integrity verification: Re-hash file, compare to filename
- Corruption detection: Hash mismatch = file corrupted
- Immutable storage: Filename never changes
- No accidental overwrites: Same hash = same file

### 2. Field Locking (Manual Override Protection)

**Purpose**: Prevent automation from overwriting user's manual edits

**Database Implementation**:
```sql
-- Every field/asset has a corresponding lock flag
CREATE TABLE movies (
  title TEXT,
  title_locked BOOLEAN DEFAULT 0,

  plot TEXT,
  plot_locked BOOLEAN DEFAULT 0,

  poster_locked BOOLEAN DEFAULT 0,
  fanart_locked BOOLEAN DEFAULT 0,
  -- ... etc.
);
```

**Behavior**:
```typescript
// User manually changes plot
await db.execute(`
  UPDATE movies
  SET plot = ?, plot_locked = 1
  WHERE id = ?
`, [customPlot, movieId]);

// Future automated enrichment
const tmdbData = await tmdb.getMovieDetails(tmdbId);

// Only update unlocked fields
await db.execute(`
  UPDATE movies
  SET plot = ?
  WHERE id = ? AND plot_locked = 0
`, [tmdbData.overview, movieId]);
// This update won't happen because plot_locked=1
```

**User Can Unlock**: UI button "Allow Automation" → SET field_locked = 0

### 3. Asset Selection Algorithm

**Configurable Scoring Weights**:
```typescript
interface ScoringConfig {
  weight_resolution: number;  // Default: 0.3 (30%)
  weight_votes: number;       // Default: 0.4 (40%)
  weight_language: number;    // Default: 0.2 (20%)
  weight_provider: number;    // Default: 0.1 (10%)
}

function scoreCandidate(
  candidate: AssetCandidate,
  config: ScoringConfig
): number {
  let score = 0;

  // Resolution score (0-100)
  const resScore = Math.min(100, (candidate.width / 2000) * 100);
  score += resScore * config.weight_resolution;

  // Vote score (0-100)
  const voteScore = ((candidate.vote_average || 5) / 10) * 100;
  score += voteScore * config.weight_votes;

  // Language score (0 or 100)
  const langScore = candidate.language === config.prefer_language ? 100 : 0;
  score += langScore * config.weight_language;

  // Provider score (0-100)
  const providerPriority = JSON.parse(config.provider_order);
  const providerIndex = providerPriority.indexOf(candidate.provider);
  const provScore = providerIndex >= 0
    ? 100 - (providerIndex * 20)  // 1st=100, 2nd=80, 3rd=60
    : 0;
  score += provScore * config.weight_provider;

  return score; // Total: 0-100
}
```

**Duplicate Detection (Perceptual Hashing)**:
```typescript
import * as sharp from 'sharp';

// Calculate pHash
async function calculatePHash(imagePath: string): Promise<string> {
  const buffer = await sharp(imagePath)
    .resize(32, 32)      // Normalize size
    .grayscale()         // Ignore color
    .raw()
    .toBuffer();

  // DCT + hashing logic (simplified)
  const hash = await pHash.compute(buffer);
  return hash; // "a1b2c3d4e5f6g7h8"
}

// Compare similarity
function comparePHashes(hash1: string, hash2: string): number {
  const distance = hammingDistance(hash1, hash2);
  const maxDistance = hash1.length * 4;
  return 1 - (distance / maxDistance); // 0.0 to 1.0
}

// Filter duplicates
const unique = [];
for (const candidate of candidates) {
  const isDuplicate = unique.some(existing => {
    const similarity = comparePHashes(
      candidate.perceptual_hash,
      existing.perceptual_hash
    );
    return similarity >= 0.90; // 90% threshold
  });

  if (!isDuplicate) {
    unique.push(candidate);
  }
}
```

### 4. Path Mapping

**Problem**: Metarr and media players may see same directory with different paths

**Example**:
- Metarr: `/movies`
- Kodi: `/var/nfs/movies`
- Same directory, different mount points

**Solution**:
```typescript
// Auto-detect from Kodi sources
const kodiSources = await kodi.request('Files.GetSources', { media: 'video' });
// Returns: [{ label: "Movies", file: "/var/nfs/movies" }, ...]

// Compare with Metarr library
const library = await db.getLibrary(libraryId);
// library.path = "/movies"

// Detect common suffix
const similarity = comparePathSuffixes(library.path, kodiSource.file);
// High similarity → suggest mapping

// Store mapping
await db.execute(`
  INSERT INTO path_mappings (library_id, media_player_id, local_path, remote_path)
  VALUES (?, ?, ?, ?)
`, [libraryId, kodiId, '/movies', '/var/nfs/movies']);

// Apply mapping when deploying
function applyPathMapping(localPath: string, mapping: PathMapping): string {
  return localPath.replace(mapping.local_path, mapping.remote_path);
}

// Example:
// Local:  /movies/The Matrix/poster.jpg
// Remote: /var/nfs/movies/The Matrix/poster.jpg
```

**Validation**:
```typescript
// Test mapping by asking Kodi about a known movie
const testMovie = await db.query(`
  SELECT tmdb_id, file_path
  FROM movies
  WHERE library_id = ?
  LIMIT 1
`, [libraryId]);

// Ask Kodi: what's your path for this tmdb_id?
const kodiMovie = await kodi.request('VideoLibrary.GetMovieDetails', {
  movieid: await findKodiMovieId(kodi, testMovie.tmdb_id),
  properties: ['file']
});

// Compare paths (should match after mapping applied)
const expectedKodiPath = applyPathMapping(testMovie.file_path, mapping);
if (kodiMovie.file === expectedKodiPath) {
  console.log('✓ Mapping verified');
}
```

### 5. Universal Group Architecture

**Core Principle**: ALL media players belong to groups, regardless of type.

**Why**:
- **Consistency**: Unified data model for Kodi, Jellyfin, and Plex
- **Simplicity**: No branching logic (all code paths go through groups)
- **Future-proof**: Easy to add new player types
- **Correctness**: Path mapping is inherently a group-level concern

**Structure**:
```sql
-- ALL players belong to groups with enforced constraints
CREATE TABLE media_player_groups (
  id INTEGER PRIMARY KEY,
  name TEXT,                     -- "Home Kodi Instances" or "Main Jellyfin Server"
  type TEXT,                     -- 'kodi', 'jellyfin', 'plex'
  max_members INTEGER NULL,      -- NULL = unlimited (Kodi), 1 = single (Jellyfin/Plex)
  description TEXT
);

CREATE TABLE media_players (
  id INTEGER PRIMARY KEY,
  group_id INTEGER NOT NULL,     -- Always required (every player has a group)
  name TEXT,                     -- "Living Room Kodi" or "Main Jellyfin"
  host TEXT,
  port INTEGER,
  enabled BOOLEAN DEFAULT 1,
  FOREIGN KEY (group_id) REFERENCES media_player_groups(id)
);

-- Group-level path mappings (not player-level)
CREATE TABLE media_player_group_path_mappings (
  id INTEGER PRIMARY KEY,
  group_id INTEGER NOT NULL,
  metarr_path TEXT,              -- /mnt/media/movies
  player_path TEXT,              -- /movies (Kodi) or /data/movies (Jellyfin)
  FOREIGN KEY (group_id) REFERENCES media_player_groups(id)
);

-- Groups linked to libraries (not individual players)
CREATE TABLE media_player_libraries (
  id INTEGER PRIMARY KEY,
  group_id INTEGER NOT NULL,
  library_id INTEGER NOT NULL,
  FOREIGN KEY (group_id) REFERENCES media_player_groups(id),
  FOREIGN KEY (library_id) REFERENCES libraries(id)
);
```

**Group Types**:

| Type | max_members | Use Case | Scan Strategy |
|------|-------------|----------|---------------|
| Kodi | NULL (unlimited) | Multiple instances sharing MySQL database | Scan ONE instance per group (fallback if primary fails) |
| Jellyfin | 1 (single server) | Single Jellyfin server | Scan the one server in group |
| Plex | 1 (single server) | Single Plex server | Scan the one server in group |

**Notification Strategy**:
```typescript
// Universal group-aware notification (works for ALL player types)
async function notifyMediaPlayers(libraryId: number) {
  const library = await db.getLibrary(libraryId);
  const groups = await db.getGroupsForLibrary(libraryId);

  for (const group of groups) {
    // Apply group-level path mapping (same logic for all types)
    const mappedPath = await applyGroupPathMapping(db, group.id, library.path);

    // Scan ONE instance per group (with fallback)
    await triggerGroupScan(group.id, mappedPath);
  }
}

async function triggerGroupScan(groupId: number, path: string) {
  const players = await db.getEnabledPlayersInGroup(groupId);

  // Try each player until one succeeds (fallback logic)
  for (const player of players) {
    try {
      if (player.type === 'kodi') {
        await kodiClient.scanVideoLibrary({ directory: path });
      } else if (player.type === 'jellyfin') {
        await jellyfinClient.refreshLibrary({ path });
      }
      return; // Success - stop trying
    } catch (error) {
      continue; // Try next player
    }
  }
}
```

**Key Insights**:
- No special cases: Jellyfin works exactly like Kodi (just with max_members=1)
- Path mapping at group level: All players in group share same path view
- Fallback resilience: If primary instance offline, try next in group
- Different groups manage different libraries: Living Room → /movies, Kids Room → /tvshows

**Fake Scan for UI Refresh**:
```typescript
// When only metadata/assets changed (no new files)
await kodi.request('VideoLibrary.Scan', {
  directory: '/doesNotExist'
});
// Scan fails but triggers UI refresh and cache rebuild
```

### 6. Job Queue (Database-Backed)

**Why No Redis**: Simplicity, one fewer dependency, database already handles transactions

**Priority Levels**:
```typescript
enum JobPriority {
  CRITICAL = 1,   // Webhooks
  HIGH = 2,       // User-triggered actions
  NORMAL = 5,     // Scheduled scans
  LOW = 10        // Background maintenance
}
```

**Worker Implementation**:
```typescript
class JobWorker {
  private isRunning = false;

  async start() {
    this.isRunning = true;

    while (this.isRunning) {
      // Fetch next job (highest priority first)
      const job = await db.query(`
        SELECT * FROM job_queue
        WHERE status = 'pending'
          AND (next_retry_at IS NULL OR next_retry_at <= CURRENT_TIMESTAMP)
        ORDER BY priority ASC, created_at ASC
        LIMIT 1
      `);

      if (!job) {
        await sleep(100); // Poll every 100ms
        continue;
      }

      // Mark as processing
      await db.execute(`
        UPDATE job_queue
        SET status = 'processing', started_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [job.id]);

      try {
        await this.executeJob(job);

        // Mark completed
        await db.execute(`
          UPDATE job_queue
          SET status = 'completed', completed_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [job.id]);
      } catch (error) {
        await this.handleFailure(job, error);
      }
    }
  }

  async handleFailure(job: Job, error: Error) {
    job.retry_count++;

    if (job.retry_count >= job.max_retries) {
      // Give up
      await db.execute(`
        UPDATE job_queue
        SET status = 'failed',
            error_message = ?,
            completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [error.message, job.id]);
    } else {
      // Retry with exponential backoff
      const backoffMs = Math.pow(2, job.retry_count) * 1000; // 2s, 4s, 8s, ...
      await db.execute(`
        UPDATE job_queue
        SET status = 'pending',
            retry_count = ?,
            next_retry_at = datetime('now', '+${backoffMs} milliseconds')
        WHERE id = ?
      `, [job.retry_count, job.id]);
    }
  }
}
```

### 7. Concurrent Asset Downloads

**Rate Limiting Strategy**:
```typescript
class RateLimiter {
  private requests: Map<string, number[]> = new Map();

  async execute<T>(
    provider: string,
    limit: number,
    windowMs: number,
    fn: () => Promise<T>
  ): Promise<T> {
    // Wait until we can make request
    while (!this.canMakeRequest(provider, limit, windowMs)) {
      await sleep(100);
    }

    // Record request
    this.recordRequest(provider);

    // Execute
    return fn();
  }

  private canMakeRequest(
    provider: string,
    limit: number,
    windowMs: number
  ): boolean {
    const now = Date.now();
    const requests = this.requests.get(provider) || [];

    // Remove old requests outside window
    const recent = requests.filter(ts => now - ts < windowMs);
    this.requests.set(provider, recent);

    return recent.length < limit;
  }
}

// Usage
const tmdbLimiter = new RateLimiter();
const tmdbDownloader = new AssetDownloader();

// API calls: rate-limited
await tmdbLimiter.execute('tmdb', 50, 1000, async () => {
  return tmdb.getMovieImages(tmdbId);
});

// Asset downloads: unlimited concurrency
const urls = [...posterURLs, ...fanartURLs];
await Promise.all(urls.map(url => tmdbDownloader.download(url)));
```

---

## Related Documentation

### Core Documentation
- **[DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)** - Complete schema with indexes
- **[WORKFLOWS.md](WORKFLOWS.md)** - Detailed workflow diagrams
- **[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)** - Phased development plan

### Feature Documentation
- **[ASSET_SELECTION.md](ASSET_SELECTION.md)** - Scoring algorithm details
- **[PATH_MAPPING.md](PATH_MAPPING.md)** - Path conversion strategies
- **[NFO_FORMAT.md](NFO_FORMAT.md)** - Kodi NFO specification

### Integration Documentation
- **[TMDB_API.md](TMDB_API.md)** - TMDB integration guide
- **[KODI_API.md](KODI_API.md)** - Kodi JSON-RPC reference
- **[WEBHOOK_SPEC.md](WEBHOOK_SPEC.md)** - *arr webhook payloads

---

## Migration Notes

**Current Status**: Deep development, no production users

**Approach**: Clean slate - delete old database, implement new schema

**No Data Loss Risk**: Development phase only

---

## Future Enhancements (Out of Scope for v1)

- [ ] Multi-user support with permissions
- [ ] Mobile companion app
- [ ] Advanced search (fuzzy matching, ML-based)
- [ ] Custom metadata provider plugins
- [ ] Backup/restore UI
- [ ] Theme customization beyond *arr purple
- [ ] Subtitle extraction from video files
- [ ] Subtitle sourcing (OpenSubtitles API)
- [ ] Export metadata to other formats (CSV, JSON)

---

**Last Updated**: 2025-01-13
**Next Steps**: Review DATABASE_SCHEMA.md for complete table definitions
