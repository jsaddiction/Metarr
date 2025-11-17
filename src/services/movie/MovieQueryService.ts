import { DatabaseManager } from '../../database/DatabaseManager.js';
import { SqlParam } from '../../types/database.js';

export type AssetStatus = 'none' | 'partial' | 'complete';

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

/**
 * Database row type for movie queries
 * Represents the raw structure returned from database queries
 */
interface MovieDatabaseRow {
  id: number;
  title: string | null;
  year: number | null;
  studio_name: string | null;
  monitored: number;
  identification_status: 'unidentified' | 'identified' | 'enriched';
  poster_count: number | null;
  fanart_count: number | null;
  landscape_count: number | null;
  keyart_count: number | null;
  banner_count: number | null;
  clearart_count: number | null;
  clearlogo_count: number | null;
  discart_count: number | null;
  trailer_count: number | null;
  subtitle_count: number | null;
  theme_count: number | null;
  actor_count: number | null;
  nfo_parsed_at: string | null;
  plot: string | null;
  tmdb_id: number | null;
  imdb_id: string | null;
  genre_count: number | null;
  director_count: number | null;
}

/**
 * MovieQueryService
 *
 * Read-only query operations for movies.
 * Handles complex queries with scalar subqueries for optimal performance.
 *
 * Responsibilities:
 * - List movies with filters
 * - Get single movie with includes
 * - Get all files for movie
 * - Calculate asset/NFO statuses
 *
 * This service is pure data access layer - no mutations.
 */
export class MovieQueryService {
  constructor(private readonly db: DatabaseManager) {}

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
      this.db.query<MovieDatabaseRow>(query, params),
      this.db.query<{ total: number }>(countQuery, params.slice(0, -2)), // Exclude limit/offset from count
    ]);

    return {
      movies: rows.map(row => this.mapToMovie(row)),
      total: countResult[0]?.total || 0,
    };
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

  async getUnknownFiles(movieId: number): Promise<Array<Record<string, unknown>>> {
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

  async getImages(movieId: number): Promise<Array<Record<string, unknown>>> {
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
   * Get all files for a movie from unified file system
   * Returns aggregated view of all file types (video, image, audio, text, unknown)
   */
  async getAllFiles(movieId: number): Promise<{
    video: Array<Record<string, unknown>>;
    images: Array<Record<string, unknown>>;
    audio: Array<Record<string, unknown>>;
    text: Array<Record<string, unknown>>;
    unknown: Array<Record<string, unknown>>;
  }> {
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

      return {
        video: videoFiles,
        images: imageFiles,
        audio: audioFiles,
        text: textFiles,
        unknown: unknownFiles
      };
    } catch (error) {
      throw error;
    }
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
      (row.genre_count ?? 0) > 0 &&
      (row.actor_count ?? 0) > 0 &&
      (row.director_count ?? 0) > 0
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
}
