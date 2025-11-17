/**
 * Error Handling Utilities
 *
 * Type-safe error handling utilities to replace `catch (error)` patterns
 * throughout the codebase. These utilities provide better type safety while
 * maintaining compatibility with unknown error sources.
 */

/**
 * Type guard to check if value is an Error object
 */
export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

/**
 * Type guard to check if error has a message property
 */
export function hasMessage(error: unknown): error is { message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  );
}

/**
 * Type guard to check if error has a code property
 */
export function hasCode(error: unknown): error is { code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  );
}

/**
 * Type guard to check if error has a status property
 */
export function hasStatus(error: unknown): error is { status: number } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status: unknown }).status === 'number'
  );
}

/**
 * Safely extract error message from unknown error
 * Handles Error objects, objects with message, strings, and unknown values
 */
export function getErrorMessage(error: unknown): string {
  if (isError(error)) {
    return error.message;
  }

  if (hasMessage(error)) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  // Fallback for truly unknown errors
  return 'An unknown error occurred';
}

/**
 * Safely extract error stack trace from unknown error
 */
export function getErrorStack(error: unknown): string | undefined {
  if (isError(error)) {
    return error.stack;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'stack' in error &&
    typeof (error as { stack: unknown }).stack === 'string'
  ) {
    return (error as { stack: string }).stack;
  }

  return undefined;
}

/**
 * Safely extract error code from unknown error
 * Common for database, file system, and HTTP errors
 */
export function getErrorCode(error: unknown): string | undefined {
  if (hasCode(error)) {
    return error.code;
  }

  // Check for errno property (Node.js system errors)
  if (
    typeof error === 'object' &&
    error !== null &&
    'errno' in error &&
    typeof (error as { errno: unknown }).errno === 'number'
  ) {
    return String((error as { errno: number }).errno);
  }

  return undefined;
}

/**
 * Safely extract HTTP status code from unknown error
 */
export function getErrorStatus(error: unknown): number | undefined {
  if (hasStatus(error)) {
    return error.status;
  }

  // Check for statusCode property (alternative naming)
  if (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof (error as { statusCode: unknown }).statusCode === 'number'
  ) {
    return (error as { statusCode: number }).statusCode;
  }

  return undefined;
}

/**
 * Create standardized error log context from unknown error
 * Returns structured object suitable for logger calls
 */
export function createErrorLogContext(
  error: unknown,
  additionalContext?: Record<string, unknown>
): {
  message: string;
  stack?: string;
  code?: string;
  status?: number;
  error: unknown;
  [key: string]: unknown;
} {
  const stack = getErrorStack(error);
  const code = getErrorCode(error);
  const status = getErrorStatus(error);

  return {
    message: getErrorMessage(error),
    ...(stack && { stack }),
    ...(code && { code }),
    ...(status && { status }),
    error,
    ...additionalContext,
  };
}

/**
 * Convert unknown error to Error object
 * Useful when you need to throw or return a proper Error
 */
export function toError(error: unknown): Error {
  if (isError(error)) {
    return error;
  }

  if (hasMessage(error)) {
    const err = new Error(error.message);

    // Preserve code if available
    if (hasCode(error)) {
      (err as Error & { code: string }).code = error.code;
    }

    return err;
  }

  if (typeof error === 'string') {
    return new Error(error);
  }

  // Fallback for truly unknown errors
  return new Error('An unknown error occurred');
}

/**
 * Async error wrapper for Promise-based operations
 * Returns [error, undefined] or [undefined, result]
 * Inspired by Go-style error handling
 */
export async function asyncTryCatch<T>(
  promise: Promise<T>
): Promise<[Error, undefined] | [undefined, T]> {
  try {
    const result = await promise;
    return [undefined, result];
  } catch (error) {
    return [toError(error), undefined];
  }
}

/**
 * Check if error is a specific type (by name or constructor)
 */
export function isErrorType(error: unknown, errorType: string | (new (...args: unknown[]) => Error)): boolean {
  if (!isError(error)) {
    return false;
  }

  if (typeof errorType === 'string') {
    return error.name === errorType;
  }

  return error instanceof errorType;
}

/**
 * Database-specific error checking
 */
export function isDatabaseError(error: unknown): boolean {
  const code = getErrorCode(error);
  if (!code) return false;

  // Common database error codes
  const dbErrorCodes = [
    'SQLITE_CONSTRAINT',
    'SQLITE_ERROR',
    'ER_DUP_ENTRY',
    'ER_NO_SUCH_TABLE',
    '23505', // PostgreSQL unique violation
    '23503', // PostgreSQL foreign key violation
  ];

  return dbErrorCodes.some(dbCode => code.includes(dbCode));
}

/**
 * File system error checking
 */
export function isFileSystemError(error: unknown): boolean {
  const code = getErrorCode(error);
  if (!code) return false;

  // Common file system error codes
  const fsErrorCodes = ['ENOENT', 'EACCES', 'EPERM', 'EEXIST', 'EISDIR', 'ENOTDIR'];

  return fsErrorCodes.includes(code);
}

/**
 * HTTP/Network error checking
 */
export function isNetworkError(error: unknown): boolean {
  const code = getErrorCode(error);
  if (!code) return false;

  // Common network error codes
  const networkErrorCodes = [
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'EHOSTUNREACH',
  ];

  return networkErrorCodes.includes(code);
}

/**
 * Check if error has axios-style response property
 */
export function hasAxiosResponse(error: unknown): error is { response: { status: number; data?: unknown } } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof (error as Record<string, unknown>).response === 'object' &&
    (error as Record<string, unknown>).response !== null &&
    'status' in ((error as Record<string, unknown>).response as Record<string, unknown>)
  );
}

/**
 * Check if error is a provider error with status code
 */
export function hasStatusCode(error: unknown): error is { statusCode: number } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof (error as Record<string, unknown>).statusCode === 'number'
  );
}

/**
 * Get HTTP status code from error (supports both axios and custom provider errors)
 */
export function getStatusCode(error: unknown): number | undefined {
  if (hasAxiosResponse(error)) {
    return error.response.status;
  }
  if (hasStatusCode(error)) {
    return error.statusCode;
  }
  return undefined;
}
