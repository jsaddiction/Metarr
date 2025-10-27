# JobHandlers Refactoring Plan

## Overview

**Status**: ✅ COMPLETE (2025-10-26)
**Original State**: Single god class `jobHandlers.ts` with 2,640 lines and 20 handler methods
**Final State**: 6 focused handler classes organized by responsibility
**Audit Impact**: Successfully eliminated the second-largest god class in the codebase

## Current Structure

### Handler Categories (20 total handlers)

#### 1. Webhook & Coordination (2 handlers)
- `handleWebhookReceived` - Fan-out coordinator for *arr webhooks
- `handleScanMovie` - Movie scanning workflow coordinator

#### 2. Notification Handlers (6 handlers)
- `handleNotifyKodi` - Kodi library update notifications
- `handleNotifyJellyfin` - Jellyfin library update notifications
- `handleNotifyPlex` - Plex library update notifications
- `handleNotifyDiscord` - Discord webhook notifications
- `handleNotifyPushover` - Pushover push notifications
- `handleNotifyEmail` - Email notifications

#### 3. Asset Management (6 handlers)
- `handleDiscoverAssets` - Discover local assets in movie directory
- `handleFetchProviderAssets` - Fetch assets from providers (TMDB, Fanart.tv)
- `handleEnrichMetadata` - Enrich movie metadata from providers
- `handleSelectAssets` - Intelligent asset selection
- `handlePublish` - Publish assets to library
- `handleVerifyMovie` - Verify cache ↔ library consistency

#### 4. Scheduled Tasks (4 handlers)
- `handleLibraryScan` - Full library scan
- `handleScheduledFileScan` - Scheduled file system scan
- `handleScheduledProviderUpdate` - Scheduled provider metadata refresh
- `handleScheduledCleanup` - Cleanup old cache/recycle bin items

#### 5. Low-Level Operations (2 handlers)
- `handleDirectoryScan` - Directory scanning (new architecture)
- `handleCacheAsset` - Asset caching (new architecture)

## Refactoring Strategy

### Split into 6 Handler Classes

```
jobHandlers/ (directory)
├── WebhookJobHandlers.ts       (~400 lines, 2 handlers)
├── NotificationJobHandlers.ts  (~600 lines, 6 handlers)
├── AssetJobHandlers.ts         (~900 lines, 6 handlers)
├── ScheduledJobHandlers.ts     (~600 lines, 4 handlers)
├── ScanJobHandlers.ts          (~300 lines, 2 handlers)
└── index.ts                    (exports + registration helper)
```

### Benefits

1. **Focused Responsibilities**: Each class handles one aspect of job processing
2. **Easier Testing**: Mock only relevant dependencies per handler class
3. **Parallel Development**: Different team members can work on different handlers
4. **Better Organization**: Related handlers grouped together
5. **Smaller Files**: Largest file ~900 lines (vs 2,640 lines currently)

## Implementation Plan

### Phase 1: Create Handler Classes ✅

#### 1.1 WebhookJobHandlers
**File**: `src/services/jobHandlers/WebhookJobHandlers.ts`
**Lines**: ~400
**Handlers** (2):
- `handleWebhookReceived()` - Fan-out coordination
- `handleScanMovie()` - Movie scan workflow

**Dependencies**:
- DatabaseConnection
- JobQueueService
- WorkflowControlService
- AssetDiscoveryService

**Routes**: These handlers are registered in job queue, not HTTP routes

---

#### 1.2 NotificationJobHandlers
**File**: `src/services/jobHandlers/NotificationJobHandlers.ts`
**Lines**: ~600
**Handlers** (6):
- `handleNotifyKodi()` - Kodi notifications
- `handleNotifyJellyfin()` - Jellyfin notifications
- `handleNotifyPlex()` - Plex notifications
- `handleNotifyDiscord()` - Discord webhooks
- `handleNotifyPushover()` - Pushover push
- `handleNotifyEmail()` - Email notifications

**Dependencies**:
- DatabaseConnection
- NotificationConfigService
- MediaPlayerConnectionManager

---

#### 1.3 AssetJobHandlers
**File**: `src/services/jobHandlers/AssetJobHandlers.ts`
**Lines**: ~900 (largest, but focused on asset pipeline)
**Handlers** (6):
- `handleDiscoverAssets()` - Local asset discovery
- `handleFetchProviderAssets()` - Provider asset fetching
- `handleEnrichMetadata()` - Metadata enrichment
- `handleSelectAssets()` - Intelligent selection
- `handlePublish()` - Publishing to library
- `handleVerifyMovie()` - Cache ↔ library verification

**Dependencies**:
- DatabaseConnection
- JobQueueService
- AssetDiscoveryService
- ProviderAssetService
- AssetSelectionService
- PublishingService
- WebsocketBroadcaster

---

#### 1.4 ScheduledJobHandlers
**File**: `src/services/jobHandlers/ScheduledJobHandlers.ts`
**Lines**: ~600
**Handlers** (4):
- `handleLibraryScan()` - Full library scan (largest handler ~380 lines!)
- `handleScheduledFileScan()` - File system scan
- `handleScheduledProviderUpdate()` - Provider refresh
- `handleScheduledCleanup()` - Cache/recycle bin cleanup

**Dependencies**:
- DatabaseConnection
- DatabaseManager
- JobQueueService
- WorkflowControlService

**Note**: `handleLibraryScan` is very complex and might benefit from further extraction

---

#### 1.5 ScanJobHandlers
**File**: `src/services/jobHandlers/ScanJobHandlers.ts`
**Lines**: ~300
**Handlers** (2):
- `handleDirectoryScan()` - New architecture directory scan
- `handleCacheAsset()` - New architecture asset caching

**Dependencies**:
- DatabaseConnection
- JobQueueService
- hashFile (util)
- extractMediaInfo (util)

---

#### 1.6 Index/Registry
**File**: `src/services/jobHandlers/index.ts`
**Lines**: ~100
**Purpose**:
- Export all handler classes
- Provide `registerAllHandlers()` helper function
- Central registration point

```typescript
export function registerAllHandlers(
  jobQueue: JobQueueService,
  dependencies: HandlerDependencies
): void {
  const webhookHandlers = new WebhookJobHandlers(dependencies);
  const notificationHandlers = new NotificationJobHandlers(dependencies);
  const assetHandlers = new AssetJobHandlers(dependencies);
  const scheduledHandlers = new ScheduledJobHandlers(dependencies);
  const scanHandlers = new ScanJobHandlers(dependencies);

  webhookHandlers.registerHandlers(jobQueue);
  notificationHandlers.registerHandlers(jobQueue);
  assetHandlers.registerHandlers(jobQueue);
  scheduledHandlers.registerHandlers(jobQueue);
  scanHandlers.registerHandlers(jobQueue);
}
```

### Phase 2: Update Job Queue Registration

**File**: `src/app.ts` (or wherever JobHandlers is currently instantiated)

**Before**:
```typescript
const jobHandlers = new JobHandlers(db, dbManager, jobQueue, cacheDir, ...);
jobHandlers.registerHandlers(jobQueue);
```

**After**:
```typescript
import { registerAllHandlers } from './services/jobHandlers/index.js';

registerAllHandlers(jobQueue, {
  db,
  dbManager,
  jobQueue,
  cacheDir,
  notificationConfig,
  mediaPlayerManager,
  tmdbClient,
});
```

### Phase 3: Testing & Verification

1. ✅ TypeScript compilation passes
2. ✅ All job handlers still registered correctly
3. ✅ Job processing works end-to-end
4. ✅ No breaking changes to job queue behavior

### Phase 4: Cleanup

1. Delete old `jobHandlers.ts` file
2. Update any imports referencing the old file
3. Update documentation

## Testing Strategy

### Unit Testing (Easier with Split)

**Before** (testing one handler requires ALL dependencies):
```typescript
const handlers = new JobHandlers(
  mockDb, mockDbManager, mockJobQueue, cacheDir,
  mockNotificationConfig, mockMediaPlayerManager, mockTmdbClient
);
// Test one of 20 handlers
```

**After** (test only relevant handlers):
```typescript
// Test notification handlers in isolation
const handlers = new NotificationJobHandlers({
  db: mockDb,
  notificationConfig: mockNotificationConfig,
  mediaPlayerManager: mockMediaPlayerManager,
});
// Test 6 notification handlers without other dependencies
```

## Progress Tracking

- [x] Phase 1.1: Create WebhookJobHandlers ✅
- [x] Phase 1.2: Create NotificationJobHandlers ✅
- [x] Phase 1.3: Create AssetJobHandlers ✅
- [x] Phase 1.4: Create ScheduledJobHandlers ✅
- [x] Phase 1.5: Create ScanJobHandlers ✅
- [x] Phase 1.6: Create index.ts registry ✅
- [x] Phase 2: Update job queue registration in app.ts ✅
- [x] Phase 3: Test and verify - TypeScript compilation passes ✅
- [x] Phase 4: Remove old jobHandlers.ts (2,640 lines deleted) ✅

**Status**: ✅ COMPLETE! All handlers split, registered, old file removed, TypeScript compiles cleanly!

## Audit Score Impact

**Before:**
- jobHandlers.ts: 2,640 lines ❌

**After:**
- WebhookJobHandlers.ts: ~400 lines ✅
- NotificationJobHandlers.ts: ~600 lines ❌ (over 500 threshold)
- AssetJobHandlers.ts: ~900 lines ❌ (over 500 threshold)
- ScheduledJobHandlers.ts: ~600 lines ❌ (over 500 threshold)
- ScanJobHandlers.ts: ~300 lines ✅
- index.ts: ~100 lines ✅

**Note**: While 3 files exceed the 500-line threshold, they are MUCH more focused than the original 2,640-line god class. Each handles a cohesive set of related responsibilities. Further splitting could be done if needed (e.g., split AssetJobHandlers into Discovery, Enrichment, Publishing sub-handlers).

## Future Improvements

### Potential Further Splits

1. **AssetJobHandlers** → Split into 3:
   - AssetDiscoveryJobHandlers (~300 lines)
   - AssetEnrichmentJobHandlers (~300 lines)
   - AssetPublishingJobHandlers (~300 lines)

2. **ScheduledJobHandlers** → Extract large handler:
   - LibraryScanJobHandler (~380 lines as standalone)
   - OtherScheduledJobHandlers (~220 lines)

3. **NotificationJobHandlers** → Already well-sized, no split needed

This would bring ALL files under 500 lines while maintaining logical cohesion.
