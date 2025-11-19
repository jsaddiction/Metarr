# Publishing Phase

**Purpose**: Deploy selected assets from cache to library directories and create the ideal Kodi-compatible presentation for media player scanners.

**Status**: ✅ Implemented (publishingService.ts)

## Overview

The publishing phase materializes Metarr's curated metadata and assets into the library filesystem. It ensures media players see a perfectly organized, Kodi-compliant structure with all selected assets in place, proper naming conventions, and complete NFO metadata.

**Prerequisites**:
- Entity must have `identification_status = 'enriched'`
- Selected assets must be in cache (`is_downloaded = 1`)
- At least one asset selected (`is_selected = 1`)

**Key Principle**: Publishing is a **deployment operation**, not a download operation. All assets should already be in cache from the enrichment phase. If cache files are missing (edge case: cache cleanup), publishing will re-download them.

## Phase Rules

1. **Idempotent**: Re-publishing repairs/updates without duplication
2. **Deterministic**: Same selections always produce same library state
3. **Atomic**: File operations use temp files + rename for safety
4. **Cleanup**: Removes unselected cache assets to reclaim space
5. **Chainable**: Always triggers player sync phase via job creation

## Triggers

- **Manual** (most common): User clicks "Publish" button after reviewing enriched metadata
- **Automated** (optional): After enrichment if `workflow.auto_publish = true`
- **Republish**: User clicks "Republish" after making changes to enriched data
- **Verification**: Repair job detects missing/corrupted files in library
- **Bulk**: User selects multiple items and publishes via batch operation

## Job Parameters

```typescript
interface PublishingJobPayload {
  entityId: number;
  entityType: 'movie' | 'episode' | 'series';
}
```

## The Six-Phase Process

Publishing is a **single job** that executes six sequential phases:

```
PUBLISHING JOB (Library Deployment & Cleanup)
│
├─ Phase 0: Validate Prerequisites
│  └─ Check entity is enriched, cache is complete
│
├─ Phase 1: Ensure Cache Completeness
│  └─ Re-download selected assets if missing (rare edge case)
│
├─ Phase 2: Cleanup Unselected Cache Assets
│  └─ Delete cache files not linked to selected provider assets (space reclamation)
│
├─ Phase 3: Copy Assets to Library (Rank-Based Kodi Naming)
│  └─ Deploy with numbering: poster.jpg (best), poster1.jpg (2nd), poster2.jpg (3rd)
│
├─ Phase 4: Copy Actor Images to .actors/ Folder
│  └─ Publish actor headshots: "Keanu Reeves.jpg" (spaces, not underscores)
│
├─ Phase 5: Generate NFO with Stream Details
│  └─ Create Kodi-compatible metadata with video/audio/subtitle streams
│
└─ Phase 6: Update Status & Notify Players
   └─ Set last_published_at, queue Kodi/Jellyfin/Plex scan notifications
```

---

## Phase 0: Validate Prerequisites

**Goal**: Ensure entity is ready for publishing and perform safety checks.

```typescript
// Check entity is enriched
const movie = await db.movies.findById(entityId);

if (movie.identification_status !== 'enriched') {
  throw new Error(`Cannot publish: movie ${entityId} not enriched (status: ${movie.identification_status})`);
}

// Check selected assets exist
const selectedAssets = await db.query(`
  SELECT COUNT(*) as count
  FROM provider_assets
  WHERE entity_id = ? AND entity_type = ? AND is_selected = 1
`, [entityId, entityType]);

if (selectedAssets[0].count === 0) {
  throw new Error(`Cannot publish: no assets selected for movie ${entityId}`);
}

// Check library directory writable
const movieDir = path.dirname(movie.file_path);
try {
  await fs.access(movieDir, fs.constants.W_OK);
} catch {
  throw new Error(`Library directory not writable: ${movieDir}`);
}

// Check disk space (warn if < 100MB)
const stats = await fs.statfs(movieDir);
if (stats.available < 100 * 1024 * 1024) {
  logger.warn('[Publishing] Low disk space', {
    available: `${Math.round(stats.available / 1024 / 1024)}MB`,
    path: movieDir,
  });
}

logger.info('[Publishing] Prerequisites validated', {
  entityId,
  selectedAssets: selectedAssets[0].count,
});
```

**Output**: Validation passed or errors thrown

---

## Phase 1: Ensure Cache Completeness

**Goal**: Re-download selected assets if missing from cache (edge case: cache cleanup between enrich/publish).

**Note**: Under normal operation, enrichment Phase 5B already downloaded all selected assets. This phase handles edge cases only.

### Hash-Based Cache Lookup

```typescript
// Get selected provider assets with cache file status
const selectedAssets = await db.query(`
  SELECT
    pa.id as provider_asset_id,
    pa.asset_type,
    pa.provider_url,
    pa.provider_name,
    pa.content_hash,
    pa.is_downloaded,
    cf.id as cache_file_id,
    cf.file_path as cache_path
  FROM provider_assets pa
  LEFT JOIN cache_image_files cf ON cf.file_hash = pa.content_hash
  WHERE pa.entity_id = ?
    AND pa.entity_type = ?
    AND pa.is_selected = 1
  ORDER BY pa.asset_type, pa.score DESC
`, [entityId, entityType]);
```

### Download Missing Assets

```typescript
for (const asset of selectedAssets) {
  // Check if asset is in cache
  if (asset.cache_file_id && await fs.exists(asset.cache_path)) {
    // Already cached - skip
    continue;
  }

  // Cache file missing or corrupted - download
  logger.info('Downloading selected asset to cache', {
    assetType: asset.asset_type,
    provider: asset.provider_name,
    url: asset.provider_url,
  });

  try {
    // Download from provider
    const buffer = await downloadFile(asset.provider_url);

    // Verify hash matches analyzed hash
    const actualHash = calculateSHA256(buffer);
    if (actualHash !== asset.content_hash) {
      logger.error('Hash mismatch - provider changed asset', {
        expected: asset.content_hash,
        actual: actualHash,
        url: asset.provider_url,
      });
      continue; // Skip this asset
    }

    // Determine storage path (content-addressed)
    const ext = path.extname(new URL(asset.provider_url).pathname) || '.jpg';
    const cachePath = `/data/cache/${asset.asset_type}/${asset.content_hash.slice(0, 2)}/${asset.content_hash}${ext}`;

    // Ensure directory exists
    await fs.mkdir(path.dirname(cachePath), { recursive: true });

    // Write to cache
    await fs.writeFile(cachePath, buffer);

    // Get image dimensions (if not already set)
    let width = asset.width;
    let height = asset.height;
    let format = ext.slice(1);

    if (asset.asset_type !== 'trailer' && asset.asset_type !== 'sample') {
      const metadata = await sharp(cachePath).metadata();
      width = metadata.width;
      height = metadata.height;
      format = metadata.format;
    }

    // Insert cache_image_files record
    const cacheFileId = await db.cache_image_files.create({
      entity_type: entityType,
      entity_id: entityId,
      file_path: cachePath,
      file_name: path.basename(cachePath),
      file_size: buffer.length,
      file_hash: asset.content_hash,
      perceptual_hash: asset.perceptual_hash,
      image_type: asset.asset_type,
      width,
      height,
      format,
      source_type: 'provider',
      source_url: asset.provider_url,
      provider_name: asset.provider_name,
    });

    // Update provider_assets
    await db.provider_assets.update(asset.provider_asset_id, {
      is_downloaded: 1,
    });

    logger.info('Asset downloaded to cache', {
      cacheFileId,
      cachePath,
    });

  } catch (error) {
    logger.error('Failed to download asset', {
      error: getErrorMessage(error),
      url: asset.provider_url,
    });
    // Continue with other assets
  }
}
```

---

## Phase 1B: Download Actor Images

**Goal**: Fetch actor headshots from TMDB and store in cache.

**Note**: Actors were created during enrichment Phase 1B, but images were NOT downloaded to minimize enrichment job time.

```typescript
// Get actors for this movie
const actors = await db.query(`
  SELECT a.*
  FROM actors a
  JOIN movie_actors ma ON ma.actor_id = a.id
  WHERE ma.movie_id = ?
    AND a.image_cache_path IS NOT NULL
    AND a.image_locked = 0
  ORDER BY ma.actor_order
`, [movieId]);

for (const actor of actors) {
  // Check if image already cached
  if (actor.image_hash && await fs.exists(actor.image_cache_path)) {
    // Already cached - skip
    continue;
  }

  try {
    // Download from TMDB
    const tmdbImageUrl = `https://image.tmdb.org/t/p/original${actor.image_cache_path}`;
    const buffer = await downloadFile(tmdbImageUrl);

    // Calculate hash
    const contentHash = calculateSHA256(buffer);

    // Store in cache
    const cachePath = `/data/cache/actor/${contentHash.slice(0, 2)}/${contentHash}.jpg`;
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(cachePath, buffer);

    // Get dimensions
    const metadata = await sharp(cachePath).metadata();

    // Update actor record
    await db.actors.update(actor.id, {
      image_cache_path: cachePath,
      image_hash: contentHash,
      image_ctime: Date.now(),
    });

    logger.info('Actor image downloaded', {
      actorName: actor.name,
      cachePath,
    });

  } catch (error) {
    logger.error('Failed to download actor image', {
      actorName: actor.name,
      error: getErrorMessage(error),
    });
    // Continue with other actors
  }
}
```

---

## Phase 2: Cleanup Unselected Cache Assets

**Goal**: Delete cache files NOT linked to selected provider assets to reclaim disk space.

**Rationale**: User has reviewed and approved selections. Unselected assets can be deleted immediately. If user changes mind later, re-enrichment will fetch them again.

```typescript
logger.info('[Publishing] Starting cache cleanup', {
  entityId,
  entityType,
});

let filesDeleted = 0;
let bytesReclaimed = 0;

// Find cache IMAGE files not linked to selected provider assets
const unselectedImages = await db.query(`
  SELECT c.id, c.file_path, c.image_type, c.file_size
  FROM cache_image_files c
  WHERE c.entity_id = ?
    AND c.entity_type = ?
    AND c.image_type != 'actor_thumb'  -- Keep actor images (shared across movies)
    AND c.file_hash NOT IN (
      SELECT content_hash
      FROM provider_assets
      WHERE entity_id = ?
        AND entity_type = ?
        AND is_selected = 1
    )
`, [entityId, entityType, entityId, entityType]);

for (const cacheFile of unselectedImages) {
  try {
    // Delete physical file
    if (await fs.exists(cacheFile.file_path)) {
      await fs.unlink(cacheFile.file_path);
      bytesReclaimed += cacheFile.file_size || 0;
    }

    // Delete database record
    await db.execute(`DELETE FROM cache_image_files WHERE id = ?`, [cacheFile.id]);

    filesDeleted++;

    logger.debug('[Publishing] Deleted unselected cache file', {
      cacheFileId: cacheFile.id,
      assetType: cacheFile.image_type,
      filePath: cacheFile.file_path,
    });

  } catch (error) {
    logger.error('[Publishing] Failed to delete cache file', {
      error: getErrorMessage(error),
      filePath: cacheFile.file_path,
    });
    // Continue with other files
  }
}

// Cleanup VIDEO files (trailers)
const unselectedVideos = await db.query(`
  SELECT c.id, c.file_path, c.video_type, c.file_size
  FROM cache_video_files c
  WHERE c.entity_id = ?
    AND c.entity_type = ?
    AND c.file_hash NOT IN (
      SELECT content_hash
      FROM provider_assets
      WHERE entity_id = ?
        AND entity_type = ?
        AND is_selected = 1
    )
`, [entityId, entityType, entityId, entityType]);

for (const cacheFile of unselectedVideos) {
  try {
    if (await fs.exists(cacheFile.file_path)) {
      await fs.unlink(cacheFile.file_path);
      bytesReclaimed += cacheFile.file_size || 0;
    }

    await db.execute(`DELETE FROM cache_video_files WHERE id = ?`, [cacheFile.id]);
    filesDeleted++;

  } catch (error) {
    logger.error('[Publishing] Failed to delete cache video', {
      error: getErrorMessage(error),
      filePath: cacheFile.file_path,
    });
  }
}

logger.info('[Publishing] Cache cleanup complete', {
  entityId,
  filesDeleted,
  bytesReclaimed: `${Math.round(bytesReclaimed / 1024 / 1024)}MB`,
});
```

**Output**: Unselected cache files deleted, space reclaimed

**Note**: Actor thumbnails are NOT deleted (they're shared across multiple movies)

---

## Phase 3: Copy to Library (Kodi Naming with Rank-Based Numbering)

**Goal**: Deploy selected assets to library directory with Kodi-compatible naming.

### Get Movie Directory and Basename

```typescript
// Get movie file path
const movie = await db.movies.findById(entityId);

// Extract directory and basename
const movieDir = path.dirname(movie.file_path);
// e.g., "/library/movies/The Matrix (1999)"

const basename = path.basename(movie.file_path, path.extname(movie.file_path));
// e.g., "The Matrix (1999)" (EXACT basename, not reconstructed)
```

### Copy Assets with Rank-Based Numbering

```typescript
// Get selected assets ordered by score
const selectedAssets = await db.query(`
  SELECT
    pa.asset_type,
    pa.score,
    cf.file_path as cache_path,
    cf.id as cache_file_id,
    ROW_NUMBER() OVER (
      PARTITION BY pa.asset_type
      ORDER BY pa.score DESC
    ) as rank
  FROM provider_assets pa
  JOIN cache_image_files cf ON cf.file_hash = pa.content_hash
  WHERE pa.entity_id = ?
    AND pa.is_selected = 1
  ORDER BY pa.asset_type, pa.score DESC
`, [entityId]);

for (const asset of selectedAssets) {
  // Determine library filename
  let libraryFilename: string;
  const ext = path.extname(asset.cache_path);

  if (asset.rank === 1) {
    // Best asset - no number suffix
    libraryFilename = `${basename}-${asset.asset_type}${ext}`;
    // e.g., "The Matrix (1999)-poster.jpg"
  } else {
    // Additional assets - numbered (1-indexed from rank 2)
    libraryFilename = `${basename}-${asset.asset_type}${asset.rank - 1}${ext}`;
    // e.g., "The Matrix (1999)-poster1.jpg" (2nd best)
    //      "The Matrix (1999)-poster2.jpg" (3rd best)
  }

  const libraryPath = path.join(movieDir, libraryFilename);

  try {
    // Copy from cache to library
    await fs.copyFile(asset.cache_path, libraryPath);

    // Set permissions (user-configurable - not yet implemented)
    await fs.chmod(libraryPath, 0o644);

    // Insert library_image_files record
    await db.library_image_files.create({
      cache_file_id: asset.cache_file_id,
      file_path: libraryPath,
      published_at: new Date(),
    });

    logger.debug('Asset published to library', {
      assetType: asset.asset_type,
      rank: asset.rank,
      libraryPath,
    });

  } catch (error) {
    logger.error('Failed to publish asset', {
      error: getErrorMessage(error),
      cachePath: asset.cache_path,
      libraryPath,
    });
  }
}
```

---

## Phase 4: Copy Actor Images to .actors/ Folder

**Goal**: Publish actor headshots to Kodi-compatible `.actors/` directory.

```typescript
const actorsDir = path.join(movieDir, '.actors');

// Create .actors directory
await fs.mkdir(actorsDir, { recursive: true });

// Get actors for this movie
const actors = await db.query(`
  SELECT a.name, a.image_cache_path
  FROM actors a
  JOIN movie_actors ma ON ma.actor_id = a.id
  WHERE ma.movie_id = ?
    AND a.image_cache_path IS NOT NULL
  ORDER BY ma.actor_order
`, [movieId]);

for (const actor of actors) {
  if (!await fs.exists(actor.image_cache_path)) {
    logger.warn('Actor image missing from cache', {
      actorName: actor.name,
      cachePath: actor.image_cache_path,
    });
    continue;
  }

  try {
    // Determine library filename (use actor name with spaces, NOT underscores)
    const ext = path.extname(actor.image_cache_path);
    const libraryFilename = `${actor.name}${ext}`;
    // e.g., "Keanu Reeves.jpg" (SPACES, not "Keanu_Reeves.jpg")

    const libraryPath = path.join(actorsDir, libraryFilename);

    // Copy from cache to library
    await fs.copyFile(actor.image_cache_path, libraryPath);

    // Set permissions
    await fs.chmod(libraryPath, 0o644);

    logger.debug('Actor image published', {
      actorName: actor.name,
      libraryPath,
    });

  } catch (error) {
    logger.error('Failed to publish actor image', {
      actorName: actor.name,
      error: getErrorMessage(error),
    });
  }
}
```

---

## Phase 5: Generate NFO with Stream Details

**Goal**: Create Kodi-compatible NFO metadata file with local file references only.

**Critical**: NFO must NOT contain `<thumb>` or `<fanart>` URLs. Kodi scans the directory for assets automatically.

```typescript
async function generateNFO(movie: Movie): Promise<string> {
  // Get stream details
  const videoStreams = await db.video_streams.findByEntity('movie', movie.id);
  const audioStreams = await db.audio_streams.findByEntity('movie', movie.id);
  const subtitleStreams = await db.subtitle_streams.findByEntity('movie', movie.id);

  // Get actors
  const actors = await db.query(`
    SELECT a.name, ma.role, a.image_cache_path
    FROM actors a
    JOIN movie_actors ma ON ma.actor_id = a.id
    WHERE ma.movie_id = ?
    ORDER BY ma.actor_order
  `, [movie.id]);

  // Get genres
  const genres = await db.query(`
    SELECT g.name
    FROM genres g
    JOIN movie_genres mg ON mg.genre_id = g.id
    WHERE mg.movie_id = ?
  `, [movie.id]);

  // Get studios
  const studios = await db.query(`
    SELECT s.name
    FROM studios s
    JOIN movie_studios ms ON ms.studio_id = s.id
    WHERE ms.movie_id = ?
  `, [movie.id]);

  // Get directors
  const directors = await db.query(`
    SELECT c.name
    FROM crew c
    JOIN movie_crew mc ON mc.crew_id = c.id
    WHERE mc.movie_id = ? AND mc.role = 'director'
    ORDER BY mc.sort_order
  `, [movie.id]);

  // Get writers
  const writers = await db.query(`
    SELECT c.name
    FROM crew c
    JOIN movie_crew mc ON mc.crew_id = c.id
    WHERE mc.movie_id = ? AND mc.role = 'writer'
    ORDER BY mc.sort_order
  `, [movie.id]);

  // Build NFO XML
  const nfoContent = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<movie>
  <title>${escapeXml(movie.title)}</title>
  <originaltitle>${escapeXml(movie.original_title || movie.title)}</originaltitle>
  <sorttitle>${escapeXml(movie.sort_title || movie.title)}</sorttitle>
  <year>${movie.year}</year>
  <plot>${escapeXml(movie.plot || '')}</plot>
  <outline>${escapeXml(movie.outline || '')}</outline>
  <tagline>${escapeXml(movie.tagline || '')}</tagline>
  <runtime>${movie.runtime || 0}</runtime>
  <mpaa>${escapeXml(movie.content_rating || '')}</mpaa>
  <premiered>${movie.release_date || ''}</premiered>

  <!-- Ratings -->
  ${movie.tmdb_rating ? `
  <ratings>
    <rating name="tmdb" max="10" default="true">
      <value>${movie.tmdb_rating}</value>
      <votes>${movie.tmdb_votes || 0}</votes>
    </rating>
    ${movie.imdb_rating ? `
    <rating name="imdb" max="10">
      <value>${movie.imdb_rating}</value>
      <votes>${movie.imdb_votes || 0}</votes>
    </rating>
    ` : ''}
  </ratings>
  ` : ''}

  <!-- User Rating -->
  ${movie.user_rating ? `<userrating>${movie.user_rating}</userrating>` : ''}

  <!-- IDs -->
  <uniqueid type="tmdb" default="true">${movie.tmdb_id}</uniqueid>
  ${movie.imdb_id ? `<uniqueid type="imdb">${movie.imdb_id}</uniqueid>` : ''}

  <!-- Genres -->
  ${genres.map(g => `<genre>${escapeXml(g.name)}</genre>`).join('\n  ')}

  <!-- Studios -->
  ${studios.map(s => `<studio>${escapeXml(s.name)}</studio>`).join('\n  ')}

  <!-- Directors -->
  ${directors.map(d => `<director>${escapeXml(d.name)}</director>`).join('\n  ')}

  <!-- Writers -->
  ${writers.map(w => `<credits>${escapeXml(w.name)}</credits>`).join('\n  ')}

  <!-- Actors -->
  ${actors.map(a => {
    const actorImagePath = a.image_cache_path
      ? `${movieDir}/.actors/${a.name}${path.extname(a.image_cache_path)}`
      : '';

    return `<actor>
    <name>${escapeXml(a.name)}</name>
    <role>${escapeXml(a.role || '')}</role>
    ${actorImagePath ? `<thumb>${escapeXml(actorImagePath)}</thumb>` : ''}
  </actor>`;
  }).join('\n  ')}

  <!-- Stream Details -->
  <fileinfo>
    <streamdetails>
      ${videoStreams.map(v => `
      <video>
        <codec>${escapeXml(v.codec || '')}</codec>
        <aspect>${v.aspect_ratio || ''}</aspect>
        <width>${v.width || 0}</width>
        <height>${v.height || 0}</height>
        <durationinseconds>${movie.runtime ? movie.runtime * 60 : 0}</durationinseconds>
      </video>
      `).join('')}
      ${audioStreams.map(a => `
      <audio>
        <codec>${escapeXml(a.codec || '')}</codec>
        <language>${escapeXml(a.language || '')}</language>
        <channels>${a.channels || 2}</channels>
      </audio>
      `).join('')}
      ${subtitleStreams.map(s => `
      <subtitle>
        <language>${escapeXml(s.language || '')}</language>
      </subtitle>
      `).join('')}
    </streamdetails>
  </fileinfo>

  <!-- NO <thumb> or <fanart> URLs - Kodi scans directory automatically -->
</movie>`;

  return nfoContent;
}

// Write NFO file
const nfoPath = path.join(movieDir, `${basename}.nfo`);
const nfoContent = await generateNFO(movie);
await fs.writeFile(nfoPath, nfoContent, 'utf8');
await fs.chmod(nfoPath, 0o644);

logger.info('NFO generated', { nfoPath });
```

### XML Escape Helper

```typescript
function escapeXml(unsafe: string): string {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
```

---

## Phase 6: Update Status & Notify Media Players

**Goal**: Mark entity as published and queue notification jobs for media players.

```typescript
// Get library for this movie
const library = await db.libraries.findById(movie.library_id);

// Get media player groups monitoring this library
const playerGroups = await db.query(`
  SELECT mpg.*
  FROM media_player_groups mpg
  JOIN media_player_libraries mpl ON mpl.group_id = mpg.id
  WHERE mpl.library_id = ? AND mpg.enabled = 1
`, [library.id]);

for (const group of playerGroups) {
  // Create notification job
  await jobQueue.create({
    type: `notify-${group.type}`, // notify-kodi, notify-jellyfin, notify-plex
    priority: 5, // NORMAL priority
    payload: {
      groupId: group.id,
      libraryId: library.id,
      libraryPath: movieDir,
      event: 'publish',
    },
  });

  logger.debug('Media player notification job created', {
    groupType: group.type,
    groupId: group.id,
  });
}
```

### Update Entity Status

```typescript
// Calculate NFO hash for change detection
const nfoHash = crypto.createHash('sha256').update(nfoContent).digest('hex');

// Update movie publish timestamp
await db.movies.update(movieId, {
  last_published_at: new Date(),
  published_nfo_hash: nfoHash,
});

// Log publication
await db.execute(
  `INSERT INTO publish_log (
    entity_type, entity_id, published_at, assets_published, nfo_generated
  ) VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?)`,
  [
    entityType,
    entityId,
    JSON.stringify({ count: assetsPublished }),
    true,
  ]
);

// Emit completion event (WebSocket to UI)
websocketBroadcaster.broadcast('entity.published', {
  entityType,
  entityId,
  assetsPublished,
  nfoGenerated: true,
});

logger.info('[Publishing] Complete', {
  entityId,
  entityType,
  assetsPublished,
  nfoGenerated: true,
});
```

### Notify Media Players

```typescript

---

## File Organization Examples

### Movie Directory Structure (After Publishing)

```
/media/movies/The Matrix (1999)/
├── The Matrix (1999).mkv              # Media file (untouched)
├── The Matrix (1999).nfo              # Metadata (Phase 4)
├── The Matrix (1999)-poster.jpg       # Best poster (rank 1)
├── The Matrix (1999)-poster1.jpg      # 2nd best poster (rank 2)
├── The Matrix (1999)-poster2.jpg      # 3rd best poster (rank 3)
├── The Matrix (1999)-fanart.jpg       # Best fanart (rank 1)
├── The Matrix (1999)-fanart1.jpg      # 2nd best fanart (rank 2)
├── The Matrix (1999)-clearlogo.png    # Best clearlogo (rank 1)
├── The Matrix (1999)-disc.png         # Best discart (rank 1)
└── .actors/                           # Actor images (Phase 3B)
    ├── Keanu Reeves.jpg               # SPACES in filename
    ├── Laurence Fishburne.jpg
    └── Carrie-Anne Moss.jpg
```

### Cache Directory Structure

```
/data/cache/
├── poster/
│   ├── ab/
│   │   └── abcdef123456.jpg           # Content-addressed by SHA256
│   └── cd/
│       └── cdef789012.jpg
├── fanart/
│   └── ef/
│       └── ef345678.jpg
├── actor/
│   └── 12/
│       └── 123456abcdef.jpg
└── temp/                              # Cleaned after enrichment Phase 3
```

---

## Configuration

```typescript
interface PublishingConfig {
  enabled: boolean; // Global publishing toggle (workflow.publishing)

  // File permissions (not yet implemented - future)
  filePermissions: {
    assets: string;  // Default: '0644'
    nfo: string;     // Default: '0644'
  };

  // Cleanup behavior
  cleanupUnselected: boolean; // Default: true (Phase 2)
}
```

---

## Error Handling

- **Permission denied**: Log error, skip file, continue
- **Disk full**: Log error, skip remaining files, alert user
- **Source missing**: Log error, skip file, continue
- **Hash mismatch**: Log error, skip download, use next candidate
- **Network timeout**: Retry 3x with exponential backoff, then skip

---

## Performance Considerations

- **Atomic writes**: Use temp files + rename for safety (future enhancement)
- **Batch operations**: Process multiple assets in single phase
- **Hash-based lookups**: Efficient cache file queries
- **Parallel downloads**: Phase 1 can parallelize provider downloads (future)

---

## Validation

```typescript
async function validatePublishing(movie: Movie): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check selected assets exist in cache
  const selectedAssets = await db.provider_assets.findSelected(movie.id);

  for (const asset of selectedAssets) {
    if (!asset.is_downloaded) {
      warnings.push(`Asset not in cache: ${asset.asset_type} (will download)`);
    }
  }

  // Check library directory writable
  const movieDir = path.dirname(movie.file_path);
  try {
    await fs.access(movieDir, fs.constants.W_OK);
  } catch {
    errors.push(`Library directory not writable: ${movieDir}`);
  }

  // Check disk space
  const stats = await fs.statfs(movieDir);
  if (stats.available < 100 * 1024 * 1024) { // 100MB
    warnings.push('Low disk space (< 100MB available)');
  }

  return { errors, warnings };
}
```

---

## Related Documentation

- [Enrichment Phase](ENRICHMENT.md) - Asset selection and scoring
- [NFO_PARSING.md](../technical/NFO_PARSING.md) - NFO format details
- [Database Schema](../DATABASE.md) - Cache and library tables
- [API Architecture](../API.md) - Publishing endpoints
- [Player Sync Phase](PLAYER_SYNC.md) - Media player notifications

---

## Next Phase

Upon completion, publishing **always** creates a job for the [Player Sync Phase](PLAYER_SYNC.md). If player sync is disabled in workflow settings, the job completes without processing, maintaining the phase chain.
