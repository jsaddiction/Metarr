export interface Movie {
  id: number;
  title: string;
  year: number;

  // External IDs
  tmdb_id?: number;
  imdb_id?: string;
  tvdb_id?: number;

  // Core Metadata
  overview?: string;
  tagline?: string;
  plot?: string;
  outline?: string;

  // Media Files
  poster_path?: string;
  backdrop_path?: string;
  file_path: string;
  file_size?: number;
  quality?: string;

  // Release & Duration
  release_date?: Date;
  runtime?: number;

  // Ratings & Engagement
  rating?: number;
  vote_count?: number;
  popularity?: number;

  // Business & Discovery
  budget?: number;
  revenue?: number;
  homepage?: string;

  // Localization & Status
  original_language?: string;
  status?: string;

  // Relationships
  genres?: string[];
  library_id?: number;

  // Lock Fields
  actors_order_locked?: boolean;

  // Workflow Status
  workflow_status: 'pending' | 'processing' | 'completed' | 'failed' | 'needs_identification';

  // Timestamps
  created_at: Date;
  updated_at: Date;
}

export interface Series {
  id: number;
  title: string;
  year?: number;
  tmdb_id?: number;
  tvdb_id?: number;
  imdb_id?: string;
  overview?: string;
  poster_path?: string;
  backdrop_path?: string;
  folder_path: string;
  status: 'continuing' | 'ended' | 'pending' | 'processing' | 'needs_identification';
  first_air_date?: Date;
  last_air_date?: Date;
  episode_count?: number;
  season_count?: number;
  network?: string;
  genres?: string[];
  rating?: number;
  vote_count?: number;
  library_id?: number;
  created_at: Date;
  updated_at: Date;
}

export interface Episode {
  id: number;
  series_id: number;
  season_number: number;
  episode_number: number;
  title: string;
  overview?: string;
  air_date?: Date;
  runtime?: number;
  still_path?: string;
  file_path?: string;
  file_size?: number;
  quality?: string;
  status: 'missing' | 'downloading' | 'downloaded' | 'processed';
  created_at: Date;
  updated_at: Date;
}

export interface Provider {
  id: number;
  name: string;
  type: 'metadata' | 'images' | 'trailers' | 'music';
  api_key?: string;
  base_url: string;
  rate_limit: number;
  rate_limit_window: number; // in seconds
  enabled: boolean;
  priority: number;
  config: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface MediaPlayer {
  id: number;
  name: string;
  type: 'kodi' | 'jellyfin' | 'plex';
  host: string;
  http_port: number; // HTTP JSON-RPC port (default 8080), WebSocket is always 9090
  username?: string;
  password?: string;
  api_key?: string;
  enabled: boolean;
  library_paths: string[];
  library_group?: string; // Group name for Kodi instances sharing a library
  connection_status: 'connected' | 'disconnected' | 'error';
  json_rpc_version?: string; // e.g., "v12", "v13", "v13.5"
  last_connected?: Date | undefined;
  last_error?: string | undefined;
  config: Record<string, unknown>;
  last_sync?: Date;
  created_at: Date;
  updated_at: Date;
}

/**
 * Live activity state for a media player
 * Tracks connection mode and current activity (playing, scanning, etc.)
 */
export interface PlayerActivityState {
  player_id: number;
  player_name: string;
  connection_mode: 'websocket' | 'http' | 'disconnected';
  activity: {
    type: 'idle' | 'playing' | 'paused' | 'scanning';
    details?: string; // e.g., "Inception (2010)" or "Video Library"
    progress?: {
      // Playback progress (Kodi supports via polling)
      percentage?: number; // 0-100
      currentSeconds?: number; // Current position
      totalSeconds?: number; // Total duration
    };
    filepath?: string; // Currently playing file path (useful for scan coordination)
    kodiPlayerId?: number; // Kodi's internal player ID (0=video, 1=music, 2=pictures)
  };
  lastUpdated: Date;
}

export interface Job {
  id: number;
  type: 'movie_metadata' | 'series_metadata' | 'library_update' | 'asset_download';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'retrying';
  priority: number;
  payload: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  attempts: number;
  maxAttempts: number;
  nextAttempt?: Date;
  processingStarted?: Date;
  processingCompleted?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface Asset {
  id: number;
  entityType: 'movie' | 'series' | 'episode';
  entityId: number;
  type: 'poster' | 'backdrop' | 'still' | 'trailer' | 'theme' | 'logo';
  url: string;
  localPath?: string;
  size?: number;
  width?: number;
  height?: number;
  language?: string;
  providerId?: number;
  downloaded: boolean;
  created_at: Date;
  updated_at: Date;
}

export type MediaLibraryType = 'movie' | 'tv' | 'music';

export interface Library {
  id: number;
  name: string;
  type: MediaLibraryType;
  path: string;
  auto_enrich: boolean;   // Automatically enrich after scan (default: true)
  auto_publish: boolean;  // Automatically publish after enrichment (default: false)
  description?: string;   // Optional library description
  created_at: Date;
  updated_at: Date;
  stats?: {
    total: number;
    unidentified: number;
    identified: number;
    enriched: number;
    lastScan: string | null;
  };
}

export interface ScanJob {
  id: number;
  libraryId: number;

  // Phase tracking
  status: 'discovering' | 'scanning' | 'caching' | 'enriching' | 'completed' | 'failed' | 'cancelled';

  // Phase 1: Directory Discovery
  directoriesTotal: number;
  directoriesQueued: number;

  // Phase 2: Directory Scanning
  directoriesScanned: number;
  moviesFound: number;
  moviesNew: number;
  moviesUpdated: number;

  // Phase 3: Asset Caching
  assetsQueued: number;
  assetsCached: number;

  // Phase 4: Enrichment
  enrichmentQueued: number;
  enrichmentCompleted: number;

  // Timing
  startedAt: Date;
  discoveryCompletedAt?: Date;
  scanningCompletedAt?: Date;
  cachingCompletedAt?: Date;
  completedAt?: Date;

  // Errors
  errorsCount: number;
  lastError?: string;

  // Current operation (for debugging)
  currentOperation?: string;

  // Scan options (JSON)
  options?: ScanOptions;
}

export interface ScanOptions {
  // Phase control
  enableCaching?: boolean;
  enableEnrichment?: boolean;

  // Development flags
  skipAssetDiscovery?: boolean;
  skipFFprobe?: boolean;
  maxDirectories?: number;

  // Enrichment control
  enrichmentMode?: 'none' | 'metadata-only' | 'full';
}

export interface NFOIds {
  tmdbId?: number;
  imdbId?: string;
  tvdbId?: number;
}

export interface ParsedMovieNFO extends NFOIds {
  valid: boolean;
  ambiguous: boolean;
  error?: string;
}

export interface ParsedTVShowNFO extends NFOIds {
  valid: boolean;
  ambiguous: boolean;
  error?: string;
}

export interface ParsedEpisodeNFO {
  seasonNumber?: number;
  episodeNumber?: number;
  tmdbId?: number;
  tvdbId?: number;
  valid: boolean;
  error?: string;
}

// Actor data structure
export interface ActorData {
  name: string;
  role?: string;
  order?: number;
  thumb?: string;
}

// Rating data structure
export interface RatingData {
  source: string;
  value: number;
  votes?: number;
  default?: boolean;
}

// Set data structure
export interface SetData {
  name: string;
  overview?: string;
}

// Full NFO metadata structures
export interface FullMovieNFO {
  // IDs
  tmdbId?: number;
  imdbId?: string;
  tvdbId?: number;

  // Scalars
  title?: string;
  originalTitle?: string;
  sortTitle?: string;
  plot?: string;
  outline?: string;
  tagline?: string;
  year?: number;
  runtime?: number;
  userRating?: number;
  premiered?: string;
  mpaa?: string;
  trailerUrl?: string;

  // Business & Discovery
  budget?: number;
  revenue?: number;
  homepage?: string;

  // Localization & Status
  originalLanguage?: string;
  popularity?: number;
  status?: string;

  // Set info
  set?: SetData;

  // Arrays
  genres?: string[];
  directors?: string[];
  credits?: string[]; // writers
  studios?: string[];
  countries?: string[];
  tags?: string[];

  // Complex structures
  actors?: ActorData[];
  ratings?: RatingData[];

  // Validation
  valid: boolean;
  ambiguous: boolean;
  error?: string;
}

export interface FullTVShowNFO {
  // IDs
  tmdbId?: number;
  tvdbId?: number;
  imdbId?: string;

  // Scalars
  title?: string;
  originalTitle?: string;
  sortTitle?: string;
  plot?: string;
  outline?: string;
  year?: number;
  premiered?: string;
  status?: string;
  mpaa?: string;
  userRating?: number;

  // Arrays
  genres?: string[];
  directors?: string[];
  studios?: string[];
  tags?: string[];

  // Complex
  actors?: ActorData[];
  ratings?: RatingData[];

  // Validation
  valid: boolean;
  ambiguous: boolean;
  error?: string;
}

export interface FullEpisodeNFO {
  seasonNumber?: number;
  episodeNumber?: number;
  displaySeason?: number;
  displayEpisode?: number;
  title?: string;
  plot?: string;
  outline?: string;
  aired?: string;
  runtime?: number;
  userRating?: number;

  // Arrays
  directors?: string[];
  credits?: string[]; // writers

  // Complex
  actors?: ActorData[];
  ratings?: RatingData[];

  // Validation
  valid: boolean;
  error?: string;
}

export interface DirectoryEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}
