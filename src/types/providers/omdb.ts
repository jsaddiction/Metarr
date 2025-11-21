/**
 * OMDB API Response Types
 * Based on OMDb API documentation
 * @see https://www.omdbapi.com/
 */

// ============================================
// Common Types
// ============================================

/**
 * Rating from external source (IMDB, Rotten Tomatoes, Metacritic)
 */
export interface OMDBRating {
  Source: string;
  Value: string;
}

/**
 * Base response structure for all OMDB API calls
 */
export interface OMDBBaseResponse {
  Response: 'True' | 'False';
  Error?: string;
}

// ============================================
// Search Results
// ============================================

/**
 * Individual search result item
 */
export interface OMDBSearchResult {
  Title: string;
  Year: string;
  imdbID: string;
  Type: 'movie' | 'series' | 'episode';
  Poster: string;
}

/**
 * Search API response
 */
export interface OMDBSearchResponse extends OMDBBaseResponse {
  Search?: OMDBSearchResult[];
  totalResults?: string;
}

// ============================================
// Detailed Movie/Series Data
// ============================================

/**
 * Full movie or series data from OMDB
 */
export interface OMDBMovieData extends OMDBBaseResponse {
  Title: string;
  Year: string;
  Rated: string;
  Released: string;
  Runtime: string;
  Genre: string;
  Director: string;
  Writer: string;
  Actors: string;
  Plot: string; // Full plot when plot=full
  Outline?: string; // Short plot (added by client when fetching both)
  Language: string;
  Country: string;
  Awards: string;
  Poster: string;
  Ratings: OMDBRating[];
  Metascore: string;
  imdbRating: string;
  imdbVotes: string;
  imdbID: string;
  Type: string;
  DVD: string;
  BoxOffice: string;
  Production: string;
  Website: string;
  totalSeasons?: string; // Only for series
}

// ============================================
// Episode Data
// ============================================

/**
 * Individual episode data
 */
export interface OMDBEpisodeData extends OMDBBaseResponse {
  Title: string;
  Year: string;
  Rated: string;
  Released: string;
  Season: string;
  Episode: string;
  Runtime: string;
  Genre: string;
  Director: string;
  Writer: string;
  Actors: string;
  Plot: string;
  Language: string;
  Country: string;
  Awards: string;
  Poster: string;
  Ratings: OMDBRating[];
  Metascore: string;
  imdbRating: string;
  imdbVotes: string;
  imdbID: string;
  Type: 'episode';
  seriesID: string;
}

// ============================================
// Client Configuration
// ============================================

/**
 * Configuration options for OMDB client
 */
export interface OMDBClientOptions {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
}

/**
 * Search options
 */
export interface OMDBSearchOptions {
  query: string;
  type?: 'movie' | 'series';
  year?: number;
  page?: number;
}

/**
 * Cached plot data
 */
export interface OMDBPlotCache {
  fullPlot: string;
  shortPlot: string;
  timestamp: number;
}

// ============================================
// Error Response
// ============================================

/**
 * OMDB API error response
 */
export interface OMDBErrorResponse extends OMDBBaseResponse {
  Response: 'False';
  Error: string;
}
