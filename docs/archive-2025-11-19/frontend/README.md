# Frontend Architecture

**Purpose**: Establish consistent patterns for Metarr's React frontend based on industry standards.

**Stack**: React 18 + TypeScript + TanStack Query + Tailwind CSS v4

---

## Core Principles

### 1. Separation of Concerns
```
Component (UI)  →  Hook (State)  →  API (Network)  →  Backend
```
**Never skip layers.** Each layer has one job.

### 2. Type Safety First
- Every API call is typed
- No `any` types except external libraries
- Backend response types mirror backend models

### 3. Single Source of Truth
- TanStack Query manages all server state
- React state for UI-only concerns
- WebSocket updates sync real-time data

### 4. Graceful Degradation
- Loading states for every async operation
- Error boundaries catch component failures
- Fallback UI for missing data

---

## Three-Layer Architecture

### Component Layer
**Location**: `public/frontend/src/pages/`, `public/frontend/src/components/`
**Purpose**: Render UI, handle user interaction
**Rules**:
- Use hooks for data, never call API directly
- Handle loading/error states
- Keep logic minimal (delegate to hooks)

### Hooks Layer
**Location**: `public/frontend/src/hooks/`
**Purpose**: Manage server state with TanStack Query
**Rules**:
- One file per domain (`useMovies.ts`, `usePlayers.ts`)
- Use `useQuery` for reads, `useMutation` for writes
- Invalidate cache on mutations
- Show toasts for mutations only (not queries)

### API Layer
**Location**: `public/frontend/src/utils/api.ts`
**Purpose**: Type-safe wrappers for backend endpoints
**Rules**:
- Use `fetchApi` wrapper exclusively
- Organize by domain (`movieApi`, `playerApi`)
- Return typed promises
- Handle response unwrapping here

---

## Industry Standards Applied

### React Query (TanStack Query)
**Why**: Industry-standard server state management
- Automatic caching and invalidation
- Built-in loading/error states
- Optimistic updates
- Request deduplication

**Pattern**:
```typescript
// Queries for GET operations
const { data, isLoading, error } = useMovies();

// Mutations for POST/PUT/DELETE
const createMutation = useCreateMovie();
await createMutation.mutateAsync(formData);
```

### Composition Over Inheritance
**Why**: React best practice since hooks introduction
- Build complex UIs from simple components
- Share logic via custom hooks
- Avoid class components

### Error Boundaries
**Why**: Prevent entire app crashes
- Catch render errors
- Show fallback UI
- Log errors for debugging

---

## File Organization

```
public/frontend/src/
├── components/
│   ├── ui/           # Reusable primitives (buttons, cards, tabs)
│   ├── layout/       # App shell (sidebar, header)
│   └── [domain]/     # Feature-specific (movie/, player/)
├── pages/            # Route components
├── hooks/            # Custom hooks (one per domain)
├── types/            # TypeScript interfaces
├── utils/
│   ├── api.ts        # API modules
│   └── errorHandling.ts
└── styles/           # Global CSS
```

**Naming Conventions**:
- Components: PascalCase (`MovieCard.tsx`)
- Hooks: camelCase with 'use' prefix (`useMovies.ts`)
- Types: PascalCase (`Movie.ts`)
- Utilities: camelCase (`errorHandling.ts`)

---

## Adding a New Feature

### Step 1: Define Types
**File**: `types/[domain].ts`
```typescript
export interface Widget {
  id: number;
  name: string;
  enabled: boolean;
}

export interface WidgetFormData {
  name: string;
  enabled: boolean;
}
```

### Step 2: Create API Module
**File**: `utils/api.ts`
```typescript
export const widgetApi = {
  getAll: () => fetchApi<Widget[]>('/widgets'),
  getById: (id: number) => fetchApi<Widget>(`/widgets/${id}`),
  create: (data: WidgetFormData) =>
    fetchApi<Widget>('/widgets', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, updates: Partial<WidgetFormData>) =>
    fetchApi<Widget>(`/widgets/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
  delete: (id: number) =>
    fetchApi<void>(`/widgets/${id}`, { method: 'DELETE' }),
};
```

### Step 3: Create Hooks
**File**: `hooks/useWidgets.ts`
```typescript
export const useWidgets = () => {
  return useQuery<Widget[], Error>({
    queryKey: ['widgets'],
    queryFn: () => widgetApi.getAll(),
  });
};

export const useCreateWidget = () => {
  const queryClient = useQueryClient();
  return useMutation<Widget, Error, WidgetFormData>({
    mutationFn: (data) => widgetApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['widgets'] });
      showSuccessToast('Widget created');
    },
    onError: (error) => showErrorToast(error, 'Create widget'),
  });
};
```

### Step 4: Use in Component
**File**: `pages/WidgetManager.tsx`
```typescript
export const WidgetManager: React.FC = () => {
  const { data: widgets, isLoading, error } = useWidgets();
  const createMutation = useCreateWidget();

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      {widgets?.map(widget => (
        <div key={widget.id}>{widget.name}</div>
      ))}
    </div>
  );
};
```

---

## Critical Rules

### ✅ Always Do
1. Use `fetchApi` for all network requests
2. Unwrap responses at API layer, not hooks
3. Invalidate queries after mutations
4. Show toasts for mutations (success/error)
5. Handle loading and error states in components
6. Use TypeScript generics for type safety

### ❌ Never Do
1. Call `fetch()` or `axios` directly
2. Use `any` type
3. Skip the hooks layer (component → API directly)
4. Show error toasts in query hooks
5. Mutate server state outside TanStack Query
6. Use class components

---

## Design System

**Primary Color**: Violet (`#8b5cf6`)
**Theme**: Dark mode first
**Component Library**: shadcn/ui + custom AnimatedTabs

### Design Documentation
- **[UI_STANDARDS.md](./UI_STANDARDS.md)** - Styling guidelines, spacing, typography
- **[BUTTON_STANDARDS.md](./BUTTON_STANDARDS.md)** - Button patterns, hover states, interactions

---

## Real-Time Updates

**Pattern**: WebSocket + Polling Fallback
- WebSocket for instant updates
- Queries poll as fallback (2-5s interval)
- TanStack Query merges both sources

**Example**: Library scan progress uses WebSocket for real-time status, query invalidation ensures data consistency.

---

## Layer Documentation

Each layer has detailed documentation for decision-making:

- **[Components](./COMPONENTS.md)** - File organization, composition patterns, Atomic Design
- **[Types](./TYPES.md)** - TypeScript naming conventions, interface design
- **[Hooks](./HOOKS_LAYER.md)** - TanStack Query patterns, cache invalidation
- **[API](./API_LAYER.md)** - fetchApi patterns, SSE, response handling
- **[Error Handling](./ERROR_HANDLING.md)** - Error boundaries, user feedback, recovery
- **[UI Standards](./UI_STANDARDS.md)** - Design system, component styling

---

## Quick Reference

**Adding CRUD for new entity**:
1. Types (`types/widget.ts`) - Define interfaces
2. API (`utils/api.ts`) - Add `widgetApi` object
3. Hooks (`hooks/useWidgets.ts`) - Add query/mutation hooks
4. Component - Use hooks, handle states

**Key Imports**:
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { widgetApi } from '../utils/api';
import { showErrorToast, showSuccessToast } from '../utils/errorHandling';
```

**Query Keys Pattern**:
```typescript
['widgets']           // List
['widget', id]        // Single item
['widget', id, 'sub'] // Nested data
```

**Mutation Pattern**:
```typescript
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['widgets'] });
  showSuccessToast('Success message');
},
onError: (error) => showErrorToast(error, 'Action name'),
```
