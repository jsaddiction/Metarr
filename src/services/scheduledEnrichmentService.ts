import { DatabaseConnection } from '../types/database.js';
import { JobQueueService } from './jobQueueService.js';
import { EnrichmentDecisionService } from './enrichmentDecisionService.js';
import { TMDBClient } from './providers/tmdb/TMDBClient.js';
import { logger } from '../middleware/logging.js';
import { EnrichmentConfig } from '../config/types.js';

/**
 * Scheduled Enrichment Service
 *
 * Periodically enriches entities that need metadata updates:
 * - Entities in 'discovered' state (never enriched)
 * - Entities with high enrichment_priority
 * - Entities with incomplete metadata (based on completeness_config)
 * - Entities with unlocked fields (can be updated)
 *
 * Runs on a schedule (e.g., hourly, daily) and creates enrichment jobs.
 */

export class ScheduledEnrichmentService {
  private db: DatabaseConnection;
  private jobQueue: JobQueueService;
  private enrichmentDecisionService: EnrichmentDecisionService;
  private tmdbClient: TMDBClient | null = null;
  private enrichmentInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor(
    db: DatabaseConnection,
    jobQueue: JobQueueService,
    enrichmentConfig: EnrichmentConfig,
    tmdbApiKey?: string
  ) {
    this.db = db;
    this.jobQueue = jobQueue;
    this.enrichmentDecisionService = new EnrichmentDecisionService(db, enrichmentConfig);

    // Initialize TMDB client if API key provided (for change detection)
    if (tmdbApiKey) {
      this.tmdbClient = new TMDBClient({
        apiKey: tmdbApiKey,
        baseUrl: 'https://api.themoviedb.org/3',
        language: 'en-US',
      });
    }
  }

  /**
   * Start scheduled enrichment (runs every intervalMs)
   */
  start(intervalMs: number = 3600000): void {
    if (this.isRunning) {
      logger.warn('Scheduled enrichment already running');
      return;
    }

    this.isRunning = true;

    // Run after a short delay to ensure database is fully initialized
    setTimeout(() => {
      this.runEnrichmentCycle().catch(error => {
        logger.error('Error in initial enrichment cycle:', error);
      });
    }, 5000); // 5 second delay

    // Then run on interval
    this.enrichmentInterval = setInterval(() => {
      this.runEnrichmentCycle().catch(error => {
        logger.error('Error in enrichment cycle:', error);
      });
    }, intervalMs);

    logger.info(`Scheduled enrichment started (interval: ${intervalMs}ms)`);
  }

  /**
   * Stop scheduled enrichment
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.enrichmentInterval) {
      clearInterval(this.enrichmentInterval);
      this.enrichmentInterval = null;
    }

    logger.info('Scheduled enrichment stopped');
  }

  /**
   * Run one enrichment cycle
   */
  private async runEnrichmentCycle(): Promise<void> {
    logger.info('Starting enrichment cycle');

    try {
      // Enrich movies
      const movies = await this.getEntitiesNeedingEnrichment('movie');
      for (const movie of movies) {
        await this.createEnrichmentJobs(movie, 'movie');
      }

      // Enrich series
      const series = await this.getEntitiesNeedingEnrichment('series');
      for (const s of series) {
        await this.createEnrichmentJobs(s, 'series');
      }

      // Enrich episodes (if series enriched)
      const episodes = await this.getEntitiesNeedingEnrichment('episode');
      for (const episode of episodes) {
        await this.createEnrichmentJobs(episode, 'episode');
      }

      logger.info('Enrichment cycle complete', {
        movies: movies.length,
        series: series.length,
        episodes: episodes.length
      });

    } catch (error) {
      logger.error('Error in enrichment cycle:', error);
    }
  }

  /**
   * Get entities that need enrichment
   */
  private async getEntitiesNeedingEnrichment(entityType: 'movie' | 'series' | 'episode'): Promise<Array<{
    id: number;
    state: string;
    enrichment_priority: number;
    tmdb_id?: number;
    tvdb_id?: number;
  }>> {
    const table = this.getTableName(entityType);
    if (!table) {
      return [];
    }

    try {
      // Select columns based on entity type
      // Movies: tmdb_id, imdb_id (no tvdb_id)
      // Series/Episodes: tmdb_id, tvdb_id, imdb_id
      let selectColumns = 'id, state, enrichment_priority, tmdb_id';
      if (entityType === 'movie') {
        selectColumns += ', imdb_id';
      } else {
        selectColumns += ', tvdb_id, imdb_id';
      }

      // Get entities that:
      // 1. Are in 'discovered' state (never enriched), OR
      // 2. Have enrichment_priority > 0 (need re-enrichment), OR
      // 3. Were enriched more than 30 days ago (stale metadata)
      const entities = await this.db.query<{
        id: number;
        state: string;
        enrichment_priority: number;
        tmdb_id?: number;
        tvdb_id?: number;
        imdb_id?: string;
      }>(
        `SELECT ${selectColumns}
         FROM ${table}
         WHERE state = 'discovered'
            OR enrichment_priority > 0
            OR (enriched_at IS NOT NULL AND enriched_at < datetime('now', '-30 days'))
         ORDER BY enrichment_priority DESC, id ASC
         LIMIT 50`
      );

      return entities;
    } catch (error: any) {
      // Handle cases where table doesn't exist or schema is not ready
      if (error.message?.includes('no such table') || error.message?.includes('no such column')) {
        logger.debug(`Table ${table} not ready for enrichment query: ${error.message}`);
        return [];
      }
      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Create enrichment jobs for an entity
   */
  private async createEnrichmentJobs(
    entity: { id: number; tmdb_id?: number; tvdb_id?: number },
    entityType: 'movie' | 'series' | 'episode'
  ): Promise<void> {
    // Check if enrichment is needed (with TMDB change detection for movies)
    let shouldEnrich = true;
    let enrichmentReason = 'default';

    if (entityType === 'movie' && this.tmdbClient) {
      const decision = await this.enrichmentDecisionService.shouldEnrichMovie(
        entity.id,
        this.tmdbClient
      );
      shouldEnrich = decision.shouldEnrich;
      enrichmentReason = decision.reason;

      logger.info('Enrichment decision for movie', {
        movieId: entity.id,
        tmdbId: entity.tmdb_id,
        shouldEnrich,
        reason: enrichmentReason,
        changedFields: decision.changedFields,
      });

      if (!shouldEnrich) {
        // Skip enrichment - data is up to date
        return;
      }
    } else if (entityType === 'series' && this.tmdbClient) {
      const decision = await this.enrichmentDecisionService.shouldEnrichSeries(
        entity.id,
        this.tmdbClient
      );
      shouldEnrich = decision.shouldEnrich;
      enrichmentReason = decision.reason;

      logger.info('Enrichment decision for series', {
        seriesId: entity.id,
        tmdbId: entity.tmdb_id,
        shouldEnrich,
        reason: enrichmentReason,
      });

      if (!shouldEnrich) {
        return;
      }
    }

    // 1. Enrich metadata from TMDB/TVDB
    if (entity.tmdb_id) {
      await this.jobQueue.addJob({
        type: 'enrich-metadata',
        priority: 5, // Normal priority
        payload: {
          entityType,
          entityId: entity.id,
          provider: 'tmdb',
          providerId: entity.tmdb_id,
          enrichmentReason, // Track why we're enriching
        }
      });

      // 2. Fetch provider assets (if not already discovered)
      await this.jobQueue.addJob({
        type: 'fetch-provider-assets',
        priority: 6,
        payload: {
          entityType,
          entityId: entity.id,
          provider: 'tmdb',
          providerId: entity.tmdb_id
        }
      });
    }

    if (entity.tvdb_id && (entityType === 'series' || entityType === 'episode')) {
      await this.jobQueue.addJob({
        type: 'enrich-metadata',
        priority: 5,
        payload: {
          entityType,
          entityId: entity.id,
          provider: 'tvdb',
          providerId: entity.tvdb_id
        }
      });

      await this.jobQueue.addJob({
        type: 'fetch-provider-assets',
        priority: 6,
        payload: {
          entityType,
          entityId: entity.id,
          provider: 'tvdb',
          providerId: entity.tvdb_id
        }
      });
    }

    // 3. Auto-select assets if automation enabled
    const automationConfig = await this.getAutomationConfig(entity.id, entityType);
    if (automationConfig && automationConfig.mode !== 'manual') {
      await this.jobQueue.addJob({
        type: 'select-assets',
        priority: 6,
        payload: {
          entityType,
          entityId: entity.id,
          mode: automationConfig.mode
        }
      });

      // 4. Publish if YOLO mode
      if (automationConfig.mode === 'yolo') {
        // Get entity file path for publishing
        const entityData = await this.getEntity(entityType, entity.id);
        if (entityData && entityData.file_path) {
          await this.jobQueue.addJob({
            type: 'publish',
            priority: 7,
            payload: {
              entityType,
              entityId: entity.id,
              libraryPath: this.getLibraryPath(entityData.file_path),
              mediaFilename: this.getMediaFilename(entityData)
            }
          });
        }
      }
    }
  }

  /**
   * Get automation config for entity
   */
  private async getAutomationConfig(_entityId: number, _entityType: string): Promise<{
    mode: 'manual' | 'yolo' | 'hybrid';
  } | null> {
    // TODO: Query library_automation_config table based on library
    // For now, return default (manual)
    return null; // No automation by default
  }

  /**
   * Get entity data
   */
  private async getEntity(entityType: string, entityId: number): Promise<any> {
    const table = this.getTableName(entityType);
    if (!table) {
      return null;
    }

    const result = await this.db.query(`SELECT * FROM ${table} WHERE id = ?`, [entityId]);
    return result.length > 0 ? result[0] : null;
  }

  /**
   * Get library path from file path (parent directory)
   */
  private getLibraryPath(filePath: string): string {
    const parts = filePath.split('/');
    parts.pop(); // Remove filename
    return parts.join('/');
  }

  /**
   * Get media filename for Kodi naming
   */
  private getMediaFilename(entity: any): string {
    if (entity.title && entity.year) {
      return `${entity.title} (${entity.year})`;
    } else if (entity.title) {
      return entity.title;
    } else {
      return `entity_${entity.id}`;
    }
  }

  /**
   * Get table name for entity type
   */
  private getTableName(entityType: string): string | null {
    const mapping: Record<string, string> = {
      movie: 'movies',
      series: 'series',
      episode: 'episodes'
    };

    return mapping[entityType] || null;
  }

  /**
   * Manually trigger enrichment for specific entity
   */
  async enrichEntity(
    entityType: 'movie' | 'series' | 'episode',
    entityId: number
  ): Promise<void> {
    logger.info(`Manually triggering enrichment for ${entityType} ${entityId}`);

    const table = this.getTableName(entityType);
    if (!table) {
      throw new Error(`Invalid entity type: ${entityType}`);
    }

    // Select columns based on entity type
    let selectColumns = 'id, state, enrichment_priority, tmdb_id';
    if (entityType === 'movie') {
      selectColumns += ', imdb_id';
    } else {
      selectColumns += ', tvdb_id, imdb_id';
    }

    const entities = await this.db.query<{
      id: number;
      state: string;
      enrichment_priority: number;
      tmdb_id?: number;
      tvdb_id?: number;
      imdb_id?: string;
    }>(
      `SELECT ${selectColumns} FROM ${table} WHERE id = ?`,
      [entityId]
    );

    if (entities.length === 0) {
      throw new Error(`Entity not found: ${entityType} ${entityId}`);
    }

    await this.createEnrichmentJobs(entities[0], entityType);
  }

  /**
   * Set enrichment priority for entity
   */
  async setEnrichmentPriority(
    entityType: 'movie' | 'series' | 'episode',
    entityId: number,
    priority: number
  ): Promise<void> {
    const table = this.getTableName(entityType);
    if (!table) {
      throw new Error(`Invalid entity type: ${entityType}`);
    }

    await this.db.execute(
      `UPDATE ${table} SET enrichment_priority = ? WHERE id = ?`,
      [priority, entityId]
    );

    logger.info(`Set enrichment priority for ${entityType} ${entityId}: ${priority}`);
  }
}
