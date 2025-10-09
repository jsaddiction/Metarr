import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer, Server as HttpServer } from 'http';
import { ConfigManager } from './config/ConfigManager.js';
import { DatabaseManager } from './database/DatabaseManager.js';
import { MigrationRunner } from './database/migrationRunner.js';
import { MediaPlayerConnectionManager } from './services/mediaPlayerConnectionManager.js';
import { GarbageCollectionService } from './services/garbageCollectionService.js';
import { MetarrWebSocketServer } from './services/websocketServer.js';
import { websocketBroadcaster } from './services/websocketBroadcaster.js';
import { WebSocketController } from './controllers/websocketController.js';
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

    // Body parsing
    this.express.use(express.json({ limit: '10mb' }));
    this.express.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.express.use(requestLoggingMiddleware);

    // Rate limiting
    this.express.use('/api', rateLimitByIp(60000, 100)); // 100 requests per minute
    this.express.use('/webhooks', rateLimitByIp(60000, 30)); // 30 webhook requests per minute

    // Static files
    this.express.use(express.static(path.join(__dirname, '../public')));
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
    const apiRoutes = createApiRouter(this.dbManager, this.connectionManager);
    this.express.use('/api', apiRoutes);

    // Webhook routes (with dependency injection) - requires DB connection
    const webhookRoutes = createWebhookRouter(this.dbManager);
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

      // Run migrations
      const migrationRunner = new MigrationRunner(this.dbManager.getConnection());
      await migrationRunner.migrate();
      logger.info('Database migrations completed');

      // Initialize API routes (now that DB is connected)
      this.initializeApiRoutes();
      logger.info('API routes initialized');

      // Initialize error handling (MUST be after all routes)
      this.initializeErrorHandling();
      logger.info('Error handlers initialized');

      // Initialize WebSocket server
      this.wsServer.attach(this.httpServer);
      logger.info('WebSocket server attached to HTTP server');

      // Initialize WebSocket broadcaster
      websocketBroadcaster.initialize(this.wsServer);
      logger.info('WebSocket broadcaster initialized');

      // Initialize WebSocket controller (register message handlers)
      this.wsController.initialize();
      logger.info('WebSocket controller initialized');

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
