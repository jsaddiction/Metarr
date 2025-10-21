# Path Mapping System

This document explains Metarr's path mapping/translation system for handling different filesystem views across media managers, Metarr, and media players.

## The Problem

Different systems in a home media setup often see the same files through different path mappings:

```
┌──────────────┬────────────────────────────┬─────────────────────────┐
│   System     │  What it sees              │  Actual Storage         │
├──────────────┼────────────────────────────┼─────────────────────────┤
│ Radarr       │ /downloads/movies/         │                         │
│ (Docker)     │ The Matrix (1999)/         │                         │
│              │                            │  NAS: /mnt/media/movies/│
│ Metarr       │ /data/movies/              │                         │
│ (Docker)     │ The Matrix (1999)/         │                         │
│              │                            │                         │
│ Kodi         │ /mnt/media/movies/         │                         │
│ (Linux)      │ The Matrix (1999)/         │                         │
│              │                            │                         │
│ Jellyfin     │ /media/movies/             │                         │
│ (Docker)     │ The Matrix (1999)/         │                         │
└──────────────┴────────────────────────────┴─────────────────────────┘
```

**Same file, four different paths.**

Without path mapping, Metarr couldn't:
- Process webhook payloads from Radarr (wrong paths)
- Trigger library scans on Kodi (wrong paths)
- Match files across systems

---

## Path Mapping Types

Metarr supports two types of path mappings:

1. **Media Manager Mappings** - Translate webhook paths from Radarr/Sonarr/Lidarr to Metarr's library paths
2. **Media Player Mappings** - Translate Metarr's library paths to what each media player sees

---

## Media Manager Path Mappings

### Purpose

When Radarr sends a webhook, the `path` field uses Radarr's filesystem view. Metarr needs to translate this to its own library paths.

### Database Schema

```sql
CREATE TABLE media_manager_path_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  manager_type TEXT NOT NULL,       -- 'radarr', 'sonarr', 'lidarr'
  manager_path TEXT NOT NULL,       -- What the manager sees
  metarr_path TEXT NOT NULL,        -- What Metarr sees (library path)
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_manager_mappings_type ON media_manager_path_mappings(manager_type);
```

### Configuration Example

**Radarr Configuration:**
```
Radarr sees: /downloads/movies/
Metarr sees: /data/movies/
```

**Database Entry:**
```json
{
  "manager_type": "radarr",
  "manager_path": "/downloads/movies/",
  "metarr_path": "/data/movies/"
}
```

### Translation Logic

```typescript
function translateManagerPath(
  managerType: string,
  managerPath: string
): string {
  // Get all mappings for this manager type
  const mappings = db.getManagerMappings(managerType);

  // Find matching mapping (longest match first)
  const sorted = mappings.sort((a, b) => b.manager_path.length - a.manager_path.length);

  for (const mapping of sorted) {
    if (managerPath.startsWith(mapping.manager_path)) {
      return managerPath.replace(mapping.manager_path, mapping.metarr_path);
    }
  }

  // No mapping found, return original path (may work if paths are identical)
  return managerPath;
}
```

### Example Usage

**Radarr Webhook Payload:**
```json
{
  "eventType": "Download",
  "movie": {
    "title": "The Matrix",
    "folderPath": "/downloads/movies/The Matrix (1999)/"
  }
}
```

**Translation:**
```typescript
const radarrPath = webhook.movie.folderPath;
// "/downloads/movies/The Matrix (1999)/"

const metarrPath = translateManagerPath('radarr', radarrPath);
// "/data/movies/The Matrix (1999)/"

// Now Metarr can access the file
const nfoPath = `${metarrPath}/movie.nfo`;
```

---

## Media Player Path Mappings

### Purpose

When Metarr triggers a library scan, it needs to tell the media player which directory to scan using the player's filesystem view.

### Database Schema

```sql
CREATE TABLE player_path_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL,        -- FK to media_players.id
  metarr_path TEXT NOT NULL,         -- What Metarr sees (library path)
  player_path TEXT NOT NULL,         -- What the player sees
  FOREIGN KEY (player_id) REFERENCES media_players(id) ON DELETE CASCADE
);

CREATE INDEX idx_player_mappings_player ON player_path_mappings(player_id);
```

### Configuration Example

**Kodi Player Configuration:**
```
Kodi ID: 1 (Living Room Kodi)
Metarr library: /data/movies/
Kodi sees: /mnt/media/movies/
```

**Database Entry:**
```json
{
  "player_id": 1,
  "metarr_path": "/data/movies/",
  "player_path": "/mnt/media/movies/"
}
```

**Jellyfin Player Configuration:**
```
Jellyfin ID: 2
Metarr library: /data/movies/
Jellyfin sees: /media/movies/
```

**Database Entry:**
```json
{
  "player_id": 2,
  "metarr_path": "/data/movies/",
  "player_path": "/media/movies/"
}
```

### Translation Logic

```typescript
function translatePlayerPath(
  playerId: number,
  metarrPath: string
): string {
  // Get all mappings for this player
  const mappings = db.getPlayerMappings(playerId);

  // Find matching mapping (longest match first)
  const sorted = mappings.sort((a, b) => b.metarr_path.length - a.metarr_path.length);

  for (const mapping of sorted) {
    if (metarrPath.startsWith(mapping.metarr_path)) {
      return metarrPath.replace(mapping.metarr_path, mapping.player_path);
    }
  }

  // No mapping found, return original path
  return metarrPath;
}
```

### Example Usage

**Triggering Kodi Scan:**
```typescript
const metarrPath = "/data/movies/The Matrix (1999)/";
const kodiPath = translatePlayerPath(kodiPlayerId, metarrPath);
// "/mnt/media/movies/The Matrix (1999)/"

await kodiClient.scanLibrary(kodiPath);
```

**API Call:**
```json
{
  "jsonrpc": "2.0",
  "method": "VideoLibrary.Scan",
  "params": {
    "directory": "/mnt/media/movies/The Matrix (1999)/"
  }
}
```

---

## Kodi Shared Library Groups

**Status**: **[Planned Feature]** - Designed but not yet implemented

### Problem

Multiple Kodi instances can share a single MySQL/MariaDB database. When one Kodi scans the library, all instances see the updated metadata (shared database), but each needs to rebuild its own image cache.

**Additional Challenges:**
1. **Concurrent Playback**: Multiple group members may be playing different media simultaneously
2. **Scan Queue Management**: Updates should be queued per-player to avoid interrupting playback
3. **Playback State Tracking**: Need to detect which players are actively playing media
4. **Sequential vs. Concurrent**: Some operations (database scan) must be sequential, others (notifications) can be concurrent

### Database Schema (Planned)

```sql
CREATE TABLE media_player_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,                -- 'kodi_shared'
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE media_player_group_members (
  group_id INTEGER NOT NULL,
  player_id INTEGER NOT NULL,
  PRIMARY KEY (group_id, player_id),
  FOREIGN KEY (group_id) REFERENCES media_player_groups(id) ON DELETE CASCADE,
  FOREIGN KEY (player_id) REFERENCES media_players(id) ON DELETE CASCADE
);

-- Queue for pending library updates per player
CREATE TABLE player_update_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL,
  update_type TEXT NOT NULL,         -- 'scan', 'notification'
  metarr_path TEXT,                  -- Path to scan (null for notifications)
  message TEXT,                      -- Notification message (null for scans)
  priority INTEGER DEFAULT 5,        -- 1 (highest) to 10 (lowest)
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  scheduled_for TEXT,                -- Process after this timestamp (null = now)
  FOREIGN KEY (player_id) REFERENCES media_players(id) ON DELETE CASCADE
);

CREATE INDEX idx_player_update_queue_player ON player_update_queue(player_id);
CREATE INDEX idx_player_update_queue_scheduled ON player_update_queue(scheduled_for);

-- Path mappings apply to the GROUP, not individual players
ALTER TABLE player_path_mappings ADD COLUMN group_id INTEGER;
ALTER TABLE player_path_mappings ADD CONSTRAINT fk_group
  FOREIGN KEY (group_id) REFERENCES media_player_groups(id) ON DELETE CASCADE;

-- Modify constraint: Either player_id OR group_id must be set (not both)
```

### Configuration Example

**Group:**
```json
{
  "id": 1,
  "name": "Home Kodi Network",
  "type": "kodi_shared"
}
```

**Members:**
```json
[
  {
    "group_id": 1,
    "player_id": 10,
    "name": "Living Room Kodi",
    "host": "192.168.1.10",
    "port": 8080
  },
  {
    "group_id": 1,
    "player_id": 11,
    "name": "Bedroom Kodi",
    "host": "192.168.1.11",
    "port": 8080
  },
  {
    "group_id": 1,
    "player_id": 12,
    "name": "Basement Kodi",
    "host": "192.168.1.12",
    "port": 8080
  }
]
```

**Single Path Mapping (applies to all members):**
```json
{
  "group_id": 1,
  "player_id": null,  // NULL because it's a group mapping
  "metarr_path": "/data/movies/",
  "player_path": "/mnt/media/movies/"
}
```

**Why one mapping?** All Kodi instances in the group must see the same paths (shared database requires consistent paths).

### Queue-Based Update System

When Metarr needs to update a Kodi shared group, updates are queued per-player to avoid interrupting active playback.

#### Update Flow Diagram

```
Metarr Event (download complete, metadata updated)
                │
                ▼
┌──────────────────────────────────────┐
│ Scan Kodi Group                      │
│  - Get all group members             │
│  - Check playback status on each     │
└──────────────────────────────────────┘
                │
                ▼
┌──────────────────────────────────────┐
│ Select Primary Player for Scan       │
│  - First idle player (not playing)   │
│  - OR lowest queue size              │
└──────────────────────────────────────┘
                │
                ▼
     ┌──────────┴──────────┐
     │                     │
     ▼                     ▼
┌─────────┐        ┌─────────────────┐
│ Scan    │        │ Queue Scans for │
│ Primary │        │ Playing Members │
│ (now)   │        │ (after playback)│
└─────────┘        └─────────────────┘
     │                     │
     │                     ▼
     │             ┌──────────────────┐
     │             │ Schedule for:    │
     │             │ - After playback │
     │             │ - OR +5 minutes  │
     │             └──────────────────┘
     │                     │
     └──────────┬──────────┘
                ▼
┌──────────────────────────────────────┐
│ Queue Notifications for ALL Members  │
│  - "Library updated" message         │
│  - Triggers image cache rebuild      │
└──────────────────────────────────────┘
                │
                ▼
┌──────────────────────────────────────┐
│ Process Queues (Background Worker)  │
│  - Check playback status             │
│  - Execute pending updates           │
│  - Reschedule if still playing       │
└──────────────────────────────────────┘
```

#### Playback Detection

```typescript
async function isPlayerPlaying(playerId: number): Promise<boolean> {
  try {
    const player = await db.getMediaPlayer(playerId);

    // Get active players
    const activePlayers = await kodiClient.sendRequest(player.host, player.port, {
      jsonrpc: '2.0',
      method: 'Player.GetActivePlayers',
      id: 1
    });

    return activePlayers.result && activePlayers.result.length > 0;
  } catch (error) {
    // If player is offline or unreachable, treat as not playing
    return false;
  }
}
```

#### Queue-Based Scan Implementation

```typescript
async function scanKodiGroup(
  groupId: number,
  metarrPath: string,
  priority: number = 5
): Promise<void> {
  const group = await db.getMediaPlayerGroup(groupId);
  const members = await db.getGroupMembers(groupId);
  const mapping = await db.getGroupPathMapping(groupId);

  // Translate path using group mapping
  const kodiPath = metarrPath.replace(mapping.metarr_path, mapping.player_path);

  // Step 1: Check playback status for all members
  const playbackStatus = await Promise.all(
    members.map(async (member) => ({
      player: member,
      isPlaying: await isPlayerPlaying(member.player_id)
    }))
  );

  // Step 2: Select primary player for immediate scan
  // Priority: First idle player, or player with smallest queue
  let primaryPlayer = playbackStatus.find(s => !s.isPlaying)?.player;

  if (!primaryPlayer) {
    // All players are playing, pick one with smallest queue
    const queueSizes = await Promise.all(
      members.map(async (member) => ({
        player: member,
        queueSize: await db.getQueueSize(member.player_id)
      }))
    );
    queueSizes.sort((a, b) => a.queueSize - b.queueSize);
    primaryPlayer = queueSizes[0].player;
  }

  // Step 3: Scan primary player immediately (or queue if playing)
  if (playbackStatus.find(s => s.player.player_id === primaryPlayer.player_id)?.isPlaying) {
    // Primary player is playing, queue the scan
    await db.queuePlayerUpdate({
      player_id: primaryPlayer.player_id,
      update_type: 'scan',
      metarr_path: kodiPath,
      priority: priority,
      scheduled_for: null  // Will be scheduled by queue processor
    });
  } else {
    // Primary player is idle, scan immediately
    await kodiClient.scanLibrary(primaryPlayer.host, primaryPlayer.port, kodiPath);
  }

  // Step 4: Queue scans for all other playing members
  for (const status of playbackStatus) {
    if (status.player.player_id === primaryPlayer.player_id) continue; // Skip primary

    if (status.isPlaying) {
      // Queue scan to execute after playback stops
      await db.queuePlayerUpdate({
        player_id: status.player.player_id,
        update_type: 'scan',
        metarr_path: kodiPath,
        priority: priority,
        scheduled_for: null  // Will be determined by playback monitoring
      });
    } else {
      // Player is idle, queue with immediate scheduling
      await db.queuePlayerUpdate({
        player_id: status.player.player_id,
        update_type: 'scan',
        metarr_path: kodiPath,
        priority: priority,
        scheduled_for: new Date().toISOString()  // Execute ASAP
      });
    }
  }

  // Step 5: Queue notifications for ALL members (concurrent)
  for (const member of members) {
    await db.queuePlayerUpdate({
      player_id: member.player_id,
      update_type: 'notification',
      message: 'Library updated',
      priority: 10,  // Low priority (notifications can wait)
      scheduled_for: new Date().toISOString()
    });
  }

  // Log activity
  await db.logActivity({
    event_type: 'group_scan_queued',
    severity: 'info',
    description: `Library scan queued for Kodi group: ${group.name}`,
    metadata: JSON.stringify({
      group_id: groupId,
      primary_player: primaryPlayer.name,
      queued_players: playbackStatus.filter(s => s.isPlaying).length,
      path: kodiPath
    })
  });
}
```

#### Queue Processor (Background Worker)

```typescript
class PlayerUpdateQueueProcessor {
  private processingIntervalMs = 30000; // 30 seconds
  private maxRetries = 3;

  async start(): Promise<void> {
    setInterval(() => this.processQueue(), this.processingIntervalMs);
  }

  async processQueue(): Promise<void> {
    // Get pending updates (scheduled_for <= NOW or null)
    const pendingUpdates = await db.query(`
      SELECT *
      FROM player_update_queue
      WHERE scheduled_for IS NULL OR scheduled_for <= CURRENT_TIMESTAMP
      ORDER BY priority ASC, created_at ASC
    `);

    for (const update of pendingUpdates) {
      try {
        await this.processUpdate(update);

        // Remove from queue
        await db.run('DELETE FROM player_update_queue WHERE id = ?', [update.id]);
      } catch (error) {
        console.error(`Failed to process update ${update.id}:`, error);

        // Reschedule or remove after max retries
        const retryCount = update.retry_count || 0;
        if (retryCount < this.maxRetries) {
          await db.run(`
            UPDATE player_update_queue
            SET retry_count = ?, scheduled_for = DATETIME('now', '+5 minutes')
            WHERE id = ?
          `, [retryCount + 1, update.id]);
        } else {
          // Max retries reached, remove from queue
          await db.run('DELETE FROM player_update_queue WHERE id = ?', [update.id]);
        }
      }
    }
  }

  async processUpdate(update: PlayerUpdate): Promise<void> {
    const player = await db.getMediaPlayer(update.player_id);

    // Check if player is still playing
    const isPlaying = await isPlayerPlaying(update.player_id);

    if (isPlaying && update.update_type === 'scan') {
      // Player is still playing, reschedule for later
      const newScheduledFor = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // +5 minutes

      await db.run(`
        UPDATE player_update_queue
        SET scheduled_for = ?
        WHERE id = ?
      `, [newScheduledFor, update.id]);

      return; // Don't process now, will retry later
    }

    // Execute update
    if (update.update_type === 'scan') {
      await kodiClient.scanLibrary(player.host, player.port, update.metarr_path);

      await db.logActivity({
        event_type: 'player_scan_executed',
        severity: 'info',
        description: `Library scan executed on ${player.name}`,
        metadata: JSON.stringify({
          player_id: update.player_id,
          path: update.metarr_path
        })
      });
    } else if (update.update_type === 'notification') {
      await kodiClient.sendNotification(
        player.host,
        player.port,
        'Metarr',
        update.message
      );
    }
  }
}
```

#### WebSocket Playback Monitoring

For more responsive queue processing, Metarr listens to Kodi WebSocket events:

```typescript
class KodiPlaybackMonitor {
  async onPlaybackStopped(playerId: number): Promise<void> {
    // Playback stopped, immediately process queued updates for this player
    const pendingUpdates = await db.query(`
      SELECT *
      FROM player_update_queue
      WHERE player_id = ?
      ORDER BY priority ASC, created_at ASC
      LIMIT 1
    `, [playerId]);

    if (pendingUpdates.length > 0) {
      const update = pendingUpdates[0];

      // Update scheduled_for to NOW to trigger immediate processing
      await db.run(`
        UPDATE player_update_queue
        SET scheduled_for = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [update.id]);

      // Trigger queue processor (don't wait for next interval)
      await queueProcessor.processQueue();
    }
  }
}

// Register WebSocket listeners
kodiWebSocket.on('Player.OnStop', async (event) => {
  const playerId = getPlayerIdFromEvent(event);
  await playbackMonitor.onPlaybackStopped(playerId);
});
```

**Result:**
- ✅ Database updated (one scan affects all)
- ✅ Playback not interrupted (scans queued during playback)
- ✅ Scans execute immediately after playback stops (WebSocket monitoring)
- ✅ Each player notified (rebuilds its own cache)
- ✅ Consistent paths (one mapping for group)
- ✅ Resilient to player offline (retries with exponential backoff)

---

## UI Configuration

### Media Manager Mapping UI

**Settings → Media Managers → Radarr → Path Mappings**

```
┌────────────────────────────────────────────────────────┐
│ Path Mappings                                          │
├────────────────────────────────────────────────────────┤
│                                                        │
│ Radarr Path         Metarr Path                        │
│ /downloads/movies/  /data/movies/         [Edit] [×]  │
│ /downloads/tv/      /data/tvshows/        [Edit] [×]  │
│                                                        │
│ [+ Add Mapping]                                        │
└────────────────────────────────────────────────────────┘
```

### Media Player Mapping UI (Standalone)

**Settings → Media Players → Living Room Kodi → Path Mappings**

```
┌────────────────────────────────────────────────────────┐
│ Path Mappings                                          │
├────────────────────────────────────────────────────────┤
│                                                        │
│ Metarr Library Path    Kodi Path                      │
│ /data/movies/          /mnt/media/movies/ [Edit] [×]  │
│ /data/tvshows/         /mnt/media/tv/     [Edit] [×]  │
│                                                        │
│ [+ Add Mapping]                                        │
└────────────────────────────────────────────────────────┘
```

### Media Player Mapping UI (Shared Group)

**Settings → Media Players → Home Kodi Network (Group) → Path Mappings**

```
┌────────────────────────────────────────────────────────┐
│ Path Mappings (applies to all group members)          │
├────────────────────────────────────────────────────────┤
│                                                        │
│ Metarr Library Path    Kodi Path                      │
│ /data/movies/          /mnt/media/movies/ [Edit] [×]  │
│ /data/tvshows/         /mnt/media/tv/     [Edit] [×]  │
│                                                        │
│ [+ Add Mapping]                                        │
│                                                        │
│ ──────────────────────────────────────────────────────│
│ Group Members                                          │
│ • Living Room Kodi (192.168.1.10:8080)    [Edit] [×]  │
│ • Bedroom Kodi (192.168.1.11:8080)        [Edit] [×]  │
│ • Basement Kodi (192.168.1.12:8080)       [Edit] [×]  │
│                                                        │
│ [+ Add Member]                                         │
└────────────────────────────────────────────────────────┘
```

---

## Path Normalization

To ensure reliable matching, paths should be normalized before comparison:

```typescript
function normalizePath(path: string): string {
  // 1. Trim whitespace
  path = path.trim();

  // 2. Replace backslashes with forward slashes (Windows compatibility)
  path = path.replace(/\\/g, '/');

  // 3. Remove trailing slash
  if (path.endsWith('/') && path.length > 1) {
    path = path.slice(0, -1);
  }

  // 4. Ensure leading slash (absolute path)
  if (!path.startsWith('/')) {
    path = '/' + path;
  }

  return path;
}
```

**Examples:**
```
Input: "C:\Users\Media\Movies\"
Output: "/C:/Users/Media/Movies"

Input: "/data/movies/"
Output: "/data/movies"

Input: "data/movies"
Output: "/data/movies"
```

---

## Optional Path Mapping

Path mappings are **optional**. If paths are identical across all systems, no mappings needed.

### Scenario: All Containers Share Same Mount

```
Docker Compose:
  radarr:
    volumes:
      - /mnt/nas/media:/media

  metarr:
    volumes:
      - /mnt/nas/media:/media

Kodi (bare metal):
  NFS mount: /mnt/nas/media
```

**Result:** All systems see `/media/movies/`, no translation needed.

**Configuration:** Leave path mappings empty, Metarr uses paths as-is.

---

## Testing Path Mappings

### Test Connection Button

When user clicks "Test Connection" on media player config:

```typescript
async function testMediaPlayerConnection(playerId: number): Promise<TestResult> {
  const player = await db.getMediaPlayer(playerId);
  const mappings = await db.getPlayerMappings(playerId);

  // 1. Test API connectivity
  const apiTest = await kodiClient.ping(player.host, player.port);
  if (!apiTest.success) {
    return { success: false, error: "Cannot connect to Kodi API" };
  }

  // 2. Test path mappings
  const libraries = await db.getLibraries();
  const pathTests = [];

  for (const library of libraries) {
    const metarrPath = library.path;
    const playerPath = translatePlayerPath(playerId, metarrPath);

    // Ask Kodi to list directory
    const directoryTest = await kodiClient.listDirectory(player.host, player.port, playerPath);

    pathTests.push({
      library: library.name,
      metarrPath,
      playerPath,
      accessible: directoryTest.success,
      error: directoryTest.error
    });
  }

  return {
    success: pathTests.every(t => t.accessible),
    apiConnected: true,
    pathTests
  };
}
```

**UI Display:**
```
┌────────────────────────────────────────────────────────┐
│ Connection Test Results                                │
├────────────────────────────────────────────────────────┤
│                                                        │
│ API Connection: ✓ Connected                            │
│                                                        │
│ Path Mappings:                                         │
│ ✓ Movies Library                                       │
│   Metarr: /data/movies/                                │
│   Kodi:   /mnt/media/movies/                           │
│                                                        │
│ ✗ TV Shows Library                                     │
│   Metarr: /data/tvshows/                               │
│   Kodi:   /mnt/media/tv/                               │
│   Error: Directory not found                           │
│                                                        │
│ Please check your path mappings.                       │
└────────────────────────────────────────────────────────┘
```

---

## Advanced Use Cases

### Multi-Library Support

```
Metarr Libraries:
  /data/movies-4k/
  /data/movies-1080p/
  /data/tvshows/

Kodi sees:
  /mnt/media/4k/
  /mnt/media/hd/
  /mnt/media/tv/

Mappings:
  /data/movies-4k/    → /mnt/media/4k/
  /data/movies-1080p/ → /mnt/media/hd/
  /data/tvshows/      → /mnt/media/tv/
```

### Windows to Linux Path Mapping

```
Metarr (Windows):
  M:\Movies\
  M:\TV Shows\

Kodi (Linux):
  /mnt/media/movies/
  /mnt/media/tv/

Mappings (after normalization):
  /M:/Movies/    → /mnt/media/movies/
  /M:/TV Shows/  → /mnt/media/tv/
```

### Nested Mappings (Longest Match Wins)

```
Mappings:
  /data/           → /media/
  /data/movies-4k/ → /media/4k/

Translation:
  /data/tvshows/The Office/       → /media/tvshows/The Office/       (uses first mapping)
  /data/movies-4k/Dune (2021)/    → /media/4k/Dune (2021)/           (uses second mapping, longer match)
```

---

## API Endpoints

### Media Manager Mappings

```
GET    /api/media-managers/:type/path-mappings
POST   /api/media-managers/:type/path-mappings
PUT    /api/media-managers/:type/path-mappings/:id
DELETE /api/media-managers/:type/path-mappings/:id
```

### Media Player Mappings (Standalone)

```
GET    /api/media-players/:id/path-mappings
POST   /api/media-players/:id/path-mappings
PUT    /api/media-players/:id/path-mappings/:mappingId
DELETE /api/media-players/:id/path-mappings/:mappingId
```

### Media Player Groups

```
GET    /api/media-player-groups
POST   /api/media-player-groups
GET    /api/media-player-groups/:id
PUT    /api/media-player-groups/:id
DELETE /api/media-player-groups/:id

GET    /api/media-player-groups/:id/members
POST   /api/media-player-groups/:id/members
DELETE /api/media-player-groups/:id/members/:playerId

GET    /api/media-player-groups/:id/path-mappings
POST   /api/media-player-groups/:id/path-mappings
PUT    /api/media-player-groups/:id/path-mappings/:mappingId
DELETE /api/media-player-groups/:id/path-mappings/:mappingId
```

---

## Best Practices

1. **Use absolute paths** - Always configure absolute paths, never relative
2. **Normalize paths** - Ensure consistent format (forward slashes, no trailing slash)
3. **Test mappings** - Use connection test to verify path accessibility
4. **Document mappings** - In UI, show both Metarr and player paths side-by-side
5. **Longest match first** - Sort mappings by path length (descending) when translating
6. **Group shared Kodi** - Use groups for Kodi instances with shared MySQL databases
7. **Optional by default** - Only require mappings if paths actually differ
8. **Validate on save** - Check if directory exists before saving mapping
9. **Show examples** - In UI, show example translation when configuring
10. **Handle errors gracefully** - If translation fails, try original path as fallback

---

## Troubleshooting

### Problem: Kodi scan does nothing

**Likely cause:** Path mapping incorrect, Kodi can't find directory

**Solution:**
1. Click "Test Connection" on media player
2. Review path test results
3. Check Kodi's actual filesystem view
4. Update player path mapping
5. Retest

---

### Problem: Webhook processing fails

**Likely cause:** Media manager path mapping missing

**Solution:**
1. Check Radarr's configured root folder
2. Add mapping: Radarr path → Metarr library path
3. Process webhook again (retry button)

---

### Problem: Shared Kodi group - one player not updating

**Likely cause:** Player not receiving scan notification, or different paths

**Solution:**
1. Verify all members use identical filesystem paths
2. Check WebSocket connection to player
3. Manually trigger scan on that specific player
4. Review group membership (ensure player is in group)
