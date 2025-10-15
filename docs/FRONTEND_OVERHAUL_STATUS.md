# Frontend Overhaul Status

**Last Updated**: 2025-01-14 17:45:00
**Current Stage**: Stage 1 - Monitored/Unmonitored System
**Current Machine**: Primary Development Machine
**Current Branch**: feature/stage-1-monitored-system

---

## Overall Progress

- [x] Stage 0: Planning (COMPLETED 2025-01-14)
- [ ] Stage 1: Monitored System (IN PROGRESS - 70%)
- [ ] Stage 2: Lock System (NOT STARTED)
- [ ] Stage 3: Asset Candidate Caching (NOT STARTED)
- [ ] Stage 4: Status Pages (NOT STARTED)
- [ ] Stage 5: Activity Tabs (NOT STARTED)
- [ ] Stage 6: Unknown Files Refinement (NOT STARTED)
- [ ] Stage 7: Asset Blacklist Management (NOT STARTED)
- [ ] Stage 8: Final Polish & Testing (NOT STARTED)

---

## Current Stage Details

### Stage 1: Monitored/Unmonitored System

**Started**: 2025-01-14
**Backend Progress**: 70% (3.5/5 tasks)
**Frontend Progress**: 0% (0/4 tasks)

#### Backend Tasks
- [x] Migration: Add `monitored BOOLEAN DEFAULT 1` to movies, series, seasons, episodes
- [x] API: `POST /api/movies/:id/toggle-monitored`
- [ ] API: `POST /api/series/:id/toggle-monitored` (cascades to seasons/episodes) - DEFERRED TO STAGE 2
- [x] Service: Update enrichment jobs to skip if `monitored = 0`
- [ ] Service: Update `updateAssets()` to skip unmonitored items - BLOCKED (not yet implemented)

#### Frontend Tasks
- [ ] Component: BookmarkToggle component
- [ ] Page: Add bookmark column to movies list
- [ ] Page: Add bookmark toggle to movie edit page header
- [ ] Hook: `useToggleMonitored` mutation hook

#### Notes
- ✅ Database migration completed - monitored column added to all media tables
- ✅ Toggle monitored API endpoint implemented for movies (WebSocket broadcasting)
- ✅ Enrichment jobs now respect monitored status (handleEnrichMetadata, handleFetchProviderAssets)
- ✅ isEntityMonitored() helper added to jobHandlers.ts
- 🔄 Series/seasons/episodes toggle deferred (will be part of TV show implementation)
- 🚫 updateAssets job blocked - not yet implemented (scheduled job for refreshing asset candidates)
- 📋 Next: Build frontend BookmarkToggle component and integrate with movies list

---

## Next Steps

1. ✅ ~~Create database migration for monitored column~~ (COMPLETED)
2. ✅ ~~Implement toggle monitored API endpoint for movies~~ (COMPLETED)
3. ✅ ~~Update enrichment jobs to skip unmonitored items~~ (COMPLETED)
4. 🔄 ~~Implement series/seasons/episodes toggle~~ (DEFERRED - part of TV implementation)
5. 🚫 ~~Update updateAssets() to skip unmonitored items~~ (BLOCKED - job not implemented yet)
6. Build BookmarkToggle frontend component (React + Tailwind)
7. Add monitored column to movies table view
8. Add monitored toggle to movie edit page header
9. Implement useToggleMonitored mutation hook
10. Test monitored/unmonitored behavior end-to-end

---

## Quick Reference

### Important Files
- **Migration Plan**: `docs/FRONTEND_OVERHAUL_MIGRATION_PLAN.md`
- **Status (this file)**: `docs/FRONTEND_OVERHAUL_STATUS.md`
- **Architecture**: `docs/ARCHITECTURE.md`
- **Database Schema**: `docs/DATABASE_SCHEMA.md`

### Git Commands
```bash
# Check status
cat docs/FRONTEND_OVERHAUL_STATUS.md

# Start new stage
git checkout -b feature/stage-X-name

# Save progress
git add .
git commit -m "stage-X: description"
git push origin feature/stage-X-name

# Complete stage
git checkout master
git merge feature/stage-X-name
git tag stage-X-complete
git push origin master --tags
```

### Stage Progress Template
Use this when updating status for stages 1-8:

```
### Stage X: Name

**Started**: YYYY-MM-DD
**Backend Progress**: X% (X/Y tasks)
**Frontend Progress**: X% (X/Y tasks)

#### Backend Tasks
- [ ] Task 1
- [ ] Task 2

#### Frontend Tasks
- [ ] Task 1
- [ ] Task 2

#### Notes
- Add notes about current work
- Any blockers or issues
- What needs to be done next session
```

---

**Last Session Summary**: Stage 1 backend work 70% complete:
- Created and ran monitored column migration (20250114_001_add_monitored_column.ts)
- Implemented POST /api/movies/:id/toggle-monitored endpoint
- Added MovieService.toggleMonitored() with WebSocket broadcasting
- Fixed MigrationRunner to register new migration
- Updated enrichment jobs to respect monitored status (handleEnrichMetadata, handleFetchProviderAssets)
- Added isEntityMonitored() helper method to jobHandlers.ts
- All migrations executing successfully

**Files Changed This Session**:
- src/database/migrations/20250114_001_add_monitored_column.ts (created)
- src/database/MigrationRunner.ts (registered new migration)
- src/controllers/movieController.ts (toggleMonitored method)
- src/routes/api.ts (POST route)
- src/services/movieService.ts (toggleMonitored method)
- src/services/jobHandlers.ts (monitored checks in enrichment)
- docs/FRONTEND_OVERHAUL_STATUS.md (this file)

**Deferred/Blocked**:
- Series/seasons/episodes toggle (deferred to TV show implementation)
- updateAssets job monitoring (blocked - job not implemented yet)

**Next Session Plan**: Start Stage 1 frontend work - build BookmarkToggle component, add to movies list, implement useToggleMonitored hook, test end-to-end.
