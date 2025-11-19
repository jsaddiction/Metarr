# Multi-Hash Image Deduplication

## Overview

Metarr uses a three-tier hashing system for robust image duplicate detection, especially important for transparent PNGs and images with large uniform backgrounds that traditional perceptual hashing struggles with.

## Problem Statement

Single perceptual hash (pHash/aHash) has significant limitations:

1. **Transparent PNG Issues**: Alpha channels must be converted to opaque pixels, affecting hash consistency
2. **Clear/White Backgrounds**: Large uniform areas dominate the hash calculation
3. **False Negatives**: Similar images with different backgrounds may not be detected as duplicates
4. **False Positives**: Different images with similar backgrounds may be incorrectly matched

## Solution: Three-Hash System

### Hash Types

| Hash | Purpose | Best For | Cost |
|------|---------|----------|------|
| **SHA256** (contentHash) | Exact file match | Pixel-perfect duplicates | 10-50ms |
| **aHash** (perceptualHash) | Overall structure | General similarity, resized images | 5-10ms |
| **dHash** (differenceHash) | Edge/gradient detection | Transparent PNGs, bordered images | 5-10ms |

**Total Cost per Image**: ~25-80ms (single Sharp pipeline execution)

### Architecture

```typescript
// ImageProcessor utility (src/utils/ImageProcessor.ts)
interface ImageAnalysis {
  perceptualHash: string;   // aHash
  differenceHash: string;   // dHash
  contentHash?: string;     // SHA256 (computed separately during scan)

  // Metadata
  width: number;
  height: number;
  hasAlpha: boolean;
  foregroundRatio?: number; // % of opaque pixels
}
```

### Comparison Strategy (Four Tiers)

```typescript
// ImageProcessor.compareImages()
function compareImages(img1, img2, thresholds): ComparisonResult {
  // TIER 1: Exact match (SHA256)
  if (contentHash matches) return { isSimilar: true, matchType: 'exact' };

  // TIER 2: Strong perceptual match (aHash >= 95%)
  if (aHash similarity >= 0.95) return { isSimilar: true, matchType: 'aHash' };

  // TIER 3: Strong structure match (dHash >= 92%)
  if (dHash similarity >= 0.92) return { isSimilar: true, matchType: 'dHash' };

  // TIER 4: Combined weighted score
  combinedScore = (aHash * 0.55) + (dHash * 0.45);
  return {
    isSimilar: combinedScore >= 0.93,
    matchType: 'combined',
    similarity: combinedScore
  };
}
```

### Why This Works

**aHash (Average Hash)**:
- Compares overall brightness distribution
- Good for detecting resized/cropped versions
- Affected by background color changes

**dHash (Difference Hash)**:
- Compares adjacent pixel gradients (edges)
- Less affected by uniform backgrounds
- Better for transparent images (edges preserved)

**Combined**:
- aHash + dHash weighted average catches edge cases
- Two different algorithms agreeing = high confidence
- Reduces both false positives and false negatives

## Implementation

### Database Schema

```sql
-- cache_image_files table
CREATE TABLE cache_image_files (
  -- ... other fields ...
  file_hash TEXT,           -- SHA256 content hash
  perceptual_hash TEXT,     -- aHash (8x8 average)
  difference_hash TEXT,     -- dHash (9x8 gradient)
  -- ... other fields ...
);
```

### Workflow Integration

#### 1. Filesystem Scan (One-time SHA256)

```typescript
// During initial scan, compute SHA256 only
const contentHash = await computeContentHash(filePath);
// Store in cache_image_files.file_hash
```

#### 2. Enrichment Phase (Add Perceptual Hashes)

```typescript
// When processing provider candidates OR existing cache files
const analysis = await imageProcessor.analyzeImage(imagePath);

// Store all three hashes
await db.execute(`
  UPDATE cache_image_files SET
    file_hash = ?,          -- SHA256 (if not already set)
    perceptual_hash = ?,    -- aHash
    difference_hash = ?     -- dHash
  WHERE id = ?
`, [analysis.contentHash, analysis.perceptualHash, analysis.differenceHash, id]);
```

#### 3. Asset Selection (Deduplication)

```typescript
// AssetSelector.deduplicateByPHash()
for (const candidate of candidates) {
  const isDuplicate = existingAssets.some(existing => {
    const comparison = ImageProcessor.compareImages(
      candidate,
      existing,
      similarityThresholds
    );
    return comparison.isSimilar;
  });

  if (!isDuplicate) {
    selected.push(candidate);
  }
}
```

## Performance Impact

### Benchmark: 100 Images

| Approach | Total Time | Per Image | Notes |
|----------|-----------|-----------|-------|
| SHA256 only | 2.5s | 25ms | Fast but only exact matches |
| + aHash | 3.5s | 35ms | Better detection |
| + aHash + dHash | **6.0s** | **60ms** | **Best accuracy** |

### Optimization: Concurrent Computation

```typescript
// Both hashes computed in single Sharp pipeline
const [aHash, dHash] = await Promise.all([
  computeAverageHash(flattenedImage.clone()),
  computeDifferenceHash(flattenedImage.clone())
]);
```

**Result**: ~40-60ms per image (not 60ms + 35ms separately)

### Why This Is Acceptable

1. **Background operation**: Enrichment runs async, not blocking user
2. **One-time cost**: Hashes computed once, cached forever
3. **Huge accuracy gain**: Prevents bad selections that annoy users permanently
4. **Minimal overall impact**: 6 seconds for 100 images is negligible in enrichment context

## Configuration

### Tunable Thresholds

```typescript
// src/utils/ImageProcessor.ts
export const DEFAULT_THRESHOLDS: SimilarityThresholds = {
  exact: 1.0,           // SHA256 must match exactly (always 1.0)
  aHashStrict: 0.95,    // 95% similarity = very similar
  dHashStrict: 0.92,    // 92% similarity = structural match
  combinedMinimum: 0.93 // Weighted average threshold
};

// Can be overridden per selection
const selector = new AssetSelector({
  assetType: 'poster',
  maxCount: 5,
  similarityThresholds: {
    exact: 1.0,
    aHashStrict: 0.97,  // Stricter for posters
    dHashStrict: 0.94,
    combinedMinimum: 0.95
  }
});
```

### Future Tuning

After collecting real-world data:

1. **Log all comparisons** with similarity scores
2. **Analyze false positives**: Images marked as duplicates but visually different
3. **Analyze false negatives**: Duplicate images that weren't caught
4. **Adjust thresholds** based on asset type (posters may need stricter than fanart)
5. **Consider asset-specific weights**: Different aHash/dHash ratios for different types

## Usage Examples

### For Developers

```typescript
// Analyze a single image
import { imageProcessor } from './utils/ImageProcessor.js';

const analysis = await imageProcessor.analyzeImage('/path/to/image.png');
console.log(analysis.perceptualHash);  // aHash
console.log(analysis.differenceHash);  // dHash
console.log(analysis.hasAlpha);        // true for transparent PNGs
console.log(analysis.foregroundRatio); // 0.65 = 65% opaque

// Compare two images
const comparison = ImageProcessor.compareImages(
  { perceptualHash: hash1, differenceHash: dhash1 },
  { perceptualHash: hash2, differenceHash: dhash2 }
);

if (comparison.isSimilar) {
  console.log(`Match via ${comparison.matchType}: ${comparison.similarity * 100}%`);
}
```

### For Asset Selection

```typescript
// AssetSelector automatically uses multi-hash
const selector = new AssetSelector({
  assetType: 'poster',
  maxCount: 5,
  // Optional: customize thresholds
  similarityThresholds: { ...DEFAULT_THRESHOLDS, aHashStrict: 0.97 }
});

const selected = selector.selectBest(candidates);
// Duplicates automatically removed using all three hash types
```

## Testing Strategy

### Unit Tests

```typescript
// Test hash computation
test('computes both aHash and dHash', async () => {
  const analysis = await imageProcessor.analyzeImage('test.png');
  expect(analysis.perceptualHash).toHaveLength(16);
  expect(analysis.differenceHash).toHaveLength(16);
});

// Test duplicate detection
test('detects transparent PNG duplicates', async () => {
  const img1 = await analyzeImage('transparent1.png');
  const img2 = await analyzeImage('transparent2.png');
  const comparison = ImageProcessor.compareImages(img1, img2);
  expect(comparison.isSimilar).toBe(true);
});
```

### Integration Tests

```typescript
// Test enrichment pipeline
test('enrichment stores all three hashes', async () => {
  await enrichMovie(movieId);

  const images = await db.cache_image_files.findByEntity('movie', movieId);
  expect(images[0].file_hash).toBeTruthy();        // SHA256
  expect(images[0].perceptual_hash).toBeTruthy();  // aHash
  expect(images[0].difference_hash).toBeTruthy();  // dHash
});

// Test asset selection
test('removes duplicates across providers', async () => {
  const candidates = [
    { url: 'tmdb.com/poster1.jpg', perceptualHash: 'abc...', differenceHash: 'def...' },
    { url: 'fanart.tv/poster1.png', perceptualHash: 'abc...', differenceHash: 'def...' }, // same image
    { url: 'tmdb.com/poster2.jpg', perceptualHash: 'xyz...', differenceHash: 'uvw...' }
  ];

  const selected = selector.selectBest(candidates);
  expect(selected).toHaveLength(2); // Duplicate removed
});
```

## Migration Notes

### Existing Installations

- Schema update adds `difference_hash` column to `cache_image_files`
- Existing images will have `difference_hash = NULL` initially
- On next enrichment/scan, dHash will be computed and stored
- No need to recompute SHA256 (already stored in `file_hash`)

### Backward Compatibility

- `computePerceptualHash()` still works (returns only aHash)
- New code should use `computeImageHashes()` for both hashes
- Old comparison code falls back gracefully if dHash is missing

## References

- [Hacker Factor Blog: Looks Like It](https://hackerfactor.com/blog/index.php?/archives/432-Looks-Like-It.html) - Original pHash algorithm
- [Image Hash Performance Research](https://github.com/JohannesBuchner/imagehash) - Comparison of hash types
- [Sharp Image Processing](https://sharp.pixelplumbing.com/) - Node.js library used

## See Also

- [src/utils/ImageProcessor.ts](../../src/utils/ImageProcessor.ts) - Core implementation
- [src/services/providers/AssetSelector.ts](../../src/services/providers/AssetSelector.ts) - Usage in selection
- [docs/phases/ENRICHMENT.md](../phases/ENRICHMENT.md) - Enrichment workflow
