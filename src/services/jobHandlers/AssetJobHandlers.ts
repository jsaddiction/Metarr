import { DatabaseConnection } from '../../types/database.js';
import { Job, JobQueueService } from '../jobQueueService.js';
import { AssetDiscoveryService } from '../assetDiscoveryService.js';
import { ProviderAssetService } from '../providerAssetService.js';
import { AssetSelectionService } from '../assetSelectionService.js';
import { PublishingService } from '../publishingService.js';
import { TMDBClient } from '../providers/tmdb/TMDBClient.js';
import { WorkflowControlService } from '../workflowControlService.js';
import { websocketBroadcaster } from '../websocketBroadcaster.js';
import { logger } from '../../middleware/logging.js';
import { hashFile } from '../hash/hashService.js';
import { extractMediaInfo } from '../media/ffprobeService.js';
import fs from 'fs/promises';
import path from 'path';
import { getErrorMessage } from '../../utils/errorHandling.js';
import { SqlParam } from '../../types/database.js';

/**
 * Asset Job Handlers
 *
 * Handles asset-related jobs (discovery, fetching, selection, publishing, verification)
 */
export class AssetJobHandlers {
  private db: DatabaseConnection;
  private jobQueue: JobQueueService;
  private assetDiscovery: AssetDiscoveryService;
  private providerAssets: ProviderAssetService;
  private assetSelection: AssetSelectionService;
  private publishing: PublishingService;
  private workflowControl: WorkflowControlService;
  private tmdbClient: TMDBClient | undefined;

  constructor(
    db: DatabaseConnection,
    jobQueue: JobQueueService,
    cacheDir: string,
    tmdbClient?: TMDBClient
  ) {
    this.db = db;
    this.jobQueue = jobQueue;
    this.assetDiscovery = new AssetDiscoveryService(db, cacheDir);
    this.providerAssets = new ProviderAssetService(db, cacheDir, tmdbClient);
    this.assetSelection = new AssetSelectionService(db);
    this.publishing = new PublishingService(db);
    this.workflowControl = new WorkflowControlService(db);
    this.tmdbClient = tmdbClient;
  }

  /**
   * Register all asset handlers with job queue
   */
  registerHandlers(jobQueue: JobQueueService): void {
    jobQueue.registerHandler('discover-assets', this.handleDiscoverAssets.bind(this));
    jobQueue.registerHandler('fetch-provider-assets', this.handleFetchProviderAssets.bind(this));
    jobQueue.registerHandler('enrich-metadata', this.handleEnrichMetadata.bind(this));
    jobQueue.registerHandler('select-assets', this.handleSelectAssets.bind(this));
    jobQueue.registerHandler('publish', this.handlePublish.bind(this));
    jobQueue.registerHandler('verify-movie', this.handleVerifyMovie.bind(this));
  }

  /**
   * Handle discover-assets job (JOB CHAINING PATTERN)
   *
   * This handler:
   * 1. Scans directory for local assets (images, videos, text files)
   * 2. Chains to fetch-provider-assets job (if identification workflow enabled)
   *
   * Payload: {
   *   entityType: 'movie' | 'series' | 'episode',
   *   entityId: number,
   *   directoryPath: string,
   *   chainContext?: { source, tmdbId, imdbId, libraryId }
   * }
   */
  private async handleDiscoverAssets(job: Job): Promise<void> {
    const { entityType, entityId, directoryPath, chainContext } = job.payload as {
      entityType: 'movie' | 'series' | 'episode';
      entityId: number;
      directoryPath: string;
      chainContext?: { source?: string; tmdbId?: number; imdbId?: string; libraryId?: number; };
    };

    logger.info('[AssetJobHandlers] Discovering assets', {
      service: 'AssetJobHandlers',
      handler: 'handleDiscoverAssets',
      jobId: job.id,
      entityType,
      entityId,
      directoryPath
    });

    // 1. Scan directory for local assets
    const result = await this.assetDiscovery.scanDirectory(
      directoryPath,
      entityType,
      entityId
    );

    logger.info('[AssetJobHandlers] Asset discovery complete', {
      service: 'AssetJobHandlers',
      handler: 'handleDiscoverAssets',
      jobId: job.id,
      ...result
    });

    // 2. Check if identification workflow is enabled (unless user-initiated)
    if (!job.manual) {
      const identificationEnabled = await this.workflowControl.isEnabled('identification');
      if (!identificationEnabled) {
        logger.info('[AssetJobHandlers] Identification workflow disabled, stopping chain', {
          service: 'AssetJobHandlers',
          handler: 'handleDiscoverAssets',
          jobId: job.id,
          entityType,
          entityId
        });
        return;
      }
    }

    // 3. Check if we have provider ID to fetch from
    if (!chainContext?.tmdbId) {
      logger.info('[AssetJobHandlers] No TMDB ID available, cannot fetch provider assets', {
        service: 'AssetJobHandlers',
        handler: 'handleDiscoverAssets',
        jobId: job.id,
        entityType,
        entityId
      });
      return;
    }

    // 4. Chain to fetch-provider-assets job
    const fetchJobId = await this.jobQueue.addJob({
      type: 'fetch-provider-assets',
      priority: 5, // NORMAL priority for provider fetches
      payload: {
        entityType,
        entityId,
        provider: 'tmdb',
        providerId: chainContext.tmdbId,
        chainContext
      },
      retry_count: 0,
      max_retries: 3,
    });

    logger.info('[AssetJobHandlers] Asset discovery complete, chained to fetch-provider-assets', {
      service: 'AssetJobHandlers',
      handler: 'handleDiscoverAssets',
      jobId: job.id,
      entityType,
      entityId,
      fetchJobId
    });
  }

  /**
   * Handle fetch-provider-assets job (JOB CHAINING PATTERN)
   *
   * This handler:
   * 1. Fetches assets from provider (TMDB/TVDB or ProviderOrchestrator)
   * 2. Chains to select-assets job (if enrichment workflow enabled)
   *
   * Payload: {
   *   entityType: 'movie' | 'series' | 'episode',
   *   entityId: number,
   *   provider: 'tmdb' | 'tvdb' | 'orchestrator',
   *   providerId: number,
   *   chainContext?: { source, libraryId }
   * }
   */
  private async handleFetchProviderAssets(job: Job): Promise<void> {
    const { entityType, entityId, provider, providerId, chainContext } = job.payload as {
      entityType: string;
      entityId: number;
      provider: string;
      providerId: string;
      chainContext?: unknown;
    };

    logger.info('[AssetJobHandlers] Fetching provider assets', {
      service: 'AssetJobHandlers',
      handler: 'handleFetchProviderAssets',
      jobId: job.id,
      entityType,
      entityId,
      provider,
      providerId
    });

    // Check if entity is monitored
    const isMonitored = await this.isEntityMonitored(entityType, entityId);
    if (!isMonitored) {
      logger.info('[AssetJobHandlers] Skipping asset fetch for unmonitored entity', {
        service: 'AssetJobHandlers',
        handler: 'handleFetchProviderAssets',
        jobId: job.id,
        entityType,
        entityId
      });
      return;
    }

    // 1. Fetch assets from provider
    let result;
    if (provider === 'orchestrator' && entityType === 'movie') {
      // Use ProviderOrchestrator for multi-provider fetch
      const { ProviderOrchestrator } = await import('../providers/ProviderOrchestrator.js');
      const { ProviderRegistry } = await import('../providers/ProviderRegistry.js');
      const { ProviderConfigService } = await import('../providerConfigService.js');

      const registry = ProviderRegistry.getInstance();
      const configService = new ProviderConfigService(this.db);
      const orchestrator = new ProviderOrchestrator(registry, configService);

      // Fetch metadata from all providers
      const metadataResult = await orchestrator.fetchMetadata(
        entityType,
        { tmdb: providerId },
        { strategy: 'aggregate_all', fillGaps: true }
      );

      logger.info('[AssetJobHandlers] Fetched metadata from all providers', {
        service: 'AssetJobHandlers',
        handler: 'handleFetchProviderAssets',
        jobId: job.id,
        providersUsed: metadataResult.providerId,
        completeness: metadataResult.completeness,
      });

      result = { fetched: true }; // Simplified result for now
    } else if (provider === 'tmdb' && entityType === 'movie') {
      result = await this.providerAssets.fetchMovieAssets(entityId, parseInt(providerId, 10));
      logger.info('[AssetJobHandlers] Fetched assets from TMDB', {
        service: 'AssetJobHandlers',
        handler: 'handleFetchProviderAssets',
        jobId: job.id,
        fetched: result.fetched
      });
    } else {
      logger.warn('[AssetJobHandlers] Unsupported provider/entityType combination', {
        service: 'AssetJobHandlers',
        handler: 'handleFetchProviderAssets',
        jobId: job.id,
        provider,
        entityType
      });
      return;
    }

    // 2. Check if enrichment workflow is enabled (unless user-initiated)
    if (!job.manual) {
      const enrichmentEnabled = await this.workflowControl.isEnabled('enrichment');
      if (!enrichmentEnabled) {
        logger.info('[AssetJobHandlers] Enrichment workflow disabled, stopping chain', {
          service: 'AssetJobHandlers',
          handler: 'handleFetchProviderAssets',
          jobId: job.id,
          entityType,
          entityId
        });
        return;
      }
    }

    // 3. Chain to select-assets job (preserve manual flag)
    const selectJobId = await this.jobQueue.addJob({
      type: 'select-assets',
      priority: job.manual ? 3 : 5, // HIGH priority if user-initiated, NORMAL otherwise
      payload: {
        entityType,
        entityId,
        chainContext
      },
      retry_count: 0,
      max_retries: 3,
      manual: job.manual, // Propagate manual flag through chain
    });

    logger.info('[AssetJobHandlers] Provider assets fetched, chained to select-assets', {
      service: 'AssetJobHandlers',
      handler: 'handleFetchProviderAssets',
      jobId: job.id,
      entityType,
      entityId,
      selectJobId
    });
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
    const { entityType, entityId, provider, providerId } = job.payload as {
      entityType: 'movie' | 'series' | 'episode';
      entityId: number;
      provider: string;
      providerId: number;
    };

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
      const values: SqlParam[] = [];

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
   * Handle select-assets job (JOB CHAINING PATTERN)
   *
   * This handler:
   * 1. Auto-selects best assets based on automation config
   * 2. Chains to publish job (if publishing workflow enabled and YOLO mode)
   *
   * Payload: {
   *   entityType: 'movie' | 'series' | 'episode',
   *   entityId: number,
   *   mode?: 'yolo' | 'hybrid' | 'manual',
   *   assetTypes?: string[],
   *   chainContext?: { source, libraryId }
   * }
   */
  private async handleSelectAssets(job: Job): Promise<void> {
    const { entityType, entityId, mode, assetTypes, chainContext } = job.payload as {
      entityType: 'movie' | 'series' | 'episode';
      entityId: number;
      mode?: 'manual' | 'yolo' | 'hybrid';
      assetTypes?: string[];
      chainContext?: unknown;
    };

    logger.info('[AssetJobHandlers] Auto-selecting assets', {
      service: 'AssetJobHandlers',
      handler: 'handleSelectAssets',
      jobId: job.id,
      entityType,
      entityId,
      mode
    });

    // Get automation config for this entity
    const config = await this.getAutomationConfig(entityId, entityType);
    const selectionMode = mode || config?.mode || 'manual';

    // Skip if manual mode (user must select)
    if (selectionMode === 'manual') {
      logger.info('[AssetJobHandlers] Manual mode, skipping auto-selection', {
        service: 'AssetJobHandlers',
        handler: 'handleSelectAssets',
        jobId: job.id,
        entityType,
        entityId
      });
      return;
    }

    // 1. Auto-select assets
    const types = assetTypes || ['poster', 'fanart', 'banner', 'clearlogo', 'clearart', 'discart', 'landscape'];
    let selectedCount = 0;

    for (const assetType of types) {
      const selectConfig = {
        entityType,
        entityId,
        assetType,
        mode: selectionMode as 'manual' | 'yolo' | 'hybrid'
      };

      let result;
      if (selectionMode === 'yolo') {
        result = await this.assetSelection.selectAssetYOLO(selectConfig);
      } else {
        result = await this.assetSelection.selectAssetHybrid(selectConfig);
      }

      if (result.selected) {
        selectedCount++;
        logger.info('[AssetJobHandlers] Selected asset', {
          service: 'AssetJobHandlers',
          handler: 'handleSelectAssets',
          jobId: job.id,
          assetType,
          candidateId: result.candidateId
        });
      }
    }

    logger.info('[AssetJobHandlers] Asset selection complete', {
      service: 'AssetJobHandlers',
      handler: 'handleSelectAssets',
      jobId: job.id,
      selectedCount,
      totalTypes: types.length
    });

    // 2. Check if publishing workflow is enabled (unless user-initiated)
    if (!job.manual) {
      const publishingEnabled = await this.workflowControl.isEnabled('publishing');
      if (!publishingEnabled) {
        logger.info('[AssetJobHandlers] Publishing workflow disabled, stopping chain', {
          service: 'AssetJobHandlers',
          handler: 'handleSelectAssets',
          jobId: job.id,
          entityType,
          entityId
        });
        return;
      }
    }

    // 3. Only publish in YOLO mode (hybrid requires user approval, unless user-initiated)
    if (!job.manual && selectionMode !== 'yolo') {
      logger.info('[AssetJobHandlers] Not in YOLO mode, skipping publish', {
        service: 'AssetJobHandlers',
        handler: 'handleSelectAssets',
        jobId: job.id,
        entityType,
        entityId,
        mode: selectionMode
      });
      return;
    }

    // 4. Get entity details for publishing
    const entity = await this.getEntityForPublish(entityType, entityId);
    if (!entity) {
      logger.error('[AssetJobHandlers] Entity not found for publishing', {
        service: 'AssetJobHandlers',
        handler: 'handleSelectAssets',
        jobId: job.id,
        entityType,
        entityId
      });
      return;
    }

    // 5. Chain to publish job (preserve manual flag)
    const publishJobId = await this.jobQueue.addJob({
      type: 'publish',
      priority: job.manual ? 3 : 5, // HIGH priority if user-initiated, NORMAL otherwise
      payload: {
        entityType,
        entityId,
        libraryPath: entity.file_path,
        mediaFilename: entity.title,
        chainContext
      },
      manual: job.manual, // Propagate manual flag through chain
      retry_count: 0,
      max_retries: 3,
    });

    logger.info('[AssetJobHandlers] Assets selected, chained to publish', {
      service: 'AssetJobHandlers',
      handler: 'handleSelectAssets',
      jobId: job.id,
      entityType,
      entityId,
      publishJobId
    });
  }

  /**
   * Handle publish job (FINAL STEP IN CHAIN)
   *
   * This handler:
   * 1. Publishes selected assets to library directory
   * 2. Generates NFO file
   * 3. Notifies media players (optional)
   *
   * This is the final step in the workflow chain.
   *
   * Payload: {
   *   entityType: 'movie' | 'series' | 'episode',
   *   entityId: number,
   *   libraryPath: string,
   *   mediaFilename?: string,
   *   chainContext?: { source, libraryId }
   * }
   */
  private async handlePublish(job: Job): Promise<void> {
    const { entityType, entityId, libraryPath, mediaFilename, chainContext } = job.payload as {
      entityType: 'movie' | 'series' | 'episode';
      entityId: number;
      libraryPath: string;
      mediaFilename: string;
      chainContext?: { source?: string; libraryId?: number; };
    };

    logger.info('[AssetJobHandlers] Publishing to library', {
      service: 'AssetJobHandlers',
      handler: 'handlePublish',
      jobId: job.id,
      entityType,
      entityId,
      libraryPath
    });

    // Publish assets and NFO
    const result = await this.publishing.publish({
      entityType,
      entityId,
      libraryPath,
      mediaFilename
    });

    if (!result.success) {
      logger.error('[AssetJobHandlers] Publishing failed', {
        service: 'AssetJobHandlers',
        handler: 'handlePublish',
        jobId: job.id,
        entityType,
        entityId,
        errors: result.errors
      });
      throw new Error(`Publishing failed: ${result.errors.join(', ')}`);
    }

    logger.info('[AssetJobHandlers] Publishing complete (END OF CHAIN)', {
      service: 'AssetJobHandlers',
      handler: 'handlePublish',
      jobId: job.id,
      entityType,
      entityId,
      assetsPublished: result.assetsPublished,
      nfoGenerated: result.nfoGenerated,
      chainSource: chainContext?.source
    });

    // Queue player notification jobs (STUBBED - implementation pending)
    const libraryId = chainContext?.libraryId;
    if (libraryId) {
      try {
        // Get all media player groups that manage this library
        const groups = await this.db.query<{
          id: number;
          type: string;
        }>(
          `SELECT DISTINCT mpg.id, mpg.type
           FROM media_player_groups mpg
           JOIN media_player_libraries mpl ON mpl.group_id = mpg.id
           WHERE mpl.library_id = ? AND mpg.enabled = 1`,
          [libraryId]
        );

        logger.info('[AssetJobHandlers] Queueing player notification jobs (STUBBED)', {
          service: 'AssetJobHandlers',
          handler: 'handlePublish',
          jobId: job.id,
          libraryId,
          groupCount: groups.length,
        });

        // Queue notification job for each player group
        for (const group of groups) {
          const notifyJobType = group.type === 'kodi' ? 'notify-kodi' :
                               group.type === 'jellyfin' ? 'notify-jellyfin' :
                               'notify-plex';

          await this.jobQueue.addJob({
            type: notifyJobType as any,
            priority: 5, // NORMAL priority
            payload: {
              groupId: group.id,
              libraryId,
              libraryPath,
              event: 'publish',
            },
            retry_count: 0,
            max_retries: 2,
          });

          logger.debug('[AssetJobHandlers] Queued player notification', {
            service: 'AssetJobHandlers',
            handler: 'handlePublish',
            jobId: job.id,
            groupId: group.id,
            groupType: group.type,
          });
        }
      } catch (error) {
        logger.warn('[AssetJobHandlers] Failed to queue player notifications', {
          service: 'AssetJobHandlers',
          handler: 'handlePublish',
          jobId: job.id,
          libraryId,
          error: getErrorMessage(error),
        });
        // Don't throw - publishing succeeded, notification failure is non-critical
      }
    }

    // Emit WebSocket event for frontend
    websocketBroadcaster.broadcast('entity.published', {
      entityType,
      entityId,
      assetsPublished: result.assetsPublished,
      nfoGenerated: result.nfoGenerated
    });
  }

  /**
   * Handle verify-movie job (PHASE 3B - Cache/Library Verification)
   *
   * This handler ensures library directory matches cache:
   * - Verifies all expected assets exist and match hashes
   * - Restores missing/corrupted files from cache
   * - Removes unauthorized files
   * - Triggers NFO regen if video file changed
   *
   * Payload: {
   *   entityType: 'movie',
   *   entityId: number,
   *   directoryPath: string
   * }
   */
  private async handleVerifyMovie(job: Job): Promise<void> {
    const { entityType, entityId, directoryPath } = job.payload as {
      entityType: string;
      entityId: number;
      directoryPath: string;
    };

    logger.info('[AssetJobHandlers] Starting verification workflow', {
      service: 'AssetJobHandlers',
      handler: 'handleVerifyMovie',
      jobId: job.id,
      entityId,
      directoryPath,
    });

    let videoChanged = false;
    let assetsChanged = false;
    let filesRecycled = 0;
    let filesRestored = 0;

    try {
      // Phase 0: Video file hash verification (FFprobe re-extraction if mismatch)
      const videoResult = await this.verifyMainVideoFile(entityId);
      videoChanged = videoResult.changed;
      const mainVideoFilename = videoResult.filename;

      if (videoResult.changed) {
        logger.info('[AssetJobHandlers] Video file changed, FFprobe re-extraction completed', {
          jobId: job.id,
          entityId,
        });
      }

      // Phase 1: Scan directory in-memory (don't store to DB)
      const libraryFiles = await this.scanDirectoryInMemory(directoryPath);

      // Remove main video file from the map so it won't be considered for recycling
      if (mainVideoFilename) {
        libraryFiles.delete(mainVideoFilename);
        logger.debug('[AssetJobHandlers] Main video file excluded from verification', {
          jobId: job.id,
          entityId,
          filename: mainVideoFilename,
        });
      }

      // Phase 2: Get expected files from cache
      const cacheAssets = await this.getCacheAssets(entityId);

      // Phase 3: Verify each cached asset exists and matches hash
      for (const cacheAsset of cacheAssets) {
        const libraryFile = libraryFiles.get(cacheAsset.expectedFilename);

        if (!libraryFile) {
          // Missing file - restore from cache
          logger.warn('[AssetJobHandlers] Missing file, restoring from cache', {
            jobId: job.id,
            entityId,
            filename: cacheAsset.expectedFilename,
          });
          await this.restoreFileFromCache(
            cacheAsset.cachePath,
            path.join(directoryPath, cacheAsset.expectedFilename)
          );
          filesRestored++;
          assetsChanged = true;
        } else {
          // File exists - verify hash
          const hashResult = await hashFile(libraryFile.fullPath);
          if (hashResult.hash !== cacheAsset.hash) {
            // Hash mismatch - restore from cache
            logger.warn('[AssetJobHandlers] Hash mismatch, restoring from cache', {
              jobId: job.id,
              entityId,
              filename: cacheAsset.expectedFilename,
              expectedHash: cacheAsset.hash.substring(0, 8),
              actualHash: hashResult.hash.substring(0, 8),
            });
            await this.recycleFile(libraryFile.fullPath, entityType, entityId);
            await this.restoreFileFromCache(
              cacheAsset.cachePath,
              path.join(directoryPath, cacheAsset.expectedFilename)
            );
            filesRecycled++;
            filesRestored++;
            assetsChanged = true;
          }
          // Remove verified file from map
          libraryFiles.delete(cacheAsset.expectedFilename);
        }
      }

      // Phase 4: Remove unauthorized files (anything left in libraryFiles map)
      for (const [filename, fileInfo] of libraryFiles) {
        if (!this.isIgnoredFile(filename)) {
          logger.warn('[AssetJobHandlers] Unauthorized file detected, recycling', {
            jobId: job.id,
            entityId,
            filename,
          });
          await this.recycleFile(fileInfo.fullPath, entityType, entityId);
          filesRecycled++;
          assetsChanged = true;
        }
      }

      // Phase 5: Conditional workflow chain
      if (videoChanged) {
        // Video file changed → Re-publish (includes NFO regen)
        logger.info('[AssetJobHandlers] Video changed, queuing re-publish job', {
          jobId: job.id,
          entityId,
        });
        await this.jobQueue.addJob({
          type: 'publish',
          priority: 3,
          retry_count: 0,
          max_retries: 3,
          payload: {
            entityType,
            entityId,
            libraryPath: directoryPath,
            chainContext: { source: 'verify-video-changed' },
          },
        });
      } else if (assetsChanged) {
        // Only assets changed → Just notify players (no NFO regen needed)
        logger.info('[AssetJobHandlers] Assets changed, notifying media players', {
          jobId: job.id,
          entityId,
        });
        await this.notifyMediaPlayers(entityId, directoryPath);
      }

      logger.info('[AssetJobHandlers] Verification complete', {
        service: 'AssetJobHandlers',
        handler: 'handleVerifyMovie',
        jobId: job.id,
        entityId,
        videoChanged,
        assetsChanged,
        filesRestored,
        filesRecycled,
      });

      // Broadcast completion
      websocketBroadcaster.broadcastMoviesUpdated([entityId]);
    } catch (error) {
      logger.error('[AssetJobHandlers] Verification failed', {
        service: 'AssetJobHandlers',
        handler: 'handleVerifyMovie',
        jobId: job.id,
        entityId,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  // ============================================
  // HELPER METHODS (PRIVATE)
  // ============================================

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
    } catch (error) {
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
    } catch (error) {
      logger.error(`Error getting field locks for ${entityType} ${entityId}:`, error);
      // On error, return empty locks (allow all operations to proceed)
      return {};
    }
  }

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

    } catch (error) {
      logger.error('Failed to get automation config', {
        entityId,
        entityType,
        error: getErrorMessage(error)
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
   * Get entity details for publishing
   */
  private async getEntityForPublish(
    entityType: string,
    entityId: number
  ): Promise<{ file_path: string; title: string } | null> {
    try {
      const table = entityType === 'movie' ? 'movies' : entityType === 'series' ? 'series' : 'episodes';
      const result = await this.db.query<{ file_path: string; title: string }>(
        `SELECT file_path, title FROM ${table} WHERE id = ?`,
        [entityId]
      );

      return result.length > 0 ? result[0] : null;
    } catch (error) {
      logger.error('[AssetJobHandlers] Failed to get entity for publish', {
        service: 'AssetJobHandlers',
        entityType,
        entityId,
        error: getErrorMessage(error)
      });
      return null;
    }
  }

  /**
   * Phase 0: Verify main video file hash
   * If hash changed → Re-run FFprobe and update stream details in DB
   * This triggers NFO regeneration via publish job
   * Returns: changed status and filename for exclusion from recycling
   */
  private async verifyMainVideoFile(
    entityId: number
  ): Promise<{ changed: boolean; filename: string | null }> {
    try {
      // Get movie details including video file path and stored hash
      const movie = await this.db.get<{
        file_path: string;
        file_hash: string | null;
      }>(
        `SELECT file_path, file_hash FROM movies WHERE id = ?`,
        [entityId]
      );

      if (!movie || !movie.file_path) {
        logger.warn('[AssetJobHandlers] No video file found for movie', {
          entityId,
        });
        return { changed: false, filename: null };
      }

      // Extract just the filename from the full path
      const filename = path.basename(movie.file_path);

      // Calculate current hash
      const hashResult = await hashFile(movie.file_path);

      // Compare with stored hash
      if (hashResult.hash === movie.file_hash) {
        logger.debug('[AssetJobHandlers] Video file hash matches', {
          entityId,
          hash: hashResult.hash.substring(0, 8),
        });
        return { changed: false, filename };
      }

      // Hash mismatch → Re-extract streams with FFprobe
      logger.info('[AssetJobHandlers] Video file hash mismatch, re-extracting streams', {
        entityId,
        oldHash: movie.file_hash?.substring(0, 8),
        newHash: hashResult.hash.substring(0, 8),
      });

      const mediaInfo = await extractMediaInfo(movie.file_path);

      // Update movie file_hash
      await this.db.execute(
        `UPDATE movies SET file_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [hashResult.hash, entityId]
      );

      // Delete old streams
      await this.db.execute(`DELETE FROM video_streams WHERE movie_id = ?`, [entityId]);
      await this.db.execute(`DELETE FROM audio_streams WHERE movie_id = ?`, [entityId]);
      await this.db.execute(`DELETE FROM subtitle_streams WHERE movie_id = ? AND source_type = 'embedded'`, [
        entityId,
      ]);

      // Insert new video streams
      for (const stream of mediaInfo.videoStreams) {
        await this.db.execute(
          `INSERT INTO video_streams (
            movie_id, stream_index, codec, codec_long_name, profile,
            width, height, aspect_ratio, framerate, bit_rate,
            pix_fmt, color_range, color_space, color_transfer, color_primaries,
            language, title, is_default, is_forced
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            entityId,
            stream.streamIndex,
            stream.codecName,
            stream.codecLongName,
            stream.profile,
            stream.width,
            stream.height,
            stream.aspectRatio,
            stream.fps,
            stream.bitRate,
            stream.pixFmt,
            stream.colorRange,
            stream.colorSpace,
            stream.colorTransfer,
            stream.colorPrimaries,
            stream.language,
            stream.title,
            stream.isDefault ? 1 : 0,
            stream.isForced ? 1 : 0,
          ]
        );
      }

      // Insert new audio streams
      for (const stream of mediaInfo.audioStreams) {
        await this.db.execute(
          `INSERT INTO audio_streams (
            movie_id, stream_index, codec, codec_long_name, profile,
            channels, channel_layout, sample_rate, bit_rate,
            language, title, is_default, is_forced
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            entityId,
            stream.streamIndex,
            stream.codecName,
            stream.codecLongName,
            stream.profile,
            stream.channels,
            stream.channelLayout,
            stream.sampleRate,
            stream.bitRate,
            stream.language,
            stream.title,
            stream.isDefault ? 1 : 0,
            stream.isForced ? 1 : 0,
          ]
        );
      }

      // Insert new embedded subtitle streams
      for (const stream of mediaInfo.subtitleStreams.filter((s) => s.sourceType === 'embedded')) {
        await this.db.execute(
          `INSERT INTO subtitle_streams (
            movie_id, stream_index, codec, source_type,
            language, title, is_default, is_forced, is_sdh
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            entityId,
            stream.streamIndex,
            stream.codecName,
            stream.sourceType,
            stream.language,
            stream.title,
            stream.isDefault ? 1 : 0,
            stream.isForced ? 1 : 0,
            stream.isSdh ? 1 : 0,
          ]
        );
      }

      logger.info('[AssetJobHandlers] Video streams re-extracted successfully', {
        entityId,
        videoStreams: mediaInfo.videoStreams.length,
        audioStreams: mediaInfo.audioStreams.length,
        subtitleStreams: mediaInfo.subtitleStreams.length,
      });

      return { changed: true, filename: path.basename(movie.file_path) };
    } catch (error) {
      logger.error('[AssetJobHandlers] Failed to verify video file', {
        entityId,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Phase 1: Scan directory in-memory
   * Returns Map of filename → file info (don't store to DB)
   */
  private async scanDirectoryInMemory(
    directoryPath: string
  ): Promise<Map<string, { fullPath: string; size: number }>> {
    const fileMap = new Map<string, { fullPath: string; size: number }>();

    try {
      const entries = await fs.readdir(directoryPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile()) {
          const fullPath = path.join(directoryPath, entry.name);
          const stats = await fs.stat(fullPath);
          fileMap.set(entry.name, {
            fullPath,
            size: stats.size,
          });
        }
      }

      logger.debug('[AssetJobHandlers] Directory scanned in-memory', {
        directoryPath,
        fileCount: fileMap.size,
      });

      return fileMap;
    } catch (error) {
      logger.error('[AssetJobHandlers] Failed to scan directory', {
        directoryPath,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Phase 2: Get expected files from cache
   * Returns array of cache assets with expected filenames and hashes
   */
  private async getCacheAssets(
    entityId: number
  ): Promise<Array<{ cachePath: string; expectedFilename: string; hash: string }>> {
    const assets: Array<{ cachePath: string; expectedFilename: string; hash: string }> = [];

    try {
      // Get movie base name for Kodi naming
      const movie = await this.db.get<{ title: string; year: number | null; file_path: string }>(
        `SELECT title, year, file_path FROM movies WHERE id = ?`,
        [entityId]
      );

      if (!movie) {
        throw new Error(`Movie ${entityId} not found`);
      }

      const baseName = `${movie.title}${movie.year ? ` (${movie.year})` : ''}`;

      // NFO file (stored in cache_text_files)
      const nfo = await this.db.get<{ file_path: string; file_hash: string | null }>(
        `SELECT file_path, file_hash FROM cache_text_files WHERE entity_type = 'movie' AND entity_id = ? AND text_type = 'nfo' AND file_path IS NOT NULL`,
        [entityId]
      );
      if (nfo && nfo.file_path && nfo.file_hash) {
        assets.push({
          cachePath: nfo.file_path,
          expectedFilename: `${baseName}.nfo`,
          hash: nfo.file_hash,
        });
      }

      // Images (poster, fanart, etc.)
      const images = await this.db.query<{ file_path: string; image_type: string; file_hash: string }>(
        `SELECT file_path, image_type, file_hash FROM cache_image_files WHERE entity_type = 'movie' AND entity_id = ? AND file_path IS NOT NULL AND file_hash IS NOT NULL`,
        [entityId]
      );
      for (const image of images) {
        const kodiType = this.getKodiImageType(image.image_type);
        assets.push({
          cachePath: image.file_path,
          expectedFilename: `${baseName}-${kodiType}.jpg`,
          hash: image.file_hash,
        });
      }

      // Trailers
      const trailers = await this.db.query<{ file_path: string; file_hash: string; file_name: string }>(
        `SELECT file_path, file_hash, file_name FROM cache_video_files WHERE entity_type = 'movie' AND entity_id = ? AND video_type = 'trailer' AND file_path IS NOT NULL AND file_hash IS NOT NULL`,
        [entityId]
      );
      for (let i = 0; i < trailers.length; i++) {
        const trailer = trailers[i];
        const ext = path.extname(trailer.file_path);
        const filename = i === 0 ? `${baseName}-trailer${ext}` : `${baseName}-trailer${i + 1}${ext}`;
        assets.push({
          cachePath: trailer.file_path,
          expectedFilename: filename,
          hash: trailer.file_hash,
        });
      }

      // External subtitles (join subtitle_streams with cache_text_files)
      const subtitles = await this.db.query<{ file_path: string; language: string; file_hash: string }>(
        `SELECT ctf.file_path, ss.language, ctf.file_hash
         FROM subtitle_streams ss
         JOIN cache_text_files ctf ON ctf.id = ss.cache_asset_id
         WHERE ss.entity_type = 'movie' AND ss.entity_id = ? AND ctf.file_path IS NOT NULL AND ctf.file_hash IS NOT NULL`,
        [entityId]
      );
      for (const subtitle of subtitles) {
        const lang = subtitle.language || 'unknown';
        assets.push({
          cachePath: subtitle.file_path,
          expectedFilename: `${baseName}.${lang}.srt`,
          hash: subtitle.file_hash,
        });
      }

      logger.debug('[AssetJobHandlers] Cache assets retrieved', {
        entityId,
        assetCount: assets.length,
      });

      return assets;
    } catch (error) {
      logger.error('[AssetJobHandlers] Failed to get cache assets', {
        entityId,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Restore file from cache to library
   */
  private async restoreFileFromCache(cachePath: string, targetPath: string): Promise<void> {
    try {
      await fs.copyFile(cachePath, targetPath);
      logger.debug('[AssetJobHandlers] File restored from cache', {
        cachePath,
        targetPath,
      });
    } catch (error) {
      logger.error('[AssetJobHandlers] Failed to restore file from cache', {
        cachePath,
        targetPath,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Recycle file to recycle bin
   * Uses RecycleBinService for database-tracked recycling
   */
  private async recycleFile(filePath: string, entityType?: string, entityId?: number): Promise<void> {
    try {
      // Import RecycleBinService dynamically
      const { RecycleBinService } = await import('../recycleBinService.js');
      const recycleBin = new RecycleBinService(this.db);

      // If entity info is available, use database-tracked recycling
      if (entityType && entityId) {
        await recycleBin.recycleFile({
          entityType: entityType as 'movie' | 'episode' | 'series' | 'season',
          entityId,
          filePath,
        });
        logger.debug('[AssetJobHandlers] File recycled with tracking', {
          filePath,
          entityType,
          entityId,
        });
      } else {
        // Fallback to immediate deletion if no entity context
        await fs.unlink(filePath);
        logger.debug('[AssetJobHandlers] File deleted immediately (no entity context)', {
          filePath,
        });
      }
    } catch (error) {
      logger.error('[AssetJobHandlers] Failed to recycle file', {
        filePath,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Check if file should be ignored during verification
   * Returns true for system/hidden files that should NOT be recycled
   * Note: Main video file is excluded separately via libraryFiles.delete()
   */
  private isIgnoredFile(filename: string): boolean {
    const ignoredPatterns = [
      /^\./, // Hidden files (.DS_Store, .gitkeep, etc.)
      /^Thumbs\.db$/i, // Windows thumbnail cache
      /^desktop\.ini$/i, // Windows desktop config
    ];

    return ignoredPatterns.some((pattern) => pattern.test(filename));
  }

  /**
   * Notify media players about library changes
   */
  private async notifyMediaPlayers(entityId: number, libraryPath: string): Promise<void> {
    try {
      // Get library ID from movie
      const movie = await this.db.get<{ library_id: number }>(
        `SELECT library_id FROM movies WHERE id = ?`,
        [entityId]
      );

      if (!movie || !movie.library_id) {
        logger.warn('[AssetJobHandlers] No library ID found for movie', {
          entityId,
        });
        return;
      }

      // Queue player notification jobs (same pattern as handlePublish)
      const playerGroups = await this.db.query<{ id: number; name: string }>(
        `SELECT DISTINCT mpg.id, mpg.name
         FROM media_player_groups mpg
         JOIN media_player_libraries mpl ON mpl.group_id = mpg.id
         WHERE mpl.library_id = ?`,
        [movie.library_id]
      );

      for (const group of playerGroups) {
        // Queue notification for this player group
        await this.jobQueue.addJob({
          type: 'notify-kodi', // TODO: Support other player types
          priority: 4,
          retry_count: 0,
          max_retries: 3,
          payload: {
            groupId: group.id,
            libraryPath,
          },
        });

        logger.debug('[AssetJobHandlers] Queued player notification', {
          entityId,
          groupId: group.id,
          groupName: group.name,
        });
      }
    } catch (error) {
      logger.error('[AssetJobHandlers] Failed to notify media players', {
        entityId,
        error: getErrorMessage(error),
      });
      // Don't throw - player notification is optional
    }
  }

  /**
   * Map internal image type to Kodi naming convention
   */
  private getKodiImageType(imageType: string): string {
    const mapping: Record<string, string> = {
      poster: 'poster',
      fanart: 'fanart',
      backdrop: 'fanart',
      logo: 'logo',
      clearlogo: 'clearlogo',
      banner: 'banner',
      thumb: 'thumb',
      clearart: 'clearart',
      discart: 'disc',
    };

    return mapping[imageType] || imageType;
  }
}
