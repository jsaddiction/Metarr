# Development Workflow

**Purpose**: The authoritative development workflow that AI assistants and developers must follow. This document ensures code quality, consistency, and maintainability through systematic verification at every stage.

**Related Docs**:
- Parent: [CLAUDE.md](/CLAUDE.md) - Quick reference
- Related: [ROADMAP.md](./ROADMAP.md), [PLANNING_WORKFLOW.md](./PLANNING_WORKFLOW.md), [TESTING.md](./TESTING.md), [CODING_STANDARDS.md](./CODING_STANDARDS.md)

## Quick Reference

- **Planning vs Implementation**: AI infers when planning is needed, switches modes
- Small, frequent commits (not large batches)
- Read ROADMAP.md before starting any work
- ALWAYS read files before editing
- Use TodoWrite for multi-step tasks
- Run all pre-commit checks before committing
- Update docs when changing behavior
- Never run/kill server processes (AI rule)
- Max 6 concurrent agents for parallel tasks

---

## Development Philosophy

### Core Principles

1. **Small, Frequent Commits**
   - Commit working code frequently
   - Each commit should be a complete, working checkpoint
   - Better to have 10 small commits than 1 large commit
   - Enables easy rollback to last working state

2. **"It Works" Checkpoints**
   - Only commit when code builds and runs
   - Tests must pass before committing
   - No broken builds in git history
   - If uncertain, test before committing

3. **Test-Driven Development**
   - Write tests for new business logic
   - Run tests before committing
   - Fix failing tests immediately
   - Manual testing in browser for UI changes

4. **Documentation as Code**
   - Update docs alongside code changes
   - Stale docs are worse than no docs
   - Link to docs instead of duplicating
   - Follow length limits strictly

---

## Planning vs Implementation Modes

### Overview

AI infers whether a task needs planning based on complexity, systems affected, and ambiguity. Simple changes bypass planning; complex features go through structured planning with named agents.

**Planning Mode**: Alex (Product Owner) + specialized agents (Morgan, Casey, Jordan, Taylor, Riley)
**Implementation Mode**: Sam (Implementation Coordinator) + task-specific agents

**Full details**: See [PLANNING_WORKFLOW.md](./PLANNING_WORKFLOW.md)

### When Planning is Needed (AI Infers)

**Triggers**:
- Multi-system changes (database + API + UI)
- New features (not just modifications)
- Ambiguous requirements
- User says "plan", "design", "what if we..."

**Process**:
1. AI becomes Alex (Product Owner)
2. Creates feature branch: `git checkout -b feature/[name]`
3. Consults planning agents sequentially
4. Creates `.feature-spec.md` in branch
5. Commits: `"plan: [feature] spec"`
6. Push for machine transition safety
7. User approves → transition to implementation

### When Direct Implementation is OK

**Simple changes**:
- Single file modifications
- Styling/text updates
- Bug fixes in isolated areas
- Configuration changes
- Documentation updates

**Process**: Implement directly, no planning phase

### Feature Branch Workflow

**All planning + implementation happens in feature branches**:

```bash
# Planning Phase
git checkout -b feature/[name]
# ... planning agents consulted ...
git add .feature-spec.md
git commit -m "plan: [feature] spec"
git push -u origin feature/[name]

# Implementation Phase (Sam coordinates)
# ... small, frequent commits ...
git push  # After each session for machine transitions

# Pre-Merge
git rm .feature-spec.md
git commit -m "chore: remove feature spec before merge"
git push

# Merge to Main
git checkout main
git merge feature/[name] --no-ff
git push
git branch -d feature/[name]
```

**Abort scenario** (low ROI):
```bash
git checkout main
git branch -D feature/[name]  # Force delete
# All work discarded, clean slate
```

---

## Pre-Work Checklist

**MANDATORY: Complete before starting ANY task**

```
[ ] Read ROADMAP.md - Understand current priorities and context
[ ] Check git status - Ensure clean working directory or understand uncommitted changes
[ ] Pull latest changes - git pull origin main
[ ] Verify dev environment - Confirm npm run dev:all is running (if applicable)
[ ] Review related docs - Read relevant documentation for the area you'll work in
[ ] Check for feature branch - If continuing feature work, checkout and pull
```

**Why this matters**:
- Prevents working on outdated code
- Ensures awareness of in-progress work
- Avoids merge conflicts
- Provides necessary context for decisions
- Resumes feature work correctly after machine transitions

---

## During Development

### 1. Task Tracking with TodoWrite

**When to use TodoWrite**:
- Complex tasks with 3+ distinct steps
- Non-trivial multi-step operations
- When user explicitly requests it
- User provides multiple tasks

**When NOT to use TodoWrite**:
- Single straightforward tasks
- Trivial operations
- Purely conversational requests

**TodoWrite rules**:
- Exactly ONE task in_progress at any time
- Mark completed IMMEDIATELY after finishing
- Create both forms: content (imperative) and activeForm (present continuous)
- Remove irrelevant tasks entirely

### 2. File Editing Rules

**ALWAYS read files before editing**:
```bash
# Bad: Editing without reading
Edit file → Error (tool will fail)

# Good: Read then edit
Read file → Understand content → Edit file
```

**Why**: Prevents corrupting files, ensures context awareness, enables accurate edits

### 3. Incremental Testing

- Test after each logical change
- Don't accumulate untested changes
- Fix issues immediately when found
- Use `npm run typecheck` frequently

### 4. User Communication

- Keep user informed of progress
- Explain what you're doing and why
- Ask for clarification when uncertain
- Report issues immediately

### 5. Commit Frequency

**Good pattern**:
```
Fix parsing bug → Test → Commit
Add validation → Test → Commit
Update docs → Commit
```

**Bad pattern**:
```
Fix bug + Add feature + Update docs + Refactor → Test everything → One big commit
```

---

## Pre-Commit Verification Checklist

**MANDATORY: AI must verify ALL items before committing**

### Code Quality

```
[ ] TypeScript errors resolved
    Command: npm run typecheck
    Must complete with no errors

[ ] No ESLint errors
    Command: npm run lint
    Warnings acceptable, errors must be fixed

[ ] Backend build succeeds
    Command: npm run build
    Must complete without errors

[ ] Frontend build succeeds
    Command: npm run build:frontend
    Must complete without errors
```

### Testing

```
[ ] New tests added for new features
    - Unit tests for business logic
    - Integration tests for API endpoints
    - See TESTING.md for guidelines

[ ] All existing tests pass
    Command: npm test
    Zero failures required

[ ] Manual testing in browser completed
    - Test the specific feature changed
    - Check for regressions in related features
    - Verify UI updates correctly

[ ] No console errors in browser
    - Open DevTools Console tab
    - Perform actions related to your changes
    - Verify no errors or unexpected warnings
```

### Documentation

```
[ ] Relevant docs updated
    See "Documentation Update Requirements" section below

[ ] ROADMAP.md updated if feature work
    - Move completed tasks to "Completed Recently"
    - Add new tasks if discovered during work
    - Update "In Progress" section

[ ] .feature-spec.md deleted if in feature branch preparing for merge
    - CRITICAL: Must be deleted before merging to main
    - Commit deletion: "chore: remove feature spec before merge"
    - Verify: ls -la .feature-spec.md should error

[ ] No TODOs left in code without GitHub issue
    - Either fix TODOs before committing
    - Or create GitHub issue and reference in TODO comment
    - Format: // TODO: Description (Issue #123)
```

### Git

```
[ ] Changes staged appropriately
    - Review git status output
    - Only stage files related to this commit
    - Use git add <specific-files>, not git add .

[ ] Commit message follows convention
    - Format: type(scope): description
    - Types: feat, fix, docs, style, refactor, test, chore
    - Example: feat(enrichment): add provider fallback logic

[ ] No secrets in commit
    - No API keys, passwords, tokens
    - No hardcoded credentials
    - Check .env files not staged

[ ] No debug code left in
    - Remove console.log() statements
    - Remove debugger statements
    - Remove commented-out code blocks
```

---

## Documentation Update Requirements

**Update these docs when making related changes**:

| Change Type | Update These Docs |
|-------------|-------------------|
| New API endpoint | `docs/architecture/API.md` |
| New database table/column | `docs/architecture/DATABASE.md` |
| Phase behavior change | `docs/phases/[PHASE].md` |
| New configuration option | `docs/getting-started/CONFIGURATION.md` |
| New component pattern | `docs/frontend/COMPONENTS.md` |
| Provider integration change | `docs/providers/[PROVIDER].md` |
| Job queue change | `docs/architecture/JOB_QUEUE.md` |
| Asset system change | `docs/architecture/ASSET_MANAGEMENT/` |
| New troubleshooting case | `docs/operations/TROUBLESHOOTING.md` |
| New test pattern | `docs/development/TESTING.md` |
| Coding standard change | `docs/development/CODING_STANDARDS.md` |

**Documentation quality checks**:
- Is the doc still under its length limit?
- Are examples up to date?
- Are links still valid?
- Is the information DRY (not duplicated elsewhere)?

---

## Commit Standards

### Conventional Commits Format

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style (formatting, no logic change)
- `refactor`: Code restructuring (no feature/bug change)
- `test`: Adding or updating tests
- `chore`: Maintenance (dependencies, config)
- `perf`: Performance improvements

**Scope examples**:
- `enrichment`, `scanning`, `publishing` (phases)
- `frontend`, `api`, `database` (layers)
- `tmdb`, `kodi`, `fanart` (integrations)

**Examples**:
```
feat(enrichment): add fallback to secondary providers
fix(scanning): resolve path mapping for Docker volumes
docs(workflow): add pre-commit checklist
refactor(assets): extract scoring logic to separate service
test(movie): add integration tests for CRUD operations
```

### Commit Message Rules

1. **NO AI signatures in commit messages**
   - ❌ "Generated with Claude Code"
   - ❌ "Co-Authored-By: Claude"
   - ✅ Just the conventional commit format

2. **Keep commits small and focused**
   - One logical change per commit
   - Related changes can be grouped
   - Unrelated changes get separate commits

3. **Reference issues when applicable**
   - `fix(api): resolve rate limiting issue (fixes #123)`
   - `feat(player): add Jellyfin support (implements #456)`

4. **Write clear descriptions**
   - Focus on WHAT changed and WHY
   - Not HOW it changed (that's in the diff)
   - Be concise but complete

---

## AI Assistant Specific Rules

### Server Process Control

**NEVER run or kill server processes**:
- ❌ `npm run dev`
- ❌ `npm start`
- ❌ `pkill node`
- ❌ `kill -9 <pid>`

**Why**: User controls the development environment. AI interference can disrupt workflow and cause data loss.

### File Operations

**ALWAYS read files before editing**:
- The Edit tool will FAIL if you haven't read the file first
- Reading provides context for accurate edits
- Prevents accidental file corruption

**Prefer editing over writing**:
- ALWAYS prefer Edit tool for existing files
- Only use Write tool for new files
- Never Write over existing files without reading first

### Task Tracking

**Use TodoWrite for multi-step tasks**:
- Create todos at start of complex work
- Update status in real-time
- Only ONE task in_progress at a time
- Complete tasks immediately after finishing

**Todo format requirements**:
- `content`: Imperative form ("Fix bug")
- `activeForm`: Present continuous ("Fixing bug")
- `status`: pending | in_progress | completed

### Context Efficiency

**Be mindful of token usage**:
- Don't read entire large files unnecessarily
- Use Grep/Glob to find before reading
- Read only relevant sections with offset/limit
- Link to docs instead of duplicating content

**Parallel operations**:
- Run independent operations in parallel
- Use multiple tool calls in single message
- Don't wait unnecessarily for sequential operations

### Task Tool Usage

**When to use Task/Agent tool**:
- Open-ended searches requiring multiple rounds
- Complex analysis across many files
- Large-scale refactoring
- Document generation/migration

**Agent concurrency limit**:
- **Maximum 6 concurrent agents** (hardware performance limit)
- Plan agent waves appropriately
- Wait for wave completion before starting next wave

### Communication Standards

**No emojis**:
- Don't use emojis in code, commits, or docs
- Exception: User explicitly requests emojis

**Clear reporting**:
- Report what you did and results
- Show file paths (absolute, not relative)
- Include relevant code snippets
- Explain decisions when non-obvious

---

## Testing Requirements

### When Tests Are Mandatory

**MUST write tests for**:
- New business logic in services
- New API endpoints
- Data transformations
- Validation logic
- Provider integrations
- Job handlers

**OPTIONAL tests for**:
- Simple CRUD operations
- Straightforward UI components
- Configuration changes

### Test Types

**Unit Tests**:
- Test individual functions/methods
- Mock external dependencies
- Fast execution
- Example: `src/services/__tests__/assetScoring.test.ts`

**Integration Tests**:
- Test API endpoints end-to-end
- Use test database
- Test happy path and error cases
- Example: `src/controllers/__tests__/movieController.test.ts`

**Manual Testing**:
- Test UI changes in browser
- Verify user workflows
- Check responsive design
- Test error messages display correctly

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (during development)
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run specific test file
npm test -- src/services/__tests__/assetScoring.test.ts
```

### Test Quality

**Good tests are**:
- Fast (unit tests < 100ms, integration tests < 1s)
- Isolated (no shared state between tests)
- Repeatable (same result every run)
- Readable (clear arrange/act/assert structure)

See [TESTING.md](./TESTING.md) for detailed testing guidelines.

---

## Troubleshooting Development Workflow

### Issue: TypeScript errors after pull

**Solution**:
```bash
rm -rf node_modules dist
npm install
npm run build
```

### Issue: Tests failing locally but pass in CI

**Cause**: Usually environment differences or stale test data

**Solution**:
```bash
# Clean test database
rm -f data/test.sqlite

# Reinstall dependencies
npm clean-install

# Run tests
npm test
```

### Issue: ESLint errors after dependency update

**Solution**:
```bash
# Update ESLint config
npm run lint:fix

# If that doesn't work, review and fix manually
npm run lint
```

### Issue: Git conflicts in package-lock.json

**Solution**:
```bash
# Discard package-lock changes
git checkout --theirs package-lock.json

# Regenerate lock file
npm install

# Stage and continue
git add package-lock.json
git merge --continue
```

---

## See Also

- [ROADMAP.md](./ROADMAP.md) - Current development priorities
- [TESTING.md](./TESTING.md) - Detailed testing guide
- [CODING_STANDARDS.md](./CODING_STANDARDS.md) - Code style and conventions
- [DOCUMENTATION_RULES.md](./DOCUMENTATION_RULES.md) - How to write/maintain docs
- [/CLAUDE.md](/CLAUDE.md) - Quick reference for AI assistants
