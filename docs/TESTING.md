# Testing Strategy & Infrastructure

**Last Updated:** 2025-10-21
**Test Framework:** Jest with TypeScript
**Current Status:** 🟡 **166 tests passing (13/15 suites passing, 2 failing due to TypeScript errors)**

---

## Quick Reference

**Run Tests**: `npm test`
**Run Specific Suite**: `npm test -- AssetSelector`
**Watch Mode**: `npm test -- --watch`
**Coverage Report**: `npm test -- --coverage`

**Current Status**: 166 tests passing, 13/15 suites passing
**v1.0 Target**: 100% test coverage
**Next Phase**: Resume testing after frontend rework completion

---

## Testing Roadmap

**Current Phase**: Testing paused during frontend rework
**Current Coverage**: 166 tests passing (13/15 suites), 2 suites failing (TypeScript errors)
**v1.0 Target**: 100% test coverage
**Timeline**: Resume after frontend rework completion

### Coverage Status

**Well Tested** (✅):
- Provider services (12 test suites, 100% passing)
- Rate limiting & circuit breaker (100% coverage)
- Asset selector service
- Provider metadata validation

**Has TypeScript Errors** (⚠️):
- JobQueueService (needs interface alignment)
- WebhookService (depends on JobQueueService)

**Needs Tests** (⏳):
- CacheService
- LibraryScanService
- NFO generation
- Path mapping service
- Player integration services
- API controllers

### Post-Frontend Priorities

1. Fix TypeScript errors in existing tests
2. Service layer tests (achieve 100% coverage)
3. Controller tests (API endpoint validation)
4. Integration tests (end-to-end workflows)
5. Frontend component tests (React Testing Library)
6. E2E tests (Playwright - Docker environment)

---

## Coverage Metrics

**Current** (2025-10-21):
- Provider Tests: 12 suites (100% passing)
- Unit Tests: 3 suites (1 passing, 2 failing)
- Integration Tests: 0 suites (planned)
- E2E Tests: 0 suites (planned)
- **Total**: 166 passing, 13/15 suites passing

**v1.0 Target**:
- Service Coverage: 100%
- Controller Coverage: 100%
- Integration Coverage: Core workflows only
- E2E Coverage: Critical paths (scan → enrich → publish)

---

## Overview

Metarr uses a comprehensive testing strategy focused on provider integration and core service functionality:

1. **Unit Tests** - Service-level testing with isolated databases
2. **Provider Tests** - Comprehensive provider system validation
3. **Integration Tests** - Planned (end-to-end workflows)

---

## Test Infrastructure

### Jest Configuration

- **File:** `jest.config.cjs`
- **Preset:** `ts-jest` for TypeScript support
- **Module Type:** ESM with experimental VM modules
- **Test Match:** `tests/**/*.test.ts`
- **Coverage:** NYC/Istanbul integration ready

### TypeScript Configuration

- **File:** `tsconfig.test.json`
- **Extends:** Main `tsconfig.json`
- **Includes:** `tests/**/*`, `src/**/*`
- **Module:** ES2022 for modern JS features

### Test Database Utility

**Location:** `tests/utils/testDatabase.ts`

Provides isolated in-memory SQLite databases for fast, reliable testing:

```typescript
import { createTestDatabase } from '../utils/testDatabase.js';

let testDb: TestDatabase;

beforeEach(async () => {
  testDb = await createTestDatabase();
  const db = await testDb.create(); // Runs migrations automatically

  // Seed test data
  await testDb.seed({
    movies: [{ title: 'Test Movie', year: 2023, tmdb_id: 550 }]
  });
});

afterEach(async () => {
  await testDb.destroy(); // Clean up
});
```

**Features:**
- ✅ In-memory SQLite (fast, isolated)
- ✅ Automatic schema migration from production migrations
- ✅ Reusable `seed()` method for common test data
- ✅ `clear()` method for cleanup between tests
- ✅ Connection wrapper matching production interface

---

## Running Tests

### Basic Commands

```bash
# Run all tests
npm test

# Run specific test file
npm test -- tests/unit/assetSelectionService.test.ts

# Run specific test suite
npm test -- tests/unit
npm test -- tests/integration

# Watch mode (re-run on file changes)
npm run test:watch

# Coverage report
npm run test:coverage
```

### Debugging Tests

```bash
# Verbose output
npm test -- --verbose

# Run in band (no parallel, easier debugging)
npm test -- --runInBand

# Debug with Node inspector
node --inspect-brk node_modules/.bin/jest --runInBand
```

---

## Test Organization

### Directory Structure

```
tests/
├── unit/                  # Service-level tests
│   ├── jobQueueService.test.ts          ✅ 11 tests (4 skipped)
│   ├── providerMetadata.test.ts         ✅ 58 tests
│   └── webhookService.test.ts           ✅ 14 tests
│
├── providers/             # Provider system tests (12 suites)
│   ├── AssetSelector.test.ts            ✅ 9 tests
│   ├── CircuitBreaker.test.ts           ✅ 8 tests
│   ├── FanArtProvider.test.ts           ✅ Tests provider
│   ├── IMDbProvider.test.ts             ✅ Tests provider
│   ├── LocalProvider.test.ts            ✅ Tests provider
│   ├── MusicBrainzProvider.test.ts      ✅ Tests provider
│   ├── ProviderOrchestrator.test.ts     ✅ 7 tests
│   ├── ProviderRegistry.test.ts         ✅ 7 tests
│   ├── RateLimiter.test.ts              ✅ 7 tests
│   ├── TheAudioDBProvider.test.ts       ✅ Tests provider
│   ├── TMDBProvider.test.ts             ✅ Tests provider
│   └── TVDBProvider.test.ts             ✅ Tests provider
│
└── utils/                 # Test utilities
    └── testDatabase.ts    # Database test helper (Phase 6 schema)
```

---

## Writing Tests

### Best Practices

#### 1. **Test Isolation**
Each test should be independent and create its own database:

```typescript
describe('MyService', () => {
  let testDb: TestDatabase;
  let service: MyService;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    const db = await testDb.create();
    service = new MyService(db);
  });

  afterEach(async () => {
    await testDb.destroy();
  });

  it('should do something', async () => {
    // Test implementation
  });
});
```

#### 2. **Descriptive Test Names**
Use clear, behavior-focused names:

```typescript
// ✅ Good
it('should return empty array when no candidates exist', async () => {});

// ❌ Bad
it('test getCandidates', async () => {});
```

#### 3. **Arrange-Act-Assert Pattern**
Structure tests clearly:

```typescript
it('should select asset with highest score in YOLO mode', async () => {
  // Arrange - Set up test data
  await testDb.seed({ movies: [{ title: 'Test', tmdb_id: 550 }] });
  await seedAssetCandidates();

  // Act - Perform the action
  const result = await service.selectAssetYOLO('movie', 1, 'poster');

  // Assert - Verify the outcome
  expect(result).toBe(true);
  const selected = await getSelectedAssets();
  expect(selected[0].auto_score).toBe(95);
});
```

#### 4. **Schema Alignment**
Always reference actual migration schema when writing tests:

```typescript
// ✅ Correct - Check schema first
// movies table has: tmdb_id, imdb_id (no tvdb_id)
const movie = await db.query('SELECT tmdb_id, imdb_id FROM movies WHERE id = 1');

// ❌ Wrong - Assuming columns exist
const movie = await db.query('SELECT tvdb_id FROM movies WHERE id = 1');
```

**Schema Reference:** `src/database/migrations/20251015_001_clean_schema.ts` (Phase 6 Clean Schema)

#### 5. **Entity-Type Awareness**
Different entity types have different columns:

| Entity | Provider IDs |
|--------|-------------|
| Movies | `tmdb_id`, `imdb_id` |
| Series | `tmdb_id`, `tvdb_id`, `imdb_id` |
| Episodes | `tmdb_id`, `tvdb_id`, `imdb_id` |

---

## Current Test Status (2025-10-21)

### Test Suites Summary

**Status**: 13/15 suites passing (2 failing due to TypeScript errors)

#### Provider System Tests (12 suites) ✅

**Core Infrastructure:**
- **AssetSelector** - Asset selection algorithms, quality filtering, deduplication
- **CircuitBreaker** - Failure detection, half-open recovery, state transitions
- **RateLimiter** - Request throttling, burst capacity, window management
- **ProviderOrchestrator** - Multi-provider coordination, fallback logic
- **ProviderRegistry** - Provider registration, capability queries

**Provider Implementations:**
- **TMDBProvider** - Movie/TV metadata, rate limiting, authentication
- **TVDBProvider** - TV series metadata, JWT authentication
- **FanArtProvider** - High-quality artwork, optional API key
- **IMDbProvider** - Web scraping (ToS warning)
- **MusicBrainzProvider** - Music metadata
- **TheAudioDBProvider** - Music artwork
- **LocalProvider** - NFO parsing, local asset discovery

#### Unit Tests (3 suites)

**ProviderMetadata** ✅ (58 tests)
- Coverage: TMDB/TVDB/FanArt.tv metadata validation, embedded API keys, rate limits

**JobQueueService** ⚠️ (TypeScript errors)
- Error: Interface mismatch with IJobQueueStorage
- Needs: Interface alignment, JobType enum updates

**WebhookService** ⚠️ (TypeScript errors)
- Error: Depends on JobQueueService interface
- Needs: Fix after JobQueueService resolution

---

## Known Limitations

### 1. TypeScript Interface Errors (2 test suites)
**Affected**: JobQueueService, WebhookService
**Reason**: Interface changes not synchronized with test implementations
**Impact**: Tests cannot run until interfaces are aligned
**Status**: Blocked - requires refactoring after frontend rework

### 2. Missing Test Coverage
**Services Not Tested:**
- CacheService (content-addressed storage)
- WebSocketBroadcaster (real-time events)
- LibraryScanService (scan coordination)
- LibraryService (CRUD operations)
- MovieService (CRUD operations)
- MediaPlayerService (player management)
- API Controllers (all 13 controllers)

**Status**: Planned for post-frontend testing phase

### 3. External API Mocking
**Current**: Tests don't make real API calls
**Future**: Add comprehensive mock responses for provider APIs
**Benefit**: Test error scenarios, rate limiting, timeouts

---

## Future Testing Work (Post-Frontend Rework)

### Priority 1: Fix Existing Tests
- Align JobQueueService interface with implementation
- Fix WebhookService test dependencies
- Restore 100% test pass rate

### Priority 2: Service Layer Coverage
**CacheService**
- Content-addressed path generation (SHA256)
- Duplicate detection and deduplication
- Cache integrity validation

**LibraryScanService**
- Directory scanning, NFO discovery, progress events

**WebSocketBroadcaster**
- Message broadcasting, channel subscriptions, connection management

**LibraryService & MovieService**
- CRUD operations, validation, field locking

**MediaPlayerService**
- Connection lifecycle, status monitoring, player notification

### Priority 3: Controller & Integration Tests
**API Controllers**
- All 13 controllers (Library, Scheduler, MediaPlayer, etc.)
- Route validation, middleware testing, error handling

**Integration Tests**
- End-to-end workflows (scan → enrich → publish)
- Multi-service coordination
- Webhook-to-publish workflow

### Priority 4: Frontend Testing
**Component Tests** (React Testing Library)
- UI component behavior
- User interactions
- State management

**E2E Tests** (Playwright)
- Critical user paths
- Docker environment testing
- Cross-browser compatibility

### Priority 5: Advanced Testing
**Error Scenarios**
- Database failures, provider API errors, invalid payloads

**Performance Tests**
- Large library handling (10k+ movies)
- Batch processing performance

**Mock External APIs**
- TMDB/TVDB/MusicBrainz response mocks
- Network error simulation

---

## Test Quality Metrics

### Current Metrics (2025-10-21)

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| **Test Suites Passing** | **13/15 (87%)** | 100% | 🟡 |
| **Tests Passing** | **166** | TBD | 🟡 |
| **Provider Tests** | 12/12 (100%) | 100% | ✅ |
| **Unit Tests** | 1/3 (33%) | 100% | ⚠️ |
| **Test Execution Time** | ~12s | <15s | ✅ |
| **Test Isolation** | 100% | 100% | ✅ |
| **Critical Path Coverage** | Provider System: 100% | 100% | ✅ |

### Test Quality Checklist

- ✅ Tests are isolated and independent
- ✅ Tests use descriptive, behavior-focused names
- ✅ Tests follow AAA pattern (Arrange-Act-Assert)
- ✅ Each test verifies single responsibility
- ✅ Tests clean up resources properly
- ✅ Tests execute quickly (<15 seconds for full suite)
- ⚠️ Schema aligned with migrations (2 tests need updates)
- ⚠️ External services mocked (partial)
- ⏳ Integration tests (not yet implemented)
- ⚠️ Error scenarios covered (partial)

---

## Troubleshooting Tests

### Common Issues

#### 1. Database Schema Errors
```
Error: SQLITE_ERROR: no such column: column_name
```

**Solution:** Check migration schema matches test queries
```bash
# Reference actual schema
less src/database/migrations/20251003_001_initial_schema.ts
```

#### 2. Test Timeout Errors
```
Error: Timeout - Async callback was not invoked within timeout
```

**Solution:** Increase timeout or fix async handling
```typescript
// Increase timeout for specific test
it('long running test', async () => {
  // test code
}, 10000); // 10 second timeout

// Or ensure proper async cleanup
afterEach(async () => {
  await testDb.destroy(); // Must await!
});
```

#### 3. Port Already in Use (E2E tests)
```
Error: listen EADDRINUSE: address already in use :::3000
```

**Solution:** Use dynamic port allocation or clean up servers
```typescript
const app = express();
const server = app.listen(0); // Dynamic port
const port = server.address().port;
```

#### 4. Flaky Tests (Race Conditions)
```
Test passes sometimes, fails other times
```

**Solution:** Add explicit synchronization or skip
```typescript
// Option 1: Add synchronization
await waitFor(() => expect(condition).toBe(true));

// Option 2: Skip timing-sensitive test
it.skip('flaky test', async () => {});
```

---

## CI/CD Integration

### GitHub Actions (Future)

```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npm test
      - run: npm run test:coverage
      - uses: codecov/codecov-action@v3
```

### Pre-commit Hooks

```bash
# Add to .husky/pre-commit
npm test -- --bail --findRelatedTests
```

---

## References

- **Jest Documentation:** https://jestjs.io/docs/getting-started
- **ts-jest Documentation:** https://kulshekhar.github.io/ts-jest/
- **Testing Best Practices:** https://testingjavascript.com/
- **Test Database Utility:** `tests/utils/testDatabase.ts`
- **Migration Schema:** `src/database/migrations/20251015_001_clean_schema.ts`

---

## Conclusion

**Current Status** (2025-10-21): 🟡 **13/15 test suites passing (166 tests), 2 suites blocked by TypeScript errors**

The Metarr test infrastructure is **production-grade** with excellent isolation, fast execution, and clear organization. The provider system has **comprehensive test coverage** and is fully validated.

**What's Working:**
- Provider system (12/12 suites, 100% passing)
- Provider infrastructure (circuit breakers, rate limiting, orchestration)
- Asset selection algorithms and quality filtering
- Provider metadata validation

**What Needs Work:**
- Fix TypeScript interface alignment (JobQueueService, WebhookService)
- Add service layer tests (CacheService, LibraryScanService, etc.)
- Add controller tests (13 API controllers)
- Add integration and E2E tests

**Timeline:** Testing paused during frontend rework. Resume after frontend completion with goal of **100% test coverage for v1.0 release**.
