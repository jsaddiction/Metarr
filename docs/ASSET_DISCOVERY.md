# Asset Discovery and Management Reference

This document provides comprehensive reference for discovering, processing, and managing media assets (images, trailers, subtitles) in Metarr.

## Overview

Metarr uses a **unified scanning process** to discover all assets in a single pass, ensuring atomic database updates and consistent state. Assets are discovered via filesystem scanning with cache-first backup architecture.

### Core Principles

1. **Database is authoritative** - NFO URLs are ignored, local files are the source of truth when building library
2. **Cache-first backup** - All assets copied to cache immediately to protect against media manager deletions
3. **Kodi 21 compliance** - Flat numbered files (poster1.jpg not poster01.jpg), max ~20 per type
4. **Legacy migration** - extrafanart/, extraposters/ directories migrated during rebuild
5. **Unknown file tracking** - Unrecognized files tracked for user resolution
6. **One trailer per media** - Maximum ONE local trailer file per movie/episode/series

---

## Unified Scan Process

When scanning a media directory (webhook, library scan, or manual rescan), Metarr performs the following steps **atomically**:

```typescript
async function unifiedScan(mediaPath: string, entityType: string, entityId: number) {
  const results = {
    nfo: null,
    streamDetails: null,
    images: [],
    trailers: [],
    subtitles: [],
    unknownFiles: [],
  };

  // Step 1: Parse NFO (skip URL elements)
  const nfoFile = await findNFO(mediaPath);
  if (nfoFile) {
    results.nfo = await parseNFO(nfoFile); // See NFO_PARSING.md
  }

  // Step 2: Scan stream details (FFprobe)
  const mediaFile = await findMediaFile(mediaPath);
  if (mediaFile) {
    results.streamDetails = await scanStreamDetails(mediaFile); // See STREAM_DETAILS.md
  }

  // Step 3: Discover image assets
  results.images = await discoverImages(mediaPath, entityType, entityId);

  // Step 4: Discover trailer files
  results.trailers = await discoverTrailers(mediaPath, entityType, entityId);

  // Step 5: Discover subtitle files
  results.subtitles = await discoverSubtitles(mediaPath);

  // Step 6: Detect unknown files
  results.unknownFiles = await detectUnknownFiles(mediaPath, entityType, entityId);

  // Step 7: Atomic database commit (all or nothing)
  await db.transaction(async () => {
    if (results.nfo) await updateMetadata(entityId, results.nfo);
    if (results.streamDetails) await updateStreamDetails(entityId, results.streamDetails);
    await updateImages(entityId, results.images);
    await updateTrailers(entityId, results.trailers);
    await updateSubtitles(entityId, results.subtitles);
    await updateUnknownFiles(entityId, results.unknownFiles);
  });

  return results;
}
```

---

## Image Discovery

### Kodi 21 File Patterns

**Standard Patterns:**

- `poster.{jpg,png}` - Primary poster
- `poster{N}.{jpg,png}` - Additional posters (N = 1-19, **NOT zero-padded**)
- `fanart.{jpg,png}` - Primary fanart
- `fanart{N}.{jpg,png}` - Additional fanarts (N = 1-19, **NOT zero-padded**)
- `banner.{jpg,png}` - Banner image
- `clearlogo.{png}` - Clear logo (transparent background)
- `clearart.{png}` - Clear art (transparent background)
- `disc.{png}`, `discart.{png}` - Disc artwork
- `landscape.{jpg,png}`, `thumb.{jpg,png}` - Landscape/thumbnail images
- `keyart.{jpg,png}` - Key art

**Actor Images:**

- `.actors/{actor_name}.{jpg,png}` - Actor headshots in `.actors/` subdirectory

**Legacy Patterns (Migrated):**

- `extrafanart/*.{jpg,png}` - Legacy fanart directory (Kodi <21)
- `extraposters/*.{jpg,png}` - Legacy poster directory (Kodi <21)

### Discovery Algorithm

```typescript
async function discoverImages(
  mediaPath: string,
  entityType: string,
  entityId: number
): Promise<DiscoveredImage[]> {
  const discovered: DiscoveredImage[] = [];

  // 1. Standard image files
  const imageFiles = await glob(path.join(mediaPath, '*.{jpg,png}'));

  for (const file of imageFiles) {
    const fileName = path.basename(file);
    const imageType = detectImageType(fileName);

    if (imageType) {
      discovered.push({
        file_path: file,
        image_type: imageType,
        entity_type: entityType,
        entity_id: entityId,
      });
    }
  }

  // 2. Actor images (.actors/ directory)
  const actorDir = path.join(mediaPath, '.actors');
  if (await fs.exists(actorDir)) {
    const actorFiles = await glob(path.join(actorDir, '*.{jpg,png}'));

    for (const file of actorFiles) {
      const actorName = path.basename(file, path.extname(file));

      discovered.push({
        file_path: file,
        image_type: 'actor',
        entity_type: 'actor',
        entity_id: await getOrCreateActor(actorName), // Link to actor entity
      });
    }
  }

  // 3. Legacy directories (if present)
  const legacyFanart = await discoverLegacyImages(mediaPath, 'extrafanart', 'fanart');
  const legacyPosters = await discoverLegacyImages(mediaPath, 'extraposters', 'poster');

  discovered.push(...legacyFanart, ...legacyPosters);

  // 4. Copy all to cache immediately (backup)
  for (const image of discovered) {
    const cacheFileName = `${image.image_type}_${generateHash()}${path.extname(image.file_path)}`;
    const cachePath = `/cache/images/${entityId}/${cacheFileName}`;

    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await copyFile(image.file_path, cachePath);

    image.cache_path = cachePath;
  }

  // 5. Calculate perceptual hashes
  for (const image of discovered) {
    image.perceptual_hash = await calculatePerceptualHash(image.cache_path);
  }

  // 6. Filter duplicates (90% similarity threshold)
  const unique = filterDuplicates(discovered);

  return unique;
}
```

### Image Type Detection

```typescript
function detectImageType(fileName: string): string | null {
  const patterns = [
    { regex: /^poster(\d{1,2})?\.(jpg|png)$/i, type: 'poster' },
    { regex: /^fanart(\d{1,2})?\.(jpg|png)$/i, type: 'fanart' },
    { regex: /^banner\.(jpg|png)$/i, type: 'banner' },
    { regex: /^clearlogo\.png$/i, type: 'clearlogo' },
    { regex: /^clearart\.png$/i, type: 'clearart' },
    { regex: /^disc(art)?\.(png)$/i, type: 'discart' },
    { regex: /^landscape\.(jpg|png)$/i, type: 'landscape' },
    { regex: /^thumb\.(jpg|png)$/i, type: 'landscape' },
    { regex: /^keyart\.(jpg|png)$/i, type: 'keyart' },
  ];

  for (const { regex, type } of patterns) {
    if (regex.test(fileName)) {
      return type;
    }
  }

  return null;
}
```

### Legacy Directory Migration

**Detection:**
Check for `extrafanart/` and `extraposters/` directories during scan.

**Migration Process (During Rebuild):**

```typescript
async function migrateLegacyImages(mediaPath: string, entityId: number): Promise<void> {
  const legacyDirs = [
    { dir: 'extrafanart', type: 'fanart' },
    { dir: 'extraposters', type: 'poster' },
  ];

  for (const { dir, type } of legacyDirs) {
    const legacyPath = path.join(mediaPath, dir);

    if (await fs.exists(legacyPath)) {
      const files = await glob(path.join(legacyPath, '*.{jpg,png}'));

      // Get existing images of this type
      const existingImages = await db.getImages(entityId, type);

      for (const file of files) {
        // Calculate pHash
        const pHash = await calculatePerceptualHash(file);

        // Check for duplicates against existing
        const isDuplicate = existingImages.some(
          img => calculateSimilarity(pHash, img.perceptual_hash) > 90
        );

        if (!isDuplicate) {
          // Find next available index
          const nextIndex = getNextImageIndex(entityId, type);
          const extension = path.extname(file);
          const newFileName =
            nextIndex === 0 ? `${type}${extension}` : `${type}${nextIndex}${extension}`;

          const newPath = path.join(mediaPath, newFileName);

          // Copy to standard location (don't move, in case rebuild fails)
          await copyFile(file, newPath);

          // Add to database
          await db.insertImage({
            entity_type: 'movie',
            entity_id: entityId,
            image_type: type,
            library_path: newPath,
            cache_path: await cacheImage(newPath, entityId, type),
            perceptual_hash: pHash,
          });
        }
      }

      // Delete legacy directory after successful migration
      await fs.rmdir(legacyPath, { recursive: true });
    }
  }
}
```

### Perceptual Hash Deduplication

```typescript
async function filterDuplicates(images: DiscoveredImage[]): Promise<DiscoveredImage[]> {
  const unique: DiscoveredImage[] = [];
  const seenHashes: string[] = [];

  for (const image of images) {
    let isDuplicate = false;

    for (const seenHash of seenHashes) {
      const similarity = calculateSimilarity(image.perceptual_hash, seenHash);

      if (similarity > 90) {
        // 90% similarity threshold
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      unique.push(image);
      seenHashes.push(image.perceptual_hash);
    }
  }

  return unique;
}

function calculateSimilarity(hash1: string, hash2: string): number {
  const hammingDistance = calculateHammingDistance(hash1, hash2);
  const maxDistance = hash1.length * 4; // 4 bits per hex char
  return ((maxDistance - hammingDistance) / maxDistance) * 100;
}
```

---

## Trailer Discovery

### File Patterns

**Standard Patterns:**

- `{movie_name}-trailer.{mkv,mp4,avi,mov}`
- `trailer.{mkv,mp4,avi,mov}`
- `{movie_name}-trailer1.{mkv,mp4,avi,mov}` (if multiple found, use first)

**TV Shows:**

- Series-level only: `/path/to/series/trailer.mkv`
- **NOT per-episode**: Episode trailers are not supported

### Discovery Algorithm

```typescript
async function discoverTrailers(
  mediaPath: string,
  entityType: string,
  entityId: number
): Promise<DiscoveredTrailer | null> {
  // ONE trailer per movie/series (enforced by database UNIQUE constraint)

  const trailerPatterns = ['*-trailer.{mkv,mp4,avi,mov}', 'trailer.{mkv,mp4,avi,mov}'];

  const trailerFiles = await glob(trailerPatterns.map(p => path.join(mediaPath, p)));

  if (trailerFiles.length === 0) {
    return null;
  }

  if (trailerFiles.length > 1) {
    console.warn(`Multiple trailer files found in ${mediaPath}, using first: ${trailerFiles[0]}`);
  }

  const trailerFile = trailerFiles[0];

  // Extract metadata using FFprobe
  const metadata = await ffprobe(trailerFile);

  return {
    entity_type: entityType,
    entity_id: entityId,
    file_path: trailerFile,
    file_size: (await fs.stat(trailerFile)).size,
    duration_seconds: Math.floor(metadata.format.duration),
    resolution: detectResolution(metadata.streams[0].width, metadata.streams[0].height),
    codec: metadata.streams[0].codec_name,
  };
}

function detectResolution(width: number, height: number): string {
  if (height >= 2160) return '2160p';
  if (height >= 1080) return '1080p';
  if (height >= 720) return '720p';
  if (height >= 480) return '480p';
  return `${height}p`;
}
```

### Database Storage

```sql
-- One-to-one relationship (UNIQUE constraint)
CREATE TABLE trailers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,      -- 'movie', 'series' (NOT 'episode')
  entity_id INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  duration_seconds INTEGER,
  resolution TEXT,                -- '1080p', '720p', '2160p', etc.
  codec TEXT,                     -- h264, hevc, etc.
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(entity_type, entity_id)  -- Only ONE trailer per entity
);
```

### NFO Trailer Policy

**CRITICAL:** Trailer URLs in NFO are **NEVER** parsed or written.

**Reason:** YouTube plugin URLs in NFO cause Kodi to navigate to URL instead of playing local file. URLs may be outdated or geoblocked.

**NFO Generation:**

- `<trailer>` element is **OMITTED** from generated NFOs
- Kodi discovers local trailers via filename patterns independently
- No URL elements written to prevent stale links

See `@docs/NFO_PARSING.md` for complete URL elements policy.

---

## Subtitle Discovery

### External Subtitle Patterns

**File Patterns:**

- `{movie_name}.{lang}.{srt,ass,sub,ssa}`
- `{movie_name}.{lang}.forced.{srt,ass,sub,ssa}`
- `{movie_name}.{lang}.sdh.{srt,ass,sub,ssa}`

**Language Detection:**

- ISO 639-2 codes: `eng`, `spa`, `fra`, `deu`, `ita`, etc.
- Full names: `english`, `spanish`, `french`, `german`, `italian`

### Discovery Algorithm

```typescript
async function discoverSubtitles(mediaPath: string): Promise<DiscoveredSubtitle[]> {
  const subtitles: DiscoveredSubtitle[] = [];

  const subtitleFiles = await glob(path.join(mediaPath, '*.{srt,ass,sub,ssa}'));

  for (const file of subtitleFiles) {
    const fileName = path.basename(file);
    const match = fileName.match(/\.([a-z]{3}|[a-z]+)\.(forced\.)?(sdh\.)?([a-z]+)$/i);

    const language = match ? normalizeLanguage(match[1]) : null;
    const isForced = match ? !!match[2] : false;
    const isSDH = match ? !!match[3] : false;
    const codec = path.extname(file).slice(1); // srt, ass, sub, ssa

    subtitles.push({
      file_path: file,
      language: language || 'und', // 'und' = undetermined
      codec,
      is_external: true,
      is_forced: isForced,
      is_default: false,
      stream_index: null, // External subtitles have no stream index
    });
  }

  return subtitles;
}

function normalizeLanguage(lang: string): string {
  const langMap: Record<string, string> = {
    english: 'eng',
    spanish: 'spa',
    french: 'fra',
    german: 'deu',
    italian: 'ita',
    // ... full ISO 639-2 mapping
  };

  return langMap[lang.toLowerCase()] || lang.toLowerCase();
}
```

### Database Storage

External subtitles are stored alongside embedded subtitles in `subtitle_streams` table:

```sql
CREATE TABLE subtitle_streams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,      -- 'movie', 'episode'
  entity_id INTEGER NOT NULL,
  stream_index INTEGER,           -- NULL for external subtitles
  language TEXT,                  -- ISO 639-2 (eng, spa, fra, etc.)
  codec TEXT,                     -- subrip, ass, pgs, vobsub, etc.
  title TEXT,                     -- Stream title/description
  is_external BOOLEAN DEFAULT 0,  -- TRUE for .srt files
  file_path TEXT,                 -- Path to external subtitle file
  is_default BOOLEAN DEFAULT 0,
  is_forced BOOLEAN DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(entity_type, entity_id, stream_index, file_path)
);
```

---

## Unknown File Detection

### Known Pattern Registry

```typescript
const KNOWN_PATTERNS = [
  // NFO files
  /^(movie|tvshow)\.nfo$/i,
  /^.*\.nfo$/i,

  // Media files
  /^.*\.(mkv|mp4|avi|mov|wmv|flv|webm)$/i,

  // Images
  /^poster(\d{1,2})?\.(jpg|png)$/i,
  /^fanart(\d{1,2})?\.(jpg|png)$/i,
  /^banner\.(jpg|png)$/i,
  /^clearlogo\.png$/i,
  /^clearart\.png$/i,
  /^disc(art)?\.(png)$/i,
  /^landscape\.(jpg|png)$/i,
  /^thumb\.(jpg|png)$/i,
  /^keyart\.(jpg|png)$/i,

  // Trailers
  /^.*-trailer\.(mkv|mp4|avi|mov)$/i,
  /^trailer\.(mkv|mp4|avi|mov)$/i,

  // Subtitles
  /^.*\.(srt|ass|sub|ssa)$/i,

  // Directories
  /^\.actors$/i,
  /^extrafanart$/i, // Legacy (handled separately)
  /^extraposters$/i, // Legacy (handled separately)
];
```

### Detection Algorithm

```typescript
async function detectUnknownFiles(
  mediaPath: string,
  entityType: string,
  entityId: number
): Promise<UnknownFile[]> {
  const allFiles = await fs.readdir(mediaPath, { withFileTypes: true });
  const unknownFiles: UnknownFile[] = [];

  // Get user-configured ignore patterns
  const ignorePatterns = (await db.getConfig('ignore_patterns')) || { patterns: [] };

  for (const file of allFiles) {
    // Skip directories (except legacy dirs which are handled separately)
    if (file.isDirectory()) continue;

    // Check against known patterns
    const isKnown = KNOWN_PATTERNS.some(pattern => pattern.test(file.name));

    if (isKnown) continue;

    // Check against ignore patterns
    const isIgnored = ignorePatterns.patterns.some((pattern: string) =>
      minimatch(file.name, pattern)
    );

    if (isIgnored) continue;

    // File is unknown - add to tracking
    const filePath = path.join(mediaPath, file.name);
    const stats = await fs.stat(filePath);

    unknownFiles.push({
      entity_type: entityType,
      entity_id: entityId,
      file_path: filePath,
      file_name: file.name,
      file_size: stats.size,
      file_extension: path.extname(file.name).slice(1) || null,
      mime_type: await detectMimeType(filePath),
    });
  }

  return unknownFiles;
}
```

### Resolution Workflows

See `@docs/WORKFLOWS.md` for complete unknown file resolution workflows:

- **Delete**: Remove file from filesystem + DELETE from unknown_files table
- **Assign To**: Process as asset (pHash, rename, cache) + DELETE from unknown_files table
- **Add to Ignore Pattern**: Add pattern to config + cleanup matching files + DELETE from unknown_files table

---

## Ignore Patterns Configuration

### Configuration Storage

```typescript
interface IgnorePatternsConfig {
  patterns: string[];  // Glob patterns
}

// Example configuration
{
  "patterns": [
    ".stfolder",           // Syncthing folder
    "*.tmp",               // Temporary files
    "Thumbs.db",           // Windows thumbnails
    ".DS_Store",           // macOS metadata
    "*.part",              // Partial downloads
    "@eaDir",              // Synology metadata
    "*.!qB",               // qBittorrent temp files
    "sample.*"             // Sample videos
  ]
}
```

### Pattern Matching

Uses `minimatch` library for glob pattern matching:

```typescript
import minimatch from 'minimatch';

function isIgnored(fileName: string, patterns: string[]): boolean {
  return patterns.some(pattern => minimatch(fileName, pattern));
}

// Examples:
isIgnored('.stfolder', ['.stfolder']); // true
isIgnored('sample.mkv', ['sample.*']); // true
isIgnored('movie.tmp', ['*.tmp']); // true
isIgnored('poster.jpg', ['*.tmp']); // false
```

### Adding Ignore Patterns

When user adds ignore pattern from unknown file:

```typescript
async function addIgnorePattern(unknownFileId: number, pattern: string) {
  const file = await db.getUnknownFile(unknownFileId);

  // 1. Add to configuration
  const config = (await db.getConfig('ignore_patterns')) || { patterns: [] };
  config.patterns.push(pattern);
  await db.setConfig('ignore_patterns', config);

  // 2. Cleanup matching unknown files across ALL media
  const allUnknownFiles = await db.query('SELECT * FROM unknown_files');

  for (const unknownFile of allUnknownFiles) {
    if (minimatch(unknownFile.file_name, pattern)) {
      await db.query('DELETE FROM unknown_files WHERE id = ?', [unknownFile.id]);
    }
  }

  console.log(`Ignore pattern '${pattern}' added. Cleaned up ${matchingCount} unknown files.`);
}
```

---

## Cache-First Backup Architecture

### Initial Scan Caching

**All discovered assets are immediately copied to cache:**

```typescript
async function cacheAsset(assetPath: string, entityId: number, assetType: string): Promise<string> {
  const extension = path.extname(assetPath);
  const hash = generateHash();
  const cacheFileName = `${assetType}_${hash}${extension}`;
  const cachePath = `/cache/images/${entityId}/${cacheFileName}`;

  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await copyFile(assetPath, cachePath);

  return cachePath;
}

// Usage during scan:
for (const image of discoveredImages) {
  image.cache_path = await cacheAsset(image.file_path, entityId, image.image_type);
}
```

### Recovery After Deletion

**When library files are missing, restore from cache:**

```typescript
async function recoverMissingAssets(entityId: number): Promise<void> {
  const images = await db.getImages(entityId);

  for (const image of images) {
    const libraryExists = await fs.exists(image.library_path);

    if (!libraryExists) {
      if (image.cache_path && (await fs.exists(image.cache_path))) {
        // Restore from cache (no provider API call)
        await copyFile(image.cache_path, image.library_path);
        console.log(`✅ Recovered ${image.image_type} from cache`);
      } else {
        // Last resort: re-download from provider
        if (image.provider_url) {
          await downloadImage(image.provider_url, image.library_path);
          await copyFile(image.library_path, image.cache_path);
          console.log(`⚠️ Re-downloaded ${image.image_type} from provider`);
        } else {
          console.error(`❌ Cannot recover ${image.image_type}: no cache or provider URL`);
        }
      }
    }
  }
}
```

**Automatic Recovery Triggers:**

- Library scan detects missing files
- Webhook processing detects media manager upgrade deleted assets
- User-initiated "Rebuild Assets" action

---

## Quality and Quantity Filtering

### Completeness Configuration

Per-media-type requirements stored in `completeness_config` table:

```sql
INSERT INTO completeness_config (media_type, required_posters, required_fanart)
VALUES ('movies', 1, 3);  -- 1 poster, 3 fanarts required
```

### Filtering Algorithm

```typescript
async function filterAssetsByQuality(
  assets: DiscoveredImage[],
  entityType: string,
  imageType: string
): Promise<DiscoveredImage[]> {
  // Get configuration
  const config = await db.getCompletenessConfig(entityType);
  const maxCount = config[`required_${imageType}s`];

  // Get already-locked images (preserve user selections)
  const lockedImages = await db.getImages(entityId, imageType, { locked: true });
  const neededCount = maxCount - lockedImages.length;

  if (neededCount <= 0) {
    return []; // Already have enough locked images
  }

  // Sort by quality
  const sorted = assets.sort((a, b) => {
    // Primary: Resolution (width × height)
    const resA = (a.width || 0) * (a.height || 0);
    const resB = (b.width || 0) * (b.height || 0);
    if (resB !== resA) return resB - resA;

    // Secondary: Provider rating (if available)
    return (b.vote_average || 0) - (a.vote_average || 0);
  });

  // Select top N unique assets
  const selected: DiscoveredImage[] = [];
  const seenHashes: string[] = lockedImages.map(img => img.perceptual_hash);

  for (const asset of sorted) {
    if (selected.length >= neededCount) break;

    // Check duplicate against locked + already selected
    const isDuplicate = seenHashes.some(
      hash => calculateSimilarity(asset.perceptual_hash, hash) > 90
    );

    if (!isDuplicate) {
      selected.push(asset);
      seenHashes.push(asset.perceptual_hash);
    }
  }

  return selected;
}
```

### Force Include Bypass

Users can bypass quality/quantity limits when assigning unknown files:

```typescript
async function assignUnknownFile(
  unknownFileId: number,
  assignTo: string,
  forceInclude: boolean = false
) {
  // ... (pHash calculation, duplicate check)

  if (!forceInclude) {
    // Check quantity limit
    const config = await db.getCompletenessConfig(entityType);
    const maxCount = config[`required_${assignTo}s`];
    const currentCount = existingImages.length;

    if (currentCount >= maxCount) {
      throw new Error(`Maximum ${maxCount} ${assignTo}s allowed. Use Force Include to bypass.`);
    }
  }

  // Force include: lock the image to prevent future replacement
  await db.insertImage({
    // ... (other fields)
    locked: forceInclude ? 1 : 0,
  });
}
```

---

## Related Documentation

- **NFO Parsing**: `@docs/NFO_PARSING.md` - NFO file format and URL elements policy
- **Stream Details**: `@docs/STREAM_DETAILS.md` - FFprobe scanning and stream metadata
- **Image Management**: `@docs/IMAGE_MANAGEMENT.md` - Three-tier storage and perceptual hashing
- **Database Schema**: `@docs/DATABASE_SCHEMA.md` - trailers and unknown_files table schemas
- **Workflows**: `@docs/WORKFLOWS.md` - Unified scan process and unknown file resolution
