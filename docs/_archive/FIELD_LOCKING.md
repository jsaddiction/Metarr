# Field-Level Locking & Monitoring System

**Related Docs**: [AUTOMATION_AND_WEBHOOKS.md](AUTOMATION_AND_WEBHOOKS.md), [ASSET_MANAGEMENT.md](ASSET_MANAGEMENT.md), [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)

This document explains Metarr's field-level locking mechanism for preserving manual user edits and the computed monitoring state system.

## Core Concept

**Field-level locking** tracks which specific fields and assets a user has manually edited, preventing automatic updates from overwriting their customizations while still allowing automatic updates for other fields/assets.

**Key Principles:**
1. Manual user edit → Lock that specific field/asset
2. Locked fields/assets → Never auto-updated (preserved across scans, enrichment, webhooks)
3. Unlocked fields/assets → Continue receiving automatic updates
4. No explicit "monitored" boolean → Computed from (unlocked fields + incompleteness)
5. Asset locking is per-type (e.g., lock poster, but not fanart)

**Two Levels of Locking:**
- **Field Locking**: Scalar fields (plot, tagline, mpaa) and array fields (actors, genres)
- **Asset Locking**: Images, trailers, subtitles (per asset type: poster, fanart, etc.)

---

## No Explicit "Monitored" Flag

Traditional systems like Sonarr/Radarr have a `monitored` boolean that controls whether an item receives updates. Metarr uses a more granular approach.

### Computed Monitoring State

An item is considered "monitored" (needs automatic updates) when:

```typescript
function isMonitored(movie: Movie, config: CompletenessConfig): boolean {
  // Has at least one unlocked field
  const hasUnlockedFields =
    !movie.plot_locked ||
    !movie.poster_locked ||
    !movie.fanart_locked;
    // ... (check all lockable fields)

  // Is incomplete (missing required metadata)
  const isIncomplete = calculateCompleteness(movie, config) < 100;

  // Monitored = has unlocked fields AND is incomplete
  return hasUnlockedFields && isIncomplete;
}
```

**In other words:**
- Item with all unlocked fields but complete metadata → Not monitored (nothing to update)
- Item with all locked fields (regardless of completeness) → Not monitored (user wants no changes)
- Item with some unlocked fields and incomplete → **Monitored** (will receive automatic updates)

---

## Per-Media-Type Completeness Configuration

Each media type (movies, TV shows, episodes) has its own completeness requirements.

### Database Schema

```sql
CREATE TABLE completeness_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  media_type TEXT NOT NULL UNIQUE,  -- 'movies', 'series', 'episodes'

  -- Required Scalar Fields
  required_fields TEXT NOT NULL,    -- JSON array: ["plot", "mpaa", "premiered", ...]

  -- Required Images (exact quantities)
  required_posters INTEGER DEFAULT 1,
  required_fanart INTEGER DEFAULT 1,
  required_landscape INTEGER DEFAULT 0,
  required_keyart INTEGER DEFAULT 0,
  required_banners INTEGER DEFAULT 0,
  required_clearart INTEGER DEFAULT 0,
  required_clearlogo INTEGER DEFAULT 0,
  required_discart INTEGER DEFAULT 0,

  -- Required Media Assets
  required_trailers INTEGER DEFAULT 0,
  required_subtitles INTEGER DEFAULT 0,
  required_themes INTEGER DEFAULT 0,

  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Default configuration for movies
INSERT INTO completeness_config (media_type, required_fields, required_posters, required_fanart)
VALUES ('movies', '["plot", "mpaa", "premiered"]', 1, 1);
```

**Note**: Scalar fields are stored as a JSON array in `required_fields` column. Image quantities use separate INTEGER columns for easy querying.

### Configuration Examples

**Movies Configuration:**
```sql
INSERT INTO completeness_config (
  media_type,
  required_fields,
  required_posters,
  required_fanart,
  required_landscape,
  required_trailers
) VALUES (
  'movies',
  '["plot", "mpaa", "premiered"]',
  1,
  3,
  1,
  2
);
```

**TV Series Configuration:**
```sql
INSERT INTO completeness_config (
  media_type,
  required_fields,
  required_posters,
  required_fanart,
  required_banners
) VALUES (
  'series',
  '["plot", "mpaa"]',
  1,
  2,
  1
);
```

**Episodes Configuration:**
```sql
INSERT INTO completeness_config (
  media_type,
  required_fields,
  required_posters
) VALUES (
  'episodes',
  '["plot"]',
  1
);
```

---

## Completeness Calculation

```typescript
async function calculateCompleteness(movie: Movie, config: CompletenessConfig): Promise<number> {
  let totalRequirements = 0;
  let metRequirements = 0;

  // Scalar fields (stored as JSON array)
  const requiredFields = JSON.parse(config.required_fields);
  for (const field of requiredFields) {
    totalRequirements++;
    if (movie[field] !== null && movie[field] !== undefined && movie[field] !== '') {
      metRequirements++;
    }
  }

  // Image types (separate columns)
  const imageTypes = ['poster', 'fanart', 'landscape', 'keyart', 'banner', 'clearart', 'clearlogo', 'discart'];
  const imageCounts = await db.getImageCounts(movie.id, 'movie');

  for (const imageType of imageTypes) {
    const requiredColumnName = `required_${imageType}s`;  // e.g., required_posters
    const required = config[requiredColumnName];

    if (required > 0) {
      totalRequirements += required;
      const currentCount = imageCounts[imageType] || 0;
      metRequirements += Math.min(currentCount, required);
    }
  }

  return totalRequirements > 0
    ? (metRequirements / totalRequirements) * 100
    : 100;
}
```

**Example:**

```
Movie: The Matrix
Config requires:
  - plot (1 required)
  - mpaa (1 required)
  - premiered (1 required)
  - 1 poster
  - 3 fanarts
  - 1 actor (min)
  - 1 director (min)
  - 1 genre (min)

Total requirements: 10

Current state:
  ✓ plot: "Set in the 22nd century..."
  ✓ mpaa: "R"
  ✓ premiered: "1999-03-31"
  ✓ 1 poster
  ✗ 1 fanart (need 3)
  ✓ 5 actors
  ✓ 2 directors
  ✓ 2 genres

Met requirements: 8
Completeness: 8/10 = 80%

**Note:** Runtime is not a lockable field - it comes from video_streams.duration_seconds (FFprobe scan).
```

---

## Field Locking Schema

### Database Columns

For each lockable field, add a corresponding `{field}_locked BOOLEAN` column:

```sql
-- movies table
ALTER TABLE movies ADD COLUMN plot_locked BOOLEAN DEFAULT 0;
ALTER TABLE movies ADD COLUMN outline_locked BOOLEAN DEFAULT 0;
ALTER TABLE movies ADD COLUMN tagline_locked BOOLEAN DEFAULT 0;
ALTER TABLE movies ADD COLUMN mpaa_locked BOOLEAN DEFAULT 0;
ALTER TABLE movies ADD COLUMN premiered_locked BOOLEAN DEFAULT 0;
ALTER TABLE movies ADD COLUMN user_rating_locked BOOLEAN DEFAULT 0;
ALTER TABLE movies ADD COLUMN trailer_url_locked BOOLEAN DEFAULT 0;

-- Array fields (locked as a whole)
ALTER TABLE movies ADD COLUMN actors_locked BOOLEAN DEFAULT 0;
ALTER TABLE movies ADD COLUMN directors_locked BOOLEAN DEFAULT 0;
ALTER TABLE movies ADD COLUMN writers_locked BOOLEAN DEFAULT 0;
ALTER TABLE movies ADD COLUMN genres_locked BOOLEAN DEFAULT 0;
ALTER TABLE movies ADD COLUMN studios_locked BOOLEAN DEFAULT 0;
ALTER TABLE movies ADD COLUMN tags_locked BOOLEAN DEFAULT 0;
ALTER TABLE movies ADD COLUMN countries_locked BOOLEAN DEFAULT 0;

-- Asset Locking (per-type, not per-asset)
ALTER TABLE movies ADD COLUMN poster_locked BOOLEAN DEFAULT 0;
ALTER TABLE movies ADD COLUMN fanart_locked BOOLEAN DEFAULT 0;
ALTER TABLE movies ADD COLUMN banner_locked BOOLEAN DEFAULT 0;
ALTER TABLE movies ADD COLUMN clearlogo_locked BOOLEAN DEFAULT 0;
ALTER TABLE movies ADD COLUMN clearart_locked BOOLEAN DEFAULT 0;
ALTER TABLE movies ADD COLUMN discart_locked BOOLEAN DEFAULT 0;

-- Runtime/file_size/quality handled in video_streams table (no locking - always from FFprobe)
```

**Similar for series and episodes tables.**

---

## Asset-Level Locking

### Purpose

Asset locking prevents automatic replacement or addition of images, trailers, and other media assets. Unlike field locking (which locks a single scalar value), asset locking is **per-type** and affects all assets of that type.

**See [ASSET_MANAGEMENT.md](ASSET_MANAGEMENT.md) for complete asset management workflows.**

### Per-Type Locking (Not Per-Asset)

Asset locking is **type-level**, not individual-asset-level:

```typescript
// CORRECT: Lock all posters for this movie
movie.poster_locked = 1;
// Result: Algorithm will NOT auto-select or download any posters

// CORRECT: Lock all fanart for this movie
movie.fanart_locked = 1;
// Result: Algorithm will NOT auto-select or download any fanart

// NOT SUPPORTED: Lock only fanart #2, but allow fanart #1 and #3 to be replaced
// Reason: Per-asset locking adds too much complexity for minimal benefit
```

**Why per-type, not per-asset?**
- Simpler UI (one lock button per asset type, not per image)
- Clearer semantics (user has manually curated this asset type)
- Easier querying (single boolean check, not JOIN to asset_candidates)
- Most users lock all assets of a type together

### Asset Locking Columns

```sql
-- movies table
ALTER TABLE movies ADD COLUMN poster_locked BOOLEAN DEFAULT 0;
ALTER TABLE movies ADD COLUMN fanart_locked BOOLEAN DEFAULT 0;
ALTER TABLE movies ADD COLUMN landscape_locked BOOLEAN DEFAULT 0;
ALTER TABLE movies ADD COLUMN banner_locked BOOLEAN DEFAULT 0;
ALTER TABLE movies ADD COLUMN clearlogo_locked BOOLEAN DEFAULT 0;
ALTER TABLE movies ADD COLUMN clearart_locked BOOLEAN DEFAULT 0;
ALTER TABLE movies ADD COLUMN discart_locked BOOLEAN DEFAULT 0;
ALTER TABLE movies ADD COLUMN keyart_locked BOOLEAN DEFAULT 0;
ALTER TABLE movies ADD COLUMN trailer_locked BOOLEAN DEFAULT 0;

-- series table (similar)
ALTER TABLE series ADD COLUMN poster_locked BOOLEAN DEFAULT 0;
ALTER TABLE series ADD COLUMN fanart_locked BOOLEAN DEFAULT 0;
ALTER TABLE series ADD COLUMN banner_locked BOOLEAN DEFAULT 0;
ALTER TABLE series ADD COLUMN clearlogo_locked BOOLEAN DEFAULT 0;

-- episodes table
ALTER TABLE episodes ADD COLUMN thumb_locked BOOLEAN DEFAULT 0;
```

### Asset Locking Behavior

**When asset type is locked:**
1. ❌ Algorithm will NOT auto-select new candidates from providers
2. ❌ Algorithm will NOT download new assets
3. ❌ Algorithm will NOT replace existing assets
4. ✅ User can still manually select/upload/delete assets via UI
5. ✅ Existing selected assets remain published

**When asset type is unlocked:**
1. ✅ Algorithm can auto-select candidates based on scoring
2. ✅ Algorithm can download better-quality replacements
3. ✅ Algorithm respects `asset_selection_config` (max_count, quality thresholds)

### Locking Triggers

**Manual asset selection/upload:**
```typescript
// User selects a specific poster candidate
async function selectAssetCandidate(
  entityType: string,
  entityId: number,
  candidateId: number,
  assetType: string
): Promise<void> {
  // Mark candidate as selected
  await db.execute(`
    UPDATE asset_candidates
    SET is_selected = 1,
        selected_by = 'manual',
        selected_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [candidateId]);

  // Lock the asset type
  const lockColumn = `${assetType}_locked`;
  await db.execute(`
    UPDATE ${entityType}s
    SET ${lockColumn} = 1,
        has_unpublished_changes = 1
    WHERE id = ?
  `, [entityId]);

  // Log activity
  await db.logActivity({
    event_type: 'asset.locked',
    entity_type: entityType,
    entity_id: entityId,
    description: `User selected ${assetType}, asset type locked`
  });
}
```

**Manual asset upload:**
```typescript
// User uploads custom poster
async function uploadCustomAsset(
  entityType: string,
  entityId: number,
  assetType: string,
  fileBuffer: Buffer
): Promise<void> {
  // Calculate hashes
  const contentHash = sha256(fileBuffer);
  const pHash = await calculatePerceptualHash(fileBuffer);

  // Store in cache
  const cachePath = `/data/cache/assets/${contentHash}.jpg`;
  await fs.writeFile(cachePath, fileBuffer);

  // Add to cache_inventory
  await storeAsset(fileBuffer, 'image', { mimeType: 'image/jpeg' });

  // Add to asset_candidates
  await db.execute(`
    INSERT INTO asset_candidates (
      entity_type, entity_id, asset_type,
      provider, cache_path, content_hash, perceptual_hash,
      is_downloaded, is_selected, selected_by
    ) VALUES (?, ?, ?, 'local', ?, ?, ?, 1, 1, 'manual')
  `, [entityType, entityId, assetType, cachePath, contentHash, pHash]);

  // Lock the asset type
  const lockColumn = `${assetType}_locked`;
  await db.execute(`
    UPDATE ${entityType}s
    SET ${lockColumn} = 1,
        has_unpublished_changes = 1
    WHERE id = ?
  `, [entityId]);
}
```

### Asset Enrichment with Locking

```typescript
async function enrichMovieAssets(movie: Movie): Promise<void> {
  const tmdbData = await tmdb.getMovieImages(movie.tmdb_id);

  // Check poster lock
  if (!movie.poster_locked) {
    // Fetch poster candidates
    for (const poster of tmdbData.posters) {
      await db.execute(`
        INSERT INTO asset_candidates (
          entity_type, entity_id, asset_type,
          provider, provider_url, width, height,
          provider_metadata
        ) VALUES (?, ?, 'poster', 'tmdb', ?, ?, ?, ?)
      `, [
        'movie',
        movie.id,
        `https://image.tmdb.org/t/p/original${poster.file_path}`,
        poster.width,
        poster.height,
        JSON.stringify({ language: poster.iso_639_1, vote_average: poster.vote_average })
      ]);
    }

    // Auto-select top posters (if YOLO mode)
    const config = await getLibraryAutomationConfig(movie.library_id);
    if (config.auto_select_assets) {
      await autoSelectAssets(movie.id, 'movie', 'poster');
    }
  } else {
    console.log(`Poster locked for movie ${movie.id}, skipping poster enrichment`);
  }

  // Check fanart lock
  if (!movie.fanart_locked) {
    // Similar logic for fanart
  }
}
```

### UI - Asset Lock Controls

**Edit Page - Asset Section:**
```
┌────────────────────────────────────────────────┐
│ Poster                                [🔒 Lock]│
├────────────────────────────────────────────────┤
│ [Thumbnail]  2000×3000  8.5★  TMDB             │
│ ☑ Selected  🤖 Auto-selected                   │
└────────────────────────────────────────────────┘

┌────────────────────────────────────────────────┐
│ Fanart                              [🔓 Unlock]│
├────────────────────────────────────────────────┤
│ [Thumbnail 1]  1920×1080  7.8★  TMDB           │
│ ☑ Selected  👤 User-selected                   │
│                                                │
│ [Thumbnail 2]  1920×1080  7.2★  TMDB           │
│ ☑ Selected  👤 User-selected                   │
│                                                │
│ [Thumbnail 3]  1920×1080  6.9★  TMDB           │
│ ☑ Selected  🤖 Auto-selected                   │
│                                                │
│ [+ Replace Images] [+ Upload Custom]           │
└────────────────────────────────────────────────┘
```

**Lock Button Behavior:**
- **🔒 Locked**: Asset type frozen, no automatic changes
- **🔓 Unlocked**: Asset type can receive automatic updates
- **Click to toggle**: User can lock/unlock at any time

**Selection Indicators:**
- **🤖 Auto Selected**: Selected by algorithm (can be auto-replaced if unlocked)
- **👤 User Selected**: Manually selected by user (triggered lock)
- **📁 Local**: Discovered during scan (triggered lock)

### Unlock Workflow

**User wants to allow automatic updates again:**

```typescript
async function unlockAssetType(
  entityType: string,
  entityId: number,
  assetType: string
): Promise<void> {
  // Unlock the asset type
  const lockColumn = `${assetType}_locked`;
  await db.execute(`
    UPDATE ${entityType}s
    SET ${lockColumn} = 0
    WHERE id = ?
  `, [entityId]);

  // Update selected_by for currently selected assets
  await db.execute(`
    UPDATE asset_candidates
    SET selected_by = 'manual_unlocked'
    WHERE entity_type = ?
      AND entity_id = ?
      AND asset_type = ?
      AND is_selected = 1
      AND selected_by = 'manual'
  `, [entityType, entityId, assetType]);

  // Log activity
  await db.logActivity({
    event_type: 'asset.unlocked',
    entity_type: entityType,
    entity_id: entityId,
    description: `User unlocked ${assetType} for automatic updates`
  });

  // Trigger enrichment (if incomplete)
  const entity = await db.getEntity(entityType, entityId);
  const completeness = await calculateCompleteness(entity);

  if (completeness < 100) {
    await queueEnrichmentJob(entityType, entityId, 2); // High priority
  }
}
```

**Result:**
- Asset type unlocked
- Next enrichment run can auto-select better candidates
- Existing selected assets remain (but can be replaced)

### Asset Lock and Completeness

Asset locks affect completeness calculation:

```typescript
async function calculateCompleteness(movie: Movie, config: CompletenessConfig): Promise<number> {
  let totalRequirements = 0;
  let metRequirements = 0;

  // ... (scalar fields calculation)

  // Asset requirements
  const assetTypes = ['poster', 'fanart', 'landscape', 'banner', 'clearlogo', 'clearart', 'discart'];

  for (const assetType of assetTypes) {
    const required = config[`required_${assetType}s`];

    if (required > 0) {
      const isLocked = movie[`${assetType}_locked`];
      const selectedCount = await db.query(`
        SELECT COUNT(*) as count
        FROM asset_candidates
        WHERE entity_type = 'movie'
          AND entity_id = ?
          AND asset_type = ?
          AND is_selected = 1
      `, [movie.id, assetType]);

      totalRequirements += required;

      if (isLocked) {
        // If locked, current count is "acceptable" (user chose this)
        // Don't penalize for not meeting config requirements
        metRequirements += required;
      } else {
        // If unlocked, must meet config requirements
        metRequirements += Math.min(selectedCount[0].count, required);
      }
    }
  }

  return (metRequirements / totalRequirements) * 100;
}
```

**Example:**
```
Config requires: 3 fanarts
Current state: 1 fanart selected, fanart_locked = 1

Completeness calculation:
  - Required: 3 fanarts
  - Has: 1 fanart
  - Locked: Yes
  - Result: Counts as COMPLETE (3/3) because user locked it

Reason: User explicitly chose to have only 1 fanart, their choice is respected.
```

---

## Locking Behavior

### Manual User Edit → Auto-Lock

When user edits a field in the UI:

```typescript
async function updateMovieField(movieId: number, field: string, value: any): Promise<void> {
  // Update the field value
  await db.updateMovie(movieId, { [field]: value });

  // Lock the field to prevent auto-overwrite
  await db.updateMovie(movieId, { [`${field}_locked`]: true });

  // Log activity
  await db.logActivity({
    event_type: 'edit',
    entity_type: 'movie',
    entity_id: movieId,
    description: `User locked field: ${field}`,
    metadata: { field, value }
  });
}
```

### Scheduled Task → Skip Locked Fields

When enriching metadata from providers:

```typescript
async function enrichMovieMetadata(movie: Movie): Promise<void> {
  const tmdbData = await tmdbClient.getMovieDetails(movie.tmdb_id);
  const updates: Partial<Movie> = {};

  // Only update unlocked fields
  if (!movie.plot_locked && tmdbData.overview) {
    updates.plot = tmdbData.overview;
  }

  if (!movie.tagline_locked && tmdbData.tagline) {
    updates.tagline = tmdbData.tagline;
  }

  // Note: Runtime comes from video_streams table (FFprobe), not metadata providers

  // Update only unlocked fields
  await db.updateMovie(movie.id, updates);

  // Array fields
  if (!movie.actors_locked) {
    await updateActors(movie.id, tmdbData.credits.cast);
  }

  if (!movie.genres_locked) {
    await updateGenres(movie.id, tmdbData.genres);
  }

  // Images (check locked flag in images table)
  if (!movie.poster_locked) {
    await downloadPoster(movie.id, tmdbData.poster_path);
  }
}
```

### Completeness Reached → Lock All

When completeness reaches 100%, automatically lock all fields:

```typescript
async function checkAndLockIfComplete(movie: Movie, config: CompletenessConfig): Promise<void> {
  const completeness = await calculateCompleteness(movie, config);

  if (completeness >= 100) {
    // Lock all lockable fields
    const locks = {
      plot_locked: true,
      tagline_locked: true,
      mpaa_locked: true,
      premiered_locked: true,
      user_rating_locked: true,
      trailer_url_locked: true,
      actors_locked: true,
      directors_locked: true,
      writers_locked: true,
      genres_locked: true,
      studios_locked: true,
      tags_locked: true,
      countries_locked: true
    };

    await db.updateMovie(movie.id, locks);

    // Lock all images
    await db.lockAllImages(movie.id);

    await db.logActivity({
      event_type: 'auto_lock',
      entity_type: 'movie',
      entity_id: movie.id,
      description: `All fields locked (completeness reached 100%)`
    });
  }
}
```

---

## User Controls

### UI - Edit Page

**Individual Field Lock Icons:**
```
Plot: [Text field...........................] [🔒]
      ↑ User can click lock icon to manually lock/unlock

Tagline: [Text field.......................] [🔓]
         ↑ Unlocked icon (will receive updates)

Poster: [Image thumbnail] [🔒]
        ↑ Locked (user uploaded custom poster)

Fanart 1: [Image thumbnail] [🔓]
          ↑ Unlocked (can be auto-replaced)
```

**"Monitored" Master Toggle:**
```
┌─────────────────────────────────────────────┐
│ ☑ Monitored                                 │
│   Allow automatic metadata updates          │
│                                             │
│   When disabled, all fields are locked.    │
└─────────────────────────────────────────────┘
```

**Behavior:**
- **Toggle ON** → Unlock all fields (allow auto-updates)
- **Toggle OFF** → Lock all fields (freeze current state)
- **Individual locks** → Override the master toggle

---

## Query Patterns

### Find All Items Needing Updates (For Scheduled Task)

```sql
SELECT m.*
FROM movies m
WHERE
  -- Not in error state
  m.processing_state IS NULL

  -- Has at least one unlocked field
  AND (
    m.plot_locked = 0
    OR m.tagline_locked = 0
    OR m.mpaa_locked = 0
    OR m.actors_locked = 0
    OR m.genres_locked = 0
    -- ... check all lockable fields
  )

  -- Application layer then filters by completeness < 100%
ORDER BY m.created_at DESC;
```

### Find Items with Manual Edits (Locked Fields)

```sql
SELECT m.*
FROM movies m
WHERE
  m.plot_locked = 1
  OR m.tagline_locked = 1
  OR m.mpaa_locked = 1
  -- ... any locked field
ORDER BY m.updated_at DESC;
```

### Find Fully Locked Items (User Wants No Changes)

```sql
SELECT m.*
FROM movies m
WHERE
  m.plot_locked = 1
  AND m.tagline_locked = 1
  AND m.mpaa_locked = 1
  AND m.actors_locked = 1
  AND m.genres_locked = 1
  -- ... all fields locked
;
```

### Find Items at 100% Completeness

```typescript
// Computed in application layer (not SQL)
const movies = await db.getAllMovies();
const config = await db.getCompletenessConfig('movie');

const completeMovies = [];
for (const movie of movies) {
  const completeness = await calculateCompleteness(movie, config);
  if (completeness >= 100) {
    completeMovies.push(movie);
  }
}
```

---

## Lock Propagation Examples

### Example 1: User Edits Plot

**Before:**
```
plot: "A computer hacker..."
plot_locked: 0
completeness: 80% (missing 2 fanarts)
```

**User Action:** Edit plot to custom description

**After:**
```
plot: "My custom description for The Matrix"
plot_locked: 1  ← Automatically locked
completeness: 80% (still missing fanarts)
```

**Next scheduled update:**
- Fetch metadata from TMDB
- TMDB returns plot: "Set in the 22nd century..."
- Skip updating plot (locked)
- Update other unlocked fields
- Download missing fanarts

---

### Example 2: Completeness Reached

**Before:**
```
plot: "Set in the 22nd century..." (plot_locked: 0)
poster: [image] (locked: 0)
fanart: [image1, image2] (locked: 0)
completeness: 66% (need 3 fanarts, have 2)
```

**Scheduled Task Runs:**
- Fetch metadata from TMDB
- Download 1 more fanart (now have 3)
- Calculate completeness: 100%

**After:**
```
plot: "Set in the 22nd century..." (plot_locked: 1) ← Auto-locked
poster: [image] (locked: 1) ← Auto-locked
fanart: [image1, image2, image3] (all locked: 1) ← Auto-locked
completeness: 100%
```

**Item is now "unmonitored"** (all fields locked, will not receive automatic updates)

---

### Example 3: User Uploads Custom Poster

**Before:**
```
poster: [TMDB poster] (from provider)
  locked: 0
  url: https://image.tmdb.org/t/p/original/...
completeness: 90%
```

**User Action:** Upload custom poster.jpg

**After:**
```
poster: [Custom poster]
  locked: 1  ← Automatically locked
  url: null
  file_path: /movies/The Matrix (1999)/poster.jpg
  cache_path: /cache/images/12345/poster.jpg
completeness: 90% (still counts toward requirement)
```

**Next scheduled update:**
- TMDB returns new poster URL (higher resolution)
- Skip downloading (poster is locked)
- User's custom poster preserved

---

## Edge Cases & Special Handling

### Case 1: User Unlocks Field, Then Relocks

```
1. User edits plot → plot_locked = 1
2. Scheduled task → skips plot (locked)
3. User clicks unlock icon → plot_locked = 0
4. Scheduled task → updates plot from provider
5. User doesn't like new plot, clicks lock icon → plot_locked = 1
6. Plot frozen at current value
```

**Result:** User has full control over lock state.

---

### Case 2: NFO File Changes Locked Field

```
Database: plot = "User's custom plot", plot_locked = 1
NFO file externally modified by Radarr: <plot>Radarr's new plot</plot>

Library scan detects NFO hash changed
Intelligent merge runs:
  - plot is locked → Keep database value, ignore NFO
  - NFO hash updated to new value
  - User's custom plot preserved
```

**Result:** Locked fields always win, even against external NFO changes.

---

### Case 3: All Fields Locked, But Incomplete

```
plot_locked: 1
poster_locked: 1
fanart_locked: 1  (but only 1 fanart, need 3)
completeness: 60%
```

**Query Result:**
- Has unlocked fields? No (all locked)
- Is incomplete? Yes (60% < 100%)
- **Monitored? No** (no unlocked fields to update)

**Behavior:** Item will NOT appear in scheduled update queries (nothing can be updated).

**User must manually:**
- Upload more fanarts, OR
- Change completeness config (reduce required fanarts), OR
- Unlock fanart field (allow auto-download)

---

## Completeness Configuration API

### Get Configuration

```
GET /api/completeness/movie

Response:
{
  "media_type": "movie",
  "config": {
    "scalar_fields": {
      "plot": { "required": true },
      "tagline": { "required": false },
      "mpaa": { "required": true },
      "premiered": { "required": true }
    },
    "image_types": {
      "poster": { "quantity": 1 },
      "fanart": { "quantity": 3 },
      "banner": { "quantity": 1 }
    },
    "arrays": {
      "actors": { "min": 1 },
      "directors": { "min": 1 }
    }
  }
}
```

### Update Configuration

```
PUT /api/completeness/movie

Request:
{
  "config": {
    "scalar_fields": {
      "plot": { "required": true },
      "tagline": { "required": true },  ← Changed from false
      "mpaa": { "required": true },
      "premiered": { "required": true }
    },
    "image_types": {
      "poster": { "quantity": 1 },
      "fanart": { "quantity": 5 },  ← Changed from 3
      "banner": { "quantity": 1 },
      "clearlogo": { "quantity": 1 }  ← Added new requirement
    },
    "arrays": {
      "actors": { "min": 3 },  ← Changed from 1
      "directors": { "min": 1 }
    }
  }
}

Response:
{
  "success": true,
  "changes": {
    "recalculated_items": 1450,
    "newly_incomplete": 320,  ← Items that were 100% now <100% due to new requirements
    "newly_complete": 15      ← Items that reached 100% due to relaxed requirements
  }
}
```

**After config change:**
- Recalculate completeness for all items
- Items that became incomplete → automatically unlocked (if config strictness increased)
- Items that became complete → remain unlocked (don't auto-lock on config change)
- User can trigger global "lock all complete items" action if desired

---

## Best Practices

1. **Default to Unlocked**: All fields start unlocked, allowing automatic enrichment
2. **Lock on User Edit**: Any manual edit immediately locks that field
3. **Auto-Lock at 100%**: When complete, lock all fields to prevent accidental overwrites
4. **Respect Locks**: Never update locked fields automatically (webhooks, scans, scheduled tasks)
5. **User Control**: Provide UI for users to manually lock/unlock individual fields
6. **Master Toggle**: "Monitored" toggle acts as unlock-all/lock-all convenience
7. **Transparent State**: Show lock icons in UI, make it clear which fields are frozen
8. **Completeness Flexibility**: Allow users to define their own completeness criteria per media type
