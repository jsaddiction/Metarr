# Legacy Code Cleanup - Unified File System Migration

This document tracks old code that still references the deprecated `images`, `cache_assets`, and `trailers` tables, which have been replaced by the unified file system (`image_files`, `video_files`, `audio_files`, `text_files`, `unknown_files`).

## Status Legend
- ✅ **DONE** - Refactored to use unified file system
- 🟡 **PARTIAL** - Some methods refactored, legacy methods remain
- 🔴 **TODO** - Still using old schema entirely

---

## Services with Legacy Code

### `/src/services/imageService.ts` 🟡 PARTIAL

**Status**: Core methods refactored, but legacy methods still present

**Refactored (using unified file system)**:
- ✅ `downloadImageToCache()` - Uses `cacheImageFile()`
- ✅ `selectImages()` - Uses `cacheImageFile()`, returns cache file IDs
- ✅ `uploadCustomImage()` - Uses `cacheImageFile()`

**Legacy (still using old `images` table)**:
- 🔴 `getImages()` - Line 61: `SELECT * FROM images`
- 🔴 `getImageById()` - Line 84: `SELECT * FROM images WHERE id = ?`
- 🔴 `setImageLock()` - Line 432: `UPDATE images SET locked = ?`
- 🔴 `deleteImage()` - Line 456: `DELETE FROM images WHERE id = ?`
- 🔴 `copyToLibrary()` - Line 470: `UPDATE images SET file_path = ?`
- 🔴 `recoverMissingImages()` - Uses `getImages()` which queries old table
- 🔴 `getImageStream()` - Uses `getImageById()` which queries old table

**Recommendation**:
- Create new methods that query `image_files` table
- Mark old methods as `@deprecated`
- Update all callers to use new methods
- Remove old methods after all callers updated

---

### `/src/services/movieService.ts` 🟡 PARTIAL

**Status**: List methods use new FK columns, but detail methods still query old tables

**Refactored (using unified file system)**:
- ✅ `getAll()` - Uses FK columns (poster_id, fanart_id, etc.) instead of JOIN
- ✅ `getAllFiles()` - NEW METHOD - Queries all unified file tables

**Legacy (still using old tables)**:
- 🔴 `getImages()` - Line 901: `SELECT id FROM images WHERE entity_type = ?`
- 🔴 `rebuildMovieAssets()` - Line 1077: `SELECT id, type, cache_path FROM images`
- 🔴 `verifyMovieAssets()` - Line 1231: `SELECT id, type, cache_path, library_path FROM images`
- 🔴 Also queries old `trailers` table (line 1266) and `subtitle_streams` (line 1302)

**Recommendation**:
- Update `getImages()` to query `image_files` table
- Update `rebuildMovieAssets()` to use unified file system
- Update `verifyMovieAssets()` to check all file types
- These are likely only used internally, so breaking changes OK

---

### `/src/services/jobHandlers.ts` 🔴 TODO

**Status**: Still using old schema for asset handling

**Legacy code**:
- Line 1451: `SELECT id FROM images WHERE entity_type = ? AND entity_id = ? AND asset_type = ?`
- Line 1457: `INSERT INTO images (...)`

**Recommendation**:
- Check if this file is still actively used
- If yes, refactor to use unified file system
- If no, delete or move to `/src/services/_deprecated/`

---

### `/src/services/media/assetDiscovery.ts` 🔴 TODO

**Status**: Old asset discovery implementation (NOT unified)

**Legacy code**:
- Line 361: `DELETE FROM images WHERE entity_type = ?`
- Line 418: `INSERT INTO images (...)`

**Note**: This file appears to be superseded by `/src/services/media/assetDiscovery_unified.ts`

**Recommendation**:
- Verify that `assetDiscovery_unified.ts` is being used
- If yes, delete `assetDiscovery.ts` or move to `_deprecated/`
- Update all imports to use unified version

---

### `/src/services/cacheService.ts` 🔴 TODO

**Status**: Unknown (needs investigation)

**Legacy references**:
- Found in grep results for `cache_assets` or `images` table

**Recommendation**:
- Read file and determine usage
- Refactor or deprecate

---

### `/src/services/garbageCollectionService.ts` 🔴 TODO

**Status**: Still checking old `images` table

**Legacy code**:
- Line 202: `SELECT COUNT(*) as count FROM images`

**Recommendation**:
- Update to check `image_files` table with `location='cache'`
- Update to check all file types (video, audio, text)
- Implement reference counting cleanup

---

### `/src/services/libraryService.ts` 🔴 TODO

**Status**: Unknown (needs investigation)

**Recommendation**:
- Audit for old table references
- Refactor as needed

---

### `/src/controllers/imageController.ts` 🔴 TODO

**Status**: Likely using old `imageService` methods

**Recommendation**:
- Check if this controller is used by frontend
- If yes, update to use new unified file methods
- If no, deprecate

---

## Provider Services

### `/src/services/providers/tmdb/TMDBProvider.ts` ✅ DONE

**Status**: Uses `imageService.selectImages()` which now uses unified file system

**No changes needed** - Already integrated via imageService refactoring

---

### `/src/services/providers/fanart/FanArtProvider.ts` ✅ DONE

**Status**: Uses `imageService` methods

**No changes needed** - Already integrated

---

## Old/Unused Files

These files may be old implementations that are no longer used:

- `/src/services/media/assetDiscovery.ts` - Superseded by `assetDiscovery_unified.ts`?
- `/src/services/media/assetDiscovery_clean.ts` - Legacy?
- `/src/services/media/assetDiscovery_flexible.ts` - Legacy?
- `/src/services/media/unknownFilesDetection.ts` - Still used?

**Recommendation**:
- Move to `/src/services/_deprecated/` directory
- Or delete if confirmed unused

---

## Migration Priority

### HIGH PRIORITY (Breaking User-Facing Features)
1. 🔴 `/src/controllers/imageController.ts` - If used by frontend
2. 🔴 `/src/services/imageService.ts` - Update legacy methods
3. 🔴 `/src/services/movieService.ts` - Update `getImages()`, `rebuildMovieAssets()`, `verifyMovieAssets()`

### MEDIUM PRIORITY (Internal/Background Jobs)
4. 🔴 `/src/services/garbageCollectionService.ts`
5. 🔴 `/src/services/jobHandlers.ts`

### LOW PRIORITY (Likely Deprecated)
6. 🔴 `/src/services/media/assetDiscovery.ts` - Delete if unused
7. 🔴 `/src/services/cacheService.ts` - Audit and refactor
8. 🔴 `/src/services/libraryService.ts` - Audit and refactor

---

## Testing After Cleanup

Once legacy code is removed, test:

1. ✅ Library scan (video, image, text file tracking)
2. ✅ Provider enrichment (TMDB/TVDB/FanArt.tv image downloads)
3. ✅ NFO parsing and tracking
4. 🔴 Image serving via `/api/images/:id/file`
5. 🔴 Asset rebuild/verify functionality
6. 🔴 Garbage collection
7. 🔴 Unknown file management

---

**Last Updated**: 2025-10-16
**Status**: Backend unified file system complete, legacy cleanup in progress
