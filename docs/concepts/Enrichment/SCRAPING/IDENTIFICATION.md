# Identification (Scraping Step 1)

The first step of scraping: figure out what movie this is and cross-reference all available IDs.

## Purpose

Given any starting point, identification answers: **"What movie is this?"**

- From NFO: Extract TMDB/IMDb/TVDB ID
- From webhook: Use provided ID
- From folder name: Parse title + year, search providers
- From user: Manual search and selection

Once identified, scraping proceeds to [Data Collection](./DATA_COLLECTION.md).

---

## Core Principle: Memory-First

**Never cache until identity is confirmed.**

- Automated searches with ambiguous results → mark "needs identification"
- User-initiated searches → return all results, user selects, THEN cache
- Only commit to cache when confident in the match

---

## ID Cross-Reference Paths

TMDB is the cross-reference hub. Most paths flow through it.

```
┌─────────────────────────────────────────────────────────────┐
│                    CROSS-REFERENCE MAP                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   IMDb ID ──────┬──────────────────────────────────────────► IMDb ID
│                 │                                            │
│                 ▼                                            │
│           ┌──────────┐                                       │
│           │   TMDB   │◄──────────────────────────────────────┤
│           │  /find   │                                       │
│           └────┬─────┘                                       │
│                │                                             │
│                ▼                                             │
│   TVDB ID ────►│──────────────────────────────────────────► TVDB ID
│                │                                             │
│                ▼                                             │
│          TMDB ID ◄───────────────────────────────────────── TMDB ID
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Provider Cross-Reference Capabilities

| Start With | TMDB | TVDB | Fanart.tv | Result |
|------------|------|------|-----------|--------|
| TMDB ID | Direct lookup | Via TMDB external_ids | Direct lookup | All IDs |
| IMDb ID | `/find` endpoint | `/search/remoteid` | Direct lookup | All IDs |
| TVDB ID | `/find` endpoint | Direct lookup | Direct lookup | All IDs |
| Title+Year | Search (ambiguous) | Search (ambiguous) | No search | Needs confirmation |

---

## Identification Cases

### CASE 1: Have TMDB ID (Best Case)

Source: NFO file, webhook, or user selection

```
TMDB ID known
    │
    ├──► TMDB /movie/{id} ──► Returns: title, metadata, external_ids
    │                                   └─► imdb_id, tvdb_id (if linked)
    │
    ├──► Fanart.tv /movies/{tmdb_id} ──► Returns: images + confirms tmdb_id
    │
    └──► If IMDb ID obtained:
              └──► OMDB /?i={imdb_id} ──► Returns: ratings, awards
              └──► TVDB /search/remoteid/{imdb_id} ──► Returns: TVDB data

Result: Full ID set (TMDB + IMDb + TVDB) + complete metadata
```

### CASE 2: Have IMDb ID Only

Source: NFO file with only IMDb ID

```
IMDb ID known
    │
    ├──► TMDB /find/{imdb_id}?external_source=imdb_id
    │         └──► Returns: TMDB ID + basic data
    │
    ├──► OMDB /?i={imdb_id} ──► Returns: ratings, awards (no cross-ref)
    │
    ├──► TVDB /search/remoteid/{imdb_id}
    │         └──► Returns: TVDB ID + TVDB data
    │
    └──► Fanart.tv /movies/{imdb_id} ──► Returns: images + tmdb_id confirmation

Result: Full ID set via TMDB /find + Fanart.tv confirmation
```

### CASE 3: Have TVDB ID Only

Source: NFO file with only TVDB ID (rare for movies)

```
TVDB ID known
    │
    ├──► TMDB /find/{tvdb_id}?external_source=tvdb_id
    │         └──► Returns: TMDB ID + IMDb ID + basic data
    │
    ├──► TVDB /movies/{tvdb_id} ──► Returns: TVDB data + remoteIds
    │         └──► remoteIds may include IMDb ID
    │
    └──► Once TMDB ID obtained, proceed as CASE 1

Result: Full ID set via TMDB cross-reference
```

### CASE 4: Title + Year (Automated)

Source: Folder name parsing, no NFO

```
Title + Year known
    │
    ├──► TMDB /search/movie?query={title}&year={year}
    │         │
    │         ├──► Single result with high confidence
    │         │         └──► Accept, proceed as CASE 1
    │         │
    │         ├──► Multiple results
    │         │         └──► Mark "needs_identification"
    │         │         └──► DO NOT CACHE
    │         │
    │         └──► No results
    │                   └──► Mark "needs_identification"

Result: Either confident match OR flagged for user intervention
```

**High Confidence Criteria:**
- Single result matches title exactly (case-insensitive)
- Year matches exactly
- Popularity score above threshold

### CASE 5: User-Initiated Search

Source: User clicks "Identify" button, enters search terms

```
User enters search
    │
    ├──► Query ALL enabled providers in parallel (in memory)
    │         ├──► TMDB /search/movie
    │         ├──► TVDB /search?query={title}&type=movie
    │         └──► OMDB /?s={title}&type=movie
    │
    ├──► Deduplicate results by IMDb ID
    │         └──► Merge provider data for same movie
    │
    ├──► Present ranked results to user
    │
    └──► User selects correct match
              │
              └──► NOW cache the selected movie's data
                        └──► Proceed to full enrichment

Result: User-confirmed identity, safe to cache
```

---

## Deduplication Strategy

When multiple providers return search results, deduplicate by IMDb ID.

### Why IMDb ID?

- Most universal identifier across providers
- TMDB, TVDB, and OMDB all reference IMDb IDs
- Fanart.tv returns IMDb ID in responses

### Merge Logic

```
For each search result:
  1. Extract IMDb ID (if available)
  2. If IMDb ID seen before:
       - Merge metadata (fill gaps)
       - Combine provider sources list
  3. If no IMDb ID:
       - Keep as separate result
       - Flag as "unconfirmed identity"
```

### Result Ranking

```
Priority order:
1. Exact title match + exact year match
2. Exact title match + year within 1
3. Contains search terms + exact year
4. Popularity score (TMDB provides this)
5. Number of providers returning this result
```

---

## Confidence States

Movies progress through identification states:

| State | Meaning | Next Action |
|-------|---------|-------------|
| `unidentified` | No IDs found | Needs user search |
| `needs_identification` | Ambiguous search results | Needs user selection |
| `identified` | TMDB ID confirmed | Ready for enrichment |
| `enriched` | Full metadata fetched | Ready for asset selection |

### State Transitions

```
┌─────────────┐     NFO has TMDB ID      ┌────────────┐
│ unidentified│──────────────────────────►│ identified │
└──────┬──────┘                          └─────┬──────┘
       │                                       │
       │ Automated search                      │ Enrichment
       │ (ambiguous)                           │
       ▼                                       ▼
┌──────────────────┐    User selects    ┌──────────┐
│needs_identification│─────────────────►│ enriched │
└──────────────────┘                    └──────────┘
```

---

## Re-Identification

When user suspects wrong movie match, they can re-identify.

### UI Flow

```
User clicks "Re-identify" button
    │
    ├──► Modal opens with search box
    │         └──► Pre-populated with current title
    │
    ├──► Search results displayed below
    │         └──► From all enabled providers (same as CASE 5)
    │
    └──► User selects correct match
              │
              ├──► INVALIDATE all cached data for this movie
              │         ├──► Clear provider_cache entries
              │         ├──► Clear provider_assets (candidates)
              │         ├──► Clear selected assets
              │         └──► Reset enrichment state
              │
              └──► RE-RUN full enrichment with new identity
                        └──► Fresh fetch from all providers
```

### What Gets Invalidated

| Data Type | Action |
|-----------|--------|
| Provider cache | Delete all entries for old IDs |
| Cross-reference IDs | Replace with new IDs |
| Metadata fields | Re-fetch and re-aggregate |
| Asset candidates | Delete old, fetch new |
| Selected assets | Clear selections |
| Cache files | Keep (content-addressed, may be reused) |
| Library files | Keep until new publish |

### Why Full Invalidation?

Wrong identity means ALL data from providers is suspect:
- Metadata describes wrong movie
- Images are for wrong movie
- Ratings are for wrong movie

Safer to start fresh than try to merge.

---

## Provider Failure Handling

When a provider fails during identification:

### Soft Failures (Continue)

- Rate limited: Skip provider, use others
- Timeout: Retry once, then skip
- Empty results: Normal, check other providers

### Hard Failures (Flag)

- All providers fail: Mark `needs_identification`
- Critical provider (TMDB) fails: Retry with backoff

### Partial Success Strategy

```
IF TMDB succeeds:
    - Have TMDB ID (primary requirement met)
    - Continue even if OMDB/Fanart.tv fail
    - Mark as partial, retry failures later

IF only OMDB succeeds:
    - Have IMDb ID only
    - Try TMDB /find to get TMDB ID
    - If /find fails, mark needs_identification

IF only Fanart.tv succeeds:
    - Get both TMDB ID and IMDb ID from response
    - Continue with those IDs
```

---

## Implementation Notes

### Memory-Only Operations

These operations work in memory, never touch cache:

- Search aggregation across providers
- Result deduplication
- Ranking and presentation
- User browsing results

### Cache-Committing Operations

These operations write to cache (only after confirmation):

- User selecting a search result
- NFO providing TMDB ID directly
- Webhook providing TMDB ID
- High-confidence automated match (single exact result)

### Cache Structure After Identification

Once identity is confirmed, cache stores:

```
provider_cache (TMDB data):
  - tmdb_id (primary key)
  - imdb_id (cross-reference)
  - tvdb_id (cross-reference)
  - raw_response (full API response)
  - fetched_at (timestamp)

provider_cache (OMDB data):
  - imdb_id (primary key for OMDB)
  - raw_response (ratings, awards)
  - fetched_at

provider_cache (Fanart.tv data):
  - tmdb_id (primary key for Fanart.tv)
  - raw_response (image URLs)
  - fetched_at
```

---

## ID Conflict Resolution

When providers disagree on cross-reference IDs, trust the authoritative source.

### Trust Hierarchy

Each ID type has an authoritative source - the provider that issued it:

| ID Type | Authoritative Source | Why |
|---------|---------------------|-----|
| TMDB ID | TMDB | They issued it |
| IMDb ID | OMDB (queries IMDb) | They own the data |
| TVDB ID | TVDB | They issued it |

### Conflict Detection

```
Example conflict:
  TMDB says imdb_id = tt0133093
  Fanart.tv says imdb_id = tt0133094

This can happen when:
  - Provider has stale cross-reference data
  - Data entry error in one provider
  - Movie was merged/split in one database
```

### Resolution Strategy

When providers disagree, validate against the authoritative source:

```
Conflict: TMDB vs Fanart.tv on IMDb ID
    │
    ├──► Query OMDB with tt0133093 (TMDB's value)
    │         └──► Returns: "The Matrix" (1999)
    │
    ├──► Query OMDB with tt0133094 (Fanart.tv's value)
    │         └──► Returns: "Some Other Movie" (2005)
    │
    ├──► Compare to our movie: "The Matrix" (1999)
    │
    └──► Result: tt0133093 is correct (matches title/year)
              └──► Log that Fanart.tv has incorrect cross-ref
```

### Validation Logic

```
For IMDb ID conflict:
  1. Query OMDB with each conflicting ID
  2. Compare returned title/year to our known movie
  3. Use the ID that matches
  4. Log the conflict for monitoring

For TVDB ID conflict:
  1. Query TVDB directly with each conflicting ID
  2. Compare returned title/year to our known movie
  3. Use the ID that matches
  4. Log the conflict
```

### After Resolution

- Use the validated ID
- Log the conflict (provider + incorrect value) for monitoring
- Continue with identification/enrichment
- Future: Surface conflicts in UI for review

---

## Next Step

After identification completes, proceed to:
→ [Data Collection](./DATA_COLLECTION.md) - Gather all available data from providers

## Related Documents

- [README.md](./README.md) - Scraping overview
- [PROVIDERS.md](./PROVIDERS.md) - Provider capabilities
- [CACHING.md](./CACHING.md) - Cache architecture
- [CONCEPT.md](./CONCEPT.md) - Design principles
