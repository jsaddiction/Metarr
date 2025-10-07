# Metadata Providers Reference

This document provides comprehensive reference for external metadata provider APIs used by Metarr, including TMDB, IMDB, TVDB, and others.

## Provider Overview

Metarr uses multiple metadata providers to enrich media metadata beyond what's available in NFO files:
- **Primary Source**: NFO files (database is source of truth)
- **Supplemental**: Provider APIs to add additional fields (vote counts, popularity, provider-specific images)
- **Field Locking**: Locked fields are **never** overwritten by provider updates
- **Optional Enhancement**: Metadata enrichment is a future feature, not currently implemented

### Field Locking Behavior

When updating metadata from providers:
1. **Locked fields are skipped** - If a field has `{field}_locked = 1`, provider data for that field is ignored
2. **Unlocked fields are updated** - Only fields with `{field}_locked = 0` are updated from provider
3. **Images respect locking** - Images with `locked = 1` in the `images` table are never replaced
4. **Array fields use merge strategy** - Actors, genres, directors use intelligent merge (see below)

**Example:**
```typescript
async function updateFromProvider(movieId: number, tmdbData: any): Promise<void> {
  const movie = await db.getMovie(movieId);
  const updates: Partial<Movie> = {};

  // Only update unlocked scalar fields
  if (!movie.plot_locked && tmdbData.overview) {
    updates.plot = tmdbData.overview;
  }
  if (!movie.runtime_locked && tmdbData.runtime) {
    updates.runtime = tmdbData.runtime;
  }
  // ... repeat for all scalar fields

  await db.updateMovie(movieId, updates);
}
```

See `@docs/FIELD_LOCKING.md` for complete documentation.

## TMDB (The Movie Database)

### Authentication

**API Key Required:** Yes (free)

**Request Headers:**
```
Authorization: Bearer {API_KEY}
Content-Type: application/json;charset=utf-8
```

**Rate Limits:**
- 40 requests per 10 seconds
- Recommend implementing request queue with rate limiting

### Base URL

```
https://api.themoviedb.org/3
```

### Movie Endpoints

#### Get Movie Details

**Endpoint:** `GET /movie/{movie_id}`

**Parameters:**
- `movie_id` (required): TMDB movie ID
- `language` (optional): `en-US` (default)
- `append_to_response` (optional): `credits,videos,images,keywords,release_dates`

**Request:**
```
GET https://api.themoviedb.org/3/movie/603?append_to_response=credits,videos,images
Authorization: Bearer {API_KEY}
```

**Response:**
```json
{
  "id": 603,
  "imdb_id": "tt0133093",
  "title": "The Matrix",
  "original_title": "The Matrix",
  "tagline": "Welcome to the Real World.",
  "overview": "Set in the 22nd century, The Matrix tells the story...",
  "release_date": "1999-03-31",
  "runtime": 136,
  "budget": 63000000,
  "revenue": 463517383,
  "vote_average": 8.2,
  "vote_count": 23456,
  "popularity": 85.432,
  "poster_path": "/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg",
  "backdrop_path": "/fNG7i7RqMErkcqhohV2a6cV1Ehy.jpg",
  "genres": [
    {"id": 28, "name": "Action"},
    {"id": 878, "name": "Science Fiction"}
  ],
  "production_companies": [
    {"id": 174, "name": "Warner Bros. Pictures"}
  ],
  "production_countries": [
    {"iso_3166_1": "US", "name": "United States of America"}
  ],
  "spoken_languages": [
    {"iso_639_1": "en", "english_name": "English"}
  ],
  "belongs_to_collection": {
    "id": 2344,
    "name": "The Matrix Collection",
    "poster_path": "/...",
    "backdrop_path": "/..."
  },
  "credits": {
    "cast": [
      {
        "id": 6384,
        "name": "Keanu Reeves",
        "character": "Neo",
        "order": 0,
        "profile_path": "/..."
      }
    ],
    "crew": [
      {
        "id": 9339,
        "name": "Lana Wachowski",
        "job": "Director",
        "department": "Directing"
      }
    ]
  },
  "videos": {
    "results": [
      {
        "id": "5c9294240e0a267cd516835f",
        "key": "vKQi3bBA1y8",
        "name": "The Matrix - Official Trailer",
        "site": "YouTube",
        "type": "Trailer"
      }
    ]
  },
  "images": {
    "backdrops": [
      {
        "file_path": "/fNG7i7RqMErkcqhohV2a6cV1Ehy.jpg",
        "width": 1920,
        "height": 1080,
        "vote_average": 5.312
      }
    ],
    "posters": [
      {
        "file_path": "/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg",
        "width": 2000,
        "height": 3000,
        "vote_average": 5.456
      }
    ]
  }
}
```

**Image URLs:**
```
https://image.tmdb.org/t/p/{size}/{file_path}

Sizes:
- Poster: w92, w154, w185, w342, w500, w780, original
- Backdrop: w300, w780, w1280, original
- Profile: w45, w185, h632, original
```

#### Search Movies

**Endpoint:** `GET /search/movie`

**Parameters:**
- `query` (required): Search query
- `year` (optional): Release year filter
- `language` (optional): `en-US`
- `page` (optional): Page number (default: 1)

**Request:**
```
GET https://api.themoviedb.org/3/search/movie?query=The%20Matrix&year=1999
Authorization: Bearer {API_KEY}
```

**Response:**
```json
{
  "page": 1,
  "total_results": 1,
  "total_pages": 1,
  "results": [
    {
      "id": 603,
      "title": "The Matrix",
      "original_title": "The Matrix",
      "release_date": "1999-03-31",
      "vote_average": 8.2,
      "popularity": 85.432,
      "poster_path": "/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg"
    }
  ]
}
```

### TV Show Endpoints

#### Get TV Show Details

**Endpoint:** `GET /tv/{tv_id}`

**Parameters:**
- `tv_id` (required): TMDB TV show ID
- `append_to_response` (optional): `credits,videos,images,content_ratings,external_ids`

**Response:**
```json
{
  "id": 1396,
  "name": "Breaking Bad",
  "original_name": "Breaking Bad",
  "overview": "A high school chemistry teacher...",
  "first_air_date": "2008-01-20",
  "last_air_date": "2013-09-29",
  "number_of_seasons": 5,
  "number_of_episodes": 62,
  "status": "Ended",
  "type": "Scripted",
  "vote_average": 8.9,
  "vote_count": 12345,
  "popularity": 234.567,
  "poster_path": "/...",
  "backdrop_path": "/...",
  "genres": [
    {"id": 80, "name": "Crime"},
    {"id": 18, "name": "Drama"}
  ],
  "production_companies": [
    {"id": 174, "name": "AMC"}
  ],
  "external_ids": {
    "imdb_id": "tt0903747",
    "tvdb_id": 81189
  },
  "credits": {
    "cast": [
      {
        "id": 17419,
        "name": "Bryan Cranston",
        "character": "Walter White",
        "order": 0
      }
    ]
  }
}
```

#### Get Season Details

**Endpoint:** `GET /tv/{tv_id}/season/{season_number}`

**Response:**
```json
{
  "id": 3572,
  "name": "Season 1",
  "overview": "High school chemistry teacher Walter White's life...",
  "season_number": 1,
  "air_date": "2008-01-20",
  "episodes": [
    {
      "id": 62085,
      "name": "Pilot",
      "overview": "Walter White's life is suddenly transformed...",
      "episode_number": 1,
      "season_number": 1,
      "air_date": "2008-01-20",
      "runtime": 58,
      "vote_average": 8.2,
      "still_path": "/..."
    }
  ]
}
```

#### Get Episode Details

**Endpoint:** `GET /tv/{tv_id}/season/{season_number}/episode/{episode_number}`

**Response:**
```json
{
  "id": 62085,
  "name": "Pilot",
  "overview": "Walter White's life is suddenly transformed...",
  "episode_number": 1,
  "season_number": 1,
  "air_date": "2008-01-20",
  "runtime": 58,
  "vote_average": 8.2,
  "vote_count": 5678,
  "still_path": "/...",
  "crew": [
    {
      "id": 66633,
      "name": "Vince Gilligan",
      "job": "Director"
    }
  ],
  "guest_stars": []
}
```

### Collection Endpoints

#### Get Collection Details

**Endpoint:** `GET /collection/{collection_id}`

**Response:**
```json
{
  "id": 2344,
  "name": "The Matrix Collection",
  "overview": "The complete Matrix trilogy...",
  "poster_path": "/...",
  "backdrop_path": "/...",
  "parts": [
    {
      "id": 603,
      "title": "The Matrix",
      "release_date": "1999-03-31"
    },
    {
      "id": 604,
      "title": "The Matrix Reloaded",
      "release_date": "2003-05-15"
    }
  ]
}
```

### Find by External ID

**Endpoint:** `GET /find/{external_id}`

**Parameters:**
- `external_source` (required): `imdb_id`, `tvdb_id`

**Request:**
```
GET https://api.themoviedb.org/3/find/tt0133093?external_source=imdb_id
Authorization: Bearer {API_KEY}
```

**Response:**
```json
{
  "movie_results": [
    {
      "id": 603,
      "title": "The Matrix"
    }
  ],
  "tv_results": [],
  "person_results": []
}
```

### Rate Limiting Pattern

```typescript
class TMDBRateLimiter {
  private queue: Array<() => Promise<any>> = [];
  private requestsInWindow = 0;
  private windowStart = Date.now();
  private readonly maxRequests = 40;
  private readonly windowMs = 10000; // 10 seconds

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Wait if at rate limit
    while (this.requestsInWindow >= this.maxRequests) {
      const elapsed = Date.now() - this.windowStart;
      if (elapsed >= this.windowMs) {
        this.requestsInWindow = 0;
        this.windowStart = Date.now();
        break;
      }
      await this.delay(this.windowMs - elapsed);
    }

    this.requestsInWindow++;
    return fn();
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

## TVDB (TheTVDB)

### Authentication

**API Key Required:** Yes (free)

**Authentication Flow:**
1. POST to `/login` with API key
2. Receive JWT token
3. Include token in `Authorization: Bearer {token}` header
4. Token expires after 24 hours

**Base URL:**
```
https://api4.thetvdb.com/v4
```

### Login

**Endpoint:** `POST /login`

**Request:**
```json
{
  "apikey": "{YOUR_API_KEY}"
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "token": "{JWT_TOKEN}"
  }
}
```

### Get Series by ID

**Endpoint:** `GET /series/{id}/extended`

**Request:**
```
GET https://api4.thetvdb.com/v4/series/81189/extended
Authorization: Bearer {JWT_TOKEN}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "id": 81189,
    "name": "Breaking Bad",
    "overview": "A high school chemistry teacher...",
    "firstAired": "2008-01-20",
    "lastAired": "2013-09-29",
    "status": {
      "name": "Ended"
    },
    "originalLanguage": "eng",
    "averageRuntime": 47,
    "seasons": [
      {
        "id": 30272,
        "number": 1,
        "name": "Season 1"
      }
    ],
    "genres": [
      {"name": "Crime"},
      {"name": "Drama"}
    ],
    "remoteIds": [
      {
        "id": "tt0903747",
        "type": 2,
        "sourceName": "IMDB"
      }
    ]
  }
}
```

### Get Season Episodes

**Endpoint:** `GET /seasons/{season_id}/extended`

**Response:**
```json
{
  "status": "success",
  "data": {
    "id": 30272,
    "seriesId": 81189,
    "number": 1,
    "name": "Season 1",
    "episodes": [
      {
        "id": 349232,
        "seriesId": 81189,
        "seasonNumber": 1,
        "number": 1,
        "name": "Pilot",
        "overview": "Walter White's life is suddenly transformed...",
        "aired": "2008-01-20",
        "runtime": 58
      }
    ]
  }
}
```

### Search Series

**Endpoint:** `GET /search`

**Parameters:**
- `query` (required): Search term
- `type` (optional): `series`

**Request:**
```
GET https://api4.thetvdb.com/v4/search?query=Breaking%20Bad&type=series
Authorization: Bearer {JWT_TOKEN}
```

## MusicBrainz (Future - Music Library)

### Authentication

**No API Key Required:** Open API with rate limiting

**Rate Limit:** 1 request per second (honor `X-RateLimit-*` headers)

**Base URL:**
```
https://musicbrainz.org/ws/2
```

### User-Agent Requirement

**Required Header:**
```
User-Agent: Metarr/1.0.0 ( contact@metarr.app )
```

### Search Releases

**Endpoint:** `GET /release`

**Parameters:**
- `query` (required): Search query (Lucene syntax)
- `fmt` (optional): `json`

**Request:**
```
GET https://musicbrainz.org/ws/2/release?query=artist:Radiohead%20AND%20release:OK%20Computer&fmt=json
User-Agent: Metarr/1.0.0 ( contact@metarr.app )
```

**Response:**
```json
{
  "releases": [
    {
      "id": "f68c985d-f18b-4f4e-8d12-8e8c446b1234",
      "title": "OK Computer",
      "date": "1997-05-21",
      "artist-credit": [
        {
          "name": "Radiohead"
        }
      ]
    }
  ]
}
```

## Provider Integration Patterns

### Metadata Enrichment Workflow

```typescript
async function enrichMovieMetadata(movie: Movie): Promise<void> {
  // Only enrich if movie has provider IDs
  if (!movie.tmdb_id && !movie.imdb_id) {
    console.log('No provider IDs, skipping enrichment');
    return;
  }

  try {
    // Step 1: Fetch from TMDB (primary source)
    if (movie.tmdb_id) {
      const tmdbData = await tmdbClient.getMovieDetails(movie.tmdb_id, {
        append_to_response: 'credits,videos,images'
      });

      // Merge supplemental data (don't overwrite NFO data)
      await mergeMetadata(movie, tmdbData, 'tmdb');
    }

    // Step 2: Fetch from IMDB via OMDb (additional ratings)
    if (movie.imdb_id) {
      const imdbData = await omdbClient.getByIMDBId(movie.imdb_id);
      await mergeRatings(movie, imdbData);
    }

    // Step 3: Update status
    await db.updateMovie(movie.id, { status: 'completed' });

  } catch (error) {
    console.error('Enrichment failed:', error);
    await db.updateMovie(movie.id, { status: 'failed', error_message: error.message });
  }
}
```

### Merge Strategy

```typescript
function mergeMetadata(movie: Movie, providerData: any, source: string): void {
  // RULE: NFO data always takes precedence
  // Only add fields that are missing or supplemental

  // Don't overwrite core fields from NFO
  if (!movie.plot) {
    movie.plot = providerData.overview;
  }

  // Add supplemental fields not in NFO
  movie.vote_average = providerData.vote_average;
  movie.vote_count = providerData.vote_count;
  movie.popularity = providerData.popularity;

  // Add provider-specific ratings
  if (providerData.vote_average) {
    addRating(movie, {
      source,
      value: providerData.vote_average,
      votes: providerData.vote_count,
      is_default: source === 'tmdb'
    });
  }

  // Add missing actors (merge with NFO actors)
  mergeActors(movie, providerData.credits?.cast);

  // Add missing genres
  mergeGenres(movie, providerData.genres);
}
```

### Caching Strategy

```typescript
class ProviderCache {
  private ttl = 7 * 24 * 60 * 60 * 1000; // 7 days

  async get(provider: string, id: string): Promise<any | null> {
    const cached = await redis.get(`provider:${provider}:${id}`);
    if (cached) {
      return JSON.parse(cached);
    }
    return null;
  }

  async set(provider: string, id: string, data: any): Promise<void> {
    await redis.setex(
      `provider:${provider}:${id}`,
      this.ttl / 1000,
      JSON.stringify(data)
    );
  }
}
```

### Retry Logic with Exponential Backoff

```typescript
async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Don't retry on client errors (4xx)
      if (error.response?.status >= 400 && error.response?.status < 500) {
        throw error;
      }

      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}
```

## Error Handling

### TMDB Error Codes

| Status Code | Meaning | Action |
|-------------|---------|--------|
| 401 | Invalid API key | Check configuration |
| 404 | Resource not found | Mark as failed, log error |
| 429 | Rate limit exceeded | Implement backoff, queue request |
| 500 | Server error | Retry with exponential backoff |

### TVDB Error Codes

| Status Code | Meaning | Action |
|-------------|---------|--------|
| 401 | Token expired | Re-authenticate |
| 404 | Not found | Mark as failed |
| 429 | Rate limit | Backoff and retry |

### OMDb Error Responses

```json
{
  "Response": "False",
  "Error": "Movie not found!"
}
```

**Check `Response` field:** `True` = success, `False` = error

## Best Practices

### 1. Respect Rate Limits
Implement request queuing and rate limiting for all providers.

### 2. Cache Aggressively
Cache provider responses for at least 7 days to reduce API calls.

### 3. Use Batch Endpoints
Where available (TMDB `append_to_response`), use batch endpoints to reduce requests.

### 4. Handle Errors Gracefully
Don't fail entire library scan on single provider error.

### 5. NFO Data Takes Precedence
Never overwrite NFO metadata with provider data.

### 6. Log Provider Responses
Log all provider API responses for debugging and auditing.

### 7. Monitor API Usage
Track API call counts to stay within free tier limits.

### 8. Implement Circuit Breakers
Stop calling failing providers temporarily to avoid cascading failures.

## Testing

### Mock Provider Responses

```typescript
describe('TMDB Provider', () => {
  it('should fetch movie details', async () => {
    const mockResponse = {
      id: 603,
      title: 'The Matrix',
      vote_average: 8.2,
      vote_count: 23456
    };

    nock('https://api.themoviedb.org')
      .get('/3/movie/603')
      .reply(200, mockResponse);

    const result = await tmdbClient.getMovieDetails(603);
    expect(result.title).toBe('The Matrix');
  });

  it('should handle 404 errors', async () => {
    nock('https://api.themoviedb.org')
      .get('/3/movie/999999')
      .reply(404, { status_message: 'The resource you requested could not be found.' });

    await expect(tmdbClient.getMovieDetails(999999)).rejects.toThrow('Not found');
  });
});
```

## Resources

- **TMDB API Docs**: https://developers.themoviedb.org/3
- **TVDB API Docs**: https://thetvdb.github.io/v4-api/
- **OMDb API**: https://www.omdbapi.com/
- **MusicBrainz API**: https://musicbrainz.org/doc/MusicBrainz_API
