# Content-Addressed Storage

**Purpose**: Explain SHA256-based content addressing, sharding structure, and deduplication benefits.

**Related Docs**:
- Parent: [Asset Management](README.md)
- Two-Copy System: [TWO_COPY_SYSTEM.md](TWO_COPY_SYSTEM.md)
- Database: [Cache Image Files](../DATABASE.md#cache-image-files-protected-storage)

## Quick Reference

- **Hash Algorithm**: SHA256 of file content
- **Sharding**: First 2 chars / next 2 chars / full hash
- **Path Example**: `/data/cache/assets/ab/c1/abc123def456...jpg`
- **Benefit**: Automatic deduplication, content verification, organized storage

## What is Content Addressing?

Content addressing is a storage technique where files are named and organized by their content hash rather than arbitrary filenames. This provides several critical benefits:

1. **Deduplication**: Identical files automatically share storage (same content = same hash)
2. **Integrity**: File content can be verified against its hash
3. **Provider Independence**: Same image from different providers uses single copy
4. **Immutability**: Content cannot change without changing the hash

## Hash Algorithm: SHA256

Metarr uses SHA256 (Secure Hash Algorithm 256-bit) to generate content hashes.

### Why SHA256?

- **Collision Resistance**: Virtually impossible for two different files to have the same hash
- **Fixed Length**: Always 64 hexadecimal characters (256 bits)
- **Fast**: Efficient computation for image files
- **Standard**: Widely supported across platforms

### Example

```
File: poster.jpg (500 KB)
Content: [binary image data]
SHA256: a3b4c5d6e7f8901234567890abcdef1234567890abcdef1234567890abcdef12
```

## Sharding Structure

Storing millions of files in a single directory is inefficient. Metarr uses **sharding** to organize files into subdirectories.

### Sharding Pattern

```
First 2 characters → Second 2 characters → Full hash
```

### Example

```
SHA256: abc123def456789...
Sharding: ab/c1/abc123def456789...jpg

Full path:
/data/cache/assets/ab/c1/abc123def456789...jpg
```

### Why This Sharding Pattern?

**Advantages**:
- **Balanced Distribution**: First 2 chars (256 combinations) × second 2 chars (256 combinations) = 65,536 possible directories
- **Prevents Large Directories**: Each directory contains manageable number of files
- **File System Friendly**: Most file systems perform poorly with >10,000 files per directory
- **Simple Algorithm**: Easy to implement and debug

**Directory Distribution**:
- With 10,000 images: ~0.15 files per directory on average
- With 100,000 images: ~1.5 files per directory on average
- With 1,000,000 images: ~15 files per directory on average

## Storage Structure

### Cache Directory Layout

```
/data/cache/
├── assets/              # Media assets (posters, fanart, etc.)
│   ├── ab/
│   │   ├── c1/
│   │   │   ├── abc123...jpg
│   │   │   └── abc456...png
│   │   └── c2/
│   │       └── abc234...jpg
│   └── ff/
│       └── ee/
│           └── ffee99...jpg
└── actors/              # Actor images (separate namespace)
    ├── ab/
    │   └── c1/
    │       └── abc789...jpg
    └── de/
        └── f0/
            └── def012...jpg
```

**Note**: `assets/` and `actors/` are separate namespaces to logically separate media assets from people.

## Deduplication Benefits

Content addressing provides automatic deduplication without additional logic.

### Scenario 1: Same Asset from Multiple Providers

```
TMDB provides poster: https://image.tmdb.org/poster.jpg
Fanart.tv provides same poster: https://assets.fanart.tv/movies/12345/poster.jpg

Both download to same file:
/data/cache/assets/ab/c1/abc123...jpg
```

**Result**: Single copy in cache, both `asset_candidates` records point to same `cache_file_id`

### Scenario 2: Same Asset Across Multiple Movies

```
Collection poster used for multiple movies in a franchise

Movie A selects poster → abc123...jpg
Movie B selects same poster → abc123...jpg
```

**Result**: Single copy serves both movies, space saved

### Scenario 3: Re-enrichment

```
Movie enriched → poster abc123...jpg cached
User deletes movie
Movie re-added and enriched → poster abc123...jpg already exists
```

**Result**: No re-download needed, instant cache hit

## Implementation Details

### Hash Calculation Process

```typescript
import crypto from 'crypto';
import fs from 'fs';

function calculateSHA256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}
```

### Path Generation

```typescript
function getCachePath(hash: string, extension: string): string {
  const shard1 = hash.substring(0, 2);  // First 2 chars
  const shard2 = hash.substring(2, 4);  // Next 2 chars

  return `/data/cache/assets/${shard1}/${shard2}/${hash}.${extension}`;
}

// Example:
// hash: "abc123def456..."
// extension: "jpg"
// result: "/data/cache/assets/ab/c1/abc123def456...jpg"
```

### Storage Workflow

```
1. Download image from provider
2. Save to temporary location
3. Calculate SHA256 hash
4. Check if hash exists in cache_image_files table
5. If exists:
   - Delete temporary file
   - Return existing cache_file_id
6. If new:
   - Create shard directories if needed
   - Move temporary file to content-addressed path
   - Create cache_image_files record
   - Return new cache_file_id
```

## Database Integration

Content addressing integrates with the database to track file metadata.

### cache_image_files Table

```sql
CREATE TABLE cache_image_files (
  id INTEGER PRIMARY KEY,
  file_path TEXT UNIQUE NOT NULL,     -- Content-addressed path
  file_hash TEXT NOT NULL,            -- SHA256 hash
  file_size INTEGER NOT NULL,
  -- ... other metadata
);

CREATE INDEX idx_cache_images_hash ON cache_image_files(file_hash);
```

### Deduplication Query

```sql
-- Check if hash already exists before storing
SELECT id, file_path
FROM cache_image_files
WHERE file_hash = 'abc123def456...';
```

If found: Reuse existing file
If not found: Store new file

## Content Verification

Content addressing enables integrity verification.

### Verify File Integrity

```typescript
async function verifyCacheFile(cacheFile: CacheImageFile): Promise<boolean> {
  const actualHash = await calculateSHA256(cacheFile.file_path);
  return actualHash === cacheFile.file_hash;
}
```

**Use Cases**:
- Detect file corruption
- Verify cache consistency
- Ensure upload integrity

### Verification Phase Integration

The [Verification Phase](../../concepts/Verification/README.md) uses content verification to ensure cache integrity:
- Recalculate hash for cached files
- Compare against stored hash
- Report corruption or missing files

## Performance Considerations

### Hash Calculation Speed

- **Small images** (< 1 MB): ~10ms
- **Large images** (5-10 MB): ~50-100ms
- **Minimal overhead** compared to download time

### Disk I/O

- **Sequential reads**: Efficient for hash calculation
- **Sharding**: Reduces directory traversal time
- **Caching**: File system caches frequently accessed directories

### Deduplication Impact

- **Storage savings**: Varies by library (5-20% typical)
- **Download savings**: Significant for re-enrichment scenarios
- **Database lookups**: Indexed hash queries are fast (~1ms)

## Comparison to Alternative Approaches

### Named Files (Not Used)

```
/data/cache/assets/Movie (2024)/poster.jpg
/data/cache/assets/Movie (2024)/fanart.jpg
```

**Problems**:
- No deduplication
- File renaming complexity
- Cleanup complexity
- Path conflicts

### UUID-based (Not Used)

```
/data/cache/assets/550e8400-e29b-41d4-a716-446655440000.jpg
```

**Problems**:
- No content verification
- No automatic deduplication
- Still requires sharding
- UUID generation overhead

### Content Addressing (Used)

```
/data/cache/assets/ab/c1/abc123def456...jpg
```

**Advantages**:
- Automatic deduplication
- Content verification
- Simple cleanup (orphaned files)
- Provider-independent

## Cleanup and Maintenance

Content addressing simplifies cache cleanup.

### Orphan Detection

Files not referenced by any `cache_image_files` record can be safely deleted:

```sql
-- Find cache files in database
SELECT file_path FROM cache_image_files;

-- Compare against file system
-- Delete files not in database
```

### Safe Deletion

Before deleting cached files:
1. Check no `library_image_files` reference cache file
2. Check no `asset_candidates` reference cache file
3. Move to recycle bin (30-day retention)
4. Permanently delete after retention period

See [Verification Phase](../../concepts/Verification/README.md) for cleanup procedures.

## See Also

- [Asset Management Overview](README.md) - Three-tier architecture
- [Two-Copy System](TWO_COPY_SYSTEM.md) - Cache vs library storage
- [Database Schema](../DATABASE.md) - Cache table structures
- [Verification Phase](../../concepts/Verification/README.md) - Cache integrity checks
