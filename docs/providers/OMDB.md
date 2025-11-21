# OMDb API Provider

**Provider ID**: `omdb`
**Category**: Metadata
**Authentication**: API Key (required)
**Free Tier**: 1,000 requests/day
**Paid Tier**: $1/month for 100,000 requests/day
**Status**: Production-ready

**Related Docs**:
- [Provider Overview](./OVERVIEW.md) - Provider comparison and capabilities
- [Getting API Keys](./GETTING_API_KEYS.md) - How to get OMDb API key
- [Rate Limiting](./RATE_LIMITING.md) - OMDb-specific rate limits
- [TMDB Provider](./TMDB.md) - Alternative metadata provider

## Overview

The Open Movie Database (OMDb) API provides comprehensive movie and TV metadata from the IMDb database. Unlike TMDB which offers its own database, OMDb provides official IMDb data including:

- **IMDb ratings and vote counts** (authoritative, same as IMDb.com)
- **Rotten Tomatoes scores** (unique to OMDb among free providers)
- **Metacritic scores** (unique to OMDb among free providers)
- **Awards information** (Oscar, Golden Globe, etc. - unique to OMDb)
- **Plot summaries** (full synopsis and short outline)
- **Cast, crew, genres, release information**

## Quick Reference

**When to Use OMDb**:
- ✓ Most authoritative IMDb ratings (source of truth)
- ✓ Only source for Rotten Tomatoes scores
- ✓ Only source for Metacritic scores
- ✓ Only source for awards information
- ✓ Provides unique "outline" field (short plot)
- ✗ Low-resolution posters (300px)
- ✗ No trailers or video content

**Key Endpoints**:
```
Base URL: https://www.omdbapi.com/
Search: /?s={title}&type={movie|series}&y={year}&apikey={key}
Details: /?i={imdbId}&type={movie|series}&apikey={key}
```

**API Details**:
- Auth: API Key query parameter
- Rate Limit: 1,000/day (free), 100,000/day (paid)
- Response Format: JSON only
- Documentation: https://www.omdbapi.com/

## Supported Features

### Entity Types

| Type | Search | Metadata | Assets | Notes |
|------|--------|----------|--------|-------|
| Movie | ✓ | ✓ | ✓ | Full support |
| TV Series | ✓ | ✓ | ✗ | Metadata only |
| Episode | ✗ | ✗ | ✗ | Not supported |

OMDb does not provide episode-level data.

### Metadata Fields

**Movies**:
- **Core**: title, original title, plot (full synopsis)
- **Outline**: short plot summary (unique to OMDb)
- **Release**: releaseDate, runtime
- **Classification**: genres, rated (MPAA rating), country, language
- **People**: director, writer, actors (up to 5 lead actors)
- **Ratings**: IMDb rating/votes, Rotten Tomatoes score, Metacritic score
- **Awards**: won/nominated indicators for major awards
- **Financial**: box office (US only, limited data)
- **IMDb ID**: for linking with other providers

**TV Series**:
- **Core**: title, plot
- **Release**: premiered date, ended date (if concluded)
- **Classification**: genres, rated, country
- **People**: actors, creators
- **Media**: total seasons, total episodes
- **Ratings**: IMDb rating, Rotten Tomatoes, Metacritic

**Episodes**:
- Not supported via API

### Asset Types

**Available**:
- **poster**: Movie/show posters (300px width, low resolution)

**Not Available**:
- fanart, banner, clearlogo, clearart, discart
- trailers, videos
- episode stills, season posters

**Image Quality Note**: OMDb posters are 300px wide, significantly lower than TMDB (2000px+) or Fanart.tv. Recommend using OMDb for ratings/awards only, not for images.

## Getting an API Key

### Free Tier (1,000 requests/day)

**Use Case**: Small personal libraries (up to ~40 movies), occasional enrichment

**Steps**:
1. Visit https://www.omdbapi.com/apikey.aspx
2. Select **"FREE! (1,000 daily limit)"**
3. Enter your email address
4. Check your email
5. Verify email address by clicking link
6. Copy API key from confirmation email
7. Add to `.env` file: `OMDB_API_KEY=your_key`

**Timeline**: Immediate after email verification (usually within seconds)

### Paid Tier ($1/month, 100,000 requests/day)

**Use Case**: Large libraries (100+ movies), frequent enrichment, batch processing

**Steps**:
1. Visit https://www.patreon.com/omdb
2. Select **$1/month tier**
3. Complete Patreon signup
4. You'll be directed to OMDb to create/upgrade account
5. API key automatically upgraded to paid tier
6. Copy new API key from dashboard
7. Update in Metarr Settings or `.env`

**Timeline**: Usually within 24 hours of Patreon payment

**Cost**: $1/month (approximately €0.95/month)

## Configuration

### In Metarr GUI

1. Open Metarr (http://localhost:3001)
2. Navigate to **Settings → Providers**
3. Find "OMDb API" card
4. Click "Configure"
5. Paste API key
6. Click "Save"
7. Provider auto-enables when key is valid

### Via Environment Variables

```bash
# Add to .env file
OMDB_API_KEY=your_api_key_here
```

Restart Metarr to load.

### Verification

Check provider status:
```bash
# Via API
curl http://localhost:3000/api/providers/status

# Expected output includes:
{
  "omdb": {
    "enabled": true,
    "authenticated": true,
    "rateLimitRemaining": 999,
    "rateLimitResetTime": "2024-11-22T00:00:00Z"
  }
}
```

## Data Quality

### Strengths

- **100% authoritative IMDb data**: Same data as IMDb.com
- **Rotten Tomatoes scores**: ONLY free provider with RT scores
  - Aggregated critic score (0-100%)
  - Audience/tomatometer score
- **Metacritic scores**: ONLY free provider with Metacritic
  - Critic score (0-100)
  - User score (0-10)
- **Awards information**: Oscar, Golden Globe, BAFTA, etc.
  - Win/nomination counts
  - Unique to OMDb among free providers
- **Plot outline**: Short (2-3 sentence) plot summary
  - TMDB only provides full plot
  - OMDb outline is valuable for short descriptions
- **Legal API**: No terms of service violations
- **Reliable for popular content**: 99%+ success rate for movies with 1000+ votes

### Limitations

- **Low-resolution posters**: 300px width only
  - Use TMDB (~500px) or Fanart.tv (2000px+) for images
- **No trailers or videos**: Use TMDB for video content
- **TV show data less reliable**: Much smaller database than movie database
  - Some shows missing or incomplete
  - Episode data unavailable
- **One-person operation**: OMDb is maintained by one developer
  - Slower feature development
  - Sustainability concerns (addressed via Patreon)
- **Limited crew data**: Only director, writer, and top 5 actors
  - TMDB has comprehensive crew lists
- **Box office US-only**: International box office data sparse
- **Sporadic updates**: Data updates lag behind real-time changes

## Rate Limiting

### Free Tier (1,000 requests/day)

**Daily Allocation**: 1,000 requests from midnight to midnight UTC

**Adequate For**:
- ~40 movies/day
- Small webhook enrichment (real-time updates)
- NOT suitable for bulk library enrichment

**When Rate Limited**:
- Error: "Request limit reached!"
- Response: 429 status code
- Wait until: Next UTC midnight
- Alternative: Upgrade to paid tier

### Paid Tier (100,000 requests/day)

**Daily Allocation**: 100,000 requests

**Adequate For**:
- 3,300+ movies/day
- Bulk enrichment of large libraries
- Heavy webhook automation

### Caching Strategy

Metarr implements aggressive caching to minimize API calls:

```typescript
// Default cache TTL for OMDb responses
TTL: 7 days

// Metadata cached by IMDb ID
// Automatically reused when same IMDb ID requested
// Reduces actual API calls by ~80% in typical workflows
```

**Cache Benefits**:
1. First enrichment of movie uses 1 API call
2. Subsequent enrichments (same movie) use cached data
3. Searches reuse cached results for 7 days
4. Dramatically extends free tier effectiveness

### Rate Limit Strategy

**For Free Tier Users**:
1. **Enable smart caching** (default): 7-day TTL
2. **Schedule batch jobs**: Off-peak hours
3. **Use fallback providers**: TMDB for when OMDb limit reached
4. **Consider upgrade**: $1/month for 100x rate limit

**For Paid Tier Users**:
1. **Disable strict rate limiting**: 100,000/day is very generous
2. **Enrich in parallel**: Job queue can process multiple items simultaneously
3. **Real-time webhooks**: Can handle frequent updates

See [RATE_LIMITING.md](./RATE_LIMITING.md) for complete rate limiting documentation.

## Comparison with Other Providers

| Feature | OMDb | TMDB | TVDB | IMDb Scraper |
|---------|------|------|------|--------------|
| **Legal** | ✓ Official | ✓ Official | ✓ Official | ✗ Violates ToS |
| **IMDb Ratings** | ✓ Authoritative | Partial* | ✗ No | ✓ Authoritative |
| **IMDb Votes** | ✓ Yes | ✗ No | ✗ No | ✓ Yes |
| **Rotten Tomatoes** | ✓ Yes | ✗ No | ✗ No | ✗ No |
| **Metacritic** | ✓ Yes | ✗ No | ✗ No | ✗ No |
| **Awards Info** | ✓ Oscar, BAFTA | ✗ No | ✗ No | ✓ Basic |
| **Plot Outline** | ✓ Yes | ✗ No | ✗ No | ✗ No |
| **Trailers** | ✗ No | ✓ Yes | ✗ No | ✓ Limited |
| **Poster Quality** | 300px | 2000px+ | 1000px+ | Varies |
| **Fanart** | ✗ No | ✓ Yes | ✓ Yes | ✗ No |
| **Rate Limit (Free)** | 1,000/day | ∞ | ∞ | ∞ |
| **Cost for Higher Limit** | $1/month | None | Subscription | None |
| **Maintenance** | Low | Low | Low | High (breaks) |
| **TV Show Quality** | Fair | Good | Excellent | Fair |

*TMDB gets IMDb ratings via external_ids, but not as primary data

## Provider Priority Strategy

### Recommended Configurations

**For Ratings (Primary Use Case)**:
```
ratings: ['omdb', 'tmdb']
```
Rationale: OMDb is most authoritative for IMDb ratings, falls back to TMDB

**For Plot/Outline (Complementary)**:
```
plot: ['tmdb', 'omdb']      // Full plot from TMDB
outline: ['omdb']            // Short plot only from OMDb
```
Rationale: OMDb provides unique outline field, TMDB for full plot

**For Posters (Lowest Priority)**:
```
poster: ['fanart_tv', 'tmdb', 'tvdb', 'omdb', 'local']
```
Rationale: OMDb posters are low-res, other providers have better quality

**For Award Info (Only Source)**:
```
awards: ['omdb']  // OMDb is only provider with awards
```

### Complete Priority Preset

**"Ratings Enhanced"** (Recommended for balanced libraries):
```json
{
  "priorityPreset": "ratings-enhanced",
  "perFieldPriority": {
    "title": ["omdb", "tmdb", "tvdb"],
    "plot": ["tmdb", "omdb"],
    "outline": ["omdb"],
    "releaseDate": ["omdb", "tmdb"],
    "rating_imdb": ["omdb"],
    "rating_rottenTomatoes": ["omdb"],
    "rating_metacritic": ["omdb"],
    "awards": ["omdb"],
    "poster": ["fanart_tv", "tmdb", "omdb"],
    "genres": ["tmdb", "omdb"],
    "cast": ["tmdb", "omdb"]
  }
}
```

## Troubleshooting

### Provider Disabled
**Symptom**: OMDb doesn't appear in enrichment options

**Possible Causes**:
- No API key configured
- Invalid API key format
- Network connectivity issue

**Solution**:
1. Verify API key in Settings → Providers → OMDb
2. Check `.env` file for typos: `OMDB_API_KEY=...`
3. Test API key at https://www.omdbapi.com/?i=tt0111161&apikey=YOUR_KEY
4. Restart Metarr after adding key

### Daily Limit Reached
**Symptom**: Error "Request limit reached!"

**Cause**: Exceeded 1,000 requests on free tier (or 100,000 on paid)

**Solutions**:
1. **Wait**: Limit resets at midnight UTC daily
2. **Upgrade**: Switch to paid tier ($1/month)
3. **Use Cache**: Rely on cached data for repeated enrichments
4. **Use Fallback**: Switch to TMDB for remaining enrichments today

**Check Remaining Quota**:
```bash
# Via API status
curl http://localhost:3000/api/providers/status

# Look for:
"omdb": {
  "rateLimitRemaining": 42,
  "rateLimitResetTime": "2024-11-22T00:00:00Z"
}
```

### Invalid API Key
**Symptom**: Error "Invalid API Key!"

**Possible Causes**:
- Typo in API key
- Spaces before/after key
- Using old/regenerated key
- Account disabled

**Solutions**:
1. **Verify Format**: Keys are 8 characters (e.g., `k1234567`)
2. **Check for Spaces**: Copy key carefully from email
3. **Test Directly**: Visit https://www.omdbapi.com/?i=tt0111161&apikey=YOUR_KEY
4. **Regenerate**: Log in at https://www.omdbapi.com/apikey.aspx and regenerate key

### Missing Data (Shows as "N/A")
**Symptom**: Some fields show "N/A" in UI

**Cause**: Data not available in OMDb database

**Examples**:
- Award nominations not found
- Box office data for non-US films
- Metacritic scores for obscure movies

**Solution**: Use fallback providers
```json
{
  "awards": ["omdb"],              // OMDb is primary
  "boxOffice": ["omdb", "tmdb"],   // Has fallback
  "ratings_metacritic": ["omdb"]    // Only source
}
```

### Slow Enrichment
**Symptom**: Enrichment taking longer than expected

**Likely Cause**: Rate limiting (free tier)

**Solutions**:
1. Check rate limit status: `curl http://localhost:3000/api/providers/status`
2. Upgrade to paid tier for 100x rate limit
3. Reduce parallel enrichment jobs
4. Schedule during off-peak hours

### Movies Not Found
**Symptom**: Search returns no results for movie

**Possible Causes**:
- Movie is very obscure/old
- Wrong title spelling
- TV show (OMDb may have limited TV coverage)

**Solutions**:
1. Search by IMDb ID directly (if available): `?i=tt0111161`
2. Try alternative title (original language)
3. Verify year matches
4. Use TMDB as fallback

## Examples

### Enriching a Movie with OMDb

**Request**:
```bash
GET https://www.omdbapi.com/?i=tt0111161&apikey=k1234567
```

**Response** (Shawshank Redemption):
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
  "Plot": "Two imprisoned men bond over a number of years, finding solace and eventual redemption through acts of common decency.",
  "Language": "English",
  "Country": "United States",
  "Awards": "Won 7 Oscars. Another 70 wins & 41 nominations.",
  "Poster": "https://m.media-amazon.com/images/M/...",
  "Ratings": [
    {
      "Source": "Internet Movie Database",
      "Value": "9.3/10"
    },
    {
      "Source": "Rotten Tomatoes",
      "Value": "91%"
    },
    {
      "Source": "Metacritic",
      "Value": "81/100"
    }
  ],
  "Metascore": "81",
  "imdbRating": "9.3",
  "imdbVotes": "2,707,016",
  "imdbID": "tt0111161",
  "Type": "movie",
  "DVD": "16 Dec 1997",
  "BoxOffice": "$28,341,469",
  "Production": "Columbia Pictures",
  "Website": "N/A",
  "Response": "True"
}
```

**Data Mapping**:
```typescript
{
  title: "The Shawshank Redemption",
  releaseDate: "1994-10-14",
  runtime: 142,
  plot: "Two imprisoned men bond over a number of years...",
  genres: ["Drama"],
  director: "Frank Darabont",
  writer: "Stephen King, Frank Darabont",
  actors: ["Tim Robbins", "Morgan Freeman", "Bob Gunton"],
  certification: "R",
  imdbId: "tt0111161",

  // OMDb-specific ratings
  ratings: {
    imdb: { rating: 9.3, votes: 2707016 },
    rottenTomatoes: { rating: 91 },  // %
    metacritic: { score: 81 }         // 0-100
  },

  // OMDb-specific
  awards: "Won 7 Oscars. Another 70 wins & 41 nominations.",
  boxOffice: "$28,341,469"
}
```

## Integration with Other Providers

### Complete Enrichment Pipeline

```typescript
// Typical enrichment using multiple providers
const enrichmentStrategy = {
  1: {
    provider: 'omdb',
    fields: ['imdbId', 'ratings.imdb', 'ratings.rottenTomatoes',
             'ratings.metacritic', 'awards', 'outline'],
    priority: 'high'  // Run first to get IMDb ID
  },
  2: {
    provider: 'tmdb',
    fields: ['plot', 'poster', 'fanart', 'trailer', 'cast'],
    priority: 'medium'  // Use OMDb IMDb ID for faster TMDB lookup
  },
  3: {
    provider: 'fanart_tv',
    fields: ['poster', 'fanart', 'clearlogo'],
    priority: 'low'  // Polish high-res artwork
  }
};

// IMDb ID from OMDb enables rapid TMDB lookup
// OMDb → TMDB: Use imdbId to search TMDB by external ID
// Saves search request, improves accuracy
```

### Recommended Field Delegation

```json
{
  "description": "Balanced approach: OMDb for unique data, TMDB for breadth",
  "fieldPriority": {
    "title": ["omdb", "tmdb"],
    "originalTitle": ["omdb", "tmdb"],
    "plot": ["tmdb", "omdb"],           // TMDB usually fuller
    "outline": ["omdb"],                // OMDb only
    "releaseDate": ["omdb", "tmdb"],
    "runtime": ["omdb", "tmdb"],
    "certification": ["omdb", "tmdb"],
    "genres": ["tmdb", "omdb"],

    "imdbRating": ["omdb"],
    "imdbId": ["omdb", "tmdb"],
    "imdbVotes": ["omdb"],
    "rottenTomatoesScore": ["omdb"],    // OMDb only
    "metacriticScore": ["omdb"],        // OMDb only
    "awards": ["omdb"],                 // OMDb only

    "cast": ["tmdb", "omdb"],           // TMDB has more
    "director": ["omdb", "tmdb"],
    "writer": ["omdb", "tmdb"],

    "poster": ["fanart_tv", "tmdb", "omdb"],  // OMDb low-res
    "fanart": ["fanart_tv", "tmdb"],
    "trailer": ["tmdb"],                // OMDb has none
    "country": ["omdb", "tmdb"],
    "language": ["omdb", "tmdb"]
  }
}
```

## API Reference

### Search by Title

```
GET /
  ?s=title              Title to search
  &type=movie|series    Entity type (optional)
  &y=year              Release year (optional)
  &apikey=KEY          Required
  &page=1-100          Pagination (optional, default 1)
```

**Example**:
```
GET /?s=Shawshank+Redemption&type=movie&apikey=k1234567
```

**Response**:
```json
{
  "Search": [
    {
      "Title": "The Shawshank Redemption",
      "Year": "1994",
      "imdbID": "tt0111161",
      "Type": "movie",
      "Poster": "https://m.media-amazon.com/..."
    }
  ],
  "totalResults": "1",
  "Response": "True"
}
```

### Get Details by IMDb ID

```
GET /
  &i=imdbId              IMDb ID (starts with tt)
  &type=movie|series    Entity type (optional)
  &apikey=KEY          Required
```

**Example**:
```
GET /?i=tt0111161&apikey=k1234567
```

Returns full details (see Examples section above).

### Type Parameter

```
type=movie      Movies only
type=series     TV series only
type=episode    Episodes only (limited data)
```

Omit for all types (default).

## Performance Tips

1. **Cache aggressively**: Default 7-day TTL suitable for most use cases
2. **Search by IMDb ID**: Direct lookup is faster than title search
3. **Batch requests**: Process multiple movies in parallel (respect rate limit)
4. **Use TMDB fallback**: For high-volume enrichment, let TMDB handle overflow
5. **Schedule smart**: For free tier, stagger enrichment throughout day

## Security

- **API Key**: Keep private, don't share or commit to Git
- **HTTPS Only**: OMDb API uses HTTPS
- **No Authentication Data**: API key only parameter, no credentials
- **Rate Limits Prevent Abuse**: Daily limits prevent scraping

## See Also

- [Provider Overview](./OVERVIEW.md) - All provider capabilities and comparison
- [Getting API Keys](./GETTING_API_KEYS.md) - How to obtain personal API keys
- [Rate Limiting](./RATE_LIMITING.md) - Rate limiting strategies
- [TMDB Provider](./TMDB.md) - Recommended complementary provider
- [Enrichment Phase](../phases/ENRICHMENT.md) - How providers are orchestrated
- [Official OMDb API Docs](https://www.omdbapi.com/) - Complete API reference
