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
  enabledAssetTypes: string[]; // ['poster', 'fanart', 'trailer']
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
  enabledAssetTypes: string[];
}
