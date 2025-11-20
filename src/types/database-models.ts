/**
 * Database Row Type Definitions
 *
 * Typed interfaces for all database table rows.
 * Eliminates the need for 'any' types when querying the database.
 */

/**
 * Library table row
 */
export interface LibraryRow {
  id: number;
  name: string;
  type: 'movies' | 'tvshows' | 'music';
  root_path: string;
  created_at: string;
  updated_at: string;
}

/**
 * Movie table row
 */
export interface MovieRow {
  id: number;
  library_id: number;
  file_path: string;
  file_name: string;
  file_size: number | null;
  file_hash: string | null;

  // External IDs
  tmdb_id: number | null;
  imdb_id: string | null;
  tvdb_id: number | null;

  // Core Metadata
  title: string;
  original_title: string | null;
  sort_title: string | null;
  tagline: string | null;
  plot: string | null;
  outline: string | null;

  // Release & Duration
  runtime: number | null;
  year: number | null;
  release_date: string | null;

  // Ratings & Engagement
  content_rating: string | null;
  tmdb_rating: number | null;
  tmdb_votes: number | null;
  imdb_rating: number | null;
  imdb_votes: number | null;
  user_rating: number | null;

  // Business & Discovery
  budget: number | null;
  revenue: number | null;
  homepage: string | null;

  // Localization & Status
  original_language: string | null;
  popularity: number | null;
  status: string | null;

  // Asset Lock Fields
  nfo_cache_id: number | null;
  title_locked: number; // SQLite boolean
  plot_locked: number; // SQLite boolean
  poster_locked: number; // SQLite boolean
  fanart_locked: number; // SQLite boolean
  logo_locked: number; // SQLite boolean
  clearlogo_locked: number; // SQLite boolean
  clearart_locked: number; // SQLite boolean
  banner_locked: number; // SQLite boolean
  thumb_locked: number; // SQLite boolean
  discart_locked: number; // SQLite boolean
  keyart_locked: number; // SQLite boolean
  landscape_locked: number; // SQLite boolean

  // Workflow Status
  monitored: number; // SQLite boolean
  identification_status: 'unidentified' | 'identified' | 'enriched' | 'published';
  enrichment_priority: number;

  // Timestamps
  enriched_at: string | null;
  published_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Media player table row
 */
export interface MediaPlayerRow {
  id: number;
  name: string;
  type: 'kodi' | 'jellyfin' | 'plex';
  host: string;
  http_port: number;
  port?: number; // Legacy column name support
  username: string | null;
  password: string | null;
  api_key: string | null;
  use_https?: number; // SQLite boolean (0 or 1)
  enabled: number; // SQLite boolean
  library_paths: string; // JSON string
  library_group: string | null;
  connection_status: 'connected' | 'disconnected' | 'error';
  json_rpc_version: string | null;
  config: string; // JSON string
  last_connected: string | null;
  last_error: string | null;
  last_sync: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Image table row
 */
export interface ImageRow {
  id: number;
  entity_id: number;
  entity_type: 'movie' | 'series' | 'season' | 'episode';
  type: 'poster' | 'fanart' | 'banner' | 'logo' | 'clearart' | 'thumb';
  url: string | null;
  cache_path: string | null;
  library_path: string | null;
  provider: string | null;
  language: string | null;
  width: number | null;
  height: number | null;
  rating: number | null;
  is_primary: number; // SQLite boolean
  created_at: string;
  updated_at: string;
}

/**
 * Job queue table row
 */
export interface JobRow {
  id: number;
  type: string;
  state: 'pending' | 'processing' | 'completed' | 'failed' | 'retrying';
  priority: number;
  payload: string; // JSON string
  error: string | null;
  attempts: number;
  max_attempts: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
}

/**
 * Library scheduler config table row
 */
export interface LibrarySchedulerConfigRow {
  id: number;
  library_id: number;
  file_scanner_enabled: number; // SQLite boolean
  file_scanner_interval_hours: number;
  file_scanner_last_run: string | null;
  provider_updater_enabled: number; // SQLite boolean
  provider_updater_interval_hours: number;
  provider_updater_last_run: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Ignore pattern table row
 */
export interface IgnorePatternRow {
  id: number;
  library_id: number;
  pattern: string;
  type: 'glob' | 'regex';
  created_at: string;
}

/**
 * Genre table row
 */
export interface GenreRow {
  id: number;
  name: string;
}

/**
 * Movie-Genre junction table row
 */
export interface MovieGenreRow {
  movie_id: number;
  genre_id: number;
}

/**
 * Studio table row
 */
export interface StudioRow {
  id: number;
  name: string;
}

/**
 * Movie-Studio junction table row
 */
export interface MovieStudioRow {
  movie_id: number;
  studio_id: number;
}

/**
 * Person table row
 */
export interface PersonRow {
  id: number;
  name: string;
  tmdb_id: number | null;
  imdb_id: string | null;
}

/**
 * Movie-Person junction table row (for actors, directors, writers)
 */
export interface MoviePersonRow {
  id: number;
  movie_id: number;
  person_id: number;
  role: 'actor' | 'director' | 'writer' | 'producer';
  character_name: string | null;
  sort_order: number | null;
}

/**
 * Provider configuration table row
 */
export interface ProviderConfigRow {
  id: number;
  name: string;
  enabled: number; // SQLite boolean
  priority: number;
  api_key: string | null;
  language: string | null;
  region: string | null;
  settings: string | null; // JSON string
  created_at: string;
  updated_at: string;
}

/**
 * Asset priority configuration table row
 */
export interface AssetPriorityRow {
  id: number;
  provider_name: string;
  asset_type: string;
  priority: number;
  created_at: string;
  updated_at: string;
}

/**
 * Metadata field priority configuration table row
 */
export interface MetadataFieldPriorityRow {
  id: number;
  provider_name: string;
  field_name: string;
  priority: number;
  created_at: string;
  updated_at: string;
}

/**
 * Automation configuration table row
 */
export interface AutomationConfigRow {
  id: number;
  library_id: number;
  mode: 'manual' | 'yolo' | 'hybrid';
  auto_select_assets: number; // SQLite boolean
  auto_publish: number; // SQLite boolean
  webhook_enabled: number; // SQLite boolean
  created_at: string;
  updated_at: string;
}

/**
 * Field lock table row
 */
export interface FieldLockRow {
  id: number;
  entity_id: number;
  entity_type: 'movie' | 'series' | 'season' | 'episode';
  field_name: string;
  locked: number; // SQLite boolean
  locked_by: 'user' | 'system';
  locked_at: string;
}

/**
 * Unknown file table row
 */
export interface UnknownFileRow {
  id: number;
  library_id: number;
  file_path: string;
  file_type: string;
  file_size: number;
  discovered_at: string;
}

/**
 * Library scan table row
 */
export interface LibraryScanRow {
  id: number;
  library_id: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  files_found: number;
  files_processed: number;
  errors: number;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
}

/**
 * Cache inventory table row
 */
export interface CacheInventoryRow {
  id: number;
  entity_id: number;
  entity_type: 'movie' | 'series' | 'season' | 'episode';
  asset_type: 'poster' | 'fanart' | 'banner' | 'logo' | 'trailer' | 'subtitle';
  cache_path: string;
  file_hash: string;
  file_size: number;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  created_at: string;
}

/**
 * External IDs from multiple providers
 * Used in API responses and provider cache
 */
export interface ExternalIds {
  tmdb_id: number | null;
  imdb_id: string | null;
  tvdb_id: number | null;
  facebook_id: string | null;
  instagram_id: string | null;
  twitter_id: string | null;
  wikidata_id: string | null;
}

/**
 * Provider URLs for user reference
 * Generated from external IDs
 */
export interface ProviderUrls {
  tmdb_url: string | null;
  imdb_url: string | null;
  tvdb_url: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  twitter_url: string | null;
  wikidata_url: string | null;
  homepage_url: string | null;
}

/**
 * Helper type to convert SQLite boolean (0|1) to TypeScript boolean
 */
export type SqliteBoolean = 0 | 1;

/**
 * Helper function to convert SQLite boolean to TypeScript boolean
 */
export function sqliteBooleanToBoolean(value: SqliteBoolean | number): boolean {
  return value === 1;
}

/**
 * Helper function to convert TypeScript boolean to SQLite boolean
 */
export function booleanToSqliteBoolean(value: boolean): SqliteBoolean {
  return value ? 1 : 0;
}
