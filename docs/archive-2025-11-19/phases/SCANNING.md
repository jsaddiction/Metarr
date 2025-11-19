# Scanning Phase

**Purpose**: Discover and classify files in media directories, building Metarr's understanding of the library state.

**Related Docs**:
- Parent: [Phase Overview](OVERVIEW.md)
- Related: [NFO Parsing](../reference/NFO_FORMAT.md), [Database Schema](../architecture/DATABASE.md)

## Quick Reference

- **Only mandatory phase**: All other phases optional
- **Non-destructive**: Never deletes or modifies files
- **Idempotent**: Safe to run multiple times
- **Incremental**: Can scan single directories or entire libraries
- **Chainable**: Always triggers enrichment phase (or passes through if disabled)

---

## Overview

Scanning is the foundational phase of Metarr. It discovers what media exists in the library, classifies files by type (video, image, subtitle, metadata), and prepares entities for enrichment.

Unlike other phases, scanning is always enabled and serves as the entry point for all automated workflows.

---

## Triggers

| Trigger Type | Description | Priority |
|--------------|-------------|----------|
| **Manual** | User clicks "Scan Library" or "Scan Directory" | 10 (HIGH) |
| **Webhook** | Radarr/Sonarr sends import/download notification | 8 (URGENT) |
| **Scheduled** | Daily/weekly full library scan (configurable) | 5 (NORMAL) |

---

## Process Flow

```
1. DIRECTORY DISCOVERY
   ├── Identify media directories from configured libraries
   ├── Detect movie vs TV series structure (single file vs multi-episode)
   ├── Apply ignore patterns (skip .actors/, @eaDir, etc.)
   └── Queue directories for processing

2. FILE CLASSIFICATION
   ├── Gather facts (FFprobe for video, Sharp for images, file read for text)
   ├── Classify by type (movie, trailer, poster, fanart, nfo, subtitle)
   ├── Determine confidence level (high = auto-process, low = manual review)
   └── Extract identifiers (TMDB ID, IMDB ID from NFO or filename)

3. DATABASE UPDATE
   ├── Create or update media records (movies, episodes)
   ├── Store stream information (video, audio, subtitle tracks)
   ├── Preserve existing field locks (don't overwrite user edits)
   └── Mark entities as 'discovered' (ready for enrichment)

4. CACHE SYNC
   ├── Copy new assets to cache (content-addressed storage)
   ├── Calculate SHA256 hashes and perceptual hashes for images
   ├── Update cache references in database
   └── Skip unchanged files (hash comparison)

5. NEXT PHASE TRIGGER
   └── Create enrichment job for discovered/updated entities
```

---

## File Classification

### Confidence Model

Scanning assigns a confidence score (0-100) to each classification:

- **≥80% confidence**: Process automatically
- **<80% confidence**: Flag for manual review
- **Minimum requirement**: Main media file + provider ID (TMDB or IMDB)

### Classification Categories

**Media Files** (video_files table):
- **Main movie**: Largest and longest video file in directory
- **Trailer**: Secondary video when only two videos exist, or filename contains "-trailer"
- **Extras**: Behind-the-scenes, deleted scenes, featurettes
- **Samples**: Keyword "sample" or duration <2 minutes

**Image Assets** (cache_image_files table):
- **Poster**: 2:3 aspect ratio (e.g., 2000x3000)
- **Fanart**: 16:9 landscape (e.g., 1920x1080)
- **Banner**: Wide 5:1+ ratio
- **Logo**: Transparent PNG with alpha channel
- **Disc art**: Square 1:1 ratio

**Metadata Files**:
- **NFO**: Kodi XML format (parsed for provider IDs, title, year)
- **Subtitles**: .srt, .ass, .vtt files (stored for publishing)

**Ignored During Scan**:
- **.actors/ directories**: Actor processing deferred to enrichment phase
- **Temporary files**: .tmp, .part, .download
- **System files**: .DS_Store, Thumbs.db, desktop.ini
- **User-defined patterns**: Configurable via ignore_patterns table

---

## Implementation Details

### Fact Gathering (Phase 1)

Scanning collects objective facts about each file:

```typescript
interface FileFacts {
  // Filesystem
  path: string;
  size: number;
  modified: Date;

  // Video (FFprobe)
  duration?: number;
  videoStreams?: VideoStream[];
  audioStreams?: AudioStream[];
  subtitleStreams?: SubtitleStream[];

  // Image (Sharp)
  dimensions?: { width: number; height: number };
  aspectRatio?: number;
  hasAlpha?: boolean;

  // Text content (NFO)
  containsTmdbId?: boolean;
  containsImdbId?: boolean;
  extractedTitle?: string;
  extractedYear?: number;
}
```

### Classification Logic (Phase 2)

Files are classified using heuristics:

```typescript
// Main movie identification
if (video.duration > 600 && video.sizeRank === 1) {
  return { type: 'movie', confidence: 0.95 };
}

// Trailer detection
if (filename.includes('-trailer') || (video.duration < 300 && video.duration > 30)) {
  return { type: 'trailer', confidence: 0.85 };
}

// Poster detection
if (image.aspectRatio > 0.6 && image.aspectRatio < 0.75) {
  return { type: 'poster', confidence: 0.9 };
}

// NFO detection
if (ext === '.nfo' && content.includes('<movie>') && content.includes('</movie>')) {
  return { type: 'nfo', confidence: 1.0 };
}
```

### Database Operations (Phase 3)

Scanning creates or updates entity records:

```typescript
// Check if movie exists by file path
const existing = await db.movies.findByPath(filePath);

if (existing) {
  // Update only if file changed (size, hash, mtime)
  if (existing.fileSize !== facts.size || existing.fileHash !== facts.hash) {
    await updateMovie(existing.id, {
      fileSize: facts.size,
      fileHash: facts.hash,
      duration: facts.duration,
      // Stream data updated
    });
  }
} else {
  // Create new record
  await createMovie({
    path: filePath,
    title: extractedTitle || path.basename(filePath),
    year: extractedYear,
    tmdb_id: extractedTmdbId,
    imdb_id: extractedImdbId,
    identification_status: 'discovered',
    monitored: true, // Default: monitored (enrichment enabled)
  });
}
```

---

## Kodi Naming Pattern Recognition

Scanning recognizes standard Kodi naming conventions:

### Movie Examples

```
The Matrix (1999)/
  ├── The Matrix (1999).mkv          → Main movie
  ├── The Matrix (1999)-trailer.mp4  → Trailer
  ├── poster.jpg                      → Poster (primary)
  ├── fanart.jpg                      → Fanart (primary)
  ├── clearlogo.png                   → Clear logo
  ├── The Matrix (1999).nfo           → NFO metadata
  ├── The Matrix (1999).en.srt        → English subtitles
  └── .actors/                        → Ignored (processed in enrichment)
```

### Pattern Matching

```typescript
const KODI_PATTERNS = {
  poster: /^poster\d*\.(jpg|png)$/i,
  fanart: /^fanart\d*\.(jpg|png)$/i,
  clearlogo: /^clearlogo\.(png)$/i,
  banner: /^banner\.(jpg|png)$/i,
  trailer: /-trailer\.(mp4|mkv|avi)$/i,
  nfo: /\.(nfo)$/i,
  subtitle: /\.(srt|ass|vtt)$/i,
};
```

---

## Job Outputs

Upon successful scan completion:

1. **Database Records Created/Updated**:
   - `movies` table: Entity records with identification_status='discovered'
   - `video_streams` table: Video/audio/subtitle track details
   - `cache_image_files` table: Discovered assets copied to cache
   - `nfo_metadata` table: Parsed NFO content (if present)

2. **Next Phase Job Created**:
   - Job type: 'enrichment'
   - Payload: `{ entityId, entityType: 'movie', manual: false }`
   - Priority: Inherits from scan job (HIGH for manual, NORMAL for scheduled)

3. **Progress Events Emitted** (WebSocket):
   - `scan.progress`: Real-time scanning progress
   - `scan.complete`: Final counts and duration
   - `scan.error`: Per-file errors (non-fatal)

---

## Configuration

```typescript
interface ScanningConfig {
  // Performance
  concurrentDirs: number; // Parallel directory scanning (default: 5)
  ffprobeTimeout: number; // FFprobe timeout in ms (default: 30000)

  // File filters
  videoExtensions: string[]; // ['.mkv', '.mp4', '.avi', '.m4v']
  imageExtensions: string[]; // ['.jpg', '.png', '.webp']
  ignorePatterns: string[]; // ['*.txt', '.actors', '@eaDir', '*.nfo-orig']

  // Behavior
  updateExisting: boolean; // Update existing records (default: true)
  skipUnchanged: boolean; // Skip files with matching hash (default: true)
}
```

**Configuration via UI**: Settings → General → Scanning
**Configuration via API**: `GET/PATCH /api/v1/settings/scanning`

---

## Error Handling

| Error Type | Behavior |
|------------|----------|
| **Missing directory** | Log warning, skip to next directory |
| **FFprobe timeout** | Mark video as "needs manual review", continue |
| **Corrupted video** | Store minimal info (path, size), flag for user |
| **Permission denied** | Log error, queue for retry, alert user |
| **Invalid NFO** | Log warning, skip NFO parsing, continue scan |
| **Image read error** | Log warning, skip asset, continue scan |

**Non-fatal errors** allow scanning to continue. User can review flagged items in UI.

---

## Performance Considerations

### Large Libraries (>10k items)

- **Concurrent processing**: Default 5 directories in parallel
- **Incremental scanning**: Only process changed files (hash comparison)
- **Progress reporting**: WebSocket updates every 100 items
- **Resource limits**: FFprobe timeout prevents hangs on corrupted files

### Initial Scan

First scan of a library is slowest (all files analyzed):
- **1000 movies**: ~10-15 minutes
- **10000 movies**: ~90-120 minutes

Subsequent scans are much faster (only changed files processed):
- **1000 movies**: ~2-3 minutes (if few changes)
- **10000 movies**: ~10-20 minutes (if few changes)

---

## Hash-Based Change Detection

Scanning uses SHA256 hashes to detect file changes:

```typescript
async function scanFile(filePath: string): Promise<void> {
  // Check if file exists in database
  const existing = await db.findByPath(filePath);

  if (existing) {
    // Calculate current hash
    const currentHash = await calculateSHA256(filePath);

    if (currentHash === existing.fileHash) {
      // File unchanged - skip processing
      logger.debug('File unchanged, skipping', { filePath });
      return;
    }

    // Hash mismatch - file changed
    logger.info('File changed, re-processing', { filePath });
  }

  // Process new or changed file
  await analyzeAndStore(filePath);
}
```

This optimization dramatically speeds up rescans of large libraries.

---

## Next Phase

Upon completion, scanning **always** triggers the [Enrichment Phase](ENRICHMENT.md) by creating an enrichment job. If enrichment is disabled in workflow configuration, the job passes through immediately to the publishing phase.

**Chain**: Scan → Enrichment (or pass-through) → Publishing → Player Sync

---

## See Also

- [Phase Overview](OVERVIEW.md) - Phase system architecture
- [Enrichment Phase](ENRICHMENT.md) - Metadata fetch and asset selection
- [NFO Format](../reference/NFO_FORMAT.md) - Kodi NFO structure
- [Database Schema](../architecture/DATABASE.md) - Data model for scanned items
- [Ignore Patterns](../reference/IGNORE_PATTERNS.md) - File exclusion rules
