# State Management

**Purpose**: Server state management patterns using TanStack Query for Metarr frontend.

**Related Docs**:
- Parent: [Frontend README](./README.md)
- Related: [ARCHITECTURE.md](./ARCHITECTURE.md), [API_LAYER.md](./API_LAYER.md), [COMPONENTS.md](./COMPONENTS.md)

---

## Quick Reference (TL;DR)

- **TanStack Query** manages all server state
- **React useState** only for UI state
- **useQuery** for reads, **useMutation** for writes
- **Always invalidate** cache after mutations
- **Toasts** for mutations only (not queries)
- **Query keys** hierarchical for surgical invalidation
- **WebSocket** updates sync to query cache

---

## State Types

### Server State (TanStack Query)
**What**: Data from backend that lives on the server
**Examples**: Movies, libraries, providers, jobs
**Tool**: TanStack Query (useQuery, useMutation)

```typescript
// ✅ Correct: Server data via TanStack Query
const { data: movies, isLoading, error } = useMovies();

// ❌ Wrong: Don't use useState for server data
const [movies, setMovies] = useState([]);
useEffect(() => {
  fetchMovies().then(setMovies);
}, []);
```

### UI State (React useState)
**What**: Ephemeral UI concerns that don't need persistence
**Examples**: Modal open/closed, selected tab, search input
**Tool**: React useState, useReducer

```typescript
// ✅ Correct: UI-only state
const [isOpen, setIsOpen] = useState(false);
const [selectedTab, setSelectedTab] = useState('metadata');
const [searchQuery, setSearchQuery] = useState('');
```

---

## TanStack Query Patterns

### Query Hook Pattern (Read Operations)

```typescript
// hooks/useMovies.ts
export const useMovies = (filters?: MovieFilters) => {
  return useQuery<MovieListItem[], Error>({
    queryKey: filters ? ['movies', filters] : ['movies'],
    queryFn: () => movieApi.getAll(filters),
    retry: 1,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useMovie = (id: number | null) => {
  return useQuery<MovieDetail, Error>({
    queryKey: ['movie', id],
    queryFn: () => {
      if (!id) throw new Error('Movie ID required');
      return movieApi.getById(id);
    },
    enabled: !!id, // Don't run if no ID
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });
};
```

**Key Options**:
- `queryKey`: Unique identifier (hierarchical array)
- `queryFn`: Function that returns Promise
- `enabled`: Conditional execution (default true)
- `retry`: Number of retries on failure (default 3, use 1)
- `staleTime`: Cache validity duration (default 0, use 5min)
- `refetchInterval`: Polling interval (use for real-time updates)

### Mutation Hook Pattern (Write Operations)

```typescript
// hooks/useMovies.ts
export const useCreateMovie = () => {
  const queryClient = useQueryClient();

  return useMutation<MovieDetail, Error, MovieFormData>({
    mutationFn: (data) => movieApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['movies'] });
      toast.success('Movie created successfully');
    },
    onError: (error) => {
      toast.error('Create movie failed', {
        description: error.message,
      });
    },
  });
};

export const useUpdateMovie = () => {
  const queryClient = useQueryClient();

  return useMutation<MovieDetail, Error, { id: number; updates: Partial<MovieFormData> }>({
    mutationFn: ({ id, updates }) => movieApi.update(id, updates),
    onSuccess: (data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['movies'] });
      queryClient.invalidateQueries({ queryKey: ['movie', id] });
      toast.success('Movie updated successfully');
    },
    onError: (error) => {
      toast.error('Update movie failed', {
        description: error.message,
      });
    },
  });
};

export const useDeleteMovie = () => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, number>({
    mutationFn: (id) => movieApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['movies'] });
      toast.success('Movie deleted successfully');
    },
    onError: (error) => {
      toast.error('Delete movie failed', {
        description: error.message,
      });
    },
  });
};
```

**Key Options**:
- `mutationFn`: Function that performs the mutation
- `onSuccess`: Called after successful mutation
- `onError`: Called after failed mutation
- `onMutate`: Called before mutation (for optimistic updates)

---

## Query Key Strategy

### Hierarchical Structure
Query keys use arrays for hierarchical organization, enabling surgical cache invalidation.

```typescript
// List queries
['movies']                     // All movies
['movies', { filter }]         // Filtered movies
['movies', { page: 1 }]        // Paginated movies

// Single item queries
['movie', 123]                 // Single movie by ID
['movie', 123, 'actors']       // Movie actors
['movie', 123, 'assets']       // Movie assets

// Related queries
['providers']                  // All providers
['provider', 'tmdb']           // Single provider
['provider', 'tmdb', 'config'] // Provider config
```

### Invalidation Patterns

```typescript
// Invalidate all movie queries (list + single)
queryClient.invalidateQueries({ queryKey: ['movies'] });

// Invalidate specific movie (single + related)
queryClient.invalidateQueries({ queryKey: ['movie', id] });

// Invalidate exact query (with filters)
queryClient.invalidateQueries({ queryKey: ['movies', { filter }], exact: true });

// Remove specific query from cache
queryClient.removeQueries({ queryKey: ['movie', id] });

// Invalidate multiple related queries
queryClient.invalidateQueries({ queryKey: ['movies'] });
queryClient.invalidateQueries({ queryKey: ['providers'] });
```

### Standard Invalidation Rules

| Operation | Invalidate |
|-----------|------------|
| Create | List query (`['movies']`) |
| Update | List + single (`['movies']`, `['movie', id]`) |
| Delete | List query (optionally remove single) |
| Batch | All affected list queries |

---

## Component Usage Patterns

### Basic Query Usage

```typescript
export const MovieList: React.FC = () => {
  const { data: movies, isLoading, error, refetch } = useMovies();

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} retry={refetch} />;
  if (!movies || movies.length === 0) return <EmptyState />;

  return (
    <div className="grid gap-4">
      {movies.map(movie => (
        <MovieCard key={movie.id} movie={movie} />
      ))}
    </div>
  );
};
```

### Basic Mutation Usage

```typescript
export const CreateMovieForm: React.FC = () => {
  const createMutation = useCreateMovie();
  const navigate = useNavigate();

  const handleSubmit = async (data: MovieFormData) => {
    try {
      await createMutation.mutateAsync(data);
      // Success toast already shown by hook
      navigate('/movies');
    } catch (error) {
      // Error toast already shown by hook
      console.error('Create failed:', error);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* form fields */}
      <Button type="submit" disabled={createMutation.isPending}>
        {createMutation.isPending ? 'Creating...' : 'Create Movie'}
      </Button>
    </form>
  );
};
```

### Dependent Queries

```typescript
export const MovieDetail: React.FC<{ id: number }> = ({ id }) => {
  // First query: Fetch movie
  const { data: movie, isLoading: movieLoading } = useMovie(id);

  // Second query: Fetch actors (only if movie loaded)
  const { data: actors, isLoading: actorsLoading } = useMovieActors(
    movie?.id, // Pass movie ID
    { enabled: !!movie } // Only run if movie exists
  );

  if (movieLoading) return <LoadingSpinner />;
  if (!movie) return <NotFound />;

  return (
    <div>
      <h1>{movie.title}</h1>
      {actorsLoading ? <LoadingSpinner /> : <ActorsList actors={actors} />}
    </div>
  );
};
```

### Parallel Queries

```typescript
export const Dashboard: React.FC = () => {
  const { data: movies, isLoading: moviesLoading } = useMovies();
  const { data: libraries, isLoading: librariesLoading } = useLibraries();
  const { data: jobs, isLoading: jobsLoading } = useJobs();

  const isLoading = moviesLoading || librariesLoading || jobsLoading;

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <MovieStats movies={movies} />
      <LibraryStatus libraries={libraries} />
      <RecentJobs jobs={jobs} />
    </div>
  );
};
```

---

## Advanced Patterns

### Optimistic Updates

```typescript
export const useUpdateMovieTitle = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, title }: { id: number; title: string }) =>
      movieApi.update(id, { title }),

    // Before mutation runs
    onMutate: async ({ id, title }) => {
      // Cancel outgoing queries
      await queryClient.cancelQueries({ queryKey: ['movie', id] });

      // Snapshot current value
      const previousMovie = queryClient.getQueryData(['movie', id]);

      // Optimistically update
      queryClient.setQueryData(['movie', id], (old: any) => ({
        ...old,
        title,
      }));

      // Return context for rollback
      return { previousMovie };
    },

    // Rollback on error
    onError: (err, { id }, context) => {
      queryClient.setQueryData(['movie', id], context?.previousMovie);
      toast.error('Update failed', { description: err.message });
    },

    // Refetch after success
    onSuccess: (data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['movie', id] });
      toast.success('Title updated');
    },
  });
};
```

### Polling for Real-Time Updates

```typescript
export const useActiveScan = (libraryId: number) => {
  return useQuery({
    queryKey: ['scan', libraryId],
    queryFn: () => scanApi.getStatus(libraryId),
    refetchInterval: (data) => {
      // Poll every 2s if scan is active
      return data?.status === 'running' ? 2000 : false;
    },
  });
};
```

### Prefetching

```typescript
export const MovieCard: React.FC<{ movie: MovieListItem }> = ({ movie }) => {
  const queryClient = useQueryClient();

  const handleMouseEnter = () => {
    // Prefetch movie details on hover
    queryClient.prefetchQuery({
      queryKey: ['movie', movie.id],
      queryFn: () => movieApi.getById(movie.id),
      staleTime: 5 * 60 * 1000,
    });
  };

  return (
    <Card onMouseEnter={handleMouseEnter}>
      {/* card content */}
    </Card>
  );
};
```

### Infinite Queries (Pagination)

```typescript
export const useInfiniteMovies = () => {
  return useInfiniteQuery({
    queryKey: ['movies', 'infinite'],
    queryFn: ({ pageParam = 0 }) =>
      movieApi.getPage(pageParam, 20),
    getNextPageParam: (lastPage, pages) =>
      lastPage.hasMore ? pages.length : undefined,
    initialPageParam: 0,
  });
};

// Component usage
const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteMovies();

<InfiniteScroll onLoadMore={fetchNextPage} hasMore={hasNextPage}>
  {data?.pages.map(page =>
    page.items.map(movie => <MovieCard key={movie.id} movie={movie} />)
  )}
</InfiniteScroll>
```

---

## WebSocket Integration

### Real-Time Updates via WebSocket

```typescript
// hooks/useActiveJobs.ts
export const useActiveJobs = () => {
  const { ws, isConnected } = useWebSocket();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!ws || !isConnected) return;

    const handleJobUpdate = (data: JobStatusEvent) => {
      // Update specific job in cache
      queryClient.setQueryData(['job', data.jobId], (old: any) => ({
        ...old,
        status: data.status,
        progress: data.progress,
      }));

      // Invalidate job list
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    };

    ws.on('job:status', handleJobUpdate);
    return () => ws.off('job:status', handleJobUpdate);
  }, [ws, isConnected, queryClient]);

  // Fallback to polling if WebSocket disconnects
  return useQuery({
    queryKey: ['jobs'],
    queryFn: () => jobApi.getActive(),
    refetchInterval: isConnected ? false : 5000, // Poll if disconnected
  });
};
```

---

## Error Handling

### Query Errors
**No toasts** - Let component decide how to show error

```typescript
export const useMovies = () => {
  return useQuery({
    queryKey: ['movies'],
    queryFn: () => movieApi.getAll(),
    retry: 1,
    // Don't show toast on error - component handles it
  });
};

// Component shows error UI
const { data, error } = useMovies();
if (error) return <ErrorMessage error={error} />;
```

### Mutation Errors
**Always show toast** - User initiated action needs feedback

```typescript
export const useCreateMovie = () => {
  return useMutation({
    mutationFn: (data) => movieApi.create(data),
    onSuccess: () => {
      toast.success('Movie created');
    },
    onError: (error) => {
      toast.error('Create movie failed', {
        description: error.message,
      });
    },
  });
};
```

---

## Configuration

### Global Query Client Setup

```typescript
// main.tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,                    // Retry once on failure
      staleTime: 5 * 60 * 1000,    // 5 minutes
      refetchOnWindowFocus: false, // Don't refetch on focus
    },
    mutations: {
      retry: 0,                    // Don't retry mutations
    },
  },
});

<QueryClientProvider client={queryClient}>
  <App />
</QueryClientProvider>
```

---

## Common Pitfalls

### ❌ Don't: Mix useState with Server Data

```typescript
// ❌ Bad
const [movies, setMovies] = useState([]);
useEffect(() => {
  fetchMovies().then(setMovies);
}, []);

// ✅ Good
const { data: movies } = useMovies();
```

### ❌ Don't: Forget to Invalidate After Mutations

```typescript
// ❌ Bad: Cache becomes stale
export const useCreateMovie = () => {
  return useMutation({
    mutationFn: (data) => movieApi.create(data),
    onSuccess: () => {
      toast.success('Movie created');
      // Missing: queryClient.invalidateQueries()
    },
  });
};

// ✅ Good: Cache updates automatically
export const useCreateMovie = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => movieApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['movies'] });
      toast.success('Movie created');
    },
  });
};
```

### ❌ Don't: Use Wrong Status Check

```typescript
// ❌ Bad: isLoading is for queries
<Button disabled={mutation.isLoading}>Save</Button>

// ✅ Good: isPending is for mutations
<Button disabled={mutation.isPending}>Save</Button>
```

### ❌ Don't: Show Toast on Query Errors

```typescript
// ❌ Bad: Toasts spam on query failures
export const useMovies = () => {
  return useQuery({
    queryKey: ['movies'],
    queryFn: () => movieApi.getAll(),
    onError: (error) => toast.error(error.message), // Bad!
  });
};

// ✅ Good: Component handles error display
export const useMovies = () => {
  return useQuery({
    queryKey: ['movies'],
    queryFn: () => movieApi.getAll(),
  });
};

// Component decides how to show error
const { error } = useMovies();
if (error) return <ErrorMessage error={error} />;
```

---

## See Also

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Overall frontend architecture
- [API_LAYER.md](./API_LAYER.md) - API client structure
- [COMPONENTS.md](./COMPONENTS.md) - Component patterns
- [ERROR_HANDLING.md](./ERROR_HANDLING.md) - Error handling strategies
