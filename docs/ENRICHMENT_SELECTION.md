# Enrichment & Selection Architecture

## Overview

The enrichment and selection system is the heart of Metarr's automation capabilities. It collects metadata and assets from multiple providers, intelligently scores them, and automatically selects the best options for each media item. This document outlines the complete design, implementation strategy, and roadmap for this critical system.

## Design Philosophy

**Core Principles:**
1. **All-or-Nothing Caching**: Complete provider responses are cached to avoid partial data and repeated API calls
2. **Provider Modularity**: Each provider normalizes its own scoring (0-100 scale)
3. **Simple Scoring**: Two-factor scoring (provider score + resolution quality)
4. **Asset Type Isolation**: Posters only compete with posters, fanart with fanart
5. **Automated Selection**: Best-scoring assets are selected automatically
6. **Manual Override Preservation**: User-locked assets are never replaced

## System Architecture

### High-Level Flow

```
1. Enrichment Request (webhook or scheduled)
           ↓
2. Check Provider Cache (7-day TTL)
           ↓
3. [Cache Miss] Fetch from All Providers
           ↓
4. Cache Complete Response
           ↓
5. Match Library Assets to Sources
           ↓
6. Score All Available Assets
           ↓
7. Deduplicate via pHash
           ↓
8. Select Top N per Asset Type
           ↓
9. Download & Store Selected Assets
```

### Components

1. **Provider Orchestrator**: Coordinates data collection from multiple providers
2. **Provider Cache**: Stores complete provider responses for 7 days
3. **Asset Matcher**: Identifies source URLs for library-scanned files
4. **Classification Scorer**: Calculates selection scores for assets
5. **Asset Selector**: Chooses best assets based on scores and configuration
6. **Enrichment Scheduler**: Manages rate-limited daily enrichment tasks

## Database Schema

### Provider Cache Tables

```sql
-- Complete movie metadata cache
CREATE TABLE provider_cache_movies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id INTEGER NOT NULL UNIQUE,

  -- Identification
  tmdb_id TEXT,
  imdb_id TEXT,

  -- Basic metadata
  title TEXT,
  original_title TEXT,
  overview TEXT,
  tagline TEXT,
  release_date TEXT,
  runtime INTEGER,
  status TEXT,
  budget INTEGER,
  revenue INTEGER,

  -- Complex metadata (JSON arrays)
  genres TEXT,
  production_companies TEXT,
  production_countries TEXT,
  spoken_languages TEXT,
  cast TEXT,
  crew TEXT,
  keywords TEXT,

  -- Ratings
  vote_average REAL,
  vote_count INTEGER,
  popularity REAL,

  -- Media
  homepage TEXT,
  trailer_key TEXT,

  fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_entity_id (entity_id),
  INDEX idx_fetched_at (fetched_at)
);

-- All provider assets
CREATE TABLE provider_cache_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id INTEGER NOT NULL,
  entity_type TEXT NOT NULL,

  -- Asset details
  asset_type TEXT NOT NULL,      -- poster, fanart, banner, etc
  url TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  language TEXT,

  -- Provider info
  provider_name TEXT NOT NULL,
  provider_score INTEGER,         -- Normalized 0-100
  provider_metadata TEXT,         -- JSON: votes, likes, etc

  fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_entity (entity_id, entity_type),
  INDEX idx_type_score (asset_type, provider_score DESC),
  INDEX idx_fetched_at (fetched_at)
);
```

### Asset Storage Tables (Updates)

```sql
-- Updates to cache_image_files
ALTER TABLE cache_image_files ADD COLUMN source_url TEXT;
ALTER TABLE cache_image_files ADD COLUMN provider_name TEXT;
ALTER TABLE cache_image_files ADD COLUMN classification_score INTEGER;

-- Updates to movies table
ALTER TABLE movies ADD COLUMN enriched_at DATETIME;
```

## Implementation Details

### 1. Provider Interface

Each provider must implement score normalization:

```typescript
interface IMetadataProvider {
  // Fetch all data for entity
  async getComplete(id: string): Promise<ProviderResponse>;

  // Provider-specific score normalization (0-100)
  normalizeScore(asset: RawProviderAsset): number;
}
```

### 2. Provider Score Normalization

**TMDB Provider:**
```typescript
normalizeScore(asset: RawAsset): number {
  // Bayesian average to handle low vote counts
  const avgRating = 6.5;
  const minVotes = 10;
  const bayesian = (asset.vote_count * asset.vote_average + minVotes * avgRating) /
                  (asset.vote_count + minVotes);
  return Math.round((bayesian / 10) * 100);
}
```

**FanArt.tv Provider:**
```typescript
normalizeScore(asset: RawAsset): number {
  if (!asset.likes) return 50;
  // Logarithmic scale since most assets have few likes
  return Math.min(100, 50 + Math.log10(asset.likes + 1) * 25);
}
```

**TVDB Provider:**
```typescript
normalizeScore(asset: RawAsset): number {
  // Official images get high score
  return asset.is_official ? 85 : 60;
}
```

### 3. Classification Scoring Algorithm

```typescript
class AssetScorer {
  calculateScore(asset: ProviderAsset, assetType: AssetType): number {
    // Provider's normalized score (60% weight)
    const providerScore = asset.normalized_score;

    // Resolution quality score (40% weight)
    const resolutionScore = this.scoreResolution(asset, assetType);

    return Math.round(providerScore * 0.6 + resolutionScore * 0.4);
  }

  private scoreResolution(asset: ProviderAsset, assetType: AssetType): number {
    const pixels = asset.width * asset.height;

    const optimal = {
      poster: 1000 * 1500,      // 2:3 aspect ratio
      fanart: 1920 * 1080,      // 16:9 aspect ratio
      banner: 1000 * 185,       // ~5.4:1 aspect ratio
      clearlogo: 800 * 310,     // ~2.6:1 aspect ratio
      clearart: 1000 * 562,     // 16:9 aspect ratio
      thumb: 1000 * 562         // 16:9 aspect ratio
    };

    const target = optimal[assetType] || 1920 * 1080;

    if (pixels >= target) {
      // Slight penalty for oversized
      return Math.max(70, 100 - ((pixels - target) / target) * 10);
    } else {
      // Heavy penalty for undersized
      return (pixels / target) * 100;
    }
  }
}
```

### 4. Asset Matching

Identify where library-scanned files originated:

```typescript
class AssetMatcher {
  async matchToSource(localAsset: CacheAsset, providerAssets: ProviderAsset[]): Promise<MatchResult | null> {
    for (const providerAsset of providerAssets) {
      const tempFile = await this.downloadToTemp(providerAsset.url);
      const hash = await this.calculateHash(tempFile);

      // Exact hash match - found the source!
      if (hash === localAsset.hash) {
        return {
          confidence: 100,
          source_url: providerAsset.url,
          provider: providerAsset.provider,
          provider_score: providerAsset.normalized_score
        };
      }

      // Very close pHash match
      const phash = await this.calculatePHash(tempFile);
      const distance = this.pHashDistance(phash, localAsset.phash);
      if (distance < 3) {
        return {
          confidence: 95,
          source_url: providerAsset.url,
          provider: providerAsset.provider,
          provider_score: providerAsset.normalized_score
        };
      }
    }

    return null; // No match found
  }
}
```

### 5. Asset Selection

```typescript
class AssetSelector {
  async selectAssets(movieId: number, providerAssets: ProviderAsset[], config: UserConfig): Promise<SelectedAssets> {
    const selected = {};

    for (const assetType of ASSET_TYPES) {
      // Skip locked asset types
      if (await this.isAssetTypeLocked(movieId, assetType)) continue;

      // Filter assets of this type
      const typeAssets = providerAssets.filter(a => a.type === assetType);

      // Score each asset
      for (const asset of typeAssets) {
        asset.final_score = this.scorer.calculateScore(asset, assetType);
      }

      // Sort by score
      typeAssets.sort((a, b) => b.final_score - a.final_score);

      // Deduplicate by pHash
      const deduplicated = await this.deduplicateByPHash(typeAssets);

      // Select top N
      const maxAllowed = config.max_assets[assetType] || 3;
      selected[assetType] = deduplicated.slice(0, maxAllowed);
    }

    return selected;
  }
}
```

### 6. Cache Management

```typescript
class ProviderCacheService {
  private readonly TTL_DAYS = 7;

  async getCachedData(movieId: number): Promise<CachedData | null> {
    const metadata = await db.query(
      'SELECT * FROM provider_cache_movies WHERE entity_id = ?',
      [movieId]
    );

    if (!metadata) return null;

    // Check TTL
    const age = Date.now() - new Date(metadata.fetched_at).getTime();
    if (age > this.TTL_DAYS * 24 * 60 * 60 * 1000) {
      await this.deleteCache(movieId);
      return null;
    }

    const assets = await db.query(
      'SELECT * FROM provider_cache_assets WHERE entity_id = ? AND entity_type = "movie"',
      [movieId]
    );

    return { metadata, assets };
  }

  async setCachedData(movieId: number, data: AllProviderData): Promise<void> {
    // Transaction-wrapped insert of all data
    // See implementation above
  }
}
```

### 7. Enrichment Scheduler

```typescript
class EnrichmentScheduler {
  @Cron('0 2 * * *')  // Daily at 2 AM
  async performDailyEnrichment() {
    // Get up to 100 items needing enrichment
    const items = await this.getEnrichmentQueue();

    for (const item of items.slice(0, 100)) {
      try {
        // Check cache or fetch fresh data
        let data = await this.cache.getCachedData(item.id);

        if (!data) {
          data = await this.fetchAllProviderData(item);
          await this.cache.setCachedData(item.id, data);
        }

        // Match and select assets
        await this.enrichmentService.processAssets(item, data);

        // Update enriched timestamp
        await db.query(
          'UPDATE movies SET enriched_at = CURRENT_TIMESTAMP WHERE id = ?',
          [item.id]
        );

        // Rate limiting
        await this.sleep(5000);

      } catch (error) {
        logger.error(`Enrichment failed for movie ${item.id}:`, error);
      }
    }
  }
}
```

## Configuration

### User Settings

```typescript
interface EnrichmentConfig {
  // Maximum assets per type
  max_assets: {
    poster: number;      // Default: 3
    fanart: number;      // Default: 3
    banner: number;      // Default: 2
    clearlogo: number;   // Default: 1
    clearart: number;    // Default: 2
    thumb: number;       // Default: 5
  };

  // Language preferences
  preferred_language: string;  // e.g., 'en'
  include_no_language: boolean; // Include language-neutral assets

  // Automation
  auto_select: boolean;         // Enable automatic selection
  respect_locks: boolean;       // Always respect locked fields (always true)
}
```

## Webhook Integration

When webhooks trigger enrichment:

```typescript
class WebhookEnrichmentHandler {
  async handleMovieDownload(webhook: RadarrWebhook) {
    const movie = await this.findMovie(webhook.movie.tmdbId);

    if (!movie) {
      // New movie - create and enrich immediately
      movie = await this.createMovie(webhook.movie);
    }

    // Priority enrichment (bypass daily limit)
    await this.enrichmentService.enrichMovie(movie, { priority: true });

    // Auto-publish if configured
    if (this.config.auto_publish_on_webhook) {
      await this.publishingService.publish(movie);
    }
  }
}
```

## Performance Considerations

### Rate Limiting

- **TMDB**: 40 requests per 10 seconds
- **TVDB**: 30 requests per 10 seconds
- **FanArt.tv**: 10 requests per second (20 with personal key)

### Caching Strategy

- **TTL**: 7 days for all provider data
- **Storage**: ~500KB per movie (metadata + 50-100 asset records)
- **Cleanup**: Daily at 3 AM, removes entries older than 7 days

### Scalability

- **Target**: 32,000 media items
- **Daily Processing**: 100 items (configurable)
- **Cache Size**: ~16GB for 32k items (manageable)
- **Query Performance**: Indexed on entity_id, asset_type, scores

## Implementation Roadmap

### Phase 1: Foundation (Week 1)
- [ ] Create provider cache tables in migration
- [ ] Implement ProviderCacheService with TTL management
- [ ] Add cache cleanup scheduled job
- [ ] Update cache_image_files with enrichment fields

### Phase 2: Provider Integration (Week 2)
- [ ] Implement provider orchestrator
- [ ] Add score normalization to each provider
- [ ] Create provider response merging logic
- [ ] Add ID translation service (TMDB ↔ IMDB ↔ TVDB)

### Phase 3: Asset Matching (Week 3)
- [ ] Implement hash/pHash calculation
- [ ] Create asset matching service
- [ ] Add source URL identification
- [ ] Update existing assets with source info

### Phase 4: Scoring & Selection (Week 4)
- [ ] Implement classification scorer
- [ ] Add resolution quality scoring
- [ ] Create asset deduplication (pHash)
- [ ] Build selection algorithm

### Phase 5: Enrichment Pipeline (Week 5)
- [ ] Create enrichment service
- [ ] Implement enrichment scheduler
- [ ] Add webhook priority handling
- [ ] Build enrichment queue management

### Phase 6: Testing & Optimization (Week 6)
- [ ] Load test with 1000+ movies
- [ ] Optimize database queries
- [ ] Fine-tune scoring weights
- [ ] Add comprehensive logging

## Future Enhancements

1. **Machine Learning**: Learn from user selections to improve scoring
2. **Batch Processing**: Process multiple movies in single provider API call
3. **Distributed Caching**: Redis for multi-instance deployments
4. **Custom Scoring**: User-defined scoring rules
5. **A/B Testing**: Compare different scoring algorithms

## Conclusion

The enrichment and selection system is designed to be simple, maintainable, and effective. By caching complete provider responses and using a straightforward two-factor scoring system, we achieve excellent automated selection while preserving user control through the locking mechanism. The modular provider design ensures easy addition of new metadata sources in the future.