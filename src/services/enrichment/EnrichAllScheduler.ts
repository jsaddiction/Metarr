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
import { MetadataEnrichmentService } from './MetadataEnrichmentService.js';
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
    private readonly enrichmentService: MetadataEnrichmentService
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

      // Process each movie until rate limit hit
      for (const movie of movies) {
        try {
          // Enrich with requireComplete = true (bulk mode)
          const result = await this.enrichmentService.enrichMovie(movie.id, true);

          stats.processed++;

          // Check if we hit rate limit
          if (result.rateLimitedProviders.length > 0 && !result.updated) {
            // Rate limited and didn't update = STOP
            stats.stopped = true;
            stats.stopReason = `Provider rate limited: ${result.rateLimitedProviders[0]}`;

            logger.warn('[EnrichAll] Stopping bulk enrichment', {
              provider: result.rateLimitedProviders[0],
              processed: stats.processed,
              totalMovies: movies.length,
              percentComplete: Math.round((stats.processed / movies.length) * 100),
            });
            break;
          }

          if (result.updated) {
            stats.updated++;
          } else {
            stats.skipped++;
          }

          // Log progress every 100 movies
          if (stats.processed % 100 === 0) {
            logger.info('[EnrichAll] Progress update', {
              processed: stats.processed,
              updated: stats.updated,
              total: movies.length,
              percentComplete: Math.round((stats.processed / movies.length) * 100),
            });
          }
        } catch (error) {
          logger.error('[EnrichAll] Movie enrichment failed', {
            movieId: movie.id,
            title: movie.title,
            error: getErrorMessage(error),
          });
          // Continue to next movie (transient errors don't stop job)
        }
      }

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
