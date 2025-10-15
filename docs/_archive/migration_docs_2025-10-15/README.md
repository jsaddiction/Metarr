# Archived Migration Documentation

**Archived**: 2025-10-15
**Reason**: Documentation consolidation - replaced with single source of truth

---

## What Happened

These documents were created during the backend completion and frontend overhaul phases (October 2025). They served their purpose but became confusing due to:

1. **Multiple overlapping roadmaps** - 3 different documents tracking progress
2. **Conflicting status** - One said frontend 0%, another said Stages 1-3 complete
3. **Information duplication** - Same info spread across multiple files

## The Solution

Consolidated into **4 core documents** (see `docs/`):

1. **[PROJECT_ROADMAP.md](../../PROJECT_ROADMAP.md)** - Current status, quick reference, what's next
2. **[STAGE_DEFINITIONS.md](../../STAGE_DEFINITIONS.md)** - Detailed stage plans
3. **[GIT_WORKFLOW.md](../../GIT_WORKFLOW.md)** - Development workflow and git operations
4. **[DESIGN_DECISIONS.md](../../DESIGN_DECISIONS.md)** - Architectural reasoning

---

## Files in This Archive

### 1. MIGRATION_ROADMAP_backend_completion.md

**Original**: `MIGRATION_ROADMAP.md` (root directory)
**Last Updated**: 2025-10-13
**Purpose**: Tracked backend completion (Phases 0-6) and code review

**What Was Valuable**:
- Backend phase documentation (Phase 0-6 complete)
- Code review session summary (security hardening)
- Decision log (validation, circuit breaker, health checks)

**Why Archived**: Said "Frontend 0% complete" but git history showed Stages 1-3 done. Conflicted with other docs.

---

### 2. IMPLEMENTATION_ROADMAP_original_plan.md

**Original**: `docs/IMPLEMENTATION_ROADMAP.md`
**Created**: Original project planning (early October 2025)
**Purpose**: Bottom-up rebuild plan (12 phases, 20-26 weeks)

**What Was Valuable**:
- Original architectural vision
- Phase-by-phase breakdown (Foundation → Movies → Providers → Assets → Jobs → Webhooks → Kodi → Locks → TV → Music → Performance → Production)
- Testing strategies
- Estimated timelines

**Why Archived**: This was the ORIGINAL plan. Development actually followed a different, more pragmatic approach (backend first, then frontend stages). Kept for historical reference but no longer the active roadmap.

---

### 3. FRONTEND_OVERHAUL_MIGRATION_PLAN_detailed.md

**Original**: `docs/FRONTEND_OVERHAUL_MIGRATION_PLAN.md`
**Created**: 2025-01-14 (note: future date, likely typo)
**Purpose**: 8-stage frontend migration plan with extensive detail

**What Was Valuable**:
- Stage definitions (Stage 0-8 with full task breakdowns)
- Git workflow documentation (branch strategy, commit conventions)
- Multi-machine development workflow
- API endpoint specifications
- Database migration details
- Testing checklists per stage

**Why Archived**: TOO MUCH detail (1,156 lines). Made it hard to quickly answer "where am I / what's next?". The valuable parts (stages, git workflow) were extracted and condensed into the new consolidated docs.

**What Was Extracted**:
- Stage structure → `STAGE_DEFINITIONS.md` (condensed)
- Git workflow → `GIT_WORKFLOW.md` (enhanced)
- Current status → `PROJECT_ROADMAP.md`

---

### 4. FRONTEND_OVERHAUL_STATUS_obsolete.md

**Original**: `docs/FRONTEND_OVERHAUL_STATUS.md`
**Last Updated**: 2025-01-14 (likely typo - same future date)
**Purpose**: Track progress through frontend stages

**What Was Valuable**:
- Tracked Stage 1-2 completion
- Listed completed tasks and files modified
- Session summaries

**Why Archived**: Outdated (said Stage 3 NOT STARTED, but git showed Stage 3 complete). Replaced by "Current Stage Details" section in PROJECT_ROADMAP.md.

---

## What's Different in the New Docs?

### PROJECT_ROADMAP.md
- **Quick status check** - "Where am I?" section at the top
- **Stage overview** - High-level list of completed/upcoming stages
- **Current stage details** - Focused on the active stage only (not all stages)
- **Quick start** - Commands to run when resuming work
- **Less noise** - 200-300 lines vs 1,156 lines

### STAGE_DEFINITIONS.md
- **Concise stage plans** - Goal, backend, frontend, testing (not 50-line checklists)
- **Completed stages** - Brief summary + git tag
- **Related docs** - Links to technical docs for implementation details
- **Template** - Standard format for all stages

### GIT_WORKFLOW.md
- **Focus on workflow** - Branch strategy, commit conventions, common operations
- **Claude rules** - Critical "DO NOT TOUCH" section for server management
- **Troubleshooting** - Common git issues and solutions
- **Multi-machine workflow** - Syncing between machines

### DESIGN_DECISIONS.md
- **Why, not what** - Captures reasoning, not implementation
- **Alternatives considered** - Documents what we didn't choose
- **Quick reference** - Easy to search for specific decisions

---

## Can I Delete These Files?

**Yes**, but keep the archive for:
1. Historical reference (understanding evolution of the project)
2. Detailed task breakdowns (if you want to expand a stage in the future)
3. Original vision (IMPLEMENTATION_ROADMAP has the 12-phase plan)

**Recommendation**: Keep archived for 6-12 months, then delete if not referenced.

---

## Related Documentation

Active docs (see `docs/`):
- [PROJECT_ROADMAP.md](../../PROJECT_ROADMAP.md)
- [STAGE_DEFINITIONS.md](../../STAGE_DEFINITIONS.md)
- [GIT_WORKFLOW.md](../../GIT_WORKFLOW.md)
- [DESIGN_DECISIONS.md](../../DESIGN_DECISIONS.md)

Other archives (see `docs/_archive/`):
- [MIGRATION_EXAMPLE.md](../MIGRATION_EXAMPLE.md) - Example migration patterns
- Old database migrations (when we did clean schema)

---

**Remember**: These docs served their purpose! They got us through backend completion and Stages 0-3. Now we have a clearer, more maintainable structure.
