import { DatabaseManager } from '../database/DatabaseManager.js';
import { scanMovieDirectory } from './scan/unifiedScanService.js';
import { getDirectoryPath } from './pathMappingService.js';
import { logger } from '../middleware/logging.js';
import fs from 'fs/promises';
import * as fsSync from 'fs';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import { hashSmallFile } from './hash/hashService.js';
import { cacheService } from './cacheService.js';
import https from 'https';
import http from 'http';

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

export class MovieService {
  constructor(private db: DatabaseManager) {}

  async getAll(filters?: MovieFilters): Promise<MovieListResult> {
    const whereClauses: string[] = ['1=1'];
    const params: any[] = [];

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

    // Optimized query using scalar subqueries instead of JOINs to avoid Cartesian product
    const query = `
      SELECT
        m.*,

        -- Get first studio name (scalar subquery)
        (SELECT s.name FROM studios s
         INNER JOIN movie_studios ms ON s.id = ms.studio_id
         WHERE ms.movie_id = m.id
         ORDER BY ms.studio_id LIMIT 1) as studio_name,

        -- Entity counts for NFO completeness check (scalar subqueries)
        (SELECT COUNT(*) FROM movie_genres WHERE movie_id = m.id) as genre_count,
        (SELECT COUNT(*) FROM movie_actors WHERE movie_id = m.id) as actor_count,
        (SELECT COUNT(*) FROM movie_crew WHERE movie_id = m.id AND role = 'director') as director_count,
        (SELECT COUNT(*) FROM movie_crew WHERE movie_id = m.id AND role = 'writer') as writer_count,
        (SELECT COUNT(DISTINCT studio_id) FROM movie_studios WHERE movie_id = m.id) as studio_count,

        -- NFO parsed timestamp (scalar subquery)
        (SELECT MAX(discovered_at) FROM text_files
         WHERE entity_type = 'movie' AND entity_id = m.id AND text_type = 'nfo') as nfo_parsed_at,

        -- Asset counts from unified file system (scalar subqueries - much faster!)
        (SELECT COUNT(*) FROM image_files WHERE entity_type = 'movie' AND entity_id = m.id AND image_type = 'poster' AND location = 'library') as poster_count,
        (SELECT COUNT(*) FROM image_files WHERE entity_type = 'movie' AND entity_id = m.id AND image_type = 'fanart' AND location = 'library') as fanart_count,
        (SELECT COUNT(*) FROM image_files WHERE entity_type = 'movie' AND entity_id = m.id AND image_type = 'landscape' AND location = 'library') as landscape_count,
        (SELECT COUNT(*) FROM image_files WHERE entity_type = 'movie' AND entity_id = m.id AND image_type = 'keyart' AND location = 'library') as keyart_count,
        (SELECT COUNT(*) FROM image_files WHERE entity_type = 'movie' AND entity_id = m.id AND image_type = 'banner' AND location = 'library') as banner_count,
        (SELECT COUNT(*) FROM image_files WHERE entity_type = 'movie' AND entity_id = m.id AND image_type = 'clearart' AND location = 'library') as clearart_count,
        (SELECT COUNT(*) FROM image_files WHERE entity_type = 'movie' AND entity_id = m.id AND image_type = 'clearlogo' AND location = 'library') as clearlogo_count,
        (SELECT COUNT(*) FROM image_files WHERE entity_type = 'movie' AND entity_id = m.id AND image_type = 'discart' AND location = 'library') as discart_count,
        (SELECT COUNT(*) FROM video_files WHERE entity_type = 'movie' AND entity_id = m.id AND video_type = 'trailer' AND location = 'library') as trailer_count,
        (SELECT COUNT(*) FROM text_files WHERE entity_type = 'movie' AND entity_id = m.id AND text_type = 'subtitle' AND location = 'library') as subtitle_count,
        (SELECT COUNT(*) FROM audio_files WHERE entity_type = 'movie' AND entity_id = m.id AND audio_type = 'theme' AND location = 'library') as theme_count

      FROM movies m

      WHERE ${whereClauses.join(' AND ')}

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

  private mapToMovie(row: any): Movie {
    return {
      id: row.id,
      title: row.title || '[Unknown]',
      year: row.year,
      studio: row.studio_name,
      monitored: row.monitored === 1,
      identification_status: row.identification_status || 'unidentified',
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
  }

  private calculateNFOStatus(row: any): AssetStatus {
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
   * Map database row (snake_case) to TypeScript object (camelCase)
   */
  private mapMovieFromDb(dbRow: any): any {
    return {
      id: dbRow.id,
      libraryId: dbRow.library_id,
      filePath: dbRow.file_path,
      title: dbRow.title,
      originalTitle: dbRow.original_title,
      sortTitle: dbRow.sort_title,
      year: dbRow.year,

      // External IDs (critical for provider lookups)
      tmdbId: dbRow.tmdb_id,
      imdbId: dbRow.imdb_id,

      // Metadata fields
      plot: dbRow.plot,
      outline: dbRow.outline,
      tagline: dbRow.tagline,
      mpaa: dbRow.mpaa,
      premiered: dbRow.premiered,
      userRating: dbRow.user_rating,
      trailerUrl: dbRow.trailer_url,
      setId: dbRow.set_id,

      // Hashes (clean schema only has file_hash)
      fileHash: dbRow.file_hash,

      // Locks
      titleLocked: dbRow.title_locked,
      originalTitleLocked: dbRow.original_title_locked,
      sortTitleLocked: dbRow.sort_title_locked,
      yearLocked: dbRow.year_locked,
      plotLocked: dbRow.plot_locked,
      outlineLocked: dbRow.outline_locked,
      taglineLocked: dbRow.tagline_locked,
      mpaaLocked: dbRow.mpaa_locked,
      premieredLocked: dbRow.premiered_locked,
      userRatingLocked: dbRow.user_rating_locked,
      trailerUrlLocked: dbRow.trailer_url_locked,

      // Timestamps
      createdAt: dbRow.created_at,
      updatedAt: dbRow.updated_at,
    };
  }

  async getById(movieId: number, include: string[] = ['files']): Promise<any | null> {
    // Get base movie data with all fields
    const movieQuery = `SELECT * FROM movies WHERE id = ?`;
    const movies = await this.db.query<any>(movieQuery, [movieId]);

    if (!movies || movies.length === 0) {
      return null;
    }

    const movie = this.mapMovieFromDb(movies[0]);

    // Get related entities (clean schema)
    const [actors, genres, directors, writers, studios] = await Promise.all([
      this.db.query<any>('SELECT a.*, ma.role, ma.actor_order FROM actors a JOIN movie_actors ma ON a.id = ma.actor_id WHERE ma.movie_id = ? ORDER BY ma.actor_order', [movieId]),
      this.db.query<any>('SELECT g.* FROM genres g JOIN movie_genres mg ON g.id = mg.genre_id WHERE mg.movie_id = ?', [movieId]),
      this.db.query<any>('SELECT c.* FROM crew c JOIN movie_crew mc ON c.id = mc.crew_id WHERE mc.movie_id = ? AND mc.role = \'director\'', [movieId]),
      this.db.query<any>('SELECT c.* FROM crew c JOIN movie_crew mc ON c.id = mc.crew_id WHERE mc.movie_id = ? AND mc.role = \'writer\'', [movieId]),
      this.db.query<any>('SELECT s.* FROM studios s JOIN movie_studios ms ON s.id = ms.studio_id WHERE ms.movie_id = ?', [movieId]),
    ]);

    const result: any = {
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

  async getUnknownFiles(movieId: number): Promise<any[]> {
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

    return this.db.query<any>(query, [movieId]);
  }

  async getImages(movieId: number): Promise<any[]> {
    const conn = this.db.getConnection();

    // Query image_files for cache images
    const images = await conn.query(
      `SELECT
        id, entity_type, entity_id, file_path, file_name, file_size,
        image_type, width, height, format, source_type, source_url, provider_name,
        classification_score, reference_count, discovered_at
      FROM image_files
      WHERE entity_type = 'movie' AND entity_id = ? AND location = 'cache'
      ORDER BY image_type, classification_score DESC`,
      [movieId]
    );

    return images;
  }

  async getExtras(movieId: number): Promise<{
    trailer: any | null;
    subtitles: any[];
    themeSong: any | null;
  }> {
    const conn = this.db.getConnection();

    // Get trailer (video_file with video_type='trailer')
    const trailers = await conn.query(
      `SELECT * FROM video_files
       WHERE entity_type = 'movie' AND entity_id = ? AND video_type = 'trailer'
       LIMIT 1`,
      [movieId]
    );

    // Get subtitles (text_files with text_type='subtitle')
    const subtitles = await conn.query(
      `SELECT * FROM text_files
       WHERE entity_type = 'movie' AND entity_id = ? AND text_type = 'subtitle'`,
      [movieId]
    );

    // Get theme song (audio_file with audio_type='theme')
    const themes = await conn.query(
      `SELECT * FROM audio_files
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
   * Assign an unknown file to a specific asset type
   * This processes the file as if it were discovered during scanning
   */
  async assignUnknownFile(movieId: number, fileId: number, fileType: string): Promise<any> {
    const conn = this.db.getConnection();

    try {
      // Get the unknown file record
      const unknownFileResults = await conn.query(
        'SELECT * FROM unknown_files WHERE id = ? AND entity_id = ? AND entity_type = ?',
        [fileId, movieId, 'movie']
      );

      if (!unknownFileResults || unknownFileResults.length === 0) {
        throw new Error('Unknown file not found');
      }

      const unknownFile = unknownFileResults[0];
      const originalFilePath = unknownFile.file_path;

      // Get movie details
      const movieResults = await conn.query(
        'SELECT id, file_path, title, year FROM movies WHERE id = ?',
        [movieId]
      );

      if (!movieResults || movieResults.length === 0) {
        throw new Error('Movie not found');
      }

      const movie = movieResults[0];
      const movieDir = path.dirname(movie.file_path);
      const movieFileName = path.parse(movie.file_path).name;

      // Validate file type for images
      const imageTypes = ['poster', 'fanart', 'landscape', 'keyart', 'banner', 'clearart', 'clearlogo', 'discart'];

      if (imageTypes.includes(fileType)) {
        const ext = path.extname(originalFilePath);

        // TWO-COPY ARCHITECTURE:
        // 1. Discovered in library → Copy to cache (keep library copy)
        // 2. Library copy must follow Kodi naming convention for media player scans
        // 3. Cache is source of truth for rebuild operations

        // Hash the original file
        let fileHash: string | undefined;
        try {
          const hashResult = await hashSmallFile(originalFilePath);
          fileHash = hashResult.hash;
        } catch (error: any) {
          logger.warn('Failed to hash image file', {
            filePath: originalFilePath,
            error: error.message,
          });
        }

        // Get image dimensions and file stats
        const stats = await fs.stat(originalFilePath);
        let width: number | undefined;
        let height: number | undefined;

        try {
          const metadata = await sharp(originalFilePath).metadata();
          width = metadata.width;
          height = metadata.height;
        } catch (error: any) {
          logger.warn('Failed to get image dimensions', {
            filePath: originalFilePath,
            error: error.message,
          });
        }

        // Step 1: Copy to cache (source of truth)
        const cacheDir = path.join(process.cwd(), 'data', 'cache', 'images', movieId.toString());
        await fs.mkdir(cacheDir, { recursive: true });

        const hash = crypto.randomBytes(8).toString('hex');
        const cacheFileName = `${fileType}_${hash}${ext}`;
        const cachePath = path.join(cacheDir, cacheFileName);

        await fs.copyFile(originalFilePath, cachePath);
        logger.debug('Copied image to cache', {
          from: originalFilePath,
          to: cachePath,
        });

        // Step 2: Ensure library file follows Kodi naming convention
        const properFileName = `${movieFileName}-${fileType}${ext}`;
        const properLibraryPath = path.join(movieDir, properFileName);

        let finalLibraryPath = originalFilePath;
        if (originalFilePath !== properLibraryPath) {
          // Check if properly named file already exists
          try {
            await fs.access(properLibraryPath);
            // Properly named file exists - check if it's the same content
            if (await this.areFilesSame(originalFilePath, properLibraryPath)) {
              // Same file, delete the incorrectly named duplicate
              await fs.unlink(originalFilePath);
              finalLibraryPath = properLibraryPath;
              logger.info('Deleted duplicate, using existing Kodi-compliant file', {
                deleted: originalFilePath,
                keeping: properLibraryPath,
              });
            } else {
              // Different content - replace the old one with new assignment
              await fs.unlink(properLibraryPath);
              await fs.rename(originalFilePath, properLibraryPath);
              finalLibraryPath = properLibraryPath;
              logger.info('Replaced existing file with newly assigned image', {
                from: originalFilePath,
                to: properLibraryPath,
              });
            }
          } catch (error) {
            // Properly named file doesn't exist - rename to Kodi convention
            await fs.rename(originalFilePath, properLibraryPath);
            finalLibraryPath = properLibraryPath;
            logger.info('Renamed to Kodi naming convention', {
              from: originalFilePath,
              to: properLibraryPath,
            });
          }
        }

        // Insert into images table with BOTH cache_path and library_path
        await conn.execute(
          `INSERT INTO images (
            entity_type, entity_id, type, cache_path, library_path, file_size, file_hash, width, height
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ['movie', movieId, fileType, cachePath, finalLibraryPath, stats.size, fileHash, width, height]
        );

        logger.info('Assigned unknown file as image (two-copy architecture)', {
          movieId,
          fileId,
          fileType,
          cachePath,
          libraryPath: finalLibraryPath,
        });
      } else if (fileType === 'trailer') {
        // Handle trailer assignment
        const ext = path.extname(originalFilePath);
        const newFileName = `${movieFileName}-trailer${ext}`;
        const newFilePath = path.join(movieDir, newFileName);

        let finalFilePath = originalFilePath;
        if (originalFilePath !== newFilePath) {
          try {
            await fs.access(newFilePath);
            if (await this.areFilesSame(originalFilePath, newFilePath)) {
              finalFilePath = newFilePath;
              await fs.unlink(originalFilePath);
            }
          } catch (error) {
            await fs.rename(originalFilePath, newFilePath);
            finalFilePath = newFilePath;
          }
        }

        const stats = await fs.stat(finalFilePath);
        let fileHash: string | undefined;
        try {
          const hashResult = await hashSmallFile(finalFilePath);
          fileHash = hashResult.hash;
        } catch (error: any) {
          logger.warn('Failed to hash trailer file', { filePath: finalFilePath, error: error.message });
        }

        await conn.execute(
          `INSERT INTO trailers (
            entity_type, entity_id, source_type, local_path, file_size, file_hash
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          ['movie', movieId, 'local', finalFilePath, stats.size, fileHash]
        );

        logger.info('Assigned unknown file as trailer', { movieId, fileId, originalPath: originalFilePath, finalPath: finalFilePath });
      } else if (fileType === 'subtitle') {
        // Handle subtitle assignment
        await conn.execute(
          `INSERT INTO subtitle_streams (
            entity_type, entity_id, source_type, file_path
          ) VALUES (?, ?, ?, ?)`,
          ['movie', movieId, 'external', originalFilePath]
        );

        logger.info('Assigned unknown file as subtitle', { movieId, fileId, filePath: originalFilePath });
      } else if (fileType === 'theme') {
        // Handle theme song assignment
        const ext = path.extname(originalFilePath);
        const newFileName = `${movieFileName}-theme${ext}`;
        const newFilePath = path.join(movieDir, newFileName);

        let finalFilePath = originalFilePath;
        if (originalFilePath !== newFilePath) {
          try {
            await fs.access(newFilePath);
            if (await this.areFilesSame(originalFilePath, newFilePath)) {
              finalFilePath = newFilePath;
              await fs.unlink(originalFilePath);
            }
          } catch (error) {
            await fs.rename(originalFilePath, newFilePath);
            finalFilePath = newFilePath;
          }
        }

        // Store theme in assets table or a dedicated theme table if it exists
        // For now, we'll log it as unhandled
        logger.warn('Theme song assignment not yet fully implemented', { movieId, fileId, filePath: finalFilePath });
      }

      // Delete from unknown_files table
      await conn.execute('DELETE FROM unknown_files WHERE id = ?', [fileId]);

      return {
        success: true,
        message: `Successfully assigned file as ${fileType}`,
        fileType,
      };
    } catch (error: any) {
      logger.error('Failed to assign unknown file', {
        movieId,
        fileId,
        fileType,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Check if two files have the same content by comparing their hashes
   */
  private async areFilesSame(file1: string, file2: string): Promise<boolean> {
    try {
      const hash1Result = await hashSmallFile(file1);
      const hash2Result = await hashSmallFile(file2);
      return hash1Result.hash === hash2Result.hash;
    } catch (error) {
      return false;
    }
  }

  /**
   * Mark an unknown file as ignored
   * File will remain in library but won't appear in unknown files list
   */
  async ignoreUnknownFile(movieId: number, fileId: number): Promise<any> {
    // NOTE: Ignore functionality not yet implemented in schema
    // The unknown_files table doesn't have an 'ignored' column yet
    // For now, this is a no-op that returns success
    logger.info('Ignore unknown file requested (not implemented)', { movieId, fileId });

    return {
      success: true,
      message: 'Ignore functionality not yet implemented',
    };
  }

  /**
   * Delete an unknown file from the filesystem
   */
  async deleteUnknownFile(movieId: number, fileId: number): Promise<any> {
    const conn = this.db.getConnection();

    try {
      // Get the file path
      const results = await conn.query(
        'SELECT file_path FROM unknown_files WHERE id = ? AND entity_id = ? AND entity_type = ?',
        [fileId, movieId, 'movie']
      );

      if (!results || results.length === 0) {
        throw new Error('Unknown file not found');
      }

      const filePath = results[0].file_path;

      // Delete the file from filesystem
      try {
        await fs.unlink(filePath);
        logger.info('Deleted unknown file from filesystem', { movieId, fileId, filePath });
      } catch (error: any) {
        logger.warn('Failed to delete file from filesystem (may already be deleted)', {
          movieId,
          fileId,
          filePath,
          error: error.message,
        });
      }

      // Remove from database
      await conn.execute(
        'DELETE FROM unknown_files WHERE id = ? AND entity_id = ? AND entity_type = ?',
        [fileId, movieId, 'movie']
      );

      return {
        success: true,
        message: 'File deleted successfully',
      };
    } catch (error: any) {
      logger.error('Failed to delete unknown file', { movieId, fileId, error: error.message });
      throw error;
    }
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
        throw new Error(`Movie not found: ${movieId}`);
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
      const scanContext: any = {
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
    } catch (error: any) {
      logger.error('Failed to refresh movie', {
        movieId,
        error: error.message,
      });
      throw error;
    }
  }
  async updateMetadata(movieId: number, metadata: any): Promise<any> {
    const conn = this.db.getConnection();

    try {
      // Build the UPDATE query dynamically based on provided fields
      const updateFields: string[] = [];
      const updateValues: any[] = [];

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
          updateValues.push(metadata[field]);
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

      // Return the updated movie
      return await this.getById(movieId);
    } catch (error: any) {
      logger.error('Failed to update movie metadata', {
        movieId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Save asset selections for a movie
   * Downloads assets from provider URLs, stores in cache, creates library copies
   */
  async saveAssets(movieId: number, selections: any, metadata?: any): Promise<any> {
    const conn = this.db.getConnection();

    try {
      const results = {
        success: true,
        savedAssets: [] as any[],
        errors: [] as string[],
      };

      // Get movie details
      const movieResults = await conn.query(
        'SELECT id, file_path, title, year FROM movies WHERE id = ?',
        [movieId]
      );

      if (!movieResults || movieResults.length === 0) {
        throw new Error('Movie not found');
      }

      const movie = movieResults[0];
      const movieDir = path.dirname(movie.file_path);
      const movieFileName = path.parse(movie.file_path).name;

      // Update metadata if provided
      if (metadata) {
        await this.updateMetadata(movieId, metadata);
      }

      // Process each asset selection
      for (const [assetType, assetData] of Object.entries(selections)) {
        try {
          const asset = assetData as any;

          if (!asset.url) {
            results.errors.push(`Asset ${assetType}: No URL provided`);
            continue;
          }

          // Download asset to temporary location
          const tempFilePath = path.join(process.cwd(), 'data', 'temp', `${crypto.randomBytes(16).toString('hex')}${path.extname(asset.url)}`);
          await fs.mkdir(path.dirname(tempFilePath), { recursive: true });

          await this.downloadFile(asset.url, tempFilePath);

          // Get image dimensions
          let width: number | undefined;
          let height: number | undefined;

          try {
            const imageMetadata = await sharp(tempFilePath).metadata();
            width = imageMetadata.width;
            height = imageMetadata.height;
          } catch (error) {
            logger.warn('Could not get image dimensions', { assetType, url: asset.url });
          }

          // Store in cache using CacheService
          const cacheMetadata: any = {
            mimeType: asset.metadata?.mimeType || 'image/jpeg',
            sourceType: 'provider' as const,
            sourceUrl: asset.url,
            providerName: asset.provider,
          };

          if (width !== undefined) cacheMetadata.width = width;
          if (height !== undefined) cacheMetadata.height = height;

          const cacheResult = await cacheService.addAsset(tempFilePath, cacheMetadata);

          // Create library copy with Kodi naming convention
          const libraryFileName = `${movieFileName}-${assetType}${path.extname(tempFilePath)}`;
          const libraryPath = path.join(movieDir, libraryFileName);

          await fs.copyFile(cacheResult.cachePath, libraryPath);

          // Insert or update image record in database
          const existing = await conn.get(
            'SELECT id FROM images WHERE entity_type = ? AND entity_id = ? AND type = ?',
            ['movie', movieId, assetType]
          );

          if (existing) {
            // Update existing
            await conn.execute(
              `UPDATE images SET
                cache_path = ?,
                library_path = ?,
                provider_url = ?,
                url = ?,
                width = ?,
                height = ?,
                file_size = ?
              WHERE id = ?`,
              [
                cacheResult.cachePath,
                libraryPath,
                asset.provider,
                asset.url,
                width,
                height,
                cacheResult.fileSize,
                existing.id
              ]
            );
          } else {
            // Insert new
            await conn.execute(
              `INSERT INTO images (
                entity_type, entity_id, type,
                cache_path, library_path, provider_url, url,
                width, height, file_size
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                'movie',
                movieId,
                assetType,
                cacheResult.cachePath,
                libraryPath,
                asset.provider,
                asset.url,
                width,
                height,
                cacheResult.fileSize
              ]
            );
          }

          // Clean up temp file
          try {
            await fs.unlink(tempFilePath);
          } catch (error) {
            // Ignore cleanup errors
          }

          results.savedAssets.push({
            assetType,
            cacheAssetId: cacheResult.id,
            cachePath: cacheResult.cachePath,
            libraryPath,
            isNew: cacheResult.isNew,
          });

          logger.info('Saved asset', {
            movieId,
            assetType,
            provider: asset.provider,
            cacheAssetId: cacheResult.id,
            isNew: cacheResult.isNew,
          });

        } catch (error: any) {
          results.errors.push(`Asset ${assetType}: ${error.message}`);
          logger.error('Failed to save asset', {
            movieId,
            assetType,
            error: error.message,
          });
        }
      }

      logger.info('Asset save complete', {
        movieId,
        savedCount: results.savedAssets.length,
        errorCount: results.errors.length,
      });

      return results;

    } catch (error: any) {
      logger.error('Failed to save assets', {
        movieId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Download file from URL
   */
  private async downloadFile(url: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;

      protocol.get(url, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          // Handle redirect
          if (response.headers.location) {
            this.downloadFile(response.headers.location, destPath)
              .then(resolve)
              .catch(reject);
            return;
          }
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
          return;
        }

        const fileStream = fsSync.createWriteStream(destPath);
        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });

        fileStream.on('error', (err: Error) => {
          fs.unlink(destPath).catch(() => {});
          reject(err);
        });

      }).on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Rebuild movie assets from cache to library directory
   * Part of TWO-COPY ARCHITECTURE - cache is source of truth
   */
  async rebuildMovieAssets(movieId: number): Promise<any> {
    const conn = this.db.getConnection();

    try {
      // Get movie details
      const movieResults = await conn.query(
        'SELECT id, file_path, title, year FROM movies WHERE id = ?',
        [movieId]
      );

      if (!movieResults || movieResults.length === 0) {
        throw new Error('Movie not found');
      }

      const movie = movieResults[0];
      const movieDir = path.dirname(movie.file_path);
      const movieFileName = path.parse(movie.file_path).name;

      const results = {
        success: true,
        rebuilt: {
          images: 0,
          trailers: 0,
          subtitles: 0,
        },
        errors: [] as string[],
      };

      // Rebuild images from cache
      const images = await conn.query(
        'SELECT id, type, cache_path FROM images WHERE entity_type = ? AND entity_id = ?',
        ['movie', movieId]
      );

      for (const image of images) {
        try {
          if (!image.cache_path) {
            results.errors.push(`Image ${image.id} has no cache_path`);
            continue;
          }

          const ext = path.extname(image.cache_path);
          const libraryFileName = `${movieFileName}-${image.type}${ext}`;
          const libraryPath = path.join(movieDir, libraryFileName);

          // Copy from cache to library
          await fs.copyFile(image.cache_path, libraryPath);

          // Update library_path in database
          await conn.execute(
            'UPDATE images SET library_path = ? WHERE id = ?',
            [libraryPath, image.id]
          );

          results.rebuilt.images++;
          logger.debug('Rebuilt image from cache', {
            imageId: image.id,
            type: image.type,
            cachePath: image.cache_path,
            libraryPath,
          });
        } catch (error: any) {
          results.errors.push(`Failed to rebuild image ${image.id}: ${error.message}`);
          logger.error('Failed to rebuild image from cache', {
            imageId: image.id,
            error: error.message,
          });
        }
      }

      // Rebuild trailers from cache
      const trailers = await conn.query(
        'SELECT id, cache_path FROM trailers WHERE entity_type = ? AND entity_id = ?',
        ['movie', movieId]
      );

      for (const trailer of trailers) {
        try {
          if (!trailer.cache_path) {
            results.errors.push(`Trailer ${trailer.id} has no cache_path`);
            continue;
          }

          const ext = path.extname(trailer.cache_path);
          const libraryFileName = `${movieFileName}-trailer${ext}`;
          const libraryPath = path.join(movieDir, libraryFileName);

          await fs.copyFile(trailer.cache_path, libraryPath);

          await conn.execute(
            'UPDATE trailers SET local_path = ? WHERE id = ?',
            [libraryPath, trailer.id]
          );

          results.rebuilt.trailers++;
          logger.debug('Rebuilt trailer from cache', {
            trailerId: trailer.id,
            cachePath: trailer.cache_path,
            libraryPath,
          });
        } catch (error: any) {
          results.errors.push(`Failed to rebuild trailer ${trailer.id}: ${error.message}`);
          logger.error('Failed to rebuild trailer from cache', {
            trailerId: trailer.id,
            error: error.message,
          });
        }
      }

      // Rebuild subtitles from cache
      const subtitles = await conn.query(
        'SELECT id, cache_path, language FROM subtitle_streams WHERE entity_type = ? AND entity_id = ?',
        ['movie', movieId]
      );

      for (const subtitle of subtitles) {
        try {
          if (!subtitle.cache_path) {
            results.errors.push(`Subtitle ${subtitle.id} has no cache_path`);
            continue;
          }

          const ext = path.extname(subtitle.cache_path);
          const lang = subtitle.language || 'unknown';
          const libraryFileName = `${movieFileName}.${lang}${ext}`;
          const libraryPath = path.join(movieDir, libraryFileName);

          await fs.copyFile(subtitle.cache_path, libraryPath);

          await conn.execute(
            'UPDATE subtitle_streams SET file_path = ? WHERE id = ?',
            [libraryPath, subtitle.id]
          );

          results.rebuilt.subtitles++;
          logger.debug('Rebuilt subtitle from cache', {
            subtitleId: subtitle.id,
            cachePath: subtitle.cache_path,
            libraryPath,
          });
        } catch (error: any) {
          results.errors.push(`Failed to rebuild subtitle ${subtitle.id}: ${error.message}`);
          logger.error('Failed to rebuild subtitle from cache', {
            subtitleId: subtitle.id,
            error: error.message,
          });
        }
      }

      logger.info('Asset rebuild complete', {
        movieId,
        rebuilt: results.rebuilt,
        errorCount: results.errors.length,
      });

      return results;
    } catch (error: any) {
      logger.error('Failed to rebuild movie assets', {
        movieId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Verify movie assets - check cache vs library paths
   */
  async verifyMovieAssets(movieId: number): Promise<any> {
    const conn = this.db.getConnection();

    try {
      const results = {
        success: true,
        verified: {
          images: { total: 0, missing_cache: 0, missing_library: 0, ok: 0 },
          trailers: { total: 0, missing_cache: 0, missing_library: 0, ok: 0 },
          subtitles: { total: 0, missing_cache: 0, missing_library: 0, ok: 0 },
        },
        details: [] as string[],
      };

      // Verify images
      const images = await conn.query(
        'SELECT id, type, cache_path, library_path FROM images WHERE entity_type = ? AND entity_id = ?',
        ['movie', movieId]
      );

      for (const image of images) {
        results.verified.images.total++;
        let cacheExists = false;
        let libraryExists = false;

        try {
          if (image.cache_path) {
            await fs.access(image.cache_path);
            cacheExists = true;
          }
        } catch (error) {
          results.verified.images.missing_cache++;
          results.details.push(`Image ${image.type} (${image.id}): cache missing`);
        }

        try {
          if (image.library_path) {
            await fs.access(image.library_path);
            libraryExists = true;
          }
        } catch (error) {
          results.verified.images.missing_library++;
          results.details.push(`Image ${image.type} (${image.id}): library copy missing`);
        }

        if (cacheExists && libraryExists) {
          results.verified.images.ok++;
        }
      }

      // Verify trailers
      const trailers = await conn.query(
        'SELECT id, cache_path, local_path FROM trailers WHERE entity_type = ? AND entity_id = ?',
        ['movie', movieId]
      );

      for (const trailer of trailers) {
        results.verified.trailers.total++;
        let cacheExists = false;
        let libraryExists = false;

        try {
          if (trailer.cache_path) {
            await fs.access(trailer.cache_path);
            cacheExists = true;
          }
        } catch (error) {
          results.verified.trailers.missing_cache++;
          results.details.push(`Trailer ${trailer.id}: cache missing`);
        }

        try {
          if (trailer.local_path) {
            await fs.access(trailer.local_path);
            libraryExists = true;
          }
        } catch (error) {
          results.verified.trailers.missing_library++;
          results.details.push(`Trailer ${trailer.id}: library copy missing`);
        }

        if (cacheExists && libraryExists) {
          results.verified.trailers.ok++;
        }
      }

      // Verify subtitles
      const subtitles = await conn.query(
        'SELECT id, cache_path, file_path FROM subtitle_streams WHERE entity_type = ? AND entity_id = ?',
        ['movie', movieId]
      );

      for (const subtitle of subtitles) {
        results.verified.subtitles.total++;
        let cacheExists = false;
        let libraryExists = false;

        try {
          if (subtitle.cache_path) {
            await fs.access(subtitle.cache_path);
            cacheExists = true;
          }
        } catch (error) {
          results.verified.subtitles.missing_cache++;
          results.details.push(`Subtitle ${subtitle.id}: cache missing`);
        }

        try {
          if (subtitle.file_path) {
            await fs.access(subtitle.file_path);
            libraryExists = true;
          }
        } catch (error) {
          results.verified.subtitles.missing_library++;
          results.details.push(`Subtitle ${subtitle.id}: library copy missing`);
        }

        if (cacheExists && libraryExists) {
          results.verified.subtitles.ok++;
        }
      }

      logger.info('Asset verification complete', {
        movieId,
        verified: results.verified,
      });

      return results;
    } catch (error: any) {
      logger.error('Failed to verify movie assets', {
        movieId,
        error: error.message,
      });
      throw error;
    }
  }

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
    } catch (error: any) {
      logger.error('Failed to toggle monitored status', {
        movieId,
        error: error.message
      });
      throw error;
    }
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
    } catch (error: any) {
      logger.error('Failed to lock field', {
        movieId,
        fieldName,
        error: error.message
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
    } catch (error: any) {
      logger.error('Failed to unlock field', {
        movieId,
        fieldName,
        error: error.message
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
    } catch (error: any) {
      logger.error('Failed to reset metadata', {
        movieId,
        error: error.message
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

      // Get video files
      const videoFiles = await conn.query(
        `SELECT
          id, file_path, file_name, file_size, location, video_type,
          codec, width, height, duration_seconds, bitrate, framerate, hdr_type,
          audio_codec, audio_channels, audio_language,
          source_type, source_url, provider_name, classification_score,
          library_file_id, cache_file_id, discovered_at
        FROM video_files
        WHERE entity_type = 'movie' AND entity_id = ?
        ORDER BY video_type, discovered_at DESC`,
        [movieId]
      );

      // Get image files
      const imageFiles = await conn.query(
        `SELECT
          id, file_path, file_name, file_size, location, image_type,
          width, height, format, perceptual_hash,
          source_type, source_url, provider_name, classification_score,
          library_file_id, cache_file_id, reference_count, discovered_at
        FROM image_files
        WHERE entity_type = 'movie' AND entity_id = ?
        ORDER BY image_type, classification_score DESC, discovered_at DESC`,
        [movieId]
      );

      // Get audio files
      const audioFiles = await conn.query(
        `SELECT
          id, file_path, file_name, file_size, location, audio_type,
          codec, duration_seconds, bitrate, sample_rate, channels, language,
          source_type, source_url, provider_name, classification_score,
          library_file_id, cache_file_id, discovered_at
        FROM audio_files
        WHERE entity_type = 'movie' AND entity_id = ?
        ORDER BY audio_type, discovered_at DESC`,
        [movieId]
      );

      // Get text files (NFO, subtitles, etc.)
      const textFiles = await conn.query(
        `SELECT
          id, file_path, file_name, file_size, location, text_type,
          subtitle_language, subtitle_format, nfo_is_valid, nfo_has_tmdb_id, nfo_needs_regen,
          source_type, source_url, provider_name, classification_score,
          library_file_id, cache_file_id, discovered_at
        FROM text_files
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
    } catch (error: any) {
      logger.error('Failed to get all files for movie', {
        movieId,
        error: error.message
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
    } catch (error: any) {
      logger.error('Failed to soft delete movie', {
        movieId,
        error: error.message
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
        throw new Error('Movie not found');
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
    } catch (error: any) {
      logger.error('Failed to restore movie', {
        movieId,
        error: error.message
      });
      throw error;
    }
  }
}
