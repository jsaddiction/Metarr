/**
 * Trailer Selection Phase
 *
 * Scores and selects the best trailer candidate for an entity based on:
 * - Official status (TMDB official: true)
 * - Language match (user's configured language)
 * - Resolution (up to configured max)
 *
 * Key Features:
 * - Respects entity-level lock (movies.trailer_locked) - skip if locked
 * - Only processes analyzed candidates (analyzed=true)
 * - Filters out unavailable candidates (failure_reason='unavailable')
 * - Updates database selection flags and scores
 * - Uses TrailerSelectionService for scoring logic
 */

import { DatabaseConnection } from '../../../types/database.js';
import { EnrichmentConfig } from '../types.js';
import { TrailerSelectionService, TrailerConfig } from '../../trailers/TrailerSelectionService.js';
import { logger } from '../../../middleware/logging.js';
import { getErrorMessage } from '../../../utils/errorHandling.js';

/**
 * Trailer candidate from database
 */
interface TrailerCandidateRow {
  id: number;
  tmdb_official: number;
  tmdb_language: string | null;
  best_height: number | null;
  is_selected: number;
  score: number | null;
  failure_reason: string | null;
}

export class TrailerSelectionPhase {
  constructor(
    private readonly db: DatabaseConnection,
    private readonly trailerSelectionService: TrailerSelectionService
  ) {}

  /**
   * Execute trailer selection for an entity
   *
   * Process:
   * 1. Check if entity's trailer field is locked - skip if locked
   * 2. Get all analyzed trailer candidates
   * 3. Filter out failed candidates
   * 4. Get trailer configuration from settings
   * 5. Score all remaining candidates
   * 6. Select the highest scoring candidate
   * 7. Update database: clear previous selection, set new selection
   *
   * @param config - Enrichment configuration
   * @returns Selection result with candidate ID and score
   */
  async execute(config: EnrichmentConfig): Promise<{
    selected: boolean;
    candidateId: number | null;
    score: number | null;
  }> {
    try {
      const { entityId, entityType } = config;

      logger.info('[TrailerSelectionPhase] Starting trailer selection', {
        entityType,
        entityId,
      });

      // STEP 1: Check if entity's trailer field is locked
      const isLocked = await this.isTrailerLocked(entityType, entityId);
      if (isLocked) {
        logger.info('[TrailerSelectionPhase] Entity trailer field is locked, skipping auto-selection', {
          entityType,
          entityId,
        });
        return { selected: false, candidateId: null, score: null };
      }

      // STEP 2: Get all analyzed trailer candidates
      const candidates = await this.db.query<TrailerCandidateRow>(
        `SELECT id, tmdb_official, tmdb_language, best_height, is_selected, score, failure_reason
         FROM trailer_candidates
         WHERE entity_type = ? AND entity_id = ? AND analyzed = 1`,
        [entityType, entityId]
      );

      if (candidates.length === 0) {
        logger.info('[TrailerSelectionPhase] No analyzed candidates found', {
          entityType,
          entityId,
        });
        return { selected: false, candidateId: null, score: null };
      }

      logger.info('[TrailerSelectionPhase] Found analyzed candidates', {
        entityType,
        entityId,
        totalCandidates: candidates.length,
      });

      // STEP 3: Filter out permanently unavailable candidates
      const validCandidates = candidates.filter((c) => c.failure_reason !== 'unavailable');

      if (validCandidates.length === 0) {
        logger.warn('[TrailerSelectionPhase] All candidates are unavailable', {
          entityType,
          entityId,
          totalCandidates: candidates.length,
        });
        return { selected: false, candidateId: null, score: null };
      }

      logger.info('[TrailerSelectionPhase] Valid candidates after filtering', {
        entityType,
        entityId,
        validCandidates: validCandidates.length,
        filteredOut: candidates.length - validCandidates.length,
      });

      // STEP 4: Get trailer configuration from settings
      const trailerConfig = await this.getTrailerConfig();

      logger.debug('[TrailerSelectionPhase] Trailer configuration loaded', {
        maxResolution: trailerConfig.maxResolution,
        preferredLanguage: trailerConfig.preferredLanguage,
      });

      // STEP 5: Score all remaining candidates
      const scoredCandidates = validCandidates.map((candidate) => {
        const score = this.trailerSelectionService.scoreCandidate(
          {
            id: candidate.id,
            tmdb_official: candidate.tmdb_official === 1,
            tmdb_language: candidate.tmdb_language,
            best_height: candidate.best_height,
            is_selected: candidate.is_selected === 1,
            score: candidate.score,
          },
          trailerConfig
        );

        return { candidate, score };
      });

      // STEP 6: Select the highest scoring candidate
      scoredCandidates.sort((a, b) => b.score - a.score);
      const bestCandidate = scoredCandidates[0];

      if (!bestCandidate) {
        logger.warn('[TrailerSelectionPhase] No candidates to select from', {
          entityType,
          entityId,
        });
        return { selected: false, candidateId: null, score: null };
      }

      logger.info('[TrailerSelectionPhase] Best candidate selected', {
        entityType,
        entityId,
        candidateId: bestCandidate.candidate.id,
        score: bestCandidate.score,
        official: bestCandidate.candidate.tmdb_official === 1,
        language: bestCandidate.candidate.tmdb_language,
        resolution: bestCandidate.candidate.best_height,
        topScores: scoredCandidates.slice(0, 3).map((s) => ({
          id: s.candidate.id,
          score: s.score,
        })),
      });

      // STEP 7: Update database selection
      await this.updateSelection(
        entityType,
        entityId,
        bestCandidate.candidate.id,
        bestCandidate.score
      );

      logger.info('[TrailerSelectionPhase] Trailer selection complete', {
        entityType,
        entityId,
        candidateId: bestCandidate.candidate.id,
        score: bestCandidate.score,
      });

      return {
        selected: true,
        candidateId: bestCandidate.candidate.id,
        score: bestCandidate.score,
      };
    } catch (error) {
      logger.error('[TrailerSelectionPhase] Trailer selection failed', {
        entityType: config.entityType,
        entityId: config.entityId,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Get trailer configuration from settings
   *
   * Loads user preferences for trailer selection:
   * - maxResolution: Maximum resolution to select (480, 720, 1080, 2160)
   * - preferredLanguage: Language code for scoring preference
   *
   * @returns Trailer configuration with defaults
   */
  private async getTrailerConfig(): Promise<TrailerConfig> {
    const settings = await this.db.query<{ key: string; value: string }>(
      `SELECT key, value FROM app_settings WHERE key LIKE 'movies.trailers.%'`
    );

    // Parse settings into config object
    const config: TrailerConfig = {
      maxResolution: 1080, // Default: Full HD
      preferredLanguage: 'en', // Default: English
    };

    for (const setting of settings) {
      if (setting.key === 'movies.trailers.maxResolution') {
        const resolution = parseInt(setting.value, 10);
        if ([480, 720, 1080, 2160].includes(resolution)) {
          config.maxResolution = resolution;
        }
      } else if (setting.key === 'movies.trailers.preferredLanguage') {
        config.preferredLanguage = setting.value;
      }
    }

    return config;
  }

  /**
   * Update trailer selection in database
   *
   * Process:
   * 1. Clear previous selection for this entity
   * 2. Set new selection with score and timestamp
   *
   * @param entityType - Entity type ('movie' or 'episode')
   * @param entityId - Entity ID
   * @param candidateId - Selected candidate ID
   * @param score - Calculated score
   */
  private async updateSelection(
    entityType: string,
    entityId: number,
    candidateId: number,
    score: number
  ): Promise<void> {
    // Clear previous selection for this entity
    await this.db.execute(
      `UPDATE trailer_candidates
       SET is_selected = 0, selected_at = NULL, selected_by = NULL
       WHERE entity_type = ? AND entity_id = ? AND is_selected = 1`,
      [entityType, entityId]
    );

    // Set new selection
    await this.db.execute(
      `UPDATE trailer_candidates
       SET is_selected = 1, selected_at = CURRENT_TIMESTAMP, selected_by = 'auto', score = ?
       WHERE id = ?`,
      [score, candidateId]
    );

    logger.debug('[TrailerSelectionPhase] Selection updated in database', {
      entityType,
      entityId,
      candidateId,
      score,
    });
  }

  /**
   * Check if entity's trailer field is locked
   *
   * @param entityType - Entity type ('movie' or 'episode')
   * @param entityId - Entity ID
   * @returns True if trailer field is locked
   */
  private async isTrailerLocked(entityType: string, entityId: number): Promise<boolean> {
    if (entityType === 'movie') {
      const result = await this.db.get<{ trailer_locked: number }>(
        `SELECT trailer_locked FROM movies WHERE id = ?`,
        [entityId]
      );
      return (result?.trailer_locked || 0) === 1;
    }
    // Episodes don't have trailer_locked yet
    return false;
  }
}
