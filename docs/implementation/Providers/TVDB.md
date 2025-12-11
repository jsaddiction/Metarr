# TVDB Implementation

TheTVDB API integration for TV shows, seasons, and episodes.

## API Details

- **Base URL**: `https://api4.thetvdb.com/v4`
- **Image Base**: `https://artworks.thetvdb.com`
- **Auth**: JWT token (24-hour expiry)
- **Rate Limit**: ~100 req/10s (conservative: 30 req/10s)
- **Documentation**: https://thetvdb.github.io/v4-api/

## Authentication

### JWT Token Flow

```typescript
class TVDBAuth {
  private token: string | null = null;
  private tokenExpiry: Date | null = null;

  async getToken(): Promise<string> {
    if (this.token && this.tokenExpiry) {
      const bufferHours = 2;
      if (Date.now() < this.tokenExpiry.getTime() - bufferHours * 3600000) {
        return this.token;
      }
    }
    await this.authenticate();
    return this.token!;
  }

  private async authenticate(): Promise<void> {
    const response = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apikey: this.apiKey, pin: this.pin })
    });
    const data = await response.json();
    this.token = data.data.token;
    this.tokenExpiry = new Date(Date.now() + 24 * 3600000);
  }
}
```

**Request Headers**:
```typescript
const headers = {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
};
```

**Environment Variables**: `TVDB_API_KEY`, `TVDB_PIN` (optional)

## Key Endpoints

### Authentication

```
POST /login
Body: { "apikey": "key", "pin": "optional_pin" }
Returns: { "data": { "token": "jwt_token" } }
```

### Search

```
GET /search?query={title}&type=series&year={year}
GET /search/remoteid/{imdb_id}
```

### Metadata

```
GET /series/{tvdb_id}/extended  // All metadata + seasons + episodes
GET /seasons/{season_id}/extended
GET /episodes/{episode_id}/extended
```

### Images

```
GET /series/{tvdb_id}/artworks?type={type_id}
GET /series/{tvdb_id}/artworks  // All types
```

## Artwork Type IDs

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

## Data Mapping

### Series Metadata

```typescript
{
  title: data.name,
  originalTitle: data.originalName,
  plot: data.overview,
  slug: data.slug,
  firstAired: data.firstAired,
  lastAired: data.lastAired,
  status: data.status.name,
  averageRuntime: data.averageRuntime,
  network: data.networks?.[0]?.name,
  country: data.originalCountry,
  genres: data.genres.map(g => g.name),
  certification: data.contentRating,
  actors: data.characters.slice(0, 20),
  externalIds: {
    imdb: data.remoteIds.find(r => r.sourceName === 'IMDB')?.id,
    tmdb: data.remoteIds.find(r => r.sourceName === 'TheMovieDB.com')?.id
  }
}
```

### Episode Metadata

```typescript
{
  title: episode.name,
  plot: episode.overview,
  episodeNumber: episode.number,
  seasonNumber: episode.seasonNumber,
  aired: episode.aired,
  runtime: episode.runtime,
  absoluteNumber: episode.absoluteNumber,
  productionCode: episode.productionCode
}
```

## Quirks and Workarounds

### Language Codes

TVDB uses 3-letter ISO 639-2, not 2-letter ISO 639-1:

```typescript
const languageMap = {
  'en': 'eng', 'es': 'spa', 'fr': 'fra',
  'de': 'deu', 'ja': 'jpn'
};
const tvdbLanguage = languageMap[isoLanguage] || 'eng';
```

### Absolute vs Aired Episode Numbers

For anime, use absolute numbering:

```typescript
const episodeNumber = series.type === 'anime'
  ? episode.absoluteNumber || episode.airedEpisodeNumber
  : episode.airedEpisodeNumber;
```

### Multiple Networks

Shows can have multiple networks:

```typescript
const network = series.networks?.[0]?.name || 'Unknown';
```

### Season 0 (Specials)

Season 0 contains specials, pilots, behind-the-scenes:

```typescript
const regularSeasons = seasons.filter(s => s.number > 0);
const specials = seasons.find(s => s.number === 0);
```

### Partial Air Dates

Some episodes have year-only or month-only dates:

```typescript
// TVDB returns: "2023-05-00" or "2023-00-00"
const year = airDate ? parseInt(airDate.split('-')[0]) : null;
```

## Error Handling

| Status | Cause | Resolution |
|--------|-------|------------|
| 401 | Expired token | Auto-refresh, retry |
| 404 | Invalid TVDB ID | Try search by name |
| 429 | Rate limit | Exponential backoff |
| 503 | Server maintenance | Circuit breaker, fallback to TMDB |

## Performance Tips

1. **Use extended endpoints**: Single call for all data
2. **Fetch all artworks**: One request for all types
3. **Cache tokens**: 24-hour validity
4. **Store TVDB IDs**: Direct lookup faster than search

## Related Documentation

- [Provider Concepts](../../concepts/Enrichment/Providers/README.md)
- [Rate Limiting](../../concepts/Enrichment/Providers/RATE_LIMITING.md)
- [Official TVDB API Docs](https://thetvdb.github.io/v4-api/)
