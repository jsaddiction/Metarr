/**
 * Asset Scoring Phase Tests
 *
 * Validates the 0-100 point scoring algorithm for asset quality
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { AssetScoringPhase } from '../../../src/services/enrichment/phases/AssetScoringPhase.js';
import { AssetForScoring } from '../../../src/services/enrichment/types.js';

describe('AssetScoringPhase', () => {
  let scoringPhase: AssetScoringPhase;

  beforeEach(() => {
    scoringPhase = new AssetScoringPhase();
  });

  describe('Resolution Scoring (0-30 points)', () => {
    it('should award full points for ideal poster resolution', () => {
      const asset: AssetForScoring = {
        asset_type: 'poster',
        width: 2000,
        height: 3000, // 6MP - ideal
        provider_name: 'tmdb',
        provider_metadata: null,
      };

      const score = scoringPhase.calculateScore(asset, 'en');

      // Resolution: 30, Aspect: ~20, Language: 18, Votes: 0, Provider: 10
      expect(score).toBeGreaterThanOrEqual(75);
      expect(score).toBeLessThanOrEqual(80);
    });

    it('should award bonus for higher than ideal resolution', () => {
      const highRes: AssetForScoring = {
        asset_type: 'poster',
        width: 3000,
        height: 4500, // 13.5MP (1.5x ideal)
        provider_name: 'tmdb',
        provider_metadata: null,
      };

      const idealRes: AssetForScoring = {
        asset_type: 'poster',
        width: 2000,
        height: 3000, // 6MP (1.0x ideal)
        provider_name: 'tmdb',
        provider_metadata: null,
      };

      const highScore = scoringPhase.calculateScore(highRes, 'en');
      const idealScore = scoringPhase.calculateScore(idealRes, 'en');

      expect(highScore).toBeGreaterThan(idealScore);
    });

    it('should penalize lower resolution', () => {
      const lowRes: AssetForScoring = {
        asset_type: 'poster',
        width: 500,
        height: 750, // 0.375MP (low res)
        provider_name: 'tmdb',
        provider_metadata: null,
      };

      const score = scoringPhase.calculateScore(lowRes, 'en');

      // Resolution penalty should reduce overall score significantly
      expect(score).toBeLessThanOrEqual(50);
    });

    it('should handle fanart resolution differently than posters', () => {
      const fanart: AssetForScoring = {
        asset_type: 'fanart',
        width: 1920,
        height: 1080, // Full HD
        provider_name: 'tmdb',
        provider_metadata: null,
      };

      const score = scoringPhase.calculateScore(fanart, 'en');

      // Should score well for correct fanart resolution
      expect(score).toBeGreaterThan(70);
    });
  });

  describe('Aspect Ratio Scoring (0-20 points)', () => {
    it('should award points for correct poster aspect ratio (2:3)', () => {
      const correctRatio: AssetForScoring = {
        asset_type: 'poster',
        width: 1000,
        height: 1500, // 2:3 ratio
        provider_name: 'tmdb',
        provider_metadata: null,
      };

      const score = scoringPhase.calculateScore(correctRatio, 'en');

      expect(score).toBeGreaterThan(50); // Good score for correct ratio
    });

    it('should penalize incorrect aspect ratio', () => {
      const wrongRatio: AssetForScoring = {
        asset_type: 'poster',
        width: 1000,
        height: 1000, // 1:1 ratio (square - wrong for poster)
        provider_name: 'tmdb',
        provider_metadata: null,
      };

      const correctRatio: AssetForScoring = {
        asset_type: 'poster',
        width: 1000,
        height: 1500, // 2:3 ratio (correct)
        provider_name: 'tmdb',
        provider_metadata: null,
      };

      const wrongScore = scoringPhase.calculateScore(wrongRatio, 'en');
      const correctScore = scoringPhase.calculateScore(correctRatio, 'en');

      expect(wrongScore).toBeLessThan(correctScore);
    });

    it('should handle widescreen fanart ratio (16:9)', () => {
      const widescreen: AssetForScoring = {
        asset_type: 'fanart',
        width: 1920,
        height: 1080, // 16:9
        provider_name: 'tmdb',
        provider_metadata: null,
      };

      const score = scoringPhase.calculateScore(widescreen, 'en');

      expect(score).toBeGreaterThan(70);
    });
  });

  describe('Language Scoring (0-20 points)', () => {
    it('should award full points for preferred language match', () => {
      const preferred: AssetForScoring = {
        asset_type: 'poster',
        width: 1000,
        height: 1500,
        provider_name: 'tmdb',
        provider_metadata: JSON.stringify({ language: 'fr' }),
      };

      const score = scoringPhase.calculateScore(preferred, 'fr'); // French preferred

      // Should include language bonus
      expect(score).toBeGreaterThan(55);
    });

    it('should award high points for English when not preferred', () => {
      const english: AssetForScoring = {
        asset_type: 'poster',
        width: 1000,
        height: 1500,
        provider_name: 'tmdb',
        provider_metadata: JSON.stringify({ language: 'en' }),
      };

      const score = scoringPhase.calculateScore(english, 'fr'); // French preferred, English provided

      expect(score).toBeGreaterThan(50); // Should still score reasonably well
    });

    it('should award high points for language-neutral assets', () => {
      const neutral: AssetForScoring = {
        asset_type: 'clearlogo',
        width: 800,
        height: 200,
        provider_name: 'tmdb',
        provider_metadata: JSON.stringify({}), // No language
      };

      const score = scoringPhase.calculateScore(neutral, 'en');

      expect(score).toBeGreaterThan(50);
    });

    it('should penalize non-preferred non-English languages', () => {
      const otherLang: AssetForScoring = {
        asset_type: 'poster',
        width: 1000,
        height: 1500,
        provider_name: 'tmdb',
        provider_metadata: JSON.stringify({ language: 'ja' }),
      };

      const english: AssetForScoring = {
        asset_type: 'poster',
        width: 1000,
        height: 1500,
        provider_name: 'tmdb',
        provider_metadata: JSON.stringify({ language: 'en' }),
      };

      const otherScore = scoringPhase.calculateScore(otherLang, 'en');
      const englishScore = scoringPhase.calculateScore(english, 'en');

      expect(otherScore).toBeLessThan(englishScore);
    });
  });

  describe('Community Votes Scoring (0-20 points)', () => {
    it('should award full points for high rating with many votes', () => {
      const popular: AssetForScoring = {
        asset_type: 'poster',
        width: 1000,
        height: 1500,
        provider_name: 'tmdb',
        provider_metadata: JSON.stringify({
          vote_average: 9.5, // Out of 10
          vote_count: 100, // Well above 50 threshold
        }),
      };

      const score = scoringPhase.calculateScore(popular, 'en');

      // Should include near-max vote score (~19 points)
      expect(score).toBeGreaterThan(70);
    });

    it('should reduce score for few votes (low confidence)', () => {
      const fewVotes: AssetForScoring = {
        asset_type: 'poster',
        width: 1000,
        height: 1500,
        provider_name: 'tmdb',
        provider_metadata: JSON.stringify({
          vote_average: 9.5, // High rating
          vote_count: 5, // But only 5 votes
        }),
      };

      const manyVotes: AssetForScoring = {
        asset_type: 'poster',
        width: 1000,
        height: 1500,
        provider_name: 'tmdb',
        provider_metadata: JSON.stringify({
          vote_average: 9.5,
          vote_count: 100,
        }),
      };

      const fewScore = scoringPhase.calculateScore(fewVotes, 'en');
      const manyScore = scoringPhase.calculateScore(manyVotes, 'en');

      expect(fewScore).toBeLessThan(manyScore);
    });

    it('should handle alternate vote field names', () => {
      const tmdbFormat: AssetForScoring = {
        asset_type: 'poster',
        width: 1000,
        height: 1500,
        provider_name: 'tmdb',
        provider_metadata: JSON.stringify({
          vote_average: 8.0,
          vote_count: 50,
        }),
      };

      const fanartFormat: AssetForScoring = {
        asset_type: 'poster',
        width: 1000,
        height: 1500,
        provider_name: 'fanart.tv',
        provider_metadata: JSON.stringify({
          voteAverage: 8.0,
          votes: 50,
        }),
      };

      const tmdbScore = scoringPhase.calculateScore(tmdbFormat, 'en');
      const fanartScore = scoringPhase.calculateScore(fanartFormat, 'en');

      // Should produce similar scores (within provider priority difference)
      expect(Math.abs(tmdbScore - fanartScore)).toBeLessThanOrEqual(1);
    });
  });

  describe('Provider Priority Scoring (0-10 points)', () => {
    it('should rank TMDB highest', () => {
      const tmdb: AssetForScoring = {
        asset_type: 'poster',
        width: 1000,
        height: 1500,
        provider_name: 'tmdb',
        provider_metadata: null,
      };

      const score = scoringPhase.calculateScore(tmdb, 'en');

      expect(score).toBeGreaterThan(55); // Should include 10 provider points
    });

    it('should rank Fanart.tv second', () => {
      const fanart: AssetForScoring = {
        asset_type: 'poster',
        width: 1000,
        height: 1500,
        provider_name: 'fanart.tv',
        provider_metadata: null,
      };

      const tmdb: AssetForScoring = {
        asset_type: 'poster',
        width: 1000,
        height: 1500,
        provider_name: 'tmdb',
        provider_metadata: null,
      };

      const fanartScore = scoringPhase.calculateScore(fanart, 'en');
      const tmdbScore = scoringPhase.calculateScore(tmdb, 'en');

      expect(fanartScore).toBe(tmdbScore - 1); // 1 point difference
    });

    it('should rank TVDB third', () => {
      const tvdb: AssetForScoring = {
        asset_type: 'poster',
        width: 1000,
        height: 1500,
        provider_name: 'tvdb',
        provider_metadata: null,
      };

      const fanart: AssetForScoring = {
        asset_type: 'poster',
        width: 1000,
        height: 1500,
        provider_name: 'fanart.tv',
        provider_metadata: null,
      };

      const tvdbScore = scoringPhase.calculateScore(tvdb, 'en');
      const fanartScore = scoringPhase.calculateScore(fanart, 'en');

      expect(tvdbScore).toBe(fanartScore - 1);
    });
  });

  describe('scoreAssets() batch scoring', () => {
    it('should score and sort multiple assets by quality', () => {
      const assets: AssetForScoring[] = [
        {
          asset_type: 'poster',
          width: 500,
          height: 750, // Low res
          provider_name: 'tmdb',
          provider_metadata: null,
        },
        {
          asset_type: 'poster',
          width: 2000,
          height: 3000, // High res
          provider_name: 'tmdb',
          provider_metadata: JSON.stringify({ vote_average: 9.0, vote_count: 100 }),
        },
        {
          asset_type: 'poster',
          width: 1000,
          height: 1500, // Medium res
          provider_name: 'fanart.tv',
          provider_metadata: null,
        },
      ];

      const sorted = scoringPhase.scoreAssets(assets, 'en');

      // Should be sorted by score descending
      expect(sorted[0].width).toBe(2000); // Highest quality first
      expect(sorted[1].width).toBe(1000); // Medium quality second
      expect(sorted[2].width).toBe(500); // Lowest quality last

      // Scores should be descending
      expect(sorted[0].score).toBeGreaterThan(sorted[1].score);
      expect(sorted[1].score).toBeGreaterThan(sorted[2].score);
    });

    it('should handle empty array', () => {
      const sorted = scoringPhase.scoreAssets([], 'en');
      expect(sorted).toEqual([]);
    });

    it('should preserve original asset properties', () => {
      const assets: AssetForScoring[] = [
        {
          asset_type: 'poster',
          width: 1000,
          height: 1500,
          provider_name: 'tmdb',
          provider_metadata: JSON.stringify({ custom_field: 'test' }),
        },
      ];

      const sorted = scoringPhase.scoreAssets(assets, 'en');

      expect(sorted[0].provider_metadata).toBe(assets[0].provider_metadata);
      expect(sorted[0].asset_type).toBe('poster');
    });
  });
});
