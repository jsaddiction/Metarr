# Player Sync Phase

**Purpose**: Communicate asset changes to configured media players, triggering library updates and maintaining synchronization.

**Status**: Design phase, implementation pending

## Overview

The player sync phase ensures media players are aware of Metarr's changes. Rather than forcing full library scans, it uses targeted update commands to refresh only changed items, minimizing player load and user disruption.

## Phase Rules

1. **Idempotent**: Multiple syncs cause no harm
2. **Non-invasive**: Targeted updates, not full scans
3. **Fault-tolerant**: Failed players don't block others
4. **Configurable**: Per-player enable/disable
5. **Observable**: Reports sync status per player

## Triggers

- **Post-publish**: After successful publishing
- **Manual**: User clicks "Sync Players"
- **Scheduled**: Periodic sync (hourly/daily)
- **Bulk**: After multiple items published

## Process Flow

```
1. CHANGE COLLECTION
   ├── Identify changed items since last sync
   ├── Group by media type (movie/tv)
   ├── Apply path mappings per player
   └── Build sync commands

2. PLAYER DISCOVERY
   ├── Check player availability
   ├── Test connectivity
   ├── Verify API credentials
   └── Skip offline players

3. SYNC EXECUTION
   ├── Send update commands
   ├── Monitor completion
   ├── Handle errors gracefully
   └── Log results

4. STATE UPDATE
   ├── Mark items as synced
   ├── Update last sync timestamp
   └── Clear sync queue

5. NOTIFICATIONS
   └── Report sync results to UI
```

## Player Implementations

### Kodi (JSON-RPC)

```typescript
class KodiPlayer implements IMediaPlayer {
  async updateLibrary(items: MediaItem[]): Promise<void> {
    // Group by type for efficient updates
    const movies = items.filter(i => i.type === 'movie');
    const shows = items.filter(i => i.type === 'show');

    // Update specific paths instead of full scan
    if (movies.length > 0) {
      const paths = movies.map(m => this.mapPath(m.library_path));
      await this.rpc('VideoLibrary.Scan', {
        directory: paths,
        showdialogs: false
      });
    }

    // Clean removed items
    const removed = items.filter(i => i.deleted);
    if (removed.length > 0) {
      await this.rpc('VideoLibrary.Clean', {
        content: 'movies',
        showdialogs: false
      });
    }
  }

  async sendNotification(message: string): Promise<void> {
    await this.rpc('GUI.ShowNotification', {
      title: 'Metarr',
      message: message,
      displaytime: 5000
    });
  }

  private async rpc(method: string, params: any): Promise<any> {
    const response = await fetch(`http://${this.host}:${this.port}/jsonrpc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${this.auth}`
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: method,
        params: params,
        id: 1
      })
    });

    return response.json();
  }
}
```

### Jellyfin (REST API)

```typescript
class JellyfinPlayer implements IMediaPlayer {
  async updateLibrary(items: MediaItem[]): Promise<void> {
    // Trigger library scan for specific folders
    const folders = this.groupByFolder(items);

    for (const folder of folders) {
      await this.api.post('/Library/Media/Updated', {
        Updates: [{
          Path: this.mapPath(folder),
          UpdateType: 'Modified'
        }]
      });
    }

    // Refresh metadata for specific items
    for (const item of items) {
      if (item.jellyfin_id) {
        await this.api.post(`/Items/${item.jellyfin_id}/Refresh`, {
          Recursive: false,
          ImageRefreshMode: 'Default',
          MetadataRefreshMode: 'Default'
        });
      }
    }
  }

  async sendNotification(message: string): Promise<void> {
    // Send to all active sessions
    const sessions = await this.api.get('/Sessions');

    for (const session of sessions) {
      await this.api.post('/Sessions/' + session.Id + '/Message', {
        Header: 'Metarr Update',
        Text: message,
        TimeoutMs: 5000
      });
    }
  }
}
```

### Plex (REST API)

```typescript
class PlexPlayer implements IMediaPlayer {
  async updateLibrary(items: MediaItem[]): Promise<void> {
    // Get library sections
    const sections = await this.api.get('/library/sections');

    // Find relevant sections for our items
    const movieSection = sections.find(s => s.type === 'movie');
    const showSection = sections.find(s => s.type === 'show');

    // Partial scan with specific paths
    for (const item of items) {
      const section = item.type === 'movie' ? movieSection : showSection;
      if (section) {
        await this.api.put(`/library/sections/${section.key}/refresh`, {
          path: this.mapPath(item.library_path)
        });
      }
    }
  }

  async analyzeMedia(items: MediaItem[]): Promise<void> {
    // Trigger deep media analysis for updated items
    for (const item of items) {
      if (item.plex_id) {
        await this.api.put(`/library/metadata/${item.plex_id}/analyze`);
      }
    }
  }
}
```

## Path Mapping

```typescript
interface PathMapping {
  metarr_path: string;      // Path as Metarr sees it
  player_path: string;      // Path as player sees it
  player_id: number;        // Which player this applies to
}

function mapPath(localPath: string, player: MediaPlayer): string {
  const mapping = db.path_mappings.findOne({
    player_id: player.id,
    metarr_path: { $startsWith: localPath }
  });

  if (mapping) {
    return localPath.replace(mapping.metarr_path, mapping.player_path);
  }

  return localPath;  // No mapping, use as-is
}

// Examples:
// Metarr sees: /data/media/movies/The Matrix (1999)/
// Kodi sees:   smb://nas/movies/The Matrix (1999)/
// Plex sees:   /media/movies/The Matrix (1999)/
```

## Player Groups

```typescript
interface PlayerGroup {
  id: number;
  name: string;              // "Living Room Kodis"
  players: MediaPlayer[];     // Array of players in group
  sync_mode: 'parallel' | 'sequential';
  continue_on_error: boolean;
}

async function syncPlayerGroup(group: PlayerGroup, items: MediaItem[]): Promise<void> {
  if (group.sync_mode === 'parallel') {
    // Sync all players simultaneously
    await Promise.allSettled(
      group.players.map(player => syncPlayer(player, items))
    );
  } else {
    // Sync one by one
    for (const player of group.players) {
      try {
        await syncPlayer(player, items);
      } catch (error) {
        if (!group.continue_on_error) throw error;
        console.error(`Player ${player.name} failed:`, error);
      }
    }
  }
}
```

## Configuration

```typescript
interface PlayerSyncConfig {
  // Global settings
  enabled: boolean;           // Master sync toggle
  autoSync: boolean;          // Sync after publishing
  syncInterval: number;       // Minutes between syncs (0=disabled)

  // Behavior
  targetedUpdates: boolean;   // Use path-specific updates
  cleanDeleted: boolean;      // Remove deleted items
  sendNotifications: boolean; // Show player notifications

  // Performance
  batchSize: number;          // Items per sync batch (100)
  timeout: number;            // Player timeout in ms (30000)
  retryAttempts: number;      // Retry failed syncs (3)

  // Player-specific
  players: {
    [id: number]: {
      enabled: boolean;
      priority: number;       // Sync order
      pathMapping?: PathMapping;
    }
  };
}
```

## Error Handling

- **Player offline**: Mark as failed, continue with others
- **Authentication failed**: Disable player, alert user
- **Timeout**: Retry with exponential backoff
- **Partial failure**: Log specifics, report summary
- **Network error**: Queue for retry in next cycle

## Performance Optimizations

- **Batch updates**: Group multiple items per API call
- **Incremental sync**: Track last sync time per player
- **Smart detection**: Only sync actual changes
- **Parallel groups**: Sync independent players simultaneously
- **Connection pooling**: Reuse HTTP connections

## Sync State Tracking

```sql
-- Track sync status per player
CREATE TABLE player_sync_status (
  id INTEGER PRIMARY KEY,
  player_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  item_type TEXT NOT NULL,     -- 'movie', 'show', 'episode'
  last_synced TIMESTAMP,
  sync_status TEXT,             -- 'pending', 'synced', 'failed'
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  UNIQUE(player_id, item_id, item_type)
);

-- Sync queue for batch processing
CREATE TABLE sync_queue (
  id INTEGER PRIMARY KEY,
  player_group_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP,
  item_ids TEXT,               -- JSON array of items
  status TEXT                  -- 'pending', 'processing', 'completed'
);
```

## Monitoring & Metrics

```typescript
interface SyncMetrics {
  total_syncs: number;
  successful_syncs: number;
  failed_syncs: number;
  average_sync_time: number;
  last_sync_timestamp: Date;
  items_per_second: number;

  by_player: {
    [player_id: number]: {
      success_rate: number;
      average_response_time: number;
      last_error?: string;
    }
  };
}
```

## Related Documentation

- [Kodi Player](../players/KODI.md) - Kodi JSON-RPC details
- [Jellyfin Player](../players/JELLYFIN.md) - Jellyfin REST API
- [Plex Player](../players/PLEX.md) - Plex Media Server API
- [Database Schema](../DATABASE.md) - Player configuration tables
- [API Architecture](../API.md) - Player sync endpoints

## Next Phase

Player sync is typically the final phase in the automation chain. The [Verification Phase](VERIFICATION.md) runs independently on schedule.