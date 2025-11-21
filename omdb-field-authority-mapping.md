# OMDB Field Authority Mapping

**Purpose**: Define which provider is authoritative for each metadata field and asset type when OMDB is added to the system.

**Context**: Based on Morgan's architecture analysis and empirical OMDB testing.

---

## Key Findings

### OMDB API Fields (Confirmed via API Test)

**Available in OMDB**:
- ✅ Title, Year, Rated (certification)
- ✅ Released (release date)
- ✅ Runtime
- ✅ Genre
- ✅ Director, Writer, Actors
- ✅ Plot (short and full versions)
- ✅ Language, Country
- ✅ Awards
- ✅ **Poster URL** (direct Amazon S3 link)
- ✅ **Ratings** (IMDb, Rotten Tomatoes, Metacritic)
- ✅ Metascore, imdbRating, imdbVotes
- ✅ imdbID
- ✅ DVD release, BoxOffice
- ✅ Production company (often "N/A")
- ✅ Website (often "N/A")

**NOT Available in OMDB**:
- ❌ **Trailers** - No video URLs provided
- ❌ Multiple poster sizes/resolutions
- ❌ Fanart, banners, clearlogos, discart
- ❌ Character art
- ❌ Detailed cast with character names/order
- ❌ Crew beyond director/writer
- ❌ Production companies (often "N/A")
- ❌ Original title (if different from English)
- ❌ Tagline
- ❌ Keywords
- ❌ Status (released, post-production, etc.)

---

## Provider Capabilities Matrix

### Metadata Fields

| Field | TMDB | OMDB | Fanart.tv | TVDB | IMDb Scraper | Recommended Authority |
|-------|------|------|-----------|------|--------------|----------------------|
| **Core Identification** |
| Title | ✅ Excellent | ✅ Excellent | ❌ | ✅ Excellent | ✅ Excellent | **TMDB** (most complete, original + localized) |
| Original Title | ✅ Yes | ❌ No | ❌ | ❌ No | ✅ Sometimes | **TMDB** |
| Year | ✅ Yes | ✅ Yes | ❌ | ✅ Yes | ✅ Yes | **TMDB** (tie, all good) |
| IMDb ID | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Native | **All** (cross-reference) |
| TMDB ID | ✅ Native | ❌ No | ✅ Yes | ❌ No | ❌ No | **TMDB** |
| **Ratings & Reviews** |
| IMDb Rating | ✅ Included | ✅ **Authoritative** | ❌ | ❌ | ✅ **Authoritative** | **OMDB** (same as IMDb, more legal) |
| IMDb Vote Count | ✅ Included | ✅ **Authoritative** | ❌ | ❌ | ✅ **Authoritative** | **OMDB** |
| Rotten Tomatoes | ❌ No | ✅ **Only source** | ❌ | ❌ | ❌ No | **OMDB** |
| Metacritic | ❌ No | ✅ **Only source** | ❌ | ❌ | ❌ No | **OMDB** |
| TMDB Rating | ✅ Native | ❌ No | ❌ | ❌ | ❌ No | **TMDB** |
| **Plot & Synopsis** |
| Plot/Overview | ✅ Excellent | ✅ Good (shorter) | ❌ | ✅ Good | ✅ Good | **TMDB** (more detailed, localized) |
| Tagline | ✅ Yes | ❌ No | ❌ | ❌ No | ✅ Sometimes | **TMDB** |
| **Release Info** |
| Release Date | ✅ Yes | ✅ Yes | ❌ | ✅ Yes | ✅ Yes | **TMDB** (most accurate, regional variants) |
| Runtime | ✅ Yes | ✅ Yes | ❌ | ✅ Yes | ✅ Yes | **TMDB** (tie, all good) |
| Status | ✅ Yes | ❌ No | ❌ | ✅ Yes | ❌ No | **TMDB** |
| Certification | ✅ Yes | ✅ Yes (US only) | ❌ | ✅ Yes | ✅ Yes | **TMDB** (regional variants) |
| **People** |
| Cast | ✅ Full cast | ✅ Top-billed only | ❌ | ✅ Full cast | ✅ Full cast | **TMDB** (detailed: order, character, images) |
| Directors | ✅ Yes | ✅ Yes | ❌ | ✅ Yes | ✅ Yes | **TMDB** (tie) |
| Writers | ✅ Yes | ✅ Yes | ❌ | ✅ Yes | ✅ Yes | **TMDB** (tie) |
| Crew | ✅ Full crew | ❌ No | ❌ | ✅ Limited | ✅ Limited | **TMDB** |
| **Categories** |
| Genres | ✅ Yes | ✅ Yes | ❌ | ✅ Yes | ✅ Yes | **TMDB** (standardized taxonomy) |
| Keywords | ✅ Yes | ❌ No | ❌ | ❌ No | ❌ No | **TMDB** |
| **Production** |
| Studios/Production Companies | ✅ Detailed | ⚠️ Often "N/A" | ❌ | ✅ Yes | ✅ Yes | **TMDB** |
| Countries | ✅ Multiple | ✅ Comma-separated | ❌ | ✅ Yes | ✅ Yes | **TMDB** (structured) |
| Languages | ✅ Multiple | ✅ Comma-separated | ❌ | ✅ Yes | ✅ Yes | **TMDB** (structured) |
| **Financial** |
| Budget | ✅ Yes | ❌ No | ❌ | ❌ No | ❌ No | **TMDB** |
| Revenue/Box Office | ✅ Yes | ✅ Yes (US only) | ❌ | ❌ No | ❌ No | **TMDB** (worldwide) |
| **Awards** |
| Awards | ❌ No | ✅ **Only source** | ❌ | ❌ No | ✅ Yes | **OMDB** (structured summary) |
| **Other** |
| Official Website | ✅ Yes | ⚠️ Often "N/A" | ❌ | ❌ No | ❌ No | **TMDB** |
| Trailers | ✅ **Best source** | ❌ No | ❌ | ✅ Limited | ❌ No | **TMDB** (YouTube IDs) |
| DVD Release | ❌ No | ✅ Yes (often "N/A") | ❌ | ❌ No | ❌ No | **OMDB** |

### Asset Types

| Asset Type | TMDB | OMDB | Fanart.tv | TVDB | Local | Recommended Priority |
|------------|------|------|-----------|------|-------|---------------------|
| **Posters** | ✅ Good (multiple sizes) | ⚠️ One URL (300px) | ✅ **Best quality** | ✅ Good | ✅ Yes | **Fanart.tv → TMDB → TVDB → OMDB → Local** |
| **Fanart/Backdrops** | ✅ Excellent | ❌ No | ✅ **Best quality** | ✅ Good | ✅ Yes | **Fanart.tv → TMDB → TVDB → Local** |
| **Logos (Clear)** | ❌ No | ❌ No | ✅ **Only source** | ✅ Yes | ✅ Yes | **Fanart.tv → TVDB → Local** |
| **ClearArt** | ❌ No | ❌ No | ✅ **Only source** | ❌ No | ✅ Yes | **Fanart.tv → Local** |
| **DiscArt** | ❌ No | ❌ No | ✅ **Only source** | ❌ No | ✅ Yes | **Fanart.tv → Local** |
| **Banners** | ❌ No | ❌ No | ✅ **Best quality** | ✅ Yes | ✅ Yes | **Fanart.tv → TVDB → Local** |
| **Character Art** | ❌ No | ❌ No | ✅ **Only source** | ❌ No | ✅ Yes | **Fanart.tv → Local** |
| **Trailers** | ✅ **Best source** | ❌ No | ❌ No | ✅ Limited | ❌ No | **TMDB → TVDB** |

---

## Recommended Field Authority Mapping

### Strategy 1: "Quality First" (Default - Recommended)

**Philosophy**: Use the most reliable, complete source for each field category.

```typescript
export const QUALITY_FIRST_PRIORITIES: MetadataFieldPriorities = {
  // Ratings: OMDB is authoritative for IMDb + adds RT/Metacritic
  ratings: ['omdb', 'tmdb'],

  // Plot: TMDB more detailed and localized
  plot: ['tmdb', 'omdb'],
  tagline: ['tmdb'],

  // Release info: TMDB has regional variants
  releaseDate: ['tmdb', 'omdb'],
  runtime: ['tmdb', 'omdb'],
  certification: ['tmdb', 'omdb'],
  status: ['tmdb'],

  // People: TMDB has structured data with images
  actors: ['tmdb', 'omdb'],
  directors: ['tmdb', 'omdb'],
  writers: ['tmdb', 'omdb'],
  crew: ['tmdb'],

  // Categories: TMDB standardized
  genres: ['tmdb', 'omdb'],
  keywords: ['tmdb'],

  // Production: TMDB more reliable
  studios: ['tmdb', 'omdb'],
  productionCompanies: ['tmdb'],
  countries: ['tmdb', 'omdb'],
  languages: ['tmdb', 'omdb'],

  // Financial: TMDB only
  budget: ['tmdb'],
  revenue: ['tmdb', 'omdb'],  // OMDB has US box office

  // Unique fields
  awards: ['omdb'],  // Only OMDB has this
  website: ['tmdb', 'omdb'],
  originalTitle: ['tmdb'],

  // Trailers: TMDB only
  trailers: ['tmdb', 'tvdb'],
};
```

### Strategy 2: "OMDB Primary" (IMDb-Centric)

**Philosophy**: Prefer OMDB/IMDb data when available, fallback to TMDB.

```typescript
export const OMDB_PRIMARY_PRIORITIES: MetadataFieldPriorities = {
  ratings: ['omdb', 'tmdb'],           // OMDB has IMDb + RT + MC
  plot: ['omdb', 'tmdb'],              // OMDB from IMDb
  releaseDate: ['omdb', 'tmdb'],
  runtime: ['omdb', 'tmdb'],
  certification: ['omdb', 'tmdb'],
  actors: ['omdb', 'tmdb'],            // OMDB top-billed, TMDB full cast
  directors: ['omdb', 'tmdb'],
  writers: ['omdb', 'tmdb'],
  genres: ['omdb', 'tmdb'],
  studios: ['omdb', 'tmdb'],
  countries: ['omdb', 'tmdb'],
  languages: ['omdb', 'tmdb'],
  awards: ['omdb'],

  // TMDB exclusive fields
  crew: ['tmdb'],
  budget: ['tmdb'],
  keywords: ['tmdb'],
  trailers: ['tmdb'],
  originalTitle: ['tmdb'],
  status: ['tmdb'],
};
```

### Strategy 3: "TMDB Primary" (Community-Driven)

**Philosophy**: Prefer TMDB's comprehensive, community-maintained data.

```typescript
export const TMDB_PRIMARY_PRIORITIES: MetadataFieldPriorities = {
  // Only use OMDB for fields TMDB lacks or OMDB is superior
  ratings: ['omdb', 'tmdb'],           // OMDB has RT/Metacritic
  awards: ['omdb'],                    // TMDB doesn't have this

  // Everything else: TMDB first
  plot: ['tmdb', 'omdb'],
  tagline: ['tmdb'],
  releaseDate: ['tmdb', 'omdb'],
  runtime: ['tmdb', 'omdb'],
  certification: ['tmdb', 'omdb'],
  actors: ['tmdb', 'omdb'],
  directors: ['tmdb', 'omdb'],
  writers: ['tmdb', 'omdb'],
  crew: ['tmdb'],
  genres: ['tmdb', 'omdb'],
  keywords: ['tmdb'],
  studios: ['tmdb', 'omdb'],
  countries: ['tmdb', 'omdb'],
  languages: ['tmdb', 'omdb'],
  budget: ['tmdb'],
  revenue: ['tmdb', 'omdb'],
  trailers: ['tmdb'],
  originalTitle: ['tmdb'],
  status: ['tmdb'],
};
```

---

## Asset Priority Recommendations

### Posters
```typescript
assetTypePriorities: {
  poster: ['fanart_tv', 'tmdb', 'tvdb', 'omdb', 'local']
}
```
**Reasoning**: Fanart.tv has curated high-quality posters, TMDB has multiple sizes, OMDB only has 300px width (low resolution).

### Fanart/Backdrops
```typescript
assetTypePriorities: {
  fanart: ['fanart_tv', 'tmdb', 'tvdb', 'local']
  // OMDB doesn't provide fanart
}
```

### Logos
```typescript
assetTypePriorities: {
  clearlogo: ['fanart_tv', 'tvdb', 'local']
  // Only Fanart.tv and TVDB provide clearlogos
}
```

### Trailers
```typescript
assetTypePriorities: {
  trailer: ['tmdb', 'tvdb']
  // OMDB doesn't provide trailers
}
```

---

## Implementation Recommendations

### 1. Default to "Quality First" Strategy

**Why**: Balances OMDB's unique data (RT/Metacritic ratings, Awards) with TMDB's completeness.

### 2. Make Field Priorities Configurable

Allow power users to override in Settings:
- UI: Settings → Providers → Field Priority Configuration
- Per-field dropdowns: "Which provider for Plot? [TMDB, OMDB, Local]"

### 3. Implement Merge Logic in ProviderFetchPhase

**Current**: TMDB authoritative (first-wins)
**Proposed**: Field-level priority-based merging

```typescript
async function mergeMetadata(
  movie: Movie,
  providers: { tmdb: MetadataResponse, omdb: MetadataResponse }
): Promise<Partial<Movie>> {
  const priorities = await priorityConfigService.getMetadataFieldPriorities();
  const merged: Partial<Movie> = {};

  for (const field of METADATA_FIELDS) {
    const providerOrder = priorities[field] || ['tmdb', 'omdb'];

    for (const providerId of providerOrder) {
      const value = providers[providerId]?.fields[field];
      if (value !== undefined && value !== null) {
        merged[field] = value;
        break; // First valid value wins
      }
    }
  }

  return merged;
}
```

### 4. Special Handling for Ratings

**Ratings should MERGE, not replace**:

```typescript
// OMDB provides: IMDb, RT, Metacritic
// TMDB provides: IMDb (sometimes), TMDB
// Combine both into ratings array

merged.ratings = [
  ...omdb.ratings,     // IMDb, RT, MC from OMDB
  ...tmdb.ratings.filter(r => r.source === 'tmdb')  // Add TMDB rating
];
```

### 5. Respect Field Locks

**Current behavior (good)**: Field locks prevent ANY provider from overwriting user edits.

**Maintain**: Field locks have higher priority than provider priority.

```typescript
if (movie.locked_fields?.includes(field)) {
  continue; // Skip this field, user has manually set it
}
```

---

## OMDB-Specific Considerations

### 1. No Embedded API Key

```typescript
// src/services/providers/omdb/OMDBProvider.ts
constructor(config: ProviderConfig) {
  super(config);

  if (!config.apiKey) {
    this.enabled = false;
    logger.warn('OMDB provider disabled: No API key configured');
  }
}
```

### 2. Graceful Skip When Disabled

```typescript
// FetchOrchestrator skips provider if enabled=false
const enabledProviders = this.registry.getEnabled();
// OMDB not in list if no API key
```

### 3. Cache Results Same as Other Providers

**Automatic**: `ProviderCacheManager` handles caching in `provider_assets` table.

**TTL**: 7 days (configurable)

**Cache Key**: `(entity_id, provider_name='omdb', asset_type, provider_url)`

### 4. Poster URL Handling

**OMDB returns**: Direct Amazon S3 URL (e.g., `https://m.media-amazon.com/images/M/MV5B...SX300.jpg`)

**Resolution**: 300px width by default (SX300 in URL)

**Workaround**: Can modify URL to get higher resolution:
- `SX300` → `SX1000` for 1000px width
- May not work for all posters

**Recommendation**: Use OMDB posters as fallback only (Fanart.tv/TMDB have better quality).

### 5. Rate Limit Management

**Free Tier**: 1,000 req/day
**Paid Tier**: 100,000 req/day ($1/month)

**Strategy**:
- Cache aggressively (7-day TTL)
- Only fetch when enriching new movies
- Batch enrichment warns user about rate limits
- UI: "OMDB free tier: 873/1000 requests remaining today"

---

## Migration Plan

### Phase 1: Implement OMDB Provider (Movies Only)

1. Create `OMDBProvider` class
2. Register with ProviderRegistry
3. Add to default priority configuration (disabled by default)
4. UI: Provider configuration page with API key input

### Phase 2: Test TV Series Support

1. Run reliability test on TV series (Breaking Bad, GoT, etc.)
2. Validate episode-level metadata
3. If >90% reliable: Enable for TV
4. If <90%: Keep movies-only

### Phase 3: Field-Level Merging (Future Enhancement)

1. Implement priority-based merge logic in ProviderFetchPhase
2. UI: Field priority configuration page
3. Migrate from TMDB-authoritative to configurable priorities

---

## Summary

**OMDB Strengths**:
- ✅ Authoritative IMDb ratings + vote counts
- ✅ **Only source** for Rotten Tomatoes scores
- ✅ **Only source** for Metacritic scores
- ✅ **Only source** for Awards summary
- ✅ 100% reliable for popular movies (tested)
- ✅ Legal (no ToS violations)

**OMDB Weaknesses**:
- ❌ No trailers (TMDB superior)
- ❌ Low-resolution posters (300px)
- ❌ No fanart, clearlogos, banners
- ❌ Limited cast (top-billed only)
- ❌ Often "N/A" for production companies
- ❌ TV episode data untested

**Recommended Use**:
- **Primary for**: Ratings (IMDb, RT, Metacritic), Awards
- **Secondary for**: Plot, actors, directors, release info
- **Never use for**: Assets (posters low-res), trailers (not available)

**Priority Configuration**:
- Use "Quality First" strategy by default
- OMDB for ratings, TMDB for everything else
- Merge ratings from both providers
- Respect field locks (user edits always win)
