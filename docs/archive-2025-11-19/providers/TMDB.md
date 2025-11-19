# TMDB Provider

**API Version**: v3
**Documentation**: https://developers.themoviedb.org/3

## Overview

The Movie Database (TMDB) is the primary metadata provider for movies and TV shows. It provides comprehensive metadata, cast/crew information, and high-quality artwork.

## Configuration

```typescript
interface TMDBConfig {
  apiKey: string;              // Required (default provided)
  baseUrl: 'https://api.themoviedb.org/3';
  imageBaseUrl: 'https://image.tmdb.org/t/p/';
  language: 'en-US';           // Default language
  region?: string;             // Optional region code
  adult: false;                // Include adult content
}
```

## Rate Limiting

- **Default**: 40 requests per 10 seconds
- **With User Key**: Same limit but tracked to your account
- **429 Handling**: Exponential backoff starting at 10 seconds

```typescript
class TMDBRateLimiter {
  private requestCount = 0;
  private windowStart = Date.now();
  private backoffMultiplier = 1;

  async throttle(): Promise<void> {
    const now = Date.now();
    const windowAge = now - this.windowStart;

    if (windowAge > 10000) {
      // Reset window
      this.requestCount = 0;
      this.windowStart = now;
      this.backoffMultiplier = 1;
    }

    if (this.requestCount >= 40) {
      // Wait until window resets
      const waitTime = 10000 - windowAge;
      await sleep(waitTime);
      this.requestCount = 0;
      this.windowStart = Date.now();
    }

    this.requestCount++;
  }

  handle429(retryAfter?: number): Promise<void> {
    const wait = (retryAfter || 10) * 1000 * this.backoffMultiplier;
    this.backoffMultiplier *= 2;
    return sleep(wait);
  }
}
```

## Key Endpoints

### Movies

```typescript
// Search movies
GET /search/movie?query={query}&year={year}
Response: {
  results: [{
    id: number,
    title: string,
    release_date: string,
    poster_path: string
  }]
}

// Get movie details
GET /movie/{id}?append_to_response=credits,images,videos
Response: {
  id: number,
  title: string,
  overview: string,
  release_date: string,
  runtime: number,
  vote_average: number,
  poster_path: string,
  backdrop_path: string,
  credits: { cast: [], crew: [] },
  images: { posters: [], backdrops: [] },
  videos: { results: [] }
}

// Get movie images
GET /movie/{id}/images
Response: {
  posters: [{
    file_path: string,
    width: number,
    height: number,
    vote_average: number
  }],
  backdrops: [...]
}
```

### TV Shows

```typescript
// Search TV shows
GET /search/tv?query={query}&first_air_date_year={year}

// Get show details
GET /tv/{id}?append_to_response=credits,images,external_ids

// Get season details
GET /tv/{id}/season/{season_number}

// Get episode details
GET /tv/{id}/season/{season}/episode/{episode}
```

## Image URLs

### Size Options

```typescript
enum PosterSize {
  W92 = 'w92',         // 92x138
  W154 = 'w154',       // 154x231
  W185 = 'w185',       // 185x278
  W342 = 'w342',       // 342x513
  W500 = 'w500',       // 500x750
  W780 = 'w780',       // 780x1170
  ORIGINAL = 'original' // Full size
}

enum BackdropSize {
  W300 = 'w300',       // 300x169
  W780 = 'w780',       // 780x439
  W1280 = 'w1280',     // 1280x720
  ORIGINAL = 'original' // Full size
}

// Build image URL
function buildImageUrl(path: string, size: string): string {
  return `https://image.tmdb.org/t/p/${size}${path}`;
}
```

## Data Mapping

```typescript
function mapTMDBMovie(tmdbData: TMDBMovie): Movie {
  return {
    title: tmdbData.title,
    original_title: tmdbData.original_title,
    plot: tmdbData.overview,
    release_date: tmdbData.release_date,
    runtime: tmdbData.runtime,
    rating: tmdbData.vote_average,
    vote_count: tmdbData.vote_count,
    tmdb_id: tmdbData.id,
    imdb_id: tmdbData.imdb_id,

    // Map genres
    genres: tmdbData.genres.map(g => g.name),

    // Map cast
    cast: tmdbData.credits.cast.slice(0, 20).map(person => ({
      name: person.name,
      character: person.character,
      tmdb_id: person.id,
      image: person.profile_path
    })),

    // Map crew
    directors: tmdbData.credits.crew
      .filter(p => p.job === 'Director')
      .map(p => ({ name: p.name, tmdb_id: p.id })),

    writers: tmdbData.credits.crew
      .filter(p => p.department === 'Writing')
      .map(p => ({ name: p.name, tmdb_id: p.id }))
  };
}
```

## Asset Scoring

```typescript
function scoreTMDBImage(image: TMDBImage): number {
  let score = 0;

  // Resolution scoring (0-40 points)
  const pixels = image.width * image.height;
  const idealPixels = 2000 * 3000; // For posters
  score += Math.min(40, (pixels / idealPixels) * 40);

  // Community rating (0-20 points)
  score += Math.min(20, image.vote_average * 2);

  // Vote count (0-10 points)
  score += Math.min(10, image.vote_count / 10);

  // Language match (0-10 points)
  if (image.iso_639_1 === config.language) score += 10;
  if (!image.iso_639_1) score += 5; // No text images

  // Aspect ratio (0-20 points)
  const ratio = image.width / image.height;
  const idealRatio = 2/3; // For posters
  const diff = Math.abs(ratio - idealRatio);
  score += Math.max(0, 20 - (diff * 50));

  return score;
}
```

## Error Handling

```typescript
class TMDBProvider {
  async fetchMovie(tmdbId: number): Promise<TMDBMovie> {
    try {
      await this.rateLimiter.throttle();

      const response = await fetch(
        `${this.baseUrl}/movie/${tmdbId}`,
        { headers: this.headers }
      );

      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        await this.rateLimiter.handle429(parseInt(retryAfter));
        return this.fetchMovie(tmdbId); // Retry
      }

      if (response.status === 404) {
        throw new NotFoundError(`TMDB movie ${tmdbId} not found`);
      }

      if (!response.ok) {
        throw new ProviderError(`TMDB error: ${response.statusText}`);
      }

      return response.json();

    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new ProviderError(`TMDB fetch failed: ${error.message}`);
    }
  }
}
```

## Caching Strategy

```typescript
interface TMDBCache {
  // Cache responses for 24 hours
  RESPONSE_TTL: 86400;

  // Cache image URLs indefinitely (they don't change)
  IMAGE_URL_TTL: null;

  // Refresh if older than 7 days
  REFRESH_AGE: 604800;
}

// Store in database
await db('provider_cache').insert({
  provider: 'tmdb',
  endpoint: `/movie/${tmdbId}`,
  response: JSON.stringify(data),
  cached_at: new Date(),
  expires_at: addHours(new Date(), 24)
});
```

## Changes API

TMDB provides a changes API to detect updated content:

```typescript
// Get changed movies
GET /movie/changes?start_date={date}&end_date={date}

// Get specific movie changes
GET /movie/{id}/changes

// Efficient update strategy
async function syncChanges(since: Date): Promise<void> {
  const changes = await tmdb.getMovieChanges(since);

  for (const movieId of changes.results) {
    const localMovie = await db.movies.findByTmdbId(movieId);
    if (localMovie && localMovie.monitored) {
      await jobQueue.add('enrich', {
        entity_type: 'movie',
        entity_id: localMovie.id,
        provider: 'tmdb'
      });
    }
  }
}
```

## Best Practices

1. **Always use append_to_response** to minimize API calls
2. **Cache aggressively** - TMDB data changes infrequently
3. **Prefer higher resolution images** for quality
4. **Use language codes** for localized content
5. **Implement retry logic** for transient failures
6. **Respect rate limits** to avoid IP bans

## Related Documentation

- [Enrichment Phase](../phases/ENRICHMENT.md) - How TMDB is used
- [Provider Overview](OVERVIEW.md) - Provider system architecture
- [Database Schema](../DATABASE.md) - Provider cache tables