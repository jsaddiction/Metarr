# FetchOrchestrator

A service that coordinates concurrent metadata and asset fetching from multiple providers with intelligent retry logic, timeout handling, and progress tracking.

## Overview

The FetchOrchestrator differs from the existing ProviderOrchestrator in its focus:

- **ProviderOrchestrator**: Handles search, metadata merging strategies, and asset selection
- **FetchOrchestrator**: Handles concurrent fetching, retry logic, error handling, and progress tracking

## Features

### 1. Concurrent Fetching
- Fetches from all enabled providers simultaneously
- Uses `Promise.allSettled` to collect partial results
- Returns data even if some providers fail

### 2. Intelligent Retry Logic
- **Rate Limit Errors (429)**: Automatically retries with exponential backoff
- **Server Errors (5xx)**: Retries with exponential backoff
- **Network Errors**: Retries with exponential backoff
- **Not Found (404)**: No retry - returns null immediately
- **Auth Errors (401/403)**: No retry - indicates configuration issue

### 3. Priority-Based Configuration
- **User Priority**: Fast response (10s timeout, 2 retries)
- **Background Priority**: Thorough fetching (60s timeout, 5 retries)

### 4. Timeout Handling
- Independent timeout for each provider
- Continues with partial results if some providers timeout
- Tracks which providers timed out for retry later

### 5. Progress Tracking
- Optional callbacks for WebSocket integration
- Events: `onProviderStart`, `onProviderComplete`, `onProviderRetry`, `onProviderTimeout`
- Enables real-time UI updates

## API

### Constructor

```typescript
constructor(
  registry: ProviderRegistry,
  configService: ProviderConfigService
)
```

**Dependencies:**
- `registry`: ProviderRegistry instance (singleton)
- `configService`: ProviderConfigService for getting enabled providers

### Main Method

```typescript
async fetchAllProviders(
  media: Movie | Series,
  entityType: EntityType,
  config: FetchConfig
): Promise<ProviderResults>
```

**Parameters:**
- `media`: The movie or series to fetch data for
- `entityType`: 'movie', 'tvshow', or 'music'
- `config`: Fetch configuration object

**Returns:** `ProviderResults` with:
- `providers`: Map of provider name → assets (or null if failed)
- `metadata`: Fetch metadata (timestamps, completed/failed/timeout lists)
- `allFailed`: Boolean indicating complete failure

### Configuration

```typescript
interface FetchConfig {
  priority: 'user' | 'background';
  assetTypes?: AssetType[];
  progressCallback?: ProgressCallback;
}
```

**Priority Settings:**

| Setting | User | Background |
|---------|------|------------|
| Timeout | 10s | 60s |
| Max Retries | 2 | 5 |
| Use Case | Interactive user actions | Automated enrichment |

**Asset Types:**
- Images: `poster`, `fanart`, `backdrop`, `logo`, `clearlogo`, `banner`, `thumb`, `clearart`
- Videos: `trailer`, `teaser`, `clip`

### Progress Callbacks

```typescript
interface ProgressCallback {
  onProviderStart?: (providerName: string) => void;
  onProviderComplete?: (providerName: string, success: boolean) => void;
  onProviderRetry?: (providerName: string, attempt: number, maxRetries: number) => void;
  onProviderTimeout?: (providerName: string) => void;
}
```

## Return Types

### ProviderResults

```typescript
interface ProviderResults {
  providers: {
    [providerName: string]: ProviderAssets | null;
  };
  metadata: {
    fetchedAt: Date;
    completedProviders: string[];
    failedProviders: FailedProvider[];
    timedOutProviders: string[];
  };
  allFailed: boolean;
}
```

### ProviderAssets

```typescript
interface ProviderAssets {
  metadata?: Record<string, any>;
  images?: {
    posters?: AssetCandidate[];
    fanarts?: AssetCandidate[];
    logos?: AssetCandidate[];
    // ... other image types
  };
  videos?: {
    trailers?: AssetCandidate[];
    teasers?: AssetCandidate[];
    clips?: AssetCandidate[];
  };
}
```

### FailedProvider

```typescript
interface FailedProvider {
  name: string;
  error: string;
  retryable: boolean;
}
```

## Error Handling

### Error Types

The orchestrator uses standardized error classes from `src/errors/providerErrors.ts`:

- **RateLimitError**: Provider hit rate limits (retryable)
- **ServerError**: 5xx errors from provider (retryable)
- **NetworkError**: Connection issues (retryable)
- **NotFoundError**: Resource doesn't exist (not retryable)
- **AuthenticationError**: Invalid API key (not retryable)

### Retry Strategy

1. **Check if error is retryable**
2. **Calculate backoff delay**:
   - Rate limit with `Retry-After`: Use provider's value
   - Other errors: Exponential backoff (1s, 2s, 4s, 8s, 16s, 30s max)
   - Add ±20% jitter to prevent thundering herd
3. **Wait and retry**
4. **Emit retry event** (if callback provided)
5. **Continue until max retries** or success

### Timeout Strategy

- Each provider gets independent timeout using `Promise.race`
- Timeout doesn't cancel the request (Node.js limitation)
- Timed-out providers marked separately from failed providers
- Can retry timed-out providers later if needed

## Usage Examples

See `FetchOrchestrator.example.ts` for detailed examples:

1. **Basic Usage**: Simple fetch with results processing
2. **With Progress Callbacks**: Real-time WebSocket updates
3. **Background Fetch**: Long-running enrichment jobs
4. **Partial Failures**: Handling mixed success/failure
5. **Retry Analysis**: Identifying retryable vs permanent failures

## Integration Points

### With WebSocket Service

```typescript
const results = await orchestrator.fetchAllProviders(movie, 'movie', {
  priority: 'user',
  assetTypes: ['poster', 'fanart'],
  progressCallback: {
    onProviderStart: (provider) => {
      websocket.broadcast('provider:start', { movieId: movie.id, provider });
    },
    onProviderComplete: (provider, success) => {
      websocket.broadcast('provider:complete', { movieId: movie.id, provider, success });
    },
    onProviderRetry: (provider, attempt, maxRetries) => {
      websocket.broadcast('provider:retry', { movieId: movie.id, provider, attempt, maxRetries });
    },
    onProviderTimeout: (provider) => {
      websocket.broadcast('provider:timeout', { movieId: movie.id, provider });
    },
  },
});
```

### With AssetSelector

```typescript
// 1. Fetch from all providers
const results = await orchestrator.fetchAllProviders(movie, 'movie', {
  priority: 'user',
  assetTypes: ['poster'],
});

// 2. Combine all posters
const allPosters = [];
for (const assets of Object.values(results.providers)) {
  if (assets?.images?.posters) {
    allPosters.push(...assets.images.posters);
  }
}

// 3. Select best using AssetSelector
const selector = new AssetSelector({ maxAssets: 1, minVotes: 5 });
const bestPosters = await selector.selectBest(allPosters);
```

### With Background Jobs

```typescript
// In enrichment job queue
async function enrichMovie(movieId: number) {
  const movie = await movieService.getById(movieId);

  // Use background priority for thorough fetching
  const results = await orchestrator.fetchAllProviders(movie, 'movie', {
    priority: 'background',
    assetTypes: ['poster', 'fanart', 'logo', 'trailer'],
  });

  // Store results in database
  await assetService.storeProviderResults(movie.id, results);

  // Queue asset downloads
  await downloadQueue.add({ movieId, results });
}
```

## Performance Considerations

### Concurrency
- All providers fetch in parallel (no sequential waiting)
- Faster providers don't wait for slower ones
- Timeout prevents indefinite waiting

### Memory
- Results streamed back as they complete
- No buffering of large asset files (returns URLs, not data)
- Automatic cleanup of completed promises

### Rate Limits
- Each provider has independent rate limiter (in BaseProvider)
- FetchOrchestrator respects these limits
- Retry backoff prevents rate limit amplification

## Testing

The service is designed for easy testing:

```typescript
// Mock progress callbacks
const mockProgress = {
  onProviderStart: jest.fn(),
  onProviderComplete: jest.fn(),
  onProviderRetry: jest.fn(),
  onProviderTimeout: jest.fn(),
};

// Mock providers in registry
const mockProvider = {
  getCapabilities: () => ({ ... }),
  getMetadata: jest.fn(),
  getAssets: jest.fn(),
};

// Test timeout behavior
jest.useFakeTimers();
const promise = orchestrator.fetchAllProviders(movie, 'movie', {
  priority: 'user',
  assetTypes: ['poster'],
});
jest.advanceTimersByTime(10000); // Trigger timeout
await promise;
```

## Future Enhancements

Potential improvements:

1. **Request Cancellation**: Cancel timed-out requests (requires provider support)
2. **Caching**: Cache provider results to reduce API calls
3. **Provider Health**: Skip providers with circuit breaker open
4. **Batch Fetching**: Fetch for multiple movies/episodes at once
5. **Priority Queue**: Prioritize specific providers over others
6. **Fallback Chains**: Try provider B only if provider A fails
7. **Metrics Collection**: Track success rates, average latency per provider

## Related Files

- `BaseProvider.ts`: Base class with rate limiting and circuit breaker
- `ProviderOrchestrator.ts`: Metadata merging and search orchestration
- `AssetSelector.ts`: Quality-based asset selection
- `ProviderRegistry.ts`: Provider registration and instance management
- `src/errors/providerErrors.ts`: Standardized error classes
