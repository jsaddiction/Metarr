# Publishing Workflow

**Related Docs**: [ARCHITECTURE.md](ARCHITECTURE.md), [ASSET_MANAGEMENT.md](ASSET_MANAGEMENT.md), [AUTOMATION_AND_WEBHOOKS.md](AUTOMATION_AND_WEBHOOKS.md), [WORKFLOWS.md](WORKFLOWS.md)

This document describes the publishing workflow, including dirty state management, transactional publishing, and player notification.

---

## Overview

Publishing is the process of writing database state to the library filesystem and notifying media players to scan for changes.

```
┌─────────────────────────────────────────────────────────────┐
│                    PUBLISHING PIPELINE                       │
└─────────────────────────────────────────────────────────────┘

DATABASE STATE (Source of Truth)
  │
  │ - Movie metadata (plot, genres, actors, etc.)
  │ - Selected assets (references to cache files)
  │ - Stream details (from FFprobe)
  ↓
GENERATE NFO
  │
  │ - Build Kodi-format XML from database
  │ - Include <fileinfo><streamdetails>
  │ - Calculate SHA256 hash
  ↓
COPY ASSETS
  │
  │ - Copy selected assets from cache → library
  │ - Apply Kodi naming conventions
  │ - Atomic file operations (temp → final)
  ↓
UPDATE DATABASE
  │
  │ - Mark has_unpublished_changes = 0
  │ - Store published_nfo_hash
  │ - Record last_published_at
  ↓
NOTIFY PLAYERS
  │
  │ - Trigger Kodi VideoLibrary.Scan
  │ - Trigger Jellyfin /Library/Refresh
  │ - Async, non-blocking
```

---

## Dirty State Management

### Purpose

Track which items have unpublished changes, allow user to review before publishing.

### Database Tracking

```sql
ALTER TABLE movies ADD COLUMN has_unpublished_changes BOOLEAN DEFAULT 0;
ALTER TABLE movies ADD COLUMN last_published_at TIMESTAMP;
ALTER TABLE movies ADD COLUMN published_nfo_hash TEXT;

-- Same for series, episodes
```

### When Items Become "Dirty"

| Action | Result |
|--------|--------|
| User manually edits any field | `has_unpublished_changes = 1` |
| User selects/replaces asset | `has_unpublished_changes = 1` |
| Auto-selection completes (hybrid mode) | `has_unpublished_changes = 1` |
| Enrichment updates unlocked fields | `has_unpublished_changes = 1` |
| Publishing completes | `has_unpublished_changes = 0` |

### Query Patterns

```sql
-- Get all items needing publish
SELECT * FROM movies
WHERE has_unpublished_changes = 1
ORDER BY updated_at DESC;

-- Get count of unpublished items
SELECT COUNT(*) FROM movies
WHERE has_unpublished_changes = 1;

-- Get unpublished items for specific library
SELECT m.*
FROM movies m
JOIN libraries l ON m.file_path LIKE l.path || '%'
WHERE m.has_unpublished_changes = 1
  AND l.id = ?;
```

### UI Indicators

```typescript
// Badge showing unpublished count
function UnpublishedBadge() {
  const { data } = useQuery(['unpublished', 'count'], async () => {
    const res = await fetch('/api/movies/unpublished/count');
    return res.json();
  });

  if (data?.count === 0) return null;

  return (
    <span className="badge badge-warning">
      {data.count} Unpublished
    </span>
  );
}

// Item-level indicator
function MovieRow({ movie }: { movie: Movie }) {
  return (
    <tr className={movie.has_unpublished_changes ? 'bg-yellow-50' : ''}>
      <td>{movie.title}</td>
      <td>
        {movie.has_unpublished_changes && (
          <span className="text-orange-600">⚠️ Unpublished</span>
        )}
      </td>
    </tr>
  );
}
```

---

## Single Item Publishing

### API Endpoint

```typescript
POST /api/movies/:id/publish
POST /api/series/:id/publish
POST /api/episodes/:id/publish

Request Body: {
  force?: boolean  // Republish even if no changes
}

Response: {
  success: boolean,
  nfo_hash: string,
  assets_count: number,
  error?: string
}
```

### Implementation

```typescript
class PublishService {
  async publishEntity(
    entityType: string,
    entityId: number,
    options: PublishOptions = {}
  ): Promise<PublishResult> {
    const transaction = db.beginTransaction();
    const rollbackActions: Array<() => Promise<void>> = [];

    try {
      // 1. Load entity with all metadata
      const entity = await this.loadEntityWithMetadata(entityType, entityId);

      if (!entity.has_unpublished_changes && !options.force) {
        return { success: true, message: 'No changes to publish' };
      }

      // 2. Generate NFO content
      const nfoContent = await this.generateNFO(entity);
      const nfoHash = sha256(nfoContent);

      // 3. Get selected assets
      const selectedAssets = await db.query(`
        SELECT * FROM asset_candidates
        WHERE entity_type = ?
          AND entity_id = ?
          AND is_selected = 1
      `, [entityType, entityId]);

      // 4. Get library path
      const libraryPath = this.getLibraryPath(entity);
      await fs.ensureDir(libraryPath);

      // 5. Write NFO to temp location
      const tempNfoPath = path.join(os.tmpdir(), `metarr_publish_${entityId}.nfo`);
      await fs.writeFile(tempNfoPath, nfoContent);
      rollbackActions.push(() => fs.unlink(tempNfoPath));

      // 6. Copy assets to temp locations
      const tempAssets: Array<{ temp: string; final: string }> = [];

      for (const asset of selectedAssets) {
        const libraryFilename = this.getKodiFilename(
          asset.asset_type,
          tempAssets.filter(a => a.final.includes(asset.asset_type)).length
        );

        const tempAssetPath = path.join(
          os.tmpdir(),
          `metarr_asset_${entityId}_${asset.id}.jpg`
        );

        const finalAssetPath = path.join(libraryPath, libraryFilename);

        await fs.copyFile(asset.cache_path, tempAssetPath);
        rollbackActions.push(() => fs.unlink(tempAssetPath));

        tempAssets.push({ temp: tempAssetPath, final: finalAssetPath });
      }

      // 7. Atomic moves (temp → final)
      const finalNfoPath = path.join(libraryPath, this.getNFOFilename(entity));

      await fs.move(tempNfoPath, finalNfoPath, { overwrite: true });

      const publishedAssets: PublishedAsset[] = [];

      for (const { temp, final } of tempAssets) {
        await fs.move(temp, final, { overwrite: true });

        const asset = selectedAssets.find(a =>
          temp.includes(`_${a.id}.`)
        );

        publishedAssets.push({
          asset_type: asset.asset_type,
          cache_path: asset.cache_path,
          library_path: final,
          content_hash: asset.content_hash
        });
      }

      // 8. Update database (within transaction)
      await db.execute(`
        UPDATE ${entityType}s
        SET has_unpublished_changes = 0,
            last_published_at = CURRENT_TIMESTAMP,
            published_nfo_hash = ?,
            state = 'published'
        WHERE id = ?
      `, [nfoHash, entityId]);

      // 9. Log publication
      const logId = await db.execute(`
        INSERT INTO publish_log (
          entity_type,
          entity_id,
          nfo_hash,
          assets_published,
          published_by
        ) VALUES (?, ?, ?, ?, ?)
      `, [
        entityType,
        entityId,
        nfoHash,
        JSON.stringify(publishedAssets),
        options.publishedBy || 'user'
      ]);

      // 10. Commit transaction
      transaction.commit();

      // 11. Trigger player scans (async, non-blocking)
      this.notifyPlayersAsync(entityType, entityId, libraryPath);

      return {
        success: true,
        nfo_hash: nfoHash,
        assets_count: publishedAssets.length
      };

    } catch (error) {
      // Rollback filesystem changes
      for (const rollback of rollbackActions.reverse()) {
        try {
          await rollback();
        } catch (e) {
          console.error('Rollback failed:', e);
        }
      }

      // Rollback database
      transaction.rollback();

      // Log failure
      await db.execute(`
        INSERT INTO publish_log (
          entity_type,
          entity_id,
          nfo_hash,
          success,
          error_message
        ) VALUES (?, ?, NULL, 0, ?)
      `, [entityType, entityId, error.message]);

      return { success: false, error: error.message };
    }
  }

  private async loadEntityWithMetadata(
    entityType: string,
    entityId: number
  ): Promise<any> {
    // Load entity with joins (actors, genres, directors, etc.)
    const entity = await db.getEntity(entityType, entityId);

    // Load ratings
    entity.ratings = await db.query(`
      SELECT * FROM ratings
      WHERE entity_type = ? AND entity_id = ?
    `, [entityType, entityId]);

    // Load actors
    entity.actors = await db.query(`
      SELECT a.*, ma.role, ma.order_index
      FROM actors a
      JOIN ${entityType}s_actors ma ON a.id = ma.actor_id
      WHERE ma.${entityType.slice(0, -1)}_id = ?
      ORDER BY ma.order_index
    `, [entityId]);

    // Load genres, directors, studios, etc. (similar queries)

    // Load stream details
    entity.videoStream = await db.query(`
      SELECT * FROM video_streams
      WHERE entity_type = ? AND entity_id = ?
    `, [entityType, entityId]);

    entity.audioStreams = await db.query(`
      SELECT * FROM audio_streams
      WHERE entity_type = ? AND entity_id = ?
      ORDER BY stream_index
    `, [entityType, entityId]);

    entity.subtitleStreams = await db.query(`
      SELECT * FROM subtitle_streams
      WHERE entity_type = ? AND entity_id = ?
      ORDER BY stream_index
    `, [entityType, entityId]);

    return entity;
  }

  private getNFOFilename(entity: any): string {
    if (entity.entityType === 'movie') {
      return 'movie.nfo';
    } else if (entity.entityType === 'series') {
      return 'tvshow.nfo';
    } else if (entity.entityType === 'episode') {
      // Extract filename from video file
      const videoFilename = path.basename(entity.file_path, path.extname(entity.file_path));
      return `${videoFilename}.nfo`;
    }
  }

  private getKodiFilename(assetType: string, index: number): string {
    switch (assetType) {
      case 'poster':
        return 'poster.jpg';
      case 'fanart':
        return index === 0 ? 'fanart.jpg' : `fanart${index}.jpg`;
      case 'banner':
        return 'banner.jpg';
      case 'clearlogo':
        return 'clearlogo.png';
      case 'clearart':
        return 'clearart.png';
      case 'discart':
        return 'discart.png';
      default:
        return `${assetType}.jpg`;
    }
  }
}
```

---

## Bulk Publishing

### API Endpoint

```typescript
POST /api/movies/publish-bulk
POST /api/series/publish-bulk
POST /api/episodes/publish-bulk

Request Body: {
  ids: number[]  // Array of entity IDs
}

Response: {
  total: number,
  success: number,
  failed: number,
  results: Array<{
    id: number,
    success: boolean,
    error?: string
  }>
}
```

### Implementation

```typescript
async function publishBulk(
  entityType: string,
  entityIds: number[]
): Promise<BulkPublishResult> {
  const results: PublishResult[] = [];

  for (const entityId of entityIds) {
    const result = await publishService.publishEntity(entityType, entityId);

    results.push({
      id: entityId,
      ...result
    });

    // Emit progress event (SSE)
    eventEmitter.emit('publish:progress', {
      entityType,
      current: results.length,
      total: entityIds.length,
      entityId,
      success: result.success
    });

    // Small delay between publishes (avoid hammering filesystem)
    await sleep(100);
  }

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  return {
    total: entityIds.length,
    success: successCount,
    failed: failCount,
    results
  };
}
```

### UI Progress Display

```typescript
function BulkPublishModal({ entityIds }: { entityIds: number[] }) {
  const [progress, setProgress] = useState({
    current: 0,
    total: entityIds.length,
    results: []
  });

  useEffect(() => {
    const eventSource = new EventSource('/api/events');

    eventSource.addEventListener('publish:progress', (e) => {
      const data = JSON.parse(e.data);
      setProgress(prev => ({
        ...prev,
        current: data.current,
        results: [...prev.results, data]
      }));
    });

    return () => eventSource.close();
  }, []);

  return (
    <Modal>
      <h3>Publishing {progress.total} items...</h3>
      <ProgressBar value={(progress.current / progress.total) * 100} />
      <p>{progress.current} of {progress.total} published</p>

      <div className="results">
        {progress.results.map(result => (
          <div key={result.entityId} className={result.success ? 'text-green-600' : 'text-red-600'}>
            {result.success ? '✓' : '✗'} Item {result.entityId}
            {result.error && <span className="text-xs">: {result.error}</span>}
          </div>
        ))}
      </div>
    </Modal>
  );
}
```

---

## NFO Generation

### Purpose

Generate Kodi-format NFO XML from database state.

### Implementation

```typescript
class NFOGenerator {
  async generateNFO(entity: any): Promise<string> {
    const builder = new XMLBuilder({ format: true, ignoreAttributes: false });

    const nfo: any = {
      '?xml': { '@_version': '1.0', '@_encoding': 'UTF-8', '@_standalone': 'yes' }
    };

    if (entity.entityType === 'movie') {
      nfo.movie = this.buildMovieNFO(entity);
    } else if (entity.entityType === 'series') {
      nfo.tvshow = this.buildSeriesNFO(entity);
    } else if (entity.entityType === 'episode') {
      nfo.episodedetails = this.buildEpisodeNFO(entity);
    }

    return builder.build(nfo);
  }

  private buildMovieNFO(movie: any): any {
    return {
      title: movie.title,
      originaltitle: movie.original_title,
      sorttitle: movie.sort_title,
      year: movie.year,
      plot: movie.plot,
      outline: movie.outline,
      tagline: movie.tagline,
      runtime: movie.videoStream[0]?.duration_seconds / 60,  // Minutes
      mpaa: movie.mpaa,
      premiered: movie.premiered,
      userrating: movie.user_rating,

      // Set
      set: movie.set_name ? {
        name: movie.set_name,
        overview: movie.set_overview
      } : undefined,

      // IDs
      uniqueid: [
        { '@_type': 'tmdb', '@_default': 'true', '#text': movie.tmdb_id },
        { '@_type': 'imdb', '#text': movie.imdb_id }
      ].filter(id => id['#text']),

      // Ratings
      ratings: {
        rating: movie.ratings.map(r => ({
          '@_name': r.source,
          '@_max': r.source === 'imdb' ? '10' : '100',
          '@_default': r.is_default ? 'true' : 'false',
          value: r.value,
          votes: r.votes
        }))
      },

      // Actors
      actor: movie.actors.map(a => ({
        name: a.name,
        role: a.role,
        order: a.order_index,
        thumb: a.thumb_url
      })),

      // Genres
      genre: movie.genres.map(g => g.name),

      // Directors
      director: movie.directors.map(d => d.name),

      // Writers
      credits: movie.writers.map(w => w.name),

      // Studios
      studio: movie.studios.map(s => s.name),

      // Tags
      tag: movie.tags.map(t => t.name),

      // Countries
      country: movie.countries.map(c => c.name),

      // Stream details (from FFprobe, not NFO parse)
      fileinfo: this.buildFileInfo(movie)
    };
  }

  private buildFileInfo(entity: any): any {
    if (!entity.videoStream || entity.videoStream.length === 0) {
      return undefined;
    }

    const video = entity.videoStream[0];

    return {
      streamdetails: {
        video: {
          codec: video.codec,
          aspect: video.aspect_ratio,
          width: video.width,
          height: video.height,
          durationinseconds: video.duration_seconds,
          stereomode: undefined,  // Not currently tracked
          hdrtype: video.hdr_type
        },
        audio: entity.audioStreams.map(a => ({
          codec: a.codec,
          language: a.language,
          channels: a.channels
        })),
        subtitle: entity.subtitleStreams.map(s => ({
          language: s.language
        }))
      }
    };
  }
}
```

**Important**: See [NFO_PARSING.md](NFO_PARSING.md) for complete NFO format reference.

---

## Player Notification

### Purpose

Trigger media players to scan library and ingest new/updated metadata.

### Implementation

```typescript
class PlayerNotifier {
  async notifyPlayers(
    entityType: string,
    entityId: number,
    libraryPath: string
  ): Promise<void> {
    const players = await db.getEnabledMediaPlayers();

    for (const player of players) {
      try {
        // Translate path for this player
        const playerPath = await pathMapper.translatePath(
          player.id,
          libraryPath
        );

        // Trigger scan based on player type
        if (player.type === 'kodi') {
          await this.notifyKodi(player, playerPath);
        } else if (player.type === 'jellyfin') {
          await this.notifyJellyfin(player, playerPath);
        }

        // Log success
        await this.logNotification(
          entityType,
          entityId,
          player.id,
          true
        );

      } catch (error) {
        console.error(`Failed to notify player ${player.id}:`, error);

        // Log failure
        await this.logNotification(
          entityType,
          entityId,
          player.id,
          false,
          error.message
        );
      }
    }
  }

  private async notifyKodi(
    player: MediaPlayer,
    libraryPath: string
  ): Promise<void> {
    const kodi = new KodiClient({
      host: player.host,
      port: player.port,
      username: player.username,
      password: player.password
    });

    // Trigger scan on specific directory
    await kodi.request('VideoLibrary.Scan', {
      directory: libraryPath
    });

    console.log(`Triggered Kodi scan: ${libraryPath}`);
  }

  private async notifyJellyfin(
    player: MediaPlayer,
    libraryPath: string
  ): Promise<void> {
    const baseUrl = `http${player.use_ssl ? 's' : ''}://${player.host}:${player.port}`;

    // Trigger library refresh
    await fetch(`${baseUrl}/Library/Refresh`, {
      method: 'POST',
      headers: {
        'X-MediaBrowser-Token': player.api_key
      },
      body: JSON.stringify({
        path: libraryPath
      })
    });

    console.log(`Triggered Jellyfin refresh: ${libraryPath}`);
  }

  private async logNotification(
    entityType: string,
    entityId: number,
    playerId: number,
    success: boolean,
    errorMessage?: string
  ): Promise<void> {
    // Update publish_log with notification result
    await db.execute(`
      UPDATE publish_log
      SET players_notified = json_insert(
        COALESCE(players_notified, '[]'),
        '$[#]',
        json_object(
          'player_id', ?,
          'notified_at', CURRENT_TIMESTAMP,
          'success', ?,
          'error', ?
        )
      )
      WHERE entity_type = ?
        AND entity_id = ?
      ORDER BY published_at DESC
      LIMIT 1
    `, [playerId, success ? 1 : 0, errorMessage, entityType, entityId]);
  }
}
```

### Kodi Shared Library Groups

**Special Case**: Multiple Kodi players sharing same MySQL database

```typescript
async function notifyKodiGroup(
  groupId: number,
  libraryPath: string
): Promise<void> {
  // Get group members
  const members = await db.query(`
    SELECT mp.*
    FROM media_players mp
    JOIN media_player_group_members mpgm ON mp.id = mpgm.player_id
    WHERE mpgm.group_id = ?
  `, [groupId]);

  if (members.length === 0) {
    throw new Error(`No players in group ${groupId}`);
  }

  // Pick first member as representative
  const representative = members[0];

  // Trigger scan on representative only
  await notifyKodi(representative, libraryPath);

  // All members share database, so all see update
  console.log(`Triggered scan on group ${groupId} via player ${representative.id}`);
}
```

---

## Publish History

### Database Schema

```sql
CREATE TABLE publish_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,

  -- What was published
  nfo_hash TEXT NOT NULL,
  assets_published TEXT,  -- JSON: [{ asset_type, cache_path, library_path, content_hash }]

  -- When and how
  published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  published_by TEXT DEFAULT 'system',  -- 'system', 'user', 'webhook'

  -- Result
  success BOOLEAN DEFAULT 1,
  error_message TEXT,

  -- Player notifications
  players_notified TEXT  -- JSON: [{ player_id, notified_at, success, error }]
);

CREATE INDEX idx_publish_log_entity ON publish_log(entity_type, entity_id);
CREATE INDEX idx_publish_log_timestamp ON publish_log(published_at);
CREATE INDEX idx_publish_log_success ON publish_log(success);
```

### Query Patterns

```sql
-- Get last successful publish for entity
SELECT * FROM publish_log
WHERE entity_type = 'movie'
  AND entity_id = 123
  AND success = 1
ORDER BY published_at DESC
LIMIT 1;

-- Get publish history for entity
SELECT * FROM publish_log
WHERE entity_type = 'movie'
  AND entity_id = 123
ORDER BY published_at DESC;

-- Get failed publishes (for debugging)
SELECT * FROM publish_log
WHERE success = 0
ORDER BY published_at DESC
LIMIT 50;

-- Get recent publish activity
SELECT
  pl.*,
  m.title AS movie_title
FROM publish_log pl
JOIN movies m ON pl.entity_type = 'movie' AND pl.entity_id = m.id
ORDER BY pl.published_at DESC
LIMIT 100;
```

---

## Rollback / Discard Changes

### Purpose

Allow user to discard unpublished changes and revert to last published state.

### Implementation

```typescript
async function discardChanges(
  entityType: string,
  entityId: number
): Promise<void> {
  // 1. Get last published state
  const lastPublish = await db.query(`
    SELECT * FROM publish_log
    WHERE entity_type = ?
      AND entity_id = ?
      AND success = 1
    ORDER BY published_at DESC
    LIMIT 1
  `, [entityType, entityId]);

  if (lastPublish.length === 0) {
    throw new Error('No published state to revert to');
  }

  // 2. Restore asset selections
  const publishedAssets: PublishedAsset[] = JSON.parse(
    lastPublish[0].assets_published
  );

  // Deselect all current selections
  await db.execute(`
    UPDATE asset_candidates
    SET is_selected = 0
    WHERE entity_type = ?
      AND entity_id = ?
  `, [entityType, entityId]);

  // Re-select published assets
  for (const asset of publishedAssets) {
    await db.execute(`
      UPDATE asset_candidates
      SET is_selected = 1,
          selected_by = 'published'
      WHERE entity_type = ?
        AND entity_id = ?
        AND cache_path = ?
    `, [entityType, entityId, asset.cache_path]);
  }

  // 3. Reload NFO from library (parse back into database)
  const entity = await db.getEntity(entityType, entityId);
  const nfoPath = path.join(
    path.dirname(entity.file_path),
    this.getNFOFilename(entity)
  );

  if (await fs.pathExists(nfoPath)) {
    const nfoContent = await fs.readFile(nfoPath, 'utf8');
    const parsed = await parseNFO(nfoContent);

    // Update database with parsed data (respecting locks)
    await this.mergeNFOData(entityId, parsed, { respectLocks: true });
  }

  // 4. Clear dirty flag
  await db.execute(`
    UPDATE ${entityType}s
    SET has_unpublished_changes = 0
    WHERE id = ?
  `, [entityId]);
}
```

---

## Validation Before Publish

### Purpose

Ensure entity is ready to publish (required fields, assets, etc.).

### Checks

```typescript
async function validateBeforePublish(
  entityType: string,
  entityId: number
): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const entity = await db.getEntity(entityType, entityId);

  // 1. Check required fields
  const config = await db.getCompletenessConfig(entityType);
  const requiredFields = JSON.parse(config.required_fields);

  for (const field of requiredFields) {
    if (!entity[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // 2. Check selected assets meet minimum requirements
  const selectedAssets = await db.query(`
    SELECT asset_type, COUNT(*) as count
    FROM asset_candidates
    WHERE entity_type = ?
      AND entity_id = ?
      AND is_selected = 1
    GROUP BY asset_type
  `, [entityType, entityId]);

  const assetCounts: Record<string, number> = {};
  selectedAssets.forEach(row => {
    assetCounts[row.asset_type] = row.count;
  });

  if ((assetCounts['poster'] || 0) < config.required_posters) {
    errors.push(`Missing poster (need ${config.required_posters}, have ${assetCounts['poster'] || 0})`);
  }

  if ((assetCounts['fanart'] || 0) < config.required_fanart) {
    warnings.push(`Low fanart count (need ${config.required_fanart}, have ${assetCounts['fanart'] || 0})`);
  }

  // 3. Check file exists
  if (!await fs.pathExists(entity.file_path)) {
    errors.push(`Media file not found: ${entity.file_path}`);
  }

  // 4. Check library directory writable
  const libraryPath = path.dirname(entity.file_path);
  try {
    await fs.access(libraryPath, fs.constants.W_OK);
  } catch (error) {
    errors.push(`Library directory not writable: ${libraryPath}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
```

**UI Integration**:
```typescript
async function handlePublish() {
  const validation = await validateBeforePublish('movie', movieId);

  if (!validation.valid) {
    // Show error modal
    alert(`Cannot publish:\n${validation.errors.join('\n')}`);
    return;
  }

  if (validation.warnings.length > 0) {
    // Show warning confirmation
    const confirmed = confirm(
      `Warning:\n${validation.warnings.join('\n')}\n\nPublish anyway?`
    );

    if (!confirmed) return;
  }

  // Proceed with publish
  await publishMovie(movieId);
}
```

---

## Related Documentation

- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Overall system design
- **[ASSET_MANAGEMENT.md](ASSET_MANAGEMENT.md)** - Three-tier asset system
- **[AUTOMATION_AND_WEBHOOKS.md](AUTOMATION_AND_WEBHOOKS.md)** - Automation behavior
- **[WORKFLOWS.md](WORKFLOWS.md)** - Operational workflows
- **[NFO_PARSING.md](NFO_PARSING.md)** - NFO format reference
- **[PATH_MAPPING.md](PATH_MAPPING.md)** - Path translation for players
- **[KODI_API.md](KODI_API.md)** - Kodi JSON-RPC reference
