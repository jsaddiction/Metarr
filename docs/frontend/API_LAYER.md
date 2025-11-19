# API Layer

**Purpose**: Type-safe network interface between frontend and backend for Metarr.

**Related Docs**:
- Parent: [Frontend README](./README.md)
- Related: [ARCHITECTURE.md](./ARCHITECTURE.md), [STATE_MANAGEMENT.md](./STATE_MANAGEMENT.md)

---

## Quick Reference (TL;DR)

- **Single function**: Use `fetchApi()` for all network calls
- **Type-safe**: Generic types on every call
- **Domain modules**: Group endpoints by feature (`movieApi`, `playerApi`)
- **Response unwrapping**: Extract data at API layer, not in hooks
- **No /api prefix**: Added automatically by `fetchApi()`
- **Error handling**: Automatic ApiError with status codes

---

## Core Function: fetchApi

**Location**: `public/frontend/src/utils/api.ts`

```typescript
async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`; // API_BASE_URL = '/api'

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
```

**Key Features**:
- Automatic JSON content-type header
- Error response parsing
- 204 No Content handling
- Type-safe return value
- ApiError with status codes

---

## Domain Module Pattern

### Standard CRUD Module

```typescript
// movieApi module
export const movieApi = {
  // GET /api/movies
  getAll: (filters?: MovieFilters) => {
    const params = new URLSearchParams();
    if (filters?.genre) params.append('genre', filters.genre);
    const query = params.toString();
    return fetchApi<MovieListResult>(`/movies${query ? `?${query}` : ''}`);
  },

  // GET /api/movies/:id
  getById: (id: number) =>
    fetchApi<MovieDetail>(`/movies/${id}`),

  // POST /api/movies
  create: (data: MovieFormData) =>
    fetchApi<MovieDetail>('/movies', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // PUT /api/movies/:id
  update: (id: number, updates: Partial<MovieFormData>) =>
    fetchApi<MovieDetail>(`/movies/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  // DELETE /api/movies/:id
  delete: (id: number) =>
    fetchApi<void>(`/movies/${id}`, {
      method: 'DELETE',
    }),
};
```

### Response Unwrapping

If backend wraps responses, unwrap at API layer:

```typescript
// Backend returns: { success: true, data: { movies: [...] } }

export const movieApi = {
  getAll: async (): Promise<MovieListItem[]> => {
    const response = await fetchApi<{ movies: MovieListItem[] }>('/movies');
    return response.movies; // Unwrap here, not in hooks
  },
};
```

---

## Existing API Modules

### movieApi
```typescript
export const movieApi = {
  getAll: (filters?) => fetchApi<MovieListResult>('/movies'),
  getById: (id) => fetchApi<MovieDetail>(`/movies/${id}`),
  toggleMonitored: (id) => fetchApi<ToggleMonitoredResponse>(`/movies/${id}/monitored`, { method: 'POST' }),
  lockField: (id, field, locked) => fetchApi<LockFieldResponse>(`/movies/${id}/lock`, { method: 'POST', body: JSON.stringify({ field, locked }) }),
  resetMetadata: (id) => fetchApi<ResetMetadataResponse>(`/movies/${id}/reset`, { method: 'POST' }),
};
```

### libraryApi
```typescript
export const libraryApi = {
  getAll: () => fetchApi<Library[]>('/libraries'),
  getById: (id) => fetchApi<Library>(`/libraries/${id}`),
  create: (data) => fetchApi<Library>('/libraries', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => fetchApi<Library>(`/libraries/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => fetchApi<void>(`/libraries/${id}`, { method: 'DELETE' }),
  scan: (id) => fetchApi<ScanJob>(`/libraries/${id}/scan`, { method: 'POST' }),
  validatePath: (path) => fetchApi<ValidatePathResult>('/libraries/validate-path', { method: 'POST', body: JSON.stringify({ path }) }),
  browseDirectory: (path) => fetchApi<DirectoryEntry[]>('/libraries/browse', { method: 'POST', body: JSON.stringify({ path }) }),
};
```

### providerApi
```typescript
export const providerApi = {
  getAll: () => fetchApi<GetAllProvidersResponse>('/providers'),
  getById: (id) => fetchApi<GetProviderResponse>(`/providers/${id}`),
  update: (id, data) => fetchApi<UpdateProviderResponse>(`/providers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  test: (id) => fetchApi<TestProviderResponse>(`/providers/${id}/test`, { method: 'POST' }),
  getProviderResults: (movieId, providerId, assetType) =>
    fetchApi<ProviderResultsResponse>(`/movies/${movieId}/providers/${providerId}/assets/${assetType}`),
};
```

### mediaPlayerApi
```typescript
export const mediaPlayerApi = {
  getAll: () => fetchApi<MediaPlayer[]>('/media-players'),
  getById: (id) => fetchApi<MediaPlayer>(`/media-players/${id}`),
  create: (data) => fetchApi<MediaPlayer>('/media-players', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => fetchApi<MediaPlayer>(`/media-players/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => fetchApi<void>(`/media-players/${id}`, { method: 'DELETE' }),
  testConnection: (id) => fetchApi<TestConnectionResult>(`/media-players/${id}/test`, { method: 'POST' }),
  getStatus: (id) => fetchApi<MediaPlayerStatus>(`/media-players/${id}/status`),
};
```

### jobApi
```typescript
export const jobApi = {
  getAll: () => fetchApi<JobsResponse>('/jobs'),
  getStats: () => fetchApi<JobStats>('/jobs/stats'),
  getHistory: (filters) => {
    const params = new URLSearchParams();
    if (filters.type) params.append('type', filters.type);
    if (filters.status) params.append('status', filters.status);
    return fetchApi<JobHistoryResponse>(`/jobs/history?${params}`);
  },
  trigger: (data) => fetchApi<TriggerJobResponse>('/jobs', { method: 'POST', body: JSON.stringify(data) }),
  cancel: (id) => fetchApi<void>(`/jobs/${id}/cancel`, { method: 'POST' }),
};
```

---

## Special Cases

### Query Parameters

```typescript
// Build query string with URLSearchParams
export const getMovies = (filters?: MovieFilters) => {
  const params = new URLSearchParams();
  if (filters?.genre) params.append('genre', filters.genre);
  if (filters?.year) params.append('year', String(filters.year));

  const query = params.toString();
  return fetchApi<MovieListResult>(`/movies${query ? `?${query}` : ''}`);
};
```

### File Upload

```typescript
export const uploadImage = (file: File): Promise<{ url: string }> => {
  const formData = new FormData();
  formData.append('file', file);

  // Don't stringify FormData
  return fetchApi<{ url: string }>('/upload', {
    method: 'POST',
    body: formData, // fetchApi handles this
    headers: {
      // Don't set Content-Type - browser sets it with boundary
    },
  });
};
```

### Server-Sent Events (SSE)

```typescript
export const subscribeToScanProgress = (
  libraryId: number,
  callbacks: {
    onProgress?: (data: ScanProgressEvent) => void;
    onCompleted?: (data: ScanCompletedEvent) => void;
    onError?: (error: Error) => void;
  }
): (() => void) => {
  const es = new EventSource(`/api/libraries/${libraryId}/scan/stream`);

  es.addEventListener('progress', (e) => {
    callbacks.onProgress?.(JSON.parse(e.data));
  });

  es.addEventListener('completed', (e) => {
    callbacks.onCompleted?.(JSON.parse(e.data));
    es.close();
  });

  es.addEventListener('error', () => {
    callbacks.onError?.(new Error('SSE connection failed'));
    es.close();
  });

  // Return cleanup function
  return () => es.close();
};
```

---

## Rules and Best Practices

### ✅ Always Do

1. **Use fetchApi exclusively**
```typescript
// ✅ Good
const movies = await fetchApi<Movie[]>('/movies');

// ❌ Bad
const response = await fetch('/api/movies');
const movies = await response.json();
```

2. **Provide generic type**
```typescript
// ✅ Good
fetchApi<Movie[]>('/movies')

// ❌ Bad
fetchApi('/movies') // Type is unknown
```

3. **Unwrap at API layer**
```typescript
// ✅ Good: Unwrap in API
export const getMovies = async () => {
  const result = await fetchApi<{ movies: Movie[] }>('/movies');
  return result.movies;
};

// ❌ Bad: Unwrap in hook
export const useMovies = () => {
  return useQuery({
    queryFn: async () => {
      const result = await movieApi.getRaw();
      return result.movies; // Unwrapping in wrong layer
    },
  });
};
```

4. **Group by domain**
```typescript
// ✅ Good: Organized modules
export const movieApi = { getAll, getById, create, update, delete };
export const libraryApi = { getAll, getById, scan };

// ❌ Bad: Flat exports
export const getMovies = ...;
export const getMovie = ...;
export const getLibraries = ...;
```

### ❌ Never Do

1. **Don't include /api prefix**
```typescript
// ❌ Bad
fetchApi('/api/movies') // Prefix added automatically

// ✅ Good
fetchApi('/movies')
```

2. **Don't use fetch() directly**
```typescript
// ❌ Bad
const response = await fetch('/api/movies');

// ✅ Good
const movies = await fetchApi<Movie[]>('/movies');
```

3. **Don't stringify FormData**
```typescript
// ❌ Bad
body: JSON.stringify(formData)

// ✅ Good
body: formData
```

---

## Error Handling

### ApiError Class

```typescript
class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}
```

### Usage in Hooks

```typescript
export const useCreateMovie = () => {
  return useMutation({
    mutationFn: (data) => movieApi.create(data),
    onError: (error: ApiError) => {
      // Error already has status code
      if (error.status === 409) {
        toast.error('Movie already exists');
      } else {
        toast.error('Create failed', { description: error.message });
      }
    },
  });
};
```

---

## Type Safety

### Interface Definitions

All API types defined in `src/types/`:

```typescript
// types/movie.ts
export interface MovieListItem {
  id: number;
  title: string;
  year: number;
  monitored: boolean;
}

export interface MovieDetail extends MovieListItem {
  plot: string;
  runtime: number;
  genres: string[];
  actors: Actor[];
}

export interface MovieFormData {
  title: string;
  year: number;
  plot?: string;
}
```

### Generic Type Parameters

```typescript
// Type flows from API to hook to component
const result = await fetchApi<MovieDetail>(`/movies/${id}`);
// result is typed as MovieDetail

const { data } = useQuery<MovieDetail, Error>({
  queryFn: () => movieApi.getById(id),
});
// data is typed as MovieDetail | undefined
```

---

## See Also

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Overall frontend architecture
- [STATE_MANAGEMENT.md](./STATE_MANAGEMENT.md) - TanStack Query integration
- [ERROR_HANDLING.md](./ERROR_HANDLING.md) - Error handling patterns
