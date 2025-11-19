# Frontend Architecture

**Purpose**: Overview of Metarr's React frontend architecture, build system, and technology stack.

**Related Docs**:
- Related: [COMPONENTS.md](./COMPONENTS.md), [STATE_MANAGEMENT.md](./STATE_MANAGEMENT.md), [API_LAYER.md](./API_LAYER.md)

---

## Quick Reference (TL;DR)

- **React 18** functional components with TypeScript
- **Vite** for fast development and optimized builds
- **TanStack Query** for server state management
- **Tailwind CSS v4** for styling (violet primary)
- **shadcn/ui** component primitives
- **Three-layer architecture**: Component → Hook → API
- **WebSocket** real-time updates + polling fallback

---

## Technology Stack

### Core Framework
**React 18.3.1** - Modern hooks-based components
- Functional components only (no classes)
- Hooks for state and side effects
- Concurrent rendering features
- Automatic batching

### Build System
**Vite 5.x** - Next-generation frontend tooling
- Lightning-fast HMR (Hot Module Replacement)
- Optimized production builds
- Native ESM support
- Built-in TypeScript support

**Key Features**:
- Dev server starts instantly (~100ms)
- HMR updates in <50ms
- Tree-shaking and code splitting
- CSS and asset handling

### Language
**TypeScript 5.x** - Static typing
- Strict mode enabled
- No \`any\` types (except external libraries)
- Interface-first design
- Generic type parameters

### State Management
**TanStack Query v5** - Server state management
- Automatic caching and invalidation
- Built-in loading/error states
- Request deduplication
- Optimistic updates
- WebSocket integration

### Styling
**Tailwind CSS v4** - Utility-first CSS
- Dark mode first design
- Violet (#8b5cf6) primary color
- JIT (Just-In-Time) compiler
- Custom design tokens

**shadcn/ui** - Component primitives
- Radix UI headless components
- Customizable via CVA (class-variance-authority)
- Copy-paste integration (not npm package)
- Full TypeScript support

### Icons
**FontAwesome 6** - Icon library
- Solid and regular variants
- Tree-shaking support
- Semantic icon names

### Routing
**React Router v6** - Client-side routing
- Nested routes
- Lazy loading
- Error boundaries per route
- Type-safe navigation

### WebSocket
**Native WebSocket API** - Real-time updates
- Automatic reconnection
- Event-based messaging
- Context provider for global access

---

## Architecture Principles

### 1. Separation of Concerns
\`\`\`
User Interface (Component)
    ↓
State Management (Hook)
    ↓
Network Layer (API)
    ↓
Backend REST API / WebSocket
\`\`\`

**Never skip layers** - Each has a single responsibility.

### 2. Type Safety First
- Every API call typed end-to-end
- Backend types mirror backend models
- No runtime type guessing
- Compile-time error detection

### 3. Single Source of Truth
- **TanStack Query** owns all server data
- **React state** only for UI concerns
- **WebSocket updates** sync to query cache
- No duplicate state

### 4. Graceful Degradation
- Loading states for async operations
- Error boundaries prevent crashes
- Fallback UI for missing data
- Offline capability via cache

---

## Directory Structure

\`\`\`
public/frontend/src/
├── components/
│   ├── ui/              # Atomic components (Button, Card, Dialog)
│   ├── layout/          # App shell (Layout, Sidebar)
│   ├── movie/           # Movie-specific components
│   ├── library/         # Library management
│   ├── provider/        # Provider configuration
│   ├── mediaPlayer/     # Media player connections
│   ├── asset/           # Asset selection and management
│   ├── dashboard/       # Dashboard widgets
│   └── error/           # Error boundaries and fallbacks
├── pages/
│   ├── Dashboard.tsx    # Main dashboard
│   ├── Movies.tsx       # Movie list
│   ├── System.tsx       # System page with tabs
│   ├── settings/        # Settings pages (Providers, Libraries, etc.)
│   ├── activity/        # Activity pages (History, Jobs, etc.)
│   ├── system/          # System pages (Status, Logs, etc.)
│   └── metadata/        # Metadata pages (Actors, etc.)
├── hooks/
│   ├── useMovies.ts     # Movie data hooks
│   ├── usePlayers.ts    # Media player hooks
│   ├── useLibraries.ts  # Library hooks
│   ├── useProviders.ts  # Provider hooks
│   ├── useJobs.ts       # Job management hooks
│   └── useWebSocket.tsx # WebSocket context and hook
├── types/
│   ├── movie.ts         # Movie interfaces
│   ├── library.ts       # Library interfaces
│   ├── mediaPlayer.ts   # Media player interfaces
│   ├── provider.ts      # Provider interfaces
│   ├── job.ts           # Job interfaces
│   └── asset.ts         # Asset interfaces
├── utils/
│   ├── api.ts           # API client modules
│   └── errorHandling.ts # Error utilities
├── contexts/
│   ├── WebSocketContext.tsx  # WebSocket provider
│   └── ThemeContext.tsx      # Theme provider
├── styles/
│   └── globals.css      # Tailwind directives and global styles
├── lib/
│   └── utils.ts         # Utility functions (cn, etc.)
└── App.tsx              # Root component with router
\`\`\`

---

## Component Hierarchy

### Level 1: Atoms (UI Primitives)
**Location**: \`components/ui/\`
**Purpose**: Reusable building blocks with no business logic

**Examples**:
- Button, Input, Checkbox, Select
- Card, Dialog, Dropdown, Tooltip
- Badge, Progress, Skeleton
- AnimatedTabs (custom)

**Rules**:
- No domain hooks (useMovies, usePlayers)
- Only UI state (open/closed, checked/unchecked)
- Accept all data via props
- Fully typed with TypeScript

### Level 2: Molecules (Domain Components)
**Location**: \`components/[domain]/\`
**Purpose**: Feature-specific compositions

**Examples**:
- MovieCard, LibraryCard, ProviderCard
- AssetThumbnail, ConnectionBadge
- MediaPlayerStatusCard

**Rules**:
- Can use domain hooks
- Compose atoms together
- Single responsibility
- Emit events via callbacks

### Level 3: Organisms (Feature Sections)
**Location**: \`components/[domain]/\`
**Purpose**: Complex feature sections with data fetching

**Examples**:
- VirtualizedMovieTable
- AssetSelectionDialog
- MediaPlayerWizard

**Rules**:
- Use hooks for data fetching
- Manage local state
- Compose molecules and atoms
- Handle loading/error states

### Level 4: Pages (Route Components)
**Location**: \`pages/\`
**Purpose**: Full page views that compose organisms

**Examples**:
- Dashboard, Movies, System
- settings/Providers, settings/Libraries
- activity/History, system/Status

**Rules**:
- Route-level composition
- Handle URL params
- Page-level state only
- Delegate to organisms

---

## Three-Layer Architecture

### Component Layer
**Responsibility**: Render UI and handle user interaction
**Tools**: React components, hooks for data

\`\`\`typescript
export const MovieList: React.FC = () => {
  const { data: movies, isLoading, error } = useMovies();

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;

  return (
    <div className="grid gap-4">
      {movies?.map(movie => (
        <MovieCard key={movie.id} movie={movie} />
      ))}
    </div>
  );
};
\`\`\`

### Hooks Layer
**Responsibility**: Manage server state with TanStack Query
**Tools**: useQuery, useMutation, useQueryClient

\`\`\`typescript
export const useMovies = () => {
  return useQuery<MovieListItem[], Error>({
    queryKey: ['movies'],
    queryFn: () => movieApi.getAll(),
  });
};

export const useCreateMovie = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: MovieFormData) => movieApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['movies'] });
      toast.success('Movie created');
    },
  });
};
\`\`\`

### API Layer
**Responsibility**: Type-safe network interface
**Tools**: fetchApi wrapper, domain modules

\`\`\`typescript
export const movieApi = {
  getAll: () => fetchApi<MovieListResult>('/movies'),
  getById: (id: number) => fetchApi<MovieDetail>(\`/movies/\${id}\`),
  create: (data: MovieFormData) =>
    fetchApi<MovieDetail>('/movies', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
};
\`\`\`

---

## Real-Time Architecture

### WebSocket Integration
**Pattern**: WebSocket for instant updates + polling for reliability

\`\`\`typescript
// WebSocket context provides global connection
const { ws, isConnected } = useWebSocket();

// Components subscribe to specific events
useEffect(() => {
  if (!ws || !isConnected) return;

  const handler = (data: ScanProgressEvent) => {
    setScanProgress(data.progress);
  };

  ws.on('scan:progress', handler);
  return () => ws.off('scan:progress', handler);
}, [ws, isConnected]);

// TanStack Query provides fallback via polling
const { data } = useQuery({
  queryKey: ['scan', id],
  queryFn: () => scanApi.getStatus(id),
  refetchInterval: 2000, // Poll every 2s
});
\`\`\`

### Event Types
- \`scan:progress\` - Library scan updates
- \`scan:completed\` - Scan finished
- \`job:status\` - Job state changes
- \`player:activity\` - Media player updates

---

## Development Workflow

### Adding a New Feature

1. **Define Types** (\`types/widget.ts\`)
\`\`\`typescript
export interface Widget {
  id: number;
  name: string;
  enabled: boolean;
}
\`\`\`

2. **Create API Module** (\`utils/api.ts\`)
\`\`\`typescript
export const widgetApi = {
  getAll: () => fetchApi<Widget[]>('/widgets'),
  create: (data: WidgetFormData) =>
    fetchApi<Widget>('/widgets', { method: 'POST', body: JSON.stringify(data) }),
};
\`\`\`

3. **Create Hooks** (\`hooks/useWidgets.ts\`)
\`\`\`typescript
export const useWidgets = () => {
  return useQuery({
    queryKey: ['widgets'],
    queryFn: () => widgetApi.getAll(),
  });
};
\`\`\`

4. **Build Components** (\`components/widget/WidgetCard.tsx\`)
\`\`\`typescript
export const WidgetCard: React.FC<{ widget: Widget }> = ({ widget }) => {
  return <Card>{widget.name}</Card>;
};
\`\`\`

5. **Create Page** (\`pages/Widgets.tsx\`)
\`\`\`typescript
export const Widgets: React.FC = () => {
  const { data: widgets, isLoading } = useWidgets();

  if (isLoading) return <LoadingSpinner />;

  return <div>{widgets?.map(w => <WidgetCard key={w.id} widget={w} />)}</div>;
};
\`\`\`

---

## See Also

- [COMPONENTS.md](./COMPONENTS.md) - Component organization and patterns
- [STATE_MANAGEMENT.md](./STATE_MANAGEMENT.md) - TanStack Query patterns
- [API_LAYER.md](./API_LAYER.md) - Network communication
- [ERROR_HANDLING.md](./ERROR_HANDLING.md) - Error boundaries and recovery
- [UI_STANDARDS.md](./UI_STANDARDS.md) - Design system and styling
