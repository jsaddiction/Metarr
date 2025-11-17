import { DatabaseConnection } from '../../types/database.js';
import { DatabaseManager } from '../../database/DatabaseManager.js';
import { Job } from '../jobQueue/types.js';
import { JobQueueService } from '../jobQueue/JobQueueService.js';
import { EnrichmentService } from '../enrichment/EnrichmentService.js';
import { PublishingService } from '../publishingService.js';
import { PhaseConfigService } from '../PhaseConfigService.js';
import { websocketBroadcaster } from '../websocketBroadcaster.js';
import { logger } from '../../middleware/logging.js';
import path from 'path';
import { ValidationError, ResourceNotFoundError } from '../../errors/index.js';

/**
 * Asset Job Handlers
 *
 * Handles asset-related jobs (discovery, fetching, selection, publishing, verification)
 */
export class AssetJobHandlers {
  private db: DatabaseConnection;
  private jobQueue: JobQueueService;
  private enrichment: EnrichmentService;
  private publishing: PublishingService;
  private phaseConfig: PhaseConfigService;

  constructor(
    db: DatabaseConnection,
    jobQueue: JobQueueService,
    phaseConfig: PhaseConfigService,
    cacheDir: string,
    dbManager?: DatabaseManager
  ) {
    this.db = db;
    this.jobQueue = jobQueue;
    this.phaseConfig = phaseConfig;
    if (!dbManager) {
      throw new ValidationError(
        'DatabaseManager is required for AssetJobHandlers',
        { service: 'AssetJobHandlers', operation: 'constructor', metadata: { field: 'dbManager' } }
      );
    }
    this.enrichment = new EnrichmentService(db, dbManager, cacheDir);
    this.publishing = new PublishingService(db, cacheDir);
  }

  /**
   * Register all asset handlers with job queue
   */
  registerHandlers(jobQueue: JobQueueService): void {
    jobQueue.registerHandler('enrich-metadata', this.handleEnrichMetadata.bind(this));
    jobQueue.registerHandler('publish', this.handlePublish.bind(this));
  }

  /**
   * Handle enrich-metadata job (ENRICHMENT PHASE)
   *
   * This handler:
   * 1. Fetches provider assets (if enabled in config)
   * 2. Auto-selects best assets (if enabled in config)
   * 3. Chains to publish job
   *
   * Configuration controls BEHAVIOR:
   * - enrichConfig.fetchProviderAssets: Whether to fetch from providers
   * - enrichConfig.autoSelectAssets: Whether to auto-select best candidates
   *
   * Payload: {
   *   entityType: 'movie' | 'series' | 'season' | 'episode' | 'album' | 'track',
   *   entityId: number
   * }
   */
  private async handleEnrichMetadata(job: Job<'enrich-metadata'>): Promise<void> {
    const { entityType, entityId } = job.payload;

    logger.info('[AssetJobHandlers] Starting enrichment', {
      service: 'AssetJobHandlers',
      handler: 'handleEnrichMetadata',
      jobId: job.id,
      entityType,
      entityId,
    });

    // Get phase configuration
    const config = await this.phaseConfig.getAll();
    const phaseConfig = config.enrichment;

    logger.info('[AssetJobHandlers] Enrichment configuration', {
      service: 'AssetJobHandlers',
      handler: 'handleEnrichMetadata',
      jobId: job.id,
      fetchProviderAssets: phaseConfig.fetchProviderAssets,
      autoSelectAssets: phaseConfig.autoSelectAssets,
    });

    // Run enrichment with phase config
    await this.enrichment.enrich({
      entityType,
      entityId,
      manual: false, // Job-initiated enrichment is not manual
      forceRefresh: false,
      phaseConfig,
    });

    logger.info('[AssetJobHandlers] Enrichment complete', {
      service: 'AssetJobHandlers',
      handler: 'handleEnrichMetadata',
      jobId: job.id,
      entityType,
      entityId,
    });

    // Broadcast WebSocket update to refresh UI
    if (entityType === 'movie') {
      logger.info('[AssetJobHandlers] Broadcasting moviesUpdated WebSocket event', {
        entityType,
        entityId,
      });
      websocketBroadcaster.broadcastMoviesUpdated([entityId]);
    }

    // Get library settings to check auto-publish
    const entity = await this.getEntityWithLibrary(entityType, entityId);
    if (!entity) {
      logger.error('[AssetJobHandlers] Entity not found after enrichment', { entityType, entityId });
      return;
    }

    const library = await this.getLibrary(entity.library_id);
    if (!library) {
      logger.error('[AssetJobHandlers] Library not found', { libraryId: entity.library_id });
      return;
    }

    // Check library-level auto-publish setting
    const autoPublish = library.auto_publish;

    if (autoPublish) {
      // Automated workflow: chain to publish
      const publishJobId = await this.jobQueue.addJob({
        type: 'publish',
        priority: job.priority, // Maintain priority from enrichment
        payload: {
          entityType,
          entityId,
        },
        retry_count: 0,
        max_retries: 3,
      });

      logger.info('[AssetJobHandlers] Library has auto-publish enabled, chained to publish job', {
        service: 'AssetJobHandlers',
        handler: 'handleEnrichMetadata',
        jobId: job.id,
        publishJobId,
        libraryId: library.id,
        libraryName: library.name,
      });
    } else {
      // Manual workflow: stop for user review
      logger.info('[AssetJobHandlers] Library has auto-publish disabled, waiting for manual trigger', {
        service: 'AssetJobHandlers',
        handler: 'handleEnrichMetadata',
        jobId: job.id,
        libraryId: library.id,
        libraryName: library.name,
      });
    }
  }

  /**
   * Handle publish job (PUBLISHING PHASE)
   *
   * This handler:
   * 1. Deploys selected assets to library (if enabled in config)
   * 2. Updates NFO files
   * 3. Chains to player-sync job (future)
   *
   * Configuration controls BEHAVIOR:
   * - publishConfig.publishAssets: Whether to deploy posters/fanart
   * - publishConfig.publishActors: Whether to deploy actor images
   * - publishConfig.publishTrailers: Whether to deploy trailer files
   *
   * Payload: {
   *   entityType: 'movie' | 'series' | 'season' | 'episode' | 'album' | 'track',
   *   entityId: number
   * }
   */
  private async handlePublish(job: Job<'publish'>): Promise<void> {
    const { entityType, entityId } = job.payload;

    logger.info('[AssetJobHandlers] Starting publish', {
      service: 'AssetJobHandlers',
      handler: 'handlePublish',
      jobId: job.id,
      entityType,
      entityId,
    });

    // Get phase configuration
    const config = await this.phaseConfig.getAll();
    const publishConfig = config.publish;

    logger.info('[AssetJobHandlers] Publish configuration', {
      service: 'AssetJobHandlers',
      handler: 'handlePublish',
      jobId: job.id,
      publishAssets: publishConfig.publishAssets,
      publishActors: publishConfig.publishActors,
      publishTrailers: publishConfig.publishTrailers,
    });

    // Get entity and library info
    const entity = await this.getEntityForPublish(entityType, entityId);
    if (!entity) {
      throw new ResourceNotFoundError(
        entityType,
        entityId,
        `Entity not found: ${entityType} ${entityId}`,
        { service: 'AssetJobHandlers', operation: 'handlePublish' }
      );
    }

    // Run publishing with phase config
    await this.publishing.publish({
      entityType,
      entityId,
      libraryPath: path.dirname(entity.file_path),
      mediaFilename: entity.title,
      phaseConfig: publishConfig,
    });

    logger.info('[AssetJobHandlers] Publish complete', {
      service: 'AssetJobHandlers',
      handler: 'handlePublish',
      jobId: job.id,
      entityType,
      entityId,
    });

    // Broadcast WebSocket update to refresh UI
    if (entityType === 'movie') {
      logger.info('[AssetJobHandlers] Broadcasting moviesUpdated WebSocket event after publish', {
        entityType,
        entityId,
      });
      websocketBroadcaster.broadcastMoviesUpdated([entityId]);
    }

    // TODO: Chain to player-sync job when implemented
    // const playerSyncJobId = await this.jobQueue.addJob({
    //   type: 'player-sync',
    //   priority: JOB_PRIORITY.NORMAL,
    //   payload: { libraryId, entityType, entityId },
    //   retry_count: 0,
    //   max_retries: 2,
    // });
  }

  /**
   * Get entity with library_id
   */
  private async getEntityWithLibrary(
    entityType: string,
    entityId: number
  ): Promise<{ id: number; library_id: number } | null> {
    const table = `${entityType}s`;
    const results = await this.db.query<{ id: number; library_id: number }>(
      `SELECT id, library_id FROM ${table} WHERE id = ?`,
      [entityId]
    );
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Get library by ID
   */
  private async getLibrary(libraryId: number): Promise<{ id: number; name: string; auto_publish: boolean } | null> {
    const results = await this.db.query<{ id: number; name: string; auto_publish: number }>(
      `SELECT id, name, auto_publish FROM libraries WHERE id = ?`,
      [libraryId]
    );
    if (results.length === 0) return null;
    return {
      id: results[0].id,
      name: results[0].name,
      auto_publish: Boolean(results[0].auto_publish),
    };
  }

  /**
   * Get entity data for publishing
   */
  private async getEntityForPublish(
    entityType: string,
    entityId: number
  ): Promise<{ id: number; file_path: string; title: string } | null> {
    const table = `${entityType}s`; // movies, series, etc.
    const results = await this.db.query<{ id: number; file_path: string; title: string }>(
      `SELECT id, file_path, title FROM ${table} WHERE id = ?`,
      [entityId]
    );
    return results.length > 0 ? results[0] : null;
  }

}
