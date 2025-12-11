# Asset Scoring Algorithm

**Purpose**: Deep dive into the asset scoring algorithm used during enrichment to select the best artwork.

**Related Docs**:
- Parent: [Reference Documentation](../INDEX.md#reference-technical-details)
- Related: [Enrichment Phase](../concepts/Enrichment/README.md)

---

## Quick Reference

**Score Range**: 0-100 points

**Components**:
- Resolution (30 points): Pixel count relative to ideal dimensions
- Aspect Ratio (20 points): Closeness to ideal ratio
- Language (20 points): Match to user's preferred language
- Community Votes (20 points): Provider vote average weighted by count
- Provider Priority (10 points): TMDB=10, Fanart.tv=9, TVDB=8

**Goal**: Select high-quality, language-appropriate, community-validated artwork automatically.

---

## Scoring Formula

```typescript
totalScore = resolutionScore + aspectRatioScore + languageScore +
             communityVotesScore + providerPriorityScore;
```

Each component contributes a weighted portion of the final score (max 100 points).

---

## 1. Resolution Score (30 points)

**Goal**: Prefer assets close to ideal dimensions without penalizing excessively large files.

### Ideal Dimensions by Asset Type

| Asset Type | Ideal Width | Ideal Height | Ideal Total Pixels |
|------------|-------------|--------------|-------------------|
| `poster` | 2000 | 3000 | 6,000,000 |
| `fanart` | 1920 | 1080 | 2,073,600 |
| `banner` | 758 | 140 | 106,120 |
| `clearlogo` | 800 | 310 | 248,000 |
| `clearart` | 1000 | 562 | 562,000 |
| `discart` | 1000 | 1000 | 1,000,000 |
| `landscape` | 1920 | 1080 | 2,073,600 |
| `thumb` | 1920 | 1080 | 2,073,600 |

### Formula

```typescript
function calculateResolutionScore(asset: Asset): number {
  const actualPixels = asset.width * asset.height;
  const idealPixels = getIdealPixels(asset.type);

  // Ratio of actual to ideal (1.0 = perfect match)
  const ratio = actualPixels / idealPixels;

  // Score curve: Penalty for too small or too large
  let score: number;

  if (ratio >= 0.9 && ratio <= 1.1) {
    // Perfect range: 90%-110% of ideal = full points
    score = 30;
  } else if (ratio >= 0.7 && ratio <= 1.5) {
    // Good range: 70%-150% of ideal = scaled points
    const deviation = Math.abs(ratio - 1.0);
    score = 30 * (1 - deviation);
  } else if (ratio < 0.7) {
    // Too small: Linear penalty below 70%
    score = 30 * (ratio / 0.7);
  } else {
    // Too large: Diminishing penalty above 150%
    score = 30 * (1.5 / ratio);
  }

  return Math.max(0, Math.min(30, score));
}
```

### Examples

**Poster**:
- `2000x3000` (ideal): **30 points**
- `2100x3150` (105% of ideal): **30 points**
- `1400x2100` (49% of ideal): **21 points**
- `3000x4500` (225% of ideal): **20 points**

**Fanart**:
- `1920x1080` (ideal): **30 points**
- `1280x720` (44% of ideal): **19 points**
- `3840x2160` (400% of ideal): **11 points**

---

## 2. Aspect Ratio Score (20 points)

**Goal**: Prefer assets with correct aspect ratio to avoid stretching/cropping.

### Ideal Aspect Ratios

| Asset Type | Ideal Ratio | Decimal |
|------------|-------------|---------|
| `poster` | 2:3 | 0.6667 |
| `fanart` | 16:9 | 1.7778 |
| `banner` | 5.414:1 | 5.4143 |
| `clearlogo` | 2.58:1 | 2.5806 |
| `clearart` | 1.78:1 | 1.7794 |
| `discart` | 1:1 | 1.0000 |
| `landscape` | 16:9 | 1.7778 |
| `thumb` | 16:9 | 1.7778 |

### Formula

```typescript
function calculateAspectRatioScore(asset: Asset): number {
  const actualRatio = asset.width / asset.height;
  const idealRatio = getIdealRatio(asset.type);

  // Percentage difference from ideal
  const deviation = Math.abs((actualRatio - idealRatio) / idealRatio);

  // Score curve: Perfect match = 20 points, 10% deviation = 0 points
  let score: number;

  if (deviation <= 0.02) {
    // Within 2%: Full points
    score = 20;
  } else if (deviation <= 0.10) {
    // 2%-10%: Linear decay
    score = 20 * (1 - (deviation - 0.02) / 0.08);
  } else {
    // >10%: Zero points
    score = 0;
  }

  return Math.max(0, Math.min(20, score));
}
```

### Examples

**Poster (ideal 2:3 = 0.6667)**:
- `2000x3000` (ratio 0.6667): **20 points**
- `2000x2950` (ratio 0.6780, 1.7% deviation): **20 points**
- `2000x2800` (ratio 0.7143, 7.1% deviation): **8 points**
- `2000x2000` (ratio 1.0000, 50% deviation): **0 points**

---

## 3. Language Score (20 points)

**Goal**: Prioritize assets in user's preferred language.

### Configuration

User sets preferred language via settings (ISO 639-1 code, e.g., `en`, `fr`, `de`).

### Formula

```typescript
function calculateLanguageScore(asset: Asset, preferredLanguage: string): number {
  if (!asset.language) {
    // No language specified: Assume universal (e.g., logos, fanart)
    return 10; // Neutral score
  }

  if (asset.language === preferredLanguage) {
    // Exact match
    return 20;
  }

  if (asset.language === 'en' && preferredLanguage !== 'en') {
    // English fallback (widely understood)
    return 12;
  }

  // Wrong language
  return 0;
}
```

### Examples

**User prefers English (`en`)**:
- Asset language `en`: **20 points**
- Asset language `null` (logo): **10 points**
- Asset language `fr`: **0 points**

**User prefers French (`fr`)**:
- Asset language `fr`: **20 points**
- Asset language `en`: **12 points** (fallback)
- Asset language `de`: **0 points**

---

## 4. Community Votes Score (20 points)

**Goal**: Prefer assets validated by the community through votes/likes.

### Data Sources

- **TMDB**: `vote_average` (0-10 scale), `vote_count`
- **TVDB**: `ratingsInfo.average` (0-10 scale), `ratingsInfo.count`
- **Fanart.tv**: `likes` (count only)

### Formula

```typescript
function calculateCommunityVotesScore(asset: Asset): number {
  const metadata = JSON.parse(asset.provider_metadata);

  let voteAverage = 0;
  let voteCount = 0;

  if (asset.provider_name === 'tmdb') {
    voteAverage = metadata.vote_average || 0;
    voteCount = metadata.vote_count || 0;
  } else if (asset.provider_name === 'tvdb') {
    voteAverage = metadata.ratingsInfo?.average || 0;
    voteCount = metadata.ratingsInfo?.count || 0;
  } else if (asset.provider_name === 'fanart') {
    voteAverage = 7.0; // Assume good quality if liked
    voteCount = metadata.likes || 0;
  }

  // Weighted score: Average quality × logarithmic vote count
  const qualityScore = (voteAverage / 10) * 15; // Max 15 points for 10/10 rating
  const popularityBonus = Math.min(5, Math.log10(voteCount + 1)); // Max 5 points for high vote count

  return qualityScore + popularityBonus;
}
```

### Examples

**TMDB Poster**:
- `vote_average: 8.5`, `vote_count: 1000`: **12.75 + 3 = 15.75 points**
- `vote_average: 6.0`, `vote_count: 10`: **9 + 1 = 10 points**
- `vote_average: 9.0`, `vote_count: 5`: **13.5 + 0.7 = 14.2 points**

**Fanart.tv Logo**:
- `likes: 50`: **10.5 + 1.7 = 12.2 points**
- `likes: 5`: **10.5 + 0.7 = 11.2 points**

---

## 5. Provider Priority Score (10 points)

**Goal**: Break ties by preferring higher-quality providers.

### Provider Rankings

| Provider | Points | Rationale |
|----------|--------|-----------|
| **TMDB** | 10 | Largest catalog, good quality, comprehensive metadata |
| **Fanart.tv** | 9 | Highest quality artwork, community-curated |
| **TVDB** | 8 | Best for TV content, similar quality to TMDB |

### Formula

```typescript
function calculateProviderPriorityScore(asset: Asset): number {
  const priorityMap = {
    'tmdb': 10,
    'fanart': 9,
    'tvdb': 8,
  };

  return priorityMap[asset.provider_name] || 5; // Default 5 for unknown providers
}
```

---

## Complete Scoring Example

**Asset**: TMDB Poster for "The Matrix"

**Dimensions**: `2000x3000`
**Language**: `en` (user prefers `en`)
**Metadata**: `vote_average: 8.2`, `vote_count: 456`
**Provider**: TMDB

### Calculation

1. **Resolution Score**:
   - Actual pixels: `2000 * 3000 = 6,000,000`
   - Ideal pixels: `6,000,000`
   - Ratio: `1.0` (perfect)
   - **Score: 30 points**

2. **Aspect Ratio Score**:
   - Actual ratio: `2000 / 3000 = 0.6667`
   - Ideal ratio: `0.6667`
   - Deviation: `0%`
   - **Score: 20 points**

3. **Language Score**:
   - Asset language: `en`
   - User preference: `en`
   - **Score: 20 points**

4. **Community Votes Score**:
   - Quality: `(8.2 / 10) * 15 = 12.3`
   - Popularity: `log10(456 + 1) = 2.66`
   - **Score: 12.3 + 2.66 = 14.96 points**

5. **Provider Priority Score**:
   - Provider: TMDB
   - **Score: 10 points**

**Total Score**: `30 + 20 + 20 + 14.96 + 10 = 94.96 points`

---

## Tie-Breaking

If two assets have identical scores:

1. **Provider priority** (already in score)
2. **Vote count** (higher vote count wins)
3. **File size** (smaller file size wins for bandwidth efficiency)
4. **Provider asset ID** (deterministic fallback)

---

## Tuning Recommendations

**For high-resolution preference**:
- Increase resolution score weight to 40 points
- Decrease aspect ratio to 15 points

**For language-first selection**:
- Increase language score to 30 points
- Decrease resolution to 25 points

**For community validation**:
- Increase community votes to 30 points
- Decrease provider priority to 5 points

**Configuration**: Update `AssetScoringConfig` in settings.

---

## Edge Cases

### No Language Metadata
- Default to 10 points (neutral)
- Assume universal assets (logos, fanart)

### Zero Votes
- Still score based on resolution and aspect ratio
- Provider priority provides baseline quality

### Extremely Large Files
- Diminishing returns above 150% of ideal resolution
- Prevents selecting unnecessarily large files

### Invalid Dimensions
- Assets with `width: 0` or `height: 0` score 0 points
- Filtered out before scoring

---

## Implementation Notes

**Performance**: Scoring is cached in `provider_assets.score` column. Re-calculated only when:
- Manual refresh requested
- Provider metadata updated
- User changes language preference

**See**: [Enrichment Phase](../concepts/Enrichment/README.md) for how scores are used in asset selection.
