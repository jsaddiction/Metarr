import { DatabaseConnection } from '../../types/database.js';
import { Job, JobQueueService } from '../jobQueueService.js';
import { NotificationConfigService } from '../notificationConfigService.js';
import { logger } from '../../middleware/logging.js';

/**
 * WebhookJobHandlers
 *
 * Handles webhook processing and coordination:
 * - Webhook fan-out (create scan + notification jobs)
 * - Movie scanning workflow coordination
 *
 * These handlers implement the fan-out pattern where a single webhook
 * creates multiple independent jobs for better parallelization and failure isolation.
 *
 * NOTE: This is stub code for future webhook integration.
 * Currently focusing on manual operations only.
 */
export class WebhookJobHandlers {
  constructor(
    private db: DatabaseConnection,
    private jobQueue: JobQueueService,
    private notificationConfig: NotificationConfigService
  ) {}

  /**
   * Register all webhook-related handlers
   */
  registerHandlers(jobQueue: JobQueueService): void {
    jobQueue.registerHandler('webhook-received', this.handleWebhookReceived.bind(this));
    jobQueue.registerHandler('scan-movie', this.handleScanMovie.bind(this));
  }

  /**
   * Handle webhook from Sonarr/Radarr/Lidarr (FAN-OUT COORDINATOR)
   *
   * This is the fan-out handler that receives webhooks and creates multiple jobs:
   * - scan-movie (HIGH priority)
   * - notify-kodi, notify-jellyfin, notify-discord, etc. (NORMAL priority)
   *
   * Benefits:
   * - Non-blocking webhook processing (responds instantly)
   * - Independent failure handling (one notification failure doesn't affect others)
   * - Individual retry logic per notification service
   * - Better observability (see each notification job separately)
   *
   * Payload: {
   *   source: 'radarr' | 'sonarr' | 'lidarr',
   *   eventType: 'Download' | 'Test' | 'Grab' | 'Rename',
   *   movie?: { id, title, year, path, tmdbId, imdbId },
   *   series?: { id, title, tvdbId, path },
   *   episodes?: [{ id, episodeNumber, seasonNumber, path }]
   * }
   */
  private async handleWebhookReceived(job: Job): Promise<void> {
    const payload = job.payload as {
      source: 'radarr' | 'sonarr' | 'lidarr';
      eventType: string;
      movie?: { folderPath?: string; path?: string; title?: string };
      [key: string]: unknown;
    };
    const { source, eventType } = payload;

    logger.info('[WebhookJobHandlers] Processing webhook (fan-out coordinator)', {
      service: 'WebhookJobHandlers',
      handler: 'handleWebhookReceived',
      jobId: job.id,
      source,
      eventType,
    });

    // NOTE: Webhook processing is now always enabled - configuration controls behavior
    // All phases ALWAYS run in sequence

    // Only process Download events for now
    if (eventType !== 'Download') {
      logger.info('[WebhookJobHandlers] Ignoring non-Download event', {
        service: 'WebhookJobHandlers',
        handler: 'handleWebhookReceived',
        jobId: job.id,
        eventType,
      });
      return;
    }

    // Find library ID for path (needed for notifications)
    let libraryId: number | null = null;

    if (source === 'radarr' && payload.movie) {
      // Apply path mapping and find library
      const { applyManagerPathMapping } = await import('../pathMappingService.js');
      const mappedPath = await applyManagerPathMapping(
        this.db,
        'radarr',
        (payload.movie.folderPath || payload.movie.path)!
      );

      // Find library by path
      const libraries = await this.db.query<{ id: number }>(
        `SELECT id FROM libraries WHERE ? LIKE path || '%' ORDER BY LENGTH(path) DESC LIMIT 1`,
        [mappedPath]
      );

      if (libraries.length > 0) {
        libraryId = libraries[0].id;
      }
    }

    // Fan-out: Create scan job (HIGH priority 3)
    if (source === 'radarr' && payload.movie) {
      // Skip if no library found
      if (!libraryId) {
        logger.warn('[WebhookJobHandlers] No library found for movie path, skipping', {
          service: 'WebhookJobHandlers',
          handler: 'handleWebhookReceived',
          webhookJobId: job.id,
          moviePath: payload.movie.folderPath || payload.movie.path,
        });
        return;
      }

      const scanJobId = await this.jobQueue.addJob({
        type: 'scan-movie',
        priority: 3, // HIGH priority (user-triggered by download)
        payload: {
          movie: payload.movie,
          libraryId,
        } as any, // Temporary cast until we update payload types
        retry_count: 0,
        max_retries: 3,
      });

      logger.info('[WebhookJobHandlers] Created scan-movie job', {
        service: 'WebhookJobHandlers',
        handler: 'handleWebhookReceived',
        webhookJobId: job.id,
        scanJobId,
        movieTitle: payload.movie.title,
        libraryId,
      });
    } else if (source === 'sonarr' && payload.series) {
      // TODO: Implement series webhook handling
      logger.info('[WebhookJobHandlers] Series webhook handling not yet implemented', {
        service: 'WebhookJobHandlers',
        handler: 'handleWebhookReceived',
        jobId: job.id,
      });
      return;
    }

    // Fan-out: Create notification jobs (NORMAL priority 5-7)
    const enabledServices = await this.notificationConfig.getEnabledServices();

    logger.info('[WebhookJobHandlers] Creating notification jobs', {
      service: 'WebhookJobHandlers',
      handler: 'handleWebhookReceived',
      webhookJobId: job.id,
      enabledServices,
      libraryId,
    });

    // Create job for each enabled notification service
    for (const service of enabledServices) {
      const notifyJobId = await this.jobQueue.addJob({
        type: `notify-${service}` as any,
        priority: 5, // NORMAL priority
        payload: {
          webhookPayload: payload, // Pass entire webhook payload
          libraryId: libraryId!, // Non-null asserted - we checked above
        } as any, // Temporary cast until we update payload types
        retry_count: 0,
        max_retries: 2, // Fewer retries for notifications
      });

      logger.info('[WebhookJobHandlers] Created notification job', {
        service: 'WebhookJobHandlers',
        handler: 'handleWebhookReceived',
        webhookJobId: job.id,
        notifyJobId,
        notificationService: service,
      });
    }

    logger.info('[WebhookJobHandlers] Webhook fan-out complete', {
      service: 'WebhookJobHandlers',
      handler: 'handleWebhookReceived',
      webhookJobId: job.id,
      jobsCreated: 1 + enabledServices.length, // scan + notifications
    });
  }

  /**
   * Handle scan-movie job (JOB CHAINING PATTERN)
   *
   * This handler:
   * 1. Inserts/updates movie in database
   * 2. Chains to enrich-metadata job
   *
   * Payload: {
   *   movie: { id, title, year, path, tmdbId, imdbId, folderPath },
   *   libraryId: number
   * }
   */
  private async handleScanMovie(job: Job<'scan-movie'>): Promise<void> {
    const { movie, libraryId } = (job.payload as any) as {
      movie: { id: number; title: string; year?: number; path: string; tmdbId?: number; imdbId?: string; folderPath?: string };
      libraryId: number;
    };

    logger.info('[WebhookJobHandlers] Processing movie scan', {
      service: 'WebhookJobHandlers',
      handler: 'handleScanMovie',
      jobId: job.id,
      movieTitle: movie.title,
      movieYear: movie.year,
    });

    // 1. Check if movie exists in database
    const existing = await this.db.query<{ id: number }>(
      `SELECT id FROM movies WHERE radarr_id = ?`,
      [movie.id]
    );

    let movieId: number;

    if (existing.length === 0) {
      // Insert new movie
      const result = await this.db.execute(
        `INSERT INTO movies (library_id, title, year, radarr_id, tmdb_id, imdb_id, file_path, identification_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'identified')`,
        [libraryId, movie.title, movie.year, movie.id, movie.tmdbId, movie.imdbId, movie.path]
      );
      movieId = result.insertId!;
      logger.info(`[WebhookJobHandlers] Created movie ${movieId}: ${movie.title} (${movie.year})`);
    } else {
      movieId = existing[0].id;
      // Update existing movie
      await this.db.execute(
        `UPDATE movies SET title = ?, year = ?, tmdb_id = ?, imdb_id = ?, file_path = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [movie.title, movie.year, movie.tmdbId, movie.imdbId, movie.path, movieId]
      );
      logger.info(`[WebhookJobHandlers] Updated movie ${movieId}: ${movie.title} (${movie.year})`);
    }

    // 2. Check library auto-enrich setting
    const library = await this.db.query<{ id: number; name: string; auto_enrich: number }>(
      `SELECT id, name, auto_enrich FROM libraries WHERE id = ?`,
      [libraryId]
    );

    if (library.length === 0) {
      logger.error('[WebhookJobHandlers] Library not found after movie scan', {
        service: 'WebhookJobHandlers',
        handler: 'handleScanMovie',
        jobId: job.id,
        libraryId,
      });
      return;
    }

    const autoEnrich = Boolean(library[0].auto_enrich);

    if (autoEnrich) {
      // Chain to enrich-metadata job
      const enrichJobId = await this.jobQueue.addJob({
        type: 'enrich-metadata',
        priority: 3, // Maintain HIGH priority from webhook
        payload: {
          entityType: 'movie',
          entityId: movieId,
        },
        retry_count: 0,
        max_retries: 3,
      });

      logger.info('[WebhookJobHandlers] Movie scan complete, library has auto-enrich enabled, chained to enrich-metadata', {
        service: 'WebhookJobHandlers',
        handler: 'handleScanMovie',
        jobId: job.id,
        movieId,
        movieTitle: movie.title,
        libraryId: library[0].id,
        libraryName: library[0].name,
        enrichJobId,
      });
    } else {
      logger.info('[WebhookJobHandlers] Movie scan complete, library has auto-enrich disabled, stopping workflow', {
        service: 'WebhookJobHandlers',
        handler: 'handleScanMovie',
        jobId: job.id,
        movieId,
        movieTitle: movie.title,
        libraryId: library[0].id,
        libraryName: library[0].name,
      });
    }
  }
}
