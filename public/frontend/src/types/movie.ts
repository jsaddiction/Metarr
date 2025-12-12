/**
 * Asset status for UI indicators
 */
export type AssetStatus = 'none' | 'partial' | 'complete';

/**
 * Asset counts per type (for badges and UI display)
 */
export interface AssetCounts {
  poster: number;
  fanart: number;
  landscape: number;
  keyart: number;
  banner: number;
  clearart: number;
  clearlogo: number;
  discart: number;
  trailer: number;
  subtitle: number;
  theme: number;
  actor: number;
}

/**
 * Asset availability status per type
 */
export interface AssetStatuses {
  nfo: AssetStatus;
  poster: AssetStatus;
  fanart: AssetStatus;
  landscape: AssetStatus;
  keyart: AssetStatus;
  banner: AssetStatus;
  clearart: AssetStatus;
  clearlogo: AssetStatus;
  discart: AssetStatus;
  trailer: AssetStatus;
  subtitle: AssetStatus;
  theme: AssetStatus;
}

/**
 * Lightweight movie data for table/grid views
 * Returned by: GET /api/movies
 */
export interface MovieListItem {
  id: number;
  title: string;
  year?: number;
  studio?: string;
  monitored: boolean;
  identification_status: 'unidentified' | 'identified' | 'enriched' | 'published';
  enriched_at?: string;
  published_at?: string;
  assetCounts: AssetCounts;
  assetStatuses: AssetStatuses;
}

/**
 * Complete movie entity for edit pages and detailed views
 * Returned by: GET /api/movies/:id?include=files,candidates,locks
 */
export interface MovieDetail {
  // Identity & System Fields
  id: number;
  library_id: number;

  // File Information
  file_path: string;
  file_name: string;
  file_size?: number;
  file_hash?: string;

  // Provider IDs
  tmdb_id?: number;
  imdb_id?: string;
  tvdb_id?: number;

  // Basic Metadata (user-editable)
  title: string;
  original_title?: string;
  sort_title?: string;
  tagline?: string;
  plot?: string;
  outline?: string;
  runtime?: number;
  year?: number;
  release_date?: string; // ISO 8601
  content_rating?: string;

  // Ratings
  tmdb_rating?: number;
  tmdb_votes?: number;
  imdb_rating?: number;
  imdb_votes?: number;
  user_rating?: number; // 0-10 scale

  // Production & Business Metadata (read-only from providers)
  budget?: number;
  revenue?: number;
  homepage?: string;
  original_language?: string; // ISO 639-1 code
  popularity?: number;
  status?: string; // Production status (Released, Post Production, etc.)

  // External IDs (social media & data sources)
  external_ids?: {
    tmdb_id: number | null;
    imdb_id: string | null;
    tvdb_id: number | null;
    facebook_id: string | null;
    instagram_id: string | null;
    twitter_id: string | null;
    wikidata_id: string | null;
  };

  // Provider URLs (dynamically built from IDs)
  provider_urls?: {
    tmdb_url: string | null;
    imdb_url: string | null;
    tvdb_url: string | null;
    facebook_url: string | null;
    instagram_url: string | null;
    twitter_url: string | null;
    wikidata_url: string | null;
    homepage_url: string | null;
  };

  // Technical Details (from file scan)
  video_streams?: Array<{
    codec?: string;
    width?: number;
    height?: number;
    bitrate?: number;
  }>;
  audio_streams?: Array<{
    codec?: string;
    channels?: number;
    language?: string;
  }>;

  // Asset References (foreign keys to cache_assets)
  poster_id?: number;
  fanart_id?: number;
  logo_id?: number;
  clearlogo_id?: number;
  clearart_id?: number;
  banner_id?: number;
  thumb_id?: number;
  discart_id?: number;
  keyart_id?: number;
  landscape_id?: number;

  // Field Locks (organized object for easier access)
  locks: {
    title: boolean;
    plot: boolean;
    poster: boolean;
    fanart: boolean;
    logo: boolean;
    clearlogo: boolean;
    clearart: boolean;
    banner: boolean;
    thumb: boolean;
    discart: boolean;
    keyart: boolean;
    landscape: boolean;
  };

  // Workflow State
  monitored: boolean;
  identification_status: 'unidentified' | 'identified' | 'enriched' | 'published';
  enrichment_priority: number; // 1-10
  enriched_at?: string;
  published_at?: string;

  // Asset Counts & Statuses (for UI badges)
  assetCounts: AssetCounts;
  assetStatuses: AssetStatuses;

  // Related Data (loaded with ?include parameter)
  files?: {
    unknown: UnknownFile[];
  };
  actors?: Actor[];
  crew?: CrewMember[];
  genres?: Genre[];
  studios?: Studio[];
  countries?: Country[];
  tags?: Tag[];
  collection?: Collection;

  // Timestamps
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

/**
 * Form state for metadata editing
 * Used in: MetadataTab component
 */
export interface MovieMetadataForm {
  title: string;
  original_title?: string;
  sort_title?: string;
  tagline?: string;
  plot?: string;
  outline?: string;
  year?: number;
  release_date?: string;
  content_rating?: string;
  runtime?: number;
  user_rating?: number;
}

/**
 * Related type interfaces
 */

export interface UnknownFile {
  id: number;
  file_name: string;
  file_path: string;
  library_path?: string;
  file_size: number;
  category: string;
  extension: string;
}

export interface Actor {
  id: number;
  name: string;
  role?: string;
  sort_order?: number;
  thumb_id?: number;
}

export interface CrewMember {
  id: number;
  name: string;
  role: string;
  department: string;
}

export interface Genre {
  id: number;
  name: string;
}

export interface Studio {
  id: number;
  name: string;
}

export interface Country {
  id: number;
  name: string;
  iso_code?: string;
}

export interface Tag {
  id: number;
  name: string;
}

export interface Collection {
  id: number;
  name: string;
  plot?: string;
  tmdb_collection_id?: number;
}

/**
 * API response types
 */

export interface MovieListResult {
  movies: MovieListItem[];
  total: number;
}

/**
 * @deprecated Use MovieListItem instead
 */
export type Movie = MovieListItem;

/**
 * Toggle monitored status response
 * POST /api/movies/:id/toggle-monitored
 */
export interface ToggleMonitoredResponse {
  id: number;
  monitored: boolean;
}

/**
 * Lock/unlock field request
 * POST /api/movies/:id/lock-field
 * POST /api/movies/:id/unlock-field
 */
export interface LockFieldRequest {
  movieId: number;
  fieldName: string;
}

/**
 * Lock/unlock field response
 */
export interface LockFieldResponse {
  success: boolean;
  fieldName: string;
  locked: boolean;
}

/**
 * Reset metadata response
 * POST /api/movies/:id/reset-metadata
 */
export interface ResetMetadataResponse {
  success: boolean;
  unlockedFields: string[];
}

/**
 * Movie actor link (cast member)
 */
export interface MovieActorLink {
  id: number;
  movie_id: number;
  actor_id: number;
  actor_name: string;
  role: string | null;
  actor_order: number | null;
  role_locked: boolean;
  removed: boolean;
  image_hash: string | null;
}

/**
 * Cast update request
 * PATCH /api/movies/:id/cast
 */
export interface CastUpdateRequest {
  actors: Array<{
    actor_id: number;
    role: string | null;
    actor_order: number;
    role_locked: boolean;
    removed: boolean;
  }>;
  actors_order_locked: boolean;
}

/**
 * Cast response for GET /api/movies/:id/cast
 */
export interface CastResponse {
  actors: MovieActorLink[];
  actors_order_locked: boolean;
}

/**
 * Cast update response for PUT /api/movies/:id/cast
 */
export interface CastUpdateResponse {
  success: boolean;
  message: string;
  actors: MovieActorLink[];
  actors_order_locked: boolean;
}
