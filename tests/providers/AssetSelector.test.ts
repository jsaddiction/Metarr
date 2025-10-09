/**
 * AssetSelector Tests
 */

import { AssetSelector } from '../../src/services/providers/AssetSelector';
import { AssetCandidate } from '../../src/types/providers';

describe('AssetSelector', () => {
  const createCandidate = (overrides: Partial<AssetCandidate> = {}): AssetCandidate => ({
    providerId: 'tmdb',
    providerResultId: '603',
    assetType: 'poster',
    url: 'https://example.com/poster.jpg',
    width: 2000,
    height: 3000,
    aspectRatio: 0.67,
    language: 'en',
    votes: 100,
    voteAverage: 8.5,
    ...overrides,
  });

  it('should select best candidate based on score', () => {
    const selector = new AssetSelector({
      assetType: 'poster',
      maxCount: 1,
    });

    const candidates = [
      createCandidate({ width: 1000, height: 1500, votes: 50, voteAverage: 7.0 }),
      createCandidate({ width: 2000, height: 3000, votes: 200, voteAverage: 9.0 }), // Best
      createCandidate({ width: 1500, height: 2250, votes: 100, voteAverage: 8.0 }),
    ];

    const selected = selector.selectBest(candidates);

    expect(selected).toHaveLength(1);
    expect(selected[0].width).toBe(2000);
    expect(selected[0].votes).toBe(200);
  });

  it('should respect maxCount', () => {
    const selector = new AssetSelector({
      assetType: 'poster',
      maxCount: 2,
    });

    const candidates = [
      createCandidate({ votes: 300 }),
      createCandidate({ votes: 200 }),
      createCandidate({ votes: 100 }),
      createCandidate({ votes: 50 }),
    ];

    const selected = selector.selectBest(candidates);

    expect(selected).toHaveLength(2);
  });

  it('should filter by minimum dimensions', () => {
    const selector = new AssetSelector({
      assetType: 'poster',
      maxCount: 5,
      minWidth: 1500,
      minHeight: 2250,
    });

    const candidates = [
      createCandidate({ width: 1000, height: 1500 }), // Too small
      createCandidate({ width: 2000, height: 3000 }), // OK
      createCandidate({ width: 1500, height: 2250 }), // OK
      createCandidate({ width: 1400, height: 2100 }), // Too small
    ];

    const selected = selector.selectBest(candidates);

    expect(selected).toHaveLength(2);
    expect(selected.every(c => c.width! >= 1500 && c.height! >= 2250)).toBe(true);
  });

  it('should prefer matching language', () => {
    const selector = new AssetSelector({
      assetType: 'poster',
      maxCount: 1,
      preferLanguage: 'en',
    });

    const candidates = [
      createCandidate({ language: 'es', votes: 500, voteAverage: 9.0 }),
      createCandidate({ language: 'en', votes: 100, voteAverage: 8.0 }), // Should win
    ];

    const selected = selector.selectBest(candidates);

    expect(selected[0].language).toBe('en');
  });

  it('should filter by quality preference', () => {
    const selector = new AssetSelector({
      assetType: 'fanart',
      maxCount: 5,
      qualityPreference: 'hd',
    });

    const candidates = [
      createCandidate({ quality: 'sd' }), // Filtered out
      createCandidate({ quality: 'hd' }), // OK
      createCandidate({ quality: '4k' }), // OK
    ];

    const selected = selector.selectBest(candidates);

    expect(selected).toHaveLength(2);
    expect(selected.every(c => c.quality !== 'sd')).toBe(true);
  });

  it('should boost scores for preferred providers', () => {
    const selector = new AssetSelector({
      assetType: 'poster',
      maxCount: 1,
      providerPriority: ['fanart_tv', 'tmdb'],
    });

    const candidates = [
      createCandidate({ providerId: 'tmdb', votes: 200, voteAverage: 9.0 }),
      createCandidate({ providerId: 'fanart_tv', votes: 150, voteAverage: 8.5 }), // Should win due to provider priority
    ];

    const selected = selector.selectBest(candidates);

    expect(selected[0].providerId).toBe('fanart_tv');
  });

  it('should deduplicate by perceptual hash', () => {
    const selector = new AssetSelector({
      assetType: 'poster',
      maxCount: 5,
      pHashThreshold: 0.95, // High similarity threshold
    });

    const candidates = [
      createCandidate({ perceptualHash: '1111111111111111', votes: 200 }),
      createCandidate({ perceptualHash: '1111111111111110', votes: 150 }), // Very similar, should be filtered
      createCandidate({ perceptualHash: '0000000000000000', votes: 100 }), // Different
    ];

    const selected = selector.selectBest(candidates);

    expect(selected).toHaveLength(2); // Only 2 unique images
  });

  it('should handle candidates with missing data gracefully', () => {
    const selector = new AssetSelector({
      assetType: 'poster',
      maxCount: 5,
    });

    const candidates = [
      createCandidate({ width: undefined, height: undefined, votes: undefined }),
      createCandidate({ language: undefined }),
      createCandidate({}), // Normal candidate
    ];

    const selected = selector.selectBest(candidates);

    expect(selected.length).toBeGreaterThan(0); // Should not crash
  });

  it('should return empty array if no candidates pass filters', () => {
    const selector = new AssetSelector({
      assetType: 'poster',
      maxCount: 5,
      minWidth: 5000, // Impossibly high
      minHeight: 7500,
    });

    const candidates = [
      createCandidate({ width: 2000, height: 3000 }),
      createCandidate({ width: 1000, height: 1500 }),
    ];

    const selected = selector.selectBest(candidates);

    expect(selected).toHaveLength(0);
  });
});
