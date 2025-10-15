# Stage Definitions

**Purpose**: Detailed implementation plans for each development stage

**Reference**: See [PROJECT_ROADMAP.md](PROJECT_ROADMAP.md) for current status

---

## 📋 Stage Template

Each stage follows this structure:

```markdown
### Stage X: Name

**Branch**: `feature/stage-X-name`
**Goal**: One-sentence objective
**Backend**: High-level backend work
**Frontend**: High-level frontend work
**Testing**: How to verify completion
**Completes**: What capability this enables
**Related Docs**: Links to technical documentation
```

---

## ✅ Completed Stages

### Stage 0: Planning & Git Workflow

**Branch**: N/A (documentation only)
**Tag**: `stage-0-complete`
**Completed**: 2025-10-15

**Delivered**:
- Git workflow documentation
- Stage-based development approach
- Branch and commit conventions
- Multi-machine workflow guide

**Files Created**:
- `docs/FRONTEND_OVERHAUL_MIGRATION_PLAN.md` (now archived)
- `docs/FRONTEND_OVERHAUL_STATUS.md` (now archived)

---

### Stage 1: Monitored/Unmonitored System

**Branch**: `feature/stage-1-monitored-system`
**Tag**: `stage-1-complete`
**Completed**: 2025-10-15

**Goal**: Enable per-movie automation control (like *arr stack)

**Delivered**:
- Database migration: `monitored` column added to movies, series, seasons, episodes
- API endpoint: `POST /api/movies/:id/toggle-monitored`
- Service: `MovieService.toggleMonitored()` with WebSocket broadcasting
- Component: `BookmarkToggle.tsx` (Lucide icons, purple/gray styling)
- Hook: `useToggleMonitored` (optimistic updates, toast notifications)
- Integration: Movies table includes bookmark column
- Logic: Enrichment jobs skip unmonitored movies

**Why This Matters**: Users can stop automation on specific movies (e.g., custom metadata they want preserved)

**Files Modified**:
- `src/database/migrations/20250114_001_add_monitored_column.ts`
- `src/controllers/movieController.ts`
- `src/services/movieService.ts`
- `src/services/jobHandlers.ts`
- `public/frontend/src/components/ui/BookmarkToggle.tsx`
- `public/frontend/src/hooks/useToggleMonitored.ts`
- `public/frontend/src/components/movie/MovieRow.tsx`

---

### Stage 2: Field & Asset Locking

**Branch**: `feature/stage-2-lock-system`
**Tag**: `stage-2-complete`
**Completed**: 2025-10-15

**Goal**: Preserve user edits - any manual change locks that field from automation

**Delivered**:
- Lock columns already existed in schema (`*_locked` for metadata and assets)
- API endpoints: `POST /api/movies/:id/lock-field`, `unlock-field`, `reset-metadata`
- Service: Enrichment dynamically skips locked fields
- Helper: `getFieldLocks()` builds UPDATE query excluding locked fields
- Component: `LockIcon.tsx` (red lock = protected, gray unlock = modifiable)
- Hooks: `useLockField`, `useUnlockField`, `useToggleLockField`, `useResetMetadata`

**Why This Matters**: User edits are sacred - automation never overwrites manual changes

**Files Modified**:
- `src/controllers/movieController.ts`
- `src/services/movieService.ts`
- `src/services/jobHandlers.ts`
- `public/frontend/src/components/ui/LockIcon.tsx`
- `public/frontend/src/hooks/useLockField.ts`

---

### Stage 3: Asset Candidate Caching

**Branch**: `feature/stage-3-asset-cache`
**Tag**: `stage-3-complete`
**Completed**: 2025-10-15

**Goal**: Cache asset candidates from providers, score them, auto-select best

**Delivered**:
- Database tables: `asset_candidates`, `provider_refresh_log`
- Migration: `20250114_003_create_asset_candidates.ts`
- Service: `AssetCandidateService` (caching, scoring, selection)
- Service: `updateAssets` scheduled job (refresh candidates periodically)
- Algorithm: `calculateScore()` (dimensions, aspect ratio, vote count)
- Optimization: TMDB Changes API (only refresh changed movies)

**Why This Matters**:
- Asset browser loads instantly (no provider API calls)
- Best assets auto-selected (smart defaults)
- Users can browse and override selections
- Providers refreshed in background (non-blocking)

**Files Created**:
- `src/database/migrations/20250114_003_create_asset_candidates.ts`
- `src/services/assetCandidateService.ts`
- `src/services/schedulers/AssetUpdaterScheduler.ts`
- `src/services/jobHandlers/updateAssetsHandler.ts`

**Related Docs**: [ASSET_MANAGEMENT.md](ASSET_MANAGEMENT.md)

---

### Stage 4: Webhooks (Radarr/Sonarr/Lidarr Integration)

**Branch**: `feature/stage-4-webhooks`
**Tag**: `stage-4-complete`
**Completed**: 2025-10-15

**Goal**: Enable automation - incoming webhook triggers enrichment workflow

**Delivered**:
- **Radarr Integration (100% Complete)**:
  - All 11 event types fully implemented
  - Download event: Full scan workflow (enrichment + player notification)
  - Rename event: Updates file_path
  - MovieFileDelete: Logs deletion
  - Health events: Logs with severity mapping
  - Notification events: ApplicationUpdate, ManualInteractionRequired
  - Info events: MovieAdded, MovieDeleted (logged only)
  - Test event: Responds with success

- **Sonarr/Lidarr Integration (Placeholder Complete)**:
  - All events logged to activity_log
  - Generic handler with clear "Stage 9/10" messaging
  - Test events respond successfully
  - No errors, graceful handling

**Why This Matters**: Core automation flow complete for movies (webhook → scan → enrich → publish → notify)

**Files Modified**:
- `src/types/webhooks.ts` (added all event types and notification fields)
- `src/services/webhookProcessingService.ts` (4 new handlers + generic handler)
- `src/controllers/webhookController.ts` (complete event routing)

**Frontend Deferred**: Webhook configuration UI deferred to post-v1.0 (can configure manually)

---

## ⏳ Upcoming Stages (v1.0 Critical Path)

### Stage 5: Kodi Integration (Player Notification)

**Branch**: `feature/stage-4-webhooks` ← **CREATE THIS NEXT**
**Goal**: Enable automation - incoming webhook triggers enrichment workflow

**Backend Work**:
- Webhook receiver endpoints (`POST /api/webhooks/radarr`, `POST /api/webhooks/sonarr`)
- Payload validation (Zod schemas for event types)
- Event logging (`webhook_events` table - already exists in schema)
- Job triggers:
  - `Download` event → Create enrichment job (priority 1)
  - `MovieFileDelete` event → Capture playback state (for restore)
  - `Upgrade` event → Update file path, restore assets from cache
  - `Test` event → Respond with success
- Error handling (invalid payloads, unknown events)

**Frontend Work**:
- Webhook configuration page (`Settings → Webhooks`)
- Display webhook URLs (copy-to-clipboard)
- Setup instructions (Radarr connection configuration)
- Event history table (last 50 events, filterable)
- Test webhook button (verify connectivity)

**Testing Criteria**:
1. Configure Radarr webhook pointing to Metarr
2. Click "Test" in Radarr → verify event received
3. Download new movie via Radarr
4. Verify webhook received and enrichment job created
5. Check movie metadata and assets published
6. Trigger upgrade in Radarr → verify assets restored from cache

**Completes**: Webhook → Enrich → Publish flow (no Kodi notification yet)

**Related Docs**: [WEBHOOKS.md](WEBHOOKS.md) for payload formats and event types

---

### Stage 5: Kodi Integration (Player Notification)

**Branch**: `feature/stage-5-kodi`
**Goal**: Notify Kodi players after publishing so changes appear immediately

**Backend Work**:
- Kodi JSON-RPC client (WebSocket connection)
- Connection management (health checks, reconnection)
- Library notification (`VideoLibrary.Scan` after publish)
- Playback state capture (for upgrade scenarios)
- Path mapping service (Metarr path → Kodi path translation)
- Media player CRUD endpoints

**Frontend Work**:
- Media player configuration page (`Settings → Media Players`)
- Add Kodi instance form (host, port, credentials)
- Connection status indicator (online/offline)
- Test connection button
- Manual library scan button
- Path mapping configuration UI

**Testing Criteria**:
1. Add Kodi instance in Metarr settings
2. Test connection → verify successful
3. Publish movie metadata/assets
4. Verify Kodi receives notification
5. Check movie appears in Kodi with new metadata
6. Test path mapping (Metarr `/movies/...` → Kodi network path)

**Completes**: Full automation flow (webhook → enrich → publish → notify)

**Related Docs**: [KODI_API.md](KODI_API.md) for JSON-RPC reference

---

### Stage 6: Polish & Docker Deployment

**Branch**: `feature/stage-6-polish`
**Goal**: Production-ready deployment for community release

**Backend Work**:
- Error handling audit (consistent error responses)
- Logging improvements (structured JSON logs)
- Health check endpoint enhancements
- Configuration validation on startup
- PostgreSQL testing (ensure migrations work)

**Frontend Work**:
- Error boundary components (graceful failure)
- Loading states (skeletons, spinners)
- Empty states (no movies, no libraries)
- Toast notification polish
- Theme testing (dark mode consistency)

**DevOps Work**:
- Create `Dockerfile` (multi-stage build)
- Create `docker-compose.yml` (app + PostgreSQL)
- Volume mounts (cache, database, config)
- Environment variable documentation
- Deployment guide (`docs/DEPLOYMENT.md`)

**Testing Criteria**:
1. `docker-compose up` → app starts successfully
2. Configure via environment variables
3. Scan library, enrich metadata, receive webhooks
4. Kodi notification works
5. Restart container → state persists
6. Fresh deployment on clean machine

**Completes**: v1.0 release - ready for community

**Related Docs**: Create `docs/DEPLOYMENT.md` during this stage

---

## 📋 Post-v1.0 Stages (Future Work)

### Stage 7: Status Pages & Activity Monitoring

**Goal**: Visibility into what Metarr is doing (nice-to-have, not required for operation)

**Features**:
- System → Status (overview, statistics)
- System → Unknown Items (unidentified files)
- System → Needs Review (missing assets, failed jobs)
- Activity → Jobs (running, queued, scheduled)
- Activity → Webhooks (event history)
- Activity → Media Players (connection status, playback)
- Activity → Log (filterable event log)

**Why Post-v1.0**: Automation works without these pages - they're for monitoring/debugging

---

### Stage 8: Unknown Files & Blacklist Management

**Goal**: Manage non-standard files and blocked assets

**Features**:
- Unknown files tab per movie (extras, unrecognized assets)
- Batch assign/ignore operations
- Asset blacklist page (Settings → Asset Blacklist)
- Blocked assets management (unblock, delete)

**Why Post-v1.0**: Core workflow doesn't require managing unknown files

---

### Stage 9: TV Show Support

**Goal**: Support series, seasons, episodes (same workflow as movies)

**Features**:
- TVDB integration
- Series/season/episode tables
- Episode scanning and enrichment
- Hierarchical monitoring (unmonitor series → all episodes frozen)
- TV-specific assets (season posters, episode thumbs)

**Why Post-v1.0**: Movies are the primary use case - TV can come after community adoption

---

### Stage 10: Music Support

**Goal**: Support artists, albums, tracks

**Features**:
- MusicBrainz integration
- Artist/album/track tables
- Music scanning and enrichment
- Album artwork

**Why Post-v1.0**: Nice-to-have for complete media management, but not core to v1.0

---

## 🎯 Stage Completion Checklist

Use this checklist when finishing a stage:

**Before Marking Complete**:
- [ ] All backend endpoints implemented and tested
- [ ] All frontend components working
- [ ] Manual testing completed (see stage testing criteria)
- [ ] No console errors in browser
- [ ] No errors in backend logs
- [ ] Documentation updated (technical docs if architecture changed)
- [ ] PROJECT_ROADMAP.md updated (mark stage complete, update current stage)

**Git Operations**:
- [ ] All changes committed: `git status` shows clean
- [ ] Branch merged to master: `git merge feature/stage-X-name`
- [ ] Tag created: `git tag stage-X-complete`
- [ ] Pushed to remote: `git push origin master --tags`
- [ ] Next branch created: `git checkout -b feature/stage-Y-name`

**Documentation Updates**:
- [ ] PROJECT_ROADMAP.md "Current Stage" section updated
- [ ] STAGE_DEFINITIONS.md "Completed Stages" section updated
- [ ] Technical docs updated if needed (API_ARCHITECTURE, DATABASE_SCHEMA, etc.)
- [ ] DESIGN_DECISIONS.md updated if major architectural choice made

---

## 📝 Documentation Update Rules

### When to Update Documentation

**During Stage Work** (continuous):
```bash
# When adding new feature/decision
git commit -m "stage-X: backend: implement webhook receiver"
git commit -m "stage-X: docs: add webhook payload examples to WEBHOOKS.md"
```

**At Stage Milestones**:
- 25% complete: Update STAGE_DEFINITIONS with notes on progress/blockers
- 50% complete: Update PROJECT_ROADMAP if approach changed
- 75% complete: Review technical docs (API_ARCHITECTURE, DATABASE_SCHEMA)
- 100% complete: Update ALL docs per checklist above

### What Documentation to Update

**Every Stage Must Update**:
1. **PROJECT_ROADMAP.md**
   - "Current Stage" section (what you're working on now)
   - Mark previous stage complete in "Stage Overview"
   - Update "Last Updated" timestamp

2. **STAGE_DEFINITIONS.md**
   - Move completed stage from "Upcoming" to "Completed Stages"
   - Add brief summary and git tag reference
   - List files created/modified

**Update If Changed**:
3. **DESIGN_DECISIONS.md**
   - Add entry if you made an architectural choice
   - Examples: "Why X instead of Y?", "Why this approach?"

4. **Technical Docs** (only if applicable):
   - **API_ARCHITECTURE.md** - New endpoints or WebSocket events
   - **DATABASE_SCHEMA.md** - New tables or columns
   - **WEBHOOKS.md** - New webhook event types
   - **KODI_API.md** - New Kodi integration details
   - **ASSET_MANAGEMENT.md** - Changes to asset workflow

### Documentation Commit Pattern

```bash
# Good: Documentation commits paired with feature commits
git commit -m "stage-4: backend: implement webhook receiver"
git commit -m "stage-4: docs: add Radarr webhook payload to WEBHOOKS.md"

# Good: Bulk documentation update at stage completion
git commit -m "stage-4: docs: update all documentation for stage completion"

# Good: Mid-stage documentation checkpoint
git commit -m "stage-4: docs: update progress notes (50% complete)"
```

### Rules for Claude (AI Assistant)

**Claude MUST**:
1. ✅ Update PROJECT_ROADMAP.md when starting/completing a stage
2. ✅ Remind you to update technical docs when architecture changes
3. ✅ Add DESIGN_DECISIONS.md entry when making architectural choice
4. ✅ Include doc updates in commit messages
5. ✅ Check if docs are stale (last update > 7 days old)

**Claude MUST NOT**:
1. ❌ Update docs without telling you what changed
2. ❌ Skip doc updates because "it's just code"
3. ❌ Forget to update "Last Updated" timestamps
4. ❌ Let PROJECT_ROADMAP "Current Stage" get stale

### Quick Doc Update Workflow

**Starting a Stage**:
```bash
# 1. Update PROJECT_ROADMAP.md
nano docs/PROJECT_ROADMAP.md
# - Change "Current Stage" section
# - Update "Next Branch" field
# - Update timestamp

# 2. Commit the start
git add docs/PROJECT_ROADMAP.md
git commit -m "stage-X: docs: start stage X work"
```

**Completing a Stage**:
```bash
# 1. Update PROJECT_ROADMAP.md
nano docs/PROJECT_ROADMAP.md
# - Mark stage complete in "Stage Overview"
# - Update "Current Stage" to next stage
# - Update timestamp

# 2. Update STAGE_DEFINITIONS.md
nano docs/STAGE_DEFINITIONS.md
# - Move stage to "Completed Stages"
# - Add summary and git tag

# 3. Update technical docs (if changed)
nano docs/API_ARCHITECTURE.md  # (if new endpoints)
nano docs/DATABASE_SCHEMA.md   # (if new tables)

# 4. Commit all documentation
git add docs/
git commit -m "stage-X: docs: mark stage X complete and update all docs"
```

### Documentation Health Check

**Run this check periodically** (once per stage):

```bash
# 1. Check when docs were last updated
git log --oneline docs/ -10

# 2. Verify current stage matches git branch
git branch  # Should match PROJECT_ROADMAP.md "Current Branch"

# 3. Check for uncommitted doc changes
git status docs/

# 4. Read PROJECT_ROADMAP to ensure accuracy
cat docs/PROJECT_ROADMAP.md | head -30
```

### Why This Matters

**Without doc updates**:
- ❌ You switch machines and don't know where you left off
- ❌ Claude doesn't have context for current work
- ❌ Technical docs drift from actual implementation
- ❌ Design decisions are lost to time

**With doc updates**:
- ✅ Resume work instantly on any machine
- ✅ Claude has accurate context
- ✅ Technical docs match implementation
- ✅ Design decisions preserved for future reference

---

## 🔗 Related Documentation

- [PROJECT_ROADMAP.md](PROJECT_ROADMAP.md) - Current status and quick reference
- [GIT_WORKFLOW.md](GIT_WORKFLOW.md) - Branch strategy and commit conventions
- [DESIGN_DECISIONS.md](DESIGN_DECISIONS.md) - Why we made specific choices
- [ARCHITECTURE.md](ARCHITECTURE.md) - System design and data flow
- [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) - Complete schema reference
- [API_ARCHITECTURE.md](API_ARCHITECTURE.md) - REST + WebSocket API specs

---

**Remember**: Stages build on each other. Complete them in order for best results!
