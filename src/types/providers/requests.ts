/**
 * Provider Request Type Definitions
 *
 * Defines the request interfaces for communicating with providers.
 */

import { ProviderId, EntityType, AssetType, MetadataField } from './capabilities.js';

/**
 * Provider-specific configuration options
 */
export interface ProviderOptions {
  [key: string]: any;

  // Common options
  seasonOrder?: 'aired' | 'dvd';
  loadAllTags?: boolean;
  discType?: 'bluray' | 'dvd' | '3d';
  includeAdult?: boolean;
}

/**
 * Provider context (configuration + credentials)
 */
export interface ProviderContext {
  apiKey?: string;
  personalApiKey?: string;
  token?: string;
  tokenExpiry?: Date;
  baseUrl?: string;
  language?: string;
  region?: string;
  customHeaders?: Record<string, string>;
  options?: ProviderOptions;
}

/**
 * Search request
 */
export interface SearchRequest {
  query: string;
  entityType: EntityType;
  year?: number;
  page?: number;
  limit?: number;
  externalId?: {
    type: string; // 'imdb_id', 'tvdb_id', etc.
    value: string;
  };
}

/**
 * Search result
 */
export interface SearchResult {
  providerId: ProviderId;
  providerResultId: string;

  // Cross-reference IDs
  externalIds?: {
    imdb?: string;
    tmdb?: number;
    tvdb?: number;
    musicbrainz?: string;
  };

  // Display Information
  title: string;
  originalTitle?: string;
  releaseDate?: Date;
  overview?: string;
  posterUrl?: string;

  // Match Quality
  confidence: number; // 0-1

  // Additional Context
  metadata?: Record<string, unknown>;
}

/**
 * Metadata request
 */
export interface MetadataRequest {
  providerId: ProviderId;
  providerResultId: string;
  entityType: EntityType;
  fields?: MetadataField[];
  language?: string;
}

/**
 * Metadata response
 */
export interface MetadataResponse {
  providerId: ProviderId;
  providerResultId: string;

  // Metadata by field
  fields: Partial<Record<MetadataField, any>>;

  // Cross-references
  externalIds?: Record<string, unknown>;

  // Quality indicators
  completeness: number; // 0-1
  confidence: number; // 0-1
  lastUpdated?: Date;
}

/**
 * Asset request
 */
export interface AssetRequest {
  providerId: ProviderId;
  providerResultId: string;
  entityType: EntityType;
  assetTypes: AssetType[];
  language?: string;
  quality?: 'any' | 'sd' | 'hd' | '4k';
}

/**
 * Asset candidate (before download)
 */
export interface AssetCandidate {
  providerId: ProviderId;
  providerResultId: string;

  // Asset Details
  assetType: AssetType;
  url: string;
  thumbnailUrl?: string;

  // Dimensions
  width?: number;
  height?: number;
  aspectRatio?: number;

  // Quality Hints
  quality?: 'sd' | 'hd' | '4k';
  fileSize?: number;

  // Language
  language?: string;

  // Voting/Quality (if available)
  votes?: number;
  voteAverage?: number;

  // Provider Recommendations
  isPreferredByProvider?: boolean;

  // Multi-hash deduplication (computed after download/analysis)
  contentHash?: string; // SHA256 - exact file match
  perceptualHash?: string; // aHash - overall structure similarity
  differenceHash?: string; // dHash - edge/gradient similarity (better for transparent PNGs)

  // Additional Context
  metadata?: Record<string, unknown>;
}

/**
 * Test connection response
 */
export interface TestConnectionResponse {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * Provider fetch results for orchestration
 */
export interface ProviderAssets {
  metadata?: Record<string, unknown>;
  images?: {
    [key: string]: AssetCandidate[]; // Dynamic keys for asset types (poster, fanart, etc.)
  };
  videos?: {
    [key: string]: AssetCandidate[]; // Dynamic keys for video types (trailer, teaser, etc.)
  };
}

/**
 * Failed provider information
 */
export interface FailedProvider {
  name: string;
  error: string;
  retryable: boolean;
}

/**
 * Orchestrator fetch results
 */
export interface ProviderResults {
  providers: {
    [providerName: string]: ProviderAssets | null;
  };
  metadata: {
    fetchedAt: Date;
    completedProviders: string[];
    failedProviders: FailedProvider[];
    timedOutProviders: string[];
  };
  allFailed: boolean; // true if ALL providers failed
}
