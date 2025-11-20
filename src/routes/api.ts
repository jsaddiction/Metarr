import { Router } from 'express';
import { MediaPlayerController } from '../controllers/mediaPlayerController.js';
import { LibraryController } from '../controllers/libraryController.js';
import { MovieCrudController } from '../controllers/movie/MovieCrudController.js';
import { MovieAssetController } from '../controllers/movie/MovieAssetController.js';
import { MovieProviderController } from '../controllers/movie/MovieProviderController.js';
import { MovieJobController } from '../controllers/movie/MovieJobController.js';
import { MovieFieldLockController } from '../controllers/movie/MovieFieldLockController.js';
import { MovieUnknownFilesController } from '../controllers/movie/MovieUnknownFilesController.js';
import { MovieSuggestionsController } from '../controllers/movie/MovieSuggestionsController.js';
import { IgnorePatternController } from '../controllers/ignorePatternController.js';
import { ImageController } from '../controllers/imageController.js';
import { JobController } from '../controllers/jobController.js';
import { DatabaseManager } from '../database/DatabaseManager.js';
import { MediaPlayerConnectionManager } from '../services/mediaPlayerConnectionManager.js';
import { MediaPlayerService } from '../services/mediaPlayerService.js';
import { LibraryService } from '../services/libraryService.js';
import { LibraryScanService } from '../services/libraryScanService.js';
import { MovieService } from '../services/movieService.js';
import { IgnorePatternService } from '../services/ignorePatternService.js';
import { ImageService } from '../services/imageService.js';
import { JobQueueService } from '../services/jobQueue/JobQueueService.js';
import { ActorController } from '../controllers/actorController.js';
import { ProviderConfigService } from '../services/providerConfigService.js';
import { ProviderConfigController } from '../controllers/providerConfigController.js';
import { ProviderCacheManager } from '../services/providers/ProviderCacheManager.js';
import { PriorityConfigService } from '../services/priorityConfigService.js';
import { PriorityConfigController } from '../controllers/priorityConfigController.js';
import { AssetConfigService } from '../services/assetConfigService.js';
import { AssetConfigController } from '../controllers/assetConfigController.js';
import { WebhookConfigController } from '../controllers/webhookConfigController.js';
import { WebhookEventsController } from '../controllers/webhookEventsController.js';
import { ActivityLogController } from '../controllers/activityLogController.js';
import { SettingsController } from '../controllers/settingsController.js';
import { PhaseConfigService } from '../services/PhaseConfigService.js';
import { ProviderRegistry } from '../services/providers/ProviderRegistry.js';
import { FetchOrchestrator } from '../services/providers/FetchOrchestrator.js';
import { SchedulerController } from '../controllers/schedulerController.js';
import { FileScannerScheduler } from '../services/schedulers/FileScannerScheduler.js';
import { ProviderUpdaterScheduler } from '../services/schedulers/ProviderUpdaterScheduler.js';
import { getProviderHealth, getProviderHealthById } from '../controllers/providerHealthController.js';
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

  // Initialize unified provider cache manager
  const providerCacheManager = new ProviderCacheManager(db, fetchOrchestrator);

  // Initialize movie service and controllers (refactored into focused controllers)
  const movieService = new MovieService(dbManager, jobQueueService);

  // New focused controllers following Single Responsibility Principle
  const movieCrudController = new MovieCrudController(movieService);
  const movieAssetController = new MovieAssetController(movieService, providerCacheManager);
  const movieProviderController = new MovieProviderController(
    movieService,
    providerCacheManager  // Uses unified ProviderCacheManager
  );
  const movieJobController = new MovieJobController(movieService);
  const movieFieldLockController = new MovieFieldLockController(movieService);
  const movieUnknownFilesController = new MovieUnknownFilesController(movieService);
  const movieSuggestionsController = new MovieSuggestionsController(dbManager);

  // Initialize ignore pattern service and controller
  const ignorePatternService = new IgnorePatternService(dbManager);
  const ignorePatternController = new IgnorePatternController(ignorePatternService);

  // Initialize image service and controller
  const imageService = new ImageService(dbManager);
  const imageController = new ImageController(imageService);
  // Initialize image service
  imageService.initialize().catch(err => logger.error('Failed to initialize image service:', err));

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

  // Initialize phase config service and settings controller
  const phaseConfigService = new PhaseConfigService(db);
  const settingsController = new SettingsController(phaseConfigService);

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
    } catch (error) {
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

  // List all movies (WebSocket is used for real-time updates, not SSE)
  router.get('/movies', (req, res, next) => {
    logger.debug('[Route Hit] /movies');
    movieCrudController.getAll(req, res, next);
  });

  // Movie suggestions for autocomplete (MUST come before /movies/:id)
  router.get('/movies/suggestions/genres', (req, res, next) => {
    logger.debug('[Route Hit] /movies/suggestions/genres');
    movieSuggestionsController.getGenres(req, res, next);
  });

  router.get('/movies/suggestions/directors', (req, res, next) => {
    logger.debug('[Route Hit] /movies/suggestions/directors');
    movieSuggestionsController.getDirectors(req, res, next);
  });

  router.get('/movies/suggestions/writers', (req, res, next) => {
    logger.debug('[Route Hit] /movies/suggestions/writers');
    movieSuggestionsController.getWriters(req, res, next);
  });

  router.get('/movies/suggestions/studios', (req, res, next) => {
    logger.debug('[Route Hit] /movies/suggestions/studios');
    movieSuggestionsController.getStudios(req, res, next);
  });

  router.get('/movies/suggestions/countries', (req, res, next) => {
    logger.debug('[Route Hit] /movies/suggestions/countries');
    movieSuggestionsController.getCountries(req, res, next);
  });

  router.get('/movies/suggestions/tags', (req, res, next) => {
    logger.debug('[Route Hit] /movies/suggestions/tags');
    movieSuggestionsController.getTags(req, res, next);
  });

  // Movie detail sub-routes (MUST come before /movies/:id)
  router.get('/movies/:id/provider-results', (req, res, next) => {
    logger.debug('[Route Hit] /movies/:id/provider-results with id:', req.params.id);
    movieProviderController.getProviderResults(req, res, next);
  });

  router.post('/movies/:id/assets', (req, res, next) => {
    logger.debug('[Route Hit] /movies/:id/assets with id:', req.params.id);
    movieProviderController.saveAssets(req, res, next);
  });

  // Multi-asset selection routes
  // PUT replaces all assets of a specific type (atomic replace operation)
  router.put('/movies/:id/assets/:assetType', (req, res, next) => {
    logger.debug('[Route Hit] PUT /movies/:id/assets/:assetType with id:', req.params.id, 'assetType:', req.params.assetType);
    movieAssetController.replaceAssets(req, res, next);
  });

  router.post('/movies/:id/assets/:assetType/add', (req, res, next) => {
    logger.debug('[Route Hit] /movies/:id/assets/:assetType/add with id:', req.params.id, 'assetType:', req.params.assetType);
    movieAssetController.addAsset(req, res, next);
  });

  router.delete('/movies/:id/assets/:imageFileId', (req, res, next) => {
    logger.debug('[Route Hit] DELETE /movies/:id/assets/:imageFileId with id:', req.params.id, 'imageFileId:', req.params.imageFileId);
    movieAssetController.removeAsset(req, res, next);
  });

  router.patch('/movies/:id/assets/:assetType/lock', (req, res, next) => {
    logger.debug('[Route Hit] PATCH /movies/:id/assets/:assetType/lock with id:', req.params.id, 'assetType:', req.params.assetType);
    movieAssetController.toggleAssetLock(req, res, next);
  });

  // REMOVED: /movies/:id/unknown-files
  // Unknown files are now available in GET /movies/:id as files.unknown

  router.post('/movies/:id/unknown-files/:fileId/assign', (req, res, next) => {
    logger.debug('[Route Hit] /movies/:id/unknown-files/:fileId/assign with id:', req.params.id, 'fileId:', req.params.fileId);
    movieUnknownFilesController.assignUnknownFile(req, res, next);
  });

  router.post('/movies/:id/unknown-files/:fileId/ignore', (req, res, next) => {
    logger.debug('[Route Hit] /movies/:id/unknown-files/:fileId/ignore with id:', req.params.id, 'fileId:', req.params.fileId);
    movieUnknownFilesController.ignoreUnknownFile(req, res, next);
  });

  router.delete('/movies/:id/unknown-files/:fileId', (req, res, next) => {
    logger.debug('[Route Hit] DELETE /movies/:id/unknown-files/:fileId with id:', req.params.id, 'fileId:', req.params.fileId);
    movieUnknownFilesController.deleteUnknownFile(req, res, next);
  });

  // REMOVED: /movies/:id/rebuild-assets, /movies/:id/verify-assets
  // Redundant - use /movies/:id/refresh to trigger enrichment and publish

  // REMOVED: /movies/:id/files, /movies/:id/images, /movies/:id/extras
  // Files are now included in GET /movies/:id response

  // Refresh movie metadata (user-initiated)
  router.post('/movies/:id/refresh', (req, res, next) => {
    logger.debug('[Route Hit] /movies/:id/refresh with id:', req.params.id);
    movieCrudController.refreshMovie(req, res, next);
  });

  // Update movie metadata
  router.patch('/movies/:id/metadata', (req, res, next) => {
    logger.debug('[Route Hit] /movies/:id/metadata with id:', req.params.id);
    movieCrudController.updateMetadata(req, res, next);
  });

  // Toggle monitored status
  router.post('/movies/:id/toggle-monitored', (req, res, next) => {
    logger.debug('[Route Hit] /movies/:id/toggle-monitored with id:', req.params.id);
    movieJobController.toggleMonitored(req, res, next);
  });

  // Lock/unlock field endpoints
  router.post('/movies/:id/lock-field', (req, res, next) => {
    logger.debug('[Route Hit] /movies/:id/lock-field with id:', req.params.id);
    movieFieldLockController.lockField(req, res, next);
  });

  router.post('/movies/:id/unlock-field', (req, res, next) => {
    logger.debug('[Route Hit] /movies/:id/unlock-field with id:', req.params.id);
    movieFieldLockController.unlockField(req, res, next);
  });

  router.post('/movies/:id/reset-metadata', (req, res, next) => {
    logger.debug('[Route Hit] /movies/:id/reset-metadata with id:', req.params.id);
    movieFieldLockController.resetMetadata(req, res, next);
  });

  // Asset candidate routes
  router.get('/movies/:id/asset-candidates', (req, res, next) => {
    logger.debug('[Route Hit] /movies/:id/asset-candidates with id:', req.params.id);
    movieAssetController.getAssetCandidates(req, res, next);
  });

  router.post('/asset-candidates/:id/select', (req, res, next) => {
    logger.debug('[Route Hit] /asset-candidates/:id/select with id:', req.params.id);
    movieAssetController.selectAssetCandidate(req, res, next);
  });

  router.post('/asset-candidates/:id/block', (req, res, next) => {
    logger.debug('[Route Hit] /asset-candidates/:id/block with id:', req.params.id);
    movieAssetController.blockAssetCandidate(req, res, next);
  });

  router.post('/asset-candidates/:id/unblock', (req, res, next) => {
    logger.debug('[Route Hit] /asset-candidates/:id/unblock with id:', req.params.id);
    movieAssetController.unblockAssetCandidate(req, res, next);
  });

  router.post('/movies/:id/reset-asset', (req, res, next) => {
    logger.debug('[Route Hit] /movies/:id/reset-asset with id:', req.params.id);
    movieAssetController.resetAssetSelection(req, res, next);
  });

  // Soft delete (move to recycle bin)
  router.delete('/movies/:id', (req, res, next) => {
    logger.debug('[Route Hit] DELETE /movies/:id with id:', req.params.id);
    movieCrudController.deleteMovie(req, res, next);
  });

  // Restore from recycle bin
  router.post('/movies/:id/restore', (req, res, next) => {
    logger.debug('[Route Hit] /movies/:id/restore with id:', req.params.id);
    movieCrudController.restoreMovie(req, res, next);
  });

  // Identification routes
  router.post('/movies/:id/search-tmdb', (req, res, next) => {
    logger.debug('[Route Hit] /movies/:id/search-tmdb with id:', req.params.id);
    movieProviderController.searchForIdentification(req, res, next);
  });

  router.post('/movies/:id/identify', (req, res, next) => {
    logger.debug('[Route Hit] /movies/:id/identify with id:', req.params.id);
    movieProviderController.identifyMovie(req, res, next);
  });

  // Manual job trigger routes
  router.post('/movies/:id/jobs/verify', (req, res, next) => {
    logger.debug('[Route Hit] /movies/:id/jobs/verify with id:', req.params.id);
    movieJobController.triggerVerify(req, res, next);
  });

  router.post('/movies/:id/jobs/enrich', (req, res, next) => {
    logger.debug('[Route Hit] /movies/:id/jobs/enrich with id:', req.params.id);
    movieJobController.triggerEnrich(req, res, next);
  });

  router.post('/movies/:id/jobs/publish', (req, res, next) => {
    logger.debug('[Route Hit] /movies/:id/jobs/publish with id:', req.params.id);
    movieJobController.triggerPublish(req, res, next);
  });

  // Movie detail (MUST come last among movie routes)
  router.get('/movies/:id', (req, res, next) => {
    logger.debug('[Route Hit] /movies/:id with id:', req.params.id);
    movieCrudController.getById(req, res, next);
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

  // DELETED: Legacy Asset Routes (unused - replaced by movie-specific endpoints)
  // These endpoints were never called by the frontend UI:
  // - GET /api/assets/candidates/:entityType/:entityId
  // - GET /api/assets/selected/:entityType/:entityId
  // - POST /api/assets/select/manual
  // - POST /api/assets/select/yolo
  // - POST /api/assets/select/hybrid
  // - POST /api/assets/approve
  // - POST /api/assets/reject-selection
  // - POST /api/assets/reject
  // - POST /api/assets/unlock
  // - POST /api/assets/publish
  // - GET /api/assets/needs-publishing/:entityType/:entityId
  // - GET /api/assets/needs-publishing/:entityType
  //
  // UI actually uses:
  // - GET /api/movies/:id/provider-results (fetch assets from providers)
  // - PUT /api/movies/:id/assets/:assetType (select/replace assets)
  // - POST /api/movies/:id/assets/:assetType/add (add single asset)
  // - DELETE /api/movies/:id/assets/:assetType/:imageFileId (remove asset)

  // Job Routes
  logger.debug('[API Router] Registering job routes');
  router.get('/jobs/stats', jobController.getStats);
  router.get('/jobs', jobController.getActive);
  router.get('/jobs/history', jobController.getHistory);
  router.get('/jobs/:jobId', jobController.getJob);

  // Settings Routes (Phase Configuration)
  // All workflow phases ALWAYS run - configuration controls behavior, not enablement
  logger.debug('[API Router] Registering settings routes');
  router.get('/settings/phase-config', (req, res) => settingsController.getPhaseConfig(req, res));
  router.get('/settings/phase-config/:phase', (req, res) => settingsController.getPhaseConfigByPhase(req, res));
  router.patch('/settings/phase-config', (req, res) => settingsController.updatePhaseConfig(req, res));
  router.patch('/settings/phase-config/:key', (req, res) => settingsController.updatePhaseConfigSetting(req, res));
  router.post('/settings/phase-config/reset', (req, res) => settingsController.resetPhaseConfig(req, res));

  // Automation Config Routes

  // Placeholder routes for future implementation
  router.get('/series', (_req, res) => {
    res.json({ message: 'Series endpoint coming soon' });
  });

  // Provider health monitoring routes (must come before :name routes)
  router.get('/providers/health', getProviderHealth);

  // Provider config routes
  router.get('/providers', (req, res) =>
    providerConfigController.getAllProviders(req, res)
  );
  router.get('/providers/:name', (req, res) =>
    providerConfigController.getProvider(req, res)
  );
  router.get('/providers/:name/health', getProviderHealthById);
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
