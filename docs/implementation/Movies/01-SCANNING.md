# Scanning Phase

Discovers media directories, classifies all files within them, and establishes the foundation for enrichment.

## Purpose

The scanning phase answers: **"What do we have in this directory?"**

- Identify the main movie file among potentially many video files
- Extract TMDB/IMDB IDs from NFO files for metadata lookup
- Classify every file (images, subtitles, trailers, extras)
- Record file hashes for change detection and asset assurance
- Determine if user intervention is needed before enrichment can proceed

## Core Requirement

Scanning must establish two critical pieces of information:

| Requirement | Source | If Missing |
|-------------|--------|------------|
| **Main movie file** | Largest video or webhook hint | Manual selection required |
| **TMDB ID** | NFO file or webhook context | Manual identification required |

Without both, automatic enrichment cannot proceed.

---

## Three-Phase Classification Pipeline

Scanning uses a sophisticated three-phase pipeline to classify files:

### Phase 1: Fact Gathering

Collects objective metadata about every file **before** making any decisions.

**What gets gathered:**

| File Type | Facts Extracted |
|-----------|-----------------|
| **Video** | Duration, resolution, codec, HDR type, audio tracks, subtitle tracks |
| **Image** | Width, height, aspect ratio, format, alpha channel |
| **Text** | Content sample (10KB), TMDB/IMDB IDs, NFO/subtitle detection |
| **All** | Path, size, modified date, filename patterns (year, resolution, codec tags) |

**Performance optimization:** FFprobe results are cached by file hash. Rescanning a 1000-movie library drops from ~8 hours to ~50 seconds when files haven't changed.

### Phase 2: Classification

Makes classification decisions based on gathered facts using confidence scoring.

**Classification priority order:**
1. Disc structure detection (BDMV/VIDEO_TS)
2. Text files (NFO, subtitles)
3. Video files (main movie vs trailers/extras)
4. Image files (poster, fanart, logo, etc.)
5. Legacy directories (extrafanarts, extrathumbs)

### Phase 3: Processing Decision

Binary decision: **Can we process automatically?**

| Status | Criteria | Action |
|--------|----------|--------|
| `CAN_PROCESS` | Main movie + TMDB ID + all files classified | Proceed to enrichment |
| `CAN_PROCESS_WITH_UNKNOWNS` | Main movie + TMDB ID + some unknowns | Proceed; unknowns recycled at publish |
| `MANUAL_REQUIRED` | Missing main movie OR TMDB ID | User intervention required |

---

## Main Movie Identification

The most critical classification decision. Uses this hierarchy:

| Priority | Method | Confidence |
|----------|--------|------------|
| 1 | Webhook provides exact filename | 100% |
| 2 | Only one video file in directory | 100% |
| 3 | Single candidate after excluding trailers/samples | 95% |
| 4 | Longest duration among candidates | 90% |
| 5 | Multiple videos with identical duration | FAIL |

**Exclusion keywords** (detected in filename):
- trailer, sample, behindthescenes, deleted, featurette, interview, scene, short

Files with these keywords are classified as trailers/extras, not main movie candidates.

**Why main movie matters:** All other assets are named relative to the main movie file. Knowing `Movie.Name.2024.mkv` means we look for `Movie.Name.2024-poster.jpg`, etc.

---

## NFO Processing

NFO files provide the TMDB ID needed for enrichment.

### Priority Order

| Priority | Pattern | Example |
|----------|---------|---------|
| 1 | `<videofilename>.nfo` | `Movie.Name.2024.nfo` |
| 2 | `movie.nfo` | Standard Kodi format |
| 3 | `movie.xml` | Legacy format |
| 4 | Any other `.nfo` | Gap-filling only |

**Merge behavior:** Highest priority NFO provides base data. Lower priority NFOs fill gaps (missing fields only).

### ID Extraction

NFO parsing extracts IDs from multiple formats:

```
XML tags:     <uniqueid type="tmdb">603</uniqueid>
Legacy tags:  <tmdb>603</tmdb>
URLs:         https://www.themoviedb.org/movie/603
Plain text:   tmdb:603 or tt0133093
```

### NFO Caching

Only the highest-priority NFO is cached to `cache_text_files`. This cached copy becomes the source of truth for NFO regeneration during publishing.

---

## Confidence Scoring Model

Every classification gets a confidence score (0-100). Only scores ≥80 are considered reliable.

### Score Thresholds

| Score | Meaning |
|-------|---------|
| 100 | Certain (exact match, webhook hint, exclusion keyword) |
| 90-95 | High confidence (NFO verified, longest duration) |
| 80-85 | Processable (valid dimensions, keyword match with validation) |
| 60-79 | Low confidence (keyword match without dimension validation) |
| <80 | Requires manual review |

### Image Classification Scores

| Match Type | Valid Dimensions | Score |
|------------|------------------|-------|
| Exact filename (`poster.jpg`) | Yes | 100 |
| Exact filename (`poster.jpg`) | No | 85 |
| Keyword in filename | Yes | 80 |
| Keyword in filename | No | 60 |

---

## Disc Structure Detection

Identifies BluRay (BDMV) and DVD (VIDEO_TS) folder structures.

### Detection Paths

| Type | Detection File | Expected NFO Location |
|------|----------------|----------------------|
| BluRay | `BDMV/index.bdmv` | `BDMV/index.nfo` |
| DVD | `VIDEO_TS/VIDEO_TS.IFO` | `VIDEO_TS/VIDEO_TS.nfo` |

### Naming Implications

Disc structures use **short name format** (no movie prefix):

| Normal Directory | Disc Structure |
|------------------|----------------|
| `Movie.Name.2024-poster.jpg` | `poster.jpg` |
| `Movie.Name.2024-fanart.jpg` | `fanart.jpg` |
| `Movie.Name.2024.nfo` | `movie.nfo` |

This affects both classification (what patterns to look for) and publishing (what names to generate).

---

## Asset Dimension Validation

Images are validated against Kodi/MediaElch standards:

| Asset Type | Aspect Ratio | Minimum Size |
|------------|--------------|--------------|
| Poster | 0.65-0.72 (~2:3) | 500×700px |
| Fanart | 1.7-1.85 (~16:9) | 1280×720px |
| Banner | 4.5-6.0 (wide) | 758×140px |
| Logo | 1.5-4.0 (flexible) | 400×100px |
| Disc | 0.95-1.05 (~1:1) | 500×500px |

**Tolerance:** 90% of minimum dimensions still passes validation.

---

## Hash Collection

File hashes enable change detection and asset assurance.

### What Gets Hashed

| File Type | Hash Method | Purpose |
|-----------|-------------|---------|
| Video files | Quick hash (first/last 64KB + size) | Detect upgrades/modifications |
| Image files | SHA256 of content | Content-addressed cache storage |
| NFO files | SHA256 of content | Change detection for regeneration |

### Asset Assurance

Hashes are the foundation of asset assurance:

1. **First scan:** Hash computed and stored
2. **Rescan:** New hash compared to stored hash
3. **Hash mismatch:** File changed → re-extract metadata
4. **Hash match:** Skip re-processing → massive performance gain

---

## Unknown Files

Files that can't be classified are marked as unknown.

### What Happens to Unknowns

1. Stored in `unknown_files` table during scanning
2. Don't block automatic processing (if main movie + TMDB ID exist)
3. Recycled during publishing phase
4. User can manually classify before publish

### Common Unknown File Types

- Release group `.txt` files
- `.nfo` files without valid content
- Images with non-standard names
- Audio commentary tracks

---

## Database Operations

### Tables Created/Updated During Scanning

| Table | Purpose |
|-------|---------|
| `movies` | Core movie record with title, year, TMDB ID |
| `cache_video_files` | Video file metadata and hash |
| `cache_image_files` | Discovered artwork |
| `cache_text_files` | NFO file content |
| `movie_genres` | Genres from NFO |
| `movie_crew` | Directors/writers from NFO |
| `movie_studios` | Studios from NFO |
| `unknown_files` | Unclassified files for recycling |

### State Transitions

```
Movie created → identification_status = 'unidentified'
TMDB ID found → identification_status = 'identified'
Conflicting IDs → status = 'ambiguous_nfo'
```

---

## Trigger Conditions

| Trigger | Source | Priority | Context Provided |
|---------|--------|----------|------------------|
| Webhook (Radarr) | Download event | CRITICAL (2) | TMDB ID, path |
| Manual scan | User action | HIGH (10) | None |
| Scheduled scan | Timer | LOW (9) | None |
| File watcher | Directory change | NORMAL (5) | None |

**Webhook advantage:** Provides TMDB ID directly, bypassing NFO parsing.

---

## Auto-Enrichment Chain

After successful scanning (if `library.auto_enrich = true`):

1. Scan completes with `CAN_PROCESS` status
2. `enrich-metadata` job automatically queued
3. Enrichment begins without user intervention

---

## Configuration

| Setting | Location | Effect |
|---------|----------|--------|
| `auto_enrich` | Per-library | Auto-queue enrichment after scan |
| Library paths | `libraries` table | Which directories to scan |

---

## Error Handling

| Error | Behavior |
|-------|----------|
| No video file found | Scan fails, error logged |
| NFO parse failure | Continue without TMDB ID (manual required) |
| FFprobe timeout | Retry, then skip video analysis |
| Image analysis failure | Skip image, continue scan |
| Multiple identical durations | Mark as `MANUAL_REQUIRED` |

---

## Related Documentation

**Conceptual:**
- [Scanning Overview](../../concepts/Scanning/README.md) - Scanning concepts
- [Discovery](../../concepts/Scanning/DISCOVERY.md) - File enumeration and fact gathering
- [Classification](../../concepts/Scanning/CLASSIFICATION.md) - File categorization and processing decision
- [Identity](../../concepts/Scanning/IDENTITY.md) - NFO and filename parsing for IDs

**Next Step:**
- [Enrichment](../../concepts/Enrichment/README.md) - Gather data from providers after scanning

## Related Services

| Service | File | Purpose |
|---------|------|---------|
| `scanMovieDirectory` | [unifiedScanService.ts](../../../src/services/scan/unifiedScanService.ts) | Main orchestrator |
| `gatherAllFacts` | [factGatheringService.ts](../../../src/services/scan/factGatheringService.ts) | Phase 1: Fact gathering |
| `classifyDirectory` | [classificationService.ts](../../../src/services/scan/classificationService.ts) | Phase 2: Classification |
| `canProcessDirectory` | [processingDecisionService.ts](../../../src/services/scan/processingDecisionService.ts) | Phase 3: Decision |

---

## Next Phase

→ [Scraping](./02-SCRAPING.md)
