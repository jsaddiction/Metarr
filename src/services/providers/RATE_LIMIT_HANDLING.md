# Rate Limit Handling in BaseProvider

## Overview

The `BaseProvider` class now includes reactive rate limit handling with exponential backoff. This implementation handles 429 (Rate Limit) responses gracefully without pre-emptive throttling.

## How It Works

### Reactive, Not Pre-emptive

- **NO queuing or pre-emptive delays** - requests proceed normally until a 429 is encountered
- **Only reacts to 429 responses** - backoff is applied after rate limit errors
- **Exponential backoff** - increases delay with consecutive rate limits
- **Automatic reset** - successful requests reset the backoff counter

### Backoff Strategy

When a 429 response is received:

1. **1st 429**: 1 second backoff
2. **2nd 429**: 2 seconds backoff
3. **3rd 429**: 4 seconds backoff
4. **4th 429**: 8 seconds backoff
5. **5th+ 429**: 30 seconds backoff (capped)

If the provider sends a `Retry-After` header, that value is used instead of exponential backoff.

### State Tracking

Each provider instance tracks:
- `lastRequestTime`: Timestamp of last request
- `rateLimitBackoffMs`: Current backoff duration in milliseconds
- `consecutiveRateLimits`: Counter for consecutive 429 responses
- Resets to zero on any successful request

## Error Classes

New custom error classes in `src/errors/providerErrors.ts`:

### ProviderError (Base Class)
Base class for all provider-related errors.

### RateLimitError (extends ProviderError)
- Thrown on HTTP 429 responses
- Contains `retryAfter` property (seconds) if available
- Automatically triggers exponential backoff

### NotFoundError (extends ProviderError)
- Thrown on HTTP 404 responses
- Contains `resourceId` property
- Should NOT be retried by callers

### ServerError (extends ProviderError)
- Thrown on HTTP 500+ responses
- Indicates provider API issues
- Callers can retry with backoff

### AuthenticationError (extends ProviderError)
- Thrown on HTTP 401/403 responses
- Indicates invalid API key
- Should NOT be retried

### NetworkError (extends ProviderError)
- Thrown on network/timeout errors
- Contains original error object
- Callers can retry with backoff

## Usage in Concrete Providers

### Pattern 1: Using executeRequest (Recommended)

The `executeRequest` method handles everything automatically:

```typescript
async getMetadata(request: MetadataRequest): Promise<MetadataResponse> {
  return this.executeRequest(
    async () => {
      // Your HTTP request here
      const response = await axios.get(url);
      return this.transformResponse(response.data);
    },
    'getMetadata', // Operation name for logging
    'user' // Priority: 'webhook' | 'user' | 'background'
  );
}
```

### Pattern 2: Using parseHttpError for Custom Error Handling

If you need more control over HTTP requests:

```typescript
async searchMovies(query: string): Promise<SearchResult[]> {
  try {
    const response = await this.httpClient.get('/search', { params: { query } });
    return this.transformResults(response.data);
  } catch (error) {
    // Convert to standardized error
    throw this.parseHttpError(error, query);
  }
}
```

The `parseHttpError` method:
- Parses HTTP status codes into appropriate error classes
- Extracts `Retry-After` headers for 429 responses
- Handles axios and fetch-style errors
- Returns typed error objects for better error handling

## Health Status

The `getHealthStatus()` method now includes backoff information:

```typescript
const health = provider.getHealthStatus();
console.log(health);
// {
//   healthy: true,
//   circuitState: 'closed',
//   failureCount: 0,
//   rateLimitRemaining: 45,
//   rateLimitTotal: 50,
//   rateLimitBackoff: {
//     consecutiveRateLimits: 0,
//     currentBackoffMs: 0,
//     lastRequestTime: '2025-10-11T12:34:56.789Z',
//     isInBackoff: false
//   }
// }
```

## Example: Caller Retry Logic

Callers should handle `RateLimitError` by retrying:

```typescript
async function fetchWithRetry(provider: BaseProvider, movieId: number, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await provider.getMetadata({ id: movieId });
    } catch (error) {
      if (error instanceof RateLimitError) {
        // BaseProvider already waited, just retry
        console.log(`Rate limited, attempt ${attempt + 1}/${maxRetries}`);
        continue;
      }

      if (error instanceof NotFoundError) {
        // Don't retry 404s
        throw error;
      }

      if (error instanceof ServerError && attempt < maxRetries - 1) {
        // Retry server errors with delay
        await delay(1000 * Math.pow(2, attempt));
        continue;
      }

      throw error;
    }
  }

  throw new Error('Max retries exceeded');
}
```

## Migration Guide for Existing Providers

### If you're already handling 429s:

Replace your existing 429 handling with `parseHttpError`:

**Before:**
```typescript
catch (error) {
  if (error.response?.status === 429) {
    await this.delay(5000);
    return this.request(endpoint, config, retriesLeft - 1);
  }
  throw error;
}
```

**After:**
```typescript
catch (error) {
  throw this.parseHttpError(error, resourceId);
}
```

The BaseProvider will handle the backoff automatically.

### If you're using custom error messages:

The new error classes preserve error messages from provider APIs:

```typescript
catch (error) {
  const providerError = this.parseHttpError(error, movieId);
  // providerError.message contains the original API error message
  // providerError.statusCode contains the HTTP status
  // providerError.providerName contains this provider's ID
  throw providerError;
}
```

## Benefits

1. **Consistent behavior**: All providers handle rate limits the same way
2. **Automatic backoff**: No need to implement retry logic in each provider
3. **Respects Retry-After**: Uses provider's suggested retry time
4. **Self-healing**: Automatically resets after successful requests
5. **Observable**: Health status includes backoff state
6. **Type-safe errors**: Strongly typed error classes for better error handling
7. **Non-blocking**: Only affects the specific provider instance

## Testing

The implementation can be tested by:

1. Mocking 429 responses with/without `Retry-After` headers
2. Verifying exponential backoff calculation
3. Checking that successful requests reset the counter
4. Ensuring concurrent requests to different providers don't interfere

See `tests/providers/BaseProvider.test.ts` for examples.
