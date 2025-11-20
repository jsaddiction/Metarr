# Related Entities Data Migration

**Status**: Completed (2025-11-20)
**Migration Location**: `src/database/migrations/20251015_001_clean_schema.ts` (lines 1987-2223)

## Overview

This migration populates normalized related entity tables (genres, directors, writers, studios, countries) from existing provider cache data. It runs automatically as part of the main schema migration.

## What It Does

The migration extracts and normalizes the following data from the `provider_cache_*` tables:

### 1. Genres
- **Source**: `provider_cache_movie_genres` + `provider_cache_genres`
- **Target**: `genres` table + `movie_genres` junction table
- **Deduplication**: By genre name + media_type
- **Example**: Action, Drama, Science Fiction

### 2. Crew (Directors & Writers)
- **Source**: `provider_cache_movie_crew` + `provider_cache_people`
- **Target**: `crew` table + `movie_crew` junction table
- **Jobs Migrated**: Director, Writer, Screenplay, Story
- **Normalized Roles**: 'director', 'writer'
- **Deduplication**: By TMDB ID (if available), otherwise by name
- **Example**: Christopher Nolan (Director), Jonathan Nolan (Writer)

### 3. Studios (Production Companies)
- **Source**: `provider_cache_movie_companies` + `provider_cache_companies`
- **Target**: `studios` table + `movie_studios` junction table
- **Deduplication**: By studio name
- **Example**: Warner Bros., Legendary Pictures, Syncopy

### 4. Countries (Production Countries)
- **Source**: `provider_cache_movie_countries` + `provider_cache_countries`
- **Target**: `countries` table + `movie_countries` junction table
- **Deduplication**: By country name
- **Example**: United States of America, United Kingdom

## Migration Characteristics

### Idempotent Design
- **Safe to run multiple times**: Migration checks if records exist before creating them
- **No duplicates**: Uses `SELECT` before `INSERT` pattern
- **No overwrites**: Only creates new records, never updates existing ones

### Non-Destructive
- **Does NOT overwrite**: Existing data in target tables is preserved
- **Does NOT lock fields**: No field locking columns are modified
- **Does NOT delete**: Only inserts new data

### Error Handling
- **Non-fatal**: Migration wrapped in try-catch
- **Graceful degradation**: If migration fails, schema creation still succeeds
- **Logged errors**: Failures logged but don't block database initialization

## Data Quality Considerations

### Provider Cache Requirements
The migration only processes movies that have matching provider cache data:

```sql
-- Match criteria (any one of these):
- m.tmdb_id = pc.tmdb_id
- m.imdb_id = pc.imdb_id
- m.tvdb_id = pc.tvdb_id
```

### Movies Without Provider Cache
Movies that have never been enriched will have:
- **Empty related fields**: No genres, crew, studios, or countries
- **No errors**: Migration skips them silently
- **Future enrichment**: Will be populated when movie is enriched

### Crew Role Normalization
TMDB uses various job titles that are normalized to our schema:

| TMDB Job | Normalized Role |
|----------|-----------------|
| Director | director |
| Writer | writer |
| Screenplay | writer |
| Story | writer |

Other crew roles (Producer, Composer, etc.) are **not migrated** at this time.

## Expected Results

### Typical Migration Output
```
🔄 Migrating related entities from provider cache...
📊 Found 150 movies with provider cache data
✅ Related entities migrated from provider cache:
   - Genres: 19 created, 450 links
   - Crew: 287 created, 412 links
   - Studios: 156 created, 289 links
   - Countries: 23 created, 198 links
```

### Interpretation
- **Genres Created**: Unique genre entries across all movies
- **Genre Links**: Total movie-genre associations
- **Crew Created**: Unique directors/writers across all movies
- **Crew Links**: Total movie-crew associations (one per role)
- **Studios Created**: Unique production companies
- **Studio Links**: Total movie-studio associations
- **Countries Created**: Unique countries
- **Country Links**: Total movie-country associations

## When Migration Runs

### Automatic Execution
The migration runs automatically during:
1. **Initial database setup**: First `npm run migrate`
2. **Database rebuild**: After deleting `data/metarr.sqlite`
3. **Migration re-run**: When migration is manually re-executed

### Manual Re-run
To re-run the migration (safe, idempotent):
```bash
# Delete and recreate database
rm data/metarr.sqlite

# Run migrations (includes related entities migration)
npm run migrate
```

## Performance Characteristics

### Speed
- **Small libraries** (< 100 movies): 1-5 seconds
- **Medium libraries** (100-1000 movies): 5-30 seconds
- **Large libraries** (> 1000 movies): 30-120 seconds

### Database Impact
- **Read-heavy**: Multiple SELECT queries per movie
- **Write-moderate**: INSERT only when records don't exist
- **Transaction-safe**: Runs within migration transaction
- **Memory-efficient**: Processes movies sequentially

## Verification

### Check Migration Results
```sql
-- Count genres per movie
SELECT m.title, COUNT(mg.genre_id) as genre_count
FROM movies m
LEFT JOIN movie_genres mg ON m.id = mg.movie_id
GROUP BY m.id
ORDER BY genre_count DESC;

-- Count directors per movie
SELECT m.title, COUNT(mc.crew_id) as director_count
FROM movies m
LEFT JOIN movie_crew mc ON m.id = mc.movie_id AND mc.role = 'director'
GROUP BY m.id
ORDER BY director_count DESC;

-- Count studios per movie
SELECT m.title, COUNT(ms.studio_id) as studio_count
FROM movies m
LEFT JOIN movie_studios ms ON m.id = ms.movie_id
GROUP BY m.id
ORDER BY studio_count DESC;

-- Count countries per movie
SELECT m.title, COUNT(mc.country_id) as country_count
FROM movies m
LEFT JOIN movie_countries mc ON m.id = mc.movie_id
GROUP BY m.id
ORDER BY country_count DESC;
```

### Data Completeness by Movie
```sql
-- Movies with complete related entities
SELECT
  m.title,
  COUNT(DISTINCT mg.genre_id) as genres,
  COUNT(DISTINCT CASE WHEN mc.role = 'director' THEN mc.crew_id END) as directors,
  COUNT(DISTINCT CASE WHEN mc.role = 'writer' THEN mc.crew_id END) as writers,
  COUNT(DISTINCT ms.studio_id) as studios,
  COUNT(DISTINCT mco.country_id) as countries
FROM movies m
LEFT JOIN movie_genres mg ON m.id = mg.movie_id
LEFT JOIN movie_crew mc ON m.id = mc.movie_id
LEFT JOIN movie_studios ms ON m.id = ms.movie_id
LEFT JOIN movie_countries mco ON m.id = mco.movie_id
GROUP BY m.id
ORDER BY (genres + directors + writers + studios + countries) DESC;
```

## Troubleshooting

### No Data Migrated
**Symptom**: Migration reports 0 movies processed

**Possible causes**:
1. No movies in database yet
2. Movies have no TMDB/IMDB/TVDB IDs
3. Provider cache tables are empty (movies never enriched)

**Solution**: Scan library and enrich movies first

### Partial Data Migration
**Symptom**: Some entities migrated but not all

**Possible causes**:
1. Provider cache incomplete for some movies
2. Some movies never fully enriched
3. Provider data missing certain fields

**Solution**: Re-enrich affected movies

### Migration Errors
**Symptom**: "Related entities migration failed (non-fatal)" in logs

**Possible causes**:
1. Database constraint violation
2. Schema mismatch
3. Corrupted provider cache data

**Solution**: Check logs for specific error, fix data issue, re-run migration

## Future Enhancements

### Potential Additions
- **Tags/Keywords**: Migrate from `provider_cache_keywords`
- **Collections**: Migrate from `provider_cache_movie_collections`
- **Additional crew roles**: Producer, Composer, Cinematographer
- **Series support**: Extend to TV shows when implemented

### Maintenance
This migration will be updated as:
1. New related entity types are added to schema
2. Provider cache structure changes
3. Normalization requirements evolve

## Related Documentation

- [Database Schema](../architecture/DATABASE.md) - Complete schema documentation
- [Provider Cache](../architecture/PROVIDER_CACHE.md) - Provider cache system
- [Enrichment Phase](../phases/ENRICHMENT.md) - How provider data is fetched
- [Coding Standards](../development/CODING_STANDARDS.md) - Migration rules

## Migration Code Location

**File**: `src/database/migrations/20251015_001_clean_schema.ts`
**Lines**: 1987-2223
**Section**: "DATA MIGRATION: Populate Related Entities from Provider Cache"
