# Schema Fixes Complete - 2025-10-17

## Problem
Code was querying database columns that didn't exist, causing scanner errors:
- `movies.clearlogo_id` - SQLITE_ERROR: no such column
- `unknown_files.category` - SQLITE_ERROR: no such column
- `audio_files.sample_rate` - SQLITE_ERROR: no such column
- `audio_files.channels` - SQLITE_ERROR: no such column
- `audio_files.language` - SQLITE_ERROR: no such column

## Solution
Updated the base migration schema to include all missing columns **directly in the initial table creation**.

### Movies Table
Added columns:
- `clearlogo_id INTEGER` - FK to image_files for clearlogo assets
- `clearlogo_locked BOOLEAN DEFAULT 0` - Field lock for clearlogo

Added FK constraint:
- `FOREIGN KEY (clearlogo_id) REFERENCES image_files(id)`

### Audio Files Table
Added columns:
- `sample_rate INTEGER` - Audio sample rate
- `channels INTEGER` - Number of audio channels
- `language TEXT` - Audio language

### Unknown Files Table
Added columns:
- `category TEXT CHECK(category IN ('video', 'image', 'archive', 'text', 'other'))` - File categorization

Added index:
- `CREATE INDEX idx_unknown_files_category ON unknown_files(category)`

## Why This Approach?

### Development Workflow
- Database file is **deleted on every backend restart**
- Only ONE migration exists during development
- All schema changes go directly into base migration
- No incremental migrations needed until production

### Clean Code
- ❌ No string mappings like `assetType === 'clearlogo' ? 'logo_id' : '${assetType}_id'`
- ✅ Direct column names: `${assetType}_id` just works
- ✅ Schema matches code expectations
- ✅ Single source of truth

## Files Modified

1. **src/database/migrations/20251015_001_clean_schema.ts**
   - Lines 345, 357, 374: Added `clearlogo_id` and `clearlogo_locked` to movies table
   - Lines 240-242: Added `sample_rate`, `channels`, `language` to audio_files table
   - Line 306, 313: Added `category` column and index to unknown_files table

2. **src/services/media/assetDiscovery_unified.ts**
   - Line 179: Removed string mapping, now uses simple `${assetType}_id`

3. **src/services/media/unknownFilesDetection.ts**
   - Lines 220-271: Updated queries to use unified file system tables instead of cache_assets

## Testing

After server restart (which recreates database):
1. Scanner should run without errors
2. Clearlogo files should be properly stored
3. Unknown files should be categorized
4. Audio metadata should be captured

Check logs:
```bash
powershell -Command "Get-Content logs/error.log -Tail 50"
```

Should see NO errors related to:
- `no such column: clearlogo_id`
- `no such column: category`
- `no such column: sample_rate`

## Lesson Learned

**String mappings are code smells** - when you need special cases in code to match database columns, fix the database schema instead. During development with database deletion on restart, this is trivial - just update the base migration.

The correct flow is:
1. Code expects column → Add column to schema
2. NOT: Code can't find column → Add string mapping hack
