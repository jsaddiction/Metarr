# Publishing Phase

**Purpose**: Deploy selected assets from cache to library directories and create the ideal Kodi-compatible presentation for media player scanners.

**Related Docs**:
- Parent: [Phase Overview](OVERVIEW.md)
- Related: [NFO Format](../reference/NFO_FORMAT.md), [Two-Copy System](../architecture/ASSET_MANAGEMENT/TWO_COPY_SYSTEM.md)

## Quick Reference

- **Deployment operation**: Not a download operation (assets already in cache)
- **Idempotent**: Re-publishing repairs/updates without duplication
- **Atomic**: File operations use safe copy methods
- **Cleanup**: Removes unselected cache assets to reclaim space
- **Chainable**: Always triggers player sync phase (or passes through if disabled)

---

## Overview

Publishing materializes Metarr's curated metadata and assets into the library filesystem. It ensures media players see a perfectly organized, Kodi-compliant structure with all selected assets in place, proper naming conventions, and complete NFO metadata.

**Key Principle**: Publishing is a **deployment operation**, not a download operation. All assets should already be in cache from the enrichment phase. If cache files are missing (edge case: cache cleanup), publishing will re-download them.

---

## Prerequisites

- Entity must have `identification_status = 'enriched'`
- Selected assets must be in cache (`is_downloaded = 1`)
- At least one asset selected (`is_selected = 1`)

---

## Triggers

| Trigger Type | Description | Priority |
|--------------|-------------|----------|
| **Manual** | User clicks "Publish" button after reviewing enriched metadata | 10 (HIGH) |
| **Automated** | After enrichment if `workflow.auto_publish = true` | 5 (NORMAL) |
| **Republish** | User clicks "Republish" after making changes | 10 (HIGH) |
| **Verification** | Repair job detects missing/corrupted files | 3 (LOW) |
| **Bulk** | User selects multiple items and publishes via batch | 10 (HIGH) |

---

## Job Parameters

```typescript
interface PublishingJobPayload {
  entityId: number;
  entityType: 'movie' | 'episode' | 'series';
}
```

---

## Process Flow

Publishing executes six sequential sub-phases in a single job:

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
  throw new Error(`Cannot publish: movie ${entityId} not enriched`);
}

// Check selected assets exist
const selectedAssets = await db.query(`
  SELECT COUNT(*) as count FROM provider_assets
  WHERE entity_id = ? AND entity_type = ? AND is_selected = 1
`, [entityId, entityType]);

if (selectedAssets[0].count === 0) {
  throw new Error(`Cannot publish: no assets selected`);
}

// Check library directory writable
const movieDir = path.dirname(movie.file_path);
await fs.access(movieDir, fs.constants.W_OK);

// Check disk space (warn if < 100MB)
const stats = await fs.statfs(movieDir);
if (stats.available < 100 * 1024 * 1024) {
  logger.warn('[Publishing] Low disk space', { available: `${Math.round(stats.available / 1024 / 1024)}MB` });
}
```

---

## Phase 1: Ensure Cache Completeness

**Goal**: Re-download selected assets if missing from cache (edge case: cache cleanup between enrich/publish).

```typescript
const selectedAssets = await db.query(`
  SELECT pa.*, cf.id as cache_file_id, cf.file_path as cache_path
  FROM provider_assets pa
  LEFT JOIN cache_image_files cf ON cf.file_hash = pa.content_hash
  WHERE pa.entity_id = ? AND pa.is_selected = 1
`, [entityId]);

for (const asset of selectedAssets) {
  if (asset.cache_file_id && await fs.exists(asset.cache_path)) {
    continue; // Already cached
  }

  // Cache file missing - download
  const buffer = await downloadFile(asset.provider_url);
  const actualHash = calculateSHA256(buffer);

  if (actualHash !== asset.content_hash) {
    logger.error('Hash mismatch - provider changed asset', { expected: asset.content_hash, actual: actualHash });
    continue;
  }

  const cachePath = `/data/cache/${asset.asset_type}/${asset.content_hash.slice(0, 2)}/${asset.content_hash}.jpg`;
  await fs.writeFile(cachePath, buffer);

  await db.cache_image_files.create({
    entity_type: entityType,
    entity_id: entityId,
    file_path: cachePath,
    file_hash: asset.content_hash,
    image_type: asset.asset_type,
    source_type: 'provider',
    source_url: asset.provider_url,
  });
}
```

---

## Phase 2: Cleanup Unselected Cache Assets

**Goal**: Delete cache files NOT linked to selected provider assets to reclaim disk space.

**Rationale**: User has reviewed and approved selections. Unselected assets can be deleted immediately. If user changes mind later, re-enrichment will fetch them again.

```typescript
const unselectedImages = await db.query(`
  SELECT c.id, c.file_path, c.file_size
  FROM cache_image_files c
  WHERE c.entity_id = ? AND c.entity_type = ?
    AND c.image_type != 'actor_thumb'  -- Keep actor images (shared across movies)
    AND c.file_hash NOT IN (
      SELECT content_hash FROM provider_assets
      WHERE entity_id = ? AND is_selected = 1
    )
`, [entityId, entityType, entityId]);

for (const cacheFile of unselectedImages) {
  if (await fs.exists(cacheFile.file_path)) {
    await fs.unlink(cacheFile.file_path);
    bytesReclaimed += cacheFile.file_size || 0;
  }
  await db.execute(`DELETE FROM cache_image_files WHERE id = ?`, [cacheFile.id]);
  filesDeleted++;
}

logger.info('[Publishing] Cache cleanup complete', {
  filesDeleted,
  bytesReclaimed: `${Math.round(bytesReclaimed / 1024 / 1024)}MB`,
});
```

**Note**: Actor thumbnails are NOT deleted (shared across multiple movies).

---

## Phase 3: Copy to Library (Kodi Naming with Rank-Based Numbering)

**Goal**: Deploy selected assets to library directory with Kodi-compatible naming.

### Rank-Based Naming

Assets are numbered by score rank:
- **Rank 1** (highest score): `poster.jpg` (no number)
- **Rank 2**: `poster1.jpg`
- **Rank 3**: `poster2.jpg`

```typescript
// Get selected assets ordered by score
const selectedAssets = await db.query(`
  SELECT pa.asset_type, pa.score, cf.file_path as cache_path,
    ROW_NUMBER() OVER (PARTITION BY pa.asset_type ORDER BY pa.score DESC) as rank
  FROM provider_assets pa
  JOIN cache_image_files cf ON cf.file_hash = pa.content_hash
  WHERE pa.entity_id = ? AND pa.is_selected = 1
  ORDER BY pa.asset_type, pa.score DESC
`, [entityId]);

const movieDir = path.dirname(movie.file_path);
const basename = path.basename(movie.file_path, path.extname(movie.file_path));

for (const asset of selectedAssets) {
  let libraryFilename: string;
  const ext = path.extname(asset.cache_path);

  if (asset.rank === 1) {
    libraryFilename = `${basename}-${asset.asset_type}${ext}`;
    // e.g., "The Matrix (1999)-poster.jpg"
  } else {
    libraryFilename = `${basename}-${asset.asset_type}${asset.rank - 1}${ext}`;
    // e.g., "The Matrix (1999)-poster1.jpg" (2nd best)
  }

  const libraryPath = path.join(movieDir, libraryFilename);

  await fs.copyFile(asset.cache_path, libraryPath);
  await fs.chmod(libraryPath, 0o644);

  await db.library_image_files.create({
    cache_file_id: asset.cache_file_id,
    file_path: libraryPath,
    published_at: new Date(),
  });
}
```

---

## Phase 4: Copy Actor Images to .actors/ Folder

**Goal**: Publish actor headshots to Kodi-compatible `.actors/` directory.

```typescript
const actorsDir = path.join(movieDir, '.actors');
await fs.mkdir(actorsDir, { recursive: true });

const actors = await db.query(`
  SELECT a.name, a.image_cache_path
  FROM actors a
  JOIN movie_actors ma ON ma.actor_id = a.id
  WHERE ma.movie_id = ? AND a.image_cache_path IS NOT NULL
  ORDER BY ma.actor_order
`, [movieId]);

for (const actor of actors) {
  if (!await fs.exists(actor.image_cache_path)) {
    logger.warn('Actor image missing from cache', { actorName: actor.name });
    continue;
  }

  const ext = path.extname(actor.image_cache_path);
  const libraryFilename = `${actor.name}${ext}`;
  // e.g., "Keanu Reeves.jpg" (SPACES, not "Keanu_Reeves.jpg")

  const libraryPath = path.join(actorsDir, libraryFilename);

  await fs.copyFile(actor.image_cache_path, libraryPath);
  await fs.chmod(libraryPath, 0o644);
}
```

---

## Phase 5: Generate NFO with Stream Details

**Goal**: Create Kodi-compatible NFO metadata file.

**Critical**: NFO must NOT contain `<thumb>` or `<fanart>` URLs. Kodi scans the directory for assets automatically.

```typescript
async function generateNFO(movie: Movie): Promise<string> {
  const videoStreams = await db.video_streams.findByEntity('movie', movie.id);
  const audioStreams = await db.audio_streams.findByEntity('movie', movie.id);
  const subtitleStreams = await db.subtitle_streams.findByEntity('movie', movie.id);
  const actors = await db.getActors(movie.id);
  const genres = await db.getGenres(movie.id);
  const studios = await db.getStudios(movie.id);
  const directors = await db.getDirectors(movie.id);
  const writers = await db.getWriters(movie.id);

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<movie>
  <title>${escapeXml(movie.title)}</title>
  <originaltitle>${escapeXml(movie.original_title || movie.title)}</originaltitle>
  <sorttitle>${escapeXml(movie.sort_title || movie.title)}</sorttitle>
  <year>${movie.year}</year>
  <plot>${escapeXml(movie.plot || '')}</plot>
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
  </ratings>
  ` : ''}

  <!-- IDs -->
  <uniqueid type="tmdb" default="true">${movie.tmdb_id}</uniqueid>
  ${movie.imdb_id ? `<uniqueid type="imdb">${movie.imdb_id}</uniqueid>` : ''}

  <!-- Genres -->
  ${genres.map(g => `<genre>${escapeXml(g.name)}</genre>`).join('\n  ')}

  <!-- Actors -->
  ${actors.map(a => `<actor>
    <name>${escapeXml(a.name)}</name>
    <role>${escapeXml(a.role || '')}</role>
  </actor>`).join('\n  ')}

  <!-- Stream Details -->
  <fileinfo>
    <streamdetails>
      ${videoStreams.map(v => `<video>
        <codec>${escapeXml(v.codec || '')}</codec>
        <width>${v.width || 0}</width>
        <height>${v.height || 0}</height>
      </video>`).join('')}
      ${audioStreams.map(a => `<audio>
        <codec>${escapeXml(a.codec || '')}</codec>
        <language>${escapeXml(a.language || '')}</language>
        <channels>${a.channels || 2}</channels>
      </audio>`).join('')}
    </streamdetails>
  </fileinfo>

  <!-- NO <thumb> or <fanart> URLs - Kodi scans directory automatically -->
</movie>`;
}

const nfoPath = path.join(movieDir, `${basename}.nfo`);
const nfoContent = await generateNFO(movie);
await fs.writeFile(nfoPath, nfoContent, 'utf8');
```

**See**: [NFO Format Reference](../reference/NFO_FORMAT.md) for complete structure.

---

## Phase 6: Update Status & Notify Players

**Goal**: Mark entity as published and queue notification jobs for media players.

```typescript
// Get library for this movie
const library = await db.libraries.findById(movie.library_id);

// Get media player groups monitoring this library
const playerGroups = await db.query(`
  SELECT mpg.* FROM media_player_groups mpg
  JOIN media_player_libraries mpl ON mpl.group_id = mpg.id
  WHERE mpl.library_id = ? AND mpg.enabled = 1
`, [library.id]);

for (const group of playerGroups) {
  // Create notification job
  await jobQueue.create({
    type: `notify-${group.type}`, // notify-kodi, notify-jellyfin, notify-plex
    priority: 5,
    payload: { groupId: group.id, libraryId: library.id, libraryPath: movieDir, event: 'publish' },
  });
}

// Update movie publish timestamp
await db.movies.update(movieId, {
  last_published_at: new Date(),
  published_nfo_hash: crypto.createHash('sha256').update(nfoContent).digest('hex'),
});

// Emit completion event
websocketBroadcaster.broadcast('entity.published', {
  entityType,
  entityId,
  assetsPublished,
  nfoGenerated: true,
});
```

---

## File Organization Example

### Movie Directory Structure (After Publishing)

```
/media/movies/The Matrix (1999)/
├── The Matrix (1999).mkv              # Media file (untouched)
├── The Matrix (1999).nfo              # Metadata (Phase 5)
├── The Matrix (1999)-poster.jpg       # Best poster (rank 1)
├── The Matrix (1999)-poster1.jpg      # 2nd best poster (rank 2)
├── The Matrix (1999)-fanart.jpg       # Best fanart (rank 1)
├── The Matrix (1999)-fanart1.jpg      # 2nd best fanart (rank 2)
├── The Matrix (1999)-clearlogo.png    # Best clearlogo (rank 1)
└── .actors/                           # Actor images
    ├── Keanu Reeves.jpg               # SPACES in filename
    ├── Laurence Fishburne.jpg
    └── Carrie-Anne Moss.jpg
```

---

## Configuration

```typescript
interface PublishingConfig {
  enabled: boolean; // Global publishing toggle (workflow.publishing)

  // Cleanup behavior
  cleanupUnselected: boolean; // Default: true (Phase 2)
}
```

**Configuration via UI**: Settings → General → Publishing
**Configuration via API**: `GET/PATCH /api/v1/settings/phase-config`

---

## Error Handling

| Error Type | Behavior |
|------------|----------|
| **Permission denied** | Log error, skip file, continue |
| **Disk full** | Log error, skip remaining files, alert user |
| **Source missing** | Log error, skip file, continue |
| **Hash mismatch** | Log error, skip download, use next candidate |
| **Network timeout** | Retry 3x with exponential backoff, then skip |

---

## Next Phase

Upon completion, publishing **always** creates a job for the [Player Sync Phase](PLAYER_SYNC.md). If player sync is disabled in workflow settings, the job completes without processing, maintaining the phase chain.

**Chain**: Scan → Enrichment → Publishing → Player Sync

---

## See Also

- [Enrichment Phase](ENRICHMENT.md) - Asset selection and scoring
- [NFO Format Reference](../reference/NFO_FORMAT.md) - NFO structure details
- [Two-Copy System](../architecture/ASSET_MANAGEMENT/TWO_COPY_SYSTEM.md) - Cache vs Library
- [Database Schema](../architecture/DATABASE.md) - Cache and library tables
- [Player Sync Phase](PLAYER_SYNC.md) - Media player notifications
