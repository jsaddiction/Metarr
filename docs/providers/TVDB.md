# TVDB Provider

**Purpose**: TheTVDB integration for comprehensive TV show, season, and episode metadata and artwork.

**Related Docs**:
- [Provider Overview](./OVERVIEW.md) - Provider comparison and capabilities
- [Rate Limiting](./RATE_LIMITING.md) - TVDB-specific rate limits
- [Getting API Keys](./GETTING_API_KEYS.md) - How to get personal TVDB API key

## Quick Reference

**Capabilities**:
- TV Shows: title, plot, air dates, status, network, ratings, cast, genres
- Seasons: posters, air dates, episode count
- Episodes: title, plot, still images, air dates, ratings
- Assets: poster, fanart, banner, season poster, episode still

**API Details**:
- Base URL: `https://api4.thetvdb.com/v4`
- Image Base: `https://artworks.thetvdb.com`
- Auth: JWT token (24-hour expiry)
- Rate Limit: ~100 req/10s (conservative: 30 req/10s)
- Documentation: https://thetvdb.github.io/v4-api/

**Zero Config**: Embedded API key included, no signup required.

## Supported Features

### Entity Types

| Type | Search | Metadata | Assets | Notes |
|------|--------|----------|--------|-------|
| TV Series | ✓ | ✓ | ✓ | Full support |
| Season | ✓ | ✓ | ✓ | Via series |
| Episode | ✓ | ✓ | ✓ | Via series |
| Movie | ✓ | Limited | ✓ | Weak movie support |

### Metadata Fields

**TV Series**:
- **Core**: title, originalTitle, plot (overview), slug
- **Air Dates**: firstAired, lastAired, status
- **Media**: averageRuntime, network, country
- **Classification**: genres, certification
- **People**: cast (actors), characters
- **Ratings**: rating, voteCount
- **External IDs**: imdbId, tmdbId, zap2itId

**Seasons**:
- **Core**: seasonNumber, name, overview
- **Media**: episodeCount, aired episodes
- **Assets**: season posters

**Episodes**:
- **Core**: title, overview, episodeNumber, seasonNumber
- **Air Dates**: aired
- **Media**: runtime
- **Ratings**: rating
- **Assets**: episode stills

### Asset Types

**Available**:
- **poster**: Series posters (2:3 aspect ratio)
- **fanart**: Series fanart/backgrounds (16:9)
- **banner**: Series and season banners (758x140)
- **clearlogo**: Series logos (transparent)
- **season_poster**: Season-specific posters
- **episode_still**: Episode screenshots

**Not Available**:
- clearart, discart (use FanArt.tv)
- characterart (use FanArt.tv)

**Image Types (TVDB terminology)**:
```
Type ID │ Name            │ Metarr Equivalent
────────┼─────────────────┼───────────────────
2       │ Series Poster   │ poster
3       │ Banner          │ banner
6       │ Fanart          │ fanart
7       │ Season Poster   │ season_poster
8       │ Episode Still   │ episode_still
14      │ ClearLogo       │ clearlogo
```

## Authentication

TVDB v4 uses JWT authentication with 24-hour token expiry.

### Token Lifecycle

```typescript
class TVDBAuth {
  private token: string | null = null;
  private tokenExpiry: Date | null = null;

  async getToken(): Promise<string> {
    // Check if token exists and is valid
    if (this.token && this.tokenExpiry) {
      const now = new Date();
      const bufferHours = 2; // Refresh 2 hours before expiry

      if (now < addHours(this.tokenExpiry, -bufferHours)) {
        return this.token;
      }
    }

    // Authenticate and get new token
    await this.authenticate();
    return this.token!;
  }

  private async authenticate(): Promise<void> {
    const response = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apikey: this.apiKey,
        pin: this.pin // Optional user PIN
      })
    });

    const data = await response.json();
    this.token = data.data.token;

    // Token expires in 24 hours
    this.tokenExpiry = addHours(new Date(), 24);
  }
}
```

### Request Headers

```typescript
const headers = {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
};
```

### Configuration

**Embedded Key**:
```typescript
const DEFAULT_TVDB_KEY = process.env.TVDB_API_KEY || 'embedded_key';
```

**Personal Key**:
```bash
# Add to .env for personal key
TVDB_API_KEY=your_personal_api_key_here
```

**Benefits of Personal Key**:
- Usage tracking on your account
- Support TVDB community
- Same rate limits (not increased)
- Subscriber perks if you're a TVDB subscriber

## Key Endpoints Used

### Authentication

```
POST /login
Body: { "apikey": "key", "pin": "optional_pin" }
Returns: { "data": { "token": "jwt_token" } }
```

### Search

**Series Search**:
```
GET /search?query={title}&type=series&year={year}
```

**Search with Remote ID**:
```
GET /search/remoteid/{imdb_id}
```

### Metadata

**Series Extended**:
```
GET /series/{tvdb_id}/extended
Returns: All metadata + seasons + episodes
```

**Season Extended**:
```
GET /seasons/{season_id}/extended
Returns: Season details + episodes
```

**Episode Extended**:
```
GET /episodes/{episode_id}/extended
Returns: Episode details + translations
```

### Images

**Series Artworks**:
```
GET /series/{tvdb_id}/artworks?type={type_id}
Returns: Artwork URLs by type
```

**All Artworks** (single call):
```
GET /series/{tvdb_id}/artworks
Returns: All artwork types
```

## Rate Limiting

**Official Limit**: ~100 requests per 10 seconds (undocumented)

**Conservative Metarr Configuration**:
```typescript
{
  requestsPerSecond: 10,
  burstCapacity: 50,
  windowSeconds: 10
}
```

**Why Conservative**:
- Exact limit not documented
- Embedded key shared across Metarr users
- Prevents 429 errors
- Sufficient for typical usage

**Best Practices**:
1. **Use extended endpoints**: Get all data in one call
2. **Fetch all artworks**: Single call instead of per-type
3. **Cache tokens**: 24-hour expiry, no need to re-auth frequently
4. **Batch seasons**: Extended endpoint includes all seasons

**Example Efficiency**:
```typescript
// Good: Single extended call
GET /series/12345/extended
// Returns: series + seasons + episodes

// Bad: Multiple calls
GET /series/12345
GET /series/12345/seasons
GET /seasons/67890/episodes
```

See [RATE_LIMITING.md](./RATE_LIMITING.md) for complete rate limiting documentation.

## Quirks and Workarounds

### Language Codes

**Issue**: TVDB uses 3-letter ISO 639-2 codes (e.g., `eng`), not 2-letter ISO 639-1 (e.g., `en`)

**Solution**: Map language codes
```typescript
const languageMap = {
  'en': 'eng',
  'es': 'spa',
  'fr': 'fra',
  'de': 'deu',
  'ja': 'jpn'
};

const tvdbLanguage = languageMap[isoLanguage] || 'eng';
```

### Absolute vs Aired Episode Numbers

**Issue**: TVDB tracks both aired order and absolute order (for anime)

**Solution**: Use appropriate order based on content type
```typescript
const episodeNumber = series.type === 'anime'
  ? episode.absoluteNumber || episode.airedEpisodeNumber
  : episode.airedEpisodeNumber;
```

### Artwork Type IDs

**Issue**: TVDB uses numeric type IDs, not semantic names

**Solution**: Maintain type mapping
```typescript
const ARTWORK_TYPES = {
  2: 'poster',
  3: 'banner',
  6: 'fanart',
  7: 'season_poster',
  8: 'episode_still',
  14: 'clearlogo'
};
```

### Multiple Networks

**Issue**: Shows can have multiple networks (syndication, co-production)

**Solution**: Use primary network (first in array)
```typescript
const network = series.networks?.[0]?.name || 'Unknown';
```

### Season 0 (Specials)

**Issue**: Season 0 contains specials, pilots, behind-the-scenes

**Handling**: Include by default but allow filtering
```typescript
const regularSeasons = seasons.filter(s => s.number > 0);
const specials = seasons.find(s => s.number === 0);
```

### Air Date Precision

**Issue**: Some episodes have year-only or month-only air dates

**Solution**: Handle partial dates gracefully
```typescript
// TVDB returns: "2023-05-00" or "2023-00-00"
const airDate = episode.aired || null;
const year = airDate ? parseInt(airDate.split('-')[0]) : null;
```

## Error Handling

### Common Errors

**401 Unauthorized**:
- Expired JWT token (auto-refresh)
- Invalid API key (check configuration)
- PIN required but not provided

**404 Not Found**:
- Invalid TVDB ID
- Series deleted/removed from TVDB
- Try search by name or external ID

**429 Too Many Requests**:
- Rate limit exceeded
- Automatic exponential backoff
- Reduce concurrent requests

**503 Service Unavailable**:
- TVDB server maintenance
- Circuit breaker opens after 5 failures
- Fallback to TMDB

### Retry Strategy

```typescript
try {
  let token = await this.getToken();
  const response = await tvdbClient.getSeries(tvdbId, token);
  return response;
} catch (error) {
  if (error.statusCode === 401) {
    // Token expired, refresh and retry
    this.token = null;
    token = await this.getToken();
    return await tvdbClient.getSeries(tvdbId, token);
  } else if (error.statusCode === 429) {
    // Rate limit, exponential backoff
    await exponentialBackoff(attempt);
    // Retry up to 5 times
  }
  throw error;
}
```

## Configuration

### Provider Settings

Configure in Settings → Providers → TVDB:

```json
{
  "enabled": true,
  "apiKey": "your_personal_key",
  "pin": "optional_subscriber_pin",
  "language": "eng",
  "includeSpecials": true
}
```

### Environment Variables

```bash
# Optional personal API key
TVDB_API_KEY=your_api_key_here

# Optional subscriber PIN
TVDB_PIN=your_pin_here

# Override base URL (for testing)
TVDB_BASE_URL=https://api4.thetvdb.com/v4
```

## Data Mapping

### Series Metadata Mapping

```typescript
{
  // Core fields
  title: data.name,
  originalTitle: data.originalName,
  plot: data.overview,
  slug: data.slug,

  // Air dates
  firstAired: data.firstAired,
  lastAired: data.lastAired,
  status: data.status.name, // e.g., "Continuing", "Ended"

  // Media info
  averageRuntime: data.averageRuntime,
  network: data.networks?.[0]?.name,
  country: data.originalCountry,

  // Classification
  genres: data.genres.map(g => g.name),
  certification: data.contentRating,

  // People
  actors: data.characters.slice(0, 20),

  // External IDs
  externalIds: {
    imdb: data.remoteIds.find(r => r.sourceName === 'IMDB')?.id,
    tmdb: data.remoteIds.find(r => r.sourceName === 'TheMovieDB.com')?.id
  }
}
```

### Episode Metadata Mapping

```typescript
{
  title: episode.name,
  plot: episode.overview,
  episodeNumber: episode.number,
  seasonNumber: episode.seasonNumber,
  aired: episode.aired,
  runtime: episode.runtime,
  rating: episode.airsAfterSeason,

  // TVDB-specific
  absoluteNumber: episode.absoluteNumber, // For anime
  productionCode: episode.productionCode
}
```

## Provider Priority

TVDB is typically prioritized as:
1. **Quality First**: 3rd (after FanArt.tv, TMDB)
2. **Speed First**: 2nd (after TMDB)
3. **TMDB Primary**: 3rd (for TV shows)
4. **TVDB Primary**: 1st (by definition)

See [Provider Overview](./OVERVIEW.md) for complete priority preset details.

## Performance Tips

1. **Use extended endpoints**: Reduce API calls by 70%
2. **Fetch all artworks**: Single call for all types
3. **Cache tokens**: 24-hour validity, minimal re-authentication
4. **Store TVDB IDs**: Direct lookup faster than search
5. **Batch series updates**: Process multiple shows in parallel

## Getting a Personal API Key

See [GETTING_API_KEYS.md](./GETTING_API_KEYS.md) for step-by-step instructions.

**Quick Steps**:
1. Create account at https://thetvdb.com/
2. Navigate to Dashboard → API Access
3. Create new API key
4. Add key to `.env`: `TVDB_API_KEY=your_key`
5. Optional: Add subscriber PIN for premium features

## See Also

- [Provider Overview](./OVERVIEW.md) - All provider capabilities
- [Rate Limiting](./RATE_LIMITING.md) - Rate limiting details
- [TMDB Provider](./TMDB.md) - Movie/TV alternative
- [Enrichment Phase](../phases/ENRICHMENT.md) - How TVDB fits in enrichment
- [Official TVDB API Docs](https://thetvdb.github.io/v4-api/) - Complete API reference
