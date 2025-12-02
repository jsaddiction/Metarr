/**
 * TrailerSelectionService Tests
 *
 * Tests the trailer scoring and selection algorithm
 */

import {
  TrailerSelectionService,
  TrailerCandidate,
  TrailerConfig,
} from '../../src/services/trailers/TrailerSelectionService.js';

describe('TrailerSelectionService', () => {
  let service: TrailerSelectionService;
  let defaultConfig: TrailerConfig;

  beforeEach(() => {
    service = new TrailerSelectionService();
    defaultConfig = {
      maxResolution: 1080,
      preferredLanguage: 'en',
    };
  });

  describe('scoreCandidate', () => {
    it('should give 100 points for official TMDB trailer', () => {
      const candidate: TrailerCandidate = {
        id: 1,
        tmdb_official: true,
        tmdb_language: 'fr', // Different language
        best_height: null,
        is_selected: false,
        score: null,
      };

      const score = service.scoreCandidate(candidate, defaultConfig);
      expect(score).toBe(100); // Only official bonus
    });

    it('should give 50 points for language match', () => {
      const candidate: TrailerCandidate = {
        id: 1,
        tmdb_official: false,
        tmdb_language: 'en', // Matches preferredLanguage
        best_height: null,
        is_selected: false,
        score: null,
      };

      const score = service.scoreCandidate(candidate, defaultConfig);
      expect(score).toBe(50); // Only language bonus
    });

    it('should give resolution points based on height', () => {
      const cases = [
        { height: 2160, expected: 40 }, // 4K
        { height: 1080, expected: 30 }, // Full HD
        { height: 720, expected: 20 }, // HD
        { height: 480, expected: 10 }, // SD
        { height: 360, expected: 0 }, // Below SD
      ];

      for (const { height, expected } of cases) {
        const candidate: TrailerCandidate = {
          id: 1,
          tmdb_official: false,
          tmdb_language: 'fr',
          best_height: height,
            is_selected: false,
          score: null,
        };

        const score = service.scoreCandidate(candidate, { ...defaultConfig, maxResolution: 2160 });
        expect(score).toBe(expected);
      }
    });

    it('should cap resolution score at maxResolution config', () => {
      const candidate: TrailerCandidate = {
        id: 1,
        tmdb_official: false,
        tmdb_language: 'fr',
        best_height: 2160, // 4K video
        is_selected: false,
        score: null,
      };

      // With max 720p config, should only get 720p score (20)
      const score = service.scoreCandidate(candidate, { ...defaultConfig, maxResolution: 720 });
      expect(score).toBe(20);
    });

    it('should combine all scoring factors correctly', () => {
      const candidate: TrailerCandidate = {
        id: 1,
        tmdb_official: true, // +100
        tmdb_language: 'en', // +50
        best_height: 1080, // +30
        is_selected: false,
        score: null,
      };

      const score = service.scoreCandidate(candidate, defaultConfig);
      expect(score).toBe(180); // 100 + 50 + 30
    });

    it('should return 0 for candidate with no positive attributes', () => {
      const candidate: TrailerCandidate = {
        id: 1,
        tmdb_official: false,
        tmdb_language: 'de', // Not matching
        best_height: null, // No resolution info
        is_selected: false,
        score: null,
      };

      const score = service.scoreCandidate(candidate, defaultConfig);
      expect(score).toBe(0);
    });
  });

  describe('selectBest', () => {
    it('should return null for empty candidates array', () => {
      const result = service.selectBest([], defaultConfig);
      expect(result).toBeNull();
    });

    it('should select the highest scoring candidate', () => {
      const candidates: TrailerCandidate[] = [
        {
          id: 1,
          tmdb_official: false,
          tmdb_language: 'en',
          best_height: 720,
            is_selected: false,
          score: null,
        },
        {
          id: 2,
          tmdb_official: true, // This should win
          tmdb_language: 'en',
          best_height: 1080,
            is_selected: false,
          score: null,
        },
        {
          id: 3,
          tmdb_official: false,
          tmdb_language: 'de',
          best_height: 480,
            is_selected: false,
          score: null,
        },
      ];

      const result = service.selectBest(candidates, defaultConfig);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(2); // Official + English + 1080p
    });

    // Note: Lock checking is now done at the entity level (movies.trailer_locked),
    // not on individual candidates. The caller (TrailerSelectionPhase) checks the lock
    // before calling this service.
  });

  describe('shouldReplace', () => {
    // Note: Lock checking is now done at the entity level (movies.trailer_locked),
    // not on individual candidates. The caller (TrailerSelectionPhase) checks the lock
    // before calling this service.

    it('should return true if new candidate has higher score', () => {
      const current: TrailerCandidate = {
        id: 1,
        tmdb_official: false,
        tmdb_language: 'en',
        best_height: 480,
        is_selected: true,
        score: null,
      };

      const newCandidate: TrailerCandidate = {
        id: 2,
        tmdb_official: true,
        tmdb_language: 'en',
        best_height: 1080,
        is_selected: false,
        score: null,
      };

      const result = service.shouldReplace(current, newCandidate, defaultConfig);
      expect(result).toBe(true);
    });

    it('should return false if new candidate has equal score', () => {
      const current: TrailerCandidate = {
        id: 1,
        tmdb_official: true,
        tmdb_language: 'en',
        best_height: 1080,
        is_selected: true,
        score: null,
      };

      const newCandidate: TrailerCandidate = {
        id: 2,
        tmdb_official: true,
        tmdb_language: 'en',
        best_height: 1080,
        is_selected: false,
        score: null,
      };

      const result = service.shouldReplace(current, newCandidate, defaultConfig);
      expect(result).toBe(false); // Equal score, don't replace
    });

    it('should return false if new candidate has lower score', () => {
      const current: TrailerCandidate = {
        id: 1,
        tmdb_official: true,
        tmdb_language: 'en',
        best_height: 1080,
        is_selected: true,
        score: null,
      };

      const newCandidate: TrailerCandidate = {
        id: 2,
        tmdb_official: false,
        tmdb_language: 'de',
        best_height: 480,
        is_selected: false,
        score: null,
      };

      const result = service.shouldReplace(current, newCandidate, defaultConfig);
      expect(result).toBe(false);
    });
  });

  describe('scoreAll', () => {
    it('should score and sort all candidates by score descending', () => {
      const candidates: TrailerCandidate[] = [
        {
          id: 1,
          tmdb_official: false,
          tmdb_language: 'de',
          best_height: 480,
            is_selected: false,
          score: null,
        },
        {
          id: 2,
          tmdb_official: true,
          tmdb_language: 'en',
          best_height: 1080,
            is_selected: false,
          score: null,
        },
        {
          id: 3,
          tmdb_official: false,
          tmdb_language: 'en',
          best_height: 720,
            is_selected: false,
          score: null,
        },
      ];

      const scored = service.scoreAll(candidates, defaultConfig);

      expect(scored.length).toBe(3);
      expect(scored[0].id).toBe(2); // Highest score
      expect(scored[0].calculatedScore).toBe(180); // 100 + 50 + 30
      expect(scored[1].id).toBe(3);
      expect(scored[1].calculatedScore).toBe(70); // 50 + 20
      expect(scored[2].id).toBe(1);
      expect(scored[2].calculatedScore).toBe(10); // 10
    });

    it('should score single candidate correctly', () => {
      const candidates: TrailerCandidate[] = [
        {
          id: 1,
          tmdb_official: true,
          tmdb_language: 'en',
          best_height: 1080,
          is_selected: false,
          score: null,
        },
      ];

      const scored = service.scoreAll(candidates, defaultConfig);
      expect(scored.length).toBe(1);
      expect(scored[0].calculatedScore).toBe(180);
    });
  });

  describe('getScoringBreakdown', () => {
    it('should return detailed scoring breakdown', () => {
      const candidate: TrailerCandidate = {
        id: 1,
        tmdb_official: true,
        tmdb_language: 'en',
        best_height: 1080,
        is_selected: false,
        score: null,
      };

      const breakdown = service.getScoringBreakdown(candidate, defaultConfig);

      expect(breakdown.total).toBe(180);
      expect(breakdown.official).toBe(100);
      expect(breakdown.language).toBe(50);
      expect(breakdown.resolution).toBe(30);
      expect(breakdown.details.isOfficial).toBe(true);
      expect(breakdown.details.languageMatch).toBe(true);
      expect(breakdown.details.actualResolution).toBe(1080);
      expect(breakdown.details.effectiveResolution).toBe(1080);
    });

    it('should show capped resolution in breakdown', () => {
      const candidate: TrailerCandidate = {
        id: 1,
        tmdb_official: false,
        tmdb_language: 'de',
        best_height: 2160, // 4K
        is_selected: false,
        score: null,
      };

      const breakdown = service.getScoringBreakdown(candidate, {
        maxResolution: 720,
        preferredLanguage: 'en',
      });

      expect(breakdown.resolution).toBe(20); // 720p score
      expect(breakdown.details.actualResolution).toBe(2160);
      expect(breakdown.details.effectiveResolution).toBe(720); // Capped
    });

    it('should handle null resolution', () => {
      const candidate: TrailerCandidate = {
        id: 1,
        tmdb_official: false,
        tmdb_language: 'en',
        best_height: null,
        is_selected: false,
        score: null,
      };

      const breakdown = service.getScoringBreakdown(candidate, defaultConfig);

      expect(breakdown.resolution).toBe(0);
      expect(breakdown.details.actualResolution).toBeNull();
      expect(breakdown.details.effectiveResolution).toBeNull();
    });
  });
});
