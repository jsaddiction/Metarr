# ⚠️ [SUPERSEDED - NEVER IMPLEMENTED]

This document describes a unified asset storage architecture that was **never implemented**.

**Current Implementation**: See [ASSET_STORAGE_ARCHITECTURE.md](ASSET_STORAGE_ARCHITECTURE.md) for the actual split cache/library architecture.

**Status**: Kept for historical reference only.

**Why it was rejected**:
- Location-based architecture (library vs cache in same table) proved less clear than split tables
- Decided to use UUID-based naming instead of content-addressing for file collision prevention
- Split tables provide clearer separation of concerns (cache = source of truth, library = ephemeral published copies)

---

# Unified File System Architecture (Historical Design)

**Last Updated**: 2025-10-16
**Status**: ~~Design Complete - Implementation Pending~~ **REJECTED**

---

## Overview

The Unified File System replaces the dual `cache_assets` + type-specific file tracking approach with a single, coherent system where **all files are tracked in type-specific tables with a `location` column** indicating whether they reside in the library or cache.

### **Core Principle**

> **One table per file type, tracking both library and cache locations with explicit relationships.**

---

## Architecture Changes

### **Before: Dual System (OLD)**

```
┌─────────────────┐
│  cache_assets   │ ← Generic cache storage
│  (abstract)     │
└────────┬────────┘
         │
         │ FK references
         ├─────────────┐
         │             │
    ┌────▼────┐   ┌───▼────┐
    │ movies  │   │ actors │
    │ FK cols │   │ FK col │
    └─────────┘   └────────┘

❌ No tracking of library files
❌ Cache is abstraction layer
❌ Complex FK chains
❌ No hash comparison (lib vs cache)
```

### **After: Unified System (NEW)**

```
┌───────────────────────────────────────┐
│         image_files                   │
│  ┌──────────────┬──────────────┐      │
│  │ Library Rows │  Cache Rows  │      │
│  │ location='l' │ location='c' │      │
│  └──────────────┴──────────────┘      │
│   Cross-linked via library_file_id    │
│            & cache_file_id            │
└───────────────┬───────────────────────┘
                │
           ┌────▼────┐
           │ movies  │
           │ FK cols │ ← Point directly to image_files.id (cache row)
           └─────────┘

✅ Library + cache in same table
✅ Direct FK relationships
✅ Easy hash comparison
✅ Natural deduplication
```

---

## Database Schema Changes

### **1. New Unified File Tables**

#### **A. Image Files** (replaces cache_assets for images)

```sql
CREATE TABLE image_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('movie', 'episode', 'series', 'season', 'actor')),
  entity_id INTEGER NOT NULL,

  -- File basics
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_hash TEXT NOT NULL,
  perceptual_hash TEXT,

  -- Location tracking (KEY CHANGE)
  location TEXT NOT NULL CHECK(location IN ('library', 'cache')),

  -- Image classification
  image_type TEXT NOT NULL CHECK(image_type IN (
    'poster', 'fanart', 'banner', 'clearlogo', 'clearart', 'discart',
    'landscape', 'keyart', 'thumb', 'actor_thumb', 'unknown'
  )),

  -- Image metadata
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  format TEXT NOT NULL,

  -- Provider tracking (NEW - from old cache_assets)
  source_type TEXT CHECK(source_type IN ('provider', 'local', 'user')),
  source_url TEXT,
  provider_name TEXT,

  -- Classification scoring
  classification_score INTEGER,

  -- Relationship tracking
  is_published BOOLEAN DEFAULT 0,
  library_file_id INTEGER,
  cache_file_id INTEGER,

  -- Reference counting (for cache cleanup)
  reference_count INTEGER DEFAULT 0,

  discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (library_file_id) REFERENCES image_files(id) ON DELETE SET NULL,
  FOREIGN KEY (cache_file_id) REFERENCES image_files(id) ON DELETE SET NULL
);

CREATE INDEX idx_image_files_entity ON image_files(entity_type, entity_id);
CREATE INDEX idx_image_files_type ON image_files(image_type);
CREATE INDEX idx_image_files_hash ON image_files(file_hash);
CREATE INDEX idx_image_files_location ON image_files(location);
CREATE INDEX idx_image_files_published ON image_files(is_published);
```

#### **B. Video Files** (includes main movie, trailers, samples, extras)

```sql
CREATE TABLE video_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('movie', 'episode')),
  entity_id INTEGER NOT NULL,

  -- File basics
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_hash TEXT,

  -- Location tracking
  location TEXT NOT NULL CHECK(location IN ('library', 'cache')),

  -- Video classification
  video_type TEXT NOT NULL CHECK(video_type IN ('main', 'trailer', 'sample', 'extra')),

  -- Video metadata (from FFprobe)
  codec TEXT,
  width INTEGER,
  height INTEGER,
  duration_seconds INTEGER,
  bitrate INTEGER,
  framerate REAL,
  hdr_type TEXT,

  -- Audio metadata (primary track)
  audio_codec TEXT,
  audio_channels INTEGER,
  audio_language TEXT,

  -- Provider tracking
  source_type TEXT CHECK(source_type IN ('provider', 'local', 'user')),
  source_url TEXT,
  provider_name TEXT,

  -- Classification scoring
  classification_score INTEGER,

  -- Relationship tracking
  library_file_id INTEGER,
  cache_file_id INTEGER,
  reference_count INTEGER DEFAULT 0,

  discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (library_file_id) REFERENCES video_files(id) ON DELETE SET NULL,
  FOREIGN KEY (cache_file_id) REFERENCES video_files(id) ON DELETE SET NULL
);

CREATE INDEX idx_video_files_entity ON video_files(entity_type, entity_id);
CREATE INDEX idx_video_files_type ON video_files(video_type);
CREATE INDEX idx_video_files_location ON video_files(location);
CREATE INDEX idx_video_files_hash ON video_files(file_hash);
```

#### **C. Audio Files** (theme songs)

```sql
CREATE TABLE audio_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('movie', 'series')),
  entity_id INTEGER NOT NULL,

  -- File basics
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_hash TEXT,

  -- Location tracking
  location TEXT NOT NULL CHECK(location IN ('library', 'cache')),

  -- Audio classification
  audio_type TEXT NOT NULL CHECK(audio_type IN ('theme', 'unknown')),

  -- Audio metadata
  codec TEXT,
  duration_seconds INTEGER,
  bitrate INTEGER,

  -- Provider tracking
  source_type TEXT CHECK(source_type IN ('provider', 'local', 'user')),
  source_url TEXT,
  provider_name TEXT,

  -- Classification scoring
  classification_score INTEGER,

  -- Relationship tracking
  library_file_id INTEGER,
  cache_file_id INTEGER,
  reference_count INTEGER DEFAULT 0,

  discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (library_file_id) REFERENCES audio_files(id) ON DELETE SET NULL,
  FOREIGN KEY (cache_file_id) REFERENCES audio_files(id) ON DELETE SET NULL
);

CREATE INDEX idx_audio_files_entity ON audio_files(entity_type, entity_id);
CREATE INDEX idx_audio_files_location ON audio_files(location);
```

#### **D. Text Files** (NFO, subtitles)

```sql
CREATE TABLE text_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('movie', 'episode')),
  entity_id INTEGER NOT NULL,

  -- File basics
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_hash TEXT,

  -- Location tracking
  location TEXT NOT NULL CHECK(location IN ('library', 'cache')),

  -- Text classification
  text_type TEXT NOT NULL CHECK(text_type IN ('nfo', 'subtitle')),

  -- Subtitle metadata
  subtitle_language TEXT,
  subtitle_format TEXT,

  -- NFO metadata
  nfo_is_valid BOOLEAN,
  nfo_has_tmdb_id BOOLEAN,
  nfo_needs_regen BOOLEAN DEFAULT 0,

  -- Provider tracking
  source_type TEXT CHECK(source_type IN ('provider', 'local', 'user')),
  source_url TEXT,

  -- Relationship tracking
  library_file_id INTEGER,
  cache_file_id INTEGER,
  reference_count INTEGER DEFAULT 0,

  discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (library_file_id) REFERENCES text_files(id) ON DELETE SET NULL,
  FOREIGN KEY (cache_file_id) REFERENCES text_files(id) ON DELETE SET NULL
);

CREATE INDEX idx_text_files_entity ON text_files(entity_type, entity_id);
CREATE INDEX idx_text_files_type ON text_files(text_type);
CREATE INDEX idx_text_files_location ON text_files(location);
CREATE INDEX idx_text_files_nfo_regen ON text_files(nfo_needs_regen);
```

#### **E. Unknown Files** (minimal tracking for deletion UI)

```sql
CREATE TABLE unknown_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('movie', 'episode')),
  entity_id INTEGER NOT NULL,

  -- Minimal tracking
  file_path TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  extension TEXT NOT NULL,

  discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (entity_id) REFERENCES movies(id) ON DELETE CASCADE
);

CREATE INDEX idx_unknown_files_entity ON unknown_files(entity_type, entity_id);
CREATE INDEX idx_unknown_files_extension ON unknown_files(extension);
```

---

### **2. Movies Table Changes**

**REMOVE these FK constraints:**

```sql
-- OLD (pointing to cache_assets)
FOREIGN KEY (poster_id) REFERENCES cache_assets(id),
FOREIGN KEY (fanart_id) REFERENCES cache_assets(id),
-- ... etc
```

**REPLACE with:**

```sql
-- NEW (pointing to image_files - cache location rows)
FOREIGN KEY (poster_id) REFERENCES image_files(id),
FOREIGN KEY (fanart_id) REFERENCES image_files(id),
FOREIGN KEY (logo_id) REFERENCES image_files(id),
FOREIGN KEY (clearart_id) REFERENCES image_files(id),
FOREIGN KEY (banner_id) REFERENCES image_files(id),
FOREIGN KEY (thumb_id) REFERENCES image_files(id),
FOREIGN KEY (discart_id) REFERENCES image_files(id),
FOREIGN KEY (keyart_id) REFERENCES image_files(id),
FOREIGN KEY (landscape_id) REFERENCES image_files(id)
```

**Convention**: `movies.poster_id` always points to the **cache row** in `image_files` (where `location='cache'`).

---

### **3. Other Table Changes**

#### **Actors Table**

```sql
-- Change FK
FOREIGN KEY (thumb_id) REFERENCES image_files(id)  -- was cache_assets(id)
```

#### **Remove These Tables**

- ❌ `cache_assets` - functionality absorbed into type-specific tables
- ❌ `asset_references` - redundant (direct FK relationships now)
- ❌ `trailers` - merged into `video_files` with `video_type='trailer'`

---

## Workflow Examples

### **Example 1: Discover Poster in Library**

```typescript
// 1. Scan finds: /movies/Matrix/Matrix-poster.jpg
const filePath = '/movies/Matrix/Matrix-poster.jpg';
const fileHash = await calculateSHA256(filePath);
const metadata = await sharp(filePath).metadata();

// 2. Insert library record
const libraryResult = await db.execute(`
  INSERT INTO image_files (
    entity_type, entity_id, file_path, file_name, file_size, file_hash,
    location, image_type, width, height, format, source_type, classification_score
  ) VALUES (?, ?, ?, ?, ?, ?, 'library', 'poster', ?, ?, ?, 'local', ?)
`, ['movie', 123, filePath, 'Matrix-poster.jpg', 1500000, fileHash, 2000, 3000, 'jpeg', 95]);

const libraryFileId = libraryResult.insertId;

// 3. Check if already cached (by hash)
const existing = await db.query(`
  SELECT id FROM image_files
  WHERE file_hash = ? AND location = 'cache'
`, [fileHash]);

if (existing.length > 0) {
  // Already cached - just link
  const cacheFileId = existing[0].id;

  await db.execute(`
    UPDATE image_files SET cache_file_id = ? WHERE id = ?
  `, [cacheFileId, libraryFileId]);

  await db.execute(`
    UPDATE image_files SET reference_count = reference_count + 1 WHERE id = ?
  `, [cacheFileId]);

  await db.execute(`
    UPDATE movies SET poster_id = ? WHERE id = ?
  `, [cacheFileId, 123]);

} else {
  // New - copy to cache
  const cachePath = `/data/cache/images/${fileHash.slice(0,2)}/${fileHash.slice(2,4)}/${fileHash}.jpg`;
  await fs.copyFile(filePath, cachePath);

  const cacheResult = await db.execute(`
    INSERT INTO image_files (
      entity_type, entity_id, file_path, file_name, file_size, file_hash,
      location, image_type, width, height, format, source_type,
      is_published, library_file_id, reference_count
    ) VALUES (?, ?, ?, ?, ?, ?, 'cache', 'poster', ?, ?, ?, 'local', 1, ?, 1)
  `, ['movie', 123, cachePath, `${fileHash}.jpg`, 1500000, fileHash, 2000, 3000, 'jpeg', libraryFileId]);

  const cacheFileId = cacheResult.insertId;

  // Link library → cache
  await db.execute(`
    UPDATE image_files SET cache_file_id = ? WHERE id = ?
  `, [cacheFileId, libraryFileId]);

  // Update movie FK
  await db.execute(`
    UPDATE movies SET poster_id = ? WHERE id = ?
  `, [cacheFileId, 123]);
}
```

---

### **Example 2: Download Poster from TMDB**

```typescript
// 1. Download from provider
const imageUrl = 'https://image.tmdb.org/t/p/original/abc123.jpg';
const imageBuffer = await downloadImage(imageUrl);
const fileHash = crypto.createHash('sha256').update(imageBuffer).digest('hex');

// 2. Check if already cached
const existing = await db.query(`
  SELECT id FROM image_files WHERE file_hash = ? AND location = 'cache'
`, [fileHash]);

if (existing.length > 0) {
  // Reuse existing
  await db.execute(`UPDATE movies SET poster_id = ? WHERE id = ?`, [existing[0].id, 123]);
  await db.execute(`UPDATE image_files SET reference_count = reference_count + 1 WHERE id = ?`, [existing[0].id]);
} else {
  // Store in cache
  const cachePath = `/data/cache/images/${fileHash.slice(0,2)}/${fileHash.slice(2,4)}/${fileHash}.jpg`;
  await fs.writeFile(cachePath, imageBuffer);

  const metadata = await sharp(imageBuffer).metadata();

  const result = await db.execute(`
    INSERT INTO image_files (
      entity_type, entity_id, file_path, file_name, file_size, file_hash,
      location, image_type, width, height, format,
      source_type, source_url, provider_name,
      is_published, reference_count
    ) VALUES (?, ?, ?, ?, ?, ?, 'cache', 'poster', ?, ?, ?, 'provider', ?, 'tmdb', 1, 1)
  `, ['movie', 123, cachePath, `${fileHash}.jpg`, imageBuffer.length, fileHash,
      metadata.width, metadata.height, metadata.format, imageUrl]);

  await db.execute(`UPDATE movies SET poster_id = ? WHERE id = ?`, [result.insertId, 123]);
}
```

---

### **Example 3: Hash Mismatch Detection**

```typescript
// Check if library file matches cache
const results = await db.query(`
  SELECT
    lib.id as lib_id,
    lib.file_path as lib_path,
    lib.file_hash as lib_hash,
    cache.id as cache_id,
    cache.file_path as cache_path,
    cache.file_hash as cache_hash
  FROM image_files lib
  INNER JOIN image_files cache ON lib.cache_file_id = cache.id
  WHERE lib.entity_id = ?
    AND lib.entity_type = 'movie'
    AND lib.location = 'library'
    AND cache.location = 'cache'
    AND lib.file_hash != cache.file_hash
`, [movieId]);

if (results.length > 0) {
  // Mismatch detected - user edited library file
  console.log('⚠️ Library file modified:', results[0].lib_path);
  console.log('   Cache hash:', results[0].cache_hash);
  console.log('   Library hash:', results[0].lib_hash);

  // Decision: Recache or mark for user review?
}
```

---

## Backend Refactoring Steps

### **Phase 1: Service Layer Updates**

#### **A. Asset Discovery Service** (`assetDiscovery_flexible.ts`)

**Changes:**
1. Remove `storeImageAsset()` function (which stored in `cache_assets`)
2. Replace with `storeImageInFileTable()` that inserts into `image_files`
3. Update to track both library and cache locations
4. Return `image_files.id` instead of `cache_assets.id`

**Example:**
```typescript
// OLD
const assetId = await storeImageAsset(db, filePath, 'local');
await db.execute(`UPDATE movies SET poster_id = ? WHERE id = ?`, [assetId, movieId]);

// NEW
const libraryFileId = await insertImageFile(db, {
  entityType: 'movie',
  entityId: movieId,
  filePath,
  location: 'library',
  imageType: 'poster',
  sourceType: 'local'
});

const cacheFileId = await cacheImageFile(db, libraryFileId);
await db.execute(`UPDATE movies SET poster_id = ? WHERE id = ?`, [cacheFileId, movieId]);
```

---

#### **B. Unified Scan Service** (`unifiedScanService.ts`)

**Changes:**
1. After discovering files, insert into appropriate type-specific table
2. Track `location='library'` initially
3. Call caching functions to create `location='cache'` copies
4. Update movie FK columns with cache file IDs

**Example:**
```typescript
// Discover poster
const posterCandidate = findBestPoster(imageFiles);

// Insert library record
const libraryId = await db.execute(`
  INSERT INTO image_files (..., location) VALUES (..., 'library')
`);

// Check cache, create if needed
const cacheId = await ensureImageCached(db, libraryId.insertId);

// Update movie FK
await db.execute(`UPDATE movies SET poster_id = ? WHERE id = ?`, [cacheId, movieId]);
```

---

#### **C. NFO Parser** (`nfoParser.ts`)

**Changes:**
1. When parsing NFO, insert into `text_files` with `location='library'`
2. Set `text_type='nfo'`
3. Store validation flags (`nfo_is_valid`, `nfo_has_tmdb_id`)

---

#### **D. Provider Services** (TMDB, TVDB)

**Changes:**
1. When downloading images from providers, insert directly into `image_files` with `location='cache'`
2. Set `source_type='provider'`, `source_url`, `provider_name`
3. No library record needed for provider downloads
4. Update movie FK columns with cache file IDs

---

### **Phase 2: Database Interaction Updates**

**Update all queries that reference:**
- `cache_assets` → `image_files` (or appropriate type table)
- `asset_references` → Direct FK relationships in `movies` table
- `trailers` table → `video_files` with `video_type='trailer'`

**Example:**
```typescript
// OLD
const images = await db.query(`
  SELECT ca.* FROM cache_assets ca
  WHERE ca.id IN (
    SELECT poster_id FROM movies WHERE id = ?
  )
`, [movieId]);

// NEW
const images = await db.query(`
  SELECT * FROM image_files
  WHERE id = (SELECT poster_id FROM movies WHERE id = ?)
    AND location = 'cache'
`, [movieId]);
```

---

### **Phase 3: API Endpoint Updates**

#### **A. GET /api/movies/:id**

**Changes:**
```typescript
// OLD
const movie = await db.query(`SELECT * FROM movies WHERE id = ?`, [movieId]);
const poster = await db.query(`SELECT * FROM cache_assets WHERE id = ?`, [movie.poster_id]);

// NEW
const movie = await db.query(`SELECT * FROM movies WHERE id = ?`, [movieId]);
const poster = await db.query(`
  SELECT * FROM image_files WHERE id = ? AND location = 'cache'
`, [movie.poster_id]);
```

---

#### **B. GET /api/movies/:id/files** (NEW)

```typescript
router.get('/movies/:id/files', async (req, res) => {
  const movieId = parseInt(req.params.id);

  const [videoFiles, imageFiles, audioFiles, textFiles, unknownFiles] = await Promise.all([
    db.query(`SELECT * FROM video_files WHERE entity_type = 'movie' AND entity_id = ?`, [movieId]),
    db.query(`SELECT * FROM image_files WHERE entity_type = 'movie' AND entity_id = ?`, [movieId]),
    db.query(`SELECT * FROM audio_files WHERE entity_type = 'movie' AND entity_id = ?`, [movieId]),
    db.query(`SELECT * FROM text_files WHERE entity_type = 'movie' AND entity_id = ?`, [movieId]),
    db.query(`SELECT * FROM unknown_files WHERE entity_type = 'movie' AND entity_id = ?`, [movieId])
  ]);

  res.json({
    videoFiles,
    imageFiles,
    audioFiles,
    textFiles,
    unknownFiles,
    summary: {
      totalFiles: videoFiles.length + imageFiles.length + audioFiles.length + textFiles.length + unknownFiles.length,
      hasNFO: textFiles.some(f => f.text_type === 'nfo'),
      hasMainVideo: videoFiles.some(f => f.video_type === 'main'),
    }
  });
});
```

---

## Frontend Refactoring Steps

### **Phase 1: Update Type Definitions**

**Create new types** (`src/types/files.ts`):

```typescript
export interface ImageFile {
  id: number;
  entityType: string;
  entityId: number;
  filePath: string;
  fileName: string;
  fileSize: number;
  fileHash: string;
  perceptualHash?: string;
  location: 'library' | 'cache';
  imageType: 'poster' | 'fanart' | 'banner' | 'clearlogo' | 'clearart' | 'discart' | 'landscape' | 'keyart' | 'thumb' | 'unknown';
  width: number;
  height: number;
  format: string;
  sourceType?: 'provider' | 'local' | 'user';
  sourceUrl?: string;
  providerName?: string;
  classificationScore?: number;
  isPublished: boolean;
  referenceCount: number;
}

export interface VideoFile {
  id: number;
  entityType: string;
  entityId: number;
  filePath: string;
  fileName: string;
  fileSize: number;
  fileHash?: string;
  location: 'library' | 'cache';
  videoType: 'main' | 'trailer' | 'sample' | 'extra';
  codec?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  hdrType?: string;
  audioCodec?: string;
  audioChannels?: number;
  audioLanguage?: string;
  classificationScore?: number;
}

export interface TextField {
  id: number;
  entityType: string;
  entityId: number;
  filePath: string;
  fileName: string;
  fileSize: number;
  fileHash?: string;
  location: 'library' | 'cache';
  textType: 'nfo' | 'subtitle';
  subtitleLanguage?: string;
  subtitleFormat?: string;
  nfoIsValid?: boolean;
  nfoHasTmdbId?: boolean;
  nfoNeedsRegen?: boolean;
}
```

---

### **Phase 2: Create File Browser Components**

**A. FileBrowser Component** (`components/movie/FileBrowser.tsx`)

- Displays all files in tabs: Video, Images, Text, Audio, Unknown
- Shows location badge (Library/Cache)
- Displays file metadata (codec, dimensions, etc.)
- Filter by location

---

**B. UnknownFilesManager Component** (`components/movie/UnknownFilesManager.tsx`)

- Table view with checkboxes
- Bulk delete functionality
- Filter by extension
- Sort by size

---

**C. NFO Indicator Component** (`components/movie/NFOIndicator.tsx`)

- Shows green checkmark if NFO exists
- Red X if missing or invalid
- Warning icon if needs regeneration
- Clicking opens NFO viewer/editor

---

### **Phase 3: Update Existing Components**

**A. MovieTableView** (`components/movie/MovieTableView.tsx`)

**Changes:**
1. Add NFO icon column (uses `TextField` with `text_type='nfo'`)
2. Fetch NFO status from `/api/movies/:id/files`
3. Cache with TanStack Query

```typescript
const { data: filesData } = useQuery(['movieFiles', movie.id], async () => {
  const res = await fetch(`/api/movies/${movie.id}/files`);
  return res.json();
});

const hasNFO = filesData?.summary.hasNFO;
```

---

**B. MovieDetail Component** (`components/movie/MovieDetail.tsx`)

**Add new tabs:**
```tsx
<Tabs>
  <Tab label="Overview">{/* existing */}</Tab>
  <Tab label="Files"><FileBrowser movieId={movieId} /></Tab>
  <Tab label="Cast & Crew">{/* existing */}</Tab>
  <Tab label="Images">{/* existing asset browser */}</Tab>
  <Tab label="Extras">{/* existing */}</Tab>
  <Tab label="Metadata">{/* existing */}</Tab>
</Tabs>
```

---

## Migration Strategy

### **Step 1: Update Migration File**

Modify `/src/database/migrations/20251015_001_clean_schema.ts`:

1. Remove `cache_assets` table creation
2. Remove `asset_references` table creation
3. Remove `trailers` table creation
4. Add new file tables (`video_files`, `image_files`, `audio_files`, `text_files`)
5. Update `movies` table FKs to point to `image_files`
6. Update `actors` table FK to point to `image_files`

---

### **Step 2: Data Migration** (if needed)

If database already has data in `cache_assets`:

```sql
-- Convert cache_assets → image_files
INSERT INTO image_files (
  entity_type, entity_id, file_path, file_name, file_size, file_hash,
  location, image_type, width, height, format,
  source_type, source_url, provider_name, reference_count
)
SELECT
  'movie' as entity_type,
  -- Derive entity_id from movie FK columns (complex query needed)
  0 as entity_id,
  file_path,
  substr(file_path, instr(file_path, '/') + 1) as file_name,
  file_size,
  content_hash as file_hash,
  'cache' as location,
  'unknown' as image_type,
  width,
  height,
  substr(mime_type, instr(mime_type, '/') + 1) as format,
  source_type,
  source_url,
  provider_name,
  reference_count
FROM cache_assets
WHERE mime_type LIKE 'image/%';
```

**Note**: This is complex - easier to **drop and recreate database** for development.

---

### **Step 3: Backend Service Updates**

1. Update `assetDiscovery_flexible.ts`
2. Update `unifiedScanService.ts`
3. Update `nfoParser.ts`
4. Update provider services (TMDB, TVDB)
5. Update all API endpoints

---

### **Step 4: Frontend Updates**

1. Create new file type definitions
2. Create FileBrowser component
3. Create UnknownFilesManager component
4. Update MovieTableView with NFO icon
5. Update MovieDetail with Files tab

---

## Testing Strategy

### **Unit Tests**

1. Test file classification scoring
2. Test library → cache copying
3. Test hash-based deduplication
4. Test reference counting

### **Integration Tests**

1. Scan movie directory → verify all files tracked
2. Download from provider → verify cache storage
3. Duplicate poster across movies → verify single cache entry
4. Delete movie → verify cache cleanup (if ref_count = 0)

---

## Benefits Summary

✅ **Simplicity**: One system for all files
✅ **Clarity**: Location column makes it obvious where files are
✅ **Performance**: No FK chasing, direct queries
✅ **Deduplication**: Hash-based, works naturally
✅ **Flexibility**: Easy to add new file types
✅ **Debugging**: Clear audit trail (library → cache)
✅ **Provider Tracking**: Full history of where files came from

---

## Next Steps

1. ✅ Update clean schema migration (this document)
2. ⏳ Implement backend service refactoring
3. ⏳ Create API endpoints for file management
4. ⏳ Build frontend FileBrowser component
5. ⏳ Update MovieTableView with NFO indicator
6. ⏳ Test end-to-end file discovery → caching → display

---

**End of Document**
