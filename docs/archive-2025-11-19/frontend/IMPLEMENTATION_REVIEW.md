# Frontend Implementation Review

**Purpose**: Audit current frontend code against established standards.

**Created**: 2025-01-24

---

## Review Categories

### 1. File Organization
### 2. Type System Compliance
### 3. Component Architecture
### 4. Error Handling
### 5. Hooks Layer Patterns
### 6. API Layer Patterns

---

## 1. File Organization

### Current Structure Analysis

**✅ Correctly Organized**:
```
components/
├── ui/                    # ✅ UI primitives (shadcn/ui components)
├── layout/                # ✅ App structure (Layout, Header)
├── movie/                 # ✅ Domain-specific (MovieCard, MovieTableView)
├── library/               # ✅ Domain-specific
├── mediaPlayer/           # ✅ Domain-specific
├── provider/              # ✅ Domain-specific
└── dashboard/             # ✅ Domain-specific
```

**⚠️ Issues Found**:

1. **`components/ui/MovieCard.tsx`** - Domain component in ui/
   - **Location**: `components/ui/MovieCard.tsx`
   - **Should be**: `components/movie/MovieCard.tsx`
   - **Reason**: Contains movie domain knowledge
   - **Action**: Move to `components/movie/`

2. **`components/ui/TestButton.tsx`** - Test component in production
   - **Location**: `components/ui/TestButton.tsx`
   - **Should be**: Remove or move to dev utilities
   - **Reason**: Not production UI primitive
   - **Action**: Remove from production build

3. **`components/common/SaveBar.tsx`** - Unclear namespace
   - **Location**: `components/common/`
   - **Should be**: `components/ui/` or specific domain
   - **Reason**: "common" is not in standards
   - **Action**: Evaluate if truly reusable (→ ui/) or domain-specific

4. **`components/asset/`** - Asset is a domain
   - **Current**: Correct location
   - **Note**: Ensure no asset-specific components in `ui/`

**Standard**: [COMPONENTS.md § File Organization](./COMPONENTS.md#file-organization)

---

## 2. Type System Compliance

### Naming Patterns Check

**Files to Review**:
```
types/
├── metadata.ts
├── mediaPlayer.ts
├── websocket.ts
├── provider.ts
├── library.ts
└── movie.ts (if exists)
```

**⚠️ Issues to Check**:

1. **Entity vs FormData Pattern**
   - Check if each domain has:
     - `Entity` (e.g., `Movie`, `MediaPlayer`)
     - `EntityFormData` (e.g., `MovieFormData`)
     - `EntityFilters` (if list endpoint has filters)

2. **Response Wrapper Naming**
   - Check for `EntityResponse` vs `EntityListResponse`
   - Verify unwrapping happens at API layer

3. **Nullable vs Optional**
   - Backend nulls: `field: string | null`
   - Optional props: `field?: string`

**Action Items**:
- [ ] Read each type file
- [ ] Verify naming follows `Entity`, `EntityFormData`, `EntityFilters` pattern
- [ ] Check for `any` usage (should be zero)
- [ ] Verify interface vs type usage (prefer interface for objects)

**Standard**: [TYPES.md § Type Naming Patterns](./TYPES.md#type-naming-patterns)

---

## 3. Component Architecture

### Atomic Design Compliance

**Need to Audit**:

1. **`components/ui/` Components** (Atoms)
   - Should have NO domain hooks
   - Should accept data via props only
   - Examples to check:
     - `MovieCard.tsx` - Already identified as violation
     - `BookmarkToggle.tsx` - Check if domain-agnostic
     - `LockIcon.tsx` - Check if truly reusable

2. **Domain Components** (Molecules/Organisms)
   - Can use domain hooks
   - Should be in `components/[domain]/`
   - Examples:
     - `components/movie/MovieTableView.tsx` - ✅
     - `components/library/LibraryCard.tsx` - ✅

3. **Page Components** (Templates)
   - Should be composition roots
   - No business logic (delegate to hooks)
   - Examples to review:
     - `pages/Dashboard.tsx`
     - `pages/metadata/MovieEdit.tsx`

**Action Items**:
- [ ] Review `components/ui/` for domain knowledge violations
- [ ] Verify domain components use appropriate hooks
- [ ] Check page components for excessive logic (>200 lines)
- [ ] Identify components that need extraction

**Standard**: [COMPONENTS.md § Component Hierarchy](./COMPONENTS.md#component-hierarchy-atomic-design)

---

## 4. Error Handling

### Three Error Types Compliance

**Need to Audit**:

1. **Error Boundaries**
   - [ ] Check if `ErrorBoundary` component exists
   - [ ] Verify it's wrapping app or critical sections
   - [ ] Confirm it catches render errors

2. **Query Error Handling** (Component Level)
   - Examples to check:
     - `pages/Dashboard.tsx` - Does it handle query errors in UI?
     - `pages/metadata/MovieEdit.tsx` - Error states shown?
   - **Should NOT**: Show toasts for query errors
   - **Should**: Render error UI in component

3. **Mutation Error Handling** (Hook Level)
   - Check hooks files for:
     - `onError: (error) => showErrorToast(error, 'Context')`
     - `onSuccess: () => showSuccessToast('Message')`
   - **Should**: All mutations show toasts

**Current Files**:
- `components/ui/ErrorBanner.tsx` - ✅ Exists
- Need to verify usage throughout codebase

**Action Items**:
- [ ] Search for error boundaries in `App.tsx` or `main.tsx`
- [ ] Audit query hooks for incorrect toast usage
- [ ] Verify mutation hooks show appropriate feedback
- [ ] Check if `utils/errorHandling.ts` helpers are used consistently

**Standard**: [ERROR_HANDLING.md § Three Error Types](./ERROR_HANDLING.md#three-error-types)

---

## 5. Hooks Layer Patterns

### TanStack Query Compliance

**Need to Audit**:

1. **Hook File Organization**
   - One file per domain pattern:
     - `useMovies.ts` ✅
     - `usePlayers.ts` - Check if exists (likely `useMediaPlayerStatus.ts`)
     - `useLibraries.ts` - Check if exists

2. **Query Patterns**
   - Check for:
     - Correct generics: `useQuery<Type[], Error>`
     - Query key hierarchies: `['movies']`, `['movie', id]`
     - `enabled` option for conditional queries
     - `retry` and `staleTime` configuration

3. **Mutation Patterns**
   - Check for:
     - Query invalidation in `onSuccess`
     - Toast notifications in mutations
     - Optimistic updates where appropriate

4. **Current Hooks to Review**:
   - `useAutoSelection.ts`
   - `usePriorities.ts`
   - `useConnectionMonitor.ts`
   - `useBackendConnection.ts`
   - `useLibraryScanProgress.ts`
   - `useMediaPlayerStatus.ts`

**Action Items**:
- [ ] Audit each hook file for naming (should be `use[Domain].ts`)
- [ ] Verify query key patterns
- [ ] Check mutation feedback (toasts)
- [ ] Identify hooks that need refactoring

**Standard**: [HOOKS_LAYER.md § Standard Pattern](./HOOKS_LAYER.md#standard-pattern)

---

## 6. API Layer Patterns

### fetchApi Usage Compliance

**Need to Audit**:

1. **Check `utils/api.ts`**
   - Verify all API modules use `fetchApi`
   - Check for any `axios` imports (should be none)
   - Verify response unwrapping at API layer

2. **API Module Structure**
   - Each domain should have:
     ```typescript
     export const domainApi = {
       getAll: () => fetchApi<Type[]>('/path'),
       getById: (id) => fetchApi<Type>(`/path/${id}`),
       create: (data) => fetchApi<Type>('/path', { method: 'POST', ... }),
       update: (id, updates) => fetchApi<Type>(`/path/${id}`, { method: 'PUT', ... }),
       delete: (id) => fetchApi<void>(`/path/${id}`, { method: 'DELETE' }),
     };
     ```

3. **Known Issue**: `useAssetCandidates.ts` uses axios
   - **File**: `hooks/useAssetCandidates.ts`
   - **Issue**: Direct axios usage instead of API module
   - **Action**: Refactor to use `assetApi` from `utils/api.ts`

**Action Items**:
- [ ] Read `utils/api.ts` to understand current structure
- [ ] Verify no `axios` imports in hooks
- [ ] Check if all API calls go through `utils/api.ts`
- [ ] Identify missing API modules

**Standard**: [API_LAYER.md § Standard Pattern](./API_LAYER.md#standard-pattern)

---

## Review Checklist

### Phase 1: Quick Wins (File Organization)
- [ ] Move `components/ui/MovieCard.tsx` → `components/movie/MovieCard.tsx`
- [ ] Remove `components/ui/TestButton.tsx` or move to dev
- [ ] Resolve `components/common/` directory (rename to `ui/` or move to domains)
- [ ] Verify no other domain components in `ui/`

### Phase 2: Type System
- [ ] Read and audit all `types/*.ts` files
- [ ] Create standardized naming document for team
- [ ] Identify and fix `any` usage
- [ ] Standardize `interface` vs `type` usage

### Phase 3: Error Handling
- [ ] Verify Error Boundary exists and is used
- [ ] Audit query error handling (remove toasts if present)
- [ ] Audit mutation error handling (add toasts if missing)
- [ ] Standardize error feedback patterns

### Phase 4: Hooks Refactoring
- [ ] Audit all hook files for naming conventions
- [ ] Verify query key hierarchies
- [ ] Check mutation feedback patterns
- [ ] Refactor `useAssetCandidates.ts` to remove axios

### Phase 5: API Layer
- [ ] Map all backend endpoints to API modules
- [ ] Verify fetchApi usage (no axios)
- [ ] Check response unwrapping location
- [ ] Create missing API modules

---

## Priority Matrix

| Priority | Category | Impact | Effort |
|----------|----------|--------|--------|
| P0 | axios in hooks | High | Low |
| P0 | Error boundaries | High | Low |
| P1 | File organization | Medium | Low |
| P1 | Type naming | Medium | Medium |
| P2 | Query error toasts | Low | Low |
| P2 | Hook file naming | Low | Medium |
| P3 | Component extraction | Low | High |

---

## Next Steps

1. **Create detailed findings document** after auditing files
2. **Prioritize refactoring tasks** based on impact/effort
3. **Create pull requests** for each category
4. **Update implementation** to match standards
5. **Document patterns** for future development

---

## Related Documentation

- [Components](./COMPONENTS.md) - File organization standards
- [Types](./TYPES.md) - Type naming conventions
- [Hooks](./HOOKS_LAYER.md) - TanStack Query patterns
- [API](./API_LAYER.md) - fetchApi usage
- [Error Handling](./ERROR_HANDLING.md) - Error strategy
