# Stage 4: Webhook Integration - Status

**Started**: 2025-10-15
**Branch**: `feature/stage-4-webhooks`
**Goal**: Complete webhook integration for Radarr/Sonarr/Lidarr with event logging

---

## 📊 Current Status

### ✅ Backend COMPLETE! (100%)

**Infrastructure**:
- ✅ Type definitions (`src/types/webhooks.ts`)
  - `RadarrWebhookPayload`, `SonarrWebhookPayload`, `LidarrWebhookPayload`
  - All event types defined

- ✅ Controller (`src/controllers/webhookController.ts`)
  - `handleRadarr()`, `handleSonarr()`, `handleLidarr()` endpoints
  - Payload validation
  - Event routing to processing service

- ✅ Processing Service (`src/services/webhookProcessingService.ts`)
  - `handleRadarrGrab()` - Implemented (logs activity)
  - `handleRadarrDownload()` - **Fully implemented** (scan workflow + player notification)
  - `handleRadarrRename()` - Implemented (updates file_path)
  - `handleRadarrMovieFileDelete()` - Implemented (marks for deletion)

- ✅ Routes (`src/routes/webhooks.ts`)
  - POST `/api/webhooks/radarr`
  - POST `/api/webhooks/sonarr`
  - POST `/api/webhooks/lidarr`

- ✅ **All Radarr Event Handlers** (Complete!)
  - ✅ `Grab` - Logs activity
  - ✅ `Download` - **Full scan workflow** (enrichment + player notification)
  - ✅ `Rename` - Updates file_path
  - ✅ `MovieFileDeleted` - Logs deletion
  - ✅ `MovieAdded` - Logs to activity_log
  - ✅ `MovieDeleted` - Logs to activity_log
  - ✅ `HealthIssue` - Logs with severity mapping
  - ✅ `HealthRestored` - Logs restoration
  - ✅ `ApplicationUpdate` - Logs version changes
  - ✅ `ManualInteractionRequired` - Logs with warning severity
  - ✅ `Test` - Responds with success

- ✅ **Sonarr/Lidarr Placeholder Handlers** (Complete!)
  - ✅ All events use `handleGenericEvent()`
  - ✅ Logs all events to activity_log
  - ✅ Clear messaging: "full support in Stage 9/10"
  - ✅ Test events respond with success

### ⏳ What Needs Completion

**Frontend Work** (Not started):

**Frontend Work** (Not started):
- [ ] Webhook configuration page (`Settings → Webhooks`)
- [ ] Display webhook URLs (copy-to-clipboard)
- [ ] Setup instructions for Radarr/Sonarr/Lidarr
- [ ] Webhook event history table (last 50 events)
- [ ] Event details modal
- [ ] Test webhook button

---

## 🎯 Implementation Plan

### Phase 1: Complete Backend Event Handlers (Current)

**Step 1: Add Radarr Notification Events**
```typescript
// In webhookProcessingService.ts

async handleRadarrHealthIssue(payload: RadarrWebhookPayload): Promise<void> {
  // Log to activity_log with severity
  // Emit notification event
}

async handleRadarrHealthRestored(payload: RadarrWebhookPayload): Promise<void> {
  // Log to activity_log
  // Emit notification event
}

async handleRadarrApplicationUpdate(payload: RadarrWebhookPayload): Promise<void> {
  // Log to activity_log
}

async handleRadarrManualInteractionRequired(payload: RadarrWebhookPayload): Promise<void> {
  // Log to activity_log
  // Emit notification event
}
```

**Step 2: Update WebhookController**
```typescript
// In webhookController.ts
switch (payload.eventType) {
  case 'Grab':
    await this.webhookService.handleRadarrGrab(payload);
    break;
  case 'Download':
    await this.webhookService.handleRadarrDownload(payload);
    break;
  case 'Rename':
    await this.webhookService.handleRadarrRename(payload);
    break;
  case 'MovieFileDeleted':
    await this.webhookService.handleRadarrMovieFileDelete(payload);
    break;
  case 'MovieAdded':
  case 'MovieDeleted':
    // Just log - no action needed
    await this.webhookService.logEvent('radarr', payload.eventType, payload);
    break;
  case 'HealthIssue':
    await this.webhookService.handleRadarrHealthIssue(payload);
    break;
  case 'HealthRestored':
    await this.webhookService.handleRadarrHealthRestored(payload);
    break;
  case 'ApplicationUpdate':
    await this.webhookService.handleRadarrApplicationUpdate(payload);
    break;
  case 'ManualInteractionRequired':
    await this.webhookService.handleRadarrManualInteractionRequired(payload);
    break;
  case 'Test':
    logger.info('Radarr test webhook received successfully');
    break;
  default:
    logger.info(`Radarr event type '${payload.eventType}' not handled`);
}
```

**Step 3: Sonarr/Lidarr Placeholder Handlers**
```typescript
// For now, just log all Sonarr/Lidarr events to activity_log
// Full implementation in Stage 9 (TV) and Stage 10 (Music)

async handleSonarrEvent(payload: SonarrWebhookPayload): Promise<void> {
  const db = this.dbManager.getConnection();
  await this.logWebhookActivity(db, 'sonarr', payload.eventType, payload);
  logger.info(`Sonarr ${payload.eventType} event logged (full support in Stage 9)`);
}

async handleLidarrEvent(payload: LidarrWebhookPayload): Promise<void> {
  const db = this.dbManager.getConnection();
  await this.logWebhookActivity(db, 'lidarr', payload.eventType, payload);
  logger.info(`Lidarr ${payload.eventType} event logged (full support in Stage 10)`);
}
```

### Phase 2: Frontend Webhook Configuration (After Backend Complete)

**Page**: `Settings → Webhooks`

**Features**:
1. Display webhook URLs for each manager:
   - Radarr: `http://metarr:3000/api/webhooks/radarr`
   - Sonarr: `http://metarr:3000/api/webhooks/sonarr`
   - Lidarr: `http://metarr:3000/api/webhooks/lidarr`

2. Copy-to-clipboard buttons

3. Setup instructions:
   ```
   1. Open Radarr → Settings → Connect
   2. Click "+" and select "Webhook"
   3. Name: "Metarr"
   4. URL: [copy button]
   5. Enable desired events (recommend: all except Test)
   6. Click "Test" to verify connection
   ```

4. Event history table:
   - Columns: Timestamp, Manager, Event Type, Movie/Series/Artist, Status
   - Filterable by manager/event type
   - Click row → show full payload JSON
   - Auto-refresh every 30s

5. Test webhook button:
   - Simulates a webhook event
   - Verifies endpoint is reachable

---

## 🧪 Testing Checklist

### Backend Testing

**Radarr Event Tests**:
- [ ] Grab event → logged to activity_log
- [ ] Download event → movie scanned, metadata enriched, players notified
- [ ] Rename event → file_path updated
- [ ] MovieFileDelete event → movie marked for deletion
- [ ] MovieAdded event → logged only
- [ ] MovieDeleted event → logged only
- [ ] HealthIssue event → logged with severity
- [ ] HealthRestored event → logged
- [ ] ApplicationUpdate event → logged
- [ ] ManualInteractionRequired event → logged with notification
- [ ] Test event → responds with success

**Sonarr Event Tests** (Stage 9):
- [ ] All events logged to activity_log
- [ ] Info message: "full support in Stage 9"

**Lidarr Event Tests** (Stage 10):
- [ ] All events logged to activity_log
- [ ] Info message: "full support in Stage 10"

### Integration Testing

**With Radarr**:
1. Configure Radarr webhook pointing to Metarr
2. Click "Test" in Radarr → verify Metarr receives and responds
3. Download new movie via Radarr
4. Verify:
   - Download event received
   - Movie scanned (file info, streams extracted)
   - Metadata enriched (TMDB fetch)
   - Assets discovered/downloaded
   - Kodi notified (Stage 5)
5. Trigger rename in Radarr
6. Verify file_path updated in database
7. Delete movie in Radarr
8. Verify movie marked for deletion (soft delete)

**With Sonarr** (Basic logging):
1. Configure Sonarr webhook
2. Download TV episode
3. Verify event logged to activity_log
4. Check logs for "full support in Stage 9" message

**With Lidarr** (Basic logging):
1. Configure Lidarr webhook
2. Download music album
3. Verify event logged to activity_log
4. Check logs for "full support in Stage 10" message

### Frontend Testing

**Webhook Configuration Page**:
- [ ] Webhook URLs displayed correctly
- [ ] Copy-to-clipboard works
- [ ] Setup instructions clear and accurate
- [ ] Event history table loads
- [ ] Filtering works (manager, event type)
- [ ] Auto-refresh updates table
- [ ] Row click shows event details
- [ ] Test webhook button works

---

## 📝 Database Requirements

### activity_log Table (Already Exists)

Check if this structure is current:

```sql
CREATE TABLE activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  event_type TEXT NOT NULL,  -- 'webhook', 'job', 'scan', 'user_action'
  source TEXT NOT NULL,       -- 'radarr', 'sonarr', 'lidarr', 'system', 'user'
  severity TEXT DEFAULT 'info',  -- 'debug', 'info', 'warning', 'error', 'critical'
  message TEXT NOT NULL,
  event_data TEXT,           -- JSON payload (for webhooks)
  entity_type TEXT,          -- 'movie', 'series', 'artist', 'library'
  entity_id INTEGER,
  user_id INTEGER
);

CREATE INDEX idx_activity_log_timestamp ON activity_log(timestamp DESC);
CREATE INDEX idx_activity_log_event_type ON activity_log(event_type);
CREATE INDEX idx_activity_log_source ON activity_log(source);
CREATE INDEX idx_activity_log_entity ON activity_log(entity_type, entity_id);
```

If not, create migration to add missing columns/indexes.

---

## 🚀 Next Steps

**Immediate** (To complete Stage 4 backend):
1. Read `webhookProcessingService.ts` fully
2. Implement missing Radarr event handlers (HealthIssue, HealthRestored, etc.)
3. Update `webhookController.ts` switch statements
4. Add placeholder handlers for Sonarr/Lidarr
5. Verify `logWebhookActivity()` method
6. Test with Radarr

**After Backend Complete**:
1. Create `Settings → Webhooks` page
2. Display webhook URLs and instructions
3. Build event history table
4. Test webhook button
5. Test end-to-end with Radarr

**Stage 4 Completion**:
- Mark Stage 4 complete in PROJECT_ROADMAP.md
- Update STAGE_DEFINITIONS.md
- Tag: `git tag stage-4-complete`
- Merge to master
- Create Stage 5 branch (Kodi Integration)

---

## 📚 Related Documentation

- [WEBHOOKS.md](WEBHOOKS.md) - Complete webhook documentation
- [PROJECT_ROADMAP.md](PROJECT_ROADMAP.md) - Current stage tracking
- [STAGE_DEFINITIONS.md](STAGE_DEFINITIONS.md) - Stage 4 definition
- [API_ARCHITECTURE.md](API_ARCHITECTURE.md) - API endpoint specs

---

## 💡 Design Notes

### Why Log All Events?

**Principle**: All webhook events are valuable for debugging and audit purposes, even if we don't take action on them.

**Examples**:
- `MovieAdded` - User manually added movie in Radarr (no file yet)
- `MovieDeleted` - User removed movie from Radarr database
- `ApplicationUpdate` - Radarr was updated (may affect API)
- `HealthIssue` - Radarr has a problem (disk space, permissions, etc.)

**Benefits**:
- Complete audit trail
- Debugging webhook delivery issues
- Understanding user's *arr stack activity
- Future features (notifications, stats, dashboards)

### Why Defer Sonarr/Lidarr Implementation?

**Focus on v1.0**: Complete automation flow for MOVIES first.

**Reasoning**:
1. Movies are the primary use case
2. TV/Music add complexity (series/seasons/episodes, artists/albums/tracks)
3. Backend needs TV/Music tables and scanning logic (Stage 9/10)
4. Better to have one media type working perfectly than three half-working

**What We DO Now**:
- Accept webhooks from all managers
- Log all events to activity_log
- Respond with success (so webhooks don't fail)

**What We DON'T Do** (yet):
- Process TV episodes (wait for Stage 9)
- Process music tracks (wait for Stage 10)

---

**Current Priority**: Complete Radarr event handlers + basic logging for Sonarr/Lidarr
