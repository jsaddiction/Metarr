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
import { JobQueueService } from '../services/jobQueueService.js';
import { JobHandlers } from '../services/jobHandlers.js';
import { AutomationConfigService } from '../services/automationConfigService.js';
import { AssetSelectionService } from '../services/assetSelectionService.js';
import { tmdbService } from '../services/providers/TMDBService.js';
import { ProviderConfigService } from '../services/providerConfigService.js';
import { ProviderConfigController } from '../controllers/providerConfigController.js';
import { PriorityConfigService } from '../services/priorityConfigService.js';
import { PriorityConfigController } from '../controllers/priorityConfigController.js';
import { ProviderRegistry } from '../services/providers/ProviderRegistry.js';
import { FetchOrchestrator } from '../services/providers/FetchOrchestrator.js';
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
  fileScannerScheduler?: FileScannerScheduler,
  providerUpdaterScheduler?: ProviderUpdaterScheduler
): Router => {
  const router = Router();

  // Initialize media player services and controller
  const mediaPlayerService = new MediaPlayerService(dbManager, connectionManager);
  const mediaPlayerController = new MediaPlayerController(mediaPlayerService, connectionManager);

  // Initialize library services and controller
  const libraryService = new LibraryService(dbManager);
  const libraryScanService = new LibraryScanService(dbManager);
  const libraryController = new LibraryController(libraryService, libraryScanService);

  // Get database connection for services that need it
  const db = dbManager.getConnection();

  // Initialize provider config service (needed by FetchOrchestrator)
  const providerConfigService = new ProviderConfigService(db);
  const providerConfigController = new ProviderConfigController(providerConfigService);

  // Initialize provider registry and fetch orchestrator
  const providerRegistry = ProviderRegistry.getInstance();
  const fetchOrchestrator = new FetchOrchestrator(providerRegistry, providerConfigService);

  // Initialize asset selection service
  const assetSelectionService = new AssetSelectionService(db);

  // Initialize movie service and controller
  const movieService = new MovieService(dbManager);
  const movieController = new MovieController(
    movieService,
    libraryScanService,
    fetchOrchestrator,
    assetSelectionService
  );

  // Initialize ignore pattern service and controller
  const ignorePatternService = new IgnorePatternService(dbManager);
  const ignorePatternController = new IgnorePatternController(ignorePatternService);

  // Initialize image service and controller
  const imageService = new ImageService(dbManager);
  const imageController = new ImageController(imageService);
  // Initialize image service
  imageService.initialize().catch(err => logger.error('Failed to initialize image service:', err));

  // Initialize job queue and handlers
  const jobQueue = new JobQueueService(db);

  // Get TMDB client if available
  const tmdbClient = tmdbService.isEnabled() ? tmdbService.getClient() : undefined;

  const jobHandlers = new JobHandlers(db, './data/cache', tmdbClient);
  jobHandlers.registerHandlers(jobQueue);
  jobQueue.start(); // Start processing jobs

  // Initialize automation config service and controller
  const automationConfigService = new AutomationConfigService(db);
  const automationConfigController = new AutomationConfigController(automationConfigService);

  // Initialize priority config service and controller
  const priorityConfigService = new PriorityConfigService(db);
  const priorityConfigController = new PriorityConfigController(priorityConfigService);

  // Initialize asset and job controllers
  const assetController = new AssetController(db);
  const jobController = new JobController(jobQueue);

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
  router.get('/system/info', (_req, res) => {
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
    });
  });

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

  router.get('/movies/:id/unknown-files', (req, res, next) => {
    logger.debug('[Route Hit] /movies/:id/unknown-files with id:', req.params.id);
    movieController.getUnknownFiles(req, res, next);
  });

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

  // Asset rebuild endpoints
  router.post('/movies/:id/rebuild-assets', (req, res, next) => {
    movieController.rebuildAssets(req, res, next);
  });

  router.get('/movies/:id/verify-assets', (req, res, next) => {
    movieController.verifyAssets(req, res, next);
  });

  router.get('/movies/:id/images', (req, res, next) => {
    logger.debug('[Route Hit] /movies/:id/images with id:', req.params.id);
    movieController.getImages(req, res, next);
  });

  router.get('/movies/:id/extras', (req, res, next) => {
    logger.debug('[Route Hit] /movies/:id/extras with id:', req.params.id);
    movieController.getExtras(req, res, next);
  });

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

  // Movie image routes
  router.get('/movies/:id/images', (req, res, next) => {
    logger.debug('[Route Hit] /movies/:id/images with id:', req.params.id);
    imageController.getMovieImages(req, res, next);
  });

  router.post(
    '/movies/:id/images/upload',
    imageController.upload.single('image'),
    (req, res, next) => {
      logger.debug('[Route Hit] /movies/:id/images/upload with id:', req.params.id);
      imageController.uploadMovieImage(req, res, next);
    }
  );

  router.post('/movies/:id/images/recover', (req, res, next) => {
    logger.debug('[Route Hit] /movies/:id/images/recover with id:', req.params.id);
    imageController.recoverImages(req, res, next);
  });

  // Generic image operations
  router.patch('/images/:id/lock', (req, res, next) => {
    logger.debug('[Route Hit] /images/:id/lock with id:', req.params.id);
    imageController.lockImage(req, res, next);
  });

  router.delete('/images/:id', (req, res, next) => {
    logger.debug('[Route Hit] /images/:id with id:', req.params.id);
    imageController.deleteImage(req, res, next);
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
  router.get('/jobs/recent', jobController.getRecent);
  router.get('/jobs/by-type/:type', jobController.getByType);
  router.get('/jobs/:jobId', jobController.getJob);
  router.post('/jobs/:jobId/retry', jobController.retry);
  router.delete('/jobs/:jobId', jobController.cancel);
  router.post('/jobs/clear-old', jobController.clearOld);

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
