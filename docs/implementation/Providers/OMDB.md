# OMDb Implementation

Open Movie Database (OMDb) API for IMDb ratings, Rotten Tomatoes, Metacritic, and awards.

## API Details

- **Base URL**: `https://www.omdbapi.com/`
- **Auth**: API Key (query parameter)
- **Rate Limit**: 1,000/day (free), 100,000/day ($1/month)
- **Documentation**: https://www.omdbapi.com/

## Unique Value

OMDb is the **only legal source** for:
- Authoritative IMDb ratings and vote counts
- Rotten Tomatoes scores
- Metacritic scores
- Awards information (Oscar, Golden Globe, etc.)
- Short plot outline (unique field)

## Key Endpoints

### Search by Title

```
GET /?s={title}&type={movie|series}&y={year}&apikey={key}
```

### Get Details by IMDb ID

```
GET /?i={imdbId}&apikey={key}
```

**Note**: Prefer IMDb ID lookup over title search for accuracy.

## Response Format

```json
{
  "Title": "The Shawshank Redemption",
  "Year": "1994",
  "Rated": "R",
  "Released": "14 Oct 1994",
  "Runtime": "142 min",
  "Genre": "Drama",
  "Director": "Frank Darabont",
  "Writer": "Stephen King, Frank Darabont",
  "Actors": "Tim Robbins, Morgan Freeman, Bob Gunton",
  "Plot": "Two imprisoned men bond over a number of years...",
  "Awards": "Won 7 Oscars. Another 70 wins & 41 nominations.",
  "Poster": "https://m.media-amazon.com/images/M/...",
  "Ratings": [
    { "Source": "Internet Movie Database", "Value": "9.3/10" },
    { "Source": "Rotten Tomatoes", "Value": "91%" },
    { "Source": "Metacritic", "Value": "81/100" }
  ],
  "imdbRating": "9.3",
  "imdbVotes": "2,707,016",
  "imdbID": "tt0111161"
}
```

## Data Mapping

```typescript
{
  title: data.Title,
  releaseDate: parseDate(data.Released),  // "14 Oct 1994" → "1994-10-14"
  runtime: parseInt(data.Runtime),         // "142 min" → 142
  plot: data.Plot,
  genres: data.Genre.split(', '),
  director: data.Director,
  writer: data.Writer,
  actors: data.Actors.split(', '),
  certification: data.Rated,
  imdbId: data.imdbID,

  ratings: {
    imdb: {
      rating: parseFloat(data.imdbRating),
      votes: parseInt(data.imdbVotes.replace(/,/g, ''))
    },
    rottenTomatoes: {
      rating: parseInt(data.Ratings.find(r => r.Source === 'Rotten Tomatoes')?.Value)
    },
    metacritic: {
      score: parseInt(data.Ratings.find(r => r.Source === 'Metacritic')?.Value)
    }
  },

  awards: data.Awards,
  boxOffice: data.BoxOffice
}
```

## Rate Limiting Strategy

### Free Tier (1,000/day)

- Adequate for ~40 movies/day
- Cache aggressively (7-day TTL)
- Use fallback providers when limit reached

### Paid Tier (100,000/day)

- $1/month via Patreon
- 100x rate limit increase
- Recommended for large libraries (100+ movies)

### Caching

```typescript
// Default 7-day cache TTL
// Reduces actual API calls by ~80%
const cachedResult = await cache.get(`omdb:${imdbId}`);
if (cachedResult) return cachedResult;

const result = await fetchFromApi(imdbId);
await cache.set(`omdb:${imdbId}`, result, 604800000); // 7 days
```

## Limitations

| Limitation | Workaround |
|------------|------------|
| Low-res posters (300px) | Use TMDB/FanArt.tv for images |
| No trailers | Use TMDB for videos |
| Limited TV support | Use TVDB for TV shows |
| No episode data | Use TVDB/TMDB for episodes |
| Top 5 actors only | Use TMDB for full cast |
| US box office only | Accept limitation |

## Provider Priority Strategy

**For Ratings (Primary Use)**:
```
ratings: ['omdb', 'tmdb']
```

**For Plot**:
```
plot: ['tmdb', 'omdb']      // TMDB fuller
outline: ['omdb']            // OMDb only
```

**For Posters**:
```
poster: ['fanart_tv', 'tmdb', 'tvdb', 'omdb', 'local']
```

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| "Request limit reached!" | Daily quota exceeded | Wait for UTC midnight or upgrade |
| "Invalid API Key!" | Typo or expired key | Verify key (8 chars, e.g., `k1234567`) |
| "Movie not found!" | Not in database | Try TMDB fallback |

## Troubleshooting

**Verify API Key**:
```
https://www.omdbapi.com/?i=tt0111161&apikey=YOUR_KEY
```

**Check Remaining Quota**:
```bash
curl http://localhost:3000/api/providers/status
```

## Related Documentation

- [Provider Concepts](../../concepts/Enrichment/Providers/README.md)
- [Rate Limiting](../../concepts/Enrichment/Providers/RATE_LIMITING.md)
- [Official OMDb API Docs](https://www.omdbapi.com/)
