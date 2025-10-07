import { DatabaseManager } from '../database/DatabaseManager.js';
import { scanMovieDirectory } from './scan/unifiedScanService.js';
import { getDirectoryPath } from './pathMappingService.js';
import { logger } from '../middleware/logging.js';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import { hashSmallFile } from './hash/hashService.js';

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
  assetCounts: AssetCounts;
  assetStatuses: AssetStatuses;
}

export interface MovieFilters {
  status?: string;
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

    if (filters?.status) {
      whereClauses.push('m.status = ?');
      params.push(filters.status);
    }

    if (filters?.libraryId) {
      whereClauses.push('m.library_id = ?');
      params.push(filters.libraryId);
    }

    const limit = filters?.limit || 1000;
    const offset = filters?.offset || 0;

    // Optimized query using JOINs + aggregation instead of subqueries
    const query = `
      SELECT
        m.*,

        -- Get first studio name for display
        MAX(CASE WHEN studio_row = 1 THEN s.name END) as studio_name,

        -- Entity counts for NFO completeness check
        COUNT(DISTINCT mg.genre_id) as genre_count,
        COUNT(DISTINCT ma.actor_id) as actor_count,
        COUNT(DISTINCT md.director_id) as director_count,
        COUNT(DISTINCT mw.writer_id) as writer_count,
        COUNT(DISTINCT ms.studio_id) as studio_count,
        COUNT(DISTINCT mc.country_id) as country_count,
        COUNT(DISTINCT mt.tag_id) as tag_count,

        -- Asset counts
        COUNT(DISTINCT CASE WHEN a.type='poster' THEN a.id END) as poster_count,
        COUNT(DISTINCT CASE WHEN a.type='fanart' THEN a.id END) as fanart_count,
        COUNT(DISTINCT CASE WHEN a.type='landscape' THEN a.id END) as landscape_count,
        COUNT(DISTINCT CASE WHEN a.type='keyart' THEN a.id END) as keyart_count,
        COUNT(DISTINCT CASE WHEN a.type='banner' THEN a.id END) as banner_count,
        COUNT(DISTINCT CASE WHEN a.type='clearart' THEN a.id END) as clearart_count,
        COUNT(DISTINCT CASE WHEN a.type='clearlogo' THEN a.id END) as clearlogo_count,
        COUNT(DISTINCT CASE WHEN a.type='discart' THEN a.id END) as discart_count,
        COUNT(DISTINCT CASE WHEN a.type='trailer' THEN a.id END) as trailer_count,
        COUNT(DISTINCT CASE WHEN a.type='subtitle' THEN a.id END) as subtitle_count,
        COUNT(DISTINCT CASE WHEN a.type='theme' THEN a.id END) as theme_count

      FROM movies m

      -- Studio join with row numbering to get first studio
      LEFT JOIN (
        SELECT
          movie_id,
          studio_id,
          ROW_NUMBER() OVER (PARTITION BY movie_id ORDER BY studio_id) as studio_row
        FROM movies_studios
      ) ms_numbered ON m.id = ms_numbered.movie_id
      LEFT JOIN studios s ON ms_numbered.studio_id = s.id AND ms_numbered.studio_row = 1

      -- Entity relationships for NFO status
      LEFT JOIN movies_genres mg ON m.id = mg.movie_id
      LEFT JOIN movies_actors ma ON m.id = ma.movie_id
      LEFT JOIN movies_directors md ON m.id = md.movie_id
      LEFT JOIN movies_writers mw ON m.id = mw.movie_id
      LEFT JOIN movies_studios ms ON m.id = ms.movie_id
      LEFT JOIN movies_countries mc ON m.id = mc.movie_id
      LEFT JOIN movies_tags mt ON m.id = mt.movie_id

      -- Assets for image/media counts
      LEFT JOIN assets a ON a.entity_type='movie' AND a.entity_id=m.id

      WHERE ${whereClauses.join(' AND ')}

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

  private mapToMovie(row: any): Movie {
    return {
      id: row.id,
      title: row.title || '[Unknown]',
      year: row.year,
      studio: row.studio_name,
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

  async getById(movieId: number): Promise<any | null> {
    // Get base movie data with all fields
    const movieQuery = `SELECT * FROM movies WHERE id = ?`;
    const movies = await this.db.query<any>(movieQuery, [movieId]);

    if (!movies || movies.length === 0) {
      return null;
    }

    const movie = movies[0];

    // Get related entities
    const [actors, genres, directors, writers, studios, countries, tags] = await Promise.all([
      this.db.query<any>('SELECT a.*, ma.role, ma.`order` FROM actors a JOIN movies_actors ma ON a.id = ma.actor_id WHERE ma.movie_id = ? ORDER BY ma.`order`', [movieId]),
      this.db.query<any>('SELECT g.* FROM genres g JOIN movies_genres mg ON g.id = mg.genre_id WHERE mg.movie_id = ?', [movieId]),
      this.db.query<any>('SELECT d.* FROM directors d JOIN movies_directors md ON d.id = md.director_id WHERE md.movie_id = ?', [movieId]),
      this.db.query<any>('SELECT w.* FROM writers w JOIN movies_writers mw ON w.id = mw.writer_id WHERE mw.movie_id = ?', [movieId]),
      this.db.query<any>('SELECT s.* FROM studios s JOIN movies_studios ms ON s.id = ms.studio_id WHERE ms.movie_id = ?', [movieId]),
      this.db.query<any>('SELECT c.* FROM countries c JOIN movies_countries mc ON c.id = mc.country_id WHERE mc.movie_id = ?', [movieId]),
      this.db.query<any>('SELECT t.* FROM tags t JOIN movies_tags mt ON t.id = mt.tag_id WHERE mt.movie_id = ?', [movieId]),
    ]);

    return {
      ...movie,
      actors: actors.map(a => ({ name: a.name, role: a.role, order: a.order, thumb_url: a.thumb_url })),
      genres: genres.map(g => g.name),
      directors: directors.map(d => d.name),
      writers: writers.map(w => w.name),
      studios: studios.map(s => s.name),
      countries: countries.map(c => c.name),
      tags: tags.map(t => t.name),
    };
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
    const query = `
      SELECT
        id,
        type as image_type,
        library_path,
        cache_path,
        provider_url,
        url,
        width,
        height,
        file_size,
        locked,
        created_at
      FROM images
      WHERE entity_type = 'movie' AND entity_id = ?
      ORDER BY type ASC, id ASC
    `;

    return this.db.query<any>(query, [movieId]);
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
    const conn = this.db.getConnection();

    try {
      // Mark file as ignored
      await conn.execute(
        'UPDATE unknown_files SET ignored = 1 WHERE id = ? AND entity_id = ? AND entity_type = ?',
        [fileId, movieId, 'movie']
      );

      logger.info('Marked unknown file as ignored', { movieId, fileId });

      return {
        success: true,
        message: 'File marked as ignored',
      };
    } catch (error: any) {
      logger.error('Failed to ignore unknown file', { movieId, fileId, error: error.message });
      throw error;
    }
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
}
