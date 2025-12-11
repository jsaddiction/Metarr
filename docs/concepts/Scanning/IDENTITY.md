# Identity Extraction

Identity extraction determines what media item this directory represents by finding provider IDs (TMDB, IMDb).

## Purpose

Identity extraction answers: **"What movie/show is this?"**

Without a confirmed identity (TMDB ID), enrichment cannot:
- Query providers for metadata
- Fetch images and trailers
- Proceed automatically

## Two Paths to Identity

```
IDENTITY EXTRACTION
    │
    ├──► Path 1: NFO PARSING
    │         └──► Read NFO file content
    │         └──► Extract IDs from XML tags, URLs, or plain text
    │         └──► Highest priority: explicit ID tags
    │
    └──► Path 2: FILENAME/DIRECTORY PARSING
              └──► Parse directory name for title + year
              └──► Parse main movie filename
              └──► Search providers to find match
              └──► Requires user confirmation if ambiguous
```

---

## Path 1: NFO Parsing

NFO files are the primary source of identity. They may contain IDs in multiple formats.

### NFO Priority Order

| Priority | Pattern | Example |
|----------|---------|---------|
| 1 | `<videofilename>.nfo` | `Movie.Name.2024.nfo` |
| 2 | `movie.nfo` | Standard Kodi format |
| 3 | `movie.xml` | Legacy format |
| 4 | Any other `.nfo` | Gap-filling only |

**Merge behavior:** Highest priority NFO provides base data. Lower priority NFOs fill gaps only.

### ID Formats Recognized

```xml
<!-- XML uniqueid tags (preferred) -->
<uniqueid type="tmdb">603</uniqueid>
<uniqueid type="imdb">tt0133093</uniqueid>

<!-- Legacy XML tags -->
<tmdb>603</tmdb>
<imdb>tt0133093</imdb>

<!-- URL patterns -->
https://www.themoviedb.org/movie/603
https://www.imdb.com/title/tt0133093

<!-- Plain text patterns -->
tmdb:603
imdb:tt0133093
tt0133093
```

### NFO Caching

Only the highest-priority NFO is cached to `cache_text_files`. This cached copy becomes the source of truth for NFO regeneration during publishing.

---

## Path 2: Filename/Directory Parsing

When no NFO exists or NFO lacks IDs, extract identity from naming.

### Directory Name Parsing

```
/media/movies/The Matrix (1999)/
                ↓
Title: "The Matrix"
Year: 1999
```

### Filename Parsing

```
The.Matrix.1999.1080p.BluRay.x264.mkv
    ↓
Title: "The Matrix"
Year: 1999
```

### Search and Match

With title + year, search providers:

1. Query TMDB: `search/movie?query=The Matrix&year=1999`
2. If single result with high confidence → auto-match
3. If multiple results or low confidence → require user confirmation

---

## Webhook Advantage

Webhooks (Radarr/Sonarr) provide identity directly:

```json
{
  "movie": {
    "tmdbId": 603,
    "imdbId": "tt0133093",
    "path": "/media/movies/The Matrix (1999)/"
  }
}
```

**Benefits:**
- Bypasses NFO parsing entirely
- Bypasses filename parsing
- 100% confidence
- Immediate enrichment

---

## ID Cross-Reference

Once one ID is found, others can be discovered:

```
Have TMDB ID → Query TMDB → Get IMDb ID, TVDB ID
Have IMDb ID → Query TMDB by IMDb → Get TMDB ID
```

This happens during [Scraping](../Enrichment/SCRAPING/IDENTIFICATION.md), not during scanning.

---

## Ambiguity Handling

When identity cannot be determined automatically:

| Scenario | Action |
|----------|--------|
| No NFO, no parseable filename | `MANUAL_REQUIRED` |
| Multiple possible matches | `MANUAL_REQUIRED` |
| Conflicting IDs in NFOs | `MANUAL_REQUIRED` |
| Low confidence match | `MANUAL_REQUIRED` |

**User must:**
1. Search for the correct movie
2. Confirm the match
3. System stores the confirmed ID

---

## State Transitions

```
Movie created        → identification_status = 'unidentified'
ID found (NFO)       → identification_status = 'identified'
ID found (webhook)   → identification_status = 'identified'
ID found (search)    → identification_status = 'identified'
Conflicting IDs      → status = 'ambiguous_nfo'
```

---

## Output

After identity extraction:

- TMDB ID confirmed (or flagged as needing manual identification)
- IMDb ID if available
- Ready for enrichment (if ID found)
- Or awaiting user intervention (if manual required)

---

## Related Documentation

- [Classification](./CLASSIFICATION.md) - Determines if we have enough to proceed
- [Scraping: Identification](../Enrichment/SCRAPING/IDENTIFICATION.md) - Cross-referencing IDs across providers
