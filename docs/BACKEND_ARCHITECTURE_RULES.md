# Backend Architecture & Code Structure Rules

## Overview

This document defines the architectural patterns, code structure rules, and best practices for the Metarr backend. These rules were established during a comprehensive code review and refactoring session to ensure code quality, maintainability, security, and production readiness.

**Last Updated**: 2025-10-13
**Status**: ✅ Active - All critical issues resolved

---

## Table of Contents

1. [Type Safety](#type-safety)
2. [Input Validation](#input-validation)
3. [Error Handling](#error-handling)
4. [Database Patterns](#database-patterns)
5. [Logging](#logging)
6. [Security](#security)
7. [Performance & Scalability](#performance--scalability)
8. [Service Layer Patterns](#service-layer-patterns)
9. [Testing](#testing)
10. [Code Style](#code-style)

---

## 1. Type Safety

### Rules

**✅ DO:**
- Use typed interfaces for all database queries
- Import types from `src/types/database-models.ts`
- Use `unknown` instead of `any` for error catches, then narrow with type guards
- Enable strict TypeScript compiler options
- Explicitly type all function parameters and return values

**❌ DON'T:**
- Use `any` type except when absolutely necessary (e.g., third-party library compatibility)
- Use implicit `any` types
- Cast without validation

### Examples

```typescript
// ✅ GOOD: Typed database query
import { LibraryRow } from '../types/database-models.js';

const libraries = await db.query<LibraryRow[]>(
  'SELECT * FROM libraries WHERE id = ?',
  [id]
);

// ❌ BAD: Untyped database query
const libraries = await db.query<any[]>(
  'SELECT * FROM libraries WHERE id = ?',
  [id]
);

// ✅ GOOD: Proper error handling with unknown
try {
  await someOperation();
} catch (error) {
  if (error instanceof Error) {
    logger.error('Operation failed', {
      message: error.message,
      stack: error.stack
    });
  } else {
    logger.error('Unknown error', { error: String(error) });
  }
}

// ❌ BAD: Using any for errors
try {
  await someOperation();
} catch (error: any) {
  logger.error('Operation failed', { error: error.message });
}
```

### Database Row Types

All database table rows have corresponding TypeScript interfaces:

- `LibraryRow` - libraries table
- `MovieRow` - movies table
- `MediaPlayerRow` - media_players table
- `ImageRow` - images table
- `JobRow` - job_queue table
- See `src/types/database-models.ts` for complete list

### SQLite Boolean Conversion

```typescript
import { sqliteBooleanToBoolean, booleanToSqliteBoolean } from '../types/database-models.js';

// Converting from database
const isEnabled = sqliteBooleanToBoolean(row.enabled);

// Converting to database
const enabledValue = booleanToSqliteBoolean(true); // Returns 1
```

---

## 2. Input Validation

### Rules

**✅ DO:**
- Use Zod schemas for all API request validation
- Validate at the API boundary (routes layer)
- Use centralized validation middleware
- Sanitize user inputs
- Validate file paths against directory traversal

**❌ DON'T:**
- Trust user input without validation
- Perform validation in controllers (use middleware)
- Use manual validation logic when schemas exist
- Allow unsanitized input to reach the database

### Implementation

**Creating Validation Schemas:**

```typescript
// src/validation/librarySchemas.ts
import { z } from 'zod';
import { filePathSchema, libraryTypeSchema } from '../middleware/validation.js';

export const createLibrarySchema = z.object({
  name: z.string().min(1).max(255).trim(),
  type: libraryTypeSchema,
  path: filePathSchema,
});
```

**Applying Validation to Routes:**

```typescript
// src/routes/api.ts
import { validateRequest } from '../middleware/validation.js';
import { createLibrarySchema } from '../validation/librarySchemas.js';

router.post('/libraries',
  validateRequest(createLibrarySchema, 'body'),
  (req, res, next) => libraryController.create(req, res, next)
);
```

**Path Validation:**

```typescript
import { validatePath } from '../middleware/validation.js';

// Validate path doesn't contain directory traversal
if (!validatePath(userProvidedPath)) {
  throw new Error('Invalid path: potential directory traversal detected');
}

// Validate against allowed base path
if (!validatePath(userProvidedPath, allowedBasePath)) {
  throw new Error('Path outside allowed directory');
}
```

### Validation Schemas Location

- `src/middleware/validation.ts` - Core validation middleware + common schemas
- `src/validation/librarySchemas.ts` - Library-specific schemas
- `src/validation/movieSchemas.ts` - Movie-specific schemas
- `src/validation/mediaPlayerSchemas.ts` - Media player schemas
- `src/validation/schedulerSchemas.ts` - Scheduler config schemas

---

## 3. Error Handling

### Rules

**✅ DO:**
- Use structured error logging with context
- Preserve error stack traces
- Use appropriate HTTP status codes
- Handle errors at the appropriate layer
- Use circuit breakers for external dependencies

**❌ DON'T:**
- Swallow errors silently
- Use generic error messages without context
- Re-throw without preserving original error
- Use console.log for errors (use logger)

### HTTP Status Codes

| Code | Use Case | Example |
|------|----------|---------|
| 200 | Success | GET requests returning data |
| 201 | Created | POST requests creating resources |
| 204 | No Content | DELETE requests |
| 400 | Bad Request | Validation errors |
| 401 | Unauthorized | Missing/invalid authentication |
| 403 | Forbidden | Authenticated but no permission |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate resource |
| 422 | Unprocessable Entity | Semantic validation errors |
| 429 | Too Many Requests | Rate limiting |
| 500 | Internal Server Error | Unexpected server errors |
| 503 | Service Unavailable | Circuit breaker open |

### Error Handling Patterns

```typescript
// ✅ GOOD: Preserve error context
try {
  await complexOperation(movieId, libraryId);
} catch (error) {
  logger.error('Failed to process movie', {
    movieId,
    libraryId,
    error: error instanceof Error ? {
      message: error.message,
      stack: error.stack,
      name: error.name
    } : String(error)
  });
  throw error; // Re-throw original
}

// ❌ BAD: Lose error context
try {
  await complexOperation(movieId, libraryId);
} catch (error: any) {
  logger.error('Failed to process movie', { error: error.message });
  throw new Error('Failed to process movie'); // Generic message
}
```

### Circuit Breaker Pattern

Implemented in `JobQueueService` for resilience:

```typescript
// Automatically stops processing after 5 consecutive failures
// Resets after 1 minute cooldown
// Individual job retries still work
```

---

## 4. Database Patterns

### Rules

**✅ DO:**
- Use parameterized queries exclusively
- Use transactions for multi-step operations
- Implement connection pooling
- Add health checks for database connections
- Use automatic reconnection with exponential backoff

**❌ DON'T:**
- Use string interpolation in SQL queries
- Perform multiple related operations without transactions
- Trust database connection is always available
- Ignore connection errors

### SQL Injection Prevention

```typescript
// ✅ GOOD: Parameterized query
await db.execute(
  'DELETE FROM job_queue WHERE completed_at < datetime(\'now\', \'-\' || ? || \' days\')',
  [daysOld]
);

// ❌ BAD: String interpolation
await db.execute(
  `DELETE FROM job_queue WHERE completed_at < datetime('now', '-${daysOld} days')`
);
```

### Transaction Usage

```typescript
// ✅ GOOD: Wrap related operations in transaction
await dbManager.transaction(async (conn) => {
  await conn.execute('UPDATE movies SET ...', []);
  await conn.execute('INSERT INTO images ...', []);
  await conn.execute('DELETE FROM cache_inventory ...', []);
  // Automatically commits if all succeed, rolls back on error
});

// ❌ BAD: Multiple operations without transaction
await db.execute('UPDATE movies SET ...', []);
await db.execute('INSERT INTO images ...', []); // Could fail after first succeeds
await db.execute('DELETE FROM cache_inventory ...', []);
```

### Database Connection Management

```typescript
// Health checks run every 30 seconds
dbManager.startHealthCheck(30000);

// Automatic reconnection with exponential backoff
// Attempts: 1s, 2s, 4s, 8s, 16s delays
// Max 5 attempts before giving up

// Safe connection retrieval with auto-reconnect
const connection = await dbManager.getConnectionSafe();
```

---

## 5. Logging

### Rules

**✅ DO:**
- Use structured logging with context
- Use appropriate log levels
- Log all errors with stack traces
- Include request IDs (future enhancement)
- Use logger for ALL production code

**❌ DON'T:**
- Use console.log/error/warn in production code
- Log sensitive data (passwords, API keys)
- Log without context
- Use string concatenation in logs

### Log Levels

| Level | Use Case | Example |
|-------|----------|---------|
| `error` | Errors requiring attention | Database connection failed |
| `warn` | Potential issues | Rate limit approaching |
| `info` | Important events | Server started, user created |
| `debug` | Detailed information | Query execution, cache hits |

### Structured Logging

```typescript
import { logger } from '../middleware/logging.js';

// ✅ GOOD: Structured logging with context
logger.info('Database connected successfully', {
  databaseType: config.type,
  host: config.host,
  port: config.port
});

logger.error('Failed to process job', {
  jobId: job.id,
  jobType: job.type,
  error: error.message,
  stack: error.stack,
  attempts: job.attempts
});

// ❌ BAD: Unstructured logging
console.log('Database connected');
console.error('Failed to process job:', error);
```

---

## 6. Security

### Rules

**✅ DO:**
- Validate all inputs at API boundary
- Use parameterized queries
- Implement rate limiting
- Add security headers (Helmet.js)
- Validate file paths against traversal
- Sanitize user inputs

**❌ DON'T:**
- Trust user input
- Expose internal error details to clients
- Store sensitive data in logs
- Use weak or predictable identifiers

### Rate Limiting

Implemented with memory leak prevention:

```typescript
// Periodic cleanup of stale IPs
// MAX_IPS safety limit (10,000)
// Standard rate limit headers
// X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
```

### Security Headers

```typescript
// Automatically applied via Helmet.js
// Content Security Policy
// X-Content-Type-Options
// X-Frame-Options
// Strict-Transport-Security
```

### Path Traversal Protection

```typescript
import { validatePath } from '../middleware/validation.js';

// Check for dangerous patterns (../, ..\, etc.)
if (!validatePath(filePath)) {
  throw new Error('Invalid path');
}

// Verify resolved path is within allowed directory
if (!validatePath(filePath, allowedBase)) {
  throw new Error('Path outside allowed directory');
}
```

---

## 7. Performance & Scalability

### Rules

**✅ DO:**
- Use connection pooling for databases
- Implement exponential backoff for retries
- Add health checks for external services
- Use circuit breakers for fault tolerance
- Stream large files instead of buffering
- Use adaptive polling for job queue

**❌ DON'T:**
- Poll at constant rate when idle
- Buffer entire files in memory
- Make unlimited retry attempts
- Ignore connection pool limits

### Job Queue Optimization

```typescript
// Circuit Breaker Pattern
// Opens after 5 consecutive failures
// Resets after 1 minute
// Prevents resource exhaustion

// TODO: Implement adaptive polling
// Fast polling when jobs exist
// Slow down when queue is empty
// Exponential backoff on idle
```

### File Operations

```typescript
// ✅ GOOD: Stream large files
const fileStream = fs.createReadStream(sourcePath);
const writeStream = fs.createWriteStream(destPath);
fileStream.pipe(writeStream);

// ❌ BAD: Buffer entire file
const fileContent = await fs.readFile(sourcePath);
await fs.writeFile(destPath, fileContent);
```

---

## 8. Service Layer Patterns

### Rules

**✅ DO:**
- Keep controllers thin (routing + validation only)
- Put business logic in services
- Use dependency injection via constructor
- Return domain models, not database rows
- Use factory functions for complex initialization

**❌ DON'T:**
- Put business logic in controllers
- Create tight coupling between services
- Use singletons unless necessary
- Mix concerns (e.g., database + HTTP in same function)

### Layer Responsibilities

```
┌─────────────────────────────────────────┐
│           Controllers (Thin)             │
│  - Request validation (middleware)       │
│  - Call services                         │
│  - Format HTTP responses                 │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│           Services (Business Logic)      │
│  - Domain logic                          │
│  - Orchestration                         │
│  - Data transformation                   │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│         Database / External APIs         │
│  - Data persistence                      │
│  - Provider integrations                 │
└──────────────────────────────────────────┘
```

### Example Service Structure

```typescript
// ✅ GOOD: Service with dependency injection
export class LibraryService {
  constructor(private dbManager: DatabaseManager) {}

  async getAll(): Promise<Library[]> {
    const rows = await this.dbManager.query<LibraryRow[]>(
      'SELECT * FROM libraries ORDER BY name ASC'
    );
    return rows.map(this.mapRowToLibrary);
  }

  private mapRowToLibrary(row: LibraryRow): Library {
    // Transform database row to domain model
  }
}

// ✅ GOOD: Thin controller
export class LibraryController {
  constructor(private libraryService: LibraryService) {}

  async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const libraries = await this.libraryService.getAll();
      res.json(libraries);
    } catch (error) {
      next(error);
    }
  }
}
```

---

## 9. Testing

### Rules

**✅ DO:**
- Write tests for critical business logic
- Test error handling paths
- Mock external dependencies
- Use test databases (not production)
- Test validation schemas

**❌ DON'T:**
- Test implementation details
- Mock everything (test real integrations when possible)
- Skip error case testing
- Use production data in tests

### Test Structure

```
tests/
├── unit/              # Unit tests for services/utilities
├── integration/       # Integration tests for API endpoints
└── e2e/              # End-to-end tests (future)
```

---

## 10. Code Style

### Rules

**✅ DO:**
- Use ESLint and Prettier
- Follow consistent naming conventions
- Write self-documenting code
- Add JSDoc for public APIs
- Keep functions small and focused
- Use meaningful variable names

**❌ DON'T:**
- Commit commented-out code
- Use magic numbers (define constants)
- Write functions longer than 200 lines
- Use single-letter variable names (except loop counters)

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Classes | PascalCase | `LibraryService` |
| Functions | camelCase | `getLibraryById()` |
| Variables | camelCase | `libraryId` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRIES` |
| Interfaces | PascalCase | `LibraryRow` |
| Types | PascalCase | `MediaLibraryType` |
| Files (modules) | camelCase | `libraryService.ts` |
| Files (types) | kebab-case | `database-models.ts` |

### Function Size

```typescript
// ✅ GOOD: Small, focused functions
async function processLibrary(id: number): Promise<void> {
  const library = await getLibrary(id);
  const files = await scanFiles(library.path);
  await updateDatabase(library, files);
}

// ❌ BAD: Large, multi-responsibility function
async function processLibrary(id: number): Promise<void> {
  // 300+ lines of mixed concerns
}
```

---

## Architectural Decisions

### Why These Patterns?

1. **Type Safety**: Catch errors at compile-time, not runtime
2. **Input Validation**: Security and data integrity at API boundary
3. **Structured Logging**: Production troubleshooting and monitoring
4. **Circuit Breakers**: Fault tolerance and graceful degradation
5. **Connection Health Checks**: Automatic recovery from transient failures
6. **Rate Limiting**: Protect against abuse and resource exhaustion
7. **Transactions**: Data consistency in multi-step operations
8. **Separation of Concerns**: Maintainability and testability

### Trade-offs

- **More Boilerplate**: Validation schemas, types, error handling
- **Worth It Because**: Fewer production bugs, easier debugging, better DX
- **Performance**: Minimal overhead, significant resilience gains
- **Learning Curve**: Initial setup time, pays off in maintenance

---

## Implementation Checklist

When adding new features, ensure:

- [ ] Database row types defined
- [ ] Input validation schemas created
- [ ] Routes use validation middleware
- [ ] SQL queries use parameterized placeholders
- [ ] Complex operations use transactions
- [ ] All console.log replaced with logger
- [ ] Error handling preserves context
- [ ] TypeScript compiles without errors
- [ ] No `any` types (or justified with comment)
- [ ] Tests added for critical paths

---

## Code Review Checklist

When reviewing code, check for:

- [ ] No SQL injection vulnerabilities
- [ ] No path traversal vulnerabilities
- [ ] Proper error handling
- [ ] Structured logging with context
- [ ] Type safety (no unnecessary `any`)
- [ ] Input validation at boundaries
- [ ] Appropriate HTTP status codes
- [ ] Transaction usage where needed
- [ ] Memory leak prevention (intervals, listeners)
- [ ] Security best practices

---

## References

- [PHASE_6_BACKEND_COMPLETION.md](PHASE_6_BACKEND_COMPLETION.md) - Scheduled services
- [ARCHITECTURE.md](ARCHITECTURE.md) - Overall system architecture
- [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) - Database design
- [API_ARCHITECTURE.md](API_ARCHITECTURE.md) - REST API design
- [TESTING.md](TESTING.md) - Testing strategy

---

## Continuous Improvement

These rules are living documentation. Update them when:

- New patterns emerge
- Better solutions are found
- Team consensus changes
- New security threats identified

**Process**: Code review findings → Update docs → Share with team → Implement gradually
