# Webhook Integration Reference

**Purpose**: Complete reference for Radarr/Sonarr/Lidarr webhook integration.

**Related Docs**:
- Parent: [Reference Documentation](../INDEX.md#reference-technical-details)
- Related: [Scanning Phase](../concepts/Scanning/README.md), [Path Mapping](PATH_MAPPING.md)

---

## Quick Reference

Metarr receives webhooks from download managers when media is downloaded, renamed, or deleted. All webhooks are logged to `activity_log` table for debugging.

**Primary workflow trigger**: `Download` event (triggers full scan workflow)

**Webhook endpoints**:
- Radarr: `http://metarr:3000/api/webhooks/radarr`
- Sonarr: `http://metarr:3000/api/webhooks/sonarr`
- Lidarr: `http://metarr:3000/api/webhooks/lidarr`

---

## Radarr Webhook Events

| Event | When Sent | Metarr Action | Priority |
|-------|-----------|---------------|----------|
| **Grab** | Download queued | Check if playing, notify | Info |
| **Download** | Download complete | **Full scan workflow** ⭐ | Critical |
| **MovieRename** | File renamed | Update `file_path` | High |
| **MovieFileDelete** | File being deleted | **Mark for deletion** ⭐ | High |
| **MovieAdded** | Movie added to Radarr | Log only | Info |
| **MovieDelete** | Movie removed from Radarr | Log only | Info |
| **HealthIssue** | System health problem | Log, notify | Warning |
| **HealthRestored** | Health resolved | Log, notify | Info |
| **ApplicationUpdate** | Radarr updated | Log only | Info |
| **ManualInteractionRequired** | User action needed | Log, notify | Warning |

---

## Key Webhook Payloads

### Download Event (Primary Trigger)

```json
{
  "eventType": "Download",
  "instanceName": "Radarr",
  "movie": {
    "id": 123,
    "title": "The Matrix",
    "year": 1999,
    "tmdbId": 603,
    "imdbId": "tt0133093",
    "folderPath": "/movies/The Matrix (1999)",
    "filePath": "/movies/The Matrix (1999)/The Matrix.mkv"
  },
  "movieFile": {
    "path": "/movies/The Matrix (1999)/The Matrix.mkv",
    "quality": "Bluray-1080p",
    "releaseGroup": "SPARKS"
  },
  "isUpgrade": false
}
```

**Metarr Actions**:
1. Apply manager path mapping (Radarr path → Metarr path)
2. Search database by `tmdbId`
3. If found: Update `file_path`, clear `deleted_on`
4. If not found: Create new movie record
5. Run unified scan (parse NFO, FFprobe, discover assets)
6. Emit `movie.download.complete` notification event
7. Trigger media player library scan

---

### MovieFileDelete Event

```json
{
  "eventType": "MovieFileDelete",
  "movie": {
    "tmdbId": 603,
    "title": "The Matrix",
    "folderPath": "/movies/The Matrix (1999)"
  },
  "movieFile": {
    "path": "/movies/The Matrix (1999)/The Matrix.mkv"
  },
  "deleteReason": "Manual"  // "Manual", "Upgrade", or "MissingFromDisk"
}
```

**Delete Reasons**:
- `Manual`: User manually deleted file
- `Upgrade`: File being replaced with better quality (OnDownload will follow)
- `MissingFromDisk`: Radarr detected file is missing

**Metarr Actions**:
1. If `deleteReason === 'Upgrade'`: Do nothing (OnDownload arrives shortly)
2. If `deleteReason === 'Manual'` or `'MissingFromDisk'`:
   - Set `deleted_on = datetime('now', '+7 days')` on movie
   - Set `deleted_on = datetime('now', '+7 days')` on images
   - Emit `movie.file.deleted` notification event

**7-day grace period**: Allows recovery before permanent deletion (garbage collector runs daily).

---

### MovieRename Event

```json
{
  "eventType": "MovieRename",
  "movie": {
    "tmdbId": 603,
    "folderPath": "/movies/The Matrix (1999)",
    "filePath": "/movies/The Matrix (1999)/The Matrix (1999).mkv"  // New name
  }
}
```

**Metarr Actions**:
1. Search database by `tmdbId`
2. Find new video file in `folderPath`
3. Update `file_path` in database
4. Regenerate NFO file with new filename
5. Emit `movie.renamed` notification event
6. Trigger media player library scan

---

### Grab Event

```json
{
  "eventType": "Grab",
  "movie": {
    "tmdbId": 603,
    "title": "The Matrix"
  },
  "release": {
    "quality": "Bluray-1080p",
    "size": 8589934592
  }
}
```

**Metarr Actions**:
1. Check if movie is currently playing on any Kodi player
2. If playing: Send notification "Upgrade downloading: {title}"
3. Emit `movie.download.started` notification event
4. Log to `activity_log`

---

### HealthIssue Event

```json
{
  "eventType": "HealthIssue",
  "level": "Warning",  // "Ok", "Notice", "Warning", "Error"
  "message": "Download client is unavailable",
  "type": "DownloadClientUnavailable"
}
```

**Metarr Actions**:
1. Log to `activity_log` with severity based on level
2. Emit `health.issue.detected` notification event

---

## Webhook Configuration

### Radarr Setup

1. **Settings → Connect → Add → Webhook**
2. **Name**: Metarr
3. **Triggers**: Select all events
   - ☑ On Grab
   - ☑ On Import/Upgrade (Download)
   - ☑ On Rename
   - ☑ On Movie Added
   - ☑ On Movie Delete
   - ☑ On Movie File Delete
   - ☑ On Health Issue
   - ☑ On Health Restored
   - ☑ On Application Update
   - ☑ On Manual Interaction Required
4. **URL**: `http://metarr:3000/api/webhooks/radarr`
5. **Method**: POST
6. **Test**: Send test webhook to verify connectivity

---

## Path Mapping

Radarr sends paths as it sees them, which may differ from Metarr's filesystem view.

**Example**:
- **Radarr Container**: `/movies/The Matrix (1999)/`
- **Metarr Container**: `/data/movies/The Matrix (1999)/`

**Configuration**: Add mapping in `manager_path_mappings` table:
```sql
INSERT INTO manager_path_mappings (manager_type, manager_path, metarr_path)
VALUES ('radarr', '/movies/', '/data/movies/');
```

**Translation**:
```typescript
function applyManagerPathMapping(managerPath: string): string {
  // Radarr path: /movies/The Matrix (1999)/
  // Metarr path:  /data/movies/The Matrix (1999)/
  return managerPath.replace('/movies/', '/data/movies/');
}
```

**See**: [Path Mapping Reference](PATH_MAPPING.md) for complete configuration.

---

## Webhook Logging

All webhooks are logged to `activity_log` table:

```sql
INSERT INTO activity_log (
  timestamp, event_type, severity,
  entity_type, description, metadata
) VALUES (
  datetime('now'), 'webhook', 'info',
  'webhook', 'Radarr Download: The Matrix',
  JSON_OBJECT(
    'source', 'radarr',
    'eventType', 'Download',
    'status', 'processed',
    'processingTime', 1250
  )
);
```

**Query Examples**:
```sql
-- All webhooks from last 24 hours
SELECT * FROM activity_log
WHERE event_type = 'webhook'
  AND timestamp >= datetime('now', '-1 day')
ORDER BY timestamp DESC;

-- Failed webhooks
SELECT * FROM activity_log
WHERE event_type = 'webhook' AND severity = 'error'
ORDER BY timestamp DESC;

-- Specific event type
SELECT * FROM activity_log
WHERE event_type = 'webhook'
  AND json_extract(metadata, '$.eventType') = 'Download'
ORDER BY timestamp DESC LIMIT 100;
```

---

## Error Handling

**Webhook Processing Failures**:
1. Error logged to `activity_log` with `severity = 'error'`
2. Full error message and stack trace stored in `metadata` field
3. Webhook can be replayed from activity log for debugging

**Retry Logic**: Webhooks are **not automatically retried** (Radarr doesn't resend). Scheduled library scans will eventually catch missed items.

**Common Issues**:
| Issue | Cause | Solution |
|-------|-------|----------|
| Path not found | Path mapping incorrect | Check `manager_path_mappings` |
| Movie not found in DB | TMDB ID mismatch | Check NFO files, manual identify |
| Permission denied | Metarr can't read directory | Check filesystem permissions |

---

## Security

**Recommended**: Network isolation - run Radarr and Metarr on same internal network, use firewall to block external access.

**Future**: API key authentication (planned enhancement).

---

## Testing

**Radarr Test Webhook**: Click "Test" button in webhook settings. Sends:
```json
{
  "eventType": "Test",
  "movie": {"title": "Test Movie", "year": 1970}
}
```

**Manual Testing**:
```bash
curl -X POST http://metarr:3000/api/webhooks/radarr \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "Download",
    "movie": {
      "tmdbId": 603,
      "folderPath": "/movies/The Matrix (1999)",
      "filePath": "/movies/The Matrix (1999)/The Matrix.mkv"
    },
    "isUpgrade": false
  }'
```

---

## Sonarr / Lidarr

Sonarr (TV shows) and Lidarr (music) follow similar webhook patterns:
- **Sonarr**: `OnGrab`, `OnDownload`, `OnSeriesAdd`, `OnEpisodeFileDelete`, `OnRename`, etc.
- **Lidarr**: `OnGrab`, `OnDownload`, `OnAlbumDownload`, `OnArtistAdd`, etc.

Configuration identical to Radarr (different endpoint URL).

---

## Best Practices

1. **Enable all events** for complete coverage
2. **Monitor logs** regularly for webhook failures
3. **Configure path mappings** when running in containers
4. **Run scheduled scans** daily to catch any missed webhooks
5. **Use 7-day grace period** to recover from accidental deletions
