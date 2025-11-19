# Documentation Migration Plan

## Executive Summary

**Goal**: Archive all current documentation and rebuild from scratch with strict length limits, DRY principles, and context-efficiency as primary concerns.

**Status**: Planning phase - DO NOT execute until approved

**Estimated Scope**:
- Archive: ~52,861 lines current docs
- New docs: ~17,000 lines (67% reduction)
- Timeline: Execute via parallel agents in single session

---

## Migration Phases

### Phase 1: Archive Current State ✅
**Goal**: Preserve all existing docs for reference without cluttering active workspace

**Actions**:
1. Create `/docs/archive-2025-11-19/` directory
2. Move ALL current `/docs/**/*.md` files to archive (preserve structure)
3. Keep only `/CLAUDE.md` and `/README.md` in root temporarily

**Verification**:
- [ ] All docs preserved in dated archive
- [ ] /docs/ directory empty except archive folder
- [ ] Git history intact

---

## Phase 2: New Documentation Structure

### Root Level (AI & Human Entry Points)

#### `/CLAUDE.md` (250 lines max)
**Purpose**: AI assistant instructions + project quickstart

**Sections**:
1. **What is Metarr?** (50 lines)
   - Value proposition
   - Core philosophy: "Intelligent defaults with manual override"
   - Technology stack overview

2. **Quick Start** (40 lines)
   - Clone → Install → Run (zero config)
   - Development commands
   - Production build

3. **Architecture at a Glance** (60 lines)
   - Phase-based system (brief, link to docs)
   - Asset tiers: CANDIDATES → CACHE → LIBRARY (brief, link to ASSET_MANAGEMENT/)
   - Job-driven automation

4. **Critical AI Assistant Rules** (100 lines) ⭐
   - Development workflow checklist (link to WORKFLOW.md for details)
   - Git commit standards (brief, link to WORKFLOW.md)
   - Documentation update requirements
   - Testing requirements
   - Pre-commit verification checklist
   - Context efficiency rules
   - Server control prohibitions
   - **Parallel agent limit: Maximum 6 concurrent agents** (hardware performance)

**Links to**:
- `/docs/INDEX.md` - Full documentation map
- `/docs/development/WORKFLOW.md` - Complete dev workflow
- `/docs/architecture/ASSET_MANAGEMENT/` - Asset system details
- `/docs/phases/` - Phase documentation

---

#### `/README.md` (100 lines max)
**Purpose**: Human-focused project introduction and navigation

**Sections**:
1. Project description (20 lines)
2. Features at a glance (20 lines)
3. Quick start (30 lines)
4. Documentation navigation (30 lines)

---

#### `/CONTRIBUTING.md` (200 lines max)
**Purpose**: Human contributor guide (not for AI)

**Sections**:
1. Code of conduct
2. How to contribute
3. Development setup
4. Testing requirements
5. PR process
6. Link to `/docs/development/WORKFLOW.md`

---

### `/docs/` Directory Structure

```
docs/
├── INDEX.md                                    # Documentation map
├── getting-started/
│   ├── INSTALLATION.md
│   ├── DOCKER.md
│   ├── CONFIGURATION.md
│   ├── FIRST_RUN.md
│   └── MIGRATION.md
├── architecture/
│   ├── OVERVIEW.md
│   ├── ASSET_MANAGEMENT/
│   │   ├── README.md                          # Overview + tier flow
│   │   ├── ASSET_TYPES.md                     # Media-specific assets
│   │   ├── CONTENT_ADDRESSING.md              # SHA256 sharding
│   │   ├── TWO_COPY_SYSTEM.md                 # Cache vs Library
│   │   └── FIELD_LOCKING.md                   # Lock behavior
│   ├── DATABASE.md
│   ├── JOB_QUEUE.md
│   └── API.md
├── phases/
│   ├── OVERVIEW.md
│   ├── SCANNING.md
│   ├── ENRICHMENT.md                          # The beast (500 lines)
│   ├── PUBLISHING.md
│   ├── PLAYER_SYNC.md
│   ├── VERIFICATION.md
│   └── NOTIFICATION.md
├── providers/
│   ├── OVERVIEW.md
│   ├── RATE_LIMITING.md
│   ├── TMDB.md
│   ├── TVDB.md
│   ├── FANART.md
│   ├── MUSICBRAINZ.md
│   ├── LOCAL_BACKUP.md
│   └── GETTING_API_KEYS.md
├── players/
│   ├── OVERVIEW.md
│   ├── KODI.md
│   ├── JELLYFIN.md
│   └── PLEX.md
├── frontend/
│   ├── ARCHITECTURE.md
│   ├── COMPONENTS.md
│   ├── STATE_MANAGEMENT.md
│   ├── API_LAYER.md
│   ├── ERROR_HANDLING.md
│   └── UI_STANDARDS.md
├── reference/
│   ├── ASSET_SCORING.md
│   ├── NFO_FORMAT.md
│   ├── PATH_MAPPING.md
│   ├── WEBHOOKS.md
│   └── CLI_REFERENCE.md
├── operations/
│   ├── TROUBLESHOOTING.md
│   ├── PERFORMANCE.md
│   ├── BACKUP_RECOVERY.md
│   ├── SECURITY.md
│   └── MONITORING.md
└── development/
    ├── WORKFLOW.md                            # ⭐ CRITICAL - Always read
    ├── ROADMAP.md                             # ⭐ CRITICAL - Current tasks
    ├── DOCUMENTATION_RULES.md                 # Meta-documentation
    ├── TESTING.md
    └── CODING_STANDARDS.md
```

---

## Phase 3: Critical Documents (Write First)

### Priority 1: AI Workflow Documents ⭐

#### `/docs/development/WORKFLOW.md` (400 lines max)
**Purpose**: THE authoritative development workflow that AI must follow

**Sections**:

1. **Development Philosophy** (30 lines)
   - Small, frequent commits
   - "It works" checkpoints
   - Test-driven development
   - Documentation as code

2. **Pre-Work Checklist** (40 lines)
   ```
   Before starting ANY task:
   [ ] Read ROADMAP.md - understand current priorities
   [ ] Check git status - ensure clean working directory
   [ ] Pull latest changes
   [ ] Verify dev environment running (npm run dev:all)
   ```

3. **During Development** (50 lines)
   - Use TodoWrite for multi-step tasks
   - Read files before editing (ALWAYS)
   - Test incrementally
   - Keep user informed of progress
   - Small commits frequently (not large batches)

4. **Pre-Commit Verification Checklist** (80 lines) ⭐
   ```
   MANDATORY - AI must verify ALL before committing:

   [ ] Code Quality
       [ ] TypeScript errors resolved (npm run typecheck)
       [ ] No ESLint errors (npm run lint)
       [ ] Build succeeds (npm run build)
       [ ] Frontend build succeeds (npm run build:frontend)

   [ ] Testing
       [ ] New tests added for new features
       [ ] All existing tests pass (npm test)
       [ ] Manual testing in browser completed
       [ ] No console errors in browser

   [ ] Documentation
       [ ] Relevant docs updated (see checklist below)
       [ ] ROADMAP.md updated if feature work
       [ ] No TODOs left in code without GitHub issue

   [ ] Git
       [ ] Changes staged appropriately
       [ ] Commit message follows convention
       [ ] No secrets in commit (API keys, credentials)
       [ ] No debug code left in (console.log, debugger)
   ```

5. **Documentation Update Requirements** (60 lines)
   ```
   Update these docs when:

   New API endpoint → docs/architecture/API.md
   New database table/column → docs/architecture/DATABASE.md
   Phase behavior change → docs/phases/[PHASE].md
   New configuration → docs/getting-started/CONFIGURATION.md
   New component pattern → docs/frontend/COMPONENTS.md
   Provider integration change → docs/providers/[PROVIDER].md
   Job queue change → docs/architecture/JOB_QUEUE.md
   Asset system change → docs/architecture/ASSET_MANAGEMENT/
   New troubleshooting case → docs/operations/TROUBLESHOOTING.md
   ```

6. **Commit Standards** (40 lines)
   - Conventional commits format
   - NO AI signatures in commit messages
   - Keep commits small and focused
   - Reference issues when applicable

7. **AI Assistant Specific Rules** (50 lines)
   - Never run/kill server processes
   - Always read files before editing
   - Use TodoWrite for tracking
   - Context efficiency awareness
   - When to use Task tool vs direct actions
   - **Maximum 6 concurrent agents for parallel tasks** (hardware limit)

8. **Testing Requirements** (50 lines)
   - Unit tests for business logic
   - Integration tests for API endpoints
   - When tests are mandatory
   - How to run test suites

---

#### `/docs/development/ROADMAP.md` (Format: Simple task list)
**Purpose**: Answer "what next?" - Session continuity for daily machine transitions

**Format**:
```markdown
# Development Roadmap

Last updated: 2025-11-19

## In Progress
- [ ] Documentation migration (this file will be updated post-migration)

## Next Up (Priority Order)
- [ ] Task 1 description
- [ ] Task 2 description

## Completed Recently
- [x] Task description (2025-11-19)
- [x] Task description (2025-11-18)

## Backlog
- [ ] Future task 1
- [ ] Future task 2

## Notes
- Keep this updated after every work session
- Move completed tasks to "Completed Recently" with date
- Archive old completed tasks monthly
```

**Usage Pattern**:
- AI reads this at start of session
- AI updates this before completing work
- User reviews/reprioritizes as needed
- Simple checkbox format for clarity

---

#### `/docs/development/DOCUMENTATION_RULES.md` (300 lines max)
**Purpose**: Meta-documentation - rules for writing/maintaining docs

**Sections**:

1. **Philosophy** (30 lines)
   - DRY: One canonical source per concept
   - Brevity: Context window efficiency critical
   - Actionable: Enable work, don't describe code
   - Current: Outdated docs worse than no docs

2. **Length Limits** (40 lines)
   ```
   Strict maximums (exceptions require justification):
   - Overview docs: 200 lines
   - Phase docs: 500 lines
   - Technical references: 500 lines
   - Getting started: 300 lines
   - Development docs: 400 lines
   - Index/navigation: 150 lines

   Directory READMEs: 250 lines max (overview + links)
   ```

3. **Mandatory Structure** (50 lines)
   ```markdown
   Every doc must have:

   # Title

   **Purpose**: 2-3 sentence description

   **Related Docs**:
   - Parent: [link]
   - Related: [link], [link]

   ## Quick Reference (TL;DR)
   - Bullet points for scanning

   ## [Detailed Sections]

   ## See Also
   - [Related doc links]
   ```

4. **When to Update Docs** (80 lines)
   - Triggers for doc updates
   - Which docs to update for which changes
   - How to verify docs are current

5. **Linking Strategy** (40 lines)
   - When to link vs duplicate
   - Relative link format
   - Anchor links for sections
   - External link policy

6. **Forbidden Practices** (30 lines)
   ```
   ❌ Duplicating content (link instead)
   ❌ Implementation details (inline comments instead)
   ❌ Outdated examples (update or remove)
   ❌ External API specs (link to official docs)
   ❌ Verbose obvious explanations
   ❌ Stale TODOs (create issues instead)
   ```

7. **When to Create New Docs** (30 lines)
   - Concept referenced from 3+ places
   - Section exceeds 300 lines in parent doc
   - New major feature added
   - Directory structure guidelines

8. **Archive Policy** (20 lines)
   - When to archive
   - Archive naming convention
   - When to delete archives

---

### Priority 2: Architecture Foundation

#### `/docs/architecture/ASSET_MANAGEMENT/README.md` (250 lines max)
**Purpose**: Canonical source for asset system - THE most-linked doc

**Sections**:

1. **Overview** (40 lines)
   - What is the asset system
   - Why two-copy system
   - Disaster recovery philosophy

2. **Asset Tiers** (60 lines)
   ```
   CANDIDATES → CACHE → LIBRARY

   CANDIDATES: Provider URLs in database (provider_assets table)
   CACHE: Downloaded files in protected storage (cache_image_files table)
   LIBRARY: Working copies for players (library_image_files table)
   ```
   - Tier flow diagram (ASCII)
   - Promotion process
   - Deletion behavior per tier

3. **Architecture Diagram** (40 lines - ASCII art)
   ```
   Provider APIs → Database (candidates)
                       ↓
                  Enrichment Phase
                       ↓
              /data/cache/ (protected)
                       ↓
               Publishing Phase
                       ↓
            /media/movies/ (working)
                       ↓
              Media Players
   ```

4. **Key Behaviors** (60 lines)
   - Original library assets: tracked but not scored
   - At enrichment: providers fetched, scored, user selects
   - At publish: cache assets replace library assets
   - Field locking prevents automated replacement
   - Manual selection always wins

5. **Detailed Documentation Links** (50 lines)
   ```
   For more details:
   - Asset types by media: ASSET_TYPES.md
   - Content addressing: CONTENT_ADDRESSING.md
   - Two-copy system: TWO_COPY_SYSTEM.md
   - Field locking: FIELD_LOCKING.md
   - Database schema: ../DATABASE.md
   ```

---

#### `/docs/architecture/ASSET_MANAGEMENT/ASSET_TYPES.md` (400 lines max)
**Purpose**: Media-specific asset types reference

**Sections**:
1. **Movies** (100 lines)
   - poster, fanart, banner, clearlogo, clearart, discart, landscape, thumb
   - Dimensions, use cases, player support

2. **TV Shows** (100 lines)
   - Show-level assets
   - Season-level assets
   - Episode-level assets

3. **Music** (100 lines)
   - Artist assets
   - Album assets

4. **Actors** (100 lines)
   - Actor images
   - Storage location
   - Player compatibility

---

#### `/docs/architecture/ASSET_MANAGEMENT/TWO_COPY_SYSTEM.md` (300 lines max)
**Purpose**: Explain cache vs library architecture

**Sections**:
1. **Why Two Copies** (60 lines)
   - Protection from media manager deletions
   - Protection from provider removals
   - Disaster recovery
   - Performance considerations

2. **Cache Storage** (80 lines)
   ```
   /data/cache/assets/
     └── ab/              # First 2 chars of SHA256
         └── c1/          # Next 2 chars
             └── abc123...jpg  # Full hash
   ```
   - Content-addressed storage benefits
   - Deduplication automatic
   - Safe from accidental deletion

3. **Library Storage** (80 lines)
   ```
   /media/movies/Movie (2024)/
     ├── movie.mkv
     ├── movie-poster.jpg
     └── movie-fanart.jpg
   ```
   - Kodi naming conventions
   - Player compatibility
   - Working directory philosophy

4. **Synchronization** (80 lines)
   - Publishing process
   - Verification phase
   - Handling discrepancies

---

#### `/docs/architecture/ASSET_MANAGEMENT/FIELD_LOCKING.md` (250 lines max)
**Purpose**: Locking behavior reference

**Sections**:
1. **Philosophy** (40 lines)
   - User control first
   - Manual edits are sacred
   - Automation respects locks

2. **Lockable Fields** (60 lines)
   - Metadata fields (title, plot, etc.)
   - Asset fields (poster, fanart, etc.)
   - Per-field granularity

3. **Locking Behavior** (80 lines)
   - How locks are set (manual edit, explicit lock)
   - What locks prevent (enrichment skips, publishing skips)
   - Lock inheritance (show → season → episode)

4. **Monitored vs Unmonitored** (70 lines)
   - Monitored: Full Metarr management
   - Unmonitored: Global lock on downloadable content
   - Webhook handling differs
   - Stream info updates still allowed

---

### Priority 3: Phase Documentation

#### `/docs/phases/ENRICHMENT.md` (500 lines max - THE BEAST)
**Purpose**: Core functionality - metadata fetch and asset selection

**Critical Requirements**:
- Must clearly articulate original asset handling (not scored, replaced at publish)
- Scoring algorithm summary with link to reference/ASSET_SCORING.md
- Selection vs auto-selection workflows
- Provider prioritization
- Error handling

**Sections** (proposed):
1. **Overview** (40 lines)
2. **Prerequisites** (30 lines)
3. **Phase Flow** (100 lines)
   - Step-by-step workflow
   - Decision points
   - User intervention points
4. **Asset Selection Process** (120 lines)
   - Candidate fetching
   - Scoring overview (link to ASSET_SCORING.md)
   - User selection vs auto-selection
   - Original assets handling ⭐
5. **Provider Prioritization** (60 lines)
6. **Field Locking Behavior** (40 lines - link to ASSET_MANAGEMENT/FIELD_LOCKING.md)
7. **Configuration** (40 lines)
8. **Error Handling** (40 lines)
9. **Job Outputs** (30 lines)

---

#### Other Phase Docs (300-400 lines each)
**Apply same structure**:
- Overview
- Prerequisites
- Phase flow
- Configuration
- Job outputs
- Error handling
- Related docs

---

### Priority 4: Frontend Documentation

**Keep existing structure but enforce length limits**:
- ARCHITECTURE.md (300 lines)
- COMPONENTS.md (400 lines)
- STATE_MANAGEMENT.md (300 lines)
- API_LAYER.md (200 lines)
- ERROR_HANDLING.md (300 lines)
- UI_STANDARDS.md (400 lines - merge BUTTON_STANDARDS into this)

---

### Priority 5: Operational Documentation

#### `/docs/operations/TROUBLESHOOTING.md` (400 lines max)
**Purpose**: Decision tree by symptom

**Format**:
```markdown
## Symptom: Scan not finding files

**Possible causes**:
1. Path mapping issue
   - Check: Docker volume mounts
   - Check: Configuration paths
   - Fix: [link to PATH_MAPPING.md]

2. File permissions
   - Check: ls -la in container
   - Fix: chown commands

[Continue for each symptom]
```

---

## Phase 4: Agent Execution Plan

**Constraint**: Maximum 6 concurrent agents (hardware performance limit)

### Wave 1: Foundation (6 agents in parallel)

**Agent 1: Archive Current Docs**
- Move all /docs/ to /docs/archive-2025-11-19/
- Verify preservation

**Agent 2: Core Architecture Docs**
- ASSET_MANAGEMENT/ directory (all files)
- DATABASE.md
- JOB_QUEUE.md
- API.md

**Agent 3: Phase Documentation**
- All phase docs following new limits
- Special attention to ENRICHMENT.md

**Agent 4: Provider & Player Docs**
- Split providers/OVERVIEW.md
- All provider-specific docs
- All player docs

**Agent 5: Frontend Documentation**
- Enforce length limits
- Merge BUTTON_STANDARDS into UI_STANDARDS

**Agent 6: Development Workflow Docs** ⭐ CRITICAL
- WORKFLOW.md
- ROADMAP.md (initial version)
- DOCUMENTATION_RULES.md
- TESTING.md
- CODING_STANDARDS.md

### Wave 2: Completion (2 agents in parallel, after Wave 1)

**Agent 7: Getting Started & Operations**
- All getting-started/ docs
- All operations/ docs

**Agent 8: Root Files & Index**
- Update CLAUDE.md (focus on AI workflow rules)
- Update README.md
- Create INDEX.md
- Update CONTRIBUTING.md

---

## Phase 5: Verification

### Automated Checks
```bash
# Line count verification
find docs -name "*.md" -exec wc -l {} + | sort -n

# Link validation (check all markdown links)
# TODO: Create script to validate all internal links

# Length limit violations
# TODO: Create script to flag docs exceeding limits
```

### Manual Review Checklist
- [ ] CLAUDE.md includes critical AI workflow rules
- [ ] WORKFLOW.md is comprehensive and clear
- [ ] ROADMAP.md format works for session continuity
- [ ] ASSET_MANAGEMENT/ is canonical source (no duplicates)
- [ ] All phase docs under 500 lines
- [ ] No orphaned docs (all linked from somewhere)
- [ ] INDEX.md accurately maps all docs
- [ ] Pre-commit checklist is actionable

---

## Context Efficiency Guidelines for AI

### When Loading Documentation Context

**Always load** (critical for every session):
1. `/CLAUDE.md` - AI rules and quick reference
2. `/docs/development/WORKFLOW.md` - Development process
3. `/docs/development/ROADMAP.md` - Current priorities

**Load as needed** (task-dependent):
- Working on enrichment → `/docs/phases/ENRICHMENT.md` + `/docs/architecture/ASSET_MANAGEMENT/README.md`
- Working on assets → `/docs/architecture/ASSET_MANAGEMENT/` (specific file)
- Working on frontend → `/docs/frontend/` (specific file)
- Working on providers → `/docs/providers/` (specific file)

**Use directory README pattern**:
- Each directory has README.md with overview + links
- AI loads README first, then specific files as needed
- Prevents loading unnecessary context

---

## Success Criteria

### Quantitative
- [ ] Total active docs: ~17,000 lines (down from 52,861)
- [ ] No doc exceeds stated length limit by more than 10%
- [ ] Zero duplicate concept explanations (verified by search)
- [ ] All phase docs under 500 lines

### Qualitative
- [ ] AI can understand workflow from CLAUDE.md alone
- [ ] Asset system explained once in ASSET_MANAGEMENT/
- [ ] ROADMAP.md effectively answers "what next?"
- [ ] Pre-commit checklist is actionable and complete
- [ ] Docs enable work without describing implementation

### User Experience
- [ ] Daily machine transition: read ROADMAP.md, continue work
- [ ] New contributor: read CLAUDE.md + WORKFLOW.md, start contributing
- [ ] Context efficiency: AI loads <3 docs for most tasks

---

## Post-Migration Tasks

1. **Update ROADMAP.md** with actual next priorities
2. **Test AI workflow** with a small feature implementation
3. **Verify commit process** follows new checklist
4. **Monitor doc usage** - which docs need updates first
5. **Establish doc review cadence** (quarterly archive review)

---

## Rollback Plan

If migration fails or docs are inadequate:
1. Delete new `/docs/` directory
2. Copy from `/docs/archive-2025-11-19/` back to `/docs/`
3. Review what went wrong
4. Adjust plan and retry

---

## Notes for Agent Execution

### Critical Success Factors
1. **DRY Principle**: Before writing any concept, search for existing docs. Link, don't duplicate.
2. **Length Discipline**: If approaching limit, split or trim. No exceptions.
3. **Link Accuracy**: All internal links must use relative paths from doc location.
4. **Consistent Structure**: Follow mandatory structure from DOCUMENTATION_RULES.md.

### Writing Guidelines
- **Brevity**: Every sentence must add value
- **Scannable**: Use bullets, short paragraphs, code blocks
- **Actionable**: Reader should know what to do next
- **Current**: Only document current behavior, remove outdated content

### Common Pitfalls to Avoid
- ❌ Copying from old docs without trimming
- ❌ Including implementation code (use inline comments)
- ❌ Explaining obvious behaviors
- ❌ External API documentation (link instead)
- ❌ Stale examples

---

## Approval Required Before Execution

**Owner must approve**:
- [ ] Directory structure
- [ ] Length limits per category
- [ ] WORKFLOW.md checklist content
- [ ] ROADMAP.md format
- [ ] ASSET_MANAGEMENT/ split (README + 4 sub-docs)
- [ ] Agent parallelization plan

**Then execute**: Archive → Write core docs (agents 1, 2, 6, 8) → Write remaining (agents 3-7) → Verify

---

## Timeline Estimate

**Sequential execution**: 8-12 hours of AI work
**Parallel execution**:
- Wave 1 (6 agents): ~1.5-2 hours
- Wave 2 (2 agents): ~30-45 minutes
- **Total**: ~2-3 hours

**Recommendation**: Execute Wave 1 (6 agents) in parallel, then Wave 2 (2 agents) after completion.

---

## End State Vision

```
Metarr/
├── CLAUDE.md (250 lines) ⭐ AI reads first - includes workflow rules
├── README.md (100 lines) - Human entry
├── CONTRIBUTING.md (200 lines) - Contributor guide
└── docs/
    ├── INDEX.md (150 lines) - Doc map
    ├── archive-2025-11-19/ (old docs preserved)
    ├── getting-started/ (5 docs, ~1200 lines)
    ├── architecture/
    │   ├── OVERVIEW.md
    │   ├── ASSET_MANAGEMENT/ ⭐ Canonical asset system docs
    │   │   ├── README.md (250)
    │   │   ├── ASSET_TYPES.md (400)
    │   │   ├── CONTENT_ADDRESSING.md (200)
    │   │   ├── TWO_COPY_SYSTEM.md (300)
    │   │   └── FIELD_LOCKING.md (250)
    │   ├── DATABASE.md (400)
    │   ├── JOB_QUEUE.md (300)
    │   └── API.md (500)
    ├── phases/ (7 docs, ~2500 lines)
    ├── providers/ (8 docs, ~2200 lines)
    ├── players/ (4 docs, ~1400 lines)
    ├── frontend/ (6 docs, ~1900 lines)
    ├── reference/ (5 docs, ~1750 lines)
    ├── operations/ (5 docs, ~1550 lines)
    └── development/ ⭐ AI reads every session
        ├── WORKFLOW.md (400) ⭐ THE CRITICAL DOC
        ├── ROADMAP.md (evolving) ⭐ "What next?"
        ├── DOCUMENTATION_RULES.md (300)
        ├── TESTING.md (300)
        └── CODING_STANDARDS.md (300)
```

**Total**: ~17,000 lines of focused, DRY, actionable documentation

**AI Workflow**: Read CLAUDE.md (250 lines) + WORKFLOW.md (400 lines) + ROADMAP.md (~100 lines) = ~750 lines to start any session

**Context savings**: 52,861 → 17,000 lines = 67% reduction, 35,000 lines saved

---

## Final Checklist Before Execution

**Plan Approval**:
- [ ] User approves directory structure
- [ ] User approves length limits
- [ ] User approves WORKFLOW.md sections
- [ ] User approves ROADMAP.md format
- [ ] User approves ASSET_MANAGEMENT/ split approach
- [ ] User approves parallel agent plan

**Execution Readiness**:
- [ ] Git status clean (no uncommitted changes)
- [ ] Backup of current docs (git commit before starting)
- [ ] Agent prompts prepared
- [ ] Verification scripts ready
- [ ] Rollback plan understood

**Post-Execution**:
- [ ] All agents completed successfully
- [ ] Verification checks passed
- [ ] User review of critical docs (WORKFLOW, ASSET_MANAGEMENT, ENRICHMENT)
- [ ] Git commit of new documentation
- [ ] Update ROADMAP.md with next actual tasks

---

**STATUS**: Awaiting approval to execute
**NEXT**: Review this plan, provide feedback, approve to proceed
