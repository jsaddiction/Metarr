# Frontend Overhaul Status

**Last Updated**: 2025-01-14 17:45:00
**Current Stage**: Stage 1 - Monitored/Unmonitored System
**Current Machine**: Primary Development Machine
**Current Branch**: feature/stage-1-monitored-system

---

## Overall Progress

- [x] Stage 0: Planning (COMPLETED 2025-01-14)
- [ ] Stage 1: Monitored System (IN PROGRESS - 40%)
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
**Backend Progress**: 40% (2/5 tasks)
**Frontend Progress**: 0% (0/4 tasks)

#### Backend Tasks
- [x] Migration: Add `monitored BOOLEAN DEFAULT 1` to movies, series, seasons, episodes
- [x] API: `POST /api/movies/:id/toggle-monitored`
- [ ] API: `POST /api/series/:id/toggle-monitored` (cascades to seasons/episodes)
- [ ] Service: Update `enrichMovie()` to skip if `monitored = 0`
- [ ] Service: Update `updateAssets()` to skip unmonitored items

#### Frontend Tasks
- [ ] Component: BookmarkToggle component
- [ ] Page: Add bookmark column to movies list
- [ ] Page: Add bookmark toggle to movie edit page header
- [ ] Hook: `useToggleMonitored` mutation hook

#### Notes
- ✅ Database migration completed - monitored column added to all media tables
- ✅ Toggle monitored API endpoint implemented for movies
- ✅ MovieService.toggleMonitored() working with WebSocket broadcasting
- Next: Implement series/seasons/episodes toggle with cascade logic
- Then: Update enrichment services to respect monitored status
- Finally: Build frontend BookmarkToggle component

---

## Next Steps

1. ✅ ~~Create database migration for monitored column~~ (COMPLETED)
2. ✅ ~~Implement toggle monitored API endpoint for movies~~ (COMPLETED)
3. Implement series/seasons/episodes toggle with cascade logic
4. Update enrichMovie() and updateAssets() to skip unmonitored items
5. Build BookmarkToggle frontend component
6. Test monitored/unmonitored behavior end-to-end

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

**Last Session Summary**: Stage 1 backend work 40% complete:
- Created and ran monitored column migration (20250114_001_add_monitored_column.ts)
- Implemented POST /api/movies/:id/toggle-monitored endpoint
- Added MovieService.toggleMonitored() with WebSocket broadcasting
- Fixed MigrationRunner to register new migration
- All migrations executing successfully

**Files Changed This Session**:
- src/database/migrations/20250114_001_add_monitored_column.ts (created)
- src/database/MigrationRunner.ts (registered new migration)
- src/controllers/movieController.ts (toggleMonitored method)
- src/routes/api.ts (POST route)
- src/services/movieService.ts (toggleMonitored method)
- docs/FRONTEND_OVERHAUL_STATUS.md (this file)

**Next Session Plan**: Continue Stage 1 backend - implement series toggle with cascade logic, update enrichment services to respect monitored status, then start frontend work.
