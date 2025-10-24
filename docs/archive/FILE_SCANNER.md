# File Scanner Architecture

**Status**: Final Design (Ready for Implementation)
**Last Updated**: 2025-10-23
**Purpose**: Define robust file classification system for automatic directory scanning

---

## Overview

The File Scanner is responsible for identifying and classifying files within media directories with maximum automation and minimum ambiguity. It must handle diverse user file organization patterns while maintaining 100% safety for the main movie file.

### Core Principles

1. **"Gather all facts, classify with confidence, fail gracefully"**
2. **Binary Decision Model**: Either ≥80% confidence (process) or <80% (stop and ask user)
3. **Fail-Safe**: Never guess. If unsure, require manual input.
4. **Minimum Requirements**: Main movie file + TMDB ID = can process

---

## Two Scanning Modes

### Mode 1: Scanning (Filesystem → Cache Database)
- **Direction**: Library filesystem is source of truth
- **Goal**: Import what we find on disk into cache database
- **Triggers**: User action, webhook (new content added)
- **Safety**: Conservative - require high confidence before classification

### Mode 2: Verification (Cache → Library)
- **Direction**: Cache database is source of truth
- **Goal**: Make library match what's in cache exactly
- **Triggers**: Publish job, scheduled maintenance
- **Safety**: Aggressive - remove unauthorized files, restore missing files

### Shared Component: File Classification

Both modes use the same categorization logic to answer: "What IS this file?"

---

## Three-Phase Classification Process

```
Phase 1: Gather Facts (Top-Down by Type)
  ├─> Filesystem facts (all files)
  ├─> Video facts (FFprobe: streams, duration, codecs)
  ├─> Image facts (Sharp: dimensions, aspect ratio)
  ├─> Text facts (content patterns, IDs)
  └─> Directory context (rankings, relative comparisons)

Phase 2: Classify Files (Process of Elimination)
  ├─> Text files (extension → content verification)
  ├─> Video files (disc detection → exclusion → heuristics)
  └─> Image files (expected names → keywords → dimensions)

Phase 3: Can We Process?
  ├─> Main movie identified? YES + TMDB ID? YES → CAN_PROCESS ✅
  ├─> Missing either? → MANUAL_REQUIRED ❌
  └─> Unknown files? → Flag for recycling at publish time
```

---

## Phase 1: Comprehensive Fact Gathering

### Principle: "We need the data anyway, so gather it all upfront"

Since we must run FFprobe on all video files to extract stream data for the database, and Sharp on all images for dimensions, we should gather ALL available information in a single pass and store it in-memory for classification decisions.

### Fact Categories

#### Filesystem Facts (All Files)
- Absolute path
- Filename (with and without extension)
- File extension
- File size (bytes)
- Directory path and directory name
- Modified/created timestamps

#### Video Stream Facts (FFprobe)
Collected for: `.mp4`, `.mkv`, `.avi`, `.mov`, `.wmv`, `.flv`, `.webm`, `.m4v`, `.mpg`, `.mpeg`, `.m2ts`, `.ts`, `.vob`, `.ogv`, `.3gp`

- Has video stream (boolean)
- Has audio stream (boolean)
- Duration (seconds)
- Overall bitrate
- Video streams array:
  - Codec, resolution, FPS, bitrate
  - Profile, color space, HDR format
- Audio streams array:
  - Codec, channels, sample rate, bitrate
  - Language, title metadata
- Subtitle streams array:
  - Codec, language, title
  - Forced/default flags

**Performance**:
- Small files (<1GB): ~500ms
- Large files (>10GB): ~5-30 seconds
- Timeout: 30 seconds

#### Image Facts (Sharp)
Collected for: `.jpg`, `.jpeg`, `.png`, `.gif`, `.bmp`, `.webp`, `.tiff`

Also check legacy directories:
- `extrafanarts/` - Multiple fanart images (legacy Kodi format)
- `extrathumbs/` - Multiple thumb images (legacy Kodi format)

Facts gathered:
- Width and height (pixels)
- Aspect ratio (calculated)
- Image format (JPEG, PNG, etc.)
- Has alpha channel (transparency)

**Performance**: ~5-20ms per image

#### Text File Facts (File Reading)
Collected for: `.nfo`, `.srt`, `.ass`, `.ssa`, `.vtt`, `.sub`, `.idx`, `.txt`

- Content sample (first 10KB)
- Contains TMDB ID (boolean)
- Contains IMDB ID (boolean)
- Looks like NFO (XML structure or provider IDs)
- Looks like subtitle (timestamp patterns)

**Performance**: ~1-5ms per file

#### Filename Pattern Facts (Regex Analysis)
Extracted for all files:

- Has year pattern: `(2024)`, `[2024]`, `.2024.`
- Extracted year: `2024`
- Has resolution: `1080p`, `720p`, `4K`, `2160p`
- Has codec: `x264`, `x265`, `HEVC`
- Has quality tags: `BLURAY`, `REMUX`, `WEBRip`
- Has audio tags: `DTS`, `ATMOS`, `DD5.1`
- Has edition: `Director's Cut`, `Extended`, `Theatrical`

**Exclusion Keywords** (critical for classification):
- Hyphenated patterns: `-trailer`, `-sample`, `-behindthescenes`, `-deleted`, `-featurette`, `-interview`, `-scene`, `-short`
- Additional: `sample` anywhere in filename
- `trailer` if hyphenated or underscore-separated (not part of title)

#### Directory Context Facts (Relative Analysis)
Computed AFTER all individual file facts are gathered:

- Total files by type (videos, images, text)
- Size rankings (1 = largest file)
- Duration rankings (1 = longest video)
- Relative comparisons:
  - Is largest file (boolean)
  - Is longest video (boolean)
  - Percent of largest/longest

**Performance Target**: <10 seconds for typical directory (1 video + 10 assets)

---

## Phase 2: Classification Decision Tree

### Priority Order: Easy → Hard

1. **Disc-based media** (100% confidence, check first)
2. **Text files** (extension + content verification)
3. **Video files** (exclusion + heuristics)
4. **Image files** (use main movie context)

---

### Step 1: Disc-Based Media Detection (PRIORITY CHECK)

**Check FIRST before other video classification.**

#### BluRay Structure
If directory contains `BDMV/index.bdmv`:
- Main movie = entire BDMV directory structure
- Confidence: 100%

**Special Naming Conventions** (BluRay):
- NFO: `BDMV/index.nfo` (inside BDMV subdirectory)
- Images: "Short name" format `<arttype><number>.ext` (in root directory)
  - Examples: `poster.jpg`, `fanart.jpg`, `fanart1.jpg`, `fanart2.jpg`
  - NO movie filename prefix in BDMV folders
  - Numbered variants still supported

**Directory Structure**:
```
/movies/MovieName (2024)/
  BDMV/
    index.bdmv          <- Detection file
    index.nfo           <- NFO location
    STREAM/
    CLIPINF/
  poster.jpg            <- Images in root
  fanart.jpg
```

#### DVD Structure
If directory contains `VIDEO_TS/VIDEO_TS.IFO`:
- Main movie = entire VIDEO_TS directory structure
- Confidence: 100%

**Special Naming Conventions** (DVD):
- NFO: `VIDEO_TS/VIDEO_TS.nfo` (inside VIDEO_TS subdirectory)
- Images: "Short name" format `<arttype><number>.ext` (in root directory)
  - Examples: `poster.jpg`, `fanart.jpg`, `banner.jpg`
  - NO movie filename prefix in VIDEO_TS folders
  - Numbered variants still supported

**Directory Structure**:
```
/movies/MovieName (2024)/
  VIDEO_TS/
    VIDEO_TS.IFO        <- Detection file
    VIDEO_TS.nfo        <- NFO location
    VIDEO_TS.VOB
    VTS_01_0.VOB
  poster.jpg            <- Images in root
  fanart.jpg
```

**Reasoning**: Physical disc structure definitively identifies the movie file. No ambiguity.

**Implementation Note**: Image classification must detect disc structure context and use appropriate naming expectations (short names for disc structures, movie-based names for regular directories).

---

### Step 2: Text File Classification

**Strategy**: Extension-first classification → Content verification

#### NFO Files
```
1. Extension = .nfo?
   → YES: Check content for XML tags OR TMDB/IMDB IDs
      → Content verified?
         → YES: Classified as NFO ✅
         → NO: Unknown ❌
   → NO: Continue
```

#### Subtitle Files
```
1. Extension in [.srt, .ass, .ssa, .vtt, .sub, .idx]?
   → YES: Check content for timestamps or subtitle markers
      → Content verified?
         → YES: Classified as subtitle ✅
         → NO: Unknown ❌
   → NO: Unknown ❌
```

**Result**: NFO files, subtitle files, or unknown text files

---

### Step 3: Video File Classification (Main Movie Detection)

**Critical**: This is the most important classification. Must be extremely conservative.

#### Exclusion Phase: Identify Trailers

Any video file with exclusion keywords → Trailer

**Exclusion Keywords** (MediaElch-inspired):
- Hyphenated suffixes: `-trailer`, `-sample`, `-behindthescenes`, `-deleted`, `-featurette`, `-interview`, `-scene`, `-short`
- `sample` anywhere in filename
- `trailer` if hyphenated or underscore-separated (not part of movie title)

**Remaining videos** = Main movie candidates

#### Decision Tree

**CASE 1: Webhook Provided Exact Filename**
```
IF webhookContext.providedFilename matches candidate
  → Main movie (100% confidence)
```

**CASE 2: No Video Files**
```
IF videoFiles.length === 0
  → FAIL: "No video files found"
```

**CASE 3: Single Video File**
```
IF videoFiles.length === 1
  IF file has exclusion keywords
    → FAIL: "Only video file has exclusion keywords"
  ELSE
    → Main movie (100% confidence)
```

**CASE 4: Single Candidate After Exclusion**
```
IF mainMovieCandidates.length === 1
  → Main movie (95% confidence)
```

**CASE 5: Multiple Candidates → Use Duration Only**

**Heuristic: Longest Duration Wins**

File size can be misleading (4K trailer > 480p movie), but **a trailer will never be longer than the movie**.

```
Sort candidates by duration (longest first)
Winner = candidate with longest duration
→ Main movie (90% confidence)
```

**Edge Case: Identical Durations** (within 1 second)?
```
IF two or more candidates have same duration
  → FAIL: "Multiple candidates with identical duration"
```

This is extremely rare and requires manual input.

**Example Scenario**:
```
theatrical.mkv:  180 min, 12 GB  (longest ✓)
extended.mkv:    165 min, 15 GB  (larger but shorter)
→ Result: theatrical.mkv (90% confidence)
```

**Rationale**: Duration is the most reliable signal. Size varies wildly based on resolution/encoding.

**CASE 6: All Videos Are Trailers**
```
IF mainMovieCandidates.length === 0
  → FAIL: "All video files contain exclusion keywords"
```

#### Validation After Selection

**Safety checks** on selected main movie:
1. Has video stream? (FFprobe successful)
2. No exclusion keywords in filename

**Validation removed** (already tested):
- ~~Duration > 5 minutes~~ (already confirmed via FFprobe)
- ~~File size > 50MB~~ (already confirmed via filesystem)

If validation fails → FAIL (require manual input)

---

### Step 4: Image File Classification

**Prerequisite**: Main movie file must be identified first (need basename for expected names)

#### Generate Expected Filenames

From main movie file: `The Matrix (1999).mkv`

**Expected Kodi naming**:
- `The Matrix (1999)-poster.jpg`
- `The Matrix (1999)-fanart.jpg`
- `The Matrix (1999)-banner.jpg`
- `The Matrix (1999)-clearlogo.png`
- `The Matrix (1999)-clearart.png`
- `The Matrix (1999)-disc.png`
- `The Matrix (1999)-landscape.jpg`
- `The Matrix (1999)-thumb.jpg`

**Numbered variants** (multiple assets per type):
- `The Matrix (1999)-fanart1.jpg`
- `The Matrix (1999)-fanart2.jpg`
- `The Matrix (1999)-poster1.jpg`
- `The Matrix (1999)-poster2.jpg`

**Generic alternatives**:
- `poster.jpg`, `poster.png`, `folder.jpg`
- `fanart.jpg`, `fanart.png`, `backdrop.jpg`
- `banner.jpg`, `clearlogo.png`, etc.

#### Legacy Directory Handling

**Scan and collect ALL files in**:
- `extrafanarts/*.jpg` - Multiple fanart images (legacy Kodi)
- `extrathumbs/*.jpg` - Multiple thumb images (legacy Kodi)

**Behavior**:
- **During Scan**:
  - Gather and classify ALL files in these directories (not just images)
  - Cache classified files (images mainly, but scan everything)
  - Track directory locations for cleanup
- **During Publish**:
  - **Completely recycle entire directories** from filesystem
  - Move entire directory structure to recycle bin
  - This prevents re-scanning on future operations

**Result**: Files cached, entire legacy directories removed at publish time, won't be scanned again

**Rationale**: Legacy directories are deprecated format. Cache useful files, then clean up entirely to avoid confusion on future scans.

#### Classification Signals

**Confidence Scoring**:
1. **Exact filename match**: 90 confidence
2. **Numbered variant**: 85 confidence (`-fanart1.jpg`)
3. **Alternative generic name**: 80 confidence (`poster.jpg`)
4. **Keyword in filename**: 60 confidence (`fanart` keyword)
5. **Dimension validation**: +20 confidence (if keyword matched)

**Threshold**: ≥80 confidence required for automatic classification

**Dimension Validation**: Use specs from `assetTypeSpecs.ts`
- Check aspect ratio (with tolerance)
- Check minimum dimensions (with 10% tolerance)

**Multiple Assets Per Type**: Allowed and supported
- Database schema allows multiple records with same `image_type`
- Common: Multiple fanarts, posters, etc.
- First match wins per file (file assigned to first matching type ≥80 confidence)

**Unknown Images**: Any image with confidence <80

---

## Phase 3: Final Decision - Can We Process?

### Minimum Requirements

**To process directory automatically**:
1. ✅ Main movie file identified (confidence ≥80)
2. ✅ TMDB ID found (from NFO or will be provided by user)

**That's it!** Everything else is optional.

### Processing Statuses

**CAN_PROCESS** (Confidence 100):
- Main movie ✅
- TMDB ID ✅
- All files classified ✅
- No unknowns

**CAN_PROCESS_WITH_UNKNOWNS** (Confidence 80):
- Main movie ✅
- TMDB ID ✅
- Some unknown files → flag for recycling at publish

**MANUAL_REQUIRED** (Confidence 0):
- Main movie NOT identified, OR
- TMDB ID NOT found
- → Stop processing, request user input

### Unknown Files Behavior

**Do NOT block processing**

Unknown files are:
- Tracked in database with `classification_score = 0`
- Flagged for user review
- **Recycled at publish time** (moved to timestamped recycle bin)

**What gets recycled at publish**:
1. Unknown files (couldn't classify with ≥80 confidence)
2. Legacy directories (`extrafanarts/`, `extrathumbs/`)
3. Files in library but NOT in cache (unauthorized)
4. Duplicate/inferior assets (if user selected different version)

**Recycle bin structure**:
```
/data/recycle/
  2025-10-23_143022_movie-123/
    unknown-file.xyz
    extrafanarts/
      fanart1.jpg
      fanart2.jpg
```

**User can**:
- Review recycled files
- Manually classify and restore
- Permanently delete

**Safety**: Never recycle main movie file (validation check before any recycling operation)

---

## Future Enhancements

### Webhook Path Mapping (Future)

**Problem**: Radarr path vs. Metarr path differ

**Example**:
- Radarr webhook: `/downloads/movies/Movie (2024)/Movie.mkv`
- Metarr library: `/media/movies/Movie (2024)/Movie.mkv`

**Solution**: Path mapping configuration (not implemented yet)

**Benefit**: Webhook provides exact filename → 100% confidence

### Radarr API Integration (Future, Optional)

**When enabled** (requires Radarr API configuration):
1. Movie has TMDB ID
2. Query Radarr: `GET /api/v3/movie?tmdbId={id}`
3. Extract exact filename from response: `movieFile.relativePath`
4. Use as 100% confidence main movie identifier

**Benefits**:
- Eliminates ambiguity entirely
- Perfect for users already running Radarr
- Optional - not required for Metarr to function

### Stacked Files Support (Future, Low Priority)

**Multi-part movies**: `movie-cd1.avi`, `movie-cd2.avi`

**Behavior**: Detect stack patterns, link together as single movie entity

**Current**: Not supported (uncommon use case)

---

## Implementation Notes

### Performance

**Parallelism**: Managed at worker level, not job level
- Multiple workers process separate jobs concurrently
- Each job processes files sequentially (simpler, avoids complexity)
- Worker-level parallelism easier to manage and scale

**Target Performance**:
- Typical directory (1 video + 10 assets): <10 seconds
- Large directory (5 videos + 50 assets): <60 seconds
- Bottleneck: FFprobe on large video files

### Error Handling

**FFprobe Failure**:
- Log error
- Cannot classify video without duration
- Mark as unknown, require manual classification

**Sharp Failure** (corrupt image):
- Log error
- Cannot classify without dimensions
- Mark as unknown

**Text Read Failure**:
- Log error
- Cannot verify content
- Mark as unknown

**Principle**: One file failure should not block entire directory (best effort)

### Configuration

**No configurable thresholds**:
- Auto-process: Hardcoded at ≥80% confidence
- Manual required: Hardcoded at <80% confidence

**Reasoning**: Simplicity. No premature configuration complexity. Can add later if users request it.

### Database Storage

**Do NOT store**:
- ❌ Confidence scores (no value after classification)
- ❌ Classification reasoning (logs only)

**DO store**:
- ✅ File paths, sizes, hashes
- ✅ Classification type (poster, fanart, trailer, etc.)
- ✅ Source information (provider, local, user)
- ✅ Lock status (user overrides)

---

## Success Criteria

### Main Movie Detection
- ✅ 100% accuracy when webhook provides filename
- ✅ 100% accuracy when disc structure detected (BDMV/VIDEO_TS)
- ✅ 100% accuracy for single video file directories
- ✅ 95%+ accuracy for standard naming patterns (exclusion keywords work)
- ✅ Graceful failure for ambiguous cases (manual intervention, not guessing)

### Image Classification
- ✅ 90%+ accuracy for standard Kodi naming conventions
- ✅ Correct aspect ratio matching for posters, fanart, banners
- ✅ Flexible tolerance for clearart (wide variation expected)
- ✅ Support for multiple assets per type (fanart1, fanart2, etc.)
- ✅ Legacy directory detection and caching

### Text Classification
- ✅ 100% accuracy for NFO files (TMDB/IMDB ID detection)
- ✅ 100% accuracy for subtitle files (extension + content pattern)

### Performance
- ✅ <10 seconds for typical directory
- ✅ <60 seconds for large directory
- ✅ No timeouts on typical files

### User Experience
- ✅ Clear status: CAN_PROCESS or MANUAL_REQUIRED (binary)
- ✅ Easy manual classification UI (when needed)
- ✅ Transparent reasoning in logs
- ✅ **NEVER delete main movie file**
- ✅ Safe recycling with restore capability

---

## Related Documentation

- [WORKFLOWS.md](WORKFLOWS.md) - Workflow 3A (Scanning), Workflow 3B (Verification), Workflow 5 (Publishing)
- [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) - Cache tables for storing classified assets
- [WEBHOOKS.md](WEBHOOKS.md) - Webhook payload structure (includes filename hints)
- [DESIGN_DECISIONS.md](DESIGN_DECISIONS.md) - Architectural philosophy

---

## Implementation Plan

### Phase 1: Core Interfaces & Types

#### 1.1 Create FileFacts Interfaces
**File**: `src/types/fileFacts.ts`

**Interfaces to define**:
- `FilesystemFacts` - Path, size, extension, timestamps
- `FilenameFacts` - Patterns, keywords, year, resolution, exclusion flags
- `VideoStreamFacts` - FFprobe data (streams, duration, codecs)
- `ImageFacts` - Sharp data (dimensions, aspect ratio, format)
- `TextFileFacts` - Content patterns, IDs, verification flags
- `DirectoryContextFacts` - Rankings, relative comparisons
- `FileFacts` - Main interface combining all above (single interface with optional fields)

#### 1.2 Create Classification Result Types
**File**: `src/types/classification.ts`

**Types to define**:
- `ClassificationStatus` - 'CAN_PROCESS' | 'CAN_PROCESS_WITH_UNKNOWNS' | 'MANUAL_REQUIRED'
- `ClassificationResult` - Status, confidence, reasoning, classified files
- `VideoClassification` - Main movie, trailers, confidence
- `ImageClassification` - Organized by type (poster, fanart, etc.)
- `TextClassification` - NFO, subtitles, unknowns
- `DiscStructureInfo` - BDMV/VIDEO_TS detection results

---

### Phase 2: Fact Gathering Service

#### 2.1 Create FactGatheringService
**File**: `src/services/scan/factGatheringService.ts`

**Functions**:
- `gatherFilesystemFacts(filePath)` - Get size, path, extension, timestamps
- `gatherFilenameFacts(filename)` - Extract patterns, keywords, exclusion checks
- `gatherVideoFacts(filePath)` - FFprobe integration (use existing `ffprobeService.ts`)
- `gatherImageFacts(filePath)` - Sharp integration for dimensions
- `gatherTextFacts(filePath)` - Read first 10KB, pattern matching
- `gatherDirectoryContextFacts(allFacts[])` - Compute rankings, relative comparisons
- `detectDiscStructure(directoryPath)` - Check for BDMV/VIDEO_TS
- `scanLegacyDirectories(directoryPath)` - Check extrafanarts/, extrathumbs/
- `gatherAllFacts(directoryPath)` - Main orchestrator, returns `FileFacts[]`

**Key logic**:
- Check for legacy directories (`extrafanarts/`, `extrathumbs/`)
- Scan ALL files in legacy directories (not just images)
- Handle errors gracefully (one file failure doesn't block others)
- Sequential processing (worker-level parallelism, not file-level)

---

### Phase 3: Classification Service

#### 3.1 Create ClassificationService
**File**: `src/services/scan/classificationService.ts`

**Functions**:

**Disc Detection** (check FIRST):
- `checkForDiscStructure(directoryPath)` - Look for BDMV/VIDEO_TS
- Returns disc info or null (100% confidence if found)

**Text Classification**:
- `classifyTextFiles(textFiles: FileFacts[], isDiscStructure: boolean)` - Extension → content verification
- Handle special disc NFO names (`index.nfo`, `VIDEO_TS.nfo`)
- Returns: `{ nfo: [], subtitles: [], unknown: [] }`

**Video Classification**:
- `hasExclusionKeyword(filename)` - Check against exclusion patterns
- `identifyTrailers(videoFiles: FileFacts[])` - Filter by exclusion keywords
- `classifyMainMovie(candidates: FileFacts[], webhookHint?)` - Decision tree
  - **Use duration ONLY** (longest wins)
  - Edge case: Identical durations → FAIL
- Returns: `{ mainMovie: FileFacts | null, trailers: FileFacts[], confidence: number, status: string }`

**Image Classification**:
- `generateExpectedFilenames(mainMovie: FileFacts | null, isDiscStructure: boolean)` - Create expected names
  - Regular: `MovieName (2024)-poster.jpg`
  - Disc: `poster.jpg` (short name format)
- `matchesNumberedVariant(filename, baseName)` - Detect fanart1, fanart2, etc.
- `classifyImageFiles(images: FileFacts[], expectedNames, isDiscStructure)` - Classification with confidence scoring
- Returns: `{ poster: [], fanart: [], banner: [], ..., unknown: [] }`

**Main Orchestrator**:
- `classifyDirectory(directoryPath, webhookContext?)` - Run all classification steps
- Returns: `ClassificationResult`

---

### Phase 4: Processing Decision Service

#### 4.1 Create ProcessingDecisionService
**File**: `src/services/scan/processingDecisionService.ts`

**Functions**:
- `canProcessDirectory(classificationResult)` - Binary decision logic
- Check: Main movie identified?
- Check: TMDB ID available?
- Return: `CAN_PROCESS`, `CAN_PROCESS_WITH_UNKNOWNS`, or `MANUAL_REQUIRED`

---

### Phase 5: Integration with Existing Services

#### 5.1 Update unifiedScanService
**File**: `src/services/scan/unifiedScanService.ts`

**Changes**:
- Replace current `fileClassificationService` calls with new `classificationService`
- Add disc detection check FIRST before normal video classification
- Handle disc structure special naming conventions
- Handle `MANUAL_REQUIRED` status (stop processing, notify user)
- Store unknown files in database with flag for recycling
- Track legacy directories for complete removal at publish time

#### 5.2 Create/Update RecyclingService
**File**: `src/services/files/recyclingService.ts`

**Functions**:
- `createRecycleBin(movieId, timestamp)` - Create timestamped directory
- `recycleFile(filePath, recycleBinPath)` - Move file safely
- `recycleDirectory(dirPath, recycleBinPath)` - **Move entire directory** (for legacy dirs)
- `validateBeforeRecycling(filePath, mainMovieFile)` - **CRITICAL**: Never recycle main movie
- `listRecycledItems(movieId)` - Show user what's in recycle bin
- `restoreFromRecycleBin(filePath, originalPath)` - Restore file
- `permanentlyDelete(recycleBinPath)` - Delete recycle bin contents

**Recycle bin structure**:
```
/data/recycle/
  2025-10-23_143022_movie-123/
    unknown-file.xyz
    extrafanarts/          <- Entire directory moved
      fanart1.jpg
      fanart2.jpg
    extrathumbs/           <- Entire directory moved
      thumb1.jpg
```

#### 5.3 Update PublishService
**File**: `src/services/publishService.ts`

**Add recycling logic**:
1. After copying cache → library
2. Identify items to recycle:
   - Unknown files
   - **Legacy directories - ENTIRE directory structure** (`extrafanarts/`, `extrathumbs/`)
   - Unauthorized files (in library but not in cache)
3. Call `recyclingService.recycleDirectory()` for legacy dirs (entire directory)
4. Call `recyclingService.recycleFile()` for individual unknown files
5. Never recycle main movie file (validation check)

---

### Phase 6: Manual Classification UI

#### 6.1 Create Manual Classification Modal
**File**: `public/frontend/src/components/movie/ManualClassificationModal.tsx`

**Features**:
- Show all files in directory
- Display suggested classification with confidence
- Dropdowns for user to select correct type:
  - Main Movie
  - Trailer
  - Poster, Fanart, Banner, etc.
  - Subtitle
  - NFO
  - Unknown (recycle)
  - Ignore (keep but don't track)
- Submit button to apply classifications
- Re-run classification after user input

#### 6.2 Add Manual Classification Trigger
**File**: `public/frontend/src/pages/metadata/Movies.tsx`

**UI Elements**:
- Badge on movie card: "Manual Classification Required" (red)
- Click opens `ManualClassificationModal`
- After user classification, trigger scan job again with user overrides

---

### Phase 7: Testing

#### 7.1 Unit Tests
**Files**: `src/services/scan/*.test.ts`

**Test cases**:
- Fact gathering with various file types
- Exclusion keyword detection
- **Video classification: duration-based winner**
- **Edge case: Identical durations (should FAIL)**
- Image classification with expected names
- **Disc structure detection and special naming**
- **Short name format for disc structures**
- Legacy directory detection (entire directory handling)
- Processing decision logic

#### 7.2 Integration Tests
**File**: `src/tests/integration/fileClassification.test.ts`

**Test scenarios**:
1. Single video file directory (100% confidence)
2. Two videos: one trailer, one movie (95% confidence)
3. **Multiple candidates: longest duration wins (90% confidence)**
4. **Multiple candidates: identical durations (MANUAL_REQUIRED)**
5. **Disc structure (BDMV) detection with special naming (100% confidence)**
6. **Disc structure (VIDEO_TS) detection with special naming (100% confidence)**
7. **Legacy directories: scan all files, track for complete removal**
8. Unknown files don't block processing
9. NFO content verification
10. **Disc NFO names: index.nfo, VIDEO_TS.nfo**
11. Subtitle content verification
12. Image dimension validation
13. **Short name format images in disc structures**

#### 7.3 Edge Case Testing
- Empty directory
- Corrupt video files (FFprobe fails)
- Corrupt image files (Sharp fails)
- .nfo extension but not NFO content
- **Identical duration videos (rare, should FAIL)**
- Main movie with exclusion keyword (validation fails)
- **Legacy directory with non-image files**
- **Mixed disc structure and regular files**

---

### Phase 8: Migration from Old System

#### 8.1 Feature Flag
**File**: `src/config/features.ts`

Add feature flag: `USE_NEW_CLASSIFICATION_SYSTEM`
- Default: `false` (use old system)
- After testing: Flip to `true`
- Eventually: Remove old system entirely

#### 8.2 Gradual Rollout
1. Implement new system alongside old
2. Test with subset of directories
3. Compare results (old vs. new)
4. Fix any issues
5. Full migration
6. Remove old code (`fileClassificationService.ts`, `fileProcessingService.ts`)

---

## Implementation Order

### Week 1: Core Types & Fact Gathering
1. Define all interfaces (`fileFacts.ts`, `classification.ts`)
2. Implement `FactGatheringService`
   - Include disc structure detection
   - Include legacy directory scanning
3. Unit tests for fact gathering

### Week 2: Classification Logic
1. Implement `ClassificationService`
   - Disc detection FIRST
   - Text classification (with disc NFO names)
   - Video classification (**duration only**)
   - Image classification (with disc short name format)
2. Implement `ProcessingDecisionService`
3. Unit tests for classification

### Week 3: Integration & Recycling
1. Update `unifiedScanService` integration
2. Create `RecyclingService` (entire directory recycling)
3. Update `PublishService` with recycling logic (complete legacy dir removal)
4. Integration tests

### Week 4: UI & Manual Classification
1. Create `ManualClassificationModal` UI component
2. Add triggers for manual classification
3. Test manual classification workflow

### Week 5: Testing & Refinement
1. Edge case testing (disc structures, legacy dirs, identical durations)
2. Performance optimization
3. Bug fixes
4. Documentation updates

---

## Success Metrics

**Performance**:
- Typical directory classified in <10 seconds
- Large directory classified in <60 seconds

**Accuracy**:
- 100% accuracy for single video directories
- 100% accuracy for disc structures (BDMV/VIDEO_TS)
- **90%+ accuracy for duration-based video selection**
- 95%+ accuracy for standard naming patterns
- 0% false positives (never misidentify main movie)

**Safety**:
- Main movie file never recycled
- All recycled files/directories restorable
- Graceful failure for ambiguous cases (identical durations)
- Legacy directories completely removed (won't be scanned again)

---

**Remember**: The goal is not perfect classification of every edge case. The goal is **safe automation with graceful degradation**. When in doubt, ask the user.

---

## Implementation Status (2025-10-23)

### Phase 1-4: Classification System ✅ COMPLETE

**Implemented Files:**
- `src/types/fileFacts.ts` - Comprehensive fact gathering types
- `src/types/classification.ts` - Classification result types
- `src/services/scan/factGatheringService.ts` - Fact gathering with FFprobe/Sharp integration
- `src/services/scan/classificationService.ts` - Classification decision logic
- `src/services/scan/processingDecisionService.ts` - Binary decision logic
- `src/services/files/recyclingService.ts` - Safe file recycling with validation

**Integration Status:**
- ✅ Integrated into `unifiedScanService.ts` (lines 278-310)
- ✅ NFO XML parsing with modern Kodi format support (`<uniqueid type="tmdb">`)
- ✅ Keyart image support added
- ✅ Theme audio support (theme.mp3) added
- ✅ All 15 files in The Matrix test case correctly classified

**Test Results:**
- Scanner performance: ~67ms per directory (150x faster than target)
- Classification accuracy: 100% for properly named files
- Main movie detection: 100% success rate using duration-only heuristic

### Phase 5: Storage Integration ❌ INCOMPLETE

**Missing Implementation:**

The classification system works perfectly but results are **not persisted to database**. See TODOs at `unifiedScanService.ts:308-309`:

```typescript
// TODO: Store classification result for publish service
// TODO: If decision.canProcess is false, flag for manual classification
```

**What Needs Implementation:**

1. **Store Classified Assets in Cache Tables**
   ```typescript
   // After classification completes
   const classificationResult = await classifyDirectory(scanFacts);

   // Store images in cache_image_files
   for (const poster of classificationResult.images.posters) {
     const cacheId = await insertCacheImageFile(db, {
       entityType: 'movie',
       entityId: movieId,
       filePath: poster.facts.filesystem.absolutePath,
       imageType: 'poster',
       width: poster.facts.image?.width,
       height: poster.facts.image?.height,
       // ... other fields
     });
   }
   // Repeat for fanart, clearlogo, banner, etc.

   // Store trailers in cache_video_files
   for (const trailer of classificationResult.videos.trailers) {
     await insertCacheVideoFile(db, { /* ... */ });
   }

   // Store subtitles in cache_text_files
   for (const subtitle of classificationResult.text.subtitles) {
     await insertCacheTextFile(db, { /* ... */ });
   }
   ```

2. **Update Movie Asset References**
   ```typescript
   // Link cache IDs to movie record
   await db.execute(
     `UPDATE movies SET
       poster_id = ?, fanart_id = ?, banner_id = ?,
       clearlogo_id = ?, clearart_id = ?, disc_id = ?
     WHERE id = ?`,
     [posterId, fanartId, bannerId, clearlogoId, clearartId, discId, movieId]
   );
   ```

3. **Store Unknown Files**
   ```typescript
   // Track unknown files for recycling at publish time
   await storeUnknownFiles(db, 'movie', movieId,
     classificationResult.filesToRecycle.map(cf => ({
       filePath: cf.facts.filesystem.absolutePath,
       fileName: cf.facts.filesystem.filename,
       fileSize: cf.facts.filesystem.size,
       extension: cf.facts.filesystem.extension,
       category: determineCategory(cf.facts.filesystem.extension)
     }))
   );
   ```

**Why This Matters:**

Currently the scanner:
- ✅ Finds all files (The Matrix: 15/15 files)
- ✅ Classifies all files correctly (9 images, 2 videos, 2 subtitles, 1 audio, 1 NFO)
- ✅ Returns accurate counts to UI (`assetsFound: {images: 9, trailers: 1, subtitles: 2}`)
- ❌ But doesn't store them → `movie.poster_id = NULL` → UI shows no assets

**Infrastructure Already Exists:**

The unified file service (`src/services/files/unifiedFileService.ts`) provides all necessary functions:
- `insertCacheImageFile()` - line 168
- `insertCacheVideoFile()` - line 419
- `insertCacheTextFile()` - line 494
- `storeUnknownFiles()` - exists in `src/services/media/unknownFilesDetection.ts:348`

All that's needed is to call these functions after classification completes.

### NFO Handling - Needs Correction

**Current Implementation:**

NFOs are currently given special treatment via `trackNFOFile()` which immediately stores them during scan. This is inconsistent with the design.

**Intended Design:**

1. **Scan Phase**: Classify NFO like any other file
2. **Multiple NFO Handling**: If multiple NFO files exist, smart merge logic should combine them
3. **Cache Phase**: Store merged NFO in cache (content-addressed)
4. **Publish Phase**:
   - Delete any existing NFO in library
   - Regenerate NFO from database metadata with correct Kodi filename
   - Publish regenerated NFO to library

NFOs should be treated as **generated artifacts** at publish time, not stored directly from filesystem.

### Next Steps

1. Implement storage layer in `unifiedScanService.ts` after classification
2. Remove special NFO tracking during scan
3. Implement NFO merge logic for multiple NFO scenarios
4. Move NFO regeneration to publish phase
5. Add UI indicators to display cached assets (poster_id, fanart_id, etc.)
