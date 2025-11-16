# Kodi Sync Design

**Purpose**: Ensure Kodi media players accurately reflect Metarr's published library state through verified, intelligent synchronization.

**Status**: 🚧 Design Phase

---

## Core Philosophy

**"Action → Verification → Completion"**

1. **No blind fire-and-forget**: Every Kodi API call must be verified for success
2. **Respect player activity**: Never interrupt active playback sessions
3. **Per-instance jobs**: No batching - sequential processing allows Kodi to control rate
4. **Path mapping essential**: Metarr paths ≠ Kodi paths (Docker, NAS, network shares)
5. **WebSocket preferred, polling fallback**: Use real-time events when available

---

## Scenarios & Implementation

### **Scenario 1: New Movie Published**

**Trigger:** Publishing phase completes for newly enriched movie
**Kodi Operation:** `VideoLibrary.Scan` with specific directory

#### Implementation Flow

```typescript
async function handleNewMoviePublished(job: PublishJob): Promise<void> {
  const { movieId, libraryPath } = job.payload;

  // 1. Get Kodi player groups for this library
  const groups = await getPlayerGroupsForLibrary(job.libraryId, 'kodi');

  for (const group of groups) {
    // 2. Filter out active players (if skip_active enabled for group)
    const availablePlayers = await filterActivePlayers(group);

    if (availablePlayers.length === 0) {
      logger.warn('All Kodi players in group are playing, skipping sync', { groupId: group.id });
      continue;
    }

    // 3. Apply path mapping (Metarr → Kodi)
    const mappedPath = await applyGroupPathMapping(group.id, libraryPath);

    // 4. Select first available player (fallback to others if failure)
    for (const player of availablePlayers) {
      try {
        // 5. Call VideoLibrary.Scan(directory)
        const scanResult = await kodiClient.scanVideoLibrary({ directory: mappedPath });
        logger.info('Scan initiated', { playerId: player.id, scanResult });

        // 6. Wait for scan completion (WebSocket or polling)
        const completed = await waitForScanComplete(player, 60000); // 60s timeout

        if (!completed) {
          logger.warn('Scan timeout, falling back to full library scan');
          await kodiClient.scanVideoLibrary(); // No directory = full scan
          await waitForScanComplete(player, 120000); // 120s for full scan
        }

        // 7. Verify movie was actually added to Kodi
        const movieAdded = await verifyMovieInKodi(player, libraryPath, movieId);

        if (!movieAdded) {
          throw new Error('Movie not found in Kodi after scan');
        }

        logger.info('Movie successfully scanned into Kodi', {
          playerId: player.id,
          movieId,
          path: mappedPath,
        });

        break; // Success - move to next group

      } catch (error) {
        logger.error('Failed to sync with Kodi player', {
          playerId: player.id,
          error: getErrorMessage(error),
        });
        // Continue to next player (fallback)
      }
    }
  }
}
```

#### Verification Methods

##### A. WebSocket Event Listening (Preferred)

```typescript
async function waitForScanComplete(player: KodiPlayer, timeoutMs: number): Promise<boolean> {
  const wsClient = await getWebSocketClient(player.id);

  if (!wsClient) {
    // WebSocket not available - fallback to polling
    return pollForScanComplete(player, timeoutMs);
  }

  return new Promise((resolve) => {
    let completed = false;

    // Listen for VideoLibrary.OnScanFinished event
    const onScanFinished = () => {
      completed = true;
      wsClient.off('VideoLibrary.OnScanFinished', onScanFinished);
      resolve(true);
    };

    wsClient.on('VideoLibrary.OnScanFinished', onScanFinished);

    // Timeout fallback
    setTimeout(() => {
      if (!completed) {
        wsClient.off('VideoLibrary.OnScanFinished', onScanFinished);
        resolve(false);
      }
    }, timeoutMs);
  });
}
```

##### B. HTTP Polling Fallback

```typescript
async function pollForScanComplete(player: KodiPlayer, timeoutMs: number): Promise<boolean> {
  const httpClient = getHttpClient(player.id);
  const startTime = Date.now();
  const pollInterval = 2000; // 2 seconds

  while (Date.now() - startTime < timeoutMs) {
    try {
      // Check if library is currently scanning
      const props = await httpClient.sendRequest('XBMC.GetInfoBooleans', {
        booleans: ['Library.IsScanning']
      });

      if (!props['Library.IsScanning']) {
        return true; // Scan complete
      }

      await sleep(pollInterval);

    } catch (error) {
      logger.error('Polling error', { error: getErrorMessage(error) });
      return false;
    }
  }

  return false; // Timeout
}
```

##### C. Verify Movie Added

```typescript
async function verifyMovieInKodi(
  player: KodiPlayer,
  libraryPath: string,
  metarrMovieId: number
): Promise<boolean> {
  const httpClient = getHttpClient(player.id);

  // Get movie from Metarr to know TMDB/IMDB ID
  const movie = await db.movies.findById(metarrMovieId);

  // Search Kodi library for movie by IMDb ID or file path
  const result = await httpClient.getMovies({
    filter: {
      field: 'path',
      operator: 'contains',
      value: path.basename(libraryPath), // e.g., "The Matrix (1999)"
    },
    properties: ['file', 'imdbnumber', 'title', 'year'],
  });

  if (result.movies && result.movies.length > 0) {
    // Found by path - verify it's the right movie
    const kodiMovie = result.movies[0];

    // Match by IMDb ID if available
    if (movie.imdb_id && kodiMovie.imdbnumber === movie.imdb_id) {
      logger.info('Movie verified in Kodi by IMDb ID', {
        playerId: player.id,
        kodiMovieId: kodiMovie.movieid,
        imdbId: movie.imdb_id,
      });
      return true;
    }

    // Match by title + year
    if (kodiMovie.title === movie.title && kodiMovie.year === movie.year) {
      logger.info('Movie verified in Kodi by title+year', {
        playerId: player.id,
        kodiMovieId: kodiMovie.movieid,
        title: movie.title,
        year: movie.year,
      });
      return true;
    }
  }

  logger.warn('Movie not found in Kodi library after scan', {
    playerId: player.id,
    movieId: metarrMovieId,
    path: libraryPath,
  });

  return false;
}
```

---

### **Scenario 2: Movie Re-Published (Metadata/Assets Updated)**

**Trigger:** User edits metadata → re-publishes
**Kodi Operation:** `VideoLibrary.Refresh` for specific movie ID

#### Why Refresh Instead of Scan?

- `VideoLibrary.Scan` re-reads NFO but **doesn't refresh cached artwork**
- `VideoLibrary.Refresh` forces Kodi to re-read **everything** (NFO + images)

#### Implementation Flow

```typescript
async function handleMovieRePublished(job: RepublishJob): Promise<void> {
  const { movieId, libraryPath } = job.payload;

  const groups = await getPlayerGroupsForLibrary(job.libraryId, 'kodi');

  for (const group of groups) {
    const availablePlayers = await filterActivePlayers(group);

    for (const player of availablePlayers) {
      try {
        // 1. Get Kodi's internal movie ID by searching library
        const kodiMovieId = await findKodiMovieId(player, libraryPath, movieId);

        if (!kodiMovieId) {
          logger.warn('Movie not in Kodi library, falling back to scan', {
            playerId: player.id,
            movieId,
          });
          // Movie doesn't exist in Kodi yet - treat as new publish
          return handleNewMoviePublished(job);
        }

        // 2. Call VideoLibrary.RefreshMovie (not in current types - need to add)
        await kodiClient.sendRequest('VideoLibrary.RefreshMovie', {
          movieid: kodiMovieId,
          ignorenfo: false, // Re-read NFO
          title: '', // Empty = don't override title
        });

        logger.info('Movie refresh triggered in Kodi', {
          playerId: player.id,
          kodiMovieId,
          movieId,
        });

        // 3. Wait for refresh completion (shorter timeout - single item)
        await waitForScanComplete(player, 30000);

        // 4. Verify metadata updated (optional - can check last modified)
        const updated = await kodiClient.getMovieDetails({
          movieid: kodiMovieId,
          properties: ['lastplayed', 'dateadded', 'art'],
        });

        logger.info('Movie refreshed successfully', {
          playerId: player.id,
          kodiMovieId,
          artCount: Object.keys(updated.moviedetails.art || {}).length,
        });

        break; // Success

      } catch (error) {
        logger.error('Failed to refresh movie in Kodi', {
          playerId: player.id,
          error: getErrorMessage(error),
        });
        // Continue to next player
      }
    }
  }
}
```

---

### **Scenario 3: Movie Deleted from Metarr**

**Trigger:** User deletes movie via Metarr UI
**Kodi Operation:** `VideoLibrary.RemoveMovie` (explicit removal, NOT clean)

#### Why RemoveMovie Instead of Clean?

- `VideoLibrary.Clean` is **dangerous** - removes ALL missing files
- User misconfiguration (NAS offline, bad path mapping) could wipe Kodi library
- `VideoLibrary.RemoveMovie` targets specific movie by ID - surgical and safe
- **TV shows need this** - removing one episode shouldn't trigger full library clean

#### Implementation Flow

```typescript
async function handleMovieDeleted(job: DeleteJob): Promise<void> {
  const { movieId, libraryPath } = job.payload;

  const groups = await getPlayerGroupsForLibrary(job.libraryId, 'kodi');

  for (const group of groups) {
    // NOTE: Do NOT filter active players for deletions
    // Deleting library entry is non-disruptive (unless actively playing that movie)
    const players = await group.getPlayers();

    for (const player of players) {
      try {
        // 1. Find Kodi's internal movie ID
        const kodiMovieId = await findKodiMovieId(player, libraryPath, movieId);

        if (!kodiMovieId) {
          logger.info('Movie not in Kodi library, nothing to delete', {
            playerId: player.id,
            movieId,
          });
          continue;
        }

        // 2. Check if movie is currently playing (safety check)
        const activePlayers = await kodiClient.getActivePlayers();
        for (const activePlayer of activePlayers) {
          const item = await kodiClient.getPlayerProperties({
            playerid: activePlayer.playerid,
            properties: ['currentitem'],
          });

          if (item.currentitem?.id === kodiMovieId) {
            logger.warn('Movie is currently playing, cannot delete', {
              playerId: player.id,
              kodiMovieId,
            });
            throw new Error('Movie currently playing');
          }
        }

        // 3. Remove movie from Kodi library
        await kodiClient.sendRequest('VideoLibrary.RemoveMovie', {
          movieid: kodiMovieId,
        });

        logger.info('Movie removed from Kodi library', {
          playerId: player.id,
          kodiMovieId,
          movieId,
        });

        // 4. Verify removal (should return null/error)
        try {
          await kodiClient.getMovieDetails({
            movieid: kodiMovieId,
            properties: ['title'],
          });

          logger.warn('Movie still in Kodi after removal', {
            playerId: player.id,
            kodiMovieId,
          });

        } catch (error) {
          // Expected - movie should not exist
          logger.debug('Movie removal verified', {
            playerId: player.id,
            kodiMovieId,
          });
        }

        break; // Success

      } catch (error) {
        logger.error('Failed to remove movie from Kodi', {
          playerId: player.id,
          error: getErrorMessage(error),
        });
        // Continue to next player
      }
    }
  }
}
```

---

### **Scenario 4: Bulk Operations**

**Trigger:** User publishes 50 movies at once
**Strategy:** Individual sequential jobs (NO batching)

#### Why Sequential Jobs?

1. **Kodi controls the rate** - Each job waits for scan completion before starting next
2. **Clear progress tracking** - UI shows "42/50 movies synced"
3. **Failure isolation** - Movie #23 fails, rest continue
4. **Graceful degradation** - Kodi busy? Jobs queue naturally
5. **Player activity respect** - Can check before each individual job

#### Job Queue Behavior

```typescript
// Publishing service creates individual jobs
async function publishMovies(movieIds: number[]): Promise<void> {
  for (const movieId of movieIds) {
    // Each movie gets its own job
    await jobQueue.create({
      type: 'publish',
      priority: 5,
      payload: { entityId: movieId, entityType: 'movie' },
    });

    // Publishing job will chain to notify-kodi job
  }
}

// notify-kodi jobs run sequentially
// Job #1: Scan movie A, wait for completion, verify → complete
// Job #2: (starts after #1 completes) Scan movie B, wait, verify → complete
// Job #3: ...

// Kodi naturally rate-limits via scan completion time
// No arbitrary delays needed - Kodi tells us when it's ready
```

---

## Player Activity Filtering

### Configuration

```typescript
interface MediaPlayerGroup {
  id: number;
  name: string;
  type: 'kodi' | 'jellyfin' | 'plex';
  skip_active: boolean; // Default: true
}
```

### Implementation

```typescript
async function filterActivePlayers(group: MediaPlayerGroup): Promise<KodiPlayer[]> {
  const players = await db.media_players.findByGroup(group.id);

  if (!group.skip_active) {
    return players; // Return all players
  }

  const availablePlayers: KodiPlayer[] = [];

  for (const player of players) {
    try {
      const httpClient = getHttpClient(player.id);
      const activePlayers = await httpClient.getActivePlayers();

      if (activePlayers.length === 0) {
        // No active playback - player is available
        availablePlayers.push(player);
      } else {
        logger.debug('Player is active, skipping', {
          playerId: player.id,
          playerName: player.name,
          activePlayers: activePlayers.map((p) => p.type),
        });
      }
    } catch (error) {
      logger.error('Failed to check player activity', {
        playerId: player.id,
        error: getErrorMessage(error),
      });
      // Assume player is available if we can't check
      availablePlayers.push(player);
    }
  }

  return availablePlayers;
}
```

---

## Path Mapping

### Importance

Docker, NAS, and network share environments require path translation:

```
Metarr sees:  /data/movies/The Matrix (1999)/
Kodi sees:    /mnt/media/movies/The Matrix (1999)/
              or
              smb://nas/movies/The Matrix (1999)/
              or
              C:\Movies\The Matrix (1999)\
```

### Implementation

Already exists in Metarr:
- `src/services/pathMappingService.ts` - `applyGroupPathMapping()`
- Database: `media_player_path_mappings` table

```typescript
async function applyGroupPathMapping(groupId: number, path: string): Promise<string> {
  const mappings = await db.path_mappings.findByGroup(groupId);

  for (const mapping of mappings.sort((a, b) => b.from_path.length - a.from_path.length)) {
    if (path.startsWith(mapping.from_path)) {
      const mapped = path.replace(mapping.from_path, mapping.to_path);
      logger.debug('Path mapped', { from: path, to: mapped, mappingId: mapping.id });
      return mapped;
    }
  }

  logger.warn('No path mapping found for group, using original path', {
    groupId,
    path,
  });

  return path;
}
```

---

## Scheduled VideoLibrary.Clean

### Configuration

```typescript
interface ScheduledTask {
  id: number;
  task_type: 'kodi_clean_library';
  enabled: boolean; // Default: FALSE (dangerous)
  cron_schedule: string; // e.g., "0 3 * * 0" (3 AM every Sunday)
  group_id: number | null; // null = all Kodi groups
}
```

### Safety Measures

1. **Default disabled** - User must explicitly enable
2. **Warning in UI** - "⚠️ This will remove ALL missing files from Kodi. Ensure NAS is mounted and path mappings are correct."
3. **Dry run option** - Show what would be removed without actually removing
4. **Skip active players** - Never clean while someone is watching
5. **Notification on completion** - Send Discord/Pushover alert with count of removed items

### Implementation

```typescript
async function scheduledKodiClean(taskId: number): Promise<void> {
  const task = await db.scheduled_tasks.findById(taskId);

  if (!task.enabled) {
    logger.info('Kodi clean task disabled, skipping', { taskId });
    return;
  }

  const groups = task.group_id
    ? [await db.media_player_groups.findById(task.group_id)]
    : await db.media_player_groups.findByType('kodi');

  for (const group of groups) {
    const availablePlayers = await filterActivePlayers(group);

    if (availablePlayers.length === 0) {
      logger.warn('All Kodi players in group are active, skipping clean', {
        groupId: group.id,
      });
      continue;
    }

    const player = availablePlayers[0];

    try {
      logger.info('Starting scheduled library clean', {
        playerId: player.id,
        groupId: group.id,
      });

      // Trigger clean
      await kodiClient.cleanVideoLibrary();

      // Wait for completion
      await waitForCleanComplete(player, 600000); // 10 minute timeout

      logger.info('Scheduled library clean completed', {
        playerId: player.id,
        groupId: group.id,
      });

      // Send notification (optional)
      await notificationService.send({
        type: 'kodi_clean_complete',
        message: `Kodi library cleaned on ${player.name}`,
        groupId: group.id,
      });

    } catch (error) {
      logger.error('Scheduled library clean failed', {
        playerId: player.id,
        error: getErrorMessage(error),
      });

      // Send error notification
      await notificationService.send({
        type: 'kodi_clean_failed',
        message: `Kodi library clean failed on ${player.name}: ${getErrorMessage(error)}`,
        groupId: group.id,
      });
    }
  }
}
```

---

## Missing JSON-RPC Methods

Need to add to `src/types/jsonrpc.ts` and `KodiHttpClient.ts`:

```typescript
// VideoLibrary namespace additions
namespace VideoLibrary {
  // Remove movie by ID
  export interface RemoveMovieParams {
    movieid: number;
  }

  // Refresh movie metadata and artwork
  export interface RefreshMovieParams {
    movieid: number;
    ignorenfo?: boolean; // Default: false (re-read NFO)
    title?: string; // Override title (empty = don't override)
  }

  // Get movies with advanced filtering
  export interface GetMoviesParams {
    filter?: {
      field: 'path' | 'title' | 'year' | 'genre' | 'imdbnumber';
      operator: 'contains' | 'is' | 'startswith' | 'endswith';
      value: string | number;
    };
    properties?: string[]; // ['file', 'imdbnumber', 'title', 'year', 'art', 'lastplayed']
    sort?: {
      method: 'title' | 'year' | 'dateadded' | 'lastplayed';
      order: 'ascending' | 'descending';
    };
    limits?: {
      start: number;
      end: number;
    };
  }

  export interface GetMoviesResponse {
    movies?: Array<{
      movieid: number;
      label: string;
      title?: string;
      year?: number;
      file?: string;
      imdbnumber?: string;
      art?: Record<string, string>; // { 'poster': 'url', 'fanart': 'url' }
      lastplayed?: string;
    }>;
    limits: {
      start: number;
      end: number;
      total: number;
    };
  }
}

// XBMC namespace (for global properties)
namespace XBMC {
  export interface GetInfoBooleansParams {
    booleans: string[]; // ['Library.IsScanning', 'Player.HasMedia', etc.]
  }

  export interface GetInfoBooleansResponse {
    [key: string]: boolean; // { 'Library.IsScanning': true }
  }
}
```

---

## Implementation Checklist

- [ ] Add missing JSON-RPC type definitions
- [ ] Implement `waitForScanComplete()` with WebSocket + polling fallback
- [ ] Implement `verifyMovieInKodi()` with IMDb/path/title matching
- [ ] Implement `filterActivePlayers()` with `Player.GetActivePlayers`
- [ ] Implement `handleNewMoviePublished()` with full verification flow
- [ ] Implement `handleMovieRePublished()` with `VideoLibrary.RefreshMovie`
- [ ] Implement `handleMovieDeleted()` with `VideoLibrary.RemoveMovie`
- [ ] Add `skip_active` configuration to `media_player_groups` table
- [ ] Add scheduled task system for `VideoLibrary.Clean`
- [ ] Add UI warnings for dangerous operations (clean library)
- [ ] Test with real Kodi instance (Docker container)
- [ ] Document troubleshooting steps (path mapping, WebSocket connection, etc.)

---

## Testing Environment

### Docker Compose for Development

```yaml
version: '3.8'

services:
  metarr:
    build: .
    ports:
      - "3000:3000"
      - "3001:3001"
    volumes:
      - ./data:/data
      - /mnt/media:/media:ro
    environment:
      - NODE_ENV=development
      - DATABASE_URL=sqlite:/data/metarr.sqlite

  kodi:
    image: lscr.io/linuxserver/kodi:latest
    container_name: metarr-kodi-test
    ports:
      - "8080:8080" # HTTP JSON-RPC
      - "9090:9090" # WebSocket JSON-RPC
      - "9777:9777" # Event server
    volumes:
      - ./kodi-config:/config
      - /mnt/media:/media:ro
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=America/New_York
```

### Test Scenarios

1. **Fresh movie publish** - Verify scan + add
2. **Metadata update** - Verify refresh works
3. **Asset change** - Verify Kodi sees new poster
4. **Deletion** - Verify RemoveMovie works
5. **Bulk publish (10 movies)** - Verify sequential processing
6. **Active playback** - Verify skip_active filters correctly
7. **Path mapping** - Verify Metarr `/data` → Kodi `/media` translation
8. **WebSocket disconnect** - Verify polling fallback works
9. **Kodi offline** - Verify job retry/failure handling

---

## Reference Implementation

Python reference: https://github.com/jsaddiction/Radarr_Kodi

**Key patterns to adopt:**
- WebSocket event listening for scan completion
- Polling fallback when WebSocket unavailable
- Path mapping for heterogeneous environments
- Player activity detection (`skip_active`)
- Full library scan fallback when directory scan fails

---

## Next Steps

1. **Review this design** - Confirm approach aligns with vision
2. **Implement missing JSON-RPC types** - Add to `jsonrpc.ts`
3. **Create KodiSyncService** - Orchestrates all scenarios
4. **Setup Docker test environment** - Real Kodi instance for verification
5. **Implement scenario 1** - New movie publish with full verification
6. **Test and iterate** - Find edge cases, refine logic
7. **Document troubleshooting** - Path mapping issues, WebSocket failures, etc.

---

**Questions?**
- Is the verification approach (WebSocket → Polling → Verify) acceptable?
- Should we implement all scenarios or start with Scenario 1 only?
- Any additional safety checks needed for deletion?
- Scheduling system preference (cron, interval, manual only)?
