# Error Handling

**Purpose**: Unified error handling strategy across all frontend layers.

**Related Docs**:
- Parent: [Frontend README](./README.md)
- Related: [STATE_MANAGEMENT.md](./STATE_MANAGEMENT.md), [COMPONENTS.md](./COMPONENTS.md), [API_LAYER.md](./API_LAYER.md)

---

## Quick Reference (TL;DR)

- **Render errors**: Caught by Error Boundary → fallback UI
- **Query errors**: Component handles → inline error message
- **Mutation errors**: Hook shows toast → automatic feedback
- **Validation errors**: Form-level → inline field errors
- **No query toasts**: Queries are passive, mutations are active
- **Always show retry**: Give users recovery path

---

## Error Types and Handlers

| Error Type | Where | Handler | User Feedback |
|------------|-------|---------|---------------|
| Render error | Component | Error Boundary | Fallback UI with retry |
| Network error (query) | Component | Inline display | Error message + retry button |
| Network error (mutation) | Hook | Toast | Toast notification |
| Validation error | Form | Form state | Inline field errors |
| 404 Route | Router | Route config | 404 page |
| WebSocket error | Context | Connection handler | Connection status banner |

---

## 1. Render Errors (Component Crashes)

**What**: JavaScript errors during component render
**Examples**: Undefined property access, null reference, type errors

### Error Boundary Component

```typescript
// components/ErrorBoundary.tsx
import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error boundary caught:', error, errorInfo);
    // TODO: Send to error reporting service (Sentry, etc.)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex flex-col items-center justify-center min-h-screen p-6">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold mb-2">Something went wrong</h2>
          <p className="text-neutral-400 mb-4">{this.state.error?.message}</p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="px-4 py-2 bg-violet-500 text-white rounded hover:bg-violet-600"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

### Usage

```typescript
// App.tsx - Wrap entire app
<ErrorBoundary>
  <App />
</ErrorBoundary>

// Or wrap specific sections
<ErrorBoundary fallback={<MovieListError />}>
  <MovieList />
</ErrorBoundary>
```

---

## 2. Network Errors (API Failures)

### Query Errors (Read Operations)
**Rule**: Component decides how to show error (no automatic toasts)

```typescript
export const MovieList: React.FC = () => {
  const { data: movies, isLoading, error, refetch } = useMovies();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <ErrorMessage
        title="Failed to load movies"
        message={error.message}
        retry={refetch}
      />
    );
  }

  if (!movies || movies.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="grid gap-4">
      {movies.map(movie => <MovieCard key={movie.id} movie={movie} />)}
    </div>
  );
};
```

### ErrorMessage Component

```typescript
interface ErrorMessageProps {
  title?: string;
  message: string;
  retry?: () => void;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({
  title = 'Error',
  message,
  retry,
}) => {
  return (
    <div className="rounded-md bg-red-500/10 border border-red-500/20 p-6">
      <div className="flex items-start gap-4">
        <FontAwesomeIcon icon={faExclamationTriangle} className="text-red-500 text-2xl" />
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-red-500 mb-1">{title}</h3>
          <p className="text-sm text-neutral-300">{message}</p>
          {retry && (
            <button
              onClick={retry}
              className="mt-3 text-sm text-violet-400 hover:text-violet-300 underline"
            >
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
```

### Mutation Errors (Write Operations)
**Rule**: Hook shows toast automatically (user initiated action needs feedback)

```typescript
export const useCreateMovie = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: MovieFormData) => movieApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['movies'] });
      toast.success('Movie created successfully');
    },
    onError: (error: Error) => {
      toast.error('Create movie failed', {
        description: error.message,
      });
    },
  });
};

// Component just calls mutation
const createMutation = useCreateMovie();

const handleSubmit = async (data: MovieFormData) => {
  try {
    await createMutation.mutateAsync(data);
    // Success toast already shown by hook
    navigate('/movies');
  } catch (error) {
    // Error toast already shown by hook
    // Optionally handle UI state (keep form open, etc.)
  }
};
```

---

## 3. Validation Errors (User Input)

**Rule**: Validate before API call, show inline field errors

```typescript
export const MovieForm: React.FC = () => {
  const [formData, setFormData] = useState<MovieFormData>({ title: '', year: 2024 });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = (data: MovieFormData): boolean => {
    const newErrors: Record<string, string> = {};

    if (!data.title.trim()) {
      newErrors.title = 'Title is required';
    }

    if (data.year < 1900 || data.year > new Date().getFullYear() + 5) {
      newErrors.year = 'Year must be between 1900 and ' + (new Date().getFullYear() + 5);
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm(formData)) {
      return;
    }

    // Proceed with mutation
    await createMutation.mutateAsync(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Title</label>
        <input
          type="text"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          className={cn(
            "w-full rounded border px-3 py-2",
            errors.title ? "border-red-500" : "border-neutral-700"
          )}
        />
        {errors.title && (
          <p className="text-sm text-red-500 mt-1">{errors.title}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Year</label>
        <input
          type="number"
          value={formData.year}
          onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) })}
          className={cn(
            "w-full rounded border px-3 py-2",
            errors.year ? "border-red-500" : "border-neutral-700"
          )}
        />
        {errors.year && (
          <p className="text-sm text-red-500 mt-1">{errors.year}</p>
        )}
      </div>

      <Button type="submit" disabled={createMutation.isPending}>
        {createMutation.isPending ? 'Creating...' : 'Create Movie'}
      </Button>
    </form>
  );
};
```

---

## Error Utility Functions

**Location**: `utils/errorHandling.ts`

```typescript
/**
 * Extract error message from various error formats
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }
  return 'An unknown error occurred';
}

/**
 * Show error toast with consistent formatting
 */
export function showErrorToast(error: unknown, context?: string) {
  const message = getErrorMessage(error);
  const title = context ? `${context} failed` : 'Error';
  toast.error(title, {
    description: message,
  });
}

/**
 * Show success toast
 */
export function showSuccessToast(title: string, description?: string) {
  toast.success(title, {
    description,
  });
}

/**
 * Check if error is network-related
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message.includes('fetch') ||
      error.message.includes('network') ||
      error.message.includes('Failed to fetch')
    );
  }
  return false;
}
```

---

## Recovery Strategies

### Automatic Retry (Queries)
TanStack Query handles automatically:

```typescript
const { data, error } = useQuery({
  queryKey: ['movies'],
  queryFn: () => movieApi.getAll(),
  retry: 1, // Retry once on failure
  retryDelay: 1000, // Wait 1s before retry
});
```

### Manual Retry (User-Initiated)

```typescript
const { data, error, refetch } = useMovies();

if (error) {
  return (
    <ErrorMessage
      message={error.message}
      retry={() => refetch()} // User clicks retry
    />
  );
}
```

### Fallback Data (Graceful Degradation)

```typescript
const { data: movies = [] } = useMovies(); // Default to empty array

// Always renders, even on error (shows empty list)
return (
  <div>
    {movies.map(movie => <MovieCard key={movie.id} movie={movie} />)}
  </div>
);
```

### Optimistic Updates Rollback

```typescript
export const useUpdateMovie = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }) => movieApi.update(id, updates),
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: ['movie', id] });
      const previous = queryClient.getQueryData(['movie', id]);

      // Optimistic update
      queryClient.setQueryData(['movie', id], (old: any) => ({ ...old, ...updates }));

      return { previous };
    },
    onError: (err, { id }, context) => {
      // Automatic rollback on error
      queryClient.setQueryData(['movie', id], context?.previous);
      showErrorToast(err, 'Update movie');
    },
  });
};
```

---

## User Feedback Patterns

### Toast Notifications (Mutations)
**Use for**: User-initiated actions

```typescript
// Success
toast.success('Movie created successfully');
toast.success('Settings saved', { description: 'Changes will take effect immediately' });

// Error
toast.error('Create movie failed', { description: error.message });
toast.error('Connection failed', { description: 'Check your network' });
```

### Inline Error Messages (Queries)
**Use for**: Data loading failures

```typescript
{error && (
  <ErrorMessage
    title="Failed to load movies"
    message={error.message}
    retry={() => refetch()}
  />
)}
```

### Empty States (Not Errors)
**Use for**: No data (not an error condition)

```typescript
{data?.length === 0 && (
  <div className="text-center py-12">
    <FontAwesomeIcon icon={faFilm} className="text-neutral-600 text-6xl mb-4" />
    <h3 className="text-xl font-semibold mb-2">No movies found</h3>
    <p className="text-neutral-400 mb-6">Add a library or scan for media to get started</p>
    <Button onClick={() => navigate('/libraries/new')}>Add Library</Button>
  </div>
)}
```

---

## WebSocket Error Handling

```typescript
// contexts/WebSocketContext.tsx
export const WebSocketProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    if (!ws) return;

    const handleError = (error: Event) => {
      console.error('WebSocket error:', error);
      setConnectionError('Real-time connection lost. Updates may be delayed.');
    };

    const handleClose = () => {
      setConnectionError('Connection closed. Reconnecting...');
      // Implement reconnection logic
    };

    ws.addEventListener('error', handleError);
    ws.addEventListener('close', handleClose);

    return () => {
      ws.removeEventListener('error', handleError);
      ws.removeEventListener('close', handleClose);
    };
  }, [ws]);

  // Show connection error banner
  return (
    <>
      {connectionError && (
        <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-4 py-2 text-center">
          <p className="text-sm text-yellow-500">{connectionError}</p>
        </div>
      )}
      {children}
    </>
  );
};
```

---

## Global Error Handling

### Unhandled Promise Rejections

```typescript
// main.tsx or App.tsx
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);

  toast.error('An unexpected error occurred', {
    description: 'Please try refreshing the page',
  });

  event.preventDefault();
});
```

---

## Common Patterns

### Loading → Error → Empty → Data

```typescript
const Component = () => {
  const { data, isLoading, error } = useMovies();

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} retry={refetch} />;
  if (!data || data.length === 0) return <EmptyState />;

  return <DataView data={data} />;
};
```

### Form Submission with Error Handling

```typescript
const [errors, setErrors] = useState<Record<string, string>>({});
const createMutation = useCreateMovie();

const handleSubmit = async (data: FormData) => {
  // Clear previous errors
  setErrors({});

  // Validate
  if (!validateForm(data)) {
    return;
  }

  try {
    await createMutation.mutateAsync(data);
    // Success toast shown by hook
    navigate('/movies');
  } catch (error) {
    // Error toast shown by hook
    // Keep form open for correction
  }
};
```

---

## Checklist

When handling errors:

- [ ] Render errors caught by Error Boundary?
- [ ] Query errors handled in component UI?
- [ ] Mutation errors show toast notification?
- [ ] Validation errors shown inline?
- [ ] User can retry failed operations?
- [ ] Error messages are user-friendly (not technical)?
- [ ] Loading states shown before errors can occur?
- [ ] Empty states distinct from error states?

---

## See Also

- [STATE_MANAGEMENT.md](./STATE_MANAGEMENT.md) - Error handling in mutations
- [COMPONENTS.md](./COMPONENTS.md) - Error UI patterns
- [UI_STANDARDS.md](./UI_STANDARDS.md) - Error state styling
- [API_LAYER.md](./API_LAYER.md) - ApiError class
