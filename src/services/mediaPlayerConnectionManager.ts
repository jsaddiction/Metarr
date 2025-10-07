import { EventEmitter } from 'events';
import { MediaPlayer } from '../types/models.js';
import { KodiWebSocketClient, ConnectionState } from './players/KodiWebSocketClient.js';
import { KodiHttpClient } from './players/KodiHttpClient.js';
import { logger } from '../middleware/logging.js';
import { DatabaseManager } from '../database/DatabaseManager.js';

export interface MediaPlayerStatus {
  id: number;
  name: string;
  type: string;
  connectionStatus: 'connected' | 'disconnected' | 'error';
  jsonRpcVersion?: string;
  lastConnected?: Date | undefined;
  lastError?: string | undefined;
}

/**
 * Manages all active media player connections
 */
export class MediaPlayerConnectionManager extends EventEmitter {
  private connections: Map<number, KodiWebSocketClient> = new Map();
  private httpClients: Map<number, KodiHttpClient> = new Map();
  private dbManager: DatabaseManager;

  constructor(dbManager: DatabaseManager) {
    super();
    this.dbManager = dbManager;
  }

  /**
   * Connect to a media player
   */
  async connectPlayer(player: MediaPlayer): Promise<void> {
    if (player.type !== 'kodi') {
      throw new Error(`Unsupported media player type: ${player.type}`);
    }

    if (!player.enabled) {
      logger.info(`Skipping disabled player: ${player.name}`);
      return;
    }

    try {
      // Create HTTP client (always available as fallback)
      const httpClient = new KodiHttpClient({
        host: player.host,
        port: player.port,
        ...(player.username && { username: player.username }),
        ...(player.password && { password: player.password }),
      });
      this.httpClients.set(player.id, httpClient);

      // If WebSocket is preferred and enabled, try to connect
      if (player.useWebsocket) {
        const wsClient = new KodiWebSocketClient({
          host: player.host,
          port: player.port,
          ...(player.username && { username: player.username }),
          ...(player.password && { password: player.password }),
        });

        // Set up event listeners
        wsClient.on('connected', () => this.handleConnected(player.id, wsClient));
        wsClient.on('disconnected', () => this.handleDisconnected(player.id));
        wsClient.on('error', error => this.handleError(player.id, error));
        wsClient.on('stateChange', state => this.handleStateChange(player.id, state));
        wsClient.on('notification', notification =>
          this.handleNotification(player.id, notification)
        );

        // Attempt connection
        await wsClient.connect();
        this.connections.set(player.id, wsClient);

        // Detect and store version
        try {
          const version = await wsClient.detectVersion();
          await this.updatePlayerVersion(player.id, version.version);
        } catch (error) {
          logger.warn(`Failed to detect version for player ${player.id}`, { error });
        }
      } else {
        // HTTP-only mode
        await this.updatePlayerConnectionStatus(player.id, 'disconnected');
      }
    } catch (error: any) {
      logger.error(`Failed to connect to player ${player.id}`, { error: error.message });
      await this.updatePlayerConnectionStatus(player.id, 'error', error.message);
      throw error;
    }
  }

  /**
   * Disconnect from a media player
   */
  async disconnectPlayer(playerId: number): Promise<void> {
    const wsClient = this.connections.get(playerId);
    if (wsClient) {
      await wsClient.disconnect();
      this.connections.delete(playerId);
    }

    this.httpClients.delete(playerId);
    await this.updatePlayerConnectionStatus(playerId, 'disconnected');
  }

  /**
   * Reconnect all enabled players
   */
  async reconnectAll(): Promise<void> {
    try {
      const db = this.dbManager.getConnection();
      const result = await db.query('SELECT * FROM media_players WHERE enabled = true');

      const players = Array.isArray(result) ? result : (result as any).rows || [];
      logger.info(`Reconnecting ${players.length} enabled media players`);

      for (const player of players) {
        try {
          await this.connectPlayer(this.mapRowToPlayer(player));
        } catch (error) {
          logger.error(`Failed to reconnect player ${player.id}`, { error });
        }
      }
    } catch (error) {
      logger.error('Failed to reconnect media players', { error });
    }
  }

  /**
   * Get connection status for a player
   */
  getConnectionStatus(playerId: number): MediaPlayerStatus | null {
    const wsClient = this.connections.get(playerId);
    if (!wsClient) {
      return null;
    }

    const state = wsClient.getState();
    return {
      id: playerId,
      name: '', // Will be filled from database
      type: 'kodi',
      connectionStatus:
        state.status === 'connected'
          ? 'connected'
          : state.status === 'error'
            ? 'error'
            : 'disconnected',
      lastConnected: state.connectedAt,
      lastError: state.error,
    };
  }

  /**
   * Get all connection statuses
   */
  getAllConnectionStatuses(): MediaPlayerStatus[] {
    const statuses: MediaPlayerStatus[] = [];
    for (const [playerId] of this.connections) {
      const status = this.getConnectionStatus(playerId);
      if (status) {
        statuses.push(status);
      }
    }
    return statuses;
  }

  /**
   * Get WebSocket client for a player
   */
  getWebSocketClient(playerId: number): KodiWebSocketClient | undefined {
    return this.connections.get(playerId);
  }

  /**
   * Get HTTP client for a player
   */
  getHttpClient(playerId: number): KodiHttpClient | undefined {
    return this.httpClients.get(playerId);
  }

  /**
   * Test connection to a player
   */
  async testConnection(
    player: MediaPlayer
  ): Promise<{ success: boolean; version?: string; error?: string }> {
    try {
      if (player.useWebsocket) {
        // Test WebSocket connection
        const wsClient = new KodiWebSocketClient({
          host: player.host,
          port: player.port,
          ...(player.username && { username: player.username }),
          ...(player.password && { password: player.password }),
        });

        await wsClient.connect();
        const pingResult = await wsClient.ping();

        let version: string | undefined;
        try {
          const versionInfo = await wsClient.detectVersion();
          version = versionInfo.version;
        } catch (error) {
          logger.warn('Failed to detect version during test', { error });
        }

        await wsClient.disconnect();

        return { success: pingResult, ...(version && { version }) };
      } else {
        // Test HTTP connection
        const httpClient = new KodiHttpClient({
          host: player.host,
          port: player.port,
          ...(player.username && { username: player.username }),
          ...(player.password && { password: player.password }),
        });

        const pingResult = await httpClient.testConnection();

        let version: string | undefined;
        try {
          const versionInfo = await httpClient.detectVersion();
          version = versionInfo.version;
        } catch (error) {
          logger.warn('Failed to detect version during test', { error });
        }

        return { success: pingResult, ...(version && { version }) };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Shutdown all connections
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down all media player connections');

    const disconnectPromises: Promise<void>[] = [];
    for (const [playerId] of this.connections) {
      disconnectPromises.push(this.disconnectPlayer(playerId));
    }

    await Promise.all(disconnectPromises);
    this.connections.clear();
    this.httpClients.clear();
  }

  /**
   * Handle connected event
   */
  private async handleConnected(playerId: number, _client: KodiWebSocketClient): Promise<void> {
    logger.info(`Player ${playerId} connected`);
    await this.updatePlayerConnectionStatus(playerId, 'connected');
    this.emit('playerConnected', playerId);
  }

  /**
   * Handle disconnected event
   */
  private async handleDisconnected(playerId: number): Promise<void> {
    logger.info(`Player ${playerId} disconnected`);
    await this.updatePlayerConnectionStatus(playerId, 'disconnected');
    this.emit('playerDisconnected', playerId);
  }

  /**
   * Handle error event
   */
  private async handleError(playerId: number, error: Error): Promise<void> {
    logger.error(`Player ${playerId} error`, { error: error.message });
    await this.updatePlayerConnectionStatus(playerId, 'error', error.message);
    this.emit('playerError', playerId, error);
  }

  /**
   * Handle state change event
   */
  private handleStateChange(playerId: number, state: ConnectionState): void {
    logger.debug(`Player ${playerId} state change`, { state });
    this.emit('playerStateChange', playerId, state);
  }

  /**
   * Handle notification from Kodi
   */
  private handleNotification(playerId: number, notification: any): void {
    logger.debug(`Player ${playerId} notification`, { notification });
    this.emit('playerNotification', playerId, notification);
  }

  /**
   * Update player connection status in database
   */
  private async updatePlayerConnectionStatus(
    playerId: number,
    status: 'connected' | 'disconnected' | 'error',
    error?: string
  ): Promise<void> {
    try {
      const db = this.dbManager.getConnection();
      await db.execute(
        `UPDATE media_players
         SET connection_status = ?,
             last_connected = ?,
             last_error = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [status, status === 'connected' ? new Date().toISOString() : null, error || null, playerId]
      );
    } catch (error) {
      logger.error(`Failed to update player ${playerId} status in database`, { error });
    }
  }

  /**
   * Update player JSON-RPC version in database
   */
  private async updatePlayerVersion(playerId: number, version: string): Promise<void> {
    try {
      const db = this.dbManager.getConnection();
      await db.execute(
        `UPDATE media_players
         SET json_rpc_version = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [version, playerId]
      );
    } catch (error) {
      logger.error(`Failed to update player ${playerId} version in database`, { error });
    }
  }

  /**
   * Map database row to MediaPlayer object
   */
  private mapRowToPlayer(row: any): MediaPlayer {
    const player: MediaPlayer = {
      id: row.id,
      name: row.name,
      type: row.type,
      host: row.host,
      port: row.port,
      username: row.username,
      password: row.password,
      apiKey: row.api_key,
      enabled: Boolean(row.enabled),
      libraryPaths: JSON.parse(row.library_paths || '[]'),
      libraryGroup: row.library_group,
      connectionStatus: row.connection_status || 'disconnected',
      jsonRpcVersion: row.json_rpc_version,
      useWebsocket: Boolean(row.use_websocket),
      config: JSON.parse(row.config || '{}'),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };

    if (row.last_connected) {
      player.lastConnected = new Date(row.last_connected);
    }

    if (row.last_error) {
      player.lastError = row.last_error;
    }

    if (row.last_sync) {
      player.lastSync = new Date(row.last_sync);
    }

    return player;
  }
}
