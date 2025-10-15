# Asset Discovery Implementation Status

## Overview

Asset discovery has been migrated to a **flexible keyword-based validation system** that replaces rigid pattern matching with intelligent dimension and aspect ratio validation based on official Kodi specifications.

**Status**: ✅ **Functional** - Core system working, some asset types need investigation

**Last Updated**: 2025-10-15

---

## Current Implementation

### Architecture

**Location**:
- `src/services/media/assetDiscovery_flexible.ts` - Main discovery logic
- `src/services/media/assetTypeSpecs.ts` - Kodi asset specifications and validation

**Approach**:
1. **Keyword Discovery**: Scans filenames for asset type keywords (e.g., "poster", "fanart", "clearlogo")
2. **Dimension Validation**: Uses `sharp` to read image dimensions and validates against Kodi specs
3. **Best Candidate Selection**: When multiple files match, prioritizes standard Kodi naming, then higher resolution
4. **Content-Addressed Storage**: Stores in `cache_assets` table with SHA256 hashing (automatic deduplication)

### Supported Asset Types

Based on official Kodi wiki: https://kodi.wiki/view/Artwork_types

| Asset Type | DB Column | Keywords | Aspect Ratio | Min Size | Status |
|------------|-----------|----------|--------------|----------|--------|
| **poster** | `poster_id` | poster | 2:3 (±10%) | 500x750 | ⚠️ Not discovering |
| **fanart** | `fanart_id` | fanart, backdrop | 16:9 (±5%) | 1280x720 | ✅ Working |
| **banner** | `banner_id` | banner | ~5.4:1 (±15%) | 500x92 | ✅ Working |
| **logo** | `logo_id` | clearlogo, logo | ~2.6:1 (±30%) | 400x155 | ✅ Working |
| **clearart** | `clearart_id` | clearart | ~1.78:1 (±30%) | 500x281 | ✅ Working |
| **discart** | `discart_id` | discart, disc | 1:1 (±5%) | 500x500 | ✅ Working |
| **keyart** | `keyart_id` | keyart | 2:3 (±10%) | 500x750 | ⚠️ Not discovering |
| **landscape** | `landscape_id` | landscape | 16:9 (±10%) | 1280x720 | ⚠️ Not discovering |
| **thumb** | `thumb_id` | thumb | 16:9 (±10%) | 1280x720 | ⚠️ Not discovering |

**Note**: `clearlogo` in Kodi maps to `logo_id` column in our database schema.

---

## Test Results (2025-10-15 Scan)

### Sample: "21 Bridges (2019)"

**Directory Contents** (25 files total):
- 1 video file: `21 Bridges (tt8688634).mkv`
- 2 NFO files: `movie.nfo`, `21 Bridges (tt8688634).nfo`
- 22 image/video assets

**Assets Discovered** (5 total):
- ✅ `fanart.jpg` (1920x1080) → stored as fanart
- ✅ `21 Bridges (tt8688634)-banner.jpg` (1000x185) → stored as banner
- ✅ `21 Bridges (tt8688634)-clearlogo.png` (800x310) → stored as logo
- ✅ `21 Bridges (tt8688634)-clearart.png` (1000x562) → stored as clearart
- ✅ `21 Bridges (tt8688634)-discart.png` (1000x1000) → stored as discart

**Known Files** (16 total):
- 3 system files (video + 2 NFOs)
- 9 standard Kodi naming variants (auto-added): `poster.jpg`, `fanart.jpg`, `banner.jpg`, `clearlogo.png`, `clearart.png`, `disc.png`, `discart.png`, `landscape.jpg`, `thumb.jpg`
- 4 discovered movie-named variants

**Unknown Files** (16 remaining):
- `21 Bridges (tt8688634)-poster.jpg` (duplicate poster naming)
- `21 Bridges (tt8688634)-fanart.jpg` through `-fanart10.jpg` (11 fanart variants)
- `21 Bridges (tt8688634)-keyart.jpg`, `21 Bridges (tt8688634)-keyart1.jpg` (2 keyart files)
- `21 Bridges (tt8688634)-landscape.jpg` (duplicate landscape naming)
- `21 Bridges (tt8688634)-trailer.mp4` (trailer - not implemented yet)

**Result**: ✅ System correctly identifying standard assets and marking non-standard files as unknown

---

## Known Issues

### 1. Poster Not Being Discovered ⚠️

**Symptom**: `poster.jpg` exists but is not discovered/stored in database

**Impact**: Medium - Poster is recognized as "known file" so not marked as unknown, but not stored in DB

**Investigation Needed**:
- Check if dimension validation is failing (aspect ratio too strict?)
- Check if keyword matching is working for "poster"
- Verify `poster.jpg` dimensions match Kodi specs (2:3 ratio, min 500x750)

**Workaround**: Standard `poster.jpg` naming is added to known files list, so it won't appear as unknown

### 2. Keyart Not Being Discovered ⚠️

**Symptom**: Keyart files are marked as unknown

**Impact**: Low - Keyart is detected by keyword but failing validation

**Likely Cause**: Dimension validation failing (same specs as poster: 2:3 ratio)

**Investigation Needed**: Check actual dimensions of keyart files and adjust validation tolerance

### 3. Landscape/Thumb Not Being Discovered ⚠️

**Symptom**: Landscape and thumb assets not being discovered

**Impact**: Low - Standard naming is recognized, but movie-named variants marked as unknown

**Investigation Needed**: Check if files exist in test library and verify dimensions

---

## Technical Details

### Asset Discovery Flow

```
1. Scan directory for all files
   ↓
2. Find candidates by filename keywords
   ↓
3. Filter by file extension (e.g., PNG required for clearlogo/clearart/discart)
   ↓
4. Read dimensions with sharp
   ↓
5. Validate aspect ratio and minimum dimensions
   ↓
6. Choose best candidate (standard naming > higher resolution > alphabetical)
   ↓
7. Store in cache_assets (SHA256 hash, deduplication)
   ↓
8. Update movies.{asset_type}_id FK column
```

### Unknown Files Detection

**Logic**: A file is "unknown" if it's NOT:
1. The main video file
2. An NFO file (movie.nfo or videofilename.nfo)
3. A discovered and stored asset
4. A standard Kodi asset filename (poster.jpg, fanart.jpg, etc.)
5. Matched by ignore patterns (.nfo, sample files, etc.)

**Known Files List** (auto-added for movies):
- `poster.jpg`, `fanart.jpg`, `banner.jpg`
- `clearlogo.png`, `clearart.png`, `disc.png`, `discart.png`
- `landscape.jpg`, `thumb.jpg`

This ensures that standard Kodi naming is always recognized, even if not discovered/stored in DB.

---

## Database Schema

### cache_assets Table

Content-addressed immutable storage for all assets:

```sql
CREATE TABLE cache_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_hash TEXT NOT NULL UNIQUE,      -- SHA256 hash
  file_path TEXT NOT NULL,                -- Absolute path to original file
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('provider', 'local', 'user')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reference_count INTEGER DEFAULT 1       -- How many entities reference this
);
```

### movies Table (Asset FK Columns)

```sql
CREATE TABLE movies (
  -- ... other columns ...
  poster_id INTEGER,
  fanart_id INTEGER,
  banner_id INTEGER,
  logo_id INTEGER,           -- Maps to "clearlogo" in Kodi
  clearart_id INTEGER,
  discart_id INTEGER,
  keyart_id INTEGER,
  landscape_id INTEGER,
  thumb_id INTEGER,
  FOREIGN KEY (poster_id) REFERENCES cache_assets(id),
  -- ... other FKs ...
);
```

**Note**: Each movie can have ONE of each asset type. Multiple candidates are validated and the best is chosen.

---

## Configuration

### Asset Type Specifications

**File**: `src/services/media/assetTypeSpecs.ts`

**Structure**:
```typescript
export interface AssetTypeSpec {
  type: string;                    // Asset type name
  keywords: string[];              // Search keywords
  aspectRatio?: {
    target: number;                // Target ratio (width/height)
    tolerance: number;             // Tolerance as percentage (0.1 = ±10%)
  };
  minDimensions?: {
    width: number;
    height: number;
  };
  recommendedDimensions?: {
    width: number;
    height: number;
  };
  extensions: string[];            // Allowed file extensions
  description: string;
}
```

**Modifying Specs**:
To adjust validation (e.g., make poster aspect ratio more lenient):
```typescript
{
  type: 'poster',
  keywords: ['poster'],
  aspectRatio: { target: 2/3, tolerance: 0.15 }, // Changed from 0.1 to 0.15
  // ...
}
```

---

## Testing Checklist

When testing asset discovery on a new machine:

- [ ] Scan a library with movies that have various asset types
- [ ] Verify discovered assets in logs: `grep "Discovered and stored asset" logs/app.log`
- [ ] Check unknown files count: Should be low (only non-standard extras)
- [ ] Verify poster discovery (currently failing - investigate)
- [ ] Check database: `SELECT COUNT(*) FROM cache_assets` should match discovered assets
- [ ] Verify deduplication: Rescan same library, `reference_count` should increment, no duplicate `content_hash`

---

## Future Improvements

### Short Term
1. **Fix poster discovery** - Investigate dimension validation failure
2. **Fix keyart discovery** - Same issue as poster (2:3 aspect ratio validation)
3. **Add poster/keyart to test suite** - Create unit tests with known dimensions

### Medium Term
1. **Trailer discovery** - Implement video file validation (duration < movie length)
2. **Landscape/thumb discovery** - Investigate why not discovering (may not exist in test library)
3. **Multiple variants per type** - Support storing multiple fanarts, keyarts (e.g., fanart1-10)
4. **Animated assets** - Support animated posters/fanart (GIF/APNG)

### Long Term
1. **Quality scoring** - Score assets by resolution, file size, aspect ratio accuracy
2. **Provider asset integration** - Download and validate assets from TMDB/TVDB/FanArt.tv
3. **User asset selection** - UI for choosing between multiple candidates
4. **Asset replacement** - Allow users to replace auto-selected assets

---

## Related Files

- `src/services/media/assetDiscovery_flexible.ts` - Main discovery implementation
- `src/services/media/assetTypeSpecs.ts` - Kodi specifications and validation
- `src/services/media/assetDiscovery_clean.ts` - **ARCHIVED** - Old rigid pattern matching (kept for reference)
- `src/services/media/unknownFilesDetection.ts` - Unknown files detection with known files filtering
- `src/services/scan/unifiedScanService.ts` - Orchestrates asset discovery during scan
- `src/database/migrations/20251015_001_clean_schema.ts` - Database schema with asset FK columns

---

## Debugging

### Enable Debug Logging

Increase log output for asset discovery:

1. Change `logger.debug()` to `logger.info()` in `assetDiscovery_flexible.ts`
2. Look for logs:
   - `"Processing asset candidates"` - Shows what candidates were found
   - `"Asset candidate failed validation"` - Shows why validation failed
   - `"Discovered and stored asset"` - Shows successful discoveries

### Check Database

```sql
-- View all discovered assets
SELECT m.title, ca.file_path, ca.content_hash, ca.reference_count
FROM movies m
JOIN cache_assets ca ON (
  ca.id = m.poster_id OR ca.id = m.fanart_id OR
  ca.id = m.banner_id OR ca.id = m.logo_id OR
  ca.id = m.clearart_id OR ca.id = m.discart_id OR
  ca.id = m.keyart_id OR ca.id = m.landscape_id OR
  ca.id = m.thumb_id
)
ORDER BY m.title;

-- Check which assets were discovered for a specific movie
SELECT
  m.title,
  CASE WHEN m.poster_id IS NOT NULL THEN 'YES' ELSE 'NO' END as has_poster,
  CASE WHEN m.fanart_id IS NOT NULL THEN 'YES' ELSE 'NO' END as has_fanart,
  CASE WHEN m.banner_id IS NOT NULL THEN 'YES' ELSE 'NO' END as has_banner,
  CASE WHEN m.logo_id IS NOT NULL THEN 'YES' ELSE 'NO' END as has_logo,
  CASE WHEN m.clearart_id IS NOT NULL THEN 'YES' ELSE 'NO' END as has_clearart,
  CASE WHEN m.discart_id IS NOT NULL THEN 'YES' ELSE 'NO' END as has_discart
FROM movies m
WHERE m.title = '21 Bridges';
```

### Manual Asset Validation

Test dimensions of a specific file:
```bash
npm install -g sharp-cli
sharp -i "path/to/poster.jpg" -o metadata.json --metadata
```

Calculate aspect ratio:
```javascript
const width = 1000;
const height = 1500;
const aspectRatio = width / height;  // 0.6667 (should be ~0.6667 for 2:3)
const targetRatio = 2/3;              // 0.6667
const tolerance = 0.1;                // ±10%
const acceptable = Math.abs(aspectRatio - targetRatio) <= (targetRatio * tolerance);
console.log(`Valid: ${acceptable}`);
```
