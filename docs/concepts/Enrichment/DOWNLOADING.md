# Downloading (Enrichment Step 2)

Score candidates, download in ranked order, and deduplicate using perceptual hashing.

## Purpose

After [Scraping](./SCRAPING/README.md) populates the provider cache with candidate URLs, downloading:

1. Scores all candidates using provider metadata (no download yet)
2. Downloads top candidate to temp directory
3. Generates perceptual hash (pHash)
4. Checks for duplicates against already-selected assets
5. Repeats until asset limit reached with unique assets

---

## Process Flow

```
For each asset type (poster, fanart, logo, etc.):
    │
    ├──► SCORE all candidates
    │         └──► Use provider metadata (dimensions, votes, language)
    │         └──► Sort by score descending
    │         └──► No downloads needed for scoring
    │
    ├──► DOWNLOAD LOOP
    │         │
    │         ├──► Download top unprocessed candidate
    │         │         └──► Save to temp directory
    │         │
    │         ├──► Generate SHA256 + pHash
    │         │
    │         ├──► Check for exact duplicate (SHA256)
    │         │         └──► If hash exists in cache → reuse existing
    │         │
    │         ├──► Check for visual duplicate (pHash)
    │         │         ├──► ≥90% similarity → DUPLICATE
    │         │         │         └──► Mark rejected, continue loop
    │         │         │
    │         │         └──► <90% similarity → UNIQUE
    │         │                   └──► Accept, move to cache
    │         │
    │         └──► Repeat until selected_count == asset_limit
    │                   └──► Or no more candidates
    │
    └──► OUTPUT: Unique assets in temp directory, ready for caching
```

---

## Scoring Algorithm

Score calculated from provider metadata (no download required). Total possible: 100 points.

```
score = resolution_score (0-30) +
        aspect_ratio_score (0-20) +
        language_score (0-20) +
        vote_score (0-20) +
        provider_score (0-10)
```

### Resolution Score (0-30 points)

Based on total pixel count compared to ideal resolution for the asset type:

| Asset Type | Ideal Resolution | Ideal Pixels |
|------------|------------------|--------------|
| Poster | 2000x3000 | 6,000,000 |
| Fanart | 1920x1080 | 2,073,600 |
| Other | 1000x1000 | 1,000,000 |

Score scales linearly up to 1.5x ideal (max 30 points for high-res assets).

### Aspect Ratio Score (0-20 points)

Penalizes images that deviate from expected aspect ratio:

| Asset Type | Ideal Ratio |
|------------|-------------|
| Poster | 2:3 (0.667) |
| Fanart | 16:9 (1.778) |
| Clearlogo | 4:1 (wide) |

Score = max(0, 20 - deviation × 100)

### Language Score (0-20 points)

| Match | Points |
|-------|--------|
| Matches user's preferred language | 20 |
| Language-neutral (no text/logos) | 18 |
| English (universal fallback) | 15 |
| Other languages | 5 |

### Vote Score (0-20 points)

Community votes from provider, weighted by confidence:

```
normalized = vote_average / 10  (0-1 scale)
weight = min(vote_count / 50, 1.0)  (need 50+ votes for full confidence)
score = normalized × weight × 20
```

### Provider Score (0-10 points)

| Provider | Points | Rationale |
|----------|--------|-----------|
| TMDB | 10 | Highest quality, most votes |
| Fanart.tv | 9 | Curated, high quality |
| TVDB | 8 | Good for TV shows |
| Unknown | 5 | Default |

---

## Perceptual Hash Deduplication

### Why pHash?

Different providers often have the same image:
- Different resolutions
- Different compression
- Slightly cropped
- Color adjusted

Byte-level comparison would miss these. pHash compares visual content.

### How It Works

```
Image → Resize to 32x32 → DCT transform → Extract top-left 8x8 → Binary hash
```

Two similar images produce similar hashes. Difference measured by Hamming distance (bit flips).

### Duplicate Threshold

Uses **90% similarity** threshold (restrictive to catch similar movie posters):

| Similarity | Hamming Distance (64-bit) | Interpretation |
|------------|---------------------------|----------------|
| 95-100% | 0-3 bits | Nearly identical |
| 90-95% | 4-6 bits | Same image, minor differences |
| 80-90% | 7-13 bits | Similar but different |
| <80% | 14+ bits | Different images |

**Threshold: ≥90% similarity = duplicate**

This restrictive threshold ensures visually similar posters (same artwork with different text, crops, or color grades) are detected as duplicates.

---

## Example: Selecting 3 Posters

```
Candidates (after scoring):
1. TMDB poster A (score: 92)
2. Fanart.tv poster B (score: 88)
3. TMDB poster C (score: 85)
4. Fanart.tv poster D (score: 82)
5. TMDB poster E (score: 78)

Download loop (limit = 3):

Round 1:
  Download A → pHash: 0x1234... → No existing → ACCEPT
  selected_count = 1

Round 2:
  Download B → pHash: 0x1235... → Distance to A = 3 → DUPLICATE, SKIP

Round 3:
  Download C → pHash: 0x5678... → Distance to A = 42 → UNIQUE → ACCEPT
  selected_count = 2

Round 4:
  Download D → pHash: 0x1236... → Distance to A = 4 → DUPLICATE, SKIP

Round 5:
  Download E → pHash: 0x9ABC... → Distance to A = 38, to C = 45 → UNIQUE → ACCEPT
  selected_count = 3 (limit reached)

Result: A, C, E selected (3 unique posters)
Downloads: 5 (instead of all candidates)
```

---

## Temp Directory Structure

During download:

```
/data/temp/enrichment/{job_id}/
├── poster_001.jpg      (candidate A)
├── poster_003.jpg      (candidate C)
├── poster_005.jpg      (candidate E)
├── fanart_001.jpg
└── ...
```

Files are numbered by candidate rank, not final selection order.

---

## Concurrency Model

### Within Asset Type: Sequential

Downloads are sequential within an asset type to enable pHash comparison:
- Must compare new download against already-selected
- Cannot parallelize without risk of selecting duplicates

### Across Asset Types: Parallel

Different asset types can process in parallel:
- Poster downloads don't affect fanart selection
- Multiple workers, one per asset type

### Across Enrichment Jobs: Parallel

Multiple media items can enrich simultaneously:
- Each job is independent
- Worker pool handles job distribution

---

## Error Handling

| Error | Behavior |
|-------|----------|
| Download fails | Try next candidate |
| pHash fails | Skip asset, log error |
| All candidates fail | Mark asset type incomplete |
| Timeout | Retry once, then skip |

---

## Manual Selection Mode

When `autoSelectAssets = false`:

- Scoring still runs (for UI display)
- Downloads don't happen automatically
- User views scored candidates in UI
- User selects which to download
- Selected assets download on demand

---

## Output

After downloading completes:

- Unique assets in temp directory
- pHash stored for each downloaded asset
- Duplicate candidates marked as rejected
- Ready for [Caching](./CACHING.md)

---

## Implementation

For movie-specific implementation details:
→ [Movies: 03-ASSET-SELECTION.md](../../implementation/Movies/03-ASSET-SELECTION.md)

## Related Documentation

- [Scraping](./SCRAPING/README.md) - Previous step (provides candidates)
- [Caching](./CACHING.md) - Next step (permanent storage)
