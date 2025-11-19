# Fanart.tv Provider

**API Version**: v3
**Documentation**: https://fanarttv.docs.apiary.io/

## Overview

Fanart.tv specializes in high-quality artwork including clearlogos, disc art, and HD backgrounds. It complements TMDB/TVDB with specialized artwork types not available elsewhere.

## Configuration

```typescript
interface FanartConfig {
  apiKey: string;              // Optional (default provided)
  clientKey?: string;          // Optional personal key
  baseUrl: 'http://webservice.fanart.tv/v3';
}
```

## Rate Limiting

- **Project Key**: 10 requests per second
- **Personal Key**: 20 requests per second
- **No daily limits**

```typescript
class FanartRateLimiter {
  private readonly maxPerSecond: number;
  private tokens: number;
  private lastRefill: number;

  constructor(hasPersonalKey: boolean) {
    this.maxPerSecond = hasPersonalKey ? 20 : 10;
    this.tokens = this.maxPerSecond;
    this.lastRefill = Date.now();
  }

  async throttle(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRefill;

    // Refill tokens based on time elapsed
    const tokensToAdd = Math.floor(elapsed / 1000 * this.maxPerSecond);
    this.tokens = Math.min(this.maxPerSecond, this.tokens + tokensToAdd);
    this.lastRefill = now;

    if (this.tokens <= 0) {
      // Wait for next token
      await sleep(1000 / this.maxPerSecond);
      this.tokens = 1;
    }

    this.tokens--;
  }
}
```

## Key Endpoints

### Movies

```typescript
// Get movie artwork
GET /movies/{tmdb_id}?api_key={api_key}
Response: {
  tmdbid: string,
  imdbid: string,
  name: string,
  hdmovielogo: [{
    id: string,
    url: string,
    lang: string,
    likes: string
  }],
  hdmovieclearart: [...],
  movieposter: [...],
  moviebackground: [...],
  moviedisc: [...],
  moviebanner: [...],
  moviethumb: [...]
}
```

### TV Shows

```typescript
// Get TV show artwork
GET /tv/{tvdb_id}?api_key={api_key}
Response: {
  tvdbid: string,
  name: string,
  hdtvlogo: [...],
  hdclearart: [...],
  tvposter: [...],
  showbackground: [...],
  tvbanner: [...],
  seasonposter: [...],
  seasonbanner: [...],
  seasonthumb: [...]
}
```

## Artwork Types

```typescript
interface FanartTypes {
  // Movies
  hdmovielogo: ClearLogo;       // HD transparent logo
  hdmovieclearart: ClearArt;    // HD transparent character art
  movieposter: Poster;           // Standard poster
  moviebackground: Fanart;       // HD backgrounds
  moviedisc: DiscArt;           // CD/DVD/Blu-ray art
  moviebanner: Banner;          // Wide banners
  moviethumb: Thumb;            // Landscape thumbs

  // TV Shows
  hdtvlogo: ClearLogo;          // HD show logo
  hdclearart: ClearArt;         // Character art
  tvposter: Poster;             // Show poster
  showbackground: Fanart;       // Show backgrounds
  tvbanner: Banner;             // Show banner
  seasonposter: SeasonPoster;   // Season-specific posters
  seasonbanner: SeasonBanner;   // Season-specific banners
}

function mapFanartType(type: string): AssetType {
  const typeMap = {
    hdmovielogo: 'logo',
    hdtvlogo: 'logo',
    hdmovieclearart: 'clearart',
    hdclearart: 'clearart',
    movieposter: 'poster',
    tvposter: 'poster',
    moviebackground: 'fanart',
    showbackground: 'fanart',
    moviedisc: 'disc',
    moviebanner: 'banner',
    tvbanner: 'banner'
  };
  return typeMap[type] || 'other';
}
```

## Data Processing

```typescript
function processFanartResponse(data: FanartResponse): AssetCandidate[] {
  const candidates: AssetCandidate[] = [];

  // Process each artwork type
  for (const [type, items] of Object.entries(data)) {
    if (Array.isArray(items)) {
      for (const item of items) {
        candidates.push({
          asset_type: mapFanartType(type),
          provider: 'fanart.tv',
          provider_id: item.id,
          url: item.url,
          language: item.lang || null,
          vote_count: parseInt(item.likes) || 0,

          // Fanart.tv doesn't provide dimensions
          // Must fetch image to get size
          width: null,
          height: null,

          // Calculate score
          score: scoreFanartImage(item, type)
        });
      }
    }
  }

  return candidates;
}
```

## Asset Scoring

```typescript
function scoreFanartImage(item: FanartItem, type: string): number {
  let score = 0;

  // Community likes (0-30 points)
  const likes = parseInt(item.likes) || 0;
  score += Math.min(30, likes * 3);

  // Language preference (0-20 points)
  if (!item.lang || item.lang === '') {
    score += 20; // No text, universal
  } else if (item.lang === config.language) {
    score += 15; // Matches preference
  }

  // Type-specific bonuses
  if (type.includes('hd')) {
    score += 25; // HD quality bonus
  }

  if (type.includes('logo') || type.includes('clearart')) {
    score += 20; // Unique artwork types
  }

  // Disc art for physical media
  if (type === 'moviedisc') {
    score += 10; // Specialized content
  }

  return score;
}
```

## Image Dimensions

Since Fanart.tv doesn't provide dimensions, fetch on demand:

```typescript
async function getFanartImageDimensions(url: string): Promise<Dimensions> {
  try {
    // Download image headers only
    const response = await fetch(url, { method: 'HEAD' });

    // Try to get from headers (not always available)
    const width = response.headers.get('X-Image-Width');
    const height = response.headers.get('X-Image-Height');

    if (width && height) {
      return {
        width: parseInt(width),
        height: parseInt(height)
      };
    }

    // Fall back to downloading and measuring
    const buffer = await downloadImage(url);
    const metadata = await sharp(buffer).metadata();

    return {
      width: metadata.width,
      height: metadata.height
    };

  } catch (error) {
    logger.warn('Failed to get dimensions for Fanart.tv image', { url });
    return { width: 0, height: 0 };
  }
}
```

## Error Handling

```typescript
class FanartProvider {
  async fetchMovieArtwork(tmdbId: number): Promise<FanartResponse> {
    try {
      const url = `${this.baseUrl}/movies/${tmdbId}`;
      const params = new URLSearchParams({
        api_key: this.apiKey
      });

      if (this.clientKey) {
        params.append('client_key', this.clientKey);
      }

      const response = await fetch(`${url}?${params}`);

      if (response.status === 404) {
        // No artwork available
        return {};
      }

      if (response.status === 503) {
        // Service temporarily unavailable
        await sleep(5000);
        return this.fetchMovieArtwork(tmdbId);
      }

      if (!response.ok) {
        throw new ProviderError(`Fanart.tv error: ${response.statusText}`);
      }

      const data = await response.json();

      // Empty response means no artwork
      if (!data || Object.keys(data).length === 0) {
        return {};
      }

      return data;

    } catch (error) {
      // Fanart.tv is supplemental, don't fail enrichment
      logger.warn('Fanart.tv fetch failed', { tmdbId, error });
      return {};
    }
  }
}
```

## Caching Strategy

```typescript
interface FanartCache {
  // Cache responses for 7 days
  RESPONSE_TTL: 604800;

  // Cache "no artwork" responses too
  EMPTY_RESPONSE_TTL: 86400;

  // URLs never change
  URL_TTL: null;
}

async function getCachedOrFetch(tmdbId: number): Promise<FanartResponse> {
  const cached = await db('provider_cache')
    .where({
      provider: 'fanart.tv',
      entity_id: tmdbId
    })
    .where('expires_at', '>', new Date())
    .first();

  if (cached) {
    return JSON.parse(cached.response);
  }

  const data = await fanart.fetchMovieArtwork(tmdbId);

  // Cache even empty responses
  await db('provider_cache').insert({
    provider: 'fanart.tv',
    entity_id: tmdbId,
    response: JSON.stringify(data),
    cached_at: new Date(),
    expires_at: Object.keys(data).length > 0
      ? addDays(new Date(), 7)
      : addDays(new Date(), 1)
  });

  return data;
}
```

## Unique Assets

Fanart.tv provides unique asset types:

```typescript
interface UniqueAssets {
  clearlogo: {
    description: 'Transparent show/movie logo',
    usage: 'Overlay on fanart',
    preferred_size: '800x310'
  },

  clearart: {
    description: 'Transparent character art',
    usage: 'Decorative overlay',
    preferred_size: '1000x562'
  },

  discart: {
    description: 'CD/DVD/Blu-ray disc art',
    usage: 'Physical media representation',
    preferred_size: '1000x1000'
  },

  moviethumb: {
    description: 'Landscape thumbnail',
    usage: 'Wide format displays',
    preferred_size: '1000x562'
  }
}
```

## Best Practices

1. **Use personal API key** for 2x rate limit
2. **Cache aggressively** - Artwork rarely changes
3. **Fetch dimensions lazily** - Only when needed
4. **Handle missing artwork gracefully** - Not all media has Fanart.tv content
5. **Prioritize HD variants** when available
6. **Combine with TMDB/TVDB** for complete coverage

## Integration Example

```typescript
async function enrichMovieArtwork(movie: Movie): Promise<void> {
  // Get base artwork from TMDB
  const tmdbArtwork = await tmdb.fetchMovieImages(movie.tmdb_id);

  // Supplement with Fanart.tv
  const fanartData = await fanart.fetchMovieArtwork(movie.tmdb_id);

  // Combine candidates
  const candidates = [
    ...processTMDBImages(tmdbArtwork),
    ...processFanartImages(fanartData)
  ];

  // Store all candidates
  await db('asset_candidates').insert(candidates);

  // Select best of each type
  const poster = selectBestAsset(candidates, 'poster');
  const fanart = selectBestAsset(candidates, 'fanart');
  const logo = selectBestAsset(candidates, 'logo');

  // Update movie
  await db('movies').update({
    poster_id: poster?.id,
    fanart_id: fanart?.id,
    logo_id: logo?.id
  });
}
```

## Related Documentation

- [Enrichment Phase](../phases/ENRICHMENT.md) - How Fanart.tv is used
- [Provider Overview](OVERVIEW.md) - Provider system architecture
- [Database Schema](../DATABASE.md) - Provider cache tables