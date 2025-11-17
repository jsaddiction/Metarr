import { EventEmitter } from 'events';
import WebSocket from 'ws';
import {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  KodiMethod,
  KodiNotificationMethod,
  DetectedVersion,
} from '../../types/jsonrpc.js';
import { logger } from '../../middleware/logging.js';
import { getErrorMessage } from '../../utils/errorHandling.js';
import { InvalidStateError } from '../../errors/index.js';

/**
 * Kodi WebSocket connection configuration constants
 */
const KODI_WEBSOCKET_CONFIG = {
  /** Default interval between reconnection attempts (milliseconds) */
  DEFAULT_RECONNECT_INTERVAL_MS: 5000, // 5 seconds

  /** Maximum number of reconnection attempts before giving up */
  MAX_RECONNECT_ATTEMPTS: 10,

  /** Default interval for WebSocket ping/keepalive (milliseconds) */
  DEFAULT_PING_INTERVAL_MS: 30000, // 30 seconds

  /** Exponential backoff base for reconnection delays */
  RECONNECT_BACKOFF_BASE: 2,
} as const;

export interface KodiWebSocketClientOptions {
  host: string;
  port: number;
  username?: string;
  password?: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  pingInterval?: number;
}

export interface ConnectionState {
  status: 'connecting' | 'connected' | 'disconnecting' | 'disconnected' | 'error';
  error?: string;
  connectedAt?: Date;
  reconnectAttempts: number;
}

export class KodiWebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  private auth?: string;
  private requestId: number = 1;
  private pendingRequests: Map<
    number | string,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  > = new Map();

  private state: ConnectionState = {
    status: 'disconnected',
    reconnectAttempts: 0,
  };

  private reconnectInterval: number;
  private maxReconnectAttempts: number;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private pingInterval: number;
  private isManuallyDisconnected: boolean = false;

  constructor(options: KodiWebSocketClientOptions) {
    super();

    this.url = `ws://${options.host}:${options.port}/jsonrpc`;
    this.reconnectInterval = options.reconnectInterval || KODI_WEBSOCKET_CONFIG.DEFAULT_RECONNECT_INTERVAL_MS;
    this.maxReconnectAttempts = options.maxReconnectAttempts || KODI_WEBSOCKET_CONFIG.MAX_RECONNECT_ATTEMPTS;
    this.pingInterval = options.pingInterval || KODI_WEBSOCKET_CONFIG.DEFAULT_PING_INTERVAL_MS;

    if (options.username && options.password) {
      this.auth = Buffer.from(`${options.username}:${options.password}`).toString('base64');
    }
  }

  /**
   * Connect to Kodi WebSocket
   */
  async connect(): Promise<void> {
    if (this.ws && this.state.status === 'connected') {
      logger.warn('Kodi WebSocket already connected', { url: this.url });
      return;
    }

    this.isManuallyDisconnected = false;
    this.updateState({ status: 'connecting', reconnectAttempts: this.state.reconnectAttempts });

    return new Promise((resolve, reject) => {
      try {
        const wsOptions: Record<string, unknown> = {};
        if (this.auth) {
          wsOptions.headers = {
            Authorization: `Basic ${this.auth}`,
          };
        }

        this.ws = new WebSocket(this.url, wsOptions);

        this.ws.on('open', () => {
          // Connection success logged by connection manager
          this.updateState({
            status: 'connected',
            connectedAt: new Date(),
            reconnectAttempts: 0,
          });
          this.startPing();
          this.emit('connected');
          resolve();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          this.handleMessage(data.toString());
        });

        this.ws.on('error', (error: Error) => {
          // Only log errors after connection is established
          // Connection errors are handled by the connection manager
          if (this.state.status !== 'connecting') {
            logger.debug('WebSocket error', { url: this.url, error: getErrorMessage(error) });
          }

          this.updateState({ status: 'error', error: getErrorMessage(error) });
          this.emit('error', error);

          if (this.state.status === 'connecting') {
            reject(error);
          }
        });

        this.ws.on('close', (code: number, reason: string) => {
          // Only log close events for established connections
          if (this.state.status === 'connected') {
            logger.debug('WebSocket closed', { url: this.url, code, reason: reason.toString() });
          }

          this.stopPing();
          this.updateState({ status: 'disconnected' });
          this.emit('disconnected', { code, reason });

          // Attempt reconnection unless manually disconnected
          if (!this.isManuallyDisconnected) {
            this.scheduleReconnect();
          }
        });

        // Connection timeout
        setTimeout(() => {
          if (this.state.status === 'connecting') {
            const error = new Error('WebSocket connection timeout');
            this.updateState({ status: 'error', error: getErrorMessage(error) });

            // Just reject - don't try to clean up the WebSocket here
            // The ws library doesn't allow ANY operations (even terminate) on CONNECTING sockets
            // The error event handler or caller will handle cleanup
            reject(error);
          }
        }, 10000);
      } catch (error) {
        // Synchronous errors during WebSocket creation
        // Logged by connection manager
        this.updateState({ status: 'error', error: getErrorMessage(error) });
        reject(error);
      }
    });
  }

  /**
   * Disconnect from Kodi WebSocket
   */
  async disconnect(): Promise<void> {
    this.isManuallyDisconnected = true;
    this.clearReconnectTimer();
    this.stopPing();

    if (!this.ws) {
      return;
    }

    this.updateState({ status: 'disconnecting' });

    return new Promise(resolve => {
      if (!this.ws) {
        resolve();
        return;
      }

      const closeHandler = () => {
        this.ws = null;
        this.updateState({ status: 'disconnected' });
        resolve();
      };

      this.ws.once('close', closeHandler);

      // Force close after timeout
      setTimeout(() => {
        if (this.ws) {
          this.ws.removeListener('close', closeHandler);
          this.ws.terminate();
          this.ws = null;
          this.updateState({ status: 'disconnected' });
          resolve();
        }
      }, 5000);

      // Only call close() if WebSocket is in OPEN or CONNECTING state
      // Calling close() on CLOSING or CLOSED states throws an error
      try {
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.close();
        } else {
          // Already closing/closed, just clean up
          this.ws.terminate();
          this.ws = null;
          this.updateState({ status: 'disconnected' });
          resolve();
        }
      } catch (error) {
        // If close() fails, terminate and clean up
        logger.debug('Error closing WebSocket, terminating instead', { error: getErrorMessage(error) });
        if (this.ws) {
          this.ws.terminate();
          this.ws = null;
        }
        this.updateState({ status: 'disconnected' });
        resolve();
      }
    });
  }

  /**
   * Send JSON-RPC request and wait for response
   */
  async sendRequest<T = unknown>(method: KodiMethod, params?: unknown, timeout: number = 5000): Promise<T> {
    if (!this.ws || this.state.status !== 'connected') {
      throw new InvalidStateError('connected', this.state.status, 'WebSocket not connected');
    }

    const id = this.requestId++;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method,
      params: params || {},
      id,
    };

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, timeout);

      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout: timeoutId,
      });

      try {
        this.ws!.send(JSON.stringify(request));
        logger.debug('Kodi WebSocket Request', { method, params });
      } catch (error) {
        clearTimeout(timeoutId);
        this.pendingRequests.delete(id);
        reject(error);
      }
    });
  }

  /**
   * Test connection with ping
   */
  async ping(): Promise<boolean> {
    try {
      const result = await this.sendRequest<string>('JSONRPC.Ping');
      return result === 'pong';
    } catch (error) {
      logger.error('Kodi WebSocket ping failed', { error });
      return false;
    }
  }

  /**
   * Get Kodi version
   */
  async getVersion(): Promise<{ version: { major: number; minor: number; patch: number } }> {
    return this.sendRequest<{ version: { major: number; minor: number; patch: number } }>(
      'JSONRPC.Version'
    );
  }

  /**
   * Detect JSON-RPC API version
   */
  async detectVersion(): Promise<DetectedVersion> {
    try {
      const versionInfo = await this.getVersion();
      const { major, minor, patch } = versionInfo.version;

      console.log('WS: Kodi version info', { major, minor, patch });

      let version = 'unknown';
      let supported = false;

      if (major === 12) {
        version = 'v12';
        supported = true;
      } else if (major === 13) {
        if (minor >= 5) {
          version = 'v13.5';
        } else {
          version = 'v13';
        }
        supported = true;
      } else if (major > 13) {
        version = 'v13.5';
        supported = true;
      }

      console.log(`Detected Kodi version: ${version} (${major}.${minor}.${patch})`);

      return {
        version,
        major,
        minor,
        patch,
        supported,
      };
    } catch (error) {
      logger.error('Failed to detect Kodi version via WebSocket', { error });
      throw error;
    }
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return { ...this.state };
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.state.status === 'connected';
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      // Handle JSON-RPC responses
      if ('id' in message && message.id !== null) {
        const response = message as JsonRpcResponse;
        const pending = this.pendingRequests.get(response.id);

        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(response.id);

          if (response.error) {
            pending.reject(new Error(`${response.error.code}: ${response.error.message}`));
          } else {
            pending.resolve(response.result);
          }
        }
      }
      // Handle JSON-RPC notifications
      else if ('method' in message && !('id' in message)) {
        const notification = message as JsonRpcNotification;
        this.handleNotification(notification);
      }
    } catch (error) {
      logger.error('Failed to parse Kodi WebSocket message', { error: getErrorMessage(error), data });
    }
  }

  /**
   * Handle Kodi notifications
   */
  private handleNotification(notification: JsonRpcNotification): void {
    logger.debug('Kodi Notification', { method: notification.method, params: notification.params });
    this.emit('notification', notification);
    this.emit(notification.method as KodiNotificationMethod, notification.params);
  }

  /**
   * Update connection state and emit event
   */
  private updateState(updates: Partial<ConnectionState>): void {
    this.state = { ...this.state, ...updates };
    this.emit('stateChange', this.state);
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.state.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.warn('Max reconnect attempts reached', { url: this.url });
      this.updateState({ status: 'error', error: 'Max reconnect attempts reached' });
      return;
    }

    this.clearReconnectTimer();

    const delay = Math.min(
      this.reconnectInterval * Math.pow(KODI_WEBSOCKET_CONFIG.RECONNECT_BACKOFF_BASE, this.state.reconnectAttempts),
      60000 // Max 60 seconds
    );

    // Reconnect attempts are managed by the connection manager
    this.reconnectTimer = setTimeout(() => {
      this.updateState({ reconnectAttempts: this.state.reconnectAttempts + 1 });
      this.connect().catch(() => {
        // Reconnection errors handled by connection manager
      });
    }, delay);
  }

  /**
   * Clear reconnection timer
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Start periodic ping to keep connection alive
   */
  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      this.ping().catch(error => {
        logger.error('Ping failed', { error });
      });
    }, this.pingInterval);
  }

  /**
   * Stop periodic ping
   */
  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  /**
   * Update connection options
   */
  updateOptions(options: KodiWebSocketClientOptions): void {
    this.url = `ws://${options.host}:${options.port}/jsonrpc`;
    this.reconnectInterval = options.reconnectInterval || this.reconnectInterval;
    this.maxReconnectAttempts = options.maxReconnectAttempts || this.maxReconnectAttempts;
    this.pingInterval = options.pingInterval || this.pingInterval;

    if (options.username && options.password) {
      this.auth = Buffer.from(`${options.username}:${options.password}`).toString('base64');
    }
  }
}
