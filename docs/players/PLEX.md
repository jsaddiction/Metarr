# Plex Integration

**Purpose**: Plex Media Server integration via Plex Media Server API for library synchronization.

**Status**:   Partial Implementation - Basic library scanning supported

**Related Docs**:
- [Player Overview](./OVERVIEW.md) - All player capabilities
- [Kodi Integration](./KODI.md) - Reference for full implementation
- [Publishing Phase](../phases/PUBLISHING.md) - Asset deployment workflow
- [Plex API Docs](https://www.plexopedia.com/plex-media-server/api/) - Unofficial API reference

## Quick Reference

**Protocol**: Plex Media Server API (HTTP/HTTPS)

**Port**: `32400` (default)

**Sync Strategy**: Library-level scan (pull sync)

**Key Features**:
- Plex Media Server API
- X-Plex-Token authentication
- Library section scanning
- Path mapping support

**Limitations** (Current Implementation):
- No item-level refresh
- No real-time events (without Plex Pass webhooks)
- No active player detection
- Polling only for completion
- Single instance per group

**Prerequisites**:
- Plex Media Server installed
- Plex account
- X-Plex-Token generated
- Network accessible

## Setup

### Get X-Plex-Token

**Method 1: Via XML (Easiest)**:

1. **Navigate to Library**:
   - Open Plex Web App
   - Navigate to any library item

2. **Get XML**:
   - Click "..." menu on any item
   - Click "Get Info"
   - Click "View XML"

3. **Extract Token**:
   - Look at URL: `https://plex.tv/...?X-Plex-Token=YOUR_TOKEN_HERE`
   - Copy token (long alphanumeric string)

**Method 2: Via Plex Sign In (API)**:

```bash
# Sign in to get token
curl -X POST 'https://plex.tv/users/sign_in.json' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'user[login]=your_email@example.com' \
  -d 'user[password]=your_password'
```

**Response**:
```json
{
  "user": {
    "authToken": "YOUR_PLEX_TOKEN_HERE",
    "username": "your_username"
  }
}
```

**Method 3: Via Preferences (Advanced)**:

1. Plex Web App ’ Settings ’ General
2. Network ’ Show Advanced
3. Temporary file ’ Right click ’ Inspect Element
4. Find `X-Plex-Token` in network requests

### Add Plex to Metarr

**Via UI**:
1. Settings ’ Players ’ Add Player
2. **Type**: Plex
3. **Name**: "Plex Server"
4. **Host**: `192.168.1.30`
5. **Port**: `32400`
6. **X-Plex-Token**: Paste token
7. **Test Connection**
8. **Save**

**Via API**:
```bash
POST /api/players
{
  "name": "Plex Server",
  "type": "plex",
  "host": "192.168.1.30",
  "port": 32400,
  "plex_token": "your_plex_token_here",
  "group_id": 3,
  "path_mappings": []
}
```

## Plex Media Server API

### Authentication

All requests require X-Plex-Token:

```http
GET /library/sections
Host: plex-ip:32400
X-Plex-Token: your_plex_token_here
```

**Headers**:
- `X-Plex-Token`: Authentication token (required)
- `Accept`: `application/json` (optional, default XML)

### Key Endpoints Used

#### Library Sections

**Get Library Sections**:
```http
GET /library/sections
X-Plex-Token: {token}
Accept: application/json
```

**Response**:
```json
{
  "MediaContainer": {
    "Directory": [
      {
        "key": "1",
        "title": "Movies",
        "type": "movie",
        "Location": [
          { "path": "/media/movies" }
        ]
      },
      {
        "key": "2",
        "title": "TV Shows",
        "type": "show",
        "Location": [
          { "path": "/media/tv" }
        ]
      }
    ]
  }
}
```

**Scan Library Section**:
```http
GET /library/sections/{section_id}/refresh
X-Plex-Token: {token}
```

**Scan Specific Path** (Partial Scan):
```http
GET /library/sections/{section_id}/refresh?path={url_encoded_path}
X-Plex-Token: {token}
```

#### Server Information

**Get Server Identity**:
```http
GET /identity
X-Plex-Token: {token}
```

**Response**:
```json
{
  "MediaContainer": {
    "machineIdentifier": "abc123...",
    "version": "1.32.8.7639"
  }
}
```

**Get Sessions** (Active Playback):
```http
GET /status/sessions
X-Plex-Token: {token}
```

**Response** (when someone watching):
```json
{
  "MediaContainer": {
    "Metadata": [
      {
        "type": "movie",
        "title": "The Matrix",
        "Player": {
          "state": "playing",
          "machineIdentifier": "client-id"
        }
      }
    ]
  }
}
```

## Sync Workflow

### Library-Level Scan (Current Implementation)

**Goal**: Trigger Plex to scan library section

**Steps**:
1. Metarr publishes assets for "The Matrix (1999)"
2. Metarr determines library section (Movies = section 1)
3. Metarr sends `GET /library/sections/1/refresh`
4. Plex queues scan
5. Metarr polls for completion (timeout after 60 seconds)
6. Plex scans entire Movies library
7. Metarr reports success on timeout (assumes complete)

**Limitations**:
- Scans entire section, not just changed item
- No reliable completion detection
- Timeout-based success (unreliable)
- Slow for large libraries

### Path-Specific Scan (Partial Implementation)

**Goal**: Scan specific directory

**Endpoint**: `GET /library/sections/{id}/refresh?path={path}`

**Example**:
```http
GET /library/sections/1/refresh?path=%2Fmedia%2Fmovies%2FThe%20Matrix%20(1999)
X-Plex-Token: {token}
```

**Status**: Implemented but requires accurate path mapping

**Advantages**:
- Faster than full section scan
- More targeted
- Better for automation

## Path Mapping

Critical for Plex due to containerization and network shares.

### Docker Scenario

**Metarr** (container):
```
/media/movies/The Matrix (1999)/
```

**Plex** (different container):
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
    }
  ]
}
```

### Remote Server Scenario

**Metarr** (local):
```
/mnt/nas/media/movies/
```

**Plex** (remote server):
```
/volume1/media/movies/
```

**Path Mapping**:
```json
{
  "path_mappings": [
    {
      "metarr_path": "/mnt/nas/media",
      "player_path": "/volume1/media"
    }
  ]
}
```

## Metadata and Plex

Plex has its own metadata system but respects local assets:

**Plex Agents**:
- Plex Movie (default): Plex metadata database
- Plex Series (default): Plex metadata database
- Personal Media: Local files only

**Local Assets Priority**:
1. Configure library ’ Advanced ’ Prefer local metadata
2. Plex reads local assets (posters, fanart)
3. Plex may override with own metadata unless locked

**Recommended**: Use "Personal Media" agent or enable "Prefer local metadata" for Metarr-managed libraries.

**Image Assets** (Plex Naming):
- `poster.jpg` or `folder.jpg`: Primary image
- `art.jpg` or `fanart.jpg`: Background
- `banner.jpg`: Wide banner
- `thumb.jpg`: Thumbnail

**NFO Files**:
- Plex does NOT read Kodi NFO files by default
- Requires "XBMCnfoMoviesImporter" agent (community plugin)
- Metarr writes NFOs for Kodi/Jellyfin compatibility

## Plex Pass Features

**Webhooks** (Plex Pass Subscribers Only):
- Real-time notifications on library changes
- Webhook on scan completion
- Webhook on playback events

**Setup Webhooks**:
1. Plex Settings ’ Webhook
2. Add webhook URL: `http://metarr-ip:3000/api/webhooks/plex`
3. Metarr receives events in real-time

**Events**:
- `library.new`: New item added
- `library.on.deck`: Item added to on deck
- `media.play`: Playback started
- `media.stop`: Playback stopped

**Status**: Webhook support not yet implemented in Metarr.

## Limitations

### Current Implementation

**No Item-Level Refresh**:
- Cannot refresh specific movie/show
- Must scan entire section or path
- Slower than Kodi item-level sync

**No Event System** (Without Plex Pass):
- No scan completion events
- Polling-based with timeout
- Webhook support not implemented

**No Active Player Detection**:
- `/status/sessions` not queried
- Cannot skip sync during playback
- May cause buffering

**Single Instance Only**:
- One Plex server per group
- Cannot sync multiple Plex servers
- Enforced by group `max_members: 1`

### Planned Improvements

**Webhook Integration** (Priority 1):
- Receive real-time scan completion
- Detect playback events
- Skip sync if user watching

**Session Monitoring** (Priority 2):
- Query `/status/sessions`
- Skip sync during active playback
- Better user experience

**Metadata Agent** (Priority 3):
- Plex agent to read Metarr metadata
- Full integration without "Prefer local metadata"
- Advanced use case

## Configuration

### Player Settings

```json
{
  "name": "Plex Server",
  "type": "plex",
  "host": "192.168.1.30",
  "port": 32400,
  "use_https": false,
  "plex_token": "your_plex_token_here",
  "timeout_seconds": 60,
  "path_mappings": []
}
```

### Group Settings

```json
{
  "name": "Plex",
  "type": "plex",
  "max_members": 1,
  "skip_active": false,
  "sync_strategy": "library-level"
}
```

### Library Settings (Plex)

For best Metarr integration:

1. **Library ’ Edit ’ Advanced**:
   -  Prefer local metadata
   -  Enable local assets only (optional)

2. **Agent**: Consider "Personal Media" for full local control

## Troubleshooting

### "Authentication failed"

**Causes**:
- Invalid X-Plex-Token
- Token expired
- Wrong Plex server

**Solutions**:
1. Regenerate X-Plex-Token
2. Verify token in browser: `http://plex-ip:32400/library/sections?X-Plex-Token=YOUR_TOKEN`
3. Check host/port configuration

### "Library scan not completing"

**Symptoms**: Timeout after 60 seconds

**Cause**: Large library still scanning

**Solutions**:
1. Increase timeout in settings
2. Use path-specific scan
3. Check Plex dashboard for scan status

### "Connection refused"

**Causes**:
- Plex Media Server not running
- Firewall blocking port 32400
- Wrong host/port

**Solutions**:
1. Verify Plex accessible: `http://plex-ip:32400/web`
2. Check firewall rules
3. Verify host/port configuration

### "Path not found"

**Causes**:
- Path mapping incorrect
- Plex can't access path
- Permission issues

**Solutions**:
1. Configure path mappings
2. Check Plex library paths in Plex settings
3. Verify Plex user has file permissions

### Plex Ignoring Local Assets

**Symptoms**: Plex uses own metadata despite local assets present

**Causes**:
- "Prefer local metadata" disabled
- Plex agent overriding
- Assets not named correctly

**Solutions**:
1. Enable "Prefer local metadata" in library settings
2. Use "Personal Media" agent
3. Verify image naming matches Plex conventions
4. Force refresh: Library ’ ... ’ Refresh All Metadata

## Plex Version Compatibility

| Plex Version | API | Support |
|--------------|-----|---------|
| **1.32.x** | Latest |  Tested |
| **1.30.x - 1.31.x** | Compatible |  Compatible |
| **1.29.x and older** | Legacy |   Untested |

**Recommendation**: Latest Plex Media Server for best experience.

## Future Enhancements

**Priority 1**:
- [ ] Webhook integration (Plex Pass)
- [ ] Real-time scan completion
- [ ] Playback event handling

**Priority 2**:
- [ ] Session monitoring
- [ ] Skip sync during playback
- [ ] Active player detection

**Priority 3**:
- [ ] Custom Plex agent
- [ ] Item-level metadata updates
- [ ] Multiple instance support

## See Also

- [Player Overview](./OVERVIEW.md) - All player capabilities
- [Kodi Integration](./KODI.md) - Full-featured reference implementation
- [Jellyfin Integration](./JELLYFIN.md) - Similar REST API player
- [Publishing Phase](../phases/PUBLISHING.md) - Asset deployment workflow
- [Plex Media Server API](https://www.plexopedia.com/plex-media-server/api/) - Unofficial API docs
- [Plex Support](https://support.plex.tv/) - Official Plex documentation
