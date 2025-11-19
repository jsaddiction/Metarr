# Player Sync Phase

**Purpose**: Communicate asset changes to configured media players, triggering library updates and maintaining synchronization.

**Related Docs**:
- Parent: [Phase Overview](OVERVIEW.md)
- Related: [Kodi Player](../players/KODI.md), [Jellyfin Player](../players/JELLYFIN.md), [Plex Player](../players/PLEX.md)

## Quick Reference

- **Terminal phase**: Last phase in the automation chain
- **Targeted updates**: Refreshes only changed items, not full library scans
- **Idempotent**: Multiple syncs cause no harm
- **Fault-tolerant**: Failed players don't block others
- **Configurable**: Per-player enable/disable
- **Observable**: Reports sync status per player

---

## Overview

The player sync phase ensures media players are aware of Metarr's changes. Rather than forcing full library scans, it uses targeted update commands to refresh only changed items, minimizing player load and user disruption.

**Status**: ⚠️ Partial implementation. Media player updates are handled via `MediaPlayerConnectionManager` but not yet integrated as a dedicated workflow phase.

---

## Triggers

| Trigger Type | Description | Priority |
|--------------|-------------|----------|
| **Post-publish** | After successful publishing | 5 (NORMAL) |
| **Manual** | User clicks "Sync Players" | 10 (HIGH) |
| **Bulk** | User-driven bulk selection | 10 (HIGH) |

---

## Process Flow

```
1. CHANGE COLLECTION
   ├── Identify changed items from job payload
   ├── Group by media type (movie/tv)
   ├── Apply path mappings per player
   └── Build sync commands

2. PLAYER DISCOVERY
   ├── Check player availability
   ├── Test connectivity
   ├── Verify API credentials
   ├── Wait for active playback to stop before scanning
   └── Skip offline players

3. SYNC EXECUTION
   ├── Send update commands
   ├── Handle errors gracefully
   └── Log results

4. STATE UPDATE
   ├── Update last sync timestamp
   ├── Clear sync job
   └── Report sync results to UI
```

---

## Player Implementations

### Kodi (JSON-RPC)

**Method**: HTTP POST to `/jsonrpc` endpoint

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
        showdialogs: false,
      });
    }

    // Clean removed items
    const removed = items.filter(i => i.deleted);
    if (removed.length > 0) {
      await this.rpc('VideoLibrary.Clean', {
        content: 'movies',
        showdialogs: false,
      });
    }
  }

  private async rpc(method: string, params: any): Promise<any> {
    const response = await fetch(`http://${this.host}:${this.port}/jsonrpc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${this.auth}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: method,
        params: params,
        id: 1,
      }),
    });

    return response.json();
  }
}
```

**See**: [Kodi Player Reference](../players/KODI.md) for complete JSON-RPC API.

### Jellyfin (REST API)

**Method**: HTTP POST to `/Library/Media/Updated` endpoint

```typescript
class JellyfinPlayer implements IMediaPlayer {
  async updateLibrary(items: MediaItem[]): Promise<void> {
    // Trigger library scan for specific folders
    const folders = this.groupByFolder(items);

    for (const folder of folders) {
      await this.api.post('/Library/Media/Updated', {
        Updates: [
          {
            Path: this.mapPath(folder),
            UpdateType: 'Modified',
          },
        ],
      });
    }

    // Refresh metadata for specific items
    for (const item of items) {
      if (item.jellyfin_id) {
        await this.api.post(`/Items/${item.jellyfin_id}/Refresh`, {
          Recursive: false,
          ImageRefreshMode: 'Default',
          MetadataRefreshMode: 'Default',
        });
      }
    }
  }
}
```

**See**: [Jellyfin Player Reference](../players/JELLYFIN.md) for complete REST API.

### Plex (REST API)

**Method**: HTTP PUT to `/library/sections/{key}/refresh` endpoint

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
          path: this.mapPath(item.library_path),
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

**See**: [Plex Player Reference](../players/PLEX.md) for complete API.

---

## Path Mapping

Players often see media at different paths than Metarr (Docker volumes, network shares, etc.).

```typescript
interface PathMapping {
  metarr_path: string; // Path as Metarr sees it
  player_path: string; // Path as player sees it
  player_id: number;   // Which player this applies to
}

function mapPath(localPath: string, player: MediaPlayer): string {
  const mapping = db.path_mappings.findOne({
    player_id: player.id,
    metarr_path: { $startsWith: localPath },
  });

  if (mapping) {
    return localPath.replace(mapping.metarr_path, mapping.player_path);
  }

  return localPath; // No mapping, use as-is
}
```

**Examples**:
- **Metarr sees**: `/data/media/movies/The Matrix (1999)/`
- **Kodi sees**: `smb://nas/movies/The Matrix (1999)/`
- **Plex sees**: `/media/movies/The Matrix (1999)/`

---

## Player Groups

Players can be organized into groups for batch synchronization.

```typescript
interface PlayerGroup {
  id: number;
  name: string; // "Living Room Kodis"
  players: MediaPlayer[];
  sync_mode: 'parallel' | 'sequential';
  continue_on_error: boolean;
}

async function syncPlayerGroup(group: PlayerGroup, items: MediaItem[]): Promise<void> {
  if (group.sync_mode === 'parallel') {
    // Sync all players simultaneously
    await Promise.allSettled(group.players.map(player => syncPlayer(player, items)));
  } else {
    // Sync one by one
    for (const player of group.players) {
      try {
        await syncPlayer(player, items);
      } catch (error) {
        if (!group.continue_on_error) throw error;
        logger.error(`Player ${player.name} failed:`, error);
      }
    }
  }
}
```

---

## Sync Strategies

### Partial Scan (Recommended)

Only scan directories that changed:
- **Kodi**: `VideoLibrary.Scan({ directory: "/path/to/movie" })`
- **Jellyfin**: `POST /Library/Media/Updated` with specific paths
- **Plex**: `PUT /library/sections/{key}/refresh` with path parameter

**Benefits**: Fast, low CPU usage, minimal disruption to playback

### Full Library Scan (Fallback)

Scan entire library when partial scan fails:
- **Kodi**: `VideoLibrary.Scan()` (no directory parameter)
- **Jellyfin**: `POST /Library/Refresh/{libraryId}`
- **Plex**: `PUT /library/sections/{key}/refresh` (no path parameter)

**Drawbacks**: Slow, high CPU usage, can interrupt playback

---

## Configuration

```typescript
interface PlayerSyncConfig {
  // Global settings
  enabled: boolean; // Master sync toggle
  autoSync: boolean; // Sync after publishing

  // Player-specific
  players: {
    [id: number]: {
      enabled: boolean;
      priority: number; // Sync order
      pathMapping?: PathMapping;
    };
  };
}
```

**Configuration via UI**: Settings → Players → Sync Configuration
**Configuration via API**: `GET/PATCH /api/v1/settings/player-sync`

---

## Error Handling

| Error Type | Behavior |
|------------|----------|
| **Player offline** | Mark as failed, continue with others |
| **Authentication failed** | Disable player, alert user |
| **Timeout** | Retry with exponential backoff |
| **Partial failure** | Log specifics, report summary |
| **Network error** | Queue for retry in next cycle |

---

## Performance Optimizations

- **Parallel groups**: Sync independent players simultaneously
- **Connection pooling**: Reuse HTTP connections
- **Debouncing**: Batch multiple updates within 30 seconds
- **Skip during playback**: Wait for active playback to stop (Kodi only)

---

## Job Outputs

Upon successful player sync completion:

1. **Player sync timestamps updated**:
   - `media_player_groups.last_sync_at` updated with current timestamp

2. **Progress events emitted** (WebSocket):
   - `player_sync.progress`: Real-time sync progress
   - `player_sync.complete`: Final counts and duration
   - `player_sync.error`: Per-player errors (non-fatal)

3. **Optional notification job created**:
   - If notification phase configured for `player_sync_completed` events
   - See [Notification Phase](NOTIFICATION.md)

---

## Implementation Status

**Current Status**: ⚠️ Partial

- `MediaPlayerConnectionManager` exists and handles player connections
- Player API clients implemented (Kodi, Jellyfin, Plex)
- Path mapping service implemented
- **Missing**: Integration as a dedicated job-driven workflow phase
- **Workaround**: Manual player sync from UI works, automated post-publish sync not yet implemented

**Roadmap**: Full integration as a workflow phase planned for future release.

---

## Next Phase

Player sync is the **terminal phase** in the automation chain. It does not create additional phase jobs.

However, it may optionally create a [Notification](NOTIFICATION.md) job to report workflow completion. This runs independently and does not block chain completion.

**Chain**: Scan → Enrichment → Publishing → Player Sync (terminal)

---

## See Also

- [Phase Overview](OVERVIEW.md) - Phase system architecture
- [Publishing Phase](PUBLISHING.md) - Asset deployment
- [Kodi Player](../players/KODI.md) - Kodi JSON-RPC details
- [Jellyfin Player](../players/JELLYFIN.md) - Jellyfin REST API
- [Plex Player](../players/PLEX.md) - Plex Media Server API
- [Database Schema](../architecture/DATABASE.md) - Player configuration tables
- [Notification Phase](NOTIFICATION.md) - Workflow completion notifications
