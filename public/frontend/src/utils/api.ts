import {
  MediaPlayer,
  MediaPlayerFormData,
  TestConnectionResult,
  MediaPlayerStatus,
} from '../types/mediaPlayer';
import {
  Library,
  LibraryFormData,
  ScanJob,
  DirectoryEntry,
  ValidatePathResult,
  ScanProgressEvent,
  ScanCompletedEvent,
  ScanFailedEvent,
} from '../types/library';
import { Movie, MovieListResult } from '../types/movie';
import {
  ProviderWithMetadata,
  UpdateProviderRequest,
  TestProviderResponse,
  GetAllProvidersResponse,
  GetProviderResponse,
  UpdateProviderResponse,
} from '../types/provider';

const API_BASE_URL = '/api';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new ApiError(response.status, error.error || response.statusText);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new Error(`Network error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export const mediaPlayerApi = {
  /**
   * Get all media players
   */
  async getAll(): Promise<MediaPlayer[]> {
    return fetchApi<MediaPlayer[]>('/media-players');
  },

  /**
   * Get a media player by ID
   */
  async getById(id: number): Promise<MediaPlayer> {
    return fetchApi<MediaPlayer>(`/media-players/${id}`);
  },

  /**
   * Create a new media player
   */
  async create(data: MediaPlayerFormData): Promise<MediaPlayer> {
    return fetchApi<MediaPlayer>('/media-players', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Update a media player
   */
  async update(id: number, data: Partial<MediaPlayerFormData>): Promise<MediaPlayer> {
    return fetchApi<MediaPlayer>(`/media-players/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /**
   * Delete a media player
   */
  async delete(id: number): Promise<void> {
    return fetchApi<void>(`/media-players/${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * Test connection to a saved media player
   */
  async testConnection(id: number): Promise<TestConnectionResult> {
    return fetchApi<TestConnectionResult>(`/media-players/${id}/test`, {
      method: 'POST',
    });
  },

  /**
   * Test connection without saving
   */
  async testConnectionUnsaved(data: Partial<MediaPlayerFormData>): Promise<TestConnectionResult> {
    return fetchApi<TestConnectionResult>('/media-players/test', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Manually connect a media player
   */
  async connect(id: number): Promise<{ success: boolean; message: string }> {
    return fetchApi(`/media-players/${id}/connect`, {
      method: 'POST',
    });
  },

  /**
   * Manually disconnect a media player
   */
  async disconnect(id: number): Promise<{ success: boolean; message: string }> {
    return fetchApi(`/media-players/${id}/disconnect`, {
      method: 'POST',
    });
  },

  /**
   * Subscribe to real-time status updates via Server-Sent Events
   */
  subscribeToStatus(callback: (statuses: MediaPlayerStatus[]) => void): () => void {
    const eventSource = new EventSource(`${API_BASE_URL}/media-players/status`);

    eventSource.onmessage = (event) => {
      try {
        const statuses = JSON.parse(event.data);
        callback(statuses);
      } catch (error) {
        console.error('Failed to parse SSE data:', error);
      }
    };

    eventSource.addEventListener('playerConnected', (event: any) => {
      try {
        const status = JSON.parse(event.data);
        console.log('Player connected:', status);
      } catch (error) {
        console.error('Failed to parse playerConnected event:', error);
      }
    });

    eventSource.addEventListener('playerDisconnected', (event: any) => {
      try {
        const status = JSON.parse(event.data);
        console.log('Player disconnected:', status);
      } catch (error) {
        console.error('Failed to parse playerDisconnected event:', error);
      }
    });

    eventSource.addEventListener('playerError', (event: any) => {
      try {
        const status = JSON.parse(event.data);
        console.error('Player error:', status);
      } catch (error) {
        console.error('Failed to parse playerError event:', error);
      }
    });

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
    };

    // Return cleanup function
    return () => {
      eventSource.close();
    };
  },
};

export const libraryApi = {
  /**
   * Get all libraries
   */
  async getAll(): Promise<Library[]> {
    return fetchApi<Library[]>('/libraries');
  },

  /**
   * Get a library by ID
   */
  async getById(id: number): Promise<Library> {
    return fetchApi<Library>(`/libraries/${id}`);
  },

  /**
   * Get available drives (Windows)
   */
  async getDrives(): Promise<string[]> {
    return fetchApi<string[]>('/libraries/drives');
  },

  /**
   * Create a new library
   */
  async create(data: LibraryFormData): Promise<Library> {
    return fetchApi<Library>('/libraries', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Update a library
   */
  async update(id: number, data: Partial<LibraryFormData>): Promise<Library> {
    return fetchApi<Library>(`/libraries/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /**
   * Delete a library
   */
  async delete(id: number): Promise<void> {
    return fetchApi<void>(`/libraries/${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * Start a library scan
   */
  async startScan(id: number): Promise<ScanJob> {
    return fetchApi<ScanJob>(`/libraries/${id}/scan`, {
      method: 'POST',
    });
  },

  /**
   * Validate a directory path
   */
  async validatePath(path: string): Promise<ValidatePathResult> {
    return fetchApi<ValidatePathResult>('/libraries/validate-path', {
      method: 'POST',
      body: JSON.stringify({ path }),
    });
  },

  /**
   * Browse a directory
   */
  async browsePath(path: string): Promise<DirectoryEntry[]> {
    return fetchApi<DirectoryEntry[]>(`/libraries/browse?path=${encodeURIComponent(path)}`);
  },

  /**
   * Subscribe to scan progress updates via Server-Sent Events
   */
  subscribeToScanProgress(
    onProgress?: (event: ScanProgressEvent) => void,
    onCompleted?: (event: ScanCompletedEvent) => void,
    onFailed?: (event: ScanFailedEvent) => void
  ): () => void {
    const eventSource = new EventSource(`${API_BASE_URL}/libraries/scan-status`);

    if (onProgress) {
      eventSource.addEventListener('scanProgress', (event: any) => {
        try {
          const data = JSON.parse(event.data);
          onProgress(data);
        } catch (error) {
          console.error('Failed to parse scanProgress event:', error);
        }
      });
    }

    if (onCompleted) {
      eventSource.addEventListener('scanCompleted', (event: any) => {
        try {
          const data = JSON.parse(event.data);
          onCompleted(data);
        } catch (error) {
          console.error('Failed to parse scanCompleted event:', error);
        }
      });
    }

    if (onFailed) {
      eventSource.addEventListener('scanFailed', (event: any) => {
        try {
          const data = JSON.parse(event.data);
          onFailed(data);
        } catch (error) {
          console.error('Failed to parse scanFailed event:', error);
        }
      });
    }

    eventSource.addEventListener('activeScans', (event: any) => {
      try {
        const scans = JSON.parse(event.data);
        console.log('Active scans:', scans);
      } catch (error) {
        console.error('Failed to parse activeScans event:', error);
      }
    });

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
    };

    // Return cleanup function
    return () => {
      eventSource.close();
    };
  },
};

export const movieApi = {
  /**
   * Get all movies with optional filtering
   */
  async getAll(filters?: { status?: string; limit?: number; offset?: number }): Promise<MovieListResult> {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.limit) params.append('limit', filters.limit.toString());
    if (filters?.offset) params.append('offset', filters.offset.toString());

    const endpoint = params.toString() ? `/movies?${params}` : '/movies';
    return fetchApi<MovieListResult>(endpoint);
  },

  /**
   * Subscribe to real-time movie updates via Server-Sent Events
   */
  subscribeToUpdates(
    onAdded?: (movies: Movie[]) => void,
    onUpdated?: (movie: Movie) => void,
    onRemoved?: (id: number) => void
  ): () => void {
    const eventSource = new EventSource(`${API_BASE_URL}/movies/updates`);

    if (onAdded) {
      eventSource.addEventListener('moviesAdded', (event: any) => {
        try {
          const movies = JSON.parse(event.data);
          onAdded(movies);
        } catch (error) {
          console.error('Failed to parse moviesAdded event:', error);
        }
      });
    }

    if (onUpdated) {
      eventSource.addEventListener('movieUpdated', (event: any) => {
        try {
          const movie = JSON.parse(event.data);
          onUpdated(movie);
        } catch (error) {
          console.error('Failed to parse movieUpdated event:', error);
        }
      });
    }

    if (onRemoved) {
      eventSource.addEventListener('movieRemoved', (event: any) => {
        try {
          const data = JSON.parse(event.data);
          onRemoved(data.id);
        } catch (error) {
          console.error('Failed to parse movieRemoved event:', error);
        }
      });
    }

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
    };

    // Return cleanup function
    return () => {
      eventSource.close();
    };
  },
};

export const providerApi = {
  /**
   * Get all providers with their metadata
   */
  async getAll(): Promise<ProviderWithMetadata[]> {
    const response = await fetchApi<GetAllProvidersResponse>('/providers');
    return response.providers;
  },

  /**
   * Get a single provider by name
   */
  async getByName(name: string): Promise<{ config: any; metadata: any }> {
    return fetchApi<GetProviderResponse>(`/providers/${name}`);
  },

  /**
   * Update provider configuration
   */
  async update(name: string, data: UpdateProviderRequest): Promise<ProviderWithMetadata> {
    const response = await fetchApi<UpdateProviderResponse>(`/providers/${name}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response.provider;
  },

  /**
   * Test provider connection
   */
  async test(name: string, apiKey?: string): Promise<TestProviderResponse> {
    return fetchApi<TestProviderResponse>(`/providers/${name}/test`, {
      method: 'POST',
      body: JSON.stringify({ apiKey }),
    });
  },

  /**
   * Disable provider (delete configuration)
   */
  async disable(name: string): Promise<void> {
    return fetchApi<void>(`/providers/${name}`, {
      method: 'DELETE',
    });
  },
};

export { ApiError };