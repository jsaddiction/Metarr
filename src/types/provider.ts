/**
 * Provider Configuration Types
 *
 * Defines interfaces for metadata provider configurations (TMDB, TVDB, FanArt.tv, etc.)
 */

export interface ProviderConfig {
  id: number;
  providerName: string;
  enabled: boolean;
  apiKey?: string;
  personalApiKey?: string;         // Upgraded API key for better rates (e.g., FanArt.tv)
  enabledAssetTypes: string[];     // ['poster', 'fanart', 'trailer']
  language?: string;                // 'en', 'es', 'fr', etc.
  region?: string;                  // 'US', 'GB', 'FR', etc.
  options?: Record<string, any>;    // Provider-specific options
  lastTestAt?: Date;
  lastTestStatus?: 'success' | 'error' | 'never_tested';
  lastTestError?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProviderAssetType {
  type: string; // 'poster', 'fanart', 'trailer', etc.
  displayName: string; // 'Posters', 'Fanart (Backdrops)', etc.
  available: boolean; // Is this asset type available from this provider?
}

export interface ProviderMetadata {
  name: string; // 'tmdb', 'tvdb', 'fanart_tv'
  displayName: string; // 'TMDB (The Movie Database)'
  requiresApiKey: boolean;
  apiKeyOptional?: boolean; // For providers like FanArt.tv
  apiKeyBenefit?: string; // Explanation of benefit for optional API keys
  baseUrl: string;
  authType?: 'bearer' | 'jwt' | 'query_param';
  legalWarning?: string; // Legal warning for IMDb, etc.
  rateLimit: {
    requests: number;
    windowSeconds: number;
  };
  supportedAssetTypes: ProviderAssetType[];
}

export interface ProviderWithMetadata {
  config: ProviderConfig;
  metadata: ProviderMetadata;
}

export interface TestConnectionRequest {
  apiKey?: string;
  enabledAssetTypes: string[];
}

export interface TestConnectionResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface UpdateProviderRequest {
  enabled: boolean;
  apiKey?: string;
  personalApiKey?: string;
  enabledAssetTypes: string[];
  language?: string;
  region?: string;
  options?: Record<string, any>;
}

/**
 * Asset Type Priority Configuration
 *
 * Defines provider ordering for a specific asset type
 */
export interface AssetTypePriority {
  id: number;
  assetType: string;           // 'poster', 'fanart', 'clearlogo', etc.
  providerOrder: string[];     // ['fanart_tv', 'tmdb', 'tvdb', 'local']
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Metadata Field Priority Configuration
 *
 * Defines provider ordering for a specific metadata field
 */
export interface MetadataFieldPriority {
  id: number;
  fieldName: string;           // 'rating', 'plot', 'runtime', etc.
  providerOrder: string[];     // ['imdb', 'tmdb', 'tvdb']
  forcedProvider?: string;     // 'local' for runtime/codecs (non-overrideable)
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Priority Preset Selection
 *
 * Tracks which preset is currently active
 */
export interface PriorityPresetSelection {
  id: number;
  presetId: string;            // 'quality_first', 'speed_first', 'custom', etc.
  isActive: boolean;           // Only one can be active at a time
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Request to apply a priority preset
 */
export interface ApplyPresetRequest {
  presetId: string;
}

/**
 * Request to update individual asset type priority
 */
export interface UpdateAssetTypePriorityRequest {
  assetType: string;
  providerOrder: string[];
}

/**
 * Request to update individual metadata field priority
 */
export interface UpdateMetadataFieldPriorityRequest {
  fieldName: string;
  providerOrder: string[];
}
