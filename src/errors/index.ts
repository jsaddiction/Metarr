/**
 * Unified Error System Export
 *
 * All application errors should be imported from this file.
 * Do not import directly from ApplicationError.ts or legacy files.
 *
 * @see docs/architecture/ERROR_HANDLING.md for usage guidelines
 */

// ============================================
// NEW UNIFIED ERROR SYSTEM
// ============================================

// Core error system
export {
  ApplicationError,
  ErrorCode,
  type ErrorContext,
} from './ApplicationError.js';

// Validation errors (4xx)
export {
  ValidationError,
  InputValidationError,
  SchemaValidationError,
} from './ApplicationError.js';

// Resource errors (4xx)
export {
  ResourceError,
  ResourceNotFoundError,
  ResourceAlreadyExistsError,
  ResourceExhaustedError,
} from './ApplicationError.js';

// Auth errors (4xx)
export {
  AuthenticationError,
  AuthorizationError,
} from './ApplicationError.js';

// Operational errors (5xx - retryable)
export {
  OperationalError,
  DatabaseError,
  DuplicateKeyError,
  ForeignKeyViolationError,
  FileSystemError,
  FileNotFoundError,
  PermissionError,
  StorageError,
  NetworkError,
  TimeoutError,
  ConnectionError,
  ProviderError,
  RateLimitError,
  ProviderServerError,
  ProviderUnavailableError,
} from './ApplicationError.js';

// Permanent errors (5xx - not retryable)
export {
  PermanentError,
  ConfigurationError,
  NotImplementedError,
  InvalidStateError,
} from './ApplicationError.js';

// System errors (5xx)
export {
  SystemError,
  OutOfMemoryError,
  ProcessError,
  DependencyError,
} from './ApplicationError.js';

// Retry strategies
export {
  RetryStrategy,
  DEFAULT_RETRY_POLICY,
  AGGRESSIVE_RETRY_POLICY,
  CONSERVATIVE_RETRY_POLICY,
  NETWORK_RETRY_POLICY,
  DATABASE_RETRY_POLICY,
  createRetryStrategy,
  withRetry,
  withNetworkRetry,
  withDatabaseRetry,
  extractRetryAfter,
} from './RetryStrategy.js';

// Retry strategy types (type-only exports)
export type {
  RetryPolicy,
  RetryResult,
} from './RetryStrategy.js';
