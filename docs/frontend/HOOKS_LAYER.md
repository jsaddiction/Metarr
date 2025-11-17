# Hooks Layer

**Purpose**: Server state management using TanStack Query.

**File**: `public/frontend/src/hooks/use[Domain].ts`

---

## Principles

1. **One File Per Domain**: `useMovies.ts`, `usePlayers.ts`, etc.
2. **TanStack Query Only**: All server state via `useQuery`/`useMutation`
3. **Cache Invalidation**: Surgical updates on mutations
4. **User Feedback**: Toasts for mutations, not queries

---

## Standard Pattern

### Queries (Read Operations)
```typescript
export const useEntities = (filters?) => {
  return useQuery<Entity[], Error>({
    queryKey: filters ? ['entities', filters] : ['entities'],
    queryFn: () => entityApi.getAll(filters),
    retry: 1,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useEntity = (id: number | null) => {
  return useQuery<Entity, Error>({
    queryKey: ['entity', id],
    queryFn: () => {
      if (!id) throw new Error('ID required');
      return entityApi.getById(id);
    },
    enabled: !!id, // Don't run if no ID
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });
};
```

### Mutations (Write Operations)
```typescript
export const useCreateEntity = () => {
  const queryClient = useQueryClient();

  return useMutation<Entity, Error, FormData>({
    mutationFn: (data) => entityApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entities'] });
      showSuccessToast('Entity created');
    },
    onError: (error) => showErrorToast(error, 'Create entity'),
  });
};

export const useUpdateEntity = () => {
  const queryClient = useQueryClient();

  return useMutation<Entity, Error, { id: number; updates: Partial<FormData> }>({
    mutationFn: ({ id, updates }) => entityApi.update(id, updates),
    onSuccess: (data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['entities'] });
      queryClient.invalidateQueries({ queryKey: ['entity', id] });
      showSuccessToast('Entity updated');
    },
    onError: (error) => showErrorToast(error, 'Update entity'),
  });
};

export const useDeleteEntity = () => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, number>({
    mutationFn: (id) => entityApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entities'] });
      showSuccessToast('Entity deleted');
    },
    onError: (error) => showErrorToast(error, 'Delete entity'),
  });
};
```

---

## Query Keys

**Hierarchical structure** for surgical cache invalidation:

```typescript
['entities']                    // All entities
['entities', { filter }]        // Filtered list
['entity', 123]                 // Single entity
['entity', 123, 'related']      // Related data
```

**Invalidation examples**:
```typescript
// Invalidate all entity queries
queryClient.invalidateQueries({ queryKey: ['entities'] });

// Invalidate specific entity
queryClient.invalidateQueries({ queryKey: ['entity', id] });

// Remove specific query
queryClient.removeQueries({ queryKey: ['entity', id] });
```

---

## Rules

### useQuery
- Generic types: `useQuery<ReturnType, Error>`
- Include all parameters in `queryKey`
- Use `enabled` for conditional execution
- Configure `retry` (usually 1) and `staleTime` (usually 5 min)
- **Never show toasts** - let component handle errors

### useMutation
- Generic types: `useMutation<ReturnType, Error, VariablesType>`
- Always invalidate related queries in `onSuccess`
- Always show success toast in `onSuccess`
- Always show error toast in `onError`
- Use helpers: `showSuccessToast()`, `showErrorToast()`

### Cache Invalidation Strategy
| Operation | Invalidate |
|-----------|------------|
| Create | List query (`['entities']`) |
| Update | List + single (`['entities']`, `['entity', id]`) |
| Delete | List query (remove single if needed) |
| Cascade | All affected queries |

---

## Implemented Hooks

### usePhaseConfig
**File**: `public/frontend/src/hooks/usePhaseConfig.ts`
**Purpose**: Manage workflow phase behavior configuration (enrichment, publishing, general settings)

```typescript
export function usePhaseConfig() {
  const queryClient = useQueryClient();

  // Fetch phase configuration
  const { data: config, isLoading: loading, error } = useQuery({
    queryKey: ['phaseConfig'],
    queryFn: () => phaseConfigApi.getAll(),
  });

  // Update configuration mutation
  const updateMutation = useMutation({
    mutationFn: (updates: Record<string, any>) => phaseConfigApi.update(updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phaseConfig'] });
      toast.success('Configuration updated');
    },
  });

  // Reset to defaults mutation
  const resetMutation = useMutation({
    mutationFn: () => phaseConfigApi.reset(),
    onSuccess: (data) => {
      queryClient.setQueryData(['phaseConfig'], data);
      toast.success('Configuration reset to defaults');
      return data;
    },
  });

  return {
    config,
    loading,
    error: error?.message,
    saving: updateMutation.isPending || resetMutation.isPending,
    updateConfig: updateMutation.mutateAsync,
    resetToDefaults: resetMutation.mutateAsync,
  };
}
```

**Usage**:
```typescript
const { config, loading, updateConfig } = usePhaseConfig();

// Update enrichment settings
await updateConfig({
  'enrichment.autoSelectAssets': true,
  'general.autoPublish': false
});
```

### useAssetLimits
**File**: `public/frontend/src/hooks/useAssetLimits.ts`
**Purpose**: Manage asset download limits with instant persistence

```typescript
export function useAssetLimits() {
  const queryClient = useQueryClient();

  // Fetch all limits with metadata
  const { data: limits, isLoading, error } = useQuery({
    queryKey: ['assetLimits'],
    queryFn: () => assetLimitsApi.getAllWithMetadata(),
  });

  // Update single limit (instant persistence)
  const updateLimitMutation = useMutation({
    mutationFn: ({ assetType, limit }: { assetType: string; limit: number }) =>
      assetLimitsApi.setLimit(assetType, limit),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['assetLimits'] });
      toast.success(`Updated limit for ${variables.assetType}`);
    },
  });

  return {
    limits: limits || [],
    isLoading,
    error: error?.message,
    updateLimit: updateLimitMutation.mutate,
    isUpdating: updateLimitMutation.isPending,
  };
}
```

**Usage**:
```typescript
const { limits, updateLimit, isUpdating } = useAssetLimits();

// Update poster limit (saves immediately)
updateLimit({ assetType: 'poster', limit: 5 });
```

**Key Features**:
- Instant persistence (no save button required)
- Toast notifications for user feedback
- Automatic cache invalidation
- Includes metadata (min/max allowed, descriptions, media types)

---

## Component Usage

```typescript
// Query hook
const { data, isLoading, error } = useEntities();

if (isLoading) return <Loading />;
if (error) return <Error message={error.message} />;

// Mutation hook
const createMutation = useCreateEntity();

const handleCreate = async (formData) => {
  try {
    await createMutation.mutateAsync(formData);
    // Success toast shown by hook
    navigate('/entities');
  } catch (error) {
    // Error toast shown by hook
    console.error(error);
  }
};

// Check mutation state
<button disabled={createMutation.isPending}>
  {createMutation.isPending ? 'Creating...' : 'Create'}
</button>
```

---

## WebSocket Integration

For real-time updates, combine WebSocket with `useState`:

```typescript
export const useActiveScans = () => {
  const { ws, isConnected } = useWebSocket();
  const [scans, setScans] = useState<Map<number, Scan>>(new Map());

  useEffect(() => {
    if (!ws || !isConnected) return;

    const handler = (msg) => {
      setScans((prev) => {
        const next = new Map(prev);
        next.set(msg.id, msg.data);
        return next;
      });
    };

    ws.on('scanUpdate', handler);
    return () => ws.off('scanUpdate', handler); // Cleanup
  }, [ws, isConnected]);

  return Array.from(scans.values());
};
```

---

## Common Mistakes

| ❌ Wrong | ✅ Correct |
|---------|-----------|
| Call API directly in component | Use hook |
| Show toast in query `onError` | Let component handle |
| Forget to invalidate | Always invalidate on mutation |
| Use `isLoading` for mutation | Use `isPending` |
| Hardcode query keys | Use hierarchical structure |

---

See [Frontend README](./README.md) for architecture overview.
