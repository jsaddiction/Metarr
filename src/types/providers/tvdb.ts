/**
 * TVDB API Response Types
 * Based on TVDB API v4 documentation
 * @see https://thetvdb.github.io/v4-api/
 */

// ============================================
// Authentication
// ============================================

export interface TVDBLoginRequest {
  apikey: string;
}

export interface TVDBLoginResponse {
  status: string;
  data: {
    token: string;
  };
}

// ============================================
// Common Types
// ============================================

export interface TVDBStatus {
  id?: number;
  name: string;
  recordType?: string;
  keepUpdated?: boolean;
}

export interface TVDBGenre {
  id?: number;
  name: string;
  slug?: string;
}

export interface TVDBRemoteId {
  id: string;
  type: number;
  sourceName: string;
}

export interface TVDBImage {
  id: number;
  image: string; // URL path
  thumbnail?: string;
  type: number;
  typeName?: string;
  subType?: number;
  fileName?: string;
  language?: string;
  resolution?: string;
  width?: number;
  height?: number;
  ratingsInfo?: {
    average: number;
    count: number;
  };
}

export interface TVDBCharacter {
  id: number;
  name: string;
  peopleId?: number;
  personName?: string;
  personImgURL?: string;
  type?: number;
  image?: string;
  sort?: number;
  isFeatured?: boolean;
}

export interface TVDBArtwork {
  id: number;
  image: string;
  thumbnail?: string;
  language?: string;
  type: number;
  score?: number;
  width?: number;
  height?: number;
  includesText?: boolean;
  thumbnailWidth?: number;
  thumbnailHeight?: number;
  updatedAt?: number;
  status?: TVDBStatus;
  tagOptions?: any[];
}

// ============================================
// Series
// ============================================

export interface TVDBSeries {
  id: number;
  name: string;
  slug?: string;
  image?: string;
  firstAired?: string;
  lastAired?: string;
  nextAired?: string;
  originalCountry?: string;
  originalLanguage?: string;
  overview?: string;
  averageRuntime?: number;
  status: TVDBStatus;
  genres?: TVDBGenre[];
  year?: string;
  score?: number;
  artworks?: TVDBArtwork[];
  characters?: TVDBCharacter[];
  remoteIds?: TVDBRemoteId[];
  seasons?: TVDBSeasonBasic[];
}

export interface TVDBSeriesExtended extends TVDBSeries {
  abbreviation?: string;
  aliases?: Array<{ language: string; name: string }>;
  defaultSeasonType?: number;
  episodeRuntime?: number;
  isOrderRandomized?: boolean;
  lastUpdated?: string;
  nameTranslations?: string[];
  overviewTranslations?: string[];
}

export interface TVDBSeasonBasic {
  id: number;
  seriesId?: number;
  number: number;
  name?: string;
  type?: {
    id: number;
    name: string;
    type: string;
  };
  image?: string;
  imageType?: number;
  companies?: any[];
  year?: string;
}

// ============================================
// Season
// ============================================

export interface TVDBSeason extends TVDBSeasonBasic {
  episodes?: TVDBEpisode[];
  artwork?: TVDBArtwork[];
  trailers?: any[];
}

// ============================================
// Episode
// ============================================

export interface TVDBEpisode {
  id: number;
  seriesId: number;
  name?: string;
  aired?: string;
  runtime?: number;
  nameTranslations?: string[];
  overview?: string;
  overviewTranslations?: string[];
  image?: string;
  imageType?: number;
  isMovie?: number;
  seasons?: Array<{ id: number; seriesId: number; type: any }>;
  number?: number;
  seasonNumber?: number;
  lastUpdated?: string;
  finaleType?: string;
  year?: string;
  airsBeforeSeason?: number;
  airsBeforeEpisode?: number;
  characters?: TVDBCharacter[];
}

export interface TVDBEpisodeExtended extends TVDBEpisode {
  awards?: any[];
  companies?: any[];
  contentRatings?: any[];
  productionCode?: string;
  remoteIds?: TVDBRemoteId[];
  tagOptions?: any[];
  trailers?: any[];
  translations?: any[];
}

// ============================================
// Search
// ============================================

export interface TVDBSearchResult {
  objectID: string;
  aliases?: string[];
  companies?: string[];
  companyType?: string;
  country?: string;
  director?: string;
  first_air_time?: string;
  genres?: string[];
  id: string;
  image_url?: string;
  name: string;
  name_translated?: string[];
  overview?: string;
  overviews?: Record<string, string>;
  overview_translated?: string[];
  primary_language?: string;
  primary_type?: string;
  status?: string;
  translations?: Record<string, string>;
  tvdb_id?: string;
  type?: string;
  year?: string;
  slug?: string;
  network?: string;
  remote_ids?: Array<{ id: string; type: number; sourceName: string }>;
}

export interface TVDBSearchResponse {
  status: string;
  data: TVDBSearchResult[];
  links?: {
    prev?: string;
    self?: string;
    next?: string;
    total_items?: number;
    page_size?: number;
  };
}

// ============================================
// API Response Wrappers
// ============================================

export interface TVDBResponse<T> {
  status: string;
  data: T;
  message?: string;
}

export interface TVDBError {
  status: string;
  message: string;
  Error?: string;
}

// ============================================
// Client Options
// ============================================

export interface TVDBClientOptions {
  apiKey: string;
  baseUrl?: string;
  imageBaseUrl?: string;
  language?: string;
  tokenRefreshBuffer?: number; // Refresh token this many hours before expiry
}

// ============================================
// Image Types (for mapping)
// ============================================

export enum TVDBImageType {
  POSTER = 2,
  BANNER = 1,
  FANART = 3,
  SEASON_POSTER = 7,
  SERIES_BANNER = 1,
  CLEARLOGO = 13,
  CLEARART = 22,
}
