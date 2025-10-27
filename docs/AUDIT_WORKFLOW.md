# Metarr Audit Workflow

## Purpose

The Audit Workflow is a comprehensive, multi-agent analysis system designed to evaluate the codebase after major feature implementations or before release milestones. The goal is to identify opportunities for simplification, performance improvement, consistency enhancement, and reliability increases.

**Key Principle**: "How can we refactor to be more simple, performant, maintainable, and reliable?"

## When to Run

- After completing major features
- Before release milestones
- When codebase feels complex or unwieldy
- Periodically as "optimization passes"
- Developer-initiated at any time

## Audit Scope

**Default**: Full codebase analysis including:
- Backend services and controllers
- Frontend components and hooks
- Database schema and migrations
- Documentation (including CLAUDE.md)
- Configuration files
- Scripts and utilities
- API contracts and types

**Optional**: Target specific areas (phases, services, frontend modules, etc.)

## Multi-Agent Architecture

The audit employs six specialized agents working in priority order. Each agent produces findings with severity ratings and actionable recommendations.

### Agent 1: Code Quality & Consistency Agent

**Priority**: Highest
**Focus**: SOLID principles, DRY violations, complexity, naming, dead code

#### Evaluation Criteria

1. **SOLID Principles**
   - Single Responsibility: Do classes/functions do one thing well?
   - Open/Closed: Are components extensible without modification?
   - Liskov Substitution: Are inheritance hierarchies sound?
   - Interface Segregation: Are interfaces lean and focused?
   - Dependency Inversion: Do we depend on abstractions?

2. **DRY Violations**
   - Duplicated logic across services
   - Copy-pasted code blocks
   - Similar patterns that could be abstracted
   - Redundant utility functions

3. **Code Complexity**
   - Cyclomatic complexity >10 (warning), >15 (critical)
   - Function length >50 lines (warning), >100 (critical)
   - Nested conditionals >3 levels deep
   - Callback hell or promise chains

4. **TypeScript Best Practices**
   - Proper type definitions (no excessive `any`)
   - Interface vs type appropriateness
   - Generic usage and constraints
   - Union vs intersection type usage
   - Enum vs const assertions

5. **Naming Conventions**
   - Consistent casing (camelCase, PascalCase)
   - Descriptive names that reveal intent
   - Avoid abbreviations unless standard
   - Service/Controller/Model naming patterns

6. **Dead Code**
   - Unused imports
   - Unreferenced functions
   - Commented-out code blocks
   - Deprecated utilities
   - Unused type definitions

#### Output Format

```markdown
### [SEVERITY] Issue Title
**Location**: `path/to/file.ts:123-145`
**Why it matters**: Brief explanation of impact
**Suggestion**: Specific refactoring approach
**Estimated effort**: Small | Medium | Large
```

---

### Agent 2: Performance Agent

**Priority**: High
**Focus**: Query patterns, async operations, memory leaks, bundle size

#### Evaluation Criteria

1. **Database Query Patterns**
   - N+1 query detection
   - Missing eager loading opportunities
   - Inefficient WHERE clauses
   - Full table scans
   - Suboptimal JOIN strategies

2. **Async Operations**
   - Unnecessary async/await usage
   - Missing Promise.all() opportunities
   - Sequential operations that could be parallel
   - Blocking operations in hot paths

3. **Memory Management**
   - Potential memory leak patterns
   - Large object retention
   - Event listener cleanup
   - Stream handling
   - Cache size limits

4. **Frontend Performance**
   - Bundle size analysis
   - Unnecessary re-renders
   - Missing React.memo opportunities
   - Heavy computations in render
   - Excessive WebSocket message volume

5. **File Operations**
   - Synchronous file I/O in async context
   - Unnecessary file reads/writes
   - Missing stream usage for large files
   - Redundant FFprobe calls

6. **Algorithmic Efficiency**
   - O(n²) loops that could be O(n)
   - Repeated regex compilation
   - Unnecessary array iterations

#### Output Format

Same as Agent 1, plus:
```markdown
**Performance impact**: Estimated improvement (e.g., "~50ms per request", "Reduces memory by ~100MB")
```

---

### Agent 3: Architecture Agent

**Priority**: High
**Focus**: Phase boundaries, coupling, dependency direction, separation of concerns

#### Evaluation Criteria

1. **Phase Boundary Integrity**
   - Does scanning phase leak into enrichment?
   - Are phase transitions clean via job queue?
   - Do services respect phase independence?
   - Are phases truly idempotent?

2. **Service Coupling**
   - Circular dependencies between services
   - Services that know too much about each other
   - Shared mutable state
   - Direct database access from controllers

3. **Dependency Direction**
   - Do lower layers depend on higher layers?
   - Are core services independent of controllers?
   - Does business logic leak into routes?

4. **Separation of Concerns**
   - Business logic in controllers
   - Database queries in services (not extracted)
   - UI logic in API responses
   - Configuration mixed with logic

5. **API Layer Design**
   - RESTful consistency
   - WebSocket vs REST appropriateness
   - Response shape consistency
   - Error handling patterns

6. **Service Responsibilities**
   - God objects/services doing too much
   - Unclear service boundaries
   - Services that should be split
   - Missing orchestration layers

#### Output Format

Same as Agent 1, plus:
```markdown
**Architecture impact**: How this affects maintainability and phase independence
```

---

### Agent 4: Documentation Agent

**Priority**: Medium
**Focus**: Code-doc sync, completeness, accuracy, CLAUDE.md alignment

#### Evaluation Criteria

1. **CLAUDE.md Accuracy**
   - Does it reflect current architecture?
   - Are phase descriptions up to date?
   - Do file structure examples match reality?
   - Are commands and scripts current?
   - Do configuration examples work?

2. **Phase Documentation**
   - Does each phase doc match implementation?
   - Are job queue triggers documented?
   - Are workflow chains accurate?
   - Do examples reflect actual code?

3. **Code Comments**
   - Missing JSDoc for public APIs
   - Outdated comments after refactors
   - Comments that explain "what" not "why"
   - Over-commented obvious code

4. **README and Guides**
   - Getting started still works
   - Links aren't broken
   - API documentation current
   - Environment variables complete

5. **Deprecated Documentation**
   - Old design docs no longer relevant
   - Outdated architecture diagrams
   - Removed feature documentation
   - Obsolete getting started guides

6. **Technical Documentation**
   - Complex algorithms explained
   - Non-obvious decisions documented
   - Provider API quirks noted
   - Edge cases documented

#### Output Format

Same as Agent 1, plus:
```markdown
**Documentation type**: Code comment | CLAUDE.md | Phase doc | Technical doc
**Current state**: Brief quote of outdated content
**Should be**: Updated content or removal suggestion
```

---

### Agent 5: Database Agent

**Priority**: Medium
**Focus**: Schema design, normalization, indexing, migration safety

#### Evaluation Criteria

1. **Schema Normalization**
   - Redundant columns across tables
   - Data that should be normalized
   - Denormalization that's not justified
   - Composite keys vs surrogate keys

2. **Column Design**
   - Unused columns
   - Columns with overlapping purposes
   - Incorrect data types
   - Missing NOT NULL constraints
   - Default values that don't make sense

3. **Index Coverage**
   - Missing indexes on foreign keys
   - Missing indexes on frequently queried columns
   - Unused indexes (overhead)
   - Composite index opportunities

4. **Relationship Integrity**
   - Missing foreign key constraints
   - Incorrect cascade rules
   - Orphaned record possibilities
   - Many-to-many junction tables

5. **Migration Safety**
   - Destructive operations without backups
   - Missing rollback strategies
   - Data transformation risks
   - Schema version consistency

6. **Query Patterns**
   - Schema design vs actual query needs
   - Missing materialized views
   - Inefficient JOIN patterns
   - Subquery opportunities

#### Output Format

Same as Agent 1, plus:
```markdown
**Schema impact**: What data is affected, migration complexity
**Example query**: Show problematic query pattern if relevant
```

---

### Agent 6: Frontend Standards Agent

**Priority**: Medium
**Focus**: Component patterns, WCAG, hooks, state management consistency

#### Evaluation Criteria

1. **Component Composition**
   - Components doing too much
   - Missing composition opportunities
   - Prop drilling >3 levels
   - Missing custom hooks for logic reuse

2. **WCAG Compliance (Basic)**
   - Missing alt text on images
   - Insufficient color contrast
   - Missing ARIA labels where needed
   - Keyboard navigation support
   - Focus management in modals

3. **Hook Usage Patterns**
   - Inconsistent TanStack Query usage
   - useEffect dependencies issues
   - Missing useMemo/useCallback where beneficial
   - Custom hook extraction opportunities

4. **State Management**
   - Local state that should be global
   - Global state that should be local
   - Redundant state across components
   - Derived state stored instead of computed

5. **React Best Practices**
   - Key prop issues in lists
   - Unnecessary component re-renders
   - Side effects in render
   - Missing error boundaries

6. **Styling Consistency**
   - Tailwind utility usage patterns
   - Color palette adherence (violet primary)
   - Spacing consistency
   - Component variant patterns
   - Shadcn/ui usage consistency

#### Output Format

Same as Agent 1, plus:
```markdown
**User impact**: How this affects usability or accessibility
**Component**: Which component(s) are affected
```

---

## Severity Levels

### Critical
- Breaks SOLID principles significantly
- Major performance issue (>500ms impact)
- Data integrity risk
- Complete phase boundary violation
- Security concern (even in trusted environment)

### High
- Significant code duplication
- Notable performance issue (100-500ms)
- Architecture inconsistency
- Important documentation out of sync
- Missing critical indexes

### Medium
- Moderate complexity or duplication
- Minor performance opportunity (<100ms)
- Naming inconsistencies
- Outdated documentation
- Unused code or deprecated files
- Missing accessibility features

### Low
- Nice-to-have refactoring
- Stylistic inconsistencies
- Optional optimizations
- Documentation polish

## Audit Report Structure

Reports are saved to `docs/audits/YYYY-MM-DD_audit_report.md`

```markdown
# Metarr Codebase Audit Report
**Date**: YYYY-MM-DD
**Scope**: Full codebase | Specific area description
**Duration**: X hours

## Executive Summary
- Total findings: X
- Critical: X | High: X | Medium: X | Low: X
- Top 3 priority areas
- Overall health score (optional)

---

## Agent 1: Code Quality & Consistency
**Findings**: X total (C: X, H: X, M: X, L: X)

### [CRITICAL] Finding Title
**Location**: `path/to/file.ts:123-145`
**Why it matters**: ...
**Suggestion**: ...
**Estimated effort**: Medium

[Repeat for all findings]

---

## Agent 2: Performance
[Same structure]

---

## Agent 3: Architecture
[Same structure]

---

## Agent 4: Documentation
[Same structure]

---

## Agent 5: Database
[Same structure]

---

## Agent 6: Frontend Standards
[Same structure]

---

## Prioritized Action Plan

### Immediate (Critical + High Priority Items)
1. [Finding title with link to section]
2. ...

### Short Term (High + Selected Medium)
1. ...

### Long Term (Medium + Low)
1. ...

### Technical Debt Tracking
- Items deferred for specific reasons
- Trade-offs accepted
- Future considerations

---

## Conclusion
Brief summary of overall codebase health and recommended next steps.
```

## Running an Audit

### Preparation
1. Ensure codebase is in stable state
2. All tests passing
3. No uncommitted changes (optional, but recommended)
4. Latest dependencies installed

### Execution
Request audit from your AI assistant with:
```
Please run a full codebase audit following the AUDIT_WORKFLOW.md process.
Save the report to docs/audits/YYYY-MM-DD_audit_report.md
```

Or for targeted audits:
```
Please audit the [enrichment phase / frontend components / database schema]
following the AUDIT_WORKFLOW.md process.
```

### Agent Execution Order
1. Code Quality & Consistency (2-4 hours analysis)
2. Performance (1-2 hours analysis)
3. Architecture (2-3 hours analysis)
4. Documentation (1-2 hours analysis)
5. Database (1-2 hours analysis)
6. Frontend Standards (1-2 hours analysis)

Each agent should:
- Read relevant files thoroughly
- Apply evaluation criteria
- Document findings with specifics
- Prioritize by severity
- Provide actionable recommendations

### Post-Audit
1. Review report
2. Discuss findings with team/AI
3. Create action plan
4. Address critical items immediately
5. Schedule high-priority items
6. Track medium/low items as technical debt

## Best Practices

### For AI Assistants Conducting Audits
1. **Be Specific**: Include exact file paths and line numbers
2. **Show Examples**: Quote relevant code snippets
3. **Explain Impact**: Why does this matter to Metarr specifically?
4. **Suggest Solutions**: Don't just identify problems
5. **Consider Context**: Metarr's phase-based architecture
6. **Check Everything**: Including docs, scripts, and CLAUDE.md
7. **No False Positives**: Only flag genuine issues
8. **Estimate Effort**: Help prioritize work

### For Developers Using Audits
1. **Don't Rush**: Take time to understand each finding
2. **Ask Questions**: Clarify reasoning if unclear
3. **Push Back**: Not all findings may be valid
4. **Batch Similar**: Group related fixes together
5. **Test After**: Verify fixes don't break functionality
6. **Update Docs**: Keep documentation in sync with changes
7. **Track Debt**: Not everything needs immediate fixing

## Continuous Improvement

This workflow document should evolve:
- Add new evaluation criteria as patterns emerge
- Adjust severity thresholds based on experience
- Refine agent responsibilities
- Update industry standards referenced
- Incorporate new tools and techniques

**Version**: 1.0
**Created**: 2025-10-26
**Last Updated**: 2025-10-26
**Next Review**: After first full audit execution
