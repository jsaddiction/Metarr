import { DatabaseManager } from '../../database/DatabaseManager.js';
import { scanMovieDirectory } from '../scan/unifiedScanService.js';
import { getDirectoryPath } from '../pathMappingService.js';
import { logger } from '../../middleware/logging.js';
import { websocketBroadcaster } from '../websocketBroadcaster.js';
import { createErrorLogContext } from '../../utils/errorHandling.js';
import { buildUpdateQuery } from '../../utils/sqlBuilder.js';
import type { SqlParam } from '../../types/database.js';
import { ResourceNotFoundError } from '../../errors/index.js';

/**
 * MovieCrudService
 *
 * Handles create, update, delete, and restore operations for movies.
 * Extracted from MovieService to maintain single responsibility principle.
 *
 * Responsibilities:
 * - Update movie metadata fields (respecting locks)
 * - Soft delete movies to recycle bin (30-day retention)
 * - Restore movies from recycle bin
 * - Refresh movie by rescanning directory
 */
export class MovieCrudService {
  constructor(private readonly db: DatabaseManager) {}

  /**
   * Update movie metadata fields
   * Respects field locks - only updates unlocked fields
   *
   * @param movieId - Movie ID
   * @param metadata - Object with metadata fields to update
   * @returns Updated movie object
   */
  async updateMetadata(movieId: number, metadata: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    const conn = this.db.getConnection();

    try {
      // Metadata fields that can be updated (enforced allowlist)
      const allowedFields = [
        'title',
        'original_title',
        'sort_title',
        'year',
        'plot',
        'outline',
        'tagline',
        'mpaa',
        'premiered',
        'user_rating',
        'trailer_url',
        // Lock fields
        'title_locked',
        'original_title_locked',
        'sort_title_locked',
        'year_locked',
        'plot_locked',
        'outline_locked',
        'tagline_locked',
        'mpaa_locked',
        'premiered_locked',
        'user_rating_locked',
        'trailer_url_locked',
      ] as const;

      // Build type-safe UPDATE query using allowlist
      // Addresses Audit Finding 1.4: SQL injection risk
      let query: string;
      let values: unknown[];

      try {
        const result = buildUpdateQuery(
          'movies',
          allowedFields,
          metadata,
          'id = ?',
          [movieId]
        );
        query = result.query;
        values = result.values;
      } catch (error) {
        if (error instanceof Error && error.message.includes('No valid columns to update')) {
          return { success: true, message: 'No fields to update' } as Record<string, unknown>;
        }
        throw error;
      }

      await conn.execute(query, values as SqlParam[]);

      logger.info('Movie metadata updated', { movieId, updatedFields: Object.keys(metadata) });

      websocketBroadcaster.broadcastMoviesUpdated([movieId]);

      const movies = await conn.query('SELECT * FROM movies WHERE id = ?', [movieId]);
      return movies.length > 0 ? movies[0] : null;
    } catch (error) {
      logger.error('Failed to update movie metadata', createErrorLogContext(error, {
        movieId
      }));
      throw error;
    }
  }

  /**
   * Soft delete a movie (30-day recycle bin)
   * Sets deleted_at to 30 days from now
   * Movie remains in database but hidden from normal queries
   *
   * @param movieId - Movie ID
   * @returns Object with success status and deletion timestamp
   */
  async softDeleteMovie(movieId: number): Promise<{ success: boolean; deletedAt: string }> {
    try {
      const conn = this.db.getConnection();

      // Calculate deletion date (30 days from now)
      const deletedAt = new Date();
      deletedAt.setDate(deletedAt.getDate() + 30);

      await conn.execute(
        `UPDATE movies SET deleted_at = ? WHERE id = ?`,
        [deletedAt.toISOString(), movieId]
      );

      logger.info('Soft deleted movie (30-day recycle bin)', {
        movieId,
        deletedAt: deletedAt.toISOString()
      });

      // Log to activity
      await conn.execute(
        `INSERT INTO activity_log (
          event_type,
          source,
          description,
          metadata,
          created_at
        ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          'movie_deleted',
          'user',
          `Moved movie to recycle bin (${movieId})`,
          JSON.stringify({
            movieId,
            deletedAt: deletedAt.toISOString(),
            expiresAt: deletedAt.toISOString()
          })
        ]
      );

      // Broadcast deletion via WebSocket
      websocketBroadcaster.broadcastMoviesDeleted([movieId]);

      return {
        success: true,
        deletedAt: deletedAt.toISOString()
      };
    } catch (error) {
      logger.error('Failed to soft delete movie', createErrorLogContext(error, {
        movieId
      }));
      throw error;
    }
  }

  /**
   * Restore a soft-deleted movie from recycle bin
   * Sets deleted_at to NULL, making movie visible again
   * All data and locks remain unchanged
   *
   * @param movieId - Movie ID
   * @returns Object with success status and message
   */
  async restoreMovie(movieId: number): Promise<{ success: boolean; message: string }> {
    try {
      const conn = this.db.getConnection();

      // Check if movie exists and is actually deleted
      const movie = await conn.query(
        'SELECT id, title, deleted_at FROM movies WHERE id = ?',
        [movieId]
      );

      if (!movie || movie.length === 0) {
        throw new ResourceNotFoundError(
          'movie',
          movieId,
          'Movie not found',
          {
            service: 'MovieCrudService',
            operation: 'restoreMovie'
          }
        );
      }

      const movieData = movie[0];

      if (!movieData.deleted_at) {
        return {
          success: true,
          message: 'Movie is not deleted, no action needed'
        };
      }

      // Restore by setting deleted_at to NULL
      await conn.execute(
        `UPDATE movies SET deleted_at = NULL WHERE id = ?`,
        [movieId]
      );

      logger.info('Restored movie from recycle bin', {
        movieId,
        title: movieData.title,
        wasDeletedAt: movieData.deleted_at
      });

      // Log to activity
      await conn.execute(
        `INSERT INTO activity_log (
          event_type,
          source,
          description,
          metadata,
          created_at
        ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          'movie_restored',
          'user',
          `Restored movie from recycle bin: ${movieData.title}`,
          JSON.stringify({
            movieId,
            title: movieData.title,
            previousDeletedAt: movieData.deleted_at
          })
        ]
      );

      // Broadcast restoration via WebSocket
      websocketBroadcaster.broadcastMoviesUpdated([movieId]);

      return {
        success: true,
        message: 'Movie restored successfully'
      };
    } catch (error) {
      logger.error('Failed to restore movie', createErrorLogContext(error, {
        movieId
      }));
      throw error;
    }
  }

  /**
   * Refresh movie metadata by rescanning its directory
   * User-initiated refresh (high priority)
   *
   * Triggers unified scan service to rediscover:
   * - Video files and stream info
   * - NFO metadata
   * - Images and artwork
   * - Unknown files
   *
   * @param movieId - Movie ID
   * @returns Scan result with counts of discovered items
   */
  async refreshMovie(movieId: number): Promise<Record<string, unknown>> {
    const conn = this.db.getConnection();

    try {
      // Get movie file_path and TMDB ID
      const results = (await conn.query(
        `SELECT id, library_id, file_path, tmdb_id, imdb_id, title, year FROM movies WHERE id = ?`,
        [movieId]
      )) as Array<{
        id: number;
        library_id: number;
        file_path: string;
        tmdb_id?: number;
        imdb_id?: string;
        title?: string;
        year?: number;
      }>;

      if (results.length === 0) {
        throw new ResourceNotFoundError(
          'movie',
          movieId,
          `Movie not found: ${movieId}`,
          {
            service: 'MovieCrudService',
            operation: 'refreshMovie'
          }
        );
      }

      const movie = results[0];

      // Get directory from file path
      const movieDir = getDirectoryPath(movie.file_path);

      logger.info('User-initiated movie refresh', {
        movieId,
        movieDir,
        tmdbId: movie.tmdb_id,
      });

      // Build scan context for user-initiated refresh
      const scanContext: Record<string, unknown> = {
        trigger: 'user_refresh',
      };

      if (movie.tmdb_id) scanContext.tmdbId = movie.tmdb_id;
      if (movie.imdb_id) scanContext.imdbId = movie.imdb_id;
      if (movie.title) scanContext.title = movie.title;
      if (movie.year) scanContext.year = movie.year;

      // Run scan with user_refresh trigger
      const scanResult = await scanMovieDirectory(this.db, movie.library_id, movieDir, scanContext);

      logger.info('Movie refresh complete', {
        movieId,
        scanResult,
      });

      // Broadcast refresh completion via WebSocket
      websocketBroadcaster.broadcastMoviesUpdated([movieId]);

      return {
        success: true,
        movieId: scanResult.movieId,
        isNewMovie: scanResult.isNewMovie,
        pathChanged: scanResult.pathChanged,
        restoredFromDeletion: scanResult.restoredFromDeletion,
        directoryChanged: scanResult.directoryChanged,
        nfoRegenerated: scanResult.nfoRegenerated,
        streamsExtracted: scanResult.streamsExtracted,
        assetsFound: scanResult.assetsFound,
        unknownFilesFound: scanResult.unknownFilesFound,
      };
    } catch (error) {
      logger.error('Failed to refresh movie', createErrorLogContext(error, {
        movieId
      }));
      throw error;
    }
  }
}
