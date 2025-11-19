# Jellyfin Integration

**Purpose**: Jellyfin media server integration via REST API for library synchronization.

**Status**:   Partial Implementation - Basic library scanning supported

**Related Docs**:
- [Player Overview](./OVERVIEW.md) - All player capabilities
- [Kodi Integration](./KODI.md) - Reference for full implementation
- [Publishing Phase](../phases/PUBLISHING.md) - Asset deployment workflow
- [Jellyfin API Docs](https://api.jellyfin.org/) - Official API reference

## Quick Reference

**Protocol**: REST API (HTTP/HTTPS)

**Port**: `8096` (default HTTP), `8920` (default HTTPS)

**Sync Strategy**: Library-level scan (pull sync)

**Key Features**:
- Simple REST API
- API key authentication
- Library scanning
- Path mapping support

**Limitations** (Current Implementation):
- No item-level refresh
- No real-time events
- No active player detection
- Polling only for completion
- Single instance per group

**Prerequisites**:
- Jellyfin 10.8+ recommended
- API key generated
- Network accessible

## Setup

### Generate API Key (Jellyfin Dashboard)

1. **Login to Jellyfin**:
   - Navigate to `http://jellyfin-ip:8096`
   - Login with admin account

2. **Open Dashboard**:
   - Click hamburger menu (top left)
   - Select "Dashboard"

3. **Navigate to API Keys**:
   - Dashboard ’ Advanced ’ API Keys

4. **Create New API Key**:
   - Click "+ Create API Key"
   - **App Name**: "Metarr"
   - **Description**: "Media metadata management"
   - Click "OK"

5. **Copy API Key**:
   - Format: 32-character hexadecimal string
   - Store securely (shown only once)

### Add Jellyfin to Metarr

**Via UI**:
1. Settings ’ Players ’ Add Player
2. **Type**: Jellyfin
3. **Name**: "Jellyfin Server"
4. **Host**: `192.168.1.20`
5. **Port**: `8096`
6. **API Key**: Paste generated key
7. **Test Connection**
8. **Save**

**Via API**:
```bash
POST /api/players
{
  "name": "Jellyfin Server",
  "type": "jellyfin",
  "host": "192.168.1.20",
  "port": 8096,
  "api_key": "your_32_character_api_key_here",
  "group_id": 2,
  "path_mappings": []
}
```

## REST API

### Authentication

All requests require API key in header:

```http
GET /Library/VirtualFolders
Host: jellyfin-ip:8096
X-Emby-Token: your_api_key_here
```

**Headers**:
- `X-Emby-Token`: API key (required)
- `Content-Type`: `application/json`

### Key Endpoints Used

#### Library Management

**Get Libraries**:
```http
GET /Library/VirtualFolders
X-Emby-Token: {api_key}
```

**Response**:
```json
[
  {
    "Name": "Movies",
    "ItemId": "abc123",
    "Locations": ["/media/movies"],
    "CollectionType": "movies"
  },
  {
    "Name": "TV Shows",
    "ItemId": "def456",
    "Locations": ["/media/tv"],
    "CollectionType": "tvshows"
  }
]
```

**Scan Library**:
```http
POST /Library/Refresh
X-Emby-Token: {api_key}
```

**Scan Specific Path**:
```http
POST /Library/Media/Updated
X-Emby-Token: {api_key}
Content-Type: application/json

{
  "Updates": [
    {
      "Path": "/media/movies/The Matrix (1999)",
      "UpdateType": "Created"
    }
  ]
}
```

#### System Information

**Get Server Info**:
```http
GET /System/Info
X-Emby-Token: {api_key}
```

**Response**:
```json
{
  "ServerName": "Jellyfin",
  "Version": "10.8.13",
  "Id": "server-id",
  "OperatingSystem": "Linux"
}
```

**Get Active Sessions** (for future player detection):
```http
GET /Sessions
X-Emby-Token: {api_key}
```

## Sync Workflow

### Library-Level Scan (Current Implementation)

**Goal**: Trigger Jellyfin to scan entire library

**Steps**:
1. Metarr publishes assets for "The Matrix (1999)"
2. Metarr sends `POST /Library/Refresh`
3. Jellyfin queues library scan
4. Metarr polls for scan completion (timeout after 60 seconds)
5. Jellyfin scans entire Movies library
6. Metarr reports success on timeout (assumes complete)

**Limitations**:
- Scans entire library, not just changed item
- No reliable completion detection
- Timeout-based success (unreliable)
- Slow for large libraries (minutes)

### Path-Specific Update (Planned)

**Goal**: Tell Jellyfin specific path changed

**Endpoint**: `POST /Library/Media/Updated`

**Implementation Status**: Designed but not implemented

**Advantages**:
- Faster than full scan
- More targeted
- Better for large libraries

## Path Mapping

Same concept as Kodi - map Metarr paths to Jellyfin paths.

### Docker Scenario

**Metarr** (inside container):
```
/media/movies/The Matrix (1999)/
```

**Jellyfin** (inside different container):
```
/data/movies/The Matrix (1999)/
```

**Path Mapping**:
```json
{
  "path_mappings": [
    {
      "metarr_path": "/media/movies",
      "player_path": "/data/movies"
    },
    {
      "metarr_path": "/media/tv",
      "player_path": "/data/tv"
    }
  ]
}
```

## NFO Files and Jellyfin

Jellyfin supports Kodi-compatible NFO files:

**Movie NFO** (`movie.nfo` or `{movie-name}.nfo`):
- Placed adjacent to movie file
- Jellyfin reads during library scan
- Format identical to Kodi NFO

**TV Show NFO** (`tvshow.nfo`):
- Placed in series root directory
- Series-level metadata

**Episode NFO** (`{episode-file}.nfo`):
- Placed adjacent to episode file
- Episode-specific metadata

**Image Assets**:
- `poster.jpg` or `folder.jpg`: Primary image
- `backdrop.jpg` or `fanart.jpg`: Background
- `logo.png`: Clearlogo
- `banner.jpg`: Wide banner

See [NFO_FORMAT.md](../reference/NFO_FORMAT.md) for complete specification.

## Limitations

### Current Implementation

**No Item-Level Refresh**:
- Cannot refresh specific movie/show
- Must scan entire library
- Slow for large libraries

**No Event System**:
- No WebSocket support
- No scan completion events
- Polling-based with timeout

**No Active Player Detection**:
- Cannot detect if user watching
- Scans run regardless of playback state
- May cause buffering during playback

**Single Instance Only**:
- One Jellyfin per group
- Cannot sync multiple Jellyfin servers
- Enforced by group `max_members: 1`

### Planned Improvements

**Path-Specific Updates**:
- Use `/Library/Media/Updated` endpoint
- Faster than full library scan
- Better for automation

**Scan Progress Polling**:
- Poll `/ScheduledTasks` for scan status
- Detect actual completion
- No timeout guessing

**Session Monitoring**:
- Use `/Sessions` endpoint
- Detect active playback
- Skip sync if user watching

## Configuration

### Player Settings

```json
{
  "name": "Jellyfin Server",
  "type": "jellyfin",
  "host": "192.168.1.20",
  "port": 8096,
  "use_https": false,
  "api_key": "your_32_character_api_key_here",
  "timeout_seconds": 60,
  "path_mappings": []
}
```

### Group Settings

```json
{
  "name": "Jellyfin",
  "type": "jellyfin",
  "max_members": 1,
  "skip_active": false,
  "sync_strategy": "library-level"
}
```

## Troubleshooting

### "Authentication failed"

**Causes**:
- Invalid API key
- API key deleted
- Wrong Jellyfin instance

**Solutions**:
1. Regenerate API key in Jellyfin dashboard
2. Verify key matches configuration
3. Check host/port correct

### "Library scan not completing"

**Symptoms**: Timeout after 60 seconds

**Cause**: Scan still running, timeout too short

**Solutions**:
1. Increase timeout in settings
2. Check Jellyfin dashboard for scan status
3. Wait for scan to complete manually

### "Connection refused"

**Causes**:
- Jellyfin not running
- Firewall blocking port
- Wrong host/port

**Solutions**:
1. Verify Jellyfin running: `http://jellyfin-ip:8096`
2. Check firewall rules
3. Verify host/port configuration

### "Path not found"

**Causes**:
- Path mapping incorrect
- Jellyfin can't access path
- Permission issues

**Solutions**:
1. Configure path mappings
2. Check Jellyfin library paths
3. Verify file permissions

## Jellyfin Version Compatibility

| Jellyfin Version | REST API | Support |
|------------------|----------|---------|
| **10.8.x** | Latest |  Tested |
| **10.9.x** | Latest |  Compatible |
| **10.7.x** | Compatible |   Untested |
| **10.6.x and older** | Legacy | L Unsupported |

**Recommendation**: Jellyfin 10.8+ for best experience.

## Future Enhancements

**Priority 1**:
- [ ] Path-specific library updates
- [ ] Scan progress polling
- [ ] Reliable completion detection

**Priority 2**:
- [ ] Active session monitoring
- [ ] Skip sync during playback
- [ ] Item-level metadata updates

**Priority 3**:
- [ ] WebSocket support (if Jellyfin adds)
- [ ] Multiple instance support
- [ ] Real-time event handling

## See Also

- [Player Overview](./OVERVIEW.md) - All player capabilities
- [Kodi Integration](./KODI.md) - Full-featured reference implementation
- [Publishing Phase](../phases/PUBLISHING.md) - Asset deployment workflow
- [NFO Format](../reference/NFO_FORMAT.md) - NFO file specification
- [Official Jellyfin API Docs](https://api.jellyfin.org/) - Complete API reference
- [Jellyfin GitHub](https://github.com/jellyfin/jellyfin) - Source code and issues
