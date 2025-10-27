# MovieController Refactoring Plan

**Status**: In Progress
**Priority**: High (Code Quality ROI)
**Estimated Effort**: 3-5 days
**Current State**: 1,402 lines, 29 methods

---

## Problem

MovieController violates Single Responsibility Principle with 1,402 lines and 29 methods handling:
- CRUD operations
- Asset management
- Provider integration
- Job triggering
- Field locking
- Unknown file handling

This makes testing, maintenance, and understanding difficult.

---

## Solution: Split into 6 Focused Controllers

### 1. ✅ MovieCrudController (COMPLETE)
**File**: `src/controllers/movie/MovieCrudController.ts`
**Lines**: ~150
**Methods** (6):
- `getAll()` - List movies with filtering
- `getById()` - Get single movie
- `updateMetadata()` - Update movie metadata
- `refreshMovie()` - Rescan movie directory
- `deleteMovie()` - Soft delete
- `restoreMovie()` - Restore deleted movie

**Routes**:
```typescript
router.get('/movies', movieCrudController.getAll);
router.get('/movies/:id', movieCrudController.getById);
router.put('/movies/:id/metadata', movieCrudController.updateMetadata);
router.post('/movies/:id/refresh', movieCrudController.refreshMovie);
router.delete('/movies/:id', movieCrudController.deleteMovie);
router.post('/movies/:id/restore', movieCrudController.restoreMovie);
```

---

### 2. ✅ MovieAssetController (COMPLETE)
**File**: `src/controllers/movie/MovieAssetController.ts`
**Lines**: ~400
**Methods** (11):
- `getAssetCandidates()` - Get available asset candidates from providers
- `getAssetsByType()` - Get current assets by type
- `saveAssets()` - Save selected assets
- `replaceAssets()` - Replace all assets of a type
- `addAsset()` - Add single asset
- `removeAsset()` - Remove single asset
- `toggleAssetLock()` - Lock/unlock asset
- `selectAssetCandidate()` - Select candidate for asset type
- `blockAssetCandidate()` - Block candidate from selection
- `unblockAssetCandidate()` - Unblock candidate
- `resetAssetSelection()` - Reset asset selection to defaults

**Dependencies**:
- MovieService
- AssetSelectionService
- AssetCandidateService
- ProviderCacheService

**Routes**:
```typescript
router.get('/movies/:id/assets/candidates', movieAssetController.getAssetCandidates);
router.get('/movies/:id/assets/:assetType', movieAssetController.getAssetsByType);
router.post('/movies/:id/assets/save', movieAssetController.saveAssets);
router.put('/movies/:id/assets/replace', movieAssetController.replaceAssets);
router.post('/movies/:id/assets/add', movieAssetController.addAsset);
router.delete('/movies/:id/assets/:assetId', movieAssetController.removeAsset);
router.patch('/movies/:id/assets/:assetId/lock', movieAssetController.toggleAssetLock);
router.post('/movies/:id/assets/select', movieAssetController.selectAssetCandidate);
router.post('/movies/:id/assets/candidates/:candidateId/block', movieAssetController.blockAssetCandidate);
router.delete('/movies/:id/assets/candidates/:candidateId/block', movieAssetController.unblockAssetCandidate);
router.delete('/movies/:id/assets/selection', movieAssetController.resetAssetSelection);
```

---

### 3. ✅ MovieProviderController (COMPLETE)
**File**: `src/controllers/movie/MovieProviderController.ts`
**Lines**: ~450
**Methods** (4):
- `getProviderResults()` - Fetch metadata/assets from providers (230 lines - complex!)
- `saveAssets()` - Save asset selections to cache and library
- `searchForIdentification()` - Search providers for movie identification
- `identifyMovie()` - Identify movie with specific provider result

**Dependencies**:
- MovieService
- FetchOrchestrator
- ProviderOrchestrator
- ProviderCacheService

**Routes**:
```typescript
router.get('/movies/:id/provider-results', movieProviderController.getProviderResults);
router.post('/movies/:id/search', movieProviderController.searchForIdentification);
router.post('/movies/:id/identify', movieProviderController.identifyMovie);
```

---

### 4. ✅ MovieJobController (COMPLETE)
**File**: `src/controllers/movie/MovieJobController.ts`
**Lines**: ~160
**Methods** (4):
- `toggleMonitored()` - Toggle automation on/off
- `triggerVerify()` - Trigger verification job
- `triggerEnrich()` - Trigger enrichment job
- `triggerPublish()` - Trigger publishing job

**Dependencies**:
- MovieService
- JobQueueService (would need to inject)

**Routes**:
```typescript
router.post('/movies/:id/toggle-monitored', movieJobController.toggleMonitored);
router.post('/movies/:id/verify', movieJobController.triggerVerify);
router.post('/movies/:id/enrich', movieJobController.triggerEnrich);
router.post('/movies/:id/publish', movieJobController.triggerPublish);
```

---

### 5. ✅ MovieFieldLockController (COMPLETE)
**File**: `src/controllers/movie/MovieFieldLockController.ts`
**Lines**: ~145
**Methods** (3):
- `lockField()` - Lock field from automation
- `unlockField()` - Unlock field
- `resetMetadata()` - Reset metadata (unlock all + clear)

**Dependencies**:
- MovieService

**Routes**:
```typescript
router.post('/movies/:id/fields/:fieldName/lock', movieFieldLockController.lockField);
router.delete('/movies/:id/fields/:fieldName/lock', movieFieldLockController.unlockField);
router.post('/movies/:id/metadata/reset', movieFieldLockController.resetMetadata);
```

---

### 6. ✅ MovieUnknownFilesController (COMPLETE)
**File**: `src/controllers/movie/MovieUnknownFilesController.ts`
**Lines**: ~165
**Methods** (3):
- `assignUnknownFile()` - Assign unknown file to asset type
- `ignoreUnknownFile()` - Mark file as ignored
- `deleteUnknownFile()` - Delete unknown file

**Dependencies**:
- MovieService

**Routes**:
```typescript
router.post('/movies/:id/unknown-files/:fileId/assign', movieUnknownFilesController.assignUnknownFile);
router.post('/movies/:id/unknown-files/:fileId/ignore', movieUnknownFilesController.ignoreUnknownFile);
router.delete('/movies/:id/unknown-files/:fileId', movieUnknownFilesController.deleteUnknownFile);
```

---

## Implementation Steps

### Phase 1: Create Controllers (3-4 days)
1. ✅ Create MovieCrudController (DONE)
2. Create MovieAssetController
3. Create MovieProviderController
4. Create MovieJobController
5. Create MovieFieldLockController
6. Create MovieUnknownFilesController

### Phase 2: Update Routes (1 day)
1. Update `src/routes/api.ts` to use new controllers
2. Keep old MovieController temporarily for backwards compatibility
3. Test all endpoints

### Phase 3: Cleanup (few hours)
1. Remove old MovieController
2. Update tests to use new controllers
3. Update documentation

---

## Benefits

### Before:
- 1 controller: 1,402 lines
- 29 methods mixed together
- Hard to test, hard to understand
- God class anti-pattern

### After:
- 6 controllers: ~200-250 lines each
- 4-11 methods per controller (focused)
- Easy to test, easy to understand
- Single Responsibility Principle

### Testing Benefits:
```typescript
// Before: Need to mock everything
const controller = new MovieController(
  movieService,
  scanService,
  fetchOrchestrator,
  assetSelectionService,
  providerCacheService,
  assetCandidateService,
  providerOrchestrator
);

// After: Only mock what you need
const controller = new MovieCrudController(
  movieService,
  scanService
);
```

---

## Breaking Changes

**None!** Routes remain the same, just handled by different controllers internally.

---

## Next Steps

To continue this refactoring:

1. **Extract Asset Controller** (highest priority - most methods)
   ```bash
   # Copy methods from movieController.ts lines 719-1374
   # Create src/controllers/movie/MovieAssetController.ts
   ```

2. **Extract Provider Controller** (complex logic)
   ```bash
   # Copy methods from movieController.ts lines 229-1190
   # Create src/controllers/movie/MovieProviderController.ts
   ```

3. **Extract remaining controllers** (straightforward)

4. **Update routes** in `src/routes/api.ts`

5. **Test and verify** all endpoints work

6. **Remove old controller**

---

## Testing Strategy

### Unit Tests
Each controller can now be unit tested independently:
```typescript
describe('MovieCrudController', () => {
  let controller: MovieCrudController;
  let mockMovieService: jest.Mocked<MovieService>;
  let mockScanService: jest.Mocked<LibraryScanService>;

  beforeEach(() => {
    mockMovieService = {
      getAll: jest.fn(),
      getById: jest.fn(),
      // ...
    } as any;

    controller = new MovieCrudController(mockMovieService, mockScanService);
  });

  it('should return all movies', async () => {
    // Test implementation
  });
});
```

### Integration Tests
Routes continue to work as before, now with better controller organization.

---

## Progress Tracking

- [x] Phase 1.1: Create MovieCrudController
- [x] Phase 1.2: Create MovieAssetController
- [x] Phase 1.3: Create MovieProviderController
- [x] Phase 1.4: Create MovieJobController
- [x] Phase 1.5: Create MovieFieldLockController
- [x] Phase 1.6: Create MovieUnknownFilesController
- [x] Phase 2: Update routes (29 routes migrated)
- [x] Phase 3: Cleanup and remove old controller
- [x] Phase 4: Remove dead SSE endpoint (migrated to WebSocket)

**Status**: ✅ COMPLETE! All controllers created, routes migrated, old code removed, TypeScript compiles cleanly!
