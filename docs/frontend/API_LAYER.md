# API Layer

**Purpose**: Type-safe network interface between frontend and backend.

**File**: `public/frontend/src/utils/api.ts`

---

## Principles

1. **Single Interface**: Use `fetchApi` wrapper exclusively
2. **Domain Modules**: Group endpoints by feature (`movieApi`, `playerApi`)
3. **Type Safety**: Generic types on every call
4. **Unwrap Here**: Extract data from response wrappers at this layer

---

## Standard Pattern

```typescript
export const entityApi = {
  getAll: (filters?) => fetchApi<Entity[]>('/entities?...'),
  getById: (id) => fetchApi<Entity>(`/entities/${id}`),
  create: (data) => fetchApi<Entity>('/entities', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, updates) => fetchApi<Entity>(`/entities/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
  delete: (id) => fetchApi<void>(`/entities/${id}`, { method: 'DELETE' }),
};
```

---

## Rules

### fetchApi Usage
- Endpoint paths start with `/` (e.g., `/movies`)
- Do NOT include `/api` prefix (added automatically)
- Always provide generic type: `fetchApi<Type>()`
- Returns typed Promise

### Query Parameters
Use `URLSearchParams`:
```typescript
const params = new URLSearchParams();
if (filter) params.append('key', String(value));
const endpoint = `/entities${params.toString() ? `?${params}` : ''}`;
```

### Response Unwrapping
If backend wraps responses, unwrap at API layer:
```typescript
// Backend: { success: true, data: { movies: [...] } }
async getAll(): Promise<Movie[]> {
  const response = await fetchApi<{ movies: Movie[] }>('/movies');
  return response.movies; // Unwrap here, not in hooks
}
```

---

## Special Cases

### SSE (Server-Sent Events)
```typescript
subscribeToProgress(id, callbacks): () => void {
  const es = new EventSource(`/api/entities/${id}/stream`);
  es.addEventListener('event', (e) => callbacks.onEvent?.(JSON.parse(e.data)));
  return () => es.close(); // Cleanup function
}
```

### File Upload
```typescript
uploadFile(file: File): Promise<Result> {
  const formData = new FormData();
  formData.append('file', file);
  return fetchApi<Result>('/upload', {
    method: 'POST',
    body: formData, // Don't JSON.stringify FormData
  });
}
```

---

## Common Mistakes

| ❌ Wrong | ✅ Correct |
|---------|-----------|
| `fetch('/api/movies')` | `fetchApi<Movie[]>('/movies')` |
| `fetchApi('/api/movies')` | `fetchApi<Movie[]>('/movies')` |
| `fetchApi('/movies')` (no generic) | `fetchApi<Movie[]>('/movies')` |
| Unwrap in hook | Unwrap in API method |

---

See [Frontend README](./README.md) for architecture overview.
