/**
 * Movie Workflow Service
 *
 * Coordinates workflow operations including:
 * - Job orchestration (verify, enrich, publish)
 * - Provider integration (search, identification)
 * - Automation triggers
 * - Field lock management during identification
 *
 * This service manages the bridge between user actions and the job queue system,
 * ensuring workflow control checks and proper job priority assignment.
 */

import { DatabaseManager } from '../../database/DatabaseManager.js';
import { JobQueueService } from '../jobQueue/JobQueueService.js';
import { ProviderOrchestrator } from '../providers/ProviderOrchestrator.js';
import { ProviderRegistry } from '../providers/ProviderRegistry.js';
import { ProviderConfigService } from '../providerConfigService.js';
import { websocketBroadcaster } from '../websocketBroadcaster.js';
import { getDirectoryPath } from '../pathMappingService.js';
import { logger } from '../../middleware/logging.js';
import { createErrorLogContext } from '../../utils/errorHandling.js';
import { SqlParam } from '../../types/database.js';

export class MovieWorkflowService {
  constructor(
    private db: DatabaseManager,
    private jobQueue?: JobQueueService
  ) {}

  /**
   * Toggle monitored status for a movie
   *
   * Monitored = 1: Automation enabled, respects field locks
   * Monitored = 0: Automation STOPPED, everything frozen
   */
  async toggleMonitored(movieId: number): Promise<{ id: number; monitored: boolean }> {
    try {
      const conn = this.db.getConnection();

      // Get current monitored status
      const movie = await conn.query(
        'SELECT id, monitored FROM movies WHERE id = ?',
        [movieId]
      );

      if (!movie || movie.length === 0) {
        throw new Error('Movie not found');
      }

      const currentMovie = movie[0];

      // Toggle the status
      const newMonitoredStatus = currentMovie.monitored === 1 ? 0 : 1;

      // Update database
      await conn.execute(
        'UPDATE movies SET monitored = ? WHERE id = ?',
        [newMonitoredStatus, movieId]
      );

      logger.info('Toggled monitored status', {
        movieId,
        oldStatus: currentMovie.monitored === 1,
        newStatus: newMonitoredStatus === 1
      });

      return {
        id: movieId,
        monitored: newMonitoredStatus === 1
      };
    } catch (error) {
      logger.error('Failed to toggle monitored status', createErrorLogContext(error, {
        movieId
      }));
      throw error;
    }
  }

  /**
   * Search TMDB for identification
   * Uses ProviderOrchestrator to search across providers
   *
   * @param movieId - Movie ID (for logging)
   * @param query - Search query (movie title)
   * @param year - Optional year filter
   * @returns Array of search results
   */
  async searchForIdentification(
    movieId: number,
    query: string,
    year?: number
  ): Promise<any[]> {
    try {
      const conn = this.db.getConnection();

      // Initialize services
      const providerRegistry = ProviderRegistry.getInstance();
      const providerConfigService = new ProviderConfigService(conn);
      const orchestrator = new ProviderOrchestrator(providerRegistry, providerConfigService);

      // Search across providers
      const results = await orchestrator.searchAcrossProviders({
        entityType: 'movie',
        query,
        ...(year !== undefined && { year }),
      });

      logger.info('Search for identification complete', {
        movieId,
        query,
        year,
        resultsCount: results.length,
      });

      return results;
    } catch (error) {
      logger.error('Search for identification failed', createErrorLogContext(error, {
        movieId,
        query,
        year
      }));
      throw error;
    }
  }

  /**
   * Identify movie with TMDB ID
   * Updates movie record with provider IDs and respects field locks
   *
   * @param movieId - Movie ID
   * @param data - Identification data (tmdbId, title, year, imdbId)
   * @returns Updated movie
   */
  async identifyMovie(
    movieId: number,
    data: { tmdbId: number; title: string; year?: number; imdbId?: string }
  ): Promise<any> {
    const conn = this.db.getConnection();

    try {
      // Get field locks
      const locks = await this.getFieldLocks(movieId);

      // Build update dynamically based on locks
      const updates: string[] = [];
      const values: SqlParam[] = [];

      // TMDB ID (no lock field - always update)
      updates.push('tmdb_id = ?');
      values.push(data.tmdbId);

      // IMDB ID (no lock field - always update if provided)
      if (data.imdbId) {
        updates.push('imdb_id = ?');
        values.push(data.imdbId);
      }

      // Title (respect lock)
      if (!locks.title_locked) {
        updates.push('title = ?');
        values.push(data.title);
      }

      // Year (respect lock)
      if (data.year && !locks.year_locked) {
        updates.push('year = ?');
        values.push(data.year);
      }

      // Set identification status to 'identified'
      updates.push('identification_status = ?');
      values.push('identified');

      // Update timestamp
      updates.push('updated_at = CURRENT_TIMESTAMP');

      // Add movieId for WHERE clause
      values.push(movieId);

      // Execute update
      await conn.execute(
        `UPDATE movies SET ${updates.join(', ')} WHERE id = ?`,
        values
      );

      logger.info('Movie identified', {
        movieId,
        tmdbId: data.tmdbId,
        title: data.title,
        year: data.year,
        lockedFields: Object.keys(locks).filter((k) => locks[k]),
      });

      // Broadcast WebSocket update
      websocketBroadcaster.broadcast('movie.identified', {
        movieId,
        tmdbId: data.tmdbId,
        title: data.title,
        year: data.year,
      });

      // Return updated movie record
      const updatedMovie = await conn.query(
        'SELECT * FROM movies WHERE id = ?',
        [movieId]
      );

      return updatedMovie[0];
    } catch (error) {
      logger.error('Failed to identify movie', createErrorLogContext(error, {
        movieId,
        data
      }));
      throw error;
    }
  }

  /**
   * Trigger verify job for movie
   * Queues verify-movie job with priority 3 (manual trigger)
   *
   * @param movieId - Movie ID
   * @returns Job details
   */
  async triggerVerify(movieId: number): Promise<any> {
    try {
      // Verification is a maintenance operation - no workflow control check needed
      // Users should always be able to verify cache/library integrity

      const conn = this.db.getConnection();

      // Get movie details
      const movies = await conn.query(
        'SELECT id, file_path FROM movies WHERE id = ?',
        [movieId]
      );

      if (!movies || movies.length === 0) {
        throw new Error('Movie not found');
      }

      // NOTE: Verification job system is being redesigned
      // TODO: Implement new verification workflow
      throw new Error('Movie verification is not yet implemented in the new workflow system');
    } catch (error) {
      logger.error('Failed to trigger verify job', createErrorLogContext(error, {
        movieId
      }));
      throw error;
    }
  }

  /**
   * Trigger enrichment job for movie
   * Queues enrich-metadata job using EnrichmentService (5-phase workflow)
   *
   * User-initiated action: ALWAYS runs regardless of workflow phase settings.
   * When enrichment phase is disabled, the system is in "manual mode" - the user
   * retains full control to trigger actions manually.
   *
   * @param movieId - Movie ID
   * @returns Job details
   */
  async triggerEnrich(movieId: number): Promise<any> {
    const conn = this.db.getConnection();

    try {
      // Get movie details
      const movies = await conn.query(
        'SELECT id, tmdb_id FROM movies WHERE id = ?',
        [movieId]
      );

      if (!movies || movies.length === 0) {
        throw new Error('Movie not found');
      }

      const movie = movies[0];

      // Validate TMDB ID exists
      if (!movie.tmdb_id) {
        throw new Error('Movie must be identified (have TMDB ID) before enrichment. Use Identify first.');
      }

      // Queue enrich-metadata job (5-phase enrichment workflow)
      if (!this.jobQueue) {
        throw new Error('Job queue not available. Cannot trigger enrichment job.');
      }

      const jobId = await this.jobQueue.addJob({
        type: 'enrich-metadata',
        priority: 3, // HIGH priority (manual trigger)
        payload: {
          entityType: 'movie',
          entityId: movieId,
        },
        retry_count: 0,
        max_retries: 3,
        manual: true, // User-initiated - bypasses workflow phase checks
      });

      logger.info('Enrichment job queued (user-initiated)', {
        movieId,
        jobId,
        tmdbId: movie.tmdb_id,
        manual: true,
      });

      return {
        success: true,
        jobId,
        message: 'Enrichment job queued successfully',
      };
    } catch (error) {
      logger.error('Failed to trigger enrichment job', createErrorLogContext(error, {
        movieId
      }));
      throw error;
    }
  }

  /**
   * Trigger publish job for movie
   * Queues publish job with priority 3 and player notifications
   *
   * User-initiated action: ALWAYS runs regardless of workflow phase settings.
   * When publishing phase is disabled, the system is in "manual mode" - the user
   * retains full control to trigger actions manually.
   *
   * @param movieId - Movie ID
   * @returns Job details
   */
  async triggerPublish(movieId: number): Promise<any> {
    const conn = this.db.getConnection();

    try {
      // Get movie details
      const movies = await conn.query(
        'SELECT id, file_path, title, library_id FROM movies WHERE id = ?',
        [movieId]
      );

      if (!movies || movies.length === 0) {
        throw new Error('Movie not found');
      }

      const movie = movies[0];

      // Get directory path and library ID
      const directoryPath = getDirectoryPath(movie.file_path);

      // Queue publish job
      if (!this.jobQueue) {
        throw new Error('Job queue not available. Cannot trigger publish job.');
      }

      const jobId = await this.jobQueue.addJob({
        type: 'publish',
        priority: 3, // HIGH priority (manual trigger)
        payload: {
          entityType: 'movie',
          entityId: movieId,
        },
        retry_count: 0,
        max_retries: 3,
        manual: true, // User-initiated - bypasses workflow phase checks
      });

      logger.info('Publish job queued (user-initiated)', {
        movieId,
        jobId,
        libraryPath: directoryPath,
        manual: true,
      });

      return {
        success: true,
        jobId,
        message: 'Publish job queued successfully',
      };
    } catch (error) {
      logger.error('Failed to trigger publish job', createErrorLogContext(error, {
        movieId
      }));
      throw error;
    }
  }

  /**
   * Get extras (trailer, subtitles, theme song)
   *
   * @param movieId - Movie ID
   * @returns Extras data
   */
  async getExtras(movieId: number): Promise<{
    trailer: unknown | null;
    subtitles: unknown[];
    themeSong: unknown | null;
  }> {
    const conn = this.db.getConnection();

    // Get trailer (cache_video_files with video_type='trailer')
    const trailers = await conn.query(
      `SELECT * FROM cache_video_files
       WHERE entity_type = 'movie' AND entity_id = ? AND video_type = 'trailer'
       LIMIT 1`,
      [movieId]
    );

    // Get subtitles (cache_text_files with text_type='subtitle')
    const subtitles = await conn.query(
      `SELECT * FROM cache_text_files
       WHERE entity_type = 'movie' AND entity_id = ? AND text_type = 'subtitle'`,
      [movieId]
    );

    // Get theme song (cache_audio_files with audio_type='theme')
    const themes = await conn.query(
      `SELECT * FROM cache_audio_files
       WHERE entity_type = 'movie' AND entity_id = ? AND audio_type = 'theme'
       LIMIT 1`,
      [movieId]
    );

    return {
      trailer: trailers.length > 0 ? trailers[0] : null,
      subtitles: subtitles,
      themeSong: themes.length > 0 ? themes[0] : null
    };
  }

  /**
   * Get field locks for a movie
   * Helper method used by identification and enrichment
   *
   * @param movieId - Movie ID
   * @returns Object with lock status for each field
   */
  private async getFieldLocks(movieId: number): Promise<Record<string, boolean>> {
    const conn = this.db.getConnection();

    try {
      const result = await conn.query<any>('SELECT * FROM movies WHERE id = ?', [movieId]);

      if (result.length === 0) {
        return {};
      }

      const row = result[0];
      const locks: Record<string, boolean> = {};

      // Extract all *_locked columns
      for (const key in row) {
        if (key.endsWith('_locked')) {
          locks[key] = row[key] === 1;
        }
      }

      return locks;
    } catch (error) {
      logger.error('Failed to get field locks', createErrorLogContext(error, {
        movieId
      }));
      return {};
    }
  }
}
