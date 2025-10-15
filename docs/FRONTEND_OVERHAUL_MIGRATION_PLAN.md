# Frontend Overhaul Migration Plan

**Created**: 2025-01-14
**Status**: Planning Phase
**Current Stage**: Stage 0 - Planning

---

## Table of Contents

1. [Overview](#overview)
2. [Git Workflow for Multi-Machine Development](#git-workflow-for-multi-machine-development)
3. [Stage Definitions](#stage-definitions)
4. [Backend API Changes](#backend-api-changes)
5. [Frontend Changes](#frontend-changes)
6. [Stage Execution Guide](#stage-execution-guide)
7. [Progress Tracking](#progress-tracking)

---

## Overview

### Goals
- Align frontend with backend's automation-first philosophy
- Implement monitored/unmonitored system (like *arr stack)
- Add asset candidate caching and browser
- Build activity monitoring interface
- Create asset blacklist management
- Add unknown items and needs review pages

### Key Principles
- **Staged Migration**: Each stage is self-contained and can be completed independently
- **Documentation First**: Update docs before marking stage complete
- **Git Discipline**: Clear branch naming, commit messages, and status tracking
- **Multi-Machine Safe**: Each session starts with status check and git pull

---

## Git Workflow for Multi-Machine Development

### Branch Strategy

```
master (main branch)
  ├── feature/stage-1-monitored-system
  ├── feature/stage-2-locks
  ├── feature/stage-3-asset-cache
  ├── feature/stage-4-status-pages
  ├── feature/stage-5-activity-tabs
  ├── feature/stage-6-unknown-files
  └── feature/stage-7-asset-blacklist
```

### Workflow Rules

#### **Starting Work (Any Machine)**
```bash
# 1. Navigate to project
cd c:\Users\04red\Nextcloud\Documents\development\Metarr

# 2. Check current status
git status
git branch

# 3. Pull latest changes
git checkout master
git pull origin master

# 4. Read current stage status
cat docs/FRONTEND_OVERHAUL_STATUS.md

# 5. Checkout or create feature branch
git checkout feature/stage-X-name
# OR create new branch
git checkout -b feature/stage-X-name

# 6. Start work on current stage
```

#### **During Work**
```bash
# Commit frequently with clear messages
git add <files>
git commit -m "stage-X: description of change"

# Examples:
git commit -m "stage-1: add monitored column to movies table"
git commit -m "stage-1: implement toggle monitored endpoint"
git commit -m "stage-1: add bookmark icon to movies list"

# Push to remote regularly (backup)
git push origin feature/stage-X-name
```

#### **Completing a Stage**
```bash
# 1. Update stage status document
# Edit docs/FRONTEND_OVERHAUL_STATUS.md
# Mark stage as COMPLETED
# Update "Current Stage" to next stage

# 2. Commit status update
git add docs/FRONTEND_OVERHAUL_STATUS.md
git commit -m "stage-X: mark as completed"

# 3. Update relevant documentation
# Edit ARCHITECTURE.md, DATABASE_SCHEMA.md, etc. as needed
git add docs/*.md
git commit -m "stage-X: update documentation"

# 4. Merge to master
git checkout master
git merge feature/stage-X-name
git push origin master

# 5. Tag the completion
git tag stage-X-complete
git push origin stage-X-complete

# 6. Start next stage (create new branch)
git checkout -b feature/stage-Y-name
```

#### **Switching Machines Mid-Stage**
```bash
# On Machine A (before stopping work)
git add .
git commit -m "stage-X: WIP - description of current state"
git push origin feature/stage-X-name

# On Machine B (resuming work)
cd c:\Users\04red\Nextcloud\Documents\development\Metarr
git checkout master
git pull origin master
git checkout feature/stage-X-name
git pull origin feature/stage-X-name

# Read status to understand where you left off
cat docs/FRONTEND_OVERHAUL_STATUS.md
git log --oneline -10

# Continue work
```

### Commit Message Convention

```
Format: stage-X: <type>: <description>

Types:
  - backend:  Backend API changes
  - frontend: Frontend component/page changes
  - db:       Database schema changes
  - docs:     Documentation updates
  - test:     Test additions/changes
  - WIP:      Work in progress (mid-stage checkpoint)

Examples:
  stage-1: backend: add monitored column to movies table
  stage-1: frontend: add bookmark toggle to movies list
  stage-1: db: create migration for monitored field
  stage-1: docs: update DATABASE_SCHEMA.md with monitored column
  stage-1: WIP: halfway through monitored system implementation
  stage-1: test: add tests for toggle monitored endpoint
```

---

## Stage Definitions

### Stage 0: Planning (CURRENT)
**Status**: IN PROGRESS
**Branch**: N/A (documentation only)
**Duration**: 1 day

**Objectives**:
- ✅ Create migration plan document
- ✅ Define git workflow
- ✅ Document backend API changes
- ✅ Create stage checkpoint system
- [ ] Review and approve plan
- [ ] Create FRONTEND_OVERHAUL_STATUS.md

**Deliverables**:
- `docs/FRONTEND_OVERHAUL_MIGRATION_PLAN.md` (this file)
- `docs/FRONTEND_OVERHAUL_STATUS.md`

**Completion Criteria**:
- All planning documents created
- Git workflow documented
- Backend API changes documented
- Ready to start Stage 1

---

### Stage 1: Monitored/Unmonitored System
**Status**: NOT STARTED
**Branch**: `feature/stage-1-monitored-system`
**Duration**: 3-4 days

**Objectives**:
- Add `monitored` column to database
- Implement toggle monitored API
- Add bookmark icon to movies list
- Implement hierarchical monitoring (series → seasons → episodes)
- Enforce "unmonitored = frozen" in enrichment logic

**Backend Tasks**:
- [ ] Migration: Add `monitored BOOLEAN DEFAULT 1` to movies, series, seasons, episodes
- [ ] API: `POST /api/movies/:id/toggle-monitored`
- [ ] API: `POST /api/series/:id/toggle-monitored` (cascades to seasons/episodes)
- [ ] Service: Update `enrichMovie()` to skip if `monitored = 0`
- [ ] Service: Update `updateAssets()` to skip unmonitored items

**Frontend Tasks**:
- [ ] Component: BookmarkToggle component
- [ ] Page: Add bookmark column to movies list
- [ ] Page: Add bookmark toggle to movie edit page header
- [ ] Hook: `useToggleMonitored` mutation hook

**Testing Checklist**:
- [ ] Toggle monitored on movie → icon changes
- [ ] Unmonitor movie → enrichment skips it
- [ ] Re-monitor movie → enrichment resumes
- [ ] TV show hierarchy: unmonitor season → episodes frozen

**Documentation Updates**:
- [ ] `docs/DATABASE_SCHEMA.md` - Add monitored column
- [ ] `docs/API_ARCHITECTURE.md` - Add toggle monitored endpoints
- [ ] `docs/WORKFLOWS.md` - Update enrichment workflow

**Completion Criteria**:
- All tasks checked off
- Documentation updated
- Merged to master
- Tagged as `stage-1-complete`

---

### Stage 2: Lock System
**Status**: NOT STARTED
**Branch**: `feature/stage-2-locks`
**Duration**: 4-5 days

**Objectives**:
- Add field-level lock tracking
- Implement dirty state tracking (auto-lock on edit)
- Add lock indicators to UI
- Add reset to provider functionality

**Backend Tasks**:
- [ ] Migration: Add `*_locked` columns for metadata fields
- [ ] Migration: Add `*_locked` columns for asset types
- [ ] API: `POST /api/movies/:id/lock-field` (manual lock)
- [ ] API: `POST /api/movies/:id/unlock-field`
- [ ] API: `POST /api/movies/:id/reset-metadata` (unlock all metadata)
- [ ] API: `POST /api/movies/:id/reset-asset?type=poster` (unlock asset)
- [ ] Service: Update all enrichment logic to respect locks

**Frontend Tasks**:
- [ ] Component: LockIndicator component (🔒 icon)
- [ ] Component: Add dirty state tracking to metadata form
- [ ] Component: Auto-lock on field edit
- [ ] Page: Add lock indicators to metadata tab
- [ ] Page: Add [Reset to Provider] button
- [ ] Page: Add [Reset to Auto] button per asset type
- [ ] Hook: `useLockField` mutation hook

**Testing Checklist**:
- [ ] Edit metadata field → auto-locks
- [ ] Lock indicator appears
- [ ] Enrichment respects lock
- [ ] Reset to provider → unlocks and re-fetches
- [ ] Reset asset → unlocks and re-runs auto-selection

**Documentation Updates**:
- [ ] `docs/DATABASE_SCHEMA.md` - Add lock columns
- [ ] `docs/FIELD_LOCKING.md` - Update with auto-lock behavior
- [ ] `docs/API_ARCHITECTURE.md` - Add lock/unlock endpoints

**Completion Criteria**:
- All tasks checked off
- Documentation updated
- Merged to master
- Tagged as `stage-2-complete`

---

### Stage 3: Asset Candidate Caching
**Status**: NOT STARTED
**Branch**: `feature/stage-3-asset-cache`
**Duration**: 5-6 days

**Objectives**:
- Create asset_candidates table
- Implement scoring algorithm
- Build scheduled `updateAssets` job
- Create asset browser UI
- Support blocking assets

**Backend Tasks**:
- [ ] Migration: Create `asset_candidates` table
- [ ] Migration: Create `provider_refresh_log` table
- [ ] Service: Implement `calculateScore()` function
- [ ] Service: Implement `cacheAssetCandidates()` function
- [ ] Service: Create `updateAssets` scheduled job
- [ ] Service: Implement TMDB `/changes` optimization
- [ ] API: `GET /api/movies/:id/asset-candidates?type=poster`
- [ ] API: `POST /api/asset-candidates/:id/select`
- [ ] API: `POST /api/asset-candidates/:id/block`
- [ ] API: `POST /api/asset-candidates/:id/unblock`
- [ ] API: `POST /api/movies/:id/reset-asset?type=poster`
- [ ] API: `POST /api/jobs/update-assets/run` (force run)

**Frontend Tasks**:
- [ ] Component: AssetBrowserModal component
- [ ] Component: AssetCandidateGrid component
- [ ] Component: Asset thumbnail with provider badge
- [ ] Page: Update images tab with [Replace (X)] buttons
- [ ] Page: Show current selection with source
- [ ] Hook: `useAssetCandidates` query hook
- [ ] Hook: `useSelectAsset` mutation hook
- [ ] Hook: `useBlockAsset` mutation hook

**Testing Checklist**:
- [ ] Initial enrichment caches candidates
- [ ] Asset browser loads from cache (instant)
- [ ] Click asset → selects and locks
- [ ] Right-click → block asset
- [ ] Blocked assets hidden from browser
- [ ] updateAssets job runs on schedule
- [ ] TMDB changes API skips unchanged movies
- [ ] Force run updateAssets works

**Documentation Updates**:
- [ ] `docs/DATABASE_SCHEMA.md` - Add asset_candidates table
- [ ] `docs/ASSET_MANAGEMENT.md` - Update with caching strategy
- [ ] `docs/API_ARCHITECTURE.md` - Add asset candidate endpoints
- [ ] `docs/WORKFLOWS.md` - Add updateAssets job flow

**Completion Criteria**:
- All tasks checked off
- Documentation updated
- Merged to master
- Tagged as `stage-3-complete`

---

### Stage 4: Status Pages (Unknown Items & Needs Review)
**Status**: NOT STARTED
**Branch**: `feature/stage-4-status-pages`
**Duration**: 3-4 days

**Objectives**:
- Create System → Unknown Items page
- Create System → Needs Review page
- Build identification modal

**Backend Tasks**:
- [ ] API: `GET /api/system/unknown-items?type=movie|series|music`
- [ ] API: `GET /api/system/needs-review`
- [ ] API: `POST /api/movies/:id/identify` (manual identification)
- [ ] Service: Aggregation logic for unknown items
- [ ] Service: Needs review detection (missing assets, failed jobs)

**Frontend Tasks**:
- [ ] Page: System → Unknown Items
- [ ] Page: System → Needs Review
- [ ] Component: IdentificationModal (search TMDB/TVDB)
- [ ] Component: NeedsReviewCard
- [ ] Route: `/system/unknown-items`
- [ ] Route: `/system/needs-review`

**Testing Checklist**:
- [ ] Unknown items show up in list
- [ ] Click [Identify] → search modal opens
- [ ] Select match → enrichment starts
- [ ] Needs review shows missing assets
- [ ] Needs review shows failed jobs
- [ ] Re-enrich from needs review works

**Documentation Updates**:
- [ ] `docs/API_ARCHITECTURE.md` - Add system endpoints
- [ ] `docs/UI_DESIGN.md` - Add status pages
- [ ] `docs/FRONTEND_COMPONENTS.md` - Document new components

**Completion Criteria**:
- All tasks checked off
- Documentation updated
- Merged to master
- Tagged as `stage-4-complete`

---

### Stage 5: Activity Tabs
**Status**: NOT STARTED
**Branch**: `feature/stage-5-activity-tabs`
**Duration**: 5-6 days

**Objectives**:
- Build Jobs tab with unified queue
- Build Webhook History tab
- Build Media Players tab with playback status
- Build Event Log tab

**Backend Tasks**:
- [ ] API: `GET /api/activity/jobs` (scheduled + triggered)
- [ ] API: `POST /api/jobs/:id/run` (force run scheduled job)
- [ ] API: `GET /api/activity/webhooks?limit=20`
- [ ] API: `GET /api/activity/players`
- [ ] API: `GET /api/activity/log?filter=all|error|warning`
- [ ] Service: Track playback state for Kodi instances
- [ ] WebSocket: Broadcast job progress updates
- [ ] WebSocket: Broadcast webhook events
- [ ] WebSocket: Broadcast log events

**Frontend Tasks**:
- [ ] Page: Activity → Jobs tab
- [ ] Page: Activity → Webhooks tab
- [ ] Page: Activity → Media Players tab
- [ ] Page: Activity → Log tab
- [ ] Component: JobRow with progress bar
- [ ] Component: WebhookEvent component
- [ ] Component: MediaPlayerCard with playback
- [ ] Component: LogEventRow
- [ ] Hook: `useActivityJobs` WebSocket hook
- [ ] Hook: `useWebhookHistory` WebSocket hook

**Testing Checklist**:
- [ ] Jobs sorted by next run time
- [ ] Running jobs show progress bar
- [ ] Click play on scheduled job → runs
- [ ] Webhook history updates live
- [ ] Media players show connection status
- [ ] Kodi playback shows current movie
- [ ] Event log updates live
- [ ] Filter events by type works

**Documentation Updates**:
- [ ] `docs/API_ARCHITECTURE.md` - Add activity endpoints
- [ ] `docs/UI_DESIGN.md` - Add activity tabs design
- [ ] `docs/FRONTEND_COMPONENTS.md` - Document activity components

**Completion Criteria**:
- All tasks checked off
- Documentation updated
- Merged to master
- Tagged as `stage-5-complete`

---

### Stage 6: Unknown Files Refinement
**Status**: NOT STARTED
**Branch**: `feature/stage-6-unknown-files`
**Duration**: 3-4 days

**Objectives**:
- Add bulk actions to unknown files
- Add pattern matching suggestions
- Improve batch processing

**Backend Tasks**:
- [ ] API: `POST /api/movies/:id/unknown-files/batch-assign`
- [ ] API: `POST /api/movies/:id/unknown-files/batch-ignore`
- [ ] Service: Pattern matching library
- [ ] Service: Filename pattern recognition

**Frontend Tasks**:
- [ ] Component: Add checkboxes to unknown files list
- [ ] Component: Bulk action buttons
- [ ] Component: Pattern suggestion display
- [ ] Page: Update unknown files tab with bulk UI
- [ ] Hook: `useBatchAssignFiles` mutation hook

**Testing Checklist**:
- [ ] Select multiple files → assign all works
- [ ] Pattern suggestions display correctly
- [ ] Bulk ignore works
- [ ] No auto-checking (safety)

**Documentation Updates**:
- [ ] `docs/API_ARCHITECTURE.md` - Add batch endpoints
- [ ] `docs/UI_DESIGN.md` - Update unknown files design

**Completion Criteria**:
- All tasks checked off
- Documentation updated
- Merged to master
- Tagged as `stage-6-complete`

---

### Stage 7: Asset Blacklist Management
**Status**: NOT STARTED
**Branch**: `feature/stage-7-asset-blacklist`
**Duration**: 3-4 days

**Objectives**:
- Create asset blacklist management page
- Support bulk unblock/delete
- Add filtering and search

**Backend Tasks**:
- [ ] API: `GET /api/asset-blacklist?type&provider&search&limit&offset`
- [ ] API: `POST /api/asset-blacklist/unblock` (bulk)
- [ ] API: `DELETE /api/asset-blacklist` (bulk)

**Frontend Tasks**:
- [ ] Page: Settings → Asset Blacklist
- [ ] Component: Blacklist table with checkboxes
- [ ] Component: Filter dropdowns
- [ ] Component: Search input
- [ ] Component: Bulk action buttons
- [ ] Route: `/settings/asset-blacklist`

**Testing Checklist**:
- [ ] Blocked assets show in list
- [ ] Filter by type works
- [ ] Filter by provider works
- [ ] Search by movie title works
- [ ] Bulk unblock works
- [ ] Bulk delete works
- [ ] Pagination works

**Documentation Updates**:
- [ ] `docs/API_ARCHITECTURE.md` - Add blacklist endpoints
- [ ] `docs/UI_DESIGN.md` - Add blacklist page design
- [ ] `docs/FRONTEND_COMPONENTS.md` - Document blacklist components

**Completion Criteria**:
- All tasks checked off
- Documentation updated
- Merged to master
- Tagged as `stage-7-complete`

---

### Stage 8: Final Polish & Testing
**Status**: NOT STARTED
**Branch**: `feature/stage-8-polish`
**Duration**: 3-4 days

**Objectives**:
- Fix bugs discovered during previous stages
- Add statistics to System → Status
- Test all workflows end-to-end
- Update all documentation

**Backend Tasks**:
- [ ] API: `GET /api/system/statistics?period=24h|7d|30d`
- [ ] Service: Statistics aggregation
- [ ] Bug fixes from testing

**Frontend Tasks**:
- [ ] Page: Update System → Status with stats
- [ ] Component: StatisticsCard
- [ ] Bug fixes from testing
- [ ] Theme testing (light/dark)
- [ ] Performance testing
- [ ] Accessibility testing

**Testing Checklist**:
- [ ] End-to-end: Webhook → Enrichment → Publish
- [ ] End-to-end: Manual asset selection
- [ ] End-to-end: Unmonitor → Monitor
- [ ] End-to-end: Lock → Reset
- [ ] All themes look correct
- [ ] All WebSocket events work
- [ ] All scheduled jobs work

**Documentation Updates**:
- [ ] `docs/README.md` - Update with new features
- [ ] `docs/CLAUDE.md` - Update project instructions
- [ ] `docs/ARCHITECTURE.md` - Final review
- [ ] `docs/TESTING.md` - Document test results
- [ ] `CHANGELOG.md` - Document all changes

**Completion Criteria**:
- All tasks checked off
- All documentation updated
- All tests passing
- Merged to master
- Tagged as `stage-8-complete`
- Tagged as `frontend-overhaul-v1.0`

---

## Backend API Changes

### New Endpoints by Stage

#### Stage 1: Monitored System
```
POST   /api/movies/:id/toggle-monitored
POST   /api/series/:id/toggle-monitored
POST   /api/seasons/:id/toggle-monitored
POST   /api/episodes/:id/toggle-monitored
```

#### Stage 2: Lock System
```
POST   /api/movies/:id/lock-field
  Body: { field: 'plot' | 'title' | 'year' | ... }

POST   /api/movies/:id/unlock-field
  Body: { field: 'plot' | 'title' | 'year' | ... }

POST   /api/movies/:id/reset-metadata
  → Unlocks all metadata fields, re-fetches from provider

POST   /api/movies/:id/reset-asset
  Query: ?type=poster|fanart|etc.
  → Unlocks asset, re-runs auto-selection
```

#### Stage 3: Asset Candidates
```
GET    /api/movies/:id/asset-candidates
  Query: ?type=poster|fanart|etc.
  Response: { candidates: [...] }

POST   /api/asset-candidates/:id/select
  → Marks as selected, downloads, publishes, locks

POST   /api/asset-candidates/:id/block
  → Marks as blocked (is_blocked = 1)

POST   /api/asset-candidates/:id/unblock
  → Removes block

POST   /api/movies/:id/refresh-candidates
  Query: ?type=poster (optional, defaults to all)
  → Forces provider refresh for this movie

POST   /api/jobs/update-assets/run
  → Forces immediate run of updateAssets scheduled job

GET    /api/jobs/update-assets/status
  Response: { nextRun: '...', lastRun: '...', config: {...} }
```

#### Stage 4: Status Pages
```
GET    /api/system/unknown-items
  Query: ?type=movie|series|music
  Response: { total: 12, items: [...] }

GET    /api/system/needs-review
  Response: {
    missingAssets: [...],
    failedJobs: [...],
    unmonitoredWithLocks: [...]
  }

POST   /api/movies/:id/identify
  Body: { tmdbId: 603, source: 'manual_search' }
  → Links unidentified movie to TMDB ID, starts enrichment
```

#### Stage 5: Activity
```
GET    /api/activity/jobs
  Response: {
    running: [...],
    queued: [...],
    scheduled: [...]
  }

POST   /api/jobs/:id/run
  → Forces immediate run of scheduled job

POST   /api/jobs/:id/cancel
  → Cancels running or queued job

GET    /api/activity/webhooks
  Query: ?limit=20
  Response: { events: [...] }

GET    /api/activity/players
  Response: {
    kodi: [...],
    jellyfin: [...],
    plex: [...]
  }

GET    /api/activity/log
  Query: ?filter=all|error|warning|info&limit=50&offset=0
  Response: { total: 2847, events: [...] }
```

#### Stage 6: Unknown Files Batch
```
POST   /api/movies/:id/unknown-files/batch-assign
  Body: {
    fileIds: [1, 2, 3],
    fileType: 'trailer' | 'subtitle' | 'extra' | ...
  }

POST   /api/movies/:id/unknown-files/batch-ignore
  Body: { fileIds: [1, 2, 3] }
```

#### Stage 7: Asset Blacklist
```
GET    /api/asset-blacklist
  Query: ?type=poster&provider=tmdb&search=matrix&limit=50&offset=0
  Response: { total: 247, items: [...] }

POST   /api/asset-blacklist/unblock
  Body: { ids: [123, 456, 789] }

DELETE /api/asset-blacklist
  Body: { ids: [123, 456, 789] }
```

#### Stage 8: Statistics
```
GET    /api/system/statistics
  Query: ?period=24h|7d|30d|all
  Response: {
    enrichmentActivity: {...},
    apiUsage: {...},
    database: {...},
    performance: {...}
  }
```

### Database Migrations by Stage

#### Stage 1: Monitored Column
```sql
-- Migration: 20250114_001_add_monitored_column.ts
ALTER TABLE movies ADD COLUMN monitored BOOLEAN DEFAULT 1;
ALTER TABLE series ADD COLUMN monitored BOOLEAN DEFAULT 1;
ALTER TABLE seasons ADD COLUMN monitored BOOLEAN DEFAULT 1;
ALTER TABLE episodes ADD COLUMN monitored BOOLEAN DEFAULT 1;

CREATE INDEX idx_movies_monitored ON movies(monitored);
CREATE INDEX idx_series_monitored ON series(monitored);
```

#### Stage 2: Lock Columns
```sql
-- Migration: 20250114_002_add_lock_columns.ts
-- Metadata locks
ALTER TABLE movies ADD COLUMN title_locked BOOLEAN DEFAULT 0;
ALTER TABLE movies ADD COLUMN plot_locked BOOLEAN DEFAULT 0;
ALTER TABLE movies ADD COLUMN year_locked BOOLEAN DEFAULT 0;
ALTER TABLE movies ADD COLUMN runtime_locked BOOLEAN DEFAULT 0;
ALTER TABLE movies ADD COLUMN tagline_locked BOOLEAN DEFAULT 0;
-- ... add for all metadata fields

-- Asset locks
ALTER TABLE movies ADD COLUMN poster_locked BOOLEAN DEFAULT 0;
ALTER TABLE movies ADD COLUMN fanart_locked BOOLEAN DEFAULT 0;
ALTER TABLE movies ADD COLUMN landscape_locked BOOLEAN DEFAULT 0;
ALTER TABLE movies ADD COLUMN clearlogo_locked BOOLEAN DEFAULT 0;
ALTER TABLE movies ADD COLUMN banner_locked BOOLEAN DEFAULT 0;
ALTER TABLE movies ADD COLUMN clearart_locked BOOLEAN DEFAULT 0;
ALTER TABLE movies ADD COLUMN discart_locked BOOLEAN DEFAULT 0;
ALTER TABLE movies ADD COLUMN keyart_locked BOOLEAN DEFAULT 0;
```

#### Stage 3: Asset Candidates
```sql
-- Migration: 20250114_003_create_asset_candidates.ts
CREATE TABLE asset_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  asset_type TEXT NOT NULL,
  provider TEXT NOT NULL,
  url TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  language TEXT,
  vote_average REAL,
  vote_count INTEGER,
  score REAL NOT NULL,
  is_selected BOOLEAN DEFAULT 0,
  is_blocked BOOLEAN DEFAULT 0,
  selected_at TIMESTAMP,
  selected_by TEXT,
  last_refreshed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (entity_id) REFERENCES movies(id) ON DELETE CASCADE,
  UNIQUE(entity_type, entity_id, asset_type, url)
);

CREATE INDEX idx_asset_candidates_entity ON asset_candidates(entity_type, entity_id, asset_type);
CREATE INDEX idx_asset_candidates_selected ON asset_candidates(entity_type, entity_id, is_selected);
CREATE INDEX idx_asset_candidates_blocked ON asset_candidates(is_blocked);
CREATE INDEX idx_asset_candidates_score ON asset_candidates(score DESC);

CREATE TABLE provider_refresh_log (
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  last_checked TIMESTAMP NOT NULL,
  last_modified TIMESTAMP,
  PRIMARY KEY (entity_type, entity_id, provider)
);
```

---

## Frontend Changes

### New Components by Stage

#### Stage 1: Monitored System
- `BookmarkToggle.tsx` - Bookmark/bookmark-o icon toggle button

#### Stage 2: Lock System
- `LockIndicator.tsx` - 🔒 icon with tooltip
- `ResetButton.tsx` - Reset to provider/auto button

#### Stage 3: Asset Candidates
- `AssetBrowserModal.tsx` - Modal with candidate grid
- `AssetCandidateGrid.tsx` - Grid of asset thumbnails
- `AssetThumbnail.tsx` - Thumbnail with provider badge

#### Stage 4: Status Pages
- `IdentificationModal.tsx` - Search and select TMDB match
- `NeedsReviewCard.tsx` - Card showing items needing attention

#### Stage 5: Activity
- `JobRow.tsx` - Job with progress bar
- `WebhookEvent.tsx` - Webhook event display
- `MediaPlayerCard.tsx` - Player with playback status
- `LogEventRow.tsx` - Log event display

#### Stage 6: Unknown Files
- (Existing components updated with bulk actions)

#### Stage 7: Asset Blacklist
- `BlacklistTable.tsx` - Table with checkboxes and filters

#### Stage 8: Statistics
- `StatisticsCard.tsx` - Stat display with period selector

### New Pages by Stage

#### Stage 4: Status Pages
- `pages/system/UnknownItems.tsx`
- `pages/system/NeedsReview.tsx`

#### Stage 5: Activity
- `pages/Activity.tsx` (with tabs)

#### Stage 7: Asset Blacklist
- `pages/settings/AssetBlacklist.tsx`

### New Hooks by Stage

#### Stage 1: Monitored
- `useToggleMonitored.ts`

#### Stage 2: Locks
- `useLockField.ts`
- `useUnlockField.ts`
- `useResetMetadata.ts`
- `useResetAsset.ts`

#### Stage 3: Asset Candidates
- `useAssetCandidates.ts`
- `useSelectAsset.ts`
- `useBlockAsset.ts`
- `useRefreshCandidates.ts`

#### Stage 4: Status Pages
- `useUnknownItems.ts`
- `useNeedsReview.ts`
- `useIdentifyMovie.ts`

#### Stage 5: Activity
- `useActivityJobs.ts` (WebSocket)
- `useWebhookHistory.ts` (WebSocket)
- `useMediaPlayers.ts`
- `useActivityLog.ts` (WebSocket)

#### Stage 6: Unknown Files
- `useBatchAssignFiles.ts`
- `useBatchIgnoreFiles.ts`

#### Stage 7: Asset Blacklist
- `useAssetBlacklist.ts`
- `useUnblockAssets.ts`
- `useDeleteAssets.ts`

#### Stage 8: Statistics
- `useSystemStatistics.ts`

---

## Stage Execution Guide

### Pre-Stage Checklist
```
[ ] Read docs/FRONTEND_OVERHAUL_STATUS.md
[ ] Confirm you're on correct stage
[ ] git checkout master && git pull origin master
[ ] Create/checkout feature branch for this stage
[ ] Read stage definition in this document
[ ] Review backend and frontend task lists
```

### During Stage Work
```
[ ] Work through backend tasks first
[ ] Write migration if needed
[ ] Test migration (up and down)
[ ] Implement API endpoints
[ ] Test endpoints with Postman/curl
[ ] Work through frontend tasks
[ ] Test UI changes in browser
[ ] Commit frequently with clear messages
[ ] Push to remote regularly
```

### Post-Stage Checklist
```
[ ] All backend tasks checked off
[ ] All frontend tasks checked off
[ ] All testing checklist items verified
[ ] Update documentation (mark which docs updated)
[ ] Update docs/FRONTEND_OVERHAUL_STATUS.md
[ ] Commit documentation updates
[ ] Merge feature branch to master
[ ] Tag completion: git tag stage-X-complete
[ ] Push master and tags to remote
[ ] Create next stage feature branch
```

---

## Progress Tracking

### Status Document Location
`docs/FRONTEND_OVERHAUL_STATUS.md`

### Status Document Format
```markdown
# Frontend Overhaul Status

**Last Updated**: 2025-01-14 15:30:00
**Current Stage**: Stage 3 - Asset Candidate Caching
**Current Machine**: Desktop / Laptop
**Current Branch**: feature/stage-3-asset-cache

## Overall Progress

- [x] Stage 0: Planning (COMPLETED 2025-01-14)
- [x] Stage 1: Monitored System (COMPLETED 2025-01-15)
- [x] Stage 2: Lock System (COMPLETED 2025-01-18)
- [ ] Stage 3: Asset Candidate Caching (IN PROGRESS - 60% complete)
- [ ] Stage 4: Status Pages (NOT STARTED)
- [ ] Stage 5: Activity Tabs (NOT STARTED)
- [ ] Stage 6: Unknown Files Refinement (NOT STARTED)
- [ ] Stage 7: Asset Blacklist Management (NOT STARTED)
- [ ] Stage 8: Final Polish & Testing (NOT STARTED)

## Current Stage Details

### Stage 3: Asset Candidate Caching

**Started**: 2025-01-19
**Backend Progress**: 70% (7/10 tasks)
**Frontend Progress**: 50% (4/8 tasks)

#### Backend Tasks
- [x] Migration: Create asset_candidates table
- [x] Migration: Create provider_refresh_log table
- [x] Service: Implement calculateScore() function
- [x] Service: Implement cacheAssetCandidates() function
- [x] Service: Create updateAssets scheduled job
- [x] Service: Implement TMDB /changes optimization
- [x] API: GET /api/movies/:id/asset-candidates
- [ ] API: POST /api/asset-candidates/:id/select (IN PROGRESS)
- [ ] API: POST /api/asset-candidates/:id/block
- [ ] API: POST /api/jobs/update-assets/run

#### Frontend Tasks
- [x] Component: AssetBrowserModal component
- [x] Component: AssetCandidateGrid component
- [x] Component: Asset thumbnail with provider badge
- [x] Page: Update images tab with [Replace] buttons
- [ ] Hook: useAssetCandidates query hook (IN PROGRESS)
- [ ] Hook: useSelectAsset mutation hook
- [ ] Hook: useBlockAsset mutation hook
- [ ] Test: Asset browser integration

#### Notes
- TMDB changes optimization working well
- Asset browser UI looks good
- Need to complete selection logic next session

## Next Session Plan
1. Complete asset selection endpoint
2. Implement block/unblock endpoints
3. Add useAssetCandidates hook
4. Test asset browser end-to-end
5. If time: add force run endpoint
```

### How to Update Status

**At End of Each Work Session**:
```bash
# 1. Open status file
code docs/FRONTEND_OVERHAUL_STATUS.md

# 2. Update:
#    - Last Updated timestamp
#    - Current Machine
#    - Current Branch
#    - Task checkboxes
#    - Progress percentages
#    - Notes section

# 3. Save and commit
git add docs/FRONTEND_OVERHAUL_STATUS.md
git commit -m "stage-X: update status - completed tasks A, B, C"
git push origin feature/stage-X-name
```

**At Start of Each Work Session**:
```bash
# 1. Pull latest
git checkout feature/stage-X-name
git pull origin feature/stage-X-name

# 2. Read status
cat docs/FRONTEND_OVERHAUL_STATUS.md

# 3. Review last commit
git log --oneline -5

# 4. Continue work
```

---

## Risk Mitigation

### Common Issues & Solutions

#### Issue: Forgot which stage you're on
**Solution**:
```bash
cat docs/FRONTEND_OVERHAUL_STATUS.md | grep "Current Stage"
git branch
```

#### Issue: Accidentally worked on wrong branch
**Solution**:
```bash
# Stash changes
git stash

# Switch to correct branch
git checkout feature/stage-X-name

# Apply stashed changes
git stash pop

# Verify changes
git diff
```

#### Issue: Merge conflicts
**Solution**:
```bash
# Update master first
git checkout master
git pull origin master

# Try merge again
git checkout feature/stage-X-name
git merge master

# Resolve conflicts manually
# Then:
git add .
git commit -m "stage-X: resolve merge conflicts"
```

#### Issue: Database migration failed
**Solution**:
1. Check `logs/error.log` for details
2. Fix migration file
3. Rollback: `npm run migrate:down`
4. Re-run: `npm run migrate:up`
5. Commit fix

#### Issue: Lost track of what's done
**Solution**:
1. Read `docs/FRONTEND_OVERHAUL_STATUS.md`
2. Check git log: `git log --oneline --graph -20`
3. Look at recent commits to see progress
4. Update status document with current state

---

## Success Criteria

### Stage Completion
- [ ] All tasks in stage definition checked off
- [ ] All testing checklist items verified
- [ ] Documentation updated and committed
- [ ] Feature branch merged to master
- [ ] Git tag created: `stage-X-complete`
- [ ] Status document updated
- [ ] Next stage branch created

### Overall Project Completion
- [ ] All 8 stages completed
- [ ] All documentation up to date
- [ ] All tests passing
- [ ] No console errors in browser
- [ ] Both themes (light/dark) working
- [ ] All WebSocket events working
- [ ] All scheduled jobs working
- [ ] Tagged as `frontend-overhaul-v1.0`

---

## Estimated Timeline

| Stage | Duration | Cumulative |
|-------|----------|------------|
| Stage 0: Planning | 1 day | 1 day |
| Stage 1: Monitored System | 3-4 days | 5 days |
| Stage 2: Lock System | 4-5 days | 10 days |
| Stage 3: Asset Candidates | 5-6 days | 16 days |
| Stage 4: Status Pages | 3-4 days | 20 days |
| Stage 5: Activity Tabs | 5-6 days | 26 days |
| Stage 6: Unknown Files | 3-4 days | 30 days |
| Stage 7: Asset Blacklist | 3-4 days | 34 days |
| Stage 8: Polish & Testing | 3-4 days | 38 days |

**Total**: ~5-6 weeks (assuming 1 work session per day)

---

## Notes

- Each stage is designed to be completable in 3-6 days of work
- Stages can be interrupted and resumed across machines
- Always update status document before stopping work
- Always read status document before starting work
- Commit and push frequently
- Don't skip documentation updates

---

**END OF MIGRATION PLAN**
