import {
  JsonRpcRequest,
  JsonRpcResponse,
  KodiMethod,
  DetectedVersion,
  VideoLibrary,
  Player,
  Files,
  XBMC,
} from '../../types/jsonrpc.js';
import { logger } from '../../middleware/logging.js';
import { getErrorMessage, isError } from '../../utils/errorHandling.js';

export interface KodiHttpClientOptions {
  host: string;
  port: number;
  username?: string;
  password?: string;
  timeout?: number;
}

export class KodiHttpClient {
  private baseUrl: string;
  private auth?: string;
  private timeout: number;
  private requestId: number = 1;

  constructor(options: KodiHttpClientOptions) {
    this.baseUrl = `http://${options.host}:${options.port}/jsonrpc`;
    this.timeout = options.timeout || 5000;

    if (options.username && options.password) {
      this.auth = Buffer.from(`${options.username}:${options.password}`).toString('base64');
    }
  }

  /**
   * Send a JSON-RPC request via HTTP
   */
  async sendRequest<T = unknown>(method: KodiMethod, params?: unknown): Promise<T> {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method,
      params: params || {},
      id: this.requestId++,
    };

    logger.debug(`Kodi HTTP Request: ${method}`, { baseUrl: this.baseUrl, params });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.auth) {
        headers['Authorization'] = `Basic ${this.auth}`;
      }

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const jsonResponse = (await response.json()) as JsonRpcResponse<T>;

      if (jsonResponse.error) {
        throw new Error(`JSON-RPC Error ${jsonResponse.error.code}: ${jsonResponse.error.message}`);
      }

      if (jsonResponse.result === undefined) {
        throw new Error('Invalid JSON-RPC response: missing result');
      }

      logger.debug(`Kodi HTTP Response: ${method}`, { result: jsonResponse.result });

      return jsonResponse.result;
    } catch (error) {
      clearTimeout(timeoutId);

      if (isError(error) && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.timeout}ms`);
      }

      logger.error(`Kodi HTTP Error: ${method}`, { error: getErrorMessage(error) });
      throw error;
    }
  }

  /**
   * Test connection by sending a ping
   */
  async testConnection(): Promise<boolean> {
    try {
      const result = await this.sendRequest<string>('JSONRPC.Ping');
      return result === 'pong';
    } catch (error) {
      // Connection failures logged by connection manager
      return false;
    }
  }

  /**
   * Get Kodi version information
   */
  async getVersion(): Promise<{ version: { major: number; minor: number; patch: number } }> {
    return this.sendRequest<{ version: { major: number; minor: number; patch: number } }>(
      'JSONRPC.Version'
    );
  }

  /**
   * Detect and determine the JSON-RPC API version
   */
  async detectVersion(): Promise<DetectedVersion> {
    try {
      const versionInfo = await this.getVersion();
      const { major, minor, patch } = versionInfo.version;

      console.log('HTTP: Kodi version info', { major, minor, patch });

      let version = 'unknown';
      let supported = false;

      // Determine version string based on major.minor
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
        // Assume future versions are compatible with v13.5
        version = 'v13.5';
        supported = true;
      }

      return {
        version,
        major,
        minor,
        patch,
        supported,
      };
    } catch (error) {
      logger.error('Failed to detect Kodi version', { error });
      throw error;
    }
  }

  /**
   * Scan video library
   */
  async scanVideoLibrary(params?: VideoLibrary.ScanParams): Promise<string> {
    const result = await this.sendRequest<string>('VideoLibrary.Scan', params);
    return result;
  }

  /**
   * Clean video library
   */
  async cleanVideoLibrary(params?: VideoLibrary.CleanParams): Promise<string> {
    const result = await this.sendRequest<string>('VideoLibrary.Clean', params);
    return result;
  }

  /**
   * Get movies from video library
   */
  async getMovies(params?: VideoLibrary.GetMoviesParams): Promise<VideoLibrary.GetMoviesResponse> {
    return this.sendRequest<VideoLibrary.GetMoviesResponse>('VideoLibrary.GetMovies', params);
  }

  /**
   * Get movie details by ID
   */
  async getMovieDetails(
    params: VideoLibrary.GetMovieDetailsParams
  ): Promise<VideoLibrary.GetMovieDetailsResponse> {
    return this.sendRequest<VideoLibrary.GetMovieDetailsResponse>(
      'VideoLibrary.GetMovieDetails',
      params
    );
  }

  /**
   * Set movie details
   */
  async setMovieDetails(params: VideoLibrary.SetMovieDetailsParams): Promise<string> {
    return this.sendRequest<string>('VideoLibrary.SetMovieDetails', params);
  }

  /**
   * Remove movie from library by ID
   */
  async removeMovie(params: VideoLibrary.RemoveMovieParams): Promise<string> {
    return this.sendRequest<string>('VideoLibrary.RemoveMovie', params);
  }

  /**
   * Refresh movie metadata and artwork (forces re-read of NFO and images)
   */
  async refreshMovie(params: VideoLibrary.RefreshMovieParams): Promise<string> {
    return this.sendRequest<string>('VideoLibrary.RefreshMovie', params);
  }

  /**
   * Get active players
   */
  async getActivePlayers(): Promise<Player.GetActivePlayersResponse[]> {
    return this.sendRequest<Player.GetActivePlayersResponse[]>('Player.GetActivePlayers');
  }

  /**
   * Get player properties
   */
  async getPlayerProperties(params: Player.GetPropertiesParams): Promise<Player.PlayerProperties> {
    return this.sendRequest<Player.PlayerProperties>('Player.GetProperties', params);
  }

  /**
   * Play or pause player
   */
  async playPause(params: Player.PlayPauseParams): Promise<Player.PlayerSpeed> {
    return this.sendRequest<Player.PlayerSpeed>('Player.PlayPause', params);
  }

  /**
   * Stop player
   */
  async stopPlayer(params: Player.StopParams): Promise<string> {
    return this.sendRequest<string>('Player.Stop', params);
  }

  /**
   * Seek player position
   */
  async seek(params: Player.SeekParams): Promise<Player.PlayerProperties> {
    return this.sendRequest<Player.PlayerProperties>('Player.Seek', params);
  }

  /**
   * Get file sources
   */
  async getFileSources(params?: Files.GetSourcesParams): Promise<Files.GetSourcesResponse> {
    return this.sendRequest<Files.GetSourcesResponse>('Files.GetSources', params);
  }

  /**
   * Get directory contents
   */
  async getDirectory(params: Files.GetDirectoryParams): Promise<Files.GetDirectoryResponse> {
    return this.sendRequest<Files.GetDirectoryResponse>('Files.GetDirectory', params);
  }

  /**
   * Show notification on Kodi UI
   */
  async showNotification(params: {
    title: string;
    message: string;
    image?: string;
    displaytime?: number; // milliseconds (default: 5000)
  }): Promise<string> {
    return this.sendRequest<string>('GUI.ShowNotification', {
      title: params.title,
      message: params.message,
      image: params.image || 'info', // 'info', 'warning', 'error', or image path
      displaytime: params.displaytime || 5000,
    });
  }

  /**
   * Get boolean info properties (e.g., Library.IsScanning)
   */
  async getInfoBooleans(params: XBMC.GetInfoBooleansParams): Promise<XBMC.GetInfoBooleansResponse> {
    return this.sendRequest<XBMC.GetInfoBooleansResponse>('XBMC.GetInfoBooleans', params);
  }

  /**
   * Get string info labels (e.g., System.BuildVersion)
   */
  async getInfoLabels(params: XBMC.GetInfoLabelsParams): Promise<XBMC.GetInfoLabelsResponse> {
    return this.sendRequest<XBMC.GetInfoLabelsResponse>('XBMC.GetInfoLabels', params);
  }

  /**
   * Update the base URL (useful if host/port changes)
   */
  updateConnection(options: KodiHttpClientOptions): void {
    this.baseUrl = `http://${options.host}:${options.port}/jsonrpc`;
    this.timeout = options.timeout || this.timeout;

    if (options.username && options.password) {
      this.auth = Buffer.from(`${options.username}:${options.password}`).toString('base64');
    }
  }
}
