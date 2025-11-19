# FanArt.tv Provider

**Purpose**: High-quality curated artwork provider specializing in clearlogos, disc art, and premium backgrounds.

**Related Docs**:
- [Provider Overview](./OVERVIEW.md) - Provider comparison and capabilities
- [Rate Limiting](./RATE_LIMITING.md) - FanArt.tv-specific rate limits
- [Getting API Keys](./GETTING_API_KEYS.md) - How to get personal FanArt.tv API key

## Quick Reference

**Capabilities**:
- **Images Only**: No metadata, purely artwork
- **Unique Assets**: clearlogo, clearart, discart, characterart not available elsewhere
- **Curated Quality**: Community-driven quality control
- **HD Options**: Many assets available in HD resolutions

**API Details**:
- Base URL: `https://webservice.fanart.tv/v3`
- Auth: Project API key (+ optional personal key)
- Rate Limit: 10 req/s (20 req/s with personal key)
- Documentation: https://fanarttv.docs.apiary.io/

**Zero Config**: Embedded project API key included, no signup required.

## Supported Features

### Entity Types

| Type | Assets | Notes |
|------|--------|-------|
| Movie | ✓ | Full support |
| TV Series | ✓ | Full support |
| Season | Limited | Season posters via series |
| Music Artist | ✓ | Via TheAudioDB integration |

### Asset Types

**Movies**:
```
Asset Type     │ Description                      │ HD Available
───────────────┼──────────────────────────────────┼──────────────
clearlogo      │ Transparent movie logo           │ ✓ (hdmovielogo)
clearart       │ Transparent character art        │ ✓ (hdmovieclearart)
poster         │ Movie poster                     │ ✗
fanart         │ Background/backdrop              │ ✓ (moviebackground)
banner         │ Wide banner (758x140)            │ ✗
landscape      │ Landscape thumb (16:9)           │ ✗
discart        │ CD/DVD/Blu-ray art               │ ✗
```

**TV Shows**:
```
Asset Type     │ Description                      │ HD Available
───────────────┼──────────────────────────────────┼──────────────
clearlogo      │ Transparent show logo            │ ✓ (hdtvlogo)
clearart       │ Transparent character art        │ ✓ (hdclearart)
poster         │ Show poster                      │ ✗
fanart         │ Background/backdrop              │ ✗
banner         │ Wide banner (758x140)            │ ✗
landscape      │ Landscape thumb (16:9)           │ ✗
characterart   │ Character cutouts                │ ✗
seasonposter   │ Season-specific posters          │ ✗ (via series)
```

**Not Available**:
- episode_still (use TMDB or TVDB)
- season_poster as separate entity (included in series response)

## Key Endpoints Used

### Movies

**All Movie Art**:
```
GET /movies/{tmdb_id}?api_key={project_key}&client_key={personal_key}

Returns all asset types in single response:
- hdmovielogo / movielogo
- hdmovieclearart / movieclearart
- movieposter
- moviebackground / movieart
- moviebanner
- moviethumb
- moviedisc
```

### TV Shows

**All TV Art**:
```
GET /tv/{tvdb_id}?api_key={project_key}&client_key={personal_key}

Returns all asset types in single response:
- hdtvlogo / clearlogo
- hdclearart / clearart
- tvposter
- showbackground
- tvbanner
- tvthumb
- characterart
- seasonposter / seasonthumb
```

### Music (via TheAudioDB)

**Artist Art**:
```
GET /music/{musicbrainz_id}?api_key={project_key}&client_key={personal_key}

Returns:
- artistthumb
- artistbackground
- musiclogo / hdmusiclogo
- musicbanner
```

## Authentication

FanArt.tv uses a two-key system:

### Project API Key

**Embedded Key**:
```typescript
const PROJECT_KEY = process.env.FANART_PROJECT_KEY || 'embedded_project_key';
```

**Rate Limit**: 10 requests per second

**Usage**: Required for all requests
```
GET /movies/123?api_key={project_key}
```

### Personal API Key (Optional)

**Configuration**:
```bash
# Add to .env for personal key
FANART_PERSONAL_KEY=your_personal_key_here
```

**Rate Limit**: 20 requests per second (2x faster)

**Usage**: Added as `client_key` parameter
```
GET /movies/123?api_key={project_key}&client_key={personal_key}
```

**Benefits**:
- **2x Rate Limit**: 20 req/s vs 10 req/s
- **Priority Access**: New images available faster
- **Support Community**: Helps fund FanArt.tv

## Rate Limiting

### Official Limits

**Project Key**: 10 requests per second
**Personal Key**: 20 requests per second

### Metarr Configuration

```typescript
{
  requestsPerSecond: hasPersonalKey ? 2 : 1,
  burstCapacity: hasPersonalKey ? 10 : 5,
  windowSeconds: 1
}
```

**Why Slower Than Official**:
- Conservative to prevent 429 errors
- Project key shared across Metarr users
- API calls are cheap (single endpoint returns all assets)
- Quality over speed philosophy

### Best Practices

1. **Single Call Strategy**: One endpoint call returns all asset types
2. **Cache Aggressively**: FanArt.tv content rarely changes
3. **Personal Key Recommended**: If enriching large libraries
4. **Parallel Providers**: Fetch from FanArt.tv + TMDB + TVDB simultaneously

**Example Efficiency**:
```typescript
// Good: Single call for all assets
const allArt = await fanartClient.getMovieArt(tmdbId);
// Returns: logos, clearart, posters, fanart, banners, discs

// Bad: Multiple calls (not how FanArt.tv works anyway)
// FanArt.tv doesn't have per-type endpoints
```

See [RATE_LIMITING.md](./RATE_LIMITING.md) for complete rate limiting documentation.

## Data Mapping

### Response Format

FanArt.tv returns arrays of assets per type with metadata:

```json
{
  "name": "The Matrix",
  "tmdb_id": "603",
  "hdmovielogo": [
    {
      "id": "12345",
      "url": "https://assets.fanart.tv/fanart/movies/603/hdmovielogo/the-matrix-5b2c3f4d5e6f7.png",
      "lang": "en",
      "likes": "42",
      "disc": "0",
      "disc_type": ""
    }
  ],
  "movieposter": [
    {
      "id": "67890",
      "url": "https://assets.fanart.tv/fanart/movies/603/movieposter/the-matrix-5b2c3f4d5e6f8.jpg",
      "lang": "en",
      "likes": "28"
    }
  ]
}
```

### Asset Candidate Mapping

```typescript
function mapToAssetCandidate(asset: FanArtImage, type: string): AssetCandidate {
  return {
    provider: 'fanart_tv',
    type: normalizeAssetType(type), // e.g., 'hdmovielogo' → 'clearlogo'
    url: asset.url,
    language: asset.lang,
    metadata: {
      likes: parseInt(asset.likes) || 0,
      isHD: type.startsWith('hd'),
      discType: asset.disc_type || null
    }
  };
}
```

### Asset Type Normalization

```typescript
const TYPE_MAPPING = {
  // Movies
  'hdmovielogo': 'clearlogo',
  'movielogo': 'clearlogo',
  'hdmovieclearart': 'clearart',
  'movieclearart': 'clearart',
  'movieposter': 'poster',
  'moviebackground': 'fanart',
  'movieart': 'fanart',
  'moviebanner': 'banner',
  'moviethumb': 'landscape',
  'moviedisc': 'discart',

  // TV
  'hdtvlogo': 'clearlogo',
  'clearlogo': 'clearlogo',
  'hdclearart': 'clearart',
  'clearart': 'clearart',
  'tvposter': 'poster',
  'showbackground': 'fanart',
  'tvbanner': 'banner',
  'tvthumb': 'landscape',
  'characterart': 'characterart',
  'seasonposter': 'season_poster'
};
```

## Quality Indicators

FanArt.tv provides quality metadata to help selection:

### Likes

**Meaning**: Community votes for image quality
**Range**: 0 to unlimited
**Usage**: Higher likes = preferred candidate

```typescript
const score = baseScore + (asset.likes * 10); // Boost by likes
```

### HD vs SD

**HD Types**: `hdmovielogo`, `hdmovieclearart`, `hdtvlogo`, `hdclearart`, `moviebackground`
**SD Types**: `movielogo`, `movieclearart`, `clearlogo`, `clearart`, `movieart`

**Selection**: Prefer HD when available
```typescript
const isHD = assetType.startsWith('hd');
const score = isHD ? baseScore * 1.5 : baseScore;
```

### Language

**Supported**: `en`, `es`, `fr`, `de`, `it`, `pt`, `ja`, `ru`, etc.
**Special**: `00` = no language (generic/logo)

**Selection**: Prefer user's language, then generic (`00`), then English
```typescript
if (asset.lang === userLanguage) score += 100;
else if (asset.lang === '00') score += 50;
else if (asset.lang === 'en') score += 25;
```

## Quirks and Workarounds

### TMDB ID Required (Movies)

**Issue**: FanArt.tv uses TMDB IDs for movies, not IMDb IDs

**Solution**: Lookup TMDB ID first
```typescript
// If only IMDb ID available, lookup TMDB ID first
if (!movie.tmdb_id && movie.imdb_id) {
  const tmdbResult = await tmdbClient.find(movie.imdb_id, 'imdb_id');
  movie.tmdb_id = tmdbResult.movie_results[0]?.id;
}

const fanartAssets = await fanartClient.getMovieArt(movie.tmdb_id);
```

### TVDB ID Required (TV Shows)

**Issue**: FanArt.tv uses TVDB IDs for TV shows

**Solution**: Lookup TVDB ID first
```typescript
if (!series.tvdb_id && series.imdb_id) {
  const tvdbResult = await tvdbClient.searchByRemoteId(series.imdb_id);
  series.tvdb_id = tvdbResult.data[0]?.id;
}

const fanartAssets = await fanartClient.getTVArt(series.tvdb_id);
```

### Season Posters Embedded

**Issue**: Season posters included in series response, not separate endpoint

**Solution**: Extract season-specific assets
```typescript
const seriesArt = await fanartClient.getTVArt(tvdbId);

// Season posters have 'season' property
const seasonPosters = seriesArt.seasonposter.filter(
  p => p.season === seasonNumber.toString()
);
```

### Missing Assets

**Issue**: Not all movies/shows have FanArt.tv assets

**Solution**: Always have fallback provider
```typescript
try {
  const fanartAssets = await fanartClient.getMovieArt(tmdbId);
  if (fanartAssets.length === 0) {
    // Fallback to TMDB
    return await tmdbClient.getMovieImages(tmdbId);
  }
} catch (error) {
  // 404 from FanArt.tv = no assets, use fallback
  return await tmdbClient.getMovieImages(tmdbId);
}
```

### Disc Art Variations

**Issue**: Multiple disc types (DVD, Blu-ray, 3D Blu-ray, 4K)

**Solution**: Prefer highest quality, allow user selection
```typescript
const discArt = assets.moviedisc.sort((a, b) => {
  const typeOrder = ['4k', 'bluray3d', 'bluray', 'dvd'];
  return typeOrder.indexOf(a.disc_type) - typeOrder.indexOf(b.disc_type);
});
```

## Error Handling

### Common Errors

**404 Not Found**:
- Movie/show has no FanArt.tv assets (common)
- Invalid TMDB/TVDB ID
- Fallback to other providers

**429 Too Many Requests**:
- Rate limit exceeded
- Exponential backoff automatic
- Consider personal API key

**503 Service Unavailable**:
- FanArt.tv maintenance
- Circuit breaker opens after 5 failures
- Fallback to TMDB/TVDB

### Retry Strategy

```typescript
try {
  const assets = await fanartClient.getMovieArt(tmdbId);
  return assets;
} catch (error) {
  if (error.statusCode === 404) {
    // No assets, not an error - return empty
    return [];
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

Configure in Settings → Providers → FanArt.tv:

```json
{
  "enabled": true,
  "projectKey": "embedded_key",
  "personalKey": "your_personal_key",
  "preferHD": true,
  "minimumLikes": 5
}
```

### Environment Variables

```bash
# Optional personal API key (doubles rate limit)
FANART_PERSONAL_KEY=your_personal_key_here

# Override base URL (for testing)
FANART_BASE_URL=https://webservice.fanart.tv/v3
```

## Provider Priority

FanArt.tv is typically prioritized as:
1. **Quality First**: 1st (highest quality artwork)
2. **Speed First**: 3rd (slower rate limit)
3. **TMDB Primary**: 2nd (after TMDB)
4. **TVDB Primary**: 2nd (after TVDB)

**Why Quality First Default**:
- Curated, community-vetted assets
- Unique asset types unavailable elsewhere
- HD options for logos and clearart
- Worth the slower rate limit for visual quality

See [Provider Overview](./OVERVIEW.md) for complete priority preset details.

## Performance Tips

1. **Single Call**: Always fetch all asset types in one request
2. **Cache Indefinitely**: FanArt.tv assets rarely change
3. **Personal Key**: If enriching 100+ items, get personal key
4. **Parallel Fetch**: Request FanArt.tv + TMDB + TVDB simultaneously
5. **Fallback Fast**: 404 is common, have fallback ready

## Getting a Personal API Key

See [GETTING_API_KEYS.md](./GETTING_API_KEYS.md) for step-by-step instructions.

**Quick Steps**:
1. Visit https://fanart.tv/get-an-api-key/
2. Fill out request form (name, email, app description)
3. Wait for approval email (usually 1-2 days)
4. Add key to `.env`: `FANART_PERSONAL_KEY=your_key`

**Note**: FanArt.tv is community-driven. Consider donating if you use it heavily.

## See Also

- [Provider Overview](./OVERVIEW.md) - All provider capabilities
- [Rate Limiting](./RATE_LIMITING.md) - Rate limiting details
- [TMDB Provider](./TMDB.md) - Metadata + fallback images
- [TVDB Provider](./TVDB.md) - TV metadata + fallback images
- [Enrichment Phase](../phases/ENRICHMENT.md) - How FanArt.tv fits in enrichment
- [Official FanArt.tv API Docs](https://fanarttv.docs.apiary.io/) - Complete API reference
