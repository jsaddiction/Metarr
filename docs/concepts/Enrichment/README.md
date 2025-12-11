# Enrichment

Enrichment is the process of gathering, downloading, caching, and recording all metadata and assets for a media item.

## Enrichment Pipeline

```
ENRICHMENT
    │
    ├──► 1. SCRAPING
    │         └──► Identify the media item
    │         └──► Gather all data from providers
    │         └──► Store in provider_cache tables
    │
    ├──► 2. DOWNLOADING
    │         └──► Score candidates using provider metadata
    │         └──► Download to temp directory (ranked order)
    │         └──► Generate pHash, detect duplicates
    │         └──► Continue until limit reached with unique assets
    │
    ├──► 3. CACHING
    │         └──► Move final selections to cache directory
    │         └──► Content-addressed storage (SHA256)
    │         └──► Update cache_image_files table
    │
    ├──► 4. RECORDING
    │         └──► Copy metadata to movies table
    │         └──► Update provider_assets with selection state
    │         └──► Calculate completeness percentage
    │
    └──► 5. COMPLETE
              └──► Ready for publishing (if auto-publish)
              └──► Or await user review
```

## Conceptual Documentation

| Step | Document | Purpose |
|------|----------|---------|
| 1 | [Scraping](./SCRAPING/README.md) | Gather data from providers |
| 2 | [Downloading](./DOWNLOADING.md) | Score, download, deduplicate assets |
| 3 | [Caching](./CACHING.md) | Store final selections in protected cache |
| 4 | [Recording](./RECORDING.md) | Write results to database tables |

## Media-Specific Implementation

| Media Type | Status | Documentation |
|------------|--------|---------------|
| [Movies](../../implementation/Movies/README.md) | Complete | Full enrichment pipeline |
| TV Shows | Planned | Series → Season → Episode hierarchy |
| Music | Planned | Artist → Album → Track hierarchy |

### Movie Implementation

| Phase | Document | Maps to Concept |
|-------|----------|-----------------|
| Pre-requisite | [01-SCANNING.md](../../implementation/Movies/01-SCANNING.md) | [Scanning](../Scanning/) |
| Scraping | [02-SCRAPING.md](../../implementation/Movies/02-SCRAPING.md) | [SCRAPING/](./SCRAPING/) |
| Asset Selection | [03-ASSET-SELECTION.md](../../implementation/Movies/03-ASSET-SELECTION.md) | [DOWNLOADING.md](./DOWNLOADING.md) |
| Actor Enrichment | [04-ACTOR-ENRICHMENT.md](../../implementation/Movies/04-ACTOR-ENRICHMENT.md) | - |
| Trailer Enrichment | [05-TRAILER-ENRICHMENT.md](../../implementation/Movies/05-TRAILER-ENRICHMENT.md) | - |
| Publishing | [06-PUBLISHING.md](../../implementation/Movies/06-PUBLISHING.md) | [Publishing](../Publishing/) |

---

## Quick Reference

### Enrichment Triggers

| Trigger | Priority | Behavior |
|---------|----------|----------|
| User clicks "Enrich" | HIGH | Immediate, single item |
| Webhook (Radarr/Sonarr) | HIGH | Immediate processing |
| Scheduled task | NORMAL | Batch processing |
| Bulk operation | LOW | Queue-based |

### Asset Flow

```
Provider URLs (candidates)
    ↓
Temp directory (during download)
    ↓
Cache directory (selected assets)
    ↓
Library directory (published)
```

### Configuration

| Setting | Effect |
|---------|--------|
| `asset_limit_{type}` | Max unique assets per type |
| `autoSelectAssets` | Auto-select or await user choice |
| `preferredLanguage` | Scoring preference |
| `autoPublish` | Auto-publish or await user trigger |

### Concurrency Model

Multiple enrichment jobs can run in parallel:
- Each job handles one media item
- Asset types within a job can process in parallel
- Downloads within an asset type are sequential (for pHash dedup)

---

## Core Principles

### Idempotency

Re-running enrichment produces the same result:
- Scraping uses cached data if fresh
- Downloading skips already-cached assets
- Recording respects field locks

### Field Locking

User edits are sacred:
- Locked fields never overwritten by enrichment
- Lock state persisted in `*_locked` columns
- UI shows lock indicators

### Cache = Source of Truth

The cache directory is protected:
- Content-addressed storage (same content = same file)
- Survives media manager deletions
- Enables disaster recovery

### Graceful Degradation

Partial success is acceptable:
- If one provider fails, use others
- If some assets fail, keep successful ones
- Log issues for retry on next run

---

## Provider Documentation

For provider concepts, capabilities, and rate limiting:

- [Provider Overview](./Providers/README.md) - Provider capabilities and selection strategies
- [Rate Limiting](./Providers/RATE_LIMITING.md) - Rate limiting and circuit breakers

For provider-specific implementation details:

- [Implementation Details](../../implementation/Providers/) - API endpoints, data mapping, quirks

---

## Related Documentation

- [Operational Concepts](../README.md) - Pipeline overview
- [Scanning](../Scanning/README.md) - Previous job (provides identified media)
- [Publishing](../Publishing/README.md) - Next job (deploys to library)
- [Architecture Overview](../../architecture/) - System design
- [Job Queue](../../architecture/JOB_QUEUE.md) - How enrichment jobs are processed
- [Asset Management](../../architecture/ASSET_MANAGEMENT/) - Cache and library tiers
