# Scanner Incomplete Implementation - Critical Issues

## Current State

The unified file system scanner is **incomplete** - it only discovers IMAGES, not trailers, landscapes, subtitles, or other asset types.

## Issues Found

### 1. ❌ Trailers Not Detected
**Files in library**: `21 Jump Street (tt1232829)-trailer.mp4`
**Scanner result**: `trailers: 0`
**Cause**: `assetDiscovery_unified.ts` only handles images

### 2. ❌ Landscapes Not Detected
**Files in library**: `21 Jump Street (tt1232829)-landscape.jpg`
**Scanner result**: Shows in logs as discovered but count is 0
**Cause**: `landscape` is a valid image type but asset discovery may have issues

### 3. ❌ Subtitles Not Detected
**Expected**: `.srt` files should be detected
**Scanner result**: `subtitles: 0`
**Cause**: `assetDiscovery_unified.ts` doesn't implement subtitle detection

### 4. ❌ Database Schema Mismatches (Fixed)
- ✅ Fixed: `getAllFiles` query used wrong column names (`encoding, language` → `subtitle_language, subtitle_format`)
- ⚠️  Still need server restart to apply schema fixes (clearlogo_id, category, sample_rate columns)

### 5. ❌ API Response Format Issues
The `/api/movies/:id?include=files` endpoint returns data but the format doesn't match what the frontend expects.

## Root Cause Analysis

### assetDiscovery_unified.ts Implementation

```typescript
// Current implementation (lines 1-215)
export async function discoverAndStoreAssets(
  db: DatabaseConnection,
  entityType: 'movie',
  entityId: number,
  dirPath: string,
  videoFileName: string
): Promise<DiscoveredAssets> {
  const result: DiscoveredAssets = {
    images: 0,
    trailers: 0,      // ❌ Always returns 0
    subtitles: 0,     // ❌ Always returns 0
  };

  // Only processes image files using assetTypeSpecs.ts
  // Uses sharp() for image validation
  // NO VIDEO DETECTION
  // NO SUBTITLE DETECTION
  // NO AUDIO DETECTION

  return result;
}
```

**Problems**:
1. Function promises to return `trailers` and `subtitles` counts but doesn't implement detection
2. Only uses `assetTypeSpecs.ts` which defines IMAGE types only
3. No video file extensions checked (`.mp4`, `.mkv`, `.avi`)
4. No subtitle extensions checked (`.srt`, `.sub`, `.ass`)
5. No audio extensions checked (`.mp3`, `.flac`)

## What Needs to Be Implemented

### 1. Trailer Detection
```typescript
// Detect video files with 'trailer' keyword
const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.webm'];
const trailerKeywords = ['trailer', 'preview'];

if (videoExtensions.includes(ext) && trailerKeywords.some(k => file.includes(k))) {
  // Insert into video_files table with video_type = 'trailer'
  // Copy to cache (location = 'cache')
  // Keep library copy (location = 'library')
}
```

### 2. Subtitle Detection
```typescript
const subtitleExtensions = ['.srt', '.sub', '.ass', '.ssa', '.vtt'];

if (subtitleExtensions.includes(ext)) {
  // Parse language from filename (e.g., "movie.en.srt")
  // Insert into text_files table with text_type = 'subtitle'
  // Store subtitle_language and subtitle_format
}
```

### 3. Image Type Landscape
The `landscape` image type exists in assetTypeSpecs.ts but may not be handled correctly. Need to verify the detection logic.

### 4. Audio/Theme Detection
```typescript
const audioExtensions = ['.mp3', '.flac', '.ogg', '.m4a'];
const themeKeywords = ['theme'];

if (audioExtensions.includes(ext) && themeKeywords.some(k => file.includes(k))) {
  // Insert into audio_files table with audio_type = 'theme'
}
```

## Immediate Fix Required

**The scanner needs a complete rewrite to handle all file types, not just images.**

### Option 1: Extend assetDiscovery_unified.ts
- Add video detection logic
- Add subtitle detection logic
- Add audio detection logic
- Maintain same two-copy architecture (library + cache)

### Option 2: Create Separate Discovery Services
- `imageDiscovery.ts` - Current implementation
- `videoDiscovery.ts` - NEW: Handle trailers, samples, extras
- `textDiscovery.ts` - NEW: Handle subtitles
- `audioDiscovery.ts` - NEW: Handle themes
- Orchestrate from unified scan service

### Option 3: Use Existing Asset Discovery
Check if there's already a working asset discovery service that was bypassed during migration.

## Testing Steps After Fix

1. **Restart server** - Database will be recreated with correct schema
2. **Trigger library scan**
3. **Verify counts**:
   ```
   - Images: Should show 7+ per movie
   - Trailers: Should show 1 per movie
   - Landscapes: Should show 1 per movie
   - Subtitles: Should show count if .srt files exist
   ```
4. **Check API response** - `/api/movies/1?include=files` should return structured data
5. **Test movie edit page** - Should load without 500 errors

## Files to Modify

1. **src/services/media/assetDiscovery_unified.ts** - Add video/subtitle/audio detection
2. **src/services/media/assetTypeSpecs.ts** - Verify landscape type is correct
3. **Database schema** - Already fixed, needs server restart
4. **Frontend** - May need updates depending on API response format

## Priority

**🔴 CRITICAL** - The scanner is non-functional for all non-image assets. This breaks:
- Trailer display in UI
- Subtitle management
- Asset indicators on movies page
- Movie edit page functionality

The unified file system migration is incomplete without this implementation.
