/**
 * Phase 5 Deduplication Algorithm Tests
 *
 * Validates the optimized O(n) hash bucketing algorithm produces
 * identical results to the original O(n²) algorithm while being faster.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';

/**
 * Mock ImageProcessor.hammingSimilarity for testing
 */
class MockImageProcessor {
  /**
   * Calculate Hamming similarity between two hex hashes
   * Returns 0.0-1.0 (1.0 = identical)
   */
  static hammingSimilarity(hash1: string, hash2: string): number {
    if (hash1.length !== hash2.length) {
      return 0;
    }

    const val1 = BigInt('0x' + hash1);
    const val2 = BigInt('0x' + hash2);
    const xor = val1 ^ val2;

    // Count differing bits
    let distance = 0;
    let temp = xor;
    while (temp > 0n) {
      distance += Number(temp & 1n);
      temp >>= 1n;
    }

    // Convert to similarity (0-1)
    const maxBits = hash1.length * 4; // 4 bits per hex char
    return (maxBits - distance) / maxBits;
  }
}

interface ScoredAsset {
  id: number;
  perceptual_hash: string | null;
  score: number;
  name: string; // For debugging
}

/**
 * Original O(n²) algorithm for comparison
 */
function deduplicateNaive(
  scoredAssets: ScoredAsset[],
  threshold: number
): ScoredAsset[] {
  const uniqueAssets: ScoredAsset[] = [];
  const seenHashes = new Set<string>();

  for (const asset of scoredAssets) {
    if (!asset.perceptual_hash) {
      uniqueAssets.push(asset);
      continue;
    }

    let isDuplicate = false;

    for (const seenHash of seenHashes) {
      const similarity = MockImageProcessor.hammingSimilarity(
        asset.perceptual_hash,
        seenHash
      );

      if (similarity >= threshold) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      uniqueAssets.push(asset);
      seenHashes.add(asset.perceptual_hash);
    }
  }

  return uniqueAssets;
}

/**
 * Optimized O(n) algorithm using hash prefix bucketing
 */
function deduplicateOptimized(
  scoredAssets: ScoredAsset[],
  threshold: number
): ScoredAsset[] {
  const uniqueAssets: ScoredAsset[] = [];
  const hashBuckets = new Map<string, ScoredAsset[]>();

  /**
   * Get adjacent hash bucket keys
   */
  function getAdjacentBuckets(bucketKey: string): string[] {
    const adjacent: string[] = [];

    for (let i = 0; i < bucketKey.length; i++) {
      const hexChar = parseInt(bucketKey[i], 16);

      for (let bit = 0; bit < 4; bit++) {
        const flipped = hexChar ^ (1 << bit);
        const newKey =
          bucketKey.substring(0, i) +
          flipped.toString(16) +
          bucketKey.substring(i + 1);
        adjacent.push(newKey);
      }
    }

    return [...new Set(adjacent)].slice(0, 16);
  }

  for (const asset of scoredAssets) {
    if (!asset.perceptual_hash) {
      uniqueAssets.push(asset);
      continue;
    }

    const bucketKey = asset.perceptual_hash.substring(0, 8);
    let isDuplicate = false;

    const bucketsToCheck: string[] = [bucketKey];
    bucketsToCheck.push(...getAdjacentBuckets(bucketKey));

    for (const checkBucket of bucketsToCheck) {
      const candidates = hashBuckets.get(checkBucket) || [];

      for (const candidate of candidates) {
        const similarity = MockImageProcessor.hammingSimilarity(
          asset.perceptual_hash,
          candidate.perceptual_hash!
        );

        if (similarity >= threshold) {
          isDuplicate = true;
          break;
        }
      }

      if (isDuplicate) break;
    }

    if (!isDuplicate) {
      uniqueAssets.push(asset);

      if (!hashBuckets.has(bucketKey)) {
        hashBuckets.set(bucketKey, []);
      }
      hashBuckets.get(bucketKey)!.push(asset);
    }
  }

  return uniqueAssets;
}

describe('Phase 5 Deduplication Algorithm', () => {
  const THRESHOLD = 0.9; // 90% similarity

  describe('Hamming Similarity Calculation', () => {
    it('should calculate identical hashes as 1.0 similarity', () => {
      const hash = '0123456789abcdef';
      expect(MockImageProcessor.hammingSimilarity(hash, hash)).toBe(1.0);
    });

    it('should calculate completely different hashes as low similarity', () => {
      const hash1 = '0000000000000000';
      const hash2 = 'ffffffffffffffff';
      expect(MockImageProcessor.hammingSimilarity(hash1, hash2)).toBe(0);
    });

    it('should calculate 1-bit difference correctly', () => {
      const hash1 = '0000000000000000'; // Binary: 0000...
      const hash2 = '0000000000000001'; // Binary: 0000...0001 (1 bit diff)
      const similarity = MockImageProcessor.hammingSimilarity(hash1, hash2);
      expect(similarity).toBeCloseTo(63 / 64, 3); // 63 matching bits out of 64
    });

    it('should calculate ~10% difference (90% similar)', () => {
      const hash1 = '0000000000000000'; // Binary: all zeros
      const hash2 = '000000000000003f'; // Binary: 6 bits set (6/64 = 9.375% diff)
      const similarity = MockImageProcessor.hammingSimilarity(hash1, hash2);
      expect(similarity).toBeCloseTo(0.90625, 3); // Should be ~90% similar
    });
  });

  describe('Deduplication Correctness', () => {
    it('should remove exact duplicates', () => {
      const assets: ScoredAsset[] = [
        { id: 1, perceptual_hash: 'abcd1234ef015678', score: 100, name: 'A' },
        {
          id: 2,
          perceptual_hash: 'abcd1234ef015678',
          score: 90,
          name: 'A-dup',
        }, // Exact duplicate
        { id: 3, perceptual_hash: '1111222233334444', score: 80, name: 'B' },
      ];

      const result = deduplicateOptimized(assets, THRESHOLD);

      expect(result).toHaveLength(2);
      expect(result.map((a) => a.id)).toEqual([1, 3]); // Kept higher-scored
    });

    it('should remove similar hashes above threshold', () => {
      const assets: ScoredAsset[] = [
        { id: 1, perceptual_hash: '0000000000000000', score: 100, name: 'A' },
        {
          id: 2,
          perceptual_hash: '0000000000000001',
          score: 90,
          name: 'A-similar',
        }, // 98.4% similar
        { id: 3, perceptual_hash: 'ffffffffffffffff', score: 80, name: 'B' },
      ];

      const result = deduplicateOptimized(assets, THRESHOLD);

      expect(result).toHaveLength(2);
      expect(result.map((a) => a.id)).toEqual([1, 3]);
    });

    it('should keep dissimilar hashes below threshold', () => {
      const assets: ScoredAsset[] = [
        { id: 1, perceptual_hash: '0000000000000000', score: 100, name: 'A' },
        {
          id: 2,
          perceptual_hash: '00000000000000ff',
          score: 90,
          name: 'B',
        }, // 87.5% similar (8 bits diff)
        { id: 3, perceptual_hash: 'ffffffffffffffff', score: 80, name: 'C' },
      ];

      const result = deduplicateOptimized(assets, THRESHOLD);

      expect(result).toHaveLength(3); // All kept (none above 90% threshold)
      expect(result.map((a) => a.id)).toEqual([1, 2, 3]);
    });

    it('should handle assets without perceptual hash', () => {
      const assets: ScoredAsset[] = [
        { id: 1, perceptual_hash: null, score: 100, name: 'No-hash-1' },
        { id: 2, perceptual_hash: 'abcd1234efgh5678', score: 90, name: 'B' },
        { id: 3, perceptual_hash: null, score: 80, name: 'No-hash-2' },
      ];

      const result = deduplicateOptimized(assets, THRESHOLD);

      expect(result).toHaveLength(3); // All kept (null hashes always unique)
    });

    it('should keep highest-scored asset when duplicates exist', () => {
      const assets: ScoredAsset[] = [
        { id: 1, perceptual_hash: 'abcd1234ef015678', score: 85, name: 'A' },
        {
          id: 2,
          perceptual_hash: 'abcd1234ef015678',
          score: 100,
          name: 'A-better',
        },
        {
          id: 3,
          perceptual_hash: 'abcd1234ef015678',
          score: 90,
          name: 'A-medium',
        },
      ];

      // Sort by score descending (as done in actual implementation)
      assets.sort((a, b) => b.score - a.score);

      const result = deduplicateOptimized(assets, THRESHOLD);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(2); // Highest score kept
      expect(result[0].score).toBe(100);
    });
  });

  describe('Algorithm Equivalence', () => {
    it('should produce identical results to naive algorithm', () => {
      const assets: ScoredAsset[] = [
        { id: 1, perceptual_hash: 'a1b2c3d4e5f60000', score: 95, name: 'A' },
        {
          id: 2,
          perceptual_hash: 'a1b2c3d4e5f60001',
          score: 90,
          name: 'A-sim',
        }, // Very similar
        { id: 3, perceptual_hash: 'f0e1d2c3b4a59876', score: 85, name: 'B' },
        { id: 4, perceptual_hash: 'f0e1d2c3b4a59877', score: 80, name: 'B-sim' },
        { id: 5, perceptual_hash: '1111111111111111', score: 75, name: 'C' },
        { id: 6, perceptual_hash: null, score: 70, name: 'No-hash' },
      ];

      const naiveResult = deduplicateNaive(assets, THRESHOLD);
      const optimizedResult = deduplicateOptimized(assets, THRESHOLD);

      expect(optimizedResult.map((a) => a.id)).toEqual(
        naiveResult.map((a) => a.id)
      );
      expect(optimizedResult.length).toBe(naiveResult.length);
    });

    it('should handle large dataset correctly (50 assets)', () => {
      const assets: ScoredAsset[] = [];

      // Generate 50 assets with some duplicates
      for (let i = 0; i < 50; i++) {
        const isDuplicate = i % 5 === 0 && i > 0; // Every 5th is duplicate of previous

        const hash = isDuplicate
          ? assets[i - 1].perceptual_hash // Exact duplicate
          : Math.random().toString(16).substring(2, 18).padEnd(16, '0'); // Random

        assets.push({
          id: i + 1,
          perceptual_hash: hash,
          score: 100 - i,
          name: `Asset-${i + 1}`,
        });
      }

      const naiveResult = deduplicateNaive(assets, THRESHOLD);
      const optimizedResult = deduplicateOptimized(assets, THRESHOLD);

      expect(optimizedResult.map((a) => a.id)).toEqual(
        naiveResult.map((a) => a.id)
      );
    });
  });

  describe('Performance Characteristics', () => {
    it('should handle 200 assets efficiently', () => {
      const assets: ScoredAsset[] = [];

      for (let i = 0; i < 200; i++) {
        assets.push({
          id: i + 1,
          perceptual_hash: Math.random().toString(16).substring(2, 18).padEnd(16, '0'),
          score: 100 - i * 0.5,
          name: `Asset-${i + 1}`,
        });
      }

      const startTime = performance.now();
      const result = deduplicateOptimized(assets, THRESHOLD);
      const endTime = performance.now();

      expect(result.length).toBeGreaterThan(0);
      expect(endTime - startTime).toBeLessThan(50); // Should complete in <50ms
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty array', () => {
      const result = deduplicateOptimized([], THRESHOLD);
      expect(result).toEqual([]);
    });

    it('should handle single asset', () => {
      const assets: ScoredAsset[] = [
        { id: 1, perceptual_hash: 'abcd1234ef015678', score: 100, name: 'A' },
      ];

      const result = deduplicateOptimized(assets, THRESHOLD);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
    });

    it('should handle all null hashes', () => {
      const assets: ScoredAsset[] = [
        { id: 1, perceptual_hash: null, score: 100, name: 'A' },
        { id: 2, perceptual_hash: null, score: 90, name: 'B' },
        { id: 3, perceptual_hash: null, score: 80, name: 'C' },
      ];

      const result = deduplicateOptimized(assets, THRESHOLD);
      expect(result).toHaveLength(3); // All kept
    });

    it('should handle bucket key collisions correctly', () => {
      // Two hashes with same prefix but different suffix
      const assets: ScoredAsset[] = [
        { id: 1, perceptual_hash: 'abcd12340000000f', score: 100, name: 'A' },
        {
          id: 2,
          perceptual_hash: 'abcd1234ffffffff',
          score: 90,
          name: 'B',
        }, // Same bucket, different hash
      ];

      const result = deduplicateOptimized(assets, THRESHOLD);
      expect(result).toHaveLength(2); // Both kept (not similar enough)
    });
  });
});
