# Publishing Phase

**Purpose**: Deploy selected assets from cache to library directories, creating the ideal presentation for media player scanners.

**Status**: Design complete, implementation pending

## Overview

The publishing phase is responsible for materializing Metarr's curated metadata and assets into the library filesystem. It ensures media players see a perfectly organized, Kodi-compliant structure with all selected assets in place.

## Phase Rules

1. **Idempotent**: Re-publishing repairs/updates without duplication
2. **Transactional**: All-or-nothing per media item
3. **Recoverable**: Deleted files go to recycle bin
4. **Atomic**: Uses temp files + rename for safety
5. **Observable**: Reports per-file and overall progress

## Triggers

- **Post-enrichment**: After selection changes (if auto-publish)
- **Manual**: User clicks "Publish" button
- **Verification**: Repair missing/changed files
- **Bulk**: User publishes multiple items
- **Webhook**: After upgrade/rename operations

## Process Flow

```
1. CHANGE DETECTION
   ├── Compare cache vs library state
   ├── Identify missing files
   ├── Detect outdated assets
   └── Build publish queue

2. RECYCLE BIN CLEANUP
   ├── Move unwanted files to recycle
   ├── Remove old versions
   ├── Clean extra/duplicate assets
   └── Preserve user-added files (if configured)

3. ASSET DEPLOYMENT
   ├── Copy from cache to temp location
   ├── Apply Kodi naming convention
   ├── Atomic rename to final location
   └── Set file permissions

4. NFO GENERATION
   ├── Combine all metadata
   ├── Include stream information
   ├── Add asset references
   └── Write with proper encoding

5. NEXT PHASE TRIGGER
   └── Create player sync job (if configured)
```

## File Organization

### Kodi Naming Convention

```
/media/movies/The Matrix (1999)/
├── The Matrix (1999).mkv           # Media file
├── The Matrix (1999)-poster.jpg    # Main poster
├── The Matrix (1999)-fanart.jpg    # Background art
├── The Matrix (1999)-logo.png      # Clear logo
├── The Matrix (1999)-disc.png      # Disc art
├── The Matrix (1999)-trailer.mp4   # Trailer
├── The Matrix (1999).nfo           # Metadata
├── The Matrix (1999).en.srt        # English subtitles
└── extrafanart/                    # Additional fanart
    ├── fanart1.jpg
    └── fanart2.jpg
```

### TV Show Structure

```
/media/tv/Breaking Bad/
├── poster.jpg                      # Series poster
├── fanart.jpg                      # Series fanart
├── logo.png                        # Series logo
├── tvshow.nfo                      # Series metadata
└── Season 01/
    ├── season01-poster.jpg         # Season poster
    └── Breaking Bad S01E01.mkv     # Episode file
```

## Transactional Publishing

```typescript
async function publishMovie(movieId: number): Promise<void> {
  const transaction = await db.beginTransaction();

  try {
    const movie = await db.movies.findById(movieId);
    const tempDir = `/tmp/publish_${movieId}`;

    // Stage 1: Prepare all files in temp
    await fs.mkdir(tempDir, { recursive: true });

    // Copy assets with proper naming
    if (movie.poster_id) {
      const poster = await db.cache_assets.findById(movie.poster_id);
      const posterName = `${movie.title} (${movie.year})-poster.jpg`;
      await fs.copyFile(poster.file_path, `${tempDir}/${posterName}`);
    }

    // Generate NFO
    const nfoContent = generateNFO(movie);
    const nfoName = `${movie.title} (${movie.year}).nfo`;
    await fs.writeFile(`${tempDir}/${nfoName}`, nfoContent);

    // Stage 2: Clean existing directory
    const recycleBin = `/data/recycle/${Date.now()}_${movieId}`;
    const existingAssets = await findExistingAssets(movie.library_path);

    for (const asset of existingAssets) {
      if (shouldRecycle(asset)) {
        await fs.move(asset.path, `${recycleBin}/${asset.name}`);
      }
    }

    // Stage 3: Atomic deployment
    const files = await fs.readdir(tempDir);
    for (const file of files) {
      const source = `${tempDir}/${file}`;
      const target = `${movie.library_path}/${file}`;

      // Copy to .tmp first, then rename (atomic)
      await fs.copyFile(source, `${target}.tmp`);
      await fs.rename(`${target}.tmp`, target);
    }

    // Stage 4: Update database
    await db.movies.update(movieId, {
      publish_status: 'published',
      last_published: new Date()
    });

    await transaction.commit();

    // Cleanup temp directory
    await fs.rm(tempDir, { recursive: true });

  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
```

## Recycle Bin Management

```typescript
interface RecycleConfig {
  enabled: boolean;           // Use recycle bin (true)
  retention: number;          // Days to keep files (30)
  maxSize: number;           // Max size in GB (10)
  preserveUserFiles: boolean; // Keep non-Metarr files
}

async function recycleFile(filePath: string): Promise<void> {
  const recycleDir = `/data/recycle/${Date.now()}`;
  const fileName = path.basename(filePath);

  // Create recycle entry
  await db.recycle_bin.create({
    original_path: filePath,
    recycle_path: `${recycleDir}/${fileName}`,
    deleted_at: new Date(),
    expires_at: addDays(new Date(), config.retention)
  });

  // Move file
  await fs.mkdir(recycleDir, { recursive: true });
  await fs.move(filePath, `${recycleDir}/${fileName}`);
}

// Cleanup expired items
async function cleanupRecycleBin(): Promise<void> {
  const expired = await db.recycle_bin.findExpired();

  for (const item of expired) {
    await fs.rm(item.recycle_path);
    await db.recycle_bin.delete(item.id);
  }
}
```

## NFO Generation

```typescript
function generateNFO(movie: Movie): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<movie>
  <title>${escapeXml(movie.title)}</title>
  <originaltitle>${escapeXml(movie.original_title)}</originaltitle>
  <sorttitle>${escapeXml(movie.sort_title)}</sorttitle>
  <rating>${movie.rating}</rating>
  <year>${movie.year}</year>
  <plot>${escapeXml(movie.plot)}</plot>
  <runtime>${movie.runtime}</runtime>
  <mpaa>${movie.mpaa_rating}</mpaa>
  <premiered>${movie.release_date}</premiered>

  <!-- IDs for scraper compatibility -->
  <uniqueid type="tmdb" default="true">${movie.tmdb_id}</uniqueid>
  <uniqueid type="imdb">${movie.imdb_id}</uniqueid>

  <!-- Actors -->
  ${movie.actors.map(actor => `
  <actor>
    <name>${escapeXml(actor.name)}</name>
    <role>${escapeXml(actor.character)}</role>
    <thumb>${actor.image_url}</thumb>
  </actor>`).join('')}

  <!-- Directors -->
  ${movie.directors.map(director => `
  <director>${escapeXml(director.name)}</director>`).join('')}

  <!-- Genres -->
  ${movie.genres.map(genre => `
  <genre>${escapeXml(genre)}</genre>`).join('')}

  <!-- File info -->
  <fileinfo>
    <streamdetails>
      ${generateStreamDetails(movie.streams)}
    </streamdetails>
  </fileinfo>

  <!-- Assets -->
  <thumb aspect="poster">${movie.title} (${movie.year})-poster.jpg</thumb>
  <fanart>${movie.title} (${movie.year})-fanart.jpg</fanart>
</movie>`;
}
```

## Configuration

```typescript
interface PublishingConfig {
  // Behavior
  autoPublish: boolean;         // Publish after enrichment
  cleanUnknown: boolean;        // Remove unrecognized files
  preserveUserFiles: boolean;   // Keep manual additions

  // Naming
  useKodiNaming: boolean;       // Apply Kodi conventions
  includeSubs: boolean;         // Copy subtitle files
  includeTrailers: boolean;     // Copy trailers

  // Performance
  atomicWrites: boolean;        // Use temp+rename (safer)
  concurrentItems: number;      // Parallel publishing (3)

  // Recycle bin
  recycleBin: RecycleConfig;
}
```

## Error Handling

- **Permission denied**: Queue for retry with elevation
- **Disk full**: Pause publishing, alert user
- **Source missing**: Restore from cache or flag
- **Write failed**: Rollback transaction, keep temp files
- **NFO invalid**: Log error, skip NFO generation

## Performance Considerations

- **Large files**: Stream copy instead of loading to memory
- **Network drives**: Increase timeouts, reduce parallelism
- **Atomic writes**: Use .tmp suffix + rename for safety
- **Batch operations**: Process multiple files per transaction

## Validation

```typescript
async function validatePublishing(movie: Movie): Promise<ValidationResult> {
  const errors = [];
  const warnings = [];

  // Check cache assets exist
  if (movie.poster_id) {
    const poster = await db.cache_assets.findById(movie.poster_id);
    if (!await fs.exists(poster.file_path)) {
      errors.push('Poster missing from cache');
    }
  }

  // Check library directory writable
  try {
    await fs.access(movie.library_path, fs.constants.W_OK);
  } catch {
    errors.push('Library directory not writable');
  }

  // Check disk space
  const stats = await fs.statfs(movie.library_path);
  if (stats.available < 100 * 1024 * 1024) { // 100MB
    warnings.push('Low disk space');
  }

  return { errors, warnings };
}
```

## Related Documentation

- [NFO_PARSING.md](../technical/NFO_PARSING.md) - NFO format details
- [Database Schema](../DATABASE.md) - Cache assets and recycle bin
- [API Architecture](../API.md) - Publishing endpoints
- [UI Standards](../UI_STANDARDS.md) - Progress UI components

## Next Phase

Upon completion, publishing triggers the [Player Sync Phase](PLAYER_SYNC.md) to notify media players of changes.