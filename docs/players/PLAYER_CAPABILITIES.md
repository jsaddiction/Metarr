# Media Player Live Activity Capabilities

Research document tracking what live activity information each media player type can provide.

## Kodi (JSON-RPC)

### WebSocket Notifications
- ✅ **Playback Events**: `Player.OnPlay`, `Player.OnPause`, `Player.OnStop`
- ✅ **Scan Events**: `VideoLibrary.OnScanStarted`, `VideoLibrary.OnScanFinished`, `AudioLibrary.OnScanStarted`, `AudioLibrary.OnScanFinished`
- ❌ **Scan Progress**: NOT provided (only start/finish)
- ✅ **Media Info**: Title, year, show/episode details available in `OnPlay` params
- ⚠️ **Playback Progress**: NOT sent automatically, but can be polled via `Player.GetProperties()` over WebSocket

### Playback Progress Strategy
When `Player.OnPlay` is received:
1. Call `Player.GetItem(playerid)` to get full media details including filepath
2. Call `Player.GetProperties(playerid, ["time", "totaltime", "percentage"])` to get initial position
3. Poll `Player.GetProperties()` every 10-15s while playing to update progress
4. Stop polling on `Player.OnPause` or `Player.OnStop`

**Benefits:**
- Track current filepath (useful for scan coordination and *arr upgrades)
- Display live progress without hammering the player
- Works over WebSocket (no need for HTTP fallback)

### Polling Capabilities (HTTP JSON-RPC)
- ✅ `Player.GetActivePlayers()` - Check if media is playing
- ✅ `Player.GetProperties()` - Get current playback position, speed, etc.
- ✅ `Player.GetItem()` - Get full details of currently playing item (including filepath)
- ❌ No API for scan progress percentage

### Connection Types
- ✅ WebSocket (port 9090) - Real-time notifications
- ✅ HTTP JSON-RPC (port 8080) - Request/response only

### Implementation Status
- ✅ Implemented in Metarr

---

## Jellyfin

### WebSocket API
**Documentation**: https://jellyfin.org/docs/general/networking/websocket

- ✅ **Playback Events**: `PlaybackStart`, `PlaybackStopped`, `PlaybackProgress`
- ✅ **Library Scan Events**: `LibraryScanStarted`, `LibraryScanFinished`
- ⚠️ **Scan Progress**: UNCLEAR - needs testing
- ✅ **Session Updates**: Full session state pushed via WebSocket
- ✅ **Playback Progress**: Automatic progress updates during playback

### REST API
- ✅ `/System/ActivityLog` - Recent server activity
- ✅ `/Sessions` - Active playback sessions
- ✅ `/Library/MediaFolders` - Library statistics
- ⚠️ `/ScheduledTasks` - Might include scan progress

### Connection Types
- ✅ WebSocket - Real-time events
- ✅ REST API - Request/response

### Implementation Status
- ❌ Not yet implemented in Metarr
- 📝 TODO: Research scan progress capabilities

---

## Plex

### Webhooks
**Documentation**: https://support.plex.tv/articles/115002267687-webhooks/

- ✅ **Playback Events**: `media.play`, `media.pause`, `media.resume`, `media.stop`
- ✅ **Library Events**: `library.new`, `library.on.deck`
- ❌ **Scan Progress**: NOT provided via webhooks
- ✅ **Media Info**: Full metadata in webhook payload
- ✅ **Playback Progress**: `media.scrobble` at 90% watched

### API (requires Plex Pass for some features)
- ✅ `/status/sessions` - Active playback sessions
- ✅ `/library/sections/{id}/all` - Library statistics
- ⚠️ `/activities` - Background tasks (might include scan progress)

### Connection Types
- ✅ Webhooks - Server pushes events to Metarr
- ✅ REST API - Request/response
- ❌ No native WebSocket support

### Implementation Status
- ❌ Not yet implemented in Metarr
- 📝 TODO: Research `/activities` endpoint for scan progress

---

## Emby (for reference)

### WebSocket API
Similar to Jellyfin (Jellyfin is a fork of Emby)

- ✅ Playback events
- ✅ Library scan events
- ⚠️ Scan progress - needs research

### Implementation Status
- ❌ Not planned (lower priority than Jellyfin/Plex)

---

## Summary Table

| Feature | Kodi | Jellyfin | Plex | Notes |
|---------|------|----------|------|-------|
| Playback Events | ✅ | ✅ | ✅ | All support this |
| Media Details | ✅ | ✅ | ✅ | Title, year, etc. |
| Scan Start/Stop | ✅ | ✅ | ❌ | Plex uses webhooks |
| **Scan Progress** | ❌ | ⚠️ | ⚠️ | **Needs research** |
| Playback Progress | ❌ (poll) | ✅ (push) | ✅ (webhook) | Kodi requires polling |
| WebSocket | ✅ | ✅ | ❌ | Plex uses webhooks instead |

---

## Activity State Design Implications

### Current Implementation (Kodi-based)
```typescript
activity: {
  type: 'idle' | 'playing' | 'paused' | 'scanning';
  details?: string; // Media title or "Video Library"
  progress?: {
    // For playback (Kodi supports via polling)
    percentage?: number;      // 0-100 playback percentage
    currentSeconds?: number;  // Current position (seconds)
    totalSeconds?: number;    // Total duration (seconds)

    // For scanning (NOT supported by Kodi)
    // scanProgress?: number;  // Will add for Jellyfin/Plex
  };
  filepath?: string; // Current playing file path (useful for scan coordination)
}
```

### Why Track Filepath?

**Use Case 1: Scan Coordination**
```typescript
// Before scanning a directory, check if Kodi is playing from it
const activityState = connectionManager.getActivityState(playerId);
if (activityState?.filepath?.startsWith('/media/movies/')) {
  logger.warn('Skipping scan - Kodi is playing from this directory');
}
```

**Use Case 2: *arr Upgrade Detection**
```typescript
// Radarr webhook: "About to replace Movie.2010.1080p.mkv with Movie.2010.2160p.mkv"
const playingFile = activityState?.filepath;
if (playingFile === '/media/movies/Movie (2010)/Movie.2010.1080p.mkv') {
  // Stop playback or warn user before *arr deletes the file
  await kodiClient.stopPlayer(playerId);
  await kodiClient.showNotification({
    title: 'Metarr',
    message: 'Pausing playback - media upgrade in progress'
  });
}
```

### Conditional UI Rendering
```typescript
// Show progress bar only if progress data is available
{activity.progress?.percentage !== undefined && (
  <ProgressBar value={activity.progress.percentage} />
)}

// For Kodi, just show spinner
{activity.type === 'scanning' && !activity.progress && (
  <FontAwesomeIcon icon={faRotate} className="animate-spin" />
)}
```

---

## Research Tasks

- [ ] Test Jellyfin WebSocket for scan progress events
- [ ] Test Plex `/activities` endpoint during library scan
- [ ] Document Jellyfin session state structure
- [ ] Document Plex webhook payload structure
- [ ] Design adapter pattern for multi-player activity tracking

---

## Notes

- **Kodi Limitation**: No scan progress is a known limitation. Some Kodi skins poll `VideoLibrary.GetMovies` repeatedly during scans to estimate progress, but this is inefficient and unreliable.
- **Jellyfin Advantage**: As a server-first architecture, Jellyfin likely has better visibility into scan progress than Kodi.
- **Plex Approach**: Plex is very server-centric and probably provides detailed task progress in their API.

---

*Last Updated: 2025-10-25*
