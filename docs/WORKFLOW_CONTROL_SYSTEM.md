# Workflow Control System

**Status**: ✅ COMPLETE (2025-10-21)
**Purpose**: Global enable/disable switches for automation stages

---

## Overview

The Workflow Control System provides centralized control over Metarr's automation pipeline. Each of the 5 workflow stages can be independently enabled or disabled, allowing users to control how much automation they want.

**Key Principle**: All stages are **disabled by default** for development safety. Users must explicitly enable automation.

---

## Architecture

### Backend Components

1. **WorkflowControlService** ([src/services/workflowControlService.ts](../src/services/workflowControlService.ts))
   - Manages workflow settings in database
   - 1-minute caching for performance
   - WebSocket broadcasting on changes
   - Methods: `isEnabled()`, `setEnabled()`, `getAll()`, `updateMultiple()`, `enableAll()`, `disableAll()`

2. **SettingsController** ([src/controllers/settingsController.ts](../src/controllers/settingsController.ts))
   - API endpoints for workflow management
   - Request validation
   - Error handling

3. **API Routes** ([src/routes/api.ts](../src/routes/api.ts#L543-L549))
   ```
   GET    /api/settings/workflow           - Get all workflow settings
   PUT    /api/settings/workflow           - Update multiple settings
   PUT    /api/settings/workflow/:stage    - Update single stage
   POST   /api/settings/workflow/enable-all    - Enable all stages
   POST   /api/settings/workflow/disable-all   - Disable all stages
   ```

4. **Job Handler Integration** ([src/services/jobHandlers.ts](../src/services/jobHandlers.ts))
   - Each handler checks workflow settings before proceeding
   - Job chaining only occurs if next stage is enabled
   - Logs when workflow stage is disabled

### Frontend Components

1. **Types** ([public/frontend/src/types/workflow.ts](../public/frontend/src/types/workflow.ts))
   ```typescript
   type WorkflowStage = 'webhooks' | 'scanning' | 'identification' | 'enrichment' | 'publishing';

   interface WorkflowSettings {
     webhooks: boolean;
     scanning: boolean;
     identification: boolean;
     enrichment: boolean;
     publishing: boolean;
   }
   ```

2. **Custom Hook** ([public/frontend/src/hooks/useWorkflowSettings.ts](../public/frontend/src/hooks/useWorkflowSettings.ts))
   - `useWorkflowSettings()` - Manages workflow settings state
   - Optimistic updates (UI responds immediately)
   - Error handling with rollback
   - Methods: `updateStage()`, `updateMultiple()`, `enableAll()`, `disableAll()`

3. **Settings Page** ([public/frontend/src/pages/settings/Workflow.tsx](../public/frontend/src/pages/settings/Workflow.tsx))
   - Info alert explaining workflow system
   - Quick Actions (Enable All / Disable All buttons)
   - Individual stage cards with Switch controls
   - Dependency validation (can't enable later stages without earlier ones)
   - Visual workflow flow diagram

4. **Navigation** ([public/frontend/src/components/layout/Sidebar.tsx](../public/frontend/src/components/layout/Sidebar.tsx#L245-L249))
   - Settings → Workflow menu item

---

## Workflow Stages

### 1. 🔗 Webhook Processing
**Database Key**: `workflow.webhooks`
**Description**: Process webhooks from Radarr/Sonarr/Lidarr when new media is downloaded
**Handler**: `handleWebhookReceived`
**Dependencies**: None (first stage)

**When Disabled**: Webhook payloads are received but ignored, no jobs are created

**When Enabled**: Webhook creates `scan-movie` job → job chain begins

---

### 2. 📁 Filesystem Scanning
**Database Key**: `workflow.scanning`
**Description**: Scan library directories to discover movies and local assets
**Handler**: `handleScanMovie`
**Dependencies**: None (can run standalone or from webhook)

**When Disabled**: Movies are not added/updated in database, no asset discovery

**When Enabled**: Inserts/updates movie → creates `discover-assets` job

---

### 3. 🔍 Provider Identification
**Database Key**: `workflow.identification`
**Description**: Fetch metadata and asset URLs from external providers (TMDB/TVDB)
**Handler**: `handleFetchProviderAssets`
**Dependencies**: Requires **Scanning** enabled (needs movie in database)

**When Disabled**: No API calls to TMDB/TVDB, no new asset candidates

**When Enabled**: Fetches from TMDB → creates `select-assets` job

---

### 4. ✨ Asset Enrichment
**Database Key**: `workflow.enrichment`
**Description**: Auto-select best quality assets based on scoring algorithm
**Handler**: `handleSelectAssets`
**Dependencies**: Requires **Identification** enabled (needs asset candidates)

**When Disabled**: No auto-selection, assets remain as candidates only

**When Enabled**: Scores and selects assets → creates `publish` job (if YOLO mode)

---

### 5. 📤 Library Publishing
**Database Key**: `workflow.publishing`
**Description**: Write NFO files and assets to library directory for media players
**Handler**: `handlePublish`
**Dependencies**: Requires **Enrichment** enabled (needs selected assets)

**When Disabled**: Assets stay in cache, nothing written to library

**When Enabled**: Publishes NFO + assets → emits WebSocket event for frontend

---

## Job Chaining Flow

```
Webhook Received
    ↓ (if workflow.webhooks = true)
Scan Movie
    ↓ (if workflow.scanning = true)
Discover Assets (local filesystem scan)
    ↓ (if workflow.identification = true)
Fetch Provider Assets (TMDB API call)
    ↓ (if workflow.enrichment = true)
Select Assets (auto-selection algorithm)
    ↓ (if workflow.publishing = true AND mode = 'yolo')
Publish (write NFO + assets to library)
    ↓
Notify Media Players (future: Kodi library scan)
```

**Chain Context**: Each job passes metadata forward via `chainContext` payload field:
- `source: 'webhook' | 'manual' | 'scan'`
- `eventType: string` (for webhooks)
- `movieData: object` (from webhook payload)

---

## Database Schema

**Table**: `app_settings`

```sql
-- Workflow settings (all default to 'false')
INSERT INTO app_settings (key, value) VALUES
  ('workflow.webhooks', 'false'),
  ('workflow.scanning', 'false'),
  ('workflow.identification', 'false'),
  ('workflow.enrichment', 'false'),
  ('workflow.publishing', 'false');
```

Migration: [20251015_001_clean_schema.ts](../src/database/migrations/20251015_001_clean_schema.ts#L1305-L1313)

---

## Usage Examples

### Enable Full Automation (YOLO Mode)

```bash
# Via API
curl -X POST http://localhost:3000/api/settings/workflow/enable-all

# Via Frontend
Settings → Workflow → Click "Enable All Workflows"
```

Result: Webhook → Scan → Identify → Enrich → Publish (fully automated)

---

### Partial Automation (User Review)

```bash
# Enable everything except publishing
curl -X PUT http://localhost:3000/api/settings/workflow \
  -H "Content-Type: application/json" \
  -d '{
    "webhooks": true,
    "scanning": true,
    "identification": true,
    "enrichment": true,
    "publishing": false
  }'
```

Result: Automation stops at asset selection, user must manually publish

---

### Manual Control Only

```bash
# Disable all automation
curl -X POST http://localhost:3000/api/settings/workflow/disable-all
```

Result: All jobs must be manually triggered, no automation

---

## Testing the Workflow Control System

### Test Case 1: Verify Settings Persistence

```bash
# 1. Enable a single stage
curl -X PUT http://localhost:3000/api/settings/workflow/webhooks \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'

# 2. Verify it persisted
curl http://localhost:3000/api/settings/workflow
# Expected: {"webhooks": true, "scanning": false, ...}

# 3. Restart backend server
# 4. Check again - should still be true (persisted in database)
curl http://localhost:3000/api/settings/workflow
```

---

### Test Case 2: Verify Job Chaining Stops

```bash
# 1. Disable identification stage
curl -X PUT http://localhost:3000/api/settings/workflow/identification \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'

# 2. Enable scanning and enrichment
curl -X PUT http://localhost:3000/api/settings/workflow/scanning \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'

# 3. Trigger a movie scan
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "type": "scan-movie",
    "payload": {"movieId": 1}
  }'

# 4. Check logs - should see:
# "[JobHandlers] Identification workflow disabled, stopping chain"
# No fetch-provider-assets job should be created
```

---

### Test Case 3: Frontend Dependency Validation

1. Open browser: `http://localhost:3001/settings/workflow`
2. Click "Disable All Workflows" → all switches should turn off
3. Try to enable "Publishing" → should fail (dependency on earlier stages)
4. Enable stages in order: Webhooks → Scanning → Identification → Enrichment → Publishing
5. Each switch should only enable after previous stages are enabled

---

### Test Case 4: WebSocket Updates

```bash
# Terminal 1: Listen to WebSocket events
websocat ws://localhost:3000

# Terminal 2: Update workflow setting
curl -X PUT http://localhost:3000/api/settings/workflow/webhooks \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'

# Terminal 1: Should receive WebSocket message:
# {"type": "workflow.updated", "stage": "webhooks", "enabled": true}
```

---

## Development Safety

**All stages disabled by default** ensures:
- No accidental automation during development
- Predictable behavior (nothing runs unless explicitly enabled)
- Safe testing environment (can test individual stages)
- No surprise API calls to TMDB/TVDB

**Production Setup**: Users must explicitly enable automation, forcing conscious decision about automation level.

---

## Future Enhancements

### Planned Features
- [ ] Per-library workflow settings (different automation for different libraries)
- [ ] Per-movie workflow overrides (disable automation for specific movies - use `monitored` flag instead)
- [ ] Workflow scheduling (auto-disable during certain hours)
- [ ] Workflow telemetry (track how often each stage runs)

### WebSocket Integration (TODO)
Frontend hook has commented code for real-time updates:
```typescript
// TODO: Add WebSocket listener for workflow updates
// useEffect(() => {
//   const handleWorkflowUpdate = (data: any) => {
//     if (data.stage && typeof data.enabled === 'boolean') {
//       setSettings(prev => ({ ...prev, [data.stage]: data.enabled }));
//     }
//   };
//   // Subscribe to WebSocket events
// }, []);
```

---

## Related Documentation

- [JOB_CHAINING_REFACTOR.md](JOB_CHAINING_REFACTOR.md) - Event-driven job architecture
- [WORKFLOW_CONTROL_IMPLEMENTATION.md](WORKFLOW_CONTROL_IMPLEMENTATION.md) - Implementation plan
- [JOB_QUEUE_ARCHITECTURE.md](JOB_QUEUE_ARCHITECTURE.md) - Job queue system
- [WEBHOOKS.md](WEBHOOKS.md) - Webhook integration
- [WORKFLOWS.md](WORKFLOWS.md) - Complete workflow documentation

---

## Troubleshooting

### Settings Not Persisting
- Check database: `SELECT * FROM app_settings WHERE key LIKE 'workflow.%';`
- Verify migration ran: Initial schema should include workflow settings
- Check logs for database errors

### Job Chain Not Stopping
- Verify workflow setting is actually false in database
- Check WorkflowControlService cache (1-minute TTL)
- Restart backend to clear cache
- Check logs for "workflow disabled" messages

### Frontend Not Updating
- Check API calls in browser Network tab
- Verify optimistic update rollback logic
- Check console for JavaScript errors
- Verify API endpoint returns updated values

### Dependency Validation Not Working
- Check Workflow.tsx `stages` array for correct dependencies
- Verify `canEnable` function logic
- Check that switches are properly disabled when dependencies not met

---

**Last Updated**: 2025-10-21
