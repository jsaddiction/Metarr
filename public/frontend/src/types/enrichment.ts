/**
 * Enrichment API Types
 * Phase 5: Multi-Provider Metadata Aggregation
 */

/**
 * Missing field information
 */
export interface MissingField {
  field: string;
  displayName: string;
  category: string;
}

/**
 * Library-wide completeness statistics
 * GET /api/movies/enrichment/stats
 */
export interface LibraryCompletenessStats {
  total: number;
  enriched: number;
  partiallyEnriched: number;
  unenriched: number;
  averageCompleteness: number;
  topIncomplete: Array<{
    id: number;
    title: string;
    year?: number;
    completeness: number;
    missingFields: string[];
  }>;
}

export interface LibraryCompletenessStatsResponse {
  success: true;
  data: LibraryCompletenessStats;
}

/**
 * Movie enrichment status
 * GET /api/movies/:id/enrichment-status
 */
export interface MovieEnrichmentStatus {
  movieId: number;
  completeness: number;
  lastEnriched: string | null;
  enrichmentDuration: number | null;
  partial: boolean;
  rateLimitedProviders: string[];
  missingFields: MissingField[];
  fieldSources: Record<string, string>;
}

export interface MovieEnrichmentStatusResponse {
  success: true;
  data: MovieEnrichmentStatus;
}

/**
 * Trigger manual enrichment
 * POST /api/movies/:id/enrich
 */
export interface TriggerEnrichRequest {
  force?: boolean;
}

export interface TriggerEnrichResponse {
  success: true;
  data: {
    jobId: number;
    message: string;
    estimatedDuration: number;
  };
}

/**
 * Bulk enrichment status
 * GET /api/enrichment/bulk-status
 */
export interface BulkRunStats {
  totalMovies: number;
  processed: number;
  skipped: number;
  failed: number;
}

export interface BulkRunInfo {
  startedAt: string;
  completedAt?: string;
  status: 'completed' | 'partial' | 'running' | 'failed';
  stats: BulkRunStats;
  rateLimitHit: boolean;
  rateLimitedProviders: string[];
}

export interface CurrentBulkRun {
  jobId: number;
  startedAt: string;
  progress: number;
  processedMovies: number;
  totalMovies: number;
  currentMovie: {
    id: number;
    title: string;
  };
  rateLimitedProviders: string[];
}

export interface BulkEnrichmentStatus {
  lastRun: BulkRunInfo | null;
  nextRun: {
    scheduledAt: string;
    timeUntil: number;
  };
  currentRun: CurrentBulkRun | null;
}

export interface BulkEnrichmentStatusResponse {
  success: true;
  data: BulkEnrichmentStatus;
}

/**
 * Trigger bulk enrichment
 * POST /api/enrichment/bulk-run
 */
export interface TriggerBulkEnrichRequest {
  force?: boolean;
}

export interface TriggerBulkEnrichResponse {
  success: true;
  data: {
    jobId: number;
    message: string;
    estimatedDuration: number;
  };
}

/**
 * WebSocket event types for enrichment
 */
export interface EnrichmentProgressEvent {
  type: 'enrichment:progress';
  movieId: number;
  progress: number;
  currentProvider: string;
  providersComplete: string[];
  providersRemaining: string[];
}

export interface EnrichmentCompleteEvent {
  type: 'enrichment:complete';
  movieId: number;
  completeness: number;
  partial: boolean;
  rateLimitedProviders: string[];
}

export interface EnrichmentFailedEvent {
  type: 'enrichment:failed';
  movieId: number;
  error: string;
}

export interface BulkProgressEvent {
  type: 'bulk:progress';
  jobId: number;
  progress: number;
  processedMovies: number;
  totalMovies: number;
  currentMovie: {
    id: number;
    title: string;
  };
  rateLimitedProviders: string[];
}

export interface BulkRateLimitEvent {
  type: 'bulk:rate_limit';
  jobId: number;
  provider: string;
  processedMovies: number;
  totalMovies: number;
  message: string;
}

export interface BulkCompleteEvent {
  type: 'bulk:complete';
  jobId: number;
  stats: BulkRunStats;
  rateLimitHit: boolean;
}

export type EnrichmentWebSocketEvent =
  | EnrichmentProgressEvent
  | EnrichmentCompleteEvent
  | EnrichmentFailedEvent
  | BulkProgressEvent
  | BulkRateLimitEvent
  | BulkCompleteEvent;
