# Enrichment Phase

**Purpose**: Fetch metadata from providers, collect asset candidates, and intelligently select the best options for each media item.

**Status**: Partial implementation (TMDB basic client exists)

## Overview

The enrichment phase enhances discovered media with high-quality metadata and artwork from multiple providers. It combines data fetching with intelligent selection, building a rich candidate pool while respecting user preferences and manual locks.

## Phase Rules

1. **Idempotent**: Re-enrichment refreshes data without losing user edits
2. **Non-destructive**: Never overwrites locked fields or assets
3. **Rate-limited**: Respects provider API limits with backoff
4. **Selective**: Only enriches monitored items unless forced
5. **Observable**: Reports progress per item and overall
6. **Chainable**: Always triggers next phase, even when disabled

## Triggers

- **Post-scan**: Automatically after scanning phase (if enabled)
- **Manual**: User clicks "Enrich" on specific items
- **Scheduled**: Weekly metadata refresh (configurable)
- **Webhook**: Radarr/Sonarr download triggers immediate enrichment
- **Bulk**: User selects multiple items for enrichment

## Process Flow

```
1. ITEM SELECTION
   ├── Query items needing enrichment
   ├── Check monitored status
   ├── Skip recently enriched (< 7 days)
   └── Build enrichment queue

2. METADATA FETCHING
   ├── Search providers by ID (TMDB, IMDB, TVDB)
   ├── Fetch metadata (plot, cast, ratings, etc.)
   ├── Collect asset URLs (posters, fanart, logos)
   └── Handle 404s and provider errors

3. ASSET CANDIDATE COLLECTION
   ├── Store provider URLs with metadata of the asset
   ├── Calculate asset scores
   ├── Mark user preferences
   └── Preserve locked selections

4. INTELLIGENT SELECTION
   ├── Apply selection algorithm
   ├── Respect locked fields/assets
   ├── Download selected assets
   └── Update cache references

5. NEXT PHASE TRIGGER
   └── Create publishing job
```

## Provider Integration

### Priority Order

1. **TMDB**: Primary for movies and TV
2. **TVDB**: Secondary for TV, primary for anime
3. **Fanart.tv**: High-quality artwork overlay
4. **MusicBrainz**: Music metadata (future)

### Rate Limiting Strategy

```typescript
interface RateLimitConfig {
  provider: string;
  backoffMultiplier: number; // For 429 responses
}

// Adaptive backoff on 429 - only rate limit on provider response
if (response.status === 429) {
  const retryAfter = response.headers['retry-after'] || 60;
  await sleep(retryAfter * 1000 * backoffMultiplier);
  backoffMultiplier *= 2; // Exponential backoff
}
```

## Asset Selection Algorithm

### Scoring Criteria

```typescript
interface AssetScore {
  resolution: number; // Higher is better (0-40 points)
  aspectRatio: number; // Closer to ideal (0-30 points)
  voteAverage: number; // Community rating (0-20 points)
  language: number; // Preferred language (0-10 points)
}

// Poster selection (ideal: 2:3 ratio, 2000x3000px)
function scorePoster(asset: AssetCandidate): number {
  let score = 0;

  // Resolution (40 points max)
  if (asset.width >= 2000) score += 40;
  else score += (asset.width / 2000) * 40;

  // Aspect ratio (30 points max)
  const ratio = asset.width / asset.height;
  const idealRatio = 2 / 3;
  const ratioDiff = Math.abs(ratio - idealRatio);
  score += Math.max(0, 30 - ratioDiff * 100);

  // Community votes (20 points max)
  score += Math.min(20, asset.voteAverage * 2);

  // Language match (10 points)
  if (asset.language === userLanguage) score += 10;

  return score;
}
```

### Selection Rules

1. **User-selected**: Always use if locked
2. **Auto-select**: Highest scoring unlocked asset

## Field Locking

```typescript
interface FieldLocks {
  // Metadata fields
  title_locked: boolean;
  plot_locked: boolean;
  release_date_locked: boolean;
  runtime_locked: boolean;

  // Asset fields
  poster_locked: boolean;
  fanart_locked: boolean;
  logo_locked: boolean;
  trailer_locked: boolean;
}

// Enrichment respects locks
if (!movie.plot_locked) {
  movie.plot = tmdbData.overview;
}

if (!movie.poster_locked) {
  movie.poster_id = await selectBestPoster(candidates);
}
```

## Asset Download & Caching

```typescript
async function downloadAsset(url: string, type: AssetType): Promise<CacheAsset> {
  // Download to temp
  const tempPath = `/tmp/${uuid()}.tmp`;
  await download(url, tempPath);

  // Calculate hashes
  const sha256 = await calculateSHA256(tempPath);
  const perceptualHash = await calculatePHash(tempPath);

  // Check for duplicates
  const existing = await db.cache_assets.findByHash(sha256);
  if (existing) {
    await fs.unlink(tempPath);
    return existing;
  }

  // Process image
  const dimensions = await sharp(tempPath).metadata();

  // Move to cache with content addressing
  const cachePath = `/data/cache/${type}/${sha256.substr(0, 2)}/${sha256}.jpg`;
  await fs.move(tempPath, cachePath);

  // Store in database
  return await db.cache_assets.create({
    content_hash: sha256,
    perceptual_hash: perceptualHash,
    file_path: cachePath,
    file_size: stats.size,
    width: dimensions.width,
    height: dimensions.height,
    mime_type: 'image/jpeg',
  });
}
```

## Configuration

```typescript
interface EnrichmentConfig {
  // Behavior
  enabled: boolean; // Global enrichment toggle

  // Providers
  providers: {
    tmdb: { enabled: boolean; apiKey?: string };
    tvdb: { enabled: boolean; apiKey?: string };
    fanart: { enabled: boolean; apiKey?: string };
  };

  // Refresh
  refreshInterval: number; // Days before re-enrichment (7)
}
```

## Error Handling

- **Provider timeout**: Skip provider, try next
- **404 Not Found**: Mark as "no metadata available"
- **Rate limited**: Exponential backoff with jitter
- **Download failed**: Retry 3x, then flag for manual
- **Corrupted image**: Log error, try alternative

## Performance Optimizations

- **Full requests**: Get all info per API call
- **Caching**: Store provider responses for 24 hours
- **Deduplication**: SHA256 prevents duplicate downloads
- **Parallel downloads**: 10 concurrent asset downloads

## Database Updates

```sql
-- Store candidate assets
INSERT INTO asset_candidates (
  entity_type, entity_id, asset_type,
  provider, provider_id, url,
  width, height, language,
  vote_average, vote_count,
  score, is_selected
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);

-- Update movie with selected assets
UPDATE movies SET
  poster_id = ?,
  fanart_id = ?,
  logo_id = ?,
  last_enriched = CURRENT_TIMESTAMP
WHERE id = ?;
```

## Related Documentation

- [Provider Overview](../providers/OVERVIEW.md) - Provider system details
- [TMDB Provider](../providers/TMDB.md) - TMDB API integration
- [TVDB Provider](../providers/TVDB.md) - TVDB API integration
- [Fanart.tv Provider](../providers/FANART.md) - Fanart.tv integration
- [Database Schema](../DATABASE.md) - Asset candidates and storage
- [API Architecture](../API.md) - Enrichment endpoints

## Next Phase

Upon completion, enrichment **always** triggers the [Publishing Phase](PUBLISHING.md) via job creation. If publishing is disabled, the job passes through to the next phase without processing.
