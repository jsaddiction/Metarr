import { DatabaseManager } from '../database/DatabaseManager.js';
import { AssetCandidateService, AssetMetadata } from './assetCandidateService.js';
import { TMDBClient } from './providers/tmdb/TMDBClient.js';
import { logger } from '../middleware/logging.js';
import cron from 'node-cron';

/**
 * Scheduled Jobs Service
 *
 * Manages background scheduled jobs:
 * - updateAssets: Refresh asset candidates from providers (6h/12h/24h intervals)
 * - cleanupExpiredCache: Remove old asset candidates (30 days)
 * - checkProviderChanges: Use TMDB /changes API for optimization
 */

export interface UpdateAssetsJobConfig {
  interval: '6h' | '12h' | '24h';
  enabled: boolean;
  useChangesAPI: boolean; // Use TMDB /changes for optimization
}

export class ScheduledJobsService {
  private assetCandidateService: AssetCandidateService;
  private tmdbClient: TMDBClient | undefined;
  private updateAssetsTask: cron.ScheduledTask | null = null;
  private isRunning: boolean = false;

  constructor(
    private db: DatabaseManager,
    tmdbClient?: TMDBClient
  ) {
    this.assetCandidateService = new AssetCandidateService(db);
    this.tmdbClient = tmdbClient;
  }

  /**
   * Start all scheduled jobs
   */
  start(config: UpdateAssetsJobConfig): void {
    logger.info('Starting scheduled jobs service', config);

    if (config.enabled) {
      this.startUpdateAssetsJob(config);
    }
  }

  /**
   * Stop all scheduled jobs
   */
  stop(): void {
    logger.info('Stopping scheduled jobs service');

    if (this.updateAssetsTask) {
      this.updateAssetsTask.stop();
      this.updateAssetsTask = null;
    }
  }

  /**
   * Start the updateAssets job
   *
   * Runs on schedule to refresh asset candidates from providers.
   * Uses TMDB /changes API for optimization if enabled.
   */
  private startUpdateAssetsJob(config: UpdateAssetsJobConfig): void {
    // Convert interval to cron schedule
    const cronSchedule = this.intervalToCron(config.interval);

    logger.info('Starting updateAssets job', {
      interval: config.interval,
      cronSchedule,
      useChangesAPI: config.useChangesAPI
    });

    this.updateAssetsTask = cron.schedule(cronSchedule, async () => {
      if (this.isRunning) {
        logger.warn('updateAssets job already running, skipping this cycle');
        return;
      }

      try {
        this.isRunning = true;
        await this.runUpdateAssetsJob(config.useChangesAPI);
      } catch (error: any) {
        logger.error('updateAssets job failed', {
          error: error.message
        });
      } finally {
        this.isRunning = false;
      }
    });

    logger.info('updateAssets job scheduled', {
      nextRun: this.updateAssetsTask.nextDates(1)[0]
    });
  }

  /**
   * Convert interval to cron schedule
   */
  private intervalToCron(interval: string): string {
    switch (interval) {
      case '6h':
        return '0 */6 * * *'; // Every 6 hours
      case '12h':
        return '0 */12 * * *'; // Every 12 hours
      case '24h':
        return '0 0 * * *'; // Daily at midnight
      default:
        return '0 */12 * * *'; // Default: 12 hours
    }
  }

  /**
   * Run the updateAssets job (force run)
   *
   * Can be called manually via API or by scheduled task.
   * Refreshes asset candidates for all monitored entities.
   *
   * @param useChangesAPI - Use TMDB /changes for optimization
   * @returns Job statistics
   */
  async runUpdateAssetsJob(useChangesAPI: boolean = true): Promise<{
    processed: number;
    updated: number;
    skipped: number;
    errors: number;
  }> {
    logger.info('Running updateAssets job', { useChangesAPI });

    const startTime = Date.now();
    let processed = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    try {
      const conn = this.db.getConnection();

      // Get all monitored movies with TMDB IDs
      const movies = await conn.query<{
        id: number;
        title: string;
        tmdb_id: number;
        monitored: number;
      }>(
        `SELECT id, title, tmdb_id, monitored
         FROM movies
         WHERE tmdb_id IS NOT NULL AND monitored = 1
         ORDER BY id`
      );

      logger.info(`Found ${movies.length} monitored movies to process`);

      for (const movie of movies) {
        processed++;

        try {
          // Check if we need to refresh this movie
          const needsRefresh = await this.checkNeedsRefresh(
            'movie',
            movie.id,
            'tmdb',
            useChangesAPI
          );

          if (!needsRefresh && useChangesAPI) {
            skipped++;
            logger.debug(`Skipping movie ${movie.id} (${movie.title}) - no changes detected`);
            continue;
          }

          // Fetch asset candidates from TMDB
          if (this.tmdbClient) {
            await this.refreshMovieAssets(movie.id, movie.tmdb_id);
            updated++;

            logger.debug(`Updated assets for movie ${movie.id} (${movie.title})`);

            // Update refresh log
            await this.updateRefreshLog('movie', movie.id, 'tmdb');
          }

          // Rate limiting: wait 100ms between movies (10 req/sec)
          await this.sleep(100);
        } catch (error: any) {
          errors++;
          logger.error(`Failed to update assets for movie ${movie.id}`, {
            title: movie.title,
            error: error.message
          });
        }
      }

      const duration = Date.now() - startTime;

      logger.info('updateAssets job completed', {
        processed,
        updated,
        skipped,
        errors,
        duration: `${duration}ms`
      });

      return { processed, updated, skipped, errors };
    } catch (error: any) {
      logger.error('updateAssets job failed', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Check if entity needs refresh
   *
   * Uses provider_refresh_log to determine if assets need updating.
   * If useChangesAPI is true, queries TMDB /changes endpoint.
   *
   * @param entityType - Entity type
   * @param entityId - Entity ID
   * @param provider - Provider name
   * @param useChangesAPI - Use TMDB /changes optimization
   * @returns true if refresh needed
   */
  private async checkNeedsRefresh(
    entityType: string,
    entityId: number,
    provider: string,
    useChangesAPI: boolean
  ): Promise<boolean> {
    try {
      const conn = this.db.getConnection();

      // Check refresh log
      const log = await conn.query<{
        last_checked: Date;
        last_modified: Date | null;
        needs_refresh: number;
      }>(
        `SELECT last_checked, last_modified, needs_refresh
         FROM provider_refresh_log
         WHERE entity_type = ? AND entity_id = ? AND provider = ?`,
        [entityType, entityId, provider]
      );

      if (log.length === 0) {
        // Never checked, needs refresh
        return true;
      }

      const record = log[0];

      // If manually flagged for refresh
      if (record.needs_refresh === 1) {
        return true;
      }

      if (!useChangesAPI) {
        // Always refresh if not using changes API
        return true;
      }

      // TODO: Implement TMDB /changes API check
      // For now, refresh if last_checked > 7 days
      const lastChecked = new Date(record.last_checked);
      const daysSinceCheck = (Date.now() - lastChecked.getTime()) / (1000 * 60 * 60 * 24);

      return daysSinceCheck > 7;
    } catch (error: any) {
      logger.error('Failed to check refresh status', {
        entityType,
        entityId,
        provider,
        error: error.message
      });
      // On error, assume refresh needed (safe default)
      return true;
    }
  }

  /**
   * Refresh movie asset candidates from TMDB
   *
   * Fetches latest images and caches them with scores.
   *
   * @param movieId - Movie ID
   * @param tmdbId - TMDB movie ID
   */
  private async refreshMovieAssets(movieId: number, tmdbId: number): Promise<void> {
    if (!this.tmdbClient) {
      throw new Error('TMDB client not configured');
    }

    try {
      // Fetch images from TMDB
      const images = await this.tmdbClient.getMovieImages(tmdbId);

      // Cache posters
      if (images.posters && images.posters.length > 0) {
        const posterAssets: AssetMetadata[] = images.posters.map((poster: any) => ({
          url: `https://image.tmdb.org/t/p/original${poster.file_path}`,
          width: poster.width,
          height: poster.height,
          language: poster.iso_639_1,
          vote_average: poster.vote_average,
          vote_count: poster.vote_count
        }));

        await this.assetCandidateService.cacheAssetCandidates(
          'movie',
          movieId,
          'poster',
          'tmdb',
          posterAssets
        );
      }

      // Cache fanart (backdrops)
      if (images.backdrops && images.backdrops.length > 0) {
        const fanartAssets: AssetMetadata[] = images.backdrops.map((backdrop: any) => ({
          url: `https://image.tmdb.org/t/p/original${backdrop.file_path}`,
          width: backdrop.width,
          height: backdrop.height,
          language: backdrop.iso_639_1,
          vote_average: backdrop.vote_average,
          vote_count: backdrop.vote_count
        }));

        await this.assetCandidateService.cacheAssetCandidates(
          'movie',
          movieId,
          'fanart',
          'tmdb',
          fanartAssets
        );
      }

      // Cache logos
      if (images.logos && images.logos.length > 0) {
        const logoAssets: AssetMetadata[] = images.logos.map((logo: any) => ({
          url: `https://image.tmdb.org/t/p/original${logo.file_path}`,
          width: logo.width,
          height: logo.height,
          language: logo.iso_639_1,
          vote_average: logo.vote_average,
          vote_count: logo.vote_count
        }));

        await this.assetCandidateService.cacheAssetCandidates(
          'movie',
          movieId,
          'clearlogo',
          'tmdb',
          logoAssets
        );
      }
    } catch (error: any) {
      logger.error('Failed to refresh movie assets', {
        movieId,
        tmdbId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Update provider refresh log
   *
   * Records that we checked this entity with this provider.
   *
   * @param entityType - Entity type
   * @param entityId - Entity ID
   * @param provider - Provider name
   */
  private async updateRefreshLog(
    entityType: string,
    entityId: number,
    provider: string
  ): Promise<void> {
    try {
      const conn = this.db.getConnection();

      await conn.execute(
        `INSERT INTO provider_refresh_log
         (entity_type, entity_id, provider, last_checked, last_modified, needs_refresh)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0)
         ON CONFLICT(entity_type, entity_id, provider)
         DO UPDATE SET
           last_checked = CURRENT_TIMESTAMP,
           last_modified = CURRENT_TIMESTAMP,
           needs_refresh = 0`,
        [entityType, entityId, provider]
      );
    } catch (error: any) {
      logger.error('Failed to update refresh log', {
        entityType,
        entityId,
        provider,
        error: error.message
      });
      // Non-critical error, don't throw
    }
  }

  /**
   * Sleep helper for rate limiting
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get job status
   */
  getStatus(): {
    updateAssets: {
      enabled: boolean;
      running: boolean;
      nextRun: Date | null;
    };
  } {
    return {
      updateAssets: {
        enabled: this.updateAssetsTask !== null,
        running: this.isRunning,
        nextRun: this.updateAssetsTask ? this.updateAssetsTask.nextDates(1)[0] : null
      }
    };
  }
}
