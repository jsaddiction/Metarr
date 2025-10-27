import { logger } from '../middleware/logging.js';
import { DatabaseManager } from '../database/DatabaseManager.js';
import { DatabaseConnection } from '../types/database.js';
import { RadarrWebhookPayload } from '../types/webhooks.js';
import { scanMovieDirectory, ScanContext } from './scan/unifiedScanService.js';
import { applyManagerPathMapping } from './pathMappingService.js';
import { MediaPlayerConnectionManager } from './mediaPlayerConnectionManager.js';
import { getErrorMessage } from '../utils/errorHandling.js';

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
  private jobQueue: any; // JobQueueService - will be injected

  constructor(dbManager: DatabaseManager, mediaPlayerManager: MediaPlayerConnectionManager, jobQueue?: any) {
    this.dbManager = dbManager;
    this.mediaPlayerManager = mediaPlayerManager;
    this.jobQueue = jobQueue;
  }

  /**
   * Handle Radarr Grab event
   * Queued for download - check if currently playing
   * @returns undefined (no job created for Grab events)
   */
  async handleRadarrGrab(payload: RadarrWebhookPayload): Promise<number | undefined> {
    const db = this.dbManager.getConnection();

    if (!payload.movie) {
      logger.warn('Grab webhook missing movie data');
      return undefined;
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

    return undefined; // No job created for Grab events
  }

  /**
   * Handle Radarr Download event
   * Download complete - create scan job
   * @returns Job ID for tracking
   */
  async handleRadarrDownload(payload: RadarrWebhookPayload): Promise<number | undefined> {
    const db = this.dbManager.getConnection();

    if (!payload.movie || !payload.movieFile) {
      logger.warn('Download webhook missing movie or file data');
      return undefined;
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

      // Create background job if job queue available
      if (this.jobQueue) {
        const jobId = await this.jobQueue.addJob({
          type: 'scan-movie',
          priority: 2, // CRITICAL - webhook triggered
          payload: {
            libraryId,
            moviePath: mappedPath,
            scanContext,
          },
          retry_count: 0,
          max_retries: 3,
        });

        logger.info('Created scan job for webhook download', {
          jobId,
          libraryId,
          moviePath: mappedPath,
        });

        return jobId;
      } else {
        // Fallback: Run scan synchronously if no job queue (shouldn't happen in production)
        logger.warn('No job queue available, running scan synchronously');

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

        return undefined;
      }
    } catch (error) {
      logger.error('Failed to process Download webhook', {
        movieTitle: payload.movie.title,
        tmdbId: payload.movie.tmdbId,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Handle Radarr Rename event
   * File renamed - create scan job to update path
   * @returns Job ID for tracking
   */
  async handleRadarrRename(payload: RadarrWebhookPayload): Promise<number | undefined> {
    const db = this.dbManager.getConnection();

    if (!payload.movie || !payload.movieFile) {
      logger.warn('Rename webhook missing movie or file data');
      return undefined;
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

      // Create background job if job queue available
      if (this.jobQueue) {
        const jobId = await this.jobQueue.addJob({
          type: 'scan-movie',
          priority: 3, // HIGH - webhook triggered rename
          payload: {
            libraryId,
            moviePath: mappedPath,
            scanContext,
          },
          retry_count: 0,
          max_retries: 3,
        });

        logger.info('Created scan job for webhook rename', {
          jobId,
          libraryId,
          moviePath: mappedPath,
        });

        return jobId;
      } else {
        // Fallback: Run scan synchronously
        logger.warn('No job queue available, running scan synchronously');

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

        return undefined;
      }
    } catch (error) {
      logger.error('Failed to process Rename webhook', {
        movieTitle: payload.movie.title,
        tmdbId: payload.movie.tmdbId,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Handle Radarr MovieFileDelete event
   * Note: Soft delete functionality removed in clean schema
   * Movie records will remain in database when files are deleted
   * @returns undefined (no job created for delete events)
   */
  async handleRadarrMovieFileDelete(payload: RadarrWebhookPayload): Promise<number | undefined> {
    const db = this.dbManager.getConnection();

    if (!payload.movie) {
      logger.warn('MovieFileDelete webhook missing movie data');
      return undefined;
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
        return undefined;
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
      return undefined; // No job created
    } catch (error) {
      logger.error('Failed to process MovieFileDelete webhook', {
        movieTitle: payload.movie.title,
        tmdbId: payload.movie.tmdbId,
        error: getErrorMessage(error),
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
    payload: unknown
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
    } catch (error) {
      logger.error('Failed to log webhook activity', {
        source,
        eventType,
        error: getErrorMessage(error),
      });
      // Don't throw - logging failure shouldn't stop webhook processing
    }
  }

  /**
   * Handle Radarr HealthIssue event
   * Log health issue with severity and emit notification
   * @returns undefined (no job created for health events)
   */
  async handleRadarrHealthIssue(payload: RadarrWebhookPayload): Promise<number | undefined> {
    const db = this.dbManager.getConnection();

    logger.warn('Processing Radarr HealthIssue event', {
      level: payload.level,
      type: payload.type,
      message: payload.message,
    });

    // Map level to severity
    const severityMap: Record<string, string> = {
      'Ok': 'info',
      'Notice': 'info',
      'Warning': 'warning',
      'Error': 'error',
    };
    const severity = severityMap[payload.level || 'Warning'] || 'warning';

    // Log to activity_log with severity
    try {
      await db.execute(
        `INSERT INTO activity_log (
          event_type,
          source,
          description,
          metadata,
          severity,
          created_at
        ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          'webhook',
          'radarr',
          `Radarr Health Issue: ${payload.message || payload.type || 'Unknown issue'}`,
          JSON.stringify(payload),
          severity,
        ]
      );
    } catch (error) {
      logger.error('Failed to log HealthIssue webhook', { error: getErrorMessage(error) });
    }

    // TODO: Emit notification event for user alerts (Stage 7+)
    logger.info('Health issue logged', {
      type: payload.type,
      severity,
      wikiUrl: payload.wikiUrl,
    });

    return undefined; // No job created
  }

  /**
   * Handle Radarr HealthRestored event
   * Log health restoration
   * @returns undefined (no job created for health events)
   */
  async handleRadarrHealthRestored(payload: RadarrWebhookPayload): Promise<number | undefined> {
    const db = this.dbManager.getConnection();

    logger.info('Processing Radarr HealthRestored event', {
      message: payload.message,
    });

    // Log to activity_log
    await this.logWebhookActivity(db, 'radarr', 'HealthRestored', payload);

    // TODO: Emit notification event for user alerts (Stage 7+)
    logger.info('Health restored', { message: payload.message });

    return undefined; // No job created
  }

  /**
   * Handle Radarr ApplicationUpdate event
   * Log application version update
   * @returns undefined (no job created for update events)
   */
  async handleRadarrApplicationUpdate(payload: RadarrWebhookPayload): Promise<number | undefined> {
    const db = this.dbManager.getConnection();

    logger.info('Processing Radarr ApplicationUpdate event', {
      previousVersion: payload.previousVersion,
      newVersion: payload.newVersion,
      message: payload.message,
    });

    // Log to activity_log
    await this.logWebhookActivity(db, 'radarr', 'ApplicationUpdate', payload);

    logger.info('Application update logged', {
      from: payload.previousVersion,
      to: payload.newVersion,
    });

    return undefined; // No job created
  }

  /**
   * Handle Radarr ManualInteractionRequired event
   * Log manual interaction needed and emit notification
   * @returns undefined (no job created for notification events)
   */
  async handleRadarrManualInteractionRequired(payload: RadarrWebhookPayload): Promise<number | undefined> {
    const db = this.dbManager.getConnection();

    logger.warn('Processing Radarr ManualInteractionRequired event', {
      message: payload.message,
      movieTitle: payload.movie?.title,
    });

    // Log to activity_log with warning severity
    try {
      await db.execute(
        `INSERT INTO activity_log (
          event_type,
          source,
          description,
          metadata,
          severity,
          created_at
        ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          'webhook',
          'radarr',
          `Manual Interaction Required: ${payload.message || 'User action needed'}`,
          JSON.stringify(payload),
          'warning',
        ]
      );
    } catch (error) {
      logger.error('Failed to log ManualInteractionRequired webhook', { error: getErrorMessage(error) });
    }

    // TODO: Emit notification event for user alerts (Stage 7+)
    logger.info('Manual interaction logged', {
      movieTitle: payload.movie?.title,
      message: payload.message,
    });

    return undefined; // No job created
  }

  /**
   * Handle generic webhook events (placeholder for Stage 9/10)
   * Used for Radarr info events (MovieAdded/MovieDeleted) and all Sonarr/Lidarr events
   * Just log events to activity_log for now
   * @returns undefined (no job created for generic events)
   */
  async handleGenericEvent(
    source: 'radarr' | 'sonarr' | 'lidarr',
    eventType: string,
    payload: unknown
  ): Promise<number | undefined> {
    const db = this.dbManager.getConnection();

    const stageMap = { radarr: 'N/A', sonarr: '9', lidarr: '10' };
    const stage = stageMap[source];

    logger.info(`Processing ${source} ${eventType} event${stage !== 'N/A' ? ` (full support in Stage ${stage})` : ''}`, {
      eventType,
      source,
    });

    // Log to activity_log
    await this.logWebhookActivity(db, source, eventType, payload);

    return undefined; // No job created
  }

  /**
   * Notify all enabled media player groups to scan their libraries
   * Group-aware: Scans one instance per group (not all instances)
   * Fallback: If primary instance fails, tries next instance in group
   */
  private async notifyMediaPlayers(libraryId: number): Promise<void> {
    try {
      const db = this.dbManager.getConnection();

      // Get library path for path mapping
      const libraries = await db.query<{ path: string }>(
        'SELECT path FROM libraries WHERE id = ?',
        [libraryId]
      );

      if (libraries.length === 0) {
        logger.warn('Library not found', { libraryId });
        return;
      }

      const libraryPath = libraries[0].path;

      // Get all groups that manage this library
      const groups = await db.query<{
        id: number;
        name: string;
        type: string;
      }>(
        `SELECT DISTINCT mpg.id, mpg.name, mpg.type
         FROM media_player_groups mpg
         INNER JOIN media_player_libraries mpl ON mpg.id = mpl.group_id
         WHERE mpl.library_id = ?`,
        [libraryId]
      );

      if (groups.length === 0) {
        logger.debug('No media player groups manage this library', { libraryId });
        return;
      }

      // Trigger scan for each group (one instance per group)
      for (const group of groups) {
        try {
          await this.triggerGroupScan(group.id, libraryPath);
        } catch (error) {
          logger.error('Failed to trigger scan for group', {
            groupId: group.id,
            groupName: group.name,
            error: getErrorMessage(error),
          });
          // Continue with other groups even if one fails
        }
      }
    } catch (error) {
      logger.error('Failed to notify media players', {
        libraryId,
        error: getErrorMessage(error),
      });
      // Don't throw - notification failure shouldn't stop webhook processing
    }
  }

  /**
   * Trigger scan on one instance in a media player group
   * Implements fallback: tries next instance if first fails
   */
  private async triggerGroupScan(groupId: number, libraryPath: string): Promise<void> {
    const db = this.dbManager.getConnection();

    // Get all enabled players in this group, ordered by ID (first = primary)
    const players = await db.query<{
      id: number;
      name: string;
      type: string;
    }>(
      `SELECT id, name, type
       FROM media_players
       WHERE group_id = ? AND enabled = 1
       ORDER BY id ASC`,
      [groupId]
    );

    if (players.length === 0) {
      logger.warn('No enabled players in group', { groupId });
      return;
    }

    // Apply group-level path mapping (Metarr path → Group path)
    let mappedPath: string;
    try {
      const { applyGroupPathMapping } = await import('./pathMappingService.js');
      mappedPath = await applyGroupPathMapping(db, groupId, libraryPath);
      logger.debug('Applied group path mapping for scan', {
        groupId,
        metarrPath: libraryPath,
        mappedPath,
      });
    } catch (error) {
      logger.warn('Group path mapping failed, using original path', {
        groupId,
        libraryPath,
        error: getErrorMessage(error),
      });
      mappedPath = libraryPath;
    }

    // Try to scan on first available player (with fallback)
    for (const player of players) {
      try {
        if (player.type !== 'kodi') {
          logger.warn('Unsupported player type in group', {
            playerId: player.id,
            type: player.type,
          });
          continue;
        }

        const httpClient = this.mediaPlayerManager.getHttpClient(player.id);
        if (!httpClient) {
          logger.warn('HTTP client not available, trying next player', {
            playerId: player.id,
          });
          continue;
        }

        // Trigger scan with mapped path
        await httpClient.scanVideoLibrary({ directory: mappedPath });

        logger.info('Triggered library scan on group primary', {
          groupId,
          playerId: player.id,
          playerName: player.name,
          path: mappedPath,
        });

        return; // Success - exit after first successful scan
      } catch (error) {
        logger.warn('Failed to scan on player, trying next in group', {
          groupId,
          playerId: player.id,
          playerName: player.name,
          error: getErrorMessage(error),
        });
        // Continue to next player (fallback)
      }
    }

    // All players in group failed
    logger.error('Failed to trigger scan on any player in group', { groupId });
  }
}
