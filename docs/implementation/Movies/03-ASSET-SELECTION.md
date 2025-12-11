# Asset Selection (Movie Implementation)

Scores candidates using provider metadata, downloads in ranked order, and uses perceptual hashing to ensure unique selections.

**Conceptual Reference:** [Downloading Concepts](../../concepts/Enrichment/DOWNLOADING.md)

## Purpose

Asset selection answers: **"Which assets should we keep for this movie?"**

- Score all candidates using provider metadata (no download required)
- Download top candidate for each asset type
- Generate perceptual hash (pHash) to detect duplicates
- Skip duplicates and continue to next candidate
- Repeat until asset limit reached with unique assets

## Key Design Principle

**Download during selection, not before.**

```
OLD APPROACH (wasteful):
  Download ALL candidates → Analyze ALL → Score ALL → Select best
  Problem: Downloads many unused images

NEW APPROACH (efficient):
  Score using provider data → Download top candidate → pHash →
  If duplicate, try next → Continue until limit reached
  Result: Only downloads what we need
```

---

## Process Flow

```
For each asset type (poster, fanart, logo, etc.):
    │
    ├──► 1. SCORE all candidates using provider metadata
    │         └──► Sort by score descending
    │         └──► No downloads yet
    │
    ├──► 2. DOWNLOAD top unprocessed candidate
    │         └──► Save to cache directory
    │         └──► Generate SHA256 hash (for content-addressed storage)
    │         └──► Generate pHash (for visual deduplication)
    │
    ├──► 3. CHECK for duplicate
    │         └──► Compare pHash to already-selected assets (same type)
    │         ├──► Hamming distance < 10 → DUPLICATE
    │         │         └──► Discard, continue to next candidate
    │         │
    │         └──► Hamming distance >= 10 → UNIQUE
    │                   └──► Accept, mark as selected
    │
    ├──► 4. CACHE the file
    │         └──► Move to content-addressed path
    │         └──► Create cache_image_files record
    │
    └──► 5. REPEAT until selected_count == asset_limit
              └──► Or no more candidates
```

---

## Scoring Algorithm

Score calculated from provider metadata (no download needed):

```
score = (resolution_score * 0.35) +
        (language_score * 0.30) +
        (provider_score * 0.20) +
        (vote_score * 0.15)
```

### Resolution Score (35%)

Based on provider-reported dimensions:

| Resolution | Score |
|------------|-------|
| 4K (3840+ width) | 100 |
| 1080p (1920+ width) | 85 |
| 720p (1280+ width) | 70 |
| SD (below 720) | 50 |
| Unknown | 60 |

### Language Score (30%)

| Match | Score |
|-------|-------|
| Matches preferred language | 100 |
| Neutral/textless | 80 |
| Different language | 40 |

### Provider Score (20%)

| Provider | Score | Rationale |
|----------|-------|-----------|
| Fanart.tv | 90 | Curated, high quality |
| TMDB | 80 | Large catalog |
| TVDB | 70 | Supplemental |

### Vote Score (15%)

Normalized from provider vote counts to 0-100 scale.

---

## Perceptual Hash Deduplication

### Why pHash?

Different providers often have the same image with minor differences:
- Different resolutions
- Different compression levels
- Slightly cropped
- Color adjusted

Byte-level comparison (SHA256) would miss these. pHash compares visual content.

### How pHash Works

```
Image → Resize to 32x32 → DCT transform → Extract top-left 8x8 → Binary hash
```

Two similar images produce similar hashes. Difference measured by Hamming distance (number of bit flips).

### Duplicate Threshold

| Hamming Distance | Interpretation |
|------------------|----------------|
| 0-5 | Nearly identical |
| 6-10 | Same image, minor differences |
| 11-20 | Similar but different |
| 21+ | Different images |

**Threshold: < 10 = duplicate**

---

## Example: Selecting 3 Posters

```
Candidates (after scoring, not yet downloaded):
1. TMDB poster A (score: 92)
2. Fanart.tv poster B (score: 88)
3. TMDB poster C (score: 85)
4. Fanart.tv poster D (score: 82)
5. TMDB poster E (score: 78)

Selection process (limit = 3):

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
Downloads: 5 (instead of downloading all candidates)
```

---

## Cache Storage

Selected assets stored in content-addressed cache:

```
/data/cache/images/{hash[0:2]}/{hash}.{ext}

Example:
  SHA256 = "0a1b2c3d4e5f..."
  Path = /data/cache/images/0a/0a1b2c3d4e5f...jpg
```

### Database Records

**provider_assets** - Track candidate state:

| Field | Update |
|-------|--------|
| `score` | Calculated score |
| `is_selected` | true for selected |
| `is_rejected` | true for duplicates |
| `selected_at` | Timestamp |
| `selected_by` | 'auto' or 'user' |
| `perceptual_hash` | pHash value |

**cache_image_files** - Track cached files:

| Field | Value |
|-------|-------|
| `content_hash` | SHA256 of file |
| `cache_path` | Path in cache directory |
| `width`, `height` | Actual dimensions |
| `perceptual_hash` | pHash for dedup |

---

## Concurrency Model

### Within Asset Type: Sequential

Downloads are sequential within an asset type to enable pHash comparison:
- Must compare new download against already-selected
- Cannot parallelize without risk of selecting duplicates

### Across Asset Types: Parallel

Different asset types can process in parallel:
- Poster selection doesn't affect fanart selection
- Multiple workers, one per asset type

### Multiple Workers Per Job

Each enrichment job can use a worker pool:
- Worker 1: Handles poster selection
- Worker 2: Handles fanart selection
- Worker 3: Handles logo selection
- etc.

---

## Manual Selection Mode

When `autoSelectAssets = false`:

1. Scoring still runs (displayed in UI)
2. Downloads don't happen automatically
3. User views scored candidates in UI
4. User selects which assets to keep
5. Selected assets download on demand
6. pHash still generated (for future dedup reference)

---

## Configuration

| Setting | Effect |
|---------|--------|
| `autoSelectAssets` | Enable/disable auto-selection |
| `preferredLanguage` | Language for scoring |
| `asset_limit_{type}` | Max unique selections per type |

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| No candidates | Skip type, log warning |
| All candidates duplicate | Select first only |
| Download fails | Try next candidate |
| Provider dimensions wrong | Still select (pHash is the truth) |
| Limit = 0 | Skip type entirely |
| pHash generation fails | Skip asset, try next |

---

## Error Handling

| Error | Behavior |
|-------|----------|
| Download 404 | Mark unavailable, try next |
| Download timeout | Retry once, then skip |
| Invalid image | Skip, try next |
| Disk full | Pause, alert user |
| All candidates fail | Mark type incomplete |

---

## Output

After asset selection completes:

- Each asset type has up to N unique assets selected
- All selected assets stored in content-addressed cache
- pHashes stored for future deduplication
- Duplicates marked as rejected
- Ready for [Actor Enrichment](./04-ACTOR-ENRICHMENT.md)

---

## Related Services

| Service | File | Purpose |
|---------|------|---------|
| `AssetSelectionPhase` | `src/services/enrichment/phases/AssetSelectionPhase.ts` | Main selection logic |
| `AssetScorer` | `src/services/AssetScorer.ts` | Scoring algorithm |
| `PerceptualHashService` | `src/services/PerceptualHashService.ts` | pHash generation |
| `ImageDownloader` | `src/services/ImageDownloader.ts` | Download handling |
| `CacheService` | `src/services/CacheService.ts` | Cache storage |

---

## Previous Phase

← [Scraping](./02-SCRAPING.md)

## Next Phase

→ [Actor Enrichment](./04-ACTOR-ENRICHMENT.md)
