/**
 * Asset Selector
 *
 * Implements the "best N" asset selection algorithm.
 * Scores asset candidates based on resolution, votes, language, provider quality, and aspect ratio.
 */

import { AssetCandidate, AssetType, ProviderId } from '../../types/providers/index.js';
import { ProviderRegistry } from './ProviderRegistry.js';
import { logger } from '../../middleware/logging.js';

/**
 * Asset selection configuration
 */
export interface AssetSelectionConfig {
  assetType: AssetType;
  maxCount: number;
  minWidth?: number;
  minHeight?: number;
  qualityPreference?: 'any' | 'sd' | 'hd' | '4k';
  preferLanguage?: string;
  allowMultilingual?: boolean;
  pHashThreshold?: number; // 0-1, for deduplication
  providerPriority?: ProviderId[];
}

/**
 * Scoring weights for asset selection
 */
interface ScoringWeights {
  resolution: number;
  votes: number;
  language: number;
  provider: number;
  aspectRatio: number;
}

/**
 * Provider quality scores
 */
const PROVIDER_QUALITY: Record<string, number> = {
  fanart_tv: 1.0,
  tmdb: 0.8,
  tvdb: 0.6,
  imdb: 0.5,
  local: 0.5,
};

/**
 * Ideal aspect ratios for each asset type
 */
const IDEAL_ASPECT_RATIOS: Record<string, number> = {
  poster: 0.67, // 2:3
  fanart: 1.78, // 16:9
  banner: 5.4, // ~10:2
  clearart: 1.0, // 1:1
  clearlogo: 1.0, // Variable, but prefer square
  thumb: 1.78, // 16:9
  landscape: 1.78, // 16:9
  discart: 1.0, // 1:1
  characterart: 0.67, // 2:3 typical
  keyart: 0.67, // 2:3 typical
};

/**
 * Asset Selector class
 */
export class AssetSelector {
  private readonly config: AssetSelectionConfig;
  private readonly weights: ScoringWeights;
  private readonly providerRegistry: ProviderRegistry;

  constructor(config: AssetSelectionConfig) {
    this.config = {
      ...config,
      preferLanguage: config.preferLanguage || 'en',
      allowMultilingual: config.allowMultilingual ?? true,
      pHashThreshold: config.pHashThreshold || 0.92,
    };

    // Fixed weights based on research and best practices
    this.weights = {
      resolution: 0.25,
      votes: 0.30,
      language: 0.20,
      provider: 0.15,
      aspectRatio: 0.10,
    };

    this.providerRegistry = ProviderRegistry.getInstance();
  }

  /**
   * Select best N asset candidates
   */
  selectBest(candidates: AssetCandidate[]): AssetCandidate[] {
    logger.info(`Selecting best ${this.config.maxCount} ${this.config.assetType} from ${candidates.length} candidates`);

    // Step 1: Filter by quality constraints
    const filtered = this.applyQualityFilters(candidates);
    logger.debug(`After quality filtering: ${filtered.length} candidates`);

    if (filtered.length === 0) {
      logger.warn(`No candidates passed quality filters for ${this.config.assetType}`);
      return [];
    }

    // Step 2: Score each candidate
    const scored = filtered.map(candidate => ({
      candidate,
      score: this.scoreCandidate(candidate),
    }));

    // Step 3: Sort by score (descending)
    scored.sort((a, b) => b.score - a.score);

    // Step 4: Deduplicate by perceptual hash
    const deduplicated = this.deduplicateByPHash(scored);
    logger.debug(`After deduplication: ${deduplicated.length} candidates`);

    // Step 5: Select top N
    const selected = deduplicated
      .slice(0, this.config.maxCount)
      .map(s => s.candidate);

    logger.info(`Selected ${selected.length} ${this.config.assetType}`, {
      topScores: scored.slice(0, 5).map(s => Math.round(s.score)),
      providers: selected.map(c => c.providerId),
    });

    return selected;
  }

  /**
   * Apply quality filters
   */
  private applyQualityFilters(candidates: AssetCandidate[]): AssetCandidate[] {
    return candidates.filter(candidate => {
      // Minimum dimensions
      if (this.config.minWidth && candidate.width && candidate.width < this.config.minWidth) {
        return false;
      }
      if (this.config.minHeight && candidate.height && candidate.height < this.config.minHeight) {
        return false;
      }

      // Quality preference
      if (this.config.qualityPreference !== 'any' && candidate.quality) {
        const qualityRank: Record<string, number> = { sd: 1, hd: 2, '4k': 3 };
        const preferredRank = qualityRank[this.config.qualityPreference!];
        const candidateRank = qualityRank[candidate.quality];

        if (candidateRank < preferredRank) {
          return false;
        }
      }

      // Language filter
      if (!this.config.allowMultilingual && candidate.language) {
        if (candidate.language !== this.config.preferLanguage) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Score a single candidate
   */
  private scoreCandidate(candidate: AssetCandidate): number {
    let score = 0;

    // 1. Resolution score (0-100)
    if (candidate.width && candidate.height) {
      const pixels = candidate.width * candidate.height;
      const maxPixels = 3840 * 2160; // 4K
      const resolutionScore = Math.min((pixels / maxPixels) * 100, 100);
      score += resolutionScore * this.weights.resolution;
    }

    // 2. Vote score (0-100)
    if (candidate.votes !== undefined && candidate.voteAverage !== undefined) {
      // Combine vote count and average
      const voteCountScore = Math.min((candidate.votes / 100) * 50, 50);
      const voteAvgScore = (candidate.voteAverage / 10) * 50;
      const voteScore = voteCountScore + voteAvgScore;
      score += voteScore * this.weights.votes;
    } else if (candidate.voteAverage !== undefined) {
      // Only average available
      const voteScore = (candidate.voteAverage / 10) * 100;
      score += voteScore * this.weights.votes;
    }

    // 3. Language score (0 or 100)
    if (candidate.language) {
      const langScore = candidate.language === this.config.preferLanguage ? 100 : 0;
      score += langScore * this.weights.language;
    } else {
      // No language specified, assume preferred
      score += 100 * this.weights.language;
    }

    // 4. Provider quality score (0-100)
    const providerQuality = PROVIDER_QUALITY[candidate.providerId] || 0.5;
    score += providerQuality * 100 * this.weights.provider;

    // 5. Aspect ratio score (0-100)
    if (candidate.aspectRatio) {
      const idealRatio = IDEAL_ASPECT_RATIOS[candidate.assetType] || 1.0;
      const deviation = Math.abs(idealRatio - candidate.aspectRatio);
      const aspectScore = Math.max(0, 100 - deviation * 200);
      score += aspectScore * this.weights.aspectRatio;
    }

    // 6. Provider preference boost
    if (this.config.providerPriority) {
      const providerIndex = this.config.providerPriority.indexOf(candidate.providerId);
      if (providerIndex !== -1) {
        const priorityBoost = (this.config.providerPriority.length - providerIndex) * 2;
        score += priorityBoost;
      }
    }

    // 7. Provider's preferred flag
    if (candidate.isPreferredByProvider) {
      score += 10;
    }

    return score;
  }

  /**
   * Deduplicate candidates by perceptual hash
   */
  private deduplicateByPHash(
    scored: Array<{ candidate: AssetCandidate; score: number }>
  ): Array<{ candidate: AssetCandidate; score: number }> {
    const unique: Array<{ candidate: AssetCandidate; score: number }> = [];

    for (const item of scored) {
      const isDuplicate = unique.some(existing => {
        if (!item.candidate.perceptualHash || !existing.candidate.perceptualHash) {
          return false;
        }

        const similarity = this.comparePHash(
          item.candidate.perceptualHash,
          existing.candidate.perceptualHash
        );

        return similarity >= this.config.pHashThreshold!;
      });

      if (!isDuplicate) {
        unique.push(item);
      } else {
        logger.debug(`Skipping duplicate asset`, {
          url: item.candidate.url,
          similarity: 'high',
        });
      }
    }

    return unique;
  }

  /**
   * Compare two perceptual hashes
   * Returns similarity score (0-1)
   */
  private comparePHash(hash1: string, hash2: string): number {
    if (hash1.length !== hash2.length) {
      return 0;
    }

    let matches = 0;
    for (let i = 0; i < hash1.length; i++) {
      if (hash1[i] === hash2[i]) {
        matches++;
      }
    }

    return matches / hash1.length;
  }

  /**
   * Get scoring weights (for transparency/debugging)
   */
  getWeights(): ScoringWeights {
    return { ...this.weights };
  }

  /**
   * Get configuration
   */
  getConfig(): AssetSelectionConfig {
    return { ...this.config };
  }
}
