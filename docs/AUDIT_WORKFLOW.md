# Metarr Audit Workflow

## Purpose

The Audit Workflow is a comprehensive, multi-agent analysis system designed to evaluate the codebase after major feature implementations or before release milestones. The goal is to identify opportunities for simplification, performance improvement, consistency enhancement, and reliability increases.

**Key Principle**: "How can we refactor to be more simple, performant, maintainable, and reliable?"

---

## When to Run

- After completing major features
- Before release milestones
- When codebase feels complex or unwieldy
- Periodically as "optimization passes" (quarterly recommended)
- Developer-initiated at any time
- After significant dependency upgrades

---

## Audit Scope

**Default**: Full codebase analysis including:
- Backend services and controllers
- Frontend components and hooks
- Database schema and migrations
- Documentation (including CLAUDE.md)
- Configuration files
- Scripts and utilities
- API contracts and types
- Job queue and worker implementations
- Provider integrations
- Cache management system

**Optional**: Target specific areas (phases, services, frontend modules, etc.)

---

## Multi-Agent Architecture

The audit employs **six specialized agents** working in **four sequential phases**. This structure balances comprehensive coverage with manageable execution time (~10-13 hours total).

**Execution Strategy**:
- **Phase 1**: Agents 1 & 2 run in parallel (foundation)
- **Phase 2**: Agent 3 runs solo (depends on Phase 1 findings)
- **Phase 3**: Agents 4 & 5 run in parallel (integration layer)
- **Phase 4**: Agent 6 runs solo (final polish and documentation)

**Why This Order**: Later phases depend on findings from earlier phases. Architecture issues (Agent 1) must be understood before evaluating error handling (Agent 3). Complete system understanding needed before documentation audit (Agent 6).

---

## Phase 1: Foundation Analysis

Agents 1 and 2 run **in parallel** (no dependencies between them).

---

### Agent 1: Code Quality & Architecture

**Priority**: Highest
**Duration**: 3-4 hours
**Focus**: SOLID principles, service patterns, complexity, testability

#### Evaluation Criteria

1. **SOLID Principles & Design Patterns**
   - **Single Responsibility**: Do classes/functions do one thing well?
   - **Open/Closed**: Are components extensible without modification?
   - **Liskov Substitution**: Are inheritance hierarchies sound?
   - **Interface Segregation**: Are interfaces lean and focused?
   - **Dependency Inversion**: Do we depend on abstractions?
   - **Service Instantiation Patterns**: Compliance with DEVELOPMENT.md (3 patterns: Singleton, Application-Scoped, Request-Scoped)

2. **Service Architecture Compliance**
   - **Singleton Pattern** (Only 3 allowed: CacheService, WebSocketBroadcaster, ProviderRegistry)
     - Private constructor enforced?
     - getInstance() pattern correct?
     - Deferred initialization with dependencies?
   - **Application-Scoped Services** (Job queue, connection managers, schedulers)
     - Lifecycle management (start/stop) implemented?
     - Created once in app.ts?
     - Background processing properly managed?
   - **Request-Scoped Services** (CRUD, orchestrators, utilities)
     - Truly stateless?
     - Dependencies injected via constructor?
     - No shared mutable state?

3. **Dependency Injection & Testability**
   - Constructor injection used over global imports?
   - Services mockable without internal rewrites?
   - Circular dependency detection (use import graph analysis)
   - Database abstraction enables in-memory testing?
   - Provider calls mockable without API keys?

4. **Code Complexity**
   - **Cyclomatic complexity**: >10 (warning), >15 (critical)
   - **Cognitive complexity**: Hard-to-understand code even with low branches
   - **Function length**: >50 lines (warning), >100 (critical)
   - **Function parameters**: >5 params (refactor to config object)
   - **Class size**: >500 lines (God object warning)
   - **Nested conditionals**: >3 levels deep
   - **Callback hell or promise chains**

5. **DRY Violations**
   - Duplicated logic across services
   - Copy-pasted code blocks
   - Similar patterns that could be abstracted
   - Redundant utility functions

6. **TypeScript Best Practices**
   - **Type safety**: No excessive `any`, proper type definitions
   - **Interface vs type**: Appropriateness for use case
   - **Generics**: Usage and constraints
   - **Union vs intersection**: Correct type composition
   - **Enum vs const assertions**: Modern patterns
   - **Null handling**: Consistent optional chaining and nullish coalescing

7. **Naming Conventions**
   - Consistent casing (camelCase, PascalCase)
   - Descriptive names that reveal intent
   - Avoid abbreviations unless standard (API, URL, ID)
   - Service/Controller/Model naming patterns
   - Magic numbers replaced with named constants
   - Boolean flag parameters (indicates function does two things)

8. **Dead Code & Code Hygiene**
   - Unused imports
   - Unreferenced functions
   - Commented-out code blocks
   - Deprecated utilities
   - Unused type definitions
   - Abstraction level mixing (high-level + low-level in same function)

9. **Test Coverage**
   - Critical paths have unit tests (enrichment, cache operations)?
   - Integration tests for phase boundaries?
   - Test coverage percentage for services (target: >70%)
   - E2E tests for complete workflows?

#### Output Format

```markdown
### [SEVERITY] Issue Title
**Location**: `path/to/file.ts:123-145`
**Agent**: Code Quality & Architecture
**Category**: SOLID | Service Pattern | Complexity | TypeScript | DRY | Testability | Naming

**Why it matters**:
Brief explanation of impact on Metarr specifically

**Current pattern**:
```typescript
// Show problematic code snippet
```

**Suggested pattern**:
```typescript
// Show refactored approach
```

**Estimated effort**: Small (<1hr) | Medium (2-4hr) | Large (>4hr)
**Risk if not fixed**: Low | Medium | High | Critical
**Phase impact**: Which elemental phases are affected
```

---

### Agent 2: Data Integrity & Concurrency

**Priority**: Highest
**Duration**: 3-4 hours
**Focus**: Database design, cache coherence, job queue safety, migration integrity

#### Evaluation Criteria

1. **Database Schema Design**
   - **Normalization**: Redundant columns, data that should be normalized
   - **Column design**: Unused columns, incorrect data types, missing NOT NULL constraints
   - **Default values**: Make sense for business logic?
   - **Composite keys vs surrogate keys**: Appropriateness

2. **Database Indexing**
   - Missing indexes on foreign keys
   - Missing indexes on frequently queried columns (WHERE, JOIN, ORDER BY)
   - Unused indexes (overhead without benefit)
   - Composite index opportunities

3. **Database Relationship Integrity**
   - Missing foreign key constraints
   - Incorrect cascade rules (ON DELETE, ON UPDATE)
   - Orphaned record possibilities
   - Many-to-many junction tables properly designed?

4. **Transaction Management**
   - Transactions used for multi-step operations?
   - Transaction nesting avoided?
   - Lock ordering consistent (prevent deadlocks)?
   - Timeout on all transactions?
   - Rollback strategies in place?

5. **Cache-Library Coherence** (Critical for Metarr's value proposition)
   - **Two-copy system integrity**: Cache ↔ Library sync patterns correct?
   - **Asset tier transitions**: Candidate → Cache → Library flow safe?
   - **SHA256 sharding**: First 2 chars / next 2 chars / full hash correct?
   - **Orphaned asset detection**: Assets in cache without DB records?
   - **Asset deduplication**: Content-addressed storage working correctly?
   - **Cache verification**: Scheduled verification tasks cover all scenarios?

6. **Cache Lifecycle Management**
   - Cache eviction policies defined and implemented?
   - Recycle bin policies (when to purge deleted assets)?
   - Cache size monitoring and limits?
   - Cache corruption detection and recovery?

7. **Job Queue Idempotency** (Critical for phase independence)
   - **All jobs idempotent**: Can run twice safely without corruption?
   - **Enrichment jobs**: Overwrite metadata cleanly?
   - **Publishing jobs**: Atomic file operations (write temp, rename)?
   - **Scan jobs**: Handle existing entries correctly?
   - **Asset selection jobs**: Concurrent selections don't conflict?

8. **Concurrency & Race Conditions**
   - File writes atomic (write to temp, then rename)?
   - Database updates use transactions?
   - Concurrent asset selections coordinated?
   - Shared resource access synchronized?

9. **Job Queue Health**
   - **Circuit breakers**: Configured per job type?
   - **Retry logic**: Exponential backoff implemented correctly?
   - **Max retry counts**: Sensible limits (3-5)?
   - **Queue backpressure**: Max queue size enforced?
   - **Job priority**: Priority inversion prevented?
   - **Worker pool sizing**: Appropriate for workload?
   - **Job cancellation**: Safe mid-execution cancellation?

10. **Migration Safety**
    - **Reversibility**: Migrations can be rolled back?
    - **Data transformations**: Tested with production-like data?
    - **Up + down migrations**: Both tested?
    - **Schema version consistency**: Tracking reliable?
    - **Breaking changes**: Identified and documented?
    - **Backup strategies**: Destructive operations have backups?

#### Query Pattern Analysis

Include example of problematic queries:

```markdown
**Example query**:
```sql
-- Current (N+1 problem)
SELECT * FROM movies WHERE monitored = 1;
-- Then for each movie:
SELECT * FROM cache_assets WHERE id = movie.poster_id;
```

**Suggested**:
```sql
-- Fixed with JOIN
SELECT m.*, p.file_path as poster_path
FROM movies m
LEFT JOIN cache_assets p ON m.poster_id = p.id
WHERE m.monitored = 1;
```

**Performance impact**: ~500ms → ~50ms for 100 movies
```

---

## Phase 2: Safety Net Analysis

Agent 3 runs **solo** (depends on findings from Agents 1 & 2).

---

### Agent 3: Error Handling, Security & Resilience

**Priority**: High
**Duration**: 2-3 hours
**Focus**: Error propagation, security vulnerabilities, resilience patterns, observability

**Why Sequential**: Must understand architecture (Agent 1) and data flows (Agent 2) before auditing how errors propagate and are handled.

#### Evaluation Criteria

1. **Error Handling Patterns**
   - **Error boundaries**: Frontend routes wrapped in ErrorBoundary?
   - **Global error handler**: Catches all unhandled rejections in backend?
   - **Phase boundary errors**: Errors don't leak between phases?
   - **Error propagation**: AppError subclasses used consistently?
   - **Error context**: Rich context (stack traces, request IDs, user actions)?

2. **Retry Strategy Consistency**
   - All provider calls use `RetryStrategy`?
   - Retry backoff appropriate (exponential vs linear)?
   - Max retry counts sensible (3-5)?
   - Idempotent operations marked correctly?
   - Non-idempotent operations don't retry?

3. **Error Message Quality**
   - **User-facing errors**: Friendly, actionable, non-technical?
   - **Developer errors**: Include stack traces, context, debugging info?
   - **Error codes**: Consistent across services?
   - **I18n ready**: Error messages can be localized?

4. **Graceful Degradation**
   - Enrichment fails → movie still usable with partial data?
   - Provider down → fallback to cached metadata?
   - Database read fails → retry with backoff or show stale data?
   - FFprobe fails → skip stream info but continue?
   - WebSocket fails → poll fallback works?

5. **Circuit Breaker Usage**
   - Job queue circuit breakers configured per job type?
   - Provider circuit breakers prevent thundering herd?
   - Circuit breaker state observable (metrics/logs)?
   - Circuit breaker thresholds appropriate (failure rate, timeout)?

6. **Security & Input Validation**
   - **Path traversal**: User paths sanitized with `path.basename()`?
     ```typescript
     // ❌ Vulnerable
     const cachePath = path.join(CACHE_PATH, userFilename);

     // ✅ Safe
     const cachePath = path.join(CACHE_PATH, path.basename(userFilename));
     ```
   - **Command injection**: `execFile()` used over `exec()`?
     ```typescript
     // ❌ Vulnerable
     exec(`ffprobe "${userFilePath}"`);

     // ✅ Safe
     execFile('ffprobe', [userFilePath]);
     ```
   - **SQL injection**: Parameterized queries or query builder?
   - **Input validation**: All controller inputs validated with Zod?
   - **NFO XML sanitization**: User data escaped before XML generation (XXE prevention)?

7. **Secret Management**
   - API keys loaded from environment, not hardcoded?
   - Embedded defaults clearly marked as development-only?
   - Secrets not logged (even at DEBUG level)?
   - Sensitive paths redacted in error messages?

8. **CORS & Request Security**
   - CORS configuration appropriate for deployment?
   - Request size limits enforced?
   - Rate limiting for public endpoints?
   - Helmet.js security headers configured?

9. **Resource Cleanup**
   - File handles closed properly (try/finally)?
   - Database connections returned to pool?
   - WebSocket connections cleaned up on disconnect?
   - Event listeners removed when components unmount?
   - Streams properly closed?

10. **Observability & Logging**
    - **Log levels**: Consistent usage (ERROR, WARN, INFO, DEBUG)?
    - **Structured logging**: JSON format for production?
    - **Sensitive data**: Not logged (API keys, user credentials, full file paths)?
    - **Correlation IDs**: Jobs traceable across phases?
    - **Performance logging**: Each phase logs duration?
    - **Log rotation**: Configured and tested?
    - **Error context**: Errors include request ID, user action, phase?

---

## Phase 3: Integration Analysis

Agents 4 and 5 run **in parallel** (both depend on foundation from Phase 1).

---

### Agent 4: Integration & External Dependencies

**Priority**: High
**Duration**: 2-3 hours
**Focus**: Provider APIs, frontend-backend contracts, external binaries, configuration

#### Evaluation Criteria

1. **Provider Integration Integrity**
   - **Rate limiters**: Correct per-provider limits (TMDB: 40/10s, TVDB, Fanart.tv)?
   - **Provider fallback chains**: TMDB fails → TVDB backup implemented?
   - **Capability matrix**: docs/providers/ matches implementation?
   - **Health checks**: Provider health polling accurate?
   - **Cache adapters**: Consistent patterns across TMDB, TVDB, Fanart.tv adapters?
   - **Metadata normalization**: Different provider ID schemes handled?
   - **Stale data detection**: Provider data refresh logic correct?

2. **Provider API Version Compatibility**
   - API versions pinned or checked at runtime?
   - Breaking change detection (provider schema validation)?
   - Provider deprecation warnings handled?

3. **Frontend-Backend API Contracts**
   - **Response shape consistency**: Backend returns what TypeScript types expect?
   - **Null handling**: Backend nulls match frontend optional types?
   - **Pagination patterns**: Consistent across all list endpoints?
   - **Query parameters**: Validated on backend, typed on frontend?
   - **Error responses**: Consistent shape (`{ success: false, error: {...} }`)?

4. **WebSocket Message Schemas**
   - Frontend WebSocket types match backend emission?
   - Message versioning for backward compatibility?
   - Reconnection logic handles missed messages?
   - WebSocket fallback to polling works?

5. **TanStack Query Patterns**
   - **Query keys**: Stable and consistent across components?
   - **Cache invalidation**: Mutations invalidate correct queries?
   - **Optimistic updates**: Rollback on error works correctly?
   - **Stale time**: Appropriate for data volatility?
   - **Query dependencies**: Dependent queries disabled when parent loading?

6. **External Binary Dependencies**
   - **FFprobe**: Availability checked at startup?
   - **FFprobe errors**: Graceful handling (missing file, corrupt media)?
   - **ImageMagick (phash)**: Optional dependency gracefully degrades?
   - **Sharp**: Image processing errors don't crash app?
   - **Binary paths**: Configurable via environment variables?

7. **Dependency Version Management**
   - **npm dependencies**: Pinned exact versions or sensible ranges (^)?
   - **Security vulnerabilities**: `npm audit` results reviewed?
   - **Deprecated dependencies**: Identified and migration planned?
   - **License compatibility**: All dependencies compatible with project license?

8. **Configuration Management**
   - **Schema validation**: All config validated with Zod at startup?
   - **Environment variables**: Documented, validated, have defaults?
   - **Configuration dependencies**: Provider priority affects asset selection (tested)?
   - **Runtime reloading**: Config changes require restart or hot-reload safely?
   - **Configuration documentation**: .env.example matches actual usage?

---

### Agent 5: Performance & Resource Management

**Priority**: Medium
**Duration**: 2-3 hours
**Focus**: Query optimization, async patterns, memory leaks, frontend performance

#### Evaluation Criteria

1. **Database Query Performance**
   - **N+1 queries**: Loop with query inside → JOIN or batch load?
   - **Missing eager loading**: Related data fetched with main query?
   - **Full table scans**: All frequently-queried columns indexed?
   - **Inefficient JOINs**: Subquery opportunities or denormalization?
   - **Query result size**: Large results paginated?
   - **Connection pooling**: Pool size appropriate for load?

2. **Async & Parallelism Patterns**
   - **Sequential awaits**: Could use `Promise.all()` for parallel execution?
   - **Blocking operations**: Synchronous file I/O in async context?
   - **Hot path performance**: Critical paths (enrichment, publishing) optimized?
   - **Asset downloads**: Parallelism tuned (not too many, not too few)?

3. **Memory Management**
   - **Event listeners**: Cleanup on component unmount (React) or service shutdown?
   - **Large objects**: Retained longer than necessary?
   - **Stream handling**: Large files processed with streams, not loaded fully?
   - **Cache size limits**: In-memory caches have max size?
   - **Memory profiling**: Long-running jobs monitored for leaks?

4. **Frontend Performance**
   - **Bundle size**: Production bundle analyzed and optimized?
   - **Code splitting**: Routes lazy-loaded?
   - **React re-renders**: Unnecessary renders (React.memo opportunities)?
   - **Heavy computations**: Moved outside render or memoized?
   - **WebSocket message volume**: Throttling/debouncing where appropriate?
   - **Image optimization**: Lazy loading, responsive images?

5. **Algorithmic Efficiency**
   - **O(n²) loops**: Could be O(n) with Map/Set?
   - **Repeated regex compilation**: Compile once, reuse?
   - **Unnecessary array iterations**: Filter + map → reduce?
   - **FFprobe batching**: Multiple files probed in parallel?

6. **Caching Strategies**
   - **Provider responses**: Cached appropriately (TTL set)?
   - **Database query results**: Hot queries cached in-memory?
   - **Asset metadata**: Read from cache before filesystem?
   - **Cache invalidation**: Stale data purged correctly?

7. **Logging Performance**
   - Expensive operations (JSON.stringify) avoided in hot paths?
   - Debug logging disabled in production?
   - Log levels checked before string interpolation?

---

## Phase 4: User Experience Analysis

Agent 6 runs **solo** (needs complete picture from all prior agents).

---

### Agent 6: User Experience & Documentation

**Priority**: Medium
**Duration**: 2-3 hours
**Focus**: Component patterns, accessibility, styling, documentation accuracy

**Why Sequential**: Can't verify documentation accuracy until system is fully understood.

#### Evaluation Criteria

1. **Component Architecture & Composition**
   - **Component size**: Components >300 lines should be split?
   - **Composition opportunities**: Repeated patterns abstracted?
   - **Prop drilling**: >3 levels deep → context or state management?
   - **Custom hooks**: Reusable logic extracted to hooks?
   - **Hook patterns**: TanStack Query used consistently?

2. **React Best Practices**
   - **Key props**: Lists use stable, unique keys (not index)?
   - **useEffect dependencies**: Exhaustive and correct?
   - **useMemo/useCallback**: Used where beneficial (not over-optimized)?
   - **Side effects in render**: None present?
   - **Error boundaries**: Catch component errors?

3. **State Management**
   - **Local vs global**: State at appropriate level?
   - **Derived state**: Computed, not stored?
   - **Redundant state**: Same data duplicated across components?
   - **Server state**: Always managed by TanStack Query, never local state?

4. **WCAG 2.1 Accessibility (Level AA Target)**
   - **Images**: Alt text provided for all meaningful images?
   - **Color contrast**: Text meets 4.5:1 ratio (normal text), 3:1 (large text)?
   - **ARIA labels**: Interactive elements without text have aria-label?
   - **Keyboard navigation**: All interactive elements focusable and operable?
   - **Focus management**: Modals trap focus, restore on close?
   - **Screen reader**: Semantic HTML used (nav, main, article)?
   - **Form labels**: All inputs have associated labels?

5. **Styling Consistency**
   - **Tailwind v4 patterns**: Modern syntax (`@theme` directive)?
   - **Violet primary**: `#8b5cf6` used consistently?
   - **Component variants**: shadcn/ui variant patterns followed?
   - **Spacing scale**: Tailwind spacing units used (no arbitrary values)?
   - **Typography scale**: Consistent font sizes and weights?
   - **Dark mode**: Colors work in both light and dark themes?

6. **Error User Experience**
   - **Error messages**: User-friendly (no stack traces shown to users)?
   - **Loading states**: All async operations show loading UI?
   - **Empty states**: Helpful messages when no data?
   - **Fallback UI**: Missing data doesn't break layout?
   - **Toast notifications**: Appropriate usage (success/error, not info overload)?

7. **Documentation Accuracy & Completeness**
   - **CLAUDE.md**: Reflects current architecture and workflows?
   - **Phase docs**: Match implementation (scan, enrich, publish, player sync)?
   - **File structure**: Examples in docs match actual structure?
   - **Commands**: npm scripts in docs work as described?
   - **Environment variables**: All variables documented in .env.example?
   - **Configuration examples**: Tested and functional?

8. **Code Comments & JSDoc**
   - **Public APIs**: JSDoc comments for exported functions/classes?
   - **Complex algorithms**: "Why" explained, not just "what"?
   - **Outdated comments**: Updated after refactors?
   - **Over-commenting**: Obvious code not commented?
   - **Non-obvious decisions**: Edge cases and quirks documented?

9. **Technical Documentation**
   - **Provider API quirks**: Documented (rate limits, pagination)?
   - **Complex workflows**: Sequence diagrams or flowcharts?
   - **Design decisions**: Architecture Decision Records (ADRs)?
   - **Deprecated features**: Migration guides provided?
   - **Getting started**: Still works for new developers?

10. **Documentation Cleanup**
    - **Broken links**: All internal links work?
    - **Obsolete docs**: Old design docs removed or archived?
    - **Removed features**: Documentation deleted?
    - **Outdated screenshots**: UI images match current interface?

---

## Severity Levels

Use these guidelines to assign severity ratings:

### Critical
- **Data corruption risk**: Cache-library sync bugs, migration issues
- **Security vulnerability**: Path traversal, command injection, XSS
- **System instability**: Deadlocks, memory leaks, cascading failures
- **Complete phase failure**: Phase boundary violations that break automation

**Fix immediately** before any other work.

---

### High
- **Significant SOLID violations**: God objects, high coupling
- **Performance issues**: >500ms impact on user operations
- **Important documentation out of sync**: Phase docs don't match implementation
- **Missing critical indexes**: Full table scans on large tables
- **Broken fallback chains**: Provider failures cascade

**Fix in current sprint** or next sprint at latest.

---

### Medium
- **Moderate complexity**: Functions 50-100 lines, 3-level nesting
- **Minor performance**: <500ms impact but noticeable
- **Naming inconsistencies**: Confusing but not breaking
- **Outdated documentation**: Accurate but references old patterns
- **Unused code**: Increases maintenance burden
- **Missing accessibility**: WCAG failures on non-critical paths

**Fix in next 2-3 sprints** or add to backlog with priority.

---

### Low
- **Nice-to-have refactoring**: Could be simpler but works fine
- **Stylistic inconsistencies**: Minor deviations from patterns
- **Optional optimizations**: Micro-optimizations with minimal gain
- **Documentation polish**: Typos, better examples
- **Code style**: Formatting, import organization

**Add to backlog** or fix when touching that code anyway.

---

## Audit Report Structure

Reports are saved to `docs/audits/YYYY-MM-DD_audit_report.md`

```markdown
# Metarr Codebase Audit Report

**Date**: YYYY-MM-DD
**Scope**: Full codebase | Specific area description
**Duration**: X hours across 4 phases
**Auditor**: AI Assistant | Developer Name

---

## Executive Summary

**Total Findings**: X (Critical: X, High: X, Medium: X, Low: X)

**Code Health Score**: X/100
(Starting at 100, subtract: Critical=-20, High=-10, Medium=-5, Low=-1)

**Top 3 Priority Areas**:
1. [Most critical issue category with count]
2. [Second priority with count]
3. [Third priority with count]

**Overall Assessment**: Brief paragraph on codebase health

---

## Phase 1: Foundation Analysis

### Agent 1: Code Quality & Architecture
**Findings**: X total (C: X, H: X, M: X, L: X)

#### SOLID Principles & Design Patterns
[Findings...]

#### Service Architecture Compliance
[Findings...]

#### Dependency Injection & Testability
[Findings...]

#### Code Complexity
[Findings...]

#### TypeScript Best Practices
[Findings...]

#### Dead Code & Code Hygiene
[Findings...]

---

### Agent 2: Data Integrity & Concurrency
**Findings**: X total (C: X, H: X, M: X, L: X)

#### Database Schema & Indexing
[Findings...]

#### Cache-Library Coherence
[Findings...]

#### Job Queue Idempotency & Safety
[Findings...]

#### Migration Safety
[Findings...]

---

## Phase 2: Safety Net Analysis

### Agent 3: Error Handling, Security & Resilience
**Findings**: X total (C: X, H: X, M: X, L: X)

#### Error Handling Patterns
[Findings...]

#### Security & Input Validation
[Findings...]

#### Resilience & Circuit Breakers
[Findings...]

#### Observability & Logging
[Findings...]

---

## Phase 3: Integration Analysis

### Agent 4: Integration & External Dependencies
**Findings**: X total (C: X, H: X, M: X, L: X)

#### Provider Integration
[Findings...]

#### Frontend-Backend Contracts
[Findings...]

#### External Dependencies
[Findings...]

#### Configuration Management
[Findings...]

---

### Agent 5: Performance & Resource Management
**Findings**: X total (C: X, H: X, M: X, L: X)

#### Database Performance
[Findings...]

#### Async & Parallelism
[Findings...]

#### Memory Management
[Findings...]

#### Frontend Performance
[Findings...]

---

## Phase 4: User Experience Analysis

### Agent 6: User Experience & Documentation
**Findings**: X total (C: X, H: X, M: X, L: X)

#### Component Architecture
[Findings...]

#### Accessibility (WCAG 2.1)
[Findings...]

#### Styling Consistency
[Findings...]

#### Documentation Accuracy
[Findings...]

---

## Cross-Agent Themes

**Patterns appearing across multiple agents**:
1. [Theme 1 - e.g., "Inconsistent error handling across services"]
   - Agent 1 findings: [count]
   - Agent 3 findings: [count]
2. [Theme 2 - e.g., "Provider fallback chains incomplete"]
   - Agent 3 findings: [count]
   - Agent 4 findings: [count]
3. [Theme 3]

---

## Metrics Dashboard

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| **Code Health Score** | X/100 | 85/100 | 🔴 <70 / 🟡 70-84 / 🟢 ≥85 |
| **Critical Issues** | X | 0 | 🔴 >0 / 🟢 0 |
| **High Issues** | X | <5 | 🔴 >10 / 🟡 5-10 / 🟢 <5 |
| **Test Coverage** | X% | 80% | 🔴 <60% / 🟡 60-79% / 🟢 ≥80% |
| **`any` Usage** | X | <10 | 🔴 >20 / 🟡 10-20 / 🟢 <10 |
| **`@ts-ignore` Count** | X | 0 | 🔴 >5 / 🟡 1-5 / 🟢 0 |
| **Documented APIs** | X% | 100% | 🔴 <80% / 🟡 80-99% / 🟢 100% |
| **WCAG Compliance** | X% | 95% | 🔴 <70% / 🟡 70-94% / 🟢 ≥95% |

---

## Prioritized Remediation Roadmap

### Immediate (This Sprint) - Critical & Selected High

**Estimated effort**: X hours

1. **[CRITICAL] Issue Title** - Agent 2, Cache Coherence
   - Location: `path/to/file.ts:123`
   - Effort: Medium (2-4hr)
   - Impact: Prevents cache corruption

2. **[CRITICAL] Issue Title** - Agent 3, Security
   - Location: `path/to/file.ts:456`
   - Effort: Small (<1hr)
   - Impact: Closes path traversal vulnerability

[Continue for all Critical and critical High issues...]

---

### Short Term (Next 2-3 Sprints) - High & Selected Medium

**Estimated effort**: X hours

1. **[HIGH] Issue Title** - Agent 1, Architecture
   - Location: `path/to/file.ts:789`
   - Effort: Large (>4hr)
   - Impact: Reduces coupling, improves testability

[Continue...]

---

### Long Term (Backlog) - Medium & Low

**Estimated effort**: X hours

1. **[MEDIUM] Issue Title** - Agent 5, Performance
   - Effort: Medium
   - Impact: Improves enrichment speed by ~100ms

[Continue...]

---

### Technical Debt Accepted (Deferred with Rationale)

1. **[MEDIUM] Issue Title** - Agent 6, Documentation
   - **Reason**: Low user impact, will address during next documentation sprint
   - **Revisit**: 2024-Q2

2. **[LOW] Issue Title** - Agent 5, Micro-optimization
   - **Reason**: Negligible performance gain (<10ms), high refactor risk
   - **Revisit**: Only if profiling shows bottleneck

---

## Testing Recommendations

Based on findings, prioritize adding tests for:

1. **[Component/Service Name]**
   - Type: Unit | Integration | E2E
   - Reason: [Critical path with no coverage, found by Agent X]

2. **[Component/Service Name]**
   - Type: Unit | Integration | E2E
   - Reason: [Complex logic, error-prone, found by Agent X]

---

## Architectural Improvements

High-level refactoring opportunities:

1. **[Refactoring Name]**
   - **Scope**: Multiple services/components
   - **Benefit**: Reduces coupling, improves testability
   - **Effort**: X hours
   - **Found by**: Agents 1, 2

2. **[Refactoring Name]**
   - **Scope**: Provider integration layer
   - **Benefit**: Consistent error handling, easier to add providers
   - **Effort**: X hours
   - **Found by**: Agents 3, 4

---

## Documentation Action Items

1. **Update CLAUDE.md**:
   - Section: [Phase descriptions]
   - Change: [Reflect current job queue implementation]

2. **Update docs/phases/ENRICHMENT.md**:
   - Change: [Document new asset selection algorithm]

3. **Add missing JSDoc**:
   - Files: `[list of files]`
   - Focus: Public API methods

---

## Dependency Updates

| Package | Current | Latest | Security | Breaking | Priority |
|---------|---------|--------|----------|----------|----------|
| `package-name` | 1.2.3 | 2.0.0 | 🔴 Critical | Yes | High |
| `package-name` | 4.5.6 | 4.5.9 | 🟢 None | No | Low |

---

## Conclusion

[2-3 paragraph summary]:
- Overall codebase health assessment
- Most critical risks and immediate actions
- Positive observations (what's working well)
- Recommended focus for next sprint
- Long-term architectural direction

**Next Audit Recommended**: [Date, typically 3-6 months or after next major feature]

---

**Report Version**: 2.0
**Workflow Version**: 2.0
**Generated**: YYYY-MM-DD HH:MM
```

---

## Running an Audit

### Preparation

1. **Ensure stable state**:
   - All tests passing (`npm test`)
   - No uncommitted changes (optional but recommended)
   - Latest dependencies installed (`npm install`)
   - Development environment clean (`npm run dev:clean`)

2. **Set scope**: Full codebase or specific area?

3. **Allocate time**: Block 10-13 hours or split across multiple days

---

### Execution

#### Request Format for AI Assistant

**Full Audit**:
```
Please run a full codebase audit following the docs/audit_workflow.md process.
Use the 6-agent, 4-phase structure.
Save the report to docs/audits/YYYY-MM-DD_audit_report.md
```

**Targeted Audit**:
```
Please audit [specific area: enrichment phase / frontend components / cache system]
following the audit_workflow.md process.
Focus on Agents [list relevant agents: 1, 2, 5].
Save findings to docs/audits/YYYY-MM-DD_[area]_audit_report.md
```

---

### Agent Execution Sequence

**Phase 1: Foundation (3-4 hours)**
- Launch Agent 1 (Code Quality & Architecture)
- Launch Agent 2 (Data Integrity & Concurrency)
- **Run in parallel**
- Wait for both to complete

**Phase 2: Safety Net (2-3 hours)**
- Review Phase 1 findings
- Launch Agent 3 (Error Handling, Security & Resilience)
- **Runs solo** (needs architecture and data flow understanding)

**Phase 3: Integration (2-3 hours)**
- Review Phase 2 findings
- Launch Agent 4 (Integration & External Dependencies)
- Launch Agent 5 (Performance & Resource Management)
- **Run in parallel**

**Phase 4: Polish (2-3 hours)**
- Review Phases 1-3 findings
- Launch Agent 6 (User Experience & Documentation)
- **Runs solo** (needs complete system understanding)

---

### Each Agent Should

1. **Read thoroughly**:
   - Relevant source files (controllers, services, components)
   - Configuration files
   - Documentation
   - Test files

2. **Apply evaluation criteria**:
   - Use specific metrics (complexity thresholds, pattern compliance)
   - Show code examples for every finding
   - Estimate effort and risk

3. **Document findings**:
   - Use standard format (location, category, effort, risk)
   - Link related findings across agents
   - Identify phase impacts

4. **Prioritize by severity**:
   - Critical: Data corruption, security, system stability
   - High: Architecture violations, performance, important docs
   - Medium: Moderate complexity, outdated docs, accessibility
   - Low: Nice-to-haves, polish, micro-optimizations

5. **Provide actionable recommendations**:
   - Show current pattern vs suggested pattern
   - Explain specific benefits for Metarr
   - Estimate remediation effort

---

### Post-Audit

1. **Review report** (1-2 hours):
   - Read executive summary
   - Understand code health score
   - Identify cross-agent themes

2. **Prioritize findings** (1 hour):
   - Critical → immediate
   - High → current or next sprint
   - Medium → backlog with priority
   - Low → opportunistic fixes

3. **Create action plan**:
   - Sprint 1: Critical + selected High
   - Sprint 2-3: High + selected Medium
   - Backlog: Medium + Low

4. **Track technical debt**:
   - Document deferred items with rationale
   - Set revisit dates
   - Update tracking system

5. **Schedule remediation**:
   - Block time for fixes
   - Test after each fix
   - Update documentation

6. **Next audit**:
   - Schedule 3-6 months out
   - After next major feature
   - Track improvement over time

---

## Best Practices

### For AI Assistants Conducting Audits

✅ **Do**:
1. **Be specific**: Exact file paths and line numbers
2. **Show examples**: Quote relevant code snippets (5-15 lines)
3. **Explain impact**: Why does this matter to Metarr specifically?
4. **Suggest solutions**: Don't just identify problems
5. **Consider context**: Metarr's phase-based architecture and elemental phases
6. **Check everything**: Code, tests, docs, configs, scripts
7. **No false positives**: Only flag genuine issues with evidence
8. **Estimate effort**: Help prioritize work (Small/Medium/Large)
9. **Link findings**: Reference related issues across agents
10. **Track metrics**: Calculate code health score and other metrics

❌ **Don't**:
1. Skip reading files (audit requires thorough reading)
2. Make assumptions without evidence
3. Flag style preferences as issues
4. Ignore positive patterns (mention what's working well)
5. Overwhelm with low-priority issues (focus on Critical/High)
6. Use vague locations ("multiple files")
7. Suggest complex refactors without justification
8. Miss cross-agent themes

---

### For Developers Using Audits

✅ **Do**:
1. **Take time**: Don't rush through findings (10-13hr audit + 2-3hr review)
2. **Ask questions**: Clarify reasoning if unclear
3. **Push back**: Not all findings may be valid (context matters)
4. **Batch similar**: Group related fixes together
5. **Test after**: Verify fixes don't break functionality
6. **Update docs**: Keep documentation in sync with changes
7. **Track debt**: Not everything needs immediate fixing
8. **Celebrate**: Acknowledge improvements in metrics over time

❌ **Don't**:
1. Fix everything at once (prioritize Critical → High → Medium → Low)
2. Skip testing after fixes
3. Ignore architectural findings (address root causes, not symptoms)
4. Defer Critical issues (data corruption, security = immediate fix)
5. Forget to update docs after refactors
6. Treat audit as checklist (understand the "why")

---

## Continuous Improvement

This workflow document should evolve based on experience:

- **Add new criteria**: As patterns emerge in codebase
- **Adjust severity thresholds**: Based on real impact
- **Refine agent responsibilities**: If overlap or gaps found
- **Update industry standards**: As React, TypeScript, Node.js evolve
- **Incorporate new tools**: Linters, static analyzers, profilers
- **Track metrics over time**: Code health score, test coverage trends

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-10-26 | Initial version (original 6 agents) |
| 2.0 | 2025-01-17 | Enhanced to consolidated 6-agent, 4-phase structure with deeper evaluation criteria |

---

**Next Review**: After first full audit execution with new structure

**Maintained by**: Development team + AI assistant audits

**Feedback**: Create issue in GitHub with "audit-workflow" label
