/**
 * WebSocket Message Types (Frontend)
 * Mirrors backend types from src/types/websocket.ts
 */

import { MovieListItem } from './movie';
import { MediaPlayer } from './mediaPlayer';
import { Library, ScanJob } from './library';

// ============================================================================
// Base Message Types
// ============================================================================

export interface BaseClientMessage {
  type: string;
  requestId?: string;
}

export interface BaseServerMessage {
  type: string;
  requestId?: string;
  timestamp: string;
}

// ============================================================================
// Client → Server Messages
// ============================================================================

export interface PingMessage extends BaseClientMessage {
  type: 'ping';
}

export interface ResyncMessage extends BaseClientMessage {
  type: 'resync';
  scope?: 'all' | 'movies' | 'players' | 'libraries' | 'scans';
}

export interface UpdateMovieMessage extends BaseClientMessage {
  type: 'updateMovie';
  movieId: number;
  updates: {
    title?: string;
    year?: number;
    overview?: string;
    rating?: number;
    [key: string]: string | number | boolean | null | undefined;
  };
}

export interface DeleteImageMessage extends BaseClientMessage {
  type: 'deleteImage';
  imageId: number;
  entityType: 'movie' | 'series' | 'episode';
  entityId: number;
}

export interface UpdatePlayerMessage extends BaseClientMessage {
  type: 'updatePlayer';
  playerId: number;
  updates: {
    name?: string;
    host?: string;
    port?: number;
    enabled?: boolean;
    [key: string]: string | number | boolean | null | undefined;
  };
}

export interface StartLibraryScanMessage extends BaseClientMessage {
  type: 'startLibraryScan';
  libraryId: number;
}

export interface CancelLibraryScanMessage extends BaseClientMessage {
  type: 'cancelLibraryScan';
  scanId: number;
}

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

export interface PongMessage extends BaseServerMessage {
  type: 'pong';
  serverTime: string;
}

export interface ResyncDataMessage extends BaseServerMessage {
  type: 'resyncData';
  scope: 'all' | 'movies' | 'players' | 'libraries' | 'scans';
  data: {
    movies?: MovieListItem[];
    players?: MediaPlayer[];
    libraries?: Library[];
    scans?: ScanJob[];
  };
}

export interface PlayerStatusMessage extends BaseServerMessage {
  type: 'playerStatus';
  playerId: number;
  status: 'connected' | 'disconnected' | 'error';
  connectionStatus?: 'connected' | 'disconnected' | 'error';
  lastConnected?: string;
  lastError?: string;
  jsonRpcVersion?: string;
}

export interface ScanStatusMessage extends BaseServerMessage {
  type: 'scanStatus';
  scanId: number;
  libraryId: number;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  progressCurrent: number;
  progressTotal: number;
  currentFile?: string;
  errorsCount?: number;
  stats?: {
    added?: number;
    updated?: number;
    deleted?: number;
    failed?: number;
  };
}

export interface MoviesChangedMessage extends BaseServerMessage {
  type: 'moviesChanged';
  action: 'added' | 'updated' | 'deleted';
  movieIds: number[];
  movies?: MovieListItem[];
}

export interface LibraryChangedMessage extends BaseServerMessage {
  type: 'libraryChanged';
  action: 'added' | 'updated' | 'deleted';
  libraryId: number;
  library?: Library;
}

export interface AckMessage extends BaseServerMessage {
  type: 'ack';
  originalType: string;
  success: boolean;
  message?: string;
}

export interface ConflictMessage extends BaseServerMessage {
  type: 'conflict';
  originalType: string;
  reason: string;
  clientVersion?: number;
  serverVersion: number;
  resolution?: 'client_wins' | 'server_wins' | 'manual_required';
}

export interface ErrorMessage extends BaseServerMessage {
  type: 'error';
  originalType?: string;
  error: string;
  code?: string;
  details?: Record<string, unknown>;
}

export interface WelcomeMessage extends BaseServerMessage {
  type: 'welcome';
  serverId: string;
  serverVersion: string;
  capabilities: string[];
}

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
  | WelcomeMessage;

// ============================================================================
// Connection State Types
// ============================================================================

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface WebSocketConfig {
  url: string;
  reconnectInterval?: number;
  maxReconnectInterval?: number;
  pingInterval?: number;
}
