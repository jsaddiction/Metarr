# Metarr Test Suite

## Quick Start

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- tests/unit/assetSelectionService.test.ts

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

## Documentation

**📖 Complete testing documentation:** [docs/TESTING.md](../docs/TESTING.md)

The comprehensive testing guide includes:
- Test infrastructure overview
- Running tests and debugging
- Writing new tests
- Best practices and patterns
- Current test status
- Known issues and future improvements
- Troubleshooting guide

## Quick Reference

### Test Organization

```
tests/
├── unit/           # Service-level tests
├── integration/    # Multi-service workflow tests
├── api/            # HTTP endpoint tests (needs redesign)
└── utils/          # Test utilities (testDatabase.ts)
```

### Current Status

```
Test Suites: 5 passed, 4 failed, 9 total
Tests:       67 passed, 45 failed, 4 skipped, 116 total

Non-API Tests: 67 passed, 0 failed, 4 skipped (93% pass rate) ✅
```

### Test Database Utility

```typescript
import { createTestDatabase } from './utils/testDatabase.js';

let testDb: TestDatabase;

beforeEach(async () => {
  testDb = await createTestDatabase();
  const db = await testDb.create();

  await testDb.seed({
    movies: [{ title: 'Test Movie', year: 2023, tmdb_id: 550 }]
  });
});

afterEach(async () => {
  await testDb.destroy();
});
```

## Need Help?

- **Full Documentation:** [docs/TESTING.md](../docs/TESTING.md)
- **Architecture:** [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)
- **Database Schema:** [docs/DATABASE_SCHEMA.md](../docs/DATABASE_SCHEMA.md)
- **API Structure:** [docs/API_ARCHITECTURE.md](../docs/API_ARCHITECTURE.md)
