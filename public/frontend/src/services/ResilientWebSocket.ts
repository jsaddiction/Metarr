/**
 * ResilientWebSocket - WebSocket client with auto-reconnect and message queuing
 */

import {
  ClientMessage,
  ServerMessage,
  ConnectionState,
  WebSocketConfig,
} from '../types/websocket';

type MessageHandler = (message: ServerMessage) => void;
type StateChangeHandler = (state: ConnectionState) => void;

export class ResilientWebSocket {
  private ws: WebSocket | null = null;
  private config: Required<WebSocketConfig>;
  private state: ConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private messageQueue: ClientMessage[] = [];
  private messageHandlers = new Map<string, Set<MessageHandler>>();
  private stateHandlers = new Set<StateChangeHandler>();
  private lastPongTime = 0;
  private isIntentionallyClosed = false;

  constructor(config: WebSocketConfig) {
    this.config = {
      url: config.url,
      reconnectInterval: config.reconnectInterval ?? 1000,
      maxReconnectInterval: config.maxReconnectInterval ?? 30000,
      pingInterval: config.pingInterval ?? 30000,
    };
  }

  /**
   * Connect to WebSocket server
   */
  public connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.state === 'connecting') {
      return;
    }

    this.isIntentionallyClosed = false;
    this.setState('connecting');

    try {
      this.ws = new WebSocket(this.config.url);

      this.ws.onopen = () => {
        console.log('[WebSocket] Connected');
        this.reconnectAttempts = 0;
        this.setState('connected');
        this.startPingInterval();
        this.flushMessageQueue();
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as ServerMessage;
          this.handleMessage(message);
        } catch (error) {
          console.error('[WebSocket] Failed to parse message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
        this.setState('error');
      };

      this.ws.onclose = () => {
        console.log('[WebSocket] Disconnected');
        this.setState('disconnected');
        this.stopPingInterval();

        if (!this.isIntentionallyClosed) {
          this.scheduleReconnect();
        }
      };
    } catch (error) {
      console.error('[WebSocket] Connection failed:', error);
      this.setState('error');
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  public disconnect(): void {
    this.isIntentionallyClosed = true;
    this.stopPingInterval();
    this.clearReconnectTimer();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.setState('disconnected');
  }

  /**
   * Send message to server
   */
  public send(message: ClientMessage): void {
    if (this.state === 'connected' && this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message));
      } catch (error) {
        console.error('[WebSocket] Failed to send message:', error);
        this.messageQueue.push(message);
      }
    } else {
      // Queue message for later delivery
      this.messageQueue.push(message);
    }
  }

  /**
   * Subscribe to specific message type
   */
  public on(type: string, handler: MessageHandler): void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set());
    }
    this.messageHandlers.get(type)!.add(handler);
  }

  /**
   * Unsubscribe from specific message type
   */
  public off(type: string, handler: MessageHandler): void {
    const handlers = this.messageHandlers.get(type);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.messageHandlers.delete(type);
      }
    }
  }

  /**
   * Subscribe to connection state changes
   */
  public onStateChange(handler: StateChangeHandler): void {
    this.stateHandlers.add(handler);
  }

  /**
   * Unsubscribe from connection state changes
   */
  public offStateChange(handler: StateChangeHandler): void {
    this.stateHandlers.delete(handler);
  }

  /**
   * Get current connection state
   */
  public getState(): ConnectionState {
    return this.state;
  }

  /**
   * Handle incoming server message
   */
  private handleMessage(message: ServerMessage): void {
    // Handle pong messages for heartbeat
    if (message.type === 'pong') {
      this.lastPongTime = Date.now();
    }

    // Notify specific type handlers
    const handlers = this.messageHandlers.get(message.type);
    if (handlers) {
      handlers.forEach((handler) => handler(message));
    }

    // Notify wildcard handlers
    const wildcardHandlers = this.messageHandlers.get('*');
    if (wildcardHandlers) {
      wildcardHandlers.forEach((handler) => handler(message));
    }
  }

  /**
   * Update connection state and notify handlers
   */
  private setState(state: ConnectionState): void {
    if (this.state !== state) {
      this.state = state;
      this.stateHandlers.forEach((handler) => handler(state));
    }
  }

  /**
   * Schedule reconnection with fixed 3-second interval
   * No exponential backoff - always retry every 3 seconds for faster recovery
   */
  private scheduleReconnect(): void {
    this.clearReconnectTimer();

    const delay = 3000; // Fixed 3-second interval

    console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
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
   * Start ping interval for heartbeat
   */
  private startPingInterval(): void {
    this.stopPingInterval();
    this.lastPongTime = Date.now();

    this.pingTimer = setInterval(() => {
      // Check if we haven't received a pong in a while
      const timeSinceLastPong = Date.now() - this.lastPongTime;
      if (timeSinceLastPong > this.config.pingInterval * 2) {
        console.warn('[WebSocket] No pong received, connection may be dead');
        this.ws?.close();
        return;
      }

      // Send ping
      this.send({ type: 'ping' });
    }, this.config.pingInterval);
  }

  /**
   * Stop ping interval
   */
  private stopPingInterval(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  /**
   * Flush queued messages after reconnection
   */
  private flushMessageQueue(): void {
    if (this.messageQueue.length === 0) {
      return;
    }

    console.log(`[WebSocket] Flushing ${this.messageQueue.length} queued messages`);

    const queue = [...this.messageQueue];
    this.messageQueue = [];

    queue.forEach((message) => this.send(message));
  }
}
