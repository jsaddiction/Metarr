# Asset Storage Architecture

**Last Updated**: 2025-10-21
**Status**: Implemented

---

## Overview

Metarr uses a **split cache/library architecture** with UUID-based file naming to manage media assets (images, videos, audio files, NFO files). This approach provides resilience against data loss while maintaining compatibility with media player naming conventions.

### Core Principles

1. **Cache as source of truth**: Permanent UUID-based storage protects against accidental deletion
2. **Library as ephemeral**: Published copies with Kodi naming that can be rebuilt from cache
3. **UUID naming prevents collisions**: Random UUIDs avoid file overwrites
4. **SHA256 for integrity**: Detect library file corruption or manual replacement
5. **Perceptual hash for deduplication**: Visual similarity comparison prevents duplicate downloads
6. **Split tables for clarity**: Separate `cache_*_files` and `library_*_files` tables

---

## UUID vs SHA256: Why Not Content-Addressed Storage?

### Decision: UUID-Based Naming

**Cache file path**: `/data/cache/images/movie/123/a1b2c3d4-e5f6-7890-abcd-ef1234567890.jpg`

**Why UUIDs**:
- Prevents file collisions without computing SHA256 first
- Supports multiple visually identical images with different sources
- Simpler write path (no hash → collision check → retry logic)
- Allows pre-allocation of filename before download

**Why NOT SHA256-based naming** (like `/data/cache/ab/cd/abcdef123...xyz.jpg`):
- Would force all visually identical images to share one cache file
- User replaces fanart1 with fanart3 → both would point to same hash → lose fanart1
- Deduplication should be per-entity selection, not global
- No benefit: We don't share assets across entities (movies have independent caches)

### SHA256 Usage: Change Detection Only

**Purpose**: Detect when library files are corrupted, manually replaced, or deleted

**Workflow**:
```
1. File published: Copy cache → library + store SHA256 in database
2. Next scan: Recalculate SHA256 of library file
3. Mismatch detected → Copy cache → library (restore from source of truth)
```

**NOT used for**:
- ❌ Deduplication (use perceptual hash instead)
- ❌ File naming (use UUIDs instead)
- ❌ Global asset sharing (each entity has independent cache)

---

## Deduplication Strategy: Perceptual Hash (pHash)

### Implementation

**When**: During provider metadata enrichment
**What**: Compare perceptual hashes of candidate images before download
**Threshold**: 90% visual similarity (configurable)

### Workflow

```
Fetch provider asset URLs (TMDB returns 15 posters)
  ↓
For each candidate:
  ├─ Check if already in cache (by source_url)
  ├─ If not cached:
  │   ├─ Download to temp buffer
  │   ├─ Calculate perceptual hash (pHash)
  │   ├─ Compare to existing entity cache images (same entityId, same imageType)
  │   ├─ If similarity >= 90% → Skip (duplicate)
  │   └─ Else → Save to cache with UUID
  └─ Add to candidate list
```

### Perceptual Hash Calculation

```typescript
async function calculatePerceptualHash(imagePath: string): Promise<string> {
  const buffer = await sharp(imagePath)
    .resize(32, 32)      // Normalize size
    .grayscale()         // Ignore color variations
    .raw()
    .toBuffer();

  // DCT + hashing (simplified)
  const hash = pHashLibrary.compute(buffer);
  return hash; // "a1b2c3d4e5f6g7h8"
}

function calculateSimilarity(hash1: string, hash2: string): number {
  const distance = hammingDistance(hash1, hash2);
  const maxDistance = hash1.length * 4; // bits
  return 1 - (distance / maxDistance); // 0.0 to 1.0
}
```

### Example: Deduplication in Action

**Scenario**: TMDB returns 15 posters for "The Matrix"
- Poster 1: URL A, pHash: `abc123...`
- Poster 2: URL B, pHash: `abc125...` (91% similar to Poster 1) → **Skip**
- Poster 3: URL C, pHash: `def456...` (40% similar) → **Keep**
- Result: Only 10 unique posters cached

**Cache size**: Grows based on unique visual selections per entity, NOT total URLs

---

## Database Schema

### Split Cache/Library Tables

**Pattern**: For each asset type, two tables:
1. `cache_*_files` - Source of truth
2. `library_*_files` - Published copies

### Example: Image Files

```sql
CREATE TABLE cache_image_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,        -- 'movie', 'series', etc.
  entity_id INTEGER NOT NULL,        -- FK to movies, series, etc.
  file_path TEXT UNIQUE NOT NULL,    -- /data/cache/images/movie/123/{uuid}.jpg
  file_name TEXT NOT NULL,           -- {uuid}.jpg
  file_size INTEGER NOT NULL,
  file_hash TEXT,                    -- SHA256 for integrity verification
  perceptual_hash TEXT,              -- pHash for visual similarity (images only)
  image_type TEXT NOT NULL,          -- 'poster', 'fanart', 'clearlogo', etc.
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  format TEXT NOT NULL,              -- 'jpeg', 'png'
  source_type TEXT,                  -- 'provider', 'local', 'user'
  source_url TEXT,                   -- Original provider URL
  provider_name TEXT,                -- 'tmdb', 'fanart.tv', etc.
  classification_score INTEGER,      -- Auto-selection score
  is_locked BOOLEAN DEFAULT 0,       -- User manual override lock
  discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_verified_at TIMESTAMP
);

CREATE TABLE library_image_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cache_file_id INTEGER NOT NULL,    -- FK to cache_image_files
  file_path TEXT UNIQUE NOT NULL,    -- /movies/The Matrix/The Matrix-poster.jpg
  published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cache_file_id) REFERENCES cache_image_files(id) ON DELETE CASCADE
);
```

### Other Asset Types

**Same pattern for**:
- `cache_video_files` / `library_video_files` - Trailers, extras
- `cache_audio_files` / `library_audio_files` - Theme songs
- `cache_text_files` / `library_text_files` - NFO files, subtitles

---

## Cache → Library Sync Workflow

### When Files Are Published

**Trigger**: User publishes entity or webhook auto-publishes

```typescript
async function publishMovieAssets(movieId: number): Promise<void> {
  // 1. Get cache images for this movie
  const cacheImages = await db.query(`
    SELECT * FROM cache_image_files
    WHERE entity_type = 'movie' AND entity_id = ?
  `, [movieId]);

  const movie = await db.getMovie(movieId);
  const libraryDir = path.dirname(movie.file_path);

  for (const cacheImage of cacheImages) {
    // 2. Determine library filename (Kodi naming convention)
    const libraryFilename = getKodiFilename(
      path.basename(movie.file_path, path.extname(movie.file_path)),
      cacheImage.image_type // 'poster' → '-poster.jpg'
    );

    const libraryPath = path.join(libraryDir, libraryFilename);

    // 3. Copy cache → library
    await fs.copyFile(cacheImage.file_path, libraryPath);

    // 4. Calculate SHA256 of library file
    const librarySHA256 = await calculateSHA256(libraryPath);

    // 5. Insert/update library_image_files record
    await db.execute(`
      INSERT INTO library_image_files (cache_file_id, file_path, published_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(file_path) DO UPDATE SET
        cache_file_id = excluded.cache_file_id,
        published_at = CURRENT_TIMESTAMP
    `, [cacheImage.id, libraryPath]);

    // 6. Update cache record with SHA256 (for future verification)
    await db.execute(`
      UPDATE cache_image_files
      SET file_hash = ?, last_verified_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [librarySHA256, cacheImage.id]);
  }
}
```

### When SHA256 Mismatch Detected

**Trigger**: Library scan detects modified/corrupted files

```typescript
async function verifyLibraryFile(
  libraryFileId: number
): Promise<{ status: 'ok' | 'mismatch'; action?: string }> {
  // 1. Get library file and linked cache file
  const libraryFile = await db.query(`
    SELECT lif.*, cif.file_hash as expected_hash, cif.file_path as cache_path
    FROM library_image_files lif
    INNER JOIN cache_image_files cif ON lif.cache_file_id = cif.id
    WHERE lif.id = ?
  `, [libraryFileId]);

  const { file_path, expected_hash, cache_path } = libraryFile[0];

  // 2. Recalculate SHA256 of library file
  const actualHash = await calculateSHA256(file_path);

  // 3. Compare
  if (actualHash === expected_hash) {
    return { status: 'ok' };
  }

  // 4. Mismatch detected → Restore from cache
  logger.warn('SHA256 mismatch detected, restoring from cache', {
    libraryPath: file_path,
    expected: expected_hash,
    actual: actualHash
  });

  await fs.copyFile(cache_path, file_path);

  return {
    status: 'mismatch',
    action: 'restored_from_cache'
  };
}
```

---

## Garbage Collection

**Status**: 📋 **[Planned - Post-v1.0]**

### Two-Method Strategy

**1. Orphan Cleanup** (Daily Worker)
- Detects cache assets with no database references
- Deletes immediately (unreferenced = safe to remove)
- Prevents cache bloat from failed operations

**2. Soft Delete** (Retention Period)
- Assets marked `deleted=true` in database
- Retained for N days (configurable, default: 30)
- Hard delete file + remove DB reference after retention
- Allows recovery from accidental deletions

### Implementation Notes

**Database Schema** (Planned):
```sql
ALTER TABLE cache_image_files ADD COLUMN deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE cache_image_files ADD COLUMN deleted_at TIMESTAMP;
```

**Worker Pseudocode**:
```typescript
// Daily job
async runGarbageCollector() {
  // Method 1: Orphan cleanup
  const orphans = await findUnreferencedCacheAssets();
  await deleteFiles(orphans);

  // Method 2: Soft delete expiration
  const expired = await findExpiredSoftDeletes();
  await deleteFiles(expired);
  await removeDbReferences(expired);
}
```

**Configuration**:
- `CACHE_SOFT_DELETE_RETENTION_DAYS` (default: 30)
- `CACHE_GC_SCHEDULE` (default: daily at 3 AM)

---

## Directory Structure

### Cache Storage

```
data/cache/
├── images/
│   ├── movie/
│   │   ├── 123/
│   │   │   ├── a1b2c3d4-e5f6-7890-abcd-ef1234567890.jpg  (poster)
│   │   │   ├── f9e8d7c6-b5a4-3210-9876-543210fedcba.jpg  (fanart)
│   │   │   └── ...
│   │   └── 456/
│   │       └── ...
│   ├── series/
│   │   └── ...
│   └── actor/
│       └── ...
├── videos/
│   ├── movie/
│   │   └── 123/
│   │       └── trailer-uuid.mp4
│   └── ...
├── audio/
│   └── series/
│       └── 789/
│           └── theme-uuid.mp3
└── text/
    └── movie/
        └── 123/
            └── nfo-uuid.xml
```

### Library Storage (Published)

```
/movies/
├── The Matrix (1999)/
│   ├── The Matrix.mkv               (media file - not managed by Metarr)
│   ├── The Matrix-poster.jpg        (published from cache)
│   ├── The Matrix-fanart.jpg        (published from cache)
│   ├── The Matrix-clearlogo.png     (published from cache)
│   ├── The Matrix.nfo               (published from cache)
│   └── The Matrix-trailer.mp4       (published from cache)
└── ...
```

---

## Code References

### Services

- **Asset Discovery**: `src/services/media/assetDiscovery_unified.ts`
- **Asset Selection**: `src/services/assetSelectionService.ts`
- **Provider Asset Fetching**: `src/services/providerAssetService.ts`
- **Publishing**: (To be implemented in publish service)

### Migration

- **Schema Definition**: `src/database/migrations/20251015_001_clean_schema.ts`

### Types

- **Database Models**: `src/types/database.ts` (if defined)

---

## Implementation Status

- ✅ **[Implemented]** - Split cache/library table schema
- ✅ **[Implemented]** - UUID-based asset naming
- ✅ **[Implemented]** - SHA256 hash storage for integrity verification
- ✅ **[Implemented]** - Perceptual hash storage (schema ready)
- 📋 **[Planned]** - Perceptual hash deduplication logic
- 📋 **[Planned]** - SHA256 verification during library scan
- 📋 **[Planned]** - Automatic garbage collection
- 📋 **[Planned]** - Cache restoration on mismatch detection

---

## Related Documentation

- [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) - Complete schema reference
- [WORKFLOWS.md](WORKFLOWS.md) - Asset workflow diagrams
- [UNIFIED_FILE_SYSTEM.md](UNIFIED_FILE_SYSTEM.md) - Historical design (superseded)

---

**Last Updated**: 2025-10-21
**Next Review**: After implementing perceptual hash deduplication
