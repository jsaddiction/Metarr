# Development Timeline

Chronological record of Metarr development milestones.

---

## 2025-10-15 - Stage-Based Development Period

### Stage 0: Planning & Git Workflow
- **Tag**: `stage-0-complete`
- **Focus**: Documentation foundation, git conventions
- **Key Deliverables**: CLAUDE.md, GIT_WORKFLOW.md, STAGE_DEFINITIONS.md

### Stage 1: Monitored/Unmonitored System
- **Tag**: `stage-1-complete`
- **Focus**: Bookmark/monitoring toggle system
- **Key Deliverables**: BookmarkToggle component, database schema for bookmarks
- **Database Changes**: Added `monitored` column to movies, series, seasons, episodes tables
- **API Endpoints**: `POST /api/movies/:id/toggle-monitored`

### Stage 2: Field & Asset Locking
- **Tag**: `stage-2-complete`
- **Focus**: User edit protection, field-level locking
- **Key Deliverables**: LockIcon component, lock tracking in database
- **API Endpoints**: `POST /api/movies/:id/lock-field`, `unlock-field`, `reset-metadata`

### Stage 3: Asset Candidate Caching
- **Tag**: *(none - completed without tag)*
- **Commits**: `98c5e15`, `b381279`, `67c51bd`
- **Focus**: Three-tier asset system (candidates → cache → library)
- **Key Deliverables**: Split cache/library tables, UUID-based asset storage
- **Database Changes**: `asset_candidates`, `provider_refresh_log` tables
- **Services**: AssetCandidateService, updateAssets scheduled job

### Stage 4: Webhooks
- **Tag**: `stage-4-complete`
- **Focus**: Radarr/Sonarr integration, automatic enrichment
- **Key Deliverables**: Webhook receivers, job queue processing
- **API Endpoints**: `POST /api/webhooks/radarr`, `POST /api/webhooks/sonarr`, `POST /api/webhooks/lidarr`
- **Radarr Events**: All 11 event types implemented (Download, Rename, MovieFileDelete, Health, Test, etc.)

### Stage 5: Kodi Integration
- **Tag**: `stage-5-complete`
- **Focus**: Universal player group architecture
- **Key Deliverables**: Kodi JSON-RPC integration, media player management
- **Database Changes**:
  - Migration 003: `media_player_libraries` table
  - Migration 004: `max_members` column in `media_player_groups`
  - Migration 005: `media_player_group_path_mappings` table
- **Architecture Decision**: ALL players belong to groups (universal group architecture)

---

## 2025-10-15+ - Feature-Based Development Period

### Frontend Enhancements (Phase 1)
- **Tag**: `frontend-phase-1-complete`
- **Branch**: `feature/shadcn-integration`
- **Focus**: shadcn/ui component integration
- **Key Commits**:
  - `69ad085`: Integrate shadcn/ui components and update theme
  - `67b326e`: Update CLAUDE.md with UI component standards
- **Deliverables**:
  - Custom AnimatedTabs component
  - Tailwind violet theme (replaced custom purple)
  - Card component standardization

### Frontend Enhancements (Phase 2)
- **Tag**: `frontend-phase-2-complete`
- **Branch**: `feature/shadcn-integration`
- **Focus**: Component library expansion
- **Key Commits**:
  - `41fbf58`: Migrate remaining pages to shadcn Card components
  - `38e1b99`: Add multi-asset selection and configuration system
- **Deliverables**:
  - 13 placeholder pages migrated to shadcn Cards
  - ZoomableImage component (2x zoom effect)
  - Multi-asset selection UI

### Backend Audit (Phase 1)
- **Merge**: `audit/backend-comprehensive` → `master` (commit `470179e`, 2025-10-21)
- **Focus**: Code quality, architecture cleanup, API endpoints
- **Key Commits**:
  - `60936d7`: Complete split cache/library table migration
  - `c726d46`: Update DATABASE_SCHEMA.md for UUID-based cache architecture
  - `3663910`: Integrate job tracking with webhook event logging
  - `bd0d7dc`: Add webhook events and activity log API endpoints
  - `9861f77`: Implement atomic file writes to prevent corruption
- **Deliverables**:
  - Atomic file write operations (corruption prevention)
  - Webhook event tracking
  - Activity log API endpoints

### Database Schema Refactoring
- **Commits**:
  - `60936d7`: Split cache/library migration
  - `f6b5907`: Complete clean schema migration with flexible asset discovery
- **Focus**: UUID-based cache architecture
- **Key Deliverables**:
  - `20251015_001_clean_schema.ts` migration
  - Content-addressed asset storage
  - Separated cache and library asset tables

### Actor Discovery & Static Assets
- **Commit**: `048791b` (2025-10-18)
- **Focus**: Actor enrichment and static asset serving
- **Deliverables**:
  - Actor discovery from TMDB
  - Actor edit modal with field locking UI
  - Static asset serving implementation

### Multi-Phase Job Queue Architecture
- **Commit**: `8838e4b`
- **Focus**: Refactor scanning to use job queue
- **Deliverables**:
  - Multi-phase job queue architecture
  - Priority-based job processing
  - Circuit breaker integration

---

## Development Workflow Transition

**2025-10-15**: Stage-based development completed (Stages 0-5)

**2025-10-15+**: Transitioned to feature-based development

**Rationale**: Stage-based workflow served early development well for establishing foundational architecture. Feature-based development better supports:
- Parallel feature development
- More granular tagging
- Flexible iteration on incomplete features
- Preparation for community contributions

---

## Git Tags Timeline

```
stage-0-complete         2025-10-15
stage-1-complete         2025-10-15
stage-2-complete         2025-10-15
(stage-3: no tag)        2025-10-15
stage-4-complete         2025-10-15
stage-5-complete         2025-10-15
frontend-phase-1-complete  2025-10-18
frontend-phase-2-complete  2025-10-18
```

**Note**: Stage 3 (Asset Candidate Caching) was completed via commits `98c5e15`, `b381279`, `67c51bd` but never received a git tag.

---

## Architecture Evolution

### Initial Schema (Pre-Stage 3)
- Combined cache/library asset storage
- File-path-based asset references
- Single-tier asset system

### Post-Stage 3 (UUID-based Cache)
- Split cache and library tables
- Content-addressed storage (SHA256 hashing)
- Three-tier asset system (candidates → cache → library)
- UUID-based entity references

### Post-Stage 5 (Universal Groups)
- ALL media players belong to groups (not just Kodi)
- Group-level path mapping (not player-level)
- Simplified architecture (no branching logic for player types)

---

## Documentation Milestones

### 2025-10-15
- Created comprehensive documentation structure
- Established TIER 1/2/3 hierarchy (WHAT/WHY/HOW)
- Documented stage-based workflow

### 2025-10-18
- Updated CLAUDE.md with UI component standards
- Documented Tailwind violet theme migration
- Established AnimatedTabs as standard

### 2025-10-21
- Documented development model transition
- Created DEVELOPMENT_TIMELINE.md
- Updated PROJECT_ROADMAP.md for feature-based development
- Marked STAGE_DEFINITIONS.md as historical reference

---

## Related Documentation

- [GIT_WORKFLOW.md](GIT_WORKFLOW.md) - Current git conventions
- [PROJECT_ROADMAP.md](PROJECT_ROADMAP.md) - Development status and priorities
- [STAGE_DEFINITIONS.md](STAGE_DEFINITIONS.md) - Historical stage details
- [DESIGN_DECISIONS.md](DESIGN_DECISIONS.md) - Architectural decision records
