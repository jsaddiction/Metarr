# Recording (Enrichment Step 4)

Write scraped metadata and selection state to database tables.

## Purpose

After [Caching](./CACHING.md) stores assets, recording:

1. Copies metadata from provider_cache to movies table
2. Updates provider_assets with selection state
3. Syncs related data (genres, cast, crew, studios)
4. Calculates completeness percentage
5. Updates enrichment timestamps

---

## Process Flow

```
RECORDING
    │
    ├──► METADATA
    │         └──► Copy fields from provider_cache_movies
    │         └──► Respect field locks (never overwrite locked)
    │         └──► Apply provider priority (OMDB > TMDB)
    │
    ├──► RELATIONSHIPS
    │         └──► Sync genres to movie_genres
    │         └──► Sync cast to actors + movie_actors
    │         └──► Sync crew to movie_crew
    │         └──► Sync studios to movie_studios
    │
    ├──► ASSETS
    │         └──► Update provider_assets.is_selected
    │         └──► Update provider_assets.selected_at
    │         └──► Mark rejected duplicates
    │
    ├──► COMPLETENESS
    │         └──► Calculate % of filled fields
    │         └──► Store in movies.completeness_pct
    │
    └──► TIMESTAMPS
              └──► Update movies.last_enrichment_date
              └──► Update movies.updated_at
```

---

## Metadata Recording

### Field Priority

When provider_cache has data from multiple providers:

| Field | Priority | Source |
|-------|----------|--------|
| title | OMDB > TMDB | OMDB curates carefully |
| plot | OMDB > TMDB | OMDB provides short + full |
| outline | OMDB only | Short plot |
| tagline | TMDB only | OMDB doesn't have |
| runtime | OMDB > TMDB | More accurate |
| release_date | OMDB > TMDB | Direct source |
| content_rating | OMDB > TMDB | US MPAA |
| imdb_rating | OMDB only | Authoritative |
| rotten_tomatoes | OMDB only | Only source |
| metacritic | OMDB only | Only source |
| awards | OMDB only | Only source |

### Field Locking

**Never overwrite locked fields.**

```
For each field to update:
    │
    ├──► Check {field}_locked column
    │         ├──► locked = 1 → SKIP
    │         └──► locked = 0 → Continue
    │
    └──► Apply "fill gaps, don't erase" logic
              ├──► Current empty, new has value → UPDATE
              ├──► Current has value, new empty → SKIP
              └──► Both have values → UPDATE (allow correction)
```

### Lock Columns

| Lock Column | Protects |
|-------------|----------|
| `title_locked` | title |
| `sort_title_locked` | sort_title |
| `plot_locked` | plot |
| `outline_locked` | outline |
| `tagline_locked` | tagline |
| `content_rating_locked` | content_rating |
| `release_date_locked` | release_date |

---

## Relationship Syncing

### Genres

```sql
-- Clear existing (unless manually added)
DELETE FROM movie_genres WHERE movie_id = ? AND source = 'provider';

-- Insert from provider_cache
INSERT INTO movie_genres (movie_id, genre_id, source)
SELECT ?, g.id, 'provider'
FROM provider_cache_genres pcg
JOIN genres g ON g.name = pcg.name
WHERE pcg.movie_id = ?;
```

### Cast

```
For each actor in provider_cache_movie_cast:
    │
    ├──► Find or create actor record
    │         └──► Match by tmdb_id OR name
    │
    ├──► Check movie_actors lock state
    │         ├──► actors_order_locked → Don't reorder
    │         └──► role_locked → Don't update character name
    │
    └──► Upsert movie_actors record
              └──► actor_id, role, cast_order
```

### Crew

```sql
-- Sync directors, writers, producers
INSERT OR REPLACE INTO movie_crew (movie_id, person_name, job, department)
SELECT ?, name, job, department
FROM provider_cache_movie_crew
WHERE movie_id = ?;
```

### Studios

```sql
-- Sync production companies
INSERT OR IGNORE INTO movie_studios (movie_id, studio_id)
SELECT ?, s.id
FROM provider_cache_companies pcc
JOIN studios s ON s.name = pcc.name
WHERE pcc.movie_id = ?;
```

---

## Asset State Update

Update provider_assets to reflect selection:

```sql
-- Mark selected assets
UPDATE provider_assets
SET
  is_selected = 1,
  selected_at = CURRENT_TIMESTAMP,
  selected_by = 'auto'
WHERE id IN (?selected_ids);

-- Mark rejected duplicates
UPDATE provider_assets
SET is_rejected = 1
WHERE id IN (?rejected_ids);
```

---

## Completeness Calculation

Measure how complete the movie record is:

### Fields Checked

| Field | Weight | Required |
|-------|--------|----------|
| title | 10 | Yes |
| plot | 8 | No |
| release_date | 6 | No |
| runtime | 4 | No |
| content_rating | 4 | No |
| poster (any selected) | 8 | No |
| fanart (any selected) | 4 | No |
| imdb_rating | 4 | No |
| genres (any) | 4 | No |
| directors (any) | 4 | No |

### Calculation

```
filled_weight = sum of weights for non-empty fields
total_weight = sum of all weights

completeness_pct = (filled_weight / total_weight) * 100
```

Stored in `movies.completeness_pct` for filtering/sorting.

---

## Timestamps

After recording completes:

```sql
UPDATE movies
SET
  last_enrichment_date = CURRENT_TIMESTAMP,
  updated_at = CURRENT_TIMESTAMP
WHERE id = ?;
```

---

## Transaction Safety

All recording operations in a single transaction:

```
BEGIN TRANSACTION;

  UPDATE movies SET ...
  DELETE FROM movie_genres WHERE ...
  INSERT INTO movie_genres ...
  INSERT OR REPLACE INTO movie_actors ...
  UPDATE provider_assets SET ...
  UPDATE movies SET completeness_pct = ...

COMMIT;
```

If any step fails, entire recording rolls back.

---

## Output

After recording completes:

- `movies` table updated with metadata
- Related tables synced (genres, cast, crew, studios)
- `provider_assets` marked with selection state
- `completeness_pct` calculated
- Enrichment timestamps updated

**Enrichment is now COMPLETE.**

---

## What Happens Next

After enrichment completes:

| Condition | Next Step |
|-----------|-----------|
| `autoPublish = true` | Trigger publish job |
| `autoPublish = false` | Await user review in UI |
| Manual enrichment | Return to user immediately |

---

## Implementation

Recording is integrated into the scraping process. For implementation details:
→ [Movies: 02-SCRAPING.md](../../implementation/Movies/02-SCRAPING.md)

## Related Documentation

- [Caching](./CACHING.md) - Previous step (file storage)
- [Publishing](../Publishing/README.md) - Optional next step
