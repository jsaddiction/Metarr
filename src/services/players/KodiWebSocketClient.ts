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
      resolve: (value: any) => void;
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
    this.reconnectInterval = options.reconnectInterval || 5000;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 10;
    this.pingInterval = options.pingInterval || 30000;

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
        const wsOptions: any = {};
        if (this.auth) {
          wsOptions.headers = {
            Authorization: `Basic ${this.auth}`,
          };
        }

        this.ws = new WebSocket(this.url, wsOptions);

        this.ws.on('open', () => {
          logger.info('Kodi WebSocket connected', { url: this.url });
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
          logger.error('Kodi WebSocket error', { url: this.url, error: error.message });
          this.updateState({ status: 'error', error: error.message });
          this.emit('error', error);

          if (this.state.status === 'connecting') {
            reject(error);
          }
        });

        this.ws.on('close', (code: number, reason: string) => {
          logger.info('Kodi WebSocket closed', { url: this.url, code, reason: reason.toString() });
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
            reject(new Error('WebSocket connection timeout'));
            this.disconnect();
          }
        }, 10000);
      } catch (error: any) {
        logger.error('Failed to create Kodi WebSocket', { error: error.message });
        this.updateState({ status: 'error', error: error.message });
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

      this.ws.close();
    });
  }

  /**
   * Send JSON-RPC request and wait for response
   */
  async sendRequest<T = any>(method: KodiMethod, params?: any, timeout: number = 5000): Promise<T> {
    if (!this.ws || this.state.status !== 'connected') {
      throw new Error('WebSocket not connected');
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
        resolve,
        reject,
        timeout: timeoutId,
      });

      try {
        this.ws!.send(JSON.stringify(request));
        logger.debug('Kodi WebSocket Request', { method, params });
      } catch (error: any) {
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
    } catch (error: any) {
      logger.error('Failed to parse Kodi WebSocket message', { error: error.message, data });
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
      this.reconnectInterval * Math.pow(2, this.state.reconnectAttempts),
      60000 // Max 60 seconds
    );

    logger.info('Scheduling Kodi WebSocket reconnect', {
      url: this.url,
      attempt: this.state.reconnectAttempts + 1,
      delay,
    });

    this.reconnectTimer = setTimeout(() => {
      this.updateState({ reconnectAttempts: this.state.reconnectAttempts + 1 });
      this.connect().catch(error => {
        logger.error('Reconnection failed', { error: error.message });
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
