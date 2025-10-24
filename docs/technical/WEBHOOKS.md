# Webhook Integration

This document details webhook integration with media managers (Radarr/Sonarr/Lidarr) and the events they send to Metarr.

---

## Overview

Metarr receives webhooks from download managers when media is downloaded, renamed, deleted, or when system events occur. Webhooks provide immediate notification of changes, enabling real-time metadata management.

**Key Point**: All webhooks are logged to `activity_log` table with `event_type = 'webhook'` for debugging and audit purposes.

---

## Radarr Webhook Events

### Event Types

| Event | When Sent | Action | Priority |
|-------|-----------|--------|----------|
| **Grab** | Download queued | Check if playing, notify | Info |
| **Download** | Download complete | **Full scan workflow** | Critical ⭐ |
| **MovieRename** | File renamed | Update `file_path` | High |
| **MovieFileDelete** | File being deleted | **Mark for deletion** | High ⭐ |
| **MovieAdded** | Movie added to Radarr database (not downloaded) | Log only | Info |
| **MovieDelete** | Movie removed from Radarr database | Log only | Info |
| **HealthIssue** | System health problem | Log, notify | Warning |
| **HealthRestored** | Health resolved | Log, notify | Info |
| **ApplicationUpdate** | Radarr updated | Log only | Info |
| **ManualInteractionRequired** | User action needed | Log, notify | Warning |

---

## Webhook Payloads

### Download Event ⭐

**When**: Download completes (primary workflow trigger)

```json
{
  "eventType": "Download",
  "instanceName": "Radarr",
  "applicationUrl": "http://radarr:7878",

  "movie": {
    "id": 123,
    "title": "The Matrix",
    "year": 1999,
    "tmdbId": 603,
    "imdbId": "tt0133093",
    "releaseDate": "1999-03-31",
    "folderPath": "/movies/The Matrix (1999)",
    "filePath": "/movies/The Matrix (1999)/The Matrix.mkv",
    "overview": "A computer hacker learns...",
    "originalLanguage": "en",
    "genres": ["Action", "Science Fiction"],
    "images": [
      {
        "coverType": "poster",
        "url": "https://image.tmdb.org/..."
      }
    ],
    "tags": []
  },

  "movieFile": {
    "id": 456,
    "relativePath": "The Matrix.mkv",
    "path": "/movies/The Matrix (1999)/The Matrix.mkv",
    "quality": "Bluray-1080p",
    "qualityVersion": 1,
    "releaseGroup": "SPARKS",
    "sceneName": "The.Matrix.1999.1080p.BluRay.x264-SPARKS"
  },

  "isUpgrade": false,
  "downloadClient": "qBittorrent",
  "downloadId": "ABC123..."
}
```

**Metarr Actions**:
1. Apply manager path mapping (Radarr path → Metarr path)
2. Search database by `tmdbId`
3. If found: Update `file_path` if changed, clear `deleted_on` if set
4. If not found: Create new movie record
5. Run unified scan (parse NFO, FFprobe, discover assets)
6. Emit `movie.download.complete` notification event
7. Trigger media player library scan

---

### Grab Event

**When**: Download queued/grabbed

```json
{
  "eventType": "Grab",
  "movie": {
    "id": 123,
    "title": "The Matrix",
    "year": 1999,
    "tmdbId": 603,
    "imdbId": "tt0133093"
  },
  "release": {
    "quality": "Bluray-1080p",
    "size": 8589934592,
    "indexer": "NZBgeek"
  }
}
```

**Metarr Actions**:
1. Check if movie is currently playing on any Kodi player
2. If playing: Send notification "Upgrade downloading: {title}"
3. Emit `movie.download.started` notification event
4. Log to `activity_log`

---

### MovieFileDelete Event ⭐

**When**: File is being deleted (sent BEFORE file is removed)

```json
{
  "eventType": "MovieFileDelete",
  "movie": {
    "id": 123,
    "title": "The Matrix",
    "year": 1999,
    "tmdbId": 603,
    "imdbId": "tt0133093",
    "folderPath": "/movies/The Matrix (1999)"
  },
  "movieFile": {
    "id": 456,
    "relativePath": "The Matrix.mkv",
    "path": "/movies/The Matrix (1999)/The Matrix.mkv",
    "quality": "Bluray-1080p"
  },
  "deleteReason": "Manual"  // "Manual", "Upgrade", or "MissingFromDisk"
}
```

**Delete Reasons**:
- `Manual`: User manually deleted file
- `Upgrade`: File being replaced with better quality (OnDownload will follow)
- `MissingFromDisk`: Radarr detected file is missing

**Metarr Actions**:
1. Search database by `tmdbId`
2. If `deleteReason === 'Upgrade'`: Do nothing (OnDownload will arrive shortly)
3. If `deleteReason === 'Manual'` or `'MissingFromDisk'`:
   - Set `deleted_on = datetime('now', '+7 days')` on movie
   - Set `deleted_on = datetime('now', '+7 days')` on images
   - Emit `movie.file.deleted` notification event
4. Log to `activity_log`

**Important**: 7-day grace period allows recovery before permanent deletion (garbage collector runs daily)

---

### MovieRename Event

**When**: File renamed by Radarr

```json
{
  "eventType": "MovieRename",
  "movie": {
    "id": 123,
    "title": "The Matrix",
    "year": 1999,
    "tmdbId": 603,
    "imdbId": "tt0133093",
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

### MovieAdded Event

**When**: Movie added to Radarr database (not yet downloaded)

```json
{
  "eventType": "MovieAdded",
  "movie": {
    "id": 123,
    "title": "The Matrix",
    "year": 1999,
    "tmdbId": 603,
    "imdbId": "tt0133093",
    "folderPath": "/movies/The Matrix (1999)",
    "filePath": null  // No file yet
  }
}
```

**Metarr Actions**:
1. Log to `activity_log`
2. No further action (wait for OnDownload)

**Note**: If `filePath` is not null (movie added with existing file), Metarr can optionally scan it, but typically OnDownload is sent shortly after.

---

### MovieDelete Event

**When**: Movie removed from Radarr database

```json
{
  "eventType": "MovieDelete",
  "movie": {
    "id": 123,
    "title": "The Matrix",
    "tmdbId": 603,
    "imdbId": "tt0133093",
    "folderPath": "/movies/The Matrix (1999)"
  },
  "deletedFiles": false  // Whether files were also deleted
}
```

**Metarr Actions**:
1. Log to `activity_log`
2. No further action

**Note**: If files were deleted, `OnMovieFileDelete` was already sent. If `deletedFiles: false`, movie was removed from Radarr but files remain (user may want to keep them).

---

### HealthIssue Event

**When**: Radarr detects a health problem

```json
{
  "eventType": "HealthIssue",
  "level": "Warning",  // "Ok", "Notice", "Warning", "Error"
  "message": "Download client is unavailable",
  "type": "DownloadClientUnavailable",
  "wikiUrl": "https://wiki.servarr.com/..."
}
```

**Metarr Actions**:
1. Log to `activity_log` with severity based on level
2. Emit `health.issue.detected` notification event
3. Notification channels can alert users based on subscription settings

---

### HealthRestored Event

**When**: Previously detected health issue is resolved

```json
{
  "eventType": "HealthRestored",
  "level": "Ok",
  "message": "All health checks passed"
}
```

**Metarr Actions**:
1. Log to `activity_log`
2. Emit `health.issue.resolved` notification event

---

### ApplicationUpdate Event

**When**: Radarr is updated

```json
{
  "eventType": "ApplicationUpdate",
  "previousVersion": "4.5.2.7388",
  "newVersion": "4.6.0.7451",
  "message": "Radarr updated successfully"
}
```

**Metarr Actions**:
1. Log to `activity_log`
2. Emit `system.application.updated` notification event (optional)

---

### ManualInteractionRequired Event

**When**: User must manually select a download

```json
{
  "eventType": "ManualInteractionRequired",
  "movie": {
    "title": "The Matrix",
    "tmdbId": 603
  },
  "downloadInfo": {
    "reason": "Multiple releases available"
  }
}
```

**Metarr Actions**:
1. Log to `activity_log`
2. Emit notification event (optional)

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

## Webhook Logging

All webhooks are logged to the `activity_log` table:

```sql
INSERT INTO activity_log (
  timestamp,
  event_type,
  severity,
  entity_type,
  entity_id,
  description,
  metadata
) VALUES (
  datetime('now'),
  'webhook',
  'info',  -- or 'error' if processing failed
  'webhook',
  NULL,
  'Radarr Download: The Matrix',
  JSON_OBJECT(
    'source', 'radarr',
    'eventType', 'Download',
    'status', 'processed',
    'processingTime', 1250,
    'payload', <full webhook payload>
  )
);
```

### Querying Webhook Logs

```sql
-- Get all webhooks from last 24 hours
SELECT * FROM activity_log
WHERE event_type = 'webhook'
  AND timestamp >= datetime('now', '-1 day')
ORDER BY timestamp DESC;

-- Get failed webhooks
SELECT * FROM activity_log
WHERE event_type = 'webhook'
  AND severity = 'error'
ORDER BY timestamp DESC;

-- Get specific webhook type
SELECT * FROM activity_log
WHERE event_type = 'webhook'
  AND json_extract(metadata, '$.eventType') = 'Download'
ORDER BY timestamp DESC
LIMIT 100;

-- Average processing time by event type
SELECT
  json_extract(metadata, '$.eventType') AS event_type,
  AVG(json_extract(metadata, '$.processingTime')) AS avg_ms,
  COUNT(*) AS count
FROM activity_log
WHERE event_type = 'webhook'
  AND json_extract(metadata, '$.source') = 'radarr'
GROUP BY json_extract(metadata, '$.eventType');
```

---

## Path Mapping

Radarr sends paths as it sees them, which may differ from Metarr's filesystem view.

### Example Scenario

- **Radarr Container**: Sees path as `/movies/The Matrix (1999)/The Matrix.mkv`
- **Metarr Container**: Sees path as `/data/movies/The Matrix (1999)/The Matrix.mkv`
- **Metarr Windows**: Sees path as `M:\Movies\The Matrix (1999)\The Matrix.mkv`

### Configuration

Configure path mappings in `manager_path_mappings` table:

```sql
INSERT INTO manager_path_mappings (manager_type, manager_path, metarr_path)
VALUES ('radarr', '/movies/', 'M:\Movies\');
```

### Translation

```typescript
function applyManagerPathMapping(managerType: string, managerPath: string): string {
  const mappings = db.query(
    `SELECT * FROM manager_path_mappings WHERE manager_type = ? ORDER BY LENGTH(manager_path) DESC`,
    [managerType]
  );

  for (const mapping of mappings) {
    if (managerPath.startsWith(mapping.manager_path)) {
      return managerPath.replace(mapping.manager_path, mapping.metarr_path);
    }
  }

  return managerPath;  // No mapping found
}
```

---

## Error Handling

### Webhook Processing Failures

If webhook processing fails:
1. Error logged to `activity_log` with `severity = 'error'`
2. Full error message and stack trace stored in `metadata` field
3. Webhook can be replayed from activity log for debugging

### Retry Logic

- Webhooks are **not automatically retried** (Radarr doesn't resend)
- Scheduled library scans will eventually catch missed items
- Manual refresh available for individual movies

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Path not found | Path mapping incorrect | Check `manager_path_mappings` |
| Movie not found in DB | TMDB ID mismatch | Check NFO files, manual identify |
| Permission denied | Metarr can't read directory | Check filesystem permissions |
| FFprobe timeout | Large file, slow disk | Increase timeout, check disk speed |

---

## Security

### Webhook Authentication

**Option 1: Network Isolation** (Recommended)
- Run Radarr and Metarr on same internal network
- Use firewall to block external access to webhook endpoint

**Option 2: API Key** (Future Enhancement)
- Configure API key in Radarr webhook settings
- Validate in webhook endpoint

**Option 3: IP Whitelist**
- Only accept webhooks from known Radarr IP addresses

---

## Testing

### Send Test Webhook

Radarr provides a "Test" button when configuring webhooks. This sends:

```json
{
  "eventType": "Test",
  "movie": {
    "title": "Test Movie",
    "year": 1970
  }
}
```

Metarr logs test webhooks but takes no action.

### Manual Webhook Testing

```bash
curl -X POST http://metarr:3000/api/webhooks/radarr \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "Download",
    "movie": {
      "title": "The Matrix",
      "year": 1999,
      "tmdbId": 603,
      "imdbId": "tt0133093",
      "folderPath": "/movies/The Matrix (1999)",
      "filePath": "/movies/The Matrix (1999)/The Matrix.mkv"
    },
    "movieFile": {
      "path": "/movies/The Matrix (1999)/The Matrix.mkv",
      "quality": "Bluray-1080p"
    },
    "isUpgrade": false
  }'
```

---

## Sonarr / Lidarr

Sonarr (TV shows) and Lidarr (music) follow similar webhook patterns:

- **Sonarr**: `OnGrab`, `OnDownload`, `OnSeriesAdd`, `OnSeriesDelete`, `OnEpisodeFileDelete`, `OnRename`, etc.
- **Lidarr**: `OnGrab`, `OnDownload`, `OnAlbumDownload`, `OnArtistAdd`, `OnArtistDelete`, etc.

See respective documentation for event-specific payloads.

---

## Best Practices

1. **Enable All Events**: Configure Radarr to send all webhook events for complete coverage
2. **Monitor Logs**: Regularly check `activity_log` for webhook failures
3. **Path Mapping**: Always configure path mappings when running in containers
4. **Scheduled Scans**: Run scheduled scans daily to catch any missed webhooks
5. **Grace Period**: Utilize 7-day deletion grace period to recover from accidental deletions

---

## Related Documentation

- [WORKFLOWS.md](WORKFLOWS.md) - Complete scanning workflows
- [NOTIFICATIONS.md](NOTIFICATIONS.md) - Notification system architecture
- [PATH_MAPPING.md](PATH_MAPPING.md) - Path mapping configuration
- [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) - Database tables and relationships
