/**
 * Auto Selection Service - Asset Scoring & Ranking
 *
 * Implements a hybrid tier + voting algorithm to automatically select the "best" asset
 * from multiple providers for each asset type (poster, fanart, logo, etc.).
 *
 * Algorithm Overview:
 * 1. Tier System (Primary): Language + HD quality determines tier (1-4)
 * 2. Within Same Tier: Use votes/likes if difference is significant
 * 3. Resolution Tie-breaking: Use resolution if votes are similar
 * 4. Provider Priority: Final tie-breaker using provider order
 *
 * Tier Definitions:
 * - Tier 1: Preferred language + HD (1920px+ or hint contains "HD"/"BluRay"/"4K")
 * - Tier 2: Preferred language only
 * - Tier 3: HD only
 * - Tier 4: Everything else
 */

import { AssetCandidate } from '../types/providers/requests.js';
import { AssetType } from '../types/providers/capabilities.js';
import { DataSelectionService } from './dataSelectionService.js';
import { logger } from '../middleware/logging.js';
import { DatabaseConnection } from '../types/database.js';

/**
 * Auto-selection strategy type
 */
export type AutoSelectionStrategy = 'balanced' | 'custom';

/**
 * Auto-selection settings
 */
export interface AutoSelectionSettings {
  id: number;
  strategy: AutoSelectionStrategy;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Asset candidates grouped by provider name
 */
export interface AssetCandidatesByProvider {
  [providerName: string]: AssetCandidate[];
}

/**
 * Scored asset with tier and quality metrics
 */
export interface AssetScore {
  asset: AssetCandidate;
  providerName: string;
  tier: number; // 1-4 (1 is best)
  resolution: number; // width * height
  votes: number | undefined;
  providerPriority: number; // Index in priority array (0 is highest priority)
  score: number; // 0-1 normalized score for display
  reason: string; // Human-readable explanation
}

/**
 * Selected asset result
 */
export interface SelectedAsset {
  assetType: AssetType;
  asset: AssetCandidate;
  providerName: string;
  score: number;
  reason: string;
}

/**
 * Selection options
 */
export interface SelectionOptions {
  respectLocks?: boolean; // Skip locked fields (default: true)
  existingAssets?: ExistingAsset[]; // For duplicate detection
  preferredLanguage?: string; // Override user preference (default: 'en')
}

/**
 * Existing asset for duplicate detection
 */
export interface ExistingAsset {
  assetType: AssetType;
  url?: string;
  width?: number;
  height?: number;
  fileSize?: number;
  perceptualHash?: string;
}

/**
 * Auto Selection Service
 *
 * Provides two main features:
 * 1. Strategy management (balanced vs custom provider priorities)
 * 2. Asset scoring and selection (hybrid tier + voting algorithm)
 */
export class AutoSelectionService {
  constructor(
    private db: DatabaseConnection,
    private dataSelectionService: DataSelectionService
  ) {}

  // ============================================
  // Strategy Management Methods
  // ============================================

  /**
   * Get the current auto-selection strategy
   */
  async getStrategy(): Promise<AutoSelectionSettings> {
    const rows = await this.db.query<{
      id: number;
      strategy: string;
      created_at: string;
      updated_at: string;
    }>(`SELECT * FROM auto_selection_strategy LIMIT 1`);

    if (rows.length === 0) {
      // Initialize if not exists
      await this.db.execute(
        `INSERT INTO auto_selection_strategy (strategy) VALUES (?)`,
        ['balanced']
      );

      return {
        id: 1,
        strategy: 'balanced',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    const row = rows[0];
    return {
      id: row.id,
      strategy: row.strategy as AutoSelectionStrategy,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * Set the auto-selection strategy
   */
  async setStrategy(strategy: AutoSelectionStrategy): Promise<void> {
    // Validate strategy
    if (strategy !== 'balanced' && strategy !== 'custom') {
      throw new Error(`Invalid strategy: ${strategy}. Must be 'balanced' or 'custom'.`);
    }

    // Update or insert
    const existing = await this.getStrategy();

    await this.db.execute(
      `UPDATE auto_selection_strategy
       SET strategy = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [strategy, existing.id]
    );

    logger.info(`Auto-selection strategy set to: ${strategy}`);
  }

  /**
   * Check if using balanced strategy
   */
  async isBalanced(): Promise<boolean> {
    const settings = await this.getStrategy();
    return settings.strategy === 'balanced';
  }

  /**
   * Check if using custom strategy
   */
  async isCustom(): Promise<boolean> {
    const settings = await this.getStrategy();
    return settings.strategy === 'custom';
  }

  // ============================================
  // Asset Scoring & Selection Methods
  // ============================================

  /**
   * Select best assets from provider results
   *
   * @param providerResults - Assets grouped by provider name
   * @param mediaType - 'movie' | 'tvshow' | 'music'
   * @param options - Selection options
   * @returns Array of selected assets (one per asset type)
   */
  async selectBestAssets(
    providerResults: AssetCandidatesByProvider,
    mediaType: 'movie' | 'tvshow' | 'music',
    options?: SelectionOptions
  ): Promise<SelectedAsset[]> {
    const opts: SelectionOptions = {
      respectLocks: options?.respectLocks ?? true,
      existingAssets: options?.existingAssets ?? [],
      preferredLanguage: options?.preferredLanguage ?? 'en',
    };

    logger.info('Selecting best assets', {
      mediaType,
      providers: Object.keys(providerResults),
      options: opts,
    });

    // Flatten provider results into single array with provider names
    const allAssets: Array<{ asset: AssetCandidate; providerName: string }> = [];
    for (const [providerName, assets] of Object.entries(providerResults)) {
      for (const asset of assets) {
        allAssets.push({ asset, providerName });
      }
    }

    // Group by asset type
    const assetsByType = new Map<AssetType, Array<{ asset: AssetCandidate; providerName: string }>>();
    for (const item of allAssets) {
      const assetType = item.asset.assetType;
      if (!assetsByType.has(assetType)) {
        assetsByType.set(assetType, []);
      }
      assetsByType.get(assetType)!.push(item);
    }

    // Select best for each asset type
    const selected: SelectedAsset[] = [];
    for (const [assetType, candidates] of Array.from(assetsByType.entries())) {
      // Filter out duplicates
      const filteredCandidates = this.filterDuplicates(candidates, opts.existingAssets!);

      if (filteredCandidates.length === 0) {
        logger.debug(`No candidates for ${assetType} after duplicate filtering`);
        continue;
      }

      // Get provider priority order for this asset type
      const fieldKey = `${mediaType}s.${assetType}`;
      const providerOrder = await this.dataSelectionService.getProviderOrder('images', fieldKey);

      // Score all candidates
      const scored = await Promise.all(
        filteredCandidates.map(async ({ asset, providerName }) =>
          this.scoreAsset(asset, assetType, providerName, providerOrder, opts.preferredLanguage!)
        )
      );

      // Sort and select best
      scored.sort((a, b) => this.compareAssets(a, b));

      if (scored.length > 0) {
        const best = scored[0];
        selected.push({
          assetType,
          asset: best.asset,
          providerName: best.providerName,
          score: best.score,
          reason: best.reason,
        });

        logger.info(`Selected best ${assetType}`, {
          provider: best.providerName,
          tier: best.tier,
          score: best.score,
          reason: best.reason,
        });
      }
    }

    return selected;
  }

  /**
   * Score a single asset
   *
   * @param asset - Asset candidate
   * @param assetType - Type of asset
   * @param providerName - Provider name
   * @param providerPriority - Provider order array
   * @param preferredLanguage - User's preferred language
   * @returns Asset score with tier and metrics
   */
  scoreAsset(
    asset: AssetCandidate,
    assetType: AssetType,
    providerName: string,
    providerOrder: string[],
    preferredLanguage: string
  ): AssetScore {
    // Calculate tier (1-4)
    const tier = this.calculateTier(asset, preferredLanguage);

    // Calculate resolution
    const resolution = (asset.width ?? 0) * (asset.height ?? 0);

    // Get provider priority index
    const providerPriority = providerOrder.indexOf(providerName);
    const priorityIndex = providerPriority === -1 ? providerOrder.length : providerPriority;

    // Calculate normalized score (0-1) for display
    const score = this.calculateNormalizedScore(asset, tier, assetType);

    // Generate reason
    const reason = this.generateReason(asset, tier);

    return {
      asset,
      providerName,
      tier,
      resolution,
      votes: asset.votes,
      providerPriority: priorityIndex,
      score,
      reason,
    };
  }

  /**
   * Compare two assets (returns negative if a is better, positive if b is better)
   *
   * Comparison order:
   * 1. Tier (lower is better)
   * 2. Votes (if difference > 50% of smaller value)
   * 3. Resolution (if difference > 10%)
   * 4. Provider priority (lower index is better)
   *
   * @param a - First asset score
   * @param b - Second asset score
   * @returns Negative if a better, positive if b better, 0 if equal
   */
  compareAssets(a: AssetScore, b: AssetScore): number {
    // 1. Compare by tier (lower tier number is better)
    if (a.tier !== b.tier) {
      return a.tier - b.tier;
    }

    // 2. Compare by votes (if both have votes)
    if (a.votes !== undefined && b.votes !== undefined) {
      const smallerVotes = Math.min(a.votes, b.votes);
      const voteDifference = Math.abs(a.votes - b.votes);
      const threshold = smallerVotes * 0.5; // 50% threshold

      if (voteDifference > threshold) {
        // Significant vote difference - prefer higher votes
        return b.votes - a.votes;
      }
    }

    // 3. Compare by resolution (if difference > 10%)
    if (a.resolution > 0 && b.resolution > 0) {
      const smallerResolution = Math.min(a.resolution, b.resolution);
      const resolutionDifference = Math.abs(a.resolution - b.resolution);
      const threshold = smallerResolution * 0.1; // 10% threshold

      if (resolutionDifference > threshold) {
        // Significant resolution difference - prefer higher resolution
        return b.resolution - a.resolution;
      }
    }

    // 4. Compare by provider priority (lower index is better)
    return a.providerPriority - b.providerPriority;
  }

  /**
   * Calculate tier for asset
   *
   * @param asset - Asset candidate
   * @param preferredLanguage - Preferred language
   * @returns Tier number (1-4)
   */
  private calculateTier(asset: AssetCandidate, preferredLanguage: string): number {
    const hasPreferredLanguage = this.hasPreferredLanguage(asset, preferredLanguage);
    const isHD = this.isHD(asset);

    if (hasPreferredLanguage && isHD) {
      return 1; // Tier 1: Preferred language + HD
    } else if (hasPreferredLanguage) {
      return 2; // Tier 2: Preferred language only
    } else if (isHD) {
      return 3; // Tier 3: HD only
    } else {
      return 4; // Tier 4: Everything else
    }
  }

  /**
   * Check if asset has preferred language
   */
  private hasPreferredLanguage(asset: AssetCandidate, preferredLanguage: string): boolean {
    const langScore = this.getLanguageScore(asset.language, preferredLanguage);
    return langScore >= 0.5; // Match or language-neutral
  }

  /**
   * Check if asset is HD quality
   */
  private isHD(asset: AssetCandidate): boolean {
    // Check resolution (1920px+ in either dimension)
    if (asset.width && asset.width >= 1920) {
      return true;
    }
    if (asset.height && asset.height >= 1920) {
      return true;
    }

    // Check quality hints in metadata
    if (asset.metadata) {
      const metadataStr = JSON.stringify(asset.metadata).toLowerCase();
      if (
        metadataStr.includes('hd') ||
        metadataStr.includes('bluray') ||
        metadataStr.includes('4k') ||
        metadataStr.includes('uhd') ||
        metadataStr.includes('1080p') ||
        metadataStr.includes('2160p')
      ) {
        return true;
      }
    }

    // Check quality field
    if (asset.quality === 'hd' || asset.quality === '4k') {
      return true;
    }

    return false;
  }

  /**
   * Get language matching score
   *
   * @param assetLang - Asset language code
   * @param preferredLang - Preferred language code
   * @returns Score (0.0, 0.5, or 1.0)
   */
  private getLanguageScore(assetLang: string | undefined, preferredLang: string): number {
    if (!assetLang || assetLang === '' || assetLang === 'xx' || assetLang === 'null') {
      // Empty/missing language = language-neutral (e.g., artwork with no text)
      return 0.5;
    }

    if (assetLang.toLowerCase() === preferredLang.toLowerCase()) {
      // Exact match
      return 1.0;
    }

    // Wrong language
    return 0.0;
  }

  /**
   * Get resolution score (0-1)
   *
   * @param width - Image width
   * @param height - Image height
   * @returns Normalized score (0-1)
   */
  private getResolutionScore(width: number, height: number): number {
    const pixelCount = width * height;

    // Resolution thresholds
    const thresholds = {
      '8k': 7680 * 4320,    // 1.0
      '4k': 3840 * 2160,    // 0.95
      '1440p': 2560 * 1440, // 0.85
      '1080p': 1920 * 1080, // 0.75
      '720p': 1280 * 720,   // 0.6
      '480p': 854 * 480,    // 0.4
      '360p': 640 * 360,    // 0.2
    };

    if (pixelCount >= thresholds['8k']) return 1.0;
    if (pixelCount >= thresholds['4k']) return 0.95;
    if (pixelCount >= thresholds['1440p']) return 0.85;
    if (pixelCount >= thresholds['1080p']) return 0.75;
    if (pixelCount >= thresholds['720p']) return 0.6;
    if (pixelCount >= thresholds['480p']) return 0.4;
    if (pixelCount >= thresholds['360p']) return 0.2;

    // Below 360p
    return Math.max(0.1, pixelCount / thresholds['360p'] * 0.2);
  }

  /**
   * Get aspect ratio score (0-1)
   *
   * @param width - Image width
   * @param height - Image height
   * @param expectedRatio - Expected aspect ratio
   * @returns Normalized score (0-1)
   */
  private getAspectRatioScore(width: number, height: number, expectedRatio: number): number {
    if (!width || !height) return 0;

    const actualRatio = width / height;
    const deviation = Math.abs(actualRatio - expectedRatio) / expectedRatio;

    // Scoring based on deviation percentage
    if (deviation <= 0.02) return 1.0; // Within 2%
    if (deviation <= 0.05) return 0.9; // Within 5%
    if (deviation <= 0.10) return 0.7; // Within 10%
    if (deviation <= 0.20) return 0.4; // Within 20%

    return 0.0; // Over 20% deviation
  }

  /**
   * Calculate normalized score for display (0-1)
   */
  private calculateNormalizedScore(
    asset: AssetCandidate,
    tier: number,
    assetType: AssetType
  ): number {
    // Base score from tier (tier 1 = 1.0, tier 4 = 0.25)
    let score = (5 - tier) / 4;

    // Add resolution bonus (0-0.2)
    if (asset.width && asset.height) {
      const resScore = this.getResolutionScore(asset.width, asset.height);
      score += resScore * 0.2;
    }

    // Add aspect ratio bonus (0-0.1)
    if (asset.width && asset.height) {
      const expectedRatio = this.getExpectedAspectRatio(assetType);
      const aspectScore = this.getAspectRatioScore(asset.width, asset.height, expectedRatio);
      score += aspectScore * 0.1;
    }

    // Add votes bonus (0-0.15)
    if (asset.votes !== undefined) {
      const voteScore = Math.min(asset.votes / 100, 1.0);
      score += voteScore * 0.15;
    }

    // Normalize to 0-1
    return Math.min(1.0, score);
  }

  /**
   * Get expected aspect ratio for asset type
   */
  private getExpectedAspectRatio(assetType: AssetType): number {
    const ratios: Record<string, number> = {
      poster: 0.675,      // 2:3 (e.g., 1000x1426)
      fanart: 1.778,      // 16:9 (e.g., 1920x1080)
      banner: 5.4,        // ~10:2
      clearlogo: 1.0,     // Variable
      clearart: 1.0,      // 1:1
      landscape: 1.778,   // 16:9
      thumb: 1.778,       // 16:9
      discart: 1.0,       // 1:1
      characterart: 0.675, // 2:3
      keyart: 0.675,      // 2:3
    };

    return ratios[assetType] || 1.0;
  }

  /**
   * Generate human-readable reason for selection
   */
  private generateReason(asset: AssetCandidate, tier: number): string {
    const reasons: string[] = [];

    // Tier-based reason
    if (tier === 1) {
      reasons.push('Best quality in preferred language');
    } else if (tier === 2) {
      reasons.push('Preferred language');
    } else if (tier === 3) {
      reasons.push('High quality (HD)');
    }

    // Vote-based reason
    if (asset.votes !== undefined && asset.votes > 50) {
      reasons.push(`High community votes (${asset.votes})`);
    } else if (asset.votes !== undefined && asset.votes > 10) {
      reasons.push(`Community votes (${asset.votes})`);
    }

    // Resolution-based reason
    if (asset.width && asset.height) {
      const pixels = asset.width * asset.height;
      if (pixels >= 7680 * 4320) {
        reasons.push('8K resolution');
      } else if (pixels >= 3840 * 2160) {
        reasons.push('4K resolution');
      } else if (pixels >= 1920 * 1080) {
        reasons.push('1080p resolution');
      }
    }

    return reasons.length > 0 ? reasons.join(', ') : 'Selected by algorithm';
  }

  /**
   * Filter out duplicate assets
   *
   * Assets are duplicates if:
   * - Same provider + same URL, OR
   * - Same dimensions (width/height) + same file size, OR
   * - Same perceptual hash (if available)
   */
  private filterDuplicates(
    candidates: Array<{ asset: AssetCandidate; providerName: string }>,
    existingAssets: ExistingAsset[]
  ): Array<{ asset: AssetCandidate; providerName: string }> {
    return candidates.filter(({ asset }) => {
      return !existingAssets.some(existing => {
        // Same asset type check
        if (existing.assetType !== asset.assetType) {
          return false;
        }

        // Check 1: Same provider + same URL
        if (existing.url && asset.url === existing.url) {
          logger.debug('Duplicate detected: same URL', { url: asset.url });
          return true;
        }

        // Check 2: Same dimensions + same file size
        if (
          existing.width &&
          existing.height &&
          existing.fileSize &&
          asset.width === existing.width &&
          asset.height === existing.height &&
          asset.fileSize === existing.fileSize
        ) {
          logger.debug('Duplicate detected: same dimensions and file size', {
            width: asset.width,
            height: asset.height,
            fileSize: asset.fileSize,
          });
          return true;
        }

        // Check 3: Same perceptual hash
        if (
          existing.perceptualHash &&
          asset.perceptualHash &&
          existing.perceptualHash === asset.perceptualHash
        ) {
          logger.debug('Duplicate detected: same perceptual hash', {
            hash: asset.perceptualHash,
          });
          return true;
        }

        return false;
      });
    });
  }
}
