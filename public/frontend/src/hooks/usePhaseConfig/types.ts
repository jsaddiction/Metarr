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
 * NOTE: Asset limits are configured via AssetConfigService, not here
 */
export interface EnrichmentConfig {
  fetchProviderAssets: boolean;
  autoSelectAssets: boolean;
  preferredLanguage: string;
}

/**
 * Publishing Phase Configuration
 *
 * Publishing always publishes ALL selected assets.
 * Individual asset types are controlled via asset limits (set to 0 to disable).
 * This interface is kept for API compatibility.
 */
export interface PublishConfig {
  // Empty - publishing publishes all selected assets
}

/**
 * General Configuration
 *
 * Core application behavior that applies across all phases
 */
export interface GeneralConfig {
  autoPublish: boolean;
}

/**
 * Complete phase configuration
 */
export interface PhaseConfiguration {
  enrichment: EnrichmentConfig;
  publish: PublishConfig;
  general: GeneralConfig;
}
