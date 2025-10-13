# Reengineering Plan

## Current State Assessment

After reviewing the codebase (127 TypeScript files), documentation cleanup, and the current database migration, here's the comprehensive reengineering plan to align with our streamlined architecture.

## Critical Finding: Database Schema Mismatch

**Problem**: The current `20251003_001_initial_schema.ts` migration (2061 lines) contains **OLD ARCHITECTURE** that conflicts with our new simplified design:

### ❌ **Remove from Current Schema**:
1. **`asset_candidates` table** - Old three-tier system (lines 1242-1285)
2. **`cache_inventory` table** - Old reference counting (lines 1288-1317)
3. **`backup_assets` table** - Unnecessary complexity (lines 1320-1371)
4. **`asset_selection_config` table** - Overcomplicated (lines 1374-1409)
5. **`library_automation_config` table** - Three automation modes (lines 1412-1433)
6. **`rejected_assets` table** - Not needed (lines 1436-1451)
7. **`publish_log` table** - No publish workflow (lines 1454-1480)
8. **`job_queue` table** (old version) - Wrong schema (lines 1483-1518)
9. **`completeness_config` table** - Overcomplicated (lines 1521-1552)
10. **State machine columns** on movies/series/episodes:
    - `state`, `enriched_at`, `enrichment_priority`
    - `has_unpublished_changes`, `last_published_at`, `published_nfo_hash`
11. **Over-engineered provider priority tables**:
    - `asset_type_priorities`
    - `metadata_field_priorities`
    - `auto_selection_strategy`
    - `asset_selection_presets`
    - `library_provider_config`

### ✅ **Keep from Current Schema**:
- Core media tables: `movies`, `series`, `episodes`, `artists`, `albums`, `tracks`
- Stream tables: `video_streams`, `audio_streams`, `subtitle_streams`
- Normalized metadata: `actors`, `genres`, `directors`, `writers`, `studios`, `tags`, `countries`, `sets`, `ratings`
- Link tables: `movies_actors`, `movies_genres`, etc.
- System tables: `libraries`, `media_players`, `media_player_groups`, `scan_jobs`
- Basic `images`, `trailers`, `subtitles` tables (but simplify)
- `providers` and `provider_configs` tables

## Reengineering Steps

### Step 1: Create New Clean Migration ⚠️ **DESTRUCTIVE**

**Action**: Delete existing database and create a fresh migration from [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)

**Tasks**:
1. ✅ Backup `src/database/migrations/20251003_001_initial_schema.ts` to `_archive/`
2. ✅ Create new `src/database/migrations/20251015_001_clean_schema.ts` based on [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)
3. ✅ Delete `data/metarr.sqlite` (or rename to `metarr.sqlite.old`)
4. ✅ Run new migration: `npm run db:migrate`

**Why**: The current migration has 60%+ old architecture. Easier to start fresh than patch.

**Files to Create**:
```
src/database/migrations/20251015_001_clean_schema.ts  (NEW - from DATABASE_SCHEMA.md)
```

**Files to Archive**:
```
src/database/migrations/20251003_001_initial_schema.ts  (ARCHIVE)
src/database/migrations/20251011_001_add_last_scraped_at.ts  (ARCHIVE - outdated)
```

---

### Step 2: Remove Old Architecture Code

**Action**: Delete or archive services/controllers that implement old design patterns

#### 🗑️ **Controllers to Remove**:
```
src/controllers/assetController.ts            (asset candidates)
src/controllers/automationConfigController.ts (three modes)
src/controllers/autoSelectionController.ts    (overcomplicated)
src/controllers/dataSelectionController.ts    (overcomplicated)
src/controllers/priorityConfigController.ts   (overcomplicated)
```

#### ✅ **Controllers to Keep & Update**:
```
src/controllers/libraryController.ts          (update for simple scan)
src/controllers/movieController.ts            (update for 3 states)
src/controllers/webhookController.ts          (simplify for immediate processing)
src/controllers/jobController.ts              (update for new job queue)
src/controllers/mediaPlayerController.ts      (keep, add groups)
src/controllers/providerConfigController.ts   (simplify)
src/controllers/imageController.ts            (simplify)
```

#### 🗑️ **Services to Remove**:
```
src/services/autoSelectionService.ts          (overcomplicated algorithm)
src/services/dataSelectionService.ts          (overcomplicated)
src/services/enrichmentDecisionService.ts     (not needed - auto everything)
src/services/assetCacheService.ts             (old three-tier)
src/services/assetSaveService.ts              (old three-tier)
```

#### ✅ **Services to Keep & Update**:
```
src/services/libraryScanService.ts            (simplify - no two-phase)
src/services/libraryService.ts                (keep basic CRUD)
src/services/movieService.ts                  (update for 3 states)
src/services/providers/*                      (keep all - good structure)
src/services/nfo/*                            (keep NFO parsing)
src/services/scan/*                           (update for simple scan)
src/services/hash/*                           (keep hashing utilities)
src/services/media/*                          (keep FFprobe integration)
```

#### 🆕 **Services to Create**:
```
src/services/jobQueueService.ts               (new job queue)
src/services/cacheService.ts                  (new content-addressed cache)
src/services/pathMappingService.ts            (Kodi path translation)
src/services/playbackStateService.ts          (capture/restore playback)
src/services/webhookProcessingService.ts      (immediate webhook handling)
```

---

### Step 3: Update Configuration System

**Action**: Simplify configuration to match new architecture

#### Files to Update:
```
src/config/ConfigManager.ts       (remove automation modes, publish configs)
src/config/defaults.ts             (simplify defaults)
src/config/providerMetadata.ts    (keep - good reference data)
src/config/types.ts                (update types for new schema)
```

#### Remove Configs For:
- Three automation modes (Manual, YOLO, Hybrid)
- Asset candidate lazy loading
- Publish workflow settings
- Completeness tracking
- Auto-selection algorithm weights

#### Keep/Add Configs For:
- Content-addressed cache directory structure
- Job queue priorities
- Soft delete grace period (30 days)
- Cache cleanup period (90 days)
- Provider rate limits

---

### Step 4: Routes Cleanup

**Action**: Remove routes for deleted controllers, update routes for simplified workflows

#### Files to Update:
```
src/routes/api.ts                 (main API router)
```

#### Routes to Remove:
```
POST   /api/asset-selection/...           (autoSelectionController)
POST   /api/data-selection/...            (dataSelectionController)
GET    /api/automation-config/...         (automationConfigController)
POST   /api/priority-config/...           (priorityConfigController)
POST   /api/movies/:id/publish            (no publish workflow)
POST   /api/movies/:id/select-assets      (no candidates)
```

#### Routes to Keep & Update:
```
# Libraries
GET    /api/libraries
POST   /api/libraries
POST   /api/libraries/:id/scan            (simplified scan)

# Movies
GET    /api/movies
GET    /api/movies/:id
PUT    /api/movies/:id                    (with auto-lock on edit)
DELETE /api/movies/:id                    (soft delete)
POST   /api/movies/:id/identify           (manual ID)
POST   /api/movies/:id/enrich             (trigger enrichment)

# Assets
GET    /api/movies/:id/assets
POST   /api/movies/:id/assets/:type/upload
DELETE /api/movies/:id/assets/:type

# Webhooks
POST   /api/webhooks/radarr               (immediate processing)
POST   /api/webhooks/sonarr

# Jobs
GET    /api/jobs
GET    /api/jobs/:id
POST   /api/jobs/:id/retry

# Kodi (NEW)
POST   /api/players
GET    /api/players
POST   /api/players/groups
```

---

### Step 5: Frontend Cleanup

**Action**: Remove UI for deleted features, simplify remaining UI

#### Components to Remove:
```
public/frontend/src/components/asset/                    (candidate selection UI)
public/frontend/src/components/provider/AssetTypePriorityConfig.tsx
public/frontend/src/components/provider/MetadataFieldPriorityConfig.tsx
public/frontend/src/components/provider/AutoSelectionStrategyToggle.tsx
public/frontend/src/components/provider/ProviderCoverageStatus.tsx
public/frontend/src/pages/settings/DataSelection.tsx     (overcomplicated)
```

#### Components to Keep & Simplify:
```
public/frontend/src/components/library/LibraryCard.tsx
public/frontend/src/components/movie/MovieCard.tsx
public/frontend/src/components/movie/MovieTableView.tsx
public/frontend/src/pages/Dashboard.tsx
public/frontend/src/pages/Settings.tsx
public/frontend/src/pages/settings/Libraries.tsx
public/frontend/src/pages/settings/Providers.tsx        (simplify - just enable/disable)
```

#### Pages to Create:
```
public/frontend/src/pages/Trash.tsx                     (30-day recovery)
public/frontend/src/pages/Jobs.tsx                      (job queue status)
public/frontend/src/pages/settings/MediaPlayers.tsx     (Kodi groups)
public/frontend/src/pages/settings/PathMappings.tsx     (path translation)
```

---

### Step 6: Type Definitions Update

**Action**: Update TypeScript types to match new schema

#### Files to Update:
```
src/types/models.ts               (update for new schema)
src/types/provider.ts             (simplify)
src/types/database.ts             (update table definitions)
src/types/websocket.ts            (update event types)
```

#### Remove Types For:
- Asset candidates
- Asset selection config
- Automation modes
- Publish workflow
- Completeness tracking

#### Add Types For:
- Content-addressed cache
- Job queue with priorities
- Playback state
- Media player groups
- Path mappings

---

## Implementation Timeline

### Week 1: Database & Core Services
**Days 1-2**: New migration, delete old tables
**Days 3-5**: Update core services (scan, enrichment, cache)

### Week 2: Controllers & Routes
**Days 1-3**: Remove old controllers, update existing
**Days 4-5**: Update API routes, test with Postman

### Week 3: Job Queue & Webhooks
**Days 1-3**: Implement new job queue
**Days 4-5**: Update webhook processing (immediate)

### Week 4: Frontend Cleanup
**Days 1-3**: Remove old components
**Days 4-5**: Update remaining UI, add new pages

### Week 5: Kodi Integration Prep
**Days 1-5**: Media player groups, path mappings, playback state

## Critical Decision Points

### ⚠️ **Decision 1: Database Migration Strategy**

**Option A: Nuclear (Recommended)**
- Delete `data/metarr.sqlite`
- Create clean migration from DATABASE_SCHEMA.md
- **Pros**: Clean start, no legacy baggage, faster development
- **Cons**: Lose any test data (not a concern in dev)

**Option B: Incremental**
- Keep existing tables, add new ones, mark old ones deprecated
- Gradually migrate data over time
- **Pros**: Preserve test data
- **Cons**: Confusing dual schemas, slower, technical debt

**Recommendation**: **Option A (Nuclear)** - We're in development, no production users, clean start is best.

---

### ⚠️ **Decision 2: Code Deletion Strategy**

**Option A: Delete Immediately**
- Remove all old architecture files now
- **Pros**: Clear focus, no confusion
- **Cons**: Can't reference old code

**Option B: Archive First**
- Move to `src/_archive/` for reference
- Delete after reengineering complete
- **Pros**: Can reference if needed
- **Cons**: Clutter, temptation to reuse bad patterns

**Recommendation**: **Option B (Archive)** - Keep old code around for 1-2 weeks during transition, then delete.

---

## Success Criteria

### Phase 1 Complete When:
- [ ] New clean migration creates simplified schema
- [ ] Can scan a library and create movie records
- [ ] Can manually identify a movie (search TMDB)
- [ ] Can manually enrich movie (fetch metadata)
- [ ] Can download and cache assets (SHA256 naming)
- [ ] FFprobe extracts stream details
- [ ] UI displays movies with metadata

### Phase 2 Complete When:
- [ ] Job queue processes background tasks
- [ ] Webhook creates critical priority job
- [ ] New media automatically enriched
- [ ] Assets downloaded concurrently
- [ ] NFO files generated (Kodi format)
- [ ] Field locking prevents automation overwrite

### Phase 3 Complete When:
- [ ] Kodi groups configured
- [ ] Path mapping working
- [ ] Library update notifications sent
- [ ] Playback state captured during upgrade
- [ ] Playback restored after upgrade
- [ ] 30-day soft delete working

## Next Immediate Steps

1. **Review this plan** - Confirm approach
2. **Backup current code** - `git commit -m "Checkpoint before reengineering"`
3. **Start with Step 1** - Create new clean migration
4. **Test immediately** - Verify new schema works
5. **Remove old code** - Archive then delete old architecture

---

**Ready to proceed?** Let me know if you want me to:
1. Start with the new clean migration (Step 1)
2. Create the archive structure first
3. Make any adjustments to the plan
