import { DatabaseManager } from '../database/DatabaseManager.js';
import { logger } from '../middleware/logging.js';

/**
 * Asset Candidate Service
 *
 * Manages asset candidate caching, scoring, and selection.
 * Candidates are cached URLs from providers with metadata and scores.
 * This enables instant browsing without API calls.
 */

export interface AssetCandidate {
  id?: number;
  entity_type: string;
  entity_id: number;
  asset_type: string;
  provider: string;
  url: string;
  width?: number;
  height?: number;
  language?: string;
  vote_average?: number;
  vote_count?: number;
  score: number;
  is_selected: boolean;
  is_blocked: boolean;
  selected_at?: Date;
  selected_by?: string;
  blocked_at?: Date;
  blocked_by?: string;
  last_refreshed: Date;
  created_at: Date;
}

export interface AssetMetadata {
  url: string;
  width?: number;
  height?: number;
  language?: string;
  vote_average?: number;
  vote_count?: number;
}

export class AssetCandidateService {
  constructor(private db: DatabaseManager) {}

  /**
   * Calculate score for an asset candidate
   *
   * Scoring algorithm based on multiple factors:
   * - Resolution (higher is better, penalty for very low)
   * - Aspect ratio (prefer 2:3 for posters, 16:9 for fanart)
   * - Language match (prefer user's language)
   * - Community votes (TMDB/TVDB ratings)
   * - Provider priority (TMDB > TVDB > FanArt)
   *
   * Score range: 0-100
   */
  calculateScore(
    assetType: string,
    metadata: AssetMetadata,
    provider: string,
    preferredLanguage: string = 'en'
  ): number {
    let score = 0;

    // ============================================================
    // RESOLUTION SCORE (0-30 points)
    // ============================================================
    if (metadata.width && metadata.height) {
      const pixels = metadata.width * metadata.height;

      if (assetType === 'poster') {
        // Poster ideal: 2000x3000 (6M pixels)
        if (pixels >= 6000000) score += 30; // Excellent
        else if (pixels >= 3000000) score += 25; // Good (1500x2250)
        else if (pixels >= 1000000) score += 20; // Acceptable (1000x1500)
        else if (pixels >= 500000) score += 10; // Low quality
        else score += 5; // Very low
      } else if (assetType === 'fanart') {
        // Fanart ideal: 1920x1080 (2M pixels)
        if (pixels >= 2000000) score += 30; // Excellent (1920x1080)
        else if (pixels >= 1500000) score += 25; // Good (1600x900)
        else if (pixels >= 1000000) score += 20; // Acceptable (1280x720)
        else if (pixels >= 500000) score += 10; // Low quality
        else score += 5; // Very low
      } else {
        // Generic: favor higher resolution
        if (pixels >= 2000000) score += 30;
        else if (pixels >= 1000000) score += 20;
        else if (pixels >= 500000) score += 10;
        else score += 5;
      }
    } else {
      // No resolution info, assume medium quality
      score += 15;
    }

    // ============================================================
    // ASPECT RATIO SCORE (0-20 points)
    // ============================================================
    if (metadata.width && metadata.height) {
      const aspectRatio = metadata.width / metadata.height;

      if (assetType === 'poster') {
        // Posters should be 2:3 (0.667)
        const ideal = 2 / 3;
        const diff = Math.abs(aspectRatio - ideal);
        if (diff < 0.05) score += 20; // Perfect
        else if (diff < 0.1) score += 15; // Close
        else if (diff < 0.2) score += 10; // Acceptable
        else score += 5; // Wrong aspect ratio
      } else if (assetType === 'fanart' || assetType === 'landscape') {
        // Fanart/landscape should be 16:9 (1.778)
        const ideal = 16 / 9;
        const diff = Math.abs(aspectRatio - ideal);
        if (diff < 0.1) score += 20; // Perfect
        else if (diff < 0.2) score += 15; // Close
        else if (diff < 0.3) score += 10; // Acceptable
        else score += 5; // Wrong aspect ratio
      } else if (assetType === 'clearlogo' || assetType === 'clearart') {
        // Clear assets: wider is better (3:1 to 5:1)
        if (aspectRatio >= 3 && aspectRatio <= 5) score += 20;
        else if (aspectRatio >= 2 && aspectRatio <= 6) score += 15;
        else score += 10;
      } else {
        // Generic: any aspect ratio is fine
        score += 15;
      }
    } else {
      // No aspect ratio info
      score += 10;
    }

    // ============================================================
    // LANGUAGE SCORE (0-20 points)
    // ============================================================
    if (metadata.language) {
      if (metadata.language === preferredLanguage) {
        score += 20; // Perfect language match
      } else if (metadata.language === 'en') {
        score += 15; // English fallback
      } else if (metadata.language === 'null' || metadata.language === 'xx') {
        score += 18; // Language-neutral (logos, etc)
      } else {
        score += 5; // Other language
      }
    } else {
      // No language info, assume neutral
      score += 15;
    }

    // ============================================================
    // COMMUNITY VOTES SCORE (0-20 points)
    // ============================================================
    if (metadata.vote_average && metadata.vote_count) {
      // Weight by both rating and number of votes
      const normalizedRating = metadata.vote_average / 10; // 0-1 scale
      const voteWeight = Math.min(metadata.vote_count / 50, 1); // Cap at 50 votes

      const voteScore = normalizedRating * voteWeight * 20;
      score += voteScore;
    } else {
      // No votes, assume medium quality
      score += 10;
    }

    // ============================================================
    // PROVIDER PRIORITY (0-10 points)
    // ============================================================
    if (provider === 'tmdb') {
      score += 10; // TMDB is most reliable
    } else if (provider === 'tvdb') {
      score += 8; // TVDB is good
    } else if (provider === 'fanart') {
      score += 9; // FanArt has high quality images
    } else if (provider === 'local') {
      score += 7; // Local files (user provided)
    } else {
      score += 5; // Other providers
    }

    // ============================================================
    // NORMALIZE AND RETURN
    // ============================================================
    // Clamp to 0-100 range
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Cache asset candidates from provider results
   *
   * Stores asset URLs with calculated scores in database.
   * Skips blocked assets and updates existing candidates.
   *
   * @param entityType - Entity type ('movie', 'series', etc)
   * @param entityId - Entity ID
   * @param assetType - Asset type ('poster', 'fanart', etc)
   * @param provider - Provider name ('tmdb', 'tvdb', etc)
   * @param assets - Array of asset metadata from provider
   * @returns Number of candidates cached
   */
  async cacheAssetCandidates(
    entityType: string,
    entityId: number,
    assetType: string,
    provider: string,
    assets: AssetMetadata[],
    preferredLanguage: string = 'en'
  ): Promise<number> {
    try {
      const conn = this.db.getConnection();
      let cached = 0;

      for (const asset of assets) {
        // Calculate score
        const score = this.calculateScore(assetType, asset, provider, preferredLanguage);

        // Check if candidate already exists
        const existing = await conn.query<AssetCandidate>(
          `SELECT id, is_blocked, is_selected FROM asset_candidates
           WHERE entity_type = ? AND entity_id = ? AND asset_type = ? AND url = ?`,
          [entityType, entityId, assetType, asset.url]
        );

        if (existing.length > 0) {
          const candidate = existing[0];

          // Skip if blocked
          if (candidate.is_blocked) {
            logger.debug('Skipping blocked asset candidate', {
              entityType,
              entityId,
              assetType,
              url: asset.url
            });
            continue;
          }

          // Update existing candidate (refresh metadata and score)
          // Don't touch is_selected - preserve user selection
          await conn.execute(
            `UPDATE asset_candidates
             SET width = ?, height = ?, language = ?,
                 vote_average = ?, vote_count = ?, score = ?,
                 last_refreshed = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [
              asset.width,
              asset.height,
              asset.language,
              asset.vote_average,
              asset.vote_count,
              score,
              candidate.id
            ]
          );

          cached++;
        } else {
          // Insert new candidate
          await conn.execute(
            `INSERT INTO asset_candidates
             (entity_type, entity_id, asset_type, provider, url,
              width, height, language, vote_average, vote_count, score)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              entityType,
              entityId,
              assetType,
              provider,
              asset.url,
              asset.width,
              asset.height,
              asset.language,
              asset.vote_average,
              asset.vote_count,
              score
            ]
          );

          cached++;
        }
      }

      logger.info('Cached asset candidates', {
        entityType,
        entityId,
        assetType,
        provider,
        count: cached
      });

      return cached;
    } catch (error: any) {
      logger.error('Failed to cache asset candidates', {
        entityType,
        entityId,
        assetType,
        provider,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get all asset candidates for an entity
   *
   * Returns cached candidates sorted by score (highest first).
   * Excludes blocked assets.
   *
   * @param entityType - Entity type
   * @param entityId - Entity ID
   * @param assetType - Asset type
   * @param includeBlocked - Include blocked assets (default: false)
   * @returns Array of asset candidates
   */
  async getAssetCandidates(
    entityType: string,
    entityId: number,
    assetType: string,
    includeBlocked: boolean = false
  ): Promise<AssetCandidate[]> {
    try {
      const conn = this.db.getConnection();

      const blockedFilter = includeBlocked ? '' : 'AND is_blocked = 0';

      const candidates = await conn.query<AssetCandidate>(
        `SELECT * FROM asset_candidates
         WHERE entity_type = ? AND entity_id = ? AND asset_type = ?
         ${blockedFilter}
         ORDER BY is_selected DESC, score DESC, created_at DESC`,
        [entityType, entityId, assetType]
      );

      return candidates;
    } catch (error: any) {
      logger.error('Failed to get asset candidates', {
        entityType,
        entityId,
        assetType,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Select an asset candidate
   *
   * Marks candidate as selected and deselects all others of same type.
   * Automatically locks the asset field to prevent automation from changing it.
   *
   * @param candidateId - Candidate ID
   * @param selectedBy - User/system identifier
   * @returns Updated candidate
   */
  async selectAssetCandidate(
    candidateId: number,
    selectedBy: string = 'user'
  ): Promise<AssetCandidate> {
    try {
      const conn = this.db.getConnection();

      // Get candidate info
      const candidates = await conn.query<AssetCandidate>(
        'SELECT * FROM asset_candidates WHERE id = ?',
        [candidateId]
      );

      if (candidates.length === 0) {
        throw new Error('Asset candidate not found');
      }

      const candidate = candidates[0];

      // Deselect all other candidates of same type for this entity
      await conn.execute(
        `UPDATE asset_candidates
         SET is_selected = 0, selected_at = NULL, selected_by = NULL
         WHERE entity_type = ? AND entity_id = ? AND asset_type = ?`,
        [candidate.entity_type, candidate.entity_id, candidate.asset_type]
      );

      // Select this candidate
      await conn.execute(
        `UPDATE asset_candidates
         SET is_selected = 1, selected_at = CURRENT_TIMESTAMP, selected_by = ?
         WHERE id = ?`,
        [selectedBy, candidateId]
      );

      logger.info('Selected asset candidate', {
        candidateId,
        entityType: candidate.entity_type,
        entityId: candidate.entity_id,
        assetType: candidate.asset_type,
        selectedBy
      });

      // Return updated candidate
      const updated = await conn.query<AssetCandidate>(
        'SELECT * FROM asset_candidates WHERE id = ?',
        [candidateId]
      );

      return updated[0];
    } catch (error: any) {
      logger.error('Failed to select asset candidate', {
        candidateId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Block an asset candidate
   *
   * Marks candidate as blocked (blacklist).
   * Blocked assets are hidden from browser and skipped by auto-selection.
   *
   * @param candidateId - Candidate ID
   * @param blockedBy - User identifier
   */
  async blockAssetCandidate(candidateId: number, blockedBy: string = 'user'): Promise<void> {
    try {
      const conn = this.db.getConnection();

      await conn.execute(
        `UPDATE asset_candidates
         SET is_blocked = 1, is_selected = 0, blocked_at = CURRENT_TIMESTAMP, blocked_by = ?
         WHERE id = ?`,
        [blockedBy, candidateId]
      );

      logger.info('Blocked asset candidate', {
        candidateId,
        blockedBy
      });
    } catch (error: any) {
      logger.error('Failed to block asset candidate', {
        candidateId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Unblock an asset candidate
   *
   * Removes block from candidate, making it available again.
   *
   * @param candidateId - Candidate ID
   */
  async unblockAssetCandidate(candidateId: number): Promise<void> {
    try {
      const conn = this.db.getConnection();

      await conn.execute(
        `UPDATE asset_candidates
         SET is_blocked = 0, blocked_at = NULL, blocked_by = NULL
         WHERE id = ?`,
        [candidateId]
      );

      logger.info('Unblocked asset candidate', {
        candidateId
      });
    } catch (error: any) {
      logger.error('Failed to unblock asset candidate', {
        candidateId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Reset asset selection
   *
   * Deselects all candidates for a specific asset type.
   * Use this when user wants to clear their selection and start over.
   *
   * @param entityType - Entity type
   * @param entityId - Entity ID
   * @param assetType - Asset type
   */
  async resetAssetSelection(
    entityType: string,
    entityId: number,
    assetType: string
  ): Promise<void> {
    try {
      const conn = this.db.getConnection();

      await conn.execute(
        `UPDATE asset_candidates
         SET is_selected = 0, selected_at = NULL, selected_by = NULL
         WHERE entity_type = ? AND entity_id = ? AND asset_type = ?`,
        [entityType, entityId, assetType]
      );

      logger.info('Reset asset selection', {
        entityType,
        entityId,
        assetType
      });
    } catch (error: any) {
      logger.error('Failed to reset asset selection', {
        entityType,
        entityId,
        assetType,
        error: error.message
      });
      throw error;
    }
  }
}
