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
  requireComplete?: boolean; // NEW: If true, stop on ANY rate limit (bulk mode). Defaults to false.
  phaseConfig?: EnrichmentPhaseConfig; // Optional phase configuration (uses defaults if not provided)
}

/**
 * Result of enrichment workflow
 */
export interface EnrichmentResult {
  success: boolean;
  partial?: boolean; // NEW: true if some providers rate limited but still updated
  rateLimitedProviders?: string[]; // NEW: which providers hit limit
  metadataChanged?: string[]; // NEW: which metadata fields changed
  assetsChanged?: string[]; // NEW: which asset types changed
  completeness?: number; // NEW: metadata completeness %
  assetsFetched?: number; // Changed to optional for metadata-only enrichments
  assetsSelected?: number; // Changed to optional since this was already optional in some contexts
  thumbnailsDownloaded?: number; // Already optional
  trailersAnalyzed?: number; // Number of trailers analyzed via yt-dlp
  trailerSelected?: boolean; // Whether a trailer was selected
  errors?: string[]; // Changed to optional to match usage pattern
  message?: string; // NEW: optional message (e.g., for rate limit info)
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
  sort_title?: string;
  tmdb_id: number | null;
  imdb_id: string | null;
  tvdb_id: number | null;
  monitored: number;
  title_locked?: number;
  sort_title_locked?: number;
  plot_locked?: number;
  [key: string]: unknown;
}

/**
 * Fields that can be updated on a movie entity
 */
export interface MovieUpdateFields {
  title?: string;
  original_title?: string;
  sort_title?: string;
  plot?: string;
  outline?: string;
  tagline?: string;
  release_date?: string;
  year?: number;
  runtime?: number;
  content_rating?: string;
  tmdb_rating?: number;
  tmdb_votes?: number;
  imdb_rating?: number;
  imdb_votes?: number;
  budget?: number;
  revenue?: number;
  homepage?: string;
  original_language?: string;
  popularity?: number;
  status?: string;
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
