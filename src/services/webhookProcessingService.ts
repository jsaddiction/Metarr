import { logger } from '../middleware/logging.js';
import { DatabaseManager } from '../database/DatabaseManager.js';
import { DatabaseConnection } from '../types/database.js';
import { RadarrWebhookPayload } from '../types/webhooks.js';
import { scanMovieDirectory, ScanContext } from './scan/unifiedScanService.js';
import { applyManagerPathMapping } from './pathMappingService.js';
import { MediaPlayerConnectionManager } from './mediaPlayerConnectionManager.js';

/**
 * Find library by matching the longest path prefix
 */
async function findLibraryByPath(db: DatabaseConnection, filePath: string): Promise<number | null> {
  const libraries: Array<{ id: number; path: string }> = await db.query(
    `SELECT id, path FROM libraries
     WHERE ? LIKE path || '%'
     ORDER BY LENGTH(path) DESC
     LIMIT 1`,
    [filePath]
  );
  if (libraries.length > 0) {
    return libraries[0].id;
  }
  return null;
}

/**
 * Webhook Processing Service
 *
 * Handles webhook events from media managers (Radarr/Sonarr/Lidarr)
 * and triggers appropriate scanning and metadata workflows.
 *
 * Priority Levels:
 * - Grab: Info (check if playing, notify)
 * - Download: Critical (full scan workflow)
 * - Rename: High (update file_path)
 * - MovieFileDelete: High (mark for deletion)
 */

export class WebhookProcessingService {
  private dbManager: DatabaseManager;
  private mediaPlayerManager: MediaPlayerConnectionManager;

  constructor(dbManager: DatabaseManager, mediaPlayerManager: MediaPlayerConnectionManager) {
    this.dbManager = dbManager;
    this.mediaPlayerManager = mediaPlayerManager;
  }

  /**
   * Handle Radarr Grab event
   * Queued for download - check if currently playing
   */
  async handleRadarrGrab(payload: RadarrWebhookPayload): Promise<void> {
    const db = this.dbManager.getConnection();

    if (!payload.movie) {
      logger.warn('Grab webhook missing movie data');
      return;
    }

    logger.info('Processing Radarr Grab event', {
      movieTitle: payload.movie.title,
      year: payload.movie.year,
      tmdbId: payload.movie.tmdbId,
    });

    // Log to activity_log
    await this.logWebhookActivity(db, 'radarr', 'Grab', payload);

    // TODO: Check if movie is currently playing on any player
    // If playing, emit notification to user
    // For now, just log
    logger.info('Download queued', {
      movieTitle: payload.movie.title,
      tmdbId: payload.movie.tmdbId,
    });
  }

  /**
   * Handle Radarr Download event
   * Download complete - trigger full scan workflow
   */
  async handleRadarrDownload(payload: RadarrWebhookPayload): Promise<void> {
    const db = this.dbManager.getConnection();

    if (!payload.movie || !payload.movieFile) {
      logger.warn('Download webhook missing movie or file data');
      return;
    }

    logger.info('Processing Radarr Download event (CRITICAL)', {
      movieTitle: payload.movie.title,
      year: payload.movie.year,
      tmdbId: payload.movie.tmdbId,
      path: payload.movie.folderPath,
    });

    // Log to activity_log
    await this.logWebhookActivity(db, 'radarr', 'Download', payload);

    try {
      // Apply path mapping (Radarr → Metarr)
      const mappedPath = await applyManagerPathMapping(db, 'radarr', payload.movie.folderPath);

      logger.info('Applied path mapping', {
        radarrPath: payload.movie.folderPath,
        metarrPath: mappedPath,
      });

      // Build scan context with TMDB ID from webhook
      const scanContext: ScanContext = {
        tmdbId: payload.movie.tmdbId,
        title: payload.movie.title,
        year: payload.movie.year,
        trigger: 'webhook',
      };

      if (payload.movie.imdbId) {
        scanContext.imdbId = payload.movie.imdbId;
      }

      // Find library for this path
      const libraryId = await findLibraryByPath(db, mappedPath);
      if (!libraryId) {
        throw new Error(`No library found for path: ${mappedPath}`);
      }

      // Run unified scan
      const scanResult = await scanMovieDirectory(this.dbManager, libraryId, mappedPath, scanContext);

      logger.info('Scan complete', {
        movieId: scanResult.movieId,
        isNewMovie: scanResult.isNewMovie,
        pathChanged: scanResult.pathChanged,
        restoredFromDeletion: scanResult.restoredFromDeletion,
        nfoRegenerated: scanResult.nfoRegenerated,
        streamsExtracted: scanResult.streamsExtracted,
      });

      // Notify all media players to scan for new content
      await this.notifyMediaPlayers(libraryId);

      logger.info('Media players notified for library scan', { libraryId });
    } catch (error: any) {
      logger.error('Failed to process Download webhook', {
        movieTitle: payload.movie.title,
        tmdbId: payload.movie.tmdbId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Handle Radarr Rename event
   * File renamed - update file_path
   */
  async handleRadarrRename(payload: RadarrWebhookPayload): Promise<void> {
    const db = this.dbManager.getConnection();

    if (!payload.movie || !payload.movieFile) {
      logger.warn('Rename webhook missing movie or file data');
      return;
    }

    logger.info('Processing Radarr Rename event (HIGH)', {
      movieTitle: payload.movie.title,
      tmdbId: payload.movie.tmdbId,
      newPath: payload.movie.folderPath,
    });

    // Log to activity_log
    await this.logWebhookActivity(db, 'radarr', 'Rename', payload);

    try {
      // Apply path mapping
      const mappedPath = await applyManagerPathMapping(db, 'radarr', payload.movie.folderPath);

      // Build scan context with TMDB ID
      const scanContext: ScanContext = {
        tmdbId: payload.movie.tmdbId,
        title: payload.movie.title,
        year: payload.movie.year,
        trigger: 'webhook',
      };

      if (payload.movie.imdbId) {
        scanContext.imdbId = payload.movie.imdbId;
      }

      // Find library for this path
      const libraryId = await findLibraryByPath(db, mappedPath);
      if (!libraryId) {
        throw new Error(`No library found for path: ${mappedPath}`);
      }

      // Run scan - it will automatically update the path
      const scanResult = await scanMovieDirectory(this.dbManager, libraryId, mappedPath, scanContext);

      logger.info('Rename processed', {
        movieId: scanResult.movieId,
        pathChanged: scanResult.pathChanged,
        oldPath: 'logged in scan service',
        newPath: mappedPath,
      });

      // Notify media players about the rename
      await this.notifyMediaPlayers(libraryId);

      logger.info('Media players notified after rename', { libraryId });
    } catch (error: any) {
      logger.error('Failed to process Rename webhook', {
        movieTitle: payload.movie.title,
        tmdbId: payload.movie.tmdbId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Handle Radarr MovieFileDelete event
   * Note: Soft delete functionality removed in clean schema
   * Movie records will remain in database when files are deleted
   */
  async handleRadarrMovieFileDelete(payload: RadarrWebhookPayload): Promise<void> {
    const db = this.dbManager.getConnection();

    if (!payload.movie) {
      logger.warn('MovieFileDelete webhook missing movie data');
      return;
    }

    logger.info('Processing Radarr MovieFileDelete event (HIGH)', {
      movieTitle: payload.movie.title,
      tmdbId: payload.movie.tmdbId,
    });

    // Log to activity_log
    await this.logWebhookActivity(db, 'radarr', 'MovieFileDelete', payload);

    try {
      // Find movie by TMDB ID
      const results = (await db.query(
        `SELECT id FROM movies WHERE tmdb_id = ?`,
        [payload.movie.tmdbId]
      )) as Array<{ id: number }>;

      if (results.length === 0) {
        logger.warn('Movie not found in database for deletion', {
          tmdbId: payload.movie.tmdbId,
          title: payload.movie.title,
        });
        return;
      }

      const movieId = results[0].id;

      // Note: Soft delete removed - movie will remain in database
      // Future enhancement: Implement status flag or hard delete
      logger.info('Movie file deleted (database record retained)', {
        movieId,
        tmdbId: payload.movie.tmdbId,
        title: payload.movie.title,
      });

      // TODO: Emit notification event 'movie.file.deleted'
    } catch (error: any) {
      logger.error('Failed to process MovieFileDelete webhook', {
        movieTitle: payload.movie.title,
        tmdbId: payload.movie.tmdbId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Log webhook activity to database
   */
  private async logWebhookActivity(
    db: DatabaseConnection,
    source: string,
    eventType: string,
    payload: any
  ): Promise<void> {
    try {
      await db.execute(
        `INSERT INTO activity_log (
          event_type,
          source,
          description,
          metadata,
          created_at
        ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        ['webhook', source, `${source} ${eventType} webhook received`, JSON.stringify(payload)]
      );
    } catch (error: any) {
      logger.error('Failed to log webhook activity', {
        source,
        eventType,
        error: error.message,
      });
      // Don't throw - logging failure shouldn't stop webhook processing
    }
  }

  /**
   * Notify all enabled media players to scan their libraries
   */
  private async notifyMediaPlayers(libraryId: number): Promise<void> {
    try {
      const db = this.dbManager.getConnection();

      // Get all enabled media players for this library
      const players = await db.query<{
        id: number;
        name: string;
        type: string;
      }>(
        `SELECT mp.id, mp.name, mp.type
         FROM media_players mp
         INNER JOIN media_player_libraries mpl ON mp.id = mpl.player_id
         WHERE mpl.library_id = ? AND mp.enabled = 1`,
        [libraryId]
      );

      if (players.length === 0) {
        logger.debug('No enabled media players found for library', { libraryId });
        return;
      }

      // Trigger scan for each player
      for (const player of players) {
        try {
          if (player.type === 'kodi') {
            const httpClient = this.mediaPlayerManager.getHttpClient(player.id);
            if (httpClient) {
              await httpClient.scanVideoLibrary();
              logger.info('Triggered library scan on media player', {
                playerId: player.id,
                playerName: player.name
              });
            } else {
              logger.warn('HTTP client not available for player', { playerId: player.id });
            }
          } else {
            logger.warn('Unsupported media player type', { type: player.type });
          }
        } catch (error: any) {
          logger.error('Failed to notify media player', {
            playerId: player.id,
            playerName: player.name,
            error: error.message
          });
          // Continue with other players even if one fails
        }
      }

    } catch (error: any) {
      logger.error('Failed to notify media players', {
        libraryId,
        error: error.message
      });
      // Don't throw - notification failure shouldn't stop webhook processing
    }
  }
}
