/**
 * Shared types for enrichment service phases
 */

import { EnrichmentPhaseConfig } from '../../config/phaseConfig.js';

/**
 * Configuration for enrichment workflow
 */
export interface EnrichmentConfig {
  entityId: number;
  entityType: 'movie' | 'episode' | 'series';
  manual: boolean; // User-triggered (true) vs automated (false)
  forceRefresh: boolean; // Bypass 7-day cache check
  phaseConfig?: EnrichmentPhaseConfig; // Optional phase configuration (uses defaults if not provided)
}

/**
 * Result of enrichment workflow
 */
export interface EnrichmentResult {
  success: boolean;
  assetsSelected: number;
  errors: string[];
}

/**
 * Metadata extracted from downloaded assets
 */
export interface AssetMetadata {
  width: number;
  height: number;
  duration?: number | undefined;
  mimeType: string;
  size: number;
  isImage: boolean;
}

/**
 * Movie database row structure
 */
export interface MovieDatabaseRow {
  id: number;
  title: string;
  tmdb_id: number | null;
  imdb_id: string | null;
  tvdb_id: number | null;
  monitored: number;
  title_locked?: number;
  plot_locked?: number;
  [key: string]: unknown;
}

/**
 * Fields that can be updated on a movie entity
 */
export interface MovieUpdateFields {
  title?: string;
  original_title?: string;
  plot?: string;
  tagline?: string;
  release_date?: string;
  year?: number;
  runtime?: number;
  content_rating?: string;
  tmdb_rating?: number;
  tmdb_votes?: number;
  imdb_rating?: number;
  imdb_votes?: number;
}

/**
 * Asset data structure for scoring algorithm
 */
export interface AssetForScoring {
  asset_type: string;
  width: number | null;
  height: number | null;
  provider_name: string;
  provider_metadata: string | null;
}

/**
 * Provider metadata structure (from JSON column)
 */
export interface ProviderMetadata {
  vote_average?: number;
  voteAverage?: number;
  vote_count?: number;
  votes?: number;
  language?: string;
  [key: string]: unknown;
}

/**
 * Scored asset with perceptual hash for deduplication
 */
export interface ScoredAsset {
  id: number;
  provider_url: string;
  provider_name: string;
  content_hash: string | null;
  perceptual_hash: string | null;
  score: number;
}

/**
 * Phase execution result
 */
export interface PhaseResult {
  success: boolean;
  itemsProcessed: number;
  errors: string[];
}
