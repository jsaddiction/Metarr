/**
 * Provider Cache Types
 *
 * Normalized data structures for the comprehensive provider cache system.
 * These types represent the aggregated data from all providers (TMDB, Fanart.tv, etc.)
 */

// ============================================
// Lookup Parameters
// ============================================

export interface MovieLookupParams {
  tmdb_id?: number;
  imdb_id?: string;
  tvdb_id?: number;
}

export interface PersonLookupParams {
  tmdb_person_id?: number;
  imdb_person_id?: string;
}

export interface CollectionLookupParams {
  tmdb_collection_id: number;
}

// ============================================
// Normalized Data Structures
// ============================================

export interface CachedMovie {
  id: number;

  // Provider IDs
  tmdb_id?: number;
  imdb_id?: string;
  tvdb_id?: number;

  // Core Metadata
  title: string;
  original_title?: string;
  overview?: string;
  tagline?: string;

  // Release Info
  release_date?: string;
  year?: number;
  runtime?: number;
  status?: string;
  content_rating?: string;

  // Ratings
  tmdb_rating?: number;
  tmdb_votes?: number;
  imdb_rating?: number;
  imdb_votes?: number;
  popularity?: number;

  // Business
  budget?: number;
  revenue?: number;
  homepage?: string;

  // Flags
  adult: boolean;

  // Cache metadata
  fetched_at: Date;
}

export interface CachedCollection {
  id: number;
  tmdb_collection_id: number;
  name: string;
  overview?: string;
  fetched_at: Date;
}

export interface CachedPerson {
  id: number;
  tmdb_person_id?: number;
  imdb_person_id?: string;
  name: string;
  profile_path?: string;
  popularity?: number;
  gender?: number;
  known_for_department?: string;
  fetched_at: Date;
}

export interface CachedImage {
  id: number;
  entity_type: 'movie' | 'collection' | 'person' | 'series' | 'season' | 'episode' | 'artist' | 'album';
  entity_cache_id: number;
  image_type: string;
  provider_name: string;
  provider_image_id?: string;
  file_path: string;
  width?: number;
  height?: number;
  aspect_ratio?: number;
  vote_average?: number;
  vote_count?: number;
  likes?: number;
  iso_639_1?: string;
  disc_number?: number;
  disc_type?: string;
  season_number?: number;
  is_hd: boolean;
  fetched_at: Date;
}

export interface CachedVideo {
  id: number;
  entity_type: 'movie' | 'series' | 'episode' | 'person';
  entity_cache_id: number;
  video_type: string;
  provider_name: string;
  provider_video_id: string;
  name: string;
  site: string;
  key: string;
  size?: number;
  duration_seconds?: number;
  published_at?: string;
  official: boolean;
  iso_639_1?: string;
  iso_3166_1?: string;
  fetched_at: Date;
}

export interface CachedCast {
  id: number;
  movie_cache_id: number;
  person: CachedPerson;
  character_name?: string;
  cast_order?: number;
}

export interface CachedCrew {
  id: number;
  movie_cache_id: number;
  person: CachedPerson;
  job: string;
  department?: string;
}

export interface CachedGenre {
  id: number;
  tmdb_genre_id?: number;
  tvdb_genre_id?: number;
  name: string;
}

export interface CachedCompany {
  id: number;
  tmdb_company_id?: number;
  name: string;
  logo_path?: string;
  origin_country?: string;
}

export interface CachedCountry {
  id: number;
  iso_3166_1: string;
  name: string;
}

export interface CachedKeyword {
  id: number;
  tmdb_keyword_id?: number;
  name: string;
}

// ============================================
// Complete Movie Data (with all relationships)
// ============================================

export interface CompleteMovieData extends CachedMovie {
  // Relational data
  genres?: CachedGenre[];
  cast?: CachedCast[];
  crew?: CachedCrew[];
  companies?: CachedCompany[];
  countries?: CachedCountry[];
  keywords?: CachedKeyword[];

  // Collection
  belongs_to_collection?: CachedCollection;

  // Assets
  images?: CachedImage[];
  videos?: CachedVideo[];
}

// ============================================
// Fetch Options
// ============================================

export interface FetchOptions {
  maxAge?: number;        // Max cache age in seconds (default: 7 days = 604800)
  forceRefresh?: boolean; // Bypass cache and fetch fresh from API
  includeImages?: boolean; // Include images (default: true)
  includeVideos?: boolean; // Include videos (default: true)
  includeCast?: boolean;   // Include cast (default: true)
  includeCrew?: boolean;   // Include crew (default: true)
}

export interface FetchResult {
  data: CompleteMovieData | null;
  metadata: {
    source: 'cache' | 'api';
    cacheAge?: number; // Seconds since cached
    providers: string[]; // Which providers contributed
  };
}
