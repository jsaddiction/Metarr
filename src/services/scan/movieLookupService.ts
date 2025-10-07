import { logger } from '../../middleware/logging.js';
import { DatabaseConnection } from '../../types/database.js';

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
  deleted_on?: string | null;
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
      `SELECT * FROM movies WHERE tmdb_id = ? AND deleted_on IS NULL`,
      [tmdbId]
    )) as Movie[];

    return results.length > 0 ? results[0] : null;
  } catch (error: any) {
    logger.error('Failed to find movie by TMDB ID', {
      tmdbId,
      error: error.message,
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
      `SELECT * FROM movies WHERE file_path = ? AND deleted_on IS NULL`,
      [filePath]
    )) as Movie[];

    return results.length > 0 ? results[0] : null;
  } catch (error: any) {
    logger.error('Failed to find movie by path', {
      filePath,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Update movie file path
 */
export async function updateMoviePath(
  db: DatabaseConnection,
  movieId: number,
  newPath: string
): Promise<void> {
  try {
    await db.execute(
      `UPDATE movies SET file_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [newPath, movieId]
    );

    logger.info('Movie path updated', {
      movieId,
      newPath,
    });
  } catch (error: any) {
    logger.error('Failed to update movie path', {
      movieId,
      newPath,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Clear deletion flag on movie
 * Used when a previously deleted movie is restored
 */
export async function clearDeletionFlag(db: DatabaseConnection, movieId: number): Promise<void> {
  try {
    await db.execute(
      `UPDATE movies SET deleted_on = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [movieId]
    );

    // Also clear deletion flag on images
    await db.execute(
      `UPDATE images SET deleted_on = NULL WHERE entity_type = 'movie' AND entity_id = ?`,
      [movieId]
    );

    logger.info('Movie restored from deletion', { movieId });
  } catch (error: any) {
    logger.error('Failed to clear deletion flag', {
      movieId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Create new movie record
 */
async function createMovie(db: DatabaseConnection, context: MovieLookupContext): Promise<Movie> {
  try {
    const result = await db.execute(
      `INSERT INTO movies (
        library_id,
        file_path,
        tmdb_id,
        imdb_id,
        title,
        year,
        status,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        context.libraryId,
        context.filePath,
        context.tmdbId || null,
        context.imdbId || null,
        context.title || null,
        context.year || null,
        context.tmdbId ? 'processing_webhook' : 'needs_identification',
      ]
    );

    const movieId = result.insertId!;

    logger.info('Created new movie record', {
      movieId,
      tmdbId: context.tmdbId,
      filePath: context.filePath,
      title: context.title,
    });

    // Return created movie
    const createdMovie: Movie = {
      id: movieId,
      file_path: context.filePath,
      status: context.tmdbId ? 'processing_webhook' : 'needs_identification',
    };

    if (context.tmdbId) createdMovie.tmdb_id = context.tmdbId;
    if (context.imdbId) createdMovie.imdb_id = context.imdbId;
    if (context.title) createdMovie.title = context.title;
    if (context.year) createdMovie.year = context.year;

    return createdMovie;
  } catch (error: any) {
    logger.error('Failed to create movie record', {
      context,
      error: error.message,
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

      // Check if was marked for deletion
      if (movie.deleted_on) {
        logger.info('Movie was marked for deletion, restoring', {
          movieId: movie.id,
          deletedOn: movie.deleted_on,
        });

        await clearDeletionFlag(db, movie.id);
        movie.deleted_on = null; // Update local object
        restoredFromDeletion = true;
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

      // Check if was marked for deletion
      if (movie.deleted_on) {
        await clearDeletionFlag(db, movie.id);
        movie.deleted_on = null;
        restoredFromDeletion = true;
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

/**
 * Mark movie for deletion
 * Sets deleted_on to 7 days from now
 */
export async function markMovieForDeletion(
  db: DatabaseConnection,
  movieId: number,
  reason?: string
): Promise<void> {
  try {
    await db.execute(
      `UPDATE movies SET deleted_on = datetime('now', '+7 days'), updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [movieId]
    );

    // Mark images for deletion
    await db.execute(
      `UPDATE images SET deleted_on = datetime('now', '+7 days') WHERE entity_type = 'movie' AND entity_id = ?`,
      [movieId]
    );

    logger.info('Movie marked for deletion', {
      movieId,
      reason,
      deleteOn: '7 days from now',
    });
  } catch (error: any) {
    logger.error('Failed to mark movie for deletion', {
      movieId,
      error: error.message,
    });
    throw error;
  }
}
