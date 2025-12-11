# Caching (Enrichment Step 3)

Move final selections from temp directory to protected cache with content-addressed storage.

## Purpose

After [Downloading](./DOWNLOADING.md) produces unique assets in temp, caching:

1. Computes SHA256 hash of each file
2. Moves to cache directory using content-addressed path
3. Updates `cache_image_files` table with metadata
4. Cleans up temp directory

---

## Process Flow

```
For each selected asset in temp directory:
    │
    ├──► HASH the file
    │         └──► SHA256 of file contents
    │
    ├──► CHECK if already in cache
    │         ├──► Exists → Skip copy, reuse existing
    │         └──► New → Continue
    │
    ├──► MOVE to cache directory
    │         └──► Path: /data/cache/images/{hash[0:2]}/{hash}.{ext}
    │
    └──► RECORD in cache_image_files table

After all assets processed:
    └──► DELETE temp directory
```

---

## Content-Addressed Storage

### Why Content-Addressed?

Same image = same hash = same file, regardless of:
- Which movie it's for
- Which provider it came from
- When it was downloaded

Benefits:
- **Deduplication:** Same poster for different releases stored once
- **Integrity:** Hash verifies file not corrupted
- **Recovery:** Can rebuild from cache if library deleted

### Directory Structure

```
/data/cache/
├── images/
│   ├── 0a/
│   │   ├── 0a1b2c3d...{64 chars}.jpg
│   │   └── 0a9f8e7d...{64 chars}.png
│   ├── 0b/
│   │   └── ...
│   └── ff/
│       └── ...
├── videos/
│   └── {same structure}
└── audio/
    └── {same structure}
```

First two characters of hash = subdirectory (256 possible directories).

### File Path Formula

```
cache_path = /data/cache/{type}/{hash[0:2]}/{hash}.{ext}

Example:
  hash = "0a1b2c3d4e5f6789..."
  ext = "jpg"
  type = "images"

  path = /data/cache/images/0a/0a1b2c3d4e5f6789...{64 chars}.jpg
```

---

## Duplicate Handling

If hash already exists in cache:

```
New asset with hash 0x1234...
    │
    ├──► Check: /data/cache/images/12/1234...jpg exists?
    │
    ├──► YES: File already cached
    │         └──► Skip copy
    │         └──► Still create cache_image_files record (links to existing file)
    │
    └──► NO: New file
              └──► Move from temp to cache
              └──► Create cache_image_files record
```

This handles:
- Same image from different providers
- Re-enrichment of same movie
- Shared assets across movies (rare but possible)

---

## Database: cache_image_files

Each cached asset gets a record:

```sql
cache_image_files (
  id INTEGER PRIMARY KEY,
  entity_type TEXT,           -- 'movie', 'episode', etc.
  entity_id INTEGER,          -- FK to movies, episodes, etc.
  asset_type TEXT,            -- 'poster', 'fanart', 'logo', etc.

  -- Cache location
  cache_path TEXT,            -- Full path in cache directory
  content_hash TEXT,          -- SHA256 hash

  -- Metadata
  width INTEGER,
  height INTEGER,
  file_size INTEGER,
  mime_type TEXT,

  -- Hashes for dedup
  perceptual_hash TEXT,       -- pHash from downloading step
  difference_hash TEXT,       -- Optional dHash

  -- Selection state
  is_selected BOOLEAN,
  selected_at TIMESTAMP,
  selected_by TEXT,           -- 'auto' or 'user'

  -- Timestamps
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
```

---

## Relationship to Provider Assets

```
provider_assets (URLs from providers)
    │
    │ Download + Selection
    ↓
cache_image_files (files in cache)
    │
    │ Publish
    ↓
library_image_files (copies in media folder)
```

- `provider_assets`: Candidates (URLs only)
- `cache_image_files`: Selected and downloaded (files exist)
- `library_image_files`: Published to library (working copies)

---

## Cache Integrity

### Verification

Periodically verify cache integrity:

```
For each cache_image_files record:
    1. Check file exists at cache_path
    2. Verify hash matches content_hash
    3. If mismatch → Mark for re-download
```

### Recovery

If cache file missing but record exists:
- Re-download from original provider URL (stored in provider_assets)
- Or flag for user attention if URL no longer valid

---

## Storage Management

### Size Tracking

Track cache size for monitoring:

```sql
SELECT
  entity_type,
  asset_type,
  COUNT(*) as file_count,
  SUM(file_size) as total_bytes
FROM cache_image_files
GROUP BY entity_type, asset_type;
```

### Cleanup

Cache is protected by default. Cleanup only via:
- User explicitly deletes movie (cascade)
- Admin purge of orphaned files
- Never automatic pruning

---

## Output

After caching completes:

- All selected assets in `/data/cache/`
- `cache_image_files` records created
- Temp directory cleaned up
- Ready for [Recording](./RECORDING.md)

---

## Implementation

Caching is integrated into the asset selection process. For implementation details:
→ [Movies: 03-ASSET-SELECTION.md](../../implementation/Movies/03-ASSET-SELECTION.md)

## Related Documentation

- [Downloading](./DOWNLOADING.md) - Previous step (provides temp files)
- [Recording](./RECORDING.md) - Next step (database updates)
- [Asset Management](../architecture/ASSET_MANAGEMENT/) - Full asset system
