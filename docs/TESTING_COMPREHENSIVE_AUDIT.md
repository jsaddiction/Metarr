# Testing Infrastructure: Comprehensive Audit & Overhaul Plan

**Date:** 2025-10-14
**Status:** Backend is production-ready, tests need updating for Phase 6
**Goal:** 100% test coverage for production-ready backend

---

## Executive Summary

### Current State
- **25 backend service files** in `src/services/`
- **13 controller files** in `src/controllers/`
- **8 unit test files** (many outdated or testing old architecture)
- **Test Status:** 67/116 passing (58% overall), but **93% pass rate on non-API tests**
- **Critical Issue:** Tests reference old services/architectures from pre-Phase 6 backend

### Key Findings

#### ✅ What Works
1. **Test infrastructure** (Jest + ts-jest + TypeScript)
2. **TestDatabase utility** (needs minor fixes for new schema)
3. **Integration test patterns** (webhookWorkflow, publishWorkflow)
4. **Test isolation** (each test gets fresh database)

#### ❌ What Needs Work
1. **Outdated Tests:** Reference services that no longer exist (scheduledEnrichmentService)
2. **Missing Tests:** Phase 6 services completely untested (schedulers, websocketBroadcaster)
3. **Broken API Tests:** 45 failing tests due to architecture mismatch
4. **Schema Misalignment:** Tests use old migration (20251003) instead of new clean schema (20251015)
5. **Missing Coverage:** No tests for validation middleware, circuit breaker improvements, new endpoints

---

## Detailed Analysis

### Services: Current vs Tested

#### Core Services (25 files in src/services/)

**✅ Have Tests:**
1. ~~`scheduledEnrichmentService.ts`~~ - **REMOVED** (service no longer exists)
2. `jobQueueService.ts` - 7/11 tests passing (4 skipped due to race conditions)
3. `assetSelectionService.ts` - 10/10 tests passing
4. `webhookService.ts` - 8/14 tests passing (payload structure mismatches)
5. `publishingService.ts` - 8/10 tests passing (missing cache file mocks)

**❌ Missing Tests (Priority 1 - Phase 6 Critical):**
6. `schedulers/FileScannerScheduler.ts` - **NEW** (Phase 6)
7. `schedulers/ProviderUpdaterScheduler.ts` - **NEW** (Phase 6)
8. `librarySchedulerConfigService.ts` - **NEW** (Phase 6)
9. `jobHandlers/scheduledFileScanHandler.ts` - **NEW** (Phase 6)
10. `jobHandlers/scheduledProviderUpdateHandler.ts` - **NEW** (Phase 6)
11. `websocketBroadcaster.ts` - **CRITICAL** (Phase 6 communication layer)
12. `websocketServer.ts` - **CRITICAL** (Phase 6 connection management)

**❌ Missing Tests (Priority 2 - Core Functionality):**
13. `cacheService.ts` - Content-addressed storage (SHA256 hashing, deduplication)
14. `libraryScanService.ts` - Library scanning coordination
15. `scan/unifiedScanService.ts` - Unified scan implementation
16. `scan/movieLookupService.ts` - Movie identification
17. `libraryService.ts` - Library CRUD operations
18. `movieService.ts` - Movie CRUD operations
19. `mediaPlayerService.ts` - Media player management
20. `mediaPlayerConnectionManager.ts` - Player connection lifecycle

**❌ Missing Tests (Priority 3 - Integration & External):**
21. `imageService.ts` - Image processing
22. `nfo/nfoParser.ts` - NFO file parsing
23. `nfo/nfoGenerator.ts` - NFO file generation
24. `nfo/nfoDiscovery.ts` - NFO file discovery
25. `players/KodiHttpClient.ts` - Kodi HTTP communication
26. `players/KodiWebSocketClient.ts` - Kodi WebSocket communication
27. `players/KodiVersionAdapter.ts` - Kodi version compatibility
28. `media/ffprobeService.ts` - FFprobe video analysis
29. `media/assetDiscovery.ts` - Asset discovery in directories
30. `media/unknownFilesDetection.ts` - Unknown file identification
31. `pathMappingService.ts` - Path translation
32. `metadataInitializationService.ts` - Metadata initialization
33. `ignorePatternService.ts` - Ignore pattern management
34. `garbageCollectionService.ts` - Cleanup operations

**❌ Missing Tests (Priority 4 - Provider System):**
35. `providers/ProviderOrchestrator.ts` - Already has tests (passing)
36. `providers/ProviderRegistry.ts` - Already has tests (passing)
37. `providers/AssetSelector.ts` - Already has tests (passing)
38. `providers/utils/CircuitBreaker.ts` - Already has tests (passing)
39. `providers/utils/RateLimiter.ts` - Already has tests (passing)
40. `providers/tmdb/*` - Already has tests (passing)
41. `providers/tvdb/*` - Already has tests (passing)
42. `providers/fanart/*` - Already has tests (passing)
43. `providers/musicbrainz/*` - Already has tests (passing)
44. `providers/theaudiodb/*` - Already has tests (passing)
45. `providers/imdb/*` - Already has tests (passing)
46. `providers/local/*` - Already has tests (passing)

### Controllers: Current vs Tested

**13 controllers in src/controllers/**

**❌ All Controllers Untested:**
1. `libraryController.ts` - Library CRUD + scan triggers
2. `movieController.ts` - Movie CRUD + metadata updates
3. `schedulerController.ts` - **NEW** (Phase 6 scheduler configuration)
4. `jobController.ts` - Job queue management
5. `webhookController.ts` - Webhook receivers
6. `mediaPlayerController.ts` - Media player CRUD + connection testing
7. `imageController.ts` - Image uploads/management
8. `assetController.ts` - Asset selection/management
9. `automationConfigController.ts` - Automation configuration
10. `providerConfigController.ts` - Provider configuration
11. `priorityConfigController.ts` - Priority configuration
12. `ignorePatternController.ts` - Ignore pattern management
13. `websocketController.ts` - WebSocket connections

**Note:** API endpoint tests exist but are all failing due to architecture mismatch (they don't import actual route definitions).

---

## Problems with Existing Tests

### 1. scheduledEnrichmentService.test.ts
**Status:** ❌ FAILS TO COMPILE
**Issue:** Tests a service that no longer exists
**Resolution:** **DELETE** - Service was removed during Phase 6

### 2. assetSelectionService.test.ts
**Status:** ❌ FAILS TO COMPILE
**Issues:**
- `testDatabase.ts` imports old migration: `20251003_001_initial_schema.js`
- Should use new clean schema: `20251015_001_clean_schema.js`
- `testDatabase.ts` missing `get()` method required by DatabaseConnection interface

**Resolution:**
1. Fix testDatabase.ts to use new migration
2. Add missing `get()` method to match interface
3. Re-run tests

### 3. webhookService.test.ts
**Status:** ⚠️ 8/14 PASSING
**Issues:**
- Payload structure mismatches (tests expect `event`, code uses `eventType`)
- Missing webhook processor tests

**Resolution:** Update test assertions to match actual payload structure

### 4. publishingService.test.ts
**Status:** ⚠️ 8/10 PASSING
**Issues:**
- Missing cache file fixtures (tests don't create actual files)
- 2 tests fail when validating cache file operations

**Resolution:** Add fs mocking or create temporary test cache files

### 5. jobQueueService.test.ts
**Status:** ✅ 7/11 PASSING (4 skipped)
**Issues:**
- 4 tests skipped due to race conditions with `setImmediate()`
- Timing-sensitive tests marked as `.skip`

**Resolution:** Leave as-is (acceptable - core functionality covered)

### 6. API Endpoint Tests (jobEndpoints.test.ts, assetEndpoints.test.ts)
**Status:** ❌ 0/45 PASSING
**Issues:**
- Tests create simplified Express apps
- Don't import actual route definitions from `src/routes/api.ts`
- Validation middleware not applied in tests
- Architecture mismatch

**Resolution:** **DECISION NEEDED**
- **Option A:** Rewrite to import actual routes (recommended)
- **Option B:** Convert to full E2E tests with real server
- **Option C:** Delete (integration tests provide coverage)

### 7. Integration Tests (webhookWorkflow, publishWorkflow)
**Status:** ✅ 9/9 PASSING
**Issues:** None
**Resolution:** Keep as-is, add more integration tests for Phase 6 features

### 8. Provider Tests (CircuitBreaker, AssetSelector, RateLimiter, etc.)
**Status:** ✅ ALL PASSING
**Issues:** Tests may reference old service architecture
**Resolution:** Review and update if needed, but low priority

---

## testDatabase.ts Issues

### Current Problems
1. **Wrong Migration Import:**
   ```typescript
   // ❌ OLD (no longer exists)
   import { InitialSchemaMigration } from '../../src/database/migrations/20251003_001_initial_schema.js';

   // ✅ NEW (current clean schema)
   import { CleanSchemaMigration } from '../../src/database/migrations/20251015_001_clean_schema.js';
   import { LibrarySchedulerConfigMigration } from '../../src/database/migrations/20251015_002_library_scheduler_config.js';
   ```

2. **Missing `get()` Method:**
   ```typescript
   // DatabaseConnection interface requires:
   get<T = any>(sql: string, params?: any[]): Promise<T | undefined>;

   // But testDatabase.ts connection object doesn't implement it
   ```

3. **No Support for New Tables:**
   - `library_scheduler_config` table (added in Phase 6)
   - Need to run both migrations

### Fix Required
```typescript
// tests/utils/testDatabase.ts

import { CleanSchemaMigration } from '../../src/database/migrations/20251015_001_clean_schema.js';
import { LibrarySchedulerConfigMigration } from '../../src/database/migrations/20251015_002_library_scheduler_config.js';

export class TestDatabase {
  private connection: DatabaseConnection | null = null;
  private db: Database | null = null;

  async create(): Promise<DatabaseConnection> {
    this.db = new Database(':memory:');

    this.connection = {
      query: async <T = any>(sql: string, params?: any[]): Promise<T[]> => {
        return this.db!.prepare(sql).all(...(params || [])) as T[];
      },

      get: async <T = any>(sql: string, params?: any[]): Promise<T | undefined> => {
        return this.db!.prepare(sql).get(...(params || [])) as T | undefined;
      },

      execute: async (sql: string, params?: any[]) => {
        const result = this.db!.prepare(sql).run(...(params || []));
        return {
          affectedRows: result.changes || 0,
          insertId: result.lastInsertRowid as number
        };
      },

      // ... rest of methods
    };

    // Run migrations
    const cleanSchemaMigration = new CleanSchemaMigration();
    await cleanSchemaMigration.up(this.connection);

    const schedulerConfigMigration = new LibrarySchedulerConfigMigration();
    await schedulerConfigMigration.up(this.connection);

    return this.connection;
  }

  // ... rest of class
}
```

---

## Comprehensive Test Plan

### Phase T1: Fix Existing Tests (2-3 hours)

**Priority: CRITICAL**

1. **Fix testDatabase.ts** (30 min)
   - Update migration imports (20251003 → 20251015)
   - Add `get()` method to connection object
   - Run both migrations (clean schema + scheduler config)
   - Test with existing unit tests

2. **Delete scheduledEnrichmentService.test.ts** (5 min)
   - Service no longer exists
   - Remove file entirely

3. **Fix webhookService.test.ts** (30 min)
   - Update payload assertions (`event` → `eventType`)
   - Re-run and validate all tests pass

4. **Fix publishingService.test.ts** (1 hour)
   - Add mock-fs or create temp cache files
   - Fix 2 failing cache file validation tests

5. **Fix API Endpoint Tests** (1 hour)
   - **DECISION REQUIRED:** Delete, rewrite, or convert to E2E?
   - **Recommendation:** Rewrite to import actual routes
   - Update to use validation middleware
   - Import from `src/routes/api.ts`

**Expected Result:** All existing tests passing

---

### Phase T2: Core Service Tests (6-8 hours)

**Priority: HIGH**

#### CacheService (2 hours)
```typescript
describe('CacheService', () => {
  it('should generate content-addressed paths (SHA256)');
  it('should detect duplicate assets by hash');
  it('should create sharded directory structure (00/01/hash.jpg)');
  it('should handle asset retrieval by hash');
  it('should validate cache integrity');
});
```

#### WebSocketBroadcaster (2 hours)
```typescript
describe('WebSocketBroadcaster', () => {
  it('should broadcast messages to all connected clients');
  it('should broadcast to specific channel subscribers');
  it('should handle scan progress events');
  it('should handle job progress events');
  it('should handle player connection events');
  it('should remove disconnected clients');
});
```

#### LibraryScanService (2 hours)
```typescript
describe('LibraryScanService', () => {
  it('should scan library directory for media files');
  it('should discover existing NFO files');
  it('should discover existing assets (posters, fanart)');
  it('should update scan statistics');
  it('should handle scan errors gracefully');
  it('should emit progress events via WebSocket');
});
```

#### LibraryService (1 hour)
```typescript
describe('LibraryService', () => {
  it('should create new library with validation');
  it('should list all libraries');
  it('should get library by ID');
  it('should update library configuration');
  it('should delete library (soft delete)');
  it('should validate library path exists');
});
```

#### MovieService (1 hour)
```typescript
describe('MovieService', () => {
  it('should list movies with pagination');
  it('should get movie by ID with relations');
  it('should update movie metadata respecting field locks');
  it('should respect field_locked flags');
  it('should delete movie (soft delete)');
});
```

---

### Phase T3: Phase 6 Services Tests (4-6 hours)

**Priority: HIGH** (These services are NEW and completely untested)

#### FileScannerScheduler (2 hours)
```typescript
describe('FileScannerScheduler', () => {
  it('should start scheduler with cron schedule');
  it('should stop scheduler gracefully');
  it('should trigger scheduled file scan');
  it('should add job to queue with correct priority');
  it('should respect enabled flag');
  it('should emit events via WebSocket');
  it('should handle errors without crashing');
});
```

#### ProviderUpdaterScheduler (2 hours)
```typescript
describe('ProviderUpdaterScheduler', () => {
  it('should start scheduler with cron schedule');
  it('should stop scheduler gracefully');
  it('should trigger scheduled provider update');
  it('should add job to queue with correct priority');
  it('should respect enabled flag');
  it('should emit events via WebSocket');
  it('should handle errors without crashing');
});
```

#### LibrarySchedulerConfigService (1 hour)
```typescript
describe('LibrarySchedulerConfigService', () => {
  it('should get scheduler config for library');
  it('should create default config if not exists');
  it('should update file scan schedule');
  it('should update provider update schedule');
  it('should enable/disable schedulers');
  it('should validate cron expressions');
});
```

#### ScheduledFileScanHandler (30 min)
```typescript
describe('ScheduledFileScanHandler', () => {
  it('should execute scheduled file scan');
  it('should call libraryScanService.scanLibrary');
  it('should emit progress via WebSocket');
  it('should handle scan errors');
});
```

#### ScheduledProviderUpdateHandler (30 min)
```typescript
describe('ScheduledProviderUpdateHandler', () => {
  it('should execute scheduled provider update');
  it('should fetch latest metadata from providers');
  it('should emit progress via WebSocket');
  it('should handle update errors');
});
```

---

### Phase T4: Controller Integration Tests (8-10 hours)

**Priority: MEDIUM**

**Approach:** Import actual route definitions, test with full validation middleware

#### LibraryController (2 hours)
```typescript
describe('Library API Endpoints', () => {
  describe('GET /api/libraries', () => {
    it('should return all libraries');
    it('should filter by type (movie, tv, music)');
    it('should validate query parameters');
  });

  describe('POST /api/libraries', () => {
    it('should create new library with validation');
    it('should reject invalid paths');
    it('should reject duplicate paths');
  });

  describe('PUT /api/libraries/:id', () => {
    it('should update library configuration');
    it('should validate library ID');
    it('should return 404 for non-existent library');
  });

  describe('DELETE /api/libraries/:id', () => {
    it('should soft delete library');
    it('should return 404 for non-existent library');
  });

  describe('POST /api/libraries/:id/scan', () => {
    it('should trigger manual library scan');
    it('should add scan job to queue');
    it('should return job ID');
  });
});
```

#### SchedulerController (2 hours)
```typescript
describe('Scheduler API Endpoints', () => {
  describe('GET /api/scheduler/status', () => {
    it('should return scheduler status for all libraries');
    it('should include enabled/disabled state');
    it('should include last run timestamps');
  });

  describe('GET /api/libraries/:id/scheduler', () => {
    it('should return scheduler config for library');
    it('should create default config if not exists');
  });

  describe('PUT /api/libraries/:id/scheduler', () => {
    it('should update scheduler configuration');
    it('should validate cron expressions with Zod');
    it('should validate interval ranges');
  });

  describe('POST /api/libraries/:id/scheduler/file-scan/trigger', () => {
    it('should manually trigger file scan');
    it('should add high-priority job to queue');
  });

  describe('POST /api/libraries/:id/scheduler/provider-update/trigger', () => {
    it('should manually trigger provider update');
    it('should add high-priority job to queue');
  });
});
```

#### MediaPlayerController (2 hours)
```typescript
describe('Media Player API Endpoints', () => {
  describe('GET /api/media-players', () => {
    it('should return all media players');
    it('should include connection status');
  });

  describe('POST /api/media-players', () => {
    it('should create new media player with validation');
    it('should validate required fields (name, host, port)');
    it('should reject invalid player types');
  });

  describe('POST /api/media-players/:id/test', () => {
    it('should test media player connection');
    it('should return success for reachable players');
    it('should return error for unreachable players');
  });

  describe('POST /api/media-players/:id/connect', () => {
    it('should manually connect to media player');
    it('should update connection status');
  });
});
```

#### MovieController (2 hours)
```typescript
describe('Movie API Endpoints', () => {
  describe('GET /api/movies', () => {
    it('should return paginated movies');
    it('should filter by library_id');
    it('should support search query');
  });

  describe('GET /api/movies/:id', () => {
    it('should return movie with relations (genres, actors, images)');
    it('should return 404 for non-existent movie');
  });

  describe('PATCH /api/movies/:id/metadata', () => {
    it('should update metadata respecting field locks');
    it('should reject updates to locked fields');
    it('should validate metadata with Zod');
  });
});
```

#### JobController (1 hour)
```typescript
describe('Job API Endpoints', () => {
  describe('GET /api/jobs/stats', () => {
    it('should return queue statistics');
  });

  describe('GET /api/jobs/recent', () => {
    it('should return recent jobs ordered by created_at');
    it('should support limit parameter');
  });

  describe('POST /api/jobs/:id/cancel', () => {
    it('should cancel pending job');
    it('should reject cancelling processing jobs');
  });

  describe('POST /api/jobs/:id/retry', () => {
    it('should retry failed job');
    it('should reset retry_count and error');
  });
});
```

#### WebhookController (1 hour)
```typescript
describe('Webhook API Endpoints', () => {
  describe('POST /webhooks/radarr', () => {
    it('should accept valid Radarr webhook (Download event)');
    it('should create high-priority job');
    it('should validate payload with Zod');
    it('should reject invalid payloads');
  });

  describe('POST /webhooks/sonarr', () => {
    it('should accept valid Sonarr webhook (Download event)');
    it('should handle Test webhook (no job creation)');
  });
});
```

---

### Phase T5: Integration Tests (4-6 hours)

**Priority: MEDIUM**

#### End-to-End Workflows
```typescript
describe('Complete Library Scan Workflow', () => {
  it('should: trigger scan → discover files → identify → enrich → publish');
});

describe('Scheduled Scan Workflow', () => {
  it('should: scheduler triggers → job created → scan executes → WebSocket updates');
});

describe('Webhook to Publication Workflow', () => {
  it('should: webhook → job → identify → enrich → select assets → publish → notify players');
});

describe('Manual Asset Replacement Workflow', () => {
  it('should: user selects asset → locked field → publish → WebSocket update');
});

describe('Media Player Connection Lifecycle', () => {
  it('should: connect → ping/pong → disconnect → reconnect with backoff');
});
```

---

### Phase T6: Validation & Security Tests (2-3 hours)

**Priority: HIGH** (Production requirement)

#### Validation Middleware Tests
```typescript
describe('Validation Middleware', () => {
  it('should validate library creation with Zod');
  it('should reject invalid library paths');
  it('should validate scheduler configuration');
  it('should validate cron expressions');
  it('should validate media player configuration');
  it('should validate movie metadata updates');
  it('should return 400 with detailed error messages');
});
```

#### Security Tests
```typescript
describe('Security', () => {
  it('should prevent SQL injection in library paths');
  it('should prevent path traversal attacks');
  it('should sanitize user input');
  it('should rate limit API requests');
  it('should clean up rate limiter memory correctly');
});
```

#### Circuit Breaker Tests (Already exist, verify still work)
```typescript
describe('Circuit Breaker', () => {
  it('should open circuit after 5 consecutive failures');
  it('should close circuit after cooldown period');
  it('should half-open and test recovery');
});
```

---

### Phase T7: Coverage Reporting (1 hour)

**Priority: HIGH**

#### Setup Coverage Tools
```bash
npm run test:coverage
```

#### Coverage Targets
- **Overall:** 100% (production requirement)
- **Statements:** 100%
- **Branches:** 100%
- **Functions:** 100%
- **Lines:** 100%

#### Uncovered Code Allowances
- **NONE** - Production-ready code requires 100% coverage

#### Coverage Report
```bash
# Generate HTML coverage report
npm run test:coverage

# Open in browser
open coverage/lcov-report/index.html
```

---

## Test Execution Plan

### Day 1: Fix Foundation (3 hours)
- [ ] Fix testDatabase.ts (migrations, get() method)
- [ ] Delete scheduledEnrichmentService.test.ts
- [ ] Fix webhookService.test.ts
- [ ] Fix publishingService.test.ts
- [ ] Run all existing tests → all should pass

### Day 2: Core Services (8 hours)
- [ ] CacheService tests
- [ ] WebSocketBroadcaster tests
- [ ] LibraryScanService tests
- [ ] LibraryService tests
- [ ] MovieService tests

### Day 3: Phase 6 Services (6 hours)
- [ ] FileScannerScheduler tests
- [ ] ProviderUpdaterScheduler tests
- [ ] LibrarySchedulerConfigService tests
- [ ] ScheduledFileScanHandler tests
- [ ] ScheduledProviderUpdateHandler tests

### Day 4: Controller Integration (8 hours)
- [ ] LibraryController tests
- [ ] SchedulerController tests
- [ ] MediaPlayerController tests
- [ ] MovieController tests
- [ ] JobController tests
- [ ] WebhookController tests

### Day 5: Integration & Security (6 hours)
- [ ] End-to-end workflow tests
- [ ] Validation middleware tests
- [ ] Security tests
- [ ] Circuit breaker verification

### Day 6: Coverage & Documentation (2 hours)
- [ ] Run coverage report
- [ ] Identify gaps
- [ ] Write additional tests to reach 100%
- [ ] Update TESTING.md documentation

---

## Success Criteria

### Test Metrics
- ✅ **100% test pass rate**
- ✅ **100% code coverage** (statements, branches, functions, lines)
- ✅ **All Phase 6 services tested**
- ✅ **All controllers tested**
- ✅ **All validation middleware tested**
- ✅ **All security features tested**

### Code Quality
- ✅ No skipped tests (except 4 known race condition tests in jobQueueService)
- ✅ All tests run in < 15 seconds
- ✅ All tests isolated and independent
- ✅ Clear, descriptive test names
- ✅ AAA pattern (Arrange-Act-Assert)

### Documentation
- ✅ TESTING.md updated with new tests
- ✅ Test coverage report generated
- ✅ README.md updated with test commands
- ✅ Comments in complex test scenarios

---

## Recommended Approach

### Option A: **Incremental Approach** (6 days)
Follow the Day 1-6 plan above. Safest approach.

### Option B: **Aggressive Approach** (3 days)
- Day 1: Fix foundation + Core services
- Day 2: Phase 6 services + Controllers
- Day 3: Integration + Security + Coverage

### Option C: **Continuous Approach** (ongoing)
- Fix tests as you work on features
- Add tests for new endpoints as you create them
- Maintain 100% coverage continuously

**Recommendation: Option A** (Incremental) for thorough production-ready coverage.

---

## Questions for User

1. **API Endpoint Tests:** Delete, rewrite, or convert to E2E?
   - **My recommendation:** Rewrite to import actual routes

2. **Coverage Target:** Strict 100% or allow exceptions?
   - **My recommendation:** 100% for production-ready code

3. **Race Condition Tests:** Leave skipped or fix with synchronization?
   - **My recommendation:** Leave skipped (4 tests, core functionality covered elsewhere)

4. **Priority:** Which phase should we start with?
   - **My recommendation:** Phase T1 (Fix Foundation) immediately

---

## Conclusion

The test infrastructure is solid, but tests need updating for Phase 6 backend changes. With 6 days of focused work, we can achieve 100% test coverage and production-ready confidence.

**Next Step:** Get approval on approach, then start Phase T1 (Fix Foundation).
