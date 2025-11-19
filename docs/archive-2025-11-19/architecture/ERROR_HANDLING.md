# Error Handling Architecture

**Status**: ✅ Implemented
**Version**: 1.0
**Last Updated**: 2025-11-17

## Overview

Metarr uses a unified error handling system based on a hierarchical error class structure, configurable retry strategies, and circuit breakers. This system provides:

- **Machine-readable error codes** for monitoring and alerting
- **Automatic retry logic** based on error type
- **Rich error context** for debugging
- **Type-safe error handling** throughout the application
- **Consistent patterns** across all services

## Quick Start

### Basic Usage

```typescript
import {
  ResourceNotFoundError,
  DatabaseError,
  withRetry,
} from '../errors/index.js';

// Throw specific error types
async function getMovie(id: number) {
  const movie = await db.query('SELECT * FROM movies WHERE id = ?', [id]);

  if (!movie) {
    throw new ResourceNotFoundError(
      'movie',
      id,
      `Movie ${id} not found`,
      { service: 'MovieService', operation: 'getMovie' }
    );
  }

  return movie;
}

// Automatic retry on database errors
async function saveMovie(movie: Movie) {
  return withDatabaseRetry(async () => {
    await db.execute('INSERT INTO movies ...', [movie]);
  }, 'saveMovie');
}
```

### Error Categories

```typescript
// Validation Errors (4xx - not retryable)
throw new ValidationError('Invalid input');
throw new InputValidationError('email', value, 'Invalid email format');
throw new SchemaValidationError(errors, 'Schema validation failed');

// Resource Errors (4xx - not retryable)
throw new ResourceNotFoundError('movie', movieId);
throw new ResourceAlreadyExistsError('movie', movieId);

// Auth Errors (4xx - not retryable)
throw new AuthenticationError('Invalid API key');
throw new AuthorizationError('read', 'User lacks permission');

// Operational Errors (5xx - retryable)
throw new DatabaseError('Query failed', 'SELECT ...', true);
throw new NetworkError('Connection timeout');
throw new ProviderError('TMDB', ErrorCode.PROVIDER_RATE_LIMIT, 429, true);

// Permanent Errors (5xx - not retryable)
throw new ConfigurationError('TMDB_API_KEY', 'API key not configured');
throw new NotImplementedError('Feature not yet implemented');
```

## Error Hierarchy

```
ApplicationError (abstract base)
├── ValidationError (4xx)
│   ├── InputValidationError
│   └── SchemaValidationError
├── ResourceError (4xx)
│   ├── ResourceNotFoundError
│   ├── ResourceAlreadyExistsError
│   └── ResourceExhaustedError
├── AuthenticationError (401)
├── AuthorizationError (403)
├── OperationalError (5xx - retryable)
│   ├── DatabaseError
│   │   ├── DuplicateKeyError
│   │   └── ForeignKeyViolationError
│   ├── FileSystemError
│   │   ├── FileNotFoundError
│   │   ├── PermissionError
│   │   └── StorageError
│   ├── NetworkError
│   │   ├── TimeoutError
│   │   └── ConnectionError
│   └── ProviderError
│       ├── RateLimitError
│       ├── ProviderServerError
│       └── ProviderUnavailableError
├── PermanentError (5xx - not retryable)
│   ├── ConfigurationError
│   ├── NotImplementedError
│   └── InvalidStateError
└── SystemError (5xx)
    ├── OutOfMemoryError
    ├── ProcessError
    └── DependencyError
```

## Error Codes

All errors include a machine-readable `ErrorCode` enum value:

```typescript
enum ErrorCode {
  // Validation (4xx)
  VALIDATION_INPUT_INVALID = 'VALIDATION_INPUT_INVALID',
  VALIDATION_SCHEMA_MISMATCH = 'VALIDATION_SCHEMA_MISMATCH',

  // Resources (4xx)
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  RESOURCE_ALREADY_EXISTS = 'RESOURCE_ALREADY_EXISTS',
  RESOURCE_EXHAUSTED = 'RESOURCE_EXHAUSTED',

  // Auth (4xx)
  AUTH_AUTHENTICATION_FAILED = 'AUTH_AUTHENTICATION_FAILED',
  AUTH_AUTHORIZATION_FAILED = 'AUTH_AUTHORIZATION_FAILED',

  // Database (5xx)
  DATABASE_QUERY_FAILED = 'DATABASE_QUERY_FAILED',
  DATABASE_CONNECTION_FAILED = 'DATABASE_CONNECTION_FAILED',
  DATABASE_DUPLICATE_KEY = 'DATABASE_DUPLICATE_KEY',
  DATABASE_FOREIGN_KEY_VIOLATION = 'DATABASE_FOREIGN_KEY_VIOLATION',

  // File System (5xx)
  FS_FILE_NOT_FOUND = 'FS_FILE_NOT_FOUND',
  FS_PERMISSION_DENIED = 'FS_PERMISSION_DENIED',
  FS_STORAGE_FULL = 'FS_STORAGE_FULL',

  // Network (5xx)
  NETWORK_CONNECTION_FAILED = 'NETWORK_CONNECTION_FAILED',
  NETWORK_TIMEOUT = 'NETWORK_TIMEOUT',

  // Provider (5xx)
  PROVIDER_RATE_LIMIT = 'PROVIDER_RATE_LIMIT',
  PROVIDER_SERVER_ERROR = 'PROVIDER_SERVER_ERROR',
  PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE',

  // Configuration (5xx)
  CONFIG_MISSING = 'CONFIG_MISSING',
  CONFIG_INVALID = 'CONFIG_INVALID',

  // System (5xx)
  SYSTEM_OUT_OF_MEMORY = 'SYSTEM_OUT_OF_MEMORY',
  SYSTEM_PROCESS_ERROR = 'SYSTEM_PROCESS_ERROR',
  SYSTEM_DEPENDENCY_ERROR = 'SYSTEM_DEPENDENCY_ERROR',
}
```

## Error Context

All errors support rich context for debugging:

```typescript
interface ErrorContext {
  operationId?: string;      // Unique ID for request tracing
  service?: string;          // Service name (e.g., 'TMDBClient')
  operation?: string;        // Operation name (e.g., 'searchMovies')
  entityType?: string;       // Entity type (e.g., 'movie')
  entityId?: string | number; // Entity ID
  durationMs?: number;       // Operation duration
  attemptNumber?: number;    // Retry attempt number
  metadata?: Record<string, unknown>; // Additional context
}

// Example usage
throw new DatabaseError(
  'Failed to insert movie',
  'INSERT INTO movies ...',
  true, // retryable
  {
    service: 'MovieService',
    operation: 'createMovie',
    entityType: 'movie',
    entityId: movieId,
    durationMs: 150,
    metadata: { tmdbId: 12345 },
  }
);
```

## Retry Strategies

### Predefined Policies

```typescript
import {
  withRetry,              // Default: 3 attempts, 1s initial delay
  withNetworkRetry,       // Network: 4 attempts, 2s initial delay
  withDatabaseRetry,      // Database: 3 attempts, 100ms initial delay
} from '../errors/index.js';

// Use predefined policies
await withNetworkRetry(async () => {
  return fetch('https://api.example.com/data');
}, 'fetchData');

await withDatabaseRetry(async () => {
  return db.execute('INSERT INTO ...');
}, 'insertRecord');
```

### Custom Retry Strategy

```typescript
import { RetryStrategy, createRetryStrategy } from '../errors/index.js';

// Create custom strategy
const customRetry = createRetryStrategy({
  maxAttempts: 5,
  initialDelayMs: 500,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterFactor: 0.2,
  onRetry: (error, attemptNumber, delayMs) => {
    logger.warn('Retrying operation', {
      error: error.message,
      attempt: attemptNumber,
      delay: delayMs,
    });
  },
});

// Execute with custom strategy
await customRetry.execute(async () => {
  return expensiveOperation();
}, 'expensiveOperation');
```

### Available Policies

```typescript
// DEFAULT_RETRY_POLICY
{
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
}

// AGGRESSIVE_RETRY_POLICY (critical operations)
{
  maxAttempts: 5,
  initialDelayMs: 500,
  maxDelayMs: 60000,
  backoffMultiplier: 2,
  jitterFactor: 0.2,
}

// CONSERVATIVE_RETRY_POLICY (expensive operations)
{
  maxAttempts: 2,
  initialDelayMs: 2000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
}

// NETWORK_RETRY_POLICY
{
  maxAttempts: 4,
  initialDelayMs: 2000,
  maxDelayMs: 60000,
  backoffMultiplier: 2,
  jitterFactor: 0.3,
  retryableErrorCodes: [
    ErrorCode.NETWORK_CONNECTION_FAILED,
    ErrorCode.NETWORK_TIMEOUT,
    ErrorCode.PROVIDER_RATE_LIMIT,
    ErrorCode.PROVIDER_SERVER_ERROR,
    ErrorCode.PROVIDER_UNAVAILABLE,
  ],
}

// DATABASE_RETRY_POLICY
{
  maxAttempts: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
  retryableErrorCodes: [
    ErrorCode.DATABASE_QUERY_FAILED,
    ErrorCode.DATABASE_CONNECTION_FAILED,
  ],
}
```

## Circuit Breaker

Circuit breakers prevent cascading failures by temporarily stopping requests to failing services:

```typescript
import { CircuitBreaker } from '../services/providers/utils/CircuitBreaker.js';

const circuitBreaker = new CircuitBreaker({
  threshold: 5,                    // Open after 5 consecutive failures
  resetTimeoutMs: 5 * 60 * 1000,  // Try to recover after 5 minutes
  providerName: 'TMDB',           // For error messages
  onOpen: () => {
    logger.error('Circuit breaker opened for TMDB');
  },
  onClose: () => {
    logger.info('Circuit breaker closed for TMDB');
  },
});

// Execute through circuit breaker
const result = await circuitBreaker.execute(async () => {
  return tmdbClient.searchMovies({ query: 'Inception' });
});

// Check circuit state
if (circuitBreaker.isOpen()) {
  logger.warn('Circuit is open, requests will fail fast');
}

// Get statistics
const stats = circuitBreaker.getStats();
// { state: 'open', failureCount: 5, threshold: 5, ... }
```

### Circuit States

1. **CLOSED** (normal operation)
   - All requests pass through
   - Failures increment counter
   - Opens when failures >= threshold

2. **OPEN** (rejecting requests)
   - Immediately throws `ProviderUnavailableError`
   - After `resetTimeoutMs`, transitions to HALF_OPEN

3. **HALF_OPEN** (testing recovery)
   - Allows test requests through
   - 2 successes → CLOSED
   - 1 failure → OPEN

## Complete Example: Provider Integration

Here's how TMDBClient integrates all error handling features:

```typescript
import axios, { AxiosInstance, AxiosError } from 'axios';
import { CircuitBreaker } from '../utils/CircuitBreaker.js';
import {
  AuthenticationError,
  ResourceNotFoundError,
  RateLimitError,
  ProviderServerError,
  NetworkError,
  ErrorCode,
  NETWORK_RETRY_POLICY,
  RetryStrategy,
} from '../../../errors/index.js';

export class TMDBClient {
  private circuitBreaker: CircuitBreaker;
  private retryStrategy: RetryStrategy;

  constructor(options: TMDBClientOptions) {
    // Initialize circuit breaker
    this.circuitBreaker = new CircuitBreaker({
      threshold: 5,
      resetTimeoutMs: 5 * 60 * 1000,
      providerName: 'TMDB',
    });

    // Initialize retry strategy
    this.retryStrategy = new RetryStrategy({
      ...NETWORK_RETRY_POLICY,
      onRetry: (error, attemptNumber, delayMs) => {
        logger.info('Retrying TMDB request', {
          error: error.message,
          attemptNumber,
          delayMs,
        });
      },
    });
  }

  private async request<T>(endpoint: string, config = {}): Promise<T> {
    // Execute through circuit breaker
    return this.circuitBreaker.execute(async () => {
      // Execute through retry strategy
      return this.retryStrategy.execute(async () => {
        // Execute through rate limiter
        return this.rateLimiter.execute(async () => {
          try {
            const response = await this.client.get<T>(endpoint, config);
            return response.data;
          } catch (error) {
            throw this.convertToApplicationError(error, endpoint);
          }
        });
      }, `TMDB ${endpoint}`);
    });
  }

  private convertToApplicationError(error: unknown, endpoint: string): Error {
    const axiosError = error as AxiosError<TMDBError>;
    const context = {
      service: 'TMDBClient',
      operation: 'request',
      metadata: { endpoint },
    };

    if (axiosError.response) {
      const status = axiosError.response.status;
      const message = axiosError.response.data?.status_message || axiosError.message;

      switch (status) {
        case 401:
          return new AuthenticationError(
            `TMDB authentication failed: ${message}`,
            { ...context, metadata: { ...context.metadata, status } },
            axiosError
          );

        case 404:
          return new ResourceNotFoundError(
            'TMDB resource',
            endpoint,
            `Resource not found: ${message}`,
            { ...context, metadata: { ...context.metadata, status } }
          );

        case 429:
          const retryAfter = axiosError.response.headers?.['retry-after'];
          return new RateLimitError(
            'TMDB',
            parseInt(retryAfter as string) || 60,
            `Rate limit exceeded: ${message}`,
            { ...context, metadata: { ...context.metadata, status, retryAfter } }
          );

        case 500:
        case 502:
        case 503:
        case 504:
          return new ProviderServerError(
            'TMDB',
            status,
            `Server error: ${message}`,
            { ...context, metadata: { ...context.metadata, status } },
            axiosError
          );

        default:
          return new ProviderServerError(
            'TMDB',
            status,
            `API error (${status}): ${message}`,
            { ...context, metadata: { ...context.metadata, status } },
            axiosError
          );
      }
    }

    // Network errors
    if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
      return new NetworkError(
        `TMDB request timeout: ${endpoint}`,
        ErrorCode.NETWORK_TIMEOUT,
        endpoint,
        { ...context, metadata: { ...context.metadata, code: axiosError.code } },
        axiosError
      );
    }

    return new NetworkError(
      `TMDB network error: ${axiosError.message}`,
      ErrorCode.NETWORK_CONNECTION_FAILED,
      endpoint,
      { ...context, metadata: { ...context.metadata, code: axiosError.code } },
      axiosError
    );
  }
}
```

## Error Handling Best Practices

### 1. Use Specific Error Types

```typescript
// ❌ Bad - generic error
throw new Error('Movie not found');

// ✅ Good - specific error type
throw new ResourceNotFoundError('movie', movieId);
```

### 2. Add Rich Context

```typescript
// ❌ Bad - no context
throw new DatabaseError('Query failed');

// ✅ Good - rich context
throw new DatabaseError(
  'Failed to insert movie',
  'INSERT INTO movies (title) VALUES (?)',
  true,
  {
    service: 'MovieService',
    operation: 'createMovie',
    entityType: 'movie',
    durationMs: 250,
    metadata: { title: 'Inception' },
  }
);
```

### 3. Preserve Error Chains

```typescript
// ❌ Bad - loses original error
try {
  await externalAPI.call();
} catch (error) {
  throw new NetworkError('API call failed');
}

// ✅ Good - preserves error chain
try {
  await externalAPI.call();
} catch (error) {
  throw new NetworkError(
    'API call failed',
    ErrorCode.NETWORK_CONNECTION_FAILED,
    endpoint,
    { service: 'MyService' },
    error instanceof Error ? error : undefined
  );
}
```

### 4. Use Retry Strategies Appropriately

```typescript
// ❌ Bad - manual retry logic
async function fetchData() {
  let attempts = 0;
  while (attempts < 3) {
    try {
      return await api.getData();
    } catch (error) {
      attempts++;
      await sleep(Math.pow(2, attempts) * 1000);
    }
  }
  throw new Error('Failed after 3 attempts');
}

// ✅ Good - use retry strategy
async function fetchData() {
  return withNetworkRetry(async () => {
    return api.getData();
  }, 'fetchData');
}
```

### 5. Check Retryability

```typescript
// Handle errors based on retryability
try {
  await operation();
} catch (error) {
  if (error instanceof ApplicationError) {
    if (error.retryable) {
      // Queue for retry
      await jobQueue.add({ operation, retryAfter: error.context.metadata?.retryAfter });
    } else {
      // Log and alert - permanent failure
      logger.error('Permanent failure', {
        code: error.code,
        message: error.message,
        context: error.context,
      });
    }
  }
  throw error;
}
```

## Logging Integration

All ApplicationError instances have a `toJSON()` method for structured logging:

```typescript
try {
  await operation();
} catch (error) {
  if (error instanceof ApplicationError) {
    logger.error('Operation failed', error.toJSON());
    // {
    //   name: 'DatabaseError',
    //   message: 'Failed to insert movie',
    //   code: 'DATABASE_QUERY_FAILED',
    //   statusCode: 500,
    //   isOperational: true,
    //   retryable: true,
    //   context: { service: 'MovieService', ... },
    //   timestamp: '2025-11-17T10:30:00.000Z',
    //   stack: '...',
    //   cause: { name: 'Error', message: '...', stack: '...' }
    // }
  }
}
```

## Migration Guide

### Migrating from Legacy Errors

The new error system maintains backward compatibility with legacy errors:

```typescript
// Legacy imports (still work but deprecated)
import { NotFoundError } from '../errors/providerErrors.js'; // ⚠️ Deprecated

// New imports
import { ResourceNotFoundError, FileNotFoundError } from '../errors/index.js'; // ✅ Preferred
```

### Migration Steps

1. **Replace generic Error throws**:
   ```typescript
   // Before
   throw new Error('Not found');

   // After
   throw new ResourceNotFoundError('movie', movieId);
   ```

2. **Add retry strategies**:
   ```typescript
   // Before
   const result = await apiCall();

   // After
   const result = await withNetworkRetry(() => apiCall(), 'apiCall');
   ```

3. **Convert error handling**:
   ```typescript
   // Before
   try {
     await operation();
   } catch (error) {
     logger.error('Error:', error.message);
     throw error;
   }

   // After
   try {
     await operation();
   } catch (error) {
     throw this.convertToApplicationError(error, 'operation');
   }
   ```

4. **Add circuit breakers**:
   ```typescript
   // Add to constructor
   this.circuitBreaker = new CircuitBreaker({
     threshold: 5,
     resetTimeoutMs: 5 * 60 * 1000,
     providerName: 'MyProvider',
   });

   // Wrap calls
   return this.circuitBreaker.execute(() => this.request(endpoint));
   ```

## Testing

### Testing Error Handling

```typescript
import { ResourceNotFoundError, ErrorCode } from '../errors/index.js';

describe('MovieService', () => {
  it('throws ResourceNotFoundError for missing movie', async () => {
    const service = new MovieService(db);

    await expect(service.getMovie(999)).rejects.toThrow(ResourceNotFoundError);
    await expect(service.getMovie(999)).rejects.toMatchObject({
      code: ErrorCode.RESOURCE_NOT_FOUND,
      statusCode: 404,
      retryable: false,
    });
  });
});
```

### Testing Retry Logic

```typescript
it('retries on transient failures', async () => {
  const mockFn = jest.fn()
    .mockRejectedValueOnce(new NetworkError('Timeout'))
    .mockRejectedValueOnce(new NetworkError('Timeout'))
    .mockResolvedValueOnce({ data: 'success' });

  const result = await withNetworkRetry(mockFn, 'test');

  expect(mockFn).toHaveBeenCalledTimes(3);
  expect(result).toEqual({ data: 'success' });
});
```

### Testing Circuit Breakers

```typescript
it('opens circuit after threshold failures', async () => {
  const breaker = new CircuitBreaker({
    threshold: 3,
    resetTimeoutMs: 1000,
    providerName: 'Test',
  });

  const failingFn = () => Promise.reject(new Error('Failure'));

  // Trigger threshold failures
  for (let i = 0; i < 3; i++) {
    await expect(breaker.execute(failingFn)).rejects.toThrow();
  }

  expect(breaker.isOpen()).toBe(true);

  // Should fail fast now
  await expect(breaker.execute(failingFn))
    .rejects.toThrow(ProviderUnavailableError);
});
```

## Monitoring and Alerting

### Error Metrics

Use error codes and context for monitoring:

```typescript
// Increment error counter by code
metrics.increment('errors', {
  code: error.code,
  service: error.context.service,
  retryable: error.retryable.toString(),
});

// Track error rate by service
metrics.gauge('error_rate', errorCount / totalRequests, {
  service: 'TMDBClient',
});

// Alert on circuit breaker state changes
circuitBreaker.onOpen = () => {
  alerts.send({
    severity: 'critical',
    message: 'Circuit breaker opened for TMDB',
    service: 'TMDBClient',
  });
};
```

### Example Alert Rules

```yaml
alerts:
  - name: HighErrorRate
    condition: error_rate > 0.05  # 5% error rate
    for: 5m
    severity: warning

  - name: CriticalProviderDown
    condition: circuit_breaker_state == 'open'
    for: 1m
    severity: critical

  - name: NonRetryableErrors
    condition: rate(errors{retryable="false"}) > 10
    for: 1m
    severity: high
```

## Reference Implementation

See [TMDBClient.ts](../../src/services/providers/tmdb/TMDBClient.ts) for a complete reference implementation showing:

- Circuit breaker integration
- Retry strategy configuration
- Error conversion from Axios to ApplicationError
- Rich error context
- Rate limiting integration

## Further Reading

- [ApplicationError.ts](../../src/errors/ApplicationError.ts) - Complete error hierarchy source
- [RetryStrategy.ts](../../src/errors/RetryStrategy.ts) - Retry policy implementation
- [CircuitBreaker.ts](../../src/services/providers/utils/CircuitBreaker.ts) - Circuit breaker implementation
- [Audit Report](../audits/2025-11-16_audit_report.md) - Error handling remediation details
