# Metarr Project Roadmap

**Last Updated**: 2025-10-15
**Current Stage**: Stage 4 Complete → Stage 5 Next
**Current Branch**: `master` (after Stage 4 merge)
**Next Branch**: `feature/stage-5-kodi`

---

## 🎯 Quick Status Check

### Where Am I?

**Machine**: Check with `git branch` and `cat docs/PROJECT_ROADMAP.md`

**Current Progress**: Stage 3 Complete (Asset Candidate Caching)

**What's Working**:
- ✅ Backend: Production-ready (Phase 6 complete + security hardening)
- ✅ Database: Clean schema with content-addressed asset storage
- ✅ Frontend: Stages 0-3 complete (Monitored, Locks, Asset Candidates)
- ✅ Real-time: WebSocket broadcasting for live updates
- ✅ Jobs: Background job queue with priority and circuit breaker

**What's Next**: Stage 4 - Webhooks (Radarr/Sonarr Integration)

---

## 📊 Stage Overview

### Completed Stages

- ✅ **Stage 0**: Planning & Git Workflow (`stage-0-complete`)
- ✅ **Stage 1**: Monitored/Unmonitored System (`stage-1-complete`)
- ✅ **Stage 2**: Field & Asset Locking (`stage-2-complete`)
- ✅ **Stage 3**: Asset Candidate Caching (`stage-3-complete`)
- ✅ **Stage 4**: Webhooks (Radarr/Sonarr/Lidarr) (`stage-4-complete`)

### v1.0 Critical Path (Required for Automation Flow)

- ⏳ **Stage 5**: Kodi Integration (Player Notification) ← **NEXT**
- ⏳ **Stage 6**: Polish & Docker Deployment (Community Release)

### Post-v1.0 Features (Not Required for Initial Release)

- 📋 **Stage 7**: Status Pages & Activity Monitoring
- 📋 **Stage 8**: Unknown Files & Blacklist Management
- 📋 **Stage 9**: TV Show Support (Series/Seasons/Episodes)
- 📋 **Stage 10**: Music Support (Artists/Albums/Tracks)

---

## 🚀 v1.0 Definition: Complete Automation Flow

**Goal**: Webhook → Enrich → Publish → Notify

**Flow Requirements**:
1. ✅ Movie monitoring system (on/off per movie)
2. ✅ Field/asset locking (preserve user edits)
3. ✅ Asset candidate caching (automatic selection + manual override)
4. ⏳ Webhook receiver (Radarr/Sonarr → trigger enrichment)
5. ⏳ Kodi integration (notify players after publish)
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
npm run dev:backend     # Terminal 1
npm run dev:frontend    # Terminal 2

# 7. Delete old logs
rm logs/*.*

# 8. Begin work
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

### If on Stage 4 (Webhooks):
1. Read [docs/STAGE_DEFINITIONS.md](STAGE_DEFINITIONS.md) → Stage 4 section
2. Create branch: `git checkout -b feature/stage-4-webhooks`
3. Start with backend: webhook receiver endpoints
4. Reference: [docs/WEBHOOKS.md](WEBHOOKS.md) for Radarr/Sonarr payload formats
5. Test with Radarr's "Test" webhook button

### If Stage 4 Complete (Kodi Integration):
1. Read [docs/STAGE_DEFINITIONS.md](STAGE_DEFINITIONS.md) → Stage 5 section
2. Create branch: `git checkout -b feature/stage-5-kodi`
3. Start with Kodi client: JSON-RPC connection
4. Reference: [docs/KODI_API.md](KODI_API.md) for API specs
5. Test with "VideoLibrary.Scan" notification

### If Both Complete (Docker & Polish):
1. Read [docs/STAGE_DEFINITIONS.md](STAGE_DEFINITIONS.md) → Stage 6 section
2. Create Dockerfile and docker-compose.yml
3. Test deployment on fresh machine
4. Polish: Error handling, logging, UI refinements
5. Write deployment guide

---

## ⚠️ Important Development Rules

### Node Process Management

**CRITICAL**: YOU (the human) control all Node.js servers, NOT Claude!

**Rules for Claude**:
- ❌ NEVER run `npm run dev`, `npm start`, or any Node.js server commands
- ❌ NEVER kill Node processes (`pkill node`, `killall node`)
- ✅ Ask you to restart servers when file changes require it
- ✅ Tell you when hot-reload should handle changes automatically

**Why**: Killing Node processes is suicidal - Claude loses all context if you have to restart the conversation.

### Git Workflow

- Always work on feature branches: `feature/stage-X-name`
- Commit frequently with clear messages: `stage-X: description`
- Tag stage completions: `git tag stage-X-complete`
- See [docs/GIT_WORKFLOW.md](GIT_WORKFLOW.md) for full workflow

### Database Changes

- Development uses SQLite (`data/metarr.sqlite`)
- Fresh start: Delete DB file + run `npm run migrate`
- Clean schema: `20251015_001_clean_schema.ts`
- Always delete logs when restarting: `rm logs/*.*`

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
