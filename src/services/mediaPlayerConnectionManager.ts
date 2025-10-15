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
   * Validate group membership constraints
   * Ensures groups don't exceed max_members limit
   */
  async validateGroupMembership(groupId: number, excludePlayerId?: number): Promise<void> {
    const db = this.dbManager.getConnection();

    // Get group max_members constraint
    const groups = await db.query<{ max_members: number | null }>(
      'SELECT max_members FROM media_player_groups WHERE id = ?',
      [groupId]
    );

    if (groups.length === 0) {
      throw new Error(`Media player group ${groupId} not found`);
    }

    const maxMembers = groups[0].max_members;

    // NULL = unlimited (Kodi groups)
    if (maxMembers === null) {
      return;
    }

    // Count current members (exclude player being updated/removed)
    const countQuery = excludePlayerId
      ? 'SELECT COUNT(*) as count FROM media_players WHERE group_id = ? AND id != ?'
      : 'SELECT COUNT(*) as count FROM media_players WHERE group_id = ?';

    const countParams = excludePlayerId ? [groupId, excludePlayerId] : [groupId];
    const result = await db.query<{ count: number }>(countQuery, countParams);
    const currentCount = result[0].count;

    // Check if adding a new member would exceed limit
    if (currentCount >= maxMembers) {
      throw new Error(
        `Cannot add player to group ${groupId}: maximum ${maxMembers} member(s) allowed`
      );
    }
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

  /**
   * Ping one instance in a media player group (with fallback)
   * Returns the player that responded successfully
   */
  async pingGroup(groupId: number): Promise<{
    success: boolean;
    playerId?: number;
    playerName?: string;
    error?: string;
  }> {
    const db = this.dbManager.getConnection();

    // Get all enabled players in group
    const players = await db.query<{
      id: number;
      name: string;
      host: string;
      port: number;
      username: string | null;
      password: string | null;
    }>(
      `SELECT id, name, host, port, username, password
       FROM media_players
       WHERE group_id = ? AND enabled = 1
       ORDER BY id ASC`,
      [groupId]
    );

    if (players.length === 0) {
      return { success: false, error: 'No enabled players in group' };
    }

    // Try each player until one responds
    for (const player of players) {
      try {
        const httpClient = new KodiHttpClient({
          host: player.host,
          port: player.port,
          ...(player.username && { username: player.username }),
          ...(player.password && { password: player.password }),
        });

        const pingResult = await httpClient.testConnection();

        if (pingResult) {
          logger.info('Group ping successful', {
            groupId,
            playerId: player.id,
            playerName: player.name,
          });

          return {
            success: true,
            playerId: player.id,
            playerName: player.name,
          };
        }
      } catch (error: any) {
        logger.warn('Player ping failed, trying next in group', {
          groupId,
          playerId: player.id,
          error: error.message,
        });
        // Continue to next player
      }
    }

    return { success: false, error: 'All players in group failed to respond' };
  }

  /**
   * Send notification to one instance in a media player group (with fallback)
   */
  async notifyGroup(
    groupId: number,
    notification: {
      title: string;
      message: string;
      image?: string;
      displaytime?: number;
    }
  ): Promise<{
    success: boolean;
    playerId?: number;
    playerName?: string;
    error?: string;
  }> {
    const db = this.dbManager.getConnection();

    // Get all enabled players in group
    const players = await db.query<{
      id: number;
      name: string;
    }>(
      `SELECT id, name
       FROM media_players
       WHERE group_id = ? AND enabled = 1
       ORDER BY id ASC`,
      [groupId]
    );

    if (players.length === 0) {
      return { success: false, error: 'No enabled players in group' };
    }

    // Try each player until one succeeds
    for (const player of players) {
      try {
        const httpClient = this.httpClients.get(player.id);
        if (!httpClient) {
          logger.warn('HTTP client not available, trying next player', {
            playerId: player.id,
          });
          continue;
        }

        await httpClient.showNotification(notification);

        logger.info('Group notification sent successfully', {
          groupId,
          playerId: player.id,
          playerName: player.name,
          title: notification.title,
        });

        return {
          success: true,
          playerId: player.id,
          playerName: player.name,
        };
      } catch (error: any) {
        logger.warn('Player notification failed, trying next in group', {
          groupId,
          playerId: player.id,
          error: error.message,
        });
        // Continue to next player
      }
    }

    return { success: false, error: 'All players in group failed to show notification' };
  }
}
