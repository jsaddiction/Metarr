# Provider Cache Architecture

How provider data is cached and when cache is used vs bypassed.

## Cache Purpose

The provider cache serves as a **learning resource** about movies:

- Raw provider responses preserved for re-processing
- Reduces API calls for repeated operations
- Enables offline enrichment from cached data
- Supports future re-aggregation with new field mappings

**Key distinction:** Cache stores raw provider data, NOT processed movie metadata. The `movies` table stores the processed/aggregated result.

---

## Cache Structure

### Provider Cache Table

```sql
provider_cache (
  id INTEGER PRIMARY KEY,
  provider TEXT NOT NULL,        -- 'tmdb', 'omdb', 'fanart', 'tvdb'
  provider_id TEXT NOT NULL,     -- Provider's ID for this entity
  entity_type TEXT NOT NULL,     -- 'movie', 'show', 'season', 'episode'
  raw_response TEXT NOT NULL,    -- Full JSON response from provider
  fetched_at TEXT NOT NULL,      -- ISO timestamp
  expires_at TEXT,               -- Optional TTL

  UNIQUE(provider, provider_id, entity_type)
)
```

### Cross-Reference Index

```sql
provider_cross_ref (
  tmdb_id INTEGER,
  imdb_id TEXT,
  tvdb_id INTEGER,

  PRIMARY KEY (tmdb_id)
)
```

Populated when providers return cross-reference IDs. Enables quick lookups.

---

## Cache Lifecycle

### When Data Enters Cache

| Trigger | Cached | Notes |
|---------|--------|-------|
| NFO provides TMDB ID | Yes | Confident identity |
| Webhook provides TMDB ID | Yes | Confident identity |
| User selects search result | Yes | User-confirmed |
| Automated search (single exact match) | Yes | High confidence |
| Automated search (ambiguous) | **No** | Memory only |
| User browsing search results | **No** | Memory only |

### Cache TTL

| Provider | Default TTL | Rationale |
|----------|-------------|-----------|
| TMDB | 7 days | Metadata rarely changes |
| OMDB | 7 days | Ratings update slowly |
| Fanart.tv | 24 hours | New images added frequently |
| TVDB | 7 days | Metadata rarely changes |

### Cache Invalidation

| Event | Action |
|-------|--------|
| TTL expired | Re-fetch on next access |
| User clicks "Refresh" | Bypass cache, re-fetch all |
| Manual enrichment | Bypass cache TTL |
| Bulk enrichment | Respect cache TTL |
| Provider config changed | Invalidate that provider's cache |

---

## Cache vs Memory Operations

### Memory-Only (Never Cached)

```
User search operations:
├── Search queries across providers
├── Result aggregation and deduplication
├── Result ranking and presentation
└── User browsing/filtering results
```

These operate on temporary data structures. If user abandons search, nothing persists.

### Cache-Committed (Persistent)

```
After confirmation:
├── Selected movie's provider responses
├── Cross-reference IDs discovered
├── Asset URLs (candidates)
└── Timestamp for TTL tracking
```

---

## Data Flow: Cache to Movies Table

```
Provider Cache                    Movies Table
┌────────────────┐               ┌────────────────┐
│ TMDB Response  │               │                │
│ {              │               │ title          │◄── aggregated
│   title: "X",  │──────────────►│ plot           │◄── from cache
│   overview: Y, │  Aggregation  │ release_date   │    with priority
│   ...          │     Layer     │ runtime        │
│ }              │               │ ...            │
├────────────────┤               │                │
│ OMDB Response  │               │ imdb_rating    │◄── OMDB exclusive
│ {              │──────────────►│ rt_score       │◄── OMDB exclusive
│   imdbRating,  │               │ metacritic     │◄── OMDB exclusive
│   Ratings: [], │               │ awards         │◄── OMDB exclusive
│   ...          │               │                │
│ }              │               └────────────────┘
└────────────────┘
```

The aggregation layer applies:
- Provider priority (OMDB > TMDB for certain fields)
- Field locking (skip locked fields)
- "Fill gaps, don't erase" logic

---

## Bypassing Cache

### Manual Enrichment Mode

When user explicitly enriches a single movie:

```
Manual enrich request
    │
    ├──► Ignore cache TTL
    ├──► Fetch fresh from all providers
    ├──► Update cache with new responses
    └──► Re-aggregate to movies table
```

### Bulk Enrichment Mode

When processing many movies:

```
Bulk enrich request
    │
    ├──► Check cache TTL
    │         ├──► Valid: Use cached data
    │         └──► Expired: Fetch fresh
    │
    ├──► If ANY provider rate-limited:
    │         └──► STOP immediately (don't corrupt data)
    │
    └──► Process with available data
```

---

## Cache Queries

### Lookup by Any ID

```
Given: imdb_id = "tt0133093"

1. Check cross_ref: SELECT tmdb_id FROM provider_cross_ref WHERE imdb_id = ?
2. If found: SELECT * FROM provider_cache WHERE provider = 'tmdb' AND provider_id = ?
3. If not found: Fetch from TMDB /find endpoint, cache result
```

### Check Cache Freshness

```sql
SELECT * FROM provider_cache
WHERE provider = ?
  AND provider_id = ?
  AND (expires_at IS NULL OR expires_at > datetime('now'))
```

### Invalidate Provider Cache

```sql
DELETE FROM provider_cache WHERE provider = ?
```

---

## Cache Storage Efficiency

### What's Stored

- Full API responses (enables re-processing)
- Only responses for confirmed movies
- Cross-reference mapping for quick lookups

### What's NOT Stored

- Search results (memory only)
- Failed lookup attempts
- Ambiguous matches

### Size Estimates

| Provider | Avg Response Size | 1000 Movies |
|----------|-------------------|-------------|
| TMDB | ~15 KB | ~15 MB |
| OMDB | ~2 KB | ~2 MB |
| Fanart.tv | ~5 KB | ~5 MB |
| TVDB | ~8 KB | ~8 MB |

Total: ~30 MB per 1000 movies (compressed in SQLite)

---

## Error Recovery

### Partial Cache State

If caching is interrupted mid-operation:

```
Provider responses are atomic:
├── Each provider's response cached independently
├── Partial fetch = partial cache (valid)
├── Next enrichment attempt fills gaps
└── No rollback needed
```

### Cache Corruption

If cache data is invalid:

```
Detection:
├── JSON parse failure on raw_response
├── Missing required fields
└── Cross-ref inconsistency

Recovery:
├── Delete corrupted entry
├── Re-fetch from provider
└── Log for monitoring
```

---

## Related Documents

- [CONCEPT.md](./CONCEPT.md) - Core design principles
- [PROVIDERS.md](./PROVIDERS.md) - Provider capabilities
- [IDENTIFICATION.md](./IDENTIFICATION.md) - How movies get identified
