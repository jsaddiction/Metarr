# Provider Architecture

**Last Updated:** 2025-10-09
**Status:** Design Complete - Ready for Implementation

This document describes Metarr's modular provider system for sourcing metadata and assets from multiple external services (TMDB, TVDB, FanArt.tv, IMDb, MusicBrainz, etc.).

---

## Table of Contents

1. [Overview](#overview)
2. [Design Philosophy](#design-philosophy)
3. [Provider Capabilities](#provider-capabilities)
4. [Provider Configuration](#provider-configuration)
5. [Provider Orchestration](#provider-orchestration)
6. [Asset Selection Algorithm](#asset-selection-algorithm)
7. [Provider Registry](#provider-registry)
8. [Implementing New Providers](#implementing-new-providers)
9. [Testing Providers](#testing-providers)
10. [Provider List](#provider-list)

---

## Overview

Metarr uses a **multi-provider architecture** that collects metadata and assets from various sources, then intelligently selects the "best" data based on user configuration and quality scoring.

### Core Principles

1. **Every provider visible in UI** - All providers shown (enabled/disabled state)
2. **Individual configuration** - Per-provider settings (API keys, languages, options)
3. **Multi-provider collection** - Query all enabled providers in parallel
4. **Intelligent distillation** - Score and select "best N" results
5. **Capability-based routing** - Automatically use providers for what they do best
6. **Preset-based simplification** - Smart defaults for 90% of users

### Three-Tier Asset Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                  PROVIDER DATA FLOW                          │
└─────────────────────────────────────────────────────────────┘

1. COLLECTION (Multi-Provider Parallel Fetch)
   ↓
   ├─ TMDB:        15 posters, 25 fanart, metadata
   ├─ FanArt.tv:   5 posters, 10 fanart, 8 clearlogos
   └─ TVDB:        8 posters, 12 banners (TV only)

2. SCORING (Quality-Based Ranking)
   ↓
   Each asset scored on:
   - Resolution (25%)
   - Community votes (30%)
   - Language match (20%)
   - Provider quality (15%)
   - Aspect ratio (10%)

3. SELECTION (Best N Assets)
   ↓
   - Top 1 poster (highest score)
   - Top 3 fanart (diverse scenes, deduplicated)
   - Top 1 clearlogo (if available)

4. CACHING (Content-Addressed Storage)
   ↓
   Download selected assets → SHA256 hash → data/cache/assets/{hash}.jpg

5. PUBLISHING (Player-Compatible Naming)
   ↓
   Copy cache → library with Kodi naming (poster.jpg, fanart.jpg, etc.)
```

---

## Design Philosophy

### Intelligent Defaults with Manual Override

Metarr is designed for **"it just works"** out of the box, while allowing power users full control.

**90% of users:**
- Select a preset ("Minimal", "Recommended", "Maximum")
- Enable 1-2 providers (TMDB + FanArt.tv)
- Click "Start Enrichment"
- Review results → Publish

**10% of power users:**
- Select "Custom" preset
- Configure per-asset-type provider priority
- Adjust scoring weights
- Map specific metadata fields to specific providers

### Provider Specialization

Different providers excel at different tasks:

| Provider | Best For | Coverage | Quality |
|----------|----------|----------|---------|
| **TMDB** | Metadata, posters, fanart, search | Comprehensive (movies + TV) | Good |
| **FanArt.tv** | Clearlogos, high-quality posters | Selective (curated only) | Excellent |
| **TVDB** | TV metadata, banners, season posters | TV shows only | Good |
| **IMDb** | Authoritative ratings, cast | Comprehensive | Authoritative |
| **MusicBrainz** | Music metadata, discography | Music only | Excellent |

**Auto-Configuration:**
When a user enables TMDB + FanArt.tv, Metarr automatically:
- Uses TMDB for metadata (comprehensive coverage)
- Uses FanArt.tv for clearlogos (unique capability)
- Uses both for posters, prioritizing FanArt.tv (higher quality)

### Quality Over Quantity

**FanArt.tv Philosophy:** "No Image is Better Than a Low Quality Image"

Metarr adopts this approach:
- Minimum dimensions enforced (1000×1500 posters, 1920×1080 fanart)
- Aspect ratio validation (reject incorrect ratios)
- Perceptual hash deduplication (reject near-duplicates)
- Community vote weighting (prefer validated assets)

**Result:** Smaller library sizes, higher visual quality, better user experience.

---

## Provider Capabilities

Every provider declares its capabilities through a `ProviderCapabilities` interface.

### Capability Interface

```typescript
// src/types/providers/capabilities.ts

export type ProviderId = 'tmdb' | 'tvdb' | 'fanart_tv' | 'imdb' | 'musicbrainz' |
                         'theaudiodb' | 'local';

export type EntityType = 'movie' | 'series' | 'season' | 'episode' | 'actor' |
                         'album' | 'artist' | 'collection';

export type AssetType = 'poster' | 'fanart' | 'banner' | 'clearlogo' | 'clearart' |
                        'thumb' | 'characterart' | 'discart' | 'landscape' | 'keyart';

export type MetadataField = 'title' | 'originalTitle' | 'plot' | 'tagline' |
                            'releaseDate' | 'runtime' | 'genres' | 'actors' |
                            'directors' | 'writers' | 'studios' | 'ratings' |
                            'certification' | 'collection';

export interface ProviderCapabilities {
  // Identity
  id: ProviderId;
  name: string;                             // 'TMDB (The Movie Database)'
  version: string;                          // '1.0.0'
  category: 'metadata' | 'images' | 'both'; // Primary purpose

  // Supported Operations
  supportedEntityTypes: EntityType[];
  supportedMetadataFields: Record<EntityType, MetadataField[]>;
  supportedAssetTypes: Record<EntityType, AssetType[]>;

  // Authentication
  authentication: {
    type: 'none' | 'api_key' | 'jwt' | 'bearer';
    required: boolean;
    allowsPersonalKey?: boolean;            // Like FanArt.tv
    personalKeyBenefit?: string;
    tokenLifetime?: number;                 // For JWT (seconds)
  };

  // Rate Limiting
  rateLimit: {
    requestsPerSecond: number;
    burstCapacity: number;
    webhookReservedCapacity: number;
    enforcementType: 'client' | 'server';
  };

  // Search Capabilities
  search: {
    supported: boolean;
    fuzzyMatching: boolean;
    yearFilter: boolean;
    externalIdLookup: string[];             // ['imdb_id', 'tvdb_id']
  };

  // Data Quality Indicators
  dataQuality: {
    metadataCompleteness: number;           // 0-1 score
    imageQuality: number;                   // 0-1 score
    updateFrequency: 'realtime' | 'daily' | 'weekly';
    curatedContent: boolean;
  };

  // Asset Provision
  assetProvision: {
    providesUrls: boolean;
    thumbnailUrls: boolean;
    multipleQualities: boolean;
    maxResultsPerType: number | null;
    voteSystemForImages: boolean;
  };
}
```

### Example: TMDB Capabilities

```typescript
// src/services/providers/TMDBProvider.ts

defineCapabilities(): ProviderCapabilities {
  return {
    id: 'tmdb',
    name: 'TMDB (The Movie Database)',
    version: '1.0.0',
    category: 'both',

    supportedEntityTypes: ['movie', 'series', 'season', 'episode', 'actor', 'collection'],

    supportedMetadataFields: {
      movie: ['title', 'originalTitle', 'plot', 'tagline', 'releaseDate',
              'runtime', 'genres', 'actors', 'directors', 'writers',
              'studios', 'ratings', 'certification', 'collection'],
      series: ['title', 'originalTitle', 'plot', 'releaseDate', 'genres',
               'actors', 'ratings', 'certification'],
      // ... other entity types
    },

    supportedAssetTypes: {
      movie: ['poster', 'fanart', 'clearlogo'],
      series: ['poster', 'fanart', 'clearlogo'],
      // ... other entity types
    },

    authentication: {
      type: 'bearer',
      required: true,
      allowsPersonalKey: false
    },

    rateLimit: {
      requestsPerSecond: 40,
      burstCapacity: 50,
      webhookReservedCapacity: 10,
      enforcementType: 'client'
    },

    search: {
      supported: true,
      fuzzyMatching: true,
      yearFilter: true,
      externalIdLookup: ['imdb_id', 'tvdb_id']
    },

    dataQuality: {
      metadataCompleteness: 0.95,
      imageQuality: 0.75,                   // Good, but user-submitted
      updateFrequency: 'realtime',
      curatedContent: false                 // User-contributed
    },

    assetProvision: {
      providesUrls: true,
      thumbnailUrls: true,
      multipleQualities: true,
      maxResultsPerType: 20,                // ~15 posters typical
      voteSystemForImages: true
    }
  };
}
```

---

## Provider Configuration

### Database Schema

```sql
CREATE TABLE provider_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id TEXT UNIQUE NOT NULL,         -- 'tmdb', 'tvdb', 'fanart_tv'

  -- Basic Settings
  enabled BOOLEAN DEFAULT 0,
  display_name TEXT NOT NULL,

  -- Authentication
  api_key TEXT,
  personal_api_key TEXT,                    -- Optional user upgrade
  token TEXT,                               -- For JWT providers
  token_expires_at TIMESTAMP,

  -- Preferences
  language TEXT DEFAULT 'en',
  region TEXT DEFAULT 'US',

  -- Provider-Specific Options (JSON)
  options TEXT DEFAULT '{}',                -- { "seasonOrder": "aired", "discType": "bluray" }

  -- Priority & Usage
  priority INTEGER DEFAULT 50,              -- 0-100, higher = preferred
  use_for_metadata BOOLEAN DEFAULT 1,
  use_for_images BOOLEAN DEFAULT 1,
  use_for_search BOOLEAN DEFAULT 1,

  -- Health Tracking
  last_test_at TIMESTAMP,
  last_test_status TEXT DEFAULT 'never_tested',
  consecutive_failures INTEGER DEFAULT 0,
  circuit_breaker_until TIMESTAMP,

  -- Stats
  total_requests INTEGER DEFAULT 0,
  failed_requests INTEGER DEFAULT 0,
  avg_response_time_ms INTEGER,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Asset Selection Presets
CREATE TABLE asset_selection_presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,                -- 'minimal', 'recommended', 'maximum', 'custom'
  description TEXT,
  is_default BOOLEAN DEFAULT 0,

  -- Asset Counts (JSON)
  asset_counts TEXT NOT NULL,               -- { "poster": 1, "fanart": 3, "clearlogo": 1 }

  -- Provider Priority (JSON array)
  provider_priority TEXT,                   -- ["fanart_tv", "tmdb", "tvdb"]

  -- Quality Filters
  min_poster_width INTEGER DEFAULT 1000,
  min_poster_height INTEGER DEFAULT 1500,
  min_fanart_width INTEGER DEFAULT 1920,
  min_fanart_height INTEGER DEFAULT 1080,

  -- Deduplication
  phash_threshold REAL DEFAULT 0.92,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Library-specific preset selection
CREATE TABLE library_provider_config (
  library_id INTEGER PRIMARY KEY,
  preset_id INTEGER NOT NULL,

  -- Orchestration Strategy
  strategy TEXT DEFAULT 'preferred_first',  -- 'preferred_first', 'field_mapping', 'aggregate_all'
  preferred_metadata_provider TEXT,         -- 'tmdb'
  fill_metadata_gaps BOOLEAN DEFAULT 1,

  -- Custom Field Mapping (JSON, only if strategy = 'field_mapping')
  field_mapping TEXT,                       -- { "title": "tmdb", "actors": "imdb", ... }

  FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE,
  FOREIGN KEY (preset_id) REFERENCES asset_selection_presets(id)
);
```

### Built-in Presets

```typescript
// src/config/providerPresets.ts

export const BUILTIN_PRESETS = [
  {
    name: 'minimal',
    description: 'Essential assets only. Fastest setup, smallest library size.',
    is_default: false,
    asset_counts: {
      poster: 1,
      fanart: 2
    },
    provider_priority: ['tmdb'],
    min_poster_width: 1000,
    min_poster_height: 1500,
    min_fanart_width: 1920,
    min_fanart_height: 1080,
    phash_threshold: 0.92
  },

  {
    name: 'recommended',
    description: 'Balanced visual experience. Recommended for most users.',
    is_default: true,
    asset_counts: {
      poster: 1,
      fanart: 3,
      clearlogo: 1
    },
    provider_priority: ['fanart_tv', 'tmdb'],
    min_poster_width: 1500,
    min_poster_height: 2250,
    min_fanart_width: 1920,
    min_fanart_height: 1080,
    phash_threshold: 0.92
  },

  {
    name: 'maximum',
    description: 'All available artwork. Best for large screens and advanced skins.',
    is_default: false,
    asset_counts: {
      poster: 3,
      fanart: 10,
      clearlogo: 1,
      clearart: 1,
      banner: 1,
      discart: 1,
      landscape: 1
    },
    provider_priority: ['fanart_tv', 'tmdb', 'tvdb'],
    min_poster_width: 2000,
    min_poster_height: 3000,
    min_fanart_width: 1920,
    min_fanart_height: 1080,
    phash_threshold: 0.90
  }
];
```

### Configuration Defaults

```typescript
// src/config/defaultProviderConfig.ts

export const DEFAULT_PROVIDER_CONFIGS = {
  tmdb: {
    enabled: true,
    priority: 80,
    use_for_metadata: true,
    use_for_images: true,
    use_for_search: true,
    language: 'en',
    region: 'US',
    options: {
      includeAdult: false
    }
  },

  fanart_tv: {
    enabled: true,
    priority: 90,                           // Higher priority for images
    use_for_metadata: false,
    use_for_images: true,
    use_for_search: false,
    language: 'en',
    options: {
      discType: 'bluray'
    }
  },

  tvdb: {
    enabled: true,
    priority: 70,
    use_for_metadata: true,
    use_for_images: true,
    use_for_search: true,
    language: 'en',
    options: {
      seasonOrder: 'aired'
    }
  },

  imdb: {
    enabled: false,                         // Web scraping, unstable
    priority: 60,
    use_for_metadata: true,
    use_for_images: false,
    use_for_search: false,
    language: 'en',
    options: {
      loadAllTags: false
    }
  }
};
```

---

## Provider Orchestration

The `ProviderOrchestrator` coordinates multiple providers to fetch and merge data.

### Orchestration Strategies

**1. Preferred Provider + Fill Gaps** (Recommended)

```typescript
strategy: 'preferred_first'
preferredProvider: 'tmdb'
fillGaps: true

// Algorithm:
1. Fetch from preferred provider (TMDB)
2. For each empty field, query other enabled providers
3. Merge results, never overwriting preferred provider data
```

**2. Field Mapping** (Power Users)

```typescript
strategy: 'field_mapping'
fieldMapping: {
  title: 'tmdb',
  plot: 'tmdb',
  actors: 'imdb',
  ratings: 'imdb',
  poster: 'fanart_tv',
  fanart: 'tmdb'
}

// Algorithm:
1. For each field, query only the assigned provider
2. No merging, explicit assignment
```

**3. Aggregate All** (Maximum Coverage)

```typescript
strategy: 'aggregate_all'
mergeStrategy: 'best_score'

// Algorithm:
1. Query all enabled providers
2. For each field, score all results
3. Select highest-scored value per field
```

### Multi-Provider Asset Collection

```typescript
// src/services/providers/ProviderOrchestrator.ts

async fetchAssetCandidates(
  entityType: EntityType,
  externalIds: Record<string, any>,
  assetTypes: AssetType[]
): Promise<AssetCandidate[]> {
  const enabledProviders = await this.getEnabledProviders();

  logger.info(`Fetching assets from ${enabledProviders.length} providers`, {
    entityType,
    assetTypes,
    providers: enabledProviders.map(p => p.provider_id)
  });

  // Parallel fetch from all providers
  const results = await Promise.allSettled(
    enabledProviders.map(config =>
      this.fetchFromProvider(config, entityType, externalIds, assetTypes)
    )
  );

  // Aggregate all successful results
  const allCandidates: AssetCandidate[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      allCandidates.push(...result.value);
    } else {
      logger.warn('Provider fetch failed', { error: result.reason });
    }
  }

  logger.info(`Collected ${allCandidates.length} asset candidates`, {
    byProvider: this.groupBy(allCandidates, 'providerId'),
    byAssetType: this.groupBy(allCandidates, 'assetType')
  });

  return allCandidates;
}

private async fetchFromProvider(
  config: ProviderConfig,
  entityType: EntityType,
  externalIds: Record<string, any>,
  assetTypes: AssetType[]
): Promise<AssetCandidate[]> {
  const provider = await this.registry.createProvider(config);
  const caps = provider.getCapabilities();

  // Filter to supported asset types
  const supportedTypes = caps.supportedAssetTypes[entityType];
  const requestTypes = assetTypes.filter(type => supportedTypes?.includes(type));

  if (requestTypes.length === 0) {
    return [];
  }

  // Find compatible external ID
  const providerId = this.resolveProviderId(caps, externalIds);

  // Fetch assets
  return await provider.getAssets({
    providerId: caps.id,
    providerResultId: providerId,
    entityType,
    assetTypes: requestTypes
  });
}
```

---

## Asset Selection Algorithm

After collecting candidates from all providers, select the "best N" using a scoring algorithm.

### Scoring Formula

```typescript
// src/services/providers/AssetSelector.ts

class AssetSelector {
  private readonly WEIGHTS = {
    resolution: 0.25,
    votes: 0.30,
    language: 0.20,
    provider: 0.15,
    aspectRatio: 0.10
  };

  private readonly PROVIDER_QUALITY = {
    fanart_tv: 1.0,
    tmdb: 0.8,
    tvdb: 0.6,
    local: 0.5
  };

  private readonly ASPECT_RATIOS = {
    poster: 0.67,    // 2:3
    fanart: 1.78,    // 16:9
    banner: 5.4,     // ~10:2
    clearart: 1.0    // 1:1
  };

  scoreCandidate(candidate: AssetCandidate, config: AssetSelectionConfig): number {
    let score = 0;

    // 1. Resolution score (0-100)
    if (candidate.width && candidate.height) {
      const pixels = candidate.width * candidate.height;
      const maxPixels = 3840 * 2160; // 4K
      const resolutionScore = Math.min((pixels / maxPixels) * 100, 100);
      score += resolutionScore * this.WEIGHTS.resolution;
    }

    // 2. Vote score (0-100)
    if (candidate.votes && candidate.voteAverage) {
      // Combine vote count and average
      const voteCountScore = Math.min((candidate.votes / 100) * 50, 50);
      const voteAvgScore = (candidate.voteAverage / 10) * 50;
      score += (voteCountScore + voteAvgScore) * this.WEIGHTS.votes;
    }

    // 3. Language score (0 or 100)
    if (candidate.language) {
      const langScore = candidate.language === config.preferLanguage ? 100 : 0;
      score += langScore * this.WEIGHTS.language;
    }

    // 4. Provider quality score (0-100)
    const providerQuality = this.PROVIDER_QUALITY[candidate.providerId] || 0.5;
    score += (providerQuality * 100) * this.WEIGHTS.provider;

    // 5. Aspect ratio score (0-100)
    if (candidate.aspectRatio) {
      const idealRatio = this.ASPECT_RATIOS[candidate.assetType] || 1.0;
      const deviation = Math.abs(idealRatio - candidate.aspectRatio);
      const aspectScore = Math.max(0, 100 - (deviation * 200));
      score += aspectScore * this.WEIGHTS.aspectRatio;
    }

    return score;
  }

  selectBest(
    candidates: AssetCandidate[],
    config: AssetSelectionConfig
  ): AssetCandidate[] {
    // Step 1: Filter by quality constraints
    const filtered = this.applyQualityFilters(candidates, config);

    // Step 2: Score each candidate
    const scored = filtered.map(candidate => ({
      candidate,
      score: this.scoreCandidate(candidate, config)
    }));

    // Step 3: Sort by score (descending)
    scored.sort((a, b) => b.score - a.score);

    // Step 4: Deduplicate by perceptual hash
    const deduplicated = this.deduplicateByPHash(scored, config.phash_threshold);

    // Step 5: Select top N
    return deduplicated
      .slice(0, config.max_count)
      .map(s => s.candidate);
  }

  private deduplicateByPHash(
    scored: Array<{ candidate: AssetCandidate; score: number }>,
    threshold: number
  ): Array<{ candidate: AssetCandidate; score: number }> {
    const unique: Array<{ candidate: AssetCandidate; score: number }> = [];

    for (const item of scored) {
      const isDuplicate = unique.some(existing => {
        if (!item.candidate.perceptualHash || !existing.candidate.perceptualHash) {
          return false;
        }
        const similarity = this.comparePHash(
          item.candidate.perceptualHash,
          existing.candidate.perceptualHash
        );
        return similarity >= threshold;
      });

      if (!isDuplicate) {
        unique.push(item);
      }
    }

    return unique;
  }
}
```

### Selection Example

```typescript
// Input: 38 poster candidates from 3 providers
const candidates = [
  { provider: 'fanart_tv', width: 2000, height: 3000, votes: 245, voteAvg: 9.2, lang: 'en' },
  { provider: 'tmdb', width: 1000, height: 1500, votes: 523, voteAvg: 8.7, lang: 'en' },
  { provider: 'tmdb', width: 2000, height: 3000, votes: 189, voteAvg: 8.4, lang: 'es' },
  // ... 35 more
];

// Config: Select best 1 poster
const config = {
  assetType: 'poster',
  max_count: 1,
  preferLanguage: 'en',
  min_width: 1000,
  min_height: 1500,
  phash_threshold: 0.92
};

// Selection process:
// 1. Filter: Remove < 1000×1500 → 30 candidates remain
// 2. Score each:
//    - FanArt.tv 2000×3000, en: score = 94.2
//    - TMDB 1000×1500, en: score = 87.5
//    - TMDB 2000×3000, es: score = 78.1
// 3. Sort by score → FanArt.tv first
// 4. Deduplicate → No duplicates
// 5. Select top 1 → FanArt.tv 2000×3000, en

// Result: Highest quality, English, from curated source
```

---

## Provider Registry

The `ProviderRegistry` singleton manages all available providers and creates instances.

### Registry Pattern

```typescript
// src/services/providers/ProviderRegistry.ts

export class ProviderRegistry {
  private static instance: ProviderRegistry;
  private providerClasses: Map<ProviderId, typeof BaseProvider> = new Map();
  private capabilities: Map<ProviderId, ProviderCapabilities> = new Map();

  private constructor() {
    this.registerBuiltInProviders();
  }

  static getInstance(): ProviderRegistry {
    if (!ProviderRegistry.instance) {
      ProviderRegistry.instance = new ProviderRegistry();
    }
    return ProviderRegistry.instance;
  }

  /**
   * Register a provider class
   */
  register(providerClass: typeof BaseProvider): void {
    const tempInstance = new providerClass({} as ProviderConfig);
    const caps = tempInstance.getCapabilities();

    this.providerClasses.set(caps.id, providerClass);
    this.capabilities.set(caps.id, caps);

    logger.info(`Registered provider: ${caps.name} (${caps.id})`);
  }

  /**
   * Create provider instance from database config
   */
  async createProvider(config: ProviderConfig): Promise<BaseProvider> {
    const ProviderClass = this.providerClasses.get(config.provider_id as ProviderId);
    if (!ProviderClass) {
      throw new Error(`Unknown provider: ${config.provider_id}`);
    }

    return new ProviderClass(config);
  }

  /**
   * Get all registered provider capabilities
   */
  getAllCapabilities(): ProviderCapabilities[] {
    return Array.from(this.capabilities.values());
  }

  /**
   * Find providers that support specific asset type
   */
  getProvidersForAssetType(
    entityType: EntityType,
    assetType: AssetType
  ): ProviderCapabilities[] {
    const results: ProviderCapabilities[] = [];

    for (const caps of this.capabilities.values()) {
      const supportedTypes = caps.supportedAssetTypes[entityType];
      if (supportedTypes?.includes(assetType)) {
        results.push(caps);
      }
    }

    return results;
  }

  private registerBuiltInProviders(): void {
    this.register(TMDBProvider);
    this.register(TVDBProvider);
    this.register(FanartTVProvider);
    this.register(IMDbProvider);
    this.register(MusicBrainzProvider);
    this.register(TheAudioDBProvider);
    this.register(LocalProvider);
  }
}
```

---

## Implementing New Providers

Follow these steps to add a new metadata provider to Metarr.

### Step 1: Create Provider Class

```typescript
// src/services/providers/ExampleProvider.ts

import { BaseProvider } from './BaseProvider.js';
import { ProviderCapabilities, AssetCandidate, MetadataResponse } from '../../types/providers.js';

export class ExampleProvider extends BaseProvider {
  /**
   * Define provider capabilities (REQUIRED)
   */
  defineCapabilities(): ProviderCapabilities {
    return {
      id: 'example',
      name: 'Example Provider',
      version: '1.0.0',
      category: 'both',

      supportedEntityTypes: ['movie'],
      supportedMetadataFields: {
        movie: ['title', 'plot', 'releaseDate']
      },
      supportedAssetTypes: {
        movie: ['poster', 'fanart']
      },

      authentication: {
        type: 'api_key',
        required: true
      },

      rateLimit: {
        requestsPerSecond: 10,
        burstCapacity: 15,
        webhookReservedCapacity: 3,
        enforcementType: 'client'
      },

      search: {
        supported: true,
        fuzzyMatching: false,
        yearFilter: true,
        externalIdLookup: ['imdb_id']
      },

      dataQuality: {
        metadataCompleteness: 0.8,
        imageQuality: 0.7,
        updateFrequency: 'daily',
        curatedContent: false
      },

      assetProvision: {
        providesUrls: true,
        thumbnailUrls: false,
        multipleQualities: false,
        maxResultsPerType: 10,
        voteSystemForImages: false
      }
    };
  }

  /**
   * Search for entities (OPTIONAL - if capabilities.search.supported = true)
   */
  async search(request: SearchRequest): Promise<SearchResult[]> {
    const response = await this.rateLimiter.execute(async () => {
      return this.httpClient.get('/search/movie', {
        params: {
          api_key: this.config.api_key,
          query: request.query,
          year: request.year
        }
      });
    });

    return response.data.results.map((item: any) => ({
      providerId: 'example',
      providerResultId: String(item.id),
      externalIds: {
        imdb: item.imdb_id
      },
      title: item.title,
      releaseDate: item.release_date ? new Date(item.release_date) : undefined,
      overview: item.overview,
      posterUrl: item.poster_path,
      confidence: 0.9
    }));
  }

  /**
   * Get metadata for entity (OPTIONAL - if provider supports metadata)
   */
  async getMetadata(request: MetadataRequest): Promise<MetadataResponse> {
    const response = await this.rateLimiter.execute(async () => {
      return this.httpClient.get(`/movie/${request.providerResultId}`, {
        params: {
          api_key: this.config.api_key
        }
      });
    });

    const data = response.data;

    return {
      providerId: 'example',
      providerResultId: request.providerResultId,
      externalIds: {
        imdb: data.imdb_id
      },
      fields: {
        title: data.title,
        plot: data.overview,
        releaseDate: data.release_date,
        genres: data.genres?.map((g: any) => g.name)
      },
      completeness: 0.85,
      confidence: 1.0
    };
  }

  /**
   * Get asset candidates (OPTIONAL - if provider supports assets)
   */
  async getAssets(request: AssetRequest): Promise<AssetCandidate[]> {
    const response = await this.rateLimiter.execute(async () => {
      return this.httpClient.get(`/movie/${request.providerResultId}/images`, {
        params: {
          api_key: this.config.api_key
        }
      });
    });

    const candidates: AssetCandidate[] = [];

    // Map posters
    if (request.assetTypes.includes('poster') && response.data.posters) {
      for (const poster of response.data.posters) {
        candidates.push({
          providerId: 'example',
          providerResultId: request.providerResultId,
          assetType: 'poster',
          url: `https://cdn.example.com/poster/${poster.file_path}`,
          width: poster.width,
          height: poster.height,
          aspectRatio: poster.width / poster.height,
          language: poster.language,
          votes: poster.vote_count,
          voteAverage: poster.vote_average
        });
      }
    }

    return candidates;
  }

  /**
   * Test connection (OPTIONAL - override for custom health check)
   */
  async testConnection(): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      await this.httpClient.get('/configuration', {
        params: { api_key: this.config.api_key }
      });
      return { success: true, message: 'Connection successful' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Create rate limiter (REQUIRED)
   */
  protected createRateLimiter(): RateLimiter {
    return new RateLimiter({
      requestsPerSecond: 10,
      burstCapacity: 15
    });
  }

  /**
   * Create HTTP client (REQUIRED)
   */
  protected createHttpClient(): HttpClient {
    return new HttpClient({
      baseURL: 'https://api.example.com/v1',
      timeout: 10000,
      headers: {
        'User-Agent': 'Metarr/1.0.0'
      }
    });
  }
}
```

### Step 2: Register Provider

```typescript
// src/services/providers/ProviderRegistry.ts

private registerBuiltInProviders(): void {
  this.register(TMDBProvider);
  this.register(TVDBProvider);
  this.register(FanartTVProvider);
  this.register(ExampleProvider);  // ← Add new provider
}
```

### Step 3: Add Database Configuration

```sql
-- Insert default config (runs on first migration)
INSERT INTO provider_configs (
  provider_id,
  enabled,
  display_name,
  priority,
  use_for_metadata,
  use_for_images,
  use_for_search
) VALUES (
  'example',
  0,                    -- Disabled by default
  'Example Provider',
  50,
  1,
  1,
  1
);
```

### Step 4: Add to Configuration UI

```typescript
// public/frontend/src/pages/settings/Providers.tsx

const providerIcons = {
  tmdb: TMDBIcon,
  tvdb: TVDBIcon,
  fanart_tv: FanartIcon,
  example: ExampleIcon  // ← Add icon
};
```

### Step 5: Write Tests

```typescript
// tests/providers/ExampleProvider.test.ts

import { ExampleProvider } from '../../src/services/providers/ExampleProvider.js';

describe('ExampleProvider', () => {
  let provider: ExampleProvider;

  beforeEach(() => {
    provider = new ExampleProvider({
      id: 1,
      provider_id: 'example',
      enabled: true,
      api_key: 'test_key',
      // ... other config
    });
  });

  it('should define capabilities', () => {
    const caps = provider.getCapabilities();
    expect(caps.id).toBe('example');
    expect(caps.search.supported).toBe(true);
  });

  it('should search for movies', async () => {
    const results = await provider.search({
      query: 'The Matrix',
      entityType: 'movie'
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toContain('Matrix');
  });

  it('should fetch metadata', async () => {
    const metadata = await provider.getMetadata({
      providerId: 'example',
      providerResultId: '603',
      entityType: 'movie'
    });

    expect(metadata.fields.title).toBeDefined();
    expect(metadata.completeness).toBeGreaterThan(0.5);
  });

  it('should fetch asset candidates', async () => {
    const assets = await provider.getAssets({
      providerId: 'example',
      providerResultId: '603',
      entityType: 'movie',
      assetTypes: ['poster', 'fanart']
    });

    expect(assets.length).toBeGreaterThan(0);
    expect(assets[0].url).toBeDefined();
  });

  it('should respect rate limits', async () => {
    const start = Date.now();

    // Make 11 requests (limit is 10/sec)
    const requests = Array.from({ length: 11 }, () =>
      provider.search({ query: 'test', entityType: 'movie' })
    );

    await Promise.all(requests);

    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThan(1000); // Should take > 1 second
  });
});
```

---

## Testing Providers

### Unit Tests

Test provider in isolation with mocked HTTP responses:

```typescript
import nock from 'nock';

describe('TMDBProvider', () => {
  beforeEach(() => {
    nock('https://api.themoviedb.org')
      .get('/3/search/movie')
      .query({ api_key: 'test_key', query: 'Matrix' })
      .reply(200, {
        results: [
          { id: 603, title: 'The Matrix', imdb_id: 'tt0133093' }
        ]
      });
  });

  it('should search for movies', async () => {
    const results = await provider.search({ query: 'Matrix', entityType: 'movie' });
    expect(results).toHaveLength(1);
  });
});
```

### Integration Tests

Test provider against real API (optional, rate-limited):

```typescript
describe('TMDBProvider Integration', () => {
  it.skip('should fetch real data from TMDB', async () => {
    const provider = new TMDBProvider({
      api_key: process.env.TMDB_API_KEY,
      // ...
    });

    const results = await provider.search({ query: 'Matrix', entityType: 'movie' });
    expect(results.length).toBeGreaterThan(0);
  });
});
```

### Manual Testing

Use Postman/curl to test provider endpoints:

```bash
# Test TMDB search
curl "https://api.themoviedb.org/3/search/movie?api_key=YOUR_KEY&query=Matrix"

# Test FanArt.tv
curl "https://webservice.fanart.tv/v3/movies/603?api_key=YOUR_KEY"

# Test TVDB
curl "https://api4.thetvdb.com/v4/search?query=Breaking%20Bad" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Provider List

### Implemented Providers

| Provider | ID | Category | Status | Priority |
|----------|----|----|--------|----------|
| **TMDB** | `tmdb` | Both | ✅ Implemented | High |
| **TVDB** | `tvdb` | Both | 🟡 Planned | High |
| **FanArt.tv** | `fanart_tv` | Images | 🟡 Planned | High |
| **IMDb** | `imdb` | Metadata | 🟡 Planned | Medium |
| **MusicBrainz** | `musicbrainz` | Both | 🟡 Future | Low |
| **TheAudioDB** | `theaudiodb` | Both | 🟡 Future | Low |
| **Local** | `local` | Images | 🟡 Planned | Medium |

### Provider Details

#### TMDB (The Movie Database)

- **Website:** https://www.themoviedb.org/
- **API Docs:** https://developers.themoviedb.org/3
- **API Key:** Free (registration required)
- **Rate Limit:** 40 requests/10 seconds
- **Best For:** Metadata, posters, fanart
- **Coverage:** Movies, TV shows, actors, collections
- **Quality:** Good (user-submitted, moderated)

#### TVDB (TheTVDB)

- **Website:** https://thetvdb.com/
- **API Docs:** https://thetvdb.github.io/v4-api/
- **API Key:** Free (registration required)
- **Rate Limit:** ~100 requests/10 seconds
- **Authentication:** JWT (24-hour expiry)
- **Best For:** TV show metadata, banners, season posters
- **Coverage:** TV shows only
- **Quality:** Good (community-contributed)

#### FanArt.tv

- **Website:** https://fanart.tv/
- **API Docs:** https://fanarttv.docs.apiary.io/
- **API Key:** Free (optional personal key for higher limits)
- **Rate Limit:** 1 req/sec (free) or 2 req/sec (personal key)
- **Best For:** High-quality clearlogos, clearart, textless posters
- **Coverage:** Selective (curated content only)
- **Quality:** Excellent (moderated, strict quality standards)

#### IMDb

- **Website:** https://www.imdb.com/
- **API:** No official API (web scraping)
- **API Key:** Not required
- **Rate Limit:** None (respectful scraping)
- **Best For:** Authoritative ratings, comprehensive cast data
- **Coverage:** Movies, TV shows
- **Quality:** Authoritative
- **⚠️ Warning:** Web scraping is fragile and may break

#### MusicBrainz

- **Website:** https://musicbrainz.org/
- **API Docs:** https://musicbrainz.org/doc/MusicBrainz_API
- **API Key:** Not required
- **Rate Limit:** 1 req/sec (community guideline)
- **Best For:** Music metadata, discography
- **Coverage:** Music artists, albums, releases
- **Quality:** Excellent (community-curated)

#### TheAudioDB

- **Website:** https://www.theaudiodb.com/
- **API Docs:** https://www.theaudiodb.com/api_guide.php
- **API Key:** Free (some endpoints require paid tier)
- **Rate Limit:** Not documented
- **Best For:** Music artwork, artist biographies
- **Coverage:** Music artists, albums
- **Quality:** Good (user-submitted)

#### Local Provider

- **Purpose:** Discovers assets in library directories
- **API:** Filesystem scanning
- **Best For:** User-provided custom artwork
- **Coverage:** Any media type
- **Quality:** Variable (user-dependent)
- **Priority:** Lowest (fallback)

---

## See Also

- [METADATA_PROVIDERS.md](METADATA_PROVIDERS.md) - Provider API reference
- [ASSET_MANAGEMENT.md](ASSET_MANAGEMENT.md) - Three-tier asset system
- [AUTOMATION_AND_WEBHOOKS.md](AUTOMATION_AND_WEBHOOKS.md) - Automation workflows
- [FIELD_LOCKING.md](FIELD_LOCKING.md) - User edit preservation

---

**Next Steps:**
1. Implement `BaseProvider` abstract class
2. Implement `ProviderRegistry` singleton
3. Refactor `TMDBClient` → `TMDBProvider`
4. Implement `ProviderOrchestrator`
5. Implement `AssetSelector`
6. Add provider configuration UI
7. Write comprehensive tests
