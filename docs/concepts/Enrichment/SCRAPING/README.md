# Scraping

Scraping is the process of gathering all available information about a media item from external providers.

## What is Scraping?

Given an identifier (TMDB ID, IMDb ID, TVDB ID) or search terms (title + year), scraping:

1. **Identifies** what movie/show this is
2. **Gathers** all available data from all enabled providers
3. **Records** everything to the provider cache

```
INPUT: ID or Title+Year
    │
    └──► SCRAPING
              │
              ├──► Step 1: IDENTIFY
              │         └──► Figure out what this is
              │         └──► Cross-reference all available IDs
              │
              └──► Step 2: GATHER & RECORD
                        └──► Query all enabled providers
                        └──► Collect metadata, images, videos, cast, crew
                        └──► Store in provider_cache tables

OUTPUT: provider_cache fully populated with everything known
```

## Why "Scraping"?

This term is used in media management software to describe fetching data from external sources. Metarr's scraping system:

- Aggregates data from multiple providers (TMDB, OMDB, Fanart.tv, TVDB)
- Cross-references IDs to maximize data coverage
- Caches results to minimize API calls
- Supports both automated and manual identification

## Documents

| Document | Purpose |
|----------|---------|
| [IDENTIFICATION.md](./IDENTIFICATION.md) | How movies get identified from various starting points |
| [DATA_COLLECTION.md](./DATA_COLLECTION.md) | What data is gathered and how it's recorded |
| [PROVIDERS.md](./PROVIDERS.md) | Individual provider capabilities |
| [CACHING.md](./CACHING.md) | Cache architecture, TTL, invalidation |
| [CONCEPT.md](./CONCEPT.md) | Design principles and detailed architecture |

## Quick Reference

### Provider Roles

| Provider | Primary Value | Cross-Reference |
|----------|---------------|-----------------|
| TMDB | Backbone - metadata, images, cast, IDs | Hub - can lookup by IMDb/TVDB ID |
| OMDB | Ratings (IMDb, RT, Metacritic), awards | None - returns IMDb ID only |
| Fanart.tv | High-quality artwork | Returns TMDB + IMDb IDs |
| TVDB | TV-focused, has movies | Can lookup by IMDb ID |

### Scraping Triggers

| Trigger | Priority | Behavior |
|---------|----------|----------|
| User clicks "Scrape" | HIGH | Immediate, bypass cache TTL |
| Webhook (Radarr/Sonarr) | HIGH | Immediate processing |
| Scheduled task | NORMAL | Respects cache TTL |
| Bulk operation | LOW | Batch processing |

### What Gets Scraped

| Data Type | Providers | Storage |
|-----------|-----------|---------|
| Metadata (title, plot, etc.) | TMDB, OMDB | provider_cache_movies |
| Ratings | OMDB, TMDB | provider_cache_movies |
| Images (poster, fanart, etc.) | TMDB, Fanart.tv, TVDB | provider_cache_images |
| Videos (trailers, clips) | TMDB | provider_cache_videos |
| Cast & Crew | TMDB | provider_cache_movie_cast/crew |
| External IDs | All | Cross-reference table |

## Core Principles

- **Memory-first identification** - Don't cache until confident about identity
- **Cross-reference aggressively** - Use every provider to maximize ID discovery
- **Reuse query results** - Identification queries return data; don't discard it
- **Ambiguity = stop** - Never guess; ask user when uncertain
- **Cache = committed truth** - Once cached, identity is confirmed

## Relationship to Enrichment

Scraping populates the provider cache. Enrichment consumes it:

```
SCRAPING (external APIs → provider_cache)
    │
    └──► ENRICHMENT (provider_cache → movies table + assets)
              │
              ├──► Copy metadata to movies table
              ├──► Select best assets (with pHash dedup)
              └──► Publish to library
```

Enrichment never queries providers directly - it reads from the cache that scraping populated.

## Next Step

After scraping completes, proceed to:
→ [Downloading](../DOWNLOADING.md) - Score and download assets with pHash dedup

## Implementation

For movie-specific implementation details:
→ [Movies: 02-SCRAPING.md](../../../implementation/Movies/02-SCRAPING.md)

## Related Documentation

- [Enrichment Overview](../README.md) - Full enrichment pipeline
- [Asset Management](../../architecture/ASSET_MANAGEMENT/) - How images are stored and selected
