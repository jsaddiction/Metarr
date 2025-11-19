# Hook File Consolidation Analysis

**Date**: 2025-01-24
**Purpose**: Identify fragmented hooks and consolidation opportunities

---

## Current Hook Files (21 files)

### By Domain Classification

#### ✅ Properly Consolidated (Single file per domain)

| File | Domain | Contains | Status |
|------|--------|----------|--------|
| `useMovies.ts` | Movie | CRUD + mutations | ✅ Good |
| `useProviders.ts` | Provider | CRUD + test connection | ✅ Good |
| `useRecycleBin.ts` | Recycle Bin | CRUD + cleanup | ✅ Good |
| `useActors.ts` | Actor | Actor operations | ✅ Good |
| `useAssetCandidates.ts` | Asset | Candidates CRUD | ✅ Good |

---

#### ⚠️ Fragmented Domains (Multiple files for same domain)

**Media Player Domain** (2 files):
- `usePlayers.ts` - CRUD + usePlayerStatus()
- `useMediaPlayerStatus.ts` - Real-time status (WebSocket)

**Issue**: Duplicate concern - both handle player status
**Action**: Need to investigate which is canonical

---

**Library Domain** (2 files):
- `useLibraryScans.ts` - CRUD + useActiveScans()
- `useLibraryScanProgress.ts` - Scan progress (WebSocket)

**Issue**: Related but separate concerns
**Decision Needed**: Keep separate or merge?

---

**Job Domain** (3 files):
- `useJobs.ts` - Job queries
- `useJobHistory.ts` - Job history
- `useTriggerJob.ts` - Trigger job mutation

**Issue**: Fragmented job operations
**Action**: Consolidate into `useJobs.ts`

---

**Movie-Related Fragments** (4 files):
- `useMovies.ts` (189 lines) - Core CRUD ❌ Uses raw fetch
- `useMovieAssets.ts` (502 lines) - Movie asset operations
- `useToggleMonitored.ts` (106 lines) - Toggle monitored ❌ Uses raw fetch
- `useLockField.ts` (192 lines) - Field locking ❌ Uses raw fetch

**Issue**: Movie operations scattered + API layer violations
**Decision**:
- Consolidate `useToggleMonitored.ts` and `useLockField.ts` into `useMovies.ts` (298 lines added → 487 total)
- Keep `useMovieAssets.ts` separate (too large at 502 lines)
- **Critical**: All movie hooks use raw `fetch` instead of `movieApi`

---

#### 🤔 Utility/Cross-Cutting Hooks (Not domain-specific)

| File | Purpose | Keep Separate? |
|------|---------|----------------|
| `useAutoSelection.ts` | Auto-selection strategy | ✅ Settings/config |
| `usePriorities.ts` | Provider priorities | ✅ Settings/config |
| `useWorkflowSettings.ts` | Workflow config | ✅ Settings/config |
| `useSystemStatus.ts` | System status | ✅ System |
| `useBackendConnection.ts` | Connection monitoring | ✅ Infrastructure |
| `useConnectionMonitor.ts` | Connection monitoring | ⚠️ Duplicate of above? |

---

## Detailed Analysis

### 1. Media Player Duplication

**Current State**:
```
usePlayers.ts (171 lines):
  - usePlayers()
  - usePlayer(id)
  - usePlayerStatus()      ← Query-based
  - useCreatePlayer()
  - useUpdatePlayer()
  - useDeletePlayer()
  - useTestConnection()
  - useTestConnectionUnsaved()
  - useConnectPlayer()
  - useDisconnectPlayer()

useMediaPlayerStatus.ts (38 lines):
  - useMediaPlayerStatus()  ← WebSocket-based, different implementation
```

**Analysis**:
- `usePlayers.ts` line 43-51: Has `usePlayerStatus()` using TanStack Query
- `useMediaPlayerStatus.ts`: Has different `useMediaPlayerStatus()` using raw WebSocket

**Question**: Which one is actually used in components?

**Action**:
1. Search codebase for usage
2. Determine canonical implementation
3. Remove duplicate or merge approaches

---

### 2. Library Scan Split

**Current State**:
```
useLibraryScans.ts:
  - useLibraries()
  - useLibrary(id)
  - useActiveScans()       ← WebSocket scans
  - useCreateLibrary()
  - useUpdateLibrary()
  - useDeleteLibrary()
  - useStartLibraryScan()
  - useCancelLibraryScan()
  - useValidatePath()
  - useBrowsePath()
  - useDrives()

useLibraryScanProgress.ts:
  - useLibraryScanProgress(libraryId)  ← WebSocket progress for specific library
  - JobProgress interface
```

**Analysis**:
- `useLibraryScans.ts`: Has general active scans
- `useLibraryScanProgress.ts`: Has per-library progress details

**These are complementary, not duplicate!**

**Recommendation**:
- ✅ **Keep separate** - Different granularity
- OR merge into `useLibraryScans.ts` as additional export

---

### 3. Job Domain Fragmentation

**Need to check**:
- `useJobs.ts` - What's in it?
- `useJobHistory.ts` - What's in it?
- `useTriggerJob.ts` - What's in it?

**Expected consolidation**:
```typescript
// useJobs.ts (consolidated)
export const useJobs = () => { /* active jobs */ }
export const useJob = (id) => { /* single job */ }
export const useJobHistory = () => { /* history */ }
export const useTriggerJob = () => { /* trigger mutation */ }
export const useCancelJob = () => { /* cancel mutation */ }
```

---

### 4. Movie Domain Extensions

**Current State**:
```
useMovies.ts (190 lines):
  - useMovies()
  - useMovie(id, include?)
  - useUpdateMovie()
  - useDeleteMovie()

useMovieAssets.ts (?? lines):
  - Movie asset operations

useToggleMonitored.ts (~80 lines):
  - useToggleMonitored()  ← Movie-specific mutation

useLockField.ts (?? lines):
  - useToggleLockField()  ← Movie-specific mutation
```

**Analysis**:
- `useToggleMonitored` - Should be in `useMovies.ts`
- `useLockField` - Could be generic (works for any entity?)
- `useMovieAssets` - Movie-specific, could merge or keep separate

**Questions**:
1. Is `useLockField` generic or movie-only?
2. How large is `useMovieAssets`?
3. Would consolidation make `useMovies.ts` too large (>500 lines)?

---

### 5. Connection Monitoring Duplication?

**Files**:
- `useBackendConnection.ts`
- `useConnectionMonitor.ts`

**Need to check**: Are these duplicates or different concerns?

---

## Consolidation Strategy

### Priority 1: Remove Duplicates
- [ ] Investigate `usePlayerStatus` vs `useMediaPlayerStatus`
- [ ] Investigate `useBackendConnection` vs `useConnectionMonitor`
- [ ] Remove or merge duplicate implementations

### Priority 2: Consolidate Related Operations
- [ ] Merge Job hooks into `useJobs.ts`
- [ ] Evaluate moving `useToggleMonitored` into `useMovies.ts`
- [ ] Decide on `useLockField` - generic utility or movie-specific?

### Priority 3: Evaluate Size Trade-offs
- [ ] Check file sizes after consolidation
- [ ] If `useMovies.ts` > 500 lines, consider keeping some separate
- [ ] Balance between "one file per domain" and "file not too large"

---

## Standards Alignment

**From HOOKS_LAYER.md**:
> **One File Per Domain**: `useMovies.ts`, `usePlayers.ts`, etc.

**Current Compliance**:
| Domain | Files | Compliant? |
|--------|-------|------------|
| Movie | 4 files | ❌ Fragmented |
| Player | 2 files | ❌ Fragmented |
| Library | 2 files | ⚠️ Borderline |
| Job | 3 files | ❌ Fragmented |
| Provider | 1 file | ✅ Good |
| Asset | 1 file | ✅ Good |

---

## Next Steps

1. **Usage Analysis**: Search codebase for which hooks are actually used
2. **Size Check**: Measure file sizes to evaluate consolidation impact
3. **Merge Plan**: Create specific merge plan for each fragmented domain
4. **Test**: Ensure TypeScript compilation after consolidation
5. **Update Imports**: Update all consuming components

---

## Questions to Answer

1. Which `usePlayerStatus` is canonical?
2. Is `useLockField` movie-specific or generic?
3. Should library scan progress stay separate?
4. What's the size threshold before splitting a hook file?
5. Are there any other duplicates I haven't identified?

