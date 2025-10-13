/**
 * TMDB API Response Types
 * Based on TMDB API v3 documentation
 * @see https://developer.themoviedb.org/reference/intro/getting-started
 */

// ============================================
// Common Types
// ============================================

export interface TMDBImage {
  aspect_ratio: number;
  file_path: string;
  height: number;
  width: number;
  iso_639_1: string | null;
  vote_average: number;
  vote_count: number;
}

export interface TMDBVideo {
  id: string;
  iso_639_1: string;
  iso_3166_1: string;
  key: string; // YouTube video ID
  name: string;
  site: string; // "YouTube"
  size: number; // 360, 720, 1080
  type: string; // "Trailer", "Teaser", "Clip", "Featurette"
  official: boolean;
  published_at: string;
}

export interface TMDBGenre {
  id: number;
  name: string;
}

export interface TMDBProductionCompany {
  id: number;
  logo_path: string | null;
  name: string;
  origin_country: string;
}

export interface TMDBProductionCountry {
  iso_3166_1: string;
  name: string;
}

export interface TMDBSpokenLanguage {
  iso_639_1: string;
  english_name: string;
  name: string;
}

export interface TMDBExternalIds {
  imdb_id: string | null;
  facebook_id: string | null;
  instagram_id: string | null;
  twitter_id: string | null;
  wikidata_id: string | null;
  tvdb_id: number | null;
}

// ============================================
// Cast & Crew
// ============================================

export interface TMDBCastMember {
  adult: boolean;
  gender: number | null; // 0=not specified, 1=female, 2=male
  id: number;
  known_for_department: string;
  name: string;
  original_name: string;
  popularity: number;
  profile_path: string | null;
  cast_id: number;
  character: string;
  credit_id: string;
  order: number;
}

export interface TMDBCrewMember {
  adult: boolean;
  gender: number | null;
  id: number;
  known_for_department: string;
  name: string;
  original_name: string;
  popularity: number;
  profile_path: string | null;
  credit_id: string;
  department: string;
  job: string;
}

export interface TMDBCredits {
  cast: TMDBCastMember[];
  crew: TMDBCrewMember[];
}

// ============================================
// Movie Types
// ============================================

export interface TMDBMovieCollection {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
}

export interface TMDBMovieReleaseDate {
  certification: string;
  descriptors: string[];
  iso_639_1: string;
  note: string;
  release_date: string;
  type: number;
}

export interface TMDBMovieReleaseDatesResult {
  iso_3166_1: string;
  release_dates: TMDBMovieReleaseDate[];
}

export interface TMDBMovie {
  adult: boolean;
  backdrop_path: string | null;
  belongs_to_collection: TMDBMovieCollection | null;
  budget: number;
  genres: TMDBGenre[];
  homepage: string | null;
  id: number;
  imdb_id: string | null;
  original_language: string;
  original_title: string;
  overview: string | null;
  popularity: number;
  poster_path: string | null;
  production_companies: TMDBProductionCompany[];
  production_countries: TMDBProductionCountry[];
  release_date: string;
  revenue: number;
  runtime: number | null;
  spoken_languages: TMDBSpokenLanguage[];
  status: string; // "Released", "Post Production", "Rumored"
  tagline: string | null;
  title: string;
  video: boolean;
  vote_average: number;
  vote_count: number;

  // Extended fields (when append_to_response is used)
  credits?: TMDBCredits;
  videos?: { results: TMDBVideo[] };
  images?: {
    backdrops: TMDBImage[];
    logos: TMDBImage[];
    posters: TMDBImage[];
  };
  keywords?: { keywords: Array<{ id: number; name: string }> };
  release_dates?: { results: TMDBMovieReleaseDatesResult[] };
  external_ids?: TMDBExternalIds;
}

export interface TMDBMovieSearchResult {
  adult: boolean;
  backdrop_path: string | null;
  genre_ids: number[];
  id: number;
  original_language: string;
  original_title: string;
  overview: string;
  popularity: number;
  poster_path: string | null;
  release_date: string;
  title: string;
  video: boolean;
  vote_average: number;
  vote_count: number;
}

export interface TMDBMovieSearchResponse {
  page: number;
  results: TMDBMovieSearchResult[];
  total_pages: number;
  total_results: number;
}

// ============================================
// Collection Types
// ============================================

export interface TMDBCollectionPart {
  adult: boolean;
  backdrop_path: string | null;
  id: number;
  title: string;
  original_language: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  media_type: string;
  genre_ids: number[];
  popularity: number;
  release_date: string;
  video: boolean;
  vote_average: number;
  vote_count: number;
}

export interface TMDBCollection {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  parts: TMDBCollectionPart[];
}

// ============================================
// Find (External ID Lookup)
// ============================================

export interface TMDBFindResponse {
  movie_results: TMDBMovieSearchResult[];
  person_results: any[];
  tv_results: any[];
  tv_episode_results: any[];
  tv_season_results: any[];
}

// ============================================
// Configuration
// ============================================

export interface TMDBConfiguration {
  images: {
    base_url: string;
    secure_base_url: string;
    backdrop_sizes: string[];
    logo_sizes: string[];
    poster_sizes: string[];
    profile_sizes: string[];
    still_sizes: string[];
  };
  change_keys: string[];
}

// ============================================
// Error Response
// ============================================

export interface TMDBError {
  status_code: number;
  status_message: string;
  success: false;
}

// ============================================
// API Client Options
// ============================================

export interface TMDBClientOptions {
  apiKey: string;
  baseUrl?: string;
  imageBaseUrl?: string;
  language?: string;
  region?: string;
  includeAdult?: boolean;
}

export interface TMDBSearchOptions {
  query: string;
  year?: number;
  page?: number;
  includeAdult?: boolean;
  language?: string;
  region?: string;
}

export interface TMDBMovieDetailsOptions {
  language?: string;
  appendToResponse?: string[]; // e.g., ['credits', 'videos', 'images']
}

export interface TMDBFindOptions {
  externalId: string;
  externalSource: 'imdb_id' | 'tvdb_id' | 'facebook_id' | 'instagram_id' | 'twitter_id';
  language?: string;
}

// ============================================
// Image Helper Types
// ============================================

export type TMDBImageSize =
  | 'w45'
  | 'w92'
  | 'w154'
  | 'w185'
  | 'w300'
  | 'w342'
  | 'w500'
  | 'w780'
  | 'w1280'
  | 'h632'
  | 'original';

export type TMDBImageType = 'poster' | 'backdrop' | 'logo' | 'profile' | 'still';

// ============================================
// Changes API Types
// ============================================

export interface TMDBChangeItem {
  id: string;
  action: 'added' | 'updated' | 'deleted';
  time: string; // ISO 8601 timestamp
  iso_639_1?: string;
  iso_3166_1?: string;
  value?: any;
  original_value?: any;
}

export interface TMDBChange {
  key: string; // Field that changed (e.g., 'images', 'videos', 'title')
  items: TMDBChangeItem[];
}

export interface TMDBChangesAPIResponse {
  changes: TMDBChange[];
}

export interface TMDBChangesResponse {
  hasChanges: boolean;
  changedFields: string[];
  lastChangeDate?: Date;
}
