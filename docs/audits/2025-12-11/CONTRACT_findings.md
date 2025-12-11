# Contract Audit Findings - 2025-12-11

**Auditor**: Contract Engineer (CONTRACT)
**Focus**: Frontend-backend type alignment, API contracts, shared types consistency
**Date**: 2025-12-11

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 4 |
| Medium | 8 |
| Low | 3 |
| **Total** | **15** |

## Key Findings

The audit revealed inconsistent response envelope patterns across controllers, missing type definitions for several API responses, and mismatches between frontend expectations and backend implementations. Most critically, the codebase lacks a standardized response format, with some endpoints using `{ success, data, error }` while others return raw data or custom formats.

---

## Critical Findings

None.

---

## High Severity Findings

### CONTRACT-001: Inconsistent Response Envelope Patterns

**Severity**: High
**Location**: Multiple controllers in `src/controllers/`
**Standard Violated**: Inconsistent response envelope - Use `{ success, data?, error? }`

**Problem**: Controllers return responses in multiple incompatible formats. Some use `{ success, data }`, others return raw data directly, and some use custom formats like `{ status, message }`.

**Examples**:
- `EnrichmentController`: Uses `{ success: true, data: stats }` ✓
- `MovieCrudController.getAll()`: Returns raw `result` object directly ✗
- `LibraryController.getAll()`: Returns raw `libraries` array directly ✗
- `MediaPlayerController.getAll()`: Returns raw `players` array directly ✗
- `JobController.getActive()`: Returns `{ jobs }` wrapper ✗
- `WebhookController`: Returns `{ status: 'success', message: '...' }` ✗

**Impact**: Frontend code cannot rely on a consistent response structure, leading to brittle error handling and inconsistent type definitions. Makes it impossible to create a generic API response wrapper type.

**Remediation**:
1. Define a standard `ApiResponse<T>` type in backend types
2. Create a response helper function that wraps all controller responses
3. Audit all controllers and migrate to standardized envelope
4. Update frontend types to expect consistent envelope
5. Document the standard in API.md

**Effort**: High (affects 20+ controllers, requires coordinated frontend/backend changes)

---

### CONTRACT-002: Frontend Type Mismatch - CastResponse

**Severity**: High
**Location**:
- Frontend: `public/frontend/src/types/movie.ts` (line 360)
- Backend: `src/types/movie.ts` (line 42)
**Standard Violated**: Frontend type differs from backend

**Problem**: Frontend `CastResponse` interface expects `{ actors, actors_order_locked }` but backend `CastUpdateResponse` includes additional fields `{ success, message, actors, actors_order_locked }`.

**Impact**: Frontend code expecting the backend response shape will fail TypeScript compilation or have runtime issues when the backend returns the full response with `success` and `message` fields.

**Remediation**:
1. Align frontend `CastResponse` with backend `CastUpdateResponse`
2. Or create separate request/response types and ensure frontend uses the response type
3. Update MovieCastController to ensure it returns the documented type

**Effort**: Low (single type definition, verify controller implementation)

---

### CONTRACT-003: Job History Endpoint Deprecated But Not Documented

**Severity**: High
**Location**:
- Frontend: `public/frontend/src/utils/api.ts` (line 964)
- Backend: `src/controllers/jobController.ts` (returning 410 Gone)
- Documentation: `docs/architecture/API.md` (line 961)
**Standard Violated**: API.md documents non-existent endpoint

**Problem**: The `/api/jobs/history` endpoint returns 410 Gone with a deprecation message, but:
- Frontend still has `jobApi.getHistory()` that calls this endpoint
- API.md still documents this endpoint as functional
- Frontend types define `JobHistoryResponse` and related types

**Impact**: Frontend code will fail when calling job history, users will get 410 errors, and documentation misleads developers.

**Remediation**:
1. Remove `/api/jobs/history` documentation from API.md
2. Remove `getHistory()` method from frontend `jobApi`
3. Remove or deprecate `JobHistoryRecord`, `JobHistoryFilters`, `JobHistoryResponse` types
4. Add migration note to API.md explaining the change
5. Update any UI components that rely on job history

**Effort**: Medium (coordinate removal across frontend, backend, docs)

---

### CONTRACT-004: Missing Response Types for Several Endpoints

**Severity**: High
**Location**: Multiple endpoints lack TypeScript response types
**Standard Violated**: Missing TypeScript response types

**Problem**: Several controller methods lack explicit return type annotations, making it unclear what shape the response data takes. Examples:
- `MovieCrudController.getAll()` - returns MovieService result directly, shape unclear
- `LibraryController.getAll()` - returns libraries array, no wrapper type
- `ActorController.getAll()` - returns result object, shape undefined
- `IgnorePatternController.getAll()` - returns patterns array, no type

**Impact**:
- Frontend developers must inspect controller implementation to understand response shape
- No TypeScript safety for response structure
- Difficult to maintain API contracts
- Prone to breaking changes

**Remediation**:
1. Define explicit response types for all endpoints (e.g., `GetAllMoviesResponse`)
2. Add response type annotations to all controller methods
3. Document response types in API.md
4. Ensure frontend types match backend response types

**Effort**: Medium (requires creating types for ~20 endpoints)

---

## Medium Severity Findings

### CONTRACT-005: Frontend API Layer Missing Several Backend Endpoints

**Severity**: Medium
**Location**: `public/frontend/src/utils/api.ts`
**Standard Violated**: Endpoint not in api.ts

**Problem**: Several backend endpoints are not exposed in the centralized frontend API layer:

**Missing endpoints**:
- `GET /api/media-player-groups` (backend line 229)
- `GET /api/media-player-groups/with-members` (backend line 230)
- `GET /api/media-players/:id/activity` (backend line 231)
- `GET /api/media-players/activity` (backend line 232)
- `POST /api/movies/:id/search-tmdb` (backend line 552)
- `POST /api/movies/:id/identify` (backend line 557)
- `POST /api/asset-candidates/:id/select` (backend line 519)
- `POST /api/asset-candidates/:id/block` (backend line 524)
- `POST /api/asset-candidates/:id/unblock` (backend line 529)
- `POST /api/movies/:id/reset-asset` (backend line 534)
- `POST /api/movies/:id/restore` (backend line 546)
- Priority API endpoints (all in backend, missing in frontend)

**Impact**: Frontend components that need these endpoints must make raw fetch calls, bypassing the centralized API layer and losing type safety.

**Remediation**:
1. Add missing endpoints to appropriate API modules in `api.ts`
2. Create TypeScript types for request/response shapes
3. Ensure consistent error handling and response parsing

**Effort**: Medium (15+ endpoints to add with proper typing)

---

### CONTRACT-006: Inconsistent Error Response Shapes

**Severity**: Medium
**Location**: Multiple controllers
**Standard Violated**: Missing error response types

**Problem**: Error responses vary widely across controllers:
- `{ error: string }` (most common)
- `{ success: false, error: string }`
- `{ error: { code, message, details } }`
- `{ status: 'error', message: string }`

**Impact**: Frontend error handling must account for multiple error formats, making it difficult to show consistent error messages to users.

**Remediation**:
1. Define standard error response type: `{ success: false, error: { code: string, message: string, details?: any } }`
2. Create error handler middleware that standardizes all error responses
3. Update frontend to expect consistent error format
4. Document error format in API.md

**Effort**: Medium (requires middleware and updating error handling across codebase)

---

### CONTRACT-007: MovieListResult vs Direct Array Return

**Severity**: Medium
**Location**:
- Frontend type: `public/frontend/src/types/movie.ts` (line 278)
- Backend controller: `src/controllers/movie/MovieCrudController.ts` (line 39)
**Standard Violated**: Frontend type differs from backend

**Problem**: Frontend defines `MovieListResult` type with `{ movies: MovieListItem[], total: number }` but the backend controller returns the raw result from `movieService.getAll()` without explicit typing.

**Impact**: Without inspecting the service implementation, it's unclear if the backend actually returns `{ movies, total }` or just an array. Type safety is lost.

**Remediation**:
1. Verify what `movieService.getAll()` actually returns
2. Add explicit return type to `MovieCrudController.getAll()`
3. Ensure frontend type matches backend implementation
4. Document response format in API.md

**Effort**: Low (verify implementation, add type annotation)

---

### CONTRACT-008: Missing Centralized API Response Type

**Severity**: Medium
**Location**: N/A (missing infrastructure)
**Standard Violated**: Inconsistent response envelope

**Problem**: There is no shared `ApiResponse<T>` type definition used across backend and frontend, despite API.md documenting a standard response format.

**Impact**: Each developer implements response handling differently, leading to inconsistency and duplication.

**Remediation**:
1. Create `src/types/api.ts` with:
   ```typescript
   export interface ApiResponse<T> {
     success: boolean;
     data?: T;
     error?: {
       code: string;
       message: string;
       details?: any;
     };
     meta?: {
       page?: number;
       limit?: number;
       total?: number;
       timestamp: string;
     };
   }
   ```
2. Create matching frontend type
3. Create response wrapper helper functions
4. Migrate controllers to use standardized response

**Effort**: Medium (infrastructure creation + incremental migration)

---

### CONTRACT-009: WebSocket Event Types Not Shared

**Severity**: Medium
**Location**:
- Backend: `src/types/websocket.ts`
- Frontend: `public/frontend/src/types/websocket.ts`
**Standard Violated**: Frontend type differs from backend

**Problem**: WebSocket event types are defined separately in frontend and backend with no guarantee they match.

**Impact**: WebSocket events might be sent with one structure but consumed expecting another, leading to runtime errors that TypeScript cannot catch.

**Remediation**:
1. Create shared WebSocket types package or file
2. Generate frontend types from backend definitions
3. Add validation layer for WebSocket messages
4. Document all WebSocket events and their payloads in API.md

**Effort**: Medium (requires type sharing mechanism)

---

### CONTRACT-010: Priority API Missing Request/Response Types

**Severity**: Medium
**Location**: `public/frontend/src/utils/api.ts` (line 689-768)
**Standard Violated**: Missing TypeScript response types

**Problem**: Priority API methods use imported types from `types/provider.ts` but don't have explicit request/response type definitions for API calls.

**Impact**: Unclear what shape the API expects/returns without inspecting implementation.

**Remediation**:
1. Create explicit request/response types for all priority endpoints
2. Document in API.md
3. Add validation schemas

**Effort**: Low (types are mostly defined, need organization)

---

### CONTRACT-011: Asset API Comments Mention Removed Methods

**Severity**: Medium
**Location**: `public/frontend/src/utils/api.ts` (line 863-865)
**Standard Violated**: Endpoint not in api.ts (but documented in comments)

**Problem**: Frontend API has comments stating:
```typescript
// REMOVED: selectCandidate, blockCandidate, unblockCandidate, resetSelection
// These API methods are no longer available with the cache-aside pattern.
```

But backend still has these endpoints (lines 519-537 in api.ts).

**Impact**: Confusion about what's available. Either backend has dead code or frontend is missing functionality.

**Remediation**:
1. Verify if backend endpoints are actually used
2. Either remove backend endpoints or add back to frontend
3. Update documentation to reflect actual state

**Effort**: Low (verify and align)

---

### CONTRACT-012: Trailer API Types Inconsistency

**Severity**: Medium
**Location**: Trailer endpoints in API.md vs actual implementation
**Standard Violated**: API.md documents non-existent endpoint

**Problem**: API.md documents trailer endpoints with certain response shapes, but actual types/implementations may differ. No frontend types exist for some trailer responses.

**Impact**: Frontend code may not handle trailer API responses correctly.

**Remediation**:
1. Create comprehensive frontend types for all trailer endpoints
2. Verify backend controller responses match documentation
3. Add types to frontend API layer

**Effort**: Medium (trailer system is complex)

---

## Low Severity Findings

### CONTRACT-013: Deprecated Movie Type Still Exported

**Severity**: Low
**Location**: `public/frontend/src/types/movie.ts` (line 286)
**Standard Violated**: N/A (maintenance issue)

**Problem**: Deprecated type alias still exported:
```typescript
/**
 * @deprecated Use MovieListItem instead
 */
export type Movie = MovieListItem;
```

**Impact**: Developers might use deprecated type, causing confusion.

**Remediation**:
1. Search codebase for usage of `Movie` type
2. Replace all usages with `MovieListItem`
3. Remove deprecated type

**Effort**: Low (search and replace)

---

### CONTRACT-014: SSE Return Types Not Typed

**Severity**: Low
**Location**: Multiple `subscribeToX` methods in `public/frontend/src/utils/api.ts`
**Standard Violated**: Missing TypeScript response types

**Problem**: SSE subscription methods return cleanup functions typed as `() => void` but the event data structures are defined inline rather than as exported types.

**Impact**: Makes it harder to test and reuse event handler types.

**Remediation**:
1. Extract event types to shared type definitions
2. Export them for reuse in tests and other components

**Effort**: Low (extract types, minimal code changes)

---

### CONTRACT-015: API Base URL Hardcoded

**Severity**: Low
**Location**: `public/frontend/src/utils/api.ts` (line 73)
**Standard Violated**: N/A (best practice)

**Problem**: API base URL is hardcoded as `'/api'` rather than being configurable via environment variable.

**Impact**: Makes it harder to point frontend at different backend environments (staging, production, local).

**Remediation**:
1. Create environment variable for API base URL
2. Use environment variable with fallback to `/api`
3. Document in development setup

**Effort**: Low (single constant change)

---

## Recommendations

### Immediate Actions (High Priority)
1. **CONTRACT-001**: Standardize response envelope across all controllers
2. **CONTRACT-003**: Remove deprecated job history endpoint from docs and frontend
3. **CONTRACT-004**: Add explicit response types to all controller methods
4. **CONTRACT-002**: Align frontend/backend CastResponse types

### Short-term Actions (Medium Priority)
5. **CONTRACT-005**: Add missing endpoints to frontend API layer
6. **CONTRACT-006**: Standardize error response format
7. **CONTRACT-007**: Verify and type MovieListResult response
8. **CONTRACT-008**: Create centralized ApiResponse type

### Long-term Improvements (Low Priority)
9. **CONTRACT-009**: Share WebSocket types between frontend/backend
10. **CONTRACT-010-015**: Address remaining type and documentation issues

### Process Improvements
- Implement automated contract testing to catch response mismatches
- Add OpenAPI/Swagger spec generation from TypeScript types
- Create pre-commit hook to validate response types exist for new endpoints
- Establish API versioning strategy for breaking changes

---

## Appendix: Audit Methodology

1. **Type Definition Review**: Compared all types in `src/types/` with `public/frontend/src/types/`
2. **API Layer Analysis**: Reviewed `public/frontend/src/utils/api.ts` against `src/routes/api.ts`
3. **Controller Response Audit**: Grep'd all `res.json()` calls to identify response patterns
4. **Documentation Verification**: Compared API.md documented endpoints with actual route definitions
5. **Response Envelope Check**: Analyzed response format consistency across controllers

## Files Reviewed

**Backend**:
- `src/routes/api.ts` (830 lines)
- `src/routes/enrichment.ts` (65 lines)
- `src/types/movie.ts`
- `src/types/jobs.ts`
- `src/types/websocket.ts`
- `src/controllers/*` (20+ controllers)

**Frontend**:
- `public/frontend/src/utils/api.ts` (1101 lines)
- `public/frontend/src/types/movie.ts`
- `public/frontend/src/types/job.ts`
- `public/frontend/src/types/provider.ts`
- `public/frontend/src/types/websocket.ts`

**Documentation**:
- `docs/architecture/API.md` (1080 lines)
