import { logger } from '../middleware/logging.js';
import { DatabaseManager } from '../database/DatabaseManager.js';
import { MovieService } from '../services/movieService.js';
import { MediaPlayerService } from '../services/mediaPlayerService.js';
import { MediaPlayerConnectionManager } from '../services/mediaPlayerConnectionManager.js';
import { LibraryService } from '../services/libraryService.js';
import { LibraryScanService } from '../services/libraryScanService.js';
import { ImageService } from '../services/imageService.js';
import { MetarrWebSocketServer } from '../services/websocketServer.js';
import { websocketBroadcaster } from '../services/websocketBroadcaster.js';
import {
  ClientMessage,
  ResyncMessage,
  UpdateMovieMessage,
  DeleteImageMessage,
  UpdatePlayerMessage,
  StartLibraryScanMessage,
  CancelLibraryScanMessage,
  AckMessage,
} from '../types/websocket.js';
import { ApplicationError, DatabaseError, ErrorCode } from '../errors/index.js';
import { getErrorMessage } from '../utils/errorHandling.js';

/**
 * WebSocket Controller
 * Handles incoming WebSocket messages and routes them to appropriate services
 */
export class WebSocketController {
  private movieService: MovieService;
  private mediaPlayerService: MediaPlayerService;
  private libraryService: LibraryService;
  private libraryScanService: LibraryScanService;
  private imageService: ImageService;
  private wsServer: MetarrWebSocketServer;

  constructor(
    dbManager: DatabaseManager,
    connectionManager: MediaPlayerConnectionManager,
    wsServer: MetarrWebSocketServer,
    jobQueue?: unknown // JobQueueService - optional for backward compatibility
  ) {
    // Type guard: ensure jobQueue is JobQueueService or undefined
    const typedJobQueue = jobQueue as import('../services/jobQueue/JobQueueService.js').JobQueueService | undefined;
    this.movieService = new MovieService(dbManager, typedJobQueue);
    this.mediaPlayerService = new MediaPlayerService(dbManager, connectionManager);
    this.libraryService = new LibraryService(dbManager);
    // Note: LibraryScanService requires jobQueue but websocketController may not have it
    // This is a known limitation - library scans via websocket won't work until jobQueue is passed
    this.libraryScanService = typedJobQueue
      ? new LibraryScanService(dbManager, typedJobQueue)
      : null as unknown as LibraryScanService; // Type assertion to avoid breaking changes
    this.imageService = new ImageService(dbManager);
    this.wsServer = wsServer;
  }

  /**
   * Initialize the controller - register message handler with WebSocket server
   */
  public initialize(): void {
    this.wsServer.onMessage((clientId: string, message: ClientMessage) => {
      this.handleMessage(clientId, message);
    });

    logger.info('WebSocket controller initialized');
  }

  /**
   * Route incoming messages to appropriate handlers
   */
  private async handleMessage(clientId: string, message: ClientMessage): Promise<void> {
    try {
      logger.debug(`Processing WebSocket message from ${clientId}`, {
        clientId,
        type: message.type,
        requestId: message.requestId,
      });

      switch (message.type) {
        case 'resync':
          await this.handleResync(clientId, message as ResyncMessage);
          break;

        case 'updateMovie':
          await this.handleUpdateMovie(clientId, message as UpdateMovieMessage);
          break;

        case 'deleteImage':
          await this.handleDeleteImage(clientId, message as DeleteImageMessage);
          break;

        case 'updatePlayer':
          await this.handleUpdatePlayer(clientId, message as UpdatePlayerMessage);
          break;

        case 'startLibraryScan':
          await this.handleStartLibraryScan(clientId, message as StartLibraryScanMessage);
          break;

        case 'cancelLibraryScan':
          await this.handleCancelLibraryScan(clientId, message as CancelLibraryScanMessage);
          break;

        default:
          logger.warn(`Unknown WebSocket message type: ${message.type}`, {
            clientId,
            type: message.type,
          });
          this.wsServer.sendError(
            clientId,
            `Unknown message type: ${message.type}`,
            'UNKNOWN_MESSAGE_TYPE',
            message.type
          );
      }
    } catch (error) {
      logger.error(`Error handling WebSocket message from ${clientId}`, {
        clientId,
        type: message.type,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      this.wsServer.sendError(
        clientId,
        error instanceof Error ? error.message : 'Internal server error',
        'HANDLER_ERROR',
        message.type
      );
    }
  }

  // ============================================================================
  // Message Handlers
  // ============================================================================

  /**
   * Handle resync request - send full data snapshot to client
   */
  private async handleResync(clientId: string, message: ResyncMessage): Promise<void> {
    const scope = message.scope || 'all';
    logger.info(`Handling resync request from ${clientId}`, { clientId, scope });

    try {
      const data: Record<string, unknown> = {};

      if (scope === 'all' || scope === 'movies') {
        const moviesResult = await this.movieService.getAll({ limit: 10000 });
        data.movies = moviesResult.movies;
      }

      if (scope === 'all' || scope === 'players') {
        const players = await this.mediaPlayerService.getAll();
        data.players = players;
      }

      if (scope === 'all' || scope === 'libraries') {
        const libraries = await this.libraryService.getAll();
        data.libraries = libraries;
      }

      if (scope === 'all' || scope === 'scans') {
        const scans = await this.libraryScanService.getActiveScanJobs();
        data.scans = scans;
      }

      // Send resync data
      websocketBroadcaster.sendResyncData(clientId, scope, data);

      // Send acknowledgment
      this.sendAck(clientId, message.type, message.requestId);
    } catch (error) {
      logger.error(`Failed to handle resync for ${clientId}`, {
        clientId,
        scope,
        error: error instanceof Error ? error.message : String(error),
      });

      // Let ApplicationError instances propagate
      if (error instanceof ApplicationError) {
        throw error;
      }

      // Wrap unknown errors
      throw new DatabaseError(
        `Failed to handle resync: ${getErrorMessage(error)}`,
        ErrorCode.DATABASE_QUERY_FAILED,
        true,
        {
          service: 'WebSocketController',
          operation: 'handleResync',
          metadata: { clientId, scope }
        },
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Handle movie update request
   */
  private async handleUpdateMovie(clientId: string, message: UpdateMovieMessage): Promise<void> {
    logger.info(`Handling updateMovie request from ${clientId}`, {
      clientId,
      movieId: message.movieId,
      updates: Object.keys(message.updates),
    });

    try {
      // Validate movie exists
      const movie = await this.movieService.getById(message.movieId);
      if (!movie) {
        this.wsServer.sendError(
          clientId,
          `Movie not found: ${message.movieId}`,
          'MOVIE_NOT_FOUND',
          message.type
        );
        return;
      }

      // Update movie metadata using MovieService
      await this.movieService.updateMetadata(message.movieId, message.updates);

      logger.info('Movie updated successfully via WebSocket', {
        movieId: message.movieId,
        updatedFields: Object.keys(message.updates)
      });

      // Send acknowledgment
      this.sendAck(clientId, message.type, message.requestId, 'Movie updated successfully');

      // Broadcast change to all clients
      websocketBroadcaster.broadcastMoviesUpdated([message.movieId]);
    } catch (error) {
      logger.error(`Failed to update movie for ${clientId}`, {
        clientId,
        movieId: message.movieId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Let ApplicationError instances propagate
      if (error instanceof ApplicationError) {
        throw error;
      }

      // Wrap unknown errors
      throw new DatabaseError(
        `Failed to update movie: ${getErrorMessage(error)}`,
        ErrorCode.DATABASE_QUERY_FAILED,
        true,
        {
          service: 'WebSocketController',
          operation: 'handleUpdateMovie',
          metadata: { clientId, movieId: message.movieId }
        },
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Handle image deletion request
   */
  private async handleDeleteImage(clientId: string, message: DeleteImageMessage): Promise<void> {
    logger.info(`Handling deleteImage request from ${clientId}`, {
      clientId,
      imageId: message.imageId,
      entityType: message.entityType,
      entityId: message.entityId,
    });

    try {
      // Delete image using ImageService
      await this.imageService.deleteImage(message.imageId);

      // Send acknowledgment
      this.sendAck(clientId, message.type, message.requestId, 'Image deleted successfully');

      // Broadcast change to all clients (movie updated)
      if (message.entityType === 'movie') {
        websocketBroadcaster.broadcastMoviesUpdated([message.entityId]);
      }
    } catch (error) {
      logger.error(`Failed to delete image for ${clientId}`, {
        clientId,
        imageId: message.imageId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Let ApplicationError instances propagate
      if (error instanceof ApplicationError) {
        throw error;
      }

      // Wrap unknown errors
      throw new DatabaseError(
        `Failed to delete image: ${getErrorMessage(error)}`,
        ErrorCode.DATABASE_QUERY_FAILED,
        true,
        {
          service: 'WebSocketController',
          operation: 'handleDeleteImage',
          metadata: { clientId, imageId: message.imageId, entityType: message.entityType }
        },
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Handle player update request
   */
  private async handleUpdatePlayer(clientId: string, message: UpdatePlayerMessage): Promise<void> {
    logger.info(`Handling updatePlayer request from ${clientId}`, {
      clientId,
      playerId: message.playerId,
      updates: Object.keys(message.updates),
    });

    try {
      // Validate player exists
      const player = await this.mediaPlayerService.getById(message.playerId);
      if (!player) {
        this.wsServer.sendError(
          clientId,
          `Player not found: ${message.playerId}`,
          'PLAYER_NOT_FOUND',
          message.type
        );
        return;
      }

      // Update player
      await this.mediaPlayerService.update({
        id: message.playerId,
        ...message.updates,
      });

      // Send acknowledgment
      this.sendAck(clientId, message.type, message.requestId, 'Player updated successfully');

      // Broadcast is handled by MediaPlayerConnectionManager events
    } catch (error) {
      logger.error(`Failed to update player for ${clientId}`, {
        clientId,
        playerId: message.playerId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Let ApplicationError instances propagate
      if (error instanceof ApplicationError) {
        throw error;
      }

      // Wrap unknown errors
      throw new DatabaseError(
        `Failed to update player: ${getErrorMessage(error)}`,
        ErrorCode.DATABASE_QUERY_FAILED,
        true,
        {
          service: 'WebSocketController',
          operation: 'handleUpdatePlayer',
          metadata: { clientId, playerId: message.playerId }
        },
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Handle start library scan request
   */
  private async handleStartLibraryScan(
    clientId: string,
    message: StartLibraryScanMessage
  ): Promise<void> {
    logger.info(`Handling startLibraryScan request from ${clientId}`, {
      clientId,
      libraryId: message.libraryId,
    });

    try {
      // Validate library exists
      const library = await this.libraryService.getById(message.libraryId);
      if (!library) {
        this.wsServer.sendError(
          clientId,
          `Library not found: ${message.libraryId}`,
          'LIBRARY_NOT_FOUND',
          message.type
        );
        return;
      }

      // Start scan
      const scanJob = await this.libraryScanService.startScan(message.libraryId);

      // Send acknowledgment with scan job info
      this.sendAck(
        clientId,
        message.type,
        message.requestId,
        `Library scan started (scanId: ${scanJob.id})`
      );

      // Broadcast is handled by LibraryScanService events
    } catch (error) {
      logger.error(`Failed to start library scan for ${clientId}`, {
        clientId,
        libraryId: message.libraryId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Let ApplicationError instances propagate
      if (error instanceof ApplicationError) {
        throw error;
      }

      // Wrap unknown errors
      throw new DatabaseError(
        `Failed to start library scan: ${getErrorMessage(error)}`,
        ErrorCode.DATABASE_QUERY_FAILED,
        true,
        {
          service: 'WebSocketController',
          operation: 'handleStartLibraryScan',
          metadata: { clientId, libraryId: message.libraryId }
        },
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Handle cancel library scan request
   */
  private async handleCancelLibraryScan(
    clientId: string,
    message: CancelLibraryScanMessage
  ): Promise<void> {
    logger.info(`Handling cancelLibraryScan request from ${clientId}`, {
      clientId,
      scanId: message.scanId,
    });

    try {
      // Cancel the scan
      const cancelled = await this.libraryScanService.cancelScan(message.scanId);

      if (!cancelled) {
        this.wsServer.sendError(
          clientId,
          `Failed to cancel scan ${message.scanId}`,
          'SCAN_CANCEL_FAILED',
          message.type
        );
        return;
      }

      logger.info('Scan cancellation requested', { scanId: message.scanId });

      // Send acknowledgment
      this.sendAck(
        clientId,
        message.type,
        message.requestId,
        `Scan ${message.scanId} cancellation requested`
      );

      // Broadcast is handled by LibraryScanService events
    } catch (error) {
      logger.error(`Failed to cancel library scan for ${clientId}`, {
        clientId,
        scanId: message.scanId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Let ApplicationError instances propagate
      if (error instanceof ApplicationError) {
        throw error;
      }

      // Wrap unknown errors
      throw new DatabaseError(
        `Failed to cancel library scan: ${getErrorMessage(error)}`,
        ErrorCode.DATABASE_QUERY_FAILED,
        true,
        {
          service: 'WebSocketController',
          operation: 'handleCancelLibraryScan',
          metadata: { clientId, scanId: message.scanId }
        },
        error instanceof Error ? error : undefined
      );
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Send acknowledgment message to client
   */
  private sendAck(
    clientId: string,
    originalType: string,
    requestId?: string,
    message?: string
  ): void {
    const ackMsg: AckMessage = {
      type: 'ack',
      timestamp: new Date().toISOString(),
      originalType,
      success: true,
      message,
      requestId,
    };

    this.wsServer.sendToClient(clientId, ackMsg);
  }
}
