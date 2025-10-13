export interface Movie {
  id: number;
  title: string;
  year: number;
  tmdbId?: number;
  imdbId?: string;
  overview?: string;
  posterPath?: string;
  backdropPath?: string;
  filePath: string;
  fileSize?: number;
  quality?: string;
  releaseDate?: Date;
  runtime?: number;
  genres?: string[];
  rating?: number;
  voteCount?: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'needs_identification';
  libraryId?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Series {
  id: number;
  title: string;
  year?: number;
  tmdbId?: number;
  tvdbId?: number;
  imdbId?: string;
  overview?: string;
  posterPath?: string;
  backdropPath?: string;
  folderPath: string;
  status: 'continuing' | 'ended' | 'pending' | 'processing' | 'needs_identification';
  firstAirDate?: Date;
  lastAirDate?: Date;
  episodeCount?: number;
  seasonCount?: number;
  network?: string;
  genres?: string[];
  rating?: number;
  voteCount?: number;
  libraryId?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Episode {
  id: number;
  seriesId: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  overview?: string;
  airDate?: Date;
  runtime?: number;
  stillPath?: string;
  filePath?: string;
  fileSize?: number;
  quality?: string;
  status: 'missing' | 'downloading' | 'downloaded' | 'processed';
  createdAt: Date;
  updatedAt: Date;
}

export interface Provider {
  id: number;
  name: string;
  type: 'metadata' | 'images' | 'trailers' | 'music';
  apiKey?: string;
  baseUrl: string;
  rateLimit: number;
  rateLimitWindow: number; // in seconds
  enabled: boolean;
  priority: number;
  config: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface MediaPlayer {
  id: number;
  name: string;
  type: 'kodi' | 'jellyfin' | 'plex';
  host: string;
  port: number;
  username?: string;
  password?: string;
  apiKey?: string;
  enabled: boolean;
  libraryPaths: string[];
  libraryGroup?: string; // Group name for Kodi instances sharing a library
  connectionStatus: 'connected' | 'disconnected' | 'error';
  jsonRpcVersion?: string; // e.g., "v12", "v13", "v13.5"
  useWebsocket: boolean;
  lastConnected?: Date | undefined;
  lastError?: string | undefined;
  config: Record<string, any>;
  lastSync?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Job {
  id: number;
  type: 'movie_metadata' | 'series_metadata' | 'library_update' | 'asset_download';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'retrying';
  priority: number;
  payload: Record<string, any>;
  result?: Record<string, any>;
  error?: string;
  attempts: number;
  maxAttempts: number;
  nextAttempt?: Date;
  processingStarted?: Date;
  processingCompleted?: Date;
  createdAt: Date;
  updatedAt: Date;
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
  createdAt: Date;
  updatedAt: Date;
}

export type MediaLibraryType = 'movies' | 'tvshows' | 'music';

export interface Library {
  id: number;
  name: string;
  type: MediaLibraryType;
  path: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScanJob {
  id: number;
  libraryId: number;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  progressCurrent: number;
  progressTotal: number;
  currentFile?: string;
  errorsCount: number;
  startedAt: Date;
  completedAt?: Date;
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
