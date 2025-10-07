import { logger } from '../middleware/logging.js';
import { DatabaseManager } from '../database/DatabaseManager.js';
import { DatabaseConnection } from '../types/database.js';
import { RadarrWebhookPayload } from '../types/webhooks.js';
import { scanMovieDirectory, ScanContext } from './scan/unifiedScanService.js';
import { applyManagerPathMapping } from './pathMappingService.js';
import { markMovieForDeletion } from './scan/movieLookupService.js';

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

  constructor(dbManager: DatabaseManager) {
    this.dbManager = dbManager;
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

      // TODO: Emit notification event 'movie.download.complete'
      // TODO: Trigger media player library scan
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

      // TODO: Emit notification event 'movie.renamed'
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
   * File being deleted - mark for soft deletion with 7-day grace period
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
        `SELECT id FROM movies WHERE tmdb_id = ? AND deleted_on IS NULL`,
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

      // Mark for deletion (7-day grace period)
      await markMovieForDeletion(db, movieId, 'Radarr MovieFileDelete webhook');

      logger.info('Movie marked for deletion', {
        movieId,
        tmdbId: payload.movie.tmdbId,
        title: payload.movie.title,
        deleteOn: '7 days from now',
      });

      // TODO: Emit notification event 'movie.marked.for.deletion'
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
}
