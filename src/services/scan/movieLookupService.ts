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
      `SELECT * FROM movies WHERE file_path = ?`,
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

// clearDeletionFlag function removed - deleted_on column no longer exists in clean schema

/**
 * Create new movie record
 */
async function createMovie(db: DatabaseConnection, context: MovieLookupContext): Promise<Movie> {
  try {
    // Extract file name from path
    const fileName = context.filePath.split(/[\\/]/).pop() || '';

    const result = await db.execute(
      `INSERT INTO movies (
        library_id,
        file_path,
        file_name,
        tmdb_id,
        imdb_id,
        title,
        year,
        identification_status,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        context.libraryId,
        context.filePath,
        fileName,
        context.tmdbId || null,
        context.imdbId || null,
        context.title || null,
        context.year || null,
        context.tmdbId ? 'identified' : 'unidentified',
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
      status: context.tmdbId ? 'identified' : 'unidentified',
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
