# Testing Guide

**Purpose**: Comprehensive guide to testing infrastructure, patterns, and requirements for Metarr. Covers unit tests, integration tests, manual testing, and when each type is required.

**Related Docs**:
- Parent: [WORKFLOW.md](./WORKFLOW.md) - Testing in development workflow
- Related: [CODING_STANDARDS.md](./CODING_STANDARDS.md), [/CLAUDE.md](/CLAUDE.md)

## Quick Reference

- **Unit tests**: Business logic, transformations, utilities
- **Integration tests**: API endpoints, database operations
- **Manual testing**: UI changes, user workflows
- **Required**: New business logic and API endpoints
- **Optional**: Simple CRUD, straightforward UI components
- **Run tests**: `npm test` (all), `npm run test:watch` (watch mode)

---

## Test Infrastructure

### Technology Stack

**Testing frameworks**:
- **Jest**: Test runner and assertion library
- **Supertest**: HTTP assertion for API tests
- **ts-jest**: TypeScript support for Jest
- **cross-env**: Environment variable management

**Key configuration**:
- Test files: `**/__tests__/**/*.test.ts`
- Environment: `NODE_OPTIONS=--experimental-vm-modules`
- Coverage: Configured in `jest.config.js`

### Project Test Structure

```
src/
├── services/
│   ├── assetScoring.ts
│   └── __tests__/
│       └── assetScoring.test.ts
├── controllers/
│   ├── movieController.ts
│   └── __tests__/
│       └── movieController.test.ts
└── utils/
    ├── pathMapping.ts
    └── __tests__/
        └── pathMapping.test.ts
```

**Pattern**: `__tests__` directory adjacent to code under test

---

## When Tests Are Mandatory

### Always Write Tests For

**Business logic**:
- Asset scoring algorithms
- Metadata transformation
- Field locking logic
- Job processing logic
- Path mapping calculations

**API endpoints**:
- All new REST endpoints
- WebSocket event handlers
- Webhook processing
- Authentication/authorization

**Data transformations**:
- Database model conversions
- Provider response parsing
- NFO file generation
- Asset tier promotions

**Validation logic**:
- Input validation schemas
- Data sanitization
- Type guards
- Format conversions

**Provider integrations**:
- API response handling
- Rate limiting behavior
- Error handling
- Retry logic

**Job handlers**:
- Scan job processing
- Enrichment job processing
- Publishing job processing
- Cleanup job processing

### Optional (Use Judgment)

**Simple CRUD operations**:
- Standard database queries
- Basic record retrieval
- Straightforward updates
- If logic is minimal

**Straightforward UI components**:
- Pure presentational components
- Simple form inputs
- Basic layout components

**Configuration changes**:
- Adding new config options
- Default value changes
- Environment variable handling

**When in doubt**: Write the test. Better to have unnecessary test than missing critical one.

---

## Unit Testing

### What Are Unit Tests?

**Characteristics**:
- Test individual functions/methods in isolation
- Mock external dependencies (database, APIs, file system)
- Fast execution (< 100ms per test)
- No side effects

### Unit Test Pattern

```typescript
// src/services/__tests__/assetScoring.test.ts

import { calculateAssetScore } from '../assetScoring.js';
import { AssetCandidate } from '../../types/index.js';

describe('calculateAssetScore', () => {
  it('should score higher resolution images higher', () => {
    // Arrange
    const lowRes: AssetCandidate = {
      url: 'https://example.com/poster-low.jpg',
      width: 500,
      height: 750,
      type: 'poster',
    };

    const highRes: AssetCandidate = {
      url: 'https://example.com/poster-high.jpg',
      width: 2000,
      height: 3000,
      type: 'poster',
    };

    // Act
    const lowScore = calculateAssetScore(lowRes);
    const highScore = calculateAssetScore(highRes);

    // Assert
    expect(highScore).toBeGreaterThan(lowScore);
  });

  it('should handle missing dimensions gracefully', () => {
    // Arrange
    const noDimensions: AssetCandidate = {
      url: 'https://example.com/poster.jpg',
      type: 'poster',
    };

    // Act
    const score = calculateAssetScore(noDimensions);

    // Assert
    expect(score).toBe(0);
  });
});
```

### Mocking External Dependencies

**Database mocks**:
```typescript
import { db } from '../../database/index.js';

jest.mock('../../database/index.js', () => ({
  db: {
    get: jest.fn(),
    all: jest.fn(),
    run: jest.fn(),
  },
}));

describe('MovieService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch movie by id', async () => {
    // Mock database response
    (db.get as jest.Mock).mockResolvedValue({
      id: 1,
      title: 'Test Movie',
    });

    const result = await movieService.getById(1);

    expect(result.title).toBe('Test Movie');
    expect(db.get).toHaveBeenCalledWith(
      expect.stringContaining('SELECT'),
      [1]
    );
  });
});
```

**Provider API mocks**:
```typescript
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('TMDBProvider', () => {
  it('should search for movie', async () => {
    mockedAxios.get.mockResolvedValue({
      data: {
        results: [{ id: 1, title: 'Test Movie' }],
      },
    });

    const results = await provider.search('Test Movie');

    expect(results).toHaveLength(1);
    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('/search/movie')
    );
  });
});
```

---

## Integration Testing

### What Are Integration Tests?

**Characteristics**:
- Test multiple components together
- Use real dependencies (test database, file system)
- Test end-to-end workflows
- Slower execution (< 1s per test typically)

### Integration Test Pattern

```typescript
// src/controllers/__tests__/movieController.test.ts

import request from 'supertest';
import { app } from '../../app.js';
import { db } from '../../database/index.js';

describe('Movie API', () => {
  beforeEach(async () => {
    // Setup test database
    await db.exec('DELETE FROM movies');
    await db.run(
      'INSERT INTO movies (title, release_date) VALUES (?, ?)',
      ['Test Movie', '2024-01-01']
    );
  });

  afterAll(async () => {
    // Cleanup
    await db.close();
  });

  describe('GET /api/movies', () => {
    it('should return all movies', async () => {
      const response = await request(app)
        .get('/api/movies')
        .expect(200);

      expect(response.body).toHaveProperty('movies');
      expect(response.body.movies).toHaveLength(1);
      expect(response.body.movies[0].title).toBe('Test Movie');
    });

    it('should filter by status', async () => {
      const response = await request(app)
        .get('/api/movies?status=active')
        .expect(200);

      expect(response.body.movies).toHaveLength(1);
    });
  });

  describe('POST /api/movies/:id/enrich', () => {
    it('should enqueue enrichment job', async () => {
      const response = await request(app)
        .post('/api/movies/1/enrich')
        .expect(200);

      expect(response.body).toHaveProperty('jobId');
    });

    it('should return 404 for non-existent movie', async () => {
      await request(app)
        .post('/api/movies/999/enrich')
        .expect(404);
    });
  });
});
```

### Test Database Setup

**Use separate test database**:
```typescript
// Configure in test setup
const TEST_DB_PATH = ':memory:'; // Or 'data/test.sqlite'

beforeAll(async () => {
  // Initialize test database
  await migrate(TEST_DB_PATH);
});

afterAll(async () => {
  // Cleanup
  await db.close();
});
```

---

## Manual Testing

### What Requires Manual Testing?

**UI changes**:
- Visual appearance
- Responsive design
- User interactions
- Animation/transitions

**User workflows**:
- Multi-step processes
- Error message display
- Form validation feedback
- Navigation flows

**Cross-browser compatibility**:
- Chrome (primary)
- Firefox
- Safari (if applicable)

### Manual Testing Checklist

**For every UI change**:
```
[ ] Visual appearance matches design
[ ] Responsive on mobile/tablet/desktop
[ ] No console errors in DevTools
[ ] Accessibility (keyboard navigation, screen readers)
[ ] Loading states display correctly
[ ] Error states display correctly
[ ] Success feedback works
```

**For API changes**:
```
[ ] Test in browser DevTools Network tab
[ ] Verify request payload correct
[ ] Verify response structure correct
[ ] Test error scenarios (404, 500, timeout)
[ ] Check WebSocket updates (if applicable)
```

---

## Running Tests

### Command Reference

```bash
# Run all tests
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run specific test file
npm test -- src/services/__tests__/assetScoring.test.ts

# Run tests matching pattern
npm test -- --testNamePattern="asset scoring"

# Run tests for specific directory
npm test -- src/controllers/__tests__/
```

### Watch Mode Usage

**Best for development**:
1. Start watch mode: `npm run test:watch`
2. Make code changes
3. Tests auto-run
4. Fix failures immediately
5. Press `a` to run all tests
6. Press `f` to run only failed tests
7. Press `p` to filter by filename pattern

---

## Test Quality Guidelines

### Good Tests Are FIRST

**Fast**:
- Unit tests: < 100ms
- Integration tests: < 1s
- Remove unnecessary delays/waits
- Mock slow external dependencies

**Isolated**:
- No shared state between tests
- Each test can run independently
- Use `beforeEach` for setup
- Clean up in `afterEach`

**Repeatable**:
- Same result every run
- No flaky tests (randomness, timing)
- No dependency on external services
- No dependency on test execution order

**Self-validating**:
- Clear pass/fail (no manual verification)
- Use assertions, not console.log
- Test one thing per test
- Clear error messages

**Thorough**:
- Test happy path
- Test error cases
- Test edge cases
- Test boundary conditions

### Test Structure: Arrange-Act-Assert

```typescript
it('should calculate correct score', () => {
  // Arrange: Set up test data and conditions
  const asset = {
    width: 2000,
    height: 3000,
  };

  // Act: Execute the code under test
  const score = calculateScore(asset);

  // Assert: Verify the results
  expect(score).toBeGreaterThan(0);
  expect(score).toBeLessThanOrEqual(100);
});
```

### Descriptive Test Names

**Good test names**:
```typescript
it('should return 404 when movie not found')
it('should enqueue enrichment job for valid movie')
it('should preserve locked fields during enrichment')
it('should fallback to secondary provider on primary failure')
```

**Bad test names**:
```typescript
it('works') // Too vague
it('test enrichment') // Not descriptive
it('should call the function') // Describes implementation, not behavior
```

---

## Coverage Expectations

### What to Aim For

**Target coverage**:
- Business logic: 80%+ coverage
- Controllers: 70%+ coverage
- Utilities: 90%+ coverage
- Overall: 70%+ coverage

**Don't obsess over 100%**:
- Focus on critical paths
- Some code hard to test (not worth effort)
- Better to have good tests than many tests

### Running Coverage Reports

```bash
# Generate coverage report
npm run test:coverage

# View HTML report
open coverage/lcov-report/index.html
```

**Coverage metrics explained**:
- **Statements**: % of code statements executed
- **Branches**: % of if/else branches tested
- **Functions**: % of functions called
- **Lines**: % of lines executed

---

## Common Testing Patterns

### Testing Async Code

```typescript
it('should fetch movie metadata', async () => {
  const result = await provider.getMetadata(movieId);
  expect(result.title).toBe('Expected Title');
});
```

### Testing Promises

```typescript
it('should reject on invalid input', async () => {
  await expect(service.process(null)).rejects.toThrow('Invalid input');
});
```

### Testing Errors

```typescript
it('should throw ValidationError for invalid data', () => {
  expect(() => {
    validate(invalidData);
  }).toThrow(ValidationError);
});
```

### Testing Callbacks

```typescript
it('should call callback with result', (done) => {
  service.process(data, (error, result) => {
    expect(error).toBeNull();
    expect(result).toBeDefined();
    done();
  });
});
```

---

## Troubleshooting Tests

### Issue: Tests failing locally but pass in CI

**Common causes**:
- Environment differences
- Stale test database
- Cached dependencies
- Timing issues

**Solutions**:
```bash
# Clean everything
rm -rf node_modules dist data/test.sqlite
npm clean-install
npm test
```

### Issue: Flaky tests (intermittent failures)

**Common causes**:
- Race conditions
- Timing dependencies
- Shared state between tests

**Solutions**:
- Add proper async/await
- Increase timeouts if necessary
- Ensure proper cleanup in afterEach
- Use jest.useFakeTimers() for time-dependent code

### Issue: "Cannot find module" errors

**Solution**:
```bash
# Rebuild TypeScript
npm run build

# Or use ts-jest (already configured)
npm test
```

### Issue: Tests hang/timeout

**Common causes**:
- Missing done() callback
- Unclosed database connections
- Infinite loops
- Missing async/await

**Solutions**:
- Add timeout to specific test: `it('test', () => { ... }, 5000)`
- Check for unclosed resources
- Add debug logging
- Use `--detectOpenHandles` flag

---

## See Also

- [WORKFLOW.md](./WORKFLOW.md) - Testing in development workflow
- [CODING_STANDARDS.md](./CODING_STANDARDS.md) - Code organization
- [Jest Documentation](https://jestjs.io/docs/getting-started) - Official Jest docs
- [Supertest Documentation](https://github.com/visionmedia/supertest) - HTTP testing
