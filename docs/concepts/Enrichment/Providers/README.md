# Provider Concepts

Providers are external APIs and local sources that supply metadata and assets during enrichment.

## Provider Architecture

```
ENRICHMENT JOB
      │
      ├──► Provider Manager
      │         │
      │         ├──► Rate Limiter (per provider)
      │         ├──► Circuit Breaker (fault tolerance)
      │         └──► Priority Queue (burst for webhooks)
      │
      └──► Parallel Fetch (respecting rate limits)
                │
                ├──► TMDB (movies, TV)
                ├──► TVDB (TV shows)
                ├──► OMDb (ratings)
                ├──► FanArt.tv (artwork)
                ├──► MusicBrainz (music)
                └──► Local (NFO, existing files)
```

## Provider Categories

| Category | Purpose | Examples |
|----------|---------|----------|
| **Metadata** | Title, plot, cast, ratings | TMDB, TVDB, OMDb, MusicBrainz |
| **Images** | Posters, fanart, logos | FanArt.tv |
| **Both** | Metadata + images | TMDB, TVDB, Local |

## Supported Providers

### Movies & TV Shows

| Provider | Category | Auth | Rate Limit | Unique Value |
|----------|----------|------|------------|--------------|
| **TMDB** | Both | Bearer (optional) | 40 req/10s | Comprehensive metadata, trailers |
| **TVDB** | Both | JWT (optional) | 30 req/10s | Best TV show data |
| **OMDb** | Metadata | API Key | 1k/day (100k paid) | IMDb ratings, RT, Metacritic |
| **FanArt.tv** | Images | API Key (optional) | 10-20 req/s | Clearlogos, discart, HD artwork |
| **Local** | Both | None | Unlimited | NFO parsing, existing assets |

### Music

| Provider | Category | Auth | Rate Limit | Unique Value |
|----------|----------|------|------------|--------------|
| **MusicBrainz** | Metadata | User-Agent | 1 req/s (strict) | Open music database |
| **TheAudioDB** | Both | API Key | 30 req/60s | Artist/album artwork |

## Zero Configuration

Metarr includes embedded API keys for: TMDB, TVDB, FanArt.tv

**No signup required for development**. Personal keys are optional and provide:
- Usage tracking on your account
- Supporting provider communities
- Higher rate limits (FanArt.tv, OMDb)

## Provider Capabilities

### Asset Types by Provider

**Movies**:
```
Asset Type    │ TMDB │ FanArt.tv │ Local │ OMDb
──────────────┼──────┼───────────┼───────┼──────
poster        │  ✓   │     ✓     │   ✓   │  ✓*
fanart        │  ✓   │     ✓     │   ✓   │  ✗
banner        │  ✗   │     ✓     │   ✓   │  ✗
clearlogo     │  ✗   │     ✓     │   ✓   │  ✗
clearart      │  ✗   │     ✓     │   ✓   │  ✗
discart       │  ✗   │     ✓     │   ✓   │  ✗
landscape     │  ✓   │     ✓     │   ✓   │  ✗
trailer       │  ✓   │     ✗     │   ✗   │  ✗

* OMDb posters are 300px (low resolution)
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
- **OMDb**: IMDb rating/votes, Rotten Tomatoes, Metacritic, awards, plot outline
- **Local**: All fields from NFO files + stream info from FFprobe

**TV Shows**:
- **TVDB**: title, plot, aired dates, status, ratings, network, cast
- **TMDB**: title, plot, ratings, genres, cast, crew
- **Local**: All fields from NFO files + stream info

## Selection Strategies

### Priority Presets

1. **Quality First** (Default)
   - Order: FanArt.tv → TMDB → TVDB → Local
   - Best for: Users who want best-looking artwork

2. **Speed First**
   - Order: TMDB → TVDB → FanArt.tv → Local
   - Best for: Large libraries, fast enrichment

3. **TMDB Primary**
   - Order: TMDB → FanArt.tv → TVDB → Local
   - Best for: TMDB enthusiasts

4. **TVDB Primary**
   - Order: TVDB → TMDB → FanArt.tv → Local
   - Best for: TV-focused libraries

### Selection Process

1. **Candidate Fetching**: Fetch assets from all enabled providers in parallel
2. **Scoring**: Score candidates by dimensions, language, votes, provider priority
3. **User Selection**: Present top candidates for manual selection
4. **Auto-Selection**: If enabled, choose highest-scored candidate
5. **Fallback**: If primary provider fails, try next in priority order

## Rate Limiting

### Rate Limit Summary

```
Provider      │ Limit          │ Burst │ Priority Support
──────────────┼────────────────┼───────┼──────────────────
TMDB          │ 40 req/10s     │ 40    │ Yes
TVDB          │ 30 req/10s     │ 50    │ Yes
FanArt.tv     │ 10-20 req/s    │ 50    │ Yes
MusicBrainz   │ 1 req/s        │ 1     │ No (strict)
OMDb          │ 1k-100k/day    │ N/A   │ No
Local         │ Unlimited      │ N/A   │ N/A
```

### Request Priorities

- **webhook**: Highest priority, uses burst capacity
- **user**: High priority, uses burst capacity
- **background**: Normal priority, respects standard limits

See [Rate Limiting](./RATE_LIMITING.md) for detailed documentation.

## Circuit Breaker Pattern

Prevents cascading failures when providers are down:

```
CLOSED (Normal)
  ├─ All requests allowed
  ├─ Failures tracked
  └─ 5 consecutive failures → OPEN

OPEN (Failing)
  ├─ All requests rejected immediately
  └─ After 5 minutes → HALF_OPEN

HALF_OPEN (Testing)
  ├─ Test request allowed
  ├─ Success → CLOSED
  └─ Failure → OPEN
```

## Error Handling

| Error Type | Description | Resolution |
|------------|-------------|------------|
| `RateLimitError` | 429 response | Automatic exponential backoff |
| `AuthenticationError` | Invalid API key | Check configuration |
| `NetworkError` | Timeout/connection failure | Retry with backoff |
| `ProviderUnavailableError` | Circuit breaker open | Wait for recovery |

When a circuit opens, enrichment jobs skip that provider and try the next in priority order.

## Implementation Details

For provider-specific API details, data mapping, and quirks:

| Provider | Implementation Doc |
|----------|-------------------|
| TMDB | [implementation/Providers/TMDB.md](../../../implementation/Providers/TMDB.md) |
| TVDB | [implementation/Providers/TVDB.md](../../../implementation/Providers/TVDB.md) |
| OMDb | [implementation/Providers/OMDB.md](../../../implementation/Providers/OMDB.md) |
| FanArt.tv | [implementation/Providers/FANART.md](../../../implementation/Providers/FANART.md) |
| MusicBrainz | [implementation/Providers/MUSICBRAINZ.md](../../../implementation/Providers/MUSICBRAINZ.md) |
| Local | [implementation/Providers/LOCAL.md](../../../implementation/Providers/LOCAL.md) |

## Related Documentation

- [Enrichment Overview](../README.md) - How providers integrate with enrichment
- [Scraping](../SCRAPING/README.md) - Provider orchestration during scraping
- [Rate Limiting](./RATE_LIMITING.md) - Detailed rate limiting documentation
