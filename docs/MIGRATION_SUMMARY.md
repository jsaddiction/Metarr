# Unified File System Migration Summary

**Date**: 2025-10-16
**Status**: ✅ Database Schema Complete - Backend/Frontend Refactoring Pending

---

## What Was Changed

### **Database Schema Changes**

#### **1. Removed Tables**
- ❌ `cache_assets` - Replaced by type-specific file tables with location column
- ❌ `asset_references` - Redundant (direct FK relationships now)
- ❌ `trailers` - Merged into `video_files` with `video_type='trailer'`

#### **2. Added Tables**

**A. `video_files`** - Tracks all video files (main, trailers, samples, extras)
- Columns: `location`, `video_type`, codec, resolution, duration, HDR, audio, `source_url`, `provider_name`
- Self-referencing FKs: `library_file_id`, `cache_file_id`
- Supports both library and cache locations

**B. `image_files`** - Tracks all images (posters, fanart, logos, actor thumbs, etc.)
- Columns: `location`, `image_type`, dimensions, format, `source_url`, `provider_name`, `perceptual_hash`
- Self-referencing FKs: `library_file_id`, `cache_file_id`
- Includes `is_published` flag

**C. `audio_files`** - Tracks audio files (theme songs)
- Columns: `location`, `audio_type`, codec, duration, bitrate
- Self-referencing FKs: `library_file_id`, `cache_file_id`

**D. `text_files`** - Tracks text files (NFO, subtitles)
- Columns: `location`, `text_type`, subtitle metadata, NFO validation flags
- Self-referencing FKs: `library_file_id`, `cache_file_id`
- NFO-specific: `nfo_is_valid`, `nfo_has_tmdb_id`, `nfo_needs_regen`

**E. `unknown_files`** - Minimal tracking for deletion UI
- Columns: `file_path`, `file_name`, `file_size`, `extension`
- No hashing, no categorization - just for bulk deletion

#### **3. Updated Foreign Keys**

All tables that referenced `cache_assets` now reference type-specific tables:

| Table | Old FK Target | New FK Target |
|-------|---------------|---------------|
| `movies.poster_id` | `cache_assets` | `image_files` |
| `movies.fanart_id` | `cache_assets` | `image_files` |
| `movies.logo_id` | `cache_assets` | `image_files` |
| `movies.clearart_id` | `cache_assets` | `image_files` |
| `movies.banner_id` | `cache_assets` | `image_files` |
| `movies.thumb_id` | `cache_assets` | `image_files` |
| `movies.discart_id` | `cache_assets` | `image_files` |
| `movies.keyart_id` | `cache_assets` | `image_files` |
| `movies.landscape_id` | `cache_assets` | `image_files` |
| `series.*_id` | `cache_assets` | `image_files` |
| `seasons.*_id` | `cache_assets` | `image_files` |
| `episodes.thumb_id` | `cache_assets` | `image_files` |
| `actors.thumb_id` | `cache_assets` | `image_files` |
| `crew.thumb_id` | `cache_assets` | `image_files` |
| `artists.*_id` | `cache_assets` | `image_files` |
| `albums.thumb_id` | `cache_assets` | `image_files` |
| `movie_collections.*_id` | `cache_assets` | `image_files` |
| `subtitle_streams.cache_asset_id` | `cache_assets` | `text_files` |

---

## Key Architectural Benefits

### **1. Single Source of Truth**
- All files (library + cache) in one table per type
- No confusion about "where is this file?"
- Clear lifecycle: library → cache (just update `location`)

### **2. Simplified Queries**
```sql
-- OLD (complex join)
SELECT ca.* FROM cache_assets ca
WHERE ca.id IN (SELECT poster_id FROM movies WHERE id = 123);

-- NEW (direct)
SELECT * FROM image_files
WHERE id = (SELECT poster_id FROM movies WHERE id = 123)
  AND location = 'cache';
```

### **3. Hash-Based Deduplication**
```sql
-- Check if image already cached
SELECT id FROM image_files
WHERE file_hash = 'abc123...' AND location = 'cache';
```

### **4. Library ↔ Cache Relationship Tracking**
```sql
-- Find mismatches
SELECT lib.file_hash as lib_hash, cache.file_hash as cache_hash
FROM image_files lib
INNER JOIN image_files cache ON lib.cache_file_id = cache.id
WHERE lib.location = 'library'
  AND cache.location = 'cache'
  AND lib.file_hash != cache.file_hash;
```

### **5. Provider Tracking**
- `source_url` - Original URL from TMDB/TVDB
- `provider_name` - Which provider (tmdb, tvdb, fanart.tv)
- `source_type` - How acquired (provider, local, user)

### **6. Reference Counting for Cleanup**
```sql
-- Delete unused cache files
DELETE FROM image_files
WHERE location = 'cache'
  AND reference_count = 0
  AND last_accessed_at < datetime('now', '-30 days');
```

---

## Migration File Location

**File**: `/src/database/migrations/20251015_001_clean_schema.ts`

**Status**: ✅ Updated (no new migration needed - modified initial migration)

**Changes Made**:
1. Replaced `cache_assets`, `asset_references`, `trailers` sections with new file tables
2. Updated all FK constraints to point to new tables
3. Added comprehensive comments about unified file system

---

## Backend Refactoring Checklist

### **Phase 1: Core Services** 🔴 TODO

- [ ] **assetDiscovery_flexible.ts**
  - Remove `storeImageAsset()` function
  - Create `insertImageFile()` function (inserts into `image_files`)
  - Create `cacheImageFile()` function (creates cache copy)
  - Update to track both library and cache locations

- [ ] **unifiedScanService.ts**
  - Update to insert discovered files into type-specific tables
  - Set `location='library'` for discovered files
  - Call caching functions to create `location='cache'` copies
  - Update movie FK columns with cache file IDs

- [ ] **nfoParser.ts**
  - Insert NFO files into `text_files` with `text_type='nfo'`
  - Set validation flags (`nfo_is_valid`, `nfo_has_tmdb_id`)
  - Calculate `file_hash` for change detection

- [ ] **ffprobeService.ts**
  - Insert main video into `video_files` with `video_type='main'`
  - Extract metadata (codec, resolution, duration, HDR, audio)
  - No changes to `video_streams`, `audio_streams` tables (keep for detailed stream data)

### **Phase 2: Provider Services** 🔴 TODO

- [ ] **tmdbService.ts**
  - When downloading images, insert directly into `image_files` with `location='cache'`
  - Set `source_type='provider'`, `source_url`, `provider_name='tmdb'`
  - No library record needed for provider downloads
  - Check for existing cached images by hash before downloading

- [ ] **tvdbService.ts**
  - Same as TMDB service
  - Set `provider_name='tvdb'`

- [ ] **fanarttv Service**
  - Same pattern as above
  - Set `provider_name='fanart.tv'`

### **Phase 3: Database Query Updates** 🔴 TODO

- [ ] Update all queries that reference `cache_assets` to use type-specific tables
- [ ] Update all queries that reference `trailers` table to use `video_files` with `video_type='trailer'`
- [ ] Update movieService.ts, seriesService.ts, etc.

**Example Updates**:
```typescript
// OLD
const poster = await db.query(`SELECT * FROM cache_assets WHERE id = ?`, [movie.poster_id]);

// NEW
const poster = await db.query(`SELECT * FROM image_files WHERE id = ? AND location = 'cache'`, [movie.poster_id]);
```

### **Phase 4: API Endpoints** 🔴 TODO

- [ ] **GET /api/movies/:id**
  - Update to query `image_files` instead of `cache_assets`
  - Include `location` in response

- [ ] **GET /api/movies/:id/files** (NEW)
  - Aggregate all file types
  - Return summary statistics
  - Support filtering by location

- [ ] **DELETE /api/movies/:id/unknown-files** (NEW)
  - Bulk delete unknown files
  - Physical file deletion + database removal

---

## Frontend Refactoring Checklist

### **Phase 1: Type Definitions** 🔴 TODO

- [ ] Create `/src/types/files.ts` with interfaces:
  - `ImageFile`
  - `VideoFile`
  - `AudioFile`
  - `TextField`
  - `UnknownFile`

### **Phase 2: New Components** 🔴 TODO

- [ ] **FileBrowser** (`components/movie/FileBrowser.tsx`)
  - Tab view: Video, Images, Text, Audio, Unknown
  - Location badges (Library/Cache)
  - File metadata display
  - Filter by location

- [ ] **UnknownFilesManager** (`components/movie/UnknownFilesManager.tsx`)
  - Table with checkboxes
  - Bulk delete functionality
  - Filter by extension
  - Sort by size

- [ ] **NFOIndicator** (`components/movie/NFOIndicator.tsx`)
  - Green checkmark if NFO exists
  - Red X if missing
  - Warning icon if needs regeneration
  - Clickable to open NFO viewer

### **Phase 3: Update Existing Components** 🔴 TODO

- [ ] **MovieTableView** (`components/movie/MovieTableView.tsx`)
  - Add NFO icon column
  - Fetch NFO status from `/api/movies/:id/files`
  - Use TanStack Query for caching

- [ ] **MovieDetail** (`components/movie/MovieDetail.tsx`)
  - Add "Files" tab with `<FileBrowser>`
  - Update tab structure

### **Phase 4: TanStack Query Hooks** 🔴 TODO

- [ ] Create `useMovieFiles(movieId)` hook
- [ ] Create `useDeleteUnknownFiles(movieId)` mutation
- [ ] Cache configuration (staleTime, cacheTime)

---

## Testing Strategy

### **Unit Tests** 🔴 TODO

- [ ] File classification scoring (Kodi naming, aspect ratio, duration)
- [ ] Hash-based deduplication logic
- [ ] Library → cache copying
- [ ] Reference counting

### **Integration Tests** 🔴 TODO

- [ ] Scan movie directory → verify all files tracked
- [ ] Download from TMDB → verify cache storage
- [ ] Duplicate poster across movies → verify single cache entry
- [ ] Delete movie → verify cache cleanup (if ref_count = 0)
- [ ] Hash mismatch detection → verify flagging

---

## Rollout Plan

### **Step 1: Database Migration** ✅ COMPLETE
- ✅ Update clean schema migration
- ✅ Remove old tables
- ✅ Add new file tables
- ✅ Update FK constraints

### **Step 2: Backend Core** 🔴 TODO (Next)
1. Update assetDiscovery service
2. Update unifiedScanService
3. Update nfoParser
4. Update ffprobeService
5. Run local tests with sample movie directory

### **Step 3: Provider Integration** 🔴 TODO
1. Update TMDB service
2. Update TVDB service
3. Test provider downloads → cache storage

### **Step 4: API Layer** 🔴 TODO
1. Update existing endpoints
2. Create new `/files` endpoints
3. Test with Postman/curl

### **Step 5: Frontend** 🔴 TODO
1. Create type definitions
2. Build FileBrowser component
3. Build UnknownFilesManager
4. Update MovieTableView with NFO icon
5. Test end-to-end

### **Step 6: Testing & Validation** 🔴 TODO
1. Full library scan
2. Verify all files tracked
3. Test hash deduplication
4. Test provider downloads
5. Test unknown file deletion
6. Performance testing (2000+ movies)

---

## Breaking Changes

### **Database**
- 🔴 **BREAKING**: All existing `cache_assets` data will be lost
- 🔴 **BREAKING**: Database must be dropped and recreated (development)
- ⚠️ **Production Migration**: Would require complex data migration script (not implemented)

### **Code**
- 🔴 **BREAKING**: All services that query `cache_assets` will break
- 🔴 **BREAKING**: All services that query `trailers` table will break
- 🔴 **BREAKING**: Any frontend code expecting `cache_assets` structure

---

## Recommendation for Development

**Option A: Fresh Start (Recommended)**
1. Delete `data/metarr.sqlite`
2. Restart backend → runs new migration
3. Scan library → populates new file tables
4. Refactor code incrementally

**Option B: Data Migration Script** (Complex)
1. Write SQL script to convert `cache_assets` → `image_files`
2. Manually map entity relationships
3. Risk: Data corruption if mapping logic wrong

**Decision**: Use Option A (fresh start) for development phase.

---

## Success Criteria

✅ **Database**
- New file tables created successfully
- All FK constraints valid
- No orphaned records

✅ **Backend**
- Library scan discovers all files
- Files correctly classified and stored
- Cache created for library files
- Hash deduplication working
- Provider downloads stored correctly

✅ **Frontend**
- FileBrowser shows all files
- NFO icon displays correctly in movie list
- Unknown files can be bulk deleted
- UI performance acceptable (2000+ movies)

✅ **Testing**
- All unit tests pass
- Integration tests pass
- No data loss during operations
- Performance benchmarks met

---

## Next Steps

1. ✅ Update database migration (**COMPLETE**)
2. ✅ Document architecture (**COMPLETE**)
3. 🔴 Refactor `assetDiscovery_flexible.ts`
4. 🔴 Refactor `unifiedScanService.ts`
5. 🔴 Update provider services
6. 🔴 Build frontend components
7. 🔴 End-to-end testing

---

**End of Document**
