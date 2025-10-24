# Metarr Project Roadmap

**Last Updated**: 2025-10-21
**Current Phase**: Core Feature Development
**Target v1.0**: Feature-complete with Movies, Kodi, and Webhooks

---

## Vision Statement

Metarr will be a production-ready metadata management system that bridges media managers (*arr stack) and media players (Kodi/Jellyfin/Plex), providing intelligent automation with complete user control.

---

## Release Strategy

### v1.0 - Core Feature Complete (Target: Q1 2025)
**Goal**: Fully functional for movies with Kodi integration and webhook automation

### v1.1 - TV Shows Extension (Target: Q2 2025)
**Goal**: Complete TV show support with season/episode management

### v1.2 - Multi-Player Support (Target: Q2 2025)
**Goal**: Add Jellyfin and Plex integration

### v2.0 - Music & Advanced Features (Target: Q3 2025)
**Goal**: Music library support, advanced automation

---

## Implementation Priority (Critical Path to v1.0)

### 🔴 Phase 1: Critical Media Processing (In Progress)

#### Subtitle Management
- [ ] **Extract subtitles from MKV/MP4 containers** (ffmpeg/mkvtoolnix)
- [ ] **Language detection and naming**
- [ ] **Format support (SRT/ASS/SSA)**
- [ ] **Forced/SDH flag preservation**
- [ ] **OpenSubtitles integration** (fallback)

#### NFO Generation & Parsing
- [ ] **Kodi NFO XML generation** (CRITICAL - Next Priority)
- [ ] **Parse existing NFO files**
- [ ] **Field mapping bidirectional**
- [ ] **Actor/crew with thumbnails**
- [ ] **Ratings and certifications**
- [ ] **Custom field preservation**

#### Asset Selection Algorithm
- [x] Basic scoring algorithm implemented
- [ ] **Resolution scoring (4K > 1080p > 720p)** (enhance existing)
- [ ] **Language preferences**
- [ ] **Aspect ratio matching**
- [ ] **Vote count weighting**
- [ ] **Provider priority**

### 🔴 Phase 2: Integration Layer (Partially Complete)

#### Webhook Processing (Radarr/Sonarr)
- [x] Webhook receiver endpoint
- [x] Workflow control integration
- [x] Job chaining architecture
- [ ] **Download complete handler** (enhance existing)
- [ ] **Upgrade handler** (restore from cache)
- [ ] **Movie deleted handler**
- [ ] **Signature validation** (security)
- [ ] **Path resolution improvements**
- [ ] **Retry mechanism**

#### Kodi Integration
- [x] JSON-RPC client
- [x] Universal group architecture
- [x] Group-level path mapping
- [ ] **Library scan trigger after publish**
- [ ] **Clean library command**
- [ ] **Notification system**
- [ ] **Playback state preservation**
- [ ] **Multi-instance support** (group-aware scanning)

### 🟡 Phase 3: Media Assets (Partially Complete)

#### Trailer Management
- [ ] **YouTube trailer discovery**
- [ ] **yt-dlp integration**
- [ ] **Quality selection (1080p default)**
- [ ] **Local trailer detection**
- [ ] **NFO trailer entry**

#### Image Management
- [x] Basic image downloading
- [x] Content-addressed cache storage
- [x] Deduplication (SHA256-based)
- [ ] **All artwork types (poster/fanart/logo/clearart/banner/discart)**
- [ ] **Resolution requirements per type**
- [ ] **Format conversion if needed**
- [ ] **Thumbnail generation for actors**

### 🟢 Phase 4: Architecture & Deployment (Partially Complete)

#### Job Queue Migration
- [x] **Event-driven job chaining** (COMPLETE 2025-10-21)
- [x] **Workflow control system** (COMPLETE 2025-10-21)
- [x] **WebSocket progress events**
- [ ] **Remove legacy state tracking columns** (optional cleanup)
- [ ] **Status derivation from jobs** (optional enhancement)

#### Workflow Control System (COMPLETE 2025-10-21)
- [x] **WorkflowControlService with caching**
- [x] **Settings API endpoints**
- [x] **Frontend workflow settings page**
- [x] **Job handler integration**
- [x] **Dependency validation**

#### Docker Environment
- [ ] **Multi-stage Dockerfile**
- [ ] **docker-compose.yml with PostgreSQL**
- [ ] **Development environment stack**
- [ ] **Mock services for testing**

---

## Completed Features ✅

### Infrastructure
- ✅ Multi-database support (SQLite + PostgreSQL)
- ✅ Job queue with retry/backoff
- ✅ WebSocket real-time updates
- ✅ UUID-based cache storage
- ✅ Provider rate limiting

### Media Processing
- ✅ Directory scanning
- ✅ FFprobe integration
- ✅ TMDB/TVDB/FanArt providers
- ✅ Basic image downloading
- ✅ File deduplication

### Frontend
- ✅ React + TypeScript + Vite
- ✅ Movie list/detail views
- ✅ Field locking UI
- ✅ Dark/light themes

---

## Development Environment Setup

### Required Stack
```yaml
version: '3.8'

services:
  # Metarr Development
  metarr:
    build: .
    environment:
      - NODE_ENV=development
      - DB_TYPE=postgres
      - REDIS_URL=redis://redis:6379
    volumes:
      - ./src:/app/src
      - ./test-library:/media
      - metarr-cache:/data/cache
    ports:
      - "3000:3000"
      - "3001:3001"

  # PostgreSQL
  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=metarr
      - POSTGRES_USER=metarr
      - POSTGRES_PASSWORD=dev
    ports:
      - "5432:5432"

  # Redis
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  # Mock Radarr
  mock-radarr:
    image: mockserver/mockserver
    volumes:
      - ./dev/mocks:/config
    ports:
      - "7878:1080"

  # Test Kodi
  kodi:
    image: linuxserver/kodi-headless
    volumes:
      - ./test-library:/media
    ports:
      - "8080:8080"
      - "9090:9090"
```

### Test Media Structure
```
test-library/
├── movies/
│   ├── The Matrix (1999)/
│   │   ├── The Matrix (1999).mkv       # Has embedded subs
│   │   ├── The Matrix (1999).en.srt    # External sub
│   │   └── movie.nfo                   # Existing NFO
│   └── Inception (2010)/
│       └── Inception (2010).mkv        # Test file
└── incoming/
    └── New.Movie.2024.1080p.mkv        # Radarr download
```

---

## Success Metrics for v1.0

### Functional
- Process 100 movies < 10 minutes
- Extract subtitles from 90% of containers
- Generate valid Kodi NFOs
- Process webhooks < 5 seconds
- Update Kodi library automatically

### Performance
- 1000+ movie library support
- Concurrent job processing
- Image caching with deduplication
- Resilient to provider failures

---

## Post-v1.0 Roadmap

### v1.1 - TV Shows
- Series/season/episode hierarchy
- TVDB primary provider
- Episode thumbnails
- Air date tracking

### v1.2 - Multi-Player
- Jellyfin API integration
- Plex API integration
- Player-specific metadata formats
- Unified publishing

### v2.0 - Music & Advanced
- Music library support
- MusicBrainz provider
- Advanced automation rules
- Custom metadata fields

---

## Current Development Focus

**Last Updated**: 2025-10-21

**Recent Completion** (2025-10-21):
- ✅ **Workflow Control System**: Global enable/disable switches for 5 automation stages
  - Backend: WorkflowControlService with 1-minute caching + WebSocket broadcasting
  - Backend: SettingsController with full CRUD API for workflow settings
  - Backend: All job handlers refactored to check workflow settings before proceeding
  - Frontend: Workflow settings page with dependency validation
  - Frontend: Quick Actions (Enable All/Disable All), individual stage toggles
  - All stages default to disabled for development safety
- ✅ **Job Chaining Architecture**: Event-driven pipeline replacing synchronous processing
  - Each job handler creates next job in chain (webhook → scan → discover → fetch → select → publish)
  - Chain context passing for maintaining metadata throughout pipeline
  - Workflow-aware job creation (only chains if stage enabled)

**Immediate Next Steps**:
1. **Test Workflow Control System** - Verify end-to-end job chaining and workflow toggles
2. **NFO Generation & Publishing** - Complete handlePublish to write Kodi NFO + assets
3. **Subtitle Extraction** - Extract embedded subtitles from MKV/MP4 containers
4. **Asset Selection Algorithm** - Enhance scoring with resolution/language/aspect ratio

**Pre-Release Priorities**:
1. ✅ Workflow control and job chaining architecture complete
2. ⏳ NFO generation and publishing (critical for Kodi integration)
3. ⏳ Subtitle extraction and management
4. ⏳ Enhanced asset selection algorithm
5. ⏳ Docker deployment testing in live environment
6. ⏳ End-to-end automation testing (webhook → publish → Kodi notification)

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
- ✅ Workflow Control: Global automation stage toggles (webhooks, scanning, identification, enrichment, publishing)
- ✅ Job Chaining: Event-driven pipeline architecture (webhook → scan → discover → fetch → select → publish)

**What's Next**: NFO generation, subtitle extraction, enhanced asset selection, end-to-end testing

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

**Backend** (95%):
- Database schema and migrations
- Service layer (cache, jobs, WebSocket)
- API endpoints (movies, libraries, assets, workflow settings)
- Security hardening
- Scheduled background jobs
- Event-driven job chaining architecture
- Workflow control system (global automation toggles)
- Webhook receiver endpoints
- Kodi JSON-RPC client (basic implementation)
- Path mapping service (group-level)

**Frontend** (60%):
- Layout and routing
- Movies table with virtual scrolling
- BookmarkToggle component (monitored system)
- LockIcon component (field locking)
- Asset candidate browser (scoring + selection)
- Workflow settings page (enable/disable automation stages)

### Remaining for v1.0

**Backend** (Critical):
- NFO file generation (Kodi XML format)
- NFO parsing (import existing metadata)
- Subtitle extraction from video containers
- Enhanced asset selection algorithm (resolution/language/aspect ratio)
- Publishing service (write NFO + assets to library)
- Kodi library scan trigger (after publish)

**Frontend** (Important):
- Webhook configuration UI
- Kodi player management UI
- Webhook event history display
- Asset selection modal (browse/select candidates)
- Real-time job progress indicators

**DevOps**:
- Multi-stage Dockerfile
- Docker Compose with PostgreSQL
- Deployment documentation
- End-to-end testing in Docker environment

---

## 🎉 Success Criteria for v1.0

### Functional Requirements

- [x] Scan movie library and extract metadata
- [x] Fetch metadata from TMDB
- [x] Download and cache asset candidates
- [x] Score and auto-select best assets
- [x] Monitor/unmonitor movies (automation control)
- [x] Lock fields and assets (preserve user edits)
- [x] Workflow control system (global automation toggles)
- [x] Event-driven job chaining architecture
- [x] Receive webhooks from Radarr/Sonarr (basic implementation)
- [x] Trigger enrichment on webhook events (job chaining)
- [ ] **Generate Kodi NFO files** (CRITICAL)
- [ ] **Extract embedded subtitles** (CRITICAL)
- [ ] **Publish NFO + assets to library directory** (CRITICAL)
- [ ] **Notify Kodi to refresh library** (CRITICAL)
- [ ] **Enhanced asset selection algorithm**
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
