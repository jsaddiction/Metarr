# FanArt.tv Implementation

High-quality curated artwork provider for clearlogos, disc art, and premium backgrounds.

## API Details

- **Base URL**: `https://webservice.fanart.tv/v3`
- **Auth**: Project API key (+ optional personal key)
- **Rate Limit**: 10 req/s (20 req/s with personal key)
- **Documentation**: https://fanarttv.docs.apiary.io/

## Unique Value

FanArt.tv provides:
- **Clearlogos**: Transparent movie/show logos
- **Clearart**: Transparent character art
- **Discart**: CD/DVD/Blu-ray disc images
- **Characterart**: Character cutouts (TV)
- **HD Options**: High-resolution versions available
- **Community-curated**: Quality-controlled artwork

## Authentication

Two-key system:

```
GET /movies/{tmdb_id}?api_key={project_key}&client_key={personal_key}
```

| Key Type | Rate Limit | Required |
|----------|------------|----------|
| Project Key | 10 req/s | Yes |
| Personal Key | 20 req/s | No (doubles rate) |

**Environment Variable**: `FANART_PERSONAL_KEY`

## Key Endpoints

### Movies (uses TMDB ID)

```
GET /movies/{tmdb_id}?api_key={key}

Returns all asset types:
- hdmovielogo / movielogo
- hdmovieclearart / movieclearart
- movieposter
- moviebackground / movieart
- moviebanner
- moviethumb
- moviedisc
```

### TV Shows (uses TVDB ID)

```
GET /tv/{tvdb_id}?api_key={key}

Returns all asset types:
- hdtvlogo / clearlogo
- hdclearart / clearart
- tvposter
- showbackground
- tvbanner
- tvthumb
- characterart
- seasonposter / seasonthumb
```

## Response Format

```json
{
  "name": "The Matrix",
  "tmdb_id": "603",
  "hdmovielogo": [
    {
      "id": "12345",
      "url": "https://assets.fanart.tv/fanart/movies/603/hdmovielogo/...",
      "lang": "en",
      "likes": "42"
    }
  ],
  "movieposter": [...],
  "moviedisc": [
    {
      "id": "67890",
      "url": "...",
      "lang": "en",
      "likes": "15",
      "disc": "1",
      "disc_type": "bluray"
    }
  ]
}
```

## Asset Type Normalization

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

## Data Mapping

```typescript
function mapToAssetCandidate(asset: FanArtImage, type: string): AssetCandidate {
  return {
    provider: 'fanart_tv',
    type: TYPE_MAPPING[type],
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

## Quality Indicators

### Likes

Community votes for quality:
```typescript
const score = baseScore + (asset.likes * 10);
```

### HD vs SD

```typescript
const isHD = assetType.startsWith('hd');
const score = isHD ? baseScore * 1.5 : baseScore;
```

### Language

```typescript
if (asset.lang === userLanguage) score += 100;
else if (asset.lang === '00') score += 50;  // Generic/no text
else if (asset.lang === 'en') score += 25;
```

### Disc Type Priority

```typescript
const typeOrder = ['4k', 'bluray3d', 'bluray', 'dvd'];
const discArt = assets.moviedisc.sort((a, b) =>
  typeOrder.indexOf(a.disc_type) - typeOrder.indexOf(b.disc_type)
);
```

## Quirks and Workarounds

### TMDB ID Required (Movies)

FanArt.tv uses TMDB IDs for movies:

```typescript
if (!movie.tmdb_id && movie.imdb_id) {
  const tmdbResult = await tmdbClient.find(movie.imdb_id, 'imdb_id');
  movie.tmdb_id = tmdbResult.movie_results[0]?.id;
}
const fanartAssets = await fanartClient.getMovieArt(movie.tmdb_id);
```

### TVDB ID Required (TV Shows)

```typescript
if (!series.tvdb_id && series.imdb_id) {
  const tvdbResult = await tvdbClient.searchByRemoteId(series.imdb_id);
  series.tvdb_id = tvdbResult.data[0]?.id;
}
const fanartAssets = await fanartClient.getTVArt(series.tvdb_id);
```

### Season Posters Embedded

Season posters included in series response:

```typescript
const seriesArt = await fanartClient.getTVArt(tvdbId);
const seasonPosters = seriesArt.seasonposter.filter(
  p => p.season === seasonNumber.toString()
);
```

### 404 = No Assets

Not an error, just no community artwork:

```typescript
try {
  const fanartAssets = await fanartClient.getMovieArt(tmdbId);
  if (fanartAssets.length === 0) {
    return await tmdbClient.getMovieImages(tmdbId);
  }
} catch (error) {
  if (error.statusCode === 404) {
    return await tmdbClient.getMovieImages(tmdbId);
  }
  throw error;
}
```

## Error Handling

| Status | Cause | Resolution |
|--------|-------|------------|
| 404 | No artwork (common) | Use fallback provider |
| 429 | Rate limit | Exponential backoff |
| 503 | Maintenance | Circuit breaker |

## Performance Tips

1. **Single Call**: One endpoint returns ALL asset types
2. **Cache Indefinitely**: Content rarely changes
3. **Personal Key**: Get one for 100+ item libraries
4. **Parallel Fetch**: Request alongside TMDB/TVDB

## Related Documentation

- [Provider Concepts](../../concepts/Enrichment/Providers/README.md)
- [Rate Limiting](../../concepts/Enrichment/Providers/RATE_LIMITING.md)
- [Official FanArt.tv API Docs](https://fanarttv.docs.apiary.io/)
