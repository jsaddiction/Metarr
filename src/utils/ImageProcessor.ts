/**
 * Image Processor Utility
 *
 * Centralized image analysis for perceptual hashing and metadata extraction.
 * Optimized for performance by computing multiple hashes in a single Sharp pipeline.
 *
 * Used by:
 * - Filesystem scan (local assets)
 * - Enrichment selection (remote provider candidates)
 * - Asset comparison (duplicate detection)
 */

import sharp from 'sharp';
import { getErrorMessage } from './errorHandling.js';
import { FileSystemError, ErrorCode } from '../errors/index.js';

/**
 * Complete image analysis result
 */
export interface ImageAnalysis {
  // Perceptual hashes for duplicate detection
  perceptualHash: string; // aHash - good for overall structure
  differenceHash: string; // dHash - good for edges/transparent images

  // Image metadata
  width: number;
  height: number;
  hasAlpha: boolean;
  format: string;
  fileSize?: number; // Optional, if analyzing file

  // Quality indicators
  aspectRatio: number;
  isLowVariance: boolean; // Solid color or mostly empty
  foregroundRatio?: number; // % of image that's opaque (for transparent PNGs)
}

/**
 * Hash similarity comparison thresholds
 */
export interface SimilarityThresholds {
  exact: number; // SHA256 match (always 1.0)
  aHashStrict: number; // Very similar
  dHashStrict: number; // Structure similar
  combinedMinimum: number; // Weighted average threshold
}

/**
 * Comparison mode based on image characteristics
 */
export enum ComparisonMode {
  /**
   * Strict mode for opaque images (posters, fanart, etc.)
   * Catches same-photo-different-text variations
   * Lower thresholds to detect subtle differences
   */
  STRICT = 'strict',

  /**
   * Lenient mode for transparent images (logos, clearart, etc.)
   * Higher thresholds to avoid false positives
   * Transparent images naturally have higher perceptual hash similarity
   */
  LENIENT = 'lenient',

  /**
   * Default balanced mode
   */
  DEFAULT = 'default',
}

/**
 * Thresholds by comparison mode
 */
const MODE_THRESHOLDS: Record<ComparisonMode, SimilarityThresholds> = {
  [ComparisonMode.STRICT]: {
    exact: 1.0,
    aHashStrict: 0.85, // Catch 81% similarities (same photo, different text)
    dHashStrict: 0.82,
    combinedMinimum: 0.75, // Catch 77% combined score
  },
  [ComparisonMode.LENIENT]: {
    exact: 1.0,
    aHashStrict: 0.97, // Very high - transparent images are sensitive
    dHashStrict: 0.94,
    combinedMinimum: 0.95,
  },
  [ComparisonMode.DEFAULT]: {
    exact: 1.0,
    aHashStrict: 0.95,
    dHashStrict: 0.92,
    combinedMinimum: 0.93,
  },
};

/**
 * Default thresholds for backward compatibility
 * @deprecated Use getThresholdsForMode(ComparisonMode.DEFAULT) instead
 */
export const DEFAULT_THRESHOLDS = MODE_THRESHOLDS[ComparisonMode.DEFAULT];

/**
 * Auto-detect comparison mode from image characteristics
 *
 * @param hasAlpha - Whether image has transparency channel
 * @param foregroundRatio - Percentage of opaque pixels (0-1), if known
 * @returns Appropriate comparison mode
 */
export function detectComparisonMode(
  hasAlpha: boolean,
  foregroundRatio?: number
): ComparisonMode {
  // If no alpha channel, use strict mode (opaque images like posters)
  if (!hasAlpha) {
    return ComparisonMode.STRICT;
  }

  // If we know foreground ratio and it's mostly transparent, use lenient
  if (foregroundRatio !== undefined && foregroundRatio < 0.3) {
    return ComparisonMode.LENIENT; // <30% opaque = logo/clearart
  }

  // If mostly opaque despite having alpha, use strict (e.g., poster with rounded corners)
  if (foregroundRatio !== undefined && foregroundRatio > 0.85) {
    return ComparisonMode.STRICT;
  }

  // Unknown or mixed transparency - use default
  return ComparisonMode.DEFAULT;
}

/**
 * Get thresholds for a comparison mode
 */
export function getThresholdsForMode(mode: ComparisonMode): SimilarityThresholds {
  return MODE_THRESHOLDS[mode];
}

/**
 * Image Processor Class
 *
 * Provides efficient image analysis with concurrent hash computation
 */
export class ImageProcessor {
  /**
   * Analyze image from file path
   * Computes all hashes and metadata in optimized pipeline
   */
  async analyzeImage(imagePath: string): Promise<ImageAnalysis> {
    try {
      // Load metadata first (fast, no pixel data)
      const metadata = await sharp(imagePath).metadata();

      // Prepare flattened buffer for hashing
      // Use white background to normalize transparent images
      const flattenedImage = sharp(imagePath).flatten({
        background: { r: 255, g: 255, b: 255 },
      });

      // Compute both hashes concurrently from same source
      const [aHashResult, dHashResult] = await Promise.all([
        this.computeAverageHash(flattenedImage.clone()),
        this.computeDifferenceHash(flattenedImage.clone()),
      ]);

      // Calculate aspect ratio
      const width = metadata.width || 0;
      const height = metadata.height || 0;
      const aspectRatio = height > 0 ? width / height : 0;

      // Detect transparency
      const hasAlpha = metadata.hasAlpha || false;

      // Compute foreground ratio if transparent
      let foregroundRatio: number | undefined;
      if (hasAlpha) {
        foregroundRatio = await this.computeForegroundRatio(imagePath);
      }

      return {
        perceptualHash: aHashResult.hash,
        differenceHash: dHashResult.hash,
        width,
        height,
        hasAlpha,
        format: metadata.format || 'unknown',
        aspectRatio,
        isLowVariance: aHashResult.isLowVariance,
        ...(foregroundRatio !== undefined && { foregroundRatio }),
      };
    } catch (error) {
      throw new FileSystemError(
        `Failed to analyze image: ${getErrorMessage(error)}`,
        ErrorCode.FS_READ_FAILED,
        imagePath,
        true, // Image processing can be retried
        { service: 'ImageProcessor', operation: 'analyzeImage', metadata: { imagePath } },
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Analyze image from buffer (for downloaded remote images)
   */
  async analyzeBuffer(
    buffer: Buffer,
    originalUrl?: string
  ): Promise<ImageAnalysis> {
    try {
      const metadata = await sharp(buffer).metadata();

      const flattenedImage = sharp(buffer).flatten({
        background: { r: 255, g: 255, b: 255 },
      });

      const [aHashResult, dHashResult] = await Promise.all([
        this.computeAverageHash(flattenedImage.clone()),
        this.computeDifferenceHash(flattenedImage.clone()),
      ]);

      const width = metadata.width || 0;
      const height = metadata.height || 0;
      const aspectRatio = height > 0 ? width / height : 0;
      const hasAlpha = metadata.hasAlpha || false;

      let foregroundRatio: number | undefined;
      if (hasAlpha) {
        foregroundRatio = await this.computeForegroundRatioFromBuffer(buffer);
      }

      return {
        perceptualHash: aHashResult.hash,
        differenceHash: dHashResult.hash,
        width,
        height,
        hasAlpha,
        format: metadata.format || 'unknown',
        aspectRatio,
        isLowVariance: aHashResult.isLowVariance,
        ...(foregroundRatio !== undefined && { foregroundRatio }),
        fileSize: buffer.length,
      };
    } catch (error) {
      const context = originalUrl ? ` from ${originalUrl}` : '';
      throw new FileSystemError(
        `Failed to analyze image buffer${context}: ${getErrorMessage(error)}`,
        ErrorCode.FS_READ_FAILED,
        originalUrl || 'buffer',
        true, // Buffer processing can be retried
        { service: 'ImageProcessor', operation: 'analyzeBuffer', metadata: { originalUrl, bufferSize: buffer.length } },
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Compute Average Hash (aHash)
   *
   * Algorithm:
   * 1. Resize to 8x8 pixels
   * 2. Convert to grayscale
   * 3. Calculate average pixel value
   * 4. Generate 64-bit hash (1 if > average, 0 if <= average)
   */
  private async computeAverageHash(
    image: sharp.Sharp
  ): Promise<{ hash: string; isLowVariance: boolean }> {
    const { data } = await image
      .resize(8, 8, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Calculate average pixel value
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i];
    }
    const average = sum / data.length;

    // Check for low variance (solid color or mostly empty)
    let hasVariance = false;
    for (let i = 0; i < data.length; i++) {
      if (Math.abs(data[i] - average) > 0.5) {
        hasVariance = true;
        break;
      }
    }

    if (!hasVariance) {
      // Solid color image - use the average value as the hash
      const colorValue = Math.round(average);
      const solidHash =
        (BigInt(colorValue) << 32n) |
        (BigInt(colorValue) << 16n) |
        BigInt(colorValue);
      return {
        hash: solidHash.toString(16).padStart(16, '0'),
        isLowVariance: true,
      };
    }

    // Generate 64-bit hash
    let hash = 0n;
    for (let i = 0; i < 64; i++) {
      if (data[i] > average) {
        hash |= 1n << BigInt(i);
      }
    }

    return {
      hash: hash.toString(16).padStart(16, '0'),
      isLowVariance: false,
    };
  }

  /**
   * Compute Difference Hash (dHash)
   *
   * Algorithm:
   * 1. Resize to 9x8 pixels (to compare 8x8 adjacent pairs)
   * 2. Convert to grayscale
   * 3. Compare each pixel to its right neighbor
   * 4. Generate 64-bit hash (1 if left > right, 0 otherwise)
   *
   * dHash is more robust for:
   * - Images with borders/backgrounds
   * - Transparent images
   * - Images with large uniform areas
   */
  private async computeDifferenceHash(image: sharp.Sharp): Promise<{ hash: string }> {
    const { data } = await image
      .resize(9, 8, { fit: 'fill' }) // 9 wide for 8 comparisons per row
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Generate 64-bit hash by comparing adjacent pixels
    let hash = 0n;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const left = data[y * 9 + x];
        const right = data[y * 9 + x + 1];
        if (left > right) {
          hash |= 1n << BigInt(y * 8 + x);
        }
      }
    }

    return {
      hash: hash.toString(16).padStart(16, '0'),
    };
  }

  /**
   * Compute foreground ratio for transparent images
   * Returns percentage of opaque pixels (0.0 - 1.0)
   */
  private async computeForegroundRatio(imagePath: string): Promise<number> {
    try {
      const { data, info } = await sharp(imagePath)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      return this.calculateForegroundRatio(data, info.channels);
    } catch {
      return 1.0; // Assume fully opaque on error
    }
  }

  /**
   * Compute foreground ratio from buffer
   */
  private async computeForegroundRatioFromBuffer(buffer: Buffer): Promise<number> {
    try {
      const { data, info } = await sharp(buffer)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      return this.calculateForegroundRatio(data, info.channels);
    } catch {
      return 1.0;
    }
  }

  /**
   * Calculate foreground ratio from raw pixel data
   */
  private calculateForegroundRatio(data: Buffer, channels: number): number {
    if (channels < 4) return 1.0; // No alpha channel

    let opaquePixels = 0;
    const totalPixels = data.length / channels;

    // Sample every 4th pixel for performance (good enough estimate)
    for (let i = 0; i < data.length; i += channels * 4) {
      const alpha = data[i + 3];
      if (alpha > 128) {
        // Consider semi-transparent as opaque
        opaquePixels++;
      }
    }

    return opaquePixels / (totalPixels / 4);
  }

  /**
   * Compare two images for similarity
   *
   * Uses three-tier matching:
   * 1. Exact match via SHA256 (if provided)
   * 2. Strong aHash similarity
   * 3. Strong dHash similarity
   * 4. Combined weighted score
   *
   * Auto-detects comparison mode from image characteristics if not specified.
   *
   * @param img1 - First image (include hasAlpha/foregroundRatio for auto-detection)
   * @param img2 - Second image
   * @param modeOrThresholds - ComparisonMode enum, custom thresholds, or undefined for auto-detect
   */
  static compareImages(
    img1: {
      contentHash?: string;
      perceptualHash: string;
      differenceHash: string;
      hasAlpha?: boolean;
      foregroundRatio?: number;
    },
    img2: {
      contentHash?: string;
      perceptualHash: string;
      differenceHash: string;
      hasAlpha?: boolean;
      foregroundRatio?: number;
    },
    modeOrThresholds?: ComparisonMode | SimilarityThresholds
  ): { isSimilar: boolean; similarity: number; matchType: string } {
    // Determine thresholds
    let thresholds: SimilarityThresholds;
    if (modeOrThresholds === undefined) {
      // Auto-detect from img1 characteristics
      const mode = detectComparisonMode(
        img1.hasAlpha ?? false,
        img1.foregroundRatio
      );
      thresholds = getThresholdsForMode(mode);
    } else if (typeof modeOrThresholds === 'string') {
      // Explicit ComparisonMode enum
      thresholds = getThresholdsForMode(modeOrThresholds as ComparisonMode);
    } else {
      // Custom thresholds object
      thresholds = modeOrThresholds;
    }
    // Tier 1: Exact match
    if (img1.contentHash && img2.contentHash && img1.contentHash === img2.contentHash) {
      return { isSimilar: true, similarity: 1.0, matchType: 'exact' };
    }

    // Tier 2: Strong perceptual match (aHash)
    const aHashSim = this.hammingSimilarity(img1.perceptualHash, img2.perceptualHash);
    if (aHashSim >= thresholds.aHashStrict) {
      return { isSimilar: true, similarity: aHashSim, matchType: 'aHash' };
    }

    // Tier 3: Strong structure match (dHash)
    const dHashSim = this.hammingSimilarity(img1.differenceHash, img2.differenceHash);
    if (dHashSim >= thresholds.dHashStrict) {
      return { isSimilar: true, similarity: dHashSim, matchType: 'dHash' };
    }

    // Tier 4: Combined weighted score
    // Weight dHash slightly higher as it's more robust for transparent/bordered images
    const combinedScore = aHashSim * 0.55 + dHashSim * 0.45;

    return {
      isSimilar: combinedScore >= thresholds.combinedMinimum,
      similarity: combinedScore,
      matchType: combinedScore >= thresholds.combinedMinimum ? 'combined' : 'none',
    };
  }

  /**
   * Calculate Hamming distance between two hashes
   * Returns similarity as 0.0-1.0 (higher = more similar)
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

// Export singleton instance for convenience
export const imageProcessor = new ImageProcessor();
