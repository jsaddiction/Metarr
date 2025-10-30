import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer, Server as HttpServer } from 'http';
import { ConfigManager } from './config/ConfigManager.js';
import { DatabaseManager } from './database/DatabaseManager.js';
import { MigrationRunner } from './database/MigrationRunner.js';
import { MediaPlayerConnectionManager } from './services/mediaPlayerConnectionManager.js';
import { GarbageCollectionService } from './services/garbageCollectionService.js';
import { MetarrWebSocketServer } from './services/websocketServer.js';
import { websocketBroadcaster } from './services/websocketBroadcaster.js';
import { WebSocketController } from './controllers/websocketController.js';
import { cacheService } from './services/cacheService.js';
import { JobQueueService } from './services/jobQueue/JobQueueService.js';
import { SQLiteJobQueueStorage } from './services/jobQueue/storage/SQLiteJobQueueStorage.js';
import { NotificationConfigService } from './services/notificationConfigService.js';
import { PhaseConfigService } from './services/PhaseConfigService.js';
import { registerAllJobHandlers } from './services/jobHandlers/index.js';
import { FileScannerScheduler } from './services/schedulers/FileScannerScheduler.js';
import { ProviderUpdaterScheduler } from './services/schedulers/ProviderUpdaterScheduler.js';
import { HealthCheckService } from './services/HealthCheckService.js';
import { ProviderRegistry } from './services/providers/ProviderRegistry.js';
import { securityMiddleware, rateLimitByIp } from './middleware/security.js';
import { requestLoggingMiddleware, errorLoggingMiddleware, logger } from './middleware/logging.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

// Import routes
import { createWebhookRouter } from './routes/webhooks.js';
import { createApiRouter } from './routes/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class App {
  public express: express.Application;
  private httpServer: HttpServer;
  private config: ReturnType<ConfigManager['getConfig']>;
  private dbManager: DatabaseManager;
  private connectionManager: MediaPlayerConnectionManager;
  private garbageCollector: GarbageCollectionService;
  private wsServer: MetarrWebSocketServer;
  private wsController: WebSocketController;
  private jobQueueService?: JobQueueService;
  private fileScannerScheduler?: FileScannerScheduler;
  private providerUpdaterScheduler?: ProviderUpdaterScheduler;
  private healthCheckService?: HealthCheckService;

  constructor() {
    this.express = express();
    this.httpServer = createServer(this.express);
    this.config = ConfigManager.getInstance().getConfig();
    this.dbManager = new DatabaseManager(this.config.database);
    this.connectionManager = new MediaPlayerConnectionManager(this.dbManager);
    this.garbageCollector = new GarbageCollectionService(this.dbManager);

    // Initialize WebSocket server
    this.wsServer = new MetarrWebSocketServer({
      pingInterval: 30000, // 30 seconds
      pingTimeout: 5000, // 5 seconds
    });

    // Initialize WebSocket controller
    this.wsController = new WebSocketController(
      this.dbManager,
      this.connectionManager,
      this.wsServer
    );

    // Note: JobQueueService will be initialized in start() after database connection

    this.initializeMiddleware();
    this.initializeRoutes(); // Basic routes (health, frontend)
    // API routes will be initialized in start() after database connection
    // Error handling will be initialized AFTER API routes in start()
  }

  private initializeMiddleware(): void {
    // Trust proxy for rate limiting and IP detection
    this.express.set('trust proxy', 1);

    // Security middleware
    this.express.use(securityMiddleware);

    // CORS
    this.express.use(
      cors({
        origin: this.config.server.env === 'development' ? true : false,
        credentials: true,
      })
    );

    // Body parsing with raw body capture for webhook signature validation
    this.express.use(
      express.json({
        limit: '10mb',
        verify: (req: any, _res, buf) => {
          // Store raw body for HMAC signature validation (webhooks)
          req.rawBody = buf.toString('utf8');
        },
      })
    );
    this.express.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.express.use(requestLoggingMiddleware);

    // Rate limiting
    // Increased limit to accommodate static asset requests (images, etc.)
    this.express.use('/api', rateLimitByIp(60000, 1000)); // 1000 requests per minute
    this.express.use('/webhooks', rateLimitByIp(60000, 30)); // 30 webhook requests per minute

    // Static files
    this.express.use(express.static(path.join(__dirname, '../public')));

    // Cache directory as static files (for actor images, movie posters, etc.)
    // No rate limiting, served directly by Express static middleware
    const cacheDir = path.join(process.cwd(), 'data', 'cache');
    this.express.use('/cache', express.static(cacheDir, {
      maxAge: '1y', // Cache for 1 year (content-addressed, immutable)
      immutable: true,
      etag: true,
    }));
  }

  private initializeRoutes(): void {
    // Health check endpoint (no auth required, no DB access)
    this.express.get('/health', (_req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        database: this.dbManager.isConnected() ? 'connected' : 'disconnected',
      });
    });

    // Root route for frontend (no DB access)
    this.express.get('/', (_req, res) => {
      res.sendFile(path.join(__dirname, '../public/index.html'));
    });
  }

  private initializeApiRoutes(): void {
    // API routes (with dependency injection) - requires DB connection
    if (!this.jobQueueService) {
      throw new Error('JobQueueService not initialized. Must call start() before initializing API routes.');
    }

    if (!this.healthCheckService) {
      throw new Error('HealthCheckService not initialized. Must call start() before initializing API routes.');
    }

    const apiRoutes = createApiRouter(
      this.dbManager,
      this.connectionManager,
      this.jobQueueService,
      this.fileScannerScheduler,
      this.providerUpdaterScheduler
    );
    this.express.use('/api', apiRoutes);

    // Webhook routes (with dependency injection) - requires DB connection, connection manager, and job queue
    const webhookRoutes = createWebhookRouter(this.dbManager, this.connectionManager, this.jobQueueService);
    this.express.use('/webhooks', webhookRoutes);
  }

  private initializeErrorHandling(): void {
    // Error logging middleware
    this.express.use(errorLoggingMiddleware);

    // 404 handler
    this.express.use(notFoundHandler);

    // Global error handler
    this.express.use(errorHandler);
  }

  public async start(): Promise<void> {
    try {
      // Validate configuration
      ConfigManager.getInstance().validate();

      // Connect to database
      await this.dbManager.connect();
      logger.info('Database connected successfully');

      // Start database health checks (every 30 seconds)
      this.dbManager.startHealthCheck(30000);
      logger.info('Database health checks started');

      // Run migrations
      const migrationRunner = new MigrationRunner(this.dbManager.getConnection());
      await migrationRunner.migrate();
      logger.info('Database migrations completed');

      // Initialize WebSocket server
      this.wsServer.attach(this.httpServer);
      logger.info('WebSocket server attached to HTTP server');

      // Initialize WebSocket broadcaster
      websocketBroadcaster.initialize(this.wsServer);
      logger.info('WebSocket broadcaster initialized');

      // Initialize WebSocket controller (register message handlers)
      this.wsController.initialize();
      logger.info('WebSocket controller initialized');

      // Initialize cache service
      await cacheService.initialize(this.dbManager);
      logger.info('Cache service initialized');

      // Initialize job queue service with modular storage
      const jobQueueStorage = new SQLiteJobQueueStorage(this.dbManager.getConnection());
      this.jobQueueService = new JobQueueService(jobQueueStorage);

      // Initialize job queue (crash recovery)
      await this.jobQueueService.initialize();
      logger.info('Job queue initialized (crash recovery complete)');

      // Initialize notification config service
      const notificationConfig = new NotificationConfigService(this.dbManager.getConnection());
      logger.info('Notification config service initialized');

      // Initialize phase config service
      const phaseConfig = new PhaseConfigService(this.dbManager.getConnection());
      logger.info('Phase config service initialized');

      // Register all job handlers with job queue
      registerAllJobHandlers(this.jobQueueService, {
        db: this.dbManager.getConnection(),
        dbManager: this.dbManager,
        jobQueue: this.jobQueueService,
        phaseConfig,
        cacheDir: path.join(process.cwd(), 'data', 'cache'),
        notificationConfig,
        mediaPlayerManager: this.connectionManager,
        tmdbClient: undefined, // Will be initialized by AssetJobHandlers if needed
      });
      logger.info('Job handlers registered');

      // Start job queue processing
      this.jobQueueService.start();
      logger.info('Job queue service started');

      // Initialize schedulers (BEFORE API routes so they can be injected)
      this.fileScannerScheduler = new FileScannerScheduler(
        this.dbManager,
        this.jobQueueService,
        60000 // Check every 60 seconds
      );
      this.fileScannerScheduler.start();
      logger.info('File scanner scheduler started');

      this.providerUpdaterScheduler = new ProviderUpdaterScheduler(
        this.dbManager,
        this.jobQueueService,
        300000 // Check every 5 minutes
      );
      this.providerUpdaterScheduler.start();
      logger.info('Provider updater scheduler started');

      // Initialize health check service for providers
      const providerRegistry = ProviderRegistry.getInstance();
      this.healthCheckService = new HealthCheckService(providerRegistry);
      this.healthCheckService.start();
      logger.info('Provider health check service started');

      // Initialize API routes (now that DB is connected and schedulers are ready)
      this.initializeApiRoutes();
      logger.info('API routes initialized');

      // Initialize error handling (MUST be after all routes)
      this.initializeErrorHandling();
      logger.info('Error handlers initialized');

      // Set up media player activity state broadcasting
      this.connectionManager.on('activityStateChanged', (state) => {
        this.wsServer.broadcastToAll({
          type: 'player:activity',
          payload: state,
          timestamp: new Date().toISOString(),
        });
      });
      logger.info('Media player activity broadcasting configured');

      // Reconnect all enabled media players
      await this.connectionManager.reconnectAll();
      logger.info('Media player connections initialized');

      // Start garbage collection scheduler
      this.garbageCollector.start();
      logger.info('Garbage collection scheduler started');

      // Start server
      const { port, host } = this.config.server;
      this.httpServer.listen(port, host, () => {
        logger.info(`Metarr server started on ${host}:${port}`);
        logger.info(`WebSocket available at ws://${host}:${port}/ws`);
        logger.info(`Environment: ${this.config.server.env}`);
        logger.info(`Database: ${this.config.database.type}`);
      });
    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  public async stop(): Promise<void> {
    try {
      // Stop job queue processing
      if (this.jobQueueService) {
        this.jobQueueService.stop();
        logger.info('Job queue service stopped');
      }

      // Stop schedulers
      if (this.fileScannerScheduler) {
        this.fileScannerScheduler.stop();
        logger.info('File scanner scheduler stopped');
      }

      if (this.providerUpdaterScheduler) {
        this.providerUpdaterScheduler.stop();
        logger.info('Provider updater scheduler stopped');
      }

      // Stop garbage collection scheduler
      this.garbageCollector.stop();
      logger.info('Garbage collection scheduler stopped');

      // Shutdown WebSocket server
      await this.wsServer.shutdown();
      logger.info('WebSocket server closed');

      // Shutdown all media player connections
      await this.connectionManager.shutdown();
      logger.info('Media player connections closed');

      await this.dbManager.disconnect();
      logger.info('Server stopped gracefully');
    } catch (error) {
      logger.error('Error during server shutdown:', error);
    }
  }

  public getDatabaseManager(): DatabaseManager {
    return this.dbManager;
  }
}
