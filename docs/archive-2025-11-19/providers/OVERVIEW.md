# Provider Overview

**Purpose**: Summary of all metadata and asset providers, their capabilities, and selection strategies.

**Related Docs**:
- [Rate Limiting](./RATE_LIMITING.md) - THE canonical rate limiting documentation
- [TMDB](./TMDB.md) - The Movie Database integration
- [TVDB](./TVDB.md) - TheTVDB integration
- [FanArt.tv](./FANART.md) - High-quality curated artwork
- [MusicBrainz](./MUSICBRAINZ.md) - Music metadata
- [Local Backup](./LOCAL_BACKUP.md) - Local asset backup system
- [Getting API Keys](./GETTING_API_KEYS.md) - When and how to get personal API keys

## Quick Reference

**Provider Categories**:
- **Metadata**: Provides metadata fields (plot, cast, ratings)
- **Images**: Provides artwork only
- **Both**: Provides metadata and images

**Zero Configuration**: Metarr includes embedded API keys for all providers. No signup required for development.

**Personal Keys**: Optional for all providers. Benefits include usage tracking and supporting provider communities (TMDB, TVDB) or higher rate limits (FanArt.tv).

## Supported Providers

### Movies & TV Shows

| Provider | Category | Auth Type | Rate Limit | Personal Key Benefit |
|----------|----------|-----------|------------|---------------------|
| **TMDB** | Both | Bearer (optional) | 40 req/10s | Usage tracking, community support |
| **TVDB** | Both | JWT (optional) | 30 req/10s | Usage tracking, community support |
| **FanArt.tv** | Images | API Key (optional) | 10 req/s (20 w/ key) | Higher rate limit (2x) |
| **Local** | Both | None | Unlimited | N/A - filesystem access |

### Music

| Provider | Category | Auth Type | Rate Limit | Personal Key Benefit |
|----------|----------|-----------|------------|---------------------|
| **MusicBrainz** | Metadata | None | 1 req/s (strict) | N/A - no API keys |
| **TheAudioDB** | Both | API Key (required) | 30 req/60s | N/A - key always required |

### Metadata Only

| Provider | Category | Auth Type | Rate Limit | Notes |
|----------|----------|-----------|------------|-------|
| **IMDb** | Metadata | None | 1 req/s | Web scraping - use cautiously |

## Provider Capabilities Matrix

### Asset Types by Provider

**Movies**:
```
Asset Type    │ TMDB │ FanArt.tv │ Local
──────────────┼──────┼───────────┼───────
poster        │  ✓   │     ✓     │   ✓
fanart        │  ✓   │     ✓     │   ✓
banner        │  ✗   │     ✓     │   ✓
clearlogo     │  ✗   │     ✓     │   ✓
clearart      │  ✗   │     ✓     │   ✓
discart       │  ✗   │     ✓     │   ✓
landscape     │  ✓   │     ✓     │   ✓
trailer       │  ✓   │     ✗     │   ✗
```

**TV Shows**:
```
Asset Type       │ TMDB │ TVDB │ FanArt.tv │ Local
─────────────────┼──────┼──────┼───────────┼───────
poster           │  ✓   │  ✓   │     ✓     │   ✓
fanart           │  ✓   │  ✓   │     ✓     │   ✓
banner           │  ✗   │  ✓   │     ✓     │   ✓
clearlogo        │  ✗   │  ✓   │     ✓     │   ✓
clearart         │  ✗   │  ✗   │     ✓     │   ✓
characterart     │  ✗   │  ✗   │     ✓     │   ✓
landscape        │  ✓   │  ✓   │     ✓     │   ✓
season_poster    │  ✓   │  ✓   │     ✗     │   ✓
episode_still    │  ✓   │  ✓   │     ✗     │   ✓
```

### Metadata Fields by Provider

**Movies**:
- **TMDB**: title, plot, tagline, releaseDate, runtime, ratings, genres, studios, cast, crew, certification
- **IMDb**: ratings (most trusted), cast, crew, genres
- **Local**: All fields from NFO files + stream info from FFprobe

**TV Shows**:
- **TVDB**: title, plot, aired dates, status, ratings, network, cast
- **TMDB**: title, plot, ratings, genres, cast, crew
- **Local**: All fields from NFO files + stream info

**Music**:
- **MusicBrainz**: artist name, biography, formed/disbanded dates, albums, tracks
- **TheAudioDB**: artist images, album covers, artist biography

## Selection Strategies

### Priority Presets

Metarr includes four built-in provider priority presets:

1. **Quality First** (Default)
   - Prioritizes curated, high-quality artwork
   - Order: FanArt.tv → TMDB → TVDB → Local
   - Best for: Users who want the best-looking library

2. **Speed First**
   - Prioritizes providers with higher rate limits
   - Order: TMDB → TVDB → FanArt.tv → Local
   - Best for: Large libraries, fast enrichment

3. **TMDB Primary**
   - Uses TMDB as primary source for movies/TV
   - Order: TMDB → FanArt.tv → TVDB → Local
   - Best for: TMDB enthusiasts

4. **TVDB Primary**
   - Uses TVDB as primary source for TV shows
   - Order: TVDB → TMDB → FanArt.tv → Local
   - Best for: TVDB enthusiasts

### Custom Priorities

Users can customize provider order per asset type:
- Set priorities in Settings → Providers → Priority Configuration
- Overrides apply at asset type level (e.g., different order for posters vs fanart)
- Changes affect future enrichment jobs only (not existing cache)

### Selection Process

1. **Candidate Fetching**: Fetch assets from all enabled providers in parallel
2. **Scoring**: Score candidates based on dimensions, language, votes, and provider priority
3. **User Selection**: Present top candidates to user for manual selection
4. **Auto-Selection**: If auto-select enabled, choose highest-scored candidate
5. **Fallback**: If primary provider fails, try next in priority order

See [Enrichment Phase](../phases/ENRICHMENT.md) for detailed selection workflow.

## Provider Comparison

### When to Use Each Provider

**TMDB**:
- ✓ Comprehensive movie metadata
- ✓ Good TV show support
- ✓ High rate limit (40 req/10s)
- ✓ Reliable, well-maintained API
- ✗ No clearlogo/clearart/discart

**TVDB**:
- ✓ Best TV show metadata
- ✓ Episode stills
- ✓ Season posters
- ✓ Good rate limit (30 req/10s)
- ✗ Weak movie support

**FanArt.tv**:
- ✓ Highest quality curated artwork
- ✓ Unique asset types (clearlogo, clearart, discart, characterart)
- ✓ Community-driven quality control
- ✗ Slower rate limit (10-20 req/s)
- ✗ Images only, no metadata

**MusicBrainz**:
- ✓ Comprehensive music metadata
- ✓ Open database
- ✗ Strict rate limit (1 req/s)
- ✗ No images

**Local**:
- ✓ Unlimited rate (filesystem)
- ✓ Preserves existing metadata
- ✓ Parses NFO files
- ✓ Extracts stream info via FFprobe
- ✗ No external data enrichment

## Rate Limiting

All providers implement rate limiting to respect API terms of service. Key points:

- **Adaptive Backoff**: Automatically slows requests on 429 (rate limit) errors
- **Circuit Breaker**: Opens after 5 consecutive failures, prevents cascading failures
- **Priority Support**: Webhook and user requests get burst capacity, background jobs throttled
- **Per-Provider Limits**: Each provider has dedicated rate limiter

See [RATE_LIMITING.md](./RATE_LIMITING.md) for complete documentation.

## Error Handling

### Common Provider Errors

| Error Type | Description | Resolution |
|------------|-------------|------------|
| `RateLimitError` | 429 response from provider | Automatic backoff, retry after delay |
| `AuthenticationError` | Invalid/expired API key | Check API key in Settings |
| `NetworkError` | Network timeout or connection failure | Check internet, provider status |
| `ProviderUnavailableError` | Circuit breaker open | Wait for automatic recovery |
| `ValidationError` | Invalid request parameters | Check entity IDs, request format |

### Circuit Breaker Behavior

- **Threshold**: 5 consecutive failures
- **Open Duration**: 5 minutes
- **Half-Open Test**: Allows 1 request after timeout
- **Close Condition**: 2 consecutive successes

When a circuit opens, enrichment jobs skip that provider and try the next in priority order.

## See Also

- [Rate Limiting](./RATE_LIMITING.md) - Comprehensive rate limiting documentation
- [Enrichment Phase](../phases/ENRICHMENT.md) - How providers are orchestrated
- [Asset Management](../architecture/ASSET_MANAGEMENT/README.md) - Asset tier system
- [Configuration](../getting-started/CONFIGURATION.md) - System-wide configuration
