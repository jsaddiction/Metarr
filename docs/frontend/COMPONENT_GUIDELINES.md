# Component Guidelines

**Purpose**: Prescriptive rules and principles for creating React components in the Metarr frontend. Defines when, where, and how to build components that are maintainable, reusable, and follow atomic design principles.

**Related Docs**:
- [COMPONENTS.md](./COMPONENTS.md) - Component organization and patterns
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Overall frontend architecture
- [UI_STANDARDS.md](./UI_STANDARDS.md) - Design system and styling
- [STATE_MANAGEMENT.md](./STATE_MANAGEMENT.md) - TanStack Query patterns
- [/CLAUDE.md](/CLAUDE.md) - Coding standards and TypeScript rules

---

## Quick Reference (TL;DR)

- **Create components when**: Used 2+ times OR >200 lines OR repeating JSX patterns
- **File structure**: Directory per component with `index.tsx`, `types.ts` (shared), colocate tests
- **Naming**: PascalCase matching file name, descriptive (not generic)
- **Props**: Interface per component, no `any` types, specific over generic
- **State management**: `useState` for UI-only, TanStack Query hooks for server data
- **Composition**: Build from atoms → molecules → organisms, extract early
- **Imports**: Use absolute paths (`@/components/...`), top-level only

---

## 1. When to Create Components

### Decision Tree

**Extract to component when ANY of these apply**:

1. **2+ usage rule**: Used in two or more places
   - Avoid DRY violations
   - Small extraction is cheaper than duplication
   - Example: `MovieCard` used on dashboard and in search results

2. **Size threshold**: Component file exceeds 200 lines
   - 200 lines is practical max for comprehension
   - Easier to test and reason about
   - Clear single responsibility

3. **Repeating patterns**: JSX pattern repeated 2+ times within a component
   - `map()` render patterns
   - Conditional branches with identical structure
   - Form field sequences
   - Example: Extract mapped list items into card component

4. **Testing complexity**: Component is difficult to test as-is
   - Simpler components are easier to unit test
   - Extraction improves test clarity

5. **Reusable logic**: Contains logic useful in other contexts
   - Custom state management
   - Complex conditional rendering
   - Domain-specific formatting

### Do NOT Extract

- **Single-use components** (even if >200 lines): Extraction creates indirection without benefit
  - Exception: If likely to be used elsewhere soon, extract proactively

- **Simple conditionals** (if/else with different JSX): Inline is clearer than component
  - Use early returns in render

- **Trivial wrappers**: Single element with styling (use CSS or utility classes instead)
  - Exception: If wrapping provides semantic meaning or repeated props

### Decision Flowchart

```
┌─────────────────────────────────┐
│ Can this be a CSS class/utility? │
└──────────┬──────────────────────┘
           │ NO
           ▼
┌─────────────────────────────────┐
│ Used 2+ times or >200 lines?    │
└──────────┬──────────────────────┘
           │ YES
           ▼
┌─────────────────────────────────┐
│ CREATE COMPONENT                │
└─────────────────────────────────┘

           │ NO
           ▼
┌─────────────────────────────────┐
│ Repeating JSX pattern 2+ times? │
└──────────┬──────────────────────┘
           │ YES
           ▼
┌─────────────────────────────────┐
│ CREATE COMPONENT                │
└─────────────────────────────────┘

           │ NO
           ▼
┌─────────────────────────────────┐
│ Keep inline in parent           │
└─────────────────────────────────┘
```

---

## 2. File Organization

### Directory Structure

```
components/
├── ui/                      # Atomic UI primitives (no domain knowledge)
│   ├── Button/
│   │   ├── index.tsx
│   │   ├── types.ts
│   │   ├── Button.test.tsx
│   │   └── README.md (optional)
│   ├── Card/
│   │   ├── index.tsx
│   │   └── Card.test.tsx
│   └── [other atoms]
│
├── layout/                  # App structure
│   ├── Layout/
│   │   ├── index.tsx
│   │   ├── Layout.test.tsx
│   │   └── README.md
│   └── Sidebar/
│       └── index.tsx
│
├── movie/                   # Movie domain (molecules & organisms)
│   ├── MovieCard/
│   │   ├── index.tsx
│   │   ├── types.ts
│   │   ├── MovieCard.test.tsx
│   │   └── README.md
│   ├── VirtualizedMovieTable/
│   │   ├── index.tsx
│   │   ├── types.ts
│   │   ├── helpers.ts
│   │   └── VirtualizedMovieTable.test.tsx
│   ├── MetadataTab/
│   │   ├── index.tsx
│   │   └── MetadataTab.test.tsx
│   └── types.ts             # Shared movie component types
│
├── library/                 # Library domain
│   ├── LibraryCard/
│   │   ├── index.tsx
│   │   └── LibraryCard.test.tsx
│   └── types.ts
│
└── provider/                # Provider domain
    ├── ProviderCard/
    │   ├── index.tsx
    │   └── ProviderCard.test.tsx
    └── types.ts
```

### File Naming Rules

**Component file**:
- File name matches exported component name
- PascalCase: `MovieCard.tsx` exports `MovieCard`
- Exception: `index.tsx` re-exports from same directory

**Type files**:
- Shared types for a feature domain: `types.ts`
- Example: `components/movie/types.ts` contains `MovieCardProps`, `MovieRowProps`
- Single component types: inline in component file OR separate `types.ts`
- Preference: Keep simple props inline, extract complex/shared types

**Test files**:
- Colocate next to component: `MovieCard.test.tsx`
- One test file per component file
- Run with `npm test`

**Helper files** (optional):
- For complex components with utility functions
- Example: `VirtualizedMovieTable/helpers.ts` for rendering helpers
- Keep helpers small and focused

**README files** (optional):
- For complex components with special usage patterns
- Document edge cases, performance considerations
- Example: `VirtualizedMovieTable/README.md`

### Index Files and Barrel Exports

**Prefer index.tsx for main export**:
```typescript
// components/MovieCard/index.tsx
export { MovieCard } from './MovieCard.js';
export type { MovieCardProps } from './types.js';
```

**Avoid nested component files** in the same directory:
- Use separate directories if multiple components
- Exception: Tightly coupled sub-components (rare)

### Colocation Principle

**Keep related files together**:
- Component + types + tests in same directory
- Related assets (icons, images) in component directory
- Separates concerns by feature, not type
- Easier to find everything related to one feature

**Bad** (scattered):
```
components/
├── MovieCard.tsx
├── MovieCard.test.tsx
├── types/MovieCardProps.ts
└── hooks/useMovieCard.ts
```

**Good** (colocated):
```
components/movie/
└── MovieCard/
    ├── index.tsx
    ├── types.ts
    ├── MovieCard.test.tsx
    └── helpers.ts
```

---

## 3. Naming Conventions

### Component Names (PascalCase)

**Rule**: File name and export name must match, PascalCase, descriptive

**Good**:
- `MovieCard` - what is it
- `AssetSelectionDialog` - descriptive, includes type
- `EnrichmentHealthBadge` - clear purpose
- `VirtualizedMovieTable` - clear implementation detail
- `ConnectionBadge` - specific, not generic

**Bad**:
- `Card` - too generic (use for atoms only)
- `MovieComponent` - redundant "Component"
- `MC` - abbreviation hides purpose
- `Dialog` - too generic (use for atoms only)
- `Item` - meaningless

**Descriptive names include**:
- What it displays or does
- Domain it belongs to (if not obvious from folder)
- Component type only when helpful (Dialog, Modal, Card)

### Naming Patterns by Type

| Type | Pattern | Example |
|------|---------|---------|
| Lists/Tables | `[Domain]List`, `[Domain]Table` | `MovieList`, `VirtualizedMovieTable` |
| Cards | `[Domain]Card` | `MovieCard`, `ProviderCard` |
| Dialogs/Modals | `[Domain][Action]Dialog`, `[Domain][Action]Modal` | `AssetSelectionDialog`, `LibraryConfigModal` |
| Badges/Status | `[Descriptor]Badge`, `[Status]Status` | `ConnectionBadge`, `EnrichmentHealthBadge` |
| Forms | `[Domain]Form`, `[Domain]Config` | `LibraryConfigModal`, `ProviderConfig` |
| Sections/Tabs | `[Domain][Section]` | `MetadataTab`, `EnrichmentStatusSection` |
| UI Primitives | Simple name (atoms only) | `Button`, `Card`, `Dialog` |

### Props Interface Naming

**Convention**: `[ComponentName]Props`

```typescript
interface MovieCardProps {
  movie: Movie;
  onEdit?: (id: number) => void;
}

interface AssetSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```

**Exception**: If component exported as default or unusual pattern, document

### Event Handler Naming

**Props**: `on[Event]` for callback props
**Implementation**: `handle[Event]` for internal handlers

```typescript
interface MovieCardProps {
  onEdit?: (id: number) => void;  // Callback prop
  onDelete?: (id: number) => void;
}

export const MovieCard: React.FC<MovieCardProps> = ({ onEdit, onDelete }) => {
  const handleEdit = () => onEdit?.(movie.id);      // Internal handler
  const handleDelete = () => onDelete?.(movie.id);
};
```

**Event naming**: Clear and specific
```typescript
// Good
onMovieSelect, onLibraryScan, onProviderTest, onValueChange

// Bad
onClick, onHandle, onEvent, onData
```

---

## 4. Component Structure

### Functional Components Only

**Rule**: Use functional components with hooks, never class components

```typescript
// ✅ Correct
export const MovieCard: React.FC<MovieCardProps> = ({ movie }) => {
  const [isHovered, setIsHovered] = useState(false);
  return <div>{movie.title}</div>;
};

// ❌ Wrong
export class MovieCard extends React.Component<MovieCardProps> {
  // ...
}
```

### Component Structure Template

```typescript
import React, { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MovieCardProps } from './types.js';
import { Card } from '@/components/ui/card/index.js';

// Type definitions (if not in types.ts)
// Shared constants
// Sub-components (if any)
// Main component
// Export

/**
 * MovieCard displays a single movie with metadata and actions.
 * Used on dashboard and search results.
 */
export const MovieCard: React.FC<MovieCardProps> = ({
  movie,
  onEdit,
  onDelete
}) => {
  // State management
  const [isHovered, setIsHovered] = useState(false);

  // Data fetching
  const { data: enrichmentStatus } = useMovieEnrichmentStatus(movie.id);

  // Memoized callbacks
  const handleEdit = useCallback(() => {
    onEdit?.(movie.id);
  }, [movie.id, onEdit]);

  // Complex logic extracted to helpers
  const displayTitle = getMovieDisplayTitle(movie);

  // Render
  return (
    <Card
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <h3>{displayTitle}</h3>
      {isHovered && <Button onClick={handleEdit}>Edit</Button>}
    </Card>
  );
};
```

### Hooks Usage Order

Standard React hooks order (required by ESLint):

1. State hooks (`useState`)
2. Effect hooks (`useEffect`, `useLayoutEffect`)
3. Context hooks (`useContext`)
4. Data hooks (`useQuery`, `useMutation`)
5. Custom hooks
6. Memo hooks (`useMemo`, `useCallback`)

```typescript
export const Component: React.FC<Props> = (props) => {
  // 1. State
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // 2. Effects
  useEffect(() => {
    // ...
  }, []);

  // 3. Context
  const { theme } = useContext(ThemeContext);

  // 4. Data fetching
  const { data: movies } = useMovies();
  const selectMutation = useSelectMovie();

  // 5. Custom hooks
  const moviePath = useMoviePath(selectedId);

  // 6. Memoization (use sparingly)
  const sortedMovies = useMemo(() =>
    movies?.sort() ?? [],
    [movies]
  );

  return <div>{/* ... */}</div>;
};
```

### Component Props Convention

**Props should be passed as single object**:

```typescript
// ✅ Good: Props object
<MovieCard movie={movie} onEdit={handleEdit} onDelete={handleDelete} />

// ✅ Good: Spreading for forwarding
<MovieCard {...cardProps} />

// ❌ Bad: Spreading props randomly
<MovieCard {...movie} onEdit={handleEdit} />
```

**Typing props**:
- Create `Props` interface
- Use `React.FC<Props>` for type
- Never use `React.FC` without generic

```typescript
interface MovieCardProps {
  movie: Movie;
  onEdit?: (id: number) => void;
}

export const MovieCard: React.FC<MovieCardProps> = ({ movie, onEdit }) => {
  // ...
};
```

### Comments and Documentation

**JSDoc for components**:
```typescript
/**
 * Displays a single movie card with optional edit/delete actions.
 *
 * @example
 * <MovieCard movie={movie} onEdit={handleEdit} />
 */
export const MovieCard: React.FC<MovieCardProps> = ({ movie, onEdit }) => {
  // ...
};
```

**Comment complex logic only**:
```typescript
// ✅ Explains why, not what
const getProgressPercentage = () => {
  // Avoid division by zero when no items scanned
  if (!scanProgress || scanProgress.total === 0) return 0;
  return Math.round((scanProgress.current / scanProgress.total) * 100);
};

// ❌ Obvious from code
const getProgressPercentage = () => {
  // Calculate percentage
  return Math.round((scanProgress.current / scanProgress.total) * 100);
};
```

**Document unusual patterns**:
```typescript
// Prevent layout shift by rendering invisible progress bar
// even when not scanning (no content below jumps during transition)
<div className={`${isScanning ? 'opacity-100' : 'opacity-0 invisible'}`}>
  {/* Progress bar */}
</div>
```

---

## 5. Props and Types

### Props Interface Design

**Rule**: Every component has explicit `Props` interface, no `any` types

**Good practices**:
```typescript
// ✅ Specific types, documented
interface MovieCardProps {
  /** Movie entity to display */
  movie: Movie;

  /** Optional callback when edit is clicked */
  onEdit?: (id: number) => void;

  /** Show extended details (trailer, reviews) */
  extended?: boolean;

  /** CSS class for custom styling */
  className?: string;
}

// ❌ Generic, unclear, uses any
interface CardProps {
  data: any;
  onClick: Function;
  mode: string;
}
```

### Type Specificity

**Prefer specific types over generic**:

```typescript
// ✅ Specific
interface LoadingProps {
  isLoading: boolean;  // Boolean, not string
  error?: Error;       // Error object, not string
}

interface ListProps<T> {
  items: T[];          // Generic array
  renderItem: (item: T) => React.ReactNode;  // Specific render function
}

// ❌ Generic/vague
interface LoadingProps {
  state: string;  // "loading" | "error" | "success"? Unclear
  message?: any;  // What type?
}
```

### Optional vs Required

**Rule**: Make props optional only when truly optional

```typescript
// ✅ Good: Required when needed
interface MovieCardProps {
  movie: Movie;        // Required
  onEdit?: () => void; // Optional, has reasonable default (none)
}

// ❌ Bad: Unnecessary optionals
interface MovieCardProps {
  movie?: Movie;  // When would this be undefined? Use required
  onEdit?: () => void;
  onClick?: () => void;  // Too many optionals
}
```

### No `any` Types

**Never use `any`** in new code (even for external props):

```typescript
// ✅ Good: Explicit typing
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';

interface IconButtonProps {
  icon: IconDefinition;  // Specific type
  onClick: () => void;
}

// ❌ Bad
interface IconButtonProps {
  icon: any;  // What type? What's the shape?
}
```

**If type is unknown**: Use generic `unknown` with type guard

```typescript
// ✅ When data type is truly dynamic
export const DataDisplay: React.FC<{ data: unknown }> = ({ data }) => {
  if (typeof data === 'string') return <div>{data}</div>;
  if (Array.isArray(data)) return <ul>{/* ... */}</ul>;
  return <div>Unknown data type</div>;
};
```

### Children Props Pattern

**Use ReactNode for flexible content**:

```typescript
// ✅ Flexible
interface CardProps {
  children: React.ReactNode;
  title?: string;
}

// When you need specific children structure
interface TabsProps {
  tabs: Array<{
    label: string;
    content: React.ReactNode;
  }>;
}

// ❌ Avoid string-only
interface AlertProps {
  message: string;  // Limits to text, no bold/links
}
```

### Props Interface Location

**Rule**:
- Simple props (1-3 fields): inline in component file
- Complex props (3+ fields) or shared: `types.ts` in component directory
- Domain-wide types: `types.ts` in domain folder

```typescript
// ✅ Simple: Inline
// components/ui/Button/index.tsx
interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
}

// ✅ Complex or shared: types.ts
// components/movie/MovieCard/types.ts
export interface MovieCardProps { ... }
export interface MovieRowProps { ... }

// ✅ Domain-wide: domain types.ts
// components/movie/types.ts
export interface MovieListItem { ... }
export interface MovieDetailView { ... }
```

### Event Handler Types

**Function signature patterns**:

```typescript
// ✅ Callback handlers
interface FormProps {
  onSubmit: (data: FormData) => void;          // Sync
  onSubmit: (data: FormData) => Promise<void>; // Async
}

// ✅ Event handlers
interface InputProps {
  onChange: (value: string) => void;
  onFocus: (event: React.FocusEvent<HTMLInputElement>) => void;
}

// ❌ Generic Function type
interface Props {
  onClick: Function;  // Unclear what it takes/returns
}
```

---

## 6. Composition Over Inheritance

### Composition Patterns

**Children pattern** (most flexible):
```typescript
interface CardProps {
  children: React.ReactNode;
  className?: string;
}

// Usage
<Card>
  <h3>Title</h3>
  <p>Content</p>
</Card>
```

**Render props pattern** (for complex logic):
```typescript
interface DataListProps<T> {
  data: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  renderEmpty?: () => React.ReactNode;
}

export const DataList = <T,>({ data, renderItem, renderEmpty }: DataListProps<T>) => {
  return data.length === 0
    ? renderEmpty?.() ?? null
    : <ul>{data.map((item, i) => <li key={i}>{renderItem(item, i)}</li>)}</ul>;
};

// Usage
<DataList
  data={movies}
  renderItem={(movie) => <MovieCard movie={movie} />}
  renderEmpty={() => <EmptyState />}
/>
```

**Compound components** (for complex interactions):
```typescript
// Context-based API
const TabsContext = createContext<TabsContextValue | null>(null);

export const Tabs: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [active, setActive] = useState(0);
  return (
    <TabsContext.Provider value={{ active, setActive }}>
      {children}
    </TabsContext.Provider>
  );
};

export const TabTrigger: React.FC<{ value: number }> = ({ value }) => {
  const ctx = useContext(TabsContext)!;
  return <button onClick={() => ctx.setActive(value)}>Tab</button>;
};

// Usage
<Tabs>
  <TabTrigger value={0}>Tab 1</TabTrigger>
  <TabTrigger value={1}>Tab 2</TabTrigger>
  <TabContent value={0}>Content 1</TabContent>
</Tabs>
```

### Avoid Props Drilling

**Use composition to reduce nesting**:

```typescript
// ❌ Props drilling (bad)
<MovieList
  movies={movies}
  onEdit={onEdit}
  onDelete={onDelete}
  showRating={showRating}
  // 10 more props...
/>

// Inside MovieList
<MovieCard
  movie={movie}
  onEdit={onEdit}
  onDelete={onDelete}
  showRating={showRating}
  // 10 more props...
/>

// ✅ Composition (good)
<MovieList movies={movies}>
  {(movie) => (
    <MovieCard movie={movie} onEdit={onEdit} onDelete={onDelete} />
  )}
</MovieList>
```

### Extract Sub-Components

**When to extract**:
- Compound component with many branches
- Sub-component >50 lines
- Sub-component used 2+ times

```typescript
// ✅ Extract readable sub-components
interface MovieCardProps {
  movie: Movie;
}

const MovieHeader: React.FC<{ movie: Movie }> = ({ movie }) => (
  <div>{movie.title}</div>
);

const MovieStats: React.FC<{ movie: Movie }> = ({ movie }) => (
  <div>{movie.rating} stars</div>
);

export const MovieCard: React.FC<MovieCardProps> = ({ movie }) => (
  <Card>
    <MovieHeader movie={movie} />
    <MovieStats movie={movie} />
  </Card>
);
```

---

## 7. Testing Guidelines

### Test File Location

**Rule**: Test file lives in same directory as component

```
components/movie/MovieCard/
├── index.tsx
├── types.ts
├── MovieCard.test.tsx    ← Here
└── README.md
```

### What to Test

**Test these**:
- User interactions (clicks, form submissions)
- Props impact on rendering
- State changes
- Callback invocations
- Conditional rendering
- Error states and edge cases

**Don't test**:
- Implementation details
- Library behavior (React, shadcn/ui)
- Third-party hooks

### Testing Pattern

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { MovieCard } from './index.js';

describe('MovieCard', () => {
  it('renders movie title', () => {
    const movie = { id: 1, title: 'The Matrix' };
    render(<MovieCard movie={movie} />);
    expect(screen.getByText('The Matrix')).toBeInTheDocument();
  });

  it('calls onEdit when edit button clicked', () => {
    const onEdit = vi.fn();
    const movie = { id: 1, title: 'The Matrix' };
    render(<MovieCard movie={movie} onEdit={onEdit} />);

    fireEvent.click(screen.getByRole('button', { name: /edit/i }));
    expect(onEdit).toHaveBeenCalledWith(1);
  });

  it('shows enrichment status when loading', () => {
    const movie = { id: 1, title: 'The Matrix' };
    render(<MovieCard movie={movie} />);
    // Mock useMovieEnrichmentStatus to return loading state
    // ...
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i);
  });
});
```

### Run Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Specific file
npm test MovieCard.test.tsx
```

---

## 8. Documentation Requirements

### JSDoc Comments

**Document public components**:
```typescript
/**
 * MovieCard displays a single movie with metadata and optional edit/delete actions.
 *
 * Used on the dashboard and in search results. Handles hover states, enrichment
 * status display, and action callbacks.
 *
 * @example
 * const movie: Movie = { id: 1, title: 'The Matrix' };
 * <MovieCard movie={movie} onEdit={handleEdit} onDelete={handleDelete} />
 *
 * @throws Never throws - errors are handled gracefully
 */
export const MovieCard: React.FC<MovieCardProps> = ({ movie, onEdit, onDelete }) => {
  // ...
};
```

### Props Documentation

```typescript
interface MovieCardProps {
  /** Movie entity to display. Required. */
  movie: Movie;

  /** Callback when edit button is clicked. Optional. */
  onEdit?: (movieId: number) => void;

  /** Callback when delete button is clicked. Optional. */
  onDelete?: (movieId: number) => void;

  /** Show extended metadata (directors, budget). Default: false. */
  extended?: boolean;

  /** Additional CSS classes for custom styling. */
  className?: string;
}
```

### README for Complex Components

Create `README.md` for:
- Organisms with non-obvious behavior
- Components with performance considerations
- Components with many optional features
- Components that replace older versions

**Template**:
```markdown
# MovieCard

Movie card component displaying basic metadata with optional enrichment status.

## Usage

```typescript
<MovieCard movie={movie} onEdit={handleEdit} />
```

## Props

See `types.ts` for complete interface.

## Examples

### With Enrichment Status
```typescript
<MovieCard movie={movie} onEdit={handleEdit} extended />
```

### Error Handling
Component handles null movie gracefully - shows empty state.

## Performance

Memoized with `memo()` to prevent re-renders when props unchanged.
Safe for large lists (1000+ items) when virtualized.

## Accessibility

- Keyboard navigable
- ARIA labels on interactive elements
- Focus indicators visible
```

---

## 9. Component Decision Tree

Use this flowchart when deciding how to organize components:

```
┌─────────────────────────────────────┐
│ New component needed?                │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ Does it have domain knowledge?       │
│ (movie, library, provider specific)  │
└────────┬────────────────────┬───────┘
    YES  │                    │ NO
         ▼                    ▼
    ┌────────────┐    ┌──────────────┐
    │ Domain dir │    │ components/ui│
    │ (movie/)   │    │    (atoms)   │
    └────────────┘    └──────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ Needs server data? (useQuery, etc)   │
└────────┬────────────────────┬───────┘
    YES  │                    │ NO
         ▼                    ▼
    ┌────────────┐    ┌──────────────┐
    │ Organism   │    │ Molecule     │
    │ (complex)  │    │ (simple)     │
    └────────────┘    └──────────────┘
```

---

## 10. Related Docs Links

**Frontend Architecture**:
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Overall frontend architecture
- [COMPONENTS.md](./COMPONENTS.md) - Component organization and patterns
- [STATE_MANAGEMENT.md](./STATE_MANAGEMENT.md) - TanStack Query usage
- [API_LAYER.md](./API_LAYER.md) - API communication patterns
- [ERROR_HANDLING.md](./ERROR_HANDLING.md) - Error boundaries and UI error handling
- [UI_STANDARDS.md](./UI_STANDARDS.md) - Design system and Tailwind styling

**Development**:
- [/CLAUDE.md](/CLAUDE.md) - AI assistant rules and coding standards
- [CODING_STANDARDS.md](../development/CODING_STANDARDS.md) - TypeScript conventions
- [TESTING.md](../development/TESTING.md) - Test infrastructure and patterns
- [WORKFLOW.md](../development/WORKFLOW.md) - Development workflow and processes

**Atomic Design Reference**:
- Atoms (primitives): `components/ui/` - Button, Card, Dialog
- Molecules (simple domain): `components/[domain]/` - MovieCard, LibraryCard
- Organisms (complex domain): `components/[domain]/` - VirtualizedMovieTable
- Pages (routes): `pages/` - Dashboard, Movies, Settings
