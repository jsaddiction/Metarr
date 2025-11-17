/**
 * Kodi Sync Service
 *
 * Handles all Kodi library synchronization with action-result verification.
 * Implements the workflows defined in docs/phases/KODI_SYNC_DESIGN.md
 *
 * Core patterns:
 * 1. Action → Verification → Completion (no blind fire-and-forget)
 * 2. WebSocket event listening (preferred) → HTTP polling (fallback)
 * 3. Player activity filtering (respect skip_active setting)
 * 4. Path mapping (Metarr paths ≠ Kodi paths)
 */

import { DatabaseConnection } from '../../types/database.js';
import { KodiHttpClient } from './KodiHttpClient.js';
import { KodiWebSocketClient } from './KodiWebSocketClient.js';
import { VideoLibrary } from '../../types/jsonrpc.js';
import { logger } from '../../middleware/logging.js';
import { getErrorMessage } from '../../utils/errorHandling.js';
import { ResourceNotFoundError } from '../../errors/index.js';
import path from 'path';

export interface KodiPlayer {
  id: number;
  name: string;
  host: string;
  port: number;
  group_id: number;
}

export interface KodiPlayerGroup {
  id: number;
  name: string;
  type: string;
  skip_active: boolean;
}

export interface SyncResult {
  success: boolean;
  playerId?: number;
  playerName?: string;
  error?: string;
}

export class KodiSyncService {
  constructor(
    private db: DatabaseConnection,
    private getHttpClient: (playerId: number) => KodiHttpClient | null,
    private getWebSocketClient: (playerId: number) => KodiWebSocketClient | null
  ) {}

  /**
   * Wait for library scan to complete
   * Uses WebSocket events if available, falls back to HTTP polling
   */
  async waitForScanComplete(player: KodiPlayer, timeoutMs: number): Promise<boolean> {
    const wsClient = this.getWebSocketClient(player.id);

    if (wsClient) {
      logger.debug('[KodiSync] Using WebSocket to wait for scan completion', {
        playerId: player.id,
        playerName: player.name,
      });

      return this.waitForScanCompleteWebSocket(wsClient, timeoutMs);
    }

    // Fallback to HTTP polling
    logger.debug('[KodiSync] WebSocket unavailable, falling back to HTTP polling', {
      playerId: player.id,
      playerName: player.name,
    });

    return this.waitForScanCompletePolling(player, timeoutMs);
  }

  /**
   * Wait for scan completion via WebSocket events
   */
  private async waitForScanCompleteWebSocket(
    wsClient: KodiWebSocketClient,
    timeoutMs: number
  ): Promise<boolean> {
    return new Promise((resolve) => {
      let completed = false;

      // Listen for VideoLibrary.OnScanFinished event
      const onScanFinished = (data: VideoLibrary.OnScanFinishedData) => {
        logger.debug('[KodiSync] Scan finished event received', { data });
        completed = true;
        wsClient.off('VideoLibrary.OnScanFinished', onScanFinished);
        resolve(true);
      };

      wsClient.on('VideoLibrary.OnScanFinished', onScanFinished);

      // Timeout fallback
      setTimeout(() => {
        if (!completed) {
          wsClient.off('VideoLibrary.OnScanFinished', onScanFinished);
          logger.warn('[KodiSync] Scan completion timeout (WebSocket)', { timeoutMs });
          resolve(false);
        }
      }, timeoutMs);
    });
  }

  /**
   * Wait for scan completion via HTTP polling
   */
  private async waitForScanCompletePolling(
    player: KodiPlayer,
    timeoutMs: number
  ): Promise<boolean> {
    const httpClient = this.getHttpClient(player.id);
    if (!httpClient) {
      logger.error('[KodiSync] HTTP client not available for polling', {
        playerId: player.id,
      });
      return false;
    }

    const startTime = Date.now();
    const pollInterval = 2000; // 2 seconds

    while (Date.now() - startTime < timeoutMs) {
      try {
        // Check if library is currently scanning
        const props = await httpClient.getInfoBooleans({
          booleans: ['Library.IsScanning'],
        });

        if (!props['Library.IsScanning']) {
          logger.debug('[KodiSync] Scan complete (polling detected)', {
            playerId: player.id,
            elapsed: Date.now() - startTime,
          });
          return true; // Scan complete
        }

        // Wait before next poll
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      } catch (error) {
        logger.error('[KodiSync] Polling error', {
          playerId: player.id,
          error: getErrorMessage(error),
        });
        return false;
      }
    }

    logger.warn('[KodiSync] Scan completion timeout (polling)', {
      playerId: player.id,
      timeoutMs,
    });
    return false; // Timeout
  }

  /**
   * Verify a movie was added to Kodi library after scanning
   * Searches by IMDb ID, then by path/title/year as fallback
   */
  async verifyMovieInKodi(
    player: KodiPlayer,
    libraryPath: string,
    metarrMovieId: number
  ): Promise<boolean> {
    const httpClient = this.getHttpClient(player.id);
    if (!httpClient) {
      logger.error('[KodiSync] HTTP client not available for verification', {
        playerId: player.id,
      });
      return false;
    }

    try {
      // Get movie from Metarr to know TMDB/IMDB ID
      const movie = await this.db.get<{
        id: number;
        title: string;
        year: number | null;
        imdb_id: string | null;
        tmdb_id: number | null;
      }>('SELECT id, title, year, imdb_id, tmdb_id FROM movies WHERE id = ?', [
        metarrMovieId,
      ]);

      if (!movie) {
        logger.error('[KodiSync] Movie not found in Metarr database', {
          movieId: metarrMovieId,
        });
        return false;
      }

      // Try 1: Search by IMDb ID (most reliable)
      if (movie.imdb_id) {
        const result = await httpClient.getMovies({
          filter: {
            field: 'imdbnumber',
            operator: 'is',
            value: movie.imdb_id,
          } as any,
          properties: ['imdbnumber', 'title', 'year', 'file'],
        });

        if (result.movies && result.movies.length > 0) {
          logger.info('[KodiSync] Movie verified in Kodi by IMDb ID', {
            playerId: player.id,
            kodiMovieId: result.movies[0].movieid,
            imdbId: movie.imdb_id,
            title: result.movies[0].title,
          });
          return true;
        }
      }

      // Try 2: Search by path (directory name)
      const dirName = path.basename(libraryPath);
      const pathResult = await httpClient.getMovies({
        filter: {
          field: 'path',
          operator: 'contains',
          value: dirName,
        } as any,
        properties: ['file', 'title', 'year'],
      });

      if (pathResult.movies && pathResult.movies.length > 0) {
        // Verify it's the right movie by title + year
        for (const kodiMovie of pathResult.movies) {
          if (
            kodiMovie.title === movie.title &&
            (kodiMovie.year === movie.year || !movie.year)
          ) {
            logger.info('[KodiSync] Movie verified in Kodi by path+title+year', {
              playerId: player.id,
              kodiMovieId: kodiMovie.movieid,
              title: kodiMovie.title,
              year: kodiMovie.year,
            });
            return true;
          }
        }
      }

      // Try 3: Search by title (less reliable - multiple movies with same name)
      const titleResult = await httpClient.getMovies({
        filter: {
          field: 'title',
          operator: 'is',
          value: movie.title,
        } as any,
        properties: ['title', 'year'],
      });

      if (titleResult.movies && titleResult.movies.length > 0) {
        // Check if year matches
        for (const kodiMovie of titleResult.movies) {
          if (kodiMovie.year === movie.year || !movie.year) {
            logger.info('[KodiSync] Movie verified in Kodi by title+year (fuzzy)', {
              playerId: player.id,
              kodiMovieId: kodiMovie.movieid,
              title: kodiMovie.title,
              year: kodiMovie.year,
            });
            return true;
          }
        }
      }

      logger.warn('[KodiSync] Movie not found in Kodi library after scan', {
        playerId: player.id,
        movieId: metarrMovieId,
        title: movie.title,
        year: movie.year,
        imdbId: movie.imdb_id,
        path: libraryPath,
      });

      return false;
    } catch (error) {
      logger.error('[KodiSync] Failed to verify movie in Kodi', {
        playerId: player.id,
        error: getErrorMessage(error),
      });
      return false;
    }
  }

  /**
   * Find Kodi's internal movie ID by searching library
   * Used for refresh/delete operations
   */
  async findKodiMovieId(
    player: KodiPlayer,
    libraryPath: string,
    metarrMovieId: number
  ): Promise<number | null> {
    const httpClient = this.getHttpClient(player.id);
    if (!httpClient) {
      return null;
    }

    try {
      const movie = await this.db.get<{
        title: string;
        year: number | null;
        imdb_id: string | null;
      }>('SELECT title, year, imdb_id FROM movies WHERE id = ?', [metarrMovieId]);

      if (!movie) {
        return null;
      }

      // Try IMDb ID first
      if (movie.imdb_id) {
        const result = await httpClient.getMovies({
          filter: {
            field: 'imdbnumber',
            operator: 'is',
            value: movie.imdb_id,
          } as any,
          properties: ['imdbnumber'],
        });

        if (result.movies && result.movies.length > 0) {
          return result.movies[0].movieid;
        }
      }

      // Fallback to path search
      const dirName = path.basename(libraryPath);
      const pathResult = await httpClient.getMovies({
        filter: {
          field: 'path',
          operator: 'contains',
          value: dirName,
        } as any,
        properties: ['title', 'year'],
      });

      if (pathResult.movies && pathResult.movies.length > 0) {
        for (const kodiMovie of pathResult.movies) {
          if (
            kodiMovie.title === movie.title &&
            (kodiMovie.year === movie.year || !movie.year)
          ) {
            return kodiMovie.movieid;
          }
        }
      }

      return null;
    } catch (error) {
      logger.error('[KodiSync] Failed to find Kodi movie ID', {
        playerId: player.id,
        error: getErrorMessage(error),
      });
      return null;
    }
  }

  /**
   * Filter out players that are currently playing (if skip_active enabled)
   * Returns list of available players for library operations
   */
  async filterActivePlayers(group: KodiPlayerGroup): Promise<KodiPlayer[]> {
    const players = await this.db.query<KodiPlayer>(
      `SELECT id, name, host, port, group_id
       FROM media_players
       WHERE group_id = ? AND enabled = 1 AND type = 'kodi'
       ORDER BY id ASC`,
      [group.id]
    );

    if (!group.skip_active) {
      logger.debug('[KodiSync] skip_active disabled, returning all players', {
        groupId: group.id,
        playerCount: players.length,
      });
      return players;
    }

    const availablePlayers: KodiPlayer[] = [];

    for (const player of players) {
      try {
        const httpClient = this.getHttpClient(player.id);
        if (!httpClient) {
          logger.warn('[KodiSync] HTTP client not available for activity check', {
            playerId: player.id,
          });
          // Assume player is available if we can't check
          availablePlayers.push(player);
          continue;
        }

        const activePlayers = await httpClient.getActivePlayers();

        if (activePlayers.length === 0) {
          // No active playback - player is available
          availablePlayers.push(player);
        } else {
          logger.debug('[KodiSync] Player is active, skipping', {
            playerId: player.id,
            playerName: player.name,
            activePlayers: activePlayers.map((p) => p.type),
          });
        }
      } catch (error) {
        logger.error('[KodiSync] Failed to check player activity', {
          playerId: player.id,
          error: getErrorMessage(error),
        });
        // Assume player is available if we can't check (fail open)
        availablePlayers.push(player);
      }
    }

    logger.info('[KodiSync] Filtered active players', {
      groupId: group.id,
      totalPlayers: players.length,
      availablePlayers: availablePlayers.length,
    });

    return availablePlayers;
  }

  /**
   * Apply path mapping for a player group
   * Translates Metarr paths to Kodi paths (Docker, NAS, network shares)
   */
  async applyGroupPathMapping(groupId: number, metarrPath: string): Promise<string> {
    try {
      const { applyGroupPathMapping } = await import('../pathMappingService.js');
      const mappedPath = await applyGroupPathMapping(this.db, groupId, metarrPath);

      logger.debug('[KodiSync] Path mapped', {
        groupId,
        from: metarrPath,
        to: mappedPath,
      });

      return mappedPath;
    } catch (error) {
      logger.warn('[KodiSync] Path mapping failed, using original path', {
        groupId,
        path: metarrPath,
        error: getErrorMessage(error),
      });
      return metarrPath;
    }
  }

  // ============================================================
  // SCENARIO HANDLERS
  // ============================================================

  /**
   * Scenario 1: New Movie Published
   *
   * Flow:
   * 1. Scan specific directory
   * 2. Wait for scan completion
   * 3. Verify movie was added
   * 4. Fallback to full library scan if verification fails
   */
  async handleNewMoviePublished(
    movieId: number,
    libraryPath: string,
    libraryId: number
  ): Promise<SyncResult[]> {
    logger.info('[KodiSync] Handling new movie published', {
      movieId,
      libraryPath,
      libraryId,
    });

    const results: SyncResult[] = [];

    // Get Kodi player groups for this library
    const groups = await this.db.query<KodiPlayerGroup>(
      `SELECT mpg.id, mpg.name, mpg.type, mpg.skip_active
       FROM media_player_groups mpg
       JOIN media_player_libraries mpl ON mpl.group_id = mpg.id
       WHERE mpl.library_id = ? AND mpg.type = 'kodi' AND mpg.enabled = 1`,
      [libraryId]
    );

    if (groups.length === 0) {
      logger.info('[KodiSync] No Kodi player groups configured for library', {
        libraryId,
      });
      return results;
    }

    for (const group of groups) {
      // Filter out active players if skip_active enabled
      const availablePlayers = await this.filterActivePlayers(group);

      if (availablePlayers.length === 0) {
        logger.warn('[KodiSync] All Kodi players in group are playing, skipping sync', {
          groupId: group.id,
          groupName: group.name,
        });
        results.push({
          success: false,
          error: 'All players in group are currently playing',
        });
        continue;
      }

      // Apply path mapping
      const mappedPath = await this.applyGroupPathMapping(group.id, libraryPath);

      // Try each player until one succeeds (fallback pattern)
      let groupSuccess = false;

      for (const player of availablePlayers) {
        try {
          const httpClient = this.getHttpClient(player.id);
          if (!httpClient) {
            logger.warn('[KodiSync] HTTP client not available', {
              playerId: player.id,
            });
            continue;
          }

          // Step 1: Trigger directory scan
          logger.info('[KodiSync] Triggering directory scan', {
            playerId: player.id,
            playerName: player.name,
            path: mappedPath,
          });

          await httpClient.scanVideoLibrary({ directory: mappedPath });

          // Step 2: Wait for scan completion (60s timeout)
          const scanCompleted = await this.waitForScanComplete(player, 60000);

          if (!scanCompleted) {
            logger.warn('[KodiSync] Directory scan timeout, falling back to full library scan', {
              playerId: player.id,
            });

            // Fallback: Full library scan
            await httpClient.scanVideoLibrary(); // No directory = full scan
            await this.waitForScanComplete(player, 120000); // 120s for full scan
          }

          // Step 3: Verify movie was actually added to Kodi
          const movieAdded = await this.verifyMovieInKodi(player, libraryPath, movieId);

          if (!movieAdded) {
            throw new ResourceNotFoundError('movie', 'Kodi library scan result');
          }

          logger.info('[KodiSync] Movie successfully scanned into Kodi', {
            playerId: player.id,
            playerName: player.name,
            movieId,
            path: mappedPath,
          });

          results.push({
            success: true,
            playerId: player.id,
            playerName: player.name,
          });

          groupSuccess = true;
          break; // Success - move to next group

        } catch (error) {
          logger.error('[KodiSync] Failed to sync with Kodi player', {
            playerId: player.id,
            playerName: player.name,
            error: getErrorMessage(error),
          });

          results.push({
            success: false,
            playerId: player.id,
            playerName: player.name,
            error: getErrorMessage(error),
          });

          // Continue to next player (fallback)
        }
      }

      if (!groupSuccess) {
        logger.error('[KodiSync] Failed to sync with any player in group', {
          groupId: group.id,
          groupName: group.name,
        });
      }
    }

    return results;
  }

  /**
   * Scenario 2: Movie Re-Published (Metadata/Assets Updated)
   *
   * Flow:
   * 1. Find Kodi's internal movie ID
   * 2. Call VideoLibrary.RefreshMovie (forces artwork cache refresh)
   * 3. Wait for refresh completion
   */
  async handleMovieRePublished(
    movieId: number,
    libraryPath: string,
    libraryId: number
  ): Promise<SyncResult[]> {
    logger.info('[KodiSync] Handling movie re-published', {
      movieId,
      libraryPath,
      libraryId,
    });

    const results: SyncResult[] = [];

    const groups = await this.db.query<KodiPlayerGroup>(
      `SELECT mpg.id, mpg.name, mpg.type, mpg.skip_active
       FROM media_player_groups mpg
       JOIN media_player_libraries mpl ON mpl.group_id = mpg.id
       WHERE mpl.library_id = ? AND mpg.type = 'kodi' AND mpg.enabled = 1`,
      [libraryId]
    );

    for (const group of groups) {
      const availablePlayers = await this.filterActivePlayers(group);

      if (availablePlayers.length === 0) {
        results.push({
          success: false,
          error: 'All players in group are currently playing',
        });
        continue;
      }

      const mappedPath = await this.applyGroupPathMapping(group.id, libraryPath);

      for (const player of availablePlayers) {
        try {
          const httpClient = this.getHttpClient(player.id);
          if (!httpClient) {
            continue;
          }

          // Step 1: Get Kodi's internal movie ID
          const kodiMovieId = await this.findKodiMovieId(player, mappedPath, movieId);

          if (!kodiMovieId) {
            logger.warn('[KodiSync] Movie not in Kodi library, falling back to new publish', {
              playerId: player.id,
              movieId,
            });

            // Movie doesn't exist in Kodi yet - treat as new publish
            return this.handleNewMoviePublished(movieId, libraryPath, libraryId);
          }

          // Step 2: Trigger refresh (forces artwork re-read)
          logger.info('[KodiSync] Refreshing movie metadata and artwork', {
            playerId: player.id,
            kodiMovieId,
            movieId,
          });

          await httpClient.refreshMovie({
            movieid: kodiMovieId,
            ignorenfo: false, // Re-read NFO
            title: '', // Don't override title
          });

          // Step 3: Wait for refresh completion (30s timeout - single item)
          await this.waitForScanComplete(player, 30000);

          logger.info('[KodiSync] Movie refreshed successfully', {
            playerId: player.id,
            playerName: player.name,
            kodiMovieId,
            movieId,
          });

          results.push({
            success: true,
            playerId: player.id,
            playerName: player.name,
          });

          break; // Success - move to next group

        } catch (error) {
          logger.error('[KodiSync] Failed to refresh movie in Kodi', {
            playerId: player.id,
            error: getErrorMessage(error),
          });

          results.push({
            success: false,
            playerId: player.id,
            playerName: player.name,
            error: getErrorMessage(error),
          });
        }
      }
    }

    return results;
  }

  /**
   * Scenario 3: Movie Deleted from Metarr
   *
   * Flow:
   * 1. Find Kodi's internal movie ID
   * 2. Check if movie is currently playing (safety)
   * 3. Call VideoLibrary.RemoveMovie (surgical removal)
   * 4. Verify removal
   */
  async handleMovieDeleted(
    movieId: number,
    libraryPath: string,
    libraryId: number
  ): Promise<SyncResult[]> {
    logger.info('[KodiSync] Handling movie deleted', {
      movieId,
      libraryPath,
      libraryId,
    });

    const results: SyncResult[] = [];

    const groups = await this.db.query<KodiPlayerGroup>(
      `SELECT mpg.id, mpg.name, mpg.type, mpg.skip_active
       FROM media_player_groups mpg
       JOIN media_player_libraries mpl ON mpl.group_id = mpg.id
       WHERE mpl.library_id = ? AND mpg.type = 'kodi' AND mpg.enabled = 1`,
      [libraryId]
    );

    for (const group of groups) {
      // NOTE: Do NOT filter active players for deletions
      // Deleting library entry is non-disruptive (unless actively playing that specific movie)
      const players = await this.db.query<KodiPlayer>(
        `SELECT id, name, host, port, group_id
         FROM media_players
         WHERE group_id = ? AND enabled = 1 AND type = 'kodi'`,
        [group.id]
      );

      const mappedPath = await this.applyGroupPathMapping(group.id, libraryPath);

      for (const player of players) {
        try {
          const httpClient = this.getHttpClient(player.id);
          if (!httpClient) {
            continue;
          }

          // Step 1: Find Kodi's internal movie ID
          const kodiMovieId = await this.findKodiMovieId(player, mappedPath, movieId);

          if (!kodiMovieId) {
            logger.info('[KodiSync] Movie not in Kodi library, nothing to delete', {
              playerId: player.id,
              movieId,
            });
            results.push({
              success: true,
              playerId: player.id,
              playerName: player.name,
            });
            continue;
          }

          // Step 2: Check if movie is currently playing (safety check)
          const activePlayers = await httpClient.getActivePlayers();
          for (const activePlayer of activePlayers) {
            if (activePlayer.type !== 'video') {
              continue;
            }

            // Note: Kodi doesn't expose currentitem ID reliably in all versions
            // This is a best-effort check - we can't reliably determine if THIS specific movie is playing
            logger.warn('[KodiSync] Video is currently playing, proceeding with caution', {
              playerId: player.id,
              activePlayerType: activePlayer.type,
            });
          }

          // Step 3: Remove movie from Kodi library
          logger.info('[KodiSync] Removing movie from Kodi library', {
            playerId: player.id,
            kodiMovieId,
            movieId,
          });

          await httpClient.removeMovie({ movieid: kodiMovieId });

          // Step 4: Verify removal
          try {
            await httpClient.getMovieDetails({
              movieid: kodiMovieId,
              properties: ['title'],
            });

            logger.warn('[KodiSync] Movie still in Kodi after removal', {
              playerId: player.id,
              kodiMovieId,
            });

            results.push({
              success: false,
              playerId: player.id,
              playerName: player.name,
              error: 'Movie still exists in Kodi after removal',
            });

          } catch (error) {
            // Expected - movie should not exist
            logger.info('[KodiSync] Movie removal verified', {
              playerId: player.id,
              kodiMovieId,
              movieId,
            });

            results.push({
              success: true,
              playerId: player.id,
              playerName: player.name,
            });
          }

          break; // Success - move to next group

        } catch (error) {
          logger.error('[KodiSync] Failed to remove movie from Kodi', {
            playerId: player.id,
            error: getErrorMessage(error),
          });

          results.push({
            success: false,
            playerId: player.id,
            playerName: player.name,
            error: getErrorMessage(error),
          });
        }
      }
    }

    return results;
  }
}

