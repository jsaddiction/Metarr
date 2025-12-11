# Kodi Integration

Kodi media player integration via JSON-RPC API with WebSocket and HTTP support.

See [Player Sync Concepts](../../concepts/PlayerSync/) for design principles.

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

1. Settings → Services → Control
2. ✅ Allow remote control via HTTP (Port: `8080`)
3. ✅ Allow remote control from applications on other systems (Port: `9090`)
4. Test: `http://kodi-ip:8080/jsonrpc` should return JSON-RPC version

### Add Kodi to Metarr

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

Advantages: Bidirectional events, lower latency, persistent connection

**HTTP Fallback**:
```
POST http://kodi-ip:8080/jsonrpc
Content-Type: application/json
```

### Request Format

```json
{
  "jsonrpc": "2.0",
  "method": "VideoLibrary.Refresh",
  "params": { "movieid": 123 },
  "id": 1
}
```

### Response Format

```json
{
  "jsonrpc": "2.0",
  "result": "OK",
  "id": 1
}
```

## Key Methods

### Library Scanning

**Scan Movies Library**:
```json
{ "method": "VideoLibrary.Scan", "params": { "directory": "/media/movies/" } }
```

**Refresh Specific Movie**:
```json
{ "method": "VideoLibrary.Refresh", "params": { "movieid": 123 } }
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

### Player State

**Get Active Players**:
```json
{ "method": "Player.GetActivePlayers" }
```

Response when playing:
```json
{ "result": [{ "playerid": 1, "type": "video" }] }
```

Response when idle:
```json
{ "result": [] }
```

## WebSocket Events

Metarr subscribes to these events:

**VideoLibrary.OnScanFinished**: Library scan completed
**Player.OnPlay**: Playback started (for active detection)
**Player.OnStop**: Playback stopped

```typescript
wsClient.on('VideoLibrary.OnScanFinished', (data) => {
  updateActivityState(playerId, 'idle');
});

wsClient.on('Player.OnPlay', (data) => {
  updateActivityState(playerId, 'playing');
});
```

## Sync Workflow

### Item-Level Sync (Default)

1. Metarr publishes assets for "The Matrix (1999)"
2. Query Kodi for movie by file path
3. Kodi returns `movieid: 123`
4. Send `VideoLibrary.Refresh(movieid=123)`
5. Kodi refreshes only that movie
6. Kodi sends `OnScanFinished` event
7. Mark sync complete

**Speed**: 2-5 seconds

### Library-Level Sync (Fallback)

1. Send `VideoLibrary.Scan(directory="/media/movies/")`
2. Kodi scans entire Movies library
3. Wait for `OnScanFinished` event

Used when file path can't be mapped to Kodi ID.

## Active Player Detection

```typescript
async function shouldSkipSync(playerId: number): Promise<boolean> {
  const group = await getPlayerGroup(playerId);
  if (!group.skip_active) return false;

  const activePlayers = await kodiClient.getActivePlayers();
  return activePlayers.length > 0;
}
```

## Kodi Groups (Multiple Instances)

**Example Setup**:
- Living Room Kodi (192.168.1.10)
- Bedroom Kodi (192.168.1.11)

**Behavior**:
1. Iterate all group members
2. Check if active (skip if playing)
3. Send refresh command in parallel
4. Report success if ANY member synced

## Path Mapping

### Docker Containers

Metarr: `/media/movies/The Matrix (1999)/movie.mkv`
Kodi: `/mnt/media/movies/The Matrix (1999)/movie.mkv`

```json
{
  "path_mappings": [{
    "metarr_path": "/media",
    "player_path": "/mnt/media"
  }]
}
```

### Network Shares

Metarr: `/mnt/nas/media/movies/...`
Kodi: `smb://nas/media/movies/...`

```json
{
  "path_mappings": [{
    "metarr_path": "/mnt/nas/media",
    "player_path": "smb://nas/media"
  }]
}
```

## Configuration

### Player Settings

```json
{
  "name": "Living Room Kodi",
  "type": "kodi",
  "host": "192.168.1.10",
  "port": 8080,
  "websocket_port": 9090,
  "timeout_seconds": 30,
  "path_mappings": [...]
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

## Troubleshooting

### WebSocket Connection Issues

**Symptoms**: "Could not establish WebSocket connection"

**Solutions**:
1. Enable remote control in Kodi settings
2. Open port 9090 in firewall
3. Upgrade Kodi to version 19+
4. HTTP fallback is automatic

### "Movie not found in Kodi library"

**Solutions**:
1. Verify path mapping configuration
2. Run full library scan in Kodi first
3. Check Kodi logs for actual file path

### Sync Timeout

**Solutions**:
1. Increase timeout in settings
2. Use item-level sync instead of full scan
3. Check Kodi system resources

## Kodi Version Compatibility

| Kodi Version | JSON-RPC | WebSocket | Support |
|--------------|----------|-----------|---------|
| **19 (Matrix)** | v12 | ✅ | ✅ Full |
| **20 (Nexus)** | v12 | ✅ | ✅ Full |
| **21 (Omega)** | v13 | ✅ | ✅ Full |
| **18 (Leia)** | v11 | ✅ | ⚠️ Limited |
| **17 and older** | <v11 | ❌ | ❌ Unsupported |

## Key Files

| Component | Location |
|-----------|----------|
| `KodiClient` | `src/services/players/KodiClient.ts` |
| `KodiWebSocketClient` | `src/services/players/KodiWebSocketClient.ts` |
| `KodiHttpClient` | `src/services/players/KodiHttpClient.ts` |

## Related Documentation

- [Player Sync Concepts](../../concepts/PlayerSync/) - Design principles
- [NFO Format](../../reference/NFO_FORMAT.md) - Kodi NFO specification
- [Path Mapping](../../reference/PATH_MAPPING.md) - Docker/NAS path scenarios
- [Kodi JSON-RPC API](https://kodi.wiki/view/JSON-RPC_API/v12) - Official docs
