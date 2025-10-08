# Core Application Workflows

**Related Docs**: [ARCHITECTURE.md](ARCHITECTURE.md), [AUTOMATION_AND_WEBHOOKS.md](AUTOMATION_AND_WEBHOOKS.md), [ASSET_MANAGEMENT.md](ASSET_MANAGEMENT.md), [PUBLISHING_WORKFLOW.md](PUBLISHING_WORKFLOW.md)

This document details the primary operational workflows in Metarr's revised architecture, including two-phase scanning, enrichment pipeline, and automated publishing.

---

## Workflow Overview

Metarr operates through four distinct operational phases:

```
┌─────────────────────────────────────────────────────────────┐
│                  METARR WORKFLOW PHASES                      │
└─────────────────────────────────────────────────────────────┘

PHASE 1: DISCOVERY (Fast Local Scan)
  ├─ Scan filesystem for media files
  ├─ Parse NFO for IDs + basic metadata
  ├─ FFprobe video files (stream details)
  ├─ Discover local assets (copy to cache)
  └─ Insert to database (state = 'discovered' or 'identified')

PHASE 2: ENRICHMENT (Background, Rate-Limited)
  ├─ Fetch provider metadata (TMDB/TVDB)
  ├─ Fetch asset candidate URLs
  ├─ Run auto-selection algorithm (if enabled)
  ├─ Download selected assets to cache
  └─ Update database (state = 'enriched' or 'selected')

PHASE 3: PUBLISHING (User-Triggered or Auto)
  ├─ Generate NFO from database
  ├─ Copy assets from cache → library
  ├─ Write NFO to library
  └─ Update database (state = 'published', has_unpublished_changes = 0)

PHASE 4: NOTIFICATION (Async, Non-Blocking)
  └─ Trigger media player scans (Kodi/Jellyfin)
```

**Key Principle**: Each phase is **independent** and **resumable**. Crashes don't lose progress.

---

## Scan Initiation Methods

Metarr supports three methods to initiate discovery/enrichment workflows.

### 1. Initial Library Scan (User-Triggered)

**Trigger**: User clicks "Scan Library" button

**Target Users**:
- New Metarr installation
- Adding new library
- Rebuilding after database deletion

**Automation Behavior** (depends on library config):

| Mode | Phase 1 (Discovery) | Phase 2 (Enrichment) | Phase 3 (Publishing) |
|------|---------------------|----------------------|----------------------|
| **Manual** | ✓ Runs immediately | User triggers per-item | User triggers per-item |
| **YOLO** | ✓ Runs immediately | ✓ Auto (background) | ✓ Auto (after selection) |
| **Hybrid** | ✓ Runs immediately | ✓ Auto (background) | User triggers (bulk) |

**Workflow** (YOLO Mode - Full Automation):

```typescript
// User clicks "YOLO My Library"
POST /api/libraries/1/scan?mode=yolo

1. Phase 1: Fast Local Scan (3-5 hours for 32k items)
   ├─ Discover all movie directories
   ├─ For each directory:
   │   ├─ Find video file (*.mkv, *.mp4, etc.)
   │   ├─ Parse NFO if exists
   │   │   ├─ Extract IDs (tmdb_id, imdb_id)
   │   │   ├─ Extract basic metadata (title, year, plot, genres, actors)
   │   │   ├─ Do NOT follow <thumb> URLs (just store URLs)
   │   │   └─ Calculate NFO hash (detect future changes)
   │   ├─ FFprobe video file
   │   │   └─ Store stream details (video, audio, subtitle tables)
   │   ├─ Discover local assets (poster.jpg, fanart*.jpg)
   │   │   ├─ Copy to content-addressed cache
   │   │   ├─ Calculate pHash
   │   │   └─ Insert to asset_candidates (provider='local', is_selected=1)
   │   └─ Insert movie to database
   │       ├─ state = 'identified' (if has tmdb_id)
   │       ├─ state = 'discovered' (if no IDs)
   │       └─ enrichment_priority = 5 (normal)
   │
   └─ Result: User sees 32k movies in UI immediately

2. Phase 2: Lazy Enrichment (18-36 hours, rate-limited)
   ├─ Background job picks up items where state = 'identified' AND enriched_at IS NULL
   ├─ For each movie (priority queue):
   │   ├─ Fetch TMDB metadata (50/sec rate limit)
   │   │   ├─ Plot, tagline, genres, actors, directors (respect locks)
   │   │   └─ Store in database, mark enriched_at = NOW()
   │   ├─ Fetch asset candidates (URLs only, don't download yet)
   │   │   ├─ 15 posters from TMDB
   │   │   ├─ 20 fanarts from TMDB
   │   │   └─ Insert to asset_candidates (provider='tmdb', is_downloaded=0)
   │   ├─ Run auto-selection algorithm
   │   │   ├─ Score each candidate (resolution, votes, language)
   │   │   ├─ Filter duplicates (pHash similarity)
   │   │   ├─ Select top N (config: max_count)
   │   │   └─ Mark is_selected=1, selected_by='auto'
   │   ├─ Download selected assets to cache
   │   │   ├─ Calculate content hash (SHA256)
   │   │   ├─ Save as /cache/assets/{hash}.jpg
   │   │   └─ Update asset_candidates (cache_path, content_hash, is_downloaded=1)
   │   └─ Update movie state = 'selected'
   │
   └─ Emit SSE progress events (every 10 items)

3. Phase 3: Auto-Publish (YOLO mode)
   ├─ For each movie where state = 'selected':
   │   ├─ Generate NFO from database
   │   ├─ Copy selected assets from cache → library
   │   │   ├─ poster.jpg (first poster)
   │   │   ├─ fanart.jpg (first fanart)
   │   │   └─ fanart1.jpg, fanart2.jpg, ... (additional fanarts)
   │   ├─ Write NFO to library
   │   └─ Update movie
   │       ├─ state = 'published'
   │       ├─ has_unpublished_changes = 0
   │       ├─ last_published_at = NOW()
   │       └─ published_nfo_hash = SHA256(nfo_content)
   │
   └─ Result: All assets in library, ready for player scan

4. Phase 4: Notify Players (Async)
   └─ Trigger Kodi/Jellyfin scans (one per library, not per movie)
```

**Progress Tracking** (Real-Time SSE):

```typescript
// Frontend listens to SSE
const eventSource = new EventSource('/api/events');

eventSource.addEventListener('scan:progress', (e) => {
  // { current: 1234, total: 32000, added: 1100, updated: 134 }
});

eventSource.addEventListener('enrich:progress', (e) => {
  // { current: 456, total: 32000, entityId: 789 }
});

eventSource.addEventListener('publish:progress', (e) => {
  // { current: 123, total: 32000, entityId: 456 }
});
```

**See Also**:
- [AUTOMATION_AND_WEBHOOKS.md](AUTOMATION_AND_WEBHOOKS.md#automation-levels) - Automation modes
- [ASSET_MANAGEMENT.md](ASSET_MANAGEMENT.md#auto-selection-algorithm) - Asset selection algorithm

---

### 2. Webhook-Initiated Processing (Fully Automated)

**Trigger**: Radarr/Sonarr sends webhook when download completes

**Context Available**:
- ✅ TMDB ID (authoritative identifier)
- ✅ IMDB ID (secondary identifier)
- ✅ File path (manager's view, needs path mapping)
- ✅ Movie metadata (title, year, quality)

**Automation**: **Always fully automated** (regardless of library mode)

**Rationale**: User enabled webhooks because they want automation. No manual review for webhook-triggered content.

**Workflow** (New Download):

```typescript
// Radarr sends webhook
POST https://metarr.local/webhooks/radarr
Body: {
  eventType: "Download",
  tmdb_id: 603,
  imdb_id: "tt0133093",
  title: "The Matrix",
  year: 1999,
  path: "/data/movies/The Matrix (1999)/The Matrix.mkv"
}

1. Webhook Received (Critical Priority - Pauses other jobs)
   ├─ Parse payload
   ├─ Apply path mapping (manager → Metarr)
   │   └─ /data/movies/ → M:\Movies\
   └─ Check if movie exists (by tmdb_id)

2. Database Lookup Strategy
   ├─ Query: SELECT * FROM movies WHERE tmdb_id = 603
   ├─ If found:
   │   └─ UPGRADE WORKFLOW (see next section)
   └─ If not found:
       └─ NEW DOWNLOAD WORKFLOW (continue below)

3. Phase 1: Scan Directory (High Priority)
   ├─ Find video file
   ├─ Parse NFO (if exists)
   │   ├─ Extract IDs, basic metadata
   │   └─ Calculate NFO hash
   ├─ FFprobe video file
   ├─ Discover local assets (copy to cache)
   └─ Insert movie
       ├─ state = 'identified'
       ├─ enrichment_priority = 2 (high - webhook triggered)

4. Phase 2: Enrich from TMDB (High Priority)
   ├─ Jump to front of enrichment queue (priority=2)
   ├─ Fetch metadata (TMDB API)
   ├─ Fetch asset candidates
   ├─ Auto-select assets (algorithm)
   ├─ Download to cache
   └─ state = 'selected'

5. Phase 3: Auto-Publish (Immediate)
   ├─ Generate NFO
   ├─ Copy assets to library
   ├─ Write NFO
   └─ state = 'published'

6. Phase 4: Notify Players (Async)
   └─ Trigger Kodi scan on specific directory

RESULT: New movie appears in Kodi within 30-60 seconds
```

**Workflow** (Upgrade - Radarr Deleted Directory):

```typescript
// Scenario: Radarr upgrades 720p → 1080p, deletes entire directory

POST https://metarr.local/webhooks/radarr
Body: {
  eventType: "Download",
  isUpgrade: true,
  tmdb_id: 603,
  path: "/data/movies/The Matrix (1999)/The Matrix.mkv"
}

1. Webhook Received
   └─ Query: SELECT * FROM movies WHERE tmdb_id = 603
       └─ Found movie ID 123

2. Detect Missing Assets (Disaster Recovery)
   ├─ Get library path: M:\Movies\The Matrix (1999)\
   ├─ Check NFO exists: movie.nfo → MISSING
   ├─ Check poster exists: poster.jpg → MISSING
   └─ Conclusion: Directory was deleted by Radarr

3. Restore from Cache
   ├─ Get last published assets from publish_log
   │   └─ Query: SELECT assets_published FROM publish_log WHERE entity_id=123 AND success=1 ORDER BY published_at DESC LIMIT 1
   ├─ Ensure library directory exists
   │   └─ mkdir -p "M:\Movies\The Matrix (1999)"
   ├─ Copy assets from cache → library
   │   ├─ /cache/assets/abc123.jpg → poster.jpg
   │   ├─ /cache/assets/def456.jpg → fanart.jpg
   │   └─ /cache/assets/ghi789.jpg → fanart1.jpg
   └─ Regenerate NFO from database
       └─ Write movie.nfo (with metadata from database)

4. Update Video File Path
   └─ UPDATE movies SET file_path = 'M:\Movies\...\The Matrix.mkv' WHERE id = 123

5. Re-Scan Stream Details (New File)
   ├─ FFprobe new 1080p file
   ├─ Update video_streams (resolution, bitrate, etc.)
   └─ Update audio/subtitle streams

6. Regenerate NFO (Updated Streams)
   └─ Write movie.nfo with new <fileinfo><streamdetails>

7. Mark as Published
   ├─ state = 'published'
   ├─ has_unpublished_changes = 0
   └─ last_published_at = NOW()

8. Notify Players
   └─ Trigger Kodi scan

RESULT: Seamless upgrade, user sees no data loss
```

**See Also**:
- [WEBHOOKS.md](WEBHOOKS.md) - Complete webhook reference
- [AUTOMATION_AND_WEBHOOKS.md](AUTOMATION_AND_WEBHOOKS.md#webhook-automation) - Webhook behavior
- [ASSET_MANAGEMENT.md](ASSET_MANAGEMENT.md#disaster-recovery) - Restore from cache

---

### 3. User-Initiated Refresh (Manual Enrichment)

**Trigger**: User clicks "Enrich" button on movie detail page

**Use Cases**:
- Manual mode: User wants to fetch latest metadata
- Fix enrichment errors
- Update metadata after provider changes

**Workflow**:

```typescript
// User clicks "Enrich from TMDB"
POST /api/movies/123/enrich

1. Check Current State
   ├─ Load movie from database
   └─ Check field locks (skip locked fields)

2. Fetch TMDB Metadata
   ├─ Query TMDB API (movie.tmdb_id)
   ├─ Merge data (respect locks)
   │   ├─ If plot_locked = 0 → Update plot
   │   ├─ If plot_locked = 1 → Skip plot
   │   └─ Repeat for all fields
   └─ Mark enriched_at = NOW()

3. Fetch Asset Candidates
   ├─ Query TMDB images API
   ├─ Insert to asset_candidates (is_downloaded=0)
   └─ Return candidate count to UI

4. User Reviews Candidates
   ├─ UI shows grid of 15 posters
   └─ User selects poster #3

5. Download Selected
   ├─ Download from provider URL
   ├─ Save to cache (content-addressed)
   └─ Mark is_selected=1, selected_by='manual'

6. Lock Asset
   └─ UPDATE movies SET poster_locked=1 WHERE id=123

7. Mark Dirty
   └─ UPDATE movies SET has_unpublished_changes=1 WHERE id=123

8. User Clicks "Publish"
   └─ Run publishing workflow (see PUBLISHING_WORKFLOW.md)
```

**See Also**:
- [PUBLISHING_WORKFLOW.md](PUBLISHING_WORKFLOW.md) - Publishing process
- [ASSET_MANAGEMENT.md](ASSET_MANAGEMENT.md#manual-selection-workflow) - Manual asset selection

---

## Phase 1: Discovery (Fast Local Scan)

### Purpose

Quickly populate database with filesystem state, no network calls.

### What Gets Scanned

```typescript
function scanDirectory(dirPath: string): ScanResult {
  // 1. Find video file
  const videoFile = findVideoFile(dirPath);  // *.mkv, *.mp4, *.avi, etc.

  if (!videoFile) {
    return { skipped: true, reason: 'no_video_file' };
  }

  // 2. Parse NFO (if exists)
  const nfoPath = path.join(dirPath, 'movie.nfo');
  let nfoData = null;

  if (fs.existsSync(nfoPath)) {
    nfoData = parseNFO(nfoPath, {
      extractIDs: true,           // tmdb_id, imdb_id
      extractBasicMetadata: true, // title, year, plot, genres
      followThumbURLs: false,     // Do NOT download images
      followTrailerURLs: false    // Do NOT download trailers
    });
  }

  // 3. FFprobe video file
  const streamDetails = await ffprobe(videoFile);

  // 4. Discover local assets
  const localAssets = discoverLocalAssets(dirPath, {
    imagePatterns: ['poster.jpg', 'fanart*.jpg', 'banner.jpg', 'clearlogo.png'],
    trailerPatterns: ['*-trailer.mkv', 'trailer.mp4'],
    subtitlePatterns: ['*.srt', '*.ass']
  });

  // 5. Copy assets to cache (content-addressed)
  for (const asset of localAssets) {
    const buffer = fs.readFileSync(asset.path);
    const contentHash = sha256(buffer);
    const cachePath = `/data/cache/assets/${contentHash}.${asset.ext}`;

    if (!fs.existsSync(cachePath)) {
      fs.copyFileSync(asset.path, cachePath);
    }

    // Calculate pHash (for images)
    if (asset.type === 'image') {
      asset.perceptualHash = await calculatePHash(buffer);
    }
  }

  // 6. Insert to database
  const movieId = await db.insertMovie({
    title: nfoData?.title || extractTitleFromPath(dirPath),
    year: nfoData?.year,
    tmdb_id: nfoData?.tmdb_id,
    imdb_id: nfoData?.imdb_id,
    plot: nfoData?.plot,
    genres: nfoData?.genres,
    actors: nfoData?.actors,
    directors: nfoData?.directors,
    file_path: videoFile,
    nfo_hash: nfoData ? sha256(nfoData.raw) : null,
    state: nfoData?.tmdb_id ? 'identified' : 'discovered',
    enrichment_priority: 5  // Normal priority
  });

  // 7. Insert stream details
  await db.insertVideoStream(movieId, streamDetails.video);
  await db.insertAudioStreams(movieId, streamDetails.audio);
  await db.insertSubtitleStreams(movieId, streamDetails.subtitles);

  // 8. Insert local assets as candidates
  for (const asset of localAssets) {
    await db.insertAssetCandidate({
      entity_type: 'movie',
      entity_id: movieId,
      asset_type: asset.type,  // 'poster', 'fanart', etc.
      provider: 'local',
      is_downloaded: 1,
      cache_path: asset.cachePath,
      content_hash: asset.contentHash,
      perceptual_hash: asset.perceptualHash,
      is_selected: 1,  // Local assets auto-selected
      selected_by: 'local'
    });
  }

  return { success: true, movieId };
}
```

### Performance Characteristics

| Metric | Value |
|--------|-------|
| Time per item | ~0.5 seconds |
| 1,000 items | ~8 minutes |
| 10,000 items | ~1.4 hours |
| 32,000 items | ~4.5 hours |

### NFO Parsing During Phase 1

**What Gets Parsed**:
- ✅ Provider IDs (`<tmdbid>`, `<imdbid>`)
- ✅ Basic metadata (`<title>`, `<year>`, `<plot>`, `<genre>`)
- ✅ Cast/crew (`<actor>`, `<director>`, `<writer>`)
- ✅ Ratings (`<ratings>`)

**What Gets Deferred**:
- ❌ `<thumb>` URLs (stored but not downloaded)
- ❌ `<fanart>` URLs (stored but not downloaded)
- ❌ `<trailer>` URLs (ignored - local files only)

**Rationale**: Fast scan with immediate UI feedback. User can search, browse, and make edits while Phase 2 runs in background.

### Database State After Phase 1

```sql
-- Movies discovered
SELECT COUNT(*) FROM movies WHERE state = 'discovered';
-- Result: 500 (movies without provider IDs)

SELECT COUNT(*) FROM movies WHERE state = 'identified';
-- Result: 31,500 (movies with tmdb_id from NFO)

-- Local assets discovered
SELECT COUNT(*) FROM asset_candidates WHERE provider = 'local';
-- Result: 128,000 (posters + fanarts from library)

-- Stream details scanned
SELECT COUNT(*) FROM video_streams;
-- Result: 32,000 (one per movie)
```

**User Can Immediately**:
- Browse library (all 32k items visible)
- Search by title
- View basic metadata (from NFO)
- View local assets (posters already in library)
- Manually edit any field
- Manually trigger enrichment on specific items

---

## Phase 2: Enrichment (Background, Rate-Limited)

### Purpose

Fetch metadata and asset candidates from providers without blocking UI.

### Enrichment Queue

```sql
-- Items needing enrichment
SELECT * FROM movies
WHERE state = 'identified'
  AND enriched_at IS NULL
ORDER BY enrichment_priority ASC, created_at DESC;

-- Priority levels:
-- 1 = Critical (webhook-triggered, immediate)
-- 2 = High (user-triggered, jump queue)
-- 5 = Normal (scheduled background)
```

### Enrichment Worker

```typescript
class EnrichmentWorker {
  async start() {
    while (true) {
      // 1. Fetch next item from queue
      const movie = await db.query(`
        SELECT * FROM movies
        WHERE state = 'identified'
          AND enriched_at IS NULL
        ORDER BY enrichment_priority ASC, created_at ASC
        LIMIT 1
      `);

      if (!movie.length) {
        await sleep(1000);  // Wait 1 second, check again
        continue;
      }

      const item = movie[0];

      // 2. Mark as enriching
      await db.execute(`
        UPDATE movies SET state = 'enriching' WHERE id = ?
      `, [item.id]);

      try {
        // 3. Fetch metadata (rate-limited)
        await this.enrichMovie(item);

        // 4. Mark as enriched
        await db.execute(`
          UPDATE movies
          SET state = 'enriched',
              enriched_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [item.id]);

      } catch (error) {
        // Handle error (retry or mark failed)
        await this.handleEnrichmentError(item, error);
      }

      // Small delay between items (avoid hammering)
      await sleep(100);
    }
  }

  async enrichMovie(movie: Movie) {
    // 1. Fetch TMDB metadata (rate-limited)
    const tmdbData = await rateLimiter.execute(
      () => tmdb.getMovieDetails(movie.tmdb_id, {
        append_to_response: 'credits,images'
      }),
      movie.enrichment_priority
    );

    // 2. Merge metadata (respect locks)
    const updates: any = {};

    if (!movie.plot_locked && tmdbData.overview) {
      updates.plot = tmdbData.overview;
    }

    if (!movie.tagline_locked && tmdbData.tagline) {
      updates.tagline = tmdbData.tagline;
    }

    // ... (repeat for all unlocked fields)

    if (Object.keys(updates).length > 0) {
      await db.updateMovie(movie.id, updates);
    }

    // 3. Fetch asset candidates (URLs only)
    for (const poster of tmdbData.images.posters) {
      await db.insertAssetCandidate({
        entity_type: 'movie',
        entity_id: movie.id,
        asset_type: 'poster',
        provider: 'tmdb',
        provider_url: `https://image.tmdb.org/t/p/original${poster.file_path}`,
        width: poster.width,
        height: poster.height,
        provider_metadata: JSON.stringify({
          language: poster.iso_639_1,
          vote_average: poster.vote_average,
          vote_count: poster.vote_count
        }),
        is_downloaded: 0  // Not yet downloaded
      });
    }

    // 4. Auto-select assets (if YOLO mode)
    const library = await db.getLibraryForMovie(movie.id);
    const automationConfig = await db.getAutomationConfig(library.id);

    if (automationConfig.auto_select_assets) {
      await assetSelector.autoSelectAssets(movie.id, 'movie', 'poster');
      await assetSelector.autoSelectAssets(movie.id, 'movie', 'fanart');

      await db.execute(`
        UPDATE movies SET state = 'selected' WHERE id = ?
      `, [movie.id]);
    }

    // 5. Auto-publish (if YOLO mode)
    if (automationConfig.auto_publish) {
      await publishService.publishEntity('movie', movie.id, {
        publishedBy: 'auto'
      });

      // Emit SSE event
      eventEmitter.emit('movie:published', { movieId: movie.id });
    }
  }
}

// Start worker on app boot
const enrichmentWorker = new EnrichmentWorker();
enrichmentWorker.start();
```

### Rate Limiting

```typescript
class RateLimiter {
  private tmdbRequests = 0;
  private tvdbRequests = 0;
  private windowStart = Date.now();

  async execute<T>(
    fn: () => Promise<T>,
    priority: number,
    provider: 'tmdb' | 'tvdb' = 'tmdb'
  ): Promise<T> {
    // Wait until we can make request
    while (!this.canMakeRequest(provider, priority)) {
      await this.waitForWindow(provider);
    }

    // Make request
    if (provider === 'tmdb') {
      this.tmdbRequests++;
    } else {
      this.tvdbRequests++;
    }

    return fn();
  }

  private canMakeRequest(provider: string, priority: number): boolean {
    this.resetWindowIfNeeded();

    if (provider === 'tmdb') {
      // 50/sec limit, reserve 10 for high priority
      const limit = priority <= 2 ? 50 : 40;
      return this.tmdbRequests < limit;
    } else {
      // 1/sec limit
      return this.tvdbRequests < 1;
    }
  }
}
```

### Auto-Publish After Enrichment (YOLO Mode)

**Question Answered**: Q6 - When auto-enrichment updates fields, immediately republish.

```typescript
// After enrichment completes in YOLO mode
if (automationConfig.auto_publish) {
  // Generate NFO with updated metadata
  await publishService.publishEntity('movie', movie.id);

  // Players stay in sync automatically
  // User never sees stale data
}
```

**Result**: In YOLO mode, library is **always** in sync with database. No dirty state accumulates.

---

## Phase 3: Publishing

Publishing is covered in detail in [PUBLISHING_WORKFLOW.md](PUBLISHING_WORKFLOW.md).

**Quick Reference**:

```typescript
// Single entity
POST /api/movies/:id/publish

// Bulk
POST /api/movies/publish-bulk
Body: { ids: [1, 2, 3, ...] }

// Transactional process:
1. Generate NFO from database
2. Copy assets from cache → library (atomic)
3. Write NFO (atomic)
4. Update database (transaction)
5. Notify players (async)
```

---

## Phase 4: Player Notification

Player notification is covered in [PUBLISHING_WORKFLOW.md](PUBLISHING_WORKFLOW.md#player-notification).

**Quick Reference**:

```typescript
// Kodi
await kodi.request('VideoLibrary.Scan', {
  directory: '/movies/The Matrix (1999)/'
});

// Jellyfin
await fetch('http://jellyfin:8096/Library/Refresh', {
  method: 'POST',
  headers: { 'X-MediaBrowser-Token': apiKey },
  body: JSON.stringify({ path: '/movies/The Matrix (1999)' })
});
```

---

## Error Handling & Recovery

### NFO Parsing Errors

```typescript
try {
  const nfoData = parseNFO(nfoPath);
} catch (error) {
  // Log error, continue with default values
  logger.error('NFO parse error', { path: nfoPath, error });

  // Create movie with status = 'needs_identification'
  await db.insertMovie({
    title: extractTitleFromPath(dirPath),
    state: 'needs_identification',
    status: 'error_nfo_parse',
    error_message: error.message
  });
}
```

### Enrichment Errors

```typescript
try {
  await this.enrichMovie(movie);
} catch (error) {
  if (error.code === 'RATE_LIMIT_EXCEEDED') {
    // Retry with backoff
    await db.execute(`
      UPDATE movies
      SET enrichment_priority = enrichment_priority + 1,
          state = 'identified'
      WHERE id = ?
    `, [movie.id]);
  } else {
    // Mark as error
    await db.execute(`
      UPDATE movies
      SET state = 'error_provider_failure',
          error_message = ?
      WHERE id = ?
    `, [error.message, movie.id]);
  }
}
```

### Publishing Errors

See [PUBLISHING_WORKFLOW.md](PUBLISHING_WORKFLOW.md#validation-before-publish) for validation and rollback.

---

## Performance Monitoring

### Metrics to Track

```typescript
// Scan performance
{
  phase1_duration_ms: 16200000,  // 4.5 hours
  items_scanned: 32000,
  items_per_second: 1.98
}

// Enrichment performance
{
  phase2_duration_ms: 64800000,  // 18 hours
  items_enriched: 32000,
  items_per_second: 0.49,  // Rate-limited
  tmdb_api_calls: 32000,
  tvdb_api_calls: 0
}

// Publishing performance
{
  publish_duration_ms: 2340,  // 2.3 seconds per item
  nfo_generation_ms: 45,
  asset_copy_ms: 1200,
  database_update_ms: 95,
  player_notification_ms: 1000
}
```

---

## Related Documentation

- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Overall system design
- **[AUTOMATION_AND_WEBHOOKS.md](AUTOMATION_AND_WEBHOOKS.md)** - Automation modes, webhook handling
- **[ASSET_MANAGEMENT.md](ASSET_MANAGEMENT.md)** - Three-tier asset system
- **[PUBLISHING_WORKFLOW.md](PUBLISHING_WORKFLOW.md)** - Publishing process
- **[WEBHOOKS.md](WEBHOOKS.md)** - Webhook payload reference
- **[NFO_PARSING.md](NFO_PARSING.md)** - NFO format specification
- **[DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)** - Schema reference
