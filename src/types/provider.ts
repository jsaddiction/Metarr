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
  language?: string;                // 'en', 'es', 'fr', etc.
  region?: string;                  // 'US', 'GB', 'FR', etc.
  options?: Record<string, unknown>;    // Provider-specific options
  lastTestAt?: Date;
  lastTestStatus?: 'success' | 'error' | 'never_tested';
  lastTestError?: string;
  created_at: Date;
  updated_at: Date;
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
  language?: string;
  region?: string;
  options?: Record<string, unknown>;
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
  created_at: Date;
  updated_at: Date;
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
  created_at: Date;
  updated_at: Date;
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
  created_at: Date;
  updated_at: Date;
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

/**
 * Data Selection Configuration
 *
 * Separates provider connection from data filtering/prioritization
 */
export interface DataSelectionConfig {
  id: number;
  mode: 'balanced' | 'custom';
  customMetadataPriorities: Record<string, FieldPriorityConfig>;
  customImagePriorities: Record<string, FieldPriorityConfig>;
  created_at: Date;
  updated_at: Date;
}

/**
 * Field/Asset Priority Configuration
 *
 * Defines provider ordering and disabled providers for a specific field or asset type
 */
export interface FieldPriorityConfig {
  providerOrder: string[];  // ['tmdb', 'tvdb', 'fanart_tv']
  disabled: string[];        // ['imdb'] - providers to exclude for this field
}

/**
 * Request to update data selection mode
 */
export interface UpdateDataSelectionModeRequest {
  mode: 'balanced' | 'custom';
}

/**
 * Request to update custom priority for a specific field/asset
 */
export interface UpdateFieldPriorityRequest {
  mediaType: 'movies' | 'tvshows' | 'music';
  category: 'metadata' | 'images';
  fieldName: string;
  providerOrder: string[];
  disabled?: string[];
}
