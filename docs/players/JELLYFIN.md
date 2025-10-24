# Jellyfin Player

**API Version**: 10.8+
**Documentation**: https://api.jellyfin.org/

## Overview

Jellyfin is a free and open-source media server that provides a REST API for library management and playback control. Metarr integrates with Jellyfin to trigger library scans and update metadata.

## Configuration

```typescript
interface JellyfinConfig {
  host: string;                // Hostname or IP
  port: number;                // Default: 8096
  apiKey: string;              // Required for authentication
  userId?: string;             // Optional user ID
  deviceId: string;            // Unique device identifier
  deviceName: string;          // "Metarr"
  https: boolean;              // Use HTTPS
}
```

## Authentication

Jellyfin uses API key authentication:

```typescript
class JellyfinAuth {
  getHeaders(): Headers {
    return {
      'X-Emby-Token': this.apiKey,
      'X-Emby-Client': 'Metarr',
      'X-Emby-Device-Name': this.deviceName,
      'X-Emby-Device-Id': this.deviceId,
      'X-Emby-Client-Version': '1.0.0'
    };
  }

  buildUrl(endpoint: string): string {
    const protocol = this.https ? 'https' : 'http';
    return `${protocol}://${this.host}:${this.port}${endpoint}`;
  }
}
```

## Key Endpoints

### Library Management

```typescript
// Get all libraries
GET /Library/VirtualFolders
Response: [{
  Name: string,
  Locations: string[],
  CollectionType: string,  // 'movies', 'tvshows', 'music'
  ItemId: string,
  RefreshStatus: string
}]

// Refresh specific library
POST /Library/Refresh
Body: {
  Recursive: boolean,
  ItemId?: string        // Optional specific library ID
}

// Scan specific path
POST /Library/Media/Updated
Body: {
  Updates: [{
    Path: string,
    UpdateType: 'Created' | 'Modified' | 'Deleted'
  }]
}
```

### Items API

```typescript
// Get item by path
GET /Items?Path={path}&Recursive=false
Response: {
  Items: [{
    Id: string,
    Name: string,
    Path: string,
    Type: string,
    MediaType: string
  }]
}

// Update item metadata
POST /Items/{ItemId}
Body: {
  Name: string,
  Overview: string,
  PremiereDate: string,
  CommunityRating: number,
  Genres: string[],
  Studios: { Name: string }[],
  People: [{
    Name: string,
    Role: string,
    Type: 'Actor' | 'Director' | 'Writer'
  }]
}

// Refresh metadata for item
POST /Items/{ItemId}/Refresh
Query: {
  Recursive: boolean,
  ImageRefreshMode: 'Default' | 'FullRefresh',
  MetadataRefreshMode: 'Default' | 'FullRefresh',
  ReplaceAllImages: boolean,
  ReplaceAllMetadata: boolean
}
```

### Image Management

```typescript
// Upload image for item
POST /Items/{ItemId}/Images/{ImageType}
Headers: {
  'Content-Type': 'image/jpeg'
}
Body: Binary image data

// Image types
enum JellyfinImageType {
  Primary = 'Primary',      // Poster
  Art = 'Art',
  Backdrop = 'Backdrop',    // Fanart
  Banner = 'Banner',
  Logo = 'Logo',
  Thumb = 'Thumb',
  Disc = 'Disc',
  Chapter = 'Chapter',
  Screenshot = 'Screenshot'
}

// Delete image
DELETE /Items/{ItemId}/Images/{ImageType}/{ImageIndex}
```

### Sessions & Notifications

```typescript
// Get active sessions
GET /Sessions
Response: [{
  Id: string,
  UserId: string,
  UserName: string,
  Client: string,
  DeviceId: string,
  DeviceName: string,
  PlayState: {
    IsPaused: boolean,
    PositionTicks: number
  }
}]

// Send notification to session
POST /Sessions/{SessionId}/Message
Body: {
  Header: string,
  Text: string,
  TimeoutMs: number
}
```

## Library Sync Implementation

```typescript
class JellyfinPlayer implements IMediaPlayer {
  async updateLibrary(items: MediaItem[]): Promise<void> {
    // Group items by library
    const libraries = this.groupByLibrary(items);

    for (const [libraryId, libraryItems] of libraries) {
      // Option 1: Targeted path updates (preferred)
      await this.updatePaths(libraryItems);

      // Option 2: Full library refresh (fallback)
      if (this.config.fullRefresh) {
        await this.refreshLibrary(libraryId);
      }
    }
  }

  private async updatePaths(items: MediaItem[]): Promise<void> {
    const updates = items.map(item => ({
      Path: this.mapPath(item.library_path),
      UpdateType: item.deleted ? 'Deleted' : 'Modified'
    }));

    await this.api.post('/Library/Media/Updated', {
      Updates: updates
    });
  }

  private async refreshLibrary(libraryId: string): Promise<void> {
    await this.api.post('/Library/Refresh', {
      Recursive: true,
      ItemId: libraryId
    });

    // Monitor refresh progress
    await this.waitForRefreshComplete(libraryId);
  }

  private async waitForRefreshComplete(libraryId: string): Promise<void> {
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes

    while (attempts < maxAttempts) {
      const libraries = await this.api.get('/Library/VirtualFolders');
      const library = libraries.find(l => l.ItemId === libraryId);

      if (library?.RefreshStatus === 'Idle') {
        return;
      }

      await sleep(5000);
      attempts++;
    }

    throw new Error('Library refresh timeout');
  }
}
```

## Metadata Sync

```typescript
async function syncMovieToJellyfin(movie: Movie): Promise<void> {
  // Find item by path
  const items = await jellyfin.getItemsByPath(movie.file_path);
  if (items.length === 0) return;

  const jellyfinItem = items[0];

  // Update metadata
  await jellyfin.updateItem(jellyfinItem.Id, {
    Name: movie.title,
    OriginalTitle: movie.original_title,
    Overview: movie.plot,
    PremiereDate: movie.release_date,
    CommunityRating: movie.rating,
    RunTimeTicks: movie.runtime * 600000000, // Convert to ticks

    // Genres
    Genres: movie.genres.map(g => g.name),

    // Studios
    Studios: movie.studios.map(s => ({ Name: s.name })),

    // People
    People: [
      ...movie.cast.map(person => ({
        Name: person.name,
        Role: person.character,
        Type: 'Actor'
      })),
      ...movie.directors.map(person => ({
        Name: person.name,
        Type: 'Director'
      }))
    ],

    // External IDs
    ProviderIds: {
      Tmdb: movie.tmdb_id?.toString(),
      Imdb: movie.imdb_id
    }
  });

  // Upload images
  if (movie.poster_path) {
    await uploadImage(jellyfinItem.Id, 'Primary', movie.poster_path);
  }
  if (movie.fanart_path) {
    await uploadImage(jellyfinItem.Id, 'Backdrop', movie.fanart_path);
  }
}
```

## Path Mapping

```typescript
function mapMetarrToJellyfin(metarrPath: string): string {
  // Get configured path mapping
  const mapping = config.pathMappings.find(m =>
    metarrPath.startsWith(m.metarr_path)
  );

  if (mapping) {
    return metarrPath.replace(
      mapping.metarr_path,
      mapping.jellyfin_path
    );
  }

  return metarrPath;
}

// Example mappings:
// Metarr:   /data/media/movies/The Matrix (1999)/
// Jellyfin: /media/movies/The Matrix (1999)/
```

## Error Handling

```typescript
class JellyfinProvider {
  async request(method: string, endpoint: string, body?: any): Promise<any> {
    try {
      const response = await fetch(this.buildUrl(endpoint), {
        method,
        headers: {
          ...this.getHeaders(),
          'Content-Type': 'application/json'
        },
        body: body ? JSON.stringify(body) : undefined
      });

      if (response.status === 401) {
        throw new AuthError('Invalid Jellyfin API key');
      }

      if (response.status === 404) {
        throw new NotFoundError(`Jellyfin endpoint not found: ${endpoint}`);
      }

      if (!response.ok) {
        const error = await response.text();
        throw new PlayerError(`Jellyfin error: ${error}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        return response.json();
      }

      return response.text();

    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new PlayerError('Jellyfin server unavailable');
      }
      throw error;
    }
  }
}
```

## Performance Optimization

```typescript
interface JellyfinOptimization {
  // Batch operations
  batchSize: 50,              // Items per update call

  // Connection pooling
  keepAlive: true,
  maxSockets: 10,

  // Caching
  cacheLibraries: true,       // Cache library IDs
  cacheTTL: 3600000,         // 1 hour

  // Scan strategy
  targetedScans: true,        // Use path updates vs full scan
  parallelUpdates: 3          // Concurrent update calls
}

async function batchUpdateItems(items: MediaItem[]): Promise<void> {
  const chunks = chunk(items, config.batchSize);

  await Promise.all(
    chunks.slice(0, config.parallelUpdates).map(chunk =>
      jellyfin.updatePaths(chunk)
    )
  );
}
```

## WebSocket Support

Jellyfin also supports WebSocket for real-time updates:

```typescript
class JellyfinWebSocket {
  private ws: WebSocket;

  connect(): void {
    const wsUrl = `ws://${this.host}:${this.port}/socket`;

    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => {
      // Authenticate
      this.send({
        MessageType: 'Authenticate',
        Data: this.apiKey
      });
    });

    this.ws.on('message', (data) => {
      const message = JSON.parse(data);
      this.handleMessage(message);
    });
  }

  private handleMessage(message: any): void {
    switch (message.MessageType) {
      case 'LibraryChanged':
        // Library was modified
        this.emit('library:changed', message.Data);
        break;

      case 'UserDataChanged':
        // Playback state changed
        this.emit('playback:changed', message.Data);
        break;
    }
  }
}
```

## Best Practices

1. **Use targeted path updates** instead of full library scans
2. **Cache library IDs** to avoid repeated lookups
3. **Batch multiple updates** in single API calls
4. **Monitor refresh status** when triggering scans
5. **Handle connection failures** gracefully
6. **Map paths correctly** between Metarr and Jellyfin

## Related Documentation

- [Player Sync Phase](../phases/PLAYER_SYNC.md) - How Jellyfin is integrated
- [Path Mapping](../technical/PATH_MAPPING.md) - Path translation details