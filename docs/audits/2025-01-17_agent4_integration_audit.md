# Metarr Integration & External Dependencies Audit Report

**Agent**: 4 - Integration & External Dependencies
**Date**: 2025-01-17
**Duration**: 2.5 hours
**Auditor**: AI Assistant (Claude Sonnet 4.5)
**Scope**: Provider integrations, frontend-backend contracts, external binaries, WebSocket, TanStack Query, configuration management

---

## Executive Summary

**Total Findings**: 18 (Critical: 2, High: 6, Medium: 8, Low: 2)

**Code Health Impact**: -85 points
- Critical (-40): 2 issues
- High (-60): 6 issues
- Medium (-40): 8 issues
- Low (-2): 2 issues

**Top 3 Integration Risks**:
1. **FFprobe Command Injection Vulnerability** - Using `exec()` instead of `execFile()` creates critical security risk
2. **No Provider Fallback Chain Implementation** - ProviderOrchestrator doesn't implement circuit breaker fallbacks despite Agent 3 identifying the pattern
3. **WebSocket Type Mismatch Between Frontend/Backend** - Inconsistent message schemas will cause runtime failures

**External Dependency Health**: 🔴 **Poor** (12 vulnerabilities: 9 High, 3 Moderate)

---

## Context from Prior Agents

**Agent 1 Findings**:
- 169 `any` type usages throughout codebase
- Service instantiation pattern violations
- EnrichmentService at 1817 lines (God object)

**Agent 2 Findings**:
- Job queue race conditions in concurrent operations
- CacheService references non-existent table columns
- Missing transactions for multi-step operations

**Agent 3 Findings**:
- Dual error systems (typed errors vs generic Error)
- Command injection vulnerability in FFprobe (identified but not detailed)
- Missing global error handler for unhandled promise rejections

---

## 1. Provider Integration Integrity

### [CRITICAL] No Circuit Breaker Fallback Chain Implementation

**Location**: `src/services/providers/ProviderOrchestrator.ts:48-96`
**Category**: Provider Integration
**Agent**: Integration & External Dependencies

**Why it matters**:
ProviderOrchestrator implements circuit breakers in BaseProvider but doesn't have a fallback chain when a provider's circuit opens. This means when TMDB's circuit breaker opens (5 failures), enrichment jobs will fail completely instead of falling back to TVDB.

**Current pattern**:
```typescript
// ProviderOrchestrator.ts line 64-77
const results = await Promise.allSettled(
  searchProviders.map(async config => {
    try {
      const provider = await this.registry.createProvider(config);
      return await provider.search(request);
    } catch (error) {
      logger.warn(`Search failed for ${config.providerName}`, {
        error: getErrorMessage(error),
        query: request.query,
      });
      return [];
    }
  })
);
```

**Problem**: When a provider's circuit breaker opens, it throws `ProviderUnavailableError` which gets caught and returns empty array. There's no mechanism to:
1. Check circuit breaker state BEFORE attempting the call
2. Skip providers with open circuits
3. Retry with next-priority provider
4. Emit health status events for UI

**Suggested pattern**:
```typescript
async searchAcrossProviders(request: SearchRequest): Promise<SearchResult[]> {
  const enabledConfigs = await this.getEnabledProviders();
  const searchProviders = enabledConfigs.filter(config => {
    const caps = this.registry.getCapabilities(config.providerName as ProviderId);
    return caps?.search.supported;
  });

  // Sort by priority (higher priority first)
  searchProviders.sort((a, b) => (b.priority || 0) - (a.priority || 0));

  const results: SearchResult[] = [];
  const failedProviders: string[] = [];

  for (const config of searchProviders) {
    try {
      const provider = await this.registry.createProvider(config);

      // Check circuit breaker state before attempting
      if (!provider.isHealthy()) {
        const health = provider.getHealthStatus();
        logger.warn(`Skipping ${config.providerName} - circuit ${health.circuitState}`, {
          failureCount: health.failureCount,
        });
        failedProviders.push(config.providerName);
        continue; // Skip to next provider
      }

      const providerResults = await provider.search(request);
      results.push(...providerResults);

      // If we got results, we can stop (or continue for aggregation)
      if (providerResults.length > 0 && !this.shouldAggregateAll(request)) {
        break;
      }
    } catch (error) {
      logger.warn(`Search failed for ${config.providerName}`, {
        error: getErrorMessage(error),
      });
      failedProviders.push(config.providerName);
      // Continue to next provider in fallback chain
    }
  }

  if (results.length === 0 && failedProviders.length > 0) {
    throw new Error(`All providers failed: ${failedProviders.join(', ')}`);
  }

  return results;
}
```

**Estimated effort**: Large (6-8hr)
- Implement fallback chain logic
- Add circuit breaker state checking
- Create health status broadcasting
- Update job handlers to retry with different providers
- Add integration tests

**Risk if not fixed**: **High**
- Provider outages cause complete enrichment failures
- No graceful degradation when TMDB rate-limited
- Users can't see which providers are unhealthy
- Phase impact: Enrichment, Publishing (no metadata to publish)

---

### [HIGH] No Provider API Version Compatibility Checking

**Location**: `src/services/providers/tmdb/TMDBClient.ts`, `src/services/providers/tvdb/TVDBClient.ts`
**Category**: Provider Integration
**Agent**: Integration & External Dependencies

**Why it matters**:
Provider APIs (TMDB, TVDB) can change their response schemas. Without version checking or schema validation, breaking changes will cause silent failures or corrupted data.

**Current pattern**:
```typescript
// TMDBClient.ts - No version checking
async searchMovies(options: TMDBSearchOptions): Promise<TMDBMovieSearchResponse> {
  const params: any = {
    query: options.query,
    page: options.page || 1,
  };
  if (options.year) params.year = options.year;

  return this.get<TMDBMovieSearchResponse>('/search/movie', params);
}
```

**Problems**:
1. No API version pinning (TMDB has v3 and v4 APIs)
2. No runtime schema validation of responses
3. No deprecation warning handling (TMDB includes deprecation headers)
4. Breaking changes will corrupt database with invalid data

**Suggested pattern**:
```typescript
import { z } from 'zod';

// Define schemas for runtime validation
const TMDBMovieSchema = z.object({
  id: z.number(),
  title: z.string(),
  original_title: z.string().optional(),
  release_date: z.string().optional(),
  overview: z.string().optional(),
  poster_path: z.string().nullable(),
  // ... other fields
});

const TMDBMovieSearchResponseSchema = z.object({
  page: z.number(),
  results: z.array(TMDBMovieSchema),
  total_results: z.number(),
  total_pages: z.number(),
});

class TMDBClient {
  private readonly API_VERSION = 3; // Pin version

  async searchMovies(options: TMDBSearchOptions): Promise<TMDBMovieSearchResponse> {
    const params: any = {
      query: options.query,
      page: options.page || 1,
    };
    if (options.year) params.year = options.year;

    const response = await this.get('/search/movie', params);

    // Validate response schema
    try {
      return TMDBMovieSearchResponseSchema.parse(response);
    } catch (error) {
      logger.error('TMDB API schema mismatch', {
        error: error instanceof Error ? error.message : String(error),
        endpoint: '/search/movie',
      });
      throw new ProviderError(
        'TMDB API returned unexpected format - may need version update',
        'tmdb'
      );
    }
  }

  private async get<T>(endpoint: string, params?: any): Promise<T> {
    const response = await this.rateLimiter.execute(() =>
      axios.get(`${this.baseUrl}${endpoint}`, {
        params,
        headers: { Authorization: `Bearer ${this.apiKey}` },
      })
    );

    // Check for deprecation warnings
    const deprecationHeader = response.headers['deprecation'];
    if (deprecationHeader) {
      logger.warn('TMDB API endpoint deprecated', {
        endpoint,
        deprecationHeader,
        sunsetDate: response.headers['sunset'],
      });
    }

    return response.data;
  }
}
```

**Estimated effort**: Medium (4-6hr per provider)
- Add Zod schemas for each provider's response types
- Implement schema validation in client methods
- Add deprecation header checking
- Create migration guide when schemas change
- Add provider version to database for tracking

**Risk if not fixed**: **High**
- Silent data corruption when provider APIs change
- Difficult to debug when schemas mismatch
- Database filled with malformed metadata
- Phase impact: Enrichment (bad data), Publishing (propagates bad data)

---

### [HIGH] Missing Rate Limiter Health Metrics Exposure

**Location**: `src/services/providers/BaseProvider.ts:145-192`
**Category**: Provider Integration
**Agent**: Integration & External Dependencies

**Why it matters**:
While BaseProvider has `getRateLimiterStats()` and `getHealthStatus()` methods, these aren't exposed via any API endpoint or WebSocket broadcast. Users can't see when providers are rate-limited or unhealthy.

**Current pattern**:
```typescript
// BaseProvider.ts - Methods exist but aren't used
getRateLimiterStats() {
  return this.rateLimiter.getStats();
}

getCircuitBreakerStats() {
  return this.circuitBreaker.getStats();
}

getHealthStatus() {
  const cbStats = this.circuitBreaker.getStats();
  const rlStats = this.rateLimiter.getStats();
  const backoffStats = this.getRateLimitBackoffStats();

  return {
    healthy: !this.circuitBreaker.isOpen() && !backoffStats.isInBackoff,
    circuitState: cbStats.state,
    failureCount: cbStats.failureCount,
    rateLimitRemaining: rlStats.remainingRequests,
    rateLimitTotal: rlStats.maxRequests,
    rateLimitBackoff: backoffStats,
  };
}
```

**Problem**: No controller endpoint or WebSocket message exposes this data to frontend.

**Suggested pattern**:
```typescript
// Add to providerController.ts
router.get('/providers/health', async (req, res) => {
  try {
    const registry = ProviderRegistry.getInstance();
    const configService = new ProviderConfigService(db);
    const configs = await configService.getAll();

    const healthStatuses = await Promise.all(
      configs.map(async (config) => {
        const provider = await registry.createProvider(config);
        const health = provider.getHealthStatus();
        const rateLimiter = provider.getRateLimiterStats();
        const circuitBreaker = provider.getCircuitBreakerStats();

        return {
          providerId: config.providerName,
          enabled: config.enabled,
          health,
          rateLimiter,
          circuitBreaker,
        };
      })
    );

    res.json({ success: true, providers: healthStatuses });
  } catch (error) {
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

// Add WebSocket broadcast when health changes
private handleCircuitBreakerOpen(): void {
  logger.error(`Circuit breaker opened for provider: ${this.capabilities.id}`);

  // Broadcast to all connected clients
  webSocketServer.broadcastToAll({
    type: 'providerHealth',
    timestamp: new Date().toISOString(),
    providerId: this.capabilities.id,
    health: this.getHealthStatus(),
  });
}
```

**Estimated effort**: Medium (3-4hr)
- Add `/api/providers/health` endpoint
- Create WebSocket message type for health updates
- Broadcast on circuit breaker state changes
- Add frontend UI to display provider health
- Add tests for health endpoint

**Risk if not fixed**: **Medium**
- Users can't diagnose why enrichment is slow/failing
- No visibility into rate limit exhaustion
- Can't tell if provider is temporarily down vs permanently broken
- Phase impact: Enrichment (user confusion when jobs fail)

---

### [MEDIUM] Provider Capability Matrix Not Validated at Runtime

**Location**: `src/config/providerMetadata.ts`, `src/services/providers/ProviderRegistry.ts:26-59`
**Category**: Provider Integration
**Agent**: Integration & External Dependencies

**Why it matters**:
Provider capabilities are defined in code but never validated. If a provider claims to support an asset type but doesn't actually implement it, requests will fail at runtime.

**Current pattern**:
```typescript
// ProviderRegistry.ts - Capabilities are registered but not validated
registerProvider(
  providerId: ProviderId,
  providerClass: ProviderConstructor,
  capabilities: ProviderCapabilities
): void {
  this.providerClasses.set(providerId, providerClass);
  this.capabilities.set(providerId, capabilities);
  logger.info(`Registered provider: ${capabilities.name} (${providerId})`);
}
```

**Problem**: No validation that:
1. Provider implements methods it claims to support
2. Supported asset types actually return data
3. Metadata fields are populated

**Suggested pattern**:
```typescript
registerProvider(
  providerId: ProviderId,
  providerClass: ProviderConstructor,
  capabilities: ProviderCapabilities
): void {
  // Validate provider implements claimed capabilities
  const testInstance = new providerClass(
    { providerName: providerId, enabled: true, apiKey: 'test' },
    {}
  );

  // Check search capability
  if (capabilities.search.supported) {
    if (typeof testInstance.search !== 'function') {
      throw new Error(`Provider ${providerId} claims search support but doesn't implement search()`);
    }
  }

  // Check metadata capability
  if (Object.keys(capabilities.supportedMetadataFields).length > 0) {
    if (typeof testInstance.getMetadata !== 'function') {
      throw new Error(`Provider ${providerId} claims metadata support but doesn't implement getMetadata()`);
    }
  }

  // Check asset capability
  if (Object.keys(capabilities.supportedAssetTypes).length > 0) {
    if (typeof testInstance.getAssets !== 'function') {
      throw new Error(`Provider ${providerId} claims asset support but doesn't implement getAssets()`);
    }
  }

  this.providerClasses.set(providerId, providerClass);
  this.capabilities.set(providerId, capabilities);
  logger.info(`Registered provider: ${capabilities.name} (${providerId})`, {
    search: capabilities.search.supported,
    entityTypes: capabilities.supportedEntityTypes,
  });
}
```

**Estimated effort**: Small (1-2hr)
- Add capability validation in registerProvider
- Create provider capability tests
- Document capability contract

**Risk if not fixed**: **Low**
- Runtime errors when requesting unsupported operations
- Misleading UI showing unavailable features
- Phase impact: Enrichment (job failures)

---

### [LOW] No Stale Provider Data Detection

**Location**: `src/services/providers/ProviderCacheManager.ts` (if exists, not found)
**Category**: Provider Integration
**Agent**: Integration & External Dependencies

**Why it matters**:
Once metadata is cached from a provider, there's no mechanism to detect when that data becomes stale (e.g., TMDB updates a movie's poster).

**Current pattern**:
Not implemented - metadata is fetched once and never refreshed unless user manually triggers re-enrichment.

**Suggested pattern**:
```typescript
// Add to provider_metadata table
ALTER TABLE provider_metadata ADD COLUMN fetched_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE provider_metadata ADD COLUMN last_checked INTEGER;
ALTER TABLE provider_metadata ADD COLUMN stale_after_days INTEGER DEFAULT 90;

// Add refresh detection
async function shouldRefreshMetadata(
  providerId: string,
  entityId: number,
  entityType: string
): Promise<boolean> {
  const metadata = await db.get(
    'SELECT fetched_at, stale_after_days FROM provider_metadata WHERE provider_id = ? AND entity_type = ? AND entity_id = ?',
    [providerId, entityType, entityId]
  );

  if (!metadata) return true; // Never fetched

  const daysSinceFetch = (Date.now() - metadata.fetched_at) / (1000 * 60 * 60 * 24);
  return daysSinceFetch > (metadata.stale_after_days || 90);
}
```

**Estimated effort**: Medium (3-4hr)
- Add timestamp columns to provider tables
- Implement stale detection logic
- Add scheduled job to refresh stale metadata
- Add UI indicator for stale data

**Risk if not fixed**: **Low**
- Metadata becomes outdated over time
- No way to detect provider data updates
- Phase impact: Enrichment (manual refresh required)

---

## 2. Frontend-Backend API Contracts

### [HIGH] WebSocket Message Type Mismatch

**Location**: `src/types/websocket.ts` vs `public/frontend/src/types/websocket.ts`
**Category**: API Contract
**Agent**: Integration & External Dependencies

**Why it matters**:
Frontend and backend WebSocket message types are inconsistent. The backend defines message types that the frontend doesn't handle, and vice versa. This will cause runtime failures when messages are sent.

**Current pattern - Backend types**:
```typescript
// src/types/websocket.ts:233-290
export interface ProviderScrapeStartMessage extends BaseServerMessage {
  type: 'providerScrapeStart';
  movieId: number;
  providers: string[];
}
// ... 8 more provider scrape message types
```

**Current pattern - Frontend types**:
```typescript
// public/frontend/src/types/websocket.ts:180-190
export type ServerMessage =
  | PongMessage
  | ResyncDataMessage
  | PlayerStatusMessage
  | ScanStatusMessage
  | MoviesChangedMessage
  | LibraryChangedMessage
  | AckMessage
  | ConflictMessage
  | ErrorMessage
  | WelcomeMessage;
// Missing: All provider scrape messages, JobStatusMessage, JobQueueStatsMessage, PlayerActivityMessage
```

**Impact**:
1. Frontend can't handle provider scrape progress messages
2. Job status updates won't be displayed
3. Player activity state changes won't update UI
4. TypeScript won't catch these mismatches

**Suggested pattern**:
```typescript
// Create SINGLE source of truth for message types
// src/types/websocket.ts (keep as is)

// public/frontend/src/types/websocket.ts (make it re-export backend types)
/**
 * WebSocket Message Types (Frontend)
 *
 * IMPORTANT: These MUST match backend types exactly.
 * Types are duplicated here because frontend can't import from backend.
 *
 * When adding new message types:
 * 1. Add to src/types/websocket.ts (backend)
 * 2. Copy to this file (frontend)
 * 3. Update ResilientWebSocket message handlers
 * 4. Add WebSocket hook in useWebSocket context
 */

// Add missing types
export interface ProviderScrapeStartMessage extends BaseServerMessage {
  type: 'providerScrapeStart';
  movieId: number;
  providers: string[];
}

export interface JobStatusMessage extends BaseServerMessage {
  type: 'jobStatus';
  jobId: number;
  jobType: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'retrying';
  progress?: {
    current: number;
    total: number;
    message?: string;
  };
  error?: string;
  payload?: unknown;
}

export interface PlayerActivityMessage extends BaseServerMessage {
  type: 'player:activity';
  payload: PlayerActivityState;
}

export type ServerMessage =
  | PongMessage
  | ResyncDataMessage
  | PlayerStatusMessage
  | PlayerActivityMessage // ADDED
  | ScanStatusMessage
  | MoviesChangedMessage
  | LibraryChangedMessage
  | AckMessage
  | ConflictMessage
  | ErrorMessage
  | WelcomeMessage
  | ProviderScrapeStartMessage // ADDED
  | ProviderScrapeProviderStartMessage // ADDED
  | ProviderScrapeProviderCompleteMessage // ADDED
  | ProviderScrapeProviderRetryMessage // ADDED
  | ProviderScrapeProviderTimeoutMessage // ADDED
  | ProviderScrapeCompleteMessage // ADDED
  | ProviderScrapeErrorMessage // ADDED
  | JobStatusMessage // ADDED
  | JobQueueStatsMessage; // ADDED
```

**Estimated effort**: Medium (2-3hr)
- Sync all message types between frontend/backend
- Add validation tests to ensure types match
- Update ResilientWebSocket to handle all message types
- Add frontend hooks for new messages
- Document message contract

**Risk if not fixed**: **High**
- Silent failures when WebSocket messages sent
- Missing UI updates for critical events
- Type safety illusion (TypeScript won't catch mismatches)
- Phase impact: All phases (no real-time updates visible)

---

### [HIGH] No Response Shape Validation for REST APIs

**Location**: `public/frontend/src/utils/api.ts`
**Category**: API Contract
**Agent**: Integration & External Dependencies

**Why it matters**:
Frontend API client assumes backend returns correctly-shaped data but doesn't validate. If backend changes response format, frontend will fail at runtime with cryptic errors.

**Current pattern**:
```typescript
// api.ts:73-102
async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new ApiError(response.status, error.error || response.statusText);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return await response.json(); // NO VALIDATION
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new Error(`Network error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
```

**Problem**:
1. No runtime validation of response shape
2. TypeScript types are promises, not guarantees
3. If backend returns `null` where frontend expects object, app crashes
4. No detection of API contract violations

**Suggested pattern**:
```typescript
import { z } from 'zod';

// Define schemas for all API responses
const MovieDetailSchema = z.object({
  id: z.number(),
  title: z.string(),
  year: z.number().nullable(),
  monitored: z.boolean(),
  // ... all fields
});

const MovieListResultSchema = z.object({
  movies: z.array(MovieDetailSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit,
  schema?: z.ZodSchema<T>
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new ApiError(response.status, error.error || response.statusText);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const data = await response.json();

    // Validate response if schema provided
    if (schema) {
      try {
        return schema.parse(data);
      } catch (validationError) {
        console.error('API response validation failed:', {
          endpoint,
          error: validationError instanceof Error ? validationError.message : String(validationError),
          data,
        });
        throw new Error(`API returned invalid data for ${endpoint}`);
      }
    }

    return data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new Error(`Network error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Usage
export const movieApi = {
  async getAll(filters?: { status?: string; limit?: number; offset?: number }): Promise<MovieListResult> {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.limit) params.append('limit', filters.limit.toString());
    if (filters?.offset) params.append('offset', filters.offset.toString());

    const endpoint = params.toString() ? `/movies?${params}` : '/movies';
    return fetchApi<MovieListResult>(endpoint, undefined, MovieListResultSchema);
  },
};
```

**Estimated effort**: Large (8-10hr)
- Define Zod schemas for all API responses
- Update fetchApi to support optional validation
- Add validation to all API methods
- Create shared schema types between frontend/backend
- Add tests for schema validation

**Risk if not fixed**: **High**
- Runtime crashes when API contract violated
- Difficult to debug null/undefined errors
- No early detection of backend changes
- Phase impact: All phases (UI crashes on bad data)

---

### [MEDIUM] Inconsistent Null Handling Between Frontend and Backend

**Location**: `src/types/database.ts` vs `public/frontend/src/types/movie.ts`
**Category**: API Contract
**Agent**: Integration & External Dependencies

**Why it matters**:
Backend database types use `| null` while frontend types use `?` (optional). This creates mismatches where backend sends `null` but frontend expects `undefined` or vice versa.

**Current pattern - Backend**:
```typescript
// src/types/database.ts
export interface Movie {
  id: number;
  title: string;
  year: number | null; // nullable in database
  tmdb_id: number | null;
  imdb_id: string | null;
  // ...
}
```

**Current pattern - Frontend**:
```typescript
// public/frontend/src/types/movie.ts
export interface MovieListItem {
  id: number;
  title: string;
  year?: number; // optional in TypeScript
  tmdbId?: number;
  imdbId?: string;
  // ...
}
```

**Problem**:
1. `null` !== `undefined` in JavaScript
2. `if (movie.year)` fails when year is `null` (backend) vs when year is `undefined` (frontend expects)
3. JSON serialization converts `undefined` to omission but keeps `null`
4. TypeScript doesn't catch this mismatch

**Suggested pattern**:
```typescript
// Backend controller should normalize null to undefined
function serializeMovie(dbMovie: Movie): MovieListItem {
  return {
    id: dbMovie.id,
    title: dbMovie.title,
    year: dbMovie.year ?? undefined, // Convert null to undefined
    tmdbId: dbMovie.tmdb_id ?? undefined,
    imdbId: dbMovie.imdb_id ?? undefined,
    // ...
  };
}

// OR: Frontend should handle null consistently
export interface MovieListItem {
  id: number;
  title: string;
  year: number | null; // Match backend exactly
  tmdbId: number | null;
  imdbId: string | null;
  // ...
}

// And use nullish coalescing everywhere
<Text>{movie.year ?? 'Unknown'}</Text>
```

**Estimated effort**: Medium (4-6hr)
- Standardize on `| null` or `| undefined` (choose one)
- Update all frontend types to match backend
- Add serialization layer in controllers
- Find and fix all `if (value)` checks to use `?? `
- Add linting rule to enforce consistency

**Risk if not fixed**: **Medium**
- Subtle bugs in conditional rendering
- Missing data displayed as "Unknown" when it exists as null
- TypeScript gives false sense of type safety
- Phase impact: All phases (UI display issues)

---

### [MEDIUM] Missing API Versioning Strategy

**Location**: `src/routes/*.ts` (all route files)
**Category**: API Contract
**Agent**: Integration & External Dependencies

**Why it matters**:
No API versioning means breaking changes to endpoints will break frontend. Need version strategy before expanding API.

**Current pattern**:
```typescript
// No versioning
router.get('/api/movies', ...);
router.get('/api/providers', ...);
```

**Suggested pattern**:
```typescript
// Option 1: URL versioning (recommended for public APIs)
router.get('/api/v1/movies', ...);
router.get('/api/v2/movies', ...); // Breaking change

// Option 2: Header versioning (cleaner URLs)
const versionMiddleware = (req, res, next) => {
  const version = req.headers['api-version'] || 'v1';
  req.apiVersion = version;
  next();
};

router.get('/api/movies', versionMiddleware, (req, res) => {
  if (req.apiVersion === 'v2') {
    return handleV2Movies(req, res);
  }
  return handleV1Movies(req, res);
});
```

**Estimated effort**: Medium (3-4hr)
- Choose versioning strategy (URL vs header)
- Add version prefix to all routes
- Create deprecation strategy
- Document version policy

**Risk if not fixed**: **Low**
- Can't introduce breaking changes without breaking frontend
- No migration path for API updates
- Phase impact: None currently (but blocks future API evolution)

---

## 3. External Binary Dependencies

### [CRITICAL] FFprobe Command Injection Vulnerability

**Location**: `src/services/media/ffprobeService.ts:117`
**Category**: Security
**Agent**: Integration & External Dependencies

**Why it matters**:
Using `exec()` with unescaped file paths creates a command injection vulnerability. Agent 3 identified this but didn't detail the severity. An attacker can execute arbitrary commands by uploading a video file with a malicious filename.

**Current pattern**:
```typescript
// ffprobeService.ts:117
const command = `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`;

const { stdout } = await execPromise(command);
```

**Vulnerability**:
```javascript
// Attacker uploads file with name: movie"; rm -rf /; echo ".mkv
// Generated command becomes:
// ffprobe -v quiet -print_format json -show_format -show_streams "movie"; rm -rf /; echo ".mkv"
// This executes rm -rf / on the server
```

**Suggested pattern**:
```typescript
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFilePromise = promisify(execFile);

export async function extractMediaInfo(filePath: string): Promise<MediaInfo> {
  try {
    const startTime = Date.now();

    // Use execFile instead of exec - prevents shell injection
    const { stdout } = await execFilePromise('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath // Passed as argument, not interpolated into command string
    ]);

    const data = JSON.parse(stdout);
    // ... rest of function
  } catch (error) {
    // Handle errors
  }
}
```

**Additional hardening**:
```typescript
import path from 'path';

// Validate file path before processing
function validateFilePath(filePath: string): void {
  // Prevent path traversal
  const normalized = path.normalize(filePath);
  if (normalized.includes('..')) {
    throw new ValidationError('Invalid file path: path traversal detected');
  }

  // Ensure file is in allowed directory
  if (!normalized.startsWith(LIBRARY_PATH)) {
    throw new ValidationError('Invalid file path: outside library directory');
  }

  // Check file extension
  const ext = path.extname(normalized).toLowerCase();
  const allowedExts = ['.mkv', '.mp4', '.avi', '.mov', '.m4v'];
  if (!allowedExts.includes(ext)) {
    throw new ValidationError(`Invalid file extension: ${ext}`);
  }
}
```

**Estimated effort**: Small (<1hr)
- Replace `exec()` with `execFile()`
- Add file path validation
- Test with various filenames
- Add security tests

**Risk if not fixed**: **Critical**
- Remote code execution vulnerability
- Full server compromise possible
- Data loss, data theft, malware installation
- Phase impact: Scanning (exploit during scan), Enrichment (triggered during stream analysis)

---

### [HIGH] No FFprobe Availability Check at Startup

**Location**: `src/index.ts` (main application startup)
**Category**: External Dependency
**Agent**: Integration & External Dependencies

**Why it matters**:
Application starts successfully even if ffprobe is not installed. Jobs will fail at runtime when scan attempts to analyze video streams, with no early warning to user.

**Current pattern**:
No startup check exists. Application assumes ffprobe is available.

**Suggested pattern**:
```typescript
// src/utils/binaryCheck.ts
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFilePromise = promisify(execFile);

export interface BinaryCheck {
  available: boolean;
  version?: string;
  error?: string;
}

export async function checkFFprobe(): Promise<BinaryCheck> {
  try {
    const { stdout } = await execFilePromise('ffprobe', ['-version']);
    const versionMatch = stdout.match(/ffprobe version (\S+)/);
    return {
      available: true,
      version: versionMatch?.[1] || 'unknown',
    };
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function checkSharp(): Promise<BinaryCheck> {
  try {
    const sharp = await import('sharp');
    const sharpInstance = sharp();
    const metadata = await sharpInstance.metadata();
    return {
      available: true,
      version: sharp.default?.versions?.sharp || 'unknown',
    };
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// src/index.ts
import { checkFFprobe, checkSharp } from './utils/binaryCheck.js';

async function startServer() {
  logger.info('Metarr starting...');

  // Check binary dependencies
  const ffprobeCheck = await checkFFprobe();
  if (!ffprobeCheck.available) {
    logger.error('FFprobe not found - video stream analysis will fail', {
      error: ffprobeCheck.error,
    });
    // Decide: warn and continue, or fail startup?
    // Recommend: warn and continue (graceful degradation)
  } else {
    logger.info('FFprobe available', { version: ffprobeCheck.version });
  }

  const sharpCheck = await checkSharp();
  if (!sharpCheck.available) {
    logger.error('Sharp not available - image processing will fail', {
      error: sharpCheck.error,
    });
  } else {
    logger.info('Sharp available', { version: sharpCheck.version });
  }

  // Continue startup...
}
```

**Estimated effort**: Small (1-2hr)
- Create binary check utility
- Add checks to startup sequence
- Log availability status
- Add health check endpoint
- Document installation requirements

**Risk if not fixed**: **Medium**
- Jobs fail with cryptic errors
- User doesn't know ffprobe is missing
- Support burden (common setup issue)
- Phase impact: Scanning (stream analysis silently fails)

---

### [MEDIUM] Sharp Image Processing Errors Not Gracefully Handled

**Location**: `src/utils/ImageProcessor.ts:149-200`
**Category**: External Dependency
**Agent**: Integration & External Dependencies

**Why it matters**:
Sharp can fail on corrupted images or unsupported formats. Current error handling throws `FileSystemError` which crashes the job. Should gracefully skip corrupted images.

**Current pattern**:
```typescript
// ImageProcessor.ts:191-200
catch (error) {
  throw new FileSystemError(
    `Failed to analyze image: ${getErrorMessage(error)}`,
    ErrorCode.FS_READ_FAILED,
    imagePath,
    true, // Image processing can be retried
    { service: 'ImageProcessor', operation: 'analyzeImage', metadata: { imagePath } },
    error instanceof Error ? error : undefined
  );
}
```

**Problem**:
1. Retrying corrupted images won't help
2. One bad image crashes entire enrichment job
3. No way to mark image as "unprocessable"

**Suggested pattern**:
```typescript
async analyzeImage(imagePath: string): Promise<ImageAnalysis | null> {
  try {
    const metadata = await sharp(imagePath).metadata();

    // ... processing
  } catch (error) {
    // Check if error is recoverable
    const errorMsg = getErrorMessage(error);

    if (errorMsg.includes('Input buffer contains unsupported image format') ||
        errorMsg.includes('Input file is missing') ||
        errorMsg.includes('VipsJpeg: Corrupt JPEG data')) {
      // Unrecoverable - log and return null
      logger.warn('Image is corrupted or unsupported format', {
        imagePath: path.basename(imagePath),
        error: errorMsg,
      });
      return null;
    }

    // Other errors might be transient (permissions, disk full)
    throw new FileSystemError(
      `Failed to analyze image: ${errorMsg}`,
      ErrorCode.FS_READ_FAILED,
      imagePath,
      true,
      { service: 'ImageProcessor', operation: 'analyzeImage', metadata: { imagePath } },
      error instanceof Error ? error : undefined
    );
  }
}

// Caller handles null
const analysis = await imageProcessor.analyzeImage(imagePath);
if (!analysis) {
  logger.warn('Skipping corrupted image', { imagePath });
  continue; // Skip to next image
}
```

**Estimated effort**: Small (2-3hr)
- Categorize Sharp errors (corrupted vs transient)
- Return null for unrecoverable errors
- Update callers to handle null
- Add tests for error scenarios

**Risk if not fixed**: **Medium**
- Enrichment jobs fail on single corrupted image
- No way to skip bad images
- Phase impact: Enrichment (job failures), Publishing (can't publish without analysis)

---

### [MEDIUM] No Binary Path Configuration

**Location**: `src/services/media/ffprobeService.ts`, `src/utils/ImageProcessor.ts`
**Category**: External Dependency
**Agent**: Integration & External Dependencies

**Why it matters**:
Binaries are executed by name ('ffprobe', 'sharp') assuming they're in PATH. In Docker or custom installations, binaries might be in non-standard locations.

**Current pattern**:
```typescript
// Hardcoded binary name
await execFilePromise('ffprobe', [...args]);
```

**Suggested pattern**:
```typescript
// src/config/defaults.ts
export const DEFAULT_CONFIG = {
  binaries: {
    ffprobe: process.env.FFPROBE_PATH || 'ffprobe',
    ffmpeg: process.env.FFMPEG_PATH || 'ffmpeg',
  },
};

// ffprobeService.ts
const ffprobePath = config.binaries.ffprobe;
await execFilePromise(ffprobePath, [...args]);
```

**Estimated effort**: Small (1-2hr)
- Add binary path configuration
- Update all binary executions
- Document environment variables

**Risk if not fixed**: **Low**
- Docker users need binaries in PATH
- Custom installations require symlinks
- Phase impact: Scanning (if ffprobe not in PATH)

---

## 4. WebSocket Reliability

### [HIGH] No WebSocket Fallback to Polling

**Location**: `public/frontend/src/services/ResilientWebSocket.ts`
**Category**: WebSocket
**Agent**: Integration & External Dependencies

**Why it matters**:
Audit workflow asks: "Does fallback to polling work?" Current implementation has reconnection logic but no polling fallback. If WebSocket repeatedly fails (firewall, proxy), UI gets no updates.

**Current pattern**:
```typescript
// ResilientWebSocket.ts:202-213
private scheduleReconnect(): void {
  this.clearReconnectTimer();

  const delay = 3000; // Fixed 3-second interval

  console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);

  this.reconnectTimer = setTimeout(() => {
    this.reconnectAttempts++;
    this.connect();
  }, delay);
}
```

**Problem**:
1. Reconnects forever with 3-second interval
2. No detection of persistent connection failure
3. No fallback mechanism after N failed attempts
4. User sees stale data if WebSocket never connects

**Suggested pattern**:
```typescript
export class ResilientWebSocket {
  private ws: WebSocket | null = null;
  private config: Required<WebSocketConfig>;
  private state: ConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5; // NEW
  private pollingTimer: NodeJS.Timeout | null = null; // NEW
  private isPollingMode = false; // NEW

  private scheduleReconnect(): void {
    this.clearReconnectTimer();

    // After 5 failures, switch to polling mode
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('[WebSocket] Max reconnect attempts reached, falling back to polling');
      this.enablePollingMode();
      return;
    }

    const delay = 3000;
    console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  private enablePollingMode(): void {
    this.isPollingMode = true;
    this.setState('disconnected'); // Show disconnected state in UI

    // Poll for updates every 10 seconds
    this.pollingTimer = setInterval(async () => {
      try {
        // Fetch latest data via REST API
        const response = await fetch('/api/sync-state');
        const data = await response.json();

        // Emit as WebSocket message
        this.handleMessage({
          type: 'resyncData',
          timestamp: new Date().toISOString(),
          scope: 'all',
          data,
        });

        // Periodically try to reconnect WebSocket
        if (this.reconnectAttempts % 5 === 0) {
          console.log('[WebSocket] Attempting to reconnect from polling mode');
          this.reconnectAttempts = 0;
          this.disablePollingMode();
          this.connect();
        }
      } catch (error) {
        console.error('[WebSocket] Polling failed:', error);
      }
    }, 10000);

    console.log('[WebSocket] Polling mode enabled (10s interval)');
  }

  private disablePollingMode(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
    this.isPollingMode = false;
  }

  public disconnect(): void {
    this.isIntentionallyClosed = true;
    this.stopPingInterval();
    this.clearReconnectTimer();
    this.disablePollingMode(); // NEW

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.setState('disconnected');
  }
}
```

**Estimated effort**: Medium (4-5hr)
- Implement polling fallback mode
- Add `/api/sync-state` endpoint
- Test with WebSocket blocked
- Add UI indicator for polling mode
- Document polling behavior

**Risk if not fixed**: **High**
- Users behind restrictive firewalls see no updates
- No fallback when WebSocket repeatedly fails
- UI appears broken with stale data
- Phase impact: All phases (no real-time updates)

---

### [MEDIUM] WebSocket Reconnection Doesn't Handle Missed Messages

**Location**: `public/frontend/src/services/ResilientWebSocket.ts:257-270`
**Category**: WebSocket
**Agent**: Integration & External Dependencies

**Why it matters**:
When WebSocket reconnects after disconnection, any messages sent during downtime are lost. Need to request resync on reconnection.

**Current pattern**:
```typescript
// ResilientWebSocket.ts:51-57
this.ws.onopen = () => {
  console.log('[WebSocket] Connected');
  this.reconnectAttempts = 0;
  this.setState('connected');
  this.startPingInterval();
  this.flushMessageQueue(); // Only sends queued outgoing messages
};
```

**Problem**:
1. Doesn't request resync of server state
2. Client may have missed important updates (movie added, scan completed)
3. UI shows stale data until next server event

**Suggested pattern**:
```typescript
this.ws.onopen = () => {
  console.log('[WebSocket] Connected');
  this.reconnectAttempts = 0;
  this.setState('connected');
  this.startPingInterval();

  // Request full state resync if we were disconnected
  if (this.wasDisconnected) {
    this.send({
      type: 'resync',
      scope: 'all',
    });
    this.wasDisconnected = false;
  }

  this.flushMessageQueue();
};

// Track disconnection state
this.ws.onclose = () => {
  console.log('[WebSocket] Disconnected');
  this.setState('disconnected');
  this.stopPingInterval();
  this.wasDisconnected = true; // NEW

  if (!this.isIntentionallyClosed) {
    this.scheduleReconnect();
  }
};
```

**Estimated effort**: Small (1-2hr)
- Add reconnection resync request
- Track disconnection state
- Test reconnection scenarios

**Risk if not fixed**: **Medium**
- Stale UI data after reconnection
- Missed critical updates
- Phase impact: All phases (UI doesn't reflect server state)

---

### [LOW] WebSocket Message Size Not Validated

**Location**: `src/services/websocketServer.ts:126-155`
**Category**: WebSocket
**Agent**: Integration & External Dependencies

**Why it matters**:
No validation of incoming WebSocket message size. Large messages could cause memory exhaustion.

**Current pattern**:
```typescript
ws.on('message', (data: Buffer) => {
  this.handleMessage(clientId, data);
});

private handleMessage(clientId: string, data: Buffer): void {
  try {
    const message = JSON.parse(data.toString()) as ClientMessage;
    // ... handle message
  } catch (error) {
    // ... error handling
  }
}
```

**Suggested pattern**:
```typescript
ws.on('message', (data: Buffer) => {
  // Reject messages larger than 1MB
  if (data.length > 1024 * 1024) {
    logger.warn('WebSocket message too large', {
      clientId,
      size: data.length,
    });
    this.sendError(clientId, 'Message too large (max 1MB)', 'MESSAGE_TOO_LARGE');
    return;
  }

  this.handleMessage(clientId, data);
});
```

**Estimated effort**: Small (<1hr)
- Add message size validation
- Configure max message size
- Test with large messages

**Risk if not fixed**: **Low**
- Memory exhaustion from large messages
- DoS vulnerability
- Phase impact: None (malicious clients only)

---

## 5. TanStack Query Patterns

### [MEDIUM] Inconsistent Query Key Patterns

**Location**: `public/frontend/src/hooks/useMovies.ts:28-34`, `useMovie.ts:48-58`
**Category**: TanStack Query
**Agent**: Integration & External Dependencies

**Why it matters**:
Query keys are inconsistent across hooks. Some include options in key, some don't. This affects cache invalidation and can cause stale data.

**Current pattern**:
```typescript
// useMovies.ts:29-34
export const useMovies = (options?: UseMoviesOptions) => {
  return useQuery<MovieListResult, Error>({
    queryKey: options ? ['movies', options] : ['movies'], // Conditional key
    queryFn: () => movieApi.getAll(options),
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });
};

// useMovie.ts:49-58
export const useMovie = (id?: number | null, include?: string[]) => {
  return useQuery<MovieDetail, Error>({
    queryKey: include ? ['movie', id, include] : ['movie', id], // Conditional key
    queryFn: async () => {
      if (!id) throw new Error('Movie ID is required');
      return movieApi.getById(id, include);
    },
    enabled: !!id,
  });
};
```

**Problem**:
1. `queryClient.invalidateQueries(['movies'])` won't invalidate `['movies', { status: 'monitored' }]`
2. Conditional keys create duplicate cache entries
3. Difficult to debug cache issues

**Suggested pattern**:
```typescript
// Create query key factory
export const movieKeys = {
  all: ['movies'] as const,
  lists: () => [...movieKeys.all, 'list'] as const,
  list: (filters: UseMoviesOptions = {}) => [...movieKeys.lists(), filters] as const,
  details: () => [...movieKeys.all, 'detail'] as const,
  detail: (id: number, include: string[] = []) => [...movieKeys.details(), id, include] as const,
};

// Use consistent keys
export const useMovies = (options: UseMoviesOptions = {}) => {
  return useQuery<MovieListResult, Error>({
    queryKey: movieKeys.list(options), // Always includes options (even if empty)
    queryFn: () => movieApi.getAll(options),
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });
};

export const useMovie = (id?: number | null, include: string[] = []) => {
  return useQuery<MovieDetail, Error>({
    queryKey: id ? movieKeys.detail(id, include) : ['movies', 'detail', 'disabled'],
    queryFn: async () => {
      if (!id) throw new Error('Movie ID is required');
      return movieApi.getById(id, include);
    },
    enabled: !!id,
  });
};

// Invalidation becomes predictable
queryClient.invalidateQueries({ queryKey: movieKeys.all }); // Invalidates all movie queries
queryClient.invalidateQueries({ queryKey: movieKeys.lists() }); // Invalidates all movie lists
queryClient.invalidateQueries({ queryKey: movieKeys.detail(5) }); // Invalidates movie 5
```

**Estimated effort**: Medium (3-4hr)
- Create query key factories for all resources
- Update all hooks to use factories
- Update invalidation calls
- Add documentation for key patterns

**Risk if not fixed**: **Medium**
- Stale data due to failed invalidations
- Duplicate cache entries
- Difficult to debug cache issues
- Phase impact: All phases (UI shows stale data)

---

### [MEDIUM] No Cache Invalidation Strategy for WebSocket Updates

**Location**: `public/frontend/src/hooks/useMovies.ts:130-134`
**Category**: TanStack Query
**Agent**: Integration & External Dependencies

**Why it matters**:
WebSocket updates trigger query invalidation, but there's no strategy for which queries to invalidate. This can cause excessive refetches or missed updates.

**Current pattern**:
```typescript
// useMovies.ts:130-134
onSettled: (data, error, { id }) => {
  // Always refetch after error or success to sync with server
  queryClient.invalidateQueries({ queryKey: ['movies'] });
  queryClient.invalidateQueries({ queryKey: ['movie', id] });
},
```

**Problem**:
1. Invalidates all movie queries even if only one movie changed
2. WebSocket already sent the updated data, refetch is redundant
3. No coordination between WebSocket and TanStack Query

**Suggested pattern**:
```typescript
// WebSocketContext.tsx - Handle movie updates
useEffect(() => {
  if (!ws) return;

  ws.on('moviesChanged', (message: MoviesChangedMessage) => {
    if (message.action === 'updated' && message.movies) {
      // Update cache directly instead of invalidating
      message.movies.forEach((movie) => {
        // Update list cache
        queryClient.setQueriesData<MovieListResult>(
          { queryKey: movieKeys.lists() },
          (old) => {
            if (!old) return old;
            return {
              ...old,
              movies: old.movies.map((m) => (m.id === movie.id ? movie : m)),
            };
          }
        );

        // Update detail cache
        queryClient.setQueryData<MovieDetail>(
          movieKeys.detail(movie.id),
          (old) => (old ? { ...old, ...movie } : undefined)
        );
      });
    } else if (message.action === 'added') {
      // Invalidate lists only (detail not cached yet)
      queryClient.invalidateQueries({ queryKey: movieKeys.lists() });
    } else if (message.action === 'deleted') {
      // Remove from all caches
      message.movieIds.forEach((id) => {
        queryClient.removeQueries({ queryKey: movieKeys.detail(id) });
      });
      queryClient.invalidateQueries({ queryKey: movieKeys.lists() });
    }
  });
}, [ws, queryClient]);
```

**Estimated effort**: Medium (4-5hr)
- Implement WebSocket cache updates
- Replace invalidations with setQueryData
- Handle add/update/delete actions
- Test cache coherence

**Risk if not fixed**: **Medium**
- Excessive refetches (performance)
- Flickering UI during refetch
- Redundant network requests
- Phase impact: All phases (UI performance)

---

## 6. Configuration Management

### [MEDIUM] No Zod Schema Validation for Environment Variables

**Location**: `src/config/defaults.ts` (assumed location, file not found)
**Category**: Configuration
**Agent**: Integration & External Dependencies

**Why it matters**:
Audit workflow asks: "All config validated with Zod at startup?" Current code uses environment variables without validation. Invalid config causes runtime failures.

**Current pattern**:
```typescript
// Assumed pattern based on common practice
const config = {
  cachePath: process.env.CACHE_PATH || '/data/cache',
  libraryPath: process.env.LIBRARY_PATH || '/media',
  tmdbApiKey: process.env.TMDB_API_KEY,
  // No validation
};
```

**Suggested pattern**:
```typescript
import { z } from 'zod';

// Define configuration schema
const ConfigSchema = z.object({
  cachePath: z.string().min(1, 'CACHE_PATH is required'),
  libraryPath: z.string().min(1, 'LIBRARY_PATH is required'),
  dbType: z.enum(['sqlite', 'postgres']).default('sqlite'),
  databaseUrl: z.string().url().optional(),
  tmdbApiKey: z.string().min(1, 'TMDB_API_KEY is required'),
  tvdbApiKey: z.string().optional(),
  port: z.coerce.number().int().min(1).max(65535).default(3000),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Config = z.infer<typeof ConfigSchema>;

// Load and validate configuration at startup
export function loadConfig(): Config {
  try {
    return ConfigSchema.parse({
      cachePath: process.env.CACHE_PATH || '/data/cache',
      libraryPath: process.env.LIBRARY_PATH || '/media',
      dbType: process.env.DB_TYPE,
      databaseUrl: process.env.DATABASE_URL,
      tmdbApiKey: process.env.TMDB_API_KEY,
      tvdbApiKey: process.env.TVDB_API_KEY,
      port: process.env.PORT,
      logLevel: process.env.LOG_LEVEL,
    });
  } catch (error) {
    console.error('Configuration validation failed:');
    if (error instanceof z.ZodError) {
      error.errors.forEach((err) => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
    }
    process.exit(1);
  }
}

// src/index.ts
const config = loadConfig();
// Application won't start with invalid config
```

**Estimated effort**: Medium (3-4hr)
- Create configuration schema
- Add validation at startup
- Document all environment variables
- Create .env.example with all options

**Risk if not fixed**: **Medium**
- Invalid config causes runtime crashes
- Missing required config not detected until used
- Difficult to debug configuration issues
- Phase impact: All phases (if config invalid)

---

## 7. Dependency Version Management

### [HIGH] Security Vulnerabilities in Dependencies

**Location**: `package.json`, `package-lock.json`
**Category**: Dependency Management
**Agent**: Integration & External Dependencies

**Why it matters**:
NPM audit reports 12 vulnerabilities: 9 High severity, 3 Moderate. These pose security risks and should be addressed.

**Vulnerability Summary**:
```json
{
  "vulnerabilities": {
    "glob": {
      "severity": "high",
      "title": "Command injection via -c/--cmd executes matches with shell:true",
      "cvss": 7.5,
      "range": ">=10.3.7 <=11.0.3",
      "fixAvailable": "Downgrade jest to 29.7.0"
    },
    "vite": {
      "severity": "moderate",
      "title": "server.fs.deny bypass via backslash on Windows",
      "range": ">=6.0.0 <=6.4.0",
      "fixAvailable": true
    },
    "js-yaml": {
      "severity": "moderate",
      "title": "Prototype pollution in merge",
      "range": "<3.14.2 || >=4.0.0 <4.1.1",
      "fixAvailable": true
    },
    "tar": {
      "severity": "moderate",
      "title": "Race condition leading to uninitialized memory exposure",
      "range": "=7.5.1",
      "fixAvailable": true
    }
  },
  "metadata": {
    "vulnerabilities": {
      "high": 9,
      "moderate": 3,
      "total": 12
    }
  }
}
```

**Impact**:
1. **glob vulnerability (High)**: Command injection risk in Jest (test environment only, but still serious)
2. **vite vulnerability (Moderate)**: Path traversal on Windows development servers
3. **js-yaml vulnerability (Moderate)**: Prototype pollution (if user input parsed as YAML)
4. **tar vulnerability (Moderate)**: Memory exposure in Tailwind CSS (low practical impact)

**Recommended actions**:
```bash
# Fix most vulnerabilities
npm audit fix

# For glob/jest: Downgrade to jest@29.7.0 (breaking change)
npm install -D jest@29.7.0

# For vite: Upgrade to latest
npm install -D vite@latest

# Verify fixes
npm audit
```

**Estimated effort**: Medium (2-3hr)
- Run npm audit fix
- Test downgraded Jest version
- Upgrade Vite and test frontend build
- Re-run npm audit to verify
- Update documentation

**Risk if not fixed**: **High**
- Security vulnerabilities exploitable by attackers
- Compliance issues for production deployments
- Potential data leaks or system compromise
- Phase impact: All phases (if vulnerabilities exploited)

---

### [MEDIUM] Unpinned Dependency Versions

**Location**: `package.json`
**Category**: Dependency Management
**Agent**: Integration & External Dependencies

**Why it matters**:
Most dependencies use caret ranges (`^`) which allow minor/patch updates. This can cause unexpected breakage in production.

**Current pattern**:
```json
{
  "dependencies": {
    "axios": "^1.12.2", // Allows 1.12.2 - 1.999.999
    "express": "^5.1.0", // Express 5 is still in development!
    "react": "^19.1.1", // Allows 19.1.1 - 19.999.999
    "sharp": "^0.34.4", // Native module - risky to auto-update
    // ...
  }
}
```

**Recommendation**:
```json
// For production stability, pin major versions
{
  "dependencies": {
    "axios": "~1.12.2", // Allows 1.12.x only (patch updates)
    "express": "5.1.0", // Express 5 beta - pin exactly until stable
    "react": "19.1.1", // React 19 - pin exactly until mature
    "sharp": "0.34.4", // Native module - pin exactly
    // ...
  },
  "devDependencies": {
    // Dev dependencies can be looser
    "jest": "^29.7.0",
    "typescript": "^5.9.2",
  }
}
```

**Process**:
1. Pin critical dependencies (native modules, major version bumps)
2. Use `~` (tilde) for patch updates only
3. Use `^` (caret) for dev dependencies
4. Regular dependency audits (monthly)
5. Test before upgrading

**Estimated effort**: Small (1-2hr)
- Review all dependencies
- Pin critical ones
- Update package.json
- Test application

**Risk if not fixed**: **Medium**
- Unexpected breaking changes in production
- Difficult to reproduce bugs
- npm install gives different versions
- Phase impact: All phases (if breaking change occurs)

---

### [LOW] No License Compatibility Check

**Location**: `package.json`
**Category**: Dependency Management
**Agent**: Integration & External Dependencies

**Why it matters**:
Need to ensure all dependencies are compatible with project license (ISC). Some packages may have incompatible licenses (GPL, AGPL).

**Suggested action**:
```bash
# Install license checker
npm install -D license-checker

# Add script to package.json
{
  "scripts": {
    "licenses": "license-checker --summary",
    "licenses:check": "license-checker --failOn 'GPL;AGPL'"
  }
}

# Run check
npm run licenses:check
```

**Estimated effort**: Small (<1hr)
- Install license-checker
- Run license audit
- Document license compliance

**Risk if not fixed**: **Low**
- Legal compliance issues
- Licensing conflicts in production
- Phase impact: None (legal risk only)

---

## Cross-Cutting Themes

### Theme 1: Provider Resilience Incomplete

**Found by**: Agent 4
**Pattern**: Circuit breakers exist but fallback chains don't

Related findings:
- No circuit breaker fallback chain (Critical)
- No health metrics exposure (High)
- No provider version compatibility (High)

**Root cause**: Provider integration was built with circuit breakers (good) but not fully integrated into orchestration layer. Need to complete the resilience pattern.

---

### Theme 2: Frontend-Backend Contract Fragility

**Found by**: Agents 1, 4
**Pattern**: TypeScript types don't match runtime reality

Related findings:
- WebSocket type mismatch (High)
- No response shape validation (High)
- Inconsistent null handling (Medium)
- Agent 1: 169 `any` usages

**Root cause**: Separate type definitions in frontend/backend with no validation. Need single source of truth or runtime validation.

---

### Theme 3: External Dependency Assumptions

**Found by**: Agents 3, 4
**Pattern**: External binaries assumed available without checks

Related findings:
- FFprobe command injection (Critical)
- No FFprobe availability check (High)
- Sharp error handling (Medium)
- Agent 3: Command injection identified

**Root cause**: Application assumes perfect environment. Need graceful degradation and early validation.

---

## Metrics Dashboard

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| **Integration Issues** | 18 | <5 | 🔴 >10 |
| **Critical Issues** | 2 | 0 | 🔴 >0 |
| **High Issues** | 6 | <5 | 🔴 >5 |
| **Security Vulnerabilities** | 12 | 0 | 🔴 >0 |
| **Provider Health Visibility** | 0% | 100% | 🔴 Not implemented |
| **WebSocket Fallback** | 0% | 100% | 🔴 Not implemented |
| **API Schema Validation** | 0% | 100% | 🔴 Not implemented |
| **Binary Availability Check** | 0% | 100% | 🔴 Not implemented |

---

## Prioritized Remediation Roadmap

### Immediate (This Sprint) - Critical

**Estimated effort**: 8-10 hours

1. **[CRITICAL] Fix FFprobe Command Injection** - Agent 4, External Dependencies
   - Location: `src/services/media/ffprobeService.ts:117`
   - Effort: Small (<1hr)
   - Impact: Prevents remote code execution vulnerability
   - **Priority 1**: Security vulnerability

2. **[CRITICAL] Implement Provider Fallback Chain** - Agent 4, Provider Integration
   - Location: `src/services/providers/ProviderOrchestrator.ts:48-96`
   - Effort: Large (6-8hr)
   - Impact: Enables graceful degradation when providers fail
   - **Priority 2**: Core resilience feature

---

### Short Term (Next 2-3 Sprints) - High & Selected Medium

**Estimated effort**: 30-35 hours

1. **[HIGH] Fix Security Vulnerabilities** - Agent 4, Dependency Management
   - Effort: Medium (2-3hr)
   - Impact: Closes security holes

2. **[HIGH] Sync WebSocket Message Types** - Agent 4, API Contract
   - Effort: Medium (2-3hr)
   - Impact: Prevents runtime failures

3. **[HIGH] Add WebSocket Fallback to Polling** - Agent 4, WebSocket
   - Effort: Medium (4-5hr)
   - Impact: Ensures UI updates even when WebSocket fails

4. **[HIGH] Add FFprobe Availability Check** - Agent 4, External Dependencies
   - Effort: Small (1-2hr)
   - Impact: Early detection of missing dependencies

5. **[HIGH] Add Provider Health Metrics** - Agent 4, Provider Integration
   - Effort: Medium (3-4hr)
   - Impact: Visibility into provider status

6. **[HIGH] Add API Response Validation** - Agent 4, API Contract
   - Effort: Large (8-10hr)
   - Impact: Catch API contract violations early

7. **[HIGH] Add Provider API Version Checking** - Agent 4, Provider Integration
   - Effort: Medium (4-6hr per provider)
   - Impact: Prevent silent data corruption

8. **[MEDIUM] Fix Sharp Error Handling** - Agent 4, External Dependencies
   - Effort: Small (2-3hr)
   - Impact: Prevent job failures on corrupted images

9. **[MEDIUM] Add Config Schema Validation** - Agent 4, Configuration
   - Effort: Medium (3-4hr)
   - Impact: Catch invalid config at startup

10. **[MEDIUM] Fix Query Key Inconsistencies** - Agent 4, TanStack Query
    - Effort: Medium (3-4hr)
    - Impact: Fix cache invalidation issues

---

### Long Term (Backlog) - Medium & Low

**Estimated effort**: 15-20 hours

1. **[MEDIUM] Fix Null Handling Inconsistency** - Agent 4, API Contract
   - Effort: Medium (4-6hr)
   - Impact: Prevent subtle UI bugs

2. **[MEDIUM] Add API Versioning** - Agent 4, API Contract
   - Effort: Medium (3-4hr)
   - Impact: Enable future API evolution

3. **[MEDIUM] Validate Provider Capabilities** - Agent 4, Provider Integration
   - Effort: Small (1-2hr)
   - Impact: Catch provider implementation errors

4. **[MEDIUM] Pin Critical Dependencies** - Agent 4, Dependency Management
   - Effort: Small (1-2hr)
   - Impact: Production stability

5. **[MEDIUM] Add Cache Invalidation Strategy** - Agent 4, TanStack Query
   - Effort: Medium (4-5hr)
   - Impact: Reduce redundant refetches

6. **[MEDIUM] Add Binary Path Configuration** - Agent 4, External Dependencies
   - Effort: Small (1-2hr)
   - Impact: Docker/custom installation support

7. **[LOW] Add WebSocket Message Size Validation** - Agent 4, WebSocket
   - Effort: Small (<1hr)
   - Impact: Prevent DoS attacks

8. **[LOW] Add Stale Provider Data Detection** - Agent 4, Provider Integration
   - Effort: Medium (3-4hr)
   - Impact: Keep metadata fresh

9. **[LOW] Add License Compatibility Check** - Agent 4, Dependency Management
   - Effort: Small (<1hr)
   - Impact: Legal compliance

10. **[MEDIUM] Add WebSocket Reconnection Resync** - Agent 4, WebSocket
    - Effort: Small (1-2hr)
    - Impact: Fix stale data after reconnection

---

## Top 3 Integration Risks (Summary)

### 1. FFprobe Command Injection (Critical)
**Impact**: Remote code execution, full server compromise
**Likelihood**: Medium (requires malicious filename)
**Mitigation**: Replace `exec()` with `execFile()` immediately

### 2. No Provider Fallback Chain (High)
**Impact**: Complete enrichment failure when primary provider down
**Likelihood**: High (provider rate limits/outages common)
**Mitigation**: Implement fallback chain in ProviderOrchestrator

### 3. WebSocket Type Mismatch (High)
**Impact**: Silent runtime failures, missing UI updates
**Likelihood**: High (will happen when new messages added)
**Mitigation**: Sync types and add runtime validation

---

## External Dependency Health Assessment

**Overall Grade**: 🔴 **Poor**

**Strengths**:
- Sharp is well-integrated for image processing
- TanStack Query properly used for API state
- WebSocket has reconnection logic

**Weaknesses**:
- 12 security vulnerabilities (9 High, 3 Moderate)
- FFprobe has command injection vulnerability
- No binary availability checks at startup
- No provider API version compatibility
- No API response schema validation

**Recommendations**:
1. **Immediate**: Fix FFprobe command injection
2. **Week 1**: Run `npm audit fix` and upgrade vulnerable packages
3. **Week 2**: Add binary availability checks
4. **Week 3**: Implement provider fallback chains
5. **Month 1**: Add Zod schema validation for all APIs

---

## Conclusion

The integration layer has critical gaps that need immediate attention:

1. **Security**: FFprobe command injection is a critical vulnerability requiring immediate fix
2. **Resilience**: Provider circuit breakers exist but fallback chains are missing
3. **Contracts**: Frontend-backend types don't match, creating fragile integration
4. **Dependencies**: 12 security vulnerabilities need patching

**Positive findings**:
- Circuit breaker pattern implemented in BaseProvider (just needs orchestration)
- TanStack Query used correctly for most operations
- WebSocket has reconnection logic (just needs polling fallback)
- Image processing with Sharp is well-designed

**Critical path**:
1. Fix security vulnerabilities (FFprobe, npm audit)
2. Complete provider resilience (fallback chains, health monitoring)
3. Validate contracts (WebSocket types, API responses, Zod schemas)
4. Add external dependency checks (binary availability)

**Next audit recommended**: After completing Critical/High remediation (4-6 weeks)

---

**Report Version**: 1.0
**Generated**: 2025-01-17
**Agent**: 4 - Integration & External Dependencies
