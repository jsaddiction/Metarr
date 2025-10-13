/**
 * WebSocket Message Types
 * Defines all client-to-server and server-to-client WebSocket messages
 */

// ============================================================================
// Base Message Types
// ============================================================================

export interface BaseClientMessage {
  type: string;
  requestId?: string; // Optional ID for tracking request/response pairs
}

export interface BaseServerMessage {
  type: string;
  requestId?: string | undefined; // Echo back requestId if provided
  timestamp: string; // ISO 8601 timestamp
}

// ============================================================================
// Client → Server Messages
// ============================================================================

/**
 * Ping - Client sends to keep connection alive
 */
export interface PingMessage extends BaseClientMessage {
  type: 'ping';
}

/**
 * Resync - Client requests full data resync
 */
export interface ResyncMessage extends BaseClientMessage {
  type: 'resync';
  scope?: 'all' | 'movies' | 'players' | 'libraries' | 'scans'; // What to resync
}

/**
 * Update Movie - Client sends movie metadata updates
 */
export interface UpdateMovieMessage extends BaseClientMessage {
  type: 'updateMovie';
  movieId: number;
  updates: {
    title?: string;
    year?: number;
    overview?: string;
    rating?: number;
    // Add other updatable fields as needed
  };
}

/**
 * Delete Image - Client requests image deletion
 */
export interface DeleteImageMessage extends BaseClientMessage {
  type: 'deleteImage';
  imageId: number;
  entityType: 'movie' | 'series' | 'episode';
  entityId: number;
}

/**
 * Update Player - Client sends media player updates
 */
export interface UpdatePlayerMessage extends BaseClientMessage {
  type: 'updatePlayer';
  playerId: number;
  updates: {
    name?: string;
    host?: string;
    port?: number;
    enabled?: boolean;
    // Add other updatable fields
  };
}

/**
 * Start Library Scan - Client requests library scan
 */
export interface StartLibraryScanMessage extends BaseClientMessage {
  type: 'startLibraryScan';
  libraryId: number;
}

/**
 * Cancel Library Scan - Client requests scan cancellation
 */
export interface CancelLibraryScanMessage extends BaseClientMessage {
  type: 'cancelLibraryScan';
  scanId: number;
}

/**
 * Union type of all client messages
 */
export type ClientMessage =
  | PingMessage
  | ResyncMessage
  | UpdateMovieMessage
  | DeleteImageMessage
  | UpdatePlayerMessage
  | StartLibraryScanMessage
  | CancelLibraryScanMessage;

// ============================================================================
// Server → Client Messages
// ============================================================================

/**
 * Pong - Server response to ping
 */
export interface PongMessage extends BaseServerMessage {
  type: 'pong';
  serverTime: string; // ISO 8601 timestamp
}

/**
 * Resync Data - Server sends full data snapshot
 */
export interface ResyncDataMessage extends BaseServerMessage {
  type: 'resyncData';
  scope: 'all' | 'movies' | 'players' | 'libraries' | 'scans';
  data: {
    movies?: any[]; // Movie list data
    players?: any[]; // Media player list
    libraries?: any[]; // Library list
    scans?: any[]; // Active scan jobs
  };
}

/**
 * Player Status - Media player connection status update
 */
export interface PlayerStatusMessage extends BaseServerMessage {
  type: 'playerStatus';
  playerId: number;
  status: 'connected' | 'disconnected' | 'error';
  connectionStatus?: 'connected' | 'disconnected' | 'error' | undefined;
  lastConnected?: string | undefined;
  lastError?: string | undefined;
  jsonRpcVersion?: string | undefined;
}

/**
 * Scan Status - Library scan progress update
 */
export interface ScanStatusMessage extends BaseServerMessage {
  type: 'scanStatus';
  scanId: number;
  libraryId: number;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  progressCurrent: number;
  progressTotal: number;
  currentFile?: string | undefined;
  errorsCount?: number | undefined;
  stats?: {
    added?: number;
    updated?: number;
    deleted?: number;
    failed?: number;
  } | undefined;
}

/**
 * Movies Changed - Notify clients that movie list has changed
 */
export interface MoviesChangedMessage extends BaseServerMessage {
  type: 'moviesChanged';
  action: 'added' | 'updated' | 'deleted';
  movieIds: number[];
  movies?: any[] | undefined; // Optional: include full movie data
}

/**
 * Library Changed - Notify clients that library list has changed
 */
export interface LibraryChangedMessage extends BaseServerMessage {
  type: 'libraryChanged';
  action: 'added' | 'updated' | 'deleted';
  libraryId: number;
  library?: any | undefined; // Optional: include full library data
}

/**
 * Acknowledgment - Server acknowledges successful operation
 */
export interface AckMessage extends BaseServerMessage {
  type: 'ack';
  originalType: string; // Type of message being acknowledged
  success: boolean;
  message?: string | undefined;
}

/**
 * Conflict - Server reports data conflict requiring client action
 */
export interface ConflictMessage extends BaseServerMessage {
  type: 'conflict';
  originalType: string; // Type of message that caused conflict
  reason: string;
  clientVersion?: number;
  serverVersion: number;
  resolution?: 'client_wins' | 'server_wins' | 'manual_required';
}

/**
 * Error - Server reports error
 */
export interface ErrorMessage extends BaseServerMessage {
  type: 'error';
  originalType?: string | undefined; // Type of message that caused error
  error: string;
  code?: string | undefined;
  details?: any | undefined;
}

/**
 * Welcome - Server sends on initial connection
 */
export interface WelcomeMessage extends BaseServerMessage {
  type: 'welcome';
  serverId: string;
  serverVersion: string;
  capabilities: string[]; // List of supported features
}

/**
 * Provider Scrape Start - Server notifies provider scraping has started
 */
export interface ProviderScrapeStartMessage extends BaseServerMessage {
  type: 'providerScrapeStart';
  movieId: number;
  providers: string[];
}

/**
 * Provider Scrape Provider Start - Individual provider fetch started
 */
export interface ProviderScrapeProviderStartMessage extends BaseServerMessage {
  type: 'providerScrapeProviderStart';
  movieId: number;
  provider: string;
}

/**
 * Provider Scrape Provider Complete - Individual provider fetch completed
 */
export interface ProviderScrapeProviderCompleteMessage extends BaseServerMessage {
  type: 'providerScrapeProviderComplete';
  movieId: number;
  provider: string;
  success: boolean;
}

/**
 * Provider Scrape Provider Retry - Individual provider is retrying
 */
export interface ProviderScrapeProviderRetryMessage extends BaseServerMessage {
  type: 'providerScrapeProviderRetry';
  movieId: number;
  provider: string;
  attempt: number;
  maxRetries: number;
}

/**
 * Provider Scrape Provider Timeout - Individual provider timed out
 */
export interface ProviderScrapeProviderTimeoutMessage extends BaseServerMessage {
  type: 'providerScrapeProviderTimeout';
  movieId: number;
  provider: string;
}

/**
 * Provider Scrape Complete - All providers have completed
 */
export interface ProviderScrapeCompleteMessage extends BaseServerMessage {
  type: 'providerScrapeComplete';
  movieId: number;
  completedProviders: string[];
  failedProviders: string[];
  timedOutProviders: string[];
}

/**
 * Provider Scrape Error - Fatal error during scraping
 */
export interface ProviderScrapeErrorMessage extends BaseServerMessage {
  type: 'providerScrapeError';
  movieId: number;
  error: string;
}

/**
 * Union type of all server messages
 */
export type ServerMessage =
  | PongMessage
  | ResyncDataMessage
  | PlayerStatusMessage
  | ScanStatusMessage
  | MoviesChangedMessage
  | LibraryChangedMessage
  | AckMessage
  | ConflictMessage
  | ErrorMessage
  | WelcomeMessage
  | ProviderScrapeStartMessage
  | ProviderScrapeProviderStartMessage
  | ProviderScrapeProviderCompleteMessage
  | ProviderScrapeProviderRetryMessage
  | ProviderScrapeProviderTimeoutMessage
  | ProviderScrapeCompleteMessage
  | ProviderScrapeErrorMessage;

// ============================================================================
// WebSocket Connection Types
// ============================================================================

/**
 * Connected Client Information
 */
export interface ConnectedClient {
  id: string; // Unique client ID
  ws: any; // WebSocket instance (using 'any' to avoid importing ws types here)
  connectedAt: Date;
  lastPing?: Date;
  lastPong?: Date;
  metadata?: {
    userAgent?: string | undefined;
    ip?: string | undefined;
    [key: string]: any;
  } | undefined;
}

/**
 * WebSocket Server Configuration
 */
export interface WebSocketServerConfig {
  pingInterval?: number; // Heartbeat interval in milliseconds (default: 30000)
  pingTimeout?: number; // Time to wait for pong before disconnect (default: 5000)
  maxConnections?: number; // Maximum concurrent connections (default: unlimited)
}

/**
 * Broadcast Options
 */
export interface BroadcastOptions {
  excludeClient?: string; // Client ID to exclude from broadcast
  filter?: (client: ConnectedClient) => boolean; // Custom filter function
}
