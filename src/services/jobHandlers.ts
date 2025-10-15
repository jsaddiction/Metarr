import { DatabaseConnection } from '../types/database.js';
import { Job, JobQueueService } from './jobQueueService.js';
import { AssetDiscoveryService } from './assetDiscoveryService.js';
import { ProviderAssetService } from './providerAssetService.js';
import { AssetSelectionService } from './assetSelectionService.js';
import { PublishingService } from './publishingService.js';
import { TMDBClient } from './providers/tmdb/TMDBClient.js';
import { logger } from '../middleware/logging.js';

/**
 * Job Handlers
 *
 * Implements handlers for each job type that wire together the various services.
 * These handlers are registered with the JobQueueService.
 */

export class JobHandlers {
  private db: DatabaseConnection;
  private assetDiscovery: AssetDiscoveryService;
  private providerAssets: ProviderAssetService;
  private assetSelection: AssetSelectionService;
  private publishing: PublishingService;
  private tmdbClient: TMDBClient | undefined;

  constructor(
    db: DatabaseConnection,
    cacheDir: string,
    tmdbClient?: TMDBClient
  ) {
    this.db = db;
    this.assetDiscovery = new AssetDiscoveryService(db, cacheDir);
    this.providerAssets = new ProviderAssetService(db, cacheDir, tmdbClient);
    this.assetSelection = new AssetSelectionService(db);
    this.publishing = new PublishingService(db);
    this.tmdbClient = tmdbClient;
  }

  /**
   * Register all handlers with job queue
   */
  registerHandlers(jobQueue: JobQueueService): void {
    jobQueue.registerHandler('webhook', this.handleWebhook.bind(this));
    jobQueue.registerHandler('discover-assets', this.handleDiscoverAssets.bind(this));
    jobQueue.registerHandler('fetch-provider-assets', this.handleFetchProviderAssets.bind(this));
    jobQueue.registerHandler('enrich-metadata', this.handleEnrichMetadata.bind(this));
    jobQueue.registerHandler('select-assets', this.handleSelectAssets.bind(this));
    jobQueue.registerHandler('publish', this.handlePublish.bind(this));
    jobQueue.registerHandler('library-scan', this.handleLibraryScan.bind(this));
  }

  /**
   * Handle webhook from Sonarr/Radarr/Lidarr
   *
   * Payload: {
   *   source: 'radarr' | 'sonarr' | 'lidarr',
   *   eventType: 'Download' | 'Test' | 'Grab' | 'Rename',
   *   movie?: { id, title, year, path, tmdbId, imdbId },
   *   series?: { id, title, tvdbId, path },
   *   episodes?: [{ id, episodeNumber, seasonNumber, path }]
   * }
   */
  private async handleWebhook(job: Job): Promise<void> {
    const { source, eventType } = job.payload;

    logger.info(`Processing ${source} webhook: ${eventType}`, job.payload);

    // Only process Download events for now
    if (eventType !== 'Download') {
      logger.info(`Ignoring ${eventType} event`);
      return;
    }

    if (source === 'radarr' && job.payload.movie) {
      await this.processMovieWebhook(job.payload.movie);
    } else if (source === 'sonarr' && job.payload.series) {
      await this.processSeriesWebhook(job.payload.series, job.payload.episodes);
    }
    // Lidarr support coming later
  }

  /**
   * Process movie webhook (discover → fetch → select → publish)
   */
  private async processMovieWebhook(movie: any): Promise<void> {
    // 1. Check if movie exists in database
    const existing = await this.db.query<{ id: number }>(
      `SELECT id FROM movies WHERE radarr_id = ?`,
      [movie.id]
    );

    let movieId: number;

    if (existing.length === 0) {
      // Insert new movie
      const result = await this.db.execute(
        `INSERT INTO movies (title, year, radarr_id, tmdb_id, imdb_id, file_path, state)
         VALUES (?, ?, ?, ?, ?, ?, 'discovered')`,
        [movie.title, movie.year, movie.id, movie.tmdbId, movie.imdbId, movie.path]
      );
      movieId = result.insertId!;
      logger.info(`Created movie ${movieId}: ${movie.title} (${movie.year})`);
    } else {
      movieId = existing[0].id;
      logger.info(`Movie already exists: ${movieId}`);
    }

    // 2. Discover assets from filesystem
    await this.assetDiscovery.scanDirectory(movie.path, 'movie', movieId);

    // 3. Fetch assets from TMDB (if tmdbId available)
    if (movie.tmdbId && this.tmdbClient) {
      await this.providerAssets.fetchMovieAssets(movieId, movie.tmdbId);
    }

    // 4. Check automation config and select assets if needed
    const config = await this.getAutomationConfig(movieId, 'movie');
    if (config && config.mode !== 'manual') {
      // Auto-select assets based on mode
      await this.autoSelectAssets(movieId, 'movie', config.mode);
    }

    // 5. Publish if YOLO mode
    if (config && config.mode === 'yolo') {
      await this.publishing.publish({
        entityType: 'movie',
        entityId: movieId,
        libraryPath: movie.path,
        mediaFilename: `${movie.title} (${movie.year})`
      });
    }
  }

  /**
   * Process series webhook
   */
  private async processSeriesWebhook(series: any, episodes: any[]): Promise<void> {
    // Similar to movie webhook but for series/episodes
    logger.info(`Processing series webhook: ${series.title}`, { episodes: episodes?.length || 0 });
    // TODO: Implement series/episode processing
  }

  /**
   * Handle discover-assets job
   *
   * Payload: {
   *   entityType: 'movie' | 'series' | 'episode',
   *   entityId: number,
   *   directoryPath: string
   * }
   */
  private async handleDiscoverAssets(job: Job): Promise<void> {
    const { entityType, entityId, directoryPath } = job.payload;

    logger.info(`Discovering assets for ${entityType} ${entityId} in ${directoryPath}`);

    const result = await this.assetDiscovery.scanDirectory(
      directoryPath,
      entityType,
      entityId
    );

    logger.info(`Asset discovery complete`, result);
  }

  /**
   * Handle fetch-provider-assets job
   *
   * Payload: {
   *   entityType: 'movie' | 'series' | 'episode',
   *   entityId: number,
   *   provider: 'tmdb' | 'tvdb',
   *   providerId: number
   * }
   */
  private async handleFetchProviderAssets(job: Job): Promise<void> {
    const { entityType, entityId, provider, providerId } = job.payload;

    // Check if entity is monitored
    const isMonitored = await this.isEntityMonitored(entityType, entityId);
    if (!isMonitored) {
      logger.info(`Skipping asset fetch for unmonitored ${entityType} ${entityId}`);
      return;
    }

    logger.info(`Fetching assets from ${provider} for ${entityType} ${entityId}`);

    if (provider === 'tmdb' && entityType === 'movie') {
      const result = await this.providerAssets.fetchMovieAssets(entityId, providerId);
      logger.info(`Fetched ${result.fetched} assets from TMDB`, result);
    }
    // TODO: Add TVDB support
  }

  /**
   * Handle enrich-metadata job
   *
   * Payload: {
   *   entityType: 'movie' | 'series' | 'episode',
   *   entityId: number,
   *   provider: 'tmdb' | 'tvdb',
   *   providerId: number
   * }
   */
  private async handleEnrichMetadata(job: Job): Promise<void> {
    const { entityType, entityId, provider, providerId } = job.payload;

    // Check if entity is monitored
    const isMonitored = await this.isEntityMonitored(entityType, entityId);
    if (!isMonitored) {
      logger.info(`Skipping metadata enrichment for unmonitored ${entityType} ${entityId}`);
      return;
    }

    logger.info(`Enriching metadata from ${provider} for ${entityType} ${entityId}`);

    if (provider === 'tmdb' && entityType === 'movie' && this.tmdbClient) {
      // Fetch full movie details
      const movie = await this.tmdbClient.getMovie(providerId, {
        appendToResponse: ['credits', 'keywords', 'release_dates']
      });

      // Get current lock status for all fields
      const locks = await this.getFieldLocks(entityType, entityId);

      // Build UPDATE query dynamically, skipping locked fields
      const updates: string[] = [];
      const values: any[] = [];

      if (!locks.original_title_locked) {
        updates.push('original_title = ?');
        values.push(movie.original_title);
      }

      if (!locks.plot_locked) {
        updates.push('plot = ?');
        values.push(movie.overview);
      }

      if (!locks.tagline_locked) {
        updates.push('tagline = ?');
        values.push(movie.tagline);
      }

      if (!locks.runtime_locked) {
        updates.push('runtime = ?');
        values.push(movie.runtime);
      }

      // rating field doesn't have a lock in schema, skip for now
      // if (!locks.rating_locked) {
      //   updates.push('rating = ?');
      //   values.push(movie.vote_average);
      // }

      // Always update state and enriched_at (not locked fields)
      updates.push('state = ?');
      updates.push('enriched_at = CURRENT_TIMESTAMP');
      values.push('enriched');

      // Add entityId for WHERE clause
      values.push(entityId);

      if (updates.length > 2) { // More than just state and enriched_at
        await this.db.execute(
          `UPDATE movies SET ${updates.join(', ')} WHERE id = ?`,
          values
        );

        logger.info(`Metadata enriched for movie ${entityId}`, {
          updatedFields: updates.length - 2, // Exclude state and enriched_at
          skippedLocked: Object.keys(locks).filter(k => locks[k]).length
        });
      } else {
        logger.info(`All metadata fields locked for movie ${entityId}, skipping enrichment`);
      }
    }
    // TODO: Add TVDB support
  }

  /**
   * Handle select-assets job
   *
   * Payload: {
   *   entityType: 'movie' | 'series' | 'episode',
   *   entityId: number,
   *   mode: 'yolo' | 'hybrid',
   *   assetTypes?: string[] (optional, defaults to all)
   * }
   */
  private async handleSelectAssets(job: Job): Promise<void> {
    const { entityType, entityId, mode, assetTypes } = job.payload;

    logger.info(`Auto-selecting assets for ${entityType} ${entityId} (${mode} mode)`);

    const types = assetTypes || ['poster', 'fanart', 'banner', 'clearlogo', 'trailer'];

    for (const assetType of types) {
      const config = {
        entityType,
        entityId,
        assetType,
        mode
      };

      let result;
      if (mode === 'yolo') {
        result = await this.assetSelection.selectAssetYOLO(config);
      } else {
        result = await this.assetSelection.selectAssetHybrid(config);
      }

      if (result.selected) {
        logger.info(`Selected ${assetType} for ${entityType} ${entityId}`, {
          candidateId: result.candidateId
        });
      }
    }
  }

  /**
   * Handle publish job
   *
   * Payload: {
   *   entityType: 'movie' | 'series' | 'episode',
   *   entityId: number,
   *   libraryPath: string,
   *   mediaFilename?: string
   * }
   */
  private async handlePublish(job: Job): Promise<void> {
    const { entityType, entityId, libraryPath, mediaFilename } = job.payload;

    logger.info(`Publishing ${entityType} ${entityId} to ${libraryPath}`);

    const result = await this.publishing.publish({
      entityType,
      entityId,
      libraryPath,
      mediaFilename
    });

    if (!result.success) {
      throw new Error(`Publishing failed: ${result.errors.join(', ')}`);
    }

    logger.info(`Published ${entityType} ${entityId}`, result);
  }

  /**
   * Handle library-scan job
   *
   * Payload: {
   *   libraryId: number,
   *   libraryPath: string,
   *   libraryType: 'movie' | 'series' | 'music'
   * }
   */
  private async handleLibraryScan(job: Job): Promise<void> {
    const { libraryId, libraryPath, libraryType } = job.payload;

    logger.info(`Scanning library ${libraryId}: ${libraryPath} (${libraryType})`);

    try {
      // Import fs for directory scanning
      const fs = await import('fs/promises');
      const path = await import('path');

      // Get all subdirectories (each should be a movie/series folder)
      const entries = await fs.readdir(libraryPath, { withFileTypes: true });
      const directories = entries.filter(e => e.isDirectory());

      logger.info(`Found ${directories.length} directories in library ${libraryId}`);

      let processed = 0;
      let errors = 0;

      for (const dir of directories) {
        try {
          const fullPath = path.join(libraryPath, dir.name);

          // Check if entity already exists in database
          const existing = await this.findEntityByPath(fullPath, libraryType);

          if (existing) {
            logger.debug(`Entity already exists for ${fullPath}, skipping`);
            continue;
          }

          // Look for media files in directory
          const files = await fs.readdir(fullPath);
          const videoExtensions = ['.mkv', '.mp4', '.avi', '.mov', '.m4v'];
          const hasVideo = files.some(f => videoExtensions.includes(path.extname(f).toLowerCase()));

          if (!hasVideo) {
            logger.debug(`No video files found in ${fullPath}, skipping`);
            continue;
          }

          // For movies: create entity and schedule discovery
          if (libraryType === 'movie') {
            // Parse directory name for title and year
            const match = dir.name.match(/^(.+?)\s*\((\d{4})\)$/);
            const title = match ? match[1].trim() : dir.name;
            const year = match ? parseInt(match[2]) : null;

            // Insert movie into database
            const result = await this.db.execute(
              `INSERT INTO movies (title, year, file_path, library_id, state)
               VALUES (?, ?, ?, ?, 'discovered')`,
              [title, year, fullPath, libraryId]
            );

            const movieId = result.insertId!;

            // Schedule asset discovery job
            await this.db.execute(
              `INSERT INTO job_queue (type, priority, payload, state, retry_count, max_retries, created_at)
               VALUES ('discover-assets', 8, ?, 'pending', 0, 3, CURRENT_TIMESTAMP)`,
              [JSON.stringify({
                entityType: 'movie',
                entityId: movieId,
                directoryPath: fullPath
              })]
            );

            processed++;
            logger.info(`Created movie ${movieId}: ${title}${year ? ` (${year})` : ''}`);
          }
          // Series handling would go here (more complex)
          else if (libraryType === 'series') {
            logger.debug(`Series library scanning not yet fully implemented`);
          }

        } catch (error: any) {
          logger.error(`Error processing directory ${dir.name}:`, error);
          errors++;
        }
      }

      logger.info(`Library scan complete for ${libraryId}: ${processed} processed, ${errors} errors`);

    } catch (error) {
      logger.error(`Error scanning library ${libraryId}:`, error);
      throw error;
    }
  }

  /**
   * Find entity by file path
   */
  private async findEntityByPath(filePath: string, libraryType: string): Promise<boolean> {
    if (libraryType === 'movie') {
      const result = await this.db.query<{ id: number }>(
        `SELECT id FROM movies WHERE file_path = ?`,
        [filePath]
      );
      return result.length > 0;
    } else if (libraryType === 'series') {
      const result = await this.db.query<{ id: number }>(
        `SELECT id FROM series WHERE path = ?`,
        [filePath]
      );
      return result.length > 0;
    }
    return false;
  }

  // ============================================
  // Helper Methods
  // ============================================

  /**
   * Get automation config for entity
   */
  private async getAutomationConfig(entityId: number, entityType: string): Promise<{
    mode: 'manual' | 'yolo' | 'hybrid';
    autoDiscoverAssets: boolean;
    autoFetchProviderAssets: boolean;
    autoEnrichMetadata: boolean;
    autoSelectAssets: boolean;
    autoPublish: boolean;
  } | null> {
    try {
      // Get library ID for entity
      let libraryId: number | null = null;

      if (entityType === 'movie') {
        const result = await this.db.query<{ library_id: number }>(
          `SELECT library_id FROM movies WHERE id = ?`,
          [entityId]
        );
        if (result.length > 0) {
          libraryId = result[0].library_id;
        }
      } else if (entityType === 'series') {
        const result = await this.db.query<{ library_id: number }>(
          `SELECT library_id FROM series WHERE id = ?`,
          [entityId]
        );
        if (result.length > 0) {
          libraryId = result[0].library_id;
        }
      }

      if (!libraryId) {
        logger.warn(`No library found for ${entityType} ${entityId}, using manual mode`);
        return {
          mode: 'manual',
          autoDiscoverAssets: false,
          autoFetchProviderAssets: false,
          autoEnrichMetadata: false,
          autoSelectAssets: false,
          autoPublish: false
        };
      }

      // Query automation config for library
      const config = await this.db.query<{
        mode: 'manual' | 'yolo' | 'hybrid';
        auto_discover_assets: number;
        auto_fetch_provider_assets: number;
        auto_enrich_metadata: number;
        auto_select_assets: number;
        auto_publish: number;
      }>(
        `SELECT mode, auto_discover_assets, auto_fetch_provider_assets,
                auto_enrich_metadata, auto_select_assets, auto_publish
         FROM library_automation_config
         WHERE library_id = ?`,
        [libraryId]
      );

      if (config.length === 0) {
        // No config found, use defaults (manual mode)
        logger.debug(`No automation config for library ${libraryId}, using manual mode`);
        return {
          mode: 'manual',
          autoDiscoverAssets: false,
          autoFetchProviderAssets: false,
          autoEnrichMetadata: false,
          autoSelectAssets: false,
          autoPublish: false
        };
      }

      const row = config[0];
      return {
        mode: row.mode,
        autoDiscoverAssets: row.auto_discover_assets === 1,
        autoFetchProviderAssets: row.auto_fetch_provider_assets === 1,
        autoEnrichMetadata: row.auto_enrich_metadata === 1,
        autoSelectAssets: row.auto_select_assets === 1,
        autoPublish: row.auto_publish === 1
      };

    } catch (error: any) {
      logger.error('Failed to get automation config', {
        entityId,
        entityType,
        error: error.message
      });
      // Return manual mode on error (safe default)
      return {
        mode: 'manual',
        autoDiscoverAssets: false,
        autoFetchProviderAssets: false,
        autoEnrichMetadata: false,
        autoSelectAssets: false,
        autoPublish: false
      };
    }
  }

  /**
   * Auto-select assets based on mode
   */
  private async autoSelectAssets(
    entityId: number,
    entityType: 'movie' | 'series' | 'episode',
    mode: 'yolo' | 'hybrid'
  ): Promise<void> {
    const assetTypes = ['poster', 'fanart', 'banner', 'clearlogo', 'trailer'];

    for (const assetType of assetTypes) {
      const config = {
        entityType,
        entityId,
        assetType,
        mode
      };

      if (mode === 'yolo') {
        await this.assetSelection.selectAssetYOLO(config);
      } else {
        await this.assetSelection.selectAssetHybrid(config);
      }
    }
  }

  /**
   * Check if entity is monitored
   *
   * Unmonitored entities (monitored = 0) have all automation frozen.
   * This is separate from field locks - unmonitored stops EVERYTHING.
   */
  private async isEntityMonitored(entityType: string, entityId: number): Promise<boolean> {
    try {
      let tableName: string;

      if (entityType === 'movie') {
        tableName = 'movies';
      } else if (entityType === 'series') {
        tableName = 'series';
      } else if (entityType === 'season') {
        tableName = 'seasons';
      } else if (entityType === 'episode') {
        tableName = 'episodes';
      } else {
        // Unknown entity type, default to monitored (safe for unknown types)
        logger.warn(`Unknown entity type ${entityType}, defaulting to monitored`);
        return true;
      }

      const result = await this.db.query<{ monitored: number }>(
        `SELECT monitored FROM ${tableName} WHERE id = ?`,
        [entityId]
      );

      if (result.length === 0) {
        // Entity not found, default to monitored
        logger.warn(`Entity ${entityType} ${entityId} not found, defaulting to monitored`);
        return true;
      }

      return result[0].monitored === 1;
    } catch (error: any) {
      logger.error(`Error checking monitored status for ${entityType} ${entityId}:`, error);
      // On error, default to monitored (allow operation to proceed)
      return true;
    }
  }

  /**
   * Get field lock status for an entity
   *
   * Returns an object with all *_locked fields for the entity.
   * Locked fields (value = 1) should NOT be modified by automation.
   *
   * @param entityType - Entity type ('movie', 'series', etc.)
   * @param entityId - Entity ID
   * @returns Object with lock status for each field
   */
  private async getFieldLocks(entityType: string, entityId: number): Promise<Record<string, boolean>> {
    try {
      let tableName: string;

      if (entityType === 'movie') {
        tableName = 'movies';
      } else if (entityType === 'series') {
        tableName = 'series';
      } else if (entityType === 'season') {
        tableName = 'seasons';
      } else if (entityType === 'episode') {
        tableName = 'episodes';
      } else {
        // Unknown entity type, return empty locks (allow all)
        logger.warn(`Unknown entity type ${entityType}, returning empty locks`);
        return {};
      }

      // Query all *_locked columns for the entity
      const result = await this.db.query<any>(
        `SELECT * FROM ${tableName} WHERE id = ?`,
        [entityId]
      );

      if (result.length === 0) {
        // Entity not found, return empty locks (allow all)
        logger.warn(`Entity ${entityType} ${entityId} not found, returning empty locks`);
        return {};
      }

      const row = result[0];
      const locks: Record<string, boolean> = {};

      // Extract all *_locked columns and convert to boolean
      for (const key in row) {
        if (key.endsWith('_locked')) {
          locks[key] = row[key] === 1;
        }
      }

      return locks;
    } catch (error: any) {
      logger.error(`Error getting field locks for ${entityType} ${entityId}:`, error);
      // On error, return empty locks (allow all operations to proceed)
      return {};
    }
  }
}
