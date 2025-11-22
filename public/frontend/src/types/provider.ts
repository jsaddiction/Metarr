/**
 * Provider Configuration Types
 * Matches backend types from src/types/provider.ts
 */

export interface ProviderConfig {
  id: number;
  providerName: string;
  enabled: boolean;
  apiKey?: string;
  personalApiKey?: string;
  language?: string;
  region?: string;
  options?: Record<string, any>;
  lastTestAt?: string; // ISO date string
  lastTestStatus?: 'success' | 'error' | 'never_tested';
  lastTestError?: string;
  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
}

export interface ProviderAssetType {
  type: string;
  displayName: string;
  available: boolean;
}

export interface ProviderMetadata {
  name: string;
  displayName: string;
  requiresApiKey: boolean;
  apiKeyOptional?: boolean;
  apiKeyBenefit?: string;
  baseUrl: string;
  authType?: 'bearer' | 'jwt' | 'query_param';
  legalWarning?: string;
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

export interface UpdateProviderRequest {
  enabled: boolean;
  apiKey?: string;
  personalApiKey?: string;
  language?: string;
  region?: string;
  options?: Record<string, any>;
}

export interface TestProviderResponse {
  success: boolean;
  message: string;
  testStatus: 'success' | 'error';
}

export interface GetAllProvidersResponse {
  providers: ProviderWithMetadata[];
}

export interface GetProviderResponse {
  config: ProviderConfig;
  metadata: ProviderMetadata;
}

export interface UpdateProviderResponse {
  success: boolean;
  provider: ProviderWithMetadata;
}

