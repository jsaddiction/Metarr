# Scanning

Scanning is the process of discovering media directories, classifying all files within them, and extracting identity information.

## What is Scanning?

Given a directory path, scanning:

1. **Discovers** what files exist in the directory
2. **Classifies** each file by type and purpose
3. **Extracts** identity information (TMDB ID, IMDb ID)
4. **Decides** if automatic processing can proceed

```
INPUT: Directory path (e.g., /media/movies/Movie Name (2024)/)
    │
    └──► SCANNING
              │
              ├──► Step 1: DISCOVER
              │         └──► Enumerate all files in directory
              │         └──► Gather facts about each file
              │
              ├──► Step 2: CLASSIFY
              │         └──► Identify main movie file
              │         └──► Classify images, subtitles, extras
              │         └──► Detect disc structures (BDMV/VIDEO_TS)
              │
              └──► Step 3: EXTRACT IDENTITY
                        └──► Parse NFO files for IDs
                        └──► Cross-reference with webhook context
                        └──► Determine if manual identification needed

OUTPUT: Classified directory ready for enrichment (or flagged for manual review)
```

## Why Scanning?

Scanning answers the foundational question: **"What do we have here?"**

Before enrichment can fetch metadata or select assets, we must know:
- Which file is the main movie?
- What is the TMDB ID?
- What existing assets are already present?

Without this foundation, enrichment cannot proceed.

## Documents

| Document | Purpose |
|----------|---------|
| [DISCOVERY.md](./DISCOVERY.md) | How files are found and facts gathered |
| [CLASSIFICATION.md](./CLASSIFICATION.md) | How files are categorized by type and purpose |
| [IDENTITY.md](./IDENTITY.md) | How media items get identified (IDs extracted) |

## Quick Reference

### Scanning Triggers

| Trigger | Priority | Context Provided |
|---------|----------|------------------|
| Webhook (Radarr/Sonarr) | HIGH | TMDB ID, exact path |
| Manual scan | HIGH | None |
| Scheduled scan | NORMAL | None |
| File watcher | NORMAL | Changed path only |

### Classification Categories

| Category | Examples |
|----------|----------|
| Main movie | The primary video file |
| Trailer | `-trailer.mp4`, `trailers/` folder |
| Extra | Behind the scenes, deleted scenes |
| Image | Poster, fanart, logo, etc. |
| Text | NFO, subtitles |
| Unknown | Unclassified files |

### Processing Decision

| Status | Criteria | Next Step |
|--------|----------|-----------|
| `CAN_PROCESS` | Main movie + TMDB ID + all classified | Auto-enrich |
| `CAN_PROCESS_WITH_UNKNOWNS` | Main movie + TMDB ID + some unknowns | Auto-enrich (unknowns recycled) |
| `MANUAL_REQUIRED` | Missing main movie OR TMDB ID | User intervention |

## Core Principles

### Facts Before Decisions

Scanning uses a two-phase approach:
1. **Gather facts** - Collect objective metadata about every file
2. **Make decisions** - Classify based on gathered facts

This separation ensures classification decisions are based on complete information.

### Confidence Scoring

Every classification gets a confidence score (0-100):
- **≥80**: Reliable, can process automatically
- **60-79**: Low confidence, may need review
- **<60**: Unreliable, likely needs manual classification

### Main Movie is Critical

The main movie file determines:
- Asset naming (`Movie.Name.2024-poster.jpg`)
- Directory structure expectations
- What constitutes a "complete" scan

### Identity Gates Enrichment

Without a confirmed TMDB ID:
- Enrichment cannot query providers
- Manual identification is required
- User must search and confirm identity

## Relationship to Enrichment

```
SCANNING (local files → classified directory with ID)
    │
    └──► ENRICHMENT (ID → provider data → selected assets)
              │
              ├──► Scraping (query providers, cache data)
              ├──► Asset Selection (download, dedupe)
              └──► Publishing (deploy to library)
```

Scanning is the **prerequisite** for enrichment. It transforms a raw directory into a classified, identified media item ready for metadata enrichment.

## Next Step

After scanning completes successfully:
→ [Enrichment](../Enrichment/README.md) - Gather data and select assets

## Implementation

For movie-specific implementation details:
→ [Movies: 01-SCANNING.md](../../implementation/Movies/01-SCANNING.md)

## Related Documentation

- [Operational Concepts](../README.md) - Pipeline overview
- [Enrichment](../Enrichment/README.md) - What happens after scanning
- [Publishing](../Publishing/README.md) - What happens after enrichment
