# Component Organization

**Purpose**: Component file organization, composition patterns, and atomic design hierarchy for Metarr frontend.

**Related Docs**:
- Related: [ARCHITECTURE.md](./ARCHITECTURE.md), [STATE_MANAGEMENT.md](./STATE_MANAGEMENT.md), [UI_STANDARDS.md](./UI_STANDARDS.md)

---

## Quick Reference (TL;DR)

- **Atomic Design**: UI primitives (\`ui/\`) → Domain components (\`[domain]/\`) → Pages
- **PascalCase** file names matching component names
- **Colocate** related components and tests
- **Extract** when >200 lines or repeated patterns
- **Props**: Specific interfaces, no \`any\` types
- **Composition**: Build complex from simple

---

## File Organization

### Directory Structure
\`\`\`
components/
├── ui/                  # Atoms: Reusable primitives
├── layout/              # App structure
├── movie/               # Movie domain
├── library/             # Library domain
├── provider/            # Provider domain
├── mediaPlayer/         # Media player domain
├── asset/               # Asset selection
├── dashboard/           # Dashboard widgets
└── error/               # Error boundaries

pages/                   # Route components
├── Dashboard.tsx
├── Movies.tsx
├── settings/
│   ├── Providers.tsx
│   ├── Libraries.tsx
│   └── MediaPlayers.tsx
├── activity/
│   ├── History.tsx
│   └── RunningJobs.tsx
└── system/
    ├── Status.tsx
    └── Events.tsx
\`\`\`

### Naming Conventions
- **Components**: PascalCase (\`MovieCard.tsx\`)
- **Files match exports**: File \`MovieCard.tsx\` exports \`MovieCard\`
- **Descriptive names**: \`AssetSelectionDialog\` not \`Dialog\`
- **Tests colocated**: \`MovieCard.test.tsx\`

---

## Atomic Design Hierarchy

### Level 1: Atoms (UI Primitives)
**Location**: \`components/ui/\`
**Purpose**: Generic, reusable building blocks

**Characteristics**:
- No domain knowledge
- No data fetching hooks
- Only UI state
- Accept all data via props

**Examples**: Button, Card, Dialog, AnimatedTabs

### Level 2: Molecules (Domain Components)
**Location**: \`components/[domain]/\`
**Purpose**: Feature-specific compositions

**Characteristics**:
- Can use domain hooks
- Compose atoms together
- Single responsibility

**Examples**: MovieCard, LibraryCard, AssetThumbnail

### Level 3: Organisms (Feature Sections)
**Location**: \`components/[domain]/\`
**Purpose**: Complex sections with data fetching

**Characteristics**:
- Use hooks for data fetching
- Manage local state
- Handle loading/error states

**Examples**: VirtualizedMovieTable, AssetSelectionDialog, MediaPlayerWizard

### Level 4: Pages (Route Components)
**Location**: \`pages/\`
**Purpose**: Full page views

**Characteristics**:
- Route-level composition
- Handle URL params
- Page-level state only

**Examples**: Dashboard, Movies, settings/Providers

---

## Composition Patterns

### Children Pattern
\`\`\`typescript
interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ children, className }) => {
  return <div className={cn("rounded-lg border", className)}>{children}</div>;
};
\`\`\`

### Render Props Pattern
\`\`\`typescript
interface DataListProps<T> {
  data: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
}

export function DataList<T>({ data, renderItem }: DataListProps<T>) {
  return <div>{data.map((item, index) => renderItem(item, index))}</div>;
}
\`\`\`

### Compound Components
\`\`\`typescript
const TabsContext = createContext<TabsContextValue | null>(null);

export const Tabs: React.FC<TabsProps> = ({ children, value, onValueChange }) => {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      {children}
    </TabsContext.Provider>
  );
};

export const Tab: React.FC<TabProps> = ({ value, children }) => {
  const { value: activeValue, onValueChange } = useContext(TabsContext)!;
  return (
    <button onClick={() => onValueChange(value)}>{children}</button>
  );
};
\`\`\`

---

## Props Design

### Interface Best Practices

\`\`\`typescript
// ✅ Good: Specific, typed, documented
interface MovieCardProps {
  /** Movie entity to display */
  movie: Movie;
  /** Optional edit handler */
  onEdit?: (id: number) => void;
  /** Show extended details */
  extended?: boolean;
}

// ❌ Bad: Generic, unclear
interface CardProps {
  data: any;
  onClick: Function;
  mode: string;
}
\`\`\`

### Event Handler Naming
**Pattern**: \`on[Event]\` for props, \`handle[Event]\` for internal

\`\`\`typescript
interface MovieCardProps {
  onEdit?: (id: number) => void;
  onDelete?: (id: number) => void;
}

export const MovieCard: React.FC<MovieCardProps> = ({ movie, onEdit, onDelete }) => {
  const handleEdit = () => onEdit?.(movie.id);
  const handleDelete = () => {
    if (confirm('Delete?')) onDelete?.(movie.id);
  };

  return (
    <Card>
      <Button onClick={handleEdit}>Edit</Button>
      <Button onClick={handleDelete}>Delete</Button>
    </Card>
  );
};
\`\`\`

---

## State Management in Components

### Component State (useState)
**Use for**: UI-only state

\`\`\`typescript
const [isOpen, setIsOpen] = useState(false);
const [selectedTab, setSelectedTab] = useState('metadata');
const [searchQuery, setSearchQuery] = useState('');
\`\`\`

### Server State (TanStack Query)
**Use for**: Backend data

\`\`\`typescript
// ✅ Correct
const { data: movies, isLoading } = useMovies();

// ❌ Wrong
const [movies, setMovies] = useState([]);
useEffect(() => {
  fetchMovies().then(setMovies);
}, []);
\`\`\`

### When to Lift State

**Lift when**: Multiple siblings need state
\`\`\`typescript
const Parent = () => {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  return (
    <>
      <MovieList onSelect={setSelectedId} />
      <MovieDetail movieId={selectedId} />
    </>
  );
};
\`\`\`

**Keep local when**: Only one component needs it
\`\`\`typescript
const MovieCard = () => {
  const [isHovered, setIsHovered] = useState(false);
  return <div onMouseEnter={() => setIsHovered(true)} />;
};
\`\`\`

---

## When to Extract

### Extract to Component When:
1. Component exceeds 200 lines
2. Repeated JSX patterns (DRY)
3. Single Responsibility Principle violated
4. Testing becomes difficult

### Extract to Hook When:
1. Complex state logic
2. Reusable logic across components
3. Side effects management

\`\`\`typescript
// ❌ Complex logic in component
const MovieList = () => {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setLoading(true);
    fetchMovies().then(setMovies).finally(() => setLoading(false));
  }, []);
};

// ✅ Extracted to hook
const useMovies = () => {
  return useQuery({
    queryKey: ['movies'],
    queryFn: () => movieApi.getAll(),
  });
};
\`\`\`

---

## Common Patterns

### Loading States
\`\`\`typescript
const { data, isLoading, error } = useMovies();

if (isLoading) return <LoadingSpinner />;
if (error) return <ErrorMessage error={error} />;
if (!data || data.length === 0) return <EmptyState />;

return <DataView data={data} />;
\`\`\`

### Conditional Rendering
\`\`\`typescript
// ✅ Good: Early returns
if (isLoading) return <Loading />;
if (error) return <Error />;

// ✅ Good: Logical AND
{user?.isAdmin && <AdminPanel />}

// ✅ Good: Ternary for either/or
{view === 'grid' ? <GridView /> : <ListView />}

// ❌ Bad: Nested ternaries
{isLoading ? <Loading /> : error ? <Error /> : data ? <Data /> : <Empty />}
\`\`\`

### Lists and Keys
\`\`\`typescript
// ✅ Good: Stable unique keys
{movies.map(movie => (
  <MovieCard key={movie.id} movie={movie} />
))}

// ❌ Bad: Index as key
{movies.map((movie, index) => (
  <MovieCard key={index} movie={movie} />
))}
\`\`\`

---

## Performance

### Memoization (Use Sparingly)
\`\`\`typescript
// Expensive computation
const sortedMovies = useMemo(
  () => movies.sort((a, b) => a.title.localeCompare(b.title)),
  [movies]
);

// Prevent re-renders
const MemoizedCard = memo(MovieCard);
\`\`\`

### Callback Stability
\`\`\`typescript
const handleDelete = useCallback((id: number) => {
  deleteMovie(id);
}, [deleteMovie]);
\`\`\`

### Virtualization
\`\`\`typescript
// For large lists (>100 items)
<VirtualizedMovieTable movies={movies} />
\`\`\`

---

## Real-World Examples

### Simple Molecule
\`\`\`typescript
interface ConnectionBadgeProps {
  status: 'connected' | 'disconnected' | 'error';
}

export const ConnectionBadge: React.FC<ConnectionBadgeProps> = ({ status }) => {
  const colors = {
    connected: 'bg-green-500',
    disconnected: 'bg-gray-500',
    error: 'bg-red-500',
  };
  return <div className={cn("h-2 w-2 rounded-full", colors[status])} />;
};
\`\`\`

### Complex Organism
\`\`\`typescript
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
          <Button onClick={handleSelect} disabled={!selected}>Select</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
\`\`\`

---

## See Also

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Overall frontend architecture
- [STATE_MANAGEMENT.md](./STATE_MANAGEMENT.md) - TanStack Query patterns
- [UI_STANDARDS.md](./UI_STANDARDS.md) - Design system and styling
- [ERROR_HANDLING.md](./ERROR_HANDLING.md) - Error boundaries and patterns
