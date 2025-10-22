import { Router } from 'express';
import { MediaPlayerController } from '../controllers/mediaPlayerController.js';
import { LibraryController } from '../controllers/libraryController.js';
import { MovieController } from '../controllers/movieController.js';
import { IgnorePatternController } from '../controllers/ignorePatternController.js';
import { ImageController } from '../controllers/imageController.js';
import { AssetController } from '../controllers/assetController.js';
import { JobController } from '../controllers/jobController.js';
import { AutomationConfigController } from '../controllers/automationConfigController.js';
import { DatabaseManager } from '../database/DatabaseManager.js';
import { MediaPlayerConnectionManager } from '../services/mediaPlayerConnectionManager.js';
import { MediaPlayerService } from '../services/mediaPlayerService.js';
import { LibraryService } from '../services/libraryService.js';
import { LibraryScanService } from '../services/libraryScanService.js';
import { MovieService } from '../services/movieService.js';
import { IgnorePatternService } from '../services/ignorePatternService.js';
import { ImageService } from '../services/imageService.js';
import { JobQueueService } from '../services/jobQueue/JobQueueService.js';
import { AutomationConfigService } from '../services/automationConfigService.js';
import { AssetSelectionService } from '../services/assetSelectionService.js';
import { AssetCandidateService } from '../services/assetCandidateService.js';
import { ActorController } from '../controllers/actorController.js';
// import { tmdbService } from '../services/providers/TMDBService.js'; // TODO: Re-enable if needed
import { ProviderConfigService } from '../services/providerConfigService.js';
import { ProviderConfigController } from '../controllers/providerConfigController.js';
import { PriorityConfigService } from '../services/priorityConfigService.js';
import { PriorityConfigController } from '../controllers/priorityConfigController.js';
import { AssetConfigService } from '../services/assetConfigService.js';
import { AssetConfigController } from '../controllers/assetConfigController.js';
import { WebhookConfigController } from '../controllers/webhookConfigController.js';
import { WebhookEventsController } from '../controllers/webhookEventsController.js';
import { ActivityLogController } from '../controllers/activityLogController.js';
import { SettingsController } from '../controllers/settingsController.js';
import { WorkflowControlService } from '../services/workflowControlService.js';
import { ProviderRegistry } from '../services/providers/ProviderRegistry.js';
import { FetchOrchestrator } from '../services/providers/FetchOrchestrator.js';
import { ProviderOrchestrator } from '../services/providers/ProviderOrchestrator.js';
import { SchedulerController } from '../controllers/schedulerController.js';
import { FileScannerScheduler } from '../services/schedulers/FileScannerScheduler.js';
import { ProviderUpdaterScheduler } from '../services/schedulers/ProviderUpdaterScheduler.js';
// Import validation middleware
import { validateRequest, commonSchemas } from '../middleware/validation.js';
import { createLibrarySchema, updateLibrarySchema } from '../validation/librarySchemas.js';
import { updateSchedulerConfigSchema } from '../validation/schedulerSchemas.js';
import { logger } from '../middleware/logging.js';
// Import provider index to trigger provider registrations
import '../services/providers/index.js';

// Initialize router factory function
export const createApiRouter = (
  dbManager: DatabaseManager,
  connectionManager: MediaPlayerConnectionManager,
  jobQueueService: JobQueueService,
  fileScannerScheduler?: FileScannerScheduler,
  providerUpdaterScheduler?: ProviderUpdaterScheduler
): Router => {
  const router = Router();

  // Initialize media player services and controller
  const mediaPlayerService = new MediaPlayerService(dbManager, connectionManager);
  const mediaPlayerController = new MediaPlayerController(mediaPlayerService, connectionManager);

  // Initialize library services and controller
  const libraryService = new LibraryService(dbManager);
  const libraryScanService = new LibraryScanService(dbManager, jobQueueService);
  const libraryController = new LibraryController(libraryService, libraryScanService);

  // Get database connection for services that need it
  const db = dbManager.getConnection();

  // Initialize provider config service (needed by FetchOrchestrator)
  const providerConfigService = new ProviderConfigService(db);
  const providerConfigController = new ProviderConfigController(providerConfigService);

  // Initialize provider registry and fetch orchestrator
  const providerRegistry = ProviderRegistry.getInstance();
  const fetchOrchestrator = new FetchOrchestrator(providerRegistry, providerConfigService);
  const providerOrchestrator = new ProviderOrchestrator(providerRegistry, providerConfigService);

  // Initialize asset selection service
  const assetSelectionService = new AssetSelectionService(db);

  // Initialize asset candidate service
  const assetCandidateService = new AssetCandidateService(dbManager);

  // Initialize movie service and controller
  const movieService = new MovieService(dbManager, jobQueueService);
  const movieController = new MovieController(
    movieService,
    libraryScanService,
    fetchOrchestrator,
    assetSelectionService,
    assetCandidateService,
    providerOrchestrator
  );

  // Initialize ignore pattern service and controller
  const ignorePatternService = new IgnorePatternService(dbManager);
  const ignorePatternController = new IgnorePatternController(ignorePatternService);

  // Initialize image service and controller
  const imageService = new ImageService(dbManager);
  const imageController = new ImageController(imageService);
  // Initialize image service
  imageService.initialize().catch(err => logger.error('Failed to initialize image service:', err));

  // Note: Job queue is now initialized in app.ts and passed through connectionManager
  // This is legacy code that should be removed when routes are refactored
  // TODO: Remove this after refactoring routes to not need jobQueue locally

  // Initialize automation config service and controller
  const automationConfigService = new AutomationConfigService(db);
  const automationConfigController = new AutomationConfigController(automationConfigService);

  // Initialize priority config service and controller
  const priorityConfigService = new PriorityConfigService(db);
  const priorityConfigController = new PriorityConfigController(priorityConfigService);

  // Initialize asset config service and controller
  const assetConfigService = new AssetConfigService(dbManager);
  const assetConfigController = new AssetConfigController(assetConfigService);

  // Initialize webhook config controller
  const webhookConfigController = new WebhookConfigController(dbManager);

  // Initialize webhook events controller
  const webhookEventsController = new WebhookEventsController(dbManager);

  // Initialize activity log controller
  const activityLogController = new ActivityLogController(dbManager);

  // Initialize workflow control service and settings controller
  const workflowControlService = new WorkflowControlService(db);
  const settingsController = new SettingsController(workflowControlService);

  // Initialize asset controller
  const assetController = new AssetController(db);

  // Initialize actor controller
  const actorController = new ActorController(dbManager);

  // Initialize job controller
  const jobController = new JobController(jobQueueService);

  // Initialize scheduler controller (optional - only if schedulers provided)
  const schedulerController =
    fileScannerScheduler && providerUpdaterScheduler
      ? new SchedulerController(dbManager, fileScannerScheduler, providerUpdaterScheduler)
      : null;

  // Health check endpoint
  router.get('/health', (_req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
    });
  });

  // System information
  router.get('/system/info', async (_req, res, next) => {
    try {
      // Get database statistics
      const movieCount = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM movies');
      const libraryCount = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM libraries');
      const playerCount = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM media_players');

      // Get job queue statistics
      const jobStats = await jobQueueService.getStats();

      // Get provider statistics
      const providerStats = await db.query<{
        provider: string;
        last_sync: string | null;
      }>('SELECT provider, last_sync FROM provider_sync_status');

      res.json({
        name: 'Metarr',
        version: process.env.npm_package_version || '1.0.0',
        description: 'Metadata management application bridging downloaders and media players',
        uptime: process.uptime(),
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        memory: {
          used: process.memoryUsage(),
          free: process.memoryUsage().external,
        },
        database: {
          movies: movieCount?.count || 0,
          libraries: libraryCount?.count || 0,
          mediaPlayers: playerCount?.count || 0,
        },
        jobQueue: {
          pending: jobStats.pending,
          processing: jobStats.processing,
          total: jobStats.totalActive,
          oldestPendingAge: jobStats.oldestPendingAge,
        },
        providers: providerStats.map((stat) => ({
          name: stat.provider,
          lastSync: stat.last_sync,
        })),
      });
    } catch (error: any) {
      logger.error('Error getting system info:', error);
      next(error);
    }
  });

  // Activity Log Routes
  // ========================================
  logger.debug('[API Router] Registering activity log routes');

  router.get('/system/activity', (req, res, next) =>
    activityLogController.getAllActivities(req, res, next)
  );
  router.get('/system/activity/:id', (req, res, next) =>
    activityLogController.getActivityById(req, res, next)
  );

  // Media Player Routes
  router.get('/media-players', (req, res, next) => mediaPlayerController.getAll(req, res, next));
  router.get('/media-players/status', (req, res) => mediaPlayerController.streamStatus(req, res));
  router.get('/media-players/:id', (req, res, next) =>
    mediaPlayerController.getById(req, res, next)
  );
  router.post('/media-players', (req, res, next) => mediaPlayerController.create(req, res, next));
  router.put('/media-players/:id', (req, res, next) =>
    mediaPlayerController.update(req, res, next)
  );
  router.delete('/media-players/:id', (req, res, next) =>
    mediaPlayerController.delete(req, res, next)
  );
  router.post('/media-players/test', (req, res, next) =>
    mediaPlayerController.testConnectionUnsaved(req, res, next)
  );
  router.post('/media-players/:id/test', (req, res, next) =>
    mediaPlayerController.testConnection(req, res, next)
  );
  router.post('/media-players/:id/connect', (req, res, next) =>
    mediaPlayerController.connect(req, res, next)
  );
  router.post('/media-players/:id/disconnect', (req, res, next) =>
    mediaPlayerController.disconnect(req, res, next)
  );

  // Library Routes
  router.get('/libraries', (req, res, next) => libraryController.getAll(req, res, next));
  router.get('/libraries/scan-status', (req, res) => libraryController.streamScanStatus(req, res));
  router.get('/libraries/drives', (req, res, next) => libraryController.getDrives(req, res, next));
  router.get('/libraries/platform', (req, res, next) => libraryController.getPlatform(req, res, next));
  router.get('/libraries/browse', (req, res, next) => libraryController.browsePath(req, res, next));
  router.post('/libraries/validate-path', (req, res, next) =>
    libraryController.validatePath(req, res, next)
  );
  router.get('/libraries/:id',
    validateRequest(commonSchemas.idParam, 'params'),
    (req, res, next) => libraryController.getById(req, res, next)
  );
  router.post('/libraries',
    validateRequest(createLibrarySchema, 'body'),
    (req, res, next) => libraryController.create(req, res, next)
  );
  router.put('/libraries/:id',
    validateRequest(commonSchemas.idParam, 'params'),
    validateRequest(updateLibrarySchema, 'body'),
    (req, res, next) => libraryController.update(req, res, next)
  );
  router.delete('/libraries/:id',
    validateRequest(commonSchemas.idParam, 'params'),
    (req, res, next) => libraryController.delete(req, res, next)
  );
  router.post('/libraries/:id/scan',
    validateRequest(commonSchemas.idParam, 'params'),
    (req, res, next) => libraryController.startScan(req, res, next)
  );

  // Ignore Pattern Routes
  logger.debug('[API Router] Registering ignore pattern routes');
  router.get('/ignore-patterns', (req, res, next) =>
    ignorePatternController.getAll(req, res, next)
  );
  router.post('/ignore-patterns', (req, res, next) =>
    ignorePatternController.create(req, res, next)
  );
  router.patch('/ignore-patterns/:id/toggle', (req, res, next) =>
    ignorePatternController.toggle(req, res, next)
  );
  router.delete('/ignore-patterns/:id', (req, res, next) =>
    ignorePatternController.delete(req, res, next)
  );
  router.post('/ignore-patterns/generate', (req, res, next) =>
    ignorePatternController.generatePattern(req, res, next)
  );
  router.post('/ignore-patterns/ignore-and-delete', (req, res, next) =>
    ignorePatternController.ignoreAndDeleteMatching(req, res, next)
  );

  // Movie Routes (order matters - specific routes before parameterized routes)
  logger.debug('[API Router] Registering movie routes');

  // SSE route for movie updates
  router.get('/movies/updates', (req, res) => {
    logger.debug('[Route Hit] /movies/updates');
    movieController.streamMovieUpdates(req, res);
  });

  // List all movies
  router.get('/movies', (req, res, next) => {
    logger.debug('[Route Hit] /movies');
    movieController.getAll(req, res, next);
  });

  // Movie detail sub-routes (MUST come before /movies/:id)
  router.get('/movies/:id/provider-results', (req, res, next) => {
    logger.debug('[Route Hit] /movies/:id/provider-results with id:', req.params.id);
    movieController.getProviderResults(req, res, next);
  });

  router.post('/movies/:id/assets', (req, res, next) => {
    logger.debug('[Route Hit] /movies/:id/assets with id:', req.params.id);
    movieController.saveAssets(req, res, next);
  });

  // Multi-asset selection routes
  // PUT replaces all assets of a specific type (atomic replace operation)
  router.put('/movies/:id/assets/:assetType', (req, res, next) => {
    logger.debug('[Route Hit] PUT /movies/:id/assets/:assetType with id:', req.params.id, 'assetType:', req.params.assetType);
    movieController.replaceAssets(req, res, next);
  });

  router.post('/movies/:id/assets/:assetType/add', (req, res, next) => {
    logger.debug('[Route Hit] /movies/:id/assets/:assetType/add with id:', req.params.id, 'assetType:', req.params.assetType);
    movieController.addAsset(req, res, next);
  });

  router.delete('/movies/:id/assets/:imageFileId', (req, res, next) => {
    logger.debug('[Route Hit] DELETE /movies/:id/assets/:imageFileId with id:', req.params.id, 'imageFileId:', req.params.imageFileId);
    movieController.removeAsset(req, res, next);
  });

  router.patch('/movies/:id/assets/:assetType/lock', (req, res, next) => {
    logger.debug('[Route Hit] PATCH /movies/:id/assets/:assetType/lock with id:', req.params.id, 'assetType:', req.params.assetType);
    movieController.toggleAssetLock(req, res, next);
  });

  // REMOVED: /movies/:id/unknown-files
  // Unknown files are now available in GET /movies/:id as files.unknown

  router.post('/movies/:id/unknown-files/:fileId/assign', (req, res, next) => {
    logger.debug('[Route Hit] /movies/:id/unknown-files/:fileId/assign with id:', req.params.id, 'fileId:', req.params.fileId);
    movieController.assignUnknownFile(req, res, next);
  });

  router.post('/movies/:id/unknown-files/:fileId/ignore', (req, res, next) => {
    logger.debug('[Route Hit] /movies/:id/unknown-files/:fileId/ignore with id:', req.params.id, 'fileId:', req.params.fileId);
    movieController.ignoreUnknownFile(req, res, next);
  });

  router.delete('/movies/:id/unknown-files/:fileId', (req, res, next) => {
    logger.debug('[Route Hit] DELETE /movies/:id/unknown-files/:fileId with id:', req.params.id, 'fileId:', req.params.fileId);
    movieController.deleteUnknownFile(req, res, next);
  });

  // REMOVED: /movies/:id/rebuild-assets, /movies/:id/verify-assets
  // Redundant - use /movies/:id/refresh to trigger enrichment and publish

  // REMOVED: /movies/:id/files, /movies/:id/images, /movies/:id/extras
  // Files are now included in GET /movies/:id response

  // Refresh movie metadata (user-initiated)
  router.post('/movies/:id/refresh', (req, res, next) => {
    logger.debug('[Route Hit] /movies/:id/refresh with id:', req.params.id);
    movieController.refreshMovie(req, res, next);
  });

  // Update movie metadata
  router.patch('/movies/:id/metadata', (req, res, next) => {
    logger.debug('[Route Hit] /movies/:id/metadata with id:', req.params.id);
    movieController.updateMetadata(req, res, next);
  });

  // Toggle monitored status
  router.post('/movies/:id/toggle-monitored', (req, res, next) => {
    logger.debug('[Route Hit] /movies/:id/toggle-monitored with id:', req.params.id);
    movieController.toggleMonitored(req, res, next);
  });

  // Lock/unlock field endpoints
  router.post('/movies/:id/lock-field', (req, res, next) => {
    logger.debug('[Route Hit] /movies/:id/lock-field with id:', req.params.id);
    movieController.lockField(req, res, next);
  });

  router.post('/movies/:id/unlock-field', (req, res, next) => {
    logger.debug('[Route Hit] /movies/:id/unlock-field with id:', req.params.id);
    movieController.unlockField(req, res, next);
  });

  router.post('/movies/:id/reset-metadata', (req, res, next) => {
    logger.debug('[Route Hit] /movies/:id/reset-metadata with id:', req.params.id);
    movieController.resetMetadata(req, res, next);
  });

  // Asset candidate routes
  router.get('/movies/:id/asset-candidates', (req, res, next) => {
    logger.debug('[Route Hit] /movies/:id/asset-candidates with id:', req.params.id);
    movieController.getAssetCandidates(req, res, next);
  });

  router.post('/asset-candidates/:id/select', (req, res, next) => {
    logger.debug('[Route Hit] /asset-candidates/:id/select with id:', req.params.id);
    movieController.selectAssetCandidate(req, res, next);
  });

  router.post('/asset-candidates/:id/block', (req, res, next) => {
    logger.debug('[Route Hit] /asset-candidates/:id/block with id:', req.params.id);
    movieController.blockAssetCandidate(req, res, next);
  });

  router.post('/asset-candidates/:id/unblock', (req, res, next) => {
    logger.debug('[Route Hit] /asset-candidates/:id/unblock with id:', req.params.id);
    movieController.unblockAssetCandidate(req, res, next);
  });

  router.post('/movies/:id/reset-asset', (req, res, next) => {
    logger.debug('[Route Hit] /movies/:id/reset-asset with id:', req.params.id);
    movieController.resetAssetSelection(req, res, next);
  });

  // Soft delete (move to recycle bin)
  router.delete('/movies/:id', (req, res, next) => {
    logger.debug('[Route Hit] DELETE /movies/:id with id:', req.params.id);
    movieController.deleteMovie(req, res, next);
  });

  // Restore from recycle bin
  router.post('/movies/:id/restore', (req, res, next) => {
    logger.debug('[Route Hit] /movies/:id/restore with id:', req.params.id);
    movieController.restoreMovie(req, res, next);
  });

  // Identification routes
  router.post('/movies/:id/search-tmdb', (req, res, next) => {
    logger.debug('[Route Hit] /movies/:id/search-tmdb with id:', req.params.id);
    movieController.searchForIdentification(req, res, next);
  });

  router.post('/movies/:id/identify', (req, res, next) => {
    logger.debug('[Route Hit] /movies/:id/identify with id:', req.params.id);
    movieController.identifyMovie(req, res, next);
  });

  // Manual job trigger routes
  router.post('/movies/:id/jobs/verify', (req, res, next) => {
    logger.debug('[Route Hit] /movies/:id/jobs/verify with id:', req.params.id);
    movieController.triggerVerify(req, res, next);
  });

  router.post('/movies/:id/jobs/enrich', (req, res, next) => {
    logger.debug('[Route Hit] /movies/:id/jobs/enrich with id:', req.params.id);
    movieController.triggerEnrich(req, res, next);
  });

  router.post('/movies/:id/jobs/publish', (req, res, next) => {
    logger.debug('[Route Hit] /movies/:id/jobs/publish with id:', req.params.id);
    movieController.triggerPublish(req, res, next);
  });

  // Movie detail (MUST come last among movie routes)
  router.get('/movies/:id', (req, res, next) => {
    logger.debug('[Route Hit] /movies/:id with id:', req.params.id);
    movieController.getById(req, res, next);
  });

  // Image Routes
  logger.debug('[API Router] Registering image routes');

  // Image file serving (MUST come before /images/:id)
  router.get('/images/:id/file', (req, res, next) => {
    logger.debug('[Route Hit] /images/:id/file with id:', req.params.id);
    imageController.serveImage(req, res, next);
  });

  // REMOVED: GET /movies/:id/images
  // Images are now included in GET /movies/:id?include=files response as files.images

  // Movie image routes
  router.post(
    '/movies/:id/images/upload',
    imageController.upload.single('image'),
    (req, res, next) => {
      logger.debug('[Route Hit] /movies/:id/images/upload with id:', req.params.id);
      imageController.uploadMovieImage(req, res, next);
    }
  );

  // REMOVED: POST /movies/:id/images/recover
  // Not part of the workflow - use /movies/:id/refresh instead

  // Generic image operations
  router.patch('/images/:id/lock', (req, res, next) => {
    logger.debug('[Route Hit] /images/:id/lock with id:', req.params.id);
    imageController.lockImage(req, res, next);
  });

  router.delete('/images/:id', (req, res, next) => {
    logger.debug('[Route Hit] /images/:id with id:', req.params.id);
    imageController.deleteImage(req, res, next);
  });

  // Actor Routes
  logger.debug('[API Router] Registering actor routes');
  router.get('/actors', (req, res, next) => {
    logger.debug('[Route Hit] /actors');
    actorController.getAll(req, res, next);
  });

  // Actor image serving (MUST come before /actors/:id)
  router.get('/actors/:id/image', (req, res, next) => {
    logger.debug('[Route Hit] /actors/:id/image with id:', req.params.id);
    actorController.serveImage(req, res, next);
  });

  router.get('/actors/:id/movies', (req, res, next) => {
    logger.debug('[Route Hit] /actors/:id/movies with id:', req.params.id);
    actorController.getMovies(req, res, next);
  });

  router.get('/actors/:id', (req, res, next) => {
    logger.debug('[Route Hit] /actors/:id with id:', req.params.id);
    actorController.getById(req, res, next);
  });

  router.patch('/actors/:id', (req, res, next) => {
    logger.debug('[Route Hit] PATCH /actors/:id with id:', req.params.id);
    actorController.update(req, res, next);
  });

  router.delete('/actors/:id', (req, res, next) => {
    logger.debug('[Route Hit] DELETE /actors/:id with id:', req.params.id);
    actorController.delete(req, res, next);
  });

  router.post('/actors/:id/merge', (req, res, next) => {
    logger.debug('[Route Hit] POST /actors/:id/merge with id:', req.params.id);
    actorController.merge(req, res, next);
  });

  // Asset Routes
  logger.debug('[API Router] Registering asset routes');
  router.get('/assets/candidates/:entityType/:entityId', assetController.getCandidates);
  router.get('/assets/selected/:entityType/:entityId', assetController.getSelected);
  router.post('/assets/select/manual', assetController.selectManual);
  router.post('/assets/select/yolo', assetController.selectYOLO);
  router.post('/assets/select/hybrid', assetController.selectHybrid);
  router.post('/assets/approve', assetController.approveHybrid);
  router.post('/assets/reject-selection', assetController.rejectSelection);
  router.post('/assets/reject', assetController.rejectAsset);
  router.post('/assets/unlock', assetController.unlockAssetType);
  router.post('/assets/publish', assetController.publish);
  router.get('/assets/needs-publishing/:entityType/:entityId', assetController.needsPublishing);
  router.get('/assets/needs-publishing/:entityType', assetController.getEntitiesNeedingPublish);

  // Job Routes
  logger.debug('[API Router] Registering job routes');
  router.get('/jobs/stats', jobController.getStats);
  router.get('/jobs', jobController.getActive);
  router.get('/jobs/history', jobController.getHistory);
  router.get('/jobs/:jobId', jobController.getJob);

  // Settings Routes (Workflow Control)
  logger.debug('[API Router] Registering settings routes');
  router.get('/settings/workflow', (req, res) => settingsController.getWorkflowSettings(req, res));
  router.put('/settings/workflow', (req, res) => settingsController.updateWorkflowSettings(req, res));
  router.put('/settings/workflow/:stage', (req, res) => settingsController.updateWorkflowStage(req, res));
  router.post('/settings/workflow/enable-all', (req, res) => settingsController.enableAllWorkflows(req, res));
  router.post('/settings/workflow/disable-all', (req, res) => settingsController.disableAllWorkflows(req, res));

  // Automation Config Routes
  logger.debug('[API Router] Registering automation config routes');
  router.get('/automation/:libraryId', automationConfigController.getAutomationConfig);
  router.put('/automation/:libraryId', automationConfigController.setAutomationConfig);
  router.get('/automation/:libraryId/asset-selection', automationConfigController.getAssetSelectionConfig);
  router.put('/automation/:libraryId/asset-selection/:assetType', automationConfigController.setAssetSelectionConfig);
  router.get('/automation/:libraryId/completeness', automationConfigController.getCompletenessConfig);
  router.put('/automation/:libraryId/completeness/:fieldName', automationConfigController.setCompletenessConfig);
  router.post('/automation/:libraryId/initialize', automationConfigController.initializeDefaults);
  router.delete('/automation/:libraryId', automationConfigController.deleteAutomationConfig);

  // Placeholder routes for future implementation
  router.get('/series', (_req, res) => {
    res.json({ message: 'Series endpoint coming soon' });
  });

  // Provider config routes
  router.get('/providers', (req, res) =>
    providerConfigController.getAllProviders(req, res)
  );
  router.get('/providers/:name', (req, res) =>
    providerConfigController.getProvider(req, res)
  );
  router.post('/providers/:name', (req, res) =>
    providerConfigController.updateProvider(req, res)
  );
  router.post('/providers/:name/test', (req, res) =>
    providerConfigController.testProvider(req, res)
  );
  router.delete('/providers/:name', (req, res) =>
    providerConfigController.deleteProvider(req, res)
  );

  // Priority config routes
  router.get('/priorities/presets', (req, res) =>
    priorityConfigController.getAvailablePresets(req, res)
  );
  router.get('/priorities/active', (req, res) =>
    priorityConfigController.getActivePreset(req, res)
  );
  router.post('/priorities/apply', (req, res) =>
    priorityConfigController.applyPreset(req, res)
  );
  router.get('/priorities/asset-types', (req, res) =>
    priorityConfigController.getAllAssetTypePriorities(req, res)
  );
  router.get('/priorities/asset-types/:type', (req, res) =>
    priorityConfigController.getAssetTypePriority(req, res)
  );
  router.post('/priorities/asset-types/:type', (req, res) =>
    priorityConfigController.updateAssetTypePriority(req, res)
  );
  router.get('/priorities/metadata-fields', (req, res) =>
    priorityConfigController.getAllMetadataFieldPriorities(req, res)
  );
  router.get('/priorities/metadata-fields/:field', (req, res) =>
    priorityConfigController.getMetadataFieldPriority(req, res)
  );
  router.post('/priorities/metadata-fields/:field', (req, res) =>
    priorityConfigController.updateMetadataFieldPriority(req, res)
  );

  // Asset limit configuration routes
  logger.debug('[API Router] Registering asset limit configuration routes');
  router.get('/settings/asset-limits', (req, res, next) =>
    assetConfigController.getAllLimits(req, res, next)
  );
  router.get('/settings/asset-limits/metadata', (req, res, next) =>
    assetConfigController.getAllLimitsWithMetadata(req, res, next)
  );
  router.get('/settings/asset-limits/:assetType', (req, res, next) =>
    assetConfigController.getLimit(req, res, next)
  );
  router.put('/settings/asset-limits/:assetType', (req, res, next) =>
    assetConfigController.setLimit(req, res, next)
  );
  router.delete('/settings/asset-limits/:assetType', (req, res, next) =>
    assetConfigController.resetLimit(req, res, next)
  );
  router.post('/settings/asset-limits/reset-all', (req, res, next) =>
    assetConfigController.resetAllLimits(req, res, next)
  );

  // ========================================
  // Webhook Configuration Routes
  // ========================================
  logger.debug('[API Router] Registering webhook configuration routes');

  router.get('/settings/webhooks', (req, res, next) =>
    webhookConfigController.getAllWebhooks(req, res, next)
  );
  router.get('/settings/webhooks/:service', (req, res, next) =>
    webhookConfigController.getWebhook(req, res, next)
  );
  router.put('/settings/webhooks/:service', (req, res, next) =>
    webhookConfigController.updateWebhook(req, res, next)
  );

  // Webhook Events Routes
  // ========================================
  logger.debug('[API Router] Registering webhook events routes');

  router.get('/webhooks/events', (req, res, next) =>
    webhookEventsController.getAllEvents(req, res, next)
  );
  router.get('/webhooks/events/:id', (req, res, next) =>
    webhookEventsController.getEventById(req, res, next)
  );

  // Scheduler routes (only if scheduler controller is available)
  if (schedulerController) {
    logger.debug('[API Router] Registering scheduler routes');

    // Scheduler status
    router.get('/scheduler/status', (req, res, next) =>
      schedulerController.getStatus(req, res, next)
    );

    // Library scheduler configuration
    router.get('/libraries/:libraryId/scheduler',
      validateRequest(commonSchemas.libraryIdParam, 'params'),
      (req, res, next) => schedulerController.getLibraryConfig(req, res, next)
    );
    router.put('/libraries/:libraryId/scheduler',
      validateRequest(commonSchemas.libraryIdParam, 'params'),
      validateRequest(updateSchedulerConfigSchema, 'body'),
      (req, res, next) => schedulerController.updateLibraryConfig(req, res, next)
    );

    // Manual job triggers
    router.post('/libraries/:libraryId/scheduler/file-scan/trigger',
      validateRequest(commonSchemas.libraryIdParam, 'params'),
      (req, res, next) => schedulerController.triggerFileScan(req, res, next)
    );
    router.post('/libraries/:libraryId/scheduler/provider-update/trigger',
      validateRequest(commonSchemas.libraryIdParam, 'params'),
      (req, res, next) => schedulerController.triggerProviderUpdate(req, res, next)
    );
  }

  return router;
};

// Legacy export for backward compatibility
export const apiRoutes = Router();
