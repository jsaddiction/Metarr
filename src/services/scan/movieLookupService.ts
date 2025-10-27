import { logger } from '../../middleware/logging.js';
import { DatabaseConnection } from '../../types/database.js';
import { hashFile } from '../hash/hashService.js';
import fs from 'fs/promises';
import { getErrorMessage } from '../../utils/errorHandling.js';

/**
 * Movie Lookup Service
 *
 * Provides TMDB ID-first database lookup strategy for movies.
 * Supports path change detection and automatic updates.
 *
 * Lookup Priority:
 * 1. TMDB ID (authoritative - never changes)
 * 2. File Path (fallback for legacy items)
 * 3. Create New (if not found)
 */

export interface Movie {
  id: number;
  title?: string;
  year?: number;
  tmdb_id?: number;
  imdb_id?: string;
  file_path: string;
  status?: string;
  [key: string]: any;
}

export interface MovieLookupContext {
  libraryId: number;
  tmdbId?: number;
  imdbId?: string;
  filePath: string;
  title?: string;
  year?: number;
}

export interface MovieLookupResult {
  movie: Movie;
  created: boolean;
  pathChanged: boolean;
  restoredFromDeletion: boolean;
}

/**
 * Find movie by TMDB ID
 */
export async function findMovieByTmdbId(
  db: DatabaseConnection,
  tmdbId: number
): Promise<Movie | null> {
  try {
    const results = (await db.query(
      `SELECT * FROM movies WHERE tmdb_id = ?`,
      [tmdbId]
    )) as Movie[];

    return results.length > 0 ? results[0] : null;
  } catch (error) {
    logger.error('Failed to find movie by TMDB ID', {
      tmdbId,
      error: getErrorMessage(error),
    });
    throw error;
  }
}

/**
 * Find movie by file path
 */
export async function findMovieByPath(
  db: DatabaseConnection,
  filePath: string
): Promise<Movie | null> {
  try {
    const results = (await db.query(
      `SELECT * FROM movies WHERE file_path = ?`,
      [filePath]
    )) as Movie[];

    return results.length > 0 ? results[0] : null;
  } catch (error) {
    logger.error('Failed to find movie by path', {
      filePath,
      error: getErrorMessage(error),
    });
    throw error;
  }
}

/**
 * Update movie file path and re-compute hash
 * When path changes, we always re-hash to detect upgrades/quality changes
 */
export async function updateMoviePath(
  db: DatabaseConnection,
  movieId: number,
  newPath: string
): Promise<void> {
  try {
    // Extract new file name
    const fileName = newPath.split(/[\\/]/).pop() || '';

    // Compute file size and hash for new path
    let fileSize: number | null = null;
    let fileHash: string | null = null;

    try {
      const stats = await fs.stat(newPath);
      fileSize = stats.size;

      const hashResult = await hashFile(newPath);
      fileHash = hashResult.hash;

      logger.debug('Computed file hash for updated path', {
        movieId,
        fileSize,
        hash: fileHash.substring(0, 8),
        strategy: hashResult.strategy,
        timeMs: hashResult.timeMs,
      });
    } catch (error) {
      logger.warn('Failed to compute file hash for updated path', {
        movieId,
        newPath,
        error: getErrorMessage(error),
      });
      // Continue with null hash - not critical
    }

    await db.execute(
      `UPDATE movies
       SET file_path = ?,
           file_name = ?,
           file_size = ?,
           file_hash = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [newPath, fileName, fileSize, fileHash, movieId]
    );

    logger.info('Movie path updated', {
      movieId,
      newPath,
      fileSize,
      hashChanged: true, // Always true since we re-hashed
    });
  } catch (error) {
    logger.error('Failed to update movie path', {
      movieId,
      newPath,
      error: getErrorMessage(error),
    });
    throw error;
  }
}

/**
 * Re-compute file hash for existing movie (called during rescans)
 * Always re-hashes to detect in-place file modifications/upgrades
 *
 * @returns true if hash changed (indicates file was modified/upgraded)
 */
export async function rehashMovieFile(
  db: DatabaseConnection,
  movieId: number,
  filePath: string
): Promise<boolean> {
  try {
    // Get current hash from database
    const result = await db.query<{ file_hash: string | null; file_size: number | null }>(
      `SELECT file_hash, file_size FROM movies WHERE id = ?`,
      [movieId]
    );

    if (result.length === 0) {
      logger.warn('Movie not found for rehash', { movieId });
      return false;
    }

    const oldHash = result[0].file_hash;
    const oldSize = result[0].file_size;

    // Compute new file size and hash
    let newSize: number | null = null;
    let newHash: string | null = null;

    try {
      const stats = await fs.stat(filePath);
      newSize = stats.size;

      const hashResult = await hashFile(filePath);
      newHash = hashResult.hash;

      logger.debug('Re-computed file hash for movie', {
        movieId,
        fileSize: newSize,
        hash: newHash.substring(0, 8),
        strategy: hashResult.strategy,
        timeMs: hashResult.timeMs,
      });
    } catch (error) {
      logger.warn('Failed to re-compute file hash', {
        movieId,
        filePath,
        error: getErrorMessage(error),
      });
      return false;
    }

    // Check if hash changed
    const hashChanged = oldHash !== newHash;

    if (hashChanged) {
      logger.info('File hash changed - movie file was modified/upgraded', {
        movieId,
        oldHash: oldHash?.substring(0, 8),
        newHash: newHash?.substring(0, 8),
        oldSize,
        newSize,
      });
    }

    // Update database with new hash
    await db.execute(
      `UPDATE movies
       SET file_size = ?,
           file_hash = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [newSize, newHash, movieId]
    );

    return hashChanged;
  } catch (error) {
    logger.error('Failed to rehash movie file', {
      movieId,
      filePath,
      error: getErrorMessage(error),
    });
    throw error;
  }
}

// clearDeletionFlag function removed - deleted_on column no longer exists in clean schema

/**
 * Generate a placeholder title from file path
 * Extracts the directory name (e.g., "Interstellar (2014)" -> "Interstellar")
 */
function generatePlaceholderTitle(filePath: string): string {
  // Get directory path (remove filename)
  const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));

  // Get directory name (last part of path)
  const dirName = dirPath.split(/[\\/]/).pop() || '';

  // Remove year in parentheses (e.g., "Interstellar (2014)" -> "Interstellar")
  const titleWithoutYear = dirName.replace(/\s*\(\d{4}\)\s*$/, '').trim();

  // If we got something, use it; otherwise fall back to filename
  if (titleWithoutYear) {
    return titleWithoutYear;
  }

  // Last resort: use filename without extension
  const fileName = filePath.split(/[\\/]/).pop() || 'Unknown';
  return fileName.replace(/\.[^.]+$/, '');
}

/**
 * Create new movie record
 */
async function createMovie(db: DatabaseConnection, context: MovieLookupContext): Promise<Movie> {
  try {
    // Extract file name from path
    const fileName = context.filePath.split(/[\\/]/).pop() || '';

    // Generate placeholder title if none provided (required for unidentified movies)
    const title = context.title || generatePlaceholderTitle(context.filePath);

    // Compute file size and hash
    let fileSize: number | null = null;
    let fileHash: string | null = null;

    try {
      const stats = await fs.stat(context.filePath);
      fileSize = stats.size;

      const hashResult = await hashFile(context.filePath);
      fileHash = hashResult.hash;

      logger.debug('Computed file hash for new movie', {
        filePath: context.filePath,
        fileSize,
        hash: fileHash.substring(0, 8),
        strategy: hashResult.strategy,
        timeMs: hashResult.timeMs,
      });
    } catch (error) {
      logger.warn('Failed to compute file hash for new movie', {
        filePath: context.filePath,
        error: getErrorMessage(error),
      });
      // Continue with null hash - not critical for initial creation
    }

    const result = await db.execute(
      `INSERT INTO movies (
        library_id,
        file_path,
        file_name,
        file_size,
        file_hash,
        tmdb_id,
        imdb_id,
        title,
        year,
        identification_status,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        context.libraryId,
        context.filePath,
        fileName,
        fileSize,
        fileHash,
        context.tmdbId || null,
        context.imdbId || null,
        title,
        context.year || null,
        context.tmdbId ? 'identified' : 'unidentified',
      ]
    );

    const movieId = result.insertId!;

    logger.info('Created new movie record', {
      movieId,
      tmdbId: context.tmdbId,
      filePath: context.filePath,
      title: title,
    });

    // Return created movie
    const createdMovie: Movie = {
      id: movieId,
      file_path: context.filePath,
      title: title,
      status: context.tmdbId ? 'identified' : 'unidentified',
    };

    if (context.tmdbId) createdMovie.tmdb_id = context.tmdbId;
    if (context.imdbId) createdMovie.imdb_id = context.imdbId;
    if (context.year) createdMovie.year = context.year;

    return createdMovie;
  } catch (error) {
    logger.error('Failed to create movie record', {
      context,
      error: getErrorMessage(error),
    });
    throw error;
  }
}

/**
 * Find or create movie using TMDB ID-first strategy
 *
 * Lookup Priority:
 * 1. Search by TMDB ID (if provided)
 * 2. Search by file path (fallback)
 * 3. Create new record
 *
 * Automatic Actions:
 * - Updates path if TMDB ID match but path changed
 * - Clears deletion flag if movie was marked for deletion
 */
export async function findOrCreateMovie(
  db: DatabaseConnection,
  context: MovieLookupContext
): Promise<MovieLookupResult> {
  let movie: Movie | null = null;
  let pathChanged = false;
  let restoredFromDeletion = false;

  // Priority 1: Search by TMDB ID
  if (context.tmdbId) {
    movie = await findMovieByTmdbId(db, context.tmdbId);

    if (movie) {
      logger.debug('Found movie by TMDB ID', {
        movieId: movie.id,
        tmdbId: context.tmdbId,
      });

      // Check if path changed
      if (movie.file_path !== context.filePath) {
        logger.info('Movie path changed, updating', {
          movieId: movie.id,
          oldPath: movie.file_path,
          newPath: context.filePath,
        });

        await updateMoviePath(db, movie.id, context.filePath);
        movie.file_path = context.filePath; // Update local object
        pathChanged = true;
      }

      return {
        movie,
        created: false,
        pathChanged,
        restoredFromDeletion,
      };
    }
  }

  // Priority 2: Fallback to path search (for legacy items without TMDB ID)
  if (!movie) {
    movie = await findMovieByPath(db, context.filePath);

    if (movie) {
      logger.debug('Found movie by path', {
        movieId: movie.id,
        filePath: context.filePath,
      });

      // If we found by path but have a TMDB ID in context, update it
      if (context.tmdbId && !movie.tmdb_id) {
        logger.info('Updating movie with TMDB ID from context', {
          movieId: movie.id,
          tmdbId: context.tmdbId,
        });

        await db.execute(
          `UPDATE movies SET tmdb_id = ?, imdb_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [context.tmdbId, context.imdbId || null, movie.id]
        );

        movie.tmdb_id = context.tmdbId;
        if (context.imdbId) movie.imdb_id = context.imdbId;
      }

      return {
        movie,
        created: false,
        pathChanged: false,
        restoredFromDeletion,
      };
    }
  }

  // Priority 3: Create new record
  logger.info('Movie not found, creating new record', {
    tmdbId: context.tmdbId,
    filePath: context.filePath,
    title: context.title,
  });

  const newMovie = await createMovie(db, context);

  return {
    movie: newMovie,
    created: true,
    pathChanged: false,
    restoredFromDeletion: false,
  };
}

// markMovieForDeletion function removed - deleted_on column no longer exists in clean schema
