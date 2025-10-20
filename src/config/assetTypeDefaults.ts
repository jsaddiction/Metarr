/**
 * Asset Type Default Configuration
 *
 * Defines default specifications for each asset type based on
 * media player capabilities (Kodi, Jellyfin, Plex).
 *
 * User preferences are stored in database (app_settings table).
 * These defaults are used when no user preference exists.
 */

export interface AssetTypeConfig {
  /** Display name for UI */
  displayName: string;
  /** Default maximum count (recommended for most users) */
  defaultMax: number;
  /** Minimum allowed count (0 = can be disabled) */
  minAllowed: number;
  /** Maximum allowed count (hard limit to prevent abuse) */
  maxAllowed: number;
  /** Description of how this asset type is used */
  description: string;
}

/**
 * Asset Type Specifications
 *
 * Based on multi-player analysis:
 * - Kodi: Rotates fanart (up to 20), single poster/logo/clearart
 * - Plex: Supports multiple posters/fanart, user selects via UI
 * - Jellyfin: Supports multiple posters/backdrops, user selects via UI
 */
export const ASSET_TYPE_DEFAULTS: Record<string, AssetTypeConfig> = {
  poster: {
    displayName: 'Posters',
    defaultMax: 3,
    minAllowed: 0,
    maxAllowed: 10,
    description: 'Plex/Jellyfin support multiple, Kodi uses first',
  },
  fanart: {
    displayName: 'Fanart',
    defaultMax: 4,
    minAllowed: 0,
    maxAllowed: 10,
    description: 'All players support multiple, Kodi rotates in slideshow',
  },
  banner: {
    displayName: 'Banners',
    defaultMax: 1,
    minAllowed: 0,
    maxAllowed: 3,
    description: 'Rarely used, single instance typical',
  },
  clearlogo: {
    displayName: 'Clear Logos',
    defaultMax: 1,
    minAllowed: 0,
    maxAllowed: 3,
    description: 'Allow language variants',
  },
  clearart: {
    displayName: 'Clear Art',
    defaultMax: 1,
    minAllowed: 0,
    maxAllowed: 3,
    description: 'Allow language variants',
  },
  landscape: {
    displayName: 'Landscapes',
    defaultMax: 1,
    minAllowed: 0,
    maxAllowed: 3,
    description: 'Uncommon, rarely needs multiple',
  },
  keyart: {
    displayName: 'Key Art',
    defaultMax: 1,
    minAllowed: 0,
    maxAllowed: 3,
    description: 'Poster without text, pairs with clearlogo',
  },
  thumb: {
    displayName: 'Thumbnails',
    defaultMax: 1,
    minAllowed: 0,
    maxAllowed: 3,
    description: 'Single instance typical',
  },
  discart: {
    displayName: 'Disc Art',
    defaultMax: 1,
    minAllowed: 0,
    maxAllowed: 5,
    description: 'For multi-disc releases (Extended Editions)',
  },
  actor_thumb: {
    displayName: 'Actor Thumbnails',
    defaultMax: 1,
    minAllowed: 0,
    maxAllowed: 1,
    description: 'Always 1 per actor',
  },
};

/**
 * Get the asset type configuration for a given type
 */
export function getAssetTypeConfig(assetType: string): AssetTypeConfig | null {
  return ASSET_TYPE_DEFAULTS[assetType] ?? null;
}

/**
 * Get all asset types that support the asset system
 */
export function getAllAssetTypes(): string[] {
  return Object.keys(ASSET_TYPE_DEFAULTS);
}

/**
 * Validate if a max count is within bounds for a given asset type
 */
export function isValidMaxCount(assetType: string, maxCount: number): boolean {
  const config = ASSET_TYPE_DEFAULTS[assetType];
  if (!config) return false;

  return maxCount >= config.minAllowed && maxCount <= config.maxAllowed;
}

/**
 * Get the default max count for a specific asset type
 */
export function getDefaultMaxCount(assetType: string): number {
  return ASSET_TYPE_DEFAULTS[assetType]?.defaultMax ?? 1;
}

/**
 * Get asset types that support multiple images (defaultMax > 1)
 */
export function getMultiAssetTypes(): string[] {
  return Object.entries(ASSET_TYPE_DEFAULTS)
    .filter(([_, config]) => config.defaultMax > 1)
    .map(([type, _]) => type);
}

/**
 * Get asset types that are single-image only (defaultMax = 1)
 */
export function getSingleAssetTypes(): string[] {
  return Object.entries(ASSET_TYPE_DEFAULTS)
    .filter(([_, config]) => config.defaultMax === 1)
    .map(([type, _]) => type);
}
