# Image Asset Management System

This document details Metarr's three-tier image storage strategy, perceptual hashing for duplicate detection, and selection algorithms for optimal image quality.

## Overview

Metarr manages image assets (posters, fanart, banners, logos, etc.) through a three-tier storage system that balances performance, reliability, and disk space.

### Design Goals

1. **Avoid re-downloading** images from providers (save bandwidth, respect rate limits)
2. **Recover from deletion** by media managers (Radarr/Sonarr sometimes clean up images)
3. **Prevent duplicates** using perceptual hashing (no near-identical images)
4. **Select highest quality** images based on votes and resolution
5. **Support user customization** (manual uploads, locked images)
6. **Minimize provider API calls** during backup/restore

---

## Three-Tier Storage Architecture

```
Provider (TMDB/TVDB)
        │
        │ Download once
        ▼
┌─────────────────┐
│  Cache Directory│  ← Persistent, organized by entity ID
│  /cache/images/ │     Never deleted by Metarr
└─────────────────┘     Survives media manager cleanup
        │
        │ Copy to library
        ▼
┌─────────────────┐
│Library Directory│  ← Kodi naming conventions
│  /movies/...    │     poster.jpg, fanart.jpg, fanart1.jpg
└─────────────────┘     May be deleted by media manager
        │
        │ Kodi reads & converts
        ▼
┌─────────────────┐
│  Kodi Cache     │  ← Skin-specific sizes
│  (internal)     │     Managed by Kodi, not Metarr
└─────────────────┘
```

### Tier 1: Provider URLs

**Storage:** Database (`images` table)
**Purpose:** Source of truth for where image came from
**Format:** Full TMDB/TVDB image URL

```sql
url: "https://image.tmdb.org/t/p/original/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg"
```

**Use cases:**
- Initial download
- Re-download if cache/library files lost
- Metadata display (show source)

---

### Tier 2: Cache Directory

**Storage:** `/data/cache/images/{entity_id}/{image_type}_{hash}.{ext}`
**Purpose:** Persistent local copy, survives media manager cleanup
**Organization:**

```
/data/cache/images/
  ├── 12345/  (movie ID)
  │   ├── poster_abc123.jpg
  │   ├── fanart_def456.jpg
  │   ├── fanart_ghi789.jpg
  │   └── fanart_jkl012.jpg
  ├── 67890/  (movie ID)
  │   ├── poster_mno345.jpg
  │   └── fanart_pqr678.jpg
```

**Lifecycle:**
- Created: During initial metadata enrichment
- Used: When copying to library directory
- Persists: Never deleted by Metarr (only manual cleanup)
- Survives: Media manager cleanup, backup/restore

**Recovery Flow:**
```
1. Radarr deletes /movies/The Matrix (1999)/poster.jpg
2. Metarr detects missing file during scan
3. Metarr copies from cache: /cache/images/12345/poster_abc123.jpg
4. No provider API call needed
```

---

### Tier 3: Library Directory

**Storage:** `/movies/{title}/poster.jpg`, `fanart.jpg`, etc.
**Purpose:** Kodi-readable location with standard naming
**Naming Conventions (Kodi 21 Standard):**

| Image Type | Kodi Filename(s) | Notes |
|------------|------------------|-------|
| Poster | `poster.jpg` | Primary poster only |
| Posters (multiple) | `poster.jpg`, `poster1.jpg`, `poster2.jpg`, ..., `poster19.jpg` | **NOT zero-padded**, max ~20 per skin |
| Fanart (multiple) | `fanart.jpg`, `fanart1.jpg`, `fanart2.jpg`, ..., `fanart19.jpg` | **NOT zero-padded**, max ~20 per skin |
| Banner | `banner.jpg` | |
| Clear Logo | `clearlogo.png` | |
| Clear Art | `clearart.png` | |
| Disc Art | `disc.png`, `discart.png` | |
| Landscape/Thumb | `landscape.jpg`, `thumb.jpg` | |
| Keyart | `keyart.jpg` | |
| Actor Images | `.actors/{actor_name}.jpg` | In `.actors/` subdirectory |

**IMPORTANT:**
- Numbers are **NOT zero-padded** (use `poster1.jpg`, not `poster01.jpg`)
- Most Kodi skins support maximum ~20 images per type
- Legacy directories (`extrafanart/`, `extraposters/`) are **NOT supported** in Kodi 21
- During rebuild, legacy directories are migrated to flat numbered files

**Lifecycle:**
- Created: Copied from cache after enrichment
- Used: Read by Kodi/Jellyfin/Plex during library scan
- Volatile: May be deleted by media managers
- Recoverable: From cache or provider

---

## Image Database Schema

```sql
CREATE TABLE images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,        -- 'movie', 'series', 'season', 'episode'
  entity_id INTEGER NOT NULL,
  image_type TEXT NOT NULL,         -- 'poster', 'fanart', 'banner', 'clearlogo', etc.
  url TEXT,                          -- Provider URL
  file_path TEXT,                    -- Library path (/movies/The Matrix (1999)/poster.jpg)
  cache_path TEXT,                   -- Cache path (/cache/images/12345/poster_abc123.jpg)
  width INTEGER,
  height INTEGER,
  vote_average REAL,                 -- Provider rating for this image
  locked BOOLEAN DEFAULT 0,          -- User uploaded or manually selected
  perceptual_hash TEXT,              -- pHash for duplicate detection
  deleted_on TIMESTAMP,              -- Set when parent entity marked for deletion
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_images_entity ON images(entity_type, entity_id);
CREATE INDEX idx_images_type ON images(image_type);
CREATE INDEX idx_images_locked ON images(locked);
CREATE INDEX idx_images_phash ON images(perceptual_hash);
CREATE INDEX idx_images_deleted_on ON images(deleted_on);
```

**Example Rows:**
```json
[
  {
    "entity_type": "movie",
    "entity_id": 12345,
    "image_type": "poster",
    "url": "https://image.tmdb.org/t/p/original/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg",
    "file_path": "/movies/The Matrix (1999)/poster.jpg",
    "cache_path": "/cache/images/12345/poster_abc123.jpg",
    "width": 2000,
    "height": 3000,
    "vote_average": 8.5,
    "locked": 0,
    "perceptual_hash": "a1b2c3d4e5f6..."
  },
  {
    "entity_type": "movie",
    "entity_id": 12345,
    "image_type": "fanart",
    "url": "https://image.tmdb.org/t/p/original/fNG7i7RqMErkcqhohV2a6cV1Ehy.jpg",
    "file_path": "/movies/The Matrix (1999)/fanart.jpg",
    "cache_path": "/cache/images/12345/fanart_def456.jpg",
    "width": 1920,
    "height": 1080,
    "vote_average": 7.8,
    "locked": 0,
    "perceptual_hash": "g7h8i9j0k1l2..."
  },
  {
    "entity_type": "movie",
    "entity_id": 12345,
    "image_type": "poster",
    "url": null,  ← User uploaded
    "file_path": "/movies/The Matrix (1999)/poster-custom.jpg",
    "cache_path": "/cache/images/12345/poster_custom_xyz.jpg",
    "width": 2400,
    "height": 3600,
    "vote_average": null,
    "locked": 1,  ← Locked (preserve user's choice)
    "perceptual_hash": "m3n4o5p6q7r8..."
  }
]
```

---

## Image Selection Algorithm

When enriching metadata, Metarr selects the best N images from provider's available options.

### Selection Criteria (Priority Order)

1. **vote_average** (descending) - Provider's quality rating
2. **resolution** (descending) - Width × height
3. **uniqueness** - Perceptual hash similarity < 90%

### Process Flow

```
Provider returns 20 fanart images
                │
                ▼
Filter locked images (already selected)
                │
                ▼
Sort by vote_average DESC, then (width × height) DESC
                │
                ▼
Download top candidates to temp directory
                │
                ▼
Calculate perceptual hash (pHash) for each
                │
                ▼
Select top N, filtering near-duplicates (>90% similar)
                │
                ▼
Move selected to cache directory
                │
                ▼
Insert/update images table
                │
                ▼
Copy from cache to library directory
```

### Detailed Algorithm

```typescript
async function selectImages(
  movieId: number,
  imageType: string,
  candidates: ProviderImage[],
  requiredCount: number
): Promise<Image[]> {

  // Step 1: Filter already-locked images
  const lockedImages = await db.getImages(movieId, imageType, { locked: true });
  const lockedCount = lockedImages.length;
  const neededCount = requiredCount - lockedCount;

  if (neededCount <= 0) {
    return lockedImages;  // Already have enough locked images
  }

  // Step 2: Sort candidates
  const sorted = candidates.sort((a, b) => {
    // Primary: vote_average
    if (b.vote_average !== a.vote_average) {
      return b.vote_average - a.vote_average;
    }
    // Secondary: resolution
    return (b.width * b.height) - (a.width * a.height);
  });

  // Step 3: Download candidates to temp directory
  const tempDir = `/tmp/metarr/images/${movieId}`;
  await fs.mkdir(tempDir, { recursive: true });

  const downloadedCandidates = [];
  for (const candidate of sorted.slice(0, Math.min(sorted.length, neededCount * 3))) {
    const tempPath = `${tempDir}/${candidate.file_path}`;
    await downloadImage(candidate.url, tempPath);
    downloadedCandidates.push({
      ...candidate,
      tempPath
    });
  }

  // Step 4: Calculate perceptual hashes
  for (const candidate of downloadedCandidates) {
    candidate.pHash = await calculatePerceptualHash(candidate.tempPath);
  }

  // Step 5: Select top N, filtering duplicates
  const selected = [];
  const selectedHashes = [];

  for (const candidate of downloadedCandidates) {
    if (selected.length >= neededCount) break;

    // Check similarity against already-selected images
    let isSimilar = false;
    for (const selectedHash of selectedHashes) {
      const similarity = compareHashes(candidate.pHash, selectedHash);
      if (similarity > 0.90) {  // 90% similarity threshold
        isSimilar = true;
        break;
      }
    }

    if (!isSimilar) {
      selected.push(candidate);
      selectedHashes.push(candidate.pHash);
    }
  }

  // Step 6: Move to cache and update database
  const images = [];
  for (let i = 0; i < selected.length; i++) {
    const candidate = selected[i];
    const cacheFilename = `${imageType}_${randomHash()}.${getExtension(candidate.file_path)}`;
    const cachePath = `/cache/images/${movieId}/${cacheFilename}`;

    await fs.move(candidate.tempPath, cachePath);

    const image = await db.insertImage({
      entity_type: 'movie',
      entity_id: movieId,
      image_type: imageType,
      url: candidate.url,
      cache_path: cachePath,
      width: candidate.width,
      height: candidate.height,
      vote_average: candidate.vote_average,
      perceptual_hash: candidate.pHash,
      locked: false
    });

    images.push(image);
  }

  // Step 7: Cleanup temp directory
  await fs.remove(tempDir);

  return [...lockedImages, ...images];
}
```

---

## Perceptual Hashing for Duplicate Detection

Metarr uses **perceptual hashing (pHash)** to detect visually similar images, even if they have different resolutions or slight color variations.

### Why Not File Hash (MD5/SHA256)?

**File hashes** only detect exact duplicates:
```
Image A: poster.jpg (1920×1080, bright colors)
Image B: poster_hq.jpg (3840×2160, same image upscaled)
MD5: Different (different file sizes, pixel data)
pHash: >95% similar (visually identical)
```

### Perceptual Hash Algorithm

1. **Resize** image to small size (e.g., 32×32) to normalize resolution
2. **Convert to grayscale** to ignore color variations
3. **Compute DCT** (Discrete Cosine Transform) to capture frequency patterns
4. **Generate hash** from low-frequency components
5. **Compare hashes** using Hamming distance

```typescript
import * as phash from 'sharp-phash';
import * as sharp from 'sharp';

async function calculatePerceptualHash(imagePath: string): Promise<string> {
  const buffer = await sharp(imagePath)
    .resize(32, 32)
    .grayscale()
    .toBuffer();

  const hash = await phash(buffer);
  return hash;  // e.g., "a1b2c3d4e5f6g7h8"
}

function compareHashes(hash1: string, hash2: string): number {
  // Calculate Hamming distance
  const distance = hammingDistance(hash1, hash2);
  const maxDistance = hash1.length * 4;  // Each char is 4 bits
  const similarity = 1 - (distance / maxDistance);
  return similarity;  // 0.0 to 1.0
}

function hammingDistance(str1: string, str2: string): number {
  let distance = 0;
  for (let i = 0; i < str1.length; i++) {
    const xor = parseInt(str1[i], 16) ^ parseInt(str2[i], 16);
    distance += xor.toString(2).split('1').length - 1;
  }
  return distance;
}
```

### Similarity Threshold

**90% similarity** is the default threshold:
- **Above 90%**: Considered duplicate, skip
- **Below 90%**: Considered unique, include

**Examples:**
- Same image, different resolution: 95-98% similar → Skip
- Same scene, different angle: 85% similar → Include
- Different scenes from same movie: 40-60% similar → Include

---

## Update Behavior for Unlocked Images

When scheduled task finds higher-quality images from providers:

```typescript
async function updateUnlockedImages(
  movieId: number,
  imageType: string,
  newCandidates: ProviderImage[]
): Promise<void> {

  // Get current unlocked images of this type
  const currentImages = await db.getImages(movieId, imageType, { locked: false });

  // Score each current image
  const scoredCurrent = currentImages.map(img => ({
    ...img,
    score: (img.vote_average || 0) * 10 + (img.width * img.height) / 1000000
  }));

  // Score new candidates
  const scoredCandidates = newCandidates.map(img => ({
    ...img,
    score: img.vote_average * 10 + (img.width * img.height) / 1000000
  }));

  // Sort both by score
  scoredCurrent.sort((a, b) => b.score - a.score);
  scoredCandidates.sort((a, b) => b.score - a.score);

  // Find candidates that score better than current worst image
  const worstCurrentScore = scoredCurrent[scoredCurrent.length - 1]?.score || 0;
  const betterCandidates = scoredCandidates.filter(c => c.score > worstCurrentScore);

  // Download and check for duplicates
  for (const candidate of betterCandidates) {
    const tempPath = await downloadToTemp(candidate.url);
    const pHash = await calculatePerceptualHash(tempPath);

    // Check similarity against current images
    let isDuplicate = false;
    for (const current of scoredCurrent) {
      const similarity = compareHashes(pHash, current.perceptual_hash);
      if (similarity > 0.90) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      // Replace lowest-scoring unlocked image
      const toReplace = scoredCurrent.pop();
      await db.deleteImage(toReplace.id);
      await fs.remove(toReplace.cache_path);

      // Add new image
      const cachePath = await moveToCache(tempPath, movieId, imageType);
      await db.insertImage({
        entity_type: 'movie',
        entity_id: movieId,
        image_type: imageType,
        url: candidate.url,
        cache_path: cachePath,
        width: candidate.width,
        height: candidate.height,
        vote_average: candidate.vote_average,
        perceptual_hash: pHash,
        locked: false
      });

      scoredCurrent.push(candidate);
      scoredCurrent.sort((a, b) => b.score - a.score);
    }
  }
}
```

---

## User-Uploaded Custom Images

### Upload Flow

```
User uploads custom poster.jpg via UI
              │
              ▼
Validate image (size, format, dimensions)
              │
              ▼
Calculate perceptual hash
              │
              ▼
Copy to cache directory
              │
              ▼
Insert into images table with locked=1
              │
              ▼
Copy from cache to library directory
              │
              ▼
Trigger Kodi scan (image cache rebuild)
```

### Database Entry

```json
{
  "entity_type": "movie",
  "entity_id": 12345,
  "image_type": "poster",
  "url": null,  ← No provider URL (user uploaded)
  "file_path": "/movies/The Matrix (1999)/poster.jpg",
  "cache_path": "/cache/images/12345/poster_custom_abc123.jpg",
  "width": 2400,
  "height": 3600,
  "vote_average": null,  ← No provider rating
  "locked": 1,  ← LOCKED (preserve user's upload)
  "perceptual_hash": "x1y2z3..."
}
```

### Preservation

- **Locked images** are never replaced by automatic updates
- **Counts toward completeness** (if 1 poster required, user upload satisfies)
- **Survives rescans** (NFO changes don't affect locked images)
- **Recoverable from cache** (if library file deleted)

---

## Kodi Image Caching Behavior

### Why Metarr Can't Control Kodi's Cache

Kodi converts images to skin-specific sizes and caches them internally. This process is **only accessible via Python API** running inside Kodi, not remotely.

### Kodi's Image Processing

```
Metarr writes: /movies/The Matrix (1999)/poster.jpg (2000×3000)
                              │
                              ▼
Kodi scans library, finds poster.jpg
                              │
                              ▼
Kodi converts to skin requirements:
  - Thumbnail view: 300×450
  - List view: 150×225
  - Full screen: 800×1200
                              │
                              ▼
Kodi stores in internal cache:
  ~/.kodi/userdata/Thumbnails/{hash}/
```

### Triggering Cache Rebuild

**Option 1: Scan Specific Directory** (new files added)
```json
{
  "jsonrpc": "2.0",
  "method": "VideoLibrary.Scan",
  "params": {
    "directory": "/mnt/movies/The Matrix (1999)/"
  }
}
```
Result: Kodi reads NFO, converts images, caches, updates skin.

**Option 2: Fake Directory Scan** (metadata/images updated, no new files)
```json
{
  "jsonrpc": "2.0",
  "method": "VideoLibrary.Scan",
  "params": {
    "directory": "/doesNotExist"
  }
}
```
Result: Scan fails (no directory), but triggers skin refresh and cache rebuild.

### Kodi Shared Library Groups

For Kodi instances sharing a MySQL database:

1. **One player** triggers scan → database updated
2. **All players** see updated metadata (shared DB)
3. **Each player** must rebuild its own image cache independently
4. **Solution**: Send notification to each player: "Library updated, refreshing cache..."

---

## Recovery from Asset Loss

### Scenario: Media Manager Deletes Images

```
1. Radarr upgrades movie, cleans up old files
2. Radarr deletes all images in movie directory
3. Metarr's next library scan detects missing files
4. Metarr copies from cache → library directory
5. No provider API calls needed (cache intact)
```

### Scenario: Cache Directory Lost (Disk Failure)

```
1. Cache directory /cache/images/ lost
2. Database intact (images table has URLs)
3. Metarr re-downloads from provider URLs
4. Rebuilds cache directory
5. Copies to library directories
6. Triggers media player scans
```

### Scenario: Database Lost (Restore from Backup)

```
1. Restore database from backup
2. images table populated (URLs, cache_paths)
3. Check if cache files exist:
   - If yes → Copy to library
   - If no → Re-download from URL
4. If URL returns 404 (provider removed):
   - Check library directory (maybe still there)
   - If found → Copy to cache
   - If not found → Mark as missing, user intervention
```

---

## Deleted Media Asset Cleanup

When a media item (movie, series, episode) is marked for deletion, its associated image assets follow a 7-day grace period cleanup workflow.

### Soft Delete Workflow

```
User/System deletes movie
        │
        ▼
UPDATE movies SET deleted_on = NOW() + 7 days
        │
        ▼
UPDATE images SET deleted_on = NOW() + 7 days
WHERE entity_type = 'movie' AND entity_id = {movieId}
        │
        ▼
[7-day grace period - asset files remain intact]
        │
        ▼
Daily scheduled cleanup task runs
        │
        ▼
SELECT * FROM images WHERE deleted_on <= NOW()
        │
        ▼
For each image:
  ├─ Delete cache file (if exists)
  ├─ Delete library file (if exists)
  └─ DELETE FROM images WHERE id = {imageId}
        │
        ▼
DELETE FROM movies WHERE deleted_on <= NOW()
```

### Database Queries

**Mark Movie and Images for Deletion:**
```sql
-- Mark movie for deletion (7-day grace period)
UPDATE movies
SET deleted_on = DATETIME('now', '+7 days')
WHERE id = 12345;

-- Mark all associated images for deletion
UPDATE images
SET deleted_on = DATETIME('now', '+7 days')
WHERE entity_type = 'movie' AND entity_id = 12345;
```

**Scheduled Cleanup Task (Runs Daily):**
```sql
-- Find images pending permanent deletion
SELECT id, cache_path, file_path
FROM images
WHERE deleted_on IS NOT NULL
  AND deleted_on <= CURRENT_TIMESTAMP;

-- After deleting files, remove from database
DELETE FROM images
WHERE deleted_on IS NOT NULL
  AND deleted_on <= CURRENT_TIMESTAMP;

-- Remove movies past grace period
DELETE FROM movies
WHERE deleted_on IS NOT NULL
  AND deleted_on <= CURRENT_TIMESTAMP;
```

### Cleanup Task Implementation

```typescript
async function runImageCleanupTask(): Promise<void> {
  // Get images pending deletion
  const imagesToDelete = await db.query(`
    SELECT id, cache_path, file_path
    FROM images
    WHERE deleted_on IS NOT NULL
      AND deleted_on <= CURRENT_TIMESTAMP
  `);

  let deletedCount = 0;
  let errorCount = 0;

  for (const image of imagesToDelete) {
    try {
      // Delete cache file
      if (image.cache_path && await fs.exists(image.cache_path)) {
        await fs.remove(image.cache_path);
      }

      // Delete library file
      if (image.file_path && await fs.exists(image.file_path)) {
        await fs.remove(image.file_path);
      }

      // Remove from database
      await db.run('DELETE FROM images WHERE id = ?', [image.id]);
      deletedCount++;

    } catch (error) {
      console.error(`Failed to delete image ${image.id}:`, error);
      errorCount++;
    }
  }

  // Log activity
  await db.logActivity({
    event_type: 'cleanup',
    severity: 'info',
    description: `Image cleanup completed: ${deletedCount} deleted, ${errorCount} errors`
  });
}
```

### Grace Period Recovery

During the 7-day grace period, users can recover deleted media:

```typescript
async function recoverDeletedMovie(movieId: number): Promise<void> {
  // Clear deletion timestamp
  await db.run(`
    UPDATE movies
    SET deleted_on = NULL
    WHERE id = ? AND deleted_on > CURRENT_TIMESTAMP
  `, [movieId]);

  // Clear deletion timestamp for associated images
  await db.run(`
    UPDATE images
    SET deleted_on = NULL
    WHERE entity_type = 'movie'
      AND entity_id = ?
      AND deleted_on > CURRENT_TIMESTAMP
  `, [movieId]);

  // Log recovery
  await db.logActivity({
    event_type: 'recovery',
    severity: 'info',
    entity_type: 'movie',
    entity_id: movieId,
    description: 'Movie recovered from deletion'
  });
}
```

### UI Display

**Deleted Items View:**
```
┌────────────────────────────────────────────────────────┐
│ Pending Deletion (7-day grace period)                 │
├────────────────────────────────────────────────────────┤
│ Movie                    Deleted On    Days Left       │
│ The Matrix (1999)        2025-10-03    5 days   [Recover] │
│ Dune: Part Two (2024)    2025-10-01    3 days   [Recover] │
│ Blade Runner 2049        2025-09-28    1 day    [Recover] │
└────────────────────────────────────────────────────────┘
```

### Orphaned Cache Cleanup

Periodically clean up cache files for entities no longer in database:

```typescript
async function cleanOrphanedCacheFiles(): Promise<void> {
  const cacheDir = '/data/cache/images';
  const entityDirs = await fs.readdir(cacheDir);

  for (const entityDir of entityDirs) {
    const entityId = parseInt(entityDir);

    // Check if entity still exists in any media table
    const exists = await db.query(`
      SELECT 1 FROM (
        SELECT id FROM movies WHERE id = ?
        UNION
        SELECT id FROM series WHERE id = ?
        UNION
        SELECT id FROM episodes WHERE id = ?
      ) LIMIT 1
    `, [entityId, entityId, entityId]);

    if (!exists.length) {
      // Entity no longer exists, delete cache directory
      await fs.remove(`${cacheDir}/${entityDir}`);
    }
  }
}
```

### Best Practices for Deletion

1. **Always use soft delete** - Set `deleted_on` timestamp, never immediate DELETE
2. **Cascade deletion timestamps** - When marking media for deletion, mark images too
3. **Run cleanup task daily** - Scheduled task at low-traffic time (e.g., 3 AM)
4. **Provide recovery UI** - Allow users to view and recover deleted items
5. **Log all deletions** - Track what was deleted and when in activity log
6. **Handle missing files gracefully** - If file already deleted externally, don't fail cleanup
7. **Monitor cleanup task** - Alert on consistent failures
8. **Verify before permanent deletion** - Double-check `deleted_on <= NOW()` condition

---

## Best Practices

1. **Always cache images** - Never rely solely on library directory
2. **Store provider URLs** - Enable re-download if cache lost
3. **Calculate pHash on download** - Prevent duplicates from entering system
4. **Lock user uploads** - Preserve manual customization
5. **Respect locked images** - Never auto-replace, even with "better" images
6. **Cleanup temp files** - Delete temp directory after selection complete
7. **Batch downloads** - Download multiple candidates at once (within rate limits)
8. **Verify dimensions** - Some providers return incorrect width/height metadata
9. **Handle missing images** - Graceful degradation if provider removes asset
10. **Monitor cache size** - Implement periodic cleanup of unused cache files (e.g., entities deleted from DB)

---

## Image Type Reference

### Movies

| Type | Kodi Filename | Typical Size | Required? |
|------|---------------|--------------|-----------|
| Poster | `poster.jpg` | 2000×3000 | Yes |
| Fanart | `fanart.jpg` | 1920×1080 | Yes |
| Additional Fanart | `fanart1.jpg`, `fanart2.jpg`, ... | 1920×1080 | Optional |
| Banner | `banner.jpg` | 1000×185 | Optional |
| Clear Logo | `clearlogo.png` | 800×310 (transparent) | Optional |
| Clear Art | `clearart.png` | 1000×562 (transparent) | Optional |
| Disc Art | `disc.png` | 1000×1000 | Optional |
| Landscape | `landscape.jpg` | 1920×1080 | Optional |
| Keyart | `keyart.jpg` | Variable | Optional |

### TV Series (Show-Level)

| Type | Kodi Filename | Notes |
|------|---------------|-------|
| Poster | `poster.jpg` | Show poster |
| Fanart | `fanart.jpg` | Show backdrop |
| Banner | `banner.jpg` | Show banner |
| Clear Logo | `clearlogo.png` | Show logo |

### TV Series (Season-Level)

| Type | Kodi Filename | Notes |
|------|---------------|-------|
| Season Poster | `season{NN}-poster.jpg` | e.g., `season01-poster.jpg` |
| Season Fanart | `season{NN}-fanart.jpg` | e.g., `season01-fanart.jpg` |
| Season Banner | `season{NN}-banner.jpg` | e.g., `season01-banner.jpg` |

### TV Series (Episode-Level)

| Type | Kodi Filename | Notes |
|------|---------------|-------|
| Episode Thumbnail | `{filename}-thumb.jpg` | e.g., `S01E01-thumb.jpg` |

---

## Asset Discovery During Scanning

### Initial Scan Process

When scanning a media directory, Metarr discovers assets in the following order:

1. **NFO Parsing** - Extract metadata (NFO image URLs are **IGNORED**, see NFO_PARSING.md)
2. **Filesystem Scanning** - Discover local image files using Kodi patterns
3. **Legacy Directory Migration** - Detect and migrate `extrafanart/`, `extraposters/` (if present)
4. **Provider Enrichment** - Fetch additional images from TMDB/TVDB (optional)
5. **Cache Backup** - Copy all discovered assets to cache directory
6. **Perceptual Hashing** - Calculate pHash for duplicate detection
7. **Quality Filtering** - Select top N images per type based on user config

### Filesystem Discovery Patterns

**Movies:**
```
/Movies/The Matrix (1999)/
├── The Matrix.mkv
├── movie.nfo
├── poster.jpg              ← Primary poster
├── poster1.jpg             ← Additional poster
├── poster2.jpg             ← Additional poster
├── fanart.jpg              ← Primary fanart
├── fanart1.jpg             ← Additional fanart
├── fanart2.jpg             ← Additional fanart
├── clearlogo.png           ← Clear logo
├── .actors/                ← Actor images directory
│   ├── Keanu Reeves.jpg
│   └── Laurence Fishburne.jpg
├── extrafanart/            ← LEGACY (migrated during rebuild)
│   ├── fanart1.jpg
│   └── fanart2.jpg
└── extraposters/           ← LEGACY (migrated during rebuild)
    ├── poster1.jpg
    └── poster2.jpg
```

**Pattern Matching:**
- `poster.{jpg,png}` → Primary poster
- `poster{N}.{jpg,png}` → Additional posters (N = 1-19, NOT zero-padded)
- `fanart.{jpg,png}` → Primary fanart
- `fanart{N}.{jpg,png}` → Additional fanarts (N = 1-19, NOT zero-padded)
- `clearlogo.{png}` → Clear logo
- `clearart.{png}` → Clear art
- `banner.{jpg,png}` → Banner
- `disc.{png}`, `discart.{png}` → Disc art
- `.actors/*.{jpg,png}` → Actor images (filename = actor name)

### Legacy Directory Migration

**Detection:**
- Check for `extrafanart/` directory
- Check for `extraposters/` directory

**Migration Process (During Rebuild):**
```typescript
// 1. Discover legacy assets
const legacyFanarts = glob('extrafanart/*.{jpg,png}');
const legacyPosters = glob('extraposters/*.{jpg,png}');

// 2. Process each asset (pHash, quality check)
for (const fanart of legacyFanarts) {
  const pHash = await calculatePerceptualHash(fanart);

  // Check for duplicates against existing fanarts
  if (!isDuplicateHash(pHash, existingFanarts)) {
    // Find next available index
    const nextIndex = getNextFanartIndex(); // e.g., 3

    // Copy to standard location
    await copyFile(fanart, `fanart${nextIndex}.jpg`);

    // Add to database
    await db.insertImage({
      image_type: 'fanart',
      cache_path: `/cache/images/${movieId}/fanart_${hash}.jpg`,
      library_path: `fanart${nextIndex}.jpg`,
      perceptual_hash: pHash
    });
  }
}

// 3. Delete legacy directories
await fs.rmdir('extrafanart', { recursive: true });
await fs.rmdir('extraposters', { recursive: true });
```

### Cache-First Architecture

**Initial Scan Behavior:**
All discovered assets are copied to cache directory as backup:

```typescript
async function scanMovieDirectory(moviePath: string) {
  // 1. Discover all assets
  const assets = await discoverAssets(moviePath);

  // 2. Copy to cache IMMEDIATELY (before any processing)
  for (const asset of assets) {
    const cacheFileName = `${asset.type}_${generateHash()}.${asset.ext}`;
    const cachePath = `/cache/images/${movieId}/${cacheFileName}`;

    await copyFile(asset.path, cachePath);

    asset.cache_path = cachePath;
  }

  // 3. Calculate perceptual hashes
  for (const asset of assets) {
    asset.pHash = await calculatePerceptualHash(asset.cache_path);
  }

  // 4. Filter duplicates and select top N
  const selected = selectTopAssets(assets, config);

  // 5. Update database
  await db.insertImages(selected);
}
```

**Recovery After Media Manager Deletion:**
```typescript
async function recoverMissingAssets(movieId: number) {
  // 1. Check what's missing in library
  const dbImages = await db.getImages(movieId);

  for (const image of dbImages) {
    const libraryExists = await fs.exists(image.library_path);

    if (!libraryExists) {
      // 2. Copy from cache (no provider API call needed)
      if (image.cache_path && await fs.exists(image.cache_path)) {
        await copyFile(image.cache_path, image.library_path);
        console.log(`Recovered ${image.image_type} from cache`);
      } else {
        // 3. Re-download from provider URL (last resort)
        await downloadImage(image.provider_url, image.library_path);
        await copyFile(image.library_path, image.cache_path);
        console.log(`Re-downloaded ${image.image_type} from provider`);
      }
    }
  }
}
```

### Actor Images Discovery

**Pattern:** `.actors/{actor_name}.{jpg,png}`

**Process:**
1. Check for `.actors/` directory in movie folder
2. Match filenames to actor names from NFO/database
3. Copy to cache and update `actors` table with `thumb_url` pointing to cache path
4. Store library path in `images` table with `entity_type = 'actor'`

**Example:**
```
.actors/
├── Keanu Reeves.jpg     → actors.thumb_url = '/cache/images/actors/keanu_reeves_abc123.jpg'
└── Carrie-Anne Moss.jpg → actors.thumb_url = '/cache/images/actors/carrie_anne_moss_def456.jpg'
```

### Unknown Files Tracking

Files that don't match any known pattern are tracked in `unknown_files` table:

**Detection:**
```typescript
const knownPatterns = [
  /^poster(\d{1,2})?\.(jpg|png)$/,
  /^fanart(\d{1,2})?\.(jpg|png)$/,
  /^banner\.(jpg|png)$/,
  /^clearlogo\.png$/,
  /^clearart\.png$/,
  /^disc(art)?\.(png)$/,
  /^landscape\.(jpg|png)$/,
  /^(movie|tvshow)\.nfo$/,
  /^.*\.(mkv|mp4|avi)$/,  // Media files
  /^.*\.(srt|ass|sub)$/,  // Subtitles
  /^.*-trailer\.(mkv|mp4|avi)$/,  // Trailers
];

const allFiles = await fs.readdir(moviePath);

for (const file of allFiles) {
  const isKnown = knownPatterns.some(pattern => pattern.test(file));

  if (!isKnown && !isIgnored(file)) {
    await db.insertUnknownFile({
      entity_type: 'movie',
      entity_id: movieId,
      file_path: path.join(moviePath, file),
      file_name: file
    });
  }
}
```

**User Actions:**
- **Delete**: Remove file + DELETE from unknown_files
- **Assign To**: Process as asset (pHash, rename, cache) + DELETE from unknown_files
- **Add to Ignore Pattern**: Add to config + cleanup + DELETE from unknown_files

See `@docs/DATABASE_SCHEMA.md` for `unknown_files` table schema.
