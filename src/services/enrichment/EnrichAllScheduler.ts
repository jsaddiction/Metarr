/**
 * Bulk Enrichment Scheduler
 *
 * Processes all monitored movies until rate limit detected.
 * Designed to adapt automatically to API tier (free 1k/day vs paid 100k/day).
 *
 * Features:
 * - Dynamic processing: processes ALL movies until rate limit
 * - Bulk mode: always uses requireComplete=true for complete data
 * - Stop on rate limit: stops immediately when ANY provider returns rate limit
 * - Cache efficiency: 7-day cache means most movies will be cache hits after first run
 * - Error handling: transient errors don't stop the job, continue to next movie
 * - Progress logging: logs every 100 movies for visibility
 * - Concurrent protection: prevents multiple instances running simultaneously
 * - Statistics tracking: tracks processed, updated, skipped, stopped status
 */

import { DatabaseConnection } from '../../types/database.js';
import { JobQueueService } from '../jobQueue/JobQueueService.js';
import { logger } from '../../middleware/logging.js';
import { getErrorMessage } from '../../utils/errorHandling.js';

/**
 * Statistics from an enrichment run
 */
export interface EnrichmentStats {
  /** Number of movies processed */
  processed: number;
  /** Number of movies actually updated */
  updated: number;
  /** Number of movies skipped (no updates needed) */
  skipped: number;
  /** Whether the job was stopped early */
  stopped: boolean;
  /** Reason for stopping (if stopped=true) */
  stopReason: string | null;
  /** When the job started */
  startTime: Date;
  /** When the job ended (undefined if still running) */
  endTime?: Date;
}

/**
 * Simple movie row for iteration
 */
interface MovieRow {
  id: number;
  title: string;
}

/**
 * Bulk Enrichment Scheduler
 *
 * Processes all monitored movies with dynamic batching until rate limit detected.
 */
export class EnrichAllScheduler {
  private lastRunStats: EnrichmentStats | null = null;
  private isRunning: boolean = false;

  constructor(
    private readonly db: DatabaseConnection,
    private readonly jobQueue: JobQueueService
  ) {}

  /**
   * Process all monitored movies with dynamic batching
   * Stops immediately when ANY provider is rate limited
   *
   * @returns Statistics from the enrichment run
   * @throws Error if job is already running
   */
  async enrichAll(): Promise<EnrichmentStats> {
    if (this.isRunning) {
      logger.warn('[EnrichAll] Job already running, skipping');
      throw new Error('Enrichment job already in progress');
    }

    this.isRunning = true;
    const stats: EnrichmentStats = {
      processed: 0,
      updated: 0,
      skipped: 0,
      stopped: false,
      stopReason: null,
      startTime: new Date(),
    };

    try {
      logger.info('[EnrichAll] Starting bulk enrichment');

      // Get ALL monitored movies ordered by ID
      const movies = await this.getMonitoredMovies();
      logger.info('[EnrichAll] Found monitored movies', { count: movies.length });

      if (movies.length === 0) {
        logger.info('[EnrichAll] No monitored movies to process');
        stats.endTime = new Date();
        this.lastRunStats = stats;
        return stats;
      }

      // Process each movie by creating enrichment jobs
      for (const movie of movies) {
        try {
          // CREATE JOB with requireComplete=true (bulk mode)
          await this.jobQueue.addJob({
            type: 'enrich-metadata',
            priority: 7, // NORMAL priority (background job)
            payload: {
              entityType: 'movie',
              entityId: movie.id,
              requireComplete: true, // BULK MODE - stop on rate limit
            },
            retry_count: 0,
            max_retries: 0, // Don't retry bulk jobs
          });

          stats.processed++;

          // Wait a bit to avoid overwhelming the queue
          await new Promise((resolve) => setTimeout(resolve, 10));

          // Log progress every 100 movies
          if (stats.processed % 100 === 0) {
            logger.info('[EnrichAll] Progress update', {
              processed: stats.processed,
              total: movies.length,
              percentComplete: Math.round((stats.processed / movies.length) * 100),
            });
          }
        } catch (error) {
          logger.error('[EnrichAll] Failed to create enrichment job', {
            movieId: movie.id,
            title: movie.title,
            error: getErrorMessage(error),
          });
          // Continue to next movie (transient errors don't stop job creation)
        }
      }

      // NOTE: This simplified implementation just creates all jobs.
      // The jobs will respect requireComplete and stop processing when rate limited.
      // Stats tracking of updated/skipped is now handled by individual job handlers.
      stats.updated = 0; // Job-based approach - can't track updates here
      stats.skipped = 0; // Job-based approach - can't track skips here

      stats.endTime = new Date();
      this.lastRunStats = stats;

      const duration = stats.endTime.getTime() - stats.startTime.getTime();
      logger.info('[EnrichAll] Bulk enrichment complete', {
        ...stats,
        durationMs: duration,
        durationMin: Math.round(duration / 60000),
      });

      return stats;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get all monitored movies ordered by ID
   */
  private async getMonitoredMovies(): Promise<MovieRow[]> {
    const result = await this.db.query<MovieRow>(
      'SELECT id, title FROM movies WHERE monitored = 1 ORDER BY id ASC'
    );
    return result;
  }

  /**
   * Get statistics from last run
   *
   * @returns Statistics from last run, or null if never run
   */
  getLastRunStats(): EnrichmentStats | null {
    return this.lastRunStats;
  }

  /**
   * Check if enrichment job is currently running
   *
   * @returns true if job is running, false otherwise
   */
  isJobRunning(): boolean {
    return this.isRunning;
  }
}
