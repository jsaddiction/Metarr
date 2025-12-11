# Metarr - AI Assistant Instructions

## What is Metarr?

Metarr is a Docker-first metadata management application that bridges media downloaders (*arr stack) and media players (Kodi/Jellyfin/Plex). It provides intelligent automation with complete user control, maintaining a protected cache of all metadata and artwork.

**Core Value Proposition:**
- **Automated enrichment** from multiple providers (TMDB, TVDB, Fanart.tv)
- **Protected asset cache** survives media manager deletions and provider removals
- **Granular field locking** preserves manual edits from automation
- **Disaster recovery** built-in via content-addressed storage

**Technology Stack:**
- Backend: Node.js 20+ with TypeScript, Express.js, SQLite/PostgreSQL
- Frontend: React 18+ with TypeScript, Vite, Tailwind CSS v4
- Job Queue: SQLite-based with worker pool
- Communication: REST API + WebSocket for real-time updates

**Core Philosophy**: "Intelligent Defaults with Manual Override Capability"
- User Control First: Every automated decision can be overridden
- Field-Level Locking: Manual edits are sacred and preserved
- Protected Cache: Source of truth that survives all external changes
- Graceful Degradation: Each phase optional except scanning

---

## Quick Start

```bash
# Clone and install
git clone https://github.com/jsaddiction/Metarr.git
cd metarr
npm install

# Development (zero configuration required!)
npm run dev:all         # Starts backend (port 3000) and frontend (port 3001)

# Production
npm run build           # Build backend
npm run build:frontend  # Build frontend
npm start              # Run production server
```

**Zero Configuration**: Metarr includes embedded API keys for all providers. Clone → Install → Run. No API signup required for development.

---

## Architecture at a Glance

### Three-Job Pipeline

Metarr processes media through three independent jobs:

```
SCANNING → ENRICHMENT → PUBLISHING
```

1. **Scanning** - Discover files, classify, extract identity (REQUIRED)
2. **Enrichment** - Fetch metadata, select assets, download to cache (optional)
3. **Publishing** - Deploy assets to library, generate NFO (optional)

**Operational Concepts** (design principles): [docs/concepts/](docs/concepts/README.md)
**Implementation Details** (media-specific): [docs/implementation/](docs/implementation/README.md)

### Independent Jobs

Beyond the main pipeline, Metarr supports independent jobs:

4. **Player Sync** - Update media players (optional)
5. **Verification** - Ensure cache↔library consistency (optional)
6. **Notification** - Send filtered notifications (optional)

**See**: [docs/concepts/](docs/concepts/README.md) for complete job documentation.

### Asset Tiers

```
CANDIDATES → CACHE → LIBRARY

CANDIDATES: Provider URLs in database (provider_assets table)
CACHE:      Downloaded files in protected storage (cache_image_files table)
LIBRARY:    Working copies for media players (library_image_files table)
```

**Two-Copy System:**
- **Cache** (`/data/cache/`): Protected SHA256-sharded storage
- **Library** (`/media/movies/`): Working copies with Kodi naming conventions

**See**: [docs/architecture/ASSET_MANAGEMENT/](docs/architecture/ASSET_MANAGEMENT/) for complete asset system details.

### Job-Driven Automation

Phases trigger sequentially via job queue. Each phase checks configuration and either processes or skips to next phase. **See**: [docs/architecture/JOB_QUEUE.md](docs/architecture/JOB_QUEUE.md)

---

## Critical AI Assistant Rules

### Pre-Work Checklist

Before starting ANY task:
- [ ] Read [docs/development/ROADMAP.md](docs/development/ROADMAP.md) - understand current priorities
- [ ] Read [docs/development/WORKFLOW.md](docs/development/WORKFLOW.md) - complete workflow rules
- [ ] Check git status - ensure clean working directory
- [ ] Verify dev environment if needed (user controls `npm run dev:all`)

### Development Workflow Summary

**Full workflow in**: [docs/development/WORKFLOW.md](docs/development/WORKFLOW.md)

**Key Rules**: Small commits, read before edit, use TodoWrite, test incrementally

**Parallel Agent Limit**: **Maximum 6 concurrent agents** (hardware limit)

**Database Migrations**: **CRITICAL - Edit existing migration, don't create new ones**
Edit `src/database/migrations/20251015_001_clean_schema.ts` directly when adding tables/columns. Never create new migration files (e.g., `202511XX_002_*.ts`). Full details in [CODING_STANDARDS.md](docs/development/CODING_STANDARDS.md#database).

### Planning vs Implementation Modes

**AI infers** when planning is needed based on complexity and systems affected.

**Planning Mode** (Alex + specialized agents):
- Trigger: Multi-system features, ambiguous requirements, new features
- Process: Create feature branch → consult agents → create `.feature-spec.md` → commit & push
- Agents: Morgan (architect), Casey (frontend), Jordan (backend), Taylor (QA), Riley (devops)
- Output: Feature specification in branch-tracked `.feature-spec.md`

**Implementation Mode** (Sam + task agents):
- Trigger: User approves plan
- Process: Read spec → spawn agents (max 6) → implement → small commits → delete spec before merge
- Pre-merge: Delete `.feature-spec.md`, verify all checks pass, merge to main

**Abort**: If ROI too low, `git branch -D feature/[name]` discards all work

**Full details**: [docs/development/PLANNING_WORKFLOW.md](docs/development/PLANNING_WORKFLOW.md)

### Pre-Commit Verification (MANDATORY)

Before EVERY commit, verify ALL items:

**Code Quality**:
- [ ] TypeScript errors resolved (`npm run typecheck`)
- [ ] No ESLint errors (`npm run lint`)
- [ ] Backend build succeeds (`npm run build`)
- [ ] Frontend build succeeds (`npm run build:frontend`)

**Testing**:
- [ ] New tests added for new features
- [ ] All existing tests pass (`npm test`)
- [ ] Manual testing in browser completed
- [ ] No console errors in browser

**Documentation**:
- [ ] Relevant docs updated (see checklist in WORKFLOW.md)
- [ ] ROADMAP.md updated if feature work
- [ ] No TODOs left in code without GitHub issue

**Git**:
- [ ] Changes staged appropriately
- [ ] Commit message follows convention (see WORKFLOW.md)
- [ ] No secrets in commit (API keys, credentials)
- [ ] No debug code left in (console.log, debugger)

### Documentation Update Requirements

**When to update docs** (brief - full list in [docs/development/WORKFLOW.md](docs/development/WORKFLOW.md)):

| Change Type | Update These Docs |
|-------------|-------------------|
| New API endpoint | docs/architecture/API.md |
| Database change | docs/architecture/DATABASE.md |
| Job/phase behavior | docs/concepts/[JOB]/ |
| Media-specific implementation | docs/implementation/[MEDIA_TYPE]/ |
| New configuration | Update relevant concepts or architecture doc |
| Component pattern | docs/frontend/COMPONENT_REFERENCE.md |
| Provider change | docs/implementation/Providers/[PROVIDER].md |
| Asset system change | docs/architecture/ASSET_MANAGEMENT/ |

### Git Commit Standards

**Format**: Conventional commits (see [docs/development/WORKFLOW.md](docs/development/WORKFLOW.md))

```
type(scope): subject

body (optional)
```

**Types**: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

**CRITICAL**:
- ❌ **NO AI signatures** in commit messages
- ❌ **NO** "Generated with Claude" or similar
- ❌ **NO** "Co-Authored-By: Claude" lines
- ✅ Clean, focused commit messages only

### Server Control Prohibitions

**AI MUST NEVER**:
- Run `npm start`, `npm run dev`, `npm run dev:all`
- Kill Node.js processes
- Restart servers
- Execute `pm2` or similar process managers

**User controls all servers**. AI can:
- Run linters (`npm run lint`)
- Run type checks (`npm run typecheck`)
- Run builds (`npm run build`)
- Run tests (`npm test`)

### Context Efficiency Rules

**Always load**: CLAUDE.md, WORKFLOW.md, ROADMAP.md

**Load as needed**: Phase docs, architecture docs, frontend docs (use directory READMEs first)

### Testing Requirements

Tests mandatory for: business logic, API endpoints, database ops, algorithms

Run: `npm test` or `npm run test:watch`

**See**: [docs/development/TESTING.md](docs/development/TESTING.md)

---

## Documentation Navigation

**Complete map**: [docs/INDEX.md](docs/INDEX.md)

**Critical docs** (read every session):
- [docs/development/WORKFLOW.md](docs/development/WORKFLOW.md) - Complete workflow
- [docs/development/ROADMAP.md](docs/development/ROADMAP.md) - Current priorities

**Key references**:
- Operational Concepts: [docs/concepts/](docs/concepts/README.md) - Design principles for each job
- Implementation: [docs/implementation/](docs/implementation/README.md) - Media-specific details (Movies, TV Shows, Music)
- Job Queue: [docs/architecture/JOB_QUEUE.md](docs/architecture/JOB_QUEUE.md) - Job priorities, workers, configuration
- Architecture: [docs/architecture/](docs/architecture/) - Database, API, asset management
- Frontend: [docs/frontend/](docs/frontend/) - React components, styling
- Reference: [docs/reference/](docs/reference/) - Technical specifications

---

## Project Structure

```
src/
├── controllers/      # Request handlers
├── services/        # Business logic
├── types/           # TypeScript type definitions
├── routes/          # API endpoints
├── database/        # Migrations & schema
├── config/          # Configuration
├── middleware/      # Express middleware
├── validation/      # Input validation
├── errors/          # Error classes
└── utils/           # Helpers

public/frontend/
├── src/
│   ├── components/  # React components
│   ├── pages/       # Route pages
│   └── styles/      # CSS & theme
└── index.html

data/                # Runtime data (git-ignored)
├── cache/           # Protected assets
├── recycle/         # Deleted items
└── metarr.sqlite    # Database

docs/                # Documentation
├── INDEX.md         # Documentation map
├── concepts/  # Design principles
│   ├── Scanning/    # Discovery, classification, identity
│   ├── Enrichment/  # Scraping, downloading, caching
│   ├── Publishing/  # Library deployment, NFO generation
│   ├── PlayerSync/  # Media player notifications
│   ├── Verification/ # Cache↔library consistency
│   └── Notification/ # Alert delivery
├── implementation/  # Media-specific implementation
│   └── Movies/      # Movie enrichment pipeline
├── architecture/    # System design (includes job queue)
├── frontend/        # Frontend docs
├── reference/       # Technical references
└── development/     # Development workflow
```

---

## Getting Help

- **Documentation**: Start with [docs/INDEX.md](docs/INDEX.md)
- **Issues**: [GitHub Issues](https://github.com/jsaddiction/Metarr/issues)
- **Development Questions**: See [docs/development/WORKFLOW.md](docs/development/WORKFLOW.md)
