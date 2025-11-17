import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage, Server as HttpServer } from 'http';
import { randomUUID } from 'crypto';
import { logger } from '../middleware/logging.js';
import {
  ClientMessage,
  ServerMessage,
  ConnectedClient,
  WebSocketServerConfig,
  BroadcastOptions,
  WelcomeMessage,
  PongMessage,
  ErrorMessage,
} from '../types/websocket.js';

/**
 * WebSocket Server for Metarr
 * Manages WebSocket connections, heartbeat, and message routing
 */
export class MetarrWebSocketServer {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, ConnectedClient> = new Map();
  private config: Required<WebSocketServerConfig>;
  private pingIntervalId: NodeJS.Timeout | null = null;
  private messageHandler: ((clientId: string, message: ClientMessage) => void) | null = null;

  constructor(config: WebSocketServerConfig = {}) {
    this.config = {
      pingInterval: config.pingInterval || 30000, // 30 seconds
      pingTimeout: config.pingTimeout || 5000, // 5 seconds
      maxConnections: config.maxConnections || 0, // 0 = unlimited
    };
  }

  /**
   * Attach WebSocket server to HTTP server
   */
  public attach(httpServer: HttpServer): void {
    this.wss = new WebSocketServer({
      server: httpServer,
      path: '/ws',
    });

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });

    this.startHeartbeat();

    logger.info('WebSocket server attached and listening on /ws');
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    if (this.config.maxConnections > 0 && this.clients.size >= this.config.maxConnections) {
      logger.warn('Max WebSocket connections reached, rejecting connection');
      ws.close(1008, 'Maximum connections reached');
      return;
    }

    const clientId = randomUUID();
    const client: ConnectedClient = {
      id: clientId,
      ws,
      connectedAt: new Date(),
      metadata: {
        userAgent: req.headers['user-agent'],
        ip: req.socket.remoteAddress,
      },
    };

    this.clients.set(clientId, client);
    logger.info(`WebSocket client connected: ${clientId}`, {
      clientId,
      ip: client.metadata?.ip,
      totalClients: this.clients.size,
    });

    this.sendWelcomeMessage(clientId);

    ws.on('message', (data: Buffer) => {
      this.handleMessage(clientId, data);
    });

    ws.on('pong', () => {
      this.handlePong(clientId);
    });

    ws.on('close', (code: number, reason: Buffer) => {
      this.handleDisconnect(clientId, code, reason.toString());
    });

    ws.on('error', (error: Error) => {
      this.handleError(clientId, error);
    });
  }

  /**
   * Send welcome message to newly connected client
   */
  private sendWelcomeMessage(clientId: string): void {
    const welcomeMsg: WelcomeMessage = {
      type: 'welcome',
      timestamp: new Date().toISOString(),
      serverId: 'metarr-1', // Could be dynamic or from config
      serverVersion: process.env.npm_package_version || '1.0.0',
      capabilities: [
        'ping',
        'resync',
        'updateMovie',
        'deleteImage',
        'updatePlayer',
        'startLibraryScan',
        'cancelLibraryScan',
      ],
    };

    this.sendToClient(clientId, welcomeMsg);
  }

  /**
   * Handle incoming message from client
   */
  private handleMessage(clientId: string, data: Buffer): void {
    try {
      const message = JSON.parse(data.toString()) as ClientMessage;
      logger.debug(`WebSocket message received from ${clientId}`, {
        clientId,
        type: message.type,
        requestId: message.requestId,
      });

      // Handle ping internally
      if (message.type === 'ping') {
        this.handlePing(clientId, message.requestId);
        return;
      }

      // Forward other messages to registered handler
      if (this.messageHandler) {
        this.messageHandler(clientId, message);
      } else {
        logger.warn('No message handler registered for WebSocket messages');
      }
    } catch (error) {
      logger.error(`Failed to parse WebSocket message from ${clientId}`, {
        clientId,
        error: error instanceof Error ? error.message : String(error),
      });

      this.sendError(clientId, 'Invalid message format', 'PARSE_ERROR');
    }
  }

  /**
   * Handle ping message from client
   */
  private handlePing(clientId: string, requestId?: string): void {
    const pongMsg: PongMessage = {
      type: 'pong',
      timestamp: new Date().toISOString(),
      serverTime: new Date().toISOString(),
      requestId,
    };

    this.sendToClient(clientId, pongMsg);

    const client = this.clients.get(clientId);
    if (client) {
      client.lastPing = new Date();
    }
  }

  /**
   * Handle pong response from client (server-initiated ping)
   */
  private handlePong(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.lastPong = new Date();
      logger.debug(`Received pong from client ${clientId}`);
    }
  }

  /**
   * Handle client disconnect
   */
  private handleDisconnect(clientId: string, code: number, reason: string): void {
    logger.info(`WebSocket client disconnected: ${clientId}`, {
      clientId,
      code,
      reason: reason || 'No reason provided',
      totalClients: this.clients.size - 1,
    });

    this.clients.delete(clientId);
  }

  /**
   * Handle WebSocket error
   */
  private handleError(clientId: string, error: Error): void {
    logger.error(`WebSocket error for client ${clientId}`, {
      clientId,
      error: error.message,
      stack: error.stack,
    });
  }

  /**
   * Start heartbeat mechanism (server-initiated ping)
   */
  private startHeartbeat(): void {
    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId);
    }

    this.pingIntervalId = setInterval(() => {
      const now = new Date();
      const deadClients: string[] = [];

      this.clients.forEach((client, clientId) => {
        if (client.ws.readyState === WebSocket.OPEN) {
          if (client.lastPong) {
            const timeSinceLastPong = now.getTime() - client.lastPong.getTime();
            if (timeSinceLastPong > this.config.pingInterval + this.config.pingTimeout) {
              logger.warn(`Client ${clientId} didn't respond to ping, terminating connection`);
              deadClients.push(clientId);
              return;
            }
          }

          // Send ping
          try {
            client.ws.ping();
            logger.debug(`Sent ping to client ${clientId}`);
          } catch (error) {
            logger.error(`Failed to send ping to client ${clientId}`, {
              error: error instanceof Error ? error.message : String(error),
            });
            deadClients.push(clientId);
          }
        } else {
          deadClients.push(clientId);
        }
      });

      // Clean up dead clients
      deadClients.forEach(clientId => {
        const client = this.clients.get(clientId);
        if (client) {
          client.ws.terminate();
          this.clients.delete(clientId);
          logger.info(`Terminated dead client ${clientId}`);
        }
      });
    }, this.config.pingInterval);

    logger.info(`WebSocket heartbeat started (interval: ${this.config.pingInterval}ms)`);
  }

  /**
   * Stop heartbeat mechanism
   */
  private stopHeartbeat(): void {
    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
      logger.info('WebSocket heartbeat stopped');
    }
  }

  /**
   * Register message handler
   */
  public onMessage(handler: (clientId: string, message: ClientMessage) => void): void {
    this.messageHandler = handler;
  }

  /**
   * Send message to specific client
   */
  public sendToClient(clientId: string, message: ServerMessage): boolean {
    const client = this.clients.get(clientId);
    if (!client) {
      logger.warn(`Cannot send message to unknown client ${clientId}`);
      return false;
    }

    if (client.ws.readyState !== WebSocket.OPEN) {
      logger.warn(`Cannot send message to client ${clientId}, connection not open`);
      return false;
    }

    try {
      const data = JSON.stringify(message);
      client.ws.send(data);
      logger.debug(`Sent message to client ${clientId}`, {
        clientId,
        type: message.type,
      });
      return true;
    } catch (error) {
      logger.error(`Failed to send message to client ${clientId}`, {
        clientId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Send error message to client
   */
  public sendError(
    clientId: string,
    errorMessage: string,
    code?: string,
    originalType?: string
  ): boolean {
    const errorMsg: ErrorMessage = {
      type: 'error',
      timestamp: new Date().toISOString(),
      error: errorMessage,
      code,
      originalType,
    };

    return this.sendToClient(clientId, errorMsg);
  }

  /**
   * Broadcast message to all connected clients
   */
  public broadcastToAll(message: ServerMessage, options?: BroadcastOptions): number {
    let sentCount = 0;

    this.clients.forEach((client, clientId) => {
      // Apply filters
      if (options?.excludeClient && clientId === options.excludeClient) {
        return;
      }

      if (options?.filter && !options.filter(client)) {
        return;
      }

      if (this.sendToClient(clientId, message)) {
        sentCount++;
      }
    });

    logger.debug(`Broadcast message to ${sentCount} clients`, {
      type: message.type,
      totalClients: this.clients.size,
      sentCount,
    });

    return sentCount;
  }

  /**
   * Get connected client count
   */
  public getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get all connected client IDs
   */
  public getClientIds(): string[] {
    return Array.from(this.clients.keys());
  }

  /**
   * Get connected client info
   */
  public getClient(clientId: string): ConnectedClient | undefined {
    return this.clients.get(clientId);
  }

  /**
   * Shutdown WebSocket server
   */
  public async shutdown(): Promise<void> {
    logger.info('Shutting down WebSocket server');

    this.stopHeartbeat();

    // Close all client connections
    this.clients.forEach((client, clientId) => {
      try {
        client.ws.close(1001, 'Server shutting down');
        logger.debug(`Closed connection for client ${clientId}`);
      } catch (error) {
        logger.error(`Error closing client ${clientId}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    this.clients.clear();

    // Close WebSocket server
    if (this.wss) {
      return new Promise((resolve, reject) => {
        this.wss!.close(error => {
          if (error) {
            logger.error('Error closing WebSocket server', { error: error.message });
            reject(error);
          } else {
            logger.info('WebSocket server closed');
            resolve();
          }
        });
      });
    }
  }
}
