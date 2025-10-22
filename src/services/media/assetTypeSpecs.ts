/**
 * Kodi Asset Type Specifications
 *
 * Based on official Kodi wiki: https://kodi.wiki/view/Artwork_types
 *
 * This defines all supported asset types with their validation constraints
 */

export interface AssetTypeSpec {
  /** Asset type identifier (matches DB column name without _id suffix) */
  type: 'poster' | 'fanart' | 'banner' | 'clearlogo' | 'clearart' | 'discart' | 'keyart' | 'landscape' | 'thumb';

  /** Keywords to search for in filename (case-insensitive) */
  keywords: string[];

  /** Expected aspect ratio (width/height) with tolerance */
  aspectRatio?: {
    target: number;
    tolerance: number; // Allow +/- this percentage
  };

  /** Minimum dimensions (width x height) */
  minDimensions?: {
    width: number;
    height: number;
  };

  /** Recommended dimensions */
  recommendedDimensions?: {
    width: number;
    height: number;
  };

  /** File extensions allowed */
  extensions: string[];

  /** Description */
  description: string;
}

/**
 * Kodi asset type specifications for movies
 */
export const MOVIE_ASSET_SPECS: AssetTypeSpec[] = [
  {
    type: 'poster',
    keywords: ['poster'],
    aspectRatio: { target: 2/3, tolerance: 0.1 }, // 2:3 ratio (e.g., 1000x1500)
    minDimensions: { width: 500, height: 750 },
    recommendedDimensions: { width: 1000, height: 1500 },
    extensions: ['.jpg', '.jpeg', '.png'],
    description: 'Standard movie poster with text and graphics (2:3 aspect ratio)',
  },
  {
    type: 'fanart',
    keywords: ['fanart', 'backdrop'],
    aspectRatio: { target: 16/9, tolerance: 0.05 }, // 16:9 ratio for widescreen
    minDimensions: { width: 1280, height: 720 },
    recommendedDimensions: { width: 1920, height: 1080 },
    extensions: ['.jpg', '.jpeg', '.png'],
    description: 'Wide background images for 16:9 displays',
  },
  {
    type: 'banner',
    keywords: ['banner'],
    aspectRatio: { target: 758/140, tolerance: 0.15 }, // ~5.4:1 ratio (wide horizontal)
    minDimensions: { width: 500, height: 92 },
    recommendedDimensions: { width: 758, height: 140 },
    extensions: ['.jpg', '.jpeg', '.png'],
    description: 'Horizontal banner format artwork',
  },
  {
    type: 'clearlogo',
    keywords: ['clearlogo', 'logo'],
    aspectRatio: { target: 800/310, tolerance: 0.3 }, // ~2.6:1 ratio (flexible)
    minDimensions: { width: 400, height: 155 },
    recommendedDimensions: { width: 800, height: 310 },
    extensions: ['.png'], // Must be PNG for transparency
    description: 'Logo with transparent background (clearlogo)',
  },
  {
    type: 'clearart',
    keywords: ['clearart'],
    aspectRatio: { target: 1000/562, tolerance: 0.5 }, // ~1.78:1 ratio (very flexible due to varied dimensions)
    minDimensions: { width: 400, height: 200 }, // More permissive (many clearart variations exist)
    recommendedDimensions: { width: 1000, height: 562 },
    extensions: ['.png'], // Must be PNG for transparency
    description: 'Character/prop images with transparent background (highly variable dimensions)',
  },
  {
    type: 'discart',
    keywords: ['discart', 'disc'],
    aspectRatio: { target: 1, tolerance: 0.05 }, // 1:1 ratio (square)
    minDimensions: { width: 500, height: 500 },
    recommendedDimensions: { width: 1000, height: 1000 },
    extensions: ['.png'], // Must be PNG for transparency
    description: 'Disc artwork with transparent background (square)',
  },
  {
    type: 'keyart',
    keywords: ['keyart'],
    aspectRatio: { target: 2/3, tolerance: 0.1 }, // 2:3 ratio (same as poster)
    minDimensions: { width: 500, height: 750 },
    recommendedDimensions: { width: 1000, height: 1500 },
    extensions: ['.jpg', '.jpeg', '.png'],
    description: 'Poster without text or logo (2:3 aspect ratio)',
  },
  {
    type: 'landscape',
    keywords: ['landscape', 'thumb'], // Accept both keywords, store as landscape
    aspectRatio: { target: 16/9, tolerance: 0.1 }, // 16:9 ratio (1.778)
    minDimensions: { width: 800, height: 450 }, // Allow smaller sizes
    recommendedDimensions: { width: 1000, height: 562 }, // Kodi/FanArt.tv standard
    extensions: ['.jpg', '.jpeg', '.png'],
    description: 'Fanart with text overlay (16:9, 1000x562, non-transparent). Aliases: thumb (movies only)',
  },
];

/**
 * Get asset spec by type
 */
export function getAssetSpec(type: string): AssetTypeSpec | undefined {
  return MOVIE_ASSET_SPECS.find(spec => spec.type === type);
}

/**
 * Find matching asset specs by filename keywords
 */
export function findAssetSpecsByFilename(filename: string): AssetTypeSpec[] {
  const lowerFilename = filename.toLowerCase();
  return MOVIE_ASSET_SPECS.filter(spec =>
    spec.keywords.some(keyword => lowerFilename.includes(keyword))
  );
}

/**
 * Validate if image dimensions match asset spec with 10% tolerance
 */
export function validateImageDimensions(
  width: number,
  height: number,
  spec: AssetTypeSpec
): { valid: boolean; reason?: string } {
  const DIMENSION_TOLERANCE = 0.10; // 10% tolerance on min dimensions

  // Check minimum dimensions with 10% tolerance
  if (spec.minDimensions) {
    const minWidthWithTolerance = spec.minDimensions.width * (1 - DIMENSION_TOLERANCE);
    const minHeightWithTolerance = spec.minDimensions.height * (1 - DIMENSION_TOLERANCE);

    if (width < minWidthWithTolerance || height < minHeightWithTolerance) {
      return {
        valid: false,
        reason: `Too small (min: ${spec.minDimensions.width}x${spec.minDimensions.height}, with 10% tolerance: ${Math.round(minWidthWithTolerance)}x${Math.round(minHeightWithTolerance)})`,
      };
    }
  }

  // Check aspect ratio (using spec's own tolerance)
  if (spec.aspectRatio) {
    const actualRatio = width / height;
    const targetRatio = spec.aspectRatio.target;
    const toleranceRange = targetRatio * spec.aspectRatio.tolerance;

    if (Math.abs(actualRatio - targetRatio) > toleranceRange) {
      return {
        valid: false,
        reason: `Aspect ratio mismatch (expected ${targetRatio.toFixed(2)}, got ${actualRatio.toFixed(2)})`,
      };
    }
  }

  return { valid: true };
}
