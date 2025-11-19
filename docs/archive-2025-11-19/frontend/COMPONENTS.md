# Component Organization

**Purpose**: Component file organization, composition patterns, and atomic design hierarchy for Metarr frontend.

**Related Docs**:
- Parent: [Frontend README](./README.md)
- Related: [ARCHITECTURE.md](./ARCHITECTURE.md), [STATE_MANAGEMENT.md](./STATE_MANAGEMENT.md), [UI_STANDARDS.md](./UI_STANDARDS.md)

---

## Quick Reference (TL;DR)

- **Atomic Design**: UI primitives (`ui/`) → Domain components (`[domain]/`) → Pages
- **PascalCase** file names matching component names
- **Colocate** related components and tests
- **Extract** when >200 lines or repeated patterns
- **Props**: Specific interfaces, no `any` types
- **Composition**: Build complex from simple

---

## File Organization

### Directory Structure
```
components/
├── ui/                  # Atoms: Reusable primitives (no domain knowledge)
│   ├── button.tsx       # shadcn/ui Button
│   ├── card.tsx         # shadcn/ui Card
│   ├── dialog.tsx       # shadcn/ui Dialog
│   ├── AnimatedTabs.tsx # Custom tabs with violet indicator
│   ├── SaveBar.tsx      # Custom save bar
│   └── ViewControls.tsx # View switcher
├── layout/              # App structure
│   ├── Layout.tsx       # Main app shell
│   └── Sidebar.tsx      # Navigation sidebar
├── movie/               # Movie domain components
│   ├── MovieCard.tsx
│   ├── MovieRow.tsx
│   ├── VirtualizedMovieTable.tsx
│   ├── AssetSelectionModal.tsx
│   └── CurrentAssetCard.tsx
├── library/             # Library domain components
│   ├── LibraryCard.tsx
│   ├── ScannerSettings.tsx
│   └── DirectoryBrowserModal.tsx
├── provider/            # Provider domain components
│   ├── ProviderCard.tsx
│   ├── ProviderPriorityEditor.tsx
│   └── AddProviderModal.tsx
├── mediaPlayer/         # Media player domain components
│   ├── MediaPlayerCard.tsx
│   ├── MediaPlayerWizard.tsx
│   └── ConnectionBadge.tsx
├── asset/               # Asset selection components
│   ├── AssetThumbnail.tsx
│   ├── AssetCandidateGrid.tsx
│   └── AssetSelectionDialog.tsx
├── dashboard/           # Dashboard widgets
│   ├── LibraryStatusCard.tsx
│   └── RecentActivityList.tsx
├── error/               # Error boundaries
│   └── RouteErrorBoundary.tsx
└── ErrorBoundary.tsx    # Global error boundary

pages/                   # Route components
├── Dashboard.tsx
├── Movies.tsx
├── System.tsx
├── settings/
│   ├── Providers.tsx
│   ├── Libraries.tsx
│   ├── DataSelection.tsx
│   └── MediaPlayers.tsx
├── activity/
│   ├── History.tsx
│   ├── RunningJobs.tsx
│   └── BlockedAssets.tsx
└── system/
    ├── Status.tsx
    ├── Events.tsx
    └── Tasks.tsx
```

### Naming Conventions
- **Components**: PascalCase (`MovieCard.tsx`)
- **Files match exports**: File `MovieCard.tsx` exports `MovieCard`
- **Descriptive names**: `AssetSelectionDialog` not `Dialog`
- **Avoid generic**: `MovieList` not `List`
- **Tests colocated**: `MovieCard.test.tsx`

---

## Atomic Design Hierarchy

### Level 1: Atoms (UI Primitives)
**Location**: `components/ui/`
**Purpose**: Generic, reusable building blocks

**Characteristics**:
- No domain knowledge (movies, libraries, players)
- No data fetching hooks
- Only UI state (open/closed, selected)
- Accept all data via props
- Fully typed interfaces

**Examples**:
```typescript
// button.tsx - shadcn/ui Button
interface ButtonProps {
  variant?: 'default' | 'destructive' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  children: React.ReactNode;
}

// AnimatedTabs.tsx - Custom tabs
interface AnimatedTabsProps {
  tabs: Array<{ value: string; label: string }>;
  activeTab: string;
  onChange: (value: string) => void;
}
```

**Real Examples**:
- `button.tsx` - Button variants
- `card.tsx` - Card container
- `dialog.tsx` - Modal dialog
- `select.tsx` - Dropdown select
- `checkbox.tsx` - Checkbox input
- `AnimatedTabs.tsx` - Custom tab navigation
- `SaveBar.tsx` - Floating save bar

### Level 2: Molecules (Domain Components)
**Location**: `components/[domain]/`
**Purpose**: Feature-specific compositions using atoms

**Characteristics**:
- Can use domain hooks (useMovies, usePlayers)
- Compose atoms together
- Single responsibility
- Accept data via props or fetch directly

**Examples**:
```typescript
// MovieCard.tsx - Display movie with poster and metadata
interface MovieCardProps {
  movie: MovieListItem;
  onEdit?: (id: number) => void;
}

export const MovieCard: React.FC<MovieCardProps> = ({ movie, onEdit }) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{movie.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <img src={movie.poster} alt={movie.title} />
        <p>{movie.year}</p>
        <Button onClick={() => onEdit?.(movie.id)}>Edit</Button>
      </CardContent>
    </Card>
  );
};
```

**Real Examples**:
- `MovieCard.tsx` - Movie display card
- `LibraryCard.tsx` - Library configuration card
- `ProviderCard.tsx` - Provider status card
- `AssetThumbnail.tsx` - Asset image thumbnail
- `ConnectionBadge.tsx` - Connection status indicator

### Level 3: Organisms (Feature Sections)
**Location**: `components/[domain]/`
**Purpose**: Complex sections with data fetching and state management

**Characteristics**:
- Use hooks for data fetching
- Manage local state
- Compose molecules and atoms
- Handle loading/error states

**Examples**:
```typescript
// VirtualizedMovieTable.tsx - Large movie list with virtual scrolling
export const VirtualizedMovieTable: React.FC = () => {
  const { data: movies, isLoading, error } = useMovies();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;

  return (
    <VirtualList
      items={movies}
      renderItem={(movie) => (
        <MovieRow
          movie={movie}
          selected={selectedIds.has(movie.id)}
          onSelect={(id) => setSelectedIds(prev => new Set(prev).add(id))}
        />
      )}
    />
  );
};
```

**Real Examples**:
- `VirtualizedMovieTable.tsx` - Movie table with virtualization
- `AssetSelectionDialog.tsx` - Modal for selecting assets
- `MediaPlayerWizard.tsx` - Multi-step player setup
- `DirectoryBrowserModal.tsx` - File system browser
- `ProviderPriorityEditor.tsx` - Drag-drop provider ordering

### Level 4: Pages (Route Components)
**Location**: `pages/`
**Purpose**: Full page views that compose organisms

**Characteristics**:
- Route-level composition root
- Handle URL parameters
- Page-level state only
- Delegate rendering to organisms

**Examples**:
```typescript
// Movies.tsx - Movie list page
export const Movies: React.FC = () => {
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [filters, setFilters] = useState<MovieFilters>({});

  return (
    <div className="space-y-6">
      <PageHeader title="Movies">
        <ViewControls view={view} onChange={setView} />
      </PageHeader>

      <MovieFilters filters={filters} onChange={setFilters} />

      {view === 'grid' ? (
        <MovieGrid filters={filters} />
      ) : (
        <VirtualizedMovieTable filters={filters} />
      )}
    </div>
  );
};
```

**Real Examples**:
- `Dashboard.tsx` - Main dashboard
- `Movies.tsx` - Movie list page
- `settings/Providers.tsx` - Provider configuration
- `activity/History.tsx` - Job history

---

## Composition Patterns

### Children Pattern
**Use when**: Wrapper components, layouts, containers

```typescript
interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ children, className }) => {
  return (
    <div className={cn("rounded-lg border bg-card", className)}>
      {children}
    </div>
  );
};

// Usage
<Card>
  <h2>Title</h2>
  <p>Content</p>
</Card>
```

### Render Props Pattern
**Use when**: Sharing logic with custom rendering

```typescript
interface DataListProps<T> {
  data: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  loading?: boolean;
}

export function DataList<T>({ data, renderItem, loading }: DataListProps<T>) {
  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-2">
      {data.map((item, index) => renderItem(item, index))}
    </div>
  );
}

// Usage
<DataList
  data={movies}
  renderItem={(movie) => <MovieCard key={movie.id} movie={movie} />}
/>
```

### Compound Components Pattern
**Use when**: Related components that work together

```typescript
// Tabs.tsx
const TabsContext = createContext<TabsContextValue | null>(null);

export const Tabs: React.FC<TabsProps> = ({ children, value, onValueChange }) => {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      {children}
    </TabsContext.Provider>
  );
};

export const TabsList: React.FC = ({ children }) => (
  <div className="flex space-x-2">{children}</div>
);

export const Tab: React.FC<TabProps> = ({ value, children }) => {
  const { value: activeValue, onValueChange } = useContext(TabsContext)!;
  const isActive = value === activeValue;

  return (
    <button
      onClick={() => onValueChange(value)}
      className={cn("px-4 py-2", isActive && "bg-violet-500 text-white")}
    >
      {children}
    </button>
  );
};

// Usage
<Tabs value={tab} onValueChange={setTab}>
  <TabsList>
    <Tab value="metadata">Metadata</Tab>
    <Tab value="assets">Assets</Tab>
  </TabsList>
</Tabs>
```

---

## Props Design

### Interface Design Best Practices

```typescript
// ✅ Good: Specific, typed, documented
interface MovieCardProps {
  /** Movie entity to display */
  movie: Movie;
  /** Optional edit handler */
  onEdit?: (id: number) => void;
  /** Show extended details */
  extended?: boolean;
  /** Additional CSS classes */
  className?: string;
}

// ❌ Bad: Generic, unclear
interface CardProps {
  data: any;                    // No type safety
  onClick: Function;            // Use specific signature
  mode: string;                 // Use union type
}
```

### Optional vs Required Props

```typescript
interface ButtonProps {
  children: React.ReactNode;           // Required - core content
  onClick?: () => void;                // Optional - not all buttons need it
  variant?: 'default' | 'destructive'; // Optional - has default
  disabled?: boolean;                  // Optional - default false
  loading?: boolean;                   // Optional - default false
}
```

### Event Handler Naming
**Pattern**: `on[Event]` for props, `handle[Event]` for internal

```typescript
interface MovieCardProps {
  onEdit?: (id: number) => void;     // Prop: callback from parent
  onDelete?: (id: number) => void;   // Prop: callback from parent
}

export const MovieCard: React.FC<MovieCardProps> = ({ movie, onEdit, onDelete }) => {
  // Internal handlers
  const handleEdit = () => {
    console.log('Edit clicked');
    onEdit?.(movie.id);
  };

  const handleDelete = async () => {
    if (confirm('Delete this movie?')) {
      onDelete?.(movie.id);
    }
  };

  return (
    <Card>
      <Button onClick={handleEdit}>Edit</Button>
      <Button onClick={handleDelete} variant="destructive">Delete</Button>
    </Card>
  );
};
```

---

## State Management in Components

### Component State (useState)
**Use for**: UI-only state that doesn't need to be shared

```typescript
const [isOpen, setIsOpen] = useState(false);           // Modal open/closed
const [selectedTab, setSelectedTab] = useState('metadata'); // Tab selection
const [searchQuery, setSearchQuery] = useState('');    // Search input
const [isHovered, setIsHovered] = useState(false);     // Hover state
```

### Server State (TanStack Query)
**Use for**: Backend data (never useState for server data)

```typescript
// ✅ Correct: Use hook
const { data: movies, isLoading } = useMovies();

// ❌ Wrong: Don't manage server data in useState
const [movies, setMovies] = useState([]);
useEffect(() => {
  fetchMovies().then(setMovies);
}, []);
```

### When to Lift State

**Lift state when**: Multiple siblings need the same state
```typescript
// Parent manages shared state
const Parent = () => {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  return (
    <>
      <MovieList onSelect={setSelectedId} />
      <MovieDetail movieId={selectedId} />
    </>
  );
};
```

**Keep local when**: Only one component needs it
```typescript
// ✅ Good: Local hover state
const MovieCard = () => {
  const [isHovered, setIsHovered] = useState(false);
  return <div onMouseEnter={() => setIsHovered(true)} />;
};
```

---

## When to Extract

### Extract to New Component When:

1. **Component exceeds 200 lines**
   - Break into smaller, focused components
   - Extract subcomponents to same directory

2. **Repeated JSX patterns (DRY)**
   ```typescript
   // ❌ Repetition
   <div className="flex items-center gap-2">
     <Icon />
     <span>{text1}</span>
   </div>
   <div className="flex items-center gap-2">
     <Icon />
     <span>{text2}</span>
   </div>

   // ✅ Extract component
   const IconLabel = ({ icon, text }) => (
     <div className="flex items-center gap-2">
       <Icon icon={icon} />
       <span>{text}</span>
     </div>
   );
   ```

3. **Single Responsibility Principle violated**
   - Component doing too many things
   - Split by concern

4. **Testing becomes difficult**
   - Complex logic hard to test
   - Extract to separate component

### Extract to Custom Hook When:

1. **Complex state logic**
   - Multiple useState with interdependencies
   - Complex useEffect chains

2. **Reusable logic across components**
   - Same logic pattern in multiple places
   - Extract to `hooks/use[Feature].ts`

3. **Side effects management**
   - WebSocket subscriptions
   - Event listeners
   - Timers/intervals

**Example**:
```typescript
// ❌ Complex logic in component
const MovieList = () => {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetchMovies()
      .then(setMovies)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  // ... rest
};

// ✅ Extracted to hook
const useMovies = () => {
  return useQuery({
    queryKey: ['movies'],
    queryFn: () => movieApi.getAll(),
  });
};

const MovieList = () => {
  const { data: movies, isLoading, error } = useMovies();
  // ... rest
};
```

---

## Common Patterns

### Loading States
```typescript
const Component = () => {
  const { data, isLoading, error } = useMovies();

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;
  if (!data || data.length === 0) return <EmptyState />;

  return <DataView data={data} />;
};
```

### Conditional Rendering
```typescript
// ✅ Good: Early returns for clarity
if (isLoading) return <Loading />;
if (error) return <Error />;

// ✅ Good: Logical AND for optional elements
{user?.isAdmin && <AdminPanel />}

// ✅ Good: Ternary for either/or
{view === 'grid' ? <GridView /> : <ListView />}

// ❌ Bad: Nested ternaries
{isLoading ? <Loading /> : error ? <Error /> : data ? <Data /> : <Empty />}
```

### Lists and Keys
```typescript
// ✅ Good: Stable, unique keys
{movies.map(movie => (
  <MovieCard key={movie.id} movie={movie} />
))}

// ❌ Bad: Index as key (breaks when list changes)
{movies.map((movie, index) => (
  <MovieCard key={index} movie={movie} />
))}
```

### Event Handling
```typescript
// ✅ Good: Arrow function for simple calls
<Button onClick={() => handleClick(id)}>Click</Button>

// ✅ Good: Direct reference when no args
<Button onClick={handleSubmit}>Submit</Button>

// ❌ Bad: Creating function in render unnecessarily
{movies.map(movie => (
  <Button onClick={() => console.log(movie.id)}>View</Button>
))}
// Better: Pass stable function
{movies.map(movie => (
  <Button onClick={handleView} data-id={movie.id}>View</Button>
))}
```

---

## Performance Optimization

### Memoization (Use Sparingly)
**Only optimize when proven slow**

```typescript
// Expensive computation
const sortedMovies = useMemo(
  () => movies.sort((a, b) => a.title.localeCompare(b.title)),
  [movies]
);

// Prevent re-renders of child component
const MemoizedMovieCard = memo(MovieCard);
```

### Callback Stability
```typescript
// ✅ Good: Stable callback with useCallback
const handleDelete = useCallback((id: number) => {
  deleteMovie(id);
}, [deleteMovie]);

// Note: Only necessary if passed to memoized child
```

### Virtualization
**For large lists (>100 items)**

```typescript
import { VirtualizedMovieTable } from './VirtualizedMovieTable';

// Renders only visible rows
<VirtualizedMovieTable movies={movies} />
```

---

## Real-World Examples

### Simple Molecule: ConnectionBadge
```typescript
interface ConnectionBadgeProps {
  status: 'connected' | 'disconnected' | 'error';
}

export const ConnectionBadge: React.FC<ConnectionBadgeProps> = ({ status }) => {
  const colors = {
    connected: 'bg-green-500',
    disconnected: 'bg-gray-500',
    error: 'bg-red-500',
  };

  return (
    <div className={cn("h-2 w-2 rounded-full", colors[status])} />
  );
};
```

### Complex Organism: AssetSelectionDialog
```typescript
export const AssetSelectionDialog: React.FC<Props> = ({ movieId, assetType, onClose }) => {
  const { data: candidates, isLoading } = useAssetCandidates(movieId, assetType);
  const selectMutation = useSelectAsset();
  const [selected, setSelected] = useState<string | null>(null);

  const handleSelect = async () => {
    if (!selected) return;
    await selectMutation.mutateAsync({ movieId, assetType, url: selected });
    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Select {assetType}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <LoadingSpinner />
        ) : (
          <AssetCandidateGrid
            candidates={candidates}
            selected={selected}
            onSelect={setSelected}
          />
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSelect} disabled={!selected}>
            Select
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
```

---

## See Also

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Overall frontend architecture
- [STATE_MANAGEMENT.md](./STATE_MANAGEMENT.md) - TanStack Query patterns
- [UI_STANDARDS.md](./UI_STANDARDS.md) - Design system and styling
- [ERROR_HANDLING.md](./ERROR_HANDLING.md) - Error boundaries and patterns
