# TVDB Provider

**API Version**: v4
**Documentation**: https://thetvdb.github.io/v4-api/

## Overview

TheTVDB specializes in television content with comprehensive episode information, air dates, and series metadata. It's particularly strong for anime and international shows.

## Configuration

```typescript
interface TVDBConfig {
  apiKey: string;              // Required (default provided)
  pin?: string;                // Optional user PIN
  baseUrl: 'https://api4.thetvdb.com/v4';
  language: 'eng';             // 3-letter code
}
```

## Authentication

TVDB uses JWT tokens that expire after 24 hours:

```typescript
class TVDBAuth {
  private token: string;
  private tokenExpiry: Date;

  async authenticate(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apikey: this.apiKey,
        pin: this.pin
      })
    });

    const data = await response.json();
    this.token = data.data.token;

    // Token expires in 24 hours
    this.tokenExpiry = addHours(new Date(), 24);
  }

  async getToken(): Promise<string> {
    if (!this.token || new Date() > this.tokenExpiry) {
      await this.authenticate();
    }
    return this.token;
  }
}
```

## Rate Limiting

- **Default**: 30 requests per 10 seconds
- **Burst**: Up to 100 requests allowed
- **Daily Limit**: 10,000 requests per day

```typescript
class TVDBRateLimiter {
  private shortWindow = new RateLimitWindow(30, 10000);  // 30 per 10s
  private dailyWindow = new RateLimitWindow(10000, 86400000); // 10k per day

  async throttle(): Promise<void> {
    await this.shortWindow.throttle();
    await this.dailyWindow.throttle();
  }
}
```

## Key Endpoints

### Series

```typescript
// Search series
GET /search?query={query}&type=series
Headers: {
  'Authorization': 'Bearer {token}'
}
Response: {
  data: [{
    objectID: string,
    name: string,
    first_air_time: string,
    overview: string,
    primary_language: string,
    tvdb_id: string
  }]
}

// Get series extended info
GET /series/{id}/extended?meta=episodes
Response: {
  data: {
    id: number,
    name: string,
    overview: string,
    firstAired: string,
    lastAired: string,
    status: string,
    episodes: [{
      id: number,
      seasonNumber: number,
      episodeNumber: number,
      name: string,
      aired: string,
      overview: string
    }],
    artworks: [{
      type: number,  // 1=banner, 2=poster, 3=fanart
      image: string,
      thumbnail: string,
      language: string,
      score: number
    }]
  }
}
```

### Episodes

```typescript
// Get episode details
GET /episodes/{id}/extended
Response: {
  data: {
    id: number,
    seriesId: number,
    seasonNumber: number,
    episodeNumber: number,
    name: string,
    aired: string,
    runtime: number,
    overview: string,
    image: string
  }
}
```

### Artwork

```typescript
// Get series artwork
GET /series/{id}/artworks?type={type}
Types: 1=banner, 2=poster, 3=fanart, 11=icon, 12=clearlogo

Response: {
  data: {
    artworks: [{
      id: number,
      image: string,
      thumbnail: string,
      language: string,
      type: number,
      score: number,
      width: number,
      height: number
    }]
  }
}
```

## Artwork Types

```typescript
enum TVDBArtworkType {
  BANNER = 1,      // 758x140
  POSTER = 2,      // 680x1000
  FANART = 3,      // 1920x1080
  ICON = 11,       // Square icons
  CLEARLOGO = 12,  // Transparent logos
  CLEARART = 22,   // Character art
  THUMB = 23       // Landscape thumbs
}

function mapArtworkType(type: TVDBArtworkType): AssetType {
  switch (type) {
    case TVDBArtworkType.POSTER: return 'poster';
    case TVDBArtworkType.FANART: return 'fanart';
    case TVDBArtworkType.BANNER: return 'banner';
    case TVDBArtworkType.CLEARLOGO: return 'logo';
    default: return 'other';
  }
}
```

## Data Mapping

```typescript
function mapTVDBSeries(tvdbData: TVDBSeries): Series {
  return {
    title: tvdbData.name,
    original_title: tvdbData.originalName,
    plot: tvdbData.overview,
    first_aired: tvdbData.firstAired,
    status: mapStatus(tvdbData.status),
    tvdb_id: tvdbData.id,

    // Map network/studio
    studios: tvdbData.companies
      .filter(c => c.companyType === 1) // Network
      .map(c => c.name),

    // Map genres
    genres: tvdbData.genres.map(g => g.name),

    // Process episodes
    seasons: groupEpisodesBySeason(tvdbData.episodes)
  };
}

function mapStatus(tvdbStatus: string): string {
  const statusMap = {
    'Continuing': 'continuing',
    'Ended': 'ended',
    'Upcoming': 'upcoming'
  };
  return statusMap[tvdbStatus] || 'unknown';
}
```

## Asset Scoring

```typescript
function scoreTVDBImage(image: TVDBImage): number {
  let score = 0;

  // Base score from TVDB (0-50 points)
  // TVDB provides quality scores 0-100
  score += image.score * 0.5;

  // Resolution bonus (0-25 points)
  const pixels = image.width * image.height;
  const idealPixels = getIdealPixels(image.type);
  score += Math.min(25, (pixels / idealPixels) * 25);

  // Language preference (0-15 points)
  if (image.language === config.language) score += 15;
  if (!image.language) score += 10; // No text

  // Type-specific adjustments (0-10 points)
  if (image.type === TVDBArtworkType.POSTER) {
    const ratio = image.width / image.height;
    const idealRatio = 0.68;
    const diff = Math.abs(ratio - idealRatio);
    score += Math.max(0, 10 - (diff * 20));
  }

  return score;
}
```

## Updates API

TVDB provides an updates endpoint for efficient syncing:

```typescript
// Get updates since timestamp
GET /updates?since={unix_timestamp}&type=series&action=update
Response: {
  data: [{
    entityType: 'series',
    method: 'update',
    recordId: number,
    timeStamp: number
  }]
}

// Efficient sync
async function syncUpdates(since: Date): Promise<void> {
  const updates = await tvdb.getUpdates(since);

  for (const update of updates.data) {
    if (update.entityType === 'series') {
      const localShow = await db.series.findByTvdbId(update.recordId);
      if (localShow && localShow.monitored) {
        await jobQueue.add('enrich', {
          entity_type: 'series',
          entity_id: localShow.id,
          provider: 'tvdb'
        });
      }
    }
  }
}
```

## Error Handling

```typescript
class TVDBProvider {
  async fetchSeries(tvdbId: number): Promise<TVDBSeries> {
    const token = await this.auth.getToken();

    try {
      const response = await fetch(
        `${this.baseUrl}/series/${tvdbId}/extended?meta=episodes`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
          }
        }
      );

      if (response.status === 401) {
        // Token expired, refresh and retry
        await this.auth.authenticate();
        return this.fetchSeries(tvdbId);
      }

      if (response.status === 404) {
        throw new NotFoundError(`TVDB series ${tvdbId} not found`);
      }

      if (response.status === 429) {
        const reset = response.headers.get('X-RateLimit-Reset');
        await sleep(parseInt(reset) * 1000 - Date.now());
        return this.fetchSeries(tvdbId);
      }

      const data = await response.json();

      if (data.status === 'failure') {
        throw new ProviderError(data.message);
      }

      return data.data;

    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new ProviderError(`TVDB fetch failed: ${error.message}`);
    }
  }
}
```

## Caching Strategy

```typescript
// Cache token for 23 hours (refresh before expiry)
const TOKEN_CACHE_HOURS = 23;

// Cache series data for 24 hours
const SERIES_CACHE_HOURS = 24;

// Cache artwork indefinitely (URLs don't change)
const ARTWORK_CACHE = null;

// Episode data cache for 6 hours (air dates may update)
const EPISODE_CACHE_HOURS = 6;
```

## Language Support

TVDB supports multiple languages with fallback:

```typescript
async function fetchWithLanguageFallback(
  seriesId: number,
  languages: string[] = ['eng', 'spa', 'fra']
): Promise<TVDBSeries> {
  for (const lang of languages) {
    try {
      const data = await tvdb.fetchSeries(seriesId, lang);
      if (data.overview) return data; // Has translation
    } catch (error) {
      continue; // Try next language
    }
  }

  // Default to English
  return tvdb.fetchSeries(seriesId, 'eng');
}
```

## Best Practices

1. **Cache authentication tokens** for 23 hours
2. **Use extended endpoints** to get all data in one call
3. **Respect language preferences** with fallback
4. **Store artwork scores** for intelligent selection
5. **Use the updates API** for efficient syncing
6. **Handle token expiry** gracefully with retry

## Related Documentation

- [Enrichment Phase](../phases/ENRICHMENT.md) - How TVDB is used
- [Provider Overview](OVERVIEW.md) - Provider system architecture
- [Database Schema](../DATABASE.md) - Provider cache tables