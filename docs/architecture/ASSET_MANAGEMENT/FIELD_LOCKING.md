# Field Locking System

**Purpose**: Explain field-level locking behavior that preserves user edits from automation.

**Related Docs**:
- Parent: [Asset Management](README.md)
- Enrichment: [Enrichment Phase](../../concepts/Enrichment/README.md)
- Database: [Lock Fields](../DATABASE.md#movies)

## Quick Reference

- **Philosophy**: User edits are sacred and preserved from automation
- **Granularity**: Per-field locking (title, plot, poster, fanart, etc.)
- **Behavior**: Locked fields skip enrichment and publishing
- **Monitored State**: Global lock via monitored flag
- **Unlock**: User can unlock fields to allow automation

## Philosophy: User Control First

Metarr's core principle is **"Intelligent defaults with manual override capability"**. Field locking is the mechanism that ensures user edits are never overwritten by automation.

### Key Concepts

1. **Manual Edits are Sacred**: Once a user edits a field, automation respects that choice
2. **Explicit Control**: Users can lock fields without editing them
3. **Selective Automation**: Lock specific fields while allowing others to auto-update
4. **Reversible**: Users can unlock fields to re-enable automation

## Lockable Fields

### Metadata Fields

**Movies**:
- `title`, `title_locked`
- `original_title`, `original_title_locked`
- `sort_title`, `sort_title_locked`
- `year`, `year_locked`
- `plot`, `plot_locked`
- `tagline`, `tagline_locked`
- `rating`, `rating_locked`
- `mpaa_rating`, `mpaa_rating_locked`

**TV Shows**:
- `title`, `title_locked`
- `plot`, `plot_locked`
- `status`, `status_locked`

**Episodes**:
- `title`, `title_locked`
- `plot`, `plot_locked`
- `air_date`, `air_date_locked`

### Asset Fields

**Movies**:
- `poster`, `poster_locked`
- `fanart`, `fanart_locked`
- `logo`, `logo_locked`
- `banner`, `banner_locked`
- `clearart`, `clearart_locked`
- `discart`, `discart_locked`

**TV Shows**:
- `poster`, `poster_locked`
- `fanart`, `fanart_locked`
- `banner`, `banner_locked`
- `logo`, `logo_locked`

**Seasons**:
- `poster`, `poster_locked`

**Episodes**:
- `thumbnail`, `thumbnail_locked`

### Collection Fields

**People (Cast/Crew)**:
- Locked at movie/show level (entire cast list)

**Genres**:
- Locked at movie/show level (entire genre list)

**Studios**:
- Locked at movie/show level (entire studio list)

## Locking Behavior

### Automatic Locking

Fields are automatically locked when:

1. **Manual Edit via UI**: User changes field value through web interface
2. **Manual Asset Selection**: User explicitly selects asset (not auto-selection)
3. **Custom Upload**: User uploads custom asset file

**Example**:
```
User changes movie title from "The Matrix" to "The Matrix (Director's Cut)"
→ title_locked = true
→ Future enrichment skips title field
```

### Explicit Locking

Users can lock fields without editing:

**Use Case**: Prefer provider metadata but want to prevent future changes

**Example**:
```
Movie currently has TMDB metadata (not locked)
User clicks "Lock Title" button
→ title_locked = true
→ Current value preserved, enrichment skips title
```

### Unlocking

Users can unlock fields to re-enable automation:

**Process**:
1. User clicks "Unlock Title" button
2. `title_locked = false`
3. Next enrichment can update title from provider

**Use Case**: User wants to revert to automated provider updates

## Enrichment Phase Behavior

The [Enrichment Phase](../../concepts/Enrichment/README.md) respects locks during metadata fetching.

### Lock Check Process

```typescript
// Enrichment phase checks locks before updating fields
if (!movie.title_locked) {
  movie.title = providerData.title;  // Update from provider
} else {
  // Skip: title is locked, preserve user's value
}

if (!movie.poster_locked) {
  // Fetch poster candidates from providers
  // Allow user selection or auto-selection
} else {
  // Skip: poster is locked, preserve current selection
}
```

### Locked Field Behavior

| Field State | Enrichment Behavior |
|-------------|---------------------|
| **Unlocked** | Fetch from providers, update metadata, fetch asset candidates |
| **Locked** | Skip provider fetch, preserve current value, no new candidates |
| **Partially Locked** | Update unlocked fields only |

### Provider Prioritization with Locks

When fields are partially locked:

```
Movie has:
- title: "Custom Title" (locked)
- plot: From TMDB (unlocked)
- rating: From TMDB (unlocked)

Enrichment:
- Skip title (locked)
- Update plot from providers
- Update rating from providers
```

## Publishing Phase Behavior

The [Publishing Phase](../../concepts/Publishing/README.md) respects locks during asset deployment.

### Asset Publishing with Locks

```typescript
// Publishing phase checks locks before deploying assets
if (!movie.poster_locked && movie.poster_id) {
  // Copy cache file to library
  await publishAsset(movie.poster_id, libraryPath);
} else if (movie.poster_locked) {
  // Skip: poster is locked, don't change library file
}
```

### Locked Asset Behavior

| Asset State | Publishing Behavior |
|-------------|---------------------|
| **Unlocked** | Deploy cache asset to library, replace existing |
| **Locked** | Skip deployment, preserve current library file |
| **No Selection** | Skip (no asset to publish) |

## Monitored vs Unmonitored

The `monitored` flag provides global locking behavior.

### Monitored (Default)

```sql
movies.monitored = true
```

**Behavior**:
- Full automation enabled (respects per-field locks)
- Enrichment phase fetches metadata and assets
- Publishing phase deploys assets
- Individual fields can still be locked

### Unmonitored

```sql
movies.monitored = false
```

**Behavior**:
- **Global lock on downloadable content** (acts as if all asset fields are locked)
- Enrichment phase: Metadata updates allowed (if fields unlocked)
- Enrichment phase: **No new asset candidates fetched**
- Publishing phase: **No asset deployment**
- Webhook processing: Still handles renames and deletions
- Stream info: Still updates from file analysis

**Use Case**: User has manually curated assets and metadata, wants to preserve everything but still track file changes.

### Monitored Flag Logic

```typescript
// Check during enrichment
if (!movie.monitored) {
  // Update metadata if fields unlocked
  await updateMetadata(movie);

  // Skip asset fetching entirely
  logger.info('Movie unmonitored, skipping asset enrichment');
  return;
}

// Proceed with full enrichment (assets + metadata)
```

## Lock Inheritance (TV Shows)

TV shows support lock inheritance from show → season → episode.

### Inheritance Rules

```
Show locked → All seasons and episodes inherit lock
Season locked → All episodes in season inherit lock
Episode locked → Only that episode locked
```

**Example**:
```
Show: "Breaking Bad"
- plot_locked = true

Season 1:
- Inherits plot_locked from show
- plot updates skip all episodes in Season 1

Episode S01E01:
- Inherits plot_locked from show
- Can override with explicit lock/unlock
```

### Override Behavior

Lower-level explicit locks override inherited locks:

```
Show: poster_locked = false (unlocked)
Season 1: poster_locked = true (explicitly locked)
→ Season 1 poster locked, other seasons unlocked
```

## Database Schema

### Lock Columns

Each lockable field has a corresponding `_locked` boolean column:

```sql
CREATE TABLE movies (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  title_locked BOOLEAN DEFAULT 0,
  plot TEXT,
  plot_locked BOOLEAN DEFAULT 0,
  poster_id INTEGER,
  poster_locked BOOLEAN DEFAULT 0,
  -- ... etc
);
```

### Lock Queries

**Find all locked fields for a movie**:
```sql
SELECT
  CASE WHEN title_locked THEN 'title' END,
  CASE WHEN plot_locked THEN 'plot' END,
  CASE WHEN poster_locked THEN 'poster' END
FROM movies
WHERE id = 123;
```

**Count movies with any locks**:
```sql
SELECT COUNT(*) FROM movies
WHERE title_locked = 1
   OR plot_locked = 1
   OR poster_locked = 1
   -- ... etc
```

## API Endpoints

### Lock Field

```typescript
// Lock specific field
PATCH /api/v1/movies/:id
Body: {
  title_locked: true
}
```

### Unlock Field

```typescript
// Unlock specific field
PATCH /api/v1/movies/:id
Body: {
  poster_locked: false
}
```

### Bulk Lock

```typescript
// Lock multiple fields
PATCH /api/v1/movies/:id
Body: {
  title_locked: true,
  plot_locked: true,
  poster_locked: true
}
```

### Set Monitored State

```typescript
// Set monitored flag (global lock)
PATCH /api/v1/movies/:id
Body: {
  monitored: false
}
```

## UI Behavior

### Visual Indicators

**Locked Field**:
- Lock icon displayed next to field
- Edit disabled or "Unlock to edit" message
- Tooltip: "This field is locked and will not be updated by enrichment"

**Unlocked Field**:
- No lock icon
- Edit enabled
- Tooltip: "This field can be updated by enrichment"

### Lock Actions

**Lock Button**:
- Available on all lockable fields
- Click to toggle lock state
- Confirmation for unlock if field has manual edits

**Monitored Toggle**:
- Global switch in movie/show details
- "Monitored" / "Unmonitored" state
- Warning: "Unmonitored items will not download new assets"

## Use Case Examples

### Use Case 1: Prefer Custom Title

```
User wants custom title but automated assets:
1. Edit title to custom value → auto-locks title
2. Leave assets unlocked
3. Enrichment: Skips title, fetches new asset candidates
4. Result: Custom title with automated asset updates
```

### Use Case 2: Manual Asset Curation

```
User has perfect poster but wants metadata updates:
1. Upload custom poster → auto-locks poster
2. Leave metadata unlocked
3. Enrichment: Updates metadata, skips poster
4. Result: Custom poster with automated metadata
```

### Use Case 3: Complete Manual Control

```
User wants no automation:
1. Set monitored = false
2. All fields effectively locked
3. Enrichment: Skips asset fetching entirely
4. Result: No automated changes, manual control only
```

### Use Case 4: Temporary Lock

```
User wants to preserve current state temporarily:
1. Lock all fields
2. Test new provider settings
3. Unlock fields after testing
4. Result: Safe experimentation without losing data
```

## Performance Considerations

### Enrichment Performance

Locks improve enrichment performance:
- **Skip provider API calls** for locked fields
- **Skip asset downloads** for locked assets
- **Reduce database writes** for locked metadata

**Example**: 1000 movies, 50% with locked posters
- 500 fewer API calls to TMDB/Fanart
- 500 fewer image downloads
- Faster enrichment completion

### Database Overhead

Lock columns add minimal overhead:
- **Storage**: 1 bit per lock (minimal)
- **Query Performance**: Boolean comparison is fast
- **Index**: Not typically indexed (small overhead)

## See Also

- [Asset Management Overview](README.md) - Three-tier architecture
- [Enrichment Phase](../../concepts/Enrichment/README.md) - Lock behavior during enrichment
- [Publishing Phase](../../concepts/Publishing/README.md) - Lock behavior during publishing
- [Database Schema](../DATABASE.md) - Lock column definitions
