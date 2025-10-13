/**
 * Provider Error Classes
 *
 * Custom error types for metadata provider operations.
 * Used by BaseProvider for standardized error handling.
 */

/**
 * Base class for all provider errors
 */
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly providerName: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'ProviderError';
    Object.setPrototypeOf(this, ProviderError.prototype);
  }
}

/**
 * Rate limit exceeded error (HTTP 429)
 * Indicates the provider has throttled our requests
 */
export class RateLimitError extends ProviderError {
  constructor(
    providerName: string,
    public readonly retryAfter?: number, // Seconds to wait before retry
    message?: string
  ) {
    super(
      message || `Rate limit exceeded for provider: ${providerName}`,
      providerName,
      429
    );
    this.name = 'RateLimitError';
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

/**
 * Resource not found error (HTTP 404)
 * Indicates the requested resource doesn't exist at the provider
 */
export class NotFoundError extends ProviderError {
  constructor(
    providerName: string,
    public readonly resourceId: string | number,
    message?: string
  ) {
    super(
      message || `Resource not found at provider ${providerName}: ${resourceId}`,
      providerName,
      404
    );
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * Server error (HTTP 500+)
 * Indicates the provider's API is experiencing issues
 */
export class ServerError extends ProviderError {
  constructor(
    providerName: string,
    statusCode: number,
    message?: string
  ) {
    super(
      message || `Server error from provider ${providerName} (${statusCode})`,
      providerName,
      statusCode
    );
    this.name = 'ServerError';
    Object.setPrototypeOf(this, ServerError.prototype);
  }
}

/**
 * Authentication error (HTTP 401/403)
 * Indicates invalid API key or insufficient permissions
 */
export class AuthenticationError extends ProviderError {
  constructor(
    providerName: string,
    message?: string
  ) {
    super(
      message || `Authentication failed for provider: ${providerName}`,
      providerName,
      401
    );
    this.name = 'AuthenticationError';
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

/**
 * Network error
 * Indicates connectivity issues (timeout, DNS, etc.)
 */
export class NetworkError extends ProviderError {
  constructor(
    providerName: string,
    public readonly originalError: Error,
    message?: string
  ) {
    super(
      message || `Network error connecting to provider ${providerName}: ${originalError.message}`,
      providerName
    );
    this.name = 'NetworkError';
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}
