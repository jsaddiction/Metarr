/**
 * Phase Configuration Type Definitions
 *
 * All workflow phases ALWAYS run in sequence.
 * These configurations control BEHAVIOR, not ENABLEMENT.
 *
 * Sequential chain: scan → enrich → publish → player-sync
 */

/**
 * Scan Phase Configuration
 *
 * Scan always runs fully - these settings control what to ignore/process
 */
export interface ScanConfig {
  // Ignore patterns (glob format)
  ignorePatterns: string[];

  // Max file size to process (GB)
  maxFileSizeGB: number;

  // FFprobe timeout (seconds)
  ffprobeTimeoutSeconds: number;

  // Video extensions
  videoExtensions: string[];

  // Image extensions
  imageExtensions: string[];
}

/**
 * Enrichment Phase Configuration
 *
 * Enrichment always runs, but what it fetches/selects is configurable.
 * NOTE: Actors are ALWAYS fetched from TMDB (non-configurable - required for accuracy)
 */
export interface EnrichmentPhaseConfig {
  // Fetch provider assets (posters, fanart, logos, trailers)
  fetchProviderAssets: boolean;

  // Auto-select best assets (if false, user picks manually in UI)
  autoSelectAssets: boolean;

  // Max assets to fetch per type
  maxAssetsPerType: {
    poster: number;
    fanart: number;
    logo: number;
    trailer: number;
  };

  // Preferred language for assets
  preferredLanguage: string;

  // Minimum asset resolution (height in pixels)
  minAssetResolution: number;
}

/**
 * Publishing Phase Configuration
 *
 * Publishing always runs, but what gets published is configurable.
 * NOTE: NFO generation is ALWAYS enabled (non-configurable - required for media players)
 */
export interface PublishConfig {
  // Publish assets (posters, fanart, logos)
  publishAssets: boolean;

  // Publish actor headshots to .actors/ folder
  publishActors: boolean;

  // Publish trailer files (can use significant disk space)
  publishTrailers: boolean;
}

/**
 * Player Sync Phase Configuration
 *
 * Player sync always runs, but notifications can be disabled
 */
export interface PlayerSyncConfig {
  // Notify media players after publishing
  notifyOnPublish: boolean;

  // Delay before notifying (seconds) - useful for batch operations
  delaySeconds: number;

  // Clean library first before update (Kodi-specific)
  cleanLibraryFirst: boolean;
}

/**
 * Complete phase configuration
 */
export interface PhaseConfiguration {
  scan: ScanConfig;
  enrichment: EnrichmentPhaseConfig;
  publish: PublishConfig;
  playerSync: PlayerSyncConfig;
}

/**
 * Default phase configuration
 */
export const DEFAULT_PHASE_CONFIG: PhaseConfiguration = {
  scan: {
    ignorePatterns: [
      '**/@eaDir/**',
      '**/.DS_Store',
      '**/Thumbs.db',
      '**/.thumbnails/**',
    ],
    maxFileSizeGB: 100,
    ffprobeTimeoutSeconds: 30,
    videoExtensions: ['.mkv', '.mp4', '.avi', '.m4v', '.mov', '.wmv', '.flv', '.webm'],
    imageExtensions: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
  },

  enrichment: {
    fetchProviderAssets: true,
    autoSelectAssets: true,
    maxAssetsPerType: {
      poster: 3,
      fanart: 5,
      logo: 2,
      trailer: 1,
    },
    preferredLanguage: 'en',
    minAssetResolution: 720,
  },

  publish: {
    publishAssets: true,
    publishActors: true,
    publishTrailers: false, // Default: false (saves disk space)
  },

  playerSync: {
    notifyOnPublish: true,
    delaySeconds: 0,
    cleanLibraryFirst: false,
  },
};
