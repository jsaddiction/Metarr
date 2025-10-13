# Auto Selection Algorithm

## Overview

The `AutoSelectionService` implements a **hybrid tier + voting algorithm** to automatically select the "best" asset from multiple providers for each asset type (poster, fanart, logo, etc.).

## Algorithm Design

### Primary Factor: Tier System

Assets are classified into 4 tiers based on language and quality:

| Tier | Criteria | Priority |
|------|----------|----------|
| **Tier 1** | Preferred language + HD quality | Highest |
| **Tier 2** | Preferred language only | High |
| **Tier 3** | HD quality only | Medium |
| **Tier 4** | Everything else | Low |

**HD Quality Definition:**
- Width or height >= 1920px, OR
- Quality field = 'hd' or '4k', OR
- Metadata contains hints: 'HD', 'BluRay', '4K', 'UHD', '1080p', '2160p'

**Language Matching:**
- Exact match: Score 1.0
- Empty/missing (language-neutral): Score 0.5
- Wrong language: Score 0.0

### Within Same Tier: Secondary Factors

When multiple assets are in the same tier, the following comparison order is used:

#### 1. Votes/Likes (if significant difference)
- Compare if both assets have votes
- Threshold: Difference > 50% of smaller value
- If significant: Prefer higher votes
- If not significant: Continue to next factor

#### 2. Resolution (if significant difference)
- Compare if both assets have dimensions
- Threshold: Difference > 10% of smaller resolution
- If significant: Prefer higher resolution (width × height)
- If not significant: Continue to next factor

#### 3. Provider Priority Order (final tie-breaker)
- Use provider order from `DataSelectionService`
- Based on balanced defaults or user custom priorities
- Lower index = higher priority

## Comparison Algorithm

```typescript
function compareAssets(a: AssetScore, b: AssetScore): number {
  // 1. Compare by tier (lower is better)
  if (a.tier !== b.tier) {
    return a.tier - b.tier;
  }

  // 2. Compare by votes (if difference > 50%)
  if (a.votes && b.votes) {
    const threshold = Math.min(a.votes, b.votes) * 0.5;
    if (Math.abs(a.votes - b.votes) > threshold) {
      return b.votes - a.votes; // Higher votes wins
    }
  }

  // 3. Compare by resolution (if difference > 10%)
  if (a.resolution > 0 && b.resolution > 0) {
    const threshold = Math.min(a.resolution, b.resolution) * 0.1;
    if (Math.abs(a.resolution - b.resolution) > threshold) {
      return b.resolution - a.resolution; // Higher resolution wins
    }
  }

  // 4. Use provider priority
  return a.providerPriority - b.providerPriority;
}
```

## Scoring Metrics

### Resolution Score (0-1)

Resolution is scored based on pixel count thresholds:

| Resolution | Pixels | Score |
|------------|--------|-------|
| 8K | 7680×4320 | 1.0 |
| 4K | 3840×2160 | 0.95 |
| 1440p | 2560×1440 | 0.85 |
| 1080p | 1920×1080 | 0.75 |
| 720p | 1280×720 | 0.6 |
| 480p | 854×480 | 0.4 |
| 360p | 640×360 | 0.2 |
| Below 360p | Linear | 0.0-0.2 |

### Aspect Ratio Score (0-1)

Aspect ratio is scored based on deviation from expected ratio:

| Asset Type | Expected Ratio | Example |
|------------|----------------|---------|
| Poster | 0.675 (2:3) | 1000×1426 |
| Fanart | 1.778 (16:9) | 1920×1080 |
| Banner | 5.4 (~10:2) | 1000×185 |
| Clearlogo | 1.0 (variable) | 800×800 |
| Landscape | 1.778 (16:9) | 1920×1080 |

**Deviation scoring:**
- Within 2%: 1.0
- Within 5%: 0.9
- Within 10%: 0.7
- Within 20%: 0.4
- Over 20%: 0.0

### Normalized Display Score (0-1)

For UI display purposes, a normalized score is calculated:

```typescript
score = (5 - tier) / 4  // Base: 1.0 for tier 1, 0.25 for tier 4
  + resolutionScore * 0.2  // Bonus: 0-0.2
  + aspectRatioScore * 0.1  // Bonus: 0-0.1
  + voteScore * 0.15  // Bonus: 0-0.15 (normalized votes/100)
```

Maximum possible score: ~1.45 (capped at 1.0)

## Duplicate Detection

Assets are considered duplicates and filtered out if they match any of:

1. **Same Provider + URL**
   - Provider name matches
   - URL matches exactly

2. **Same Dimensions + File Size**
   - Width matches
   - Height matches
   - File size matches

3. **Same Perceptual Hash**
   - Both have perceptual hash
   - Hashes match exactly

Duplicates are skipped during selection to avoid recommending assets the user already has.

## Example Scenario

### Input Assets

```typescript
TMDB Poster 1: {
  width: 2000, height: 3000,
  language: 'en', votes: 42, quality: 'hd'
}

TMDB Poster 2: {
  width: 1000, height: 1500,
  language: 'en', votes: 15
}

FanArt.tv Poster: {
  width: 1000, height: 1426,
  language: 'en', votes: 125
}
```

### Selection Process

**Step 1: Calculate Tiers**
- TMDB Poster 1: Tier 1 (English + 2000px = HD)
- TMDB Poster 2: Tier 2 (English + 1000px = not HD)
- FanArt.tv: Tier 1 (English + 1000x1426 ≈ HD by aspect)

**Step 2: Compare within Tier 1**
- TMDB Poster 1: 42 votes
- FanArt.tv: 125 votes
- Difference: 125 - 42 = 83
- Threshold: 42 × 0.5 = 21
- 83 > 21 → Significant difference

**Winner:** FanArt.tv poster (highest votes in same tier)

**Reason:** "Best quality in preferred language, High community votes (125)"

## Edge Cases

### Missing Data

| Missing Field | Handling |
|---------------|----------|
| Dimensions | Use 0×0, tier calculation still works |
| Votes | Skip vote comparison, use resolution |
| Language | Treat as language-neutral (score 0.5) |
| Quality field | Check dimensions and metadata hints |
| Metadata | No HD hint detection, rely on dimensions |

### Tie Scenarios

When all comparison factors are equal:
1. Same tier
2. Same votes (or both missing)
3. Same resolution (or both missing)
4. **Result:** Use provider priority order

### Provider Priority

Provider priority order comes from `DataSelectionService`:

**Balanced Mode (default):**
- Movies Images: `fanart_tv > tmdb > local`
- TV Images: `fanart_tv > tvdb > tmdb > local`
- Music Images: `theaudiodb > musicbrainz > local`

**Custom Mode:**
- User-defined order per asset type
- Fallback to balanced if not customized

## Usage

### Basic Usage

```typescript
import { AutoSelectionService } from './services/autoSelectionService';
import { DataSelectionService } from './services/dataSelectionService';

// Initialize services
const dataSelectionService = new DataSelectionService(db);
const autoSelectionService = new AutoSelectionService(db, dataSelectionService);

// Select best assets
const selected = await autoSelectionService.selectBestAssets(
  providerResults,  // AssetCandidatesByProvider
  'movie',          // mediaType
  {
    preferredLanguage: 'en',
    existingAssets: [],  // For duplicate detection
  }
);

// Result
selected.forEach(asset => {
  console.log(`${asset.assetType}: ${asset.providerName}`);
  console.log(`  Score: ${asset.score}`);
  console.log(`  Reason: ${asset.reason}`);
});
```

### Scoring Individual Asset

```typescript
const score = autoSelectionService.scoreAsset(
  asset,           // AssetCandidate
  'poster',        // assetType
  'tmdb',          // providerName
  ['fanart_tv', 'tmdb', 'tvdb'],  // providerOrder
  'en'             // preferredLanguage
);

console.log(`Tier: ${score.tier}`);
console.log(`Score: ${score.score}`);
console.log(`Reason: ${score.reason}`);
```

## Strategy Management

The service also manages auto-selection strategy (balanced vs custom):

```typescript
// Get current strategy
const settings = await autoSelectionService.getStrategy();
console.log(settings.strategy); // 'balanced' or 'custom'

// Set strategy
await autoSelectionService.setStrategy('custom');

// Check strategy
const isBalanced = await autoSelectionService.isBalanced();
```

## Dependencies

- **DataSelectionService:** Provides provider priority order
- **Database:** For storing auto-selection strategy
- **Logger:** For debugging and tracking selections

## Testing Recommendations

1. **Tier Classification Tests**
   - Verify HD detection (resolution, quality field, metadata hints)
   - Verify language matching (exact, neutral, wrong)
   - Test all tier combinations

2. **Comparison Logic Tests**
   - Vote threshold (50% difference)
   - Resolution threshold (10% difference)
   - Provider priority tie-breaking

3. **Duplicate Detection Tests**
   - Same URL detection
   - Same dimensions + file size
   - Perceptual hash matching

4. **Edge Case Tests**
   - Missing dimensions
   - Missing votes
   - Missing language
   - All factors equal

5. **Integration Tests**
   - Multiple providers, multiple asset types
   - Real-world provider data
   - Performance with large candidate sets

## Performance Considerations

- **Time Complexity:** O(n log n) per asset type (due to sorting)
- **Space Complexity:** O(n) for storing scored candidates
- **Optimization:** Duplicate filtering before scoring reduces work
- **Scalability:** Handles hundreds of candidates per asset type efficiently

## Future Enhancements

1. **Machine Learning:** Use historical user selections to refine weights
2. **A/B Testing:** Test different threshold values (currently 50% votes, 10% resolution)
3. **Quality Prediction:** Predict asset quality from metadata patterns
4. **User Feedback Loop:** Learn from user rejections and manual selections
5. **Batch Optimization:** Optimize selections across multiple entities at once
