# Asset Management - Three-Tier System

**Related Docs**: [ARCHITECTURE.md](ARCHITECTURE.md), [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md), [AUTOMATION_AND_WEBHOOKS.md](AUTOMATION_AND_WEBHOOKS.md), [FIELD_LOCKING.md](FIELD_LOCKING.md)

This document describes Metarr's three-tier asset management system, which replaces the previous two-copy architecture with a more flexible candidate-based approach.

---

## Overview

Metarr manages media assets (posters, fanart, banners, etc.) through three distinct tiers:

```
┌─────────────────────────────────────────────────────────────┐
│                 THREE-TIER ASSET PIPELINE                    │
└─────────────────────────────────────────────────────────────┘

TIER 1: CANDIDATES (Provider URLs + Metadata)
  ↓
  │ - TMDB returns 15 poster URLs
  │ - Stored in database (no files yet)
  │ - User sees thumbnails in UI
  ↓
TIER 2: CACHE (Content-Addressed Immutable Storage)
  ↓
  │ - User selects poster #3
  │ - Download from URL → SHA256 hash → save as {hash}.jpg
  │ - Automatic deduplication
  │ - Permanent storage (never deleted)
  ↓
TIER 3: LIBRARY (Published Assets for Players)
  │
  │ - User clicks "Publish"
  │ - Copy cache/{hash}.jpg → library/poster.jpg
  │ - Kodi naming convention
  │ - Ephemeral (can be regenerated from cache)
```

---

## Tier 1: Asset Candidates

### Purpose

Track all available assets from providers without downloading them immediately (lazy loading).

### Database Schema

```sql
CREATE TABLE asset_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,      -- 'movie', 'series', 'episode', 'actor'
  entity_id INTEGER NOT NULL,
  asset_type TEXT NOT NULL,       -- 'poster', 'fanart', 'banner', etc.

  -- Provider information
  provider TEXT NOT NULL,         -- 'tmdb', 'tvdb', 'fanart.tv', 'local'
  provider_url TEXT,              -- NULL if local file
  provider_metadata TEXT,         -- JSON: { language, vote_avg, vote_count }

  -- Image properties (from provider API, before download)
  width INTEGER,
  height INTEGER,
  file_size INTEGER,

  -- Download state
  is_downloaded BOOLEAN DEFAULT 0,
  cache_path TEXT,                -- NULL until downloaded
  content_hash TEXT,              -- SHA256 of file content
  perceptual_hash TEXT,           -- pHash for duplicate detection

  -- Selection state
  is_selected BOOLEAN DEFAULT 0,
  is_rejected BOOLEAN DEFAULT 0,  -- User or algorithm rejected
  selected_by TEXT,               -- 'auto', 'manual', 'local'
  selected_at TIMESTAMP,

  -- Scoring (for auto-selection algorithm)
  auto_score REAL,                -- 0-100

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_candidates_entity ON asset_candidates(entity_type, entity_id, asset_type);
CREATE INDEX idx_candidates_selected ON asset_candidates(is_selected);
CREATE INDEX idx_candidates_downloaded ON asset_candidates(is_downloaded);
CREATE INDEX idx_candidates_content_hash ON asset_candidates(content_hash);
```

### Workflow

**Step 1: Enrichment (Provider Fetch)**

```typescript
// Fetch posters from TMDB
const tmdbResponse = await tmdb.getMovieImages(tmdbId);

for (const poster of tmdbResponse.posters) {
  await db.execute(`
    INSERT INTO asset_candidates (
      entity_type,
      entity_id,
      asset_type,
      provider,
      provider_url,
      width,
      height,
      provider_metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    'movie',
    movieId,
    'poster',
    'tmdb',
    `https://image.tmdb.org/t/p/original${poster.file_path}`,
    poster.width,
    poster.height,
    JSON.stringify({
      language: poster.iso_639_1,
      vote_average: poster.vote_average,
      vote_count: poster.vote_count
    })
  ]);
}
```

**Result**: 15 poster candidates stored, no files downloaded yet.

**Step 2: UI Display (Lazy Thumbnails)**

```typescript
// Frontend loads candidates
const candidates = await fetch(`/api/movies/${movieId}/assets/candidates?assetType=poster`);

// Display grid with lazy-loaded thumbnails
candidates.forEach(candidate => {
  // Use provider thumbnail URL (or cache if already downloaded)
  const thumbnailUrl = candidate.is_downloaded
    ? `/api/cache/${candidate.content_hash}/thumbnail`
    : `${candidate.provider_url}?w=200`; // Provider thumbnail

  renderThumbnail(thumbnailUrl);
});
```

**Step 3: Selection (Download on Demand)**

```typescript
// User clicks poster #3
const candidateId = 456;

// Download and cache
const downloaded = await assetService.downloadCandidate(candidateId);

// Calculate hashes
const contentHash = sha256(downloaded.buffer);
const pHash = await calculatePerceptualHash(downloaded.buffer);

// Update candidate
await db.execute(`
  UPDATE asset_candidates
  SET is_downloaded = 1,
      cache_path = ?,
      content_hash = ?,
      perceptual_hash = ?,
      is_selected = 1,
      selected_by = 'manual',
      selected_at = CURRENT_TIMESTAMP
  WHERE id = ?
`, [
  `/data/cache/assets/${contentHash}.jpg`,
  contentHash,
  pHash,
  candidateId
]);

// Mark entity as having unpublished changes
await db.execute(`
  UPDATE movies
  SET has_unpublished_changes = 1
  WHERE id = ?
`, [movieId]);
```

---

## Tier 2: Cache (Immutable Storage)

### Purpose

Permanent, content-addressed storage for all downloaded assets. Acts as single source of truth.

### Filesystem Structure

```
data/cache/assets/
  abc123def456789...xyz.jpg       ← Content-addressed (SHA256 of file)
  abc123def456789...xyz.jpg       ← Same hash = deduplication
  ghi789jkl012345...uvw.jpg
  mno345pqr678901...rst.jpg
```

**Naming Convention**: `{sha256_hash}.{extension}`

**Benefits**:
- **Deduplication**: Same image for 10 movies = stored once
- **Integrity**: Rehash file, compare to filename (detect corruption)
- **Immutability**: Filename never changes (perfect for caching)
- **Collision-proof**: SHA256 guarantees uniqueness

### Database Tracking

```sql
CREATE TABLE cache_inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_hash TEXT UNIQUE NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  asset_type TEXT NOT NULL,       -- 'image', 'trailer', 'subtitle'
  mime_type TEXT,

  -- Reference counting
  reference_count INTEGER DEFAULT 0,

  -- Lifecycle
  first_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP,
  orphaned_at TIMESTAMP,          -- Set when ref_count = 0

  -- Image metadata
  width INTEGER,
  height INTEGER,
  perceptual_hash TEXT,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_cache_content_hash ON cache_inventory(content_hash);
CREATE INDEX idx_cache_orphaned ON cache_inventory(orphaned_at);
```

### Store Asset

```typescript
async function storeAsset(
  buffer: Buffer,
  assetType: string,
  metadata: AssetMetadata
): Promise<string> {
  // 1. Calculate content hash
  const contentHash = sha256(buffer);
  const extension = mime.extension(metadata.mimeType);
  const filePath = `/data/cache/assets/${contentHash}.${extension}`;

  // 2. Check if already exists (deduplication)
  const existing = await db.query(`
    SELECT * FROM cache_inventory
    WHERE content_hash = ?
  `, [contentHash]);

  if (existing.length > 0) {
    // Already cached, increment reference count
    await db.execute(`
      UPDATE cache_inventory
      SET reference_count = reference_count + 1,
          last_used_at = CURRENT_TIMESTAMP
      WHERE content_hash = ?
    `, [contentHash]);

    return filePath;
  }

  // 3. Write file
  await fs.writeFile(filePath, buffer);

  // 4. Calculate pHash (for images)
  let pHash = null;
  if (assetType === 'image') {
    pHash = await calculatePerceptualHash(buffer);
  }

  // 5. Insert into inventory
  await db.execute(`
    INSERT INTO cache_inventory (
      content_hash,
      file_path,
      file_size,
      asset_type,
      mime_type,
      reference_count,
      width,
      height,
      perceptual_hash
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
  `, [
    contentHash,
    filePath,
    buffer.length,
    assetType,
    metadata.mimeType,
    metadata.width,
    metadata.height,
    pHash
  ]);

  return filePath;
}
```

### Retrieve Asset

```typescript
async function retrieveAsset(contentHash: string): Promise<Buffer> {
  const cached = await db.query(`
    SELECT file_path FROM cache_inventory
    WHERE content_hash = ?
  `, [contentHash]);

  if (cached.length === 0) {
    throw new Error(`Asset not found in cache: ${contentHash}`);
  }

  // Update last_used_at
  await db.execute(`
    UPDATE cache_inventory
    SET last_used_at = CURRENT_TIMESTAMP
    WHERE content_hash = ?
  `, [contentHash]);

  return fs.readFile(cached[0].file_path);
}
```

### Orphan Asset (Soft Delete)

```typescript
async function orphanAsset(contentHash: string): Promise<void> {
  // Decrement reference count
  await db.execute(`
    UPDATE cache_inventory
    SET reference_count = reference_count - 1
    WHERE content_hash = ?
  `, [contentHash]);

  // Check if orphaned (ref_count = 0)
  const updated = await db.query(`
    SELECT reference_count FROM cache_inventory
    WHERE content_hash = ?
  `, [contentHash]);

  if (updated[0].reference_count === 0) {
    // Mark as orphaned
    await db.execute(`
      UPDATE cache_inventory
      SET orphaned_at = CURRENT_TIMESTAMP
      WHERE content_hash = ?
    `, [contentHash]);
  }
}
```

### Garbage Collection

```typescript
async function garbageCollect(): Promise<void> {
  // Find orphaned assets older than 90 days
  const orphaned = await db.query(`
    SELECT * FROM cache_inventory
    WHERE orphaned_at IS NOT NULL
      AND orphaned_at < DATETIME('now', '-90 days')
  `);

  for (const asset of orphaned) {
    // Delete file
    await fs.unlink(asset.file_path);

    // Delete from inventory
    await db.execute(`
      DELETE FROM cache_inventory
      WHERE id = ?
    `, [asset.id]);

    console.log(`Garbage collected: ${asset.content_hash}`);
  }
}
```

**Scheduled Task**: Run weekly at 3 AM

---

## Tier 3: Library (Published Assets)

### Purpose

Assets visible to media players (Kodi, Jellyfin, Plex). Ephemeral, can be regenerated from cache.

### Filesystem Structure

```
/movies/The Matrix (1999)/
  The Matrix.mkv
  The Matrix.nfo
  poster.jpg              ← Copied from cache on publish
  fanart.jpg              ← Copied from cache
  fanart1.jpg             ← Copied from cache
  fanart2.jpg             ← Copied from cache
```

**Naming Convention**: Kodi standard
- `poster.jpg` - Primary poster
- `fanart.jpg` - Primary fanart
- `fanart1.jpg`, `fanart2.jpg`, ... - Additional fanart
- `banner.jpg` - TV show banner
- `clearlogo.png` - Transparent logo
- etc. (see [NFO_PARSING.md](NFO_PARSING.md) for full list)

### Publishing Workflow

```typescript
async function publishAssets(
  entityType: string,
  entityId: number
): Promise<PublishResult> {
  // 1. Get selected candidates
  const selected = await db.query(`
    SELECT * FROM asset_candidates
    WHERE entity_type = ?
      AND entity_id = ?
      AND is_selected = 1
  `, [entityType, entityId]);

  // 2. Get library path
  const entity = await db.getEntity(entityType, entityId);
  const libraryPath = path.dirname(entity.file_path);

  // 3. Copy each asset from cache to library
  const published: PublishedAsset[] = [];

  for (const candidate of selected) {
    // Determine Kodi filename
    const libraryFilename = getKodiFilename(
      candidate.asset_type,
      published.filter(p => p.asset_type === candidate.asset_type).length
    );

    const libraryAssetPath = path.join(libraryPath, libraryFilename);

    // Copy from cache
    await fs.copyFile(candidate.cache_path, libraryAssetPath);

    published.push({
      asset_type: candidate.asset_type,
      cache_path: candidate.cache_path,
      library_path: libraryAssetPath,
      content_hash: candidate.content_hash
    });
  }

  // 4. Log publication
  await db.execute(`
    INSERT INTO publish_log (
      entity_type,
      entity_id,
      assets_published
    ) VALUES (?, ?, ?)
  `, [entityType, entityId, JSON.stringify(published)]);

  return { success: true, assets: published };
}

function getKodiFilename(assetType: string, index: number): string {
  switch (assetType) {
    case 'poster':
      return 'poster.jpg';
    case 'fanart':
      return index === 0 ? 'fanart.jpg' : `fanart${index}.jpg`;
    case 'banner':
      return 'banner.jpg';
    case 'clearlogo':
      return 'clearlogo.png';
    case 'clearart':
      return 'clearart.png';
    default:
      return `${assetType}.jpg`;
  }
}
```

### Disaster Recovery (Restore from Cache)

**Scenario**: Radarr upgrades movie, deletes entire directory

```typescript
async function restoreFromCache(
  entityType: string,
  entityId: number,
  libraryPath: string
): Promise<void> {
  // 1. Get published assets from last publish log
  const lastPublish = await db.query(`
    SELECT assets_published
    FROM publish_log
    WHERE entity_type = ?
      AND entity_id = ?
      AND success = 1
    ORDER BY published_at DESC
    LIMIT 1
  `, [entityType, entityId]);

  if (lastPublish.length === 0) {
    console.warn(`No published assets found for ${entityType} ${entityId}`);
    return;
  }

  const published: PublishedAsset[] = JSON.parse(lastPublish[0].assets_published);

  // 2. Ensure library directory exists
  await fs.ensureDir(libraryPath);

  // 3. Restore each asset from cache
  for (const asset of published) {
    if (!await fs.pathExists(asset.cache_path)) {
      console.error(`Cache file missing: ${asset.cache_path}`);
      continue;
    }

    // Check if library file already exists (avoid unnecessary copy)
    if (await fs.pathExists(asset.library_path)) {
      const libraryHash = await hashFile(asset.library_path);
      if (libraryHash === asset.content_hash) {
        console.log(`Asset already exists and matches cache: ${asset.library_path}`);
        continue;
      }
    }

    // Copy from cache
    await fs.copyFile(asset.cache_path, asset.library_path);
    console.log(`Restored ${asset.asset_type}: ${asset.library_path}`);
  }

  console.log(`Successfully restored ${published.length} assets from cache`);
}
```

**Webhook Integration**: Automatically called when upgrade detected

---

## Asset Selection Algorithm

### Purpose

Automatically select "best" assets based on configurable criteria.

### Configuration

```sql
CREATE TABLE asset_selection_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  library_id INTEGER NOT NULL,
  asset_type TEXT NOT NULL,

  -- Quantity
  min_count INTEGER DEFAULT 1,
  max_count INTEGER DEFAULT 3,

  -- Quality filters
  min_width INTEGER,
  min_height INTEGER,
  prefer_language TEXT DEFAULT 'en',

  -- Scoring weights (must sum to 1.0)
  weight_resolution REAL DEFAULT 0.3,
  weight_votes REAL DEFAULT 0.4,
  weight_language REAL DEFAULT 0.2,
  weight_provider REAL DEFAULT 0.1,

  -- Duplicate detection
  phash_similarity_threshold REAL DEFAULT 0.90,

  -- Provider priority (JSON array)
  provider_priority TEXT DEFAULT '["tmdb", "tvdb", "fanart.tv"]',

  FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE,
  UNIQUE(library_id, asset_type)
);
```

### Algorithm

```typescript
async function autoSelectAssets(
  entityId: number,
  entityType: string,
  assetType: string
): Promise<void> {
  // 1. Get config
  const config = await getAssetSelectionConfig(libraryId, assetType);

  // 2. Get candidates
  const candidates = await db.query(`
    SELECT * FROM asset_candidates
    WHERE entity_type = ?
      AND entity_id = ?
      AND asset_type = ?
      AND is_rejected = 0
      AND provider_url NOT IN (
        SELECT provider_url FROM rejected_assets
      )
  `, [entityType, entityId, assetType]);

  // 3. Download candidates if not already cached
  for (const candidate of candidates) {
    if (!candidate.is_downloaded) {
      await downloadCandidate(candidate.id);
    }
  }

  // 4. Score each candidate
  for (const candidate of candidates) {
    candidate.auto_score = calculateScore(candidate, config);
  }

  // 5. Filter duplicates (pHash similarity)
  const unique = filterDuplicates(candidates, config.phash_similarity_threshold);

  // 6. Sort by score (descending)
  unique.sort((a, b) => b.auto_score - a.auto_score);

  // 7. Select top N
  const selected = unique.slice(0, config.max_count);

  // 8. Mark as selected
  for (const candidate of selected) {
    await db.execute(`
      UPDATE asset_candidates
      SET is_selected = 1,
          selected_by = 'auto',
          selected_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [candidate.id]);
  }

  // 9. Mark rejected
  const rejected = unique.slice(config.max_count);
  for (const candidate of rejected) {
    await db.execute(`
      UPDATE asset_candidates
      SET is_rejected = 1
      WHERE id = ?
    `, [candidate.id]);
  }
}

function calculateScore(
  candidate: AssetCandidate,
  config: AssetSelectionConfig
): number {
  let score = 0;

  // Resolution score (0-100)
  const resolutionScore = Math.min(100, (candidate.width / 2000) * 100);
  score += resolutionScore * config.weight_resolution;

  // Vote score (0-100)
  const metadata = JSON.parse(candidate.provider_metadata || '{}');
  const voteScore = ((metadata.vote_average || 5) / 10) * 100;
  score += voteScore * config.weight_votes;

  // Language score (0 or 100)
  const langScore = metadata.language === config.prefer_language ? 100 : 0;
  score += langScore * config.weight_language;

  // Provider score
  const providerPriority = JSON.parse(config.provider_priority);
  const providerIndex = providerPriority.indexOf(candidate.provider);
  const providerScore = providerIndex >= 0
    ? 100 - (providerIndex * 20)  // 1st=100, 2nd=80, 3rd=60
    : 0;
  score += providerScore * config.weight_provider;

  return score;
}

function filterDuplicates(
  candidates: AssetCandidate[],
  threshold: number
): AssetCandidate[] {
  const unique: AssetCandidate[] = [];

  for (const candidate of candidates) {
    const isDuplicate = unique.some(existing => {
      const similarity = calculatePHashSimilarity(
        candidate.perceptual_hash,
        existing.perceptual_hash
      );
      return similarity >= threshold;
    });

    if (!isDuplicate) {
      unique.push(candidate);
    }
  }

  return unique;
}
```

---

## Manual Selection Workflow

### UI Flow

```
User sees movie with auto-selected poster
  ↓
User clicks "Replace Image" button
  ↓
Modal opens with:
  - Current poster (🤖 Auto Selected badge)
  - Grid of all available candidates
  - "Search Providers" button
  - "Let Algorithm Choose" button
  ↓
Option A: User clicks specific poster
  ├─ Mark old as rejected
  ├─ Mark new as selected (selected_by = 'manual')
  ├─ Lock poster field (poster_locked = 1)
  └─ Set has_unpublished_changes = 1

Option B: User clicks "Search Providers"
  ├─ Query additional providers (TMDB, TVDB, Fanart.tv)
  ├─ Add new candidates to database
  ├─ Display expanded grid
  └─ User selects one (same as Option A)

Option C: User clicks "Let Algorithm Choose"
  ├─ Mark old as rejected
  ├─ Re-run auto-selection (skips rejected)
  ├─ Select new top-scored candidate
  └─ Set has_unpublished_changes = 1
```

### API Endpoints

```typescript
// Get all candidates for entity
GET /api/movies/:id/assets/candidates?assetType=poster
Response: [
  {
    id: 456,
    asset_type: 'poster',
    provider: 'tmdb',
    provider_url: 'https://...',
    width: 2000,
    height: 3000,
    is_selected: true,
    selected_by: 'auto',
    auto_score: 87.5,
    thumbnail_url: '/api/cache/{hash}/thumbnail'
  },
  ...
]

// Select specific candidate
POST /api/movies/:id/assets/select
Body: {
  candidateId: 789,
  assetType: 'poster'
}
Response: { success: true }

// Reject current and re-run algorithm
POST /api/movies/:id/assets/reselect
Body: {
  currentCandidateId: 456,
  assetType: 'poster'
}
Response: { success: true, newCandidateId: 999 }

// Search additional providers
POST /api/movies/:id/assets/search
Body: {
  assetType: 'poster',
  providers: ['tmdb', 'tvdb', 'fanart.tv']
}
Response: {
  added: 12,
  candidates: [...]
}
```

---

## Perceptual Hashing for Duplicate Detection

### Why Perceptual Hashing?

Metarr uses **perceptual hashing (pHash)** to detect visually similar images, even if they have different resolutions or slight color variations.

**File hashes (MD5/SHA256) only detect exact duplicates:**
```
Image A: poster.jpg (1920×1080, bright colors)
Image B: poster_hq.jpg (3840×2160, same image upscaled)
MD5: Different (different file sizes, pixel data)
pHash: >95% similar (visually identical)
```

### Algorithm Steps

1. **Resize** image to small size (e.g., 32×32) to normalize resolution
2. **Convert to grayscale** to ignore color variations
3. **Compute DCT** (Discrete Cosine Transform) to capture frequency patterns
4. **Generate hash** from low-frequency components
5. **Compare hashes** using Hamming distance

### Implementation

```typescript
import * as phash from 'sharp-phash';
import * as sharp from 'sharp';

async function calculatePerceptualHash(imagePath: string): Promise<string> {
  const buffer = await sharp(imagePath)
    .resize(32, 32)
    .grayscale()
    .toBuffer();

  const hash = await phash(buffer);
  return hash;  // e.g., "a1b2c3d4e5f6g7h8"
}

function compareHashes(hash1: string, hash2: string): number {
  // Calculate Hamming distance
  const distance = hammingDistance(hash1, hash2);
  const maxDistance = hash1.length * 4;  // Each char is 4 bits
  const similarity = 1 - (distance / maxDistance);
  return similarity;  // 0.0 to 1.0
}

function hammingDistance(str1: string, str2: string): number {
  let distance = 0;
  for (let i = 0; i < str1.length; i++) {
    const xor = parseInt(str1[i], 16) ^ parseInt(str2[i], 16);
    distance += xor.toString(2).split('1').length - 1;
  }
  return distance;
}
```

### Similarity Threshold

**90% similarity** is the default threshold (configurable in `asset_selection_config`):
- **Above 90%**: Considered duplicate, skip
- **Below 90%**: Considered unique, include

**Examples:**
- Same image, different resolution: 95-98% similar → Skip
- Same scene, different angle: 85% similar → Include
- Different scenes from same movie: 40-60% similar → Include

### Usage in Selection Algorithm

```typescript
// During asset selection
const unique: AssetCandidate[] = [];

for (const candidate of downloaded) {
  const isDuplicate = unique.some(existing => {
    const similarity = calculatePHashSimilarity(
      candidate.perceptual_hash,
      existing.perceptual_hash
    );
    return similarity >= config.phash_similarity_threshold; // Default: 0.90
  });

  if (!isDuplicate) {
    unique.push(candidate);
  }
}
```

---

## Global Rejection List

### Purpose

Prevent specific assets from being selected across all media items (e.g., low-quality or inappropriate images).

### Schema

```sql
CREATE TABLE rejected_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  provider_url TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  rejected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reason TEXT,  -- 'user_rejected', 'duplicate', 'low_quality', 'inappropriate'

  UNIQUE(provider, provider_url)
);

CREATE INDEX idx_rejected_provider_url ON rejected_assets(provider, provider_url);
```

### Usage

```typescript
// When user rejects a candidate
async function rejectCandidate(candidateId: number, reason: string): Promise<void> {
  const candidate = await db.getAssetCandidate(candidateId);

  // Add to global blacklist
  await db.execute(`
    INSERT OR IGNORE INTO rejected_assets (
      provider,
      provider_url,
      asset_type,
      reason
    ) VALUES (?, ?, ?, ?)
  `, [
    candidate.provider,
    candidate.provider_url,
    candidate.asset_type,
    reason
  ]);

  // Mark candidate as rejected
  await db.execute(`
    UPDATE asset_candidates
    SET is_rejected = 1
    WHERE id = ?
  `, [candidateId]);
}

// Auto-selection skips globally rejected assets
const candidates = await db.query(`
  SELECT * FROM asset_candidates
  WHERE ...
    AND provider_url NOT IN (
      SELECT provider_url FROM rejected_assets
    )
`);
```

---

## Asset Type Reference

### Movies

| Asset Type | Kodi Filename(s) | Aspect Ratio | Typical Size | Required? |
|------------|------------------|--------------|--------------|-----------|
| `poster` | `poster.jpg` | 2:3 | 2000×3000 | Yes |
| `fanart` | `fanart.jpg`, `fanart1.jpg`, `fanart2.jpg`, ... | 16:9 | 1920×1080 | Yes |
| `landscape` | `landscape.jpg` | 16:9 | 1920×1080 | Optional |
| `banner` | `banner.jpg` | ~10:1 | 1000×185 | Optional |
| `clearlogo` | `clearlogo.png` | Variable | 800×310 (transparent) | Optional |
| `clearart` | `clearart.png` | Variable | 1000×562 (transparent) | Optional |
| `discart` | `disc.png`, `discart.png` | 1:1 | 1000×1000 | Optional |
| `keyart` | `keyart.jpg` | Variable | Variable | Optional |

### TV Series (Show-Level)

| Asset Type | Kodi Filename(s) | Notes |
|------------|------------------|-------|
| `poster` | `poster.jpg` | Show poster |
| `fanart` | `fanart.jpg`, `fanart1.jpg`, ... | Show backdrop |
| `banner` | `banner.jpg` | Show banner |
| `clearlogo` | `clearlogo.png` | Show logo (transparent) |

### TV Series (Season-Level)

| Asset Type | Kodi Filename(s) | Notes |
|------------|------------------|-------|
| `poster` | `season{NN}-poster.jpg` | e.g., `season01-poster.jpg` |
| `fanart` | `season{NN}-fanart.jpg` | e.g., `season01-fanart.jpg` |
| `banner` | `season{NN}-banner.jpg` | e.g., `season01-banner.jpg` |

### TV Series (Episode-Level)

| Asset Type | Kodi Filename(s) | Notes |
|------------|------------------|-------|
| `thumb` | `{filename}-thumb.jpg` | e.g., `S01E01-thumb.jpg` |

### Actor Images

| Asset Type | Kodi Filename(s) | Notes |
|------------|------------------|-------|
| `actor` | `.actors/{actor_name}.jpg` | In `.actors/` subdirectory |

**Example:**
```
/movies/The Matrix (1999)/
  .actors/
    Keanu Reeves.jpg
    Laurence Fishburne.jpg
    Carrie-Anne Moss.jpg
```

### Kodi Naming Conventions (IMPORTANT)

**Multiple Assets of Same Type:**
- **NOT zero-padded**: Use `poster1.jpg`, `fanart1.jpg` (not `poster01.jpg`)
- **Numbering starts at 1**: Primary is `poster.jpg`, additional are `poster1.jpg`, `poster2.jpg`, etc.
- **Maximum ~20 per type**: Most Kodi skins support up to ~20 images per type
- **Numbers range 1-19**: `poster1.jpg` through `poster19.jpg`

**Legacy Directories (NOT SUPPORTED in Kodi 21):**
- `extrafanart/` - Deprecated, migrate to `fanart1.jpg`, `fanart2.jpg`, etc.
- `extraposters/` - Deprecated, migrate to `poster1.jpg`, `poster2.jpg`, etc.

**Correct Naming:**
```
✅ Good:
  poster.jpg
  poster1.jpg
  poster2.jpg
  fanart.jpg
  fanart1.jpg

❌ Bad:
  poster01.jpg       (zero-padded)
  poster_1.jpg       (underscore separator)
  extrafanart/1.jpg  (legacy directory)
```

---

## Actor Images Discovery

### Purpose

Discover and cache actor images stored in `.actors/` subdirectory.

### Filesystem Pattern

```
/movies/The Matrix (1999)/
  .actors/
    Keanu Reeves.jpg
    Laurence Fishburne.jpg
    Carrie-Anne Moss.jpg
```

**Pattern**: `.actors/{actor_name}.{jpg,png}`

### Discovery Process

```typescript
async function discoverActorImages(moviePath: string, movieId: number): Promise<void> {
  const actorsDir = path.join(moviePath, '.actors');

  if (!await fs.exists(actorsDir)) {
    return;
  }

  const imageFiles = await fs.readdir(actorsDir);

  for (const file of imageFiles) {
    const actorName = path.basename(file, path.extname(file));
    const imagePath = path.join(actorsDir, file);

    // Find or create actor
    let actor = await db.query(`
      SELECT * FROM actors WHERE name = ?
    `, [actorName]);

    if (!actor) {
      actor = await db.execute(`
        INSERT INTO actors (name) VALUES (?)
      `, [actorName]);
    }

    // Calculate hashes
    const contentHash = await hashFile(imagePath);
    const pHash = await calculatePerceptualHash(imagePath);

    // Store in cache
    const cachePath = `/data/cache/assets/${contentHash}.jpg`;
    await fs.copyFile(imagePath, cachePath);

    // Add to cache_inventory
    await storeAsset(
      await fs.readFile(imagePath),
      'image',
      { mimeType: 'image/jpeg', width: null, height: null }
    );

    // Add to asset_candidates
    await db.execute(`
      INSERT INTO asset_candidates (
        entity_type, entity_id, asset_type,
        provider, is_downloaded, cache_path,
        content_hash, perceptual_hash,
        is_selected, selected_by
      ) VALUES (?, ?, ?, 'local', 1, ?, ?, ?, 1, 'local')
    `, ['actor', actor.id, 'actor', cachePath, contentHash, pHash]);
  }
}
```

---

## Legacy Directory Migration

### Purpose

Migrate legacy Kodi `extrafanart/` and `extraposters/` directories to modern flat numbered files.

**Note**: Kodi 21 no longer supports these legacy directories. Migration occurs during library rebuild.

### Detection

```typescript
async function detectLegacyDirectories(moviePath: string): Promise<{
  hasExtrafanart: boolean;
  hasExtraposters: boolean;
}> {
  return {
    hasExtrafanart: await fs.exists(path.join(moviePath, 'extrafanart')),
    hasExtraposters: await fs.exists(path.join(moviePath, 'extraposters'))
  };
}
```

### Migration Process

```typescript
async function migrateLegacyDirectories(
  moviePath: string,
  movieId: number
): Promise<void> {

  // 1. Discover legacy fanart
  const legacyFanartDir = path.join(moviePath, 'extrafanart');
  if (await fs.exists(legacyFanartDir)) {
    const fanartFiles = await fs.readdir(legacyFanartDir);
    const existingFanarts = await getAssetCandidates(movieId, 'fanart');

    let nextIndex = existingFanarts.filter(a => a.selected_by === 'local').length;

    for (const file of fanartFiles) {
      const sourcePath = path.join(legacyFanartDir, file);
      const pHash = await calculatePerceptualHash(sourcePath);

      // Check for duplicates
      const isDuplicate = existingFanarts.some(existing => {
        const similarity = compareHashes(pHash, existing.perceptual_hash);
        return similarity >= 0.90;
      });

      if (!isDuplicate) {
        // Find next available filename
        nextIndex++;
        const targetFilename = nextIndex === 1 ? 'fanart.jpg' : `fanart${nextIndex}.jpg`;
        const targetPath = path.join(moviePath, targetFilename);

        // Copy to standard location
        await fs.copyFile(sourcePath, targetPath);

        // Add to cache and database
        const contentHash = await hashFile(targetPath);
        const cachePath = `/data/cache/assets/${contentHash}.jpg`;
        await fs.copyFile(targetPath, cachePath);

        await db.execute(`
          INSERT INTO asset_candidates (
            entity_type, entity_id, asset_type,
            provider, cache_path, content_hash, perceptual_hash,
            is_downloaded, is_selected, selected_by
          ) VALUES (?, ?, 'fanart', 'local', ?, ?, ?, 1, 1, 'local')
        `, [movieId, cachePath, contentHash, pHash]);
      }
    }

    // Delete legacy directory
    await fs.remove(legacyFanartDir);
    console.log(`Migrated ${nextIndex} fanart images from extrafanart/`);
  }

  // 2. Similar process for extraposters/
  const legacyPostersDir = path.join(moviePath, 'extraposters');
  if (await fs.exists(legacyPostersDir)) {
    // Same logic as fanart migration
    // ... (omitted for brevity)
  }
}
```

**Migration happens during:**
- Initial library scan (if legacy directories detected)
- Manual "Rebuild Library" operation
- After library path change

---

## Kodi Image Caching Behavior

### Why Metarr Can't Control Kodi's Cache

Kodi converts images to skin-specific sizes and caches them internally. This process is **only accessible via Python API** running inside Kodi, not remotely via JSON-RPC.

### Kodi's Image Processing Pipeline

```
Metarr writes: /movies/The Matrix (1999)/poster.jpg (2000×3000)
                              │
                              ▼
Kodi scans library, finds poster.jpg
                              │
                              ▼
Kodi converts to skin requirements:
  - Thumbnail view: 300×450
  - List view: 150×225
  - Full screen: 800×1200
                              │
                              ▼
Kodi stores in internal cache:
  ~/.kodi/userdata/Thumbnails/{hash}/
```

### Triggering Cache Rebuild

**Option 1: Scan Specific Directory** (new files added)
```typescript
await kodiClient.jsonRPC({
  jsonrpc: "2.0",
  method: "VideoLibrary.Scan",
  params: {
    directory: "/mnt/movies/The Matrix (1999)/"
  }
});
```
**Result**: Kodi reads NFO, converts images, caches, updates skin.

**Option 2: Fake Directory Scan** (metadata/images updated, no new files)
```typescript
await kodiClient.jsonRPC({
  jsonrpc: "2.0",
  method: "VideoLibrary.Scan",
  params: {
    directory: "/doesNotExist"
  }
});
```
**Result**: Scan fails (no directory), but triggers skin refresh and cache rebuild.

### Kodi Shared Library Groups

For Kodi instances sharing a MySQL database:

1. **One player** triggers scan → database updated
2. **All players** see updated metadata (shared DB)
3. **Each player** must rebuild its own image cache independently
4. **Solution**: Send notification to each player:

```typescript
async function notifyAllKodiInstances(message: string): Promise<void> {
  const kodiPlayers = await db.query(`
    SELECT * FROM media_players
    WHERE type = 'kodi' AND enabled = 1
  `);

  for (const player of kodiPlayers) {
    await kodiClient.notify(player, {
      title: "Metarr",
      message: message,
      displaytime: 5000
    });

    // Trigger cache refresh
    await kodiClient.jsonRPC(player, {
      method: "VideoLibrary.Scan",
      params: { directory: "/doesNotExist" }
    });
  }
}
```

---

## Migration from Old Schema

**Legacy System**: Two-copy architecture (cache + library) with `images` table

**New System**: Three-tier (candidates + cache + library) with `asset_candidates` table

**Migration Path**:
1. Existing `images` table → becomes part of `asset_candidates` (with `is_downloaded = 1`, `is_selected = 1`)
2. Existing cache files → imported into `cache_inventory`
3. New enrichment runs fetch additional candidates (URLs only)
4. User can replace selected assets with better options

**Breaking Changes**:
- `images` table renamed to `asset_candidates` (schema changes)
- `trailers` table merged into `asset_candidates` (asset_type = 'trailer')
- `cache_path` now content-addressed (not entity-specific directories: `/data/cache/assets/{hash}.jpg`)
- Selection is separate from download (lazy loading)
- Perceptual hash stored in both `asset_candidates` and `cache_inventory`

**See**: [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) for complete migration strategy

---

## Related Documentation

- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Overall system design
- **[DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)** - Complete schema reference
- **[PUBLISHING_WORKFLOW.md](PUBLISHING_WORKFLOW.md)** - How assets get published
- **[AUTOMATION_AND_WEBHOOKS.md](AUTOMATION_AND_WEBHOOKS.md)** - Auto-selection behavior
- **[WORKFLOWS.md](WORKFLOWS.md)** - Operational workflows
- **[KODI_API.md](KODI_API.md)** - Kodi JSON-RPC integration
- **[FIELD_LOCKING.md](FIELD_LOCKING.md)** - Field and asset locking system
