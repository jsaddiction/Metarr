# Scanning Phase

**Purpose**: Discover and classify files in media directories, building Metarr's understanding of the library state.

**Status**: Design complete, implementation pending

## Overview

The scanning phase is the foundational element of Metarr - it discovers what exists in the media library and classifies it for further processing. This is the only mandatory phase as all other phases depend on knowing what media exists.

## Phase Rules

1. **Idempotent**: Can run multiple times without corruption
2. **Non-destructive**: Never deletes or modifies files
3. **Incremental**: Can scan single directories or entire libraries
4. **Observable**: Emits progress events for UI tracking

## Triggers

- **Manual**: User clicks "Scan Library" or "Scan Directory"
- **Webhook**: Radarr/Sonarr sends import/download notification
- **Scheduled**: Daily/weekly library verification (configurable)
- **Filesystem Watch**: inotify/FSEvents detect new files (future)

## Process Flow

```
1. DIRECTORY DISCOVERY
   ├── Identify media directories
   ├── Check for movie/series structure
   └── Queue directories for processing

2. FILE CLASSIFICATION
   ├── Gather facts (FFprobe, Sharp, file read)
   ├── Classify by type (movie, trailer, poster, etc.)
   └── Determine confidence level

3. DATABASE UPDATE
   ├── Create/update media records
   ├── Store stream information
   ├── Mark for enrichment if needed
   └── Preserve existing locks

4. CACHE SYNC
   ├── Copy new assets to cache
   ├── Calculate SHA256 hashes
   └── Update cache references

5. NEXT PHASE TRIGGER
   └── Create enrichment job (if enabled)
```

## File Classification

### Confidence Model

- **≥80% confidence**: Process automatically
- **<80% confidence**: Flag for manual review
- **Minimum requirement**: Main media file + provider ID

### Classification Categories

**Media Files**
- Main movie/episode (largest video >10min)
- Trailers (keyword-based or <5min)
- Extras (behind-scenes, deleted, featurettes)
- Samples (keyword "sample" or <2min)

**Assets**
- Posters (2:3 aspect ratio images)
- Fanart (16:9 landscape images)
- Logos (transparent PNGs)
- Disc art (square 1:1 images)

**Metadata**
- NFO files (Kodi XML format)
- Subtitles (.srt, .ass, .vtt)
- Chapter files (.xml, .txt)

## Implementation Details

### Fact Gathering (Phase 1)

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

  // Text content
  containsTmdbId?: boolean;
  containsImdbId?: boolean;
  isNfoFormat?: boolean;
}
```

### Classification Logic (Phase 2)

```typescript
// Main movie identification
if (video.duration > 600 && video.sizeRank === 1) {
  return { type: 'movie', confidence: 0.95 };
}

// Trailer detection
if (filename.includes('-trailer') ||
    (video.duration < 300 && video.duration > 30)) {
  return { type: 'trailer', confidence: 0.85 };
}

// Poster detection
if (image.aspectRatio > 0.6 && image.aspectRatio < 0.75) {
  return { type: 'poster', confidence: 0.90 };
}
```

### Database Operations (Phase 3)

```typescript
// Check if movie exists
const existing = await db.movies.findByPath(filePath);

if (existing) {
  // Update only if changed
  if (existing.fileSize !== facts.size) {
    await updateMovie(existing.id, facts);
  }
} else {
  // Create new record
  await createMovie({
    path: filePath,
    title: extractedTitle,
    year: extractedYear,
    identification_status: 'discovered'
  });
}
```

## Configuration

```typescript
interface ScanningConfig {
  // Behavior
  autoEnrich: boolean;        // Trigger enrichment after scan
  minConfidence: number;       // Minimum confidence to process (0.8)

  // Performance
  concurrentDirs: number;      // Parallel directory scanning (5)
  ffprobeTimeout: number;      // FFprobe timeout in ms (30000)

  // Filters
  videoExtensions: string[];   // ['.mkv', '.mp4', '.avi']
  imageExtensions: string[];   // ['.jpg', '.png', '.webp']
  ignorePaths: string[];       // ['@eaDir', '.thumbnails']
}
```

## Error Handling

- **Missing directory**: Log warning, skip to next
- **FFprobe timeout**: Mark as "needs manual review"
- **Corrupted video**: Store minimal info, flag for user
- **Permission denied**: Queue for retry with elevated permissions

## Performance Considerations

- **Large libraries** (>10k items): Use batch processing
- **Network drives**: Increase timeouts, reduce parallelism
- **Initial scan**: Show progress bar with ETA
- **Incremental scans**: Only process changed files (mtime check)

## Related Documentation

- [NFO_PARSING.md](../technical/NFO_PARSING.md) - Kodi NFO format
- [Database Schema](../DATABASE.md) - Data model for scanned items
- [API Architecture](../API.md) - REST endpoints for scanning

## Next Phase

Upon completion, scanning triggers the [Enrichment Phase](ENRICHMENT.md) via job queue (if enabled).