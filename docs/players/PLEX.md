# Plex Player

**API Version**: v2
**Documentation**: https://www.plexapp.com/developer/

## Overview

Plex Media Server provides a comprehensive REST API for library management, metadata updates, and playback control. Metarr integrates with Plex to maintain synchronized metadata and trigger targeted library updates.

## Configuration

```typescript
interface PlexConfig {
  host: string;                // Hostname or IP
  port: number;                // Default: 32400
  token: string;               // X-Plex-Token (required)
  https: boolean;              // Use HTTPS
  clientIdentifier: string;    // UUID for this client
  product: string;             // "Metarr"
  version: string;             // "1.0.0"
  device: string;              // "Metarr Server"
}
```

## Authentication

### Getting a Plex Token

```typescript
// Option 1: Username/Password authentication
async function getPlexToken(username: string, password: string): Promise<string> {
  const response = await fetch('https://plex.tv/users/sign_in.json', {
    method: 'POST',
    headers: {
      'X-Plex-Client-Identifier': uuid(),
      'X-Plex-Product': 'Metarr',
      'X-Plex-Version': '1.0.0'
    },
    body: JSON.stringify({
      user: {
        login: username,
        password: password
      }
    })
  });

  const data = await response.json();
  return data.user.authToken;
}

// Option 2: PIN-based authentication
async function getPlexPin(): Promise<PlexPin> {
  const response = await fetch('https://plex.tv/pins.json', {
    method: 'POST',
    headers: getPlexHeaders()
  });

  return response.json();
  // User authorizes at: https://app.plex.tv/auth#?code={pin.code}
  // Then poll GET /pins/{id} until authorized
}
```

### Request Headers

```typescript
function getPlexHeaders(): Headers {
  return {
    'X-Plex-Token': config.token,
    'X-Plex-Client-Identifier': config.clientIdentifier,
    'X-Plex-Product': config.product,
    'X-Plex-Version': config.version,
    'X-Plex-Device': config.device,
    'Accept': 'application/json'
  };
}
```

## Key Endpoints

### Library Sections

```typescript
// Get all library sections
GET /library/sections
Response: {
  MediaContainer: {
    Directory: [{
      key: string,           // Section ID
      type: string,          // 'movie', 'show', 'artist'
      title: string,         // Library name
      location: [{
        id: number,
        path: string         // Filesystem path
      }],
      refreshing: boolean
    }]
  }
}

// Refresh library section
GET /library/sections/{sectionId}/refresh

// Partial scan specific path
GET /library/sections/{sectionId}/refresh?path={encodedPath}

// Get items in section
GET /library/sections/{sectionId}/all
```

### Metadata API

```typescript
// Get metadata by path
GET /library/sections/{sectionId}/all?path={path}

// Get item metadata
GET /library/metadata/{ratingKey}
Response: {
  MediaContainer: {
    Metadata: [{
      ratingKey: string,
      guid: string,          // plex://movie/5d776b2e88a0f1001f2ec767
      type: 'movie',
      title: string,
      originalTitle: string,
      summary: string,
      rating: number,
      year: number,
      Media: [{              // Media files
        Part: [{
          file: string       // File path
        }]
      }]
    }]
  }
}

// Update metadata
PUT /library/metadata/{ratingKey}
Query params:
  - title={title}
  - originalTitle={originalTitle}
  - summary={summary}
  - rating={rating}
  - year={year}

// Match to agent (TMDB/TVDB)
PUT /library/metadata/{ratingKey}/match
Query params:
  - guid=com.plexapp.agents.themoviedb://{tmdbId}
  - name={title}
```

### Image Management

```typescript
// Upload poster
PUT /library/metadata/{ratingKey}/posters
Query params:
  - url={imageUrl}    // Remote URL
  OR
POST /library/metadata/{ratingKey}/posters
Body: Binary image data

// Upload art (fanart/background)
PUT /library/metadata/{ratingKey}/arts
Query params:
  - url={imageUrl}

// Select active poster/art
PUT /library/metadata/{ratingKey}
Query params:
  - includeExternalMedia=1
  - thumb={posterRatingKey}  // Select specific poster
  - art={artRatingKey}       // Select specific art
```

### Webhooks

```typescript
// Plex webhooks configuration (via web UI or API)
POST /:/websockets/listen
WebSocket message format: {
  NotificationContainer: {
    type: string,
    PlaySessionStateNotification?: [{
      sessionKey: string,
      state: 'playing' | 'paused' | 'stopped'
    }],
    ActivityNotification?: [{
      event: 'ended',
      Activity: {
        type: 'library.refresh.items'
      }
    }]
  }
}
```

## Library Sync Implementation

```typescript
class PlexPlayer implements IMediaPlayer {
  async updateLibrary(items: MediaItem[]): Promise<void> {
    // Get library sections
    const sections = await this.getSections();

    // Group items by section
    const itemsBySection = this.groupBySection(items, sections);

    for (const [sectionId, sectionItems] of itemsBySection) {
      if (config.targetedScan) {
        // Targeted path scanning (efficient)
        await this.scanPaths(sectionId, sectionItems);
      } else {
        // Full section refresh (slower)
        await this.refreshSection(sectionId);
      }
    }
  }

  private async scanPaths(
    sectionId: string,
    items: MediaItem[]
  ): Promise<void> {
    // Plex supports scanning specific paths
    for (const item of items) {
      const plexPath = this.mapPath(item.library_path);
      const encodedPath = encodeURIComponent(plexPath);

      await this.api.get(
        `/library/sections/${sectionId}/refresh?path=${encodedPath}`
      );
    }
  }

  private async refreshSection(sectionId: string): Promise<void> {
    await this.api.get(`/library/sections/${sectionId}/refresh`);

    // Monitor refresh status
    await this.waitForRefreshComplete(sectionId);
  }

  private async waitForRefreshComplete(sectionId: string): Promise<void> {
    let refreshing = true;
    let attempts = 0;

    while (refreshing && attempts < 60) {
      const sections = await this.getSections();
      const section = sections.find(s => s.key === sectionId);

      refreshing = section?.refreshing || false;

      if (refreshing) {
        await sleep(5000);
        attempts++;
      }
    }
  }
}
```

## Metadata Matching

```typescript
async function matchMovieToAgent(
  movie: Movie,
  plexItem: PlexMetadata
): Promise<void> {
  // Match to TMDB
  if (movie.tmdb_id) {
    await plex.put(`/library/metadata/${plexItem.ratingKey}/match`, {
      guid: `com.plexapp.agents.themoviedb://${movie.tmdb_id}`,
      name: movie.title
    });
  }

  // Update metadata fields
  await plex.put(`/library/metadata/${plexItem.ratingKey}`, {
    title: movie.title,
    originalTitle: movie.original_title,
    summary: movie.plot,
    rating: movie.rating,
    year: movie.year,
    tagline: movie.tagline,

    // Genres (pipe-separated)
    genre: movie.genres.map(g => g.name).join('|'),

    // Directors (pipe-separated)
    director: movie.directors.map(d => d.name).join('|'),

    // Writers (pipe-separated)
    writer: movie.writers.map(w => w.name).join('|')
  });
}
```

## Advanced Metadata

```typescript
// Analyze media files (deep analysis)
PUT /library/metadata/{ratingKey}/analyze

// Fix match (re-match to agent)
PUT /library/metadata/{ratingKey}/unmatch
PUT /library/metadata/{ratingKey}/match?guid={guid}

// Refresh metadata from agent
PUT /library/metadata/{ratingKey}/refresh

// Get available agents
GET /system/agents
Response: {
  MediaContainer: {
    Agent: [{
      name: string,
      identifier: string,   // com.plexapp.agents.themoviedb
      primary: boolean
    }]
  }
}
```

## Path Mapping

```typescript
function mapMetarrToPlex(metarrPath: string): string {
  // Plex may see different paths than Metarr
  const mapping = config.pathMappings.find(m =>
    metarrPath.startsWith(m.metarr_path)
  );

  if (mapping) {
    return metarrPath.replace(
      mapping.metarr_path,
      mapping.plex_path
    );
  }

  return metarrPath;
}

// Example mappings:
// Metarr:  /data/media/movies/The Matrix (1999)/
// Plex:    /movies/The Matrix (1999)/   (Docker volume mount)
```

## Error Handling

```typescript
class PlexProvider {
  async request(method: string, endpoint: string, options?: any): Promise<any> {
    try {
      const url = this.buildUrl(endpoint);
      const response = await fetch(url, {
        method,
        headers: getPlexHeaders(),
        ...options
      });

      if (response.status === 401) {
        throw new AuthError('Invalid Plex token');
      }

      if (response.status === 404) {
        return null; // Item not found is common
      }

      if (!response.ok) {
        const error = await response.text();
        throw new PlayerError(`Plex error ${response.status}: ${error}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        return response.json();
      }

      return response.text();

    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new PlayerError('Plex server unavailable');
      }
      throw error;
    }
  }
}
```

## Performance Optimization

```typescript
interface PlexOptimization {
  // Scanning strategy
  targetedScan: true,         // Path-specific vs full section
  parallelScans: 3,           // Concurrent scan operations

  // Metadata updates
  batchMetadata: false,       // Plex doesn't support batch
  asyncRefresh: true,         // Don't wait for completion

  // Connection
  keepAlive: true,
  timeout: 30000,

  // Caching
  cacheSections: true,        // Cache library sections
  cacheExpiry: 3600000       // 1 hour
}

async function optimizedUpdate(items: MediaItem[]): Promise<void> {
  // Sort by section to minimize section lookups
  const sorted = items.sort((a, b) =>
    a.section_id.localeCompare(b.section_id)
  );

  // Process in parallel up to limit
  const chunks = chunk(sorted, config.parallelScans);
  for (const chunk of chunks) {
    await Promise.all(
      chunk.map(item => plex.scanPath(item))
    );
  }
}
```

## Activity Monitoring

```typescript
// Get current activity
GET /activities
Response: {
  MediaContainer: {
    Activity: [{
      uuid: string,
      type: string,           // 'library.refresh.items'
      cancellable: boolean,
      userID: number,
      title: string,
      subtitle: string,
      progress: number        // 0-100
    }]
  }
}

// Cancel activity
DELETE /activities/{uuid}

// Monitor refresh progress
async function monitorRefresh(activityId: string): Promise<void> {
  let activity;

  do {
    const activities = await plex.get('/activities');
    activity = activities.MediaContainer.Activity.find(
      a => a.uuid === activityId
    );

    if (activity) {
      console.log(`Refresh progress: ${activity.progress}%`);
      await sleep(1000);
    }
  } while (activity);
}
```

## Best Practices

1. **Use targeted path scans** for efficiency
2. **Match to agents** (TMDB/TVDB) for better metadata
3. **Cache library sections** to reduce API calls
4. **Monitor activities** for long-running operations
5. **Handle token expiry** with re-authentication
6. **Map paths correctly** for Docker/network setups
7. **Respect rate limits** (no official limits, but be reasonable)

## Plex-Specific Features

```typescript
interface PlexFeatures {
  // Collections
  collections: {
    create: true,
    autoCollections: true,    // Automatic based on metadata
    smartCollections: true    // Filter-based collections
  },

  // Intro detection
  intros: {
    detect: true,
    skip: true
  },

  // Thumbnails
  thumbnails: {
    generate: true,           // Video thumbnails
    interval: 'auto'          // Auto or specific seconds
  },

  // Streaming
  transcoding: true,
  optimizedVersions: true,
  bandwidth: 'unlimited'
}
```

## Related Documentation

- [Player Sync Phase](../phases/PLAYER_SYNC.md) - How Plex is integrated
- [Path Mapping](../technical/PATH_MAPPING.md) - Path translation details