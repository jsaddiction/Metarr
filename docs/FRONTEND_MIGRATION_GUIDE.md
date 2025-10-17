# Frontend Migration Guide

**Last Updated**: 2025-01-16
**Status**: Active Development - Stage 6 (Polish & Docker)

## Overview

This document guides developers through migrating the Metarr frontend to align with the consolidated backend API and prepare for v1.0 release.

---

## Backend API Changes (Breaking)

### Removed Endpoints

The following endpoints have been removed and consolidated:

1. **GET `/api/movies/:id/files`**
   → Use `GET /api/movies/:id?include=files`
   Returns: `{ ...movie, files: { images: [], videos: [], audio: [], text: [], unknown: [] } }`

2. **GET `/api/movies/:id/images`**
   → Use `GET /api/movies/:id?include=files`
   Access via: `response.files.images`

3. **GET `/api/movies/:id/extras`**
   → Use `GET /api/movies/:id?include=files`
   Access via: `response.files.videos` (trailers), `response.files.audio` (themes)

4. **GET `/api/movies/:id/unknown-files`**
   → Use `GET /api/movies/:id?include=files`
   Access via: `response.files.unknown`

5. **POST `/api/movies/:id/images/recover`**
   → Use `POST /api/movies/:id/rebuild-assets`
   Rebuilds ALL assets (not just images) from cache

6. **GET `/api/movies/:id/images` (duplicate)**
   → Consolidated with #2 above

### New Query Parameter Pattern

**Unified Movie Endpoint:**
```typescript
GET /api/movies/:id?include=files,candidates,locks
```

**Query Parameters:**
- `include` (optional): Comma-separated list of additional data to include
  - `files` - Include all file types (images, videos, audio, text, unknown)
  - `candidates` - Include asset candidates (future)
  - `locks` - Include field lock states (future)

**Examples:**
```typescript
// Lightweight metadata only (movies list)
GET /api/movies/:id

// Full movie data with files (edit page)
GET /api/movies/:id?include=files

// Full data with all includes (future)
GET /api/movies/:id?include=files,candidates,locks
```

### Response Structure

**Without `?include=files`:**
```json
{
  "id": 1,
  "title": "The Matrix",
  "year": 1999,
  "plot": "...",
  "actors": [...],
  "genres": [...],
  "directors": [...],
  "writers": [...],
  "studios": [...]
}
```

**With `?include=files`:**
```json
{
  "id": 1,
  "title": "The Matrix",
  "year": 1999,
  "plot": "...",
  "actors": [...],
  "genres": [...],
  "files": {
    "images": [
      {
        "id": 1,
        "file_type": "poster",
        "file_path": "/movies/The Matrix/The Matrix-poster.jpg",
        "cache_path": "/data/cache/images/1/poster_abc123.jpg",
        "width": 2000,
        "height": 3000,
        "file_size": 512000,
        "is_locked": false
      }
    ],
    "videos": [
      {
        "id": 2,
        "file_type": "trailer",
        "file_path": "/movies/The Matrix/The Matrix-trailer.mp4",
        "duration": 120,
        "resolution": "1920x1080"
      }
    ],
    "audio": [],
    "text": [
      {
        "id": 3,
        "file_type": "subtitle",
        "language": "en",
        "file_path": "/movies/The Matrix/The Matrix.en.srt"
      }
    ],
    "unknown": []
  }
}
```

---

## Frontend Migration Tasks

### Phase 1: Update API Hooks (Priority: HIGH)

#### 1.1 Update `useMovies.ts`

**File**: `public/frontend/src/hooks/useMovies.ts`

**Changes:**
```typescript
// OLD: Single hook for all movie fetching
export const useMovie = (id: number) => {
  return useQuery({
    queryKey: ['movie', id],
    queryFn: () => fetch(`/api/movies/${id}`).then(r => r.json())
  });
};

// NEW: Support include parameter
export const useMovie = (id: number | null, include?: string[]) => {
  return useQuery({
    queryKey: ['movie', id, include],
    queryFn: async () => {
      if (!id) return null;

      const params = new URLSearchParams();
      if (include && include.length > 0) {
        params.set('include', include.join(','));
      }

      const url = `/api/movies/${id}${params.toString() ? `?${params}` : ''}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to fetch movie: ${response.statusText}`);
      }

      return response.json();
    },
    enabled: id !== null
  });
};

// List view - no includes (lightweight)
export const useMovies = (filters?: MovieFilters) => {
  return useQuery({
    queryKey: ['movies', filters],
    queryFn: async () => {
      const params = new URLSearchParams(filters as any);
      const response = await fetch(`/api/movies?${params}`);
      return response.json();
    }
  });
};
```

#### 1.2 Update `useMovieAssets.ts`

**File**: `public/frontend/src/hooks/useMovieAssets.ts`

**Current Issues:**
- Line 85: `fetch('/api/movies/${movieId}/images')` - REMOVED endpoint
- Line 190: `fetch('/api/movies/${movieId}/images/recover')` - REMOVED endpoint

**Changes:**
```typescript
// Remove standalone hooks that use removed endpoints
// Instead, rely on useMovie(id, ['files']) to get all file data

// REMOVE:
export const useMovieImages = (movieId: number) => { ... };
export const useMovieExtras = (movieId: number) => { ... };
export const useUnknownFiles = (movieId: number) => { ... };
export const useRecoverImages = (movieId: number) => { ... };

// KEEP mutations (these endpoints still exist):
export const useAssignUnknownFile = (movieId: number) => { ... };
export const useIgnoreUnknownFile = (movieId: number) => { ... };
export const useDeleteUnknownFile = (movieId: number) => { ... };
export const useUploadMovieImage = (movieId: number) => { ... };

// ADD: Rebuild all assets (replaces recover)
export const useRebuildAssets = (movieId: number) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/movies/${movieId}/rebuild-assets`, {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error('Failed to rebuild assets');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate movie query to refresh all file data
      queryClient.invalidateQueries({ queryKey: ['movie', movieId] });
    }
  });
};
```

#### 1.3 Update Component Data Fetching

**MovieEdit Page** (`public/frontend/src/pages/metadata/MovieEdit.tsx`):

```typescript
// OLD:
const { data: movie } = useMovie(movieId);
const { data: unknownFiles } = useUnknownFiles(movieId);

// NEW:
const { data: movie } = useMovie(movieId, ['files']);
const unknownFiles = movie?.files?.unknown || [];
```

**Movies List Page** (`public/frontend/src/pages/metadata/Movies.tsx`):

```typescript
// Keep lightweight - no include parameter
const { data: movies } = useMovies(filters);
```

### Phase 2: Implement AnimatedTabs Component

#### 2.1 AnimatedTabs Component

**Status**: ✅ COMPLETE

**Files Created:**
- `public/frontend/src/components/ui/AnimatedTabs.tsx` - Radix UI-based animated tabs
- `public/frontend/src/utils/cn.ts` - Class name utility function

**Features:**
- Smooth sliding indicator animation
- Keyboard navigation (Radix UI built-in)
- Badge support for tab labels
- Focus management
- Theme-aware styling

#### 2.2 Update Pages with Tabs

**Status**: 🚧 IN PROGRESS

**Files to Update:**
1. ✅ `public/frontend/src/pages/metadata/MovieEdit.tsx` - COMPLETE
2. ⏳ `public/frontend/src/pages/settings/Providers.tsx` - TODO
3. ⏳ `public/frontend/src/pages/settings/DataSelection.tsx` - TODO

**Migration Pattern:**
```tsx
// OLD: Manual tab implementation
<div className="border-b border-neutral-700">
  <button onClick={() => setActiveTab('tab1')} className={...}>
    Tab 1
  </button>
</div>

{activeTab === 'tab1' && <Content />}

// NEW: AnimatedTabs component
<AnimatedTabs
  value={activeTab}
  onValueChange={setActiveTab}
  tabs={[
    { value: 'tab1', label: 'Tab 1' },
    { value: 'tab2', label: 'Tab 2', badge: <Badge /> }
  ]}
>
  <AnimatedTabsContent value="tab1">
    <Content />
  </AnimatedTabsContent>
</AnimatedTabs>
```

### Phase 3: Stage 6 Polish

#### 3.1 Error States

**TODO:**
- [ ] Error boundaries for all pages
- [ ] Consistent error messages
- [ ] Retry mechanisms for failed requests
- [ ] Network offline detection

#### 3.2 Loading States

**TODO:**
- [ ] Skeleton loaders for tables
- [ ] Spinners for long operations
- [ ] Progress bars for scans/jobs
- [ ] Optimistic updates with rollback

#### 3.3 Empty States

**TODO:**
- [ ] No movies in library
- [ ] No search results
- [ ] No libraries configured
- [ ] No media players configured

#### 3.4 UI Polish

**TODO:**
- [ ] Toast notification improvements
- [ ] Consistent spacing
- [ ] Animation polish
- [ ] Accessibility audit (WCAG AA)

---

## Testing Checklist

### API Integration Tests

- [ ] Movie list fetches without `?include` parameter
- [ ] Movie edit page fetches with `?include=files`
- [ ] Files are properly structured in response
- [ ] Unknown files are accessible via `movie.files.unknown`
- [ ] Rebuild assets mutation works correctly

### Component Tests

- [ ] AnimatedTabs renders all tabs
- [ ] Tab indicator animates smoothly
- [ ] Keyboard navigation works (Arrow keys, Tab, Enter)
- [ ] Focus states are visible
- [ ] Badge rendering works correctly
- [ ] Content fades in/out smoothly

### Visual Tests

- [ ] Tabs look correct in dark mode
- [ ] Tabs look correct in light mode
- [ ] Animation is smooth (no jank)
- [ ] Mobile responsive layout works
- [ ] High DPI displays render correctly

---

## Breaking Changes Summary

### For Frontend Developers

**What Changed:**
1. Movie file data is now fetched via `?include=files` parameter
2. Removed 6 redundant endpoints
3. Introduced AnimatedTabs component for better UX

**What You Need to Do:**
1. Update all `useMovie()` calls in edit pages to include `['files']` parameter
2. Update all data access patterns from separate hooks to `movie.files.*`
3. Replace manual tab implementations with `AnimatedTabs` component
4. Remove imports for removed hooks (`useMovieImages`, `useMovieExtras`, etc.)

**Migration Timeline:**
- Phase 1 (API Hooks): 1-2 days
- Phase 2 (AnimatedTabs): 1 day
- Phase 3 (Polish): 2-3 days

---

## Resources

- **Backend API Docs**: [docs/API_ARCHITECTURE.md](./API_ARCHITECTURE.md)
- **Frontend Components**: [docs/FRONTEND_COMPONENTS.md](./FRONTEND_COMPONENTS.md)
- **Project Roadmap**: [docs/PROJECT_ROADMAP.md](./PROJECT_ROADMAP.md)
- **Design Decisions**: [docs/DESIGN_DECISIONS.md](./DESIGN_DECISIONS.md)

---

**Remember**: Frontend changes are NOT blocking for v1.0. The backend consolidation is complete and functional. Frontend updates improve UX but don't affect core functionality.
