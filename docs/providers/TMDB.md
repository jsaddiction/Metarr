# TMDB Provider

**Purpose**: The Movie Database (TMDB) integration for comprehensive movie and TV show metadata and artwork.

**Related Docs**:
- [Provider Overview](./OVERVIEW.md) - Provider comparison and capabilities
- [Rate Limiting](./RATE_LIMITING.md) - TMDB-specific rate limits
- [Getting API Keys](./GETTING_API_KEYS.md) - How to get personal TMDB API key

## Quick Reference

**Capabilities**:
- Movies: title, plot, tagline, release date, runtime, ratings, cast, crew, genres, studios, certification
- TV Shows: title, plot, ratings, genres, cast, air dates
- Assets: poster, fanart (backdrop), trailer (YouTube links)

**API Details**:
- Base URL: `https://api.themoviedb.org/3`
- Image Base: `https://image.tmdb.org/t/p/`
- Auth: Bearer token (API key)
- Rate Limit: 40 requests per 10 seconds
- Documentation: https://developers.themoviedb.org/3

**Zero Config**: Embedded API key included, no signup required.

## Supported Features

### Entity Types

| Type | Search | Metadata | Assets | Notes |
|------|--------|----------|--------|-------|
| Movie | ✓ | ✓ | ✓ | Full support |
| Collection | ✓ | ✓ | ✓ | Movie collections |
| TV Series | ✓ | ✓ | ✓ | Full support |
| Season | ✓ | ✓ | ✓ | Via series |
| Episode | ✓ | ✓ | ✓ | Via series |

### Metadata Fields

**Movies**:
- **Core**: title, originalTitle, plot (overview), tagline, releaseDate
- **Media**: runtime, status, budget, revenue, imdbId
- **Classification**: genres, certification (contentRating), country, language
- **People**: cast (actors), crew (director, writer, producer)
- **Ratings**: rating (vote_average), voteCount
- **Relationships**: collection, spokenLanguages, productionCompanies

**TV Shows**:
- **Core**: title, originalTitle, plot, firstAirDate, lastAirDate
- **Media**: episodeRunTime, numberOfSeasons, numberOfEpisodes, status
- **Classification**: genres, networks, type (scripted/reality), country
- **People**: cast, createdBy
- **Ratings**: rating, voteCount
- **Episodes**: aired episodes with metadata

### Asset Types

**Available**:
- **poster**: Movie/show posters (2:3 aspect ratio)
- **fanart**: Backdrops/backgrounds (16:9 aspect ratio)
- **trailer**: YouTube trailer links (not files)

**Not Available**:
- banner, clearlogo, clearart, discart (use FanArt.tv)
- characterart, landscape (use FanArt.tv or TVDB)

**Image Sizes**:
```
Posters:  w92, w154, w185, w342, w500, w780, original
Backdrops: w300, w780, w1280, original
```

## Key Endpoints Used

### Search

**Movie Search**:
```
GET /search/movie?query={title}&year={year}
```

**TV Search**:
```
GET /search/tv?query={title}&first_air_date_year={year}
```

**Multi Search** (used for disambiguation):
```
GET /search/multi?query={title}
```

### Metadata

**Movie Details**:
```
GET /movie/{tmdb_id}?append_to_response=credits,release_dates,videos
```

**TV Details**:
```
GET /tv/{tmdb_id}?append_to_response=credits,content_ratings,external_ids
```

**Season Details**:
```
GET /tv/{tmdb_id}/season/{season_num}?append_to_response=credits
```

**Episode Details**:
```
GET /tv/{tmdb_id}/season/{season_num}/episode/{episode_num}
```

### Images

**Movie Images**:
```
GET /movie/{tmdb_id}/images?include_image_language=en,null
```

**TV Images**:
```
GET /tv/{tmdb_id}/images?include_image_language=en,null
```

### External IDs

**Find by IMDb ID**:
```
GET /find/{imdb_id}?external_source=imdb_id
```

## Authentication

TMDB uses Bearer token authentication (API key as bearer token).

**Embedded Key**:
```typescript
// Metarr includes embedded API key
const DEFAULT_TMDB_KEY = process.env.TMDB_API_KEY || 'embedded_key';
```

**Personal Key**:
```bash
# Add to .env for personal key
TMDB_API_KEY=your_personal_api_key_here
```

**Request Format**:
```typescript
const headers = {
  'Authorization': `Bearer ${apiKey}`,
  'Content-Type': 'application/json'
};
```

**Benefits of Personal Key**:
- Usage tracking on your account
- Support TMDB community
- Same rate limits (not increased)
- Better debugging/monitoring

## Rate Limiting

**Official Limit**: 40 requests per 10 seconds

**Metarr Implementation**:
```typescript
{
  requestsPerSecond: 40,
  windowSeconds: 10,
  burstCapacity: 40
}
```

**Best Practices**:
1. **Batch with append_to_response**: Fetch credits, images, videos in one call
2. **Cache aggressively**: TMDB data rarely changes
3. **Use priority properly**: Reserve burst for webhooks/user actions
4. **Handle 429 gracefully**: Exponential backoff automatic

**Example Batching**:
```typescript
// Good: Single request with all data
GET /movie/123?append_to_response=credits,release_dates,videos,images

// Bad: Multiple requests
GET /movie/123
GET /movie/123/credits
GET /movie/123/release_dates
GET /movie/123/videos
GET /movie/123/images
```

See [RATE_LIMITING.md](./RATE_LIMITING.md) for complete rate limiting documentation.

## Quirks and Workarounds

### Language Handling

**Issue**: TMDB returns localized data based on `language` parameter

**Workaround**:
```typescript
// Always fetch both localized and original
GET /movie/{id}?language=en-US  // English metadata
GET /movie/{id}?language=null    // Original language

// Prefer original title when available
const title = data.original_title || data.title;
```

### Image Language Filtering

**Issue**: Images include all languages, need filtering

**Workaround**:
```typescript
// Request English and null (language-agnostic) images
GET /movie/{id}/images?include_image_language=en,null

// Filter by iso_639_1 in response
const englishPosters = images.posters.filter(
  img => img.iso_639_1 === 'en' || img.iso_639_1 === null
);
```

### Release Date vs Aired Date

**Issue**: Movies use `release_date`, TV uses `first_air_date`

**Solution**: Normalize in provider adapter
```typescript
const releaseDate = data.release_date || data.first_air_date;
```

### Certification Retrieval

**Movies**: Must use `/movie/{id}/release_dates` endpoint
```typescript
// US certification
const usCert = release_dates.results.find(r => r.iso_3166_1 === 'US');
const certification = usCert?.release_dates[0]?.certification;
```

**TV Shows**: Use `content_ratings` in append_to_response
```typescript
const usRating = content_ratings.results.find(r => r.iso_3166_1 === 'US');
const certification = usRating?.rating;
```

### Trailer Format

**Issue**: TMDB returns YouTube video IDs, not direct video URLs

**Solution**: Construct YouTube URL
```typescript
const youtubeTrailers = videos.results.filter(
  v => v.site === 'YouTube' && v.type === 'Trailer'
);
const trailerUrl = `https://www.youtube.com/watch?v=${youtubeTrailers[0].key}`;
```

### Collection Handling

**Issue**: Movies part of collections don't include collection details

**Workaround**: Separate collection endpoint fetch
```typescript
if (movie.belongs_to_collection) {
  const collection = await fetch(
    `/collection/${movie.belongs_to_collection.id}`
  );
}
```

## Error Handling

### Common Errors

**401 Unauthorized**:
- Invalid API key
- Check `TMDB_API_KEY` environment variable
- Verify key at https://www.themoviedb.org/settings/api

**404 Not Found**:
- Invalid TMDB ID
- Entity deleted from TMDB
- Try search by title instead

**429 Too Many Requests**:
- Rate limit exceeded
- Automatic exponential backoff
- Check rate limiter stats

**503 Service Unavailable**:
- TMDB server issues
- Circuit breaker opens after 5 consecutive failures
- Fallback to next provider

### Retry Strategy

```typescript
// Automatic retry with exponential backoff
try {
  const response = await tmdbClient.getMovie(tmdbId);
} catch (error) {
  if (error.statusCode === 429) {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s
    await exponentialBackoff(attempt);
    // Retry up to 5 times
  } else if (error.statusCode >= 500) {
    // Server error, count toward circuit breaker
    throw error;
  }
}
```

## Configuration

### Provider Settings

Configure in Settings → Providers → TMDB:

```json
{
  "enabled": true,
  "apiKey": "your_personal_key",
  "language": "en-US",
  "region": "US",
  "includeAdult": false,
  "imageLanguages": ["en", "null"]
}
```

### Environment Variables

```bash
# Optional personal API key
TMDB_API_KEY=your_api_key_here

# Override base URL (for testing)
TMDB_BASE_URL=https://api.themoviedb.org/3

# Override image base URL
TMDB_IMAGE_BASE_URL=https://image.tmdb.org/t/p
```

## Data Mapping

### Movie Metadata Mapping

```typescript
{
  // Core fields
  title: data.title,
  originalTitle: data.original_title,
  plot: data.overview,
  tagline: data.tagline,
  releaseDate: data.release_date,

  // Media info
  runtime: data.runtime,
  imdbId: data.imdb_id,

  // Classification
  genres: data.genres.map(g => g.name),
  certification: usCertification,
  country: data.production_countries[0]?.iso_3166_1,

  // People
  directors: credits.crew.filter(c => c.job === 'Director'),
  writers: credits.crew.filter(c => c.department === 'Writing'),
  actors: credits.cast.slice(0, 20),

  // Ratings
  ratings: {
    tmdb: {
      rating: data.vote_average,
      votes: data.vote_count
    }
  }
}
```

### TV Show Metadata Mapping

```typescript
{
  title: data.name,
  originalTitle: data.original_name,
  plot: data.overview,
  premiered: data.first_air_date,
  status: data.status,

  // TV-specific
  network: data.networks[0]?.name,
  numberOfSeasons: data.number_of_seasons,
  numberOfEpisodes: data.number_of_episodes,
  episodeRunTime: data.episode_run_time[0],

  // Classification
  genres: data.genres.map(g => g.name),
  certification: usRating?.rating,

  // People
  actors: credits.cast.slice(0, 20),
  createdBy: data.created_by.map(c => c.name)
}
```

## Provider Priority

TMDB is typically prioritized as:
1. **Quality First**: 2nd (after FanArt.tv)
2. **Speed First**: 1st (highest rate limit)
3. **TMDB Primary**: 1st (by definition)
4. **TVDB Primary**: 2nd (for movies), 3rd (for TV)

See [Provider Overview](./OVERVIEW.md) for complete priority preset details.

## Performance Tips

1. **Use append_to_response**: Reduce API calls by 80%
2. **Cache TMDB IDs**: Store tmdb_id in database for direct lookup
3. **Batch enrichment**: Process multiple movies in parallel (respect rate limit)
4. **Image optimization**: Request appropriate size, not always `original`
5. **Filter early**: Apply language filters in API call, not client-side

## Getting a Personal API Key

See [GETTING_API_KEYS.md](./GETTING_API_KEYS.md) for step-by-step instructions.

**Quick Steps**:
1. Create account at https://www.themoviedb.org/
2. Navigate to Settings → API
3. Request an API key (select "Developer")
4. Accept terms of use
5. Add key to `.env`: `TMDB_API_KEY=your_key`

## See Also

- [Provider Overview](./OVERVIEW.md) - All provider capabilities
- [Rate Limiting](./RATE_LIMITING.md) - Rate limiting details
- [TVDB Provider](./TVDB.md) - TV-specific provider
- [Enrichment Phase](../phases/ENRICHMENT.md) - How TMDB fits in enrichment
- [Official TMDB API Docs](https://developers.themoviedb.org/3) - Complete API reference
