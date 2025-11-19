# Type System

**Purpose**: TypeScript type organization and naming conventions.

**Industry Standards**: Type-Driven Development, Domain-Driven Design naming

---

## Quick Decision Matrix

| Question | Answer | Example |
|----------|--------|---------|
| Backend entity mirror? | `Entity` | `Movie`, `Player`, `Library` |
| Form submission data? | `EntityFormData` | `MovieFormData`, `PlayerFormData` |
| API response wrapper? | `EntityResponse` | `MovieListResponse` |
| List filters/params? | `EntityFilters` | `MovieFilters` |
| Single item for lists? | `EntityListItem` | `MovieListItem` |
| Extended detail view? | `EntityDetail` | `MovieDetail` |
| Component props? | `ComponentProps` | `MovieCardProps` |
| Hook return value? | Inline or named | `UseMoviesResult` (if complex) |

---

## File Organization

### Directory Structure
```
types/
├── movie.ts          # Movie domain types
├── player.ts         # Player domain types
├── library.ts        # Library domain types
├── common.ts         # Shared utility types
└── api.ts            # Generic API types (ApiResponse, PaginatedResult)
```

### Naming Convention
- **File**: Lowercase, singular: `movie.ts` (not `movies.ts` or `Movie.ts`)
- **Type/Interface**: PascalCase: `Movie`, `MovieFormData`
- **One file per domain**: Group related types together

---

## Type Naming Patterns

### Entity Types (Backend Mirrors)
**Pattern**: `Entity`
**Purpose**: Match backend model exactly

```typescript
// types/movie.ts

/** Movie entity from backend */
export interface Movie {
  id: number;
  title: string;
  year: number;
  tmdb_id: number;
  monitored: boolean;
  created_at: string;  // ISO 8601 string from backend
  updated_at: string;
}
```

**Rules**:
- Match backend field names (including `snake_case`)
- Use `string` for dates (not `Date` object)
- Use `number` for IDs
- Use `| null` for nullable fields
- Use `?` for optional fields

### Form Data Types
**Pattern**: `EntityFormData`
**Purpose**: Data sent to backend for create/update

```typescript
/** Data for creating/updating a movie */
export interface MovieFormData {
  title: string;
  year: number;
  tmdb_id?: number;
  monitored?: boolean;
}
```

**Rules**:
- Omit `id`, `created_at`, `updated_at` (backend generates)
- Use `?` for optional fields
- Use frontend-friendly names (can differ from entity)

### List Item Types
**Pattern**: `EntityListItem`
**Purpose**: Lightweight type for list views (subset of full entity)

```typescript
/** Movie summary for list views */
export interface MovieListItem {
  id: number;
  title: string;
  year: number;
  poster_url: string | null;
  status: 'new' | 'enriched' | 'published';
}
```

**Use when**: Full entity has many fields, list only needs subset

### Detail Types
**Pattern**: `EntityDetail`
**Purpose**: Extended entity with relations/computed fields

```typescript
/** Movie with all related data for edit page */
export interface MovieDetail extends Movie {
  files: MovieFile[];
  candidates: AssetCandidate[];
  locks: FieldLock[];
}
```

**Use when**: Backend returns entity + related data with `?include=` param

### Response Wrappers
**Pattern**: `EntityResponse` or `EntityListResponse`
**Purpose**: Backend response structure

```typescript
/** Paginated movie list response */
export interface MovieListResponse {
  movies: Movie[];
  total: number;
  limit: number;
  offset: number;
}

/** Single movie response */
export interface MovieResponse {
  success: boolean;
  data: Movie;
}
```

**Note**: Unwrap these at API layer, not in types consumers

### Filter/Params Types
**Pattern**: `EntityFilters` or `EntityParams`
**Purpose**: Query parameters for list endpoints

```typescript
/** Filters for movie list endpoint */
export interface MovieFilters {
  status?: 'new' | 'enriched' | 'published';
  monitored?: boolean;
  search?: string;
  year?: number;
  limit?: number;
  offset?: number;
}
```

---

## interface vs type

### Use `interface` (Preferred)
**When**: Object shapes, can be extended
```typescript
export interface Movie {
  id: number;
  title: string;
}

// Can be extended
export interface MovieDetail extends Movie {
  files: File[];
}
```

### Use `type` (Specific Cases)
**When**: Unions, primitives, utility types
```typescript
// Union types
export type MovieStatus = 'new' | 'enriched' | 'published';
export type AssetType = 'poster' | 'fanart' | 'banner';

// Utility types
export type PartialMovie = Partial<Movie>;
export type MovieKeys = keyof Movie;

// Intersection types
export type MovieWithFiles = Movie & { files: File[] };
```

**Guideline**: Default to `interface`, use `type` when `interface` can't express it.

---

## Component Props Types

### Pattern: `ComponentNameProps`
```typescript
// components/movie/MovieCard.tsx

interface MovieCardProps {
  /** Movie to display */
  movie: Movie;
  /** Optional click handler */
  onClick?: (id: number) => void;
  /** Show extended details */
  extended?: boolean;
}

export const MovieCard: React.FC<MovieCardProps> = (props) => {
  // ...
};
```

**Rules**:
- Define inline above component (not in `types/` directory)
- Add JSDoc comments for clarity
- Use `?` for optional props
- Type event handlers: `onClick?: (id: number) => void`

### Children Props
```typescript
interface CardProps {
  children: React.ReactNode;  // Most flexible
}

interface LayoutProps {
  children: React.ReactElement; // Single element
}

interface ListProps {
  children: React.ReactElement[]; // Multiple elements
}
```

### Generic Props
```typescript
interface DataListProps<T> {
  data: T[];
  renderItem: (item: T) => React.ReactNode;
  keyExtractor: (item: T) => string | number;
}

export function DataList<T>({ data, renderItem, keyExtractor }: DataListProps<T>) {
  return <>{data.map(item => <div key={keyExtractor(item)}>{renderItem(item)}</div>)}</>;
}
```

---

## Shared Types

### Common Utility Types
**File**: `types/common.ts`

```typescript
/** Generic paginated result */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

/** Generic API error response */
export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}

/** Generic success response */
export interface ApiSuccess<T> {
  success: boolean;
  data: T;
  message?: string;
}

/** Standard ID type */
export type ID = number;

/** ISO 8601 date string */
export type DateString = string;

/** Status common to many entities */
export type Status = 'pending' | 'processing' | 'completed' | 'failed';
```

---

## Avoiding `any`

### Never Use `any`
```typescript
// ❌ Bad
function processData(data: any) {
  return data.map((item: any) => item.value);
}
```

### Use `unknown` Instead
```typescript
// ✅ Good: Force type checking
function processData(data: unknown) {
  if (Array.isArray(data)) {
    return data.map(item => {
      if (typeof item === 'object' && item !== null && 'value' in item) {
        return item.value;
      }
      return undefined;
    });
  }
  throw new Error('Invalid data');
}
```

### Use Generics
```typescript
// ✅ Good: Type-safe and flexible
function processData<T extends { value: string }>(data: T[]): string[] {
  return data.map(item => item.value);
}
```

### Type Assertions (Use Sparingly)
```typescript
// Only when you're certain
const data = response as Movie[];

// Better: Type guard
function isMovie(obj: unknown): obj is Movie {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'title' in obj
  );
}
```

---

## Enums vs Union Types

### Prefer Union Types (Preferred)
```typescript
// ✅ Good: Simpler, more flexible
export type MovieStatus = 'new' | 'enriched' | 'published';
export type AssetType = 'poster' | 'fanart' | 'banner' | 'logo';
```

**Why**: Smaller bundle, easier to use, no extra import

### Use Enums (Rare Cases)
```typescript
// Only when you need reverse mapping or namespacing
export enum LogLevel {
  Debug = 0,
  Info = 1,
  Warning = 2,
  Error = 3,
}

// Allows: LogLevel[0] => 'Debug'
```

---

## Null vs Undefined

### Prefer `null` for API Fields
```typescript
// Backend returns null for missing data
export interface Movie {
  poster_url: string | null;  // ✅ Explicit absence
  description: string | null;
}
```

### Use `undefined` for Optional Props
```typescript
interface MovieCardProps {
  onClick?: () => void;  // ✅ May not be provided
  extended?: boolean;
}
```

### Guideline
- **API data**: Use `| null` (backend contract)
- **Props/params**: Use `?` (optional usage)

---

## Type Exports

### Export All Public Types
```typescript
// types/movie.ts

export interface Movie { /* ... */ }
export interface MovieFormData { /* ... */ }
export interface MovieFilters { /* ... */ }
export type MovieStatus = 'new' | 'enriched' | 'published';
```

### Barrel Exports (Optional)
**Only if many types, getting unwieldy**
```typescript
// types/index.ts
export * from './movie';
export * from './player';
export * from './library';
export * from './common';

// Usage
import { Movie, Player, Library } from '../types';
```

**Guideline**: Start with direct imports, add barrel when needed.

---

## Type Guards

### Custom Type Guards
```typescript
export function isMovie(obj: unknown): obj is Movie {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    typeof obj.id === 'number' &&
    'title' in obj &&
    typeof obj.title === 'string'
  );
}

// Usage
if (isMovie(data)) {
  console.log(data.title); // TypeScript knows it's a Movie
}
```

### Discriminated Unions
```typescript
interface SuccessResult {
  status: 'success';
  data: Movie;
}

interface ErrorResult {
  status: 'error';
  error: string;
}

type Result = SuccessResult | ErrorResult;

function handleResult(result: Result) {
  if (result.status === 'success') {
    console.log(result.data); // TypeScript knows this branch has data
  } else {
    console.log(result.error); // TypeScript knows this branch has error
  }
}
```

---

## Documentation

### JSDoc Comments
```typescript
/**
 * Movie entity from backend
 *
 * @remarks
 * This type mirrors the database model exactly.
 * Dates are ISO 8601 strings, not Date objects.
 */
export interface Movie {
  /** Unique identifier */
  id: number;

  /** Movie title as displayed to users */
  title: string;

  /** Release year (4 digits) */
  year: number;

  /** TMDB external ID (nullable if not matched) */
  tmdb_id: number | null;

  /** Whether Metarr actively manages this movie's metadata */
  monitored: boolean;
}
```

**When to add JSDoc**:
- Complex types
- Non-obvious field meanings
- Important constraints
- Deprecation notices

---

## Migration Strategy

### When Backend Changes
1. Update entity type first
2. Fix TypeScript errors (cascades to API/hooks/components)
3. Let compiler guide you

### Adding New Fields
```typescript
// Start optional, make required later
export interface Movie {
  id: number;
  title: string;
  new_field?: string;  // Phase 1: Optional
}

// After backend deployed everywhere
export interface Movie {
  id: number;
  title: string;
  new_field: string;   // Phase 2: Required
}
```

---

## Common Patterns

### Extending Types
```typescript
// Base type
export interface BaseEntity {
  id: number;
  created_at: string;
  updated_at: string;
}

// Extended types
export interface Movie extends BaseEntity {
  title: string;
  year: number;
}

export interface Player extends BaseEntity {
  name: string;
  type: 'kodi' | 'jellyfin' | 'plex';
}
```

### Pick and Omit
```typescript
// Only need a subset
export type MovieSummary = Pick<Movie, 'id' | 'title' | 'year'>;

// Everything except certain fields
export type MovieFormData = Omit<Movie, 'id' | 'created_at' | 'updated_at'>;

// Make all fields optional
export type PartialMovie = Partial<Movie>;

// Make all fields required
export type CompleteMovie = Required<Movie>;
```

---

## Implemented Domain Types

### Phase Configuration Types
**File**: `public/frontend/src/types/phaseConfig.ts`
**Purpose**: Workflow phase behavior configuration

```typescript
/**
 * Phase Configuration Types
 *
 * All workflow phases ALWAYS run in sequence.
 * These configurations control BEHAVIOR, not ENABLEMENT.
 *
 * Sequential chain: scan → enrich → publish → player-sync
 */

/** Enrichment Phase Configuration */
export interface EnrichmentConfig {
  fetchProviderAssets: boolean;  // Fetch assets from providers
  autoSelectAssets: boolean;     // Auto-select vs manual UI selection
  preferredLanguage: string;     // ISO 639-1 language code
}

/** Publishing Phase Configuration */
export interface PublishConfig {
  publishAssets: boolean;        // Copy images to library
  publishActors: boolean;        // Create .actors/ folder
  publishTrailers: boolean;      // Download trailers
}

/** General Configuration */
export interface GeneralConfig {
  autoPublish: boolean;          // Auto-publish after enrichment
}

/** Complete phase configuration */
export interface PhaseConfiguration {
  enrichment: EnrichmentConfig;
  publish: PublishConfig;
  general: GeneralConfig;
}
```

**Design Notes**:
- Separates phase behavior from asset limits (different services)
- All phases always run; config controls what they do
- Used by Settings → General page

### Asset Configuration Types
**File**: `public/frontend/src/types/assetConfig.ts`
**Purpose**: Asset download limits per asset type

```typescript
/** Media types supported by the system */
export type MediaType =
  | 'movie'
  | 'tvshow'
  | 'season'
  | 'episode'
  | 'artist'
  | 'album'
  | 'song';

/** Asset limit configuration with metadata */
export interface AssetLimit {
  assetType: string;           // e.g., 'poster', 'fanart', 'clearlogo'
  displayName: string;         // UI-friendly name
  currentLimit: number;        // User's configured limit
  defaultLimit: number;        // Recommended default
  minAllowed: number;          // Minimum (usually 0)
  maxAllowed: number;          // Maximum to prevent abuse
  description: string;         // Help text for UI
  isDefault: boolean;          // True if using default value
  mediaTypes: MediaType[];     // Which media types this applies to
}

/** Map of asset types to limits (simple format) */
export interface AssetLimitsMap {
  [assetType: string]: number;
}

/** API request to set a limit */
export interface SetAssetLimitRequest {
  limit: number;
}

/** API response after setting a limit */
export interface SetAssetLimitResponse {
  message: string;
  assetType: string;
  limit: number;
}
```

**Design Notes**:
- `mediaTypes` array allows asset types to apply to multiple media categories
- `isDefault` flag enables UI to show which values are customized
- Instant persistence pattern (no save button required)

---

## Related Documentation

- [API Layer](./API_LAYER.md) - Using types in API calls
- [Hooks Layer](./HOOKS_LAYER.md) - Using types in hooks
- [Components](./COMPONENTS.md) - Component props types
