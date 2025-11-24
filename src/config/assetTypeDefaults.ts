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
  /** Media types this asset applies to (empty = applies to all) */
  mediaTypes: ('movie' | 'tvshow' | 'season' | 'episode' | 'artist' | 'album' | 'song')[];
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
  // ========================================
  // MOVIES & TV SHOWS (Common Assets)
  // ========================================
  poster: {
    displayName: 'Posters',
    defaultMax: 3,
    minAllowed: 0,
    maxAllowed: 10,
    description: 'Plex/Jellyfin support multiple, Kodi uses first',
    mediaTypes: ['movie', 'tvshow', 'season'],
  },
  fanart: {
    displayName: 'Fanart / Backdrops',
    defaultMax: 4,
    minAllowed: 0,
    maxAllowed: 10,
    description: 'All players support multiple, Kodi rotates in slideshow',
    mediaTypes: ['movie', 'tvshow', 'season'],
  },
  banner: {
    displayName: 'Banners',
    defaultMax: 1,
    minAllowed: 0,
    maxAllowed: 3,
    description: 'Wide format banner for TV shows',
    mediaTypes: ['tvshow', 'season'],
  },
  clearlogo: {
    displayName: 'Clear Logos',
    defaultMax: 1,
    minAllowed: 0,
    maxAllowed: 3,
    description: 'Transparent logo overlays',
    mediaTypes: ['movie', 'tvshow', 'artist', 'album'],
  },
  clearart: {
    displayName: 'Clear Art',
    defaultMax: 1,
    minAllowed: 0,
    maxAllowed: 3,
    description: 'Transparent character/title art',
    mediaTypes: ['movie', 'tvshow'],
  },
  landscape: {
    displayName: 'Landscapes',
    defaultMax: 1,
    minAllowed: 0,
    maxAllowed: 3,
    description: 'Horizontal orientation images',
    mediaTypes: ['movie', 'tvshow'],
  },
  keyart: {
    displayName: 'Key Art',
    defaultMax: 1,
    minAllowed: 0,
    maxAllowed: 3,
    description: 'Poster without text, pairs with clearlogo',
    mediaTypes: ['movie'],
  },
  discart: {
    displayName: 'Disc Art',
    defaultMax: 1,
    minAllowed: 0,
    maxAllowed: 5,
    description: 'For multi-disc releases',
    mediaTypes: ['movie'],
  },

  // ========================================
  // TV EPISODES
  // ========================================
  thumb: {
    displayName: 'Thumbnails',
    defaultMax: 1,
    minAllowed: 0,
    maxAllowed: 1,
    description: 'Episode screenshots',
    mediaTypes: ['episode'],
  },

  // ========================================
  // MUSIC
  // ========================================
  artist_thumb: {
    displayName: 'Artist Photos',
    defaultMax: 3,
    minAllowed: 0,
    maxAllowed: 10,
    description: 'Artist promotional photos',
    mediaTypes: ['artist'],
  },
  artist_fanart: {
    displayName: 'Artist Fanart',
    defaultMax: 4,
    minAllowed: 0,
    maxAllowed: 10,
    description: 'Artist background images',
    mediaTypes: ['artist'],
  },
  album_cover: {
    displayName: 'Album Covers',
    defaultMax: 1,
    minAllowed: 0,
    maxAllowed: 3,
    description: 'Album cover art',
    mediaTypes: ['album'],
  },
  cdart: {
    displayName: 'CD Art',
    defaultMax: 1,
    minAllowed: 0,
    maxAllowed: 5,
    description: 'For multi-disc albums',
    mediaTypes: ['album'],
  },

  // ========================================
  // ACTORS (Cross-media)
  // ========================================
  actor_thumb: {
    displayName: 'Actor Headshots',
    defaultMax: 1,
    minAllowed: 0,
    maxAllowed: 1,
    description: 'Always 1 per actor',
    mediaTypes: [], // Applies to actors, not media items
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
    .filter(([_type, config]) => config.defaultMax > 1)
    .map(([type]) => type);
}

/**
 * Get asset types that are single-image only (defaultMax = 1)
 */
export function getSingleAssetTypes(): string[] {
  return Object.entries(ASSET_TYPE_DEFAULTS)
    .filter(([_type, config]) => config.defaultMax === 1)
    .map(([type]) => type);
}

/**
 * Get asset types for a specific media type
 */
export function getAssetTypesForMediaType(
  mediaType: 'movie' | 'tvshow' | 'season' | 'episode' | 'artist' | 'album' | 'song'
): string[] {
  return Object.entries(ASSET_TYPE_DEFAULTS)
    .filter(([_type, config]) => config.mediaTypes.includes(mediaType))
    .map(([type]) => type);
}

/**
 * Get asset types grouped by media type category
 */
export function getAssetTypesByMediaCategory(): Record<string, { displayName: string; assetTypes: string[] }> {
  return {
    movies: {
      displayName: 'Movies',
      assetTypes: getAssetTypesForMediaType('movie'),
    },
    tvshows: {
      displayName: 'TV Shows',
      assetTypes: getAssetTypesForMediaType('tvshow'),
    },
    seasons: {
      displayName: 'Seasons',
      assetTypes: getAssetTypesForMediaType('season'),
    },
    episodes: {
      displayName: 'Episodes',
      assetTypes: getAssetTypesForMediaType('episode'),
    },
    artists: {
      displayName: 'Music Artists',
      assetTypes: getAssetTypesForMediaType('artist'),
    },
    albums: {
      displayName: 'Albums',
      assetTypes: getAssetTypesForMediaType('album'),
    },
  };
}
