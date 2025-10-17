# Movies Page Refactor - Asset Indicators

## Problem

The Movies page asset indicators were using the **old architecture** where assets were referenced via FK columns in the movies table (`poster_id`, `fanart_id`, etc.).

The **new unified file system** stores all files in separate tables:
- `image_files` - All images
- `video_files` - Trailers, samples, extras
- `text_files` - NFO files, subtitles
- `audio_files` - Theme songs

The old query was returning **incorrect counts** (mostly zeros) because it was checking FK columns that no longer represent the current file system architecture.

## Solution

Updated the `MovieService.getAll()` query to **COUNT files directly from the unified file system tables**.

### Old Query (Incorrect)
```sql
-- Checked FK columns (wrong approach)
CASE WHEN m.poster_id IS NOT NULL THEN 1 ELSE 0 END as poster_count,
CASE WHEN m.fanart_id IS NOT NULL THEN 1 ELSE 0 END as fanart_count,
0 as landscape_count,  -- Hardcoded zeros!
0 as keyart_count,
-- etc.
```

### New Query (Correct)
```sql
-- Count actual files from unified file system tables
COUNT(DISTINCT CASE WHEN img.image_type = 'poster' THEN img.id END) as poster_count,
COUNT(DISTINCT CASE WHEN img.image_type = 'fanart' THEN img.id END) as fanart_count,
COUNT(DISTINCT CASE WHEN img.image_type = 'landscape' THEN img.id END) as landscape_count,
COUNT(DISTINCT CASE WHEN img.image_type = 'keyart' THEN img.id END) as keyart_count,
COUNT(DISTINCT CASE WHEN img.image_type = 'banner' THEN img.id END) as banner_count,
COUNT(DISTINCT CASE WHEN img.image_type = 'clearart' THEN img.id END) as clearart_count,
COUNT(DISTINCT CASE WHEN img.image_type = 'clearlogo' THEN img.id END) as clearlogo_count,
COUNT(DISTINCT CASE WHEN img.image_type = 'discart' THEN img.id END) as discart_count,
COUNT(DISTINCT CASE WHEN vid.video_type = 'trailer' THEN vid.id END) as trailer_count,
COUNT(DISTINCT CASE WHEN txt.text_type = 'subtitle' THEN txt.id END) as subtitle_count,
COUNT(DISTINCT CASE WHEN aud.audio_type = 'theme' THEN aud.id END) as theme_count
```

### JOINs Added
```sql
-- Asset counts from unified file system
LEFT JOIN image_files img ON img.entity_type = 'movie' AND img.entity_id = m.id
LEFT JOIN video_files vid ON vid.entity_type = 'movie' AND vid.entity_id = m.id
LEFT JOIN text_files txt ON txt.entity_type = 'movie' AND txt.entity_id = m.id
LEFT JOIN text_files nfo ON nfo.entity_type = 'movie' AND nfo.entity_id = m.id AND nfo.text_type = 'nfo'
LEFT JOIN audio_files aud ON aud.entity_type = 'movie' AND aud.entity_id = m.id
```

### NFO Status Fix
Also added `MAX(nfo.discovered_at) as nfo_parsed_at` to properly calculate NFO status indicators.

## Asset Indicators

Each indicator shows:
- **Grey (none)**: No files of this type
- **Orange (partial)**: Some files but below threshold
- **Green (complete)**: Meets or exceeds threshold

### Thresholds
- **Poster**: 1 (green when >= 1)
- **Fanart**: 5 (green when >= 5, allows multiple backgrounds)
- **All others**: 1 (green when >= 1)

### Indicator Icons
- **NFO**: `faFile` - Shows status based on parsed timestamp and completeness
- **Poster**: `faImage`
- **Fanart**: `faImages` (plural) - Shows count badge when > 1
- **Landscape**: `faImages`
- **Key Art**: `faSquare`
- **Banner**: `faFlag`
- **Clear Art**: `faCircle`
- **Clear Logo**: `faCircle`
- **Disc Art**: `faCompactDisc`
- **Trailer**: `faPlay` - Shows count badge when > 1
- **Subtitles**: `faClosedCaptioning` - Shows count badge when > 1
- **Theme Song**: `faMusic`

## Files Modified

1. **src/services/movieService.ts** (lines 95-157)
   - Updated `getAll()` query to count from unified file tables
   - Added JOINs for image_files, video_files, text_files, audio_files
   - Added NFO discovered_at for status calculation

## Frontend Components (No Changes Needed)

The frontend components already support the correct data structure:
- **MovieRow.tsx**: Displays indicators using `movie.assetCounts` and `movie.assetStatuses`
- **AssetIndicator.tsx**: Renders colored icons based on status
- **Movies.tsx**: Fetches data using `useMovies()` hook

No frontend changes were needed because the API contract (`assetCounts` and `assetStatuses` objects) remained the same. Only the backend data source changed from FK columns to file table counts.

## Testing

After server restart:

1. **Verify asset counts are accurate**
   - Check movies with posters show green poster indicator
   - Check movies with multiple fanart show count badge
   - Check movies with trailers show green trailer indicator

2. **Verify indicators change color correctly**
   - Grey: No assets
   - Orange: Partial (fanart count > 0 and < 5)
   - Green: Complete (meets threshold)

3. **Check SQL query performance**
   - Monitor query execution time with 1000+ movies
   - Verify indexes on entity_type, entity_id columns

## Performance Considerations

The query now performs:
- 5 LEFT JOINs (was 6 before)
- Multiple CASE aggregations (COUNT DISTINCT)
- GROUP BY on movie ID

**Optimization opportunities** (if needed later):
- Denormalize asset counts into movies table (update on asset changes)
- Create materialized view for faster queries
- Add composite indexes on (entity_type, entity_id, image_type) etc.

For now, the query should perform well for libraries up to 10k movies. Real-world usage will determine if caching is needed.

## Benefits

✅ **Accurate counts** - Shows actual files in unified file system
✅ **All asset types** - No more hardcoded zeros
✅ **Future proof** - Works with content-addressed caching
✅ **Maintainable** - Single source of truth (file tables)
