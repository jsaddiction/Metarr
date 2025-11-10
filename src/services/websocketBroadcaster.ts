import { logger } from '../middleware/logging.js';
import { MetarrWebSocketServer } from './websocketServer.js';
import {
  PlayerStatusMessage,
  ScanStatusMessage,
  MoviesChangedMessage,
  LibraryChangedMessage,
  ResyncDataMessage,
} from '../types/websocket.js';

/**
 * WebSocket Broadcaster Service
 * Singleton service that provides convenience methods for broadcasting
 * state changes to connected WebSocket clients
 */
export class WebSocketBroadcaster {
  private static instance: WebSocketBroadcaster | null = null;
  private wsServer: MetarrWebSocketServer | null = null;

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): WebSocketBroadcaster {
    if (!WebSocketBroadcaster.instance) {
      WebSocketBroadcaster.instance = new WebSocketBroadcaster();
    }
    return WebSocketBroadcaster.instance;
  }

  /**
   * Initialize with WebSocket server instance
   */
  public initialize(wsServer: MetarrWebSocketServer): void {
    this.wsServer = wsServer;
    logger.info('WebSocket broadcaster initialized');
  }

  /**
   * Check if broadcaster is ready
   */
  private isReady(): boolean {
    if (!this.wsServer) {
      logger.warn('WebSocket broadcaster not initialized');
      return false;
    }
    return true;
  }

  // ============================================================================
  // Media Player Broadcasts
  // ============================================================================

  /**
   * Broadcast media player status update
   */
  public broadcastPlayerStatus(
    playerId: number,
    status: 'connected' | 'disconnected' | 'error',
    details?: {
      connectionStatus?: 'connected' | 'disconnected' | 'error';
      lastConnected?: Date;
      lastError?: string;
      jsonRpcVersion?: string;
    }
  ): void {
    if (!this.isReady()) return;

    const message: PlayerStatusMessage = {
      type: 'playerStatus',
      timestamp: new Date().toISOString(),
      playerId,
      status,
      connectionStatus: details?.connectionStatus,
      lastConnected: details?.lastConnected?.toISOString(),
      lastError: details?.lastError,
      jsonRpcVersion: details?.jsonRpcVersion,
    };

    this.wsServer!.broadcastToAll(message);
    logger.debug('Broadcasted player status update', { playerId, status });
  }

  // ============================================================================
  // Library Scan Broadcasts
  // ============================================================================

  /**
   * Broadcast library scan status update
   */
  public broadcastScanStatus(
    scanId: number,
    libraryId: number,
    status: 'running' | 'completed' | 'failed' | 'cancelled',
    progress: {
      current: number;
      total: number;
      currentFile?: string;
      errorsCount?: number;
    },
    stats?: {
      added?: number;
      updated?: number;
      deleted?: number;
      failed?: number;
    }
  ): void {
    if (!this.isReady()) return;

    const message: ScanStatusMessage = {
      type: 'scanStatus',
      timestamp: new Date().toISOString(),
      scanId,
      libraryId,
      status,
      progressCurrent: progress.current,
      progressTotal: progress.total,
      currentFile: progress.currentFile,
      errorsCount: progress.errorsCount,
      stats,
    };

    this.wsServer!.broadcastToAll(message);
    logger.debug('Broadcasted scan status update', { scanId, status, progress: `${progress.current}/${progress.total}` });
  }

  /**
   * Broadcast scan progress update
   */
  public broadcastScanProgress(
    scanId: number,
    libraryId: number,
    current: number,
    total: number,
    currentFile?: string
  ): void {
    const progress: {
      current: number;
      total: number;
      currentFile?: string;
    } = {
      current,
      total,
    };

    if (currentFile !== undefined) {
      progress.currentFile = currentFile;
    }

    this.broadcastScanStatus(scanId, libraryId, 'running', progress);
  }

  /**
   * Broadcast scan completed
   */
  public broadcastScanCompleted(
    scanId: number,
    libraryId: number,
    stats: {
      added?: number;
      updated?: number;
      deleted?: number;
      failed?: number;
    }
  ): void {
    this.broadcastScanStatus(
      scanId,
      libraryId,
      'completed',
      {
        current: 100,
        total: 100,
      },
      stats
    );
  }

  /**
   * Broadcast scan failed
   */
  public broadcastScanFailed(
    scanId: number,
    libraryId: number,
    current: number,
    total: number,
    errorsCount: number
  ): void {
    this.broadcastScanStatus(scanId, libraryId, 'failed', {
      current,
      total,
      errorsCount,
    });
  }

  /**
   * Broadcast scan cancelled
   */
  public broadcastScanCancelled(scanId: number, libraryId: number): void {
    this.broadcastScanStatus(scanId, libraryId, 'cancelled', {
      current: 0,
      total: 0,
    });
  }

  // ============================================================================
  // Movie Data Broadcasts
  // ============================================================================

  /**
   * Broadcast movies added
   */
  public broadcastMoviesAdded(movieIds: number[], movies?: any[]): void {
    if (!this.isReady()) return;

    const message: MoviesChangedMessage = {
      type: 'moviesChanged',
      timestamp: new Date().toISOString(),
      action: 'added',
      movieIds,
      movies,
    };

    this.wsServer!.broadcastToAll(message);
    logger.debug('Broadcasted movies added', { count: movieIds.length });
  }

  /**
   * Broadcast movies updated
   */
  public broadcastMoviesUpdated(movieIds: number[], movies?: any[]): void {
    if (!this.isReady()) return;

    const message: MoviesChangedMessage = {
      type: 'moviesChanged',
      timestamp: new Date().toISOString(),
      action: 'updated',
      movieIds,
      movies,
    };

    this.wsServer!.broadcastToAll(message);
    logger.info('Broadcasted movies updated WebSocket message', {
      count: movieIds.length,
      movieIds,
      action: 'updated'
    });
  }

  /**
   * Broadcast movies deleted
   */
  public broadcastMoviesDeleted(movieIds: number[]): void {
    if (!this.isReady()) return;

    const message: MoviesChangedMessage = {
      type: 'moviesChanged',
      timestamp: new Date().toISOString(),
      action: 'deleted',
      movieIds,
    };

    this.wsServer!.broadcastToAll(message);
    logger.debug('Broadcasted movies deleted', { count: movieIds.length });
  }

  // ============================================================================
  // Library Data Broadcasts
  // ============================================================================

  /**
   * Broadcast library added
   */
  public broadcastLibraryAdded(libraryId: number, library?: any): void {
    if (!this.isReady()) return;

    const message: LibraryChangedMessage = {
      type: 'libraryChanged',
      timestamp: new Date().toISOString(),
      action: 'added',
      libraryId,
      library,
    };

    this.wsServer!.broadcastToAll(message);
    logger.debug('Broadcasted library added', { libraryId });
  }

  /**
   * Broadcast library updated
   */
  public broadcastLibraryUpdated(libraryId: number, library?: any): void {
    if (!this.isReady()) return;

    const message: LibraryChangedMessage = {
      type: 'libraryChanged',
      timestamp: new Date().toISOString(),
      action: 'updated',
      libraryId,
      library,
    };

    this.wsServer!.broadcastToAll(message);
    logger.debug('Broadcasted library updated', { libraryId });
  }

  /**
   * Broadcast library deleted
   */
  public broadcastLibraryDeleted(libraryId: number): void {
    if (!this.isReady()) return;

    const message: LibraryChangedMessage = {
      type: 'libraryChanged',
      timestamp: new Date().toISOString(),
      action: 'deleted',
      libraryId,
    };

    this.wsServer!.broadcastToAll(message);
    logger.debug('Broadcasted library deleted', { libraryId });
  }

  // ============================================================================
  // Provider Scrape Broadcasts
  // ============================================================================

  /**
   * Broadcast provider scrape start
   */
  public broadcastProviderScrapeStart(movieId: number, providers: string[]): void {
    if (!this.isReady()) return;

    const message: import('../types/websocket.js').ProviderScrapeStartMessage = {
      type: 'providerScrapeStart',
      timestamp: new Date().toISOString(),
      movieId,
      providers,
    };

    this.wsServer!.broadcastToAll(message);
    logger.debug('Broadcasted provider scrape start', { movieId, providers });
  }

  /**
   * Broadcast provider scrape provider start
   */
  public broadcastProviderScrapeProviderStart(movieId: number, provider: string): void {
    if (!this.isReady()) return;

    const message: import('../types/websocket.js').ProviderScrapeProviderStartMessage = {
      type: 'providerScrapeProviderStart',
      timestamp: new Date().toISOString(),
      movieId,
      provider,
    };

    this.wsServer!.broadcastToAll(message);
    logger.debug('Broadcasted provider scrape provider start', { movieId, provider });
  }

  /**
   * Broadcast provider scrape provider complete
   */
  public broadcastProviderScrapeProviderComplete(
    movieId: number,
    provider: string,
    success: boolean
  ): void {
    if (!this.isReady()) return;

    const message: import('../types/websocket.js').ProviderScrapeProviderCompleteMessage = {
      type: 'providerScrapeProviderComplete',
      timestamp: new Date().toISOString(),
      movieId,
      provider,
      success,
    };

    this.wsServer!.broadcastToAll(message);
    logger.debug('Broadcasted provider scrape provider complete', { movieId, provider, success });
  }

  /**
   * Broadcast provider scrape provider retry
   */
  public broadcastProviderScrapeProviderRetry(
    movieId: number,
    provider: string,
    attempt: number,
    maxRetries: number
  ): void {
    if (!this.isReady()) return;

    const message: import('../types/websocket.js').ProviderScrapeProviderRetryMessage = {
      type: 'providerScrapeProviderRetry',
      timestamp: new Date().toISOString(),
      movieId,
      provider,
      attempt,
      maxRetries,
    };

    this.wsServer!.broadcastToAll(message);
    logger.debug('Broadcasted provider scrape provider retry', { movieId, provider, attempt, maxRetries });
  }

  /**
   * Broadcast provider scrape provider timeout
   */
  public broadcastProviderScrapeProviderTimeout(movieId: number, provider: string): void {
    if (!this.isReady()) return;

    const message: import('../types/websocket.js').ProviderScrapeProviderTimeoutMessage = {
      type: 'providerScrapeProviderTimeout',
      timestamp: new Date().toISOString(),
      movieId,
      provider,
    };

    this.wsServer!.broadcastToAll(message);
    logger.debug('Broadcasted provider scrape provider timeout', { movieId, provider });
  }

  /**
   * Broadcast provider scrape complete
   */
  public broadcastProviderScrapeComplete(
    movieId: number,
    completedProviders: string[],
    failedProviders: string[],
    timedOutProviders: string[]
  ): void {
    if (!this.isReady()) return;

    const message: import('../types/websocket.js').ProviderScrapeCompleteMessage = {
      type: 'providerScrapeComplete',
      timestamp: new Date().toISOString(),
      movieId,
      completedProviders,
      failedProviders,
      timedOutProviders,
    };

    this.wsServer!.broadcastToAll(message);
    logger.debug('Broadcasted provider scrape complete', { movieId, completedProviders, failedProviders, timedOutProviders });
  }

  /**
   * Broadcast provider scrape error
   */
  public broadcastProviderScrapeError(movieId: number, error: string): void {
    if (!this.isReady()) return;

    const message: import('../types/websocket.js').ProviderScrapeErrorMessage = {
      type: 'providerScrapeError',
      timestamp: new Date().toISOString(),
      movieId,
      error,
    };

    this.wsServer!.broadcastToAll(message);
    logger.debug('Broadcasted provider scrape error', { movieId, error });
  }

  // ============================================================================
  // Resync Broadcasts
  // ============================================================================

  /**
   * Send resync data to specific client
   */
  public sendResyncData(
    clientId: string,
    scope: 'all' | 'movies' | 'players' | 'libraries' | 'scans',
    data: {
      movies?: any[];
      players?: any[];
      libraries?: any[];
      scans?: any[];
    }
  ): void {
    if (!this.isReady()) return;

    const message: ResyncDataMessage = {
      type: 'resyncData',
      timestamp: new Date().toISOString(),
      scope,
      data,
    };

    this.wsServer!.sendToClient(clientId, message);
    logger.debug('Sent resync data to client', { clientId, scope });
  }

  // ============================================================================
  // Job Queue Broadcasts
  // ============================================================================

  /**
   * Broadcast job status update
   */
  public broadcastJobStatus(
    jobId: number,
    jobType: string,
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'retrying',
    payload?: unknown,
    error?: string
  ): void {
    if (!this.isReady()) return;

    const message: import('../types/websocket.js').JobStatusMessage = {
      type: 'jobStatus',
      timestamp: new Date().toISOString(),
      jobId,
      jobType,
      status,
      ...(payload !== undefined && { payload }),
      ...(error !== undefined && { error }),
    };

    this.wsServer!.broadcastToAll(message);
    logger.debug('Broadcasted job status update', { jobId, jobType, status });
  }

  /**
   * Broadcast job queue statistics
   */
  public broadcastJobQueueStats(stats: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    retrying: number;
  }): void {
    if (!this.isReady()) return;

    const message: import('../types/websocket.js').JobQueueStatsMessage = {
      type: 'jobQueueStats',
      timestamp: new Date().toISOString(),
      ...stats,
    };

    this.wsServer!.broadcastToAll(message);
    logger.debug('Broadcasted job queue stats', stats);
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Generic broadcast method for custom messages
   * Use this for messages that don't have a specific typed method
   */
  public broadcast(eventType: string, data: any): void {
    if (!this.isReady()) return;

    const message = {
      type: eventType,
      timestamp: new Date().toISOString(),
      ...data,
    };

    this.wsServer!.broadcastToAll(message);
    logger.info('Broadcasted WebSocket message', { eventType, data });
  }

  /**
   * Get connected client count
   */
  public getClientCount(): number {
    if (!this.isReady()) return 0;
    return this.wsServer!.getClientCount();
  }

  /**
   * Check if any clients are connected
   */
  public hasClients(): boolean {
    return this.getClientCount() > 0;
  }
}

// Export singleton instance
export const websocketBroadcaster = WebSocketBroadcaster.getInstance();
