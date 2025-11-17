/**
 * Phase Configuration Type Definitions
 *
 * All workflow phases ALWAYS run in sequence.
 * These configurations control BEHAVIOR, not ENABLEMENT.
 *
 * Sequential chain: scan → enrich → publish → player-sync
 */

/**
 * Enrichment Phase Configuration
 *
 * Enrichment always runs, but what it fetches/selects is configurable.
 * NOTE: Actors are ALWAYS fetched from TMDB (non-configurable - required for accuracy)
 * NOTE: Asset limits are configured via AssetConfigService, not here
 */
export interface EnrichmentPhaseConfig {
  // Fetch provider assets (posters, fanart, logos, trailers)
  fetchProviderAssets: boolean;

  // Auto-select best assets (if false, user picks manually in UI)
  autoSelectAssets: boolean;

  // Preferred language for assets (ISO 639-1 code)
  preferredLanguage: string;
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
 * General Workflow Configuration
 *
 * Controls core application behavior that applies across all phases
 */
export interface GeneralConfig {
  // Auto-publish after enrichment (if false, user must manually trigger publish)
  // When false: scan → enrich → [USER REVIEW] → manual publish
  // When true: scan → enrich → auto publish
  autoPublish: boolean;
}

/**
 * Complete phase configuration
 */
export interface PhaseConfiguration {
  enrichment: EnrichmentPhaseConfig;
  publish: PublishConfig;
  general: GeneralConfig;
}

/**
 * Default phase configuration
 */
export const DEFAULT_PHASE_CONFIG: PhaseConfiguration = {
  enrichment: {
    fetchProviderAssets: true,
    autoSelectAssets: true,
    preferredLanguage: 'en',
  },

  publish: {
    publishAssets: true,
    publishActors: true,
    publishTrailers: false, // Default: false (saves disk space)
  },

  general: {
    autoPublish: false, // Default: false (user review gate enabled)
  },
};
