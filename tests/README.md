# Metarr Test Suite

## Overview

This directory contains the test suite for Metarr, using Jest with TypeScript support.

## Setup

Test infrastructure has been configured with:

- **Jest**: Test framework with `ts-jest` preset for TypeScript support
- **Supertest**: For HTTP API endpoint testing (to be implemented)
- **In-Memory SQLite**: Fast, isolated test databases via `testDatabase.ts` utility
- **ESM Support**: Full ES Module compatibility with experimental VM modules

## Configuration Files

- `jest.config.cjs`: Jest configuration (CommonJS format due to ES modules in project)
- `tsconfig.test.json`: TypeScript configuration for tests (extends main tsconfig)
- `tests/utils/testDatabase.ts`: Test database utility for creating isolated test databases

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Test Structure

```
tests/
├── utils/              # Test utilities
│   └── testDatabase.ts # Database setup/teardown helper
├── unit/              # Unit tests for individual services
│   ├── assetSelectionService.test.ts
│   └── jobQueueService.test.ts
└── integration/       # Integration tests for workflows
    └── webhookWorkflow.test.ts
```

## Test Database Utility

The `testDatabase.ts` utility provides:

- In-memory SQLite database creation
- Full schema migration from `InitialSchemaMigration`
- `seed()` method for test data insertion
- `clear()` method for cleanup between tests
- Automatic connection management and teardown

### Usage Example

```typescript
import { TestDatabase, createTestDatabase } from '../utils/testDatabase.js';

describe('My Service', () => {
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

## Current Status

### ✅ Completed

- Jest and TypeScript configuration
- Test database utility with in-memory SQLite
- ESM support with experimental VM modules
- Coverage reporting setup

### ⚠️ In Progress

The initial test files have schema mismatches with the actual database migrations:

**Schema Issues to Fix:**

1. **Job Queue Table**:
   - Tests use: `type`, `state`, `payload` (object)
   - Actual schema: `job_type`, `status`, `payload` (TEXT/JSON string)

2. **Movies Table**:
   - Tests: Not providing required `library_id` column
   - Need to seed libraries table first

3. **Asset Candidates Table**:
   - Verify column names match between tests and schema

### 📋 TODO

1. **Fix Existing Tests**:
   - Update column names to match actual migration schema
   - Add library seeding to movie tests
   - Fix JSON payload handling (stringify/parse)

2. **Add Missing Tests**:
   - PublishingService tests
   - ProviderAssetService tests (requires mocking TMDBClient)
   - AutomationConfigService tests
   - WebhookService tests
   - ScheduledEnrichmentService tests

3. **API Endpoint Tests**:
   - Asset endpoints (`/api/assets/*`)
   - Job endpoints (`/api/jobs/*`)
   - Automation config endpoints (`/api/automation/*`)
   - Webhook endpoints (`/api/webhooks/*`)

4. **Integration Tests**:
   - Complete publish workflow
   - Scheduled enrichment workflow
   - Library scan workflow
   - Error handling and retry logic

## Database Schema Reference

When writing tests, refer to the actual migration schema:

- **Location**: `src/database/migrations/20251003_001_initial_schema.ts`
- **Key Tables**: movies, series, episodes, asset_candidates, cache_inventory, job_queue, publish_log
- **Important**: Always check actual column names in migration before writing tests

## Notes

- Tests use in-memory SQLite for speed, but production supports PostgreSQL/MySQL
- Schema differences between SQLite and production databases should be minimal
- All tests should be isolated and not depend on external services
- Mock external API calls (TMDB, TVDB, Kodi, etc.)

## Best Practices

1. **Isolation**: Each test should create its own database instance
2. **Cleanup**: Always destroy test database in `afterEach`
3. **Seeding**: Use `testDb.seed()` for common test data patterns
4. **Mocking**: Mock external services (TMDB, file system operations)
5. **Assertions**: Use descriptive expect statements
6. **Coverage**: Aim for >80% coverage on core services

## Debugging Tests

```bash
# Run specific test file
npm test -- tests/unit/jobQueueService.test.ts

# Run with verbose output
npm test -- --verbose

# Run in debug mode
node --inspect-brk node_modules/.bin/jest --runInBand
```

## Future Enhancements

- Add test fixtures for common data patterns
- Implement snapshot testing for NFO generation
- Add performance benchmarks
- Set up CI/CD pipeline integration
- Add E2E tests with real database
