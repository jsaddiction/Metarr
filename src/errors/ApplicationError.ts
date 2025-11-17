/**
 * Unified Error Hierarchy for Metarr
 *
 * Provides a consistent, type-safe error system with:
 * - Machine-readable error codes
 * - Rich context metadata
 * - Retry/recovery strategy hints
 * - HTTP status code mapping
 * - Structured logging support
 *
 * @see docs/architecture/ERROR_HANDLING.md for usage guidelines
 */

/**
 * Error codes for machine-readable error classification
 * Format: CATEGORY_SPECIFIC_REASON
 */
export enum ErrorCode {
  // Validation Errors (4xx)
  VALIDATION_INPUT_INVALID = 'VALIDATION_INPUT_INVALID',
  VALIDATION_SCHEMA_MISMATCH = 'VALIDATION_SCHEMA_MISMATCH',
  VALIDATION_REQUIRED_FIELD = 'VALIDATION_REQUIRED_FIELD',

  // Resource Errors (4xx)
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  RESOURCE_ALREADY_EXISTS = 'RESOURCE_ALREADY_EXISTS',
  RESOURCE_EXHAUSTED = 'RESOURCE_EXHAUSTED',

  // Authentication/Authorization (4xx)
  AUTH_AUTHENTICATION_FAILED = 'AUTH_AUTHENTICATION_FAILED',
  AUTH_AUTHORIZATION_DENIED = 'AUTH_AUTHORIZATION_DENIED',
  AUTH_TOKEN_INVALID = 'AUTH_TOKEN_INVALID',
  AUTH_TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED',

  // Database Errors (5xx - operational)
  DATABASE_CONNECTION_FAILED = 'DATABASE_CONNECTION_FAILED',
  DATABASE_QUERY_FAILED = 'DATABASE_QUERY_FAILED',
  DATABASE_DUPLICATE_KEY = 'DATABASE_DUPLICATE_KEY',
  DATABASE_FOREIGN_KEY_VIOLATION = 'DATABASE_FOREIGN_KEY_VIOLATION',
  DATABASE_TRANSACTION_FAILED = 'DATABASE_TRANSACTION_FAILED',

  // File System Errors (5xx - operational)
  FS_FILE_NOT_FOUND = 'FS_FILE_NOT_FOUND',
  FS_PERMISSION_DENIED = 'FS_PERMISSION_DENIED',
  FS_STORAGE_FULL = 'FS_STORAGE_FULL',
  FS_READ_FAILED = 'FS_READ_FAILED',
  FS_WRITE_FAILED = 'FS_WRITE_FAILED',

  // Network Errors (5xx - operational, retryable)
  NETWORK_CONNECTION_FAILED = 'NETWORK_CONNECTION_FAILED',
  NETWORK_TIMEOUT = 'NETWORK_TIMEOUT',
  NETWORK_DNS_FAILED = 'NETWORK_DNS_FAILED',

  // Provider Errors (5xx - operational)
  PROVIDER_RATE_LIMIT = 'PROVIDER_RATE_LIMIT',
  PROVIDER_SERVER_ERROR = 'PROVIDER_SERVER_ERROR',
  PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE',
  PROVIDER_INVALID_RESPONSE = 'PROVIDER_INVALID_RESPONSE',

  // Configuration Errors (5xx - permanent)
  CONFIG_MISSING = 'CONFIG_MISSING',
  CONFIG_INVALID = 'CONFIG_INVALID',

  // System Errors (5xx - permanent)
  SYSTEM_OUT_OF_MEMORY = 'SYSTEM_OUT_OF_MEMORY',
  SYSTEM_PROCESS_FAILED = 'SYSTEM_PROCESS_FAILED',
  SYSTEM_DEPENDENCY_MISSING = 'SYSTEM_DEPENDENCY_MISSING',
  SYSTEM_NOT_IMPLEMENTED = 'SYSTEM_NOT_IMPLEMENTED',
  SYSTEM_INVALID_STATE = 'SYSTEM_INVALID_STATE',

  // Generic fallback
  UNKNOWN = 'UNKNOWN',
}

/**
 * Error context metadata for structured logging and debugging
 */
export interface ErrorContext {
  /** Operation or transaction ID for tracing */
  operationId?: string;

  /** Service/module name that threw the error */
  service?: string;

  /** Specific operation that failed (e.g., 'fetchMetadata', 'writeFile') */
  operation?: string;

  /** Entity type being operated on (e.g., 'movie', 'actor') */
  entityType?: string;

  /** Entity ID if applicable */
  entityId?: string | number;

  /** Duration of operation before failure (ms) */
  durationMs?: number;

  /** Attempt number if retrying */
  attemptNumber?: number;

  /** Additional arbitrary context data */
  metadata?: Record<string, unknown>;
}

/**
 * Base application error class
 * All custom errors in Metarr should extend this class
 */
export abstract class ApplicationError extends Error {
  /**
   * Machine-readable error code
   */
  public readonly code: ErrorCode;

  /**
   * HTTP status code for API responses (0 for non-HTTP errors)
   */
  public readonly statusCode: number;

  /**
   * Whether this error is operational (expected) vs programmer error
   */
  public readonly isOperational: boolean;

  /**
   * Whether this error is retryable
   */
  public readonly retryable: boolean;

  /**
   * Rich context for logging and debugging
   */
  public readonly context: ErrorContext;

  /**
   * Original error that caused this error (if wrapped)
   */
  public readonly cause?: Error;

  /**
   * Timestamp when error was created
   */
  public readonly timestamp: Date;

  constructor(
    message: string,
    code: ErrorCode,
    statusCode: number,
    options: {
      isOperational?: boolean;
      retryable?: boolean;
      context?: ErrorContext;
      cause?: Error;
    } = {}
  ) {
    super(message);

    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = options.isOperational ?? true;
    this.retryable = options.retryable ?? false;
    this.context = options.context ?? {};
    if (options.cause) {
      this.cause = options.cause;
    }
    this.timestamp = new Date();

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);

    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Serialize error for logging
   */
  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      isOperational: this.isOperational,
      retryable: this.retryable,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
      cause: this.cause ? {
        name: this.cause.name,
        message: this.cause.message,
        stack: this.cause.stack,
      } : undefined,
    };
  }
}

// ============================================
// VALIDATION ERRORS (4xx - Client Error)
// ============================================

export class ValidationError extends ApplicationError {
  constructor(message: string, context?: ErrorContext, cause?: Error) {
    super(message, ErrorCode.VALIDATION_INPUT_INVALID, 400, {
      isOperational: true,
      retryable: false,
      ...(context && { context }),
      ...(cause && { cause }),
    });
  }
}

export class InputValidationError extends ValidationError {
  constructor(
    public readonly field: string,
    public readonly value: unknown,
    message?: string,
    context?: ErrorContext
  ) {
    super(
      message || `Invalid input for field '${field}'`,
      { ...context, metadata: { ...context?.metadata, field, value } }
    );
  }
}

export class SchemaValidationError extends ValidationError {
  constructor(
    public readonly errors: Array<{ path: string; message: string }>,
    message?: string,
    context?: ErrorContext
  ) {
    super(
      message || `Schema validation failed: ${errors.length} error(s)`,
      { ...context, metadata: { ...context?.metadata, errors } }
    );
  }
}

// ============================================
// RESOURCE ERRORS (4xx - Client Error)
// ============================================

export class ResourceError extends ApplicationError {
  constructor(
    message: string,
    code: ErrorCode,
    statusCode: number,
    context?: ErrorContext,
    cause?: Error
  ) {
    super(message, code, statusCode, {
      isOperational: true,
      retryable: false,
      ...(context && { context }),
      ...(cause && { cause }),
    });
  }
}

export class ResourceNotFoundError extends ResourceError {
  constructor(
    public readonly resourceType: string,
    public readonly resourceId: string | number,
    message?: string,
    context?: ErrorContext
  ) {
    super(
      message || `${resourceType} not found: ${resourceId}`,
      ErrorCode.RESOURCE_NOT_FOUND,
      404,
      { ...context, entityType: resourceType, entityId: resourceId }
    );
  }
}

export class ResourceAlreadyExistsError extends ResourceError {
  constructor(
    public readonly resourceType: string,
    public readonly resourceId: string | number,
    message?: string,
    context?: ErrorContext
  ) {
    super(
      message || `${resourceType} already exists: ${resourceId}`,
      ErrorCode.RESOURCE_ALREADY_EXISTS,
      409,
      { ...context, entityType: resourceType, entityId: resourceId }
    );
  }
}

export class ResourceExhaustedError extends ResourceError {
  constructor(
    public readonly resourceType: string,
    message?: string,
    context?: ErrorContext
  ) {
    super(
      message || `Resource exhausted: ${resourceType}`,
      ErrorCode.RESOURCE_EXHAUSTED,
      429,
      context
    );
  }
}

// ============================================
// AUTHENTICATION/AUTHORIZATION (4xx)
// ============================================

export class AuthenticationError extends ApplicationError {
  constructor(message: string, context?: ErrorContext, cause?: Error) {
    super(message, ErrorCode.AUTH_AUTHENTICATION_FAILED, 401, {
      isOperational: true,
      retryable: false,
      ...(context && { context }),
      ...(cause && { cause }),
    });
  }
}

export class AuthorizationError extends ApplicationError {
  constructor(
    public readonly action: string,
    message?: string,
    context?: ErrorContext
  ) {
    super(
      message || `Not authorized to perform action: ${action}`,
      ErrorCode.AUTH_AUTHORIZATION_DENIED,
      403,
      {
        isOperational: true,
        retryable: false,
        context: { ...context, operation: action },
      }
    );
  }
}

// ============================================
// OPERATIONAL ERRORS (5xx - Retryable)
// ============================================

export class OperationalError extends ApplicationError {
  constructor(
    message: string,
    code: ErrorCode,
    statusCode: number,
    retryable: boolean,
    context?: ErrorContext,
    cause?: Error
  ) {
    super(message, code, statusCode, {
      isOperational: true,
      retryable,
      ...(context && { context }),
      ...(cause && { cause }),
    });
  }
}

// Database Errors
export class DatabaseError extends OperationalError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.DATABASE_QUERY_FAILED,
    retryable = true,
    context?: ErrorContext,
    cause?: Error
  ) {
    super(message, code, 500, retryable, context, cause);
  }
}

export class DuplicateKeyError extends DatabaseError {
  constructor(
    public readonly table: string,
    public readonly key: string,
    message?: string,
    context?: ErrorContext
  ) {
    super(
      message || `Duplicate key in table '${table}': ${key}`,
      ErrorCode.DATABASE_DUPLICATE_KEY,
      false, // Don't retry duplicate keys
      { ...context, metadata: { ...context?.metadata, table, key } }
    );
  }
}

export class ForeignKeyViolationError extends DatabaseError {
  constructor(
    public readonly table: string,
    public readonly constraint: string,
    message?: string,
    context?: ErrorContext
  ) {
    super(
      message || `Foreign key violation in table '${table}': ${constraint}`,
      ErrorCode.DATABASE_FOREIGN_KEY_VIOLATION,
      false, // Don't retry foreign key violations
      { ...context, metadata: { ...context?.metadata, table, constraint } }
    );
  }
}

// File System Errors
export class FileSystemError extends OperationalError {
  constructor(
    message: string,
    code: ErrorCode,
    public readonly path: string,
    retryable = false,
    context?: ErrorContext,
    cause?: Error
  ) {
    super(
      message,
      code,
      500,
      retryable,
      { ...context, metadata: { ...context?.metadata, path } },
      cause
    );
  }
}

export class FileNotFoundError extends FileSystemError {
  constructor(path: string, message?: string, context?: ErrorContext) {
    super(
      message || `File not found: ${path}`,
      ErrorCode.FS_FILE_NOT_FOUND,
      path,
      false,
      context
    );
  }
}

export class PermissionError extends FileSystemError {
  constructor(
    path: string,
    public readonly operation: string,
    message?: string,
    context?: ErrorContext
  ) {
    super(
      message || `Permission denied for ${operation}: ${path}`,
      ErrorCode.FS_PERMISSION_DENIED,
      path,
      false,
      { ...context, operation }
    );
  }
}

export class StorageError extends FileSystemError {
  constructor(path: string, message?: string, context?: ErrorContext) {
    super(
      message || `Storage full: ${path}`,
      ErrorCode.FS_STORAGE_FULL,
      path,
      false,
      context
    );
  }
}

// Network Errors
export class NetworkError extends OperationalError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.NETWORK_CONNECTION_FAILED,
    public readonly url?: string,
    context?: ErrorContext,
    cause?: Error
  ) {
    super(
      message,
      code,
      503,
      true, // Network errors are retryable
      { ...context, metadata: { ...context?.metadata, url } },
      cause
    );
  }
}

export class TimeoutError extends NetworkError {
  constructor(
    public readonly timeoutMs: number,
    url?: string,
    message?: string,
    context?: ErrorContext
  ) {
    super(
      message || `Operation timed out after ${timeoutMs}ms`,
      ErrorCode.NETWORK_TIMEOUT,
      url,
      { ...context, durationMs: timeoutMs }
    );
  }
}

export class ConnectionError extends NetworkError {
  constructor(url: string, message?: string, context?: ErrorContext, cause?: Error) {
    super(
      message || `Connection failed: ${url}`,
      ErrorCode.NETWORK_CONNECTION_FAILED,
      url,
      context,
      cause
    );
  }
}

// Provider Errors
export class ProviderError extends OperationalError {
  constructor(
    message: string,
    public readonly providerName: string,
    code: ErrorCode,
    statusCode: number,
    retryable: boolean,
    context?: ErrorContext,
    cause?: Error
  ) {
    super(
      message,
      code,
      statusCode,
      retryable,
      { ...context, service: providerName },
      cause
    );
  }
}

export class RateLimitError extends ProviderError {
  constructor(
    providerName: string,
    public readonly retryAfter?: number,
    message?: string,
    context?: ErrorContext
  ) {
    super(
      message || `Rate limit exceeded for provider: ${providerName}`,
      providerName,
      ErrorCode.PROVIDER_RATE_LIMIT,
      429,
      true, // Retryable after delay
      { ...context, metadata: { ...context?.metadata, retryAfter } }
    );
  }
}

export class ProviderServerError extends ProviderError {
  constructor(
    providerName: string,
    public readonly httpStatusCode: number,
    message?: string,
    context?: ErrorContext,
    cause?: Error
  ) {
    super(
      message || `Provider server error (${httpStatusCode}): ${providerName}`,
      providerName,
      ErrorCode.PROVIDER_SERVER_ERROR,
      httpStatusCode,
      httpStatusCode >= 500, // 5xx are retryable, 4xx are not
      { ...context, metadata: { ...context?.metadata, httpStatusCode } },
      cause
    );
  }
}

export class ProviderUnavailableError extends ProviderError {
  constructor(
    providerName: string,
    message?: string,
    context?: ErrorContext,
    cause?: Error
  ) {
    super(
      message || `Provider unavailable: ${providerName}`,
      providerName,
      ErrorCode.PROVIDER_UNAVAILABLE,
      503,
      true, // Retryable
      context,
      cause
    );
  }
}

// ============================================
// PERMANENT ERRORS (5xx - Not Retryable)
// ============================================

export class PermanentError extends ApplicationError {
  constructor(
    message: string,
    code: ErrorCode,
    statusCode: number,
    context?: ErrorContext,
    cause?: Error
  ) {
    super(message, code, statusCode, {
      isOperational: false, // These are programmer errors
      retryable: false,
      ...(context && { context }),
      ...(cause && { cause }),
    });
  }
}

export class ConfigurationError extends PermanentError {
  constructor(
    public readonly configKey: string,
    message?: string,
    context?: ErrorContext
  ) {
    super(
      message || `Configuration error: ${configKey}`,
      ErrorCode.CONFIG_INVALID,
      500,
      { ...context, metadata: { ...context?.metadata, configKey } }
    );
  }
}

export class NotImplementedError extends PermanentError {
  constructor(
    public readonly feature: string,
    message?: string,
    context?: ErrorContext
  ) {
    super(
      message || `Not implemented: ${feature}`,
      ErrorCode.SYSTEM_NOT_IMPLEMENTED,
      501,
      { ...context, metadata: { ...context?.metadata, feature } }
    );
  }
}

export class InvalidStateError extends PermanentError {
  constructor(
    public readonly expectedState: string,
    public readonly actualState: string,
    message?: string,
    context?: ErrorContext
  ) {
    super(
      message || `Invalid state: expected '${expectedState}', got '${actualState}'`,
      ErrorCode.SYSTEM_INVALID_STATE,
      500,
      { ...context, metadata: { ...context?.metadata, expectedState, actualState } }
    );
  }
}

// ============================================
// SYSTEM ERRORS
// ============================================

export class SystemError extends PermanentError {
  constructor(message: string, code: ErrorCode, context?: ErrorContext, cause?: Error) {
    super(message, code, 500, context, cause);
  }
}

export class OutOfMemoryError extends SystemError {
  constructor(message?: string, context?: ErrorContext) {
    super(
      message || 'Out of memory',
      ErrorCode.SYSTEM_OUT_OF_MEMORY,
      context
    );
  }
}

export class ProcessError extends SystemError {
  constructor(
    public readonly processName: string,
    public readonly exitCode: number,
    message?: string,
    context?: ErrorContext,
    cause?: Error
  ) {
    super(
      message || `Process '${processName}' failed with exit code ${exitCode}`,
      ErrorCode.SYSTEM_PROCESS_FAILED,
      { ...context, metadata: { ...context?.metadata, processName, exitCode } },
      cause
    );
  }
}

export class DependencyError extends SystemError {
  constructor(
    public readonly dependency: string,
    message?: string,
    context?: ErrorContext
  ) {
    super(
      message || `Missing or invalid dependency: ${dependency}`,
      ErrorCode.SYSTEM_DEPENDENCY_MISSING,
      { ...context, metadata: { ...context?.metadata, dependency } }
    );
  }
}
