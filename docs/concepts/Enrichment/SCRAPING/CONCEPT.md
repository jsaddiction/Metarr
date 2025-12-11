# Provider Orchestration - Core Concepts

## Purpose

The Provider Orchestrator is the **single source of truth** for all externally-sourced movie data. Its responsibilities:

1. **Figure out identity** - Given inconsistent inputs (any ID or title+year), determine which movie this is
2. **Gather all available data** - Query all enabled providers and aggregate results
3. **Cross-reference IDs** - Ensure we have TMDB ID, IMDb ID, TVDB ID (when they exist)
4. **Prevent API abuse** - Cache results to minimize redundant requests
5. **Support manual identification** - Provide search when automation fails

## Design Principles

### 1. Memory-First Identification

**Problem:** We might query providers during identification but then discover the movie is ambiguous or wrong.

**Solution:** Keep all identification results in memory until we're confident. Only commit to cache after successful identification.

```
Query providers → Results in memory → Confident? → Commit to cache
                                   → Ambiguous? → Ask user (don't cache)
                                   → Not found? → Mark for identification (don't cache)
```

### 2. Cross-Reference Aggressively

**Problem:** NFO might have only IMDb ID. OMDB needs IMDb ID. Fanart.tv works best with TMDB ID.

**Solution:** Use every provider's lookup capability to discover all IDs. One successful lookup can unlock all other providers.

### 3. Reuse Query Results

**Problem:** When we query TMDB to cross-reference IDs, the response includes full metadata. Discarding this wastes an API call.

**Solution:** Every provider query during identification captures the full response. When we commit to cache, we already have most of the data.

### 4. Ambiguity = Stop

**Problem:** Two movies with same title released in same year. Automated guess would be wrong 50% of the time.

**Solution:** If we can't uniquely identify, don't guess. Mark as "needs identification" and let user choose.

### 5. Cache = Committed Truth

**Problem:** If we cache uncertain data, subsequent enrichment builds on a bad foundation.

**Solution:** Cache entries represent confirmed identity. Once cached, we've decided "this directory IS this movie."

---

## Two Operational Modes

### Mode 1: Lookup (Have at least one ID)

Used when: Scanning found an ID in NFO, or webhook provided an ID.

```
Start with known ID
    ↓
Query providers to cross-reference other IDs
    ↓
Query all enabled providers for full data
    ↓
Merge into unified record
    ↓
Commit to cache
```

**Behavior:** Deterministic. One ID maps to one movie. No ambiguity.

### Mode 2: Search (Title + Year only, or user-initiated)

Used when: No ID available, or user manually searching to identify.

```
Search query (title, optional year)
    ↓
Query all providers with search capability
    ↓
Deduplicate results by IMDb ID
    ↓
Return candidates
```

**Automated (title+year from scan):**
- 0 results → Mark "needs identification"
- 1 result → Use it, proceed to lookup mode
- >1 results → Ambiguous → Mark "needs identification"

**User-initiated:**
- Return all candidates to UI
- User selects correct match
- Selection triggers lookup mode with confirmed ID
- Results NOT cached until user confirms

---

## Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     IDENTIFICATION LAYER                         │
│                    (In-Memory Processing)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  INPUT: TMDB ID | IMDb ID | TVDB ID | Title+Year | Search Query │
│                              ↓                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              CROSS-REFERENCE ENGINE                      │    │
│  │  • Query TMDB /find by external ID                      │    │
│  │  • Query TVDB /search/remoteid                          │    │
│  │  • Extract IDs from Fanart.tv responses                 │    │
│  │  • Build complete ID set: {tmdb, imdb, tvdb}            │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              ↓                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              PROVIDER QUERY ENGINE                       │    │
│  │  • TMDB: metadata, images, cast, crew                   │    │
│  │  • OMDB: ratings, awards, outline                       │    │
│  │  • Fanart.tv: high-quality artwork                      │    │
│  │  • TVDB: additional metadata, images                    │    │
│  │  All queries run with available IDs                     │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              ↓                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              IN-MEMORY AGGREGATION                       │    │
│  │  • Merge metadata (provider priority TBD)               │    │
│  │  • Collect all image URLs                               │    │
│  │  • Collect all ratings                                  │    │
│  │  • Unified record ready                                 │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              ↓                                   │
│                    IDENTIFICATION DECISION                       │
│                              ↓                                   │
│         ┌────────────┬──────────────┬────────────┐              │
│         │            │              │            │              │
│      CONFIDENT    AMBIGUOUS    NOT FOUND    USER SEARCH        │
│         │            │              │            │              │
│         ↓            ↓              ↓            ↓              │
│    Commit to     Mark for      Mark for    Return to UI        │
│      Cache      User Review   User Review   (no cache)         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                        CACHE LAYER                               │
│                  (Committed/Confirmed Data)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  provider_cache_movies                                          │
│  ├── All IDs (tmdb_id, imdb_id, tvdb_id)                       │
│  ├── Metadata (title, plot, year, runtime, etc.)               │
│  ├── Ratings (imdb, rotten_tomatoes, metacritic)               │
│  └── References to images, cast, crew tables                    │
│                                                                  │
│  Subsequent enrichment reads from cache                         │
│  Cache respects TTL for staleness                               │
│  Manual enrichment can force refresh (bypass TTL)               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Relationship to Enrichment

The Provider Orchestrator is a **resource** that enrichment phases consume:

1. **Scanning** → May have found IDs from NFO
2. **Provider Orchestrator** → Identifies movie, populates cache
3. **Enrichment Phase 1** → Reads from cache, copies to movies table
4. **Subsequent phases** → Use cached image URLs for download/selection

The cache acts as a buffer between external APIs and the Metarr database. Enrichment never queries providers directly - it reads from cache.

---

## Disabled Providers

When a provider is disabled (no API key, user disabled, etc.):

```
Provider disabled
    │
    ├──► Skip that provider entirely
    ├──► Continue with remaining providers
    └──► Accept reduced identification reliability
```

**Impact by provider:**

| Disabled Provider | Impact |
|-------------------|--------|
| TMDB | Severe - backbone provider, cross-ref hub. Consider blocking enrichment. |
| OMDB | Moderate - lose ratings (RT, Metacritic), awards. Identification still works. |
| Fanart.tv | Low - lose high-quality images. Identification still works. |
| TVDB | Low - primarily TV-focused. Identification still works for movies. |

No fallback behavior - just proceed with what's available.

---

## Rate Limit Handling

**Strategy:** Reactive, not proactive. Follow TMDB's model.

```
Make API request
    │
    ├──► Success → Continue
    │
    └──► 429 (Rate Limited) → React
              │
              ├──► Automated run: Mark for retry, continue with other work
              └──► User-initiated: Retry with backoff (don't fail immediately)
```

### No Pre-emptive Rate Limiting

- Don't track request counts
- Don't artificially slow down requests
- Let the provider tell us when to slow down

### Per-Provider Behavior

| Provider | Rate Limit | Our Response |
|----------|------------|--------------|
| TMDB | 429 response | Back off, retry later |
| OMDB | 1000/day quota | 429 → skip for today |
| Fanart.tv | VIP vs free tier delays | N/A, no rate limit |
| TVDB | Bearer token based | 429 → back off |

### Automated vs User-Initiated

| Mode | On 429 |
|------|--------|
| Automated (bulk/scheduled) | Skip this movie, continue batch, retry on next run |
| User-initiated (single) | Retry 2-3 times with exponential backoff, then fail |

---

## Metadata Field Priority

OMDB is a curated provider, so prefer it for fields it provides:

| Field | Priority | Rationale |
|-------|----------|-----------|
| Title | OMDB > TMDB | OMDB curates carefully |
| Plot | OMDB > TMDB | OMDB provides both short and full |
| Runtime | OMDB > TMDB | Often more accurate |
| Release Date | OMDB > TMDB | Direct from source |
| Content Rating | OMDB > TMDB | US MPAA rating |
| Tagline | TMDB only | OMDB doesn't provide |
| IMDb Rating | OMDB only | Authoritative source |
| RT Score | OMDB only | Only provider |
| Metacritic | OMDB only | Only provider |
| Awards | OMDB only | Only provider |

**ID Fields:** Each provider is authoritative for its own ID:
- `tmdb_id` → TMDB authoritative
- `imdb_id` → OMDB authoritative (validates against IMDb)
- `tvdb_id` → TVDB authoritative

---

## Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| ProviderCacheOrchestrator | Implemented | Core orchestration working |
| TMDB integration | Working | Full metadata + images |
| OMDB integration | Working | Lazy-loaded from config |
| Fanart.tv integration | Working | Images only |
| TVDB integration | Partial | Needs review |
| Memory-first identification | Not implemented | Currently writes to cache immediately |
| Search deduplication | Not implemented | Needed for manual identification |
| Cross-reference from Fanart.tv | Not implemented | Could extract IDs from responses |
