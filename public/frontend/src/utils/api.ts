import {
  MediaPlayer,
  MediaPlayerFormData,
  TestConnectionResult,
  MediaPlayerStatus,
  PlayerActivityState,
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
import {
  MovieListItem,
  MovieDetail,
  MovieListResult,
  ToggleMonitoredResponse,
  LockFieldResponse,
  ResetMetadataResponse,
} from '../types/movie';
import {
  ProviderWithMetadata,
  UpdateProviderRequest,
  TestProviderResponse,
  GetAllProvidersResponse,
  GetProviderResponse,
  UpdateProviderResponse,
  AutoSelectionStrategy,
  GetAutoSelectionStrategyResponse,
  SetAutoSelectionStrategyRequest,
  SetAutoSelectionStrategyResponse,
  DataSelectionConfig,
  UpdateDataSelectionModeRequest,
  UpdateDataSelectionModeResponse,
  UpdateFieldPriorityRequest,
  UpdateFieldPriorityResponse,
  GetProviderOrderResponse,
} from '../types/provider';
import { ProviderResultsResponse } from '../types/asset';
import {
  Job,
  JobStats,
  JobHistoryRecord,
  JobHistoryFilters,
  JobHistoryResponse,
  TriggerJobRequest,
  TriggerJobResponse,
  JobsResponse,
} from '../types/job';
import {
  AssetLimit,
  AssetLimitsMap,
  SetAssetLimitRequest,
  SetAssetLimitResponse,
  ResetAssetLimitResponse,
  ResetAllLimitsResponse,
} from '../types/assetConfig';
import {
  LibraryCompletenessStatsResponse,
  MovieEnrichmentStatusResponse,
  TriggerEnrichRequest,
  TriggerEnrichResponse,
  BulkEnrichmentStatusResponse,
  TriggerBulkEnrichRequest,
  TriggerBulkEnrichResponse,
} from '../types/enrichment';

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
   * Get all media player groups
   */
  async getGroups(): Promise<Array<{ id: number; name: string; type: string; max_members: number | null }>> {
    return fetchApi('/media-player-groups');
  },

  /**
   * Get all media player groups with their members
   */
  async getGroupsWithMembers(): Promise<import('../types/mediaPlayer').MediaPlayerGroup[]> {
    return fetchApi('/media-player-groups/with-members');
  },

  /**
   * Get all player activity states
   */
  async getAllActivityStates(): Promise<PlayerActivityState[]> {
    return fetchApi<PlayerActivityState[]>('/media-players/activity');
  },

  /**
   * Get activity state for a specific player
   */
  async getActivityState(id: number): Promise<PlayerActivityState> {
    return fetchApi<PlayerActivityState>(`/media-players/${id}/activity`);
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
   * Get server platform information
   */
  async getPlatform(): Promise<{ platform: string; isWindows: boolean; separator: string }> {
    return fetchApi<{ platform: string; isWindows: boolean; separator: string }>('/libraries/platform');
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
    onAdded?: (movies: MovieListItem[]) => void,
    onUpdated?: (movie: MovieListItem) => void,
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

  /**
   * Get a single movie by ID with optional includes
   * GET /api/movies/:id?include=files,candidates,locks
   */
  async getById(id: number, include?: string[]): Promise<MovieDetail> {
    const params = new URLSearchParams();
    if (include && include.length > 0) {
      params.set('include', include.join(','));
    }

    const endpoint = `/movies/${id}${params.toString() ? `?${params}` : ''}`;
    return fetchApi<MovieDetail>(endpoint);
  },

  /**
   * Delete a movie
   * DELETE /api/movies/:id
   */
  async delete(id: number): Promise<void> {
    return fetchApi<void>(`/movies/${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * Toggle monitored status for a movie
   * POST /api/movies/:id/toggle-monitored
   */
  async toggleMonitored(id: number): Promise<ToggleMonitoredResponse> {
    return fetchApi<ToggleMonitoredResponse>(`/movies/${id}/toggle-monitored`, {
      method: 'POST',
    });
  },

  /**
   * Lock a field to prevent automation from modifying it
   * POST /api/movies/:id/lock-field
   */
  async lockField(id: number, fieldName: string): Promise<LockFieldResponse> {
    return fetchApi<LockFieldResponse>(`/movies/${id}/lock-field`, {
      method: 'POST',
      body: JSON.stringify({ fieldName }),
    });
  },

  /**
   * Unlock a field to allow automation to modify it
   * POST /api/movies/:id/unlock-field
   */
  async unlockField(id: number, fieldName: string): Promise<LockFieldResponse> {
    return fetchApi<LockFieldResponse>(`/movies/${id}/unlock-field`, {
      method: 'POST',
      body: JSON.stringify({ fieldName }),
    });
  },

  /**
   * Reset all metadata locks
   * POST /api/movies/:id/reset-metadata
   */
  async resetMetadata(id: number): Promise<ResetMetadataResponse> {
    return fetchApi<ResetMetadataResponse>(`/movies/${id}/reset-metadata`, {
      method: 'POST',
    });
  },

  /**
   * Get genre suggestions for autocomplete
   * GET /api/movies/suggestions/genres
   */
  async getGenreSuggestions(): Promise<string[]> {
    return fetchApi<string[]>('/movies/suggestions/genres');
  },

  /**
   * Get director suggestions for autocomplete
   * GET /api/movies/suggestions/directors
   */
  async getDirectorSuggestions(): Promise<string[]> {
    return fetchApi<string[]>('/movies/suggestions/directors');
  },

  /**
   * Get writer suggestions for autocomplete
   * GET /api/movies/suggestions/writers
   */
  async getWriterSuggestions(): Promise<string[]> {
    return fetchApi<string[]>('/movies/suggestions/writers');
  },

  /**
   * Get studio suggestions for autocomplete
   * GET /api/movies/suggestions/studios
   */
  async getStudioSuggestions(): Promise<string[]> {
    return fetchApi<string[]>('/movies/suggestions/studios');
  },

  /**
   * Get country suggestions for autocomplete
   * GET /api/movies/suggestions/countries
   */
  async getCountrySuggestions(): Promise<string[]> {
    return fetchApi<string[]>('/movies/suggestions/countries');
  },

  /**
   * Get tag suggestions for autocomplete
   * GET /api/movies/suggestions/tags
   */
  async getTagSuggestions(): Promise<string[]> {
    return fetchApi<string[]>('/movies/suggestions/tags');
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

  /**
   * Get provider statistics (API calls in last 24 hours)
   */
  async getStatistics(): Promise<Record<string, {
    totalCalls24h: number;
    lastSuccessfulFetch?: string;
    successRate?: number;
  }>> {
    const response = await fetchApi<{ providers: Record<string, {
      totalCalls24h: number;
      lastSuccessfulFetch?: string;
      successRate?: number;
    }> }>('/providers/statistics');
    return response.providers;
  },
};

/**
 * Priority Configuration API
 */
export const priorityApi = {
  /**
   * Get all available priority presets
   */
  async getPresets(): Promise<import('../types/provider').PriorityPreset[]> {
    const response = await fetchApi<import('../types/provider').GetPresetsResponse>('/priorities/presets');
    return response.presets;
  },

  /**
   * Get the currently active preset
   */
  async getActivePreset(): Promise<import('../types/provider').PriorityPresetSelection | null> {
    const response = await fetchApi<import('../types/provider').GetActivePresetResponse>('/priorities/active');
    return response.activePreset;
  },

  /**
   * Apply a priority preset
   */
  async applyPreset(presetId: string): Promise<void> {
    return fetchApi<void>('/priorities/apply', {
      method: 'POST',
      body: JSON.stringify({ presetId }),
    });
  },

  /**
   * Get all asset type priorities
   */
  async getAssetTypePriorities(): Promise<import('../types/provider').AssetTypePriority[]> {
    const response = await fetchApi<import('../types/provider').GetAssetTypePrioritiesResponse>('/priorities/asset-types');
    return response.priorities;
  },

  /**
   * Get priority for a specific asset type
   */
  async getAssetTypePriority(assetType: string): Promise<import('../types/provider').AssetTypePriority> {
    const response = await fetchApi<{ priority: import('../types/provider').AssetTypePriority }>(`/priorities/asset-types/${assetType}`);
    return response.priority;
  },

  /**
   * Update priority for a specific asset type
   */
  async updateAssetTypePriority(assetType: string, providerOrder: string[]): Promise<import('../types/provider').AssetTypePriority> {
    const response = await fetchApi<{ success: boolean; priority: import('../types/provider').AssetTypePriority }>(`/priorities/asset-types/${assetType}`, {
      method: 'POST',
      body: JSON.stringify({ providerOrder }),
    });
    return response.priority;
  },

  /**
   * Get all metadata field priorities
   */
  async getMetadataFieldPriorities(): Promise<import('../types/provider').MetadataFieldPriority[]> {
    const response = await fetchApi<import('../types/provider').GetMetadataFieldPrioritiesResponse>('/priorities/metadata-fields');
    return response.priorities;
  },

  /**
   * Get priority for a specific metadata field
   */
  async getMetadataFieldPriority(fieldName: string): Promise<import('../types/provider').MetadataFieldPriority> {
    const response = await fetchApi<{ priority: import('../types/provider').MetadataFieldPriority }>(`/priorities/metadata-fields/${fieldName}`);
    return response.priority;
  },

  /**
   * Update priority for a specific metadata field
   */
  async updateMetadataFieldPriority(fieldName: string, providerOrder: string[]): Promise<import('../types/provider').MetadataFieldPriority> {
    const response = await fetchApi<{ success: boolean; priority: import('../types/provider').MetadataFieldPriority }>(`/priorities/metadata-fields/${fieldName}`, {
      method: 'POST',
      body: JSON.stringify({ providerOrder }),
    });
    return response.priority;
  },
};

/**
 * Auto-Selection Strategy API
 */
export const autoSelectionApi = {
  /**
   * Get the current auto-selection strategy
   */
  async getStrategy(): Promise<AutoSelectionStrategy> {
    const response = await fetchApi<GetAutoSelectionStrategyResponse>('/auto-selection/strategy');
    return response.strategy;
  },

  /**
   * Set the auto-selection strategy
   */
  async setStrategy(strategy: AutoSelectionStrategy): Promise<void> {
    const data: SetAutoSelectionStrategyRequest = { strategy };
    await fetchApi<SetAutoSelectionStrategyResponse>('/auto-selection/strategy', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

/**
 * Asset Selection API
 * For fetching provider results and selecting assets
 */
export const assetApi = {
  /**
   * Get provider results for any entity type (generic)
   * @param entityType - Entity type (movie, series, etc.)
   * @param entityId - Entity ID
   * @param assetTypes - Optional array of asset types to fetch
   * @param force - Force fresh fetch (bypass cache)
   */
  async getEntityProviderResults(
    entityType: string,
    entityId: number,
    assetTypes?: string[],
    force = false
  ): Promise<ProviderResultsResponse> {
    const params = new URLSearchParams();
    if (force) params.append('force', 'true');
    if (assetTypes && assetTypes.length > 0) {
      params.append('assetTypes', assetTypes.join(','));
    }

    // Use plural form for endpoint (movie -> movies, series -> series, etc.)
    const entityTypePlural = entityType === 'series' ? 'series' : `${entityType}s`;
    const endpoint = `/${entityTypePlural}/${entityId}/provider-results${params.toString() ? `?${params}` : ''}`;
    return fetchApi<ProviderResultsResponse>(endpoint);
  },

  /**
   * Subscribe to provider scraping progress via SSE
   */
  subscribeToScrapeProgress(
    movieId: number,
    callbacks: {
      onStart?: (providers: string[]) => void;
      onProviderStart?: (provider: string) => void;
      onProviderComplete?: (provider: string, success: boolean) => void;
      onProviderRetry?: (provider: string, attempt: number, maxRetries: number) => void;
      onProviderTimeout?: (provider: string) => void;
      onComplete?: (completed: string[], failed: string[], timedOut: string[]) => void;
      onError?: (error: string) => void;
    }
  ): () => void {
    // Note: This would need to be implemented based on your SSE architecture
    // For now, returning a no-op cleanup function
    return () => {};
  },

  /**
   * Get asset candidates for an entity
   * GET /api/movies/:id/asset-candidates?type=poster&includeBlocked=false
   */
  async getCandidates(
    entityId: number,
    assetType: string,
    includeBlocked: boolean = false
  ): Promise<any[]> {
    const params = new URLSearchParams({ type: assetType });
    if (includeBlocked) params.append('includeBlocked', 'true');

    const response = await fetchApi<{ candidates: any[] }>(
      `/movies/${entityId}/asset-candidates?${params}`
    );
    return response.candidates;
  },

  // REMOVED: selectCandidate, blockCandidate, unblockCandidate, resetSelection
  // These API methods are no longer available with the cache-aside pattern.
  // Asset selection now happens via the replaceAssets endpoint.
};

/**
 * Recycle Bin API
 */
export const recycleBinApi = {
  /**
   * Get recycled files for a movie
   */
  async getForMovie(movieId: number): Promise<any[]> {
    return fetchApi<any[]>(`/movies/${movieId}/recycle-bin`);
  },

  /**
   * Get recycled files for an episode
   */
  async getForEpisode(episodeId: number): Promise<any[]> {
    return fetchApi<any[]>(`/episodes/${episodeId}/recycle-bin`);
  },

  /**
   * Get recycle bin statistics
   */
  async getStats(): Promise<{ success: boolean; data: any }> {
    return fetchApi<{ success: boolean; data: any }>('/recycle-bin/stats');
  },

  /**
   * Restore a file from recycle bin
   */
  async restore(recycleId: number): Promise<any> {
    return fetchApi<any>(`/recycle-bin/${recycleId}/restore`, {
      method: 'POST',
    });
  },

  /**
   * Permanently delete a file from recycle bin
   */
  async permanentlyDelete(recycleId: number): Promise<any> {
    return fetchApi<any>(`/recycle-bin/${recycleId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Cleanup expired recycle bin items
   */
  async cleanupExpired(): Promise<any> {
    return fetchApi<any>('/recycle-bin/cleanup/expired', {
      method: 'POST',
    });
  },

  /**
   * Cleanup pending recycle bin items
   */
  async cleanupPending(): Promise<any> {
    return fetchApi<any>('/recycle-bin/cleanup/pending', {
      method: 'POST',
    });
  },

  /**
   * Empty entire recycle bin
   */
  async empty(): Promise<any> {
    return fetchApi<any>('/recycle-bin/empty', {
      method: 'POST',
    });
  },
};

/**
 * Job API module - Job queue and history management
 */
export const jobApi = {
  /**
   * Get active and recent jobs
   * GET /api/jobs
   */
  async getAll(): Promise<Job[]> {
    const response = await fetchApi<JobsResponse>('/jobs');
    return response.jobs || [];
  },

  /**
   * Get job statistics aggregated by status
   * GET /api/jobs/stats
   */
  async getStats(): Promise<JobStats> {
    return fetchApi<JobStats>('/jobs/stats');
  },

  /**
   * Get job history with optional filters
   * GET /api/jobs/history?limit=50&type=movie_metadata&status=completed
   */
  async getHistory(filters?: JobHistoryFilters): Promise<JobHistoryResponse> {
    const params = new URLSearchParams();
    if (filters?.limit) params.set('limit', filters.limit.toString());
    if (filters?.type) params.set('type', filters.type);
    if (filters?.status) params.set('status', filters.status);

    const queryString = params.toString();
    return fetchApi<JobHistoryResponse>(`/jobs/history${queryString ? `?${queryString}` : ''}`);
  },

  /**
   * Trigger a manual job for a movie
   * POST /api/movies/:movieId/jobs/:jobType
   */
  async triggerJob(movieId: number, jobType: 'verify' | 'enrich' | 'publish'): Promise<TriggerJobResponse> {
    return fetchApi<TriggerJobResponse>(`/movies/${movieId}/jobs/${jobType}`, {
      method: 'POST',
    });
  },
};

/**
 * Asset Limits Configuration API
 * Manage asset download limits per type
 */
export const assetLimitsApi = {
  /**
   * Get all asset limits with metadata
   * GET /api/settings/asset-limits/metadata
   */
  async getAllWithMetadata(): Promise<AssetLimit[]> {
    return fetchApi<AssetLimit[]>('/settings/asset-limits/metadata');
  },

  /**
   * Get all asset limits as a simple map
   * GET /api/settings/asset-limits
   */
  async getAll(): Promise<AssetLimitsMap> {
    return fetchApi<AssetLimitsMap>('/settings/asset-limits');
  },

  /**
   * Get limit for a specific asset type
   * GET /api/settings/asset-limits/:assetType
   */
  async getLimit(assetType: string): Promise<{ assetType: string; limit: number }> {
    return fetchApi<{ assetType: string; limit: number }>(`/settings/asset-limits/${assetType}`);
  },

  /**
   * Set limit for a specific asset type
   * PUT /api/settings/asset-limits/:assetType
   */
  async setLimit(assetType: string, limit: number): Promise<SetAssetLimitResponse> {
    const data: SetAssetLimitRequest = { limit };
    return fetchApi<SetAssetLimitResponse>(`/settings/asset-limits/${assetType}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  /**
   * Reset limit to default for a specific asset type
   * DELETE /api/settings/asset-limits/:assetType
   */
  async resetLimit(assetType: string): Promise<ResetAssetLimitResponse> {
    return fetchApi<ResetAssetLimitResponse>(`/settings/asset-limits/${assetType}`, {
      method: 'DELETE',
    });
  },

  /**
   * Reset all asset limits to defaults
   * POST /api/settings/asset-limits/reset-all
   */
  async resetAll(): Promise<ResetAllLimitsResponse> {
    return fetchApi<ResetAllLimitsResponse>('/settings/asset-limits/reset-all', {
      method: 'POST',
    });
  },
};

/**
 * Enrichment API
 * Multi-provider metadata aggregation and completeness tracking
 */
export const enrichmentApi = {
  /**
   * Get library-wide completeness statistics
   * GET /api/movies/enrichment/stats
   */
  async getLibraryStats(): Promise<LibraryCompletenessStatsResponse> {
    return fetchApi<LibraryCompletenessStatsResponse>('/movies/enrichment/stats');
  },

  /**
   * Get enrichment status for a specific movie
   * GET /api/movies/:id/enrichment-status
   */
  async getMovieStatus(movieId: number): Promise<MovieEnrichmentStatusResponse> {
    return fetchApi<MovieEnrichmentStatusResponse>(`/movies/${movieId}/enrichment-status`);
  },

  /**
   * Trigger manual enrichment for a movie
   * POST /api/movies/:id/enrich
   */
  async triggerMovieEnrich(movieId: number, force = false): Promise<TriggerEnrichResponse> {
    const data: TriggerEnrichRequest = { force };
    return fetchApi<TriggerEnrichResponse>(`/movies/${movieId}/enrich`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Get bulk enrichment status
   * GET /api/enrichment/bulk-status
   */
  async getBulkStatus(): Promise<BulkEnrichmentStatusResponse> {
    return fetchApi<BulkEnrichmentStatusResponse>('/enrichment/bulk-status');
  },

  /**
   * Trigger manual bulk enrichment
   * POST /api/enrichment/bulk-run
   */
  async triggerBulkEnrich(force = false): Promise<TriggerBulkEnrichResponse> {
    const data: TriggerBulkEnrichRequest = { force };
    return fetchApi<TriggerBulkEnrichResponse>('/enrichment/bulk-run', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

export { ApiError };