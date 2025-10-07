export type MediaPlayerType = 'kodi' | 'jellyfin' | 'plex';

export type ConnectionStatus = 'connected' | 'disconnected' | 'error';

export type TestConnectionStatus = 'idle' | 'testing' | 'success' | 'error';

export interface MediaPlayer {
  id: number;
  name: string;
  type: MediaPlayerType;
  host: string;
  port: number;
  username?: string;
  password?: string;
  apiKey?: string;
  enabled: boolean;
  libraryPaths: string[];
  libraryGroup?: string;
  connectionStatus: ConnectionStatus;
  jsonRpcVersion?: string;
  useWebsocket: boolean;
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
  port: number;
  username?: string;
  password?: string;
  enabled: boolean;
  libraryGroup?: string;
  useWebsocket: boolean;
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