import { DatabaseConnection } from '../types/database.js';
import { JobQueueService } from './jobQueueService.js';
import { logger } from '../middleware/logging.js';

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
  private enrichmentInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor(db: DatabaseConnection, jobQueue: JobQueueService) {
    this.db = db;
    this.jobQueue = jobQueue;
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

    // Run immediately on start
    this.runEnrichmentCycle().catch(error => {
      logger.error('Error in initial enrichment cycle:', error);
    });

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
    }>(
      `SELECT id, state, enrichment_priority, tmdb_id, tvdb_id
       FROM ${table}
       WHERE state = 'discovered'
          OR enrichment_priority > 0
          OR (enriched_at IS NOT NULL AND enriched_at < datetime('now', '-30 days'))
       ORDER BY enrichment_priority DESC, id ASC
       LIMIT 50`
    );

    return entities;
  }

  /**
   * Create enrichment jobs for an entity
   */
  private async createEnrichmentJobs(
    entity: { id: number; tmdb_id?: number; tvdb_id?: number },
    entityType: 'movie' | 'series' | 'episode'
  ): Promise<void> {
    // 1. Enrich metadata from TMDB/TVDB
    if (entity.tmdb_id) {
      await this.jobQueue.addJob({
        type: 'enrich-metadata',
        priority: 5, // Normal priority
        payload: {
          entityType,
          entityId: entity.id,
          provider: 'tmdb',
          providerId: entity.tmdb_id
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

    const entities = await this.db.query<{
      id: number;
      state: string;
      enrichment_priority: number;
      tmdb_id?: number;
      tvdb_id?: number;
    }>(
      `SELECT id, state, enrichment_priority, tmdb_id, tvdb_id FROM ${table} WHERE id = ?`,
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
