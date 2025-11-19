# Error Handling

**Purpose**: Unified error handling strategy across frontend layers.

**Industry Standards**: Error Boundaries (React), Progressive Enhancement, Graceful Degradation

---

## Quick Decision Matrix

| Error Type | Where | Handler | User Feedback |
|------------|-------|---------|---------------|
| Render error | Component | Error Boundary | Fallback UI |
| Network error (query) | Component | Handle in render | Error message |
| Network error (mutation) | Hook | `onError` callback | Toast notification |
| Validation error | Form | Form state | Inline validation |
| 404/Route not found | Router | Route config | 404 page |
| Unhandled promise | Window | Global handler | Log + fallback |

---

## Three Error Types

### 1. Render Errors (Component Crashes)
**What**: JavaScript errors during render
**Examples**: Undefined property access, type errors, infinite loops

**Handler**: Error Boundary
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
        <div className="error-boundary">
          <h2>Something went wrong</h2>
          <p>{this.state.error?.message}</p>
          <button onClick={() => this.setState({ hasError: false })}>
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

**Usage**:
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

### 2. Network Errors (API Failures)

#### Query Errors (Read Operations)
**Handler**: Component decides UI
**No toasts** - Queries are passive operations

```typescript
const MovieList: React.FC = () => {
  const { data, isLoading, error } = useMovies();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <ErrorMessage
        title="Failed to load movies"
        message={error.message}
        retry={() => queryClient.invalidateQueries({ queryKey: ['movies'] })}
      />
    );
  }

  return <div>{/* Render data */}</div>;
};
```

**Error Message Component**:
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
    <div className="rounded-md bg-red-50 p-4">
      <div className="flex">
        <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />
        <div className="ml-3">
          <h3 className="text-sm font-medium text-red-800">{title}</h3>
          <p className="mt-1 text-sm text-red-700">{message}</p>
          {retry && (
            <button
              onClick={retry}
              className="mt-2 text-sm text-red-800 underline"
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

#### Mutation Errors (Write Operations)
**Handler**: Hook shows toast automatically
**Always show feedback** - User initiated action

```typescript
// Hook handles error
export const useCreateMovie = () => {
  const queryClient = useQueryClient();

  return useMutation<Movie, Error, MovieFormData>({
    mutationFn: (data) => movieApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['movies'] });
      showSuccessToast('Movie created successfully');
    },
    onError: (error) => {
      showErrorToast(error, 'Create movie'); // Automatic toast
    },
  });
};

// Component just calls mutation
const Component = () => {
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
};
```

---

### 3. Validation Errors (User Input)
**Handler**: Form-level validation (before API call)

```typescript
const MovieForm: React.FC = () => {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = (data: MovieFormData): boolean => {
    const newErrors: Record<string, string> = {};

    if (!data.title.trim()) {
      newErrors.title = 'Title is required';
    }

    if (data.year < 1900 || data.year > new Date().getFullYear() + 5) {
      newErrors.year = 'Invalid year';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (data: MovieFormData) => {
    if (!validateForm(data)) return;

    // Proceed with API call
  };

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label>Title</label>
        <input type="text" name="title" />
        {errors.title && (
          <p className="text-sm text-red-600">{errors.title}</p>
        )}
      </div>
    </form>
  );
};
```

---

## Error Utilities

### Error Parsing
**File**: `utils/errorHandling.ts`

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
 * Parse API error response from fetch Response object
 */
export async function parseApiError(response: Response): Promise<string> {
  try {
    const data = await response.json();
    return data.message || data.error || `Request failed: ${response.statusText}`;
  } catch {
    return `Request failed: ${response.statusText}`;
  }
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
```

### Network Error Detection
```typescript
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

/**
 * Check if error is timeout
 */
export function isTimeoutError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message.includes('timeout') ||
      error.message.includes('timed out')
    );
  }
  return false;
}

/**
 * Check if error is authentication-related
 */
export function isAuthError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message.includes('401') ||
      error.message.includes('403') ||
      error.message.includes('Unauthorized')
    );
  }
  return false;
}
```

---

## User Feedback Patterns

### Toast Notifications (Mutations)
**Use for**: User-initiated actions
- Create, update, delete operations
- Import/export actions
- Settings changes

```typescript
// Success
showSuccessToast('Movie created successfully');
showSuccessToast('Settings saved', 'Changes will take effect immediately');

// Error
showErrorToast(error, 'Create movie');
showErrorToast(error, 'Save settings');
```

### Inline Error Messages (Queries)
**Use for**: Data loading failures
- List views
- Detail pages
- Dashboard widgets

```typescript
{error && (
  <ErrorMessage
    message={error.message}
    retry={() => refetch()}
  />
)}
```

### Form Validation Errors
**Use for**: User input validation
- Form fields
- Search inputs
- Filters

```typescript
<div className="space-y-2">
  <input
    type="text"
    className={errors.title ? 'border-red-500' : ''}
  />
  {errors.title && (
    <p className="text-sm text-red-600">{errors.title}</p>
  )}
</div>
```

### Empty States (Not Errors)
**Use for**: No data (not an error condition)

```typescript
{data?.length === 0 && (
  <EmptyState
    icon={FilmIcon}
    title="No movies found"
    description="Add a library or scan for media to get started"
    action={{
      label: 'Add Library',
      onClick: () => navigate('/libraries/new'),
    }}
  />
)}
```

---

## Error Recovery Strategies

### Automatic Retry (Queries)
TanStack Query handles this automatically:
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
Handled automatically by TanStack Query:
```typescript
export const useUpdateMovie = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }) => movieApi.update(id, updates),
    onMutate: async ({ id, updates }) => {
      // Cancel queries and snapshot
      await queryClient.cancelQueries({ queryKey: ['movie', id] });
      const previous = queryClient.getQueryData(['movie', id]);

      // Optimistic update
      queryClient.setQueryData(['movie', id], (old) => ({ ...old, ...updates }));

      // Return context for rollback
      return { previous };
    },
    onError: (err, variables, context) => {
      // Automatic rollback on error
      queryClient.setQueryData(['movie', variables.id], context.previous);
      showErrorToast(err, 'Update movie');
    },
  });
};
```

---

## Global Error Handling

### Unhandled Promise Rejections
```typescript
// App.tsx or main.tsx
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);

  // Optional: Show user feedback
  toast.error('An unexpected error occurred', {
    description: 'Please try refreshing the page',
  });

  // Prevent default browser behavior
  event.preventDefault();
});
```

### WebSocket Errors
```typescript
// contexts/WebSocketContext.tsx
useEffect(() => {
  if (!ws) return;

  const handleError = (error: Event) => {
    console.error('WebSocket error:', error);
    setConnectionError('Real-time connection lost. Updates may be delayed.');
  };

  ws.addEventListener('error', handleError);
  return () => ws.removeEventListener('error', handleError);
}, [ws]);
```

---

## Error Logging

### Development
```typescript
if (import.meta.env.DEV) {
  console.error('Error details:', {
    message: error.message,
    stack: error.stack,
    context: 'useMovies hook',
  });
}
```

### Production
```typescript
// TODO: Integrate error reporting service
function logError(error: Error, context?: string) {
  if (import.meta.env.PROD) {
    // Sentry.captureException(error, { tags: { context } });
  } else {
    console.error(`[${context}]`, error);
  }
}
```

---

## Testing Error Scenarios

### Simulating Errors
```typescript
// For testing error boundaries and error states

// Mock API error
vi.spyOn(movieApi, 'getAll').mockRejectedValue(new Error('API error'));

// Test error boundary
const ThrowError = () => {
  throw new Error('Test error');
};

render(
  <ErrorBoundary>
    <ThrowError />
  </ErrorBoundary>
);

expect(screen.getByText('Something went wrong')).toBeInTheDocument();
```

---

## Checklist

When handling errors:

- [ ] Render errors caught by Error Boundary?
- [ ] Query errors handled in component UI?
- [ ] Mutation errors show toast notification?
- [ ] Validation errors shown inline?
- [ ] User can retry failed operations?
- [ ] Error messages are user-friendly?
- [ ] Errors logged for debugging?
- [ ] Loading states shown before errors can occur?

---

## Related Documentation

- [Hooks Layer](./HOOKS_LAYER.md) - Error handling in mutations
- [Components](./COMPONENTS.md) - Error UI patterns
- [UI Standards](./UI_STANDARDS.md) - Error state styling
