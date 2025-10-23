# File Scanner Architecture

**Status**: Design Phase (Pre-Implementation)
**Last Updated**: 2025-10-23
**Purpose**: Define robust file classification system for automatic directory scanning

---

## Overview

The File Scanner is responsible for identifying and classifying files within media directories with maximum automation and minimum ambiguity. It must handle diverse user file organization patterns while maintaining 100% safety for the main movie file.

### Core Principle

**"Gather all facts, classify with confidence, handle ambiguity gracefully"**

---

## Two Scanning Modes

### Mode 1: Scanning (Filesystem → Database)
- **Direction**: Library filesystem is source of truth
- **Goal**: Import what we find on disk into cache database
- **Triggers**: User action, webhook (new content added)
- **Safety**: Conservative - require high confidence before classification

### Mode 2: Verifying (Cache → Library)
- **Direction**: Cache database is source of truth
- **Goal**: Make library match what's in cache exactly
- **Triggers**: User action, scheduled maintenance
- **Safety**: Aggressive - remove unauthorized files, restore missing files

### Shared Component: File Classification

Both modes use the same categorization logic to answer: "What IS this file?"

---

## Three-Phase Classification Process

```
Phase 1: Gather Facts
  - Extract ALL metadata from files (FFprobe, Sharp, filesystem)
  - Create in-memory fact objects
  - No assumptions, pure data collection

Phase 2: Classify Files
  - Apply decision tree using gathered facts
  - Generate confidence scores (0-100%)
  - Provide reasoning for classifications

Phase 3: Handle Ambiguity
  - High confidence (≥80%) → Automatic classification
  - Medium confidence (50-79%) → Warn user, proceed with caution
  - Low confidence (<50%) → Require manual intervention
  - Future: Optional Radarr API fallback for 100% accuracy
```

---

## Phase 1: Comprehensive Fact Gathering

### Principle: "We need the data anyway, so gather it all upfront"

Since we must run FFprobe on all video files to extract stream data for the database, and Sharp on all images for dimensions, we should gather ALL available information in a single pass and store it in-memory for classification decisions.

### Fact Categories

#### Filesystem Facts
- Absolute path
- Filename (with and without extension)
- File extension
- File size (bytes)
- Directory path and directory name

#### Video Stream Facts (FFprobe)
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

#### Image Facts (Sharp)
- Width and height (pixels)
- Aspect ratio (calculated)
- Image format (JPEG, PNG, etc.)

#### Text File Facts (File reading)
- Content sample (first 10KB)
- Contains TMDB ID (boolean)
- Contains IMDB ID (boolean)
- Looks like NFO (XML structure or provider IDs)
- Looks like subtitle (timestamp patterns)

#### Filename Pattern Facts (Heuristics)
- Extracted keywords (array)
- Has year pattern (boolean)
- Extracted year (if found)
- Has resolution pattern (boolean)
- Extracted resolution (if found)

#### Relative Facts (Context within directory)
- Is largest file (boolean)
- Is longest duration (boolean)
- Size rank in directory (1 = largest)
- Duration rank in directory (1 = longest)

### Performance Considerations

**FFprobe is required** - We need stream data for database insertion, so performance cost is already accepted.

**Hash calculation** - Can happen during fact gathering or during processing. Placement doesn't matter significantly since we need the hash regardless.

**Parallel processing** - All files should be analyzed concurrently for speed.

---

## Phase 2: Classification Decision Tree

### Video File Classification (Main Movie vs Trailer)

This is the most critical and difficult classification. Main movie file must be identified with 100% certainty to prevent data loss.

#### Hard Rules (100% Confidence)

1. **Webhook hint exists** → Use exact filename from webhook payload
   - Radarr/Sonarr provides exact filename in webhook
   - Zero ambiguity

2. **Single video file in directory** → Must be main movie
   - No other candidates
   - Safe assumption

#### Exclusion Patterns (Trailer Detection)

**Industry Research Findings**:
- MediaElch: Uses exclusion list (`-trailer`, `-sample`, `-behindthescenes`, etc.)
- Kodi: Standard naming `MovieName-trailer.ext` (hyphen, no spaces)
- Jellyfin: Suffix-based `moviename-trailer.mp4`

**Key Issue**: "Short" keyword exclusion breaks valid short films
- Example: "Mater's Tall Tales: a short movie" (15-20 minutes)
- Cannot use blanket duration thresholds (<40 minutes)
- Cannot use filename keyword "short" as disqualifier

**Safer Exclusion Keywords**:
- `trailer` - Strong signal
- `sample` - Strong signal
- `behindthescenes` / `behind-the-scenes`
- `deleted` (deleted scenes)
- `featurette`
- `interview`
- `extras`
- `bonus`

**Confidence Scoring**: Presence of exclusion keywords = 80-90% confidence it's NOT the main movie

#### Positive Signals (Main Movie Detection)

**Relative Analysis Within Directory Context**:

1. **Largest file** (+40 confidence)
   - Main movies generally larger than trailers
   - Relative comparison (not absolute threshold)

2. **Longest duration** (+40 confidence)
   - Main movies generally longer than trailers
   - Relative comparison (not absolute threshold)

3. **Filename matches directory name** (+20 confidence)
   - Common pattern: `/Movie (2024)/Movie.2024.1080p.mkv`
   - Clean directory name compared to clean filename

**Why NOT to use**:
- Absolute file size thresholds (4K trailer could be larger than 480p movie)
- Absolute duration thresholds (short films exist, feature-length trailers exist)
- Resolution (trailers and movies can both be 4K)
- Bitrate (not reliably different)
- Codec (both use modern codecs)
- Video/audio stream presence (both should have streams, or file is corrupt)

#### Ambiguous Cases Requiring Manual Intervention

**Scenario 1**: Two video files, neither has exclusion keywords, similar sizes/durations
- Example: Theatrical cut (2h 10m, 15GB) vs Extended cut (2h 45m, 18GB)
- Neither is a "trailer" - both are valid main movies
- User must choose which to track

**Scenario 2**: Multiple video files with no clear winner
- Example: Multiple versions (4K, 1080p, 720p) of same movie
- User may have multiple quality options
- Need manual classification

**Scenario 3**: Low confidence across all signals
- No single file scores >50% confidence
- Better to fail safely than guess wrong

### Image File Classification

**Easier than video classification** - Dimensions and aspect ratio are reliable signals.

#### Classification Signals

1. **Keyword in filename** (+60 confidence)
   - "poster", "fanart", "banner", "clearart", "logo", etc.

2. **Aspect ratio match** (+30 confidence)
   - Compare to expected ratio with tolerance
   - 10% tolerance: +30 points
   - 25% tolerance: +15 points

3. **Dimension requirements** (+10 confidence)
   - Meets minimum width/height (with 10% tolerance)

**Special Case**: Clearart has wildly varying dimensions
- Wide range of acceptable aspect ratios (higher tolerance needed)
- May require lower confidence threshold

**Threshold**: ≥50% confidence required for automatic classification

### Text File Classification

**Relatively straightforward** - Content analysis and extension-based.

#### NFO Detection
- Extension is `.nfo`
- Contains XML tags (`<movie>`, `<episodedetails>`)
- Contains provider IDs (`tmdbid`, `imdbid`, `tt1234567` pattern)

#### Subtitle Detection
- Extension is `.srt`, `.ass`, `.ssa`, `.vtt`, `.idx`, `.sub`
- Contains timestamp patterns (`00:01:23,456`)
- Contains subtitle format markers (`[Script Info]`)

---

## Phase 3: Ambiguity Handling

### Confidence Thresholds

**High Confidence (80-100%)**:
- Automatic classification
- Proceed with processing
- Log classification reasoning for audit

**Medium Confidence (50-79%)**:
- Warn user in logs
- Proceed with classification but flag for review
- Show warning badge in UI

**Low Confidence (<50%)**:
- **STOP** - Do not guess
- Mark directory as requiring manual review
- Present user with manual classification UI

### Manual Classification UI

**When Triggered**:
- Low confidence classifications detected
- Multiple main movie candidates with no clear winner
- Unknown file types that don't match any pattern

**UI Design Concept**:

Table showing all files in directory:
- Filename
- Size (formatted)
- Duration (for videos)
- Suggested classification (with confidence badge)
- User selection dropdown

Dropdown options:
- Main Movie
- Trailer
- Poster
- Fanart
- Banner
- Logo
- Clearart
- Thumb
- Subtitle
- NFO
- Recycle (delete)
- Ignore (keep but don't track)

User reviews suggestions, corrects as needed, submits classifications.

Backend processes files according to user's manual classifications.

### Future Enhancement: Radarr API Integration

**Concept**: Optional fallback for 100% reliable main movie detection

When enabled and movie has TMDB ID:
1. Query Radarr API: `GET /api/v3/movie?tmdbId={id}`
2. Extract `movieFile.relativePath` from response
3. Use exact filename as 100% confidence main movie

**Benefits**:
- Eliminates ambiguity entirely
- Leverages Radarr's existing file tracking
- Perfect for users already running Radarr

**Considerations**:
- Requires Radarr API configuration
- Only works for movies tracked by Radarr
- Reduces standalone capability (dependency on external service)
- Should remain **optional** - not required for Metarr to function

---

## Safety Mechanisms

### Critical Rule: Never Recycle Main Movie File

**During verification** (cache → library reconciliation):
- Categorize all files in library directory
- Compare to cache expectations
- Remove unauthorized files

**Safety Check**: Before recycling any file, verify it is NOT the main movie file
- Compare against known main movie filename
- If match found, throw error and abort
- Better to fail than delete wrong file

### Dry Run Mode

Before performing destructive operations (file recycling):
- Offer dry run mode
- Show user what WOULD happen
- Require confirmation before proceeding

### User Confirmation for Large Files

If recycling file >1GB:
- Log warning
- Optionally require user confirmation
- Prevents accidental deletion of large files

### Learning from User Corrections

When user manually corrects a classification:
- Log the correction
- Extract discriminating features
- Could inform future ML model training
- Helps identify patterns we missed

---

## Implementation Questions for Future Sessions

### Question 1: Fact Object Structure

Should we create a single `FileFacts` interface, or separate interfaces for different file types?

**Option A**: Single interface with optional fields
```
interface FileFacts {
  // Common fields (always present)
  path, filename, size, extension, ...

  // Video-specific (optional)
  duration?, videoStreams?, audioStreams?, ...

  // Image-specific (optional)
  imageWidth?, imageHeight?, ...

  // Text-specific (optional)
  textContent?, containsTmdbId?, ...
}
```

**Option B**: Type-discriminated union
```
type FileFacts = VideoFileFacts | ImageFileFacts | TextFileFacts | UnknownFileFacts

interface VideoFileFacts extends BaseFileFacts {
  type: 'video';
  duration: number;
  videoStreams: VideoStream[];
  // ... all required
}
```

Which approach provides better type safety and developer experience?

### Question 2: Classification Confidence Tuning

What are the exact confidence thresholds?
- Automatic classification minimum: 80%? 70%? 60%?
- Manual intervention trigger: <50%? <40%?
- Warning threshold: 50-79%? 60-79%?

Should thresholds be:
- **Hardcoded** (simpler, consistent)
- **Configurable** (flexible, user preference)
- **Per-file-type** (different thresholds for videos vs images)

### Question 3: FFprobe Error Handling

What happens if FFprobe fails on a video file?

**Option A**: Fail the entire scan
- Pro: Ensures we have complete data
- Con: One corrupt file blocks entire directory

**Option B**: Skip the file, log warning
- Pro: Resilient to individual file issues
- Con: Might miss important files

**Option C**: Mark file as "needs review"
- Pro: User can investigate manually
- Con: Requires UI for review workflow

### Question 4: Unknown File Handling

Files that don't match any category (confidence = 0):

**During Scan (filesystem → cache)**:
- Option A: Ignore completely (don't track)
- Option B: Track in database with status "unknown"
- Option C: Track and present to user for classification

**During Verify (cache → library)**:
- Option A: Always recycle (strict cache enforcement)
- Option B: Ignore if not in cache (tolerant approach)
- Option C: Ask user what to do

Which aligns with Metarr's philosophy?

### Question 5: Multiple Main Movie Candidates

Two files both score as "main movie" (theatrical + extended cut):

**Option A**: Fail and require manual intervention
- Pro: Safe, no guessing
- Con: Blocks automation

**Option B**: Pick highest score with warning
- Pro: Continues processing
- Con: Might pick wrong version

**Option C**: Track both as separate movies
- Pro: Preserves both
- Con: Kodi doesn't support well, database complexity

**Option D**: User preference setting
- "When multiple candidates found: [fail | pick largest | pick longest | manual]"

What should the default behavior be?

### Question 6: Keyword Extraction Strategy

How should we extract keywords from filenames?

**Current approach**: Pattern matching against known list
- `trailer`, `sample`, `1080p`, `bluray`, etc.

**Alternative**: Tokenization and analysis
- Split filename by delimiters (`.`, `-`, `_`, space)
- Analyze each token
- Build dynamic keyword vocabulary

Which is more maintainable and accurate?

### Question 7: Relative vs Absolute Comparisons

For size and duration comparisons:

**Currently proposed**: Relative analysis within directory
- "This file is 2x larger than the next largest"
- Context-aware, adapts to each directory

**Alternative**: Hybrid approach
- Absolute minimums (file >500MB AND duration >40min)
- Plus relative comparison within directory

Which is more reliable for edge cases?

### Question 8: Classification Reasoning Transparency

How should we present classification reasoning to users?

**Option A**: Log-only (developer debugging)
- Reasons stored in logs
- User sees final classification only

**Option B**: UI display (user transparency)
- Show confidence score as badge
- Tooltip shows reasoning bullets
- Helps user understand automated decisions

**Option C**: Audit trail (database storage)
- Store classification reasoning in database
- Queryable history of decisions
- Helpful for debugging patterns

How much transparency is appropriate?

### Question 9: Performance Optimization

Fact gathering on large directories (100+ files):

**Option A**: Fully parallel (fastest)
- Promise.all() on all files
- Risk: Memory spike, FFprobe process spawning

**Option B**: Batched parallel (controlled)
- Process 10 files at a time
- Balance speed and resource usage

**Option C**: Priority-based (smart)
- Process video files first (most critical)
- Then images, then text files
- Early classification results

Which provides best user experience?

### Question 10: Integration with Existing Code

Current codebase has:
- `fileClassificationService.ts` (coin-sorter two-pass)
- `fileProcessingService.ts` (caching to database)
- `unifiedScanService.ts` (orchestration)

**Migration Strategy**:

**Option A**: Full rewrite
- Replace existing services entirely
- Clean slate, implement new design

**Option B**: Gradual refactor
- Extract shared logic (fact gathering)
- Update classification logic incrementally
- Maintain backward compatibility during transition

**Option C**: Parallel implementation
- Build new system alongside old
- Feature flag to switch between
- A/B test and validate before full migration

Which minimizes risk and maintains stability?

---

## Success Criteria

### Main Movie Detection
- **100% accuracy** when webhook provides filename
- **100% accuracy** for single video file directories
- **95%+ accuracy** for standard naming patterns (exclusion keywords work)
- **Graceful failure** for ambiguous cases (manual intervention, not guessing)

### Image Classification
- **90%+ accuracy** for standard Kodi naming conventions
- **Correct aspect ratio matching** for posters, fanart, banners
- **Flexible tolerance** for clearart (wide variation expected)

### Text Classification
- **100% accuracy** for NFO files (TMDB/IMDB ID detection)
- **100% accuracy** for subtitle files (extension + content pattern)

### Performance
- **Fact gathering** completes in <5 seconds for typical directory (1 movie + 10 assets)
- **Classification** is near-instant (in-memory decision tree)
- **Handles large directories** (100+ files) without timeout

### User Experience
- **Clear confidence indicators** in UI (badge colors, percentages)
- **Understandable reasoning** ("Selected because: largest file, longest duration")
- **Easy manual override** (dropdown selection, submit)
- **No data loss** (never delete main movie file)

---

## Related Documentation

- **[WORKFLOWS.md](WORKFLOWS.md)** - Workflow 3A (Scanning), Workflow 3B (Verification)
- **[DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)** - Cache tables for storing classified assets
- **[WEBHOOKS.md](WEBHOOKS.md)** - Webhook payload structure (includes filename hints)
- **[DESIGN_DECISIONS.md](DESIGN_DECISIONS.md)** - Architectural philosophy

---

## Next Steps

1. **Answer implementation questions** (Questions 1-10 above)
2. **Define exact confidence thresholds** through testing
3. **Design FileFacts interface** with proper TypeScript types
4. **Implement fact gathering service** (FFprobe, Sharp, filesystem)
5. **Implement classification decision tree** with confidence scoring
6. **Build manual classification UI** (React component)
7. **Test against diverse dataset** (various naming patterns, edge cases)
8. **Integrate with existing scan/verify workflows**
9. **Add Radarr API integration** (optional enhancement)

---

**Remember**: The goal is not perfect classification of every edge case. The goal is **safe automation with graceful degradation**. When in doubt, ask the user.
