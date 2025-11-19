# ENRICH vs PUBLISH Topology

**Purpose**: Clarify the critical distinction between enrichment (preparation) and publishing (deployment) phases.

**Status**: Canonical reference - updated 2025-01-29

---

## The Core Mental Model

Metarr operates on a **two-stage deployment pattern**:

```
ENRICH (Preparation Stage)          PUBLISH (Deployment Stage)
─────────────────────────           ──────────────────────────
Everything needed for UI     →      Everything needed for players
Stored in cache + database   →      Stored in library directories
User can review and edit     →      Media players can scan
Idempotent, non-destructive  →      Atomic, filesystem operations
```

---

## Stage 1: ENRICH (Metadata Preparation)

### Purpose
Prepare **everything the user needs to see and edit** in the Metarr web UI.

### What ENRICH Does

1. **Fetch Provider Metadata**
   - Query TMDB, TVDB, Fanart.tv
   - Save asset URLs to `provider_assets` table
   - Store metadata (votes, language, dimensions)

2. **Download Assets to Cache**
   - Download ALL selected assets
   - Store in `/data/cache/` (content-addressed)
   - Save to `cache_image_files`, `cache_video_files`, etc.
   - Calculate hashes (SHA256, perceptual)

3. **Analyze Quality**
   - Extract actual dimensions (not API estimates)
   - Calculate perceptual hashes for deduplication
   - Score based on resolution, votes, language

4. **Intelligent Selection**
   - Auto-select top N per asset type
   - Respect user locks (manual overrides)
   - Mark `is_selected = 1` in `provider_assets`

5. **Parse Actor Data**
   - Create/update `actors` table
   - Link via `movie_actors` junction
   - Download actor headshots to cache
   - Store in `cache_image_files` with `image_type = 'actor_thumb'`

6. **Update Entity Status**
   - Set `identification_status = 'enriched'`
   - Set `enriched_at = CURRENT_TIMESTAMP`
   - Broadcast WebSocket event to UI

### What the User Sees After ENRICH

- ✅ All metadata fields populated (title, plot, ratings, etc.)
- ✅ Selected posters, fanart, logos **visible in UI**
- ✅ Actor list with headshots
- ✅ Genres, studios, directors, writers
- ✅ Ability to **swap assets**, edit metadata, lock fields
- ✅ Status badge: "Enriched - Ready to Publish"
- ❌ NO changes to library directory yet
- ❌ Media players don't see anything yet

### Database State After ENRICH

```sql
-- Movies table
UPDATE movies SET
  identification_status = 'enriched',
  enriched_at = CURRENT_TIMESTAMP,
  title = 'The Matrix',
  year = 1999,
  plot = '...',
  tmdb_id = 603,
  imdb_id = 'tt0133093'
WHERE id = 123;

-- Cache has downloaded files
SELECT * FROM cache_image_files
WHERE entity_id = 123 AND entity_type = 'movie';
-- Returns: poster.jpg, fanart.jpg, clearlogo.png, actor_thumb_keanu.jpg

-- Provider assets marked as selected
SELECT * FROM provider_assets
WHERE entity_id = 123 AND is_selected = 1;
-- Returns: 3 posters, 5 fanart, 1 logo (ranked by score)

-- Actors populated
SELECT * FROM actors a
JOIN movie_actors ma ON a.id = ma.actor_id
WHERE ma.movie_id = 123;
-- Returns: Keanu Reeves, Laurence Fishburne, Carrie-Anne Moss
```

---

## Stage 2: PUBLISH (Library Deployment)

### Purpose
Deploy the **enriched cache** to the library filesystem where media players can scan it.

### What PUBLISH Does

1. **Verify Cache Completeness**
   - Check all selected assets are in cache
   - Download any missing assets (edge case: cache cleanup between enrich/publish)

2. **Copy Assets to Library**
   - Copy from `/data/cache/` → `/library/movies/Movie (Year)/`
   - Use Kodi naming conventions:
     - `Movie (Year)-poster.jpg` (best)
     - `Movie (Year)-poster1.jpg` (2nd best)
     - `Movie (Year)-poster2.jpg` (3rd best)
   - Use atomic write pattern (temp file → rename)

3. **Copy Actor Images**
   - Create `.actors/` subdirectory
   - Copy actor headshots: `Keanu Reeves.jpg`, `Laurence Fishburne.jpg`
   - Use actual actor names (spaces, not underscores)

4. **Generate NFO File**
   - Create `Movie (Year).nfo` with Kodi XML format
   - Include metadata: title, plot, year, ratings, genres
   - Include actors: `<actor><name>...</name><role>...</role></actor>`
   - Include stream details: video/audio/subtitle streams
   - **NO `<thumb>` or `<fanart>` URLs** - Kodi scans directory automatically

5. **Update Entity Status**
   - Set `last_published_at = CURRENT_TIMESTAMP`
   - Calculate NFO hash, store in `published_nfo_hash`
   - Log in `publish_log` table

6. **Notify Media Players** (optional)
   - Queue jobs for Kodi/Jellyfin/Plex groups
   - Trigger library scan/update

### What the User Sees After PUBLISH

- ✅ Library directory updated with assets and NFO
- ✅ Media players can scan and see metadata
- ✅ Status badge: "Published"
- ✅ Kodi/Jellyfin/Plex show updated artwork

### Filesystem State After PUBLISH

```
/library/movies/The Matrix (1999)/
├── The Matrix (1999).mkv              # Original file (untouched)
├── The Matrix (1999).nfo              # Generated metadata
├── The Matrix (1999)-poster.jpg       # Best poster (rank 1)
├── The Matrix (1999)-poster1.jpg      # 2nd best (rank 2)
├── The Matrix (1999)-poster2.jpg      # 3rd best (rank 3)
├── The Matrix (1999)-fanart.jpg       # Best fanart
├── The Matrix (1999)-fanart1.jpg      # 2nd best
├── The Matrix (1999)-clearlogo.png    # Logo
└── .actors/                           # Actor headshots
    ├── Keanu Reeves.jpg
    ├── Laurence Fishburne.jpg
    └── Carrie-Anne Moss.jpg
```

---

## Critical Distinctions

| Aspect | ENRICH | PUBLISH |
|--------|--------|---------|
| **Storage Location** | `/data/cache/` | `/library/movies/` |
| **File Format** | Content-addressed (SHA256 hash) | Kodi naming convention |
| **Database Tables** | `cache_image_files`, `provider_assets` | `library_image_files` |
| **User Interaction** | Review, edit, approve | Deploy, notify players |
| **Idempotency** | Safe to run multiple times | Safe to run multiple times |
| **Destructive?** | No (cache only) | Yes (writes to library) |
| **UI Visibility** | Immediate (WebSocket updates) | After completion |
| **Player Visibility** | None | Immediate (after scan) |

---

## Workflow Automation Settings

### `workflow.enrichment`
- **Default**: `true` (enabled)
- **Effect**: Auto-enrich after scan/identification
- **User override**: Manual "Enrich" button always works

### `workflow.publishing`
- **Default**: `false` (disabled) ⚠️
- **Effect**: Auto-publish after enrichment
- **Recommended**: Keep disabled for manual review workflow
- **User override**: Manual "Publish" button always works

### Recommended Workflows

**Manual Review Workflow** (default):
```
Scan → Identify → Enrich → [USER REVIEW] → Publish (manual)
```
- User sees enriched metadata before library changes
- Can swap assets, edit metadata, lock fields
- Publishes when satisfied

**Fully Automated Workflow** (advanced):
```
Scan → Identify → Enrich → Publish (auto)
```
- Zero user interaction
- Trusts auto-selection algorithm
- Good for large libraries with high confidence

---

## State Transitions

```
Entity State Machine:

unidentified
    ↓ (scan detects file)
identified (has tmdb_id)
    ↓ (enrichment job runs)
enriched (cache populated, assets selected)
    ↓ (publish job runs)
enriched + last_published_at != null
    ↓ (user edits metadata)
enriched + last_published_at < enriched_at (outdated)
    ↓ (user clicks "Republish")
enriched + last_published_at >= enriched_at (published)
```

### Status Indicators

**Frontend badge logic:**
```typescript
if (movie.identification_status === 'unidentified') {
  return <Badge variant="gray">Not Identified</Badge>;
}

if (movie.identification_status === 'identified') {
  return <Badge variant="blue">Identified</Badge>;
}

if (movie.identification_status === 'enriched' && !movie.last_published_at) {
  return <Badge variant="warning">Enriched - Unpublished</Badge>;
}

if (movie.identification_status === 'enriched' &&
    movie.last_published_at < movie.enriched_at) {
  return <Badge variant="info">Updated - Republish?</Badge>;
}

if (movie.identification_status === 'enriched' &&
    movie.last_published_at >= movie.enriched_at) {
  return <Badge variant="success">Published</Badge>;
}
```

---

## Actor Handling in Each Phase

### During ENRICH
1. Fetch cast from TMDB API (`/movie/{id}/credits`)
2. Create/update `actors` table (by `tmdb_id`)
3. Link via `movie_actors` junction table
4. **Download actor headshots to cache** (`cache_image_files`)
5. Store with `image_type = 'actor_thumb'`

### During PUBLISH
1. Query `actors` joined with `movie_actors`
2. Copy headshots from cache → `.actors/` directory
3. Use actor name as filename: `Keanu Reeves.jpg`
4. Include `<actor>` tags in NFO with local path

### Why This Split?
- **Cache headshots during enrich**: User can see actors in UI immediately
- **Publish to .actors/ folder**: Kodi can display actor thumbnails
- **Single source of truth**: Cache survives library deletions

---

## Movie Collections/Sets (Future)

Collections will follow the same pattern:

### During ENRICH
- Fetch collection metadata from TMDB
- Store in `collections` table
- Link via `movie_collections` junction
- Download collection poster to cache

### During PUBLISH
- Copy collection poster to collection directory
- Generate `collection.nfo` if needed
- Kodi scans and groups movies

---

## Edge Cases

### What if cache is deleted between enrich and publish?
**Solution**: Publish job re-downloads missing selected assets
```typescript
// Phase 1 of Publishing (docs/phases/PUBLISHING.md)
for (const selectedAsset of selected) {
  if (!existsInCache(selectedAsset.content_hash)) {
    await downloadFromProvider(selectedAsset.provider_url);
  }
}
```

### What if user manually edits library files?
**Solution**: Verification phase detects drift
```typescript
// Verification compares library vs cache hashes
if (libraryFileHash !== cacheFileHash) {
  logger.warn('Library file modified, restoring from cache');
  await restoreFromCache(cacheFile, libraryPath);
}
```

### What if user enriches again after publishing?
**Behavior**: Re-enrichment updates cache and selections
- May select better assets (new provider data)
- Triggers `enriched_at` update
- UI shows "Updated - Republish?" badge
- User can review changes before republishing

---

## Performance Implications

### ENRICH is Heavy
- Downloads 10-50 assets per movie
- Analyzes images (dimensions, hashes)
- Scores and ranks all options
- **Time**: 10-30 seconds per movie

### PUBLISH is Fast
- Cache already populated (no downloads)
- Simple file copy operations
- NFO generation (string manipulation)
- **Time**: 1-3 seconds per movie

**Optimization**: Batch enrichment during off-hours, publish on-demand

---

## Summary

### ENRICH = "Get everything ready for the user to review"
- Fetch from providers
- Download to cache
- Score and select best
- Parse actors
- **STOP at cache layer**
- Show in UI

### PUBLISH = "Deploy cache to library for media players"
- Copy cache → library
- Generate NFO
- Notify players
- **Only touches library layer**

This topology ensures:
✅ User has full visibility before library changes
✅ Cache is the source of truth
✅ Library can be rebuilt from cache
✅ Clear separation of concerns
✅ Atomic, safe operations

---

## Related Documentation

- [ENRICHMENT.md](../phases/ENRICHMENT.md) - 5-phase enrichment workflow
- [PUBLISHING.md](../phases/PUBLISHING.md) - 5-phase publishing workflow
- [DATABASE.md](../DATABASE.md) - Schema for cache and library tables
- [CLAUDE.md](../../CLAUDE.md) - Core philosophy and user control
