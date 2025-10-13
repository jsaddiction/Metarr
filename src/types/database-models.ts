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
  title: string;
  year: number | null;
  plot: string | null;
  tagline: string | null;
  runtime: number | null;
  rating: number | null;
  votes: number | null;
  mpaa_rating: string | null;
  imdb_id: string | null;
  tmdb_id: number | null;
  file_path: string;
  date_added: string;
  last_scraped_at: string | null;
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
  port: number;
  username: string | null;
  password: string | null;
  api_key: string | null;
  use_https: number; // SQLite boolean (0 or 1)
  enabled: number; // SQLite boolean
  last_connected: string | null;
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
