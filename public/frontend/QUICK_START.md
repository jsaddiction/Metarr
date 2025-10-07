# Quick Start: WebSocket + TanStack Query

This is a quick reference guide for using the new WebSocket + TanStack Query infrastructure in Metarr.

## Basic Usage

### 1. Fetch Data (GET)
```tsx
import { useMovies } from '../../hooks/useMovies';

const MyComponent = () => {
  const { data, isLoading, error } = useMovies();

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  const movies = data?.movies || [];

  return (
    <ul>
      {movies.map(movie => (
        <li key={movie.id}>{movie.title}</li>
      ))}
    </ul>
  );
};
```

### 2. Update Data (PUT/POST/DELETE)
```tsx
import { useUpdateMovie } from '../../hooks/useMovies';

const EditMovie = ({ movie }) => {
  const updateMovie = useUpdateMovie();

  const handleSave = () => {
    updateMovie.mutate(
      { id: movie.id, updates: { title: 'New Title' } },
      {
        onSuccess: () => console.log('Saved!'),
        onError: (error) => console.error('Failed:', error),
      }
    );
  };

  return (
    <button
      onClick={handleSave}
      disabled={updateMovie.isPending}
    >
      {updateMovie.isPending ? 'Saving...' : 'Save'}
    </button>
  );
};
```

### 3. Real-time Updates
```tsx
import { useActiveScans } from '../../hooks/useLibraryScans';

const ScanStatus = () => {
  const activeScans = useActiveScans();

  return (
    <div>
      {activeScans.map(scan => (
        <div key={scan.id}>
          <progress value={scan.progressCurrent} max={scan.progressTotal} />
          <p>{scan.currentFile}</p>
        </div>
      ))}
    </div>
  );
};
```

### 4. Access WebSocket
```tsx
import { useWebSocket } from '../../contexts/WebSocketContext';

const ConnectionStatus = () => {
  const { connectionState, isConnected } = useWebSocket();

  return (
    <div>
      Status: {connectionState}
      {isConnected ? '✓' : '✗'}
    </div>
  );
};
```

## Available Hooks

### Movies
```tsx
import {
  useMovies,        // Fetch all movies
  useMovie,         // Fetch one movie
  useUpdateMovie,   // Update movie
  useDeleteMovie    // Delete movie
} from '../../hooks/useMovies';
```

### Media Players
```tsx
import {
  usePlayers,                  // Fetch all players
  usePlayer,                   // Fetch one player
  usePlayerStatus,             // Real-time status
  useCreatePlayer,             // Create player
  useUpdatePlayer,             // Update player
  useDeletePlayer,             // Delete player
  useTestConnection,           // Test saved player
  useTestConnectionUnsaved,    // Test unsaved config
  useConnectPlayer,            // Connect player
  useDisconnectPlayer          // Disconnect player
} from '../../hooks/usePlayers';
```

### Libraries & Scans
```tsx
import {
  useLibraries,          // Fetch all libraries
  useLibrary,            // Fetch one library
  useActiveScans,        // Real-time scans
  useCreateLibrary,      // Create library
  useUpdateLibrary,      // Update library
  useDeleteLibrary,      // Delete library
  useStartLibraryScan,   // Start scan
  useCancelLibraryScan,  // Cancel scan
  useValidatePath,       // Validate path
  useBrowsePath,         // Browse directory
  useDrives              // Get drives (Windows)
} from '../../hooks/useLibraryScans';
```

## Common Patterns

### Loading State
```tsx
const { data, isLoading } = useMovies();

if (isLoading) {
  return <Spinner />;
}
```

### Error State
```tsx
const { data, error, isError } = useMovies();

if (isError) {
  return <ErrorMessage error={error.message} />;
}
```

### Manual Refetch
```tsx
const { data, refetch } = useMovies();

<button onClick={() => refetch()}>Refresh</button>
```

### Conditional Fetching
```tsx
const { data } = useMovie(movieId, {
  enabled: !!movieId  // Only fetch if movieId exists
});
```

### Mutation States
```tsx
const mutation = useUpdateMovie();

mutation.isPending    // Currently saving
mutation.isSuccess    // Saved successfully
mutation.isError      // Save failed
mutation.error        // Error object
```

### Optimistic Updates (Built-in)
```tsx
// useUpdateMovie already has optimistic updates!
const updateMovie = useUpdateMovie();

updateMovie.mutate({ id, updates });
// UI updates instantly
// Rolls back automatically on error
```

## Debugging

### React Query DevTools (Dev Only)
The DevTools panel appears at the bottom-left in development mode:
- View all queries and their states
- See cached data
- Manually trigger refetches
- Inspect query timelines

### WebSocket Inspector
Browser DevTools → Network → WS:
- View WebSocket connection
- Inspect sent/received messages
- Monitor connection status

### Console Logs
WebSocket connection events are logged:
```
[WebSocket] Connected
[WebSocket] Welcome message: {...}
[WebSocket] Disconnected
[WebSocket] Reconnecting in 1000ms (attempt 1)
```

## Migration Cheat Sheet

### Before (Old SSE + Manual State)
```tsx
const [movies, setMovies] = useState<Movie[]>([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
  const loadMovies = async () => {
    try {
      setLoading(true);
      const result = await movieApi.getAll();
      setMovies(result.movies);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };
  loadMovies();
}, []);

useEffect(() => {
  const cleanup = movieApi.subscribeToUpdates(
    (added) => setMovies(prev => [...prev, ...added]),
    (updated) => setMovies(prev => prev.map(m => m.id === updated.id ? updated : m)),
    (removedId) => setMovies(prev => prev.filter(m => m.id !== removedId))
  );
  return cleanup;
}, []);
```

### After (New WebSocket + TanStack Query)
```tsx
const { data, isLoading } = useMovies();
const movies = data?.movies || [];

// That's it! Real-time updates are automatic.
```

## Tips

1. **Don't manually manage server state** - Let TanStack Query handle it
2. **Use mutations for writes** - They include optimistic updates and rollback
3. **Trust the cache** - TanStack Query knows when to refetch
4. **Watch WebSocket messages** - Use browser DevTools to debug real-time issues
5. **Use DevTools** - React Query DevTools shows everything happening with queries

## Example: Complete CRUD Component

```tsx
import { useMovies, useUpdateMovie, useDeleteMovie } from '../../hooks/useMovies';

const MovieManager = () => {
  // Fetch movies
  const { data, isLoading, error } = useMovies();
  const movies = data?.movies || [];

  // Setup mutations
  const updateMovie = useUpdateMovie();
  const deleteMovie = useDeleteMovie();

  // Handlers
  const handleUpdate = (id: number, updates: Partial<Movie>) => {
    updateMovie.mutate({ id, updates }, {
      onSuccess: () => alert('Updated!'),
      onError: (err) => alert(`Error: ${err.message}`),
    });
  };

  const handleDelete = (id: number) => {
    if (confirm('Are you sure?')) {
      deleteMovie.mutate(id);
    }
  };

  // Render
  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      {movies.map(movie => (
        <div key={movie.id}>
          <h3>{movie.title}</h3>
          <button onClick={() => handleUpdate(movie.id, { title: 'New Title' })}>
            Rename
          </button>
          <button onClick={() => handleDelete(movie.id)}>
            Delete
          </button>
        </div>
      ))}
    </div>
  );
};
```

## Need Help?

See full documentation:
- `/home/justin/Code/Metarr/public/frontend/WEBSOCKET_MIGRATION.md` - Complete migration guide
- `/home/justin/Code/Metarr/WEBSOCKET_IMPLEMENTATION_SUMMARY.md` - Architecture overview
- `/home/justin/Code/Metarr/public/frontend/src/pages/metadata/Movies.tsx.example` - Real example

TanStack Query docs: https://tanstack.com/query/latest/docs/react/overview
