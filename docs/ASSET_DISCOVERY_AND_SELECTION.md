# Asset Discovery and Selection Architecture

**Last Updated**: 2025-10-17
**Status**: Core Design Philosophy

---

## Overview

This document defines one of the most critical design principles in Metarr: **the separation between asset discovery, deduplication, selection, and publishing**. Understanding this workflow is essential to implementing any feature that deals with files (images, videos, subtitles, theme songs).

### Core Principle

> **Discovery finds ALL valid assets. Deduplication identifies matches between local and remote. Selection chooses the BEST assets for publishing. Cache contains ONLY selected assets.**

---

## The Four Phases

### Phase 1: Discovery (Local Scan)

**Purpose**: Build initial inventory from library directories

**When**:

- Initial library scan
- Manual rescan
- Webhook triggers (new downloads)

**What it does**:

1. Walks ALL files in movie directory
2. Skips files matching `ignore_patterns` table
3. For each file:
   - Checks if file exists in database (by `file_path`)
   - If exists: Validates hash → restore from cache if mismatch, skip if match
   - If not exists: Process as new file (validate, copy to cache, create records)
4. Validates files against asset type specs (dimensions, format, naming)
5. Assigns preliminary classification scores
6. Tracks unknown files separately

**What it does NOT do**:

- ❌ Download from providers
- ❌ Make selection decisions
- ❌ Delete any files
- ❌ Update movie FK columns
- ❌ Update cache from library (except copying new files)

**Example**:

```
/movies/Inside Out 2/
├─ Inside Out 2.mkv          → video_files (video_type='main')
├─ poster.jpg                → image_files (image_type='poster', location='cache')
├─ fanart1.jpg               → image_files (image_type='fanart', location='cache')
├─ fanart2.jpg               → image_files (image_type='fanart', location='cache')
├─ Inside Out 2-trailer.mp4  → video_files (video_type='trailer', location='cache')
├─ Inside Out 2.en.srt       → text_files (text_type='subtitle', location='cache')
└─ README.txt                → unknown_files
```

**Database state after discovery**:

```sql
-- 1 poster in cache (no provider metadata yet)
-- 2 fanarts in cache (no provider metadata yet)
-- 1 trailer in cache
-- 1 subtitle in cache
-- Movie FK columns still NULL (no selection made)
```

---

### Phase 2: Enrichment (Provider Query)

**Purpose**: Fetch metadata and candidate URLs from online providers

**When**:

- After discovery completes
- User manually triggers enrichment
- Scheduled enrichment jobs

**What it does**:

1. Queries ALL configured providers (TMDB, TVDB, FanArt.tv, etc.)
2. Fetches available asset URLs with metadata (votes, dimensions, language)
3. **Stores URLs ONLY in database** with `location='tmdb'` (or provider name)
4. Does NOT download files yet
5. Updates movie metadata (plot, cast, release date, etc.)

**What it does NOT do**:

- ❌ Download images/videos (URLs only)
- ❌ Make selection decisions
- ❌ Update movie FK columns

**Example provider response (TMDB)**:

```json
{
  "backdrops": [
    {
      "file_path": "/abc123.jpg",
      "width": 3840,
      "height": 2160,
      "vote_average": 8.5,
      "vote_count": 142
    }
    // ... 9 more fanart URLs
  ]
}
```

**Database state after enrichment**:

```sql
-- 2 fanarts in cache (from local scan, source_url = NULL)
-- 10 fanarts with location='tmdb' (URLs only, not downloaded)
-- Movie metadata updated (plot, rating, etc.)
-- Movie FK columns still NULL (no selection made)
```

---

### Phase 3: Deduplication (Match Local to Remote)

**Purpose**: Identify when cached files are actually the same as provider assets

**When**: After enrichment, before selection

**Why**:

- Prevents downloading files we already have
- Associates local files with provider metadata (votes, popularity)
- Improves selection scoring (local files gain vote data)
- Saves bandwidth

**How it works**:

```typescript
async function deduplicateAssets(
  db: DatabaseConnection,
  movieId: number,
  assetType: string
): Promise<void> {
  // 1. Get cached assets with no provider source (from initial scan)
  const cachedAssets = await db.query(
    `
    SELECT * FROM image_files
    WHERE entity_id = ?
      AND image_type = ?
      AND location = 'cache'
      AND source_url IS NULL
  `,
    [movieId, assetType]
  );

  if (cachedAssets.length === 0) {
    return; // Nothing to deduplicate
  }

  // 2. Get provider assets (URLs only)
  const providerAssets = await db.query(
    `
    SELECT * FROM image_files
    WHERE entity_id = ?
      AND image_type = ?
      AND location IN ('tmdb', 'tvdb', 'fanart.tv')
    ORDER BY
      CASE location
        WHEN 'fanart.tv' THEN 1
        WHEN 'tmdb' THEN 2
        WHEN 'tvdb' THEN 3
      END
  `,
    [movieId, assetType]
  );

  // 3. Download provider assets to temp directory
  for (const providerAsset of providerAssets) {
    const imageUrl = providerAsset.source_url;
    const buffer = await downloadImage(imageUrl);
    const tempPath = `/data/temp/${uuid()}.jpg`;
    await fs.writeFile(tempPath, buffer);

    // Get ACTUAL metadata (don't trust provider API)
    const metadata = await sharp(buffer).metadata();
    const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
    const perceptualHash = await calculatePerceptualHash(buffer);

    // Update record with actual file data
    await db.execute(
      `
      UPDATE image_files
      SET
        file_path = ?,
        file_size = ?,
        file_hash = ?,
        perceptual_hash = ?,
        width = ?,
        height = ?,
        format = ?,
        location = 'temp'
      WHERE id = ?
    `,
      [
        tempPath,
        buffer.length,
        fileHash,
        perceptualHash,
        metadata.width,
        metadata.height,
        metadata.format,
        providerAsset.id,
      ]
    );
  }

  // 4. Match cached assets with temp (provider) assets
  const tempAssets = await db.query(
    `
    SELECT * FROM image_files
    WHERE entity_id = ?
      AND image_type = ?
      AND location = 'temp'
  `,
    [movieId, assetType]
  );

  for (const cachedAsset of cachedAssets) {
    const match = tempAssets.find(temp => {
      // Exact hash match (identical file)
      if (temp.file_hash === cachedAsset.file_hash) return true;

      // Perceptual hash match (visually similar, different encoding)
      if (temp.perceptual_hash && cachedAsset.perceptual_hash) {
        const distance = calculateHammingDistance(
          temp.perceptual_hash,
          cachedAsset.perceptual_hash
        );
        return distance <= 5; // Very similar (threshold: 5 bits)
      }

      return false;
    });

    if (match) {
      // MATCH FOUND! Update cached asset with provider metadata
      await db.execute(
        `
        UPDATE image_files
        SET
          source_url = ?,
          provider_name = ?,
          vote_average = ?,
          vote_count = ?,
          classification_score = ?
        WHERE id = ?
      `,
        [
          match.source_url,
          match.provider_name,
          match.vote_average,
          match.vote_count,
          calculateScoreWithVotes(cachedAsset, match), // Recalculate with votes
          cachedAsset.id,
        ]
      );

      // Delete temp file and record (duplicate identified)
      await fs.unlink(match.file_path);
      await db.execute(`DELETE FROM image_files WHERE id = ?`, [match.id]);

      logger.info('Matched local asset to provider', {
        localFile: cachedAsset.file_name,
        provider: match.provider_name,
        votes: `${match.vote_average} (${match.vote_count} votes)`,
        method: match.file_hash === cachedAsset.file_hash ? 'exact' : 'perceptual',
      });
    }
  }

  // 5. Remaining temp assets are NEW candidates (not in cache yet)
  // Keep them for selection phase
  logger.info('Deduplication complete', {
    movieId,
    assetType,
    matched: cachedAssets.length - tempAssets.length,
    newCandidates: tempAssets.length,
  });
}
```

**Database state after deduplication**:

```sql
-- Example: 2 cached fanarts matched to TMDB
-- Cached fanart #1: Now has source_url, votes (8.5, 142 votes), updated score
-- Cached fanart #2: Now has source_url, votes (7.8, 89 votes), updated score
-- Temp: 8 new TMDB fanarts (downloaded, awaiting selection)
-- Total candidates: 10 fanarts (2 matched + 8 new)
```

---

### Phase 4: Selection (Choose Best Assets)

**Purpose**: Pick optimal assets for publishing to media players

**When**:

- After deduplication completes
- User manually changes selection
- User adjusts asset limits (fanart count)

**What it does**:

1. Reviews ALL candidates (cache + temp) for each asset type
2. Applies asset limits based on type and user settings
3. Scores assets using provider votes + quality metrics
4. **Updates movie FK columns** with selected asset IDs
5. Marks selected assets as `is_published = 1`
6. Keeps unselected assets as candidates (provider URLs) in the database

**Asset Limits**:

```typescript
const ASSET_LIMITS = {
  // Single-asset types (Kodi shows 1)
  poster: 1,
  clearlogo: 1,
  clearart: 1,
  discart: 1,
  banner: 1,
  keyart: 1,
  landscape: 1,

  // Multi-asset types (Kodi cycles through them)
  fanart: 4, // User configurable (Kodi default: 4, Jellyfin: unlimited)
  trailer: 5, // User configurable
  subtitle: null, // Unlimited
  theme: 1,
};
```

**Selection Algorithm**:

```typescript
async function selectBestAssets(
  db: DatabaseConnection,
  movieId: number,
  assetType: string
): Promise<void> {
  // 1. Get asset limit for this type
  const limit = await getAssetLimit(movieId, assetType);

  // 2. Check if field is locked (user override)
  const movie = await db.query(
    `
    SELECT ${assetType}_locked FROM movies WHERE id = ?
  `,
    [movieId]
  );

  if (movie[0][`${assetType}_locked`]) {
    logger.debug('Asset selection locked by user', { movieId, assetType });
    return; // Skip automated selection
  }

  // 3. Get ALL candidates (cache + temp)
  const candidates = await db.query(
    `
    SELECT * FROM image_files
    WHERE entity_id = ?
      AND image_type = ?
      AND location IN ('cache', 'temp')
    ORDER BY classification_score DESC, vote_average DESC
  `,
    [movieId, assetType]
  );

  if (candidates.length === 0) {
    logger.warn('No candidates found for selection', { movieId, assetType });
    return;
  }

  // 4. Select top N based on limit
  const selected = candidates.slice(0, limit || candidates.length);

  // 5. Process selected assets
  for (let i = 0; i < selected.length; i++) {
    const asset = selected[i];

    if (asset.location === 'temp') {
      // Move temp → cache
      const cacheHash = asset.file_hash;
      const cachePath = `/data/cache/images/${cacheHash.slice(0, 2)}/${cacheHash.slice(2, 4)}/${cacheHash}.jpg`;
      await fs.rename(asset.file_path, cachePath);

      await db.execute(
        `
        UPDATE image_files
        SET location = 'cache', file_path = ?
        WHERE id = ?
      `,
        [cachePath, asset.id]
      );
    }

    // Mark as published
    await db.execute(
      `
      UPDATE image_files SET is_published = 1 WHERE id = ?
    `,
      [asset.id]
    );

    logger.info('Asset selected', {
      assetType,
      rank: i + 1,
      score: asset.classification_score,
      provider: asset.provider_name || 'local',
    });
  }

  // 6. Update movie FK with primary asset
  await db.execute(
    `
    UPDATE movies SET ${assetType}_id = ? WHERE id = ?
  `,
    [selected[0].id, movieId]
  );

  // 7. Handle unselected assets
  const unselected = candidates.slice(limit || candidates.length);

  for (const asset of unselected) {
    await db.execute(
      `
      UPDATE image_files SET is_published = 0 WHERE id = ?
    `,
      [asset.id]
    );

    if (asset.location === 'temp') {
      // Delete temp file
      await fs.unlink(asset.file_path);

      // Revert to provider location (keep as candidate)
      await db.execute(
        `
        UPDATE image_files
        SET location = ?, file_path = NULL
        WHERE id = ?
      `,
        [asset.provider_name, asset.id]
      );
    } else if (asset.location === 'cache') {
      // Check if this was from initial scan (no provider source)
      if (!asset.source_url) {
        // Delete local-only asset (not selected, no provider fallback)
        await fs.unlink(asset.file_path);
        await db.execute(`DELETE FROM image_files WHERE id = ?`, [asset.id]);
        logger.info('Deleted unmatched local asset', { file: asset.file_name });
      } else {
        // Delete cached file but keep record as candidate
        await fs.unlink(asset.file_path);
        await db.execute(
          `
          UPDATE image_files
          SET location = ?, file_path = NULL
          WHERE id = ?
        `,
          [asset.provider_name, asset.id]
        );
        logger.info('Asset unpublished but retained as candidate', {
          provider: asset.provider_name,
          votes: asset.vote_count,
        });
      }
    }
  }
}
```

**Database state after selection**:

```sql
-- Example: Limit = 4 fanarts
-- 4 fanarts in cache with is_published=1
-- 6 fanarts as provider URLs (location='tmdb', is_published=0)
-- movies.fanart_id = <top scored fanart ID>
```

---

### Phase 5: Publishing (Copy to Library)

**Purpose**: Copy selected assets from cache to library for media player consumption

**When**:

- After selection completes
- User manually triggers publish
- During library sync operations

**What it does**:

1. Copies selected assets from cache → library directory
2. Uses Kodi naming conventions
3. Generates NFO file with metadata
4. Creates library file records with `location='library'`
5. Links library records to cache records (`cache_file_id`)
6. Notifies media players of library updates

**Publishing Logic**:

```typescript
async function publishAssetsToLibrary(db: DatabaseConnection, movieId: number): Promise<void> {
  const movie = await db.query(`SELECT * FROM movies WHERE id = ?`, [movieId]);
  const movieDir = path.dirname(movie[0].file_path);

  // Get all published assets
  const publishedAssets = await db.query(
    `
    SELECT * FROM image_files
    WHERE entity_id = ?
      AND entity_type = 'movie'
      AND location = 'cache'
      AND is_published = 1
  `,
    [movieId]
  );

  for (const asset of publishedAssets) {
    // Determine library filename (Kodi convention)
    const libraryFileName = getLibraryFileName(movie[0], asset.image_type, asset.index);
    const libraryPath = path.join(movieDir, libraryFileName);

    // Copy cache → library
    await fs.copyFile(asset.file_path, libraryPath);

    // Check if library record already exists
    const existing = await db.query(
      `
      SELECT id FROM image_files
      WHERE file_path = ? AND location = 'library'
    `,
      [libraryPath]
    );

    if (existing.length === 0) {
      // Create new library record
      await insertImageFile(db, {
        entityType: 'movie',
        entityId: movieId,
        filePath: libraryPath,
        fileName: libraryFileName,
        fileSize: asset.file_size,
        fileHash: asset.file_hash,
        location: 'library',
        imageType: asset.image_type,
        width: asset.width,
        height: asset.height,
        format: asset.format,
        cacheFileId: asset.id,
      });
    } else {
      // Update existing library record
      await db.execute(
        `
        UPDATE image_files
        SET
          file_hash = ?,
          cache_file_id = ?
        WHERE id = ?
      `,
        [asset.file_hash, asset.id, existing[0].id]
      );
    }

    logger.info('Asset published to library', {
      assetType: asset.image_type,
      libraryPath,
    });
  }

  // Generate NFO
  await generateNFO(db, movieId, movieDir);

  // Notify media players
  await notifyMediaPlayers(movieId);
}
```

**Kodi Naming Convention**:

```typescript
function getLibraryFileName(movie: Movie, assetType: string, index?: number): string {
  const baseName = path.basename(movie.file_path, path.extname(movie.file_path));

  switch (assetType) {
    case 'poster':
      return 'poster.jpg';
    case 'fanart':
      return index ? `fanart${index}.jpg` : 'fanart.jpg';
    case 'clearlogo':
      return 'clearlogo.png';
    case 'banner':
      return 'banner.jpg';
    case 'landscape':
      return 'landscape.jpg';
    case 'trailer':
      return `${baseName}-trailer.mp4`;
    case 'subtitle':
      return `${baseName}.${language}.srt`;
    default:
      return `${assetType}.jpg`;
  }
}
```

---

## Cache Synchronization

**Cache is ALWAYS the source of truth.**

### Library File Hash Verification

```typescript
async function verifyCacheSync(db: DatabaseConnection, movieId: number): Promise<void> {
  // Get library files with cache links
  const libraryFiles = await db.query(
    `
    SELECT
      lib.id as lib_id,
      lib.file_path as lib_path,
      lib.file_hash as lib_hash,
      cache.id as cache_id,
      cache.file_path as cache_path,
      cache.file_hash as cache_hash
    FROM image_files lib
    INNER JOIN image_files cache ON lib.cache_file_id = cache.id
    WHERE lib.entity_id = ?
      AND lib.location = 'library'
      AND cache.location = 'cache'
  `,
    [movieId]
  );

  for (const file of libraryFiles) {
    // Verify library file exists
    if (!(await fs.pathExists(file.lib_path))) {
      logger.warn('Library file missing, restoring from cache', {
        libraryPath: file.lib_path,
      });
      await fs.copyFile(file.cache_path, file.lib_path);
      continue;
    }

    // Verify hash matches cache
    const currentHash = await calculateFileHash(file.lib_path);

    if (currentHash !== file.cache_hash) {
      logger.warn('Library file modified by external application, replacing from cache', {
        libraryPath: file.lib_path,
        expectedHash: file.cache_hash,
        actualHash: currentHash,
      });

      // Replace library file with cache version
      await fs.copyFile(file.cache_path, file.lib_path);

      // Update library file hash
      await db.execute(
        `
        UPDATE image_files SET file_hash = ? WHERE id = ?
      `,
        [file.cache_hash, file.lib_id]
      );
    }
  }
}
```

**IMPORTANT**:

- ✅ Cache → Library (always allowed)
- ❌ Library → Cache (NEVER, except initial scan)
- All edits flow through Metarr → Cache → Library

---

## User Limit Changes

When user adjusts asset limits (e.g., fanart: 3 → 10):

```typescript
async function updateAssetLimit(
  db: DatabaseConnection,
  movieId: number,
  assetType: string,
  newLimit: number
): Promise<void> {
  const currentLimit = await getAssetLimit(movieId, assetType);

  if (newLimit > currentLimit) {
    // INCREASE: Need to select more assets

    // 1. Check providers for new assets since last enrichment
    await enrichFromProviders(db, movieId);

    // 2. Get all candidates (including previously unselected)
    const candidates = await db.query(
      `
      SELECT * FROM image_files
      WHERE entity_id = ?
        AND image_type = ?
        AND location IN ('cache', 'tmdb', 'tvdb', 'fanart.tv')
      ORDER BY classification_score DESC
    `,
      [movieId, assetType]
    );

    // 3. Select top N (up to new limit)
    await selectTopAssets(db, movieId, assetType, candidates, newLimit);
  } else if (newLimit < currentLimit) {
    // DECREASE: Need to unpublish some assets

    const published = await db.query(
      `
      SELECT * FROM image_files
      WHERE entity_id = ?
        AND image_type = ?
        AND is_published = 1
      ORDER BY classification_score DESC
    `,
      [movieId, assetType]
    );

    // Keep top N
    const toKeep = published.slice(0, newLimit);
    const toUnpublish = published.slice(newLimit);

    for (const asset of toUnpublish) {
      await db.execute(
        `
        UPDATE image_files SET is_published = 0 WHERE id = ?
      `,
        [asset.id]
      );

      // Delete from cache and library
      await fs.unlink(asset.file_path);

      // Revert to provider location (keep as candidate)
      if (asset.source_url) {
        await db.execute(
          `
          UPDATE image_files
          SET location = ?, file_path = NULL
          WHERE id = ?
        `,
          [asset.provider_name, asset.id]
        );
      } else {
        // No provider source, delete completely
        await db.execute(`DELETE FROM image_files WHERE id = ?`, [asset.id]);
      }

      // Delete library file
      const libraryFile = await db.query(
        `
        SELECT * FROM image_files
        WHERE cache_file_id = ? AND location = 'library'
      `,
        [asset.id]
      );

      if (libraryFile.length > 0) {
        await fs.unlink(libraryFile[0].file_path);
        await db.execute(`DELETE FROM image_files WHERE id = ?`, [libraryFile[0].id]);
      }
    }
  }

  // Update limit setting
  await db.execute(
    `
    UPDATE movie_settings SET ${assetType}_limit = ? WHERE movie_id = ?
  `,
    [newLimit, movieId]
  );

  // Re-publish to library
  await publishAssetsToLibrary(db, movieId);
}
```

---

## Location Column Design

The `location` column indicates where the file physically exists OR which provider it's from:

```sql
location TEXT NOT NULL CHECK(location IN (
  -- Physical files
  'library',      -- File in movie directory
  'cache',        -- File in /data/cache/ (selected assets only)
  'temp',         -- File in /data/temp/ (pending selection)

  -- Provider URLs (not downloaded)
  'tmdb',         -- Remote asset from TMDB
  'tvdb',         -- Remote asset from TVDB
  'fanart.tv',    -- Remote asset from FanArt.tv
  'imdb'          -- Remote asset from IMDb
))
```

**Query Examples**:

```typescript
// Get all physical files
const physicalFiles = await db.query(`
  SELECT * FROM image_files
  WHERE location IN ('library', 'cache', 'temp')
`);

// Get all remote candidates
const remoteCandidates = await db.query(`
  SELECT * FROM image_files
  WHERE location IN ('tmdb', 'tvdb', 'fanart.tv')
`);

// Get published assets (should be in cache)
const published = await db.query(`
  SELECT * FROM image_files
  WHERE is_published = 1 AND location = 'cache'
`);
```

---

## Classification Scoring

Assets are scored to determine selection priority:

```typescript
function calculateClassificationScore(asset: AssetCandidate, assetType: string): number {
  let score = 0;

  // 1. Naming Convention (40 points)
  if (asset.fileName === `${assetType}.jpg` || asset.fileName === `${assetType}.png`) {
    score += 40; // Perfect Kodi naming
  } else if (asset.fileName.includes(assetType)) {
    score += 25;
  }

  // 2. Resolution Quality (25 points)
  const pixels = asset.width * asset.height;
  if (pixels >= 8000000)
    score += 25; // 4K+
  else if (pixels >= 4000000)
    score += 20; // > 4MP
  else if (pixels >= 2000000)
    score += 15; // > 2MP
  else score += 10;

  // 3. Provider Votes (20 points) - If available
  if (asset.vote_average && asset.vote_count) {
    const voteScore = (asset.vote_average / 10) * 20; // Normalize to 0-20
    const confidenceMultiplier = Math.min(asset.vote_count / 100, 1); // More votes = more confidence
    score += voteScore * confidenceMultiplier;
  }

  // 4. Source Priority (10 points)
  if (asset.sourceType === 'user')
    score += 10; // User uploaded
  else if (asset.sourceType === 'local')
    score += 7; // Found in library
  else if (asset.sourceType === 'provider') score += 5;

  // 5. Format (5 points)
  if (asset.format === 'jpg' || asset.format === 'jpeg') score += 5;
  else if (asset.format === 'png') score += 4;

  return Math.round(score);
}
```

**Maximum Score**: 100

---

## Rescan Behavior (Manual or Scheduled)

**Purpose**: Detect changes to library files without re-processing unchanged assets

**When**:
- User manually triggers rescan
- Scheduled rescan jobs (daily/weekly)
- After webhook indicates file changes

**Algorithm**:

```typescript
async function rescanMovieDirectory(
  db: DatabaseConnection,
  movieId: number
): Promise<RescanResult> {

  const movie = await db.query(`SELECT * FROM movies WHERE id = ?`, [movieId]);
  const movieDir = path.dirname(movie[0].file_path);

  const stats = {
    unchanged: 0,
    modified: 0,
    added: 0,
    removed: 0
  };

  // Get ignore patterns from database
  const ignorePatterns = await db.query(`SELECT pattern FROM ignore_patterns`);
  const patterns = ignorePatterns.map(r => r.pattern); // ['*.txt', '*.nfo-orig', etc.]

  // Walk ALL files in directory
  const filesInDir = await fs.readdir(movieDir);

  for (const fileName of filesInDir) {
    const filePath = path.join(movieDir, fileName);

    // Skip main video file
    if (filePath === movie[0].file_path) continue;

    // Check against ignore patterns
    if (shouldIgnoreFile(fileName, patterns)) {
      logger.debug('Skipping ignored file', { file: fileName });
      continue;
    }

    // Search for this file in database (by file_path)
    const existingRecord = await db.query(`
      SELECT * FROM image_files
      WHERE file_path = ? AND location = 'library'
    `, [filePath]);

    if (existingRecord.length > 0) {
      // FILE EXISTS IN DB: Check hash
      const record = existingRecord[0];

      // Calculate current hash of library file
      const currentHash = await calculateFileHash(filePath);

      if (currentHash === record.file_hash) {
        // HASH MATCH: File unchanged, skip processing
        logger.debug('File unchanged, skipping', {
          file: fileName,
          hash: currentHash
        });
        stats.unchanged++;
        continue;

      } else {
        // HASH MISMATCH: External app modified the file
        logger.warn('Library file hash mismatch, restoring from cache', {
          file: fileName,
          expectedHash: record.file_hash,
          actualHash: currentHash
        });

        // Get cache file via cache_file_id link
        const cacheFile = await db.query(`
          SELECT * FROM image_files
          WHERE id = ? AND location = 'cache'
        `, [record.cache_file_id]);

        if (cacheFile.length > 0) {
          // Restore library file from cache
          await fs.copyFile(cacheFile[0].file_path, filePath);

          // Update library record hash to match cache
          await db.execute(`
            UPDATE image_files SET file_hash = ? WHERE id = ?
          `, [cacheFile[0].file_hash, record.id]);

          stats.modified++;
        } else {
          logger.error('Cache file not found for library record', {
            libraryId: record.id,
            cacheId: record.cache_file_id
          });
        }

        continue;
      }
    }

    // FILE NOT IN DB: Process as new discovery
    logger.info('New file discovered during rescan', {
      file: fileName
    });

    // Calculate hash
    const fileHash = await calculateFileHash(filePath);

    // Validate and classify
    const matchingSpecs = findAssetSpecsByFilename(fileName);

    if (matchingSpecs.length === 0) {
      // Unknown file
      await insertUnknownFile(db, {
        entityType: 'movie',
        entityId: movieId,
        filePath,
        fileName,
        fileSize: (await fs.stat(filePath)).size,
        extension: path.extname(fileName)
      });
      stats.added++;
      continue;
    }

    // Process as valid asset
    for (const spec of matchingSpecs) {
      const metadata = await getImageMetadata(filePath);
      const validation = validateImageDimensions(
        metadata.width,
        metadata.height,
        spec
      );

      if (!validation.valid) {
        logger.debug('File failed validation', {
          file: fileName,
          spec: spec.type,
          reason: validation.reason
        });
        continue;
      }

      const fileStats = await fs.stat(filePath);
      const score = calculateImageScore({ ...metadata, fileName, spec });

      // Copy to cache (content-addressed)
      const cachePath = `/data/cache/images/${fileHash.slice(0, 2)}/${fileHash.slice(2, 4)}/${fileHash}.jpg`;

      // Check if cache file already exists (deduplication)
      if (!await fs.pathExists(cachePath)) {
        await fs.copyFile(filePath, cachePath);
      }

      // Insert cache record
      const cacheResult = await insertImageFile(db, {
        entityType: 'movie',
        entityId: movieId,
        filePath: cachePath,
        fileName: `${fileHash}.jpg`,
        fileSize: fileStats.size,
        fileHash: fileHash,
        location: 'cache',
        imageType: spec.type,
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        sourceType: 'local',
        classificationScore: score,
        isPublished: false, // Not selected yet
        referenceCount: 1
      });

      // Insert library record
      await insertImageFile(db, {
        entityType: 'movie',
        entityId: movieId,
        filePath: filePath,
        fileName: fileName,
        fileSize: fileStats.size,
        fileHash: fileHash,
        location: 'library',
        imageType: spec.type,
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        cacheFileId: cacheResult.insertId
      });

      stats.added++;

      logger.info('New asset discovered and cached', {
        file: fileName,
        type: spec.type,
        score
      });
    }
  }

  logger.info('Rescan complete', stats);

  return stats;
}

/**
 * Check if filename matches any ignore patterns
 */
function shouldIgnoreFile(fileName: string, patterns: string[]): boolean {
  return patterns.some(pattern => {
    // Convert glob pattern to regex
    const regex = new RegExp(
      '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
    );
    return regex.test(fileName);
  });
}
```

**Key Points**:

- ✅ **Always walk entire directory**: Every rescan processes ALL files (not just new ones)
- ✅ **Ignore patterns respected**: Files matching `ignore_patterns` table are skipped
- ✅ **DB lookup by file_path**: Check if library file exists in database
- ✅ **Hash comparison for existing files**:
  - Match → Skip processing (file unchanged)
  - Mismatch → Restore from cache (external app modified it)
- ✅ **New file discovery**: Files not in DB are processed as new assets (copy to cache, create records)
- ✅ **Fresh library support**: Initial scan treats all files as new (creates cache + library records)
- ❌ **Never update cache from library** - Always cache → library direction

**Rescan Trigger Scenarios**:

1. **User clicks "Rescan Library"** (Full Library):
   - Full directory walk for all movies
   - Hash comparison for all files
   - Restores missing/modified files from cache
   - Report changes to user

2. **User clicks "Rescan Movie"** (Individual Movie):
   - Rescan single movie directory
   - Hash comparison
   - Restores missing/modified files from cache

3. **Scheduled rescan (daily/weekly)**:
   - Background job
   - Low priority
   - Auto-fix discrepancies (missing/modified files)

4. **Webhook received** (any event):
   - Radarr/Sonarr sends webhook (Download, Upgrade, Rename, etc.)
   - Triggers rescan for that specific movie
   - Automatically restores any deleted assets from cache

---

## Missing File Detection and Recovery

**Purpose**: Detect when library files are deleted (by Radarr or external apps) and restore from cache

**How it works**: The normal rescan algorithm already handles this! No special logic needed.

**Scenario**: Radarr upgrades movie quality and deletes all assets

```
Before upgrade:
  /movies/Matrix/Matrix.mkv           (720p)
  /movies/Matrix/poster.jpg           ✓ In DB
  /movies/Matrix/fanart.jpg           ✓ In DB
  /movies/Matrix/Matrix-trailer.mp4   ✓ In DB

Radarr upgrade:
  - Deletes Matrix.mkv (720p)
  - Deletes poster.jpg, fanart.jpg, trailer (Radarr cleanup)
  - Downloads Matrix.mkv (1080p)
  - Sends webhook to Metarr

Metarr webhook handler:
  - Triggers rescanMovieDirectory(movieId)

Rescan detects:
  - poster.jpg in DB but missing on disk → Restore from cache
  - fanart.jpg in DB but missing on disk → Restore from cache
  - trailer.mp4 in DB but missing on disk → Restore from cache

After rescan:
  /movies/Matrix/Matrix.mkv           (1080p - new)
  /movies/Matrix/poster.jpg           ✓ Restored from cache
  /movies/Matrix/fanart.jpg           ✓ Restored from cache
  /movies/Matrix/Matrix-trailer.mp4   ✓ Restored from cache
```

**Implementation** (already in rescan algorithm above):

The existing `rescanMovieDirectory()` function needs one addition - check for missing files:

```typescript
async function rescanMovieDirectory(
  db: DatabaseConnection,
  movieId: number
): Promise<RescanResult> {

  // ... existing code for walking directory and processing files ...

  // ADDITION: Check for library files in DB that are missing on disk
  const libraryRecords = await db.query(`
    SELECT * FROM image_files
    WHERE entity_id = ?
      AND entity_type = 'movie'
      AND location = 'library'
  `, [movieId]);

  for (const record of libraryRecords) {
    // Check if file exists on disk
    if (!await fs.pathExists(record.file_path)) {
      // FILE MISSING: Radarr or external app deleted it
      logger.warn('Library file missing, restoring from cache', {
        file: record.file_path
      });

      // Get cache file via cache_file_id
      const cacheFile = await db.query(`
        SELECT * FROM image_files
        WHERE id = ? AND location = 'cache'
      `, [record.cache_file_id]);

      if (cacheFile.length > 0) {
        // Restore from cache
        await fs.copyFile(cacheFile[0].file_path, record.file_path);

        stats.restored++;

        logger.info('File restored from cache', {
          file: path.basename(record.file_path),
          type: record.image_type
        });
      } else {
        logger.error('Cache file not found, cannot restore', {
          libraryId: record.id,
          cacheId: record.cache_file_id
        });
      }
    }
  }

  // Same for video_files, text_files, audio_files
  // ... repeat for each asset table ...

  logger.info('Rescan complete', stats);

  return stats;
}
```

**Webhook Handler**:

```typescript
async function handleWebhook(webhook: WebhookPayload): Promise<void> {
  const movie = await findMovieByTmdbId(webhook.movie.tmdbId);

  if (!movie) {
    // New movie - full discovery + enrichment
    await processNewMovie(webhook);
    return;
  }

  // Update movie file path if changed (rename or upgrade)
  if (webhook.movie.path !== movie.file_path) {
    logger.info('Movie path changed, updating database', {
      movieId: movie.id,
      oldPath: movie.file_path,
      newPath: webhook.movie.path
    });

    await updateMovieFilePath(db, movie.id, webhook.movie.path);
  }

  // All events trigger rescan
  logger.info('Webhook received, triggering rescan', {
    movieId: movie.id,
    eventType: webhook.eventType
  });

  // Rescan will:
  // - Detect missing files → restore from cache to new directory
  // - Detect modified files → restore from cache
  // - Detect new files → add to cache
  await rescanMovieDirectory(db, movie.id);
}

/**
 * Update movie file path and all related library asset paths
 */
async function updateMovieFilePath(
  db: DatabaseConnection,
  movieId: number,
  newFilePath: string
): Promise<void> {

  // Get current path
  const movie = await db.query(`SELECT file_path FROM movies WHERE id = ?`, [movieId]);
  const oldFilePath = movie[0].file_path;

  const oldDir = path.dirname(oldFilePath);
  const newDir = path.dirname(newFilePath);

  // Update movie file path
  await db.execute(`
    UPDATE movies SET file_path = ? WHERE id = ?
  `, [newFilePath, movieId]);

  // Only update asset paths if directory changed
  if (oldDir !== newDir) {
    logger.info('Directory changed, updating asset paths', {
      movieId,
      oldDir,
      newDir
    });

    // Update all library asset file paths
    await db.execute(`
      UPDATE image_files
      SET file_path = REPLACE(file_path, ?, ?)
      WHERE entity_id = ? AND entity_type = 'movie' AND location = 'library'
    `, [oldDir, newDir, movieId]);

    await db.execute(`
      UPDATE video_files
      SET file_path = REPLACE(file_path, ?, ?)
      WHERE entity_id = ? AND entity_type = 'movie' AND location = 'library'
    `, [oldDir, newDir, movieId]);

    await db.execute(`
      UPDATE text_files
      SET file_path = REPLACE(file_path, ?, ?)
      WHERE entity_id = ? AND entity_type = 'movie' AND location = 'library'
    `, [oldDir, newDir, movieId]);

    await db.execute(`
      UPDATE audio_files
      SET file_path = REPLACE(file_path, ?, ?)
      WHERE entity_id = ? AND entity_type = 'movie' AND location = 'library'
    `, [oldDir, newDir, movieId]);

    await db.execute(`
      UPDATE unknown_files
      SET file_path = REPLACE(file_path, ?, ?)
      WHERE entity_id = ? AND entity_type = 'movie'
    `, [oldDir, newDir, movieId]);
  }
}
```

**Path Update Scenarios**:

| Scenario | Old Path | New Path | Directory Changed? | Action |
|----------|----------|----------|-------------------|--------|
| **Rename** | `/movies/The Matrix (1999)/...` | `/movies/Matrix, The (1999)/...` | ✅ Yes | Update all asset paths, rescan restores from cache |
| **Upgrade** | `/movies/Matrix/Matrix.720p.mkv` | `/movies/Matrix/Matrix.1080p.mkv` | ❌ No | Update movie path only, rescan detects deleted assets |
| **Move** | `/movies1/Matrix/...` | `/movies2/Matrix/...` | ✅ Yes | Update all asset paths, rescan restores from cache |

**Rename Event Flow**:

```
Before rename:
  /movies/The Matrix (1999)/The Matrix.mkv
  /movies/The Matrix (1999)/poster.jpg
  DB: movies.file_path = "/movies/The Matrix (1999)/The Matrix.mkv"
      image_files.file_path = "/movies/The Matrix (1999)/poster.jpg"

Radarr renames:
  - Deletes old directory entirely
  - Creates new directory
  - Moves movie file to new location
  - Sends webhook

Webhook received:
  movie.path = "/movies/Matrix, The (1999)/Matrix, The.mkv"

Metarr processes:
  1. updateMovieFilePath() detects directory changed
  2. Updates movies.file_path
  3. Updates all library asset file_paths (REPLACE old dir with new dir)
     - DB now has: image_files.file_path = "/movies/Matrix, The (1999)/poster.jpg"
  4. Triggers rescan

Rescan checks:
  - poster.jpg in DB but missing on disk → Restore from cache
  - fanart.jpg in DB but missing on disk → Restore from cache

Result:
  /movies/Matrix, The (1999)/Matrix, The.mkv
  /movies/Matrix, The (1999)/poster.jpg     ✓ Restored from cache
  /movies/Matrix, The (1999)/fanart.jpg     ✓ Restored from cache
  DB: All paths correctly updated
```

**Key Point**: The rescan doesn't need special logic - it just checks "does this DB path exist on disk?" and restores from cache if not. Simple and self-healing!


**Stats Tracking**:

```typescript
interface RescanResult {
  unchanged: number;  // Files with matching hash (skipped)
  modified: number;   // Files with mismatched hash (restored from cache)
  added: number;      // New files discovered (added to cache)
  restored: number;   // Missing files (restored from cache)
}
```

---

## Performance Optimization

**Batch Processing** (for full library rescans):

```typescript
// For large libraries, use parallel processing
async function rescanLibraryBatch(
  db: DatabaseConnection,
  libraryId: number
): Promise<void> {

  const movies = await db.query(`
    SELECT id FROM movies WHERE library_id = ?
  `, [libraryId]);

  // Process in batches of 10 concurrently
  const batchSize = 10;

  for (let i = 0; i < movies.length; i += batchSize) {
    const batch = movies.slice(i, i + batchSize);

    await Promise.all(
      batch.map(movie => rescanMovieDirectory(db, movie.id))
    );
  }
}
```

---

## Related Documentation

- [UNIFIED_FILE_SYSTEM.md](UNIFIED_FILE_SYSTEM.md) - Database schema for file tracking
- [WORKFLOWS.md](WORKFLOWS.md) - How discovery/selection fits into larger workflows
- [assetTypeSpecs.ts](../src/services/media/assetTypeSpecs.ts) - Validation rules
- [assetDiscovery_unified.ts](../src/services/media/assetDiscovery_unified.ts) - Implementation

---

**End of Document**
