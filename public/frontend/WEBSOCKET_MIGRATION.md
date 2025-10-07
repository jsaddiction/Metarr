# WebSocket + TanStack Query Migration Guide

This document explains how to migrate existing components from SSE + manual state management to WebSocket + TanStack Query.

## Overview

The frontend now uses:
- **WebSocket** for real-time bidirectional communication (replacing SSE)
- **TanStack Query** for server state management (replacing manual useState/useEffect)
- **Automatic cache invalidation** via WebSocket events

## What Changed

### Before (SSE + Manual State)
```tsx
const [movies, setMovies] = useState<Movie[]>([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
  const loadMovies = async () => {
    try {
      const result = await movieApi.getAll();
      setMovies(result.movies || []);
    } catch (error) {
      console.error('Failed to load movies:', error);
    } finally {
      setLoading(false);
    }
  };
  loadMovies();
}, []);

// Subscribe to SSE updates
useEffect(() => {
  const cleanup = movieApi.subscribeToUpdates(
    (addedMovies) => setMovies((prev) => [...prev, ...addedMovies]),
    (updatedMovie) => setMovies((prev) => prev.map((m) => (m.id === updatedMovie.id ? updatedMovie : m))),
    (removedId) => setMovies((prev) => prev.filter((m) => m.id !== removedId))
  );
  return cleanup;
}, []);
```

### After (WebSocket + TanStack Query)
```tsx
// Just one line - TanStack Query handles everything!
const { data, isLoading, error, refetch } = useMovies();
const movies = data?.movies || [];

// Updates happen automatically via WebSocket events
// No manual subscription needed!
```

## Migration Steps

### 1. Remove Manual State Management

**Before:**
```tsx
const [movies, setMovies] = useState<Movie[]>([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);
```

**After:**
```tsx
const { data, isLoading, error } = useMovies();
const movies = data?.movies || [];
```

### 2. Remove SSE Subscriptions

**Before:**
```tsx
useEffect(() => {
  const cleanup = movieApi.subscribeToUpdates(...);
  return cleanup;
}, []);
```

**After:**
```tsx
// Remove entirely - WebSocketContext handles this automatically
```

### 3. Use Mutations for Updates

**Before:**
```tsx
const handleUpdate = async (id: number, updates: Partial<Movie>) => {
  try {
    await fetch(`/api/movies/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    // Manually update local state
    setMovies((prev) => prev.map((m) => (m.id === id ? { ...m, ...updates } : m)));
  } catch (error) {
    console.error('Update failed:', error);
  }
};
```

**After:**
```tsx
const updateMovie = useUpdateMovie();

const handleUpdate = (id: number, updates: Partial<Movie>) => {
  updateMovie.mutate({ id, updates }, {
    onSuccess: () => {
      console.log('Movie updated!');
    },
    onError: (error) => {
      console.error('Update failed:', error);
    },
  });
};
```

## Available Hooks

### Movies
- `useMovies(options?)` - Fetch all movies with optional filtering
- `useMovie(id)` - Fetch a single movie by ID
- `useUpdateMovie()` - Mutation for updating movies (with optimistic updates)
- `useDeleteMovie()` - Mutation for deleting movies

### Media Players
- `usePlayers()` - Fetch all media players
- `usePlayer(id)` - Fetch a single media player
- `usePlayerStatus()` - Real-time player status from WebSocket
- `useCreatePlayer()` - Mutation for creating players
- `useUpdatePlayer()` - Mutation for updating players
- `useDeletePlayer()` - Mutation for deleting players
- `useTestConnection()` - Test connection to a saved player
- `useTestConnectionUnsaved()` - Test connection without saving
- `useConnectPlayer()` - Connect a media player
- `useDisconnectPlayer()` - Disconnect a media player

### Library Scans
- `useLibraries()` - Fetch all libraries
- `useLibrary(id)` - Fetch a single library
- `useActiveScans()` - Real-time active scans from WebSocket
- `useCreateLibrary()` - Mutation for creating libraries
- `useUpdateLibrary()` - Mutation for updating libraries
- `useDeleteLibrary()` - Mutation for deleting libraries
- `useStartLibraryScan()` - Start a library scan
- `useCancelLibraryScan()` - Cancel a library scan
- `useValidatePath()` - Validate a directory path
- `useBrowsePath(path)` - Browse a directory
- `useDrives()` - Get available drives (Windows)

### WebSocket
- `useWebSocket()` - Access WebSocket connection
  - `ws` - WebSocket client instance
  - `connectionState` - Current connection state
  - `isConnected` - Boolean connection status

## Example: Migrating Movies Component

See `/home/justin/Code/Metarr/public/frontend/src/pages/metadata/Movies.tsx.example` for a complete example.

**Key Changes:**
1. Replace `useState` + `useEffect` with `useMovies()` hook
2. Remove SSE subscription (handled by WebSocketContext)
3. Keep existing UI components and logic
4. Use `refetch()` instead of manual fetch in refresh handler

## Example: Using Mutations

### Update Movie
```tsx
import { useUpdateMovie } from '../../hooks/useMovies';

const MovieEdit = () => {
  const updateMovie = useUpdateMovie();

  const handleSave = (updates: Partial<Movie>) => {
    updateMovie.mutate(
      { id: movieId, updates },
      {
        onSuccess: () => {
          toast.success('Movie updated!');
        },
        onError: (error) => {
          toast.error(`Failed to update: ${error.message}`);
        },
      }
    );
  };

  return (
    <form onSubmit={handleSave}>
      {/* Form fields */}
      <button disabled={updateMovie.isPending}>
        {updateMovie.isPending ? 'Saving...' : 'Save'}
      </button>
    </form>
  );
};
```

### Start Library Scan
```tsx
import { useStartLibraryScan } from '../../hooks/useLibraryScans';

const LibraryCard = ({ library }) => {
  const startScan = useStartLibraryScan();

  const handleScan = () => {
    startScan.mutate(library.id, {
      onSuccess: () => {
        console.log('Scan started!');
      },
    });
  };

  return (
    <button onClick={handleScan} disabled={startScan.isPending}>
      {startScan.isPending ? 'Starting...' : 'Scan Library'}
    </button>
  );
};
```

### Real-time Scan Progress
```tsx
import { useActiveScans } from '../../hooks/useLibraryScans';

const ScanProgress = () => {
  const activeScans = useActiveScans();

  return (
    <div>
      {activeScans.map((scan) => (
        <div key={scan.id}>
          <h3>Library {scan.libraryId}</h3>
          <progress value={scan.progressCurrent} max={scan.progressTotal} />
          <p>{scan.currentFile}</p>
        </div>
      ))}
    </div>
  );
};
```

## Benefits

### 1. Less Code
- No manual state management
- No manual SSE subscriptions
- No manual error handling

### 2. Better Performance
- Automatic request deduplication
- Smart caching and invalidation
- Background refetching

### 3. Built-in Features
- Loading states (`isLoading`, `isFetching`)
- Error states with automatic retry
- Optimistic updates for mutations
- DevTools for debugging (dev only)

### 4. Real-time Updates
- WebSocket events automatically invalidate queries
- UI updates instantly when server broadcasts changes
- Bidirectional communication (client can send messages)

## Debugging

### TanStack Query DevTools
In development mode, you'll see the React Query DevTools at the bottom of the screen:
- View all active queries
- See cached data
- Inspect loading/error states
- Manually trigger refetches
- View query timelines

### WebSocket Connection
Monitor WebSocket in browser DevTools:
1. Open DevTools > Network tab
2. Filter by "WS" (WebSocket)
3. Click the connection to see messages
4. View sent/received frames in real-time

### Console Logging
The WebSocket client logs connection events:
```
[WebSocket] Connected
[WebSocket] Welcome message: {...}
[WebSocket] Reconnecting in 1000ms (attempt 1)
```

## Common Patterns

### Dependent Queries
```tsx
const { data: library } = useLibrary(libraryId);
const { data: scans } = useActiveScans(); // Automatically updates

// Filter scans for this library
const libraryScans = scans.filter((s) => s.libraryId === libraryId);
```

### Manual Refetch
```tsx
const { data, refetch } = useMovies();

const handleRefresh = () => {
  refetch();
};
```

### Conditional Fetching
```tsx
const { data } = useMovie(movieId, {
  enabled: !!movieId, // Only fetch if movieId is truthy
});
```

### Error Handling
```tsx
const { data, error, isError } = useMovies();

if (isError) {
  return <div>Error: {error.message}</div>;
}
```

## Fallback to REST API

WebSocket is the primary communication method, but REST API endpoints remain available:
- Mutations call both WebSocket and REST API
- REST API serves as fallback if WebSocket is disconnected
- Queries use REST API (TanStack Query handles caching)

## Backward Compatibility

The old SSE subscriptions in `api.ts` are still available but deprecated:
- `movieApi.subscribeToUpdates()` - Use `useMovies()` instead
- `mediaPlayerApi.subscribeToStatus()` - Use `usePlayerStatus()` instead
- `libraryApi.subscribeToScanProgress()` - Use `useActiveScans()` instead

These will be removed in a future release.
