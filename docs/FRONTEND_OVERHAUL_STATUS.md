# Frontend Overhaul Status

**Last Updated**: 2025-01-14 16:15:00
**Current Stage**: Stage 1 - Monitored/Unmonitored System
**Current Machine**: Primary Development Machine
**Current Branch**: feature/stage-1-monitored-system

---

## Overall Progress

- [x] Stage 0: Planning (COMPLETED 2025-01-14)
- [ ] Stage 1: Monitored System (IN PROGRESS - 0%)
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
**Backend Progress**: 0% (0/5 tasks)
**Frontend Progress**: 0% (0/4 tasks)

#### Backend Tasks
- [ ] Migration: Add `monitored BOOLEAN DEFAULT 1` to movies, series, seasons, episodes
- [ ] API: `POST /api/movies/:id/toggle-monitored`
- [ ] API: `POST /api/series/:id/toggle-monitored` (cascades to seasons/episodes)
- [ ] Service: Update `enrichMovie()` to skip if `monitored = 0`
- [ ] Service: Update `updateAssets()` to skip unmonitored items

#### Frontend Tasks
- [ ] Component: BookmarkToggle component
- [ ] Page: Add bookmark column to movies list
- [ ] Page: Add bookmark toggle to movie edit page header
- [ ] Hook: `useToggleMonitored` mutation hook

#### Notes
- Starting with database migration
- Will implement bookmark icon toggle like *arr stack
- Unmonitored = frozen (no automation)

---

## Next Steps

1. Create database migration for monitored column
2. Implement toggle monitored API endpoints
3. Build BookmarkToggle frontend component
4. Test monitored/unmonitored behavior

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

**Last Session Summary**: Completed Stage 0 - Planning. Committed and tagged migration plan documents. Created Stage 1 feature branch and updated status document.

**Next Session Plan**: Create database migration for monitored column, implement toggle API endpoints, build BookmarkToggle component.
