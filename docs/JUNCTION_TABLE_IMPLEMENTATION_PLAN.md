# Junction Table Implementation Plan

## Context
User wants proper CASCADE deletion behavior for libraries. Current polymorphic design (`entity_type`, `entity_id` without FK constraints) prevents automatic CASCADE and causes orphaned records.

## Decision
Implement industry-standard junction tables with proper FK constraints for proper CASCADE behavior.

## Current Status
- ✅ Design documented in `JUNCTION_TABLE_REDESIGN.md`
- ⏳ Ready to implement in base migration
- ⏳ Need to update all service queries

## Implementation Steps

### Phase 1: Database Schema (Migration File)

**File**: `src/database/migrations/20251015_001_clean_schema.ts`

#### 1.1 Update Core File Tables (Remove Polymorphic Fields)

```typescript
// BEFORE: video_files
entity_type TEXT NOT NULL CHECK(entity_type IN ('movie', 'episode')),
entity_id INTEGER NOT NULL,
// ... other fields ...
video_type TEXT NOT NULL CHECK(video_type IN ('main', 'trailer', 'sample', 'extra')),
location TEXT NOT NULL CHECK(location IN ('library', 'cache')),

// AFTER: video_files (just file metadata)
file_path TEXT NOT NULL UNIQUE,
file_name TEXT NOT NULL,
file_size INTEGER NOT NULL,
file_hash TEXT,
codec TEXT,
width INTEGER,
height INTEGER,
duration_seconds INTEGER,
// ... NO entity_type, entity_id, video_type, or location
```

Do the same for:
- `image_files` - Remove `entity_type`, `entity_id`, `image_type`, `location`, `is_published`
- `text_files` - Remove `entity_type`, `entity_id`, `text_type`, `location`
- `audio_files` - Remove `entity_type`, `entity_id`, `audio_type`, `location`

#### 1.2 Create Junction Tables

Add after the core file tables:

```typescript
// Movie-Image Junction
await db.execute(`
  CREATE TABLE movie_image_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    movie_id INTEGER NOT NULL,
    image_file_id INTEGER NOT NULL,
    image_type TEXT NOT NULL CHECK(image_type IN (
      'poster', 'fanart', 'banner', 'clearlogo', 'clearart', 'discart',
      'landscape', 'keyart', 'thumb', 'unknown'
    )),
    location TEXT NOT NULL CHECK(location IN ('library', 'cache')),
    is_published BOOLEAN DEFAULT 0,
    is_selected BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
    FOREIGN KEY (image_file_id) REFERENCES image_files(id) ON DELETE CASCADE,
    UNIQUE(movie_id, image_file_id, location)
  )
`);

await db.execute('CREATE INDEX idx_movie_images_movie ON movie_image_files(movie_id)');
await db.execute('CREATE INDEX idx_movie_images_file ON movie_image_files(image_file_id)');
await db.execute('CREATE INDEX idx_movie_images_type ON movie_image_files(image_type)');
await db.execute('CREATE INDEX idx_movie_images_selected ON movie_image_files(is_selected) WHERE is_selected = 1');
```

Create similar tables for:
- `movie_video_files` (trailers)
- `movie_text_files` (NFO, subtitles)
- `movie_audio_files` (themes)
- `series_image_files`
- `episode_image_files`
- `episode_video_files`
- `episode_text_files`
- `actor_image_files`

#### 1.3 Update Movies Table

**REMOVE** these columns (lines 210-219):
```typescript
poster_id INTEGER,
fanart_id INTEGER,
logo_id INTEGER,
clearlogo_id INTEGER,
clearart_id INTEGER,
banner_id INTEGER,
thumb_id INTEGER,
discart_id INTEGER,
keyart_id INTEGER,
landscape_id INTEGER,
```

**REMOVE** their FK constraints (lines 239-248):
```typescript
FOREIGN KEY (poster_id) REFERENCES image_files(id),
// ... etc
```

**KEEP** the locking columns:
```typescript
poster_locked BOOLEAN DEFAULT 0,
fanart_locked BOOLEAN DEFAULT 0,
// ... etc
```

### Phase 2: Service Layer Updates

#### 2.1 Asset Discovery Service

**File**: `src/services/media/assetDiscovery_unified.ts`

**OLD Insert Pattern**:
```typescript
await insertImageFile(db, {
  entityType: 'movie',
  entityId: movieId,
  filePath,
  fileName,
  fileSize,
  fileHash,
  location: 'library',
  imageType: 'poster',
  width, height, format,
  sourceType: 'local'
});
```

**NEW Insert Pattern**:
```typescript
// Step 1: Insert file metadata (if not exists)
const imageFileId = await insertImageFile(db, {
  filePath,
  fileName,
  fileSize,
  fileHash,
  width, height, format,
  sourceType: 'local'
});

// Step 2: Link to movie via junction table
await insertMovieImageFile(db, {
  movieId,
  imageFileId,
  imageType: 'poster',
  location: 'library',
  isPublished: false,
  isSelected: true
});
```

#### 2.2 Movie Service

**File**: `src/services/movieService.ts`

**OLD getAll Query** (lines 96-176):
```typescript
SELECT m.*, i.file_path as poster_path
FROM movies m
LEFT JOIN image_files i ON m.poster_id = i.id
```

**NEW getAll Query**:
```typescript
SELECT m.*, i.file_path as poster_path
FROM movies m
LEFT JOIN movie_image_files mif ON m.id = mif.movie_id
  AND mif.image_type = 'poster'
  AND mif.is_selected = 1
LEFT JOIN image_files i ON mif.image_file_id = i.id
```

**OLD getAllFiles Query** (lines 1622-1672):
```typescript
SELECT * FROM image_files
WHERE entity_type = 'movie' AND entity_id = ?
```

**NEW getAllFiles Query**:
```typescript
SELECT i.*, mif.image_type, mif.location, mif.is_published
FROM movie_image_files mif
INNER JOIN image_files i ON mif.image_file_id = i.id
WHERE mif.movie_id = ?
```

#### 2.3 Library Service

**File**: `src/services/libraryService.ts`

**SIMPLIFY deletion** (lines 173-198):

```typescript
// OLD: Complex 4-step process
await this.deleteCachedPhysicalFiles(db, id);
await this.deleteFileRecordsForLibrary(db, id);
await db.execute('DELETE FROM libraries WHERE id = ?', [id]);
await this.cleanupOrphanedEntities(db);

// NEW: Simple 2-step process
await db.execute('DELETE FROM libraries WHERE id = ?', [id]);
// CASCADE handles: libraries → movies → movie_image_files → (orphaned image_files)
await this.cleanupOrphanedEntities(db);
```

Optionally add orphaned file cleanup:
```typescript
// Clean up image_files that are no longer referenced
await db.execute(`
  DELETE FROM image_files
  WHERE id NOT IN (
    SELECT DISTINCT image_file_id FROM movie_image_files
    UNION
    SELECT DISTINCT image_file_id FROM series_image_files
    UNION
    SELECT DISTINCT image_file_id FROM episode_image_files
    UNION
    SELECT DISTINCT image_file_id FROM actor_image_files
  )
`);
```

### Phase 3: Type Definitions

**Files**: `src/types/*.ts`, `src/services/files/*.ts`

Update interfaces:
- Remove `entity_type`, `entity_id` from `ImageFileRecord`, `VideoFileRecord`, etc.
- Add junction table interfaces: `MovieImageFileRecord`, etc.

### Phase 4: Testing

1. **Restart server** → Database recreated with new schema
2. **Add library** → Scan discovers movies
3. **Check junction tables** → `SELECT * FROM movie_image_files`
4. **Delete library** → Verify CASCADE works, no orphaned records

## Estimated Effort

- Phase 1 (Schema): 1 hour
- Phase 2 (Services): 2 hours
- Phase 3 (Types): 30 minutes
- Phase 4 (Testing): 30 minutes

**Total**: ~4 hours

## Files That Need Changes

### Critical (Must Update):
1. `src/database/migrations/20251015_001_clean_schema.ts` - Schema redesign
2. `src/services/media/assetDiscovery_unified.ts` - File discovery/insertion
3. `src/services/movieService.ts` - All movie queries
4. `src/services/libraryService.ts` - Library deletion
5. `src/services/files/imageCacheFunctions.ts` - Insert functions
6. `src/services/files/videoTextAudioCacheFunctions.ts` - Insert functions

### Important (Should Update):
7. `src/services/nfoDiscovery.ts` - NFO tracking
8. `src/services/imageService.ts` - Image operations
9. `src/types/database.ts` - Type definitions

### Nice to Have:
10. Frontend API types (if affected)
11. Documentation

## Next Session Tasks

1. Start with Phase 1 - update base migration
2. Create helper functions for junction table inserts
3. Update assetDiscovery service
4. Update movieService queries one by one
5. Test thoroughly

## Notes

- Since user deletes DB on restart, no data migration needed
- All changes in base migration for clean deploys
- Focus on movies first, then series/episodes
- Keep old column names in comments for reference during transition
