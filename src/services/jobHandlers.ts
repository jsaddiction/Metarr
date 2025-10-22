import { DatabaseConnection } from '../types/database.js';
import { Job, JobQueueService } from './jobQueueService.js';
import { AssetDiscoveryService } from './assetDiscoveryService.js';
import { ProviderAssetService } from './providerAssetService.js';
import { AssetSelectionService } from './assetSelectionService.js';
import { PublishingService } from './publishingService.js';
import { TMDBClient } from './providers/tmdb/TMDBClient.js';
import { NotificationConfigService } from './notificationConfigService.js';
import { MediaPlayerConnectionManager } from './mediaPlayerConnectionManager.js';
import { WorkflowControlService } from './workflowControlService.js';
import { websocketBroadcaster } from './websocketBroadcaster.js';
import { logger } from '../middleware/logging.js';
import { hashFile } from './hash/hashService.js';
import { extractMediaInfo } from './media/ffprobeService.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Job Handlers
 *
 * Implements handlers for each job type that wire together the various services.
 * These handlers are registered with the JobQueueService.
 */

export class JobHandlers {
  private db: DatabaseConnection;
  private dbManager: any; // DatabaseManager - using any for now to avoid circular dependency
  private jobQueue: JobQueueService;
  private cacheDir: string;
  private assetDiscovery: AssetDiscoveryService;
  private providerAssets: ProviderAssetService;
  private assetSelection: AssetSelectionService;
  private publishing: PublishingService;
  private notificationConfig: NotificationConfigService;
  private mediaPlayerManager: MediaPlayerConnectionManager;
  private workflowControl: WorkflowControlService;
  private tmdbClient: TMDBClient | undefined;

  constructor(
    db: DatabaseConnection,
    dbManager: any, // DatabaseManager
    jobQueue: JobQueueService,
    cacheDir: string,
    notificationConfig: NotificationConfigService,
    mediaPlayerManager: MediaPlayerConnectionManager,
    tmdbClient?: TMDBClient
  ) {
    this.db = db;
    this.dbManager = dbManager;
    this.jobQueue = jobQueue;
    this.cacheDir = cacheDir;
    this.assetDiscovery = new AssetDiscoveryService(db, cacheDir);
    this.providerAssets = new ProviderAssetService(db, cacheDir, tmdbClient);
    this.assetSelection = new AssetSelectionService(db);
    this.publishing = new PublishingService(db);
    this.notificationConfig = notificationConfig;
    this.mediaPlayerManager = mediaPlayerManager;
    this.workflowControl = new WorkflowControlService(db);
    this.tmdbClient = tmdbClient;
  }

  /**
   * Register all handlers with job queue
   */
  registerHandlers(jobQueue: JobQueueService): void {
    // Webhook fan-out
    jobQueue.registerHandler('webhook-received', this.handleWebhookReceived.bind(this));
    jobQueue.registerHandler('scan-movie', this.handleScanMovie.bind(this));

    // Notification handlers
    jobQueue.registerHandler('notify-kodi', this.handleNotifyKodi.bind(this));
    jobQueue.registerHandler('notify-jellyfin', this.handleNotifyJellyfin.bind(this));
    jobQueue.registerHandler('notify-plex', this.handleNotifyPlex.bind(this));
    jobQueue.registerHandler('notify-discord', this.handleNotifyDiscord.bind(this));
    jobQueue.registerHandler('notify-pushover', this.handleNotifyPushover.bind(this));
    jobQueue.registerHandler('notify-email', this.handleNotifyEmail.bind(this));

    // Asset management
    jobQueue.registerHandler('discover-assets', this.handleDiscoverAssets.bind(this));
    jobQueue.registerHandler('fetch-provider-assets', this.handleFetchProviderAssets.bind(this));
    jobQueue.registerHandler('enrich-metadata', this.handleEnrichMetadata.bind(this));
    jobQueue.registerHandler('select-assets', this.handleSelectAssets.bind(this));
    jobQueue.registerHandler('publish', this.handlePublish.bind(this));
    jobQueue.registerHandler('verify-movie', this.handleVerifyMovie.bind(this));

    // Scheduled tasks
    jobQueue.registerHandler('library-scan', this.handleLibraryScan.bind(this));
    jobQueue.registerHandler('scheduled-file-scan', this.handleScheduledFileScan.bind(this));
    jobQueue.registerHandler('scheduled-provider-update', this.handleScheduledProviderUpdate.bind(this));
    jobQueue.registerHandler('scheduled-cleanup', this.handleScheduledCleanup.bind(this));

    // Multi-phase scanning (new job queue architecture)
    jobQueue.registerHandler('directory-scan', this.handleDirectoryScan.bind(this));
    jobQueue.registerHandler('cache-asset', this.handleCacheAsset.bind(this));
  }

  /**
   * Handle webhook from Sonarr/Radarr/Lidarr (FAN-OUT COORDINATOR)
   *
   * This is the fan-out handler that receives webhooks and creates multiple jobs:
   * - scan-movie (HIGH priority)
   * - notify-kodi, notify-jellyfin, notify-discord, etc. (NORMAL priority)
   *
   * Benefits:
   * - Non-blocking webhook processing (responds instantly)
   * - Independent failure handling (one notification failure doesn't affect others)
   * - Individual retry logic per notification service
   * - Better observability (see each notification job separately)
   *
   * Payload: {
   *   source: 'radarr' | 'sonarr' | 'lidarr',
   *   eventType: 'Download' | 'Test' | 'Grab' | 'Rename',
   *   movie?: { id, title, year, path, tmdbId, imdbId },
   *   series?: { id, title, tvdbId, path },
   *   episodes?: [{ id, episodeNumber, seasonNumber, path }]
   * }
   */
  private async handleWebhookReceived(job: Job): Promise<void> {
    const { source, eventType } = job.payload;

    logger.info('[JobHandlers] Processing webhook (fan-out coordinator)', {
      service: 'JobHandlers',
      handler: 'handleWebhookReceived',
      jobId: job.id,
      source,
      eventType,
    });

    // Check if webhook processing is enabled
    const webhooksEnabled = await this.workflowControl.isEnabled('webhooks');
    if (!webhooksEnabled) {
      logger.info('[JobHandlers] Webhook processing disabled, skipping', {
        service: 'JobHandlers',
        handler: 'handleWebhookReceived',
        jobId: job.id,
        source,
        eventType
      });
      return;
    }

    // Only process Download events for now
    if (eventType !== 'Download') {
      logger.info('[JobHandlers] Ignoring non-Download event', {
        service: 'JobHandlers',
        handler: 'handleWebhookReceived',
        jobId: job.id,
        eventType,
      });
      return;
    }

    // Find library ID for path (needed for notifications)
    let libraryId: number | null = null;

    if (source === 'radarr' && job.payload.movie) {
      // Apply path mapping and find library
      const { applyManagerPathMapping } = await import('./pathMappingService.js');
      const mappedPath = await applyManagerPathMapping(
        this.db,
        'radarr',
        job.payload.movie.folderPath || job.payload.movie.path
      );

      // Find library by path
      const libraries = await this.db.query<{ id: number }>(
        `SELECT id FROM libraries WHERE ? LIKE path || '%' ORDER BY LENGTH(path) DESC LIMIT 1`,
        [mappedPath]
      );

      if (libraries.length > 0) {
        libraryId = libraries[0].id;
      }
    }

    // Fan-out: Create scan job (HIGH priority 3)
    if (source === 'radarr' && job.payload.movie) {
      const scanJobId = await this.jobQueue.addJob({
        type: 'scan-movie',
        priority: 3, // HIGH priority (user-triggered by download)
        payload: {
          movie: job.payload.movie,
          libraryId,
        },
        retry_count: 0,
        max_retries: 3,
      });

      logger.info('[JobHandlers] Created scan-movie job', {
        service: 'JobHandlers',
        handler: 'handleWebhookReceived',
        webhookJobId: job.id,
        scanJobId,
        movieTitle: job.payload.movie.title,
        libraryId,
      });
    } else if (source === 'sonarr' && job.payload.series) {
      // TODO: Implement series webhook handling
      logger.info('[JobHandlers] Series webhook handling not yet implemented', {
        service: 'JobHandlers',
        handler: 'handleWebhookReceived',
        jobId: job.id,
      });
      return;
    }

    // Fan-out: Create notification jobs (NORMAL priority 5-7)
    const enabledServices = await this.notificationConfig.getEnabledServices();

    logger.info('[JobHandlers] Creating notification jobs', {
      service: 'JobHandlers',
      handler: 'handleWebhookReceived',
      webhookJobId: job.id,
      enabledServices,
      libraryId,
    });

    // Create job for each enabled notification service
    for (const service of enabledServices) {
      const notifyJobId = await this.jobQueue.addJob({
        type: `notify-${service}` as any,
        priority: 5, // NORMAL priority
        payload: {
          webhookPayload: job.payload, // Pass entire webhook payload
          libraryId, // Pass libraryId for notifications
        },
        retry_count: 0,
        max_retries: 2, // Fewer retries for notifications
      });

      logger.info('[JobHandlers] Created notification job', {
        service: 'JobHandlers',
        handler: 'handleWebhookReceived',
        webhookJobId: job.id,
        notifyJobId,
        notificationService: service,
      });
    }

    logger.info('[JobHandlers] Webhook fan-out complete', {
      service: 'JobHandlers',
      handler: 'handleWebhookReceived',
      webhookJobId: job.id,
      jobsCreated: 1 + enabledServices.length, // scan + notifications
    });
  }

  /**
   * Handle scan-movie job (JOB CHAINING PATTERN)
   *
   * This handler:
   * 1. Inserts/updates movie in database
   * 2. Chains to discover-assets job (if scanning workflow enabled)
   *
   * Payload: {
   *   movie: { id, title, year, path, tmdbId, imdbId, folderPath },
   *   libraryId?: number
   * }
   */
  private async handleScanMovie(job: Job): Promise<void> {
    const { movie, libraryId } = job.payload;

    logger.info('[JobHandlers] Processing movie scan', {
      service: 'JobHandlers',
      handler: 'handleScanMovie',
      jobId: job.id,
      movieTitle: movie.title,
      movieYear: movie.year,
    });

    // 1. Check if movie exists in database
    const existing = await this.db.query<{ id: number }>(
      `SELECT id FROM movies WHERE radarr_id = ?`,
      [movie.id]
    );

    let movieId: number;

    if (existing.length === 0) {
      // Insert new movie
      const result = await this.db.execute(
        `INSERT INTO movies (library_id, title, year, radarr_id, tmdb_id, imdb_id, file_path, identification_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'identified')`,
        [libraryId, movie.title, movie.year, movie.id, movie.tmdbId, movie.imdbId, movie.path]
      );
      movieId = result.insertId!;
      logger.info(`[JobHandlers] Created movie ${movieId}: ${movie.title} (${movie.year})`);
    } else {
      movieId = existing[0].id;
      // Update existing movie
      await this.db.execute(
        `UPDATE movies SET title = ?, year = ?, tmdb_id = ?, imdb_id = ?, file_path = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [movie.title, movie.year, movie.tmdbId, movie.imdbId, movie.path, movieId]
      );
      logger.info(`[JobHandlers] Updated movie ${movieId}: ${movie.title} (${movie.year})`);
    }

    // 2. Check if scanning workflow is enabled
    const scanningEnabled = await this.workflowControl.isEnabled('scanning');
    if (!scanningEnabled) {
      logger.info('[JobHandlers] Scanning workflow disabled, stopping chain', {
        service: 'JobHandlers',
        handler: 'handleScanMovie',
        jobId: job.id,
        movieId
      });
      return;
    }

    // 3. Chain to discover-assets job
    const discoverJobId = await this.jobQueue.addJob({
      type: 'discover-assets',
      priority: 3, // Maintain HIGH priority from webhook
      payload: {
        entityType: 'movie',
        entityId: movieId,
        directoryPath: movie.path,
        chainContext: {
          source: 'webhook',
          tmdbId: movie.tmdbId,
          imdbId: movie.imdbId,
          libraryId
        }
      },
      retry_count: 0,
      max_retries: 3,
    });

    logger.info('[JobHandlers] Movie scan complete, chained to discover-assets', {
      service: 'JobHandlers',
      handler: 'handleScanMovie',
      jobId: job.id,
      movieId,
      movieTitle: movie.title,
      discoverJobId
    });
  }

  /**
   * Handle notify-kodi job
   *
   * Payload: {
   *   webhookPayload: { source, eventType, movie?, series?, episodes? },
   *   libraryId: number
   * }
   */
  private async handleNotifyKodi(job: Job): Promise<void> {
    // Check if Kodi notifications are enabled (defensive check)
    const enabled = await this.notificationConfig.isServiceEnabled('kodi');
    if (!enabled) {
      logger.info('[JobHandlers] Kodi notifications disabled, skipping', {
        service: 'JobHandlers',
        handler: 'handleNotifyKodi',
        jobId: job.id,
      });
      return;
    }

    logger.info('[JobHandlers] Sending Kodi notification', {
      service: 'JobHandlers',
      handler: 'handleNotifyKodi',
      jobId: job.id,
    });

    const { libraryId } = job.payload;

    if (!libraryId) {
      logger.warn('[JobHandlers] No libraryId in payload, cannot notify Kodi', {
        service: 'JobHandlers',
        handler: 'handleNotifyKodi',
        jobId: job.id,
      });
      return;
    }

    // Get library path for path mapping
    const libraries = await this.db.query<{ path: string }>(
      'SELECT path FROM libraries WHERE id = ?',
      [libraryId]
    );

    if (libraries.length === 0) {
      logger.warn('[JobHandlers] Library not found, cannot notify Kodi', {
        service: 'JobHandlers',
        handler: 'handleNotifyKodi',
        jobId: job.id,
        libraryId,
      });
      return;
    }

    const libraryPath = libraries[0].path;

    // Get all groups that manage this library
    const groups = await this.db.query<{
      id: number;
      name: string;
    }>(
      `SELECT DISTINCT mpg.id, mpg.name
       FROM media_player_groups mpg
       INNER JOIN media_player_libraries mpl ON mpg.id = mpl.group_id
       WHERE mpl.library_id = ? AND mpg.type = 'kodi'`,
      [libraryId]
    );

    if (groups.length === 0) {
      logger.debug('[JobHandlers] No Kodi groups manage this library', {
        service: 'JobHandlers',
        handler: 'handleNotifyKodi',
        jobId: job.id,
        libraryId,
      });
      return;
    }

    // Trigger scan for each Kodi group
    for (const group of groups) {
      try {
        await this.triggerKodiGroupScan(group.id, libraryPath);
      } catch (error: any) {
        logger.error('[JobHandlers] Failed to trigger scan for Kodi group', {
          service: 'JobHandlers',
          handler: 'handleNotifyKodi',
          groupId: group.id,
          groupName: group.name,
          error: error.message,
        });
        // Continue with other groups even if one fails
      }
    }

    logger.info('[JobHandlers] Kodi notification sent', {
      service: 'JobHandlers',
      handler: 'handleNotifyKodi',
      jobId: job.id,
      groupsNotified: groups.length,
    });
  }

  /**
   * Trigger scan on one instance in a Kodi group (with fallback)
   */
  private async triggerKodiGroupScan(groupId: number, libraryPath: string): Promise<void> {
    // Get all enabled Kodi players in this group
    const players = await this.db.query<{
      id: number;
      name: string;
    }>(
      `SELECT id, name
       FROM media_players
       WHERE group_id = ? AND enabled = 1 AND type = 'kodi'
       ORDER BY id ASC`,
      [groupId]
    );

    if (players.length === 0) {
      logger.warn('[JobHandlers] No enabled Kodi players in group', {
        service: 'JobHandlers',
        groupId,
      });
      return;
    }

    // Apply group-level path mapping
    let mappedPath: string;
    try {
      const { applyGroupPathMapping } = await import('./pathMappingService.js');
      mappedPath = await applyGroupPathMapping(this.db, groupId, libraryPath);
    } catch (error: any) {
      logger.warn('[JobHandlers] Group path mapping failed, using original path', {
        service: 'JobHandlers',
        groupId,
        libraryPath,
        error: error.message,
      });
      mappedPath = libraryPath;
    }

    // Try each player until one succeeds (fallback)
    for (const player of players) {
      try {
        const httpClient = this.mediaPlayerManager.getHttpClient(player.id);
        if (!httpClient) {
          logger.warn('[JobHandlers] HTTP client not available, trying next player', {
            service: 'JobHandlers',
            playerId: player.id,
          });
          continue;
        }

        // Trigger scan with mapped path
        await httpClient.scanVideoLibrary({ directory: mappedPath });

        logger.info('[JobHandlers] Triggered library scan on Kodi group', {
          service: 'JobHandlers',
          groupId,
          playerId: player.id,
          playerName: player.name,
          path: mappedPath,
        });

        return; // Success - exit after first successful scan
      } catch (error: any) {
        logger.warn('[JobHandlers] Failed to scan on Kodi player, trying next', {
          service: 'JobHandlers',
          groupId,
          playerId: player.id,
          playerName: player.name,
          error: error.message,
        });
        // Continue to next player (fallback)
      }
    }

    // All players failed
    logger.error('[JobHandlers] Failed to trigger scan on any Kodi player in group', {
      service: 'JobHandlers',
      groupId,
    });
  }

  /**
   * Handle notify-jellyfin job
   */
  private async handleNotifyJellyfin(job: Job): Promise<void> {
    const enabled = await this.notificationConfig.isServiceEnabled('jellyfin');
    if (!enabled) {
      logger.info('[JobHandlers] Jellyfin notifications disabled, skipping', {
        service: 'JobHandlers',
        handler: 'handleNotifyJellyfin',
        jobId: job.id,
      });
      return;
    }

    logger.info('[JobHandlers] Jellyfin notification (not yet implemented)', {
      service: 'JobHandlers',
      handler: 'handleNotifyJellyfin',
      jobId: job.id,
    });

    // TODO: Implement Jellyfin notification
  }

  /**
   * Handle notify-plex job
   */
  private async handleNotifyPlex(job: Job): Promise<void> {
    const enabled = await this.notificationConfig.isServiceEnabled('plex');
    if (!enabled) {
      logger.info('[JobHandlers] Plex notifications disabled, skipping', {
        service: 'JobHandlers',
        handler: 'handleNotifyPlex',
        jobId: job.id,
      });
      return;
    }

    logger.info('[JobHandlers] Plex notification (not yet implemented)', {
      service: 'JobHandlers',
      handler: 'handleNotifyPlex',
      jobId: job.id,
    });

    // TODO: Implement Plex notification
  }

  /**
   * Handle notify-discord job
   */
  private async handleNotifyDiscord(job: Job): Promise<void> {
    const enabled = await this.notificationConfig.isServiceEnabled('discord');
    if (!enabled) {
      logger.info('[JobHandlers] Discord notifications disabled, skipping', {
        service: 'JobHandlers',
        handler: 'handleNotifyDiscord',
        jobId: job.id,
      });
      return;
    }

    logger.info('[JobHandlers] Discord notification (not yet implemented)', {
      service: 'JobHandlers',
      handler: 'handleNotifyDiscord',
      jobId: job.id,
    });

    // TODO: Implement Discord webhook notification
  }

  /**
   * Handle notify-pushover job
   */
  private async handleNotifyPushover(job: Job): Promise<void> {
    const enabled = await this.notificationConfig.isServiceEnabled('pushover');
    if (!enabled) {
      logger.info('[JobHandlers] Pushover notifications disabled, skipping', {
        service: 'JobHandlers',
        handler: 'handleNotifyPushover',
        jobId: job.id,
      });
      return;
    }

    logger.info('[JobHandlers] Pushover notification (not yet implemented)', {
      service: 'JobHandlers',
      handler: 'handleNotifyPushover',
      jobId: job.id,
    });

    // TODO: Implement Pushover notification
  }

  /**
   * Handle notify-email job
   */
  private async handleNotifyEmail(job: Job): Promise<void> {
    const enabled = await this.notificationConfig.isServiceEnabled('email');
    if (!enabled) {
      logger.info('[JobHandlers] Email notifications disabled, skipping', {
        service: 'JobHandlers',
        handler: 'handleNotifyEmail',
        jobId: job.id,
      });
      return;
    }

    logger.info('[JobHandlers] Email notification (not yet implemented)', {
      service: 'JobHandlers',
      handler: 'handleNotifyEmail',
      jobId: job.id,
    });

    // TODO: Implement email notification
  }

  /**
   * Process series webhook
   * TODO: Implement series/episode processing
   * Currently unused - will be implemented when series support is added
   */
  // @ts-expect-error - Intentionally unused until series support is implemented
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async _processSeriesWebhook(series: any, episodes: any[]): Promise<void> {
    // Similar to movie webhook but for series/episodes
    logger.info(`Processing series webhook: ${series.title}`, { episodes: episodes?.length || 0 });
    // TODO: Implement series/episode processing
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
    const { entityType, entityId, directoryPath, chainContext } = job.payload;

    logger.info('[JobHandlers] Discovering assets', {
      service: 'JobHandlers',
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

    logger.info('[JobHandlers] Asset discovery complete', {
      service: 'JobHandlers',
      handler: 'handleDiscoverAssets',
      jobId: job.id,
      ...result
    });

    // 2. Check if identification workflow is enabled
    const identificationEnabled = await this.workflowControl.isEnabled('identification');
    if (!identificationEnabled) {
      logger.info('[JobHandlers] Identification workflow disabled, stopping chain', {
        service: 'JobHandlers',
        handler: 'handleDiscoverAssets',
        jobId: job.id,
        entityType,
        entityId
      });
      return;
    }

    // 3. Check if we have provider ID to fetch from
    if (!chainContext?.tmdbId) {
      logger.info('[JobHandlers] No TMDB ID available, cannot fetch provider assets', {
        service: 'JobHandlers',
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

    logger.info('[JobHandlers] Asset discovery complete, chained to fetch-provider-assets', {
      service: 'JobHandlers',
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
    const { entityType, entityId, provider, providerId, chainContext } = job.payload;

    logger.info('[JobHandlers] Fetching provider assets', {
      service: 'JobHandlers',
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
      logger.info('[JobHandlers] Skipping asset fetch for unmonitored entity', {
        service: 'JobHandlers',
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
      const { ProviderOrchestrator } = await import('./providers/ProviderOrchestrator.js');
      const { ProviderRegistry } = await import('./providers/ProviderRegistry.js');
      const { ProviderConfigService } = await import('./providerConfigService.js');

      const registry = ProviderRegistry.getInstance();
      const configService = new ProviderConfigService(this.db);
      const orchestrator = new ProviderOrchestrator(registry, configService);

      // Fetch metadata from all providers
      const metadataResult = await orchestrator.fetchMetadata(
        entityType,
        { tmdb: providerId },
        { strategy: 'aggregate_all', fillGaps: true }
      );

      logger.info('[JobHandlers] Fetched metadata from all providers', {
        service: 'JobHandlers',
        handler: 'handleFetchProviderAssets',
        jobId: job.id,
        providersUsed: metadataResult.providerId,
        completeness: metadataResult.completeness,
      });

      result = { fetched: true }; // Simplified result for now
    } else if (provider === 'tmdb' && entityType === 'movie') {
      result = await this.providerAssets.fetchMovieAssets(entityId, providerId);
      logger.info('[JobHandlers] Fetched assets from TMDB', {
        service: 'JobHandlers',
        handler: 'handleFetchProviderAssets',
        jobId: job.id,
        fetched: result.fetched
      });
    } else {
      logger.warn('[JobHandlers] Unsupported provider/entityType combination', {
        service: 'JobHandlers',
        handler: 'handleFetchProviderAssets',
        jobId: job.id,
        provider,
        entityType
      });
      return;
    }

    // 2. Check if enrichment workflow is enabled
    const enrichmentEnabled = await this.workflowControl.isEnabled('enrichment');
    if (!enrichmentEnabled) {
      logger.info('[JobHandlers] Enrichment workflow disabled, stopping chain', {
        service: 'JobHandlers',
        handler: 'handleFetchProviderAssets',
        jobId: job.id,
        entityType,
        entityId
      });
      return;
    }

    // 3. Chain to select-assets job
    const selectJobId = await this.jobQueue.addJob({
      type: 'select-assets',
      priority: 5, // NORMAL priority
      payload: {
        entityType,
        entityId,
        chainContext
      },
      retry_count: 0,
      max_retries: 3,
    });

    logger.info('[JobHandlers] Provider assets fetched, chained to select-assets', {
      service: 'JobHandlers',
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
    const { entityType, entityId, mode, assetTypes, chainContext } = job.payload;

    logger.info('[JobHandlers] Auto-selecting assets', {
      service: 'JobHandlers',
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
      logger.info('[JobHandlers] Manual mode, skipping auto-selection', {
        service: 'JobHandlers',
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
        mode: selectionMode
      };

      let result;
      if (selectionMode === 'yolo') {
        result = await this.assetSelection.selectAssetYOLO(selectConfig);
      } else {
        result = await this.assetSelection.selectAssetHybrid(selectConfig);
      }

      if (result.selected) {
        selectedCount++;
        logger.info('[JobHandlers] Selected asset', {
          service: 'JobHandlers',
          handler: 'handleSelectAssets',
          jobId: job.id,
          assetType,
          candidateId: result.candidateId
        });
      }
    }

    logger.info('[JobHandlers] Asset selection complete', {
      service: 'JobHandlers',
      handler: 'handleSelectAssets',
      jobId: job.id,
      selectedCount,
      totalTypes: types.length
    });

    // 2. Check if publishing workflow is enabled
    const publishingEnabled = await this.workflowControl.isEnabled('publishing');
    if (!publishingEnabled) {
      logger.info('[JobHandlers] Publishing workflow disabled, stopping chain', {
        service: 'JobHandlers',
        handler: 'handleSelectAssets',
        jobId: job.id,
        entityType,
        entityId
      });
      return;
    }

    // 3. Only publish in YOLO mode (hybrid requires user approval)
    if (selectionMode !== 'yolo') {
      logger.info('[JobHandlers] Not in YOLO mode, skipping publish', {
        service: 'JobHandlers',
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
      logger.error('[JobHandlers] Entity not found for publishing', {
        service: 'JobHandlers',
        handler: 'handleSelectAssets',
        jobId: job.id,
        entityType,
        entityId
      });
      return;
    }

    // 5. Chain to publish job
    const publishJobId = await this.jobQueue.addJob({
      type: 'publish',
      priority: 5, // NORMAL priority
      payload: {
        entityType,
        entityId,
        libraryPath: entity.file_path,
        mediaFilename: entity.title,
        chainContext
      },
      retry_count: 0,
      max_retries: 3,
    });

    logger.info('[JobHandlers] Assets selected, chained to publish', {
      service: 'JobHandlers',
      handler: 'handleSelectAssets',
      jobId: job.id,
      entityType,
      entityId,
      publishJobId
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
    const { entityType, entityId, directoryPath } = job.payload;

    logger.info('[JobHandlers] Starting verification workflow', {
      service: 'JobHandlers',
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
        logger.info('[JobHandlers] Video file changed, FFprobe re-extraction completed', {
          jobId: job.id,
          entityId,
        });
      }

      // Phase 1: Scan directory in-memory (don't store to DB)
      const libraryFiles = await this.scanDirectoryInMemory(directoryPath);

      // Remove main video file from the map so it won't be considered for recycling
      if (mainVideoFilename) {
        libraryFiles.delete(mainVideoFilename);
        logger.debug('[JobHandlers] Main video file excluded from verification', {
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
          logger.warn('[JobHandlers] Missing file, restoring from cache', {
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
            logger.warn('[JobHandlers] Hash mismatch, restoring from cache', {
              jobId: job.id,
              entityId,
              filename: cacheAsset.expectedFilename,
              expectedHash: cacheAsset.hash.substring(0, 8),
              actualHash: hashResult.hash.substring(0, 8),
            });
            await this.recycleFile(libraryFile.fullPath);
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
          logger.warn('[JobHandlers] Unauthorized file detected, recycling', {
            jobId: job.id,
            entityId,
            filename,
          });
          await this.recycleFile(fileInfo.fullPath);
          filesRecycled++;
          assetsChanged = true;
        }
      }

      // Phase 5: Conditional workflow chain
      if (videoChanged) {
        // Video file changed → Re-publish (includes NFO regen)
        logger.info('[JobHandlers] Video changed, queuing re-publish job', {
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
        logger.info('[JobHandlers] Assets changed, notifying media players', {
          jobId: job.id,
          entityId,
        });
        await this.notifyMediaPlayers(entityId, directoryPath);
      }

      logger.info('[JobHandlers] Verification complete', {
        service: 'JobHandlers',
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
    } catch (error: any) {
      logger.error('[JobHandlers] Verification failed', {
        service: 'JobHandlers',
        handler: 'handleVerifyMovie',
        jobId: job.id,
        entityId,
        error: error.message,
      });
      throw error;
    }
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
    const { entityType, entityId, libraryPath, mediaFilename, chainContext } = job.payload;

    logger.info('[JobHandlers] Publishing to library', {
      service: 'JobHandlers',
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
      logger.error('[JobHandlers] Publishing failed', {
        service: 'JobHandlers',
        handler: 'handlePublish',
        jobId: job.id,
        entityType,
        entityId,
        errors: result.errors
      });
      throw new Error(`Publishing failed: ${result.errors.join(', ')}`);
    }

    logger.info('[JobHandlers] Publishing complete (END OF CHAIN)', {
      service: 'JobHandlers',
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

        logger.info('[JobHandlers] Queueing player notification jobs (STUBBED)', {
          service: 'JobHandlers',
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

          logger.debug('[JobHandlers] Queued player notification', {
            service: 'JobHandlers',
            handler: 'handlePublish',
            jobId: job.id,
            groupId: group.id,
            groupType: group.type,
          });
        }
      } catch (error: any) {
        logger.warn('[JobHandlers] Failed to queue player notifications', {
          service: 'JobHandlers',
          handler: 'handlePublish',
          jobId: job.id,
          libraryId,
          error: error.message,
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

            // Broadcast to frontend that a new movie was added
            websocketBroadcaster.broadcastMoviesAdded([movieId]);
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
    } catch (error: any) {
      logger.error('[JobHandlers] Failed to get entity for publish', {
        service: 'JobHandlers',
        entityType,
        entityId,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Auto-select assets based on mode (LEGACY - kept for backward compatibility)
   * New code should use handleSelectAssets job instead
   */
  // @ts-expect-error - Intentionally unused, kept for reference
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  /**
   * Handle scheduled-file-scan job
   * Runs on schedule to scan all enabled libraries for new content
   */
  private async handleScheduledFileScan(job: Job): Promise<void> {
    logger.info('[JobHandlers] Starting scheduled file scan', {
      service: 'JobHandlers',
      handler: 'handleScheduledFileScan',
      jobId: job.id,
    });

    // Get all enabled libraries
    const libraries = await this.db.query<{
      id: number;
      name: string;
      path: string;
      type: string;
    }>('SELECT id, name, path, type FROM libraries WHERE enabled = 1');

    logger.info('[JobHandlers] Found enabled libraries', {
      service: 'JobHandlers',
      handler: 'handleScheduledFileScan',
      jobId: job.id,
      count: libraries.length,
    });

    // Create library-scan job for each enabled library
    for (const library of libraries) {
      await this.jobQueue.addJob({
        type: 'library-scan',
        priority: 8, // LOW priority (scheduled task)
        payload: {
          libraryId: library.id,
          libraryPath: library.path,
          libraryType: library.type,
        },
        retry_count: 0,
        max_retries: 2,
      });

      logger.info('[JobHandlers] Created library-scan job', {
        service: 'JobHandlers',
        handler: 'handleScheduledFileScan',
        libraryId: library.id,
        libraryName: library.name,
      });
    }

    logger.info('[JobHandlers] Scheduled file scan complete', {
      service: 'JobHandlers',
      handler: 'handleScheduledFileScan',
      jobId: job.id,
      librariesScheduled: libraries.length,
    });
  }

  /**
   * Handle scheduled-provider-update job
   * Runs on schedule to fetch updated metadata from providers
   */
  private async handleScheduledProviderUpdate(job: Job): Promise<void> {
    logger.info('[JobHandlers] Scheduled provider update (not yet implemented)', {
      service: 'JobHandlers',
      handler: 'handleScheduledProviderUpdate',
      jobId: job.id,
    });

    // TODO: Implement scheduled provider updates
    // - Find entities that haven't been updated in X days
    // - Re-fetch metadata from TMDB/TVDB
    // - Respect field locks (don't overwrite user changes)
  }

  /**
   * Handle scheduled-cleanup job
   * Runs on schedule to cleanup old history and temporary files
   */
  private async handleScheduledCleanup(job: Job): Promise<void> {
    logger.info('[JobHandlers] Starting scheduled cleanup', {
      service: 'JobHandlers',
      handler: 'handleScheduledCleanup',
      jobId: job.id,
    });

    // Cleanup job history
    const deletedJobs = await this.jobQueue.cleanupHistory({
      completed: 30, // Keep completed jobs for 30 days
      failed: 90, // Keep failed jobs for 90 days (debugging)
    });

    logger.info('[JobHandlers] Job history cleanup complete', {
      service: 'JobHandlers',
      handler: 'handleScheduledCleanup',
      jobId: job.id,
      deletedJobs,
    });

    // TODO: Add more cleanup tasks
    // - Remove orphaned cache files (no database reference)
    // - Remove temporary download files older than X days
    // - Cleanup old log files
  }

  /**
   * Handle directory-scan job (NEW multi-phase architecture)
   *
   * Scans a single directory and extracts all metadata/assets.
   * Does NOT call provider APIs - that's queued separately.
   *
   * Payload: {
   *   scanJobId: number,      // Parent scan job for progress tracking
   *   libraryId: number,
   *   directoryPath: string,
   *   libraryType: 'movie' | 'tv' | 'music',
   *   options?: ScanOptions   // Scan configuration flags
   * }
   */
  private async handleDirectoryScan(job: Job): Promise<void> {
    const { scanJobId, libraryId, directoryPath } = job.payload;
    // const { options } = job.payload; // TODO: Use options when implementing skip flags

    logger.info('[JobHandlers] Starting directory scan', {
      service: 'JobHandlers',
      handler: 'handleDirectoryScan',
      jobId: job.id,
      scanJobId,
      directoryPath,
    });

    try {
      // Import unified scan service dynamically
      const { scanMovieDirectory } = await import('./scan/unifiedScanService.js');

      // Update current operation
      await this.db.execute(`
        UPDATE scan_jobs
        SET current_operation = ?
        WHERE id = ?
      `, [`Scanning ${directoryPath}`, scanJobId]);

      // Scan the directory (NO provider API calls)
      const scanResult = await scanMovieDirectory(this.dbManager, libraryId, directoryPath, {
        trigger: 'scheduled_scan',
      });

      // Update scan_jobs progress
      const isNew = scanResult.isNewMovie ? 1 : 0;
      const isUpdated = scanResult.directoryChanged ? 1 : 0;

      await this.db.execute(`
        UPDATE scan_jobs
        SET directories_scanned = directories_scanned + 1,
            movies_found = movies_found + 1,
            movies_new = movies_new + ?,
            movies_updated = movies_updated + ?,
            assets_queued = assets_queued + ?,
            current_operation = ?
        WHERE id = ?
      `, [
        isNew,
        isUpdated,
        scanResult.assetsFound.images + scanResult.assetsFound.trailers + scanResult.assetsFound.subtitles,
        `Scanned ${directoryPath}`,
        scanJobId
      ]);

      logger.info('[JobHandlers] Directory scan complete', {
        service: 'JobHandlers',
        handler: 'handleDirectoryScan',
        jobId: job.id,
        movieId: scanResult.movieId,
        isNew: scanResult.isNewMovie,
        assetsFound: scanResult.assetsFound,
      });

      // Broadcast to frontend when new movie is added for real-time UI updates
      if (scanResult.isNewMovie && scanResult.movieId) {
        websocketBroadcaster.broadcastMoviesAdded([scanResult.movieId]);
      }

      // TODO: Queue cache-asset jobs for discovered assets
      // This will be implemented when we add asset caching logic

    } catch (error: any) {
      logger.error('[JobHandlers] Directory scan failed', {
        service: 'JobHandlers',
        handler: 'handleDirectoryScan',
        jobId: job.id,
        directoryPath,
        error: error.message,
        stack: error.stack,
      });

      // Update error count in scan_jobs
      await this.db.execute(`
        UPDATE scan_jobs
        SET errors_count = errors_count + 1,
            last_error = ?
        WHERE id = ?
      `, [error.message, scanJobId]);

      // Don't throw - let other directory scans continue
    }
  }

  /**
   * Handle cache-asset job (NEW multi-phase architecture)
   *
   * Copies an asset from library to cache directory.
   *
   * Payload: {
   *   scanJobId: number,      // Parent scan job for progress tracking
   *   entityType: 'movie' | 'series' | 'episode',
   *   entityId: number,
   *   assetType: 'poster' | 'fanart' | 'trailer' | 'subtitle',
   *   sourcePath: string,     // Path to asset in library
   *   language?: string       // For subtitles
   * }
   */
  private async handleCacheAsset(job: Job): Promise<void> {
    const { scanJobId, entityType, entityId, assetType, sourcePath, language } = job.payload;

    logger.info('[JobHandlers] Starting asset caching', {
      service: 'JobHandlers',
      handler: 'handleCacheAsset',
      jobId: job.id,
      scanJobId,
      assetType,
      sourcePath,
    });

    try {
      // Import required modules
      const fs = await import('fs/promises');
      const path = await import('path');
      const crypto = await import('crypto');

      // Read source file
      const fileBuffer = await fs.readFile(sourcePath);

      // Calculate SHA256 hash
      const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      const ext = path.extname(sourcePath);

      // Determine cache directory structure
      // data/cache/{entityType}/{entityId}/{assetType}_{hash}.ext
      const cacheDir = path.join('data', 'cache', entityType, String(entityId));
      await fs.mkdir(cacheDir, { recursive: true });

      // Build cache filename
      let cacheFilename = `${assetType}_${hash}${ext}`;
      if (language && assetType === 'subtitle') {
        cacheFilename = `subtitle_${language}_${hash}${ext}`;
      }

      const cachePath = path.join(cacheDir, cacheFilename);

      // Copy file to cache (only if not already exists)
      try {
        await fs.access(cachePath);
        logger.debug('[JobHandlers] Asset already cached', {
          service: 'JobHandlers',
          handler: 'handleCacheAsset',
          cachePath,
        });
      } catch {
        // File doesn't exist, copy it
        await fs.copyFile(sourcePath, cachePath);
        logger.info('[JobHandlers] Asset copied to cache', {
          service: 'JobHandlers',
          handler: 'handleCacheAsset',
          sourcePath,
          cachePath,
          hash,
        });
      }

      // Store cache path in database based on asset type
      if (assetType === 'poster' || assetType === 'fanart') {
        // Check if image already exists in database
        const existing = await this.db.query<{ id: number }>(
          `SELECT id FROM images WHERE entity_type = ? AND entity_id = ? AND asset_type = ? AND cache_path = ?`,
          [entityType, entityId, assetType, cachePath]
        );

        if (existing.length === 0) {
          await this.db.execute(
            `INSERT INTO images (entity_type, entity_id, asset_type, cache_path, library_path, source, hash, discovered_at)
             VALUES (?, ?, ?, ?, ?, 'local', ?, CURRENT_TIMESTAMP)`,
            [entityType, entityId, assetType, cachePath, sourcePath, hash]
          );
        }
      } else if (assetType === 'trailer') {
        const existing = await this.db.query<{ id: number }>(
          `SELECT id FROM trailers WHERE entity_type = ? AND entity_id = ? AND cache_path = ?`,
          [entityType, entityId, cachePath]
        );

        if (existing.length === 0) {
          await this.db.execute(
            `INSERT INTO trailers (entity_type, entity_id, cache_path, local_path, source, hash, discovered_at)
             VALUES (?, ?, ?, ?, 'local', ?, CURRENT_TIMESTAMP)`,
            [entityType, entityId, cachePath, sourcePath, hash]
          );
        }
      } else if (assetType === 'subtitle') {
        const existing = await this.db.query<{ id: number }>(
          `SELECT id FROM subtitle_streams WHERE movie_id = ? AND cache_path = ?`,
          [entityId, cachePath]
        );

        if (existing.length === 0) {
          await this.db.execute(
            `INSERT INTO subtitle_streams (movie_id, cache_path, file_path, language, hash)
             VALUES (?, ?, ?, ?, ?)`,
            [entityId, cachePath, sourcePath, language || 'unknown', hash]
          );
        }
      }

      // Update scan_jobs progress
      if (scanJobId) {
        await this.db.execute(`
          UPDATE scan_jobs
          SET assets_cached = assets_cached + 1
          WHERE id = ?
        `, [scanJobId]);
      }

      logger.info('[JobHandlers] Asset caching complete', {
        service: 'JobHandlers',
        handler: 'handleCacheAsset',
        jobId: job.id,
        cachePath,
      });

    } catch (error: any) {
      logger.error('[JobHandlers] Asset caching failed', {
        service: 'JobHandlers',
        handler: 'handleCacheAsset',
        jobId: job.id,
        assetType,
        sourcePath,
        error: error.message,
        stack: error.stack,
      });

      // Update error count
      if (scanJobId) {
        await this.db.execute(`
          UPDATE scan_jobs
          SET errors_count = errors_count + 1,
              last_error = ?
          WHERE id = ?
        `, [error.message, scanJobId]);
      }

      // Don't throw - let other asset caching jobs continue
    }
  }

  // ============================================================================
  // VERIFICATION WORKFLOW HELPERS
  // ============================================================================

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
        logger.warn('[JobHandlers] No video file found for movie', {
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
        logger.debug('[JobHandlers] Video file hash matches', {
          entityId,
          hash: hashResult.hash.substring(0, 8),
        });
        return { changed: false, filename };
      }

      // Hash mismatch → Re-extract streams with FFprobe
      logger.info('[JobHandlers] Video file hash mismatch, re-extracting streams', {
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

      logger.info('[JobHandlers] Video streams re-extracted successfully', {
        entityId,
        videoStreams: mediaInfo.videoStreams.length,
        audioStreams: mediaInfo.audioStreams.length,
        subtitleStreams: mediaInfo.subtitleStreams.length,
      });

      return { changed: true, filename: path.basename(movie.file_path) };
    } catch (error: any) {
      logger.error('[JobHandlers] Failed to verify video file', {
        entityId,
        error: error.message,
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

      logger.debug('[JobHandlers] Directory scanned in-memory', {
        directoryPath,
        fileCount: fileMap.size,
      });

      return fileMap;
    } catch (error: any) {
      logger.error('[JobHandlers] Failed to scan directory', {
        directoryPath,
        error: error.message,
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

      logger.debug('[JobHandlers] Cache assets retrieved', {
        entityId,
        assetCount: assets.length,
      });

      return assets;
    } catch (error: any) {
      logger.error('[JobHandlers] Failed to get cache assets', {
        entityId,
        error: error.message,
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
      logger.debug('[JobHandlers] File restored from cache', {
        cachePath,
        targetPath,
      });
    } catch (error: any) {
      logger.error('[JobHandlers] Failed to restore file from cache', {
        cachePath,
        targetPath,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Recycle file to trash directory
   */
  private async recycleFile(filePath: string): Promise<void> {
    try {
      // TODO: Move to actual trash directory (for now, just delete)
      // In production, this should move to data/trash/{timestamp}/{filename}
      await fs.unlink(filePath);
      logger.debug('[JobHandlers] File recycled', {
        filePath,
      });
    } catch (error: any) {
      logger.error('[JobHandlers] Failed to recycle file', {
        filePath,
        error: error.message,
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
        logger.warn('[JobHandlers] No library ID found for movie', {
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

        logger.debug('[JobHandlers] Queued player notification', {
          entityId,
          groupId: group.id,
          groupName: group.name,
        });
      }
    } catch (error: any) {
      logger.error('[JobHandlers] Failed to notify media players', {
        entityId,
        error: error.message,
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
