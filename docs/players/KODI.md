# Kodi Integration

**Purpose**: Comprehensive Kodi media player integration via JSON-RPC API with WebSocket and HTTP support.

**Related Docs**:
- [Player Overview](./OVERVIEW.md) - All player capabilities
- [NFO Format](../reference/NFO_FORMAT.md) - Kodi NFO specification
- [Publishing Phase](../phases/PUBLISHING.md) - Asset deployment to Kodi library
- [Kodi JSON-RPC Docs](https://kodi.wiki/view/JSON-RPC_API/v12) - Official API reference

## Quick Reference

**Protocol**: JSON-RPC v12 over WebSocket (preferred) or HTTP (fallback)

**Ports**:
- WebSocket: `9090` (default)
- HTTP: `8080` (default)

**Sync Strategy**: Item-level refresh (push sync)

**Key Features**:
- Real-time bidirectional communication
- Active player detection (skip if watching)
- Multiple instances supported (Kodi groups)
- Path mapping for Docker/NAS

**Prerequisites**:
- Kodi 19 (Matrix) or later
- Remote control enabled
- Network accessible

## Setup

### Enable Remote Control (Kodi Settings)

1. **Navigate to Settings**:
   - Settings ’ Services ’ Control

2. **Enable HTTP Control**:
   -  Allow remote control via HTTP
   - Port: `8080` (default)
   - Username: (optional)
   - Password: (optional)

3. **Enable WebSocket (if available)**:
   -  Allow remote control from applications on other systems
   - WebSocket port: `9090` (default)

4. **Test Connection**:
   - From browser: `http://kodi-ip:8080/jsonrpc`
   - Should return JSON-RPC version info

### Add Kodi to Metarr

**Via UI**:
1. Settings ’ Players ’ Add Player
2. **Type**: Kodi
3. **Name**: "Living Room Kodi"
4. **Host**: `192.168.1.10`
5. **Port**: `8080` (HTTP)
6. **Username/Password**: (if configured)
7. **Test Connection**
8. **Save**

**Via API**:
```bash
POST /api/players
{
  "name": "Living Room Kodi",
  "type": "kodi",
  "host": "192.168.1.10",
  "port": 8080,
  "group_id": 1,
  "path_mappings": []
}
```

## JSON-RPC API

### Communication Protocols

**WebSocket** (Preferred):
```
ws://kodi-ip:9090/jsonrpc
```

**Advantages**:
- Bidirectional (receive events)
- Lower latency
- Persistent connection
- Real-time player state

**Fallback to HTTP**:
```
POST http://kodi-ip:8080/jsonrpc
Content-Type: application/json
```

**When Used**:
- WebSocket unavailable
- Connection lost
- Initial connection attempt

### JSON-RPC Request Format

```json
{
  "jsonrpc": "2.0",
  "method": "VideoLibrary.Refresh",
  "params": {
    "movieid": 123
  },
  "id": 1
}
```

**Fields**:
- `jsonrpc`: Always "2.0"
- `method`: API method to call
- `params`: Method parameters (optional)
- `id`: Request ID for matching response

### JSON-RPC Response Format

```json
{
  "jsonrpc": "2.0",
  "result": "OK",
  "id": 1
}
```

**Fields**:
- `jsonrpc`: Always "2.0"
- `result`: Method result (varies by method)
- `id`: Matches request ID

**Error Response**:
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32602,
    "message": "Invalid params"
  },
  "id": 1
}
```

## Key Methods Used

### Library Scanning

**Scan Movies Library**:
```json
{
  "method": "VideoLibrary.Scan",
  "params": { "directory": "/media/movies/" }
}
```

**Scan TV Shows Library**:
```json
{
  "method": "VideoLibrary.Scan",
  "params": { "directory": "/media/tv/" }
}
```

**Refresh Specific Movie**:
```json
{
  "method": "VideoLibrary.Refresh",
  "params": { "movieid": 123 }
}
```

**Refresh Specific TV Show**:
```json
{
  "method": "VideoLibrary.Refresh",
  "params": { "tvshowid": 456 }
}
```

### Library Queries

**Get Movies**:
```json
{
  "method": "VideoLibrary.GetMovies",
  "params": {
    "properties": ["title", "year", "file"],
    "filter": { "field": "title", "operator": "is", "value": "The Matrix" }
  }
}
```

**Get TV Shows**:
```json
{
  "method": "VideoLibrary.GetTVShows",
  "params": {
    "properties": ["title", "year", "file"]
  }
}
```

**Get Movie Details**:
```json
{
  "method": "VideoLibrary.GetMovieDetails",
  "params": {
    "movieid": 123,
    "properties": ["title", "year", "plot", "file", "art"]
  }
}
```

### Player State

**Get Active Players**:
```json
{
  "method": "Player.GetActivePlayers"
}
```

**Response** (when playing):
```json
{
  "result": [
    {
      "playerid": 1,
      "type": "video",
      "playertype": "internal"
    }
  ]
}
```

**Response** (when idle):
```json
{
  "result": []
}
```

## WebSocket Events

### Listening for Events

Metarr subscribes to these events for real-time updates:

**VideoLibrary.OnScanFinished**:
```json
{
  "method": "VideoLibrary.OnScanFinished",
  "params": {
    "data": null
  }
}
```

**Player.OnPlay**:
```json
{
  "method": "Player.OnPlay",
  "params": {
    "data": {
      "player": { "playerid": 1 },
      "item": { "type": "movie", "title": "The Matrix" }
    }
  }
}
```

**Player.OnStop**:
```json
{
  "method": "Player.OnStop",
  "params": {
    "data": { "item": { "type": "movie" } }
  }
}
```

### Event Handling in Metarr

```typescript
wsClient.on('VideoLibrary.OnScanFinished', (data) => {
  logger.info('Kodi scan finished', { playerId, data });
  // Mark sync job complete
  updateActivityState(playerId, 'idle');
});

wsClient.on('Player.OnPlay', (data) => {
  logger.info('Kodi playback started', { playerId, data });
  updateActivityState(playerId, 'playing');
});

wsClient.on('Player.OnStop', (data) => {
  logger.info('Kodi playback stopped', { playerId, data });
  updateActivityState(playerId, 'idle');
});
```

## Sync Workflow

### Item-Level Sync (Metarr Default)

**Goal**: Refresh only the item that was enriched

**Steps**:
1. Metarr publishes assets for "The Matrix (1999)"
2. Metarr queries Kodi for movie by file path
3. Kodi returns `movieid: 123`
4. Metarr sends `VideoLibrary.Refresh(movieid=123)`
5. Kodi refreshes only that movie (reads new NFO, scans new images)
6. Kodi sends `VideoLibrary.OnScanFinished` event
7. Metarr marks sync complete

**Advantages**:
- Fast (2-5 seconds)
- Doesn't rescan entire library
- Verifiable success

### Library-Level Sync (Fallback)

**Goal**: Scan entire library section

**Steps**:
1. Metarr publishes assets
2. Metarr sends `VideoLibrary.Scan(directory="/media/movies/")`
3. Kodi scans entire Movies library
4. Kodi sends `VideoLibrary.OnScanFinished` event
5. Metarr marks sync complete

**When Used**:
- Can't map file path to Kodi ID
- First-time setup
- Manual "Rescan All" action

## Active Player Detection

**Purpose**: Skip sync if user actively watching

**Implementation**:
```typescript
async function shouldSkipSync(playerId: number): Promise<boolean> {
  const group = await getPlayerGroup(playerId);

  if (!group.skip_active) {
    return false; // Setting disabled, always sync
  }

  const activePlayers = await kodiClient.getActivePlayers();

  if (activePlayers.length > 0) {
    logger.info('Skipping sync, player active', { playerId });
    return true;
  }

  return false;
}
```

**Behavior**:
- Checks before every sync operation
- Logs skip reason
- Queues sync for retry later (optional)

**Configuration**:
```json
{
  "group": {
    "skip_active": true
  }
}
```

## Kodi Groups (Multiple Instances)

**Use Case**: Multiple Kodi devices in household

**Example Setup**:
- Living Room Kodi (192.168.1.10)
- Bedroom Kodi (192.168.1.11)
- Office Kodi (192.168.1.12)

**Group Configuration**:
```json
{
  "group": {
    "name": "Home Kodis",
    "type": "kodi",
    "max_members": null,
    "skip_active": true
  }
}
```

**Sync Behavior**:
1. Metarr publishes assets
2. Metarr iterates all group members
3. For each Kodi:
   - Check if active (skip if playing)
   - Send refresh command
   - Wait for completion (via WebSocket) or timeout
4. Report success if ANY member synced successfully

**Parallel Sync**:
- All members synced in parallel
- Independent timeouts per member
- Failure of one doesn't block others

## Path Mapping

**Problem**: Metarr and Kodi see different paths to same files

**Common Scenarios**:

### Docker Containers

**Metarr** (inside container):
```
/media/movies/The Matrix (1999)/movie.mkv
```

**Kodi** (host system):
```
/mnt/media/movies/The Matrix (1999)/movie.mkv
```

**Path Mapping**:
```json
{
  "path_mappings": [
    {
      "metarr_path": "/media",
      "player_path": "/mnt/media"
    }
  ]
}
```

### Network Shares

**Metarr** (NFS mount):
```
/mnt/nas/media/movies/...
```

**Kodi** (SMB mount):
```
smb://nas/media/movies/...
```

**Path Mapping**:
```json
{
  "path_mappings": [
    {
      "metarr_path": "/mnt/nas/media",
      "player_path": "smb://nas/media"
    }
  ]
}
```

## NFO Files and Kodi

Metarr writes NFO files in Kodi format for seamless integration.

**Movie NFO** (`movie.nfo`):
- Placed adjacent to movie file
- Kodi reads on library scan
- Contains all metadata (title, plot, cast, ratings)

**TV Show NFO** (`tvshow.nfo`):
- Placed in show root directory
- Contains series-level metadata

**Episode NFO** (`S01E01.nfo`):
- Placed adjacent to episode file
- Contains episode-specific metadata

See [NFO_FORMAT.md](../reference/NFO_FORMAT.md) for complete NFO specification.

## Troubleshooting

### WebSocket Connection Issues

**Symptoms**: "Could not establish WebSocket connection"

**Causes**:
- Kodi remote control disabled
- Firewall blocking port 9090
- Kodi version too old (<19)

**Solutions**:
1. Enable remote control in Kodi settings
2. Open port 9090 in firewall
3. Upgrade Kodi to version 19+
4. Use HTTP fallback (automatic)

### HTTP Fallback Works But No Events

**Symptoms**: Sync works but no real-time updates

**Cause**: HTTP polling only, no WebSocket

**Behavior**:
- Metarr polls for completion every 3 seconds
- 30-second timeout
- No event-driven updates

**Solution**: Fix WebSocket connection for real-time updates

### "Movie not found in Kodi library"

**Symptoms**: Item-level refresh fails

**Causes**:
- Path mapping incorrect
- Movie not yet scanned by Kodi
- File path mismatch

**Solutions**:
1. Verify path mapping configuration
2. Run full library scan in Kodi first
3. Check Kodi logs for file path Kodi sees

### Active Player Detection Not Working

**Symptoms**: Sync runs during playback

**Causes**:
- `skip_active` disabled
- Player state not updated
- WebSocket connection lost

**Solutions**:
1. Enable `skip_active` in group settings
2. Check WebSocket connection status
3. Review player activity logs

### Sync Timeout

**Symptoms**: "Kodi sync timed out after 30 seconds"

**Causes**:
- Large library taking too long
- Kodi overloaded
- Network latency

**Solutions**:
1. Increase timeout in settings
2. Use item-level sync instead of full scan
3. Check Kodi system resources

## Configuration

### Player Settings

```json
{
  "name": "Living Room Kodi",
  "type": "kodi",
  "host": "192.168.1.10",
  "port": 8080,
  "websocket_port": 9090,
  "username": "",
  "password": "",
  "timeout_seconds": 30,
  "path_mappings": [
    {
      "metarr_path": "/media",
      "player_path": "/mnt/media"
    }
  ]
}
```

### Group Settings

```json
{
  "name": "Home Kodis",
  "type": "kodi",
  "max_members": null,
  "skip_active": true,
  "sync_strategy": "item-level",
  "parallel_sync": true
}
```

## Performance Tips

1. **Use WebSocket**: 10x faster than HTTP polling
2. **Item-Level Sync**: Refresh only changed items
3. **Skip Active Players**: Avoid disrupting playback
4. **Path Mapping**: Ensure accurate for fast ID lookup
5. **Parallel Groups**: Sync multiple Kodis simultaneously

## Kodi Version Compatibility

| Kodi Version | JSON-RPC | WebSocket | Support |
|--------------|----------|-----------|---------|
| **19 (Matrix)** | v12 |  |  Full |
| **20 (Nexus)** | v12 |  |  Full |
| **21 (Omega)** | v13 |  |  Full |
| **18 (Leia)** | v11 |  |   Limited |
| **17 and older** | <v11 |  | L Unsupported |

**Recommendation**: Kodi 19+ for best experience.

## See Also

- [Player Overview](./OVERVIEW.md) - All player capabilities
- [NFO Format Reference](../reference/NFO_FORMAT.md) - Complete NFO specification
- [Publishing Phase](../phases/PUBLISHING.md) - Asset deployment workflow
- [Kodi JSON-RPC API Docs](https://kodi.wiki/view/JSON-RPC_API/v12) - Official API documentation
- [Kodi Wiki](https://kodi.wiki/) - Complete Kodi documentation
