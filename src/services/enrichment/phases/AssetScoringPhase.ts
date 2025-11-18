/**
 * Asset Scoring Phase (Phase 4)
 *
 * Calculates quality scores (0-100) for provider assets based on:
 * - Resolution (0-30 points)
 * - Aspect ratio (0-20 points)
 * - Language preference (0-20 points)
 * - Community votes (0-20 points)
 * - Provider priority (0-10 points)
 */

import { AssetForScoring, ProviderMetadata } from '../types.js';
import { logger } from '../../../middleware/logging.js';

export class AssetScoringPhase {
  /**
   * Calculate asset quality score (0-100 points)
   *
   * @param asset - Asset with metadata to score
   * @param userPreferredLanguage - User's preferred language (e.g., 'en', 'fr')
   * @returns Score from 0-100
   */
  calculateScore(asset: AssetForScoring, userPreferredLanguage: string): number {
    let score = 0;

    // Parse provider metadata
    const metadata: ProviderMetadata = asset.provider_metadata
      ? JSON.parse(asset.provider_metadata)
      : {};

    // ========================================
    // RESOLUTION SCORE (0-30 points)
    // ========================================
    if (asset.width && asset.height) {
      const pixels = asset.width * asset.height;
      let idealPixels: number;

      if (asset.asset_type === 'poster') {
        idealPixels = 6000000; // 2000x3000 (ideal poster resolution)
      } else if (asset.asset_type === 'fanart') {
        idealPixels = 2073600; // 1920x1080 (Full HD)
      } else {
        idealPixels = 1000000; // Generic 1MP baseline
      }

      // Scale factor: 1.0 = ideal, 1.5 = max bonus for higher res
      const scaleFactor = Math.min(pixels / idealPixels, 1.5);
      score += scaleFactor * 30;

      logger.debug('[AssetScoringPhase] Resolution score calculated', {
        assetType: asset.asset_type,
        resolution: `${asset.width}x${asset.height}`,
        pixels,
        idealPixels,
        scaleFactor: scaleFactor.toFixed(2),
        resolutionScore: (scaleFactor * 30).toFixed(1),
      });
    }

    // ========================================
    // ASPECT RATIO SCORE (0-20 points)
    // ========================================
    if (asset.width && asset.height) {
      const ratio = asset.width / asset.height;
      let idealRatio: number;

      if (asset.asset_type === 'poster') {
        idealRatio = 2 / 3; // 0.667 (standard movie poster)
      } else if (asset.asset_type === 'fanart') {
        idealRatio = 16 / 9; // 1.778 (widescreen)
      } else if (asset.asset_type === 'clearlogo') {
        idealRatio = 4.0; // Wide logos (3:1 to 5:1 range)
      } else {
        idealRatio = ratio; // Accept any ratio for unknown types
      }

      const ratioDiff = Math.abs(ratio - idealRatio);
      const ratioScore = Math.max(0, 20 - ratioDiff * 100);
      score += ratioScore;

      logger.debug('[AssetScoringPhase] Aspect ratio score calculated', {
        assetType: asset.asset_type,
        actualRatio: ratio.toFixed(3),
        idealRatio: idealRatio.toFixed(3),
        ratioDiff: ratioDiff.toFixed(3),
        ratioScore: ratioScore.toFixed(1),
      });
    }

    // ========================================
    // LANGUAGE SCORE (0-20 points)
    // ========================================
    const language = metadata.language;

    if (language === userPreferredLanguage) {
      score += 20; // Perfect match
    } else if (language === 'en') {
      score += 15; // English fallback (widely understood)
    } else if (!language) {
      score += 18; // Language-neutral (e.g., logos, no text)
    } else {
      score += 5; // Other languages (low priority)
    }

    logger.debug('[AssetScoringPhase] Language score calculated', {
      language: language || 'none',
      userPreferred: userPreferredLanguage,
      languageScore: score - (asset.width && asset.height ? 50 : 0), // Isolate language component
    });

    // ========================================
    // COMMUNITY VOTES SCORE (0-20 points)
    // ========================================
    const voteAverage = metadata.vote_average || metadata.voteAverage || 0; // 0-10 scale
    const voteCount = metadata.vote_count || metadata.votes || 0;

    // Normalize vote average to 0-1 scale
    const normalized = voteAverage / 10;

    // Weight by vote count (need 50+ votes for full confidence)
    const weight = Math.min(voteCount / 50, 1.0);
    const voteScore = normalized * weight * 20;
    score += voteScore;

    logger.debug('[AssetScoringPhase] Community votes score calculated', {
      voteAverage,
      voteCount,
      normalized: normalized.toFixed(2),
      weight: weight.toFixed(2),
      voteScore: voteScore.toFixed(1),
    });

    // ========================================
    // PROVIDER PRIORITY (0-10 points)
    // ========================================
    let providerScore = 5; // Default for unknown providers

    if (asset.provider_name === 'tmdb') {
      providerScore = 10; // TMDB: highest quality, most votes
    } else if (asset.provider_name === 'fanart.tv') {
      providerScore = 9; // Fanart.tv: high quality, curated
    } else if (asset.provider_name === 'tvdb') {
      providerScore = 8; // TVDB: good for TV shows
    }

    score += providerScore;

    logger.debug('[AssetScoringPhase] Provider priority score calculated', {
      provider: asset.provider_name,
      providerScore,
    });

    const finalScore = Math.round(score);

    logger.info('[AssetScoringPhase] Final asset score calculated', {
      assetType: asset.asset_type,
      provider: asset.provider_name,
      resolution: asset.width && asset.height ? `${asset.width}x${asset.height}` : 'unknown',
      finalScore,
    });

    return finalScore;
  }

  /**
   * Score multiple assets and return sorted by score (descending)
   *
   * @param assets - Array of assets to score
   * @param userPreferredLanguage - User's preferred language
   * @returns Assets with scores, sorted by score descending
   */
  scoreAssets<T extends AssetForScoring>(
    assets: T[],
    userPreferredLanguage: string
  ): Array<T & { score: number }> {
    const scoredAssets = assets.map((asset) => ({
      ...asset,
      score: this.calculateScore(asset, userPreferredLanguage),
    }));

    // Sort by score descending (highest quality first)
    scoredAssets.sort((a, b) => b.score - a.score);

    logger.info('[AssetScoringPhase] Scored and sorted assets', {
      totalAssets: assets.length,
      avgScore: (scoredAssets.reduce((sum, a) => sum + a.score, 0) / assets.length).toFixed(1),
      topScore: scoredAssets[0]?.score,
      bottomScore: scoredAssets[scoredAssets.length - 1]?.score,
    });

    return scoredAssets;
  }
}
