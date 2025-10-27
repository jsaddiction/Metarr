# Component Layer

**Purpose**: Component organization and composition patterns following React best practices.

**Industry Standards**: Atomic Design, Composition Pattern, Single Responsibility Principle

---

## Quick Decision Matrix

| Question | Answer | Location |
|----------|--------|----------|
| Reusable button/input/card? | UI Primitive | `components/ui/` |
| Movie/Player/Library specific? | Domain Component | `components/[domain]/` |
| Entire page view? | Page Component | `pages/` |
| Sidebar/Header/Layout? | Layout Component | `components/layout/` |
| Component > 200 lines? | Extract subcomponents | Same directory |
| Complex logic needed? | Extract custom hook | `hooks/` |
| Shared across domains? | Lift to `components/ui/` | Move up |

---

## File Organization

### Directory Structure
```
components/
├── ui/                # Atomic components (no domain knowledge)
│   ├── Button.tsx
│   ├── Card.tsx
│   ├── AnimatedTabs.tsx
│   └── Dialog.tsx
├── layout/            # App structure
│   ├── Sidebar.tsx
│   ├── Header.tsx
│   └── Layout.tsx
└── [domain]/          # Feature-specific (uses domain hooks)
    ├── MovieCard.tsx
    ├── MovieTable.tsx
    └── AssetSelector.tsx

pages/                 # Route components (composition roots)
├── Dashboard.tsx
├── movies/
│   ├── MovieList.tsx
│   └── MovieEdit.tsx
└── settings/
    └── Players.tsx
```

### Naming Conventions
- **PascalCase** for all component files: `MovieCard.tsx`
- **Match component name**: File `MovieCard.tsx` exports `MovieCard`
- **Descriptive names**: `AssetSelector` not `Selector`
- **Avoid generic names**: `MovieList` not `List`

### Colocation Rules
- Keep related files together
- Tests next to components: `MovieCard.test.tsx`
- Styles only if CSS modules: `MovieCard.module.css`
- Subcomponents in same directory if not reused

---

## Component Hierarchy (Atomic Design)

### Level 1: Atoms (`components/ui/`)
**Purpose**: Reusable primitives with no business logic
**Rules**:
- No domain hooks (`useMovies`, `usePlayers`)
- Only UI state (open/closed, selected/unselected)
- Accept data via props
- Generic, reusable

**Example**:
```typescript
// components/ui/Button.tsx
interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'danger';
  onClick?: () => void;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ variant = 'primary', onClick, children }) => {
  return (
    <button className={`btn btn-${variant}`} onClick={onClick}>
      {children}
    </button>
  );
};
```

### Level 2: Molecules (`components/[domain]/`)
**Purpose**: Domain-specific compositions
**Rules**:
- Can use domain hooks
- Compose atoms together
- Single responsibility

**Example**:
```typescript
// components/movie/MovieCard.tsx
interface MovieCardProps {
  movie: Movie;
  onEdit?: (id: number) => void;
}

export const MovieCard: React.FC<MovieCardProps> = ({ movie, onEdit }) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{movie.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p>{movie.year}</p>
        <Button onClick={() => onEdit?.(movie.id)}>Edit</Button>
      </CardContent>
    </Card>
  );
};
```

### Level 3: Organisms (`components/[domain]/`)
**Purpose**: Complex feature sections
**Rules**:
- Use hooks for data fetching
- Manage local state
- Compose molecules

**Example**:
```typescript
// components/movie/MovieTable.tsx
export const MovieTable: React.FC = () => {
  const { data: movies, isLoading, error } = useMovies();

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;

  return (
    <table>
      {movies?.map(movie => (
        <MovieRow key={movie.id} movie={movie} />
      ))}
    </table>
  );
};
```

### Level 4: Pages (`pages/`)
**Purpose**: Route-level composition roots
**Rules**:
- Compose organisms and molecules
- Handle routing params
- Manage page-level state
- No styling logic (delegate to components)

**Example**:
```typescript
// pages/movies/MovieList.tsx
export const MovieList: React.FC = () => {
  const [filters, setFilters] = useState({});

  return (
    <PageLayout>
      <PageHeader title="Movies" />
      <MovieFilters filters={filters} onChange={setFilters} />
      <MovieTable filters={filters} />
    </PageLayout>
  );
};
```

---

## Composition Patterns

### Children Pattern
**Use when**: Wrapper components, layouts
```typescript
interface CardProps {
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ children }) => {
  return <div className="card">{children}</div>;
};

// Usage
<Card>
  <h1>Title</h1>
  <p>Content</p>
</Card>
```

### Render Props Pattern
**Use when**: Sharing logic with custom rendering
```typescript
interface DataListProps<T> {
  data: T[];
  renderItem: (item: T) => React.ReactNode;
}

export function DataList<T>({ data, renderItem }: DataListProps<T>) {
  return <div>{data.map(renderItem)}</div>;
}

// Usage
<DataList
  data={movies}
  renderItem={(movie) => <MovieCard movie={movie} />}
/>
```

### Compound Components Pattern
**Use when**: Related components work together
```typescript
// components/ui/Tabs.tsx
const TabsContext = createContext<TabsContextValue | null>(null);

export const Tabs: React.FC<TabsProps> = ({ children, activeTab, onChange }) => {
  return (
    <TabsContext.Provider value={{ activeTab, onChange }}>
      <div className="tabs">{children}</div>
    </TabsContext.Provider>
  );
};

export const TabList: React.FC = ({ children }) => (
  <div className="tab-list">{children}</div>
);

export const Tab: React.FC<TabProps> = ({ value, children }) => {
  const { activeTab, onChange } = useContext(TabsContext)!;
  return (
    <button
      className={activeTab === value ? 'active' : ''}
      onClick={() => onChange(value)}
    >
      {children}
    </button>
  );
};

// Usage
<Tabs activeTab={tab} onChange={setTab}>
  <TabList>
    <Tab value="one">Tab 1</Tab>
    <Tab value="two">Tab 2</Tab>
  </TabList>
</Tabs>
```

---

## Props Patterns

### Interface Design
```typescript
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
```

### Optional vs Required Props
```typescript
// Required for core functionality
interface ButtonProps {
  children: React.ReactNode;      // Required
  onClick?: () => void;            // Optional - not all buttons need it
  variant?: 'primary' | 'secondary'; // Optional - has default
  disabled?: boolean;              // Optional - has default (false)
}
```

### Event Handlers
**Naming**: `on[Event]` for props, `handle[Event]` for internal
```typescript
interface MovieCardProps {
  onEdit?: (id: number) => void;     // Prop
  onDelete?: (id: number) => void;   // Prop
}

export const MovieCard: React.FC<MovieCardProps> = ({ movie, onEdit, onDelete }) => {
  const handleEdit = () => {         // Internal handler
    onEdit?.(movie.id);
  };

  const handleDelete = () => {       // Internal handler
    if (confirm('Delete?')) {
      onDelete?.(movie.id);
    }
  };

  return (
    <div>
      <button onClick={handleEdit}>Edit</button>
      <button onClick={handleDelete}>Delete</button>
    </div>
  );
};
```

---

## State Management Rules

### Component State (useState)
**Use for**: UI-only state
```typescript
const [isOpen, setIsOpen] = useState(false);      // Modal open/closed
const [selectedTab, setSelectedTab] = useState('metadata'); // Tab selection
const [searchQuery, setSearchQuery] = useState(''); // Search input
```

### Server State (TanStack Query)
**Use for**: Backend data
```typescript
const { data: movies } = useMovies();           // Use hook, not useState
const { data: player } = usePlayer(id);         // Never fetch in component
```

### When to Lift State
- **Lift when**: Multiple siblings need the same state
- **Keep local when**: Only one component needs it

```typescript
// ❌ Bad: Lifted unnecessarily
const Parent = () => {
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  return <MovieCard onHover={setHoveredId} />;
};

// ✅ Good: Keep local
const MovieCard = () => {
  const [isHovered, setIsHovered] = useState(false);
  return <div onMouseEnter={() => setIsHovered(true)} />;
};
```

---

## When to Extract

### Extract to New Component When:
1. Component exceeds 200 lines
2. Repeated JSX patterns (DRY principle)
3. Single responsibility violated
4. Testing becomes difficult

### Extract to Custom Hook When:
1. Complex state logic
2. Reusable logic across components
3. Side effects management
4. Computation/memoization

**Example**:
```typescript
// ❌ Bad: Complex logic in component
const MovieList = () => {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchMovies().then(setMovies).finally(() => setLoading(false));
  }, []);

  return /* ... */;
};

// ✅ Good: Extracted to hook
const useMovies = () => {
  return useQuery({
    queryKey: ['movies'],
    queryFn: () => movieApi.getAll(),
  });
};

const MovieList = () => {
  const { data: movies, isLoading } = useMovies();
  return /* ... */;
};
```

---

## Common Patterns

### Loading States
```typescript
const Component = () => {
  const { data, isLoading, error } = useQuery(/* ... */);

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;
  if (!data) return <EmptyState />;

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

// ❌ Bad: Nested ternaries
{isLoading ? <Loading /> : error ? <Error /> : <Data />}
```

### Lists and Keys
```typescript
// ✅ Good: Stable, unique keys
{movies.map(movie => (
  <MovieCard key={movie.id} movie={movie} />
))}

// ❌ Bad: Index as key (unstable)
{movies.map((movie, index) => (
  <MovieCard key={index} movie={movie} />
))}
```

---

## Performance

### Memoization
**Use sparingly** - Only when proven slow
```typescript
// Expensive computation
const sortedMovies = useMemo(
  () => movies.sort((a, b) => a.title.localeCompare(b.title)),
  [movies]
);

// Prevent re-renders
const MemoizedCard = memo(MovieCard);
```

### Callback Stability
```typescript
// ✅ Good: Stable callback
const handleDelete = useCallback((id: number) => {
  deleteMovie(id);
}, [deleteMovie]);

// ❌ Bad: New function every render
const handleDelete = (id: number) => {
  deleteMovie(id);
};
```

**Note**: Only optimize after measuring. Premature optimization adds complexity.

---

## Related Documentation

- [Hooks Layer](./HOOKS_LAYER.md) - Extract complex logic to custom hooks
- [Types](./TYPES.md) - Component props interfaces
- [UI Standards](./UI_STANDARDS.md) - Styling patterns
