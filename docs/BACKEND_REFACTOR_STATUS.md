# Backend Refactoring Status - Unified File System

**Last Updated**: 2025-10-16
**Progress**: 🟢 Core Services Complete - Provider Integration Pending

---

## Completed ✅

### **1. Core Infrastructure**
- ✅ Created `/src/services/files/unifiedFileService.ts`
  - Image file operations (insert, cache, deduplicate)
  - Video file operations (insert)
  - Text file operations (insert)
  - Hash calculation utility
  - Reference counting for cache cleanup
  - Query helpers for entity files

### **2. Asset Discovery**
- ✅ Created `/src/services/media/assetDiscovery_unified.ts`
  - Discovers images in library directories
  - Inserts library records into `image_files`
  - Caches images with deduplication
  - Updates movie FK columns (poster_id, fanart_id, etc.)
  - Uses Kodi naming priority + resolution scoring

### **3. Scan Service Integration**
- ✅ Updated `/src/services/scan/unifiedScanService.ts`
  - Now imports `assetDiscovery_unified.ts` instead of `assetDiscovery_flexible.ts`
  - Workflow: Discover → Insert Library Record → Cache → Update FK

---

## In Progress 🟡

### **NFO Parser** (Next)
**File**: `/src/services/nfo/nfoParser.ts`

**Required Changes**:
1. After parsing NFO, insert record into `text_files` table
2. Set `text_type = 'nfo'`
3. Set validation flags: `nfo_is_valid`, `nfo_has_tmdb_id`
4. Calculate `file_hash` for change detection
5. Location: Always `'library'` (NFOs are not cached)

**Example**:
```typescript
import { insertTextFile, calculateFileHash } from '../files/unifiedFileService.js';

// After parsing NFO successfully
const fileHash = await calculateFileHash(nfoFilePath);
const stats = await fs.stat(nfoFilePath);

await insertTextFile(db, {
  entityType: 'movie',
  entityId: movieId,
  filePath: nfoFilePath,
  fileName: path.basename(nfoFilePath),
  fileSize: stats.size,
  fileHash,
  location: 'library',
  textType: 'nfo',
  nfoIsValid: true,
  nfoHasTmdbId: Boolean(nfoData.tmdbId),
  sourceType: 'local'
});
```

---

### **FFprobe Service** (Next)
**File**: `/src/services/media/ffprobeService.ts`

**Required Changes**:
1. After extracting video metadata, insert into `video_files` table
2. Set `video_type = 'main'` for primary movie file
3. Include codec, resolution, duration, HDR, audio metadata
4. Location: `'library'`
5. Keep existing `video_streams`, `audio_streams`, `subtitle_streams` tables for detailed stream data

**Example**:
```typescript
import { insertVideoFile } from '../files/unifiedFileService.js';

// After FFprobe extraction
await insertVideoFile(db, {
  entityType: 'movie',
  entityId: movieId,
  filePath: videoFilePath,
  fileName: path.basename(videoFilePath),
  fileSize: stats.size,
  location: 'library',
  videoType: 'main',
  codec: videoStream.codec_name,
  width: videoStream.width,
  height: videoStream.height,
  durationSeconds: Math.floor(format.duration),
  bitrate: format.bit_rate,
  framerate: evalFramerate(videoStream.r_frame_rate),
  hdrType: detectHDR(videoStream),
  audioCodec: audioStream?.codec_name,
  audioChannels: audioStream?.channels,
  audioLanguage: audioStream?.tags?.language,
  sourceType: 'local'
});
```

---

## Pending 🔴

### **Provider Services** (TMDB, TVDB, FanArt.tv)
**Files**:
- `/src/services/providers/tmdbService.ts`
- `/src/services/providers/tvdbService.ts`
- `/src/services/providers/fanarttv/` (if exists)

**Required Changes**:
1. When downloading images from providers:
   - Download to temporary location
   - Calculate hash
   - Check if already cached (by hash)
   - If not cached: Copy to cache directory, insert `image_files` record with `location='cache'`
   - Update movie FK columns
2. Set `source_type='provider'`, `source_url`, `provider_name`
3. NO library record needed (provider downloads go straight to cache)

**Example**:
```typescript
import { findCachedImageByHash, insertImageFile, cacheImageFile } from '../files/unifiedFileService.js';

// Download from TMDB
const imageUrl = 'https://image.tmdb.org/t/p/original/abc123.jpg';
const imageBuffer = await downloadImage(imageUrl);
const tempPath = `/tmp/${uuid()}.jpg`;
await fs.writeFile(tempPath, imageBuffer);

// Cache directly (no library record)
const cacheFileId = await cacheImageFile(
  db,
  null, // no library file
  tempPath,
  'movie',
  movieId,
  'poster',
  'provider',
  imageUrl,
  'tmdb'
);

// Update movie FK
await db.execute(`UPDATE movies SET poster_id = ? WHERE id = ?`, [cacheFileId, movieId]);

// Cleanup temp
await fs.unlink(tempPath);
```

---

### **Unknown Files Detection**
**File**: `/src/services/media/unknownFilesDetection.ts`

**Status**: Likely no changes needed - table schema unchanged.

**Verify**:
- Check if it queries `cache_assets` anywhere (should only query `unknown_files`)
- If it builds "known files" set, ensure it queries new file tables

---

### **API Endpoints**

#### **Existing Endpoints to Update**

1. **GET /api/movies/:id**
   - Currently queries `cache_assets` for images
   - Update to query `image_files` where `location='cache'`

2. **GET /api/movies**
   - If includes image data, update queries

#### **New Endpoints to Create**

1. **GET /api/movies/:id/files**
   ```typescript
   // Returns all files for a movie
   {
     videoFiles: [...],
     imageFiles: [...],
     audioFiles: [...],
     textFiles: [...],
     unknownFiles: [...],
     summary: {
       totalFiles: 25,
       hasNFO: true,
       hasMainVideo: true,
       imagesByType: { poster: 2, fanart: 3 }
     }
   }
   ```

2. **DELETE /api/movies/:id/unknown-files**
   ```typescript
   // Bulk delete unknown files
   Body: { fileIds: [1, 2, 3] }
   ```

---

## Testing Checklist

### **Unit Tests** 🔴 TODO
- [ ] `unifiedFileService.ts` - File insertion, caching, deduplication
- [ ] `assetDiscovery_unified.ts` - Candidate selection, scoring
- [ ] Hash calculation accuracy
- [ ] Reference counting logic

### **Integration Tests** 🔴 TODO
- [ ] Scan movie directory → Verify all files in database
- [ ] Duplicate image across movies → Verify single cache entry
- [ ] Provider download → Verify cache storage
- [ ] Delete movie → Verify cache cleanup (if ref_count = 0)

### **Manual Testing** 🔴 TODO
1. Delete database: `rm data/metarr.sqlite`
2. Restart backend
3. Create library (via UI or API)
4. Scan library
5. Check database:
   ```sql
   SELECT COUNT(*) FROM image_files WHERE location='library';
   SELECT COUNT(*) FROM image_files WHERE location='cache';
   SELECT * FROM movies WHERE poster_id IS NOT NULL;
   ```
6. Verify no errors in logs

---

## Migration Path for Existing Code

### **Find All References to Old System**

```bash
# Find cache_assets references
grep -r "cache_assets" src/services/ src/controllers/ src/routes/

# Find old asset discovery references
grep -r "assetDiscovery_flexible" src/

# Find old trailer table references
grep -r "FROM trailers" src/
grep -r "INSERT INTO trailers" src/
```

### **Common Patterns to Replace**

**Pattern 1: Query cache_assets**
```typescript
// OLD
const rows = await db.query(`SELECT * FROM cache_assets WHERE id = ?`, [assetId]);

// NEW
const rows = await db.query(`SELECT * FROM image_files WHERE id = ? AND location = 'cache'`, [assetId]);
```

**Pattern 2: Insert into cache_assets**
```typescript
// OLD
await db.execute(`INSERT INTO cache_assets (...) VALUES (...)`, [...]);

// NEW
import { insertImageFile } from './services/files/unifiedFileService.js';
await insertImageFile(db, { ... });
```

**Pattern 3: Query trailers table**
```typescript
// OLD
const trailers = await db.query(`SELECT * FROM trailers WHERE entity_type = 'movie' AND entity_id = ?`, [movieId]);

// NEW
const trailers = await db.query(`SELECT * FROM video_files WHERE entity_type = 'movie' AND entity_id = ? AND video_type = 'trailer'`, [movieId]);
```

---

## Performance Considerations

### **Deduplication Efficiency**
- Hash lookups are O(1) with `file_hash` index
- Single query: `SELECT * FROM image_files WHERE file_hash = ? AND location = 'cache'`

### **Reference Counting**
- Automated via `incrementImageReferenceCount()` / `decrementImageReferenceCount()`
- Cleanup job needed: Delete cache files with `reference_count = 0` after 30 days

### **Query Optimization**
- All queries use indexed columns (`entity_type`, `entity_id`, `location`, `file_hash`)
- No full table scans expected

---

## Next Steps (Priority Order)

1. 🟡 **Update NFO Parser** - Insert into `text_files` table
2. 🟡 **Update FFprobe Service** - Insert into `video_files` table
3. 🔴 **Update Provider Services** - Download directly to cache
4. 🔴 **Update API Endpoints** - Use new tables
5. 🔴 **Create `/files` Endpoint** - Aggregate all file types
6. 🔴 **Manual Testing** - Full library scan
7. 🔴 **Write Tests** - Unit + integration

---

## Breaking Changes Summary

| Component | Status | Breaking Change |
|-----------|--------|-----------------|
| Database Schema | ✅ Complete | New tables, removed old tables |
| unifiedFileService | ✅ Complete | New module |
| assetDiscovery | ✅ Complete | New module, old one deprecated |
| unifiedScanService | ✅ Complete | Updated import |
| nfoParser | 🟡 Pending | Needs text_files integration |
| ffprobeService | 🟡 Pending | Needs video_files integration |
| Provider Services | 🔴 Pending | Major refactor needed |
| API Endpoints | 🔴 Pending | Query updates needed |

---

**End of Document**
