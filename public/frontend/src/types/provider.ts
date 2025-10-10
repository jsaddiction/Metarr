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
  enabledAssetTypes: string[];
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
  enabledAssetTypes: string[];
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

// Priority Configuration Types

export interface PriorityPreset {
  id: string;
  label: string;
  description: string;
  assetTypePriorities: Record<string, string[]>;
  metadataFieldPriorities: Record<string, string[]>;
}

export interface AssetTypePriority {
  id: number;
  assetType: string;
  providerOrder: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MetadataFieldPriority {
  id: number;
  fieldName: string;
  providerOrder: string[];
  forcedProvider?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PriorityPresetSelection {
  id: number;
  presetId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApplyPresetRequest {
  presetId: string;
}

export interface UpdateAssetTypePriorityRequest {
  assetType: string;
  providerOrder: string[];
}

export interface UpdateMetadataFieldPriorityRequest {
  fieldName: string;
  providerOrder: string[];
}

// API Response Types

export interface GetPresetsResponse {
  presets: PriorityPreset[];
}

export interface GetActivePresetResponse {
  activePreset: PriorityPresetSelection | null;
}

export interface GetAssetTypePrioritiesResponse {
  priorities: AssetTypePriority[];
}

export interface GetMetadataFieldPrioritiesResponse {
  priorities: MetadataFieldPriority[];
}
