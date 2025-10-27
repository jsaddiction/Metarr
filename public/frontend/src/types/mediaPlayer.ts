export type MediaPlayerType = 'kodi' | 'jellyfin' | 'plex';

export type ConnectionStatus = 'connected' | 'disconnected' | 'error';

export type TestConnectionStatus = 'idle' | 'testing' | 'success' | 'error';

export interface MediaPlayer {
  id: number;
  name: string;
  type: MediaPlayerType;
  host: string;
  httpPort: number; // HTTP JSON-RPC port (default 8080), WebSocket is always 9090
  username?: string;
  password?: string;
  apiKey?: string;
  enabled: boolean;
  libraryPaths: string[];
  libraryGroup?: string;
  connectionStatus: ConnectionStatus;
  jsonRpcVersion?: string;
  lastConnected?: string;
  lastError?: string;
  config: Record<string, any>;
  lastSync?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MediaPlayerFormData {
  name: string;
  type: MediaPlayerType;
  host: string;
  httpPort: number; // HTTP JSON-RPC port (default 8080)
  username?: string;
  password?: string;
  enabled: boolean;
  libraryGroup?: string;
  groupName?: string; // Group name for shared MySQL or new group
  isSharedMysql?: boolean; // True if Kodi with shared MySQL backend
}

export interface TestConnectionResult {
  success: boolean;
  version?: string;
  error?: string;
}

export interface MediaPlayerStatus {
  id: number;
  name: string;
  type: string;
  connectionStatus: ConnectionStatus;
  jsonRpcVersion?: string;
  lastConnected?: string;
  lastError?: string;
}

export interface MediaPlayerGroup {
  id: number;
  name: string;
  type: MediaPlayerType;
  max_members: number | null;
  members: MediaPlayer[];
}

export interface PlayerActivityState {
  playerId: number;
  playerName: string;
  connectionMode: 'websocket' | 'http' | 'disconnected';
  activity: {
    type: 'idle' | 'playing' | 'paused' | 'scanning';
    details?: string;
    progress?: {
      percentage?: number;
      currentSeconds?: number;
      totalSeconds?: number;
    };
    filepath?: string;
    kodiPlayerId?: number;
  };
  lastUpdated: string;
}