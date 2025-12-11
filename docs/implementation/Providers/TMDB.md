# TMDB Implementation

The Movie Database (TMDB) API integration for movies and TV shows.

## API Details

- **Base URL**: `https://api.themoviedb.org/3`
- **Image Base**: `https://image.tmdb.org/t/p/`
- **Auth**: Bearer token (API key)
- **Rate Limit**: 40 requests per 10 seconds
- **Documentation**: https://developers.themoviedb.org/3

## Authentication

```typescript
const headers = {
  'Authorization': `Bearer ${apiKey}`,
  'Content-Type': 'application/json'
};
```

**Environment Variable**: `TMDB_API_KEY`

## Key Endpoints

### Search

```
GET /search/movie?query={title}&year={year}
GET /search/tv?query={title}&first_air_date_year={year}
GET /search/multi?query={title}  // Disambiguation
```

### Metadata

```
GET /movie/{tmdb_id}?append_to_response=credits,release_dates,videos,images
GET /tv/{tmdb_id}?append_to_response=credits,content_ratings,external_ids
GET /tv/{tmdb_id}/season/{season_num}?append_to_response=credits
GET /tv/{tmdb_id}/season/{season_num}/episode/{episode_num}
```

### Images

```
GET /movie/{tmdb_id}/images?include_image_language=en,null
GET /tv/{tmdb_id}/images?include_image_language=en,null
```

### External ID Lookup

```
GET /find/{imdb_id}?external_source=imdb_id
```

## Image Sizes

```
Posters:  w92, w154, w185, w342, w500, w780, original
Backdrops: w300, w780, w1280, original
```

## Data Mapping

### Movie Metadata

```typescript
{
  title: data.title,
  originalTitle: data.original_title,
  plot: data.overview,
  tagline: data.tagline,
  releaseDate: data.release_date,
  runtime: data.runtime,
  imdbId: data.imdb_id,
  genres: data.genres.map(g => g.name),
  certification: usCertification,
  country: data.production_countries[0]?.iso_3166_1,
  directors: credits.crew.filter(c => c.job === 'Director'),
  writers: credits.crew.filter(c => c.department === 'Writing'),
  actors: credits.cast.slice(0, 20),
  ratings: {
    tmdb: { rating: data.vote_average, votes: data.vote_count }
  }
}
```

### TV Show Metadata

```typescript
{
  title: data.name,
  originalTitle: data.original_name,
  plot: data.overview,
  premiered: data.first_air_date,
  status: data.status,
  network: data.networks[0]?.name,
  numberOfSeasons: data.number_of_seasons,
  numberOfEpisodes: data.number_of_episodes,
  episodeRunTime: data.episode_run_time[0],
  genres: data.genres.map(g => g.name),
  certification: usRating?.rating,
  actors: credits.cast.slice(0, 20),
  createdBy: data.created_by.map(c => c.name)
}
```

## Quirks and Workarounds

### Language Handling

TMDB returns localized data based on `language` parameter:

```typescript
GET /movie/{id}?language=en-US  // English metadata
GET /movie/{id}?language=null   // Original language

const title = data.original_title || data.title;
```

### Image Language Filtering

```typescript
GET /movie/{id}/images?include_image_language=en,null

const englishPosters = images.posters.filter(
  img => img.iso_639_1 === 'en' || img.iso_639_1 === null
);
```

### Certification Retrieval

**Movies**: Use `/movie/{id}/release_dates`
```typescript
const usCert = release_dates.results.find(r => r.iso_3166_1 === 'US');
const certification = usCert?.release_dates[0]?.certification;
```

**TV Shows**: Use `content_ratings` in append_to_response
```typescript
const usRating = content_ratings.results.find(r => r.iso_3166_1 === 'US');
const certification = usRating?.rating;
```

### Trailer URLs

TMDB returns YouTube video IDs, not direct URLs:

```typescript
const youtubeTrailers = videos.results.filter(
  v => v.site === 'YouTube' && v.type === 'Trailer'
);
const trailerUrl = `https://www.youtube.com/watch?v=${youtubeTrailers[0].key}`;
```

### Collection Handling

Movies in collections don't include collection details:

```typescript
if (movie.belongs_to_collection) {
  const collection = await fetch(`/collection/${movie.belongs_to_collection.id}`);
}
```

## Error Handling

| Status | Cause | Resolution |
|--------|-------|------------|
| 401 | Invalid API key | Check `TMDB_API_KEY` |
| 404 | Invalid TMDB ID | Try search by title |
| 429 | Rate limit | Automatic exponential backoff |
| 503 | Server issues | Circuit breaker, fallback to TVDB |

## Performance Tips

1. **Use append_to_response**: Reduce API calls by 80%
2. **Cache TMDB IDs**: Store for direct lookup
3. **Request appropriate image size**: Not always `original`
4. **Filter early**: Apply language filters in API call

## Related Documentation

- [Provider Concepts](../../concepts/Enrichment/Providers/README.md)
- [Rate Limiting](../../concepts/Enrichment/Providers/RATE_LIMITING.md)
- [Official TMDB API Docs](https://developers.themoviedb.org/3)
