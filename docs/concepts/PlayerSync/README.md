# Player Sync

Player sync communicates asset changes to configured media players, triggering targeted library updates rather than full scans.

## What is Player Sync?

Given published assets in the library, player sync:

1. **Discovers** available media players
2. **Maps** Metarr paths to player-visible paths
3. **Notifies** each player of changed content
4. **Reports** sync status and any failures

```
INPUT: Published assets in library directory
    │
    └──► PLAYER SYNC
              │
              ├──► Step 1: COLLECT CHANGES
              │         └──► Identify changed items from job payload
              │         └──► Group by media type (movie/tv)
              │         └──► Apply path mappings per player
              │
              ├──► Step 2: DISCOVER PLAYERS
              │         └──► Check player availability
              │         └──► Test connectivity
              │         └──► Skip offline players
              │
              ├──► Step 3: SYNC EXECUTION
              │         └──► Send targeted update commands
              │         └──► Handle errors gracefully
              │         └──► Wait for active playback (Kodi)
              │
              └──► Step 4: REPORT STATUS
                        └──► Update sync timestamps
                        └──► Emit WebSocket events
                        └──► Optional notification job

OUTPUT: Media players aware of library changes
```

## Why Player Sync?

Player sync bridges the gap between Metarr's library management and media player awareness.

**Without player sync:**
- Users must manually refresh player libraries
- Full library scans waste resources
- Players show stale metadata

**With player sync:**
- Targeted updates (single directory, not full scan)
- Minimal player CPU usage
- Immediate visibility of changes

## Supported Players

| Player | Status | Protocol | Sync Type | Active Detection |
|--------|--------|----------|-----------|------------------|
| **Kodi** | ✅ Full | JSON-RPC v12 | Push (item-level) | ✅ |
| **Jellyfin** | ⚠️ Partial | REST API | Pull (library-level) | ❌ |
| **Plex** | ⚠️ Partial | Media Server API | Pull (library-level) | ❌ |

## Sync Strategies

### Push Sync (Kodi)

Tell player exactly which item to refresh:

1. Metarr publishes assets for "The Matrix (1999)"
2. Metarr sends JSON-RPC: `VideoLibrary.Refresh(movieid=123)`
3. Kodi refreshes only that movie
4. Kodi sends `OnScanFinished` event
5. Metarr confirms success

**Advantages**: Fast (seconds), no unnecessary rescanning, accurate verification

### Pull Sync (Jellyfin, Plex)

Tell player to scan entire library section:

1. Metarr publishes assets
2. Metarr sends: `POST /Library/Refresh`
3. Player scans entire Movies library
4. Metarr polls for completion

**Advantages**: Simple API, no ID mapping needed
**Disadvantages**: Slow (minutes), rescans unchanged items

## Path Mapping

Players often see media at different paths than Metarr (Docker volumes, network shares):

```
Metarr sees:  /data/media/movies/The Matrix (1999)/
Kodi sees:    smb://nas/movies/The Matrix (1999)/
Plex sees:    /media/movies/The Matrix (1999)/
```

Path mappings transform Metarr paths to player-visible paths per player configuration.

## Player Groups

Players can be organized into groups for batch synchronization:

| Setting | Effect |
|---------|--------|
| `sync_mode: parallel` | Sync all players simultaneously |
| `sync_mode: sequential` | Sync one by one |
| `continue_on_error` | Don't stop on single player failure |

**Kodi Groups**: Multiple instances supported (bedroom, living room, etc.)
**Jellyfin/Plex Groups**: Single instance only (enforced)

## Active Player Detection (Kodi Only)

Skip sync if user actively watching media:

1. Check Kodi player state: `Player.GetActivePlayers`
2. If playing, skip refresh
3. Log: "Skipping Kodi sync (player active)"
4. Retry later or skip

## Triggers

| Trigger | Priority | Behavior |
|---------|----------|----------|
| Post-publish | NORMAL | Automatic after publishing completes |
| Manual | HIGH | User clicks "Sync Players" |
| Bulk | HIGH | User-driven batch selection |

## Chain Position

Player sync is the **terminal phase** in the automation chain:

```
SCANNING → ENRICHMENT → PUBLISHING → PLAYER SYNC (terminal)
```

It does not create additional phase jobs, but may trigger a [Notification](../Notification/) job.

## Implementation Status

**Status**: ⚠️ Partial Implementation

- `MediaPlayerConnectionManager` handles player connections
- Player API clients implemented (Kodi, Jellyfin, Plex)
- Path mapping service implemented
- **Missing**: Full integration as a dedicated job-driven workflow phase

## Related Documentation

- [Operational Concepts](../README.md) - Pipeline overview
- [Publishing](../Publishing/) - Previous job (provides published assets)
- [Notification](../Notification/) - Optional completion notification
- [Kodi Implementation](../../implementation/PlayerSync/KODI.md) - Kodi JSON-RPC details
