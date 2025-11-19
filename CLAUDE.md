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
git clone https://github.com/yourusername/metarr.git
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

### Phase-Based System

Metarr operates through independent, idempotent phases that form an automated chain:

1. **Scanning** - Discover and classify files (REQUIRED)
2. **Enrichment** - Fetch metadata and select assets (optional)
3. **Publishing** - Deploy assets to library (optional)
4. **Player Sync** - Update media players (optional)
5. **Verification** - Ensure cache↔library consistency (optional)
6. **Notification** - Send filtered notifications (optional)

**See**: [docs/phases/OVERVIEW.md](docs/phases/OVERVIEW.md) for complete phase documentation.

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
| Phase behavior | docs/phases/[PHASE].md |
| New configuration | docs/getting-started/CONFIGURATION.md |
| Component pattern | docs/frontend/COMPONENTS.md |
| Provider change | docs/providers/[PROVIDER].md |
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
- Architecture: [docs/architecture/](docs/architecture/)
- Phases: [docs/phases/](docs/phases/)
- Frontend: [docs/frontend/](docs/frontend/)
- Reference: [docs/reference/](docs/reference/)

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
├── getting-started/ # Installation, setup
├── architecture/    # System design
├── phases/          # Phase documentation
├── providers/       # Provider integrations
├── players/         # Media player APIs
├── frontend/        # Frontend docs
├── reference/       # Technical references
├── operations/      # Troubleshooting, monitoring
└── development/     # Development workflow
```

---

## Getting Help

- **Documentation**: Start with [docs/INDEX.md](docs/INDEX.md)
- **Issues**: [GitHub Issues](https://github.com/yourusername/metarr/issues)
- **Development Questions**: See [docs/development/WORKFLOW.md](docs/development/WORKFLOW.md)
