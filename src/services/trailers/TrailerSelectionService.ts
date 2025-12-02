import { logger } from '../../middleware/logging.js';

/**
 * Trailer candidate for scoring and selection
 * Represents a potential trailer from the database
 */
export interface TrailerCandidate {
  id: number;
  tmdb_official: boolean;
  tmdb_language: string | null;
  best_height: number | null;
  is_selected: boolean;
  score: number | null;
}

/**
 * Trailer configuration for scoring
 */
export interface TrailerConfig {
  maxResolution: number; // 480, 720, 1080, 2160
  preferredLanguage: string; // 'en', 'es', etc.
}

/**
 * TrailerSelectionService
 *
 * Scores and selects the best trailer candidate based on:
 * - Official status (TMDB official: true)
 * - Language match (user's configured language)
 * - Resolution (up to configured max)
 *
 * Scoring Algorithm:
 * 1. Official (TMDB official: true) → +100 points
 * 2. Language match (user's configured language) → +50 points
 * 3. Resolution (up to configured max):
 *    - 2160p → +40, 1080p → +30, 720p → +20, 480p → +10
 *
 * Key Features:
 * - Transparent scoring for debugging and auditing
 * - Supports comparison between current and new candidates
 *
 * Note: Lock checking is done at the movie entity level (movies.trailer_locked),
 * not on individual candidates. Callers should check the lock before calling this service.
 */
export class TrailerSelectionService {
  /**
   * Calculate quality score for a trailer candidate (0-190 points)
   *
   * Scoring breakdown:
   * - Official: 100 points (TMDB verified)
   * - Language: 50 points (exact match)
   * - Resolution: 40 points max (2160p)
   *
   * @param candidate - Trailer candidate to score
   * @param config - Scoring configuration
   * @returns Score from 0-190
   */
  scoreCandidate(candidate: TrailerCandidate, config: TrailerConfig): number {
    let score = 0;

    // ========================================
    // OFFICIAL STATUS (0-100 points)
    // ========================================
    // TMDB official trailers are verified and high quality
    if (candidate.tmdb_official) {
      score += 100;
      logger.debug('[TrailerSelectionService] Official trailer bonus applied', {
        candidateId: candidate.id,
        officialScore: 100,
      });
    }

    // ========================================
    // LANGUAGE MATCH (0-50 points)
    // ========================================
    // Prefer trailers in user's configured language
    if (candidate.tmdb_language === config.preferredLanguage) {
      score += 50;
      logger.debug('[TrailerSelectionService] Language match bonus applied', {
        candidateId: candidate.id,
        language: candidate.tmdb_language,
        preferredLanguage: config.preferredLanguage,
        languageScore: 50,
      });
    }

    // ========================================
    // RESOLUTION SCORE (0-40 points)
    // ========================================
    // Award points based on resolution, up to configured max
    if (candidate.best_height) {
      const height = candidate.best_height;
      const maxHeight = config.maxResolution;

      // Cap the resolution at user's configured max
      const effectiveHeight = Math.min(height, maxHeight);

      let resolutionScore = 0;
      if (effectiveHeight >= 2160) {
        resolutionScore = 40; // 4K
      } else if (effectiveHeight >= 1080) {
        resolutionScore = 30; // Full HD
      } else if (effectiveHeight >= 720) {
        resolutionScore = 20; // HD
      } else if (effectiveHeight >= 480) {
        resolutionScore = 10; // SD
      }

      score += resolutionScore;

      logger.debug('[TrailerSelectionService] Resolution score calculated', {
        candidateId: candidate.id,
        actualHeight: height,
        maxHeight,
        effectiveHeight,
        resolutionScore,
      });
    }

    logger.info('[TrailerSelectionService] Trailer candidate scored', {
      candidateId: candidate.id,
      official: candidate.tmdb_official,
      language: candidate.tmdb_language,
      resolution: candidate.best_height,
      finalScore: score,
    });

    return score;
  }

  /**
   * Select the best trailer candidate from a list
   *
   * Scores all candidates and returns the one with the highest score.
   * Lock checking should be done by the caller at the entity level.
   *
   * @param candidates - Array of trailer candidates
   * @param config - Scoring configuration
   * @returns Best candidate, or null if none suitable
   */
  selectBest(
    candidates: TrailerCandidate[],
    config: TrailerConfig
  ): TrailerCandidate | null {
    if (candidates.length === 0) {
      logger.warn('[TrailerSelectionService] No candidates provided for selection');
      return null;
    }

    logger.info('[TrailerSelectionService] Selecting best trailer', {
      totalCandidates: candidates.length,
      preferredLanguage: config.preferredLanguage,
      maxResolution: config.maxResolution,
    });

    // Score all candidates
    const scored = candidates.map((candidate) => ({
      candidate,
      score: this.scoreCandidate(candidate, config),
    }));

    // Sort by score descending (highest score first)
    scored.sort((a, b) => b.score - a.score);

    const best = scored[0];

    logger.info('[TrailerSelectionService] Best trailer selected', {
      candidateId: best.candidate.id,
      score: best.score,
      official: best.candidate.tmdb_official,
      language: best.candidate.tmdb_language,
      resolution: best.candidate.best_height,
      topScores: scored.slice(0, 3).map((s) => ({
        id: s.candidate.id,
        score: s.score,
      })),
    });

    return best.candidate;
  }

  /**
   * Check if a new candidate should replace the current one
   *
   * Compares scores between current and new candidate.
   * Lock checking should be done by the caller at the entity level.
   *
   * @param current - Currently selected candidate
   * @param newCandidate - New candidate to compare
   * @param config - Scoring configuration
   * @returns True if new candidate should replace current
   */
  shouldReplace(
    current: TrailerCandidate,
    newCandidate: TrailerCandidate,
    config: TrailerConfig
  ): boolean {
    // Calculate scores
    const currentScore = this.scoreCandidate(current, config);
    const newScore = this.scoreCandidate(newCandidate, config);

    const shouldReplace = newScore > currentScore;

    logger.info('[TrailerSelectionService] Replacement evaluation', {
      currentId: current.id,
      currentScore,
      newCandidateId: newCandidate.id,
      newScore,
      shouldReplace,
      scoreDifference: newScore - currentScore,
    });

    return shouldReplace;
  }

  /**
   * Score multiple candidates and return with scores attached
   *
   * Useful for debugging and displaying scoring information to users.
   *
   * @param candidates - Array of trailer candidates
   * @param config - Scoring configuration
   * @returns Candidates with scores attached, sorted by score descending
   */
  scoreAll(
    candidates: TrailerCandidate[],
    config: TrailerConfig
  ): Array<TrailerCandidate & { calculatedScore: number }> {
    const scored = candidates.map((candidate) => ({
      ...candidate,
      calculatedScore: this.scoreCandidate(candidate, config),
    }));

    // Sort by score descending
    scored.sort((a, b) => b.calculatedScore - a.calculatedScore);

    logger.info('[TrailerSelectionService] Scored all candidates', {
      totalCandidates: candidates.length,
      avgScore: (
        scored.reduce((sum, c) => sum + c.calculatedScore, 0) / scored.length
      ).toFixed(1),
      topScore: scored[0]?.calculatedScore,
      bottomScore: scored[scored.length - 1]?.calculatedScore,
    });

    return scored;
  }

  /**
   * Get scoring breakdown for a candidate
   *
   * Returns detailed scoring information for debugging and auditing.
   *
   * @param candidate - Trailer candidate to analyze
   * @param config - Scoring configuration
   * @returns Detailed scoring breakdown
   */
  getScoringBreakdown(
    candidate: TrailerCandidate,
    config: TrailerConfig
  ): {
    total: number;
    official: number;
    language: number;
    resolution: number;
    details: {
      isOfficial: boolean;
      languageMatch: boolean;
      actualResolution: number | null;
      effectiveResolution: number | null;
    };
  } {
    let officialScore = 0;
    let languageScore = 0;
    let resolutionScore = 0;

    // Official status
    if (candidate.tmdb_official) {
      officialScore = 100;
    }

    // Language match
    const languageMatch = candidate.tmdb_language === config.preferredLanguage;
    if (languageMatch) {
      languageScore = 50;
    }

    // Resolution
    let effectiveHeight: number | null = null;
    if (candidate.best_height) {
      const height = candidate.best_height;
      const maxHeight = config.maxResolution;
      effectiveHeight = Math.min(height, maxHeight);

      if (effectiveHeight >= 2160) {
        resolutionScore = 40;
      } else if (effectiveHeight >= 1080) {
        resolutionScore = 30;
      } else if (effectiveHeight >= 720) {
        resolutionScore = 20;
      } else if (effectiveHeight >= 480) {
        resolutionScore = 10;
      }
    }

    const total = officialScore + languageScore + resolutionScore;

    const breakdown = {
      total,
      official: officialScore,
      language: languageScore,
      resolution: resolutionScore,
      details: {
        isOfficial: candidate.tmdb_official,
        languageMatch,
        actualResolution: candidate.best_height,
        effectiveResolution: effectiveHeight,
      },
    };

    logger.debug('[TrailerSelectionService] Scoring breakdown generated', {
      candidateId: candidate.id,
      breakdown,
    });

    return breakdown;
  }
}
