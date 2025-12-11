# File Classification

Classification takes discovered facts and assigns each file a category, then determines if automatic processing can proceed.

## Purpose

Classification answers: **"What is each file, and can we process automatically?"**

- Categorize every file by type and purpose
- Identify the main movie file
- Validate images against dimension standards
- Decide: automatic processing or manual intervention

## Process Flow

```
CLASSIFICATION
    │
    ├──► CATEGORIZE FILES
    │         └──► Text files (NFO, subtitles)
    │         └──► Video files (main movie, trailers, extras)
    │         └──► Image files (poster, fanart, logo, etc.)
    │         └──► Unknown files
    │
    ├──► IDENTIFY MAIN MOVIE
    │         └──► Apply identification hierarchy
    │         └──► Assign confidence score
    │
    ├──► VALIDATE IMAGES
    │         └──► Check dimensions against standards
    │         └──► Adjust confidence based on validation
    │
    └──► PROCESSING DECISION
              └──► CAN_PROCESS: main movie + ID found
              └──► MANUAL_REQUIRED: missing main movie OR ID
```

---

## Confidence Scoring

Every classification gets a confidence score (0-100).

| Score | Meaning | Action |
|-------|---------|--------|
| 100 | Certain | Process automatically |
| 90-99 | High confidence | Process automatically |
| 80-89 | Processable | Process automatically |
| 60-79 | Low confidence | May need review |
| <60 | Unreliable | Requires manual review |

**Threshold:** Only scores ≥80 are considered reliable for automatic processing.

---

## Main Movie Identification

The most critical classification decision. Uses this hierarchy:

| Priority | Method | Confidence |
|----------|--------|------------|
| 1 | Webhook provides exact filename | 100 |
| 2 | Only one video file in directory | 100 |
| 3 | Single candidate after excluding trailers/samples | 95 |
| 4 | Longest duration among candidates | 90 |
| 5 | Multiple videos with identical duration | FAIL |

### Exclusion Keywords

Files with these keywords are classified as trailers/extras, not main movie candidates:

- trailer, sample, behindthescenes, deleted
- featurette, interview, scene, short

### Why Main Movie Matters

All other assets are named relative to the main movie file:

```
Main movie: Movie.Name.2024.mkv
Expected:   Movie.Name.2024-poster.jpg
            Movie.Name.2024-fanart.jpg
            Movie.Name.2024.nfo
```

---

## Image Classification

Images are classified by filename patterns and validated by dimensions.

### Classification by Filename

| Pattern | Asset Type |
|---------|------------|
| `poster.jpg`, `*-poster.jpg` | Poster |
| `fanart.jpg`, `*-fanart.jpg` | Fanart |
| `logo.png`, `*-logo.png` | Logo |
| `clearart.png`, `*-clearart.png` | Clearart |
| `banner.jpg`, `*-banner.jpg` | Banner |
| `disc.png`, `*-disc.png` | Disc |
| `thumb.jpg`, `*-thumb.jpg` | Thumb |

### Dimension Validation

Images validated against Kodi/MediaElch standards:

| Asset Type | Aspect Ratio | Minimum Size |
|------------|--------------|--------------|
| Poster | 0.65-0.72 (~2:3) | 500×700px |
| Fanart | 1.7-1.85 (~16:9) | 1280×720px |
| Banner | 4.5-6.0 (wide) | 758×140px |
| Logo | 1.5-4.0 (flexible) | 400×100px |
| Disc | 0.95-1.05 (~1:1) | 500×500px |

**Tolerance:** 90% of minimum dimensions still passes.

### Confidence Based on Validation

| Match Type | Valid Dimensions | Confidence |
|------------|------------------|------------|
| Exact filename (`poster.jpg`) | Yes | 100 |
| Exact filename (`poster.jpg`) | No | 85 |
| Keyword in filename | Yes | 80 |
| Keyword in filename | No | 60 |

---

## Text File Classification

| Extension | Content Check | Classification |
|-----------|---------------|----------------|
| `.nfo` | Contains XML or IDs | NFO |
| `.nfo` | No valid content | Unknown |
| `.srt`, `.sub`, `.ass` | - | Subtitle |
| `.txt` | - | Unknown |

---

## Unknown Files

Files that can't be classified are marked as unknown.

- Stored in `unknown_files` table
- Don't block automatic processing
- Recycled during publishing phase
- User can manually classify

### Common Unknowns

- Release group `.txt` files
- Invalid `.nfo` files
- Images with non-standard names
- Audio commentary tracks

---

## Processing Decision

The final output of classification: can we proceed automatically?

### Decision Criteria

| Status | Criteria |
|--------|----------|
| `CAN_PROCESS` | Main movie (≥80 confidence) + TMDB ID + all files classified |
| `CAN_PROCESS_WITH_UNKNOWNS` | Main movie + TMDB ID + some unknowns |
| `MANUAL_REQUIRED` | Missing main movie OR missing TMDB ID |

### Core Requirements

Two things are **required** for automatic enrichment:

1. **Main movie file** - Which video is THE movie?
2. **TMDB ID** - What movie is this?

Without both, the system cannot proceed automatically.

### Auto-Enrichment Chain

If decision is `CAN_PROCESS` and `auto_enrich = true`:

```
Classification complete
    ↓
Queue enrich-metadata job
    ↓
Enrichment begins automatically
```

---

## Output

After classification:

- Every file has a category and confidence score
- Main movie identified (or flagged as missing)
- Processing decision made
- Ready for [Identity Extraction](./IDENTITY.md) (if ID not yet found)
- Or ready for enrichment (if ID found)
