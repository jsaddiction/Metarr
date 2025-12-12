# Scraping (Movie Implementation)

Fetches metadata and asset URLs from all enabled providers and stores them in the provider cache.

**Conceptual Reference:** [Scraping Concepts](../../concepts/Enrichment/SCRAPING/README.md)

## Purpose

Scraping answers: **"What do we know about this movie from external providers?"**

- Fetch comprehensive metadata from TMDB and OMDB
- Aggregate data with provider priority (OMDB > TMDB for curated fields)
- Retrieve asset URLs from TMDB and Fanart.tv
- Cache all data for subsequent selection
- Respect field locks to preserve manual edits

## Prerequisites

| Requirement | Source | Notes |
|-------------|--------|-------|
| Movie record exists | Scanning phase | With at least TMDB ID |
| TMDB ID available | NFO or webhook | Required for TMDB fetch |
| IMDb ID (optional) | NFO or TMDB cross-ref | Enables OMDB fetch |

---

## Process Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    METADATA FETCH                                │
│  Parallel queries to TMDB and OMDB (if IMDb ID available)       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                   METADATA AGGREGATION                           │
│  For each field: Check OMDB first, fall back to TMDB            │
│  Apply "fill gaps, don't erase" logic with lock checking        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                   ASSET URL FETCH                                │
│  Query TMDB for posters/backdrops                               │
│  Query Fanart.tv for logos/clearart/banners/disc                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                   CACHE MATCHING                                 │
│  Check if any candidate URLs already exist in cache             │
│  Link existing cache files to avoid re-downloading              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                 DATABASE UPDATE                                  │
│  Update movies table with aggregated metadata                   │
│  Insert candidates into provider_assets table                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Metadata Sources

### Provider Priority

```
OMDB > TMDB
```

For each field, the system checks OMDB first. If OMDB has a value, use it. If empty, fall back to TMDB.

### What Each Provider Contributes

| Field | OMDB | TMDB | Notes |
|-------|------|------|-------|
| Title | ✓ | ✓ | OMDB preferred (curated) |
| Plot | ✓ | ✓ | OMDB preferred |
| Tagline | ✗ | ✓ | TMDB only |
| Runtime | ✓ | ✓ | OMDB preferred |
| Content Rating | ✓ | ✓ | OMDB preferred (MPAA) |
| Release Date | ✓ | ✓ | OMDB preferred |
| IMDb Rating | ✓ | ✗ | OMDB exclusive |
| Rotten Tomatoes | ✓ | ✗ | OMDB exclusive |
| Metacritic | ✓ | ✗ | OMDB exclusive |
| Awards | ✓ | ✗ | OMDB exclusive |
| Directors | ✓ | ✓ | OMDB preferred |
| Writers | ✓ | ✓ | OMDB preferred |
| Budget/Revenue | ✗ | ✓ | TMDB only |

**Why OMDB priority?** OMDB is a curated database that aggregates ratings from multiple sources and provides awards data that TMDB doesn't have.

---

## Asset Sources

### Provider Capabilities

| Asset Type | TMDB | Fanart.tv |
|------------|------|-----------|
| poster | ✓ `/images` posters | ✓ movieposter |
| fanart | ✓ `/images` backdrops | ✓ moviebackground |
| logo | ✗ | ✓ hdmovielogo |
| clearart | ✗ | ✓ hdmovieclearart |
| disc | ✗ | ✓ moviedisc |
| banner | ✗ | ✓ moviebanner |
| thumb | ✗ | ✓ moviethumb |

### Asset URL Storage

All discovered URLs stored as candidates:

```sql
provider_assets (
  media_id,           -- Link to movie
  provider,           -- 'tmdb' or 'fanart'
  asset_type,         -- poster, fanart, logo, etc.
  url,                -- Remote file URL
  language,           -- ISO language code
  width, height,      -- Provider-reported dimensions
  vote_count,         -- Provider popularity metric
  status              -- 'candidate', 'cached', 'selected'
)
```

**No files downloaded yet** - only URLs are stored during scraping.

---

## Field Update Logic

The "fill gaps, don't erase" algorithm prevents data regression:

```
For each field:
  1. Is field locked? → SKIP (never update locked fields)
  2. Current value empty? → ACCEPT any non-empty value (fill gap)
  3. New value empty? → REJECT (prevent regression)
  4. Both have values? → ACCEPT if different (allow correction)
```

### Decision Matrix

| Current Value | New Value | Locked | Action |
|---------------|-----------|--------|--------|
| Empty | Has value | No | **UPDATE** (fill gap) |
| Empty | Has value | Yes | Skip (locked) |
| Has value | Empty | No | Skip (prevent regression) |
| Has value | Different | No | **UPDATE** (correction) |
| Has value | Same | No | Skip (no change) |
| Any | Any | Yes | Skip (locked) |

### Lock Columns

| Lock Column | Protects |
|-------------|----------|
| `title_locked` | Title field |
| `plot_locked` | Plot/overview |
| `outline_locked` | Short plot |
| `tagline_locked` | Tagline |
| `content_rating_locked` | MPAA/certification |
| `release_date_locked` | Release date |

---

## Cache Matching

Before marking candidates for download, check if URL already exists in cache:

```
For each provider_asset candidate:
  1. Generate URL hash
  2. SELECT from cache_image_files WHERE url_hash = ?
  3. If found AND file exists on disk:
     - Link provider_asset to cache_image_file
     - Mark as 'cached'
  4. If not found:
     - Leave as 'candidate' for selection phase
```

**Benefits:**
- Same poster shared across different quality releases
- Re-enrichment skips already-cached assets
- Bandwidth savings from provider caching

---

## Two Enrichment Modes

### Manual/Webhook Mode (`requireComplete = false`)

Used for: Single movie enrichment, webhook triggers

| Behavior | Description |
|----------|-------------|
| Rate limit handling | Continue with partial data |
| Failure handling | Use whatever data is available |
| Return value | `partial: true` if any provider failed |

### Bulk Mode (`requireComplete = true`)

Used for: Bulk enrichment, scheduled enrichment

| Behavior | Description |
|----------|-------------|
| Rate limit handling | **Stop immediately** |
| Failure handling | Return failure, don't update |
| Return value | `updated: false, rateLimitedProviders: [...]` |

**Why stop on rate limit in bulk mode?** When processing 1000 movies, hitting a rate limit means subsequent movies would fail. Better to stop and wait.

---

## Configuration

| Setting | Effect |
|---------|--------|
| `fetchProviderAssets` | Enable asset URL fetching |
| `asset_limit_{type}` | Per-type limit (0 = skip type) |
| `preferredLanguage` | Language preference for metadata/images |
| TMDB API key | Authentication (embedded default) |
| OMDB API key | Authentication (optional) |
| Fanart.tv API key | Authentication (optional) |

---

## Error Handling

| Error | Behavior |
|-------|----------|
| TMDB rate limit (bulk) | Stop immediately |
| TMDB rate limit (manual) | Continue with partial data |
| OMDB unavailable | Continue with TMDB only |
| Fanart.tv unavailable | Continue with TMDB images only |
| Network timeout | Retry with exponential backoff (3 attempts) |
| Invalid response | Log error, skip provider, continue |

---

## Output

After scraping completes:

- `movies` table updated with aggregated metadata
- `provider_assets` populated with candidate URLs
- Candidates linked to existing cache files where possible
- `completeness_pct` calculated
- `last_enrichment_date` updated
- Ready for [Asset Selection](./03-ASSET-SELECTION.md)

---

## Related Services

| Service | File | Purpose |
|---------|------|---------|
| `ProviderFetchPhase` | `src/services/enrichment/phases/ProviderFetchPhase.ts` | Scraping phase implementation |
| `ProviderCacheOrchestrator` | `src/services/providers/ProviderCacheOrchestrator.ts` | Provider coordination & caching |
| `EnrichmentOrchestrator` | `src/services/enrichment/EnrichmentOrchestrator.ts` | Phase coordination |
| `TMDBClient` | `src/services/providers/tmdb/TMDBClient.ts` | TMDB API client |
| `OMDBProvider` | `src/services/providers/omdb/OMDBProvider.ts` | OMDB API client |
| `FanartService` | `src/services/providers/FanartService.ts` | Fanart.tv client |

---

## Previous Phase

← [Scanning](./01-SCANNING.md)

## Next Phase

→ [Asset Selection](./03-ASSET-SELECTION.md)
