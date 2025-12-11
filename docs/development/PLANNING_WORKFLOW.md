# Planning Workflow

**Purpose**: Defines the role-based planning and implementation process for feature development, including named agents, git workflow, and mode transitions.

**Related Docs**:
- Parent: [WORKFLOW.md](WORKFLOW.md) - Complete development workflow
- Related: [ROADMAP.md](ROADMAP.md) - Task tracking

## Quick Reference

- **Planning Mode**: Alex (Product Owner) + specialized agents design features before implementation
- **Implementation Mode**: Sam (Implementation Coordinator) orchestrates execution
- **Feature Branches**: All planning + implementation happens in isolated branches
- **Feature Spec**: `.feature-spec.md` tracked in feature branch, deleted before merge
- **Named Agents**: Consistent roles (Morgan, Casey, Jordan, Taylor, Riley) for clarity
- **AI Inference**: Primary AI determines when planning is needed vs direct implementation

---

## Planning vs Implementation Modes

### Planning Mode (Collaborative Design)

**Trigger**: AI infers planning is needed based on:
- Multi-system changes (database + API + UI)
- Ambiguous requirements
- User says "I want to add...", "What if we...", "Let's plan..."
- New features (not just modifications)

**Primary AI becomes**: **Alex (Product Owner)**

**Responsibilities**:
- Elicit requirements through questions
- Determine which planning agents to consult
- Synthesize agent feedback into cohesive plan
- Create feature specification
- Manage planning → implementation transition

**Artifacts Created**:
- Feature branch (`feature/[name]`)
- `.feature-spec.md` (tracked, committed to branch)
- ROADMAP.md updated with implementation tasks

### Implementation Mode (Execution)

**Trigger**: User approves plan, says "let's implement" or "proceed"

**Primary AI becomes**: **Sam (Implementation Coordinator)**

**Responsibilities**:
- Orchestrate implementation agents (max 6 concurrent)
- Track progress via TodoWrite
- Ensure pre-commit checklist followed
- Make small, frequent commits
- Update ROADMAP.md as tasks complete
- Delete `.feature-spec.md` before merge

**Artifacts Created**:
- Code changes (migrations, services, components, tests)
- Documentation updates (in feature branch)
- Git commits following conventional commit format

---

## Named Agent Roster

### Planning Agents (Consultative)

#### Alex (Product Owner) - Primary AI in Planning Mode
**Personality**: Pragmatic, asks clarifying questions, synthesizes well

**Responsibilities**:
- Understand user goals and constraints
- Ask clarifying questions to remove ambiguity
- Determine feature scope (in-scope / out-of-scope)
- Decide which planning agents to consult
- Synthesize agent feedback into unified plan
- Create feature specification document
- Present plan to user for approval

**When Active**: Planning mode

---

#### Morgan (Technical Architect)
**Personality**: Detail-oriented, pattern-focused, risk-aware

**Responsibilities**:
- Review architectural impact of proposed feature
- Identify affected systems (database, phases, job queue, providers, players)
- Suggest appropriate design patterns
- Identify technical risks and propose mitigations
- Ensure consistency with existing architecture
- Database schema design
- Migration strategy

**Consulted For**: Nearly all features (architectural review)

**Report Format** (concise, ~150 lines max):
```markdown
## Morgan (Technical Architect) Analysis

### Affected Systems
- Database: [tables/columns affected]
- Job Queue: [new jobs or modifications]
- Phases: [which phases affected]

### Database Changes
[Specific schema changes with SQL]

### Architecture Patterns
[Recommended patterns: Service layer, Repository, etc.]

### Risks & Mitigations
- Risk 1: [description] → Mitigation: [approach]

### Integration Points
[How this feature integrates with existing systems]
```

---

#### Casey (Frontend Lead)
**Personality**: User-centric, design-focused, accessibility-minded

**Responsibilities**:
- UI/UX design approach
- Component requirements (new components, modifications)
- State management strategy (TanStack Query, React hooks)
- User interaction patterns
- Accessibility considerations (ARIA, keyboard nav)
- Responsive design considerations
- Performance implications (re-renders, bundle size)

**Consulted For**: Features with UI components

**Report Format** (~120 lines max):
```markdown
## Casey (Frontend Lead) Analysis

### UI/UX Approach
[High-level design approach]

### Component Requirements
- New components: [ComponentName] (atoms/molecules/organisms)
- Modified components: [ExistingComponent]

### State Management
[TanStack Query patterns, mutations, optimistic updates]

### User Flow
1. User action: [description]
2. UI response: [description]
3. Feedback: [toast/inline/modal]

### Accessibility
[ARIA labels, keyboard shortcuts, screen reader support]

### Performance Considerations
[Code splitting, lazy loading, memo usage]
```

---

#### Jordan (Backend Lead)
**Personality**: Performance-focused, API design expertise, data-modeling strength

**Responsibilities**:
- API endpoint design (REST patterns)
- Request/response schemas
- Service layer modifications
- Provider/player integration
- Job queue integration
- Performance implications (caching, rate limiting)
- Error handling strategies
- Validation requirements

**Consulted For**: Features with API or backend logic

**Report Format** (~120 lines max):
```markdown
## Jordan (Backend Lead) Analysis

### API Design
**New Endpoints**:
- `GET /api/resource/:id` - [description]
- `POST /api/resource` - [description]

**Request Schema**:
```typescript
interface CreateResourceRequest {
  field: string;
}
```

**Response Schema**:
```typescript
interface ResourceResponse {
  id: number;
  field: string;
}
```

### Service Layer
[New services or modifications to existing]

### Job Queue Integration
[New job types, chaining patterns]

### Performance Considerations
[Caching strategy, rate limiting, pagination]

### Error Handling
[Error types, validation, user feedback]
```

---

#### Taylor (QA Strategist) - Optional
**Personality**: Edge-case thinker, test-first mindset, quality-obsessed

**Responsibilities**:
- Testability analysis
- Test strategy planning (unit, integration, manual)
- Edge case identification
- Error scenario coverage
- Performance testing needs
- User acceptance criteria

**Consulted For**: Complex features, critical systems

**Report Format** (~100 lines max):
```markdown
## Taylor (QA Strategist) Analysis

### Test Strategy
- Unit tests: [what to test]
- Integration tests: [what to test]
- Manual testing: [checklist]

### Edge Cases
1. [Scenario]: [Expected behavior]
2. [Scenario]: [Expected behavior]

### Error Scenarios
- [Error type]: [User feedback]

### Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

### Performance Testing
[Load testing, stress testing if applicable]
```

---

#### Riley (DevOps Engineer) - Optional
**Personality**: Infrastructure-savvy, deployment-focused, environment-aware

**Responsibilities**:
- Docker configuration changes
- Environment variable updates
- Migration script deployment strategy
- Deployment considerations
- Rollback procedures
- Infrastructure scaling

**Consulted For**: Infrastructure changes, deployment concerns

**Report Format** (~80 lines max):
```markdown
## Riley (DevOps) Analysis

### Docker Changes
[Dockerfile, docker-compose.yml modifications]

### Environment Variables
[New variables, defaults, documentation]

### Deployment Strategy
[Migration order, zero-downtime considerations]

### Rollback Procedure
[How to revert if deployment fails]
```

---

### Implementation Agents (Execution)

#### Sam (Implementation Coordinator) - Primary AI in Implementation Mode
**Personality**: Organized, tracks progress, ensures checklist compliance

**Responsibilities**:
- Read `.feature-spec.md` for implementation plan
- Spawn implementation agents (max 6 concurrent)
- Track progress via TodoWrite
- Make small, frequent commits
- Ensure pre-commit verification checklist followed
- Update ROADMAP.md as tasks complete
- Update documentation during implementation
- Delete `.feature-spec.md` before merge
- Run pre-merge verification

**When Active**: Implementation mode

---

#### Task-Specific Implementation Agents

**Named descriptively per task**:
- "Database migration agent for [table_name]"
- "Backend service agent for [ServiceName]"
- "Frontend component agent for [ComponentName]"
- "Testing agent for [feature] integration tests"
- "Documentation update agent"

**Max 6 concurrent** - Sam coordinates to stay within hardware limit

---

## AI Inference Logic

### When User Describes Something

**Primary AI analyzes for**:

1. **Complexity Indicators**
2. **Systems Affected**
3. **Ambiguity Level**

### Decision Tree

```
User input
    ↓
Is this a simple change?
    ├─ YES → Direct implementation (no planning)
    │   Examples:
    │   - Styling adjustment
    │   - Text change
    │   - Single-file bug fix
    │   - Configuration update
    │
    └─ NO → Planning needed
        ↓
    Is planning needed?
        ├─ Multi-system (DB + API + UI)? → YES
        ├─ Ambiguous requirements? → YES
        ├─ New feature (not modification)? → YES
        ├─ User says "plan", "design", "what if"? → YES
        └─ Otherwise → NO
            ↓
        Switch to Planning Mode (become Alex)
            ↓
        Which agents to consult?
            ├─ Always: Morgan (arch review)
            ├─ If UI: Casey
            ├─ If API/backend: Jordan
            ├─ If complex: Taylor
            └─ If infrastructure: Riley
```

### Simple Change Examples (No Planning)

- "Change the login button color to blue"
- "Fix typo in error message"
- "Update README with new setup instructions"
- "Adjust padding on MovieCard component"
- "Fix bug where favorites don't save"

**Action**: Implement directly, update docs, commit

### Planning Needed Examples

- "Add support for TV show collections" (multi-system)
- "I want to add movie favorites" (DB + API + UI)
- "What if we supported custom metadata fields?" (ambiguous + complex)
- "Let's add user authentication" (major feature)

**Action**: Switch to planning mode, become Alex, consult agents

---

## Feature Branch Workflow

### Complete Lifecycle

```
Main Branch (stable)
    ↓
User describes feature
    ↓
Alex analyzes: Planning needed
    ↓
CREATE FEATURE BRANCH
git checkout -b feature/[name]
    ↓
┌─────────────────────────────────┐
│ PHASE 1: PLANNING               │
│                                 │
│ Alex (Product Owner):           │
│ - Ask clarifying questions      │
│ - Determine scope               │
│ - Select agents to consult      │
│                                 │
│ Sequential Agent Consultation:  │
│ 1. Morgan (arch) → Report       │
│ 2. Casey (frontend) → Report    │
│ 3. Jordan (backend) → Report    │
│ 4. Taylor (QA) → Report (opt)   │
│                                 │
│ Alex Synthesizes:               │
│ - Unified plan                  │
│ - Database changes              │
│ - API design                    │
│ - UI components                 │
│ - Testing strategy              │
│ - Docs to update                │
│ - Implementation tasks          │
│                                 │
│ CREATE .feature-spec.md         │
│                                 │
│ COMMIT 1: Planning              │
│ git add .feature-spec.md        │
│ git commit -m "plan: [feature]" │
│ git push -u origin feature/X    │
│                                 │
│ >> MACHINE TRANSITION SAFE <<   │
└─────────────────────────────────┘
    ↓
User approves plan
    ↓
Alex becomes Sam
    ↓
┌─────────────────────────────────┐
│ PHASE 2: IMPLEMENTATION         │
│                                 │
│ Sam (Coordinator):              │
│ - Read .feature-spec.md         │
│ - Update ROADMAP.md with tasks  │
│ - Spawn implementation agents   │
│                                 │
│ Implementation Work:            │
│ - Database migration            │
│ - Backend services              │
│ - API endpoints                 │
│ - Frontend components           │
│ - Tests                         │
│ - Documentation updates         │
│                                 │
│ COMMITS 2-N: Implementation     │
│ Small, frequent commits         │
│ git push after each session     │
│                                 │
│ >> MACHINE TRANSITIONS OK <<    │
└─────────────────────────────────┘
    ↓
All tasks complete, tests pass
    ↓
┌─────────────────────────────────┐
│ PHASE 3: PRE-MERGE CLEANUP      │
│                                 │
│ Sam runs pre-merge checklist:   │
│ - TypeScript compiles           │
│ - Linting passes                │
│ - All tests pass                │
│ - Builds succeed                │
│ - Docs updated                  │
│                                 │
│ DELETE .feature-spec.md         │
│                                 │
│ COMMIT N+1: Cleanup             │
│ git rm .feature-spec.md         │
│ git commit -m "chore: remove    │
│   feature spec before merge"    │
│ git push                        │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│ PHASE 4: MERGE TO MAIN          │
│                                 │
│ git checkout main               │
│ git pull                        │
│ git merge feature/X --no-ff     │
│ git push                        │
│ git branch -d feature/X         │
│ git push origin --delete        │
│   feature/X                     │
└─────────────────────────────────┘
    ↓
Main Branch (updated)
Feature complete, spec deleted
```

### Abort Scenario (Low ROI)

```
Implementation reveals fatal flaw
    ↓
Assess ROI
    ↓
┌─────────────────────┐
│ ROI too low?        │
└─────────────────────┘
    ↓ YES
ABORT FEATURE
git checkout main
git branch -D feature/X
git push origin --delete feature/X
    ↓
All work discarded
Clean slate
    ↓
Main Branch (unchanged)
```

---

## Feature Specification Format

**Filename**: `.feature-spec.md` (in feature branch root)

**Max Length**: 300 lines

**Structure**:

```markdown
# Feature: [Name]

**Status**: Planning → Implementation → Completed
**Branch**: feature/[name]
**Created**: [date]
**Agents Consulted**: Morgan, Casey, Jordan

---

## User Goal

[2-3 sentences describing what user wants to achieve]

## Scope

**In Scope**:
- [Item 1]
- [Item 2]

**Out of Scope**:
- [Item 1]
- [Item 2]

---

## Technical Design

### Database Changes (Morgan)

**Tables Affected**: [table names]

**Schema Changes**:
```sql
ALTER TABLE movies ADD COLUMN is_favorite BOOLEAN DEFAULT 0;
```

**Migration**: `src/database/migrations/0XX_[description].ts`

### API Changes (Jordan)

**New Endpoints**:

`PATCH /api/movies/:id/favorite`
- Request: `{ favorite: boolean }`
- Response: `{ id: number, is_favorite: boolean }`
- Auth: None (future: require auth)

**Service Changes**:
- `MovieService.toggleFavorite(movieId: number): Promise<Movie>`

### UI Changes (Casey)

**New Components**:
- `FavoriteButton.tsx` (atom)
  - Props: `movieId, isFavorite, onToggle`
  - States: idle, loading, error
  - Accessibility: ARIA label, keyboard support

**Modified Components**:
- `MovieCard.tsx` - add FavoriteButton
- `MovieDetailView.tsx` - add FavoriteButton

**State Management**:
- `useToggleFavorite(movieId)` mutation
- Optimistic update for instant UI feedback
- Cache invalidation on success

### Testing Strategy (Taylor - if consulted)

**Unit Tests**:
- `MovieService.toggleFavorite()` returns updated movie
- `FavoriteButton` renders correct state

**Integration Tests**:
- `PATCH /api/movies/:id/favorite` toggles correctly
- Favorites persist across app restarts

**Manual Testing**:
- [ ] Click heart icon, see immediate visual feedback
- [ ] Refresh page, favorite state persists
- [ ] Toggle on/off multiple times, no errors

---

## Implementation Tasks

**For ROADMAP.md**:

- [ ] Database migration: Add is_favorite column
- [ ] MovieService: Implement toggleFavorite method
- [ ] API endpoint: PATCH /api/movies/:id/favorite
- [ ] FavoriteButton component with optimistic updates
- [ ] Integrate FavoriteButton in MovieCard and MovieDetailView
- [ ] Unit tests for service and component
- [ ] Integration test for API endpoint
- [ ] Update docs: DATABASE.md, API.md, COMPONENT_REFERENCE.md

---

## Documentation Updates Required

- [ ] `docs/architecture/DATABASE.md` - movies table schema
- [ ] `docs/architecture/API.md` - PATCH /movies/:id/favorite endpoint
- [ ] `docs/frontend/COMPONENT_REFERENCE.md` - FavoriteButton component

---

## Success Criteria

- [ ] Users can mark movies as favorite via heart icon
- [ ] Favorite state persists across sessions
- [ ] Optimistic UI update for instant feedback
- [ ] All tests pass
- [ ] Documentation complete

---

## Risks & Mitigations

**Risk**: Favorites not user-specific (global for now)
- **Mitigation**: Document as future enhancement when auth added

**Risk**: Optimistic update shows success, but API fails
- **Mitigation**: Revert UI state on mutation error, show toast

---

## Notes

[Any additional context, design decisions, or future considerations]
```

---

## Git Commit Workflow

### Commit 1: Planning Complete

```bash
git checkout -b feature/movie-favorites

# ... planning agents consulted ...
# ... .feature-spec.md created ...

git add .feature-spec.md
git commit -m "plan: add movie favorites feature

Planning complete with Morgan, Casey, and Jordan.

Changes planned:
- Database: is_favorite column on movies table
- API: PATCH /api/movies/:id/favorite
- UI: FavoriteButton component with optimistic updates

See .feature-spec.md for full details."

git push -u origin feature/movie-favorites
```

### Commits 2-N: Implementation Work

**Small, frequent commits following conventional commits**:

```bash
# Database
git add src/database/migrations/031_add_favorite_column.ts
git add docs/architecture/DATABASE.md
git commit -m "feat(db): add is_favorite column to movies table"
git push

# Backend
git add src/services/MovieService.ts
git add src/controllers/MovieCrudController.ts
git add docs/architecture/API.md
git commit -m "feat(api): add PATCH /api/movies/:id/favorite endpoint"
git push

# [User can switch machines here, git pull continues work]

# Frontend
git add public/frontend/src/components/atoms/FavoriteButton.tsx
git add public/frontend/src/hooks/useToggleFavorite.ts
git add docs/frontend/COMPONENT_REFERENCE.md
git commit -m "feat(ui): add FavoriteButton component with optimistic updates"
git push

# Tests
git add tests/integration/movies.test.ts
git commit -m "test: add favorite toggle integration tests"
git push
```

### Commit N+1: Pre-Merge Cleanup

```bash
# All tasks complete, tests passing
# Delete feature spec

git rm .feature-spec.md
git commit -m "chore: remove feature spec before merge

Feature implementation complete:
- Database migration applied
- API endpoint tested
- UI components implemented
- Documentation updated
- All tests passing

Feature spec no longer needed."

git push
```

### Merge to Main

```bash
# Sam runs pre-merge verification
npm run typecheck  # ✓
npm run lint       # ✓
npm test           # ✓
npm run build      # ✓
npm run build:frontend  # ✓

# Verify .feature-spec.md is gone
ls -la .feature-spec.md  # should error

# Merge
git checkout main
git pull
git merge feature/movie-favorites --no-ff

# Merge commit message:
```

```
Merge feature/movie-favorites: Add movie favorites functionality

Adds ability to mark movies as favorites with UI toggle.

Implementation:
- Database: is_favorite column on movies table
- API: PATCH /api/movies/:id/favorite endpoint
- UI: FavoriteButton component with heart icon
- Tests: Integration tests for favorite toggling

Documentation updated:
- docs/architecture/DATABASE.md
- docs/architecture/API.md
- docs/frontend/COMPONENT_REFERENCE.md
```

```bash
git push
git branch -d feature/movie-favorites
git push origin --delete feature/movie-favorites
```

---

## Pre-Merge Verification Checklist

**Sam enforces before allowing merge**:

```markdown
### Code Quality
- [ ] TypeScript compiles with no errors (`npm run typecheck`)
- [ ] ESLint passes with no errors (`npm run lint`)
- [ ] Backend builds successfully (`npm run build`)
- [ ] Frontend builds successfully (`npm run build:frontend`)

### Testing
- [ ] All existing tests pass (`npm test`)
- [ ] New tests added for new functionality
- [ ] Manual testing completed in browser
- [ ] No console errors in development or production build

### Documentation
- [ ] All affected docs updated in feature branch
- [ ] ROADMAP.md updated with completion
- [ ] **`.feature-spec.md` deleted from branch** ⭐

### Git Hygiene
- [ ] Feature branch is up to date with main (`git pull origin main`)
- [ ] Commits are clean and follow conventional commit format
- [ ] No merge conflicts
- [ ] Branch ready to merge

### Feature Completeness
- [ ] All tasks from .feature-spec.md completed
- [ ] Success criteria met
- [ ] No known bugs or regressions
```

**If any item fails**: Fix before merge allowed

---

## Machine Transition Example

### Session 1 (Machine A)

```bash
# User: "I want to add movie favorites"
# Alex: Planning mode activated, consulting agents...
# ... planning complete ...

git checkout -b feature/movie-favorites
# .feature-spec.md created
git add .feature-spec.md
git commit -m "plan: movie favorites feature"
git push -u origin feature/movie-favorites

# Session ends
```

### Session 2 (Machine B)

```bash
# Fresh session, different machine
git fetch
git checkout feature/movie-favorites
git pull

# .feature-spec.md is available!
cat .feature-spec.md  # Review plan

# User: "Let's implement"
# Sam: Implementation mode, spawning agents...
# ... several commits ...
git push

# Session ends
```

### Session 3 (Machine A)

```bash
# Back on original machine
git checkout feature/movie-favorites
git pull

# All work from Machine B is here
# Continue implementation...
# ... final commits ...

# Ready to merge
git rm .feature-spec.md
git commit -m "chore: remove feature spec before merge"
git push

# Sam runs pre-merge checklist
# All checks pass

git checkout main
git merge feature/movie-favorites --no-ff
git push
git branch -d feature/movie-favorites
```

---

## Example Planning Session

**User**: "I want to add a 'Mark as Favorite' feature for movies"

**Primary AI**:
> Analyzing complexity... This affects database, backend API, and frontend UI.
>
> **Switching to Planning Mode** (I'm now Alex, Product Owner)
>
> This is a **medium-complexity feature** requiring:
> - Database changes (new column)
> - Backend API (new endpoint)
> - Frontend UI (button component)
>
> Before consulting agents, I have a few clarifying questions:
>
> 1. Should favorites be user-specific or global (applies to all users)?
> 2. Should favorite status affect any automation (like enrichment priority)?
> 3. UI placement preference: movie grid, detail view, or both?
> 4. Any visual design requirements for the favorite indicator?

**User**: "Global for now, no automation, both views, use a heart icon"

**Alex**:
> Perfect, that clarifies scope. Creating feature branch and consulting agents...
>
> ```
> git checkout -b feature/movie-favorites
> ```
>
> Consulting **Morgan (Technical Architect)** for architectural review...

**[Morgan agent spawned, analyzes, returns report]**

**Alex**:
> Morgan's analysis complete. Now consulting **Jordan (Backend Lead)** for API design...

**[Jordan agent spawned, analyzes, returns report]**

**Alex**:
> Jordan's analysis complete. Now consulting **Casey (Frontend Lead)** for UI approach...

**[Casey agent spawned, analyzes, returns report]**

**Alex**:
> All agents consulted. Synthesizing plan...
>
> ## Planning Summary
>
> ### Database (Morgan's Analysis)
> - Add `is_favorite BOOLEAN DEFAULT 0` column to `movies` table
> - Migration: `ALTER TABLE movies ADD COLUMN is_favorite BOOLEAN DEFAULT 0`
> - Index not needed (low cardinality, no filtering queries planned)
>
> ### Backend (Jordan's Analysis)
> - New endpoint: `PATCH /api/movies/:id/favorite`
>   - Request: `{ favorite: boolean }`
>   - Response: Updated movie object
> - Service method: `MovieService.toggleFavorite(movieId)`
> - No authentication required (global favorites)
>
> ### Frontend (Casey's Analysis)
> - New component: `FavoriteButton` (atom)
>   - Heart icon (outlined/filled states)
>   - Props: `movieId`, `isFavorite`, `onToggle`
>   - Accessibility: ARIA label, keyboard support
> - Hook: `useToggleFavorite()` with optimistic updates
> - Integrate in: `MovieCard` and `MovieDetailView`
>
> ### Testing Strategy
> - Unit: `MovieService.toggleFavorite()` method
> - Integration: API endpoint toggle behavior
> - Manual: UI toggle in both views
>
> ### Documentation Updates
> - `docs/architecture/DATABASE.md`
> - `docs/architecture/API.md`
> - `docs/frontend/COMPONENT_REFERENCE.md`
>
> ### Implementation Tasks (for ROADMAP.md)
> 1. Database migration
> 2. MovieService.toggleFavorite method
> 3. API endpoint
> 4. FavoriteButton component
> 5. Integration in MovieCard and MovieDetailView
> 6. Tests
> 7. Documentation updates
>
> **Estimated Effort**: ~3-4 hours
>
> Creating `.feature-spec.md` with full details...
>
> **Approve to proceed with implementation?**

**User**: "Yes, proceed"

**Alex**:
> Plan approved. Committing feature specification...
>
> ```bash
> git add .feature-spec.md
> git commit -m "plan: add movie favorites feature
>
> Planning complete with Morgan, Casey, and Jordan.
>
> Changes planned:
> - Database: is_favorite column on movies table
> - API: PATCH /api/movies/:id/favorite
> - UI: FavoriteButton component with optimistic updates
>
> See .feature-spec.md for full details."
>
> git push -u origin feature/movie-favorites
> ```
>
> **Switching to Implementation Mode** (I'm now Sam, Implementation Coordinator)
>
> Updating ROADMAP.md with implementation tasks...
>
> Spawning implementation agents (within 6-agent limit)...

---

## Abort Feature Example

**Scenario**: During implementation, discover that favorites require user authentication, which doesn't exist yet. ROI is low to build auth system just for favorites.

**Sam**:
> Implementation has revealed a design flaw: favorites should be user-specific, but we have no authentication system. Building auth is a much larger effort (2+ weeks).
>
> **Options**:
> 1. **Abort feature** (delete branch) - Clean slate, no technical debt
> 2. **Reconsult agents** - Redesign as global favorites with migration plan for future user-specific
> 3. **Continue** - Build basic auth system (large scope creep)
>
> **Recommendation**: Abort and revisit after authentication is built.
>
> **Approve abort?**

**User**: "Yes, abort"

**Sam**:
> Aborting feature/movie-favorites...
>
> ```bash
> git checkout main
> git branch -D feature/movie-favorites
> git push origin --delete feature/movie-favorites
> ```
>
> Feature branch deleted. All work discarded. Main branch unchanged.
>
> Updating ROADMAP.md:
> - Backlog: "Add movie favorites (requires auth system first)"
> - Backlog: "Build user authentication system"

---

## See Also

- [WORKFLOW.md](WORKFLOW.md) - Complete development workflow
- [ROADMAP.md](ROADMAP.md) - Task tracking and session continuity
- [DOCUMENTATION_RULES.md](DOCUMENTATION_RULES.md) - Doc update requirements
- [CODING_STANDARDS.md](CODING_STANDARDS.md) - Code quality standards
- [TESTING.md](TESTING.md) - Testing requirements
