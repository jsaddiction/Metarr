# Frontend Type System

## Overview

Metarr's frontend uses a **three-tier type system** for movies to optimize bundle size, clarify data flow, and align with backend API design. Each tier serves a specific purpose and includes only the data necessary for its use case.

**Key Benefits:**
- **Reduced Bundle Size**: List views load minimal data, not full entity details
- **Clear Data Flow**: Type names indicate intended use and data depth
- **Backend Alignment**: Types map directly to API endpoint responses
- **Type Safety**: TypeScript enforces correct usage across components

---

## Type Hierarchy

### Tier 1: MovieListItem

**Purpose**: Lightweight data for table/grid views with asset tracking

**Use Cases:**
- Movies page table view (`/metadata/movies`)
- Search results
- Grid/poster views
- Any view requiring multiple movies simultaneously

**Fields** (~20 fields):

| Category | Field | Type | Description |
|----------|-------|------|-------------|
| **Core** | `id` | `number` | Primary key |
| | `title` | `string` | Movie title |
| | `year` | `number \| null` | Release year |
| | `studio` | `string \| null` | Primary studio |
| **State** | `monitored` | `boolean` | User monitoring flag (automation control) |
| | `enrichment_status` | `'unidentified' \| 'identified' \| 'enriched'` | Workflow state |
| **Assets** | `assetCounts` | `AssetCounts` | Per-asset type counts (poster: 3, fanart: 5, etc.) |
| | `assetStatuses` | `AssetStatuses` | Per-asset type status (none/partial/complete) |

**AssetCounts Interface:**
```typescript
interface AssetCounts {
  poster: number;
  fanart: number;
  landscape: number;
  keyart: number;
  banner: number;
  clearart: number;
  clearlogo: number;
  discart: number;
  trailer: number;
  subtitle: number;
  theme: number;
  actor: number; // Actor headshot count
}
```

**AssetStatuses Interface:**
```typescript
type AssetStatus = 'none' | 'partial' | 'complete';

interface AssetStatuses {
  nfo: AssetStatus;
  poster: AssetStatus;
  fanart: AssetStatus;
  landscape: AssetStatus;
  keyart: AssetStatus;
  banner: AssetStatus;
  clearart: AssetStatus;
  clearlogo: AssetStatus;
  discart: AssetStatus;
  trailer: AssetStatus;
  subtitle: AssetStatus;
  theme: AssetStatus;
}
```

---

### Tier 2: MovieDetail

**Purpose**: Complete entity data for editing and detailed inspection

**Use Cases:**
- MovieEdit page (`/metadata/movies/:id/edit`)
- Detailed metadata forms
- Asset management interfaces
- Publishing workflows

**Fields** (~50+ fields, organized by category):

#### System Fields (Read-Only)
| Field | Type | Description |
|-------|------|-------------|
| `id` | `number` | Primary key |
| `library_id` | `number` | Foreign key to library |
| `created_at` | `string` | ISO timestamp |
| `updated_at` | `string` | ISO timestamp |
| `date_added` | `string` | ISO timestamp (when file discovered) |
| `last_scraped_at` | `string \| null` | Last metadata fetch timestamp |
| `enrichment_status` | `'unidentified' \| 'identified' \| 'enriched'` | Workflow state |

#### Metadata Fields (User-Editable)
| Field | Type | Description |
|-------|------|-------------|
| `title` | `string` | Movie title |
| `original_title` | `string \| null` | Original language title |
| `sort_title` | `string \| null` | Custom sort order (e.g., "Matrix, The") |
| `year` | `number \| null` | Release year |
| `plot` | `string \| null` | Full synopsis |
| `outline` | `string \| null` | Short plot summary |
| `tagline` | `string \| null` | Marketing tagline |
| `runtime` | `number \| null` | Runtime in minutes |
| `rating` | `number \| null` | Provider rating (0-10) |
| `votes` | `number \| null` | Number of votes for rating |
| `user_rating` | `number \| null` | User's personal rating (0-10) |
| `mpaa_rating` | `string \| null` | MPAA rating (G, PG, PG-13, R, NC-17) |
| `premiered` | `string \| null` | Premiere date (ISO format) |

#### Provider IDs
| Field | Type | Description |
|-------|------|-------------|
| `imdb_id` | `string \| null` | IMDB ID (tt1234567) |
| `tmdb_id` | `number \| null` | TMDB numeric ID |
| `tvdb_id` | `number \| null` | TVDB numeric ID (rare for movies) |

#### File References
| Field | Type | Description |
|-------|------|-------------|
| `file_path` | `string` | Absolute path to video file |
| `nfo_path` | `string \| null` | Absolute path to NFO file |

#### Asset References (Foreign Keys)
| Field | Type | Description |
|-------|------|-------------|
| `poster_id` | `number \| null` | Selected poster image ID |
| `fanart_id` | `number \| null` | Selected fanart image ID |
| `landscape_id` | `number \| null` | Selected landscape image ID |
| `keyart_id` | `number \| null` | Selected keyart image ID |
| `banner_id` | `number \| null` | Selected banner image ID |
| `clearart_id` | `number \| null` | Selected clearart image ID |
| `clearlogo_id` | `number \| null` | Selected clearlogo image ID |
| `discart_id` | `number \| null` | Selected discart image ID |

#### Lock Fields (Boolean Flags)
| Field | Type | Description |
|-------|------|-------------|
| `title_locked` | `boolean` | Prevent automation from updating title |
| `plot_locked` | `boolean` | Prevent automation from updating plot |
| `runtime_locked` | `boolean` | Prevent automation from updating runtime |
| `rating_locked` | `boolean` | Prevent automation from updating rating |
| `poster_locked` | `boolean` | Prevent automation from changing poster |
| `fanart_locked` | `boolean` | Prevent automation from changing fanart |
| *(etc.)* | `boolean` | One lock field per editable metadata/asset field |

#### State Flags
| Field | Type | Description |
|-------|------|-------------|
| `monitored` | `boolean` | User monitoring flag (automation control) |
| `published_nfo_hash` | `string \| null` | Hash of last published NFO (null = never published) |

#### Related Data (Many-to-Many, included via `?include=` parameter)
| Field | Type | Description |
|-------|------|-------------|
| `genres` | `Genre[]` | Array of genre objects |
| `studios` | `Studio[]` | Array of studio objects |
| `countries` | `Country[]` | Array of country objects |
| `tags` | `Tag[]` | Array of user-defined tag objects |
| `actors` | `MoviePerson[]` | Array of actor objects with character names |
| `directors` | `MoviePerson[]` | Array of director objects |
| `writers` | `MoviePerson[]` | Array of writer objects |
| `producers` | `MoviePerson[]` | Array of producer objects |

**Related Object Interfaces:**
```typescript
interface Genre {
  id: number;
  name: string;
}

interface Studio {
  id: number;
  name: string;
}

interface Country {
  id: number;
  name: string; // "United States of America"
  code: string; // "US" (ISO 3166-1 alpha-2)
}

interface Tag {
  id: number;
  name: string;
}

interface MoviePerson {
  id: number;
  person_id: number;
  name: string; // Denormalized for convenience
  role: 'actor' | 'director' | 'writer' | 'producer';
  character_name: string | null; // Only for actors
  sort_order: number | null; // Display order
  tmdb_id: number | null;
  imdb_id: string | null;
}
```

---

### Tier 3: MovieMetadataForm

**Purpose**: Form-specific state management for metadata editing

**Use Cases:**
- MetadataTab form component
- Validation logic
- Dirty state tracking (form-level, not database-level)
- Submit/reset operations

**Fields** (editable metadata only, ~25 fields):

| Category | Field | Type | Description |
|----------|-------|------|-------------|
| **Basic** | `title` | `string` | Movie title |
| | `original_title` | `string` | Original language title |
| | `sort_title` | `string` | Custom sort order |
| | `year` | `number \| null` | Release year |
| **Plot** | `plot` | `string` | Full synopsis |
| | `outline` | `string` | Short summary |
| | `tagline` | `string` | Marketing tagline |
| **Details** | `runtime` | `number \| null` | Runtime in minutes |
| | `rating` | `number \| null` | Provider rating (0-10) |
| | `votes` | `number \| null` | Number of votes |
| | `user_rating` | `number \| null` | User's personal rating (0-10) |
| | `mpaa_rating` | `string \| null` | MPAA rating |
| | `premiered` | `string \| null` | Premiere date (ISO) |
| **IDs** | `imdb_id` | `string` | IMDB ID |
| | `tmdb_id` | `number \| null` | TMDB numeric ID |
| **Arrays** | `genres` | `number[]` | Array of genre IDs |
| | `studios` | `number[]` | Array of studio IDs |
| | `countries` | `number[]` | Array of country IDs |
| | `tags` | `number[]` | Array of tag IDs |
| | `actors` | `PersonFormData[]` | Actor data with character names |
| | `directors` | `number[]` | Director person IDs |
| | `writers` | `number[]` | Writer person IDs |
| | `producers` | `number[]` | Producer person IDs |

**PersonFormData Interface** (for actors):
```typescript
interface PersonFormData {
  person_id: number; // Existing person or newly created
  character_name: string | null;
  sort_order: number;
}
```

**Form Behavior:**
- Initialized from `MovieDetail` data
- Tracks dirty state independently from backend
- Validates before submission
- Converts to API-compatible format on submit
- No lock fields (locks managed separately via FieldLockToggle component)

---

## Backend Integration

### API Endpoints

#### Get Movie List
```
GET /api/movies
Query Params: ?page=1&limit=50&sort=title&order=asc

Response: {
  movies: MovieListItem[],
  total: number,
  page: number,
  limit: number
}
```

**Data Returned**: MovieListItem objects with asset counts/statuses calculated by backend

---

#### Get Movie Detail
```
GET /api/movies/:id
Query Params: ?include=genres,studios,countries,tags,actors,directors,writers,producers

Response: MovieDetail (single object)
```

**Data Returned**: Full MovieDetail with related data based on `include` parameter

**Include Parameter Options:**
- `genres` - Include `genres[]` array
- `studios` - Include `studios[]` array
- `countries` - Include `countries[]` array
- `tags` - Include `tags[]` array
- `actors` - Include `actors[]` array (MoviePerson objects with role='actor')
- `directors` - Include `directors[]` array (MoviePerson objects with role='director')
- `writers` - Include `writers[]` array (MoviePerson objects with role='writer')
- `producers` - Include `producers[]` array (MoviePerson objects with role='producer')
- `files` - Include all file paths (cache, library, NFO)

**Common Patterns:**
```typescript
// Minimal detail (no related data)
GET /api/movies/123

// Full detail for editing
GET /api/movies/123?include=genres,studios,countries,tags,actors,directors,writers,producers,files

// Specific relationships only
GET /api/movies/123?include=genres,actors
```

---

#### Update Movie Metadata
```
PUT /api/movies/:id
Content-Type: application/json

Body: Partial<MovieMetadataForm>
```

**Request Example:**
```json
{
  "title": "The Matrix",
  "year": 1999,
  "plot": "Updated plot text",
  "genres": [878, 28, 53], // Genre IDs
  "actors": [
    {
      "person_id": 6384,
      "character_name": "Neo",
      "sort_order": 0
    }
  ]
}
```

**Response**: Updated MovieDetail object

---

## Field Categories

### System Fields (Read-Only)
Generated by backend, never editable by user:
- `id`, `library_id`, `created_at`, `updated_at`, `date_added`, `last_scraped_at`
- `enrichment_status` (controlled by backend workflows)
- `published_nfo_hash` (set by backend when NFO is published to library)

### Metadata Fields (User-Editable)
Core metadata that users can edit and lock:
- Text: `title`, `original_title`, `sort_title`, `plot`, `outline`, `tagline`
- Numbers: `year`, `runtime`, `rating`, `votes`, `user_rating`
- Dates: `premiered`
- Enums: `mpaa_rating`

### Asset References (Foreign Keys)
Point to selected assets, lockable:
- `poster_id`, `fanart_id`, `landscape_id`, `keyart_id`
- `banner_id`, `clearart_id`, `clearlogo_id`, `discart_id`

### Lock Fields (Boolean Flags)
Control automation behavior:
- One per editable metadata field: `title_locked`, `plot_locked`, etc.
- One per asset reference: `poster_locked`, `fanart_locked`, etc.
- **Note**: Lock fields are managed separately via `POST /api/movies/:id/lock-field` and `POST /api/movies/:id/unlock-field` endpoints, not included in PUT requests

### Related Data (Many-to-Many)
Junction table relationships, loaded via `?include=` parameter:
- `genres[]`, `studios[]`, `countries[]`, `tags[]`
- `actors[]`, `directors[]`, `writers[]`, `producers[]`

---

## Type Usage Examples

### Movies List Page
```typescript
import { MovieListItem } from '@/types/movie';
import { useMovies } from '@/hooks/useMovies';

const MoviesPage: React.FC = () => {
  const { data, isLoading } = useMovies({ page: 1, limit: 50 });

  // data.movies is MovieListItem[]
  return (
    <MovieTableView
      movies={data?.movies || []}
      onMovieClick={(movie: MovieListItem) => {
        navigate(`/metadata/movies/${movie.id}/edit`);
      }}
    />
  );
};
```

### Movie Edit Page
```typescript
import { MovieDetail } from '@/types/movie';
import { useMovie } from '@/hooks/useMovie';

const MovieEditPage: React.FC = () => {
  const { id } = useParams();

  // Load full detail with all relationships
  const { data: movie, isLoading } = useMovie(id, {
    include: ['genres', 'studios', 'countries', 'tags', 'actors', 'directors', 'writers', 'producers', 'files']
  });

  // movie is MovieDetail
  return (
    <MovieEditForm movie={movie} />
  );
};
```

### Metadata Form Component
```typescript
import { MovieDetail, MovieMetadataForm } from '@/types/movie';

const MetadataTab: React.FC<{ movie: MovieDetail }> = ({ movie }) => {
  const [formData, setFormData] = useState<MovieMetadataForm>({
    title: movie.title,
    year: movie.year,
    plot: movie.plot,
    genres: movie.genres?.map(g => g.id) || [],
    actors: movie.actors?.map(a => ({
      person_id: a.person_id,
      character_name: a.character_name,
      sort_order: a.sort_order || 0,
    })) || [],
    // ... other fields
  });

  const handleSubmit = async () => {
    await updateMovie(movie.id, formData);
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
    </form>
  );
};
```

---

## Design Rationale

### Why Three Tiers?

1. **Performance**: List views load 50+ movies simultaneously. Loading full details for each would be wasteful.
2. **Clarity**: Type name indicates data depth (`MovieListItem` vs `MovieDetail`)
3. **Backend Alignment**: Types mirror API endpoint responses
4. **Separation of Concerns**: Form state (`MovieMetadataForm`) separate from entity data (`MovieDetail`)

### Why Not Two Tiers?

Early designs considered combining `MovieDetail` and `MovieMetadataForm`, but:
- Form state management differs from entity representation
- Validation logic needs different structure
- Form arrays use IDs, entity arrays use full objects
- Lock management happens separately from metadata updates

### Migration Path

Existing `Movie` type in `/public/frontend/src/types/movie.ts` will be deprecated:
1. Rename `Movie` to `MovieListItem` (already matches structure)
2. Add `MovieDetail` and `MovieMetadataForm` to same file
3. Update imports across codebase
4. Remove deprecated type after migration complete

---

## See Also

- **[DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)** - Backend table structure and field definitions
- **[API_ARCHITECTURE.md](API_ARCHITECTURE.md)** - REST API endpoint specifications
- **[FRONTEND_COMPONENTS.md](FRONTEND_COMPONENTS.md)** - Component library and usage patterns
- **[UI_PATTERNS.md](UI_PATTERNS.md)** - Common UI patterns and interaction designs
