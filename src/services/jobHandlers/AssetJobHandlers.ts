import { DatabaseConnection } from '../../types/database.js';
import { DatabaseManager } from '../../database/DatabaseManager.js';
import { Job, JOB_PRIORITY } from '../jobQueue/types.js';
import { JobQueueService } from '../jobQueue/JobQueueService.js';
import { EnrichmentOrchestrator } from '../enrichment/EnrichmentOrchestrator.js';
import { PublishingService } from '../publishingService.js';
import { PhaseConfigService } from '../PhaseConfigService.js';
import { TrailerDownloadService } from '../trailers/TrailerDownloadService.js';
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
  private enrichment: EnrichmentOrchestrator;
  private publishing: PublishingService;
  private phaseConfig: PhaseConfigService;
  private trailerDownloadService: TrailerDownloadService;

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
    this.trailerDownloadService = new TrailerDownloadService();
    if (!dbManager) {
      throw new ValidationError('DatabaseManager is required for AssetJobHandlers', {
        service: 'AssetJobHandlers',
        operation: 'constructor',
        metadata: { field: 'dbManager' },
      });
    }
    this.enrichment = new EnrichmentOrchestrator(db, dbManager);
    this.publishing = new PublishingService(db, cacheDir, dbManager);
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
    const { entityType, entityId, requireComplete = false } = job.payload;

    logger.info('[AssetJobHandlers] Starting enrichment', {
      service: 'AssetJobHandlers',
      handler: 'handleEnrichMetadata',
      jobId: job.id,
      entityType,
      entityId,
      requireComplete,
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
      requireComplete,
    });

    // Run enrichment with phase config
    const result = await this.enrichment.enrich({
      entityType,
      entityId,
      manual: false, // Job-initiated enrichment is not manual
      forceRefresh: false,
      requireComplete,
      phaseConfig,
    });

    logger.info('[AssetJobHandlers] Enrichment complete', {
      service: 'AssetJobHandlers',
      handler: 'handleEnrichMetadata',
      jobId: job.id,
      entityType,
      entityId,
      success: result.success,
      partial: result.partial,
      metadataChanged: result.metadataChanged?.length || 0,
      rateLimitedProviders: result.rateLimitedProviders,
    });

    // If requireComplete=true and rate limited → Don't chain (bulk mode)
    if (
      requireComplete &&
      result.rateLimitedProviders &&
      result.rateLimitedProviders.length > 0 &&
      !result.success
    ) {
      logger.info('[AssetJobHandlers] Bulk mode - stopped due to rate limit, not creating publish job', {
        entityId,
        providers: result.rateLimitedProviders,
      });
      return; // Don't create publish job
    }

    // Broadcast WebSocket update to refresh UI
    if (entityType === 'movie') {
      logger.info('[AssetJobHandlers] Broadcasting moviesUpdated WebSocket event', {
        entityType,
        entityId,
      });
      websocketBroadcaster.broadcastMoviesUpdated([entityId]);
    }

    // Queue trailer download job if a trailer was selected during enrichment
    if (result.trailerSelected && result.selectedTrailerCandidateId && entityType === 'movie') {
      await this.queueTrailerDownloadIfNeeded(entityId, result.selectedTrailerCandidateId);
    }

    // Check if we should publish (metadata OR assets changed)
    const hasMetadataChanges = (result.metadataChanged?.length ?? 0) > 0;
    const hasAssetChanges =
      (result.assetsChanged?.length ?? 0) > 0 || (result.assetsSelected ?? 0) > 0;

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

    // Only chain to publish if enabled AND changes detected
    if (autoPublish && (hasMetadataChanges || hasAssetChanges)) {
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

      logger.info('[AssetJobHandlers] Created publish job', {
        service: 'AssetJobHandlers',
        handler: 'handleEnrichMetadata',
        enrichmentJobId: job.id,
        publishJobId,
        metadataChanged: hasMetadataChanges,
        assetsChanged: hasAssetChanges,
        libraryId: library.id,
        libraryName: library.name,
      });
    } else if (!autoPublish) {
      // Manual workflow: stop for user review
      logger.info('[AssetJobHandlers] Library has auto-publish disabled, waiting for manual trigger', {
        service: 'AssetJobHandlers',
        handler: 'handleEnrichMetadata',
        jobId: job.id,
        libraryId: library.id,
        libraryName: library.name,
      });
    } else {
      // No changes detected
      logger.info('[AssetJobHandlers] No changes detected, skipping publish', {
        service: 'AssetJobHandlers',
        handler: 'handleEnrichMetadata',
        jobId: job.id,
        hasMetadataChanges,
        hasAssetChanges,
      });
    }
  }

  /**
   * Handle publish job (PUBLISHING PHASE)
   *
   * This handler:
   * 1. Deploys ALL selected assets to library (posters, fanart, trailers, actors)
   * 2. Generates NFO files
   * 3. Chains to player-sync job (future)
   *
   * Publishing always publishes all selected assets. Individual asset types
   * are controlled via asset limits (set to 0 to disable that type).
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

    // Run publishing (publishes all selected assets)
    await this.publishing.publish({
      entityType,
      entityId,
      libraryPath: path.dirname(entity.file_path),
      mediaFilename: entity.title,
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

  /**
   * Queue trailer download job if the selected candidate needs downloading
   *
   * Checks if the candidate:
   * 1. Exists and has a source_url
   * 2. Doesn't already have a cache_video_file_id (not yet downloaded)
   * 3. Doesn't have a permanent failure (failure_reason = 'unavailable')
   *
   * @param movieId - Movie ID
   * @param candidateId - Selected trailer candidate ID
   */
  private async queueTrailerDownloadIfNeeded(movieId: number, candidateId: number): Promise<void> {
    try {
      // Get candidate details
      const candidate = await this.db.get<{
        id: number;
        source_url: string | null;
        cache_video_file_id: number | null;
        failure_reason: string | null;
      }>(
        `SELECT id, source_url, cache_video_file_id, failure_reason
         FROM trailer_candidates WHERE id = ?`,
        [candidateId]
      );

      if (!candidate) {
        logger.warn('[AssetJobHandlers] Selected trailer candidate not found', {
          movieId,
          candidateId,
        });
        return;
      }

      // Skip if already downloaded
      if (candidate.cache_video_file_id) {
        logger.debug('[AssetJobHandlers] Trailer already downloaded, skipping', {
          movieId,
          candidateId,
          cacheVideoFileId: candidate.cache_video_file_id,
        });
        return;
      }

      // Skip if no source URL (uploaded trailers don't need download)
      if (!candidate.source_url) {
        logger.debug('[AssetJobHandlers] No source URL for trailer, skipping download', {
          movieId,
          candidateId,
        });
        return;
      }

      // Skip if permanently unavailable
      if (candidate.failure_reason === 'unavailable') {
        logger.debug('[AssetJobHandlers] Trailer marked unavailable, skipping download', {
          movieId,
          candidateId,
        });
        return;
      }

      // Skip age-restricted trailers unless cookies are available
      if (candidate.failure_reason === 'age_restricted') {
        const hasCookies = await this.trailerDownloadService.hasCookieFile();
        if (!hasCookies) {
          logger.debug('[AssetJobHandlers] Trailer is age-restricted (no cookies), skipping download', {
            movieId,
            candidateId,
          });
          return;
        }
      }

      // Get movie title for job payload
      const movie = await this.db.get<{ title: string }>(
        `SELECT title FROM movies WHERE id = ?`,
        [movieId]
      );

      // Queue the download job
      const jobId = await this.jobQueue.addJob({
        type: 'download-trailer',
        priority: JOB_PRIORITY.LOW, // Auto-enrichment uses low priority
        payload: {
          entityType: 'movie',
          entityId: movieId,
          candidateId,
          sourceUrl: candidate.source_url,
          movieTitle: movie?.title || `Movie ${movieId}`,
        },
        retry_count: 0,
        max_retries: 2,
      });

      logger.info('[AssetJobHandlers] Queued trailer download job', {
        movieId,
        candidateId,
        jobId,
        sourceUrl: candidate.source_url,
      });
    } catch (error) {
      // Non-fatal: log and continue
      logger.error('[AssetJobHandlers] Failed to queue trailer download', {
        movieId,
        candidateId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

}
