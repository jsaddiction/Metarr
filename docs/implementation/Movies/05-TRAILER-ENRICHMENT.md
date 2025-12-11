# Trailer Enrichment (Movie Implementation)

Searches YouTube for trailer candidates, scores them, and downloads the best option.

## Purpose

Trailer enrichment answers: **"What's the best trailer for this movie?"**

- Search YouTube for movie trailers
- Score candidates by quality, official status, and popularity
- Download the best trailer
- Store in cache for publishing

## Skip Conditions

Trailer enrichment skips when:

- `asset_limit_trailer = 0` (trailers disabled)
- Movie already has a selected trailer
- YouTube is inaccessible

---

## Process Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     TRAILER SEARCH                               │
│  Build query: "{title} {year} official trailer"                 │
│  Search YouTube via yt-dlp                                      │
│  Filter by duration (30s - 5min)                                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                   CANDIDATE GATHERING                            │
│  Extract metadata: title, duration, views, channel              │
│  Parse available quality formats                                │
│  Store in trailer_candidates table                              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      SCORING                                     │
│  Apply scoring formula (official, quality, popularity, recency) │
│  Rank candidates by score                                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                     SELECTION                                    │
│  Select highest scoring candidate                               │
│  Queue download job                                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                     DOWNLOAD                                     │
│  yt-dlp fetches video at target quality                         │
│  Store in cache directory                                       │
│  Update database with file reference                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Search Strategies

Multiple search queries for coverage:

| Priority | Query Pattern |
|----------|---------------|
| 1 | `{title} {year} official trailer` |
| 2 | `{title} {year} trailer` |
| 3 | `{title} movie trailer` |

### Filtering Criteria

| Criterion | Value | Purpose |
|-----------|-------|---------|
| Duration | 30s - 5min | Exclude clips and full movies |
| Title keywords | "trailer" | Relevance check |
| Channel | Verified preferred | Quality indicator |

---

## Scoring Algorithm

```
score = (official_score * 0.35) +
        (quality_score * 0.30) +
        (popularity_score * 0.20) +
        (recency_score * 0.15)
```

### Official Score (35%)

| Indicator | Score |
|-----------|-------|
| Title contains "Official" | +40 |
| Verified channel | +30 |
| Studio channel | +30 |
| User upload | 0 |

### Quality Score (30%)

| Resolution | Score |
|------------|-------|
| 4K (2160p) | 100 |
| 1080p | 85 |
| 720p | 70 |
| 480p | 50 |
| Lower | 30 |

### Popularity Score (20%)

Logarithmic scale of view count:

| Views | Score |
|-------|-------|
| 10M+ | 100 |
| 1M+ | 80 |
| 100K+ | 60 |
| 10K+ | 40 |
| Below | 20 |

### Recency Score (15%)

Based on upload date relative to movie release:

| Timing | Score |
|--------|-------|
| Within release window | 100 |
| Within 1 year | 80 |
| Older | 60 |

---

## Download Process

Selected trailer downloaded via yt-dlp:

1. `download-trailer` job queued
2. yt-dlp fetches at best available quality (prefer 1080p)
3. File stored in cache: `/data/cache/videos/{hash}.mp4`
4. Database updated with file reference

### Target Quality

| Preference | Quality |
|------------|---------|
| Primary | 1080p |
| Fallback | 720p |
| Minimum | 480p |

---

## Database Schema

### `trailer_candidates` Table

| Column | Purpose |
|--------|---------|
| `media_id` | Link to movie |
| `youtube_id` | YouTube video ID |
| `title` | Video title |
| `duration` | Length in seconds |
| `view_count` | Popularity metric |
| `upload_date` | When uploaded |
| `channel` | Uploader name |
| `formats` | JSON of available qualities |
| `score` | Calculated score |
| `is_selected` | Selection flag |
| `status` | candidate, selected, downloaded |

---

## Manual Selection Mode

When `autoSelectAssets = false`:

1. Candidates presented in UI with scores
2. User previews options (YouTube embeds)
3. User manually picks preferred trailer
4. Selection triggers download job

---

## Error Handling

| Error | Behavior |
|-------|----------|
| No search results | Mark as no trailers available |
| YouTube blocked | Log error, skip phase |
| Rate limited | Backoff, retry |
| Download fails | Retry, then mark failed |
| Invalid video | Filter out, continue |

---

## Configuration

| Setting | Effect |
|---------|--------|
| `asset_limit_trailer` | 0 = disabled, 1 = enabled |
| `autoSelectAssets` | Auto vs manual selection |
| Target quality | Download resolution preference |

---

## Output

After trailer enrichment completes:

- Best trailer selected and scored
- Trailer file downloaded to cache
- Ready for [Publishing](./06-PUBLISHING.md)

---

## Related Services

| Service | File | Purpose |
|---------|------|---------|
| `TrailerAnalysisPhase` | `src/services/enrichment/phases/TrailerPhase.ts` | Search and analysis |
| `TrailerSelectionPhase` | `src/services/enrichment/phases/TrailerSelectionPhase.ts` | Scoring and selection |
| `TrailerService` | `src/services/TrailerService.ts` | Core trailer logic |
| `TrailerDownloader` | `src/services/TrailerDownloader.ts` | yt-dlp integration |
| `YouTubeSearcher` | `src/services/YouTubeSearcher.ts` | YouTube search |

---

## Previous Phase

← [Actor Enrichment](./04-ACTOR-ENRICHMENT.md)

## Next Phase

→ [Publishing](./06-PUBLISHING.md)
