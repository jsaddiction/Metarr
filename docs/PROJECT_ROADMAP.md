# Metarr Project Roadmap

**Last Updated**: 2025-10-21
**Development Phase**: Pre-Release
**Current Branch**: `master`

---

## Development Model

Metarr development has transitioned from **stage-based** (Stages 0-5) to **feature-based** workflow.

**Current Phase**: Pre-Release Development
**Goal**: Build distributable codebase with production-ready features
**Success Metric**: Reliability + Functionality + Feature Completeness (verified via Docker testing)

---

## Stage Completion History

| Stage | Name | Tag | Completion Date | Notes |
|-------|------|-----|-----------------|-------|
| 0 | Planning & Git Workflow | `stage-0-complete` | 2025-10-15 | Documentation foundation |
| 1 | Monitored/Unmonitored System | `stage-1-complete` | 2025-10-15 | BookmarkToggle component |
| 2 | Field & Asset Locking | `stage-2-complete` | 2025-10-15 | LockIcon component, field-level locking |
| 3 | Asset Candidate Caching | *(no tag)* | 2025-10-15 | **Completed without tag** - Three-tier asset system |
| 4 | Webhooks | `stage-4-complete` | 2025-10-15 | Radarr/Sonarr integration, automatic enrichment |
| 5 | Kodi Integration | `stage-5-complete` | 2025-10-15 | Universal group architecture, player management |

**Post-Stage Development**: Feature-based development began after Stage 5. See [GIT_WORKFLOW.md](GIT_WORKFLOW.md) for current conventions.

---

## Recent Completions

### Database Schema Enhancements (2025-10-21)
- ✅ Added `user_rating` column to movies, series, episodes tables
- ✅ Added `countries` table with junction tables (`movie_countries`, `series_countries`)
- ✅ Added `tags` table with junction tables (`movie_tags`, `series_tags`, `episode_tags`)
- **Impact**: 100% NFO field compatibility with Kodi/Jellyfin
- **Documentation**: DATABASE_SCHEMA.md, NFO_PARSING.md updated

### Frontend Architecture Documentation (2025-10-21)
- ✅ Three-tier type system documented (MovieListItem/MovieDetail/MovieMetadataForm)
- ✅ Full-viewport asset selection modal design specified
- ✅ Field locking UI patterns defined
- ✅ Enrichment status indicators documented
- ✅ Comprehensive UI patterns catalog created
- **Impact**: Clear frontend development roadmap aligned with backend
- **Documentation**: FRONTEND_TYPES.md, ASSET_SELECTION_UI.md, UI_PATTERNS.md created

---

## Current Development Focus

**Active Work** (as of 2025-10-21):
- Frontend: Implementing three-tier type system
- Frontend: Building asset selection modal components
- Frontend: Field locking UI integration
- Backend: API endpoints for asset candidate management

**Pre-Release Priorities**:
1. Fully developed end-to-end workflows (scan → enrich → publish)
2. Basic feature completeness (metadata management, asset handling, player integration)
3. Docker deployment testing in live environment
4. Reliability and stability verification

**v1.0 Release Criteria**: See "Release Philosophy" section below.

---

## Release Philosophy

**Metarr follows a "Pre-Release vs. Post-Release" development model**, not version-number-driven releases.

### Pre-Release Development (Current)
- Rapid iteration and feature development
- Breaking changes allowed
- Focus on functionality and reliability
- No publication timeline pressure

### v1.0 Readiness Criteria
1. ✅ Fully developed workflows exist
2. ✅ Basic features implemented
3. ⏳ End-to-end testing in live Docker environment
4. ⏳ Reliability verified (stability testing)
5. ⏳ Functionality verified (feature completeness)
6. ⏳ Feature-complete for core use cases

**Note**: Many iterations expected before v1.0 publication. Version number is not an indicator of current feature set during pre-release development.

### Post-Release (Future)
- Semantic versioning (major.minor.patch)
- Stable API contracts
- Backwards compatibility commitments
- Published Docker images

---

## 🎯 Quick Status Check

### Where Am I?

**Machine**: Check with `git branch` and `cat docs/PROJECT_ROADMAP.md`

**Current Progress**: Post-Stage 5 (Feature-Based Development)

**What's Working**:
- ✅ Backend: Production-ready (Phase 6 complete + security hardening)
- ✅ Database: Clean schema with content-addressed asset storage + universal groups
- ✅ Frontend: Stages 0-3 complete (Monitored, Locks, Asset Candidates)
- ✅ Real-time: WebSocket broadcasting for live updates
- ✅ Jobs: Background job queue with priority and circuit breaker
- ✅ Webhooks: Radarr/Sonarr/Lidarr integration (Stage 4)
- ✅ Media Players: Universal group architecture with group-level path mapping (Stage 5)

**What's Next**: Pre-release polish, Docker deployment testing, feature completion

---

## 🚀 v1.0 Definition: Complete Automation Flow

**Goal**: Webhook → Enrich → Publish → Notify

**Flow Requirements**:
1. ✅ Movie monitoring system (on/off per movie)
2. ✅ Field/asset locking (preserve user edits)
3. ✅ Asset candidate caching (automatic selection + manual override)
4. ✅ Webhook receiver (Radarr/Sonarr → trigger enrichment)
5. ✅ Media player integration (notify players after publish)
6. ⏳ Docker deployment (ready for community)

**When Complete**: User downloads movie via Radarr → Metarr enriches metadata → publishes assets → notifies Kodi → movie appears with full metadata

---

## 📅 Development History

### Backend Completion (2025-10-11 to 2025-10-13)

**Phases 0-6 Complete**:
- Phase 0: Foundation (database, migrations, server)
- Phase 1-3: Core services (WebSocket, cache, job queue)
- Phase 4: Asset management (content-addressed storage)
- Phase 5: Backend integration
- Phase 6: Scheduled services + job queue integration

**Code Review (2025-10-13)**:
- Security hardening (SQL injection, validation, path traversal)
- Stability improvements (circuit breaker, auto-reconnect, health checks)
- Code quality (structured logging, type safety)
- Documentation (1,600+ lines of architecture docs)

**Result**: Production-ready backend with zero critical vulnerabilities

### Frontend Development (2025-10-15)

**Stage Progression**:
- Stage 0: Planning & git workflow documentation
- Stage 1: Monitored system (BookmarkToggle component, backend skip logic)
- Stage 2: Lock system (LockIcon component, field-level protection)
- Stage 3: Asset candidates (caching service, scoring algorithm, updateAssets job)

**Result**: Core automation features in place, ready for webhook integration

---

## 🎯 Current Stage Details

### Stage 4: Webhooks (Radarr/Sonarr Integration)

**Branch**: `feature/stage-4-webhooks`

**Goal**: Enable automation - incoming webhook triggers enrichment → publish workflow

**Backend Work**:
- Webhook receiver endpoints (`/api/webhooks/radarr`, `/api/webhooks/sonarr`)
- Payload validation (event type, movie/series data)
- Job trigger logic (Download → enrich, MovieFileDelete → capture state, Upgrade → restore)
- Event logging (webhook history table)

**Frontend Work**:
- Webhook configuration UI (display webhook URLs)
- Event history display (last 50 webhook events)
- Test webhook button (verify connection)

**Testing Criteria**:
- Configure Radarr with webhook URL
- Download new movie via Radarr
- Verify Metarr receives webhook and starts enrichment job
- Check metadata and assets published to library
- Test upgrade scenario (delete + restore assets from cache)

**Completion**: Webhook → Enrich → Publish flow working end-to-end

**Related Docs**: See [docs/WEBHOOKS.md](WEBHOOKS.md) for API specs, [docs/STAGE_DEFINITIONS.md](STAGE_DEFINITIONS.md) for detailed tasks

---

### Stage 5: Universal Group Architecture (Kodi/Jellyfin/Plex)

**Branch**: `feature/stage-5-kodi` → **Merged to master**

**Tag**: `stage-5-complete`

**Goal**: Build solid framework for media player management with universal group architecture

**Architecture Decision**: ALL players belong to groups (not just Kodi)
- **Kodi groups**: max_members = NULL (unlimited) - Multiple instances sharing MySQL
- **Jellyfin/Plex groups**: max_members = 1 - Single server per group
- **Path mapping**: Group-level (not player-level)

**Backend Work** (Complete):
- Migration 003: `media_player_libraries` table (links groups to libraries)
- Migration 004: Add `max_members` column to `media_player_groups`
- Migration 005: Create `media_player_group_path_mappings` table
- `MediaPlayerConnectionManager`: Added `validateGroupMembership()` method
- `pathMappingService`: Added group-level path mapping functions
- `webhookProcessingService`: Updated to use group path mapping
- Group-aware scan coordination (one scan per group, fallback logic)
- Group-aware ping and notification methods

**Documentation** (Complete):
- [DESIGN_DECISIONS.md](DESIGN_DECISIONS.md): Universal Group Architecture section
- [ARCHITECTURE.md](ARCHITECTURE.md): Updated with group types and scan strategy
- [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md): Complete schema with all tables
- [STAGE_5_KODI_INTEGRATION.md](STAGE_5_KODI_INTEGRATION.md): Implementation guide

**Key Insights**:
- Consistency: All player types use groups (no special cases)
- Simplification: No branching logic (`if kodi vs if jellyfin`)
- Future-proof: Easy to add Emby, Plex, etc.
- Architecturally correct: Path mapping is group-level concern

**Completion**: Universal group framework ready for all player types

**Related Docs**: See [docs/STAGE_5_KODI_INTEGRATION.md](STAGE_5_KODI_INTEGRATION.md) for detailed architecture

---

## 📚 Documentation Structure

### Core Documents
- **[PROJECT_ROADMAP.md](PROJECT_ROADMAP.md)** (this file) - Quick status, stage overview, what's next
- **[STAGE_DEFINITIONS.md](STAGE_DEFINITIONS.md)** - Detailed stage plans with tasks
- **[GIT_WORKFLOW.md](GIT_WORKFLOW.md)** - Branch strategy, commit conventions, development rules
- **[DESIGN_DECISIONS.md](DESIGN_DECISIONS.md)** - Why we made specific architectural choices

### Technical References
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System design and data flow
- **[DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)** - Complete schema reference
- **[API_ARCHITECTURE.md](API_ARCHITECTURE.md)** - REST + WebSocket API
- **[WEBHOOKS.md](WEBHOOKS.md)** - Webhook integration specs
- **[KODI_API.md](KODI_API.md)** - Kodi JSON-RPC reference
- **[ASSET_MANAGEMENT.md](ASSET_MANAGEMENT.md)** - Three-tier asset system
- **[FIELD_LOCKING.md](FIELD_LOCKING.md)** - Field-level locking system

### Implementation Status
- **[ASSET_DISCOVERY_STATUS.md](ASSET_DISCOVERY_STATUS.md)** - Asset discovery implementation details

### Project Overview
- **[../CLAUDE.md](../CLAUDE.md)** - Project overview, tech stack, quick start

---

## 🔄 Quick Start for New Machine

### Starting a Work Session

```bash
# 1. Navigate to project
cd /home/justin/Code/Metarr

# 2. Check current status
git status
git branch
cat docs/PROJECT_ROADMAP.md

# 3. Pull latest changes
git checkout master
git pull origin master

# 4. Read what stage you're on (this file, top section)
cat docs/PROJECT_ROADMAP.md | head -20

# 5. Create or checkout stage branch
git checkout feature/stage-X-name
# OR create new
git checkout -b feature/stage-X-name

# 6. Start servers (YOU control these, not Claude!)
npm run dev:all         # Runs both backend + frontend concurrently

# 7. Begin work (logs auto-deleted on backend startup)
```

### Completing a Stage

```bash
# 1. Verify all stage tasks complete
cat docs/STAGE_DEFINITIONS.md | grep "Stage X"

# 2. Update this file's "Current Stage" section
nano docs/PROJECT_ROADMAP.md

# 3. Commit stage completion
git add .
git commit -m "stage-X: mark as complete"

# 4. Merge to master
git checkout master
git merge feature/stage-X-name
git push origin master

# 5. Tag completion
git tag stage-X-complete
git push origin --tags

# 6. Create next stage branch
git checkout -b feature/stage-Y-name
```

---

## 🎯 What Should I Work On Next?

**Current Development Model**: Feature-based (post-Stage 5)

### Determining Next Tasks

1. **Check PROJECT_ROADMAP.md** - Review "Current Development Focus" section
2. **Review Git History** - `git log --oneline -20` to see recent work
3. **Check Open Issues** - Any bugs or feature requests to address?
4. **Consult Documentation** - Are technical docs out of sync with code?

### Common Next Steps

**Frontend Work**:
- Complete shadcn/ui component migration for remaining pages
- Build out placeholder pages with actual functionality
- Implement asset selection and management UI
- Add real-time progress indicators for jobs

**Backend Work**:
- Complete API endpoints for all entity types
- Implement missing service layer functionality
- Add comprehensive error handling
- Write tests for critical services

**DevOps Work**:
- Create Dockerfile and docker-compose.yml
- Test deployment in Docker environment
- Write deployment documentation
- Set up CI/CD pipeline (future)

### Creating Feature Branches

```bash
# Create descriptive feature branch
git checkout -b feature/asset-selection-ui
git checkout -b fix/metadata-enrichment-bug
git checkout -b refactor/service-layer-cleanup
git checkout -b docs/api-documentation-update
```

---

## ⚠️ Important Development Rules

### Node Process Management

**CRITICAL**: YOU (the human) control all Node.js servers, NOT Claude!

**Rules for Claude**:
- ❌ NEVER run `npm run dev`, `npm run dev:all`, `npm start`, or any server commands
- ❌ NEVER kill Node processes (`pkill node`, `killall node`)
- ✅ Inform you that nodemon will auto-restart after file changes
- ✅ Ask you to restart servers only when absolutely necessary

**What Claude CAN run**:
- ✅ `npm run build` - Build production assets
- ✅ `npm run typecheck` - Type checking
- ✅ `npm run lint` / `npm run lint:fix` - Linting
- ✅ `npm run format` - Code formatting

**Why**: Killing Node processes terminates Claude's session, losing all context.

### Git Workflow

- Always work on feature branches: `feature/stage-X-name`
- Commit frequently with clear messages: `stage-X: description`
- Tag stage completions: `git tag stage-X-complete`
- See [docs/GIT_WORKFLOW.md](GIT_WORKFLOW.md) for full workflow

### Database Changes

- Development uses SQLite (`data/metarr.sqlite`)
- **Pre-release strategy**: All schema changes in `20251015_001_clean_schema.ts`
- Nodemon auto-restarts on file changes
- Temporary cleanup code auto-deletes old database
- Logs auto-deleted on backend startup
- **Post-release**: Traditional migration flow (protect user data)

---

## 📈 Progress Tracking

### Completed Work

**Backend** (100%):
- Database schema and migrations
- Service layer (cache, jobs, WebSocket)
- API endpoints (movies, libraries, assets)
- Security hardening
- Scheduled background jobs

**Frontend** (50%):
- Layout and routing
- Movies table with virtual scrolling
- BookmarkToggle component (monitored system)
- LockIcon component (field locking)
- Asset candidate browser (scoring + selection)

### Remaining for v1.0

**Backend**:
- Webhook receiver endpoints
- Kodi JSON-RPC client
- Path mapping service

**Frontend**:
- Webhook configuration UI
- Kodi player management UI
- Webhook event history

**DevOps**:
- Dockerfile
- Docker Compose with PostgreSQL
- Deployment documentation

---

## 🎉 Success Criteria for v1.0

### Functional Requirements

- [x] Scan movie library and extract metadata
- [x] Fetch metadata from TMDB
- [x] Download and cache asset candidates
- [x] Score and auto-select best assets
- [x] Monitor/unmonitor movies (automation control)
- [x] Lock fields and assets (preserve user edits)
- [ ] Receive webhooks from Radarr/Sonarr
- [ ] Trigger enrichment on webhook events
- [ ] Publish assets to library directory
- [ ] Notify Kodi to refresh library
- [ ] Docker deployment ready

### Automation Flow Test

**End-to-End Test**:
1. Configure Radarr webhook pointing to Metarr
2. Download movie via Radarr
3. Metarr receives webhook
4. Metarr enriches metadata (TMDB fetch)
5. Metarr selects best assets (scoring algorithm)
6. Metarr publishes assets to library directory
7. Metarr notifies Kodi to refresh
8. Movie appears in Kodi with full metadata

**Success**: Zero manual intervention required

---

## 📞 Related Resources

- **GitHub**: [anthropics/claude-code](https://github.com/anthropics/claude-code/issues) (for Claude Code issues)
- **TMDB API**: https://www.themoviedb.org/settings/api
- **TVDB API**: https://thetvdb.com/api-information
- **Kodi Wiki**: https://kodi.wiki/view/JSON-RPC_API
- **Radarr Webhooks**: https://wiki.servarr.com/radarr/settings#connections

---

**Remember**: This document is the source of truth. Update "Current Stage" section when you complete work!
