# Job Queue Refactoring - Implementation Status

**Date**: 2025-01-29
**Status**: IN PROGRESS

## Overview

Refactoring the job queue and workflow system to be simpler and more maintainable:
- **Remove** workflow control (enable/disable phases)
- **Add** phase configuration (control behavior, not enablement)
- **Remove** job history table (use logs instead)
- **Add** type-safe job payloads
- **Add** concurrent worker pool (3 workers for SQLite)
- **Prepare** for future BullMQ migration

## Completed ✅

### 1. Type-Safe Job Payload System
**File**: `src/services/jobQueue/types.ts`

- ✅ Added `JOB_PRIORITY` constants (CRITICAL=1, HIGH=3, NORMAL=5, LOW=8)
- ✅ Created `JobPayloadMap` type with all job types
- ✅ Updated `Job<T>` interface to be generic with type-safe payloads
- ✅ Removed `JobHistoryRecord` and `JobHistoryFilters` interfaces
- ✅ Simplified `IJobQueueStorage` interface (removed history methods)
- ✅ Updated job types to reflect manual operations focus:
  - Core: `scan-movie`, `enrich-metadata`, `publish`
  - Notifications: `notify-kodi`, `notify-jellyfin`, `notify-plex`
  - Scheduled: `scheduled-cleanup`, `scheduled-provider-update`, `scheduled-verification`
  - Future: `webhook-received` (stub)

### 2. Phase Configuration System
**Files**:
- `src/config/phaseConfig.ts` (NEW)
- `src/services/PhaseConfigService.ts` (NEW)

- ✅ Created `PhaseConfiguration` interface with 4 phases:
  - `ScanConfig`: ignore patterns, file size limits, extensions
  - `EnrichmentConfig`: asset fetching, auto-selection, max counts
  - `PublishConfig`: what to publish (assets, actors, trailers)
  - `PlayerSyncConfig`: notification settings, delays
- ✅ Created `DEFAULT_PHASE_CONFIG` with sensible defaults
- ✅ Implemented `PhaseConfigService`:
  - `getConfig(phase)` - Get config for specific phase
  - `getAll()` - Get all configs (cached for performance)
  - `set(key, value)` - Update setting
  - `resetToDefaults()` - Reset all to defaults

### 3. Documentation
- ✅ Updated job queue type documentation
- ✅ Documented phase configuration system
- ✅ Created this implementation status document

## In Progress 🔄

### 4. Remove WorkflowControlService
**File**: `src/services/workflowControlService.ts`

**Tasks**:
- [ ] Delete `workflowControlService.ts`
- [ ] Remove all imports of `WorkflowControlService`
- [ ] Remove all `isEnabled()` checks from job handlers
- [ ] Update database migration to remove `workflow.*` settings

**Files to Update**:
- `src/services/jobHandlers/AssetJobHandlers.ts`
- `src/app.ts` (remove instantiation)
- Any routes that expose workflow control

## Pending ⏳

### 5. Update SQLiteJobQueueStorage
**File**: `src/services/jobQueue/storage/SQLiteJobQueueStorage.ts`

**Tasks**:
- [ ] Remove `JobHistoryRecord` and `JobHistoryFilters` imports
- [ ] Remove `getJobHistory()` method
- [ ] Remove `cleanupHistory()` method
- [ ] Simplify `completeJob()` - just DELETE, no archival
- [ ] Simplify `failJob()` - just DELETE if no retries, no archival
- [ ] Update all logging to remove history references

### 6. Implement Concurrent Worker Pool
**Files**:
- `src/services/jobQueue/Worker.ts` (NEW)
- `src/services/jobQueue/JobQueueService.ts` (UPDATE)

**Tasks**:
- [ ] Create `Worker` class with independent polling loop
- [ ] Update `JobQueueService` to spawn 3 workers
- [ ] Implement graceful shutdown for workers
- [ ] Add backoff when queue is empty
- [ ] Test concurrent job processing

### 7. Update Job Handlers
**Files**:
- `src/services/jobHandlers/AssetJobHandlers.ts`
- `src/services/jobHandlers/ScanJobHandlers.ts`
- `src/services/jobHandlers/PlayerSyncJobHandlers.ts` (NEW/UPDATE)

**Tasks**:
- [ ] Remove `WorkflowControlService` dependency
- [ ] Add `PhaseConfigService` dependency
- [ ] Update handler signatures to use `Job<T>` for type safety
- [ ] Pass phase config to service methods
- [ ] Remove all conditional chaining (always chain to next phase)
- [ ] Add proper logging at each step

**Example Pattern**:
```typescript
private async handleEnrichMetadata(job: Job<'enrich-metadata'>): Promise<void> {
  const { entityType, entityId, manual } = job.payload;

  // Get phase config
  const config = await this.phaseConfig.getConfig('enrichment');

  // Run enrichment with config
  const result = await this.enrichmentService.enrich({
    entityId,
    entityType,
    config, // Pass config!
  });

  // ALWAYS chain to publish (no conditional checks)
  await this.jobQueue.addJob({
    type: 'publish',
    priority: manual ? JOB_PRIORITY.HIGH : JOB_PRIORITY.NORMAL,
    payload: { entityId, entityType, libraryPath: '...' },
  });
}
```

### 8. Update Services
**Files**:
- `src/services/enrichment/EnrichmentService.ts`
- `src/services/publishingService.ts`

**Tasks**:
- [ ] Add `config` parameter to `enrich()` method
- [ ] Implement conditional asset fetching based on `config.fetchProviderAssets`
- [ ] Implement conditional auto-selection based on `config.autoSelectAssets`
- [ ] Add `config` parameter to `publish()` method
- [ ] Implement conditional asset publishing based on config
- [ ] Ensure NFO is ALWAYS generated (non-configurable)
- [ ] Ensure actors are ALWAYS fetched (non-configurable)

### 9. Create Database Migration
**File**: `src/database/migrations/YYYYMMDD_HHmmss_refactor_job_queue.ts` (NEW)

**Tasks**:
- [ ] Drop `job_history` table
- [ ] Delete all `workflow.*` settings from `app_settings`
- [ ] Insert default `phase.*` settings
- [ ] Add migration rollback (recreate job_history if needed)

**SQL**:
```sql
-- Remove workflow control
DELETE FROM app_settings WHERE key LIKE 'workflow.%';

-- Add phase configuration defaults
INSERT OR REPLACE INTO app_settings (key, value) VALUES
  ('phase.enrichment.fetchProviderAssets', 'true'),
  ('phase.enrichment.autoSelectAssets', 'true'),
  ('phase.enrichment.maxPoster', '3'),
  ('phase.enrichment.maxFanart', '5'),
  ('phase.enrichment.maxLogo', '2'),
  ('phase.enrichment.maxTrailer', '1'),
  ('phase.enrichment.language', 'en'),
  ('phase.enrichment.minResolution', '720'),
  ('phase.publish.assets', 'true'),
  ('phase.publish.actors', 'true'),
  ('phase.publish.trailers', 'false'),
  ('phase.playerSync.notify', 'true'),
  ('phase.playerSync.delaySeconds', '0'),
  ('phase.playerSync.cleanFirst', 'false');

-- Drop job history (use logs instead)
DROP TABLE IF EXISTS job_history;
```

### 10. Update REST API
**Files**:
- `src/routes/settings.ts` (or wherever workflow control is exposed)
- `src/routes/phaseConfig.ts` (NEW)

**Tasks**:
- [ ] Remove workflow control endpoints
- [ ] Create phase config endpoints:
  - `GET /api/phase-config` - Get all configs
  - `GET /api/phase-config/:phase` - Get specific phase
  - `PATCH /api/phase-config/:phase` - Update phase config
  - `POST /api/phase-config/reset` - Reset to defaults

### 11. Update Frontend
**Files**:
- `public/frontend/src/pages/Settings.tsx`
- Others TBD

**Tasks**:
- [ ] Remove workflow control toggle section
- [ ] Add phase configuration sections
- [ ] Create UI for scan config (ignore patterns, etc.)
- [ ] Create UI for enrichment config (asset fetching, auto-selection)
- [ ] Create UI for publish config (what to publish)
- [ ] Create UI for player sync config (notifications)

### 12. Update Documentation
**Files**:
- `docs/phases/SCANNING.md`
- `docs/phases/ENRICHMENT.md`
- `docs/phases/PUBLISHING.md`
- `docs/architecture/*.md`
- `CLAUDE.md`

**Tasks**:
- [ ] Remove all references to workflow control
- [ ] Document phase configuration system
- [ ] Update architecture diagrams
- [ ] Update README with new configuration approach

### 13. Testing
**Tasks**:
- [ ] Test manual scan → enrich → publish → notify chain
- [ ] Test phase configuration changes
- [ ] Test with different config combinations:
  - Fetch assets OFF, publish assets OFF → NFO only
  - Auto-select OFF → Manual asset selection
  - Notifications OFF → Silent publishing
- [ ] Test concurrent workers (3 jobs processing simultaneously)
- [ ] Test job retry logic
- [ ] Test crash recovery (stalled job reset)

## Future Enhancements (Not in Scope)

### Webhook Integration
- Create `WebhookJobHandlers` class
- Implement path mapping system
- Add downloader configuration (Radarr, Sonarr)
- Add webhook validation

### Scheduled Tasks
- Create `SchedulerService`
- Implement garbage collector
- Implement provider refresh
- Implement cache verification
- Add scheduled task UI

### BullMQ Migration
- Create `BullMQJobQueueStorage` adapter
- Add Redis connection configuration
- Test migration path
- Document BullMQ setup

## Architecture Decisions

### Why Remove Workflow Control?
- **Simpler**: Users configure features, not workflows
- **Predictable**: All phases always run in sequence
- **Maintainable**: Less conditional logic to test
- **Flexible**: Phase config covers all use cases

### Why Remove Job History?
- **Overhead**: Archival adds write overhead
- **Logging**: Structured logs provide better debugging
- **Simplicity**: One less table to manage
- **Performance**: Faster job completion

### Why Type-Safe Payloads?
- **Safety**: Prevents runtime errors
- **DX**: IntelliSense in handlers
- **Refactoring**: Easier to change payload structures
- **Documentation**: Types serve as docs

### Why 3 Workers for SQLite?
- **Conservative**: SQLite WAL mode handles ~3 concurrent writes well
- **Performance**: 3x throughput vs single worker
- **Stability**: Not pushing SQLite limits
- **Migration**: BullMQ will handle 10+ workers effortlessly

## Next Steps

1. Complete WorkflowControlService removal
2. Update SQLiteJobQueueStorage
3. Implement concurrent workers
4. Update job handlers
5. Create database migration
6. Test end-to-end

## Questions/Decisions Needed

- [ ] Should we implement scheduled tasks now or later?
- [ ] Should we add webhook stubs now or later?
- [ ] Frontend implementation - full rewrite or incremental?
- [ ] Migration strategy for existing installations?
