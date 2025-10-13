import { DatabaseManager } from '../../database/DatabaseManager.js';
import { tmdbService } from '../providers/TMDBService.js';
import { Job } from '../jobQueueService.js';
import { logger } from '../../middleware/logging.js';

/**
 * Scheduled Provider Update Job Handler
 *
 * Processes scheduled-provider-update jobs by fetching updated metadata
 * and assets from providers in ONE API call (efficient).
 *
 * Respects field locks to prevent overwriting user changes.
 */
export function createScheduledProviderUpdateHandler(
  dbManager: DatabaseManager
): (job: Job) => Promise<void> {
  return async (job: Job) => {
    const { libraryId, manual } = job.payload;

    if (!libraryId || typeof libraryId !== 'number') {
      throw new Error('Invalid job payload: libraryId is required');
    }

    logger.info('Processing scheduled provider update job', {
      jobId: job.id,
      libraryId,
      manual: !!manual,
    });

    try {
      // Get library details
      const library = await dbManager.getConnection().get<{
        id: number;
        name: string;
        type: string;
      }>('SELECT id, name, type FROM libraries WHERE id = ?', [libraryId]);

      if (!library) {
        throw new Error(`Library not found: ${libraryId}`);
      }

      // Only process movie libraries for now (TV shows not implemented yet)
      if (library.type !== 'movies') {
        logger.info('Skipping non-movie library', {
          jobId: job.id,
          libraryId,
          libraryType: library.type,
        });
        return;
      }

      // Get all movies in library that have been scraped
      const movies = await dbManager.getConnection().query<{
        id: number;
        title: string;
        tmdb_id: number | null;
        last_scraped_at: string | null;
      }>(
        `SELECT id, title, tmdb_id, last_scraped_at
         FROM movies
         WHERE library_id = ? AND tmdb_id IS NOT NULL
         ORDER BY last_scraped_at ASC NULLS FIRST
         LIMIT 100`, // Process in batches of 100
        [libraryId]
      );

      logger.info('Found movies to update from providers', {
        jobId: job.id,
        libraryId,
        movieCount: movies.length,
      });

      let updatedCount = 0;
      let failedCount = 0;

      // Update each movie from provider
      for (const movie of movies) {
        try {
          await updateMovieFromProvider(dbManager, movie);
          updatedCount++;
        } catch (error) {
          failedCount++;
          logger.error('Failed to update movie from provider', {
            jobId: job.id,
            movieId: movie.id,
            movieTitle: movie.title,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      logger.info('Scheduled provider update completed', {
        jobId: job.id,
        libraryId,
        libraryName: library.name,
        updatedCount,
        failedCount,
      });
    } catch (error) {
      logger.error('Scheduled provider update failed', {
        jobId: job.id,
        libraryId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };
}

/**
 * Update a single movie from provider (metadata + assets in one call)
 */
async function updateMovieFromProvider(
  dbManager: DatabaseManager,
  movie: {
    id: number;
    title: string;
    tmdb_id: number | null;
    last_scraped_at: string | null;
  }
): Promise<void> {
  if (!movie.tmdb_id) {
    logger.debug('Movie has no TMDB ID, skipping', {
      movieId: movie.id,
      movieTitle: movie.title,
    });
    return;
  }

  logger.debug('Fetching updated metadata and assets from TMDB', {
    movieId: movie.id,
    tmdbId: movie.tmdb_id,
  });

  // Fetch full movie details (includes metadata + images in one call)
  const tmdbClient = tmdbService.getClient();
  const tmdbMovie = await tmdbClient.getMovie(movie.tmdb_id);

  if (!tmdbMovie) {
    logger.warn('Movie not found on TMDB', {
      movieId: movie.id,
      tmdbId: movie.tmdb_id,
    });
    return;
  }

  // Update metadata fields (only if not locked by user)
  await updateMovieMetadata(dbManager, movie.id, tmdbMovie);

  // Update asset candidates (posters, backdrops)
  await updateMovieAssets(dbManager, movie.id, movie.tmdb_id);

  // Update last_scraped_at timestamp
  await dbManager.getConnection().execute(
    'UPDATE movies SET last_scraped_at = CURRENT_TIMESTAMP WHERE id = ?',
    [movie.id]
  );

  logger.debug('Successfully updated movie from provider', {
    movieId: movie.id,
    tmdbId: movie.tmdb_id,
  });
}

/**
 * Update movie metadata from TMDB (respects field locks)
 */
async function updateMovieMetadata(
  dbManager: DatabaseManager,
  movieId: number,
  tmdbMovie: any
): Promise<void> {
  // Get field locks for this movie
  const locks = await dbManager.getConnection().query<{
    field_name: string;
  }>(
    'SELECT field_name FROM movie_field_locks WHERE movie_id = ?',
    [movieId]
  );

  const lockedFields = new Set(locks.map(l => l.field_name));

  // Build update fields (only unlocked fields)
  const updates: string[] = [];
  const params: any[] = [];

  if (!lockedFields.has('title') && tmdbMovie.title) {
    updates.push('title = ?');
    params.push(tmdbMovie.title);
  }

  if (!lockedFields.has('original_title') && tmdbMovie.original_title) {
    updates.push('original_title = ?');
    params.push(tmdbMovie.original_title);
  }

  if (!lockedFields.has('tagline') && tmdbMovie.tagline) {
    updates.push('tagline = ?');
    params.push(tmdbMovie.tagline);
  }

  if (!lockedFields.has('overview') && tmdbMovie.overview) {
    updates.push('overview = ?');
    params.push(tmdbMovie.overview);
  }

  if (!lockedFields.has('runtime') && tmdbMovie.runtime) {
    updates.push('runtime = ?');
    params.push(tmdbMovie.runtime);
  }

  if (!lockedFields.has('release_date') && tmdbMovie.release_date) {
    updates.push('release_date = ?');
    params.push(tmdbMovie.release_date);
  }

  if (!lockedFields.has('rating') && tmdbMovie.vote_average !== undefined) {
    updates.push('rating = ?');
    params.push(tmdbMovie.vote_average);
  }

  if (updates.length > 0) {
    params.push(movieId);
    await dbManager.getConnection().execute(
      `UPDATE movies SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    logger.debug('Updated movie metadata from provider', {
      movieId,
      updatedFields: updates.length,
    });
  } else {
    logger.debug('No metadata fields to update (all locked)', { movieId });
  }
}

/**
 * Update movie asset candidates from TMDB
 */
async function updateMovieAssets(
  dbManager: DatabaseManager,
  movieId: number,
  tmdbId: number
): Promise<void> {
  const db = dbManager.getConnection();

  // Fetch images from TMDB (posters + backdrops)
  const tmdbClient = tmdbService.getClient();
  const images = await tmdbClient.getMovieImages(tmdbId);

  if (!images) {
    logger.debug('No images found for movie', { movieId, tmdbId });
    return;
  }

  let addedPosters = 0;
  let addedBackdrops = 0;

  // Add poster candidates
  if (images.posters && images.posters.length > 0) {
    for (const poster of images.posters) {
      const imageUrl = `https://image.tmdb.org/t/p/original${poster.file_path}`;

      // Check if candidate already exists
      const existing = await db.get(
        `SELECT id FROM asset_candidates
         WHERE movie_id = ? AND asset_type = ? AND source_url = ?`,
        [movieId, 'poster', imageUrl]
      );

      if (!existing) {
        await db.execute(
          `INSERT INTO asset_candidates (
            movie_id, asset_type, provider_name, provider_asset_id, source_url,
            width, height, language, vote_average, vote_count
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            movieId,
            'poster',
            'tmdb',
            poster.file_path,
            imageUrl,
            poster.width,
            poster.height,
            poster.iso_639_1 || null,
            poster.vote_average || null,
            poster.vote_count || null,
          ]
        );
        addedPosters++;
      }
    }
  }

  // Add backdrop candidates
  if (images.backdrops && images.backdrops.length > 0) {
    for (const backdrop of images.backdrops) {
      const imageUrl = `https://image.tmdb.org/t/p/original${backdrop.file_path}`;

      const existing = await db.get(
        `SELECT id FROM asset_candidates
         WHERE movie_id = ? AND asset_type = ? AND source_url = ?`,
        [movieId, 'backdrop', imageUrl]
      );

      if (!existing) {
        await db.execute(
          `INSERT INTO asset_candidates (
            movie_id, asset_type, provider_name, provider_asset_id, source_url,
            width, height, language, vote_average, vote_count
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            movieId,
            'backdrop',
            'tmdb',
            backdrop.file_path,
            imageUrl,
            backdrop.width,
            backdrop.height,
            backdrop.iso_639_1 || null,
            backdrop.vote_average || null,
            backdrop.vote_count || null,
          ]
        );
        addedBackdrops++;
      }
    }
  }

  logger.debug('Updated movie asset candidates from provider', {
    movieId,
    addedPosters,
    addedBackdrops,
  });
}
