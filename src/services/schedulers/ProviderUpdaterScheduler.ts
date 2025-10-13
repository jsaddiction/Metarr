import { DatabaseManager } from '../../database/DatabaseManager.js';
import { LibrarySchedulerConfigService } from '../librarySchedulerConfigService.js';
import { tmdbService } from '../providers/TMDBService.js';
import { logger } from '../../middleware/logging.js';

/**
 * Provider Updater Scheduler
 *
 * Periodically checks for libraries that need provider updates
 * and fetches updated metadata + assets in ONE API call per provider.
 *
 * This combines metadata and asset fetching to minimize API calls.
 */
export class ProviderUpdaterScheduler {
  private dbManager: DatabaseManager;
  private schedulerConfigService: LibrarySchedulerConfigService;
  private intervalId: NodeJS.Timeout | null = null;
  private checkIntervalMs: number;
  private isRunning = false;

  constructor(
    dbManager: DatabaseManager,
    checkIntervalMs: number = 300000 // Default: check every 5 minutes
  ) {
    this.dbManager = dbManager;
    this.schedulerConfigService = new LibrarySchedulerConfigService(dbManager.getConnection());
    this.checkIntervalMs = checkIntervalMs;
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.intervalId) {
      logger.warn('ProviderUpdaterScheduler already running');
      return;
    }

    logger.info('Starting ProviderUpdaterScheduler', {
      checkIntervalMs: this.checkIntervalMs,
    });

    // Run immediately on start
    this.checkAndProcessLibraries().catch(error => {
      logger.error('ProviderUpdaterScheduler initial check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    });

    // Schedule periodic checks
    this.intervalId = setInterval(() => {
      this.checkAndProcessLibraries().catch(error => {
        logger.error('ProviderUpdaterScheduler periodic check failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, this.checkIntervalMs);
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('ProviderUpdaterScheduler stopped');
    }
  }

  /**
   * Check for libraries needing provider updates and process them
   */
  private async checkAndProcessLibraries(): Promise<void> {
    if (this.isRunning) {
      logger.debug('ProviderUpdaterScheduler check already in progress, skipping');
      return;
    }

    this.isRunning = true;

    try {
      // Get libraries that need provider updates based on interval
      const libraryIds = await this.schedulerConfigService.getLibrariesNeedingProviderUpdate();

      if (libraryIds.length === 0) {
        logger.debug('No libraries need provider updates at this time');
        return;
      }

      logger.info('Found libraries needing provider updates', {
        libraryIds,
        count: libraryIds.length,
      });

      // Process each library
      for (const libraryId of libraryIds) {
        try {
          await this.processLibrary(libraryId);
        } catch (error) {
          logger.error('Failed to process library for provider updates', {
            libraryId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Process a single library
   */
  private async processLibrary(libraryId: number): Promise<void> {
    logger.info('Starting provider updates for library', { libraryId });

    try {
      // Get library details
      const library = await this.dbManager.getConnection().get<{
        id: number;
        name: string;
        type: string;
      }>('SELECT id, name, type FROM libraries WHERE id = ?', [libraryId]);

      if (!library) {
        logger.error('Library not found', { libraryId });
        return;
      }

      // Only process movie libraries for now (TV shows not implemented yet)
      if (library.type !== 'movies') {
        logger.debug('Skipping non-movie library', {
          libraryId,
          libraryType: library.type,
        });
        return;
      }

      // Get all movies in library that have been scraped
      const movies = await this.dbManager.getConnection().query<{
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
        libraryId,
        movieCount: movies.length,
      });

      let updatedCount = 0;
      let failedCount = 0;

      // Update each movie from provider
      for (const movie of movies) {
        try {
          await this.updateMovieFromProvider(movie);
          updatedCount++;
        } catch (error) {
          failedCount++;
          logger.error('Failed to update movie from provider', {
            movieId: movie.id,
            movieTitle: movie.title,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      logger.info('Provider updates completed for library', {
        libraryId,
        libraryName: library.name,
        updatedCount,
        failedCount,
      });

      // Update last run timestamp
      await this.schedulerConfigService.updateProviderUpdaterLastRun(libraryId);

      logger.info('Updated provider updater last run timestamp', { libraryId });
    } catch (error) {
      logger.error('Provider updates failed for library', {
        libraryId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Update a single movie from provider (metadata + assets in one call)
   */
  private async updateMovieFromProvider(movie: {
    id: number;
    title: string;
    tmdb_id: number | null;
    last_scraped_at: string | null;
  }): Promise<void> {
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
    await this.updateMovieMetadata(movie.id, tmdbMovie);

    // Update asset candidates (posters, backdrops)
    await this.updateMovieAssets(movie.id, movie.tmdb_id);

    // Update last_scraped_at timestamp
    await this.dbManager.getConnection().execute(
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
  private async updateMovieMetadata(
    movieId: number,
    tmdbMovie: any
  ): Promise<void> {
    // Get field locks for this movie
    const locks = await this.dbManager.getConnection().query<{
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
      await this.dbManager.getConnection().execute(
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
  private async updateMovieAssets(
    movieId: number,
    tmdbId: number
  ): Promise<void> {
    const db = this.dbManager.getConnection();

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

  /**
   * Get scheduler status
   */
  getStatus(): {
    isRunning: boolean;
    checkIntervalMs: number;
    hasActiveInterval: boolean;
  } {
    return {
      isRunning: this.isRunning,
      checkIntervalMs: this.checkIntervalMs,
      hasActiveInterval: this.intervalId !== null,
    };
  }
}
