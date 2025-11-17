import { DatabaseManager } from '../database/DatabaseManager.js';
import { scanMovieDirectory } from './scan/unifiedScanService.js';
import { getDirectoryPath } from './pathMappingService.js';
import { logger } from '../middleware/logging.js';
import fs from 'fs/promises';
import path from 'path';
import { JobQueueService } from './jobQueue/JobQueueService.js';
import { MovieAssetService } from './movie/MovieAssetService.js';
import { MovieUnknownFilesService } from './movie/MovieUnknownFilesService.js';
import { MovieWorkflowService } from './movie/MovieWorkflowService.js';
import { getErrorMessage } from '../utils/errorHandling.js';
import { SqlParam } from '../types/database.js';
import { ResourceNotFoundError } from '../errors/index.js';

export type AssetStatus = 'none' | 'partial' | 'complete';

// Database row type for movie query result
interface MovieDatabaseRow {
  id: number;
  title: string | null;
  year: number | null;
  studio_name: string | null;
  monitored: number;
  identification_status: string;
  nfo_parsed_at: string | null;
  tmdb_id: number | null;
  imdb_id: string | null;
  plot: string | null;
  genre_count: number;
  actor_count: number;
  director_count: number;
  writer_count: number;
  studio_count: number;
  poster_count: number;
  fanart_count: number;
  landscape_count: number;
  keyart_count: number;
  banner_count: number;
  clearart_count: number;
  clearlogo_count: number;
  discart_count: number;
  trailer_count: number;
  subtitle_count: number;
  theme_count: number;
}

export interface AssetCounts {
  poster: number;
  fanart: number;
  landscape: number;
  keyart: number;
  banner: number;
  clearart: number;
  clearlogo: number;
  discart: number;
  trailer: number;
  subtitle: number;
  theme: number;
  actor: number;
}

export interface AssetStatuses {
  nfo: AssetStatus;
  poster: AssetStatus;
  fanart: AssetStatus;
  landscape: AssetStatus;
  keyart: AssetStatus;
  banner: AssetStatus;
  clearart: AssetStatus;
  clearlogo: AssetStatus;
  discart: AssetStatus;
  trailer: AssetStatus;
  subtitle: AssetStatus;
  theme: AssetStatus;
}

export interface Movie {
  id: number;
  title: string;
  year?: number;
  studio?: string;
  monitored: boolean;
  identification_status: 'unidentified' | 'identified' | 'enriched';
  assetCounts: AssetCounts;
  assetStatuses: AssetStatuses;
}

export interface MovieFilters {
  status?: string;
  identificationStatus?: 'unidentified' | 'identified' | 'enriched';
  libraryId?: number;
  limit?: number;
  offset?: number;
}

export interface MovieListResult {
  movies: Movie[];
  total: number;
}

export interface MovieExtras {
  trailer: unknown | null;
  subtitles: unknown[];
  themeSong: unknown | null;
}

export interface MovieMetadata {
  title?: string;
  original_title?: string;
  sort_title?: string;
  year?: number;
  plot?: string;
  outline?: string;
  tagline?: string;
  mpaa?: string;
  premiered?: string;
  user_rating?: number;
  trailer_url?: string;
  title_locked?: boolean;
  original_title_locked?: boolean;
  sort_title_locked?: boolean;
  year_locked?: boolean;
  plot_locked?: boolean;
  outline_locked?: boolean;
  tagline_locked?: boolean;
  mpaa_locked?: boolean;
  premiered_locked?: boolean;
  user_rating_locked?: boolean;
  trailer_url_locked?: boolean;
}

export interface MovieMetadataUpdateResult {
  success: boolean;
  message?: string;
}

export interface MovieAssetSelections {
  [key: string]: unknown;
}

export class MovieService {
  // @ts-expect-error - Property reserved for future use
  private _jobQueue: JobQueueService | undefined;
  private readonly assetService: MovieAssetService;
  private readonly unknownFilesService: MovieUnknownFilesService;
  private readonly workflowService: MovieWorkflowService;

  constructor(private readonly db: DatabaseManager, jobQueue?: JobQueueService) {
    this._jobQueue = jobQueue;
    this.assetService = new MovieAssetService(db);
    this.unknownFilesService = new MovieUnknownFilesService(db);
    this.workflowService = new MovieWorkflowService(db, jobQueue);
  }

  async getAll(filters?: MovieFilters): Promise<MovieListResult> {
    const whereClauses: string[] = ['1=1'];
    const params: SqlParam[] = [];

    // ALWAYS exclude soft-deleted movies (unless explicitly requested)
    whereClauses.push('m.deleted_at IS NULL');

    if (filters?.status) {
      whereClauses.push('m.status = ?');
      params.push(filters.status);
    }

    if (filters?.identificationStatus) {
      whereClauses.push('m.identification_status = ?');
      params.push(filters.identificationStatus);
    }

    if (filters?.libraryId) {
      whereClauses.push('m.library_id = ?');
      params.push(filters.libraryId);
    }

    const limit = filters?.limit || 1000;
    const offset = filters?.offset || 0;

    // Optimized query using LEFT JOINs with conditional aggregates
    // Replaces N+1 scalar subquery pattern (18 subqueries per movie)
    // Performance: 10-25x faster for large result sets
    // Audit Finding 2.1, 5.1: Eliminates 18,000 subqueries for 1000 movies
    const query = `
      SELECT
        m.*,

        -- First studio name (using MIN to get first alphabetically, consistent with ORDER BY ms.studio_id)
        MIN(s.name) as studio_name,

        -- Metadata counts for NFO completeness check (conditional aggregates)
        COUNT(DISTINCT mg.genre_id) as genre_count,
        COUNT(DISTINCT ma.actor_id) as actor_count,
        COUNT(DISTINCT CASE WHEN mc.role = 'director' THEN mc.crew_id END) as director_count,
        COUNT(DISTINCT CASE WHEN mc.role = 'writer' THEN mc.crew_id END) as writer_count,
        COUNT(DISTINCT ms.studio_id) as studio_count,

        -- NFO parsed timestamp (MAX gets most recent from cache - source of truth)
        MAX(ctf_nfo.discovered_at) as nfo_parsed_at,

        -- Asset counts from cache tables (source of truth for all assets)
        -- Uses DISTINCT because joins can create duplicates across different asset types
        COUNT(DISTINCT CASE WHEN cif.image_type = 'poster' THEN cif.id END) as poster_count,
        COUNT(DISTINCT CASE WHEN cif.image_type = 'fanart' THEN cif.id END) as fanart_count,
        COUNT(DISTINCT CASE WHEN cif.image_type = 'landscape' THEN cif.id END) as landscape_count,
        COUNT(DISTINCT CASE WHEN cif.image_type = 'keyart' THEN cif.id END) as keyart_count,
        COUNT(DISTINCT CASE WHEN cif.image_type = 'banner' THEN cif.id END) as banner_count,
        COUNT(DISTINCT CASE WHEN cif.image_type = 'clearart' THEN cif.id END) as clearart_count,
        COUNT(DISTINCT CASE WHEN cif.image_type = 'clearlogo' THEN cif.id END) as clearlogo_count,
        COUNT(DISTINCT CASE WHEN cif.image_type = 'discart' THEN cif.id END) as discart_count,
        COUNT(DISTINCT CASE WHEN cvf.video_type = 'trailer' THEN cvf.id END) as trailer_count,
        COUNT(DISTINCT CASE WHEN ctf_sub.text_type = 'subtitle' THEN ctf_sub.id END) as subtitle_count,
        COUNT(DISTINCT CASE WHEN caf.audio_type = 'theme' THEN caf.id END) as theme_count

      FROM movies m

      -- Join metadata tables (LEFT JOIN ensures movies without metadata still appear)
      LEFT JOIN movie_studios ms ON ms.movie_id = m.id
      LEFT JOIN studios s ON s.id = ms.studio_id
      LEFT JOIN movie_genres mg ON mg.movie_id = m.id
      LEFT JOIN movie_actors ma ON ma.movie_id = m.id
      LEFT JOIN movie_crew mc ON mc.movie_id = m.id

      -- Join cache asset tables (LEFT JOIN ensures movies without assets still appear)
      -- These use the enhanced composite indexes created in migration for optimal performance
      LEFT JOIN cache_image_files cif
        ON cif.entity_type = 'movie' AND cif.entity_id = m.id
      LEFT JOIN cache_video_files cvf
        ON cvf.entity_type = 'movie' AND cvf.entity_id = m.id
      LEFT JOIN cache_text_files ctf_nfo
        ON ctf_nfo.entity_type = 'movie' AND ctf_nfo.entity_id = m.id AND ctf_nfo.text_type = 'nfo'
      LEFT JOIN cache_text_files ctf_sub
        ON ctf_sub.entity_type = 'movie' AND ctf_sub.entity_id = m.id AND ctf_sub.text_type = 'subtitle'
      LEFT JOIN cache_audio_files caf
        ON caf.entity_type = 'movie' AND caf.entity_id = m.id

      WHERE ${whereClauses.join(' AND ')}

      -- GROUP BY collapses all joined rows back to one row per movie
      GROUP BY m.id

      ORDER BY m.title ASC
      LIMIT ? OFFSET ?
    `;

    params.push(limit, offset);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM movies m
      WHERE ${whereClauses.join(' AND ')}
    `;

    const [rows, countResult] = await Promise.all([
      this.db.query<any>(query, params),
      this.db.query<{ total: number }>(countQuery, params.slice(0, -2)), // Exclude limit/offset from count
    ]);

    return {
      movies: rows.map(row => this.mapToMovie(row)),
      total: countResult[0]?.total || 0,
    };
  }

  private mapToMovie(row: MovieDatabaseRow): Movie {
    const status = row.identification_status || 'unidentified';
    const validStatus = (status === 'identified' || status === 'unidentified' || status === 'enriched')
      ? status
      : 'unidentified';

    const movie: Movie = {
      id: row.id,
      title: row.title || '[Unknown]',
      monitored: row.monitored === 1,
      identification_status: validStatus,
      assetCounts: {
        poster: row.poster_count || 0,
        fanart: row.fanart_count || 0,
        landscape: row.landscape_count || 0,
        keyart: row.keyart_count || 0,
        banner: row.banner_count || 0,
        clearart: row.clearart_count || 0,
        clearlogo: row.clearlogo_count || 0,
        discart: row.discart_count || 0,
        trailer: row.trailer_count || 0,
        subtitle: row.subtitle_count || 0,
        theme: row.theme_count || 0,
        actor: row.actor_count || 0,
      },
      assetStatuses: {
        nfo: this.calculateNFOStatus(row),
        poster: this.getAssetStatus(row.poster_count || 0, 1),
        fanart: this.getAssetStatus(row.fanart_count || 0, 5),
        landscape: this.getAssetStatus(row.landscape_count || 0, 1),
        keyart: this.getAssetStatus(row.keyart_count || 0, 1),
        banner: this.getAssetStatus(row.banner_count || 0, 1),
        clearart: this.getAssetStatus(row.clearart_count || 0, 1),
        clearlogo: this.getAssetStatus(row.clearlogo_count || 0, 1),
        discart: this.getAssetStatus(row.discart_count || 0, 1),
        trailer: this.getAssetStatus(row.trailer_count || 0, 1),
        subtitle: this.getAssetStatus(row.subtitle_count || 0, 1),
        theme: this.getAssetStatus(row.theme_count || 0, 1),
      },
    };

    // Add optional properties explicitly
    if (row.year !== null && row.year !== undefined) {
      movie.year = row.year;
    }
    if (row.studio_name !== null && row.studio_name !== undefined) {
      movie.studio = row.studio_name;
    }

    return movie;
  }

  private calculateNFOStatus(row: MovieDatabaseRow): AssetStatus {
    // Grey: No NFO parsed
    if (!row.nfo_parsed_at) {
      return 'none';
    }

    // Green: Essential fields populated
    const allFieldsPopulated = !!(
      row.title &&
      row.year &&
      row.plot &&
      (row.tmdb_id || row.imdb_id) &&
      // Array fields must have at least 1
      row.genre_count > 0 &&
      row.actor_count > 0 &&
      row.director_count > 0
    );

    if (allFieldsPopulated) {
      return 'complete';
    }

    // Orange: NFO parsed but incomplete
    return 'partial';
  }

  private getAssetStatus(count: number, threshold: number): AssetStatus {
    if (count === 0) return 'none';
    if (count < threshold) return 'partial';
    return 'complete';
  }

  /**
   * Get movie by ID with optional related data
   * Returns raw database row (snake_case) - no mapping needed
   */
  async getById(movieId: number, include: string[] = ['files']): Promise<Record<string, unknown> | null> {
    // Get base movie data with all fields
    const movieQuery = `SELECT * FROM movies WHERE id = ?`;
    const movies = await this.db.query<Record<string, unknown>>(movieQuery, [movieId]);

    if (!movies || movies.length === 0) {
      return null;
    }

    // Use raw database row - no mapping needed (consistent snake_case throughout)
    const movie = movies[0];

    // Get related entities (clean schema)
    const [actors, genres, directors, writers, studios] = await Promise.all([
      this.db.query<Record<string, unknown>>('SELECT a.*, ma.role, ma.actor_order FROM actors a JOIN movie_actors ma ON a.id = ma.actor_id WHERE ma.movie_id = ? ORDER BY ma.actor_order', [movieId]),
      this.db.query<Record<string, unknown>>('SELECT g.* FROM genres g JOIN movie_genres mg ON g.id = mg.genre_id WHERE mg.movie_id = ?', [movieId]),
      this.db.query<Record<string, unknown>>('SELECT c.* FROM crew c JOIN movie_crew mc ON c.id = mc.crew_id WHERE mc.movie_id = ? AND mc.role = \'director\'', [movieId]),
      this.db.query<Record<string, unknown>>('SELECT c.* FROM crew c JOIN movie_crew mc ON c.id = mc.crew_id WHERE mc.movie_id = ? AND mc.role = \'writer\'', [movieId]),
      this.db.query<Record<string, unknown>>('SELECT s.* FROM studios s JOIN movie_studios ms ON s.id = ms.studio_id WHERE ms.movie_id = ?', [movieId]),
    ]);

    const result: Record<string, unknown> = {
      ...movie,
      actors: actors.map(a => ({ name: a.name, role: a.role, order: a.actor_order })),
      genres: genres.map(g => g.name),
      directors: directors.map(d => d.name),
      writers: writers.map(w => w.name),
      studios: studios.map(s => s.name),
    };

    // Conditionally include files based on ?include parameter
    // Default includes 'files' for backward compatibility
    if (include.includes('files')) {
      result.files = await this.getAllFiles(movieId);
    }

    // Future: Support other includes
    // if (include.includes('candidates')) {
    //   result.candidates = await assetCandidateService.getAllCandidates('movie', movieId);
    // }
    // if (include.includes('locks')) {
    //   result.locks = this.getFieldLocks(movie);
    // }

    return result;
  }

  async getUnknownFiles(movieId: number): Promise<Record<string, unknown>[]> {
    const query = `
      SELECT
        id,
        file_path,
        file_name,
        file_size,
        extension,
        category,
        created_at
      FROM unknown_files
      WHERE entity_type = 'movie' AND entity_id = ?
      ORDER BY file_name ASC
    `;

    return this.db.query<Record<string, unknown>>(query, [movieId]);
  }

  async getImages(movieId: number): Promise<Record<string, unknown>[]> {
    const conn = this.db.getConnection();

    // Query cache_image_files for cache images
    const images = await conn.query(
      `SELECT
        id, entity_type, entity_id, file_path, file_name, file_size,
        image_type, width, height, format, source_type, source_url, provider_name,
        classification_score, discovered_at
      FROM cache_image_files
      WHERE entity_type = 'movie' AND entity_id = ?
      ORDER BY image_type, classification_score DESC`,
      [movieId]
    );

    return images;
  }

  /**
   * Get extras (trailer, subtitles, theme song)
   * Delegates to MovieWorkflowService
   */
  async getExtras(movieId: number): Promise<MovieExtras> {
    return this.workflowService.getExtras(movieId);
  }

  /**
   * Assign an unknown file to a specific asset type
   * Delegates to MovieUnknownFilesService
   */
  async assignUnknownFile(movieId: number, fileId: number, fileType: string): Promise<unknown> {
    return this.unknownFilesService.assignUnknownFile(movieId, fileId, fileType);
  }

  /**
   * Mark an unknown file as ignored
   * Delegates to MovieUnknownFilesService
   */
  async ignoreUnknownFile(movieId: number, fileId: number): Promise<unknown> {
    return this.unknownFilesService.ignoreUnknownFile(movieId, fileId);
  }

  /**
   * Delete an unknown file from the filesystem
   * Delegates to MovieUnknownFilesService
   */
  async deleteUnknownFile(movieId: number, fileId: number): Promise<any> {
    return this.unknownFilesService.deleteUnknownFile(movieId, fileId);
  }

  /**
   * Refresh movie metadata by rescanning its directory
   * User-initiated refresh (high priority)
   */
  async refreshMovie(movieId: number): Promise<any> {
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
          { service: 'movieService', operation: 'refreshMovieMetadata' }
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
      logger.error('Failed to refresh movie', {
        movieId,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }
  async updateMetadata(movieId: number, metadata: MovieMetadata): Promise<MovieMetadataUpdateResult> {
    const conn = this.db.getConnection();

    try {
      // Build the UPDATE query dynamically based on provided fields
      const updateFields: string[] = [];
      const updateValues: SqlParam[] = [];

      // Metadata fields that can be updated
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
      ];

      for (const field of allowedFields) {
        if (metadata.hasOwnProperty(field)) {
          updateFields.push(`${field} = ?`);
          updateValues.push(metadata[field as keyof MovieMetadata]);
        }
      }

      if (updateFields.length === 0) {
        return { success: true, message: 'No fields to update' };
      }

      // Add movieId to the end of the values array
      updateValues.push(movieId);

      const query = `UPDATE movies SET ${updateFields.join(', ')} WHERE id = ?`;

      await conn.execute(query, updateValues);

      logger.info('Movie metadata updated', { movieId, updatedFields: Object.keys(metadata) });

      return { success: true, message: 'Movie metadata updated successfully' };
    } catch (error) {
      logger.error('Failed to update movie metadata', {
        movieId,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Save asset selections for a movie
   * Delegates to MovieAssetService
   */
  async saveAssets(movieId: number, selections: MovieAssetSelections, metadata?: unknown): Promise<{
    success: boolean;
    savedAssets: Array<{
      assetType: string;
      cacheAssetId: number;
      cachePath: string;
      libraryPath: string;
      isNew: boolean;
    }>;
    errors: string[];
  }> {
    return this.assetService.saveAssets(movieId, selections, metadata);
  }

  /**
   * Toggle monitored status for a movie
   * Delegates to MovieWorkflowService
   */
  async toggleMonitored(movieId: number): Promise<{ id: number; monitored: boolean }> {
    return this.workflowService.toggleMonitored(movieId);
  }

  /**
   * Lock a specific field to prevent automation from modifying it
   *
   * When a field is locked, enrichment services MUST NOT modify it.
   * Locks are automatically set when user manually edits a field.
   *
   * @param movieId - Movie ID
   * @param fieldName - Field name (e.g., 'title', 'plot', 'poster')
   */
  async lockField(movieId: number, fieldName: string): Promise<{ success: boolean; fieldName: string; locked: boolean }> {
    try {
      const conn = this.db.getConnection();

      // Validate field name and convert to lock column name
      const lockColumnName = `${fieldName}_locked`;

      // Update the lock field
      await conn.execute(
        `UPDATE movies SET ${lockColumnName} = 1 WHERE id = ?`,
        [movieId]
      );

      logger.info('Locked field', {
        movieId,
        fieldName,
        lockColumn: lockColumnName
      });

      return {
        success: true,
        fieldName,
        locked: true
      };
    } catch (error) {
      logger.error('Failed to lock field', {
        movieId,
        fieldName,
        error: getErrorMessage(error)
      });
      throw error;
    }
  }

  /**
   * Unlock a specific field to allow automation to modify it
   *
   * Unlocks a previously locked field.
   * Use with "Reset to Provider" to re-fetch metadata.
   *
   * @param movieId - Movie ID
   * @param fieldName - Field name (e.g., 'title', 'plot', 'poster')
   */
  async unlockField(movieId: number, fieldName: string): Promise<{ success: boolean; fieldName: string; locked: boolean }> {
    try {
      const conn = this.db.getConnection();

      // Validate field name and convert to lock column name
      const lockColumnName = `${fieldName}_locked`;

      // Update the lock field
      await conn.execute(
        `UPDATE movies SET ${lockColumnName} = 0 WHERE id = ?`,
        [movieId]
      );

      logger.info('Unlocked field', {
        movieId,
        fieldName,
        lockColumn: lockColumnName
      });

      return {
        success: true,
        fieldName,
        locked: false
      };
    } catch (error) {
      logger.error('Failed to unlock field', {
        movieId,
        fieldName,
        error: getErrorMessage(error)
      });
      throw error;
    }
  }

  /**
   * Reset all metadata locks and trigger re-enrichment
   *
   * Unlocks all metadata fields and optionally triggers re-fetch from provider.
   * Use this when user wants to discard their manual edits and start fresh.
   *
   * @param movieId - Movie ID
   */
  async resetMetadata(movieId: number): Promise<{ success: boolean; unlockedFields: string[] }> {
    try {
      const conn = this.db.getConnection();

      // List of all metadata lock fields
      const metadataLockFields = [
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
        'trailer_url_locked'
      ];

      // Build UPDATE query to unlock all metadata fields
      const unlockSql = metadataLockFields.map(field => `${field} = 0`).join(', ');

      await conn.execute(
        `UPDATE movies SET ${unlockSql} WHERE id = ?`,
        [movieId]
      );

      logger.info('Reset all metadata locks', {
        movieId,
        unlockedFields: metadataLockFields
      });

      // TODO: Optionally trigger re-enrichment job here
      // For now, just unlock the fields - user can manually refresh

      return {
        success: true,
        unlockedFields: metadataLockFields.map(f => f.replace('_locked', ''))
      };
    } catch (error) {
      logger.error('Failed to reset metadata', {
        movieId,
        error: getErrorMessage(error)
      });
      throw error;
    }
  }

  /**
   * Get all files for a movie from unified file system
   * Returns aggregated view of all file types (video, image, audio, text, unknown)
   */
  async getAllFiles(movieId: number): Promise<any> {
    try {
      const conn = this.db.getConnection();

      // Get video files (cache only - source of truth)
      const videoFiles = await conn.query(
        `SELECT
          id, file_path, file_name, file_size, video_type,
          codec, width, height, duration_seconds, bitrate, framerate, hdr_type,
          audio_codec, audio_channels, audio_language,
          source_type, source_url, provider_name, classification_score,
          discovered_at
        FROM cache_video_files
        WHERE entity_type = 'movie' AND entity_id = ?
        ORDER BY video_type, discovered_at DESC`,
        [movieId]
      );

      // Get image files (cache only - source of truth)
      const imageFiles = await conn.query(
        `SELECT
          id, file_path, file_name, file_size, image_type,
          width, height, format, perceptual_hash,
          source_type, source_url, provider_name, classification_score,
          is_locked, discovered_at
        FROM cache_image_files
        WHERE entity_type = 'movie' AND entity_id = ?
        ORDER BY image_type, classification_score DESC, discovered_at DESC`,
        [movieId]
      );

      // Get audio files (cache only - source of truth)
      const audioFiles = await conn.query(
        `SELECT
          id, file_path, file_name, file_size, audio_type,
          codec, duration_seconds, bitrate, sample_rate, channels, language,
          source_type, source_url, provider_name, classification_score,
          discovered_at
        FROM cache_audio_files
        WHERE entity_type = 'movie' AND entity_id = ?
        ORDER BY audio_type, discovered_at DESC`,
        [movieId]
      );

      // Get text files (cache only - source of truth)
      const textFiles = await conn.query(
        `SELECT
          id, file_path, file_name, file_size, text_type,
          subtitle_language, subtitle_format, nfo_is_valid, nfo_has_tmdb_id, nfo_needs_regen,
          source_type, source_url, provider_name, classification_score,
          discovered_at
        FROM cache_text_files
        WHERE entity_type = 'movie' AND entity_id = ?
        ORDER BY text_type, discovered_at DESC`,
        [movieId]
      );

      // Get unknown files
      const unknownFiles = await conn.query(
        `SELECT
          id, file_path, file_name, file_size, extension,
          category, discovered_at
        FROM unknown_files
        WHERE entity_type = 'movie' AND entity_id = ?
        ORDER BY discovered_at DESC`,
        [movieId]
      );

      logger.debug('Retrieved all files for movie', {
        movieId,
        counts: {
          video: videoFiles.length,
          image: imageFiles.length,
          audio: audioFiles.length,
          text: textFiles.length,
          unknown: unknownFiles.length
        }
      });

      return {
        video: videoFiles,
        images: imageFiles,
        audio: audioFiles,
        text: textFiles,
        unknown: unknownFiles
      };
    } catch (error) {
      logger.error('Failed to get all files for movie', {
        movieId,
        error: getErrorMessage(error)
      });
      throw error;
    }
  }

  /**
   * Soft delete a movie (30-day recycle bin)
   * Sets deleted_at to 30 days from now
   * Movie remains in database but hidden from normal queries
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

      return {
        success: true,
        deletedAt: deletedAt.toISOString()
      };
    } catch (error) {
      logger.error('Failed to soft delete movie', {
        movieId,
        error: getErrorMessage(error)
      });
      throw error;
    }
  }

  /**
   * Restore a soft-deleted movie from recycle bin
   * Sets deleted_at to NULL, making movie visible again
   * All data and locks remain unchanged
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
          { service: 'movieService', operation: 'restoreMovie' }
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

      return {
        success: true,
        message: 'Movie restored successfully'
      };
    } catch (error) {
      logger.error('Failed to restore movie', {
        movieId,
        error: getErrorMessage(error)
      });
      throw error;
    }
  }

  /**
   * Replace all assets of a specific type (atomic snapshot operation)
   * Delegates to MovieAssetService
   */
  async replaceAssets(
    movieId: number,
    assetType: string,
    assets: Array<{
      url: string;
      provider: string;
      width?: number;
      height?: number;
      perceptualHash?: string;
      imageFileId?: number;
    }>
  ): Promise<{
    success: boolean;
    added: number;
    removed: number;
    kept: number;
    errors: string[];
    warnings: string[];
  }> {
    return this.assetService.replaceAssets(movieId, assetType, assets);
  }

  /**
   * Add an asset to a movie from a provider URL
   * Delegates to MovieAssetService
   */
  async addAsset(
    movieId: number,
    assetType: string,
    assetData: {
      url: string;
      provider: string;
      width?: number;
      height?: number;
      perceptualHash?: string;
    }
  ): Promise<{ success: boolean; imageFileId: number; cachePath: string }> {
    return this.assetService.addAsset(movieId, assetType, assetData);
  }

  /**
   * Remove an asset from a movie
   * Delegates to MovieAssetService
   */
  async removeAsset(movieId: number, imageFileId: number): Promise<{ success: boolean }> {
    return this.assetService.removeAsset(movieId, imageFileId);
  }

  /**
   * Toggle asset type lock (group lock for all assets of this type)
   * Delegates to MovieAssetService
   */
  async toggleAssetLock(
    movieId: number,
    assetType: string,
    locked: boolean
  ): Promise<{ success: boolean; assetType: string; locked: boolean }> {
    return this.assetService.toggleAssetLock(movieId, assetType, locked);
  }

  /**
   * Get count of assets for a specific type
   * Delegates to MovieAssetService
   */
  async countAssetsByType(movieId: number, assetType: string): Promise<number> {
    return this.assetService.countAssetsByType(movieId, assetType);
  }

  /**
   * Get assets by type (for slot-based UI)
   * Returns array of all assets for a specific type
   *
   * Part of multi-asset selection feature
   */
  async getAssetsByType(movieId: number, assetType: string): Promise<any[]> {
    const conn = this.db.getConnection();

    try {
      const images = await conn.query(
        `SELECT
          id, file_path, file_name, file_size, image_type,
          width, height, format, perceptual_hash,
          source_type, source_url, provider_name, classification_score,
          is_locked, discovered_at
        FROM cache_image_files
        WHERE entity_type = 'movie' AND entity_id = ? AND image_type = ?
        ORDER BY classification_score DESC, discovered_at DESC`,
        [movieId, assetType]
      );

      return images;

    } catch (error) {
      logger.error('Failed to get assets by type', {
        movieId,
        assetType,
        error: getErrorMessage(error)
      });
      throw error;
    }
  }

  /**
   * Search TMDB for identification
   * Delegates to MovieWorkflowService
   */
  async searchForIdentification(
    movieId: number,
    query: string,
    year?: number
  ): Promise<any[]> {
    return this.workflowService.searchForIdentification(movieId, query, year);
  }

  /**
   * Identify movie with TMDB ID
   * Delegates to MovieWorkflowService
   */
  async identifyMovie(
    movieId: number,
    data: { tmdbId: number; title: string; year?: number; imdbId?: string }
  ): Promise<any> {
    return this.workflowService.identifyMovie(movieId, data);
  }

  /**
   * Trigger verify job for movie
   * Delegates to MovieWorkflowService
   */
  async triggerVerify(movieId: number): Promise<any> {
    return this.workflowService.triggerVerify(movieId);
  }

  /**
   * Trigger enrichment job for movie
   * Delegates to MovieWorkflowService
   */
  async triggerEnrich(movieId: number): Promise<any> {
    return this.workflowService.triggerEnrich(movieId);
  }

  /**
   * Trigger publish job for movie
   * Delegates to MovieWorkflowService
   */
  async triggerPublish(movieId: number): Promise<any> {
    return this.workflowService.triggerPublish(movieId);
  }


  /**
   * Clean up orphaned cache files (files not referenced in database)
   *
   * Scans cache directory and removes files that don't have corresponding
   * database entries. Prevents storage inflation from failed operations.
   *
   * @param dryRun - If true, only reports orphans without deleting
   * @returns Count of orphaned files found/removed
   */
  async cleanupOrphanedCacheFiles(dryRun: boolean = false): Promise<{
    scanned: number;
    orphaned: number;
    removed: number;
    errors: string[];
  }> {
    const result = {
      scanned: 0,
      orphaned: 0,
      removed: 0,
      errors: [] as string[]
    };

    try {
      const conn = this.db.getConnection();
      const cacheDir = path.join(process.cwd(), 'data', 'cache', 'images', 'movie');

      // Check if cache directory exists
      try {
        await fs.access(cacheDir);
      } catch {
        logger.info('Cache directory does not exist, nothing to clean');
        return result;
      }

      // Get all cache files from database
      const dbFiles = await conn.query<{ file_path: string }>(
        `SELECT file_path FROM cache_image_files WHERE entity_type = 'movie'`
      );
      const dbFilePaths = new Set(dbFiles.map(f => f.file_path));

      // Scan all subdirectories (organized by movie ID)
      const movieDirs = await fs.readdir(cacheDir);

      for (const movieDir of movieDirs) {
        const movieDirPath = path.join(cacheDir, movieDir);
        const stat = await fs.stat(movieDirPath);

        if (!stat.isDirectory()) continue;

        const files = await fs.readdir(movieDirPath);

        for (const file of files) {
          const filePath = path.join(movieDirPath, file);
          result.scanned++;

          if (!dbFilePaths.has(filePath)) {
            result.orphaned++;

            if (!dryRun) {
              try {
                await fs.unlink(filePath);
                result.removed++;
                logger.info('Removed orphaned cache file', { filePath });
              } catch (error) {
                result.errors.push(`Failed to remove ${filePath}: ${getErrorMessage(error)}`);
              }
            }
          }
        }
      }

      logger.info('Cache cleanup complete', {
        dryRun,
        scanned: result.scanned,
        orphaned: result.orphaned,
        removed: result.removed,
        errors: result.errors.length
      });

      return result;
    } catch (error) {
      logger.error('Failed to cleanup orphaned cache files', { error: getErrorMessage(error) });
      throw error;
    }
  }
}
