# Metarr Audit Workflow

## Purpose

The Audit Workflow is a comprehensive, multi-agent analysis system that evaluates the codebase through the lens of specialized technical experts. Each agent represents a domain expert who examines the codebase from their specialized perspective and identifies issues that matter to their field.

**Key Principle**: "Expert agents identify problems with impact analysis, AI remediation agents decide how to fix."

---

## Core Design Philosophy

### Specialized Expert Team

Instead of generic code reviewers, we deploy a team of specialized experts mirroring a real enterprise development team:

- **Database Engineer** - Schema design, query optimization, data integrity
- **Application Architect** - Service patterns, SOLID principles, system design
- **DevOps Engineer** - Job orchestration, worker pools, system reliability
- **Storage Architect** - Cache integrity, asset lifecycle, file operations
- **Integration Engineer** - External APIs, rate limiting, fallback strategies
- **Security Engineer** - Vulnerabilities, input validation, secret management
- **Performance Engineer** - Bottlenecks, memory leaks, algorithmic efficiency
- **Frontend Architect** - React patterns, component design, state management
- **UX Engineer** - Accessibility, design systems, user experience
- **QA Engineer** - Test coverage, testability, integration testing
- **Documentation Lead** - Doc-code alignment, API contracts, accuracy

### Execution Model

- **Maximum 6 concurrent agents** (resource management)
- **Wave-based execution** (logical grouping)
- **Multi-file output** (each agent writes their own report immediately)
- **Summary index report** (navigation and remediation planning)
- **Impact-focused findings** (what/why, not how)

### Output Philosophy

Each finding includes:
- **What** is wrong (location references)
- **Why** it matters (impact, consequences)
- **Expected behavior** (goal state)
- NO code snippets (reduces bloat, avoids staleness)
- YES file:line references (easy navigation)

---

## When to Run

- After completing major features
- Before release milestones
- When complexity feels unwieldy
- After significant dependency upgrades
- Quarterly optimization passes
- When documentation drifts from implementation

---

## Expert Agent Team

### Wave 1: Backend Foundation (6 agents)

**Run in parallel, no dependencies**

#### 1. Database Engineer

**Expertise**: PostgreSQL/SQLite schema design, indexing strategies, query optimization, migration safety

**Focus Areas**:
- Schema normalization and design patterns
- Index coverage for foreign keys and query patterns
- Relationship integrity and cascade rules
- N+1 query detection
- Migration reversibility and safety
- Data integrity constraints

**Evaluation Questions**:
- Are all foreign keys indexed?
- Are frequently queried columns (WHERE/JOIN/ORDER BY) indexed?
- Do migrations have tested up/down paths?
- Are there N+1 query patterns in service layer?
- Is ON DELETE/ON UPDATE cascade behavior correct for the relationships?
- Are there possibilities for orphaned records?
- Are constraints enforcing data integrity appropriately?

**Files to Analyze**:
- [src/database/schema.sql](src/database/schema.sql)
- [src/database/migrations/](src/database/migrations/)
- Query patterns in [src/services/](src/services/)

---

#### 2. Application Architect

**Expertise**: SOLID principles, dependency injection, service patterns, architectural design

**Focus Areas**:
- Single Responsibility Principle violations
- Service lifecycle management (singleton/application-scoped/request-scoped)
- Dependency injection and testability
- Circular dependencies
- God objects and high coupling
- Code complexity metrics

**Evaluation Questions**:
- Does each service have a single, clear responsibility?
- Are service lifetimes appropriate for their usage patterns?
- Are stateful services properly managed to avoid concurrency issues?
- Are dependencies injected via constructor for testability?
- Are there circular dependencies in the import graph?
- Are there God objects (>500 lines) that should be decomposed?
- Are functions too complex (>50 lines, >5 parameters, >3 nesting levels)?

**Files to Analyze**:
- [src/services/](src/services/)
- [src/controllers/](src/controllers/)
- [src/app.ts](src/app.ts) (service instantiation)
- [src/utils/](src/utils/)

---

#### 3. DevOps Engineer

**Expertise**: Job orchestration, worker pools, concurrency, reliability patterns

**Focus Areas**:
- Job idempotency (safe to retry)
- Concurrency and race conditions
- Circuit breaker configuration
- Retry logic and backoff strategies
- Queue backpressure and health
- Worker pool sizing

**Evaluation Questions**:
- Are all jobs safe to run twice without corruption?
- Are file writes atomic (temp file → rename)?
- Are database updates wrapped in transactions where necessary?
- Are circuit breakers configured appropriately for external dependencies?
- Is exponential backoff implemented for retries?
- Is max queue size enforced to prevent memory issues?
- Are worker pool sizes appropriate for the workload?

**Files to Analyze**:
- [src/services/JobQueue*.ts](src/services/)
- [src/workers/](src/workers/)
- Circuit breaker configuration
- Job handlers in services

---

#### 4. Storage Architect

**Expertise**: File systems, cache coherence, asset lifecycle, content-addressed storage

**Focus Areas**:
- Cache-library two-copy integrity
- SHA256 sharding correctness
- Asset tier transitions (Candidate → Cache → Library)
- Orphaned asset detection
- Cache eviction policies
- Atomic file operations

**Evaluation Questions**:
- Is SHA256 sharding implemented correctly for content addressing?
- Are cache and library always kept in sync?
- Are deletions ordered to prevent orphaned files?
- Are downloads atomic (temp file → rename)?
- Are file handles closed in all code paths (try/finally)?
- Is cache verification detecting all inconsistencies?
- Are recycle bin policies preventing unbounded growth?

**Files to Analyze**:
- [src/services/CacheService.ts](src/services/CacheService.ts)
- [src/services/AssetManager.ts](src/services/AssetManager.ts)
- Cache verification tasks
- Recycle bin implementation

---

#### 5. Integration Engineer

**Expertise**: External APIs, HTTP clients, rate limiting, resilience patterns

**Focus Areas**:
- Provider rate limiting compliance
- Fallback chain implementation
- Provider health monitoring
- Metadata normalization across providers
- API version compatibility
- Circuit breakers per provider

**Evaluation Questions**:
- Are rate limiters correctly configured per provider's documented limits?
- Are documented fallback chains actually implemented in code?
- Is provider health polling accurate and actionable?
- Are different provider ID schemes normalized consistently?
- Are API versions pinned or validated at runtime?
- Do circuit breakers prevent cascading failures to external providers?
- Are provider-specific quirks documented and handled?

**Files to Analyze**:
- [src/services/providers/](src/services/providers/)
- Provider adapters (TMDB, TVDB, Fanart.tv)
- Rate limiter configuration
- [docs/providers/](docs/providers/) - Compare implementation to docs

---

#### 6. API Engineer

**Expertise**: REST API design, input validation, middleware patterns, security

**Focus Areas**:
- Input validation coverage
- API contract consistency
- Response shape uniformity
- Security vulnerabilities (path traversal, SQL injection, command injection)
- Middleware application
- Error response formats

**Evaluation Questions**:
- Are all controller inputs validated (preferably with schema validation like Zod)?
- Are response shapes consistent across endpoints?
- Are pagination patterns uniform?
- Are user-provided paths sanitized against path traversal?
- Are all database queries parameterized (no string concatenation)?
- Is error handling middleware catching all errors?
- Are security headers configured appropriately?

**Files to Analyze**:
- [src/controllers/](src/controllers/)
- [src/routes/](src/routes/)
- [src/validation/](src/validation/)
- [src/middleware/](src/middleware/)

---

### Wave 2: Frontend & Cross-Cutting (6 agents)

**Run after Wave 1 completes**

#### 7. Security Engineer

**Expertise**: Security vulnerabilities, error handling, secrets management, resource cleanup

**Focus Areas**:
- Input sanitization (path traversal, command injection, SQL injection)
- Error propagation and logging
- Secret management (env vars, no hardcoding)
- Resource cleanup (file handles, connections, listeners)
- XML/HTML sanitization (XSS, XXE prevention)
- CORS configuration

**Evaluation Questions**:
- Are user-provided paths sanitized against traversal attacks?
- Is command execution using safe APIs (execFile over exec)?
- Are all database queries parameterized?
- Are API keys loaded from environment variables, not hardcoded?
- Are file handles closed in finally blocks?
- Are secrets redacted from logs at all levels?
- Is user-generated content sanitized before XML/HTML output?
- Is CORS configured appropriately for the deployment model?

**Files to Analyze**:
- All [src/](src/) files
- Error handling middleware
- Logging configuration
- [src/config/](src/config/) - Environment usage

---

#### 8. Performance Engineer

**Expertise**: Profiling, optimization, memory management, algorithmic efficiency

**Focus Areas**:
- N+1 query patterns
- Sequential operations that could be parallelized
- Memory leaks (listeners, retained objects)
- Algorithmic complexity (O(n²) loops)
- Cache effectiveness
- Stream usage for large data

**Evaluation Questions**:
- Are there loops with database queries inside (N+1 pattern)?
- Are independent async operations using Promise.all() for parallelism?
- Are event listeners cleaned up properly?
- Are there O(n²) patterns that could use Map/Set for O(n)?
- Are large files streamed instead of loaded into memory?
- Are expensive provider responses cached with appropriate TTL?
- Are hot paths optimized for performance?

**Files to Analyze**:
- [src/services/](src/services/)
- Database query patterns
- Job workers
- Provider adapters

---

#### 9. Frontend Architect

**Expertise**: React patterns, component composition, hooks, state management

**Focus Areas**:
- Component size and responsibility
- Prop drilling depth
- Custom hook patterns
- React best practices (keys, useEffect deps, memo usage)
- Error boundaries
- Server state management

**Evaluation Questions**:
- Are components appropriately sized and focused?
- Is prop drilling excessive (>3 levels suggests need for context)?
- Is reusable logic extracted to custom hooks?
- Are keys stable and unique (not array indices)?
- Are useEffect dependencies correct and exhaustive?
- Is server state managed separately from local UI state?
- Are error boundaries catching component errors appropriately?

**Files to Analyze**:
- [public/frontend/src/components/](public/frontend/src/components/)
- [public/frontend/src/pages/](public/frontend/src/pages/)
- [public/frontend/src/hooks/](public/frontend/src/hooks/)

---

#### 10. UX Engineer

**Expertise**: WCAG accessibility, design systems, user experience, styling

**Focus Areas**:
- WCAG 2.1 Level AA compliance
- Design system consistency
- Color contrast ratios
- Keyboard navigation and focus management
- Loading/error/empty states
- Semantic HTML

**Evaluation Questions**:
- Do meaningful images have alt text?
- Is color contrast ratio compliant (4.5:1 for normal text, 3:1 for large)?
- Are interactive elements keyboard accessible?
- Do modals trap focus and restore on close?
- Are loading states shown for all async operations?
- Are error messages user-friendly (no technical jargon or stack traces)?
- Is semantic HTML used (nav, main, article, etc.)?
- Are form inputs properly labeled?

**Files to Analyze**:
- [public/frontend/src/components/](public/frontend/src/components/)
- [public/frontend/src/styles/](public/frontend/src/styles/)
- Tailwind/styling configuration

---

#### 11. Frontend Performance Engineer

**Expertise**: Bundle optimization, rendering performance, network efficiency

**Focus Areas**:
- Bundle size optimization
- Code splitting and lazy loading
- Unnecessary re-renders
- WebSocket message volume
- Image optimization
- Virtual scrolling for large lists

**Evaluation Questions**:
- Is production bundle size reasonable (<500kb gzipped is good target)?
- Are routes lazy-loaded with code splitting?
- Are expensive components wrapped with React.memo where beneficial?
- Are WebSocket messages throttled/debounced appropriately?
- Are large lists virtualized?
- Are expensive calculations memoized?
- Are images lazy-loaded and optimized?

**Files to Analyze**:
- [public/frontend/src/](public/frontend/src/)
- Vite/build configuration
- WebSocket message handlers

---

#### 12. QA Engineer

**Expertise**: Test coverage, test quality, testability patterns, integration testing

**Focus Areas**:
- Critical path coverage
- Integration tests for system boundaries
- Test quality and maintainability
- Service mockability
- Test organization
- E2E workflow coverage

**Evaluation Questions**:
- Do critical services have good test coverage (aim for >80%)?
- Are system boundaries tested with integration tests?
- Are tests using clear patterns (Arrange-Act-Assert)?
- Are services mockable via dependency injection?
- Are test utilities shared appropriately to avoid duplication?
- Are there E2E tests for complete workflows?
- Are tests stable and not brittle?

**Files to Analyze**:
- `**/*.test.ts`
- `**/*.spec.ts`
- Test utilities
- Service testability patterns

---

### Wave 3: Documentation & Integration (5 agents)

**Run after Wave 2 completes**

#### 13. Documentation Lead

**Expertise**: Documentation accuracy, code-doc alignment, API documentation

**Focus Areas**:
- Core documentation reflects current architecture
- Phase docs match implementation
- Code examples compile and execute
- API endpoint documentation accuracy
- Environment variable documentation
- Configuration schema docs

**Evaluation Questions**:
- Does CLAUDE.md reflect current architecture and patterns?
- Do phase docs match actual implementation?
- Do code examples in docs compile and run?
- Do all documented endpoints exist in routes?
- Are all environment variables in .env.example actually used in code?
- Does database schema documentation match schema.sql?
- Are file paths in examples accurate to current structure?

**Why This Matters**:
Documentation misalignment creates false mental models for AI agents, causing:
- Debugging non-existent features
- Wrong assumptions during fixes
- Wasted time on phantom issues
- Incorrect remediation approaches

**Files to Analyze**:
- [CLAUDE.md](CLAUDE.md)
- [docs/](docs/) - All markdown files
- Compare code examples to actual source
- Verify API docs against [src/routes/](src/routes/)
- Check env vars in docs vs [src/config/](src/config/)

---

#### 14. Contract Engineer

**Expertise**: Frontend-backend integration, type safety, API contracts, WebSocket schemas

**Focus Areas**:
- Frontend TypeScript types match backend responses
- Null handling consistency
- Pagination pattern uniformity
- WebSocket message type safety
- Error response shape consistency
- Query parameter validation

**Evaluation Questions**:
- Do frontend types match backend response shapes?
- Are backend nullable fields reflected in frontend optional types?
- Are pagination patterns consistent across all endpoints?
- Do frontend WebSocket types match backend emissions?
- Are error responses using a consistent shape?
- Are query parameters validated on the backend?
- Is there type-safe communication between frontend and backend?

**Files to Analyze**:
- [src/types/](src/types/)
- [public/frontend/src/types/](public/frontend/src/types/)
- [src/controllers/](src/controllers/) - Response shapes
- [public/frontend/src/api/](public/frontend/src/api/)
- WebSocket message definitions

---

#### 15. TypeScript Engineer

**Expertise**: Type safety, generics, type patterns, null handling

**Focus Areas**:
- Type safety levels
- Generic usage and constraints
- Type patterns (interface vs type, enum vs const)
- Null handling patterns
- Type sharing and reuse

**Evaluation Questions**:
- Is `any` usage minimized and justified where used?
- Are all functions properly typed with return types?
- Is `@ts-ignore` usage justified (count and evaluate necessity)?
- Are generics used correctly with appropriate constraints?
- Is nullish coalescing (??) preferred over || operator for null checks?
- Are types shared to avoid duplication?
- Are union and intersection types used appropriately?

**Files to Analyze**:
- All `**/*.ts` and `**/*.tsx` files
- [src/types/](src/types/)
- Evaluate `any` and `@ts-ignore` usage patterns

---

#### 16. State Management Engineer

**Expertise**: React state, TanStack Query, cache invalidation, derived state

**Focus Areas**:
- State placement (local vs global)
- Derived state (computed, not stored)
- Query cache patterns
- Redundant state elimination
- Immutable update patterns
- Query dependencies

**Evaluation Questions**:
- Is state at the appropriate level (not over-globalized)?
- Is derived state computed rather than duplicated and stored?
- Are query keys stable and consistent?
- Do mutations invalidate the correct queries?
- Are optimistic updates rolling back on error?
- Are dependent queries disabled when parent is loading?
- Are immutable update patterns used consistently?

**Files to Analyze**:
- [public/frontend/src/hooks/](public/frontend/src/hooks/)
- [public/frontend/src/api/](public/frontend/src/api/)
- TanStack Query usage across components

---

#### 17. Configuration Engineer

**Expertise**: Environment configuration, dependency management, external binaries

**Focus Areas**:
- Config validation at startup
- Environment variable coverage
- Dependency version management
- Security vulnerabilities
- External binary availability
- Development vs production configs

**Evaluation Questions**:
- Is all configuration validated at startup (preferably with schema validation)?
- Do environment variables have sensible defaults?
- Are npm dependencies using appropriate version ranges?
- Are there security vulnerabilities (run npm audit)?
- Are external binary dependencies (FFprobe, etc.) checked at startup?
- Are binary paths configurable via environment?
- Is there graceful degradation when optional dependencies are missing?

**Files to Analyze**:
- [src/config/](src/config/)
- [.env.example](.env.example)
- [package.json](package.json)
- Binary dependency usage

---

## Severity Classification

### 🔴 Critical

**Fix immediately before any other work.**

**Criteria**:
- Data loss or corruption possible
- Security breach possible
- System becomes unusable
- Core value proposition violated

**Examples**:
- Cache-library sync bugs causing asset loss
- SQL injection vulnerabilities
- Memory leaks causing crashes
- Phase boundary violations breaking automation chain

---

### 🟠 High

**Fix in current or next sprint.**

**Criteria**:
- Major architecture violations
- Significant performance degradation (>500ms impact)
- Important features broken or missing
- Testing extremely difficult

**Examples**:
- God objects with hundreds of lines
- Missing indexes causing full table scans on large tables
- Provider fallback chains not implemented (docs say they exist)
- N+1 queries in hot paths

---

### 🟡 Medium

**Fix in next 2-3 sprints or prioritize in backlog.**

**Criteria**:
- Code quality issues
- Moderate technical debt
- Minor feature gaps
- Documentation needs updating

**Examples**:
- Functions that are too long (>50-100 lines)
- Naming inconsistencies causing confusion
- Outdated documentation (accurate but references old patterns)
- Missing accessibility on non-critical paths

---

### 🟢 Low

**Fix opportunistically when touching that code.**

**Criteria**:
- Polish and cleanup
- No functional impact
- Opportunistic improvements

**Examples**:
- Nice-to-have refactoring
- Stylistic inconsistencies
- Micro-optimizations with minimal gain
- Documentation polish (typos, better examples)

---

### 📚 Documentation Misalignment

**Always treated as high priority regardless of content.**

Documentation that doesn't match implementation corrupts AI agent mental models:
- Agents debug non-existent features
- Wrong assumptions during fixes
- Wasted time on phantom issues
- Incorrect remediation approaches

**Rule**: Fix documentation issues BEFORE other remediation.

---

## Output Format

### Multi-File Architecture

The audit produces **multiple markdown files** to preserve findings, reduce context usage, and enable targeted remediation:

#### Individual Agent Reports

**Location**: `docs/audits/YYYY-MM-DD_agent_{agent-name}.md`

Each agent writes their own report **immediately upon completion**. This ensures:
- Findings are preserved permanently
- Context limits don't lose data
- Remediation agents can read only relevant reports
- Large audits remain manageable

**Agent Report Structure**:

```markdown
# {Agent Name} Audit Report

**Date**: YYYY-MM-DD HH:MM UTC
**Agent**: {Agent Name}
**Focus Area**: {Brief description}
**Wave**: {1|2|3}

---

## Summary

| Metric | Count |
|--------|-------|
| Total Issues | XX |
| 🔴 Critical | X |
| 🟠 High | X |
| 🟡 Medium | X |
| 🟢 Low | X |
| 📚 Documentation | X |

---

## Findings

### {AGENT-PREFIX}-001: Brief descriptive title

**Severity**: 🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low | 📚 Documentation
**Location**: [src/path/to/file.ts:123-145](src/path/to/file.ts#L123-L145)

**What is wrong**:
Clear description of the problem. Reference specific locations using markdown links.

Example: The EnrichmentService loads movie metadata in a loop, executing a database query for each movie's actors. This N+1 pattern causes 50+ queries when processing a batch of movies.

**Why this matters**:
- Enrichment jobs take 30+ seconds for a batch of 50 movies
- Database connection pool exhaustion under load
- User-facing timeout errors on large libraries
- Violates performance expectations

**Expected behavior**:
Actor data should be loaded in bulk for all movies in the batch. Enrichment batch processing should complete in <5 seconds for 50 movies.

**Affected components**:
- Enrichment job workers
- Movie detail page (depends on enrichment data)

**Related issues**: PERF-012

---

[Repeat for each finding with sequential numbering: {AGENT-PREFIX}-002, {AGENT-PREFIX}-003, etc.]
```

**Agent Prefix Mapping**:
- Database Engineer: `DB`
- Application Architect: `ARCH`
- DevOps Engineer: `DEVOPS`
- Storage Architect: `STORAGE`
- Integration Engineer: `INTEGRATION`
- API Engineer: `API`
- Security Engineer: `SECURITY`
- Performance Engineer: `PERF`
- Frontend Architect: `FE-ARCH`
- UX Engineer: `UX`
- Frontend Performance Engineer: `FE-PERF`
- QA Engineer: `QA`
- Documentation Lead: `DOC`
- Contract Engineer: `CONTRACT`
- TypeScript Engineer: `TS`
- State Management Engineer: `STATE`
- Configuration Engineer: `CONFIG`

---

#### Consolidated Summary Report

**Location**: `docs/audits/YYYY-MM-DD_audit_summary.md`

The summary report is created **after all agents complete** and serves as:
- Navigation index to all agent reports
- Executive summary with aggregate metrics
- Remediation roadmap and prioritization
- Entry point for remediation agents

**Summary Report Structure**:

```markdown
# Metarr Audit Summary

**Date**: YYYY-MM-DD HH:MM UTC
**Status**: ✅ Complete (17/17 agents)
**Workflow Version**: 5.0
**Report ID**: audit-YYYY-MM-DD-HHMMSS

---

## Executive Summary

| Metric | Value | Status |
|--------|-------|--------|
| Total Issues | XXX | - |
| 🔴 Critical | XX | FIX FIRST |
| 🟠 High | XX | FIX NEXT |
| 🟡 Medium | XX | BACKLOG |
| 🟢 Low | XX | POLISH |
| 📚 Doc Issues | XX | URGENT |
| Code Health | XX/100 | 🔴/🟡/🟢 |

**Agent Completion**:
✅✅✅✅✅✅ Wave 1: Backend Foundation (6/6)
✅✅✅✅✅✅ Wave 2: Frontend & Cross-Cutting (6/6)
✅✅✅✅✅ Wave 3: Documentation & Integration (5/5)

---

## Code Health Score Calculation

**Formula**: `100 - (Critical×10 + High×5 + Medium×2 + Low×0.5 + Doc×3)`

Capped at 0 minimum. Score interpretation:
- **90-100**: 🟢 Excellent - Production ready
- **70-89**: 🟡 Good - Minor improvements needed
- **50-69**: 🟠 Fair - Significant technical debt
- **0-49**: 🔴 Poor - Major issues require immediate attention

---

## Agent Reports

### Wave 1: Backend Foundation

| Agent | Issues | Critical | High | Medium | Low | Doc | Report |
|-------|--------|----------|------|--------|-----|-----|--------|
| Database Engineer | XX | X | X | X | X | X | [View Report](YYYY-MM-DD_agent_database-engineer.md) |
| Application Architect | XX | X | X | X | X | X | [View Report](YYYY-MM-DD_agent_application-architect.md) |
| DevOps Engineer | XX | X | X | X | X | X | [View Report](YYYY-MM-DD_agent_devops-engineer.md) |
| Storage Architect | XX | X | X | X | X | X | [View Report](YYYY-MM-DD_agent_storage-architect.md) |
| Integration Engineer | XX | X | X | X | X | X | [View Report](YYYY-MM-DD_agent_integration-engineer.md) |
| API Engineer | XX | X | X | X | X | X | [View Report](YYYY-MM-DD_agent_api-engineer.md) |

### Wave 2: Frontend & Cross-Cutting

| Agent | Issues | Critical | High | Medium | Low | Doc | Report |
|-------|--------|----------|------|--------|-----|-----|--------|
| Security Engineer | XX | X | X | X | X | X | [View Report](YYYY-MM-DD_agent_security-engineer.md) |
| Performance Engineer | XX | X | X | X | X | X | [View Report](YYYY-MM-DD_agent_performance-engineer.md) |
| Frontend Architect | XX | X | X | X | X | X | [View Report](YYYY-MM-DD_agent_frontend-architect.md) |
| UX Engineer | XX | X | X | X | X | X | [View Report](YYYY-MM-DD_agent_ux-engineer.md) |
| Frontend Performance Engineer | XX | X | X | X | X | X | [View Report](YYYY-MM-DD_agent_frontend-performance-engineer.md) |
| QA Engineer | XX | X | X | X | X | X | [View Report](YYYY-MM-DD_agent_qa-engineer.md) |

### Wave 3: Documentation & Integration

| Agent | Issues | Critical | High | Medium | Low | Doc | Report |
|-------|--------|----------|------|--------|-----|-----|--------|
| Documentation Lead | XX | X | X | X | X | X | [View Report](YYYY-MM-DD_agent_documentation-lead.md) |
| Contract Engineer | XX | X | X | X | X | X | [View Report](YYYY-MM-DD_agent_contract-engineer.md) |
| TypeScript Engineer | XX | X | X | X | X | X | [View Report](YYYY-MM-DD_agent_typescript-engineer.md) |
| State Management Engineer | XX | X | X | X | X | X | [View Report](YYYY-MM-DD_agent_state-management-engineer.md) |
| Configuration Engineer | XX | X | X | X | X | X | [View Report](YYYY-MM-DD_agent_configuration-engineer.md) |

---

## Critical Issues Overview

**🔴 FIX IMMEDIATELY** - XX issues total

| ID | Title | Agent | Primary File(s) |
|----|-------|-------|-----------------|
| DB-XXX | Brief title | Database Engineer | [file.ts:line](path) |
| ARCH-XXX | Brief title | Application Architect | [file.ts:line](path) |

[List all critical issues across all agents with links to detailed findings]

**Action Required**: Address these before any other work. See individual agent reports for full details.

---

## Documentation Misalignment Overview

**📚 FIX BEFORE REMEDIATION** - XX issues total

Documentation issues corrupt AI agent mental models and must be fixed first.

| ID | Title | Affected Documentation | Fix Priority |
|----|-------|------------------------|--------------|
| DOC-XXX | Brief title | [doc/path.md](path) | URGENT |

[List all documentation issues]

**Action Required**: Fix these FIRST to ensure remediation agents have accurate context.

---

## High Priority Overview

**🟠 FIX IN CURRENT/NEXT SPRINT** - XX issues total

| ID | Title | Agent | Impact Area |
|----|-------|-------|-------------|
| PERF-XXX | Brief title | Performance Engineer | Enrichment pipeline |

[List high priority issues by impact area for easier batching]

---

## Quick Wins

High-impact fixes requiring minimal effort (complete these first for immediate value):

1. **{ISSUE-ID}** ({Agent}) - {One-line description} → {Impact}
2. **{ISSUE-ID}** ({Agent}) - {One-line description} → {Impact}
3. **{ISSUE-ID}** ({Agent}) - {One-line description} → {Impact}

---

## Remediation Roadmap

### Phase 1: Documentation Alignment ⚠️ DO FIRST

**Why First**: Prevents AI confusion and wasted effort during remediation.

**Issues**: DOC-001, DOC-002, DOC-003, etc.

**Estimated Effort**: X hours

---

### Phase 2: Critical Security & Data Integrity

**Dependency**: Requires Phase 1 completion (accurate docs).

**Issues**: SECURITY-XXX, DB-XXX, STORAGE-XXX (Critical severity only)

**Estimated Effort**: XX hours

**Order**:
1. Security vulnerabilities (SECURITY-*)
2. Data integrity issues (DB-*, STORAGE-*)
3. System stability (DEVOPS-*, ARCH-*)

---

### Phase 3: Critical Performance & UX

**Dependency**: Can run parallel to Phase 2 if resources allow.

**Issues**: PERF-XXX, UX-XXX (Critical severity only)

**Estimated Effort**: XX hours

---

### Phase 4: High Priority Fixes

**Dependency**: After all critical issues resolved.

**Issues**: All High severity across agents

**Strategy**: Group by subsystem to minimize context switching.

**Estimated Effort**: XX hours

---

### Phase 5: Medium/Low Priority

**Strategy**: Fix opportunistically when touching related code.

**Issues**: All Medium and Low severity

**Tracking**: Move to backlog for incremental improvement.

---

## Issue Dependency Graph

Critical dependencies that must be resolved in order:

```
DOC-* (All documentation) ─┬─► SECURITY-XXX (Fix security first)
                           ├─► DB-XXX (Database integrity)
                           └─► ALL OTHER FIXES (Accurate docs enable all work)

DB-XXX (Schema fixes) ─────► PERF-XXX (Query optimization builds on schema)

STORAGE-XXX (Cache sync) ──► DEVOPS-XXX (Job reliability requires cache stability)
```

---

## Metrics Trends

| Date | Health | Crit | High | Med | Low | Docs | Notes |
|------|--------|------|------|-----|-----|------|-------|
| YYYY-MM-DD | XX/100 | XX | XX | XX | XX | XX | Current audit |
| Previous | XX/100 | XX | XX | XX | XX | XX | Baseline for comparison |

**Trend**: ✅ Improving / 🔴 Declining / ➡️ Stable

---

## For Remediation Agents

When asked to fix issues from this audit:

1. **Start here**: Read this summary to understand overall priorities
2. **Read relevant agent report(s)**: Navigate to specific agent reports for detailed findings
3. **Check dependencies**: Consult the dependency graph before starting
4. **Verify documentation**: Ensure DOC-* issues in your area are fixed first
5. **Update metrics**: After fixes, update the trends table

**Example Workflow**:
```
User: "Fix the database issues from the audit"
Agent:
1. Read YYYY-MM-DD_audit_summary.md (this file)
2. Identify database-related issues in Executive Summary
3. Read docs/audits/YYYY-MM-DD_agent_database-engineer.md
4. Check if DOC-* issues affect database documentation
5. Follow remediation roadmap phase ordering
6. Fix issues, run tests, update documentation
```

---

**Next Audit**: Recommended in 3 months (YYYY-MM-DD)
**Version**: 5.0
```

---

## Running an Audit

### Preparation

1. **Ensure stable state**:
   ```bash
   npm test                  # All tests passing
   npm run typecheck         # No TypeScript errors
   npm install               # Latest dependencies
   ```

2. **Determine scope**:
   - Full codebase (standard)
   - Targeted subsystem
   - Incremental (changed files only)

---

### Execution

Request an audit from your AI assistant:

```
Please run a full codebase audit following docs/AUDIT_WORKFLOW.md.

Use the 17-agent, 3-wave expert team structure with max 6 concurrent agents.

IMPORTANT: Each agent must write their own report to docs/audits/YYYY-MM-DD_agent_{agent-name}.md
immediately upon completion. After all agents finish, generate the consolidated summary report.

Focus on impact analysis (what/why) not implementation (how).
Use markdown file:line references, avoid code snippets.
```

The AI will:
1. Launch Wave 1 (6 agents in parallel)
   - Each agent writes their report to `docs/audits/YYYY-MM-DD_agent_{name}.md`
2. Wait for completion, then launch Wave 2 (6 agents)
   - Each agent writes their report to `docs/audits/YYYY-MM-DD_agent_{name}.md`
3. Wait for completion, then launch Wave 3 (5 agents)
   - Each agent writes their report to `docs/audits/YYYY-MM-DD_agent_{name}.md`
4. Generate consolidated summary report at `docs/audits/YYYY-MM-DD_audit_summary.md`
   - Aggregates metrics from all 17 individual reports
   - Creates navigation index with links to agent reports
   - Builds remediation roadmap and prioritization

---

### Agent Execution Guidelines

Each agent should:

1. **Read thoroughly**:
   - All files in their focus area
   - Related configuration and documentation
   - Test files for coverage assessment

2. **Apply evaluation criteria**:
   - Answer specific evaluation questions
   - Provide file:line references (markdown links)
   - Focus on impact, not implementation details

3. **Document findings**:
   - What is wrong (clear description)
   - Why it matters (impact, consequences, violated principles)
   - Expected behavior (goal state)
   - Affected components
   - Related issues

4. **Prioritize by severity**:
   - Critical: Data loss, security, system stability
   - High: Architecture violations, major performance issues
   - Medium: Code quality, outdated docs
   - Low: Polish, style, micro-optimizations

5. **Save report immediately**: ⚠️ CRITICAL STEP
   - Write report to `docs/audits/YYYY-MM-DD_agent_{agent-name}.md`
   - Use the Individual Agent Report structure from Output Format section
   - Include summary metrics table at top
   - List all findings with sequential issue numbering
   - **Save before completing the agent task** to prevent data loss

---

### Post-Audit

1. **Review report**:
   - Read executive summary
   - Understand code health score
   - Review remediation roadmap

2. **Prioritize fixes**:
   - Critical → immediate
   - High → current/next sprint
   - Medium → backlog
   - Low → opportunistic

3. **Create plan**:
   - Start with documentation alignment (DOC-* issues)
   - Follow dependency graph
   - Tackle quick wins for immediate value

4. **Track progress**:
   - Update metrics trends
   - Monitor code health score
   - Schedule next audit (quarterly recommended)

---

## Best Practices

### For AI Agents Conducting Audits

✅ **Do**:
- Be thorough and specific with file:line references
- Use markdown links for navigation ([file.ts:42](src/file.ts#L42))
- Explain impact specific to this application's architecture
- Focus on what/why, not prescriptive how
- Evaluate patterns based on sound engineering principles
- Link related findings
- Calculate accurate metrics
- **Write your report to file IMMEDIATELY** using the Individual Agent Report structure
- Save to `docs/audits/YYYY-MM-DD_agent_{agent-name}.md` before completing

❌ **Don't**:
- Include code snippets (adds bloat, becomes stale)
- Skip reading files
- Make assumptions without evidence
- Use vague locations ("multiple files")
- Prescribe detailed implementation
- Enforce arbitrary rules without evaluating if they make sense
- Miss documentation alignment issues
- **Return findings without saving to file** (context limits will lose everything)

---

### For AI Agents During Remediation

✅ **Do**:
- Read issue completely before coding
- Understand impact and consequences
- Check related issues for context
- Follow dependency graph
- Update documentation as specified
- Run tests after each fix

❌ **Don't**:
- Jump to coding without understanding
- Ignore "why this matters"
- Skip documentation updates
- Fix out of dependency order
- Assume one solution fits all

---

### For Human Developers

✅ **Do**:
- Allocate sufficient review time
- Question findings if unclear
- Prioritize documentation first
- Batch related fixes
- Test thoroughly
- Update metrics
- Celebrate improvements

❌ **Don't**:
- Rush through findings
- Fix everything at once
- Skip testing
- Defer Critical issues
- Ignore documentation
- Treat as checklist without understanding

---

## Continuous Improvement

This workflow evolves based on experience:
- Add evaluation criteria as patterns emerge
- Adjust severity thresholds based on real impact
- Refine agent responsibilities if overlap/gaps found
- Update for technology evolution
- Track metrics trends over audits
- Question and update guidelines that become outdated

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-10-26 | Initial version (6 agents, 4 phases) |
| 2.0 | 2025-01-17 | Enhanced structure (6 agents, deeper criteria) |
| 3.0 | 2025-01-18 | 17 specialized agents, 3 waves, AI remediation focus |
| 4.0 | 2025-11-18 | Expert team model, markdown-optimized output, principle-based evaluation (not rigid rules) |
| 5.0 | 2025-11-18 | **Current** - Multi-file architecture: each agent saves own report immediately, summary report serves as navigation index for remediation agents |

---

**Maintained by**: Development team + AI assistant audits
**Feedback**: GitHub issue with "audit-workflow" label
