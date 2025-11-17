import { EventEmitter } from 'events';
import { MediaPlayer, PlayerActivityState } from '../types/models.js';
import { MediaPlayerRow } from '../types/database-models.js';
import { KodiWebSocketClient, ConnectionState } from './players/KodiWebSocketClient.js';
import { KodiHttpClient } from './players/KodiHttpClient.js';
import { logger } from '../middleware/logging.js';
import { DatabaseManager } from '../database/DatabaseManager.js';
import { getErrorMessage, getErrorStack } from '../utils/errorHandling.js';
import { KodiNotification, KodiPlayerNotificationParams, Player } from '../types/jsonrpc.js';
import { ResourceNotFoundError, NotImplementedError, ConfigurationError } from '../errors/index.js';

export interface MediaPlayerStatus {
  id: number;
  name: string;
  type: string;
  connection_status: 'connected' | 'disconnected' | 'error';
  jsonRpcVersion?: string;
  last_connected?: Date | undefined;
  last_error?: string | undefined;
}

/**
 * Manages all active media player connections
 */
interface PlayerConnectionState {
  wsClient?: KodiWebSocketClient;
  httpClient: KodiHttpClient;
  mode: 'websocket' | 'http' | 'retrying' | 'backoff';
  retryCount: number;
  pollingInterval?: NodeJS.Timeout;
  retryTimeout?: NodeJS.Timeout;
  lastPollTime?: Date;
  lastRetryTime?: Date;
  progressPollingInterval?: NodeJS.Timeout; // Poll playback progress
  activeKodiPlayerId?: number; // Kodi's player ID (0=video, 1=music, 2=pictures)
}

export class MediaPlayerConnectionManager extends EventEmitter {
  private connections: Map<number, PlayerConnectionState> = new Map();
  private activityStates: Map<number, PlayerActivityState> = new Map();
  private readonly WS_PORT = 9090; // Hardcoded WebSocket port
  private readonly HTTP_POLL_INTERVAL = 30000; // 30 seconds for HTTP polling
  private readonly PROGRESS_POLL_INTERVAL = 3000; // 3 seconds for playback progress (fast enough for accurate time display)

  constructor(private readonly dbManager: DatabaseManager) {
    super();
  }

  /**
   * Get current activity state for a player
   */
  getActivityState(playerId: number): PlayerActivityState | null {
    return this.activityStates.get(playerId) || null;
  }

  /**
   * Get all activity states
   */
  getAllActivityStates(): PlayerActivityState[] {
    return Array.from(this.activityStates.values());
  }

  /**
   * Update activity state and broadcast change
   */
  private async updateActivityState(
    playerId: number,
    activity: PlayerActivityState['activity']
  ): Promise<void> {
    try {
      const player = await this.getPlayerById(playerId);
      if (!player) {
        logger.warn(`Cannot update activity state - player ${playerId} not found`);
        return;
      }

      const state: PlayerActivityState = {
        player_id: playerId,
        player_name: player.name,
        connection_mode: this.getConnectionMode(playerId),
        activity,
        lastUpdated: new Date(),
      };

      this.activityStates.set(playerId, state);

      // Broadcast to frontend via WebSocket manager
      this.emit('activityStateChanged', state);
    } catch (error) {
      logger.error(`Failed to update activity state for player ${playerId}`, { error });
    }
  }

  /**
   * Get connection mode for a player
   */
  private getConnectionMode(playerId: number): 'websocket' | 'http' | 'disconnected' {
    const state = this.connections.get(playerId);
    if (!state) return 'disconnected';

    if (state.mode === 'websocket' && state.wsClient) {
      const wsState = state.wsClient.getState();
      return wsState.status === 'connected' ? 'websocket' : 'disconnected';
    }

    if (state.mode === 'http' && state.lastPollTime) {
      // Consider HTTP connected if we've successfully polled recently (within 2 intervals)
      const timeSinceLastPoll = Date.now() - state.lastPollTime.getTime();
      return timeSinceLastPoll < this.HTTP_POLL_INTERVAL * 2 ? 'http' : 'disconnected';
    }

    return 'disconnected';
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
      throw new ResourceNotFoundError(
        'mediaPlayerGroup',
        groupId,
        `Media player group ${groupId} not found`,
        { service: 'MediaPlayerConnectionManager', operation: 'getGroupMaxMembers' }
      );
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
      throw new ConfigurationError(
        'group.maxMembers',
        `Cannot add player to group ${groupId}: maximum ${maxMembers} member(s) allowed`,
        { service: 'MediaPlayerConnectionManager', operation: 'checkGroupLimit', metadata: { groupId, currentCount, maxMembers } }
      );
    }
  }

  /**
   * Connect to a media player
   * Strategy: Try WebSocket first, retry a few times, then fallback to HTTP with polling
   */
  async connectPlayer(player: MediaPlayer): Promise<void> {
    if (player.type !== 'kodi') {
      throw new NotImplementedError(
        'player type',
        `Unsupported media player type: ${player.type}`,
        { service: 'MediaPlayerConnectionManager', operation: 'connectPlayer', metadata: { playerType: player.type } }
      );
    }

    if (!player.enabled) {
      logger.info(`Skipping disabled player: ${player.name}`);
      return;
    }

    // Create HTTP client (always available as fallback)
    const httpClient = new KodiHttpClient({
      host: player.host,
      port: player.http_port,
      ...(player.username && { username: player.username }),
      ...(player.password && { password: player.password }),
    });

    // Initialize connection state
    const connectionState: PlayerConnectionState = {
      httpClient,
      mode: 'http',
      retryCount: 0,
    };

    this.connections.set(player.id, connectionState);

    // Start HTTP polling immediately
    await this.startHttpPolling(player, connectionState);
  }

  /**
   * Start HTTP polling - polls every 30s until Kodi responds,
   * then attempts WebSocket upgrade
   */
  private async startHttpPolling(player: MediaPlayer, state: PlayerConnectionState): Promise<void> {
    logger.info(`Starting HTTP polling for '${player.name}' (${this.HTTP_POLL_INTERVAL / 1000}s interval)`);

    // Set up polling interval
    state.pollingInterval = setInterval(async () => {
      await this.pollForConnection(player.id, state);
    }, this.HTTP_POLL_INTERVAL);

    // Do first poll immediately
    await this.pollForConnection(player.id, state);
  }

  /**
   * Poll for connection - checks if Kodi is alive via HTTP ping
   * If alive, attempts to upgrade to WebSocket
   */
  private async pollForConnection(playerId: number, state: PlayerConnectionState): Promise<void> {
    const player = await this.getPlayerById(playerId);
    if (!player) return;

    try {
      // HTTP JSON-RPC ping to check if Kodi is alive
      const httpPingSuccess = await state.httpClient.testConnection();

      if (!httpPingSuccess) {
        // Kodi not responding - keep polling
        await this.updatePlayerConnectionStatus(playerId, 'disconnected');
        return;
      }

      // Kodi is alive! Try to upgrade to WebSocket
      logger.info(`Attempting WebSocket connection to '${player.name}'`);

      const wsClient = new KodiWebSocketClient({
        host: player.host,
        port: this.WS_PORT,
        ...(player.username && { username: player.username }),
        ...(player.password && { password: player.password }),
      });

      // Set up error handler BEFORE connect() to prevent uncaught exceptions
      const connectionErrorHandler = () => {
        // Error is already handled by connect() promise rejection
      };
      wsClient.on('error', connectionErrorHandler);

      // Set up connected handler
      wsClient.once('connected', () => {
        wsClient.off('error', connectionErrorHandler);

        // Set up ongoing event handlers
        wsClient.on('disconnected', () => this.handleWebSocketDisconnected(playerId));
        wsClient.on('error', error => this.handleWebSocketError(playerId, error));
        wsClient.on('stateChange', state => this.handleStateChange(playerId, state));
        wsClient.on('notification', notification =>
          this.handleNotification(playerId, notification)
        );

        this.handleWebSocketConnected(playerId, wsClient);
      });

      // Attempt WebSocket connection
      await wsClient.connect();

      // Success! Stop HTTP polling and switch to WebSocket mode
      if (state.pollingInterval) {
        clearInterval(state.pollingInterval);
        delete state.pollingInterval;
      }

      state.wsClient = wsClient;
      state.mode = 'websocket';
      logger.info(`Connected to '${player.name}' successfully (WebSocket)`);

    } catch (error) {
      // WebSocket upgrade failed - log and continue HTTP polling
      logger.debug(`WebSocket upgrade failed for '${player.name}': ${getErrorMessage(error)}`);

      // Clean up failed WebSocket client
      if (state.wsClient) {
        delete state.wsClient;
      }

      // Continue HTTP polling (connection will retry on next interval)
      await this.updatePlayerConnectionStatus(playerId, 'connected');

      // Initialize activity state if HTTP connection succeeds
      if (!this.activityStates.has(playerId)) {
        await this.updateActivityState(playerId, { type: 'idle' });
      }

      logger.info(`Connected to '${player.name}' successfully (HTTP)`);
    }
  }

  /**
   * Get player by ID from database
   */
  private async getPlayerById(playerId: number): Promise<MediaPlayer | null> {
    const db = this.dbManager.getConnection();
    const rows = await db.query<MediaPlayerRow>('SELECT * FROM media_players WHERE id = ?', [playerId]);
    return rows.length > 0 ? this.mapRowToPlayer(rows[0]) : null;
  }

  /**
   * Restart connection attempts for a player (e.g., after config change)
   */
  async restartConnection(playerId: number, player: MediaPlayer): Promise<void> {
    logger.info(`Restarting connection for player ${playerId} due to config change`);

    // Disconnect existing connection (clears all timers)
    await this.disconnectPlayer(playerId);

    // Reconnect if enabled
    if (player.enabled) {
      await this.connectPlayer(player);
    }
  }

  /**
   * Disconnect from a media player and clear all timers
   */
  async disconnectPlayer(playerId: number): Promise<void> {
    const state = this.connections.get(playerId);
    if (state) {
      // Clear all timers including progress polling
      if (state.pollingInterval) {
        clearInterval(state.pollingInterval);
      }
      if (state.retryTimeout) {
        clearTimeout(state.retryTimeout);
      }
      if (state.progressPollingInterval) {
        clearInterval(state.progressPollingInterval);
      }

      // Disconnect WebSocket if exists
      if (state.wsClient) {
        try {
          // Remove all event listeners to prevent memory leaks
          state.wsClient.removeAllListeners('disconnected');
          state.wsClient.removeAllListeners('error');
          state.wsClient.removeAllListeners('stateChange');
          state.wsClient.removeAllListeners('notification');
          state.wsClient.removeAllListeners('connected');

          await state.wsClient.disconnect();
        } catch (error) {
          // Ignore disconnect errors
          logger.debug(`Error disconnecting WebSocket for player ${playerId}`, { error });
        }
      }

      this.connections.delete(playerId);
    }

    // Clean up activity state
    this.activityStates.delete(playerId);

    await this.updatePlayerConnectionStatus(playerId, 'disconnected');
  }

  /**
   * Reconnect all enabled players
   */
  async reconnectAll(): Promise<void> {
    try {
      const db = this.dbManager.getConnection();
      const rows = await db.query<MediaPlayerRow>('SELECT * FROM media_players WHERE enabled = true');

      logger.info(`Reconnecting ${rows.length} enabled media players`);

      for (const row of rows) {
        try {
          await this.connectPlayer(this.mapRowToPlayer(row));
        } catch (error) {
          logger.error(`Failed to reconnect player ${row.id}`, { error });
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
    const state = this.connections.get(playerId);
    if (!state) {
      return null;
    }

    // Get status from WebSocket if available
    if (state.wsClient) {
      const wsState = state.wsClient.getState();
      return {
        id: playerId,
        name: '', // Will be filled from database
        type: 'kodi',
        connection_status:
          wsState.status === 'connected'
            ? 'connected'
            : wsState.status === 'error'
              ? 'error'
              : 'disconnected',
        last_connected: wsState.connectedAt,
        last_error: wsState.error,
      };
    }

    return {
      id: playerId,
      name: '',
      type: 'kodi',
      connection_status: state.lastPollTime ? 'connected' : 'disconnected',
      last_connected: state.lastPollTime,
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
    const state = this.connections.get(playerId);
    return state?.wsClient;
  }

  /**
   * Get HTTP client for a player
   */
  getHttpClient(playerId: number): KodiHttpClient | undefined {
    const state = this.connections.get(playerId);
    return state?.httpClient;
  }

  /**
   * Test connection to a player
   * Try WebSocket first, fallback to HTTP
   */
  async testConnection(
    player: MediaPlayer
  ): Promise<{ success: boolean; version?: string; error?: string }> {
    // Try WebSocket first
    try {
      const wsClient = new KodiWebSocketClient({
        host: player.host,
        port: this.WS_PORT,
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
    } catch (wsError: unknown) {
      logger.info('WebSocket test failed, trying HTTP', { error: (wsError as { message?: string }).message });

      try {
        const httpClient = new KodiHttpClient({
          host: player.host,
          port: player.http_port,
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
      } catch (httpError: unknown) {
        return { success: false, error: `WebSocket and HTTP failed: ${(httpError as { message?: string }).message}` };
      }
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
  }

  /**
   * Handle WebSocket connected event
   */
  private async handleWebSocketConnected(playerId: number, _client: KodiWebSocketClient): Promise<void> {
    logger.info(`Player ${playerId} WebSocket connected`);
    await this.updatePlayerConnectionStatus(playerId, 'connected');

    // Initialize activity state to idle
    await this.updateActivityState(playerId, { type: 'idle' });

    this.emit('playerConnected', playerId);
  }

  /**
   * Handle WebSocket disconnected event
   * Only triggered for active connections that drop, not initial connection failures
   */
  private async handleWebSocketDisconnected(playerId: number): Promise<void> {
    const state = this.connections.get(playerId);
    if (!state || state.mode !== 'websocket') return; // Only handle if we were in websocket mode

    const player = await this.getPlayerById(playerId);
    if (!player) return;

    logger.info(`WebSocket disconnected for '${player.name}' - returning to HTTP polling`);

    // Remove event listeners before clearing the WebSocket client
    if (state.wsClient) {
      state.wsClient.removeAllListeners('disconnected');
      state.wsClient.removeAllListeners('error');
      state.wsClient.removeAllListeners('stateChange');
      state.wsClient.removeAllListeners('notification');
      state.wsClient.removeAllListeners('connected');
    }

    // Clear the WebSocket client
    delete state.wsClient;
    state.mode = 'http';

    // Stop progress polling and update activity state to reflect disconnection
    this.stopProgressPolling(playerId);
    await this.updateActivityState(playerId, { type: 'idle' });

    await this.updatePlayerConnectionStatus(playerId, 'disconnected');
    this.emit('playerDisconnected', playerId);

    // Return to HTTP polling - will retry WebSocket upgrade on next successful ping
    await this.startHttpPolling(player, state);
  }

  /**
   * Handle WebSocket error event
   * Only for errors on established connections - NOT initial connection failures
   */
  private async handleWebSocketError(playerId: number, error: Error): Promise<void> {
    logger.error(`Player ${playerId} WebSocket error (active connection)`, { error: getErrorMessage(error) });

    const state = this.connections.get(playerId);
    if (!state || state.mode !== 'websocket') return; // Only handle if we were in websocket mode

    await this.updatePlayerConnectionStatus(playerId, 'error', getErrorMessage(error));
    this.emit('playerError', playerId, error);

    // Let the disconnected handler deal with reconnection
  }

  /**
   * Handle state change event
   */
  private handleStateChange(playerId: number, state: ConnectionState): void {
    logger.debug(`Player ${playerId} state change`, { state });
    this.emit('playerStateChange', playerId, state);
  }

  /**
   * Start polling for playback progress
   */
  private async startProgressPolling(playerId: number, kodiPlayerId: number): Promise<void> {
    const state = this.connections.get(playerId);
    if (!state) return;

    // Stop any existing progress polling
    this.stopProgressPolling(playerId);

    logger.debug(`Starting progress polling for player ${playerId}`);

    // Store Kodi player ID
    state.activeKodiPlayerId = kodiPlayerId;

    // Poll immediately for initial progress (fire and forget with error handling)
    this.pollPlaybackProgress(playerId, kodiPlayerId).catch((error) => {
      logger.warn(`Initial progress poll failed for player ${playerId}`, { error });
    });

    // Set up interval for ongoing progress updates
    state.progressPollingInterval = setInterval(() => {
      this.pollPlaybackProgress(playerId, kodiPlayerId).catch((error) => {
        logger.warn(`Progress poll failed for player ${playerId}`, { error });
      });
    }, this.PROGRESS_POLL_INTERVAL);
  }

  /**
   * Poll for current playback progress
   */
  private async pollPlaybackProgress(playerId: number, kodiPlayerId: number): Promise<void> {
    const state = this.connections.get(playerId);
    const activityState = this.activityStates.get(playerId);

    if (!state?.wsClient || !activityState) return;

    try {
      const properties = await state.wsClient.sendRequest<Player.PlayerProperties>('Player.GetProperties', {
        playerid: kodiPlayerId,
        properties: ['time', 'totaltime', 'percentage'],
      });

      logger.debug(`[Player ${playerId}] Got progress properties`, { properties });

      // Extract progress information
      const currentSeconds = properties.time
        ? properties.time.hours * 3600 + properties.time.minutes * 60 + properties.time.seconds
        : undefined;

      const totalSeconds = properties.totaltime
        ? properties.totaltime.hours * 3600 +
          properties.totaltime.minutes * 60 +
          properties.totaltime.seconds
        : undefined;

      const percentage =
        properties.percentage !== undefined ? Math.round(properties.percentage) : undefined;

      logger.debug(`[Player ${playerId}] Calculated progress`, {
        currentSeconds,
        totalSeconds,
        percentage
      });

      // Update activity state with progress (only include defined properties)
      const progress: { percentage?: number; currentSeconds?: number; totalSeconds?: number } = {};
      if (percentage !== undefined) progress.percentage = percentage;
      if (currentSeconds !== undefined) progress.currentSeconds = currentSeconds;
      if (totalSeconds !== undefined) progress.totalSeconds = totalSeconds;

      // Only update if we have actual progress data
      if (Object.keys(progress).length > 0) {
        await this.updateActivityState(playerId, {
          ...activityState.activity,
          progress,
        });
      }
    } catch (error) {
      logger.warn(`Failed to poll playback progress for player ${playerId}`, { error });
      // Don't update state on error - keep last known progress
    }
  }

  /**
   * Stop polling for playback progress
   */
  private stopProgressPolling(playerId: number): void {
    const state = this.connections.get(playerId);
    if (state?.progressPollingInterval) {
      clearInterval(state.progressPollingInterval);
      delete state.progressPollingInterval;
      delete state.activeKodiPlayerId;
      logger.debug(`Stopped progress polling for player ${playerId}`);
    }
  }

  /**
   * Handle Player.OnPlay notification
   * Start tracking playback progress
   *
   * Note: Kodi notifications only contain item ID and type, not full details.
   * We must call Player.GetItem to fetch title, show name, episode, etc.
   */
  private async handlePlayerOnPlay(playerId: number, params: KodiPlayerNotificationParams | undefined): Promise<void> {
    try {
      logger.debug(`[Player ${playerId}] Processing OnPlay notification`, { params });

      const notificationItem = params?.data?.item;
      const kodiPlayerId = params?.data?.player?.playerid;

      if (kodiPlayerId === undefined) {
        logger.warn(`[Player ${playerId}] No playerid in OnPlay notification`);
        return;
      }

      const state = this.connections.get(playerId);
      if (!state?.wsClient) {
        logger.warn(`[Player ${playerId}] No WebSocket client available`);
        return;
      }

      // Fetch full item details from Kodi (notification only has ID and type)
      let title = 'Unknown Media';
      let filepath: string | undefined;

      try {
        logger.debug(`[Player ${playerId}] Requesting item details`, { kodiPlayerId });

        const itemDetails = await state.wsClient.sendRequest<Player.GetItemResponse>('Player.GetItem', {
          playerid: kodiPlayerId,
          properties: ['title', 'showtitle', 'season', 'episode', 'year', 'artist', 'file'],
        });

        logger.debug(`[Player ${playerId}] Got full item details`, { itemDetails });

        const item = itemDetails?.item;
        filepath = item?.file;

        // Extract media title from full item data
        if (item?.type === 'movie' && item?.title) {
          title = item.year ? `${item.title} (${item.year})` : item.title;
        } else if (item?.type === 'episode') {
          // For TV episodes, prefer showtitle + season/episode
          if (item.showtitle) {
            const season = item.season !== undefined ? `S${String(item.season).padStart(2, '0')}` : '';
            const episode = item.episode !== undefined ? `E${String(item.episode).padStart(2, '0')}` : '';
            const episodeTitle = item.title ? ` - ${item.title}` : '';
            title = `${item.showtitle} ${season}${episode}${episodeTitle}`;
          } else if (item.title) {
            title = item.title;
          }
        } else if (item?.type === 'song') {
          if (item.artist && item.title) {
            title = `${item.artist} - ${item.title}`;
          } else if (item.title) {
            title = item.title;
          }
        } else if (item?.title) {
          title = item.title;
        }

        logger.info(`[Player ${playerId}] Playback started: "${title}"`);
      } catch (error) {
        logger.warn(`Failed to get full item details for player ${playerId}`, {
          error,
          errorMessage: error instanceof Error ? getErrorMessage(error) : String(error),
          errorStack: error instanceof Error ? getErrorStack(error) : undefined,
        });
        // Fall back to label from notification if available
        if (notificationItem?.label) {
          title = notificationItem.label;
        }
      }

      // Update activity state with initial playback info (only include defined properties)
      const activity: PlayerActivityState['activity'] = { type: 'playing', details: title };
      if (filepath !== undefined) activity.filepath = filepath;
      if (kodiPlayerId !== undefined) activity.kodiPlayerId = kodiPlayerId;

      await this.updateActivityState(playerId, activity);

      // Start polling for progress updates
      await this.startProgressPolling(playerId, kodiPlayerId);

    } catch (error) {
      logger.warn(`Failed to extract media info for player ${playerId}`, { error });
      await this.updateActivityState(playerId, {
        type: 'playing',
        details: 'Unknown Media',
      });
    }
  }

  /**
   * Handle Player.OnPause notification
   */
  private async handlePlayerOnPause(playerId: number, params: KodiPlayerNotificationParams | undefined): Promise<void> {
    const activityState = this.activityStates.get(playerId);

    // Build activity object with only defined properties
    const activity: PlayerActivityState['activity'] = {
      type: 'paused',
      details: activityState?.activity.details || this.getCurrentMediaTitle(params) || 'Unknown Media',
    };
    if (activityState?.activity.filepath) activity.filepath = activityState.activity.filepath;
    if (activityState?.activity.progress) activity.progress = activityState.activity.progress;
    if (activityState?.activity.kodiPlayerId !== undefined) activity.kodiPlayerId = activityState.activity.kodiPlayerId;

    await this.updateActivityState(playerId, activity);

    // Stop progress polling while paused (resume on OnPlay/OnResume)
    this.stopProgressPolling(playerId);
  }

  /**
   * Handle Player.OnStop notification
   */
  private async handlePlayerOnStop(playerId: number): Promise<void> {
    this.stopProgressPolling(playerId);

    await this.updateActivityState(playerId, {
      type: 'idle',
    });
  }

  /**
   * Handle Player.OnResume notification
   */
  private async handlePlayerOnResume(playerId: number): Promise<void> {
    const activityState = this.activityStates.get(playerId);
    if (activityState?.activity.kodiPlayerId !== undefined) {
      await this.updateActivityState(playerId, {
        ...activityState.activity,
        type: 'playing', // Change from paused to playing
      });
      await this.startProgressPolling(playerId, activityState.activity.kodiPlayerId);
    }
  }

  /**
   * Extract current media title from notification params
   */
  private getCurrentMediaTitle(params: KodiPlayerNotificationParams | undefined): string | undefined {
    const item = params?.data?.item;
    if (!item) return undefined;

    if (item.type === 'movie' && item.title) {
      return item.year ? `${item.title} (${item.year})` : item.title;
    } else if (item.type === 'episode' && item.showtitle) {
      return item.showtitle;
    } else if (item.type === 'song' && item.title) {
      return item.title;
    }

    return item.label || undefined;
  }

  /**
   * Process Kodi notification and update activity state
   */
  private async processKodiNotification(playerId: number, notification: KodiNotification): Promise<void> {
    const method = notification.method;

    switch (method) {
      case 'Player.OnPlay':
        await this.handlePlayerOnPlay(playerId, notification.params);
        break;

      case 'Player.OnPause':
        await this.handlePlayerOnPause(playerId, notification.params);
        break;

      case 'Player.OnStop':
        await this.handlePlayerOnStop(playerId);
        break;

      case 'Player.OnResume':
        await this.handlePlayerOnResume(playerId);
        break;

      case 'VideoLibrary.OnScanStarted':
        await this.updateActivityState(playerId, {
          type: 'scanning',
          details: 'Video Library',
        });
        break;

      case 'VideoLibrary.OnScanFinished':
        await this.updateActivityState(playerId, { type: 'idle' });
        break;

      case 'AudioLibrary.OnScanStarted':
        await this.updateActivityState(playerId, {
          type: 'scanning',
          details: 'Music Library',
        });
        break;

      case 'AudioLibrary.OnScanFinished':
        await this.updateActivityState(playerId, { type: 'idle' });
        break;

      default:
        break;
    }
  }

  /**
   * Handle notification from Kodi
   */
  private handleNotification(playerId: number, notification: KodiNotification): void {
    logger.debug(`Player ${playerId} notification`, { notification });

    // Update activity state based on notification type (fire and forget with error handling)
    this.processKodiNotification(playerId, notification).catch((error) => {
      logger.error(`Failed to process Kodi notification for player ${playerId}`, {
        error,
        notification,
      });
    });

    // Still emit raw notification for other listeners
    this.emit('playerNotification', playerId, notification);
  }

  /**
   * Update player connection status in database
   * Note: Connection state is ephemeral - only update the status field
   */
  private async updatePlayerConnectionStatus(
    playerId: number,
    status: 'connected' | 'disconnected' | 'error',
    _error?: string
  ): Promise<void> {
    try {
      const db = this.dbManager.getConnection();
      await db.execute(
        `UPDATE media_players
         SET connection_status = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [status, playerId]
      );
    } catch (err: unknown) {
      // Silently fail - connection state is ephemeral, not critical
      logger.debug(`Could not update player ${playerId} status (non-critical)`, {
        error: (err as { message?: string }).message,
      });
    }
  }

  /**
   * Map database row to MediaPlayer object
   */
  private mapRowToPlayer(row: MediaPlayerRow): MediaPlayer {
    const player: MediaPlayer = {
      id: row.id,
      name: row.name,
      type: row.type,
      host: row.host,
      http_port: row.http_port || row.port || 8080, // Support both column names with fallback
      enabled: Boolean(row.enabled),
      library_paths: JSON.parse(row.library_paths || '[]'),
      connection_status: row.connection_status || 'disconnected',
      config: JSON.parse(row.config || '{}'),
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };

    // Only add optional properties if they have values
    if (row.username) {
      player.username = row.username;
    }
    if (row.password) {
      player.password = row.password;
    }
    if (row.api_key) {
      player.api_key = row.api_key;
    }
    if (row.library_group) {
      player.library_group = row.library_group;
    }
    if (row.json_rpc_version) {
      player.json_rpc_version = row.json_rpc_version;
    }
    if (row.last_connected) {
      player.last_connected = new Date(row.last_connected);
    }
    if (row.last_error) {
      player.last_error = row.last_error;
    }
    if (row.last_sync) {
      player.last_sync = new Date(row.last_sync);
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
      http_port: number;
      username: string | null;
      password: string | null;
    }>(
      `SELECT id, name, host, http_port, username, password
       FROM media_players
       WHERE group_id = ? AND enabled = 1
       ORDER BY id ASC`,
      [groupId]
    );

    if (players.length === 0) {
      return { success: false, error: 'No enabled players in group' };
    }

    for (const player of players) {
      try {
        const httpClient = new KodiHttpClient({
          host: player.host,
          port: player.http_port,
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
      } catch (error) {
        logger.warn('Player ping failed, trying next in group', {
          groupId,
          playerId: player.id,
          error: getErrorMessage(error),
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

    for (const player of players) {
      try {
        const state = this.connections.get(player.id);
        if (!state?.httpClient) {
          logger.warn('HTTP client not available, trying next player', {
            playerId: player.id,
          });
          continue;
        }

        await state.httpClient.showNotification(notification);

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
      } catch (error) {
        logger.warn('Player notification failed, trying next in group', {
          groupId,
          playerId: player.id,
          error: getErrorMessage(error),
        });
        // Continue to next player
      }
    }

    return { success: false, error: 'All players in group failed to show notification' };
  }
}
