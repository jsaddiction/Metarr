/**
 * Metadata Completeness Calculation
 *
 * Calculates completeness percentage based on filled fields
 * for movies and TV series.
 */

/**
 * Expected fields for completeness calculation
 * Movies should have most of these fields filled
 */
const EXPECTED_MOVIE_FIELDS = [
  'title',
  'plot',
  'tagline',
  'imdb_rating',
  'rotten_tomatoes_score',
  'metacritic_score',
  'release_date',
  'runtime',
  'content_rating',
  'genres',
  'poster_url',
] as const;

/**
 * Expected fields for TV series completeness calculation
 */
const EXPECTED_SERIES_FIELDS = [
  'title',
  'plot',
  'tagline',
  'imdb_rating',
  'rotten_tomatoes_score',
  'metacritic_score',
  'premiered',
  'status',
  'content_rating',
  'genres',
  'poster_id',
] as const;

/**
 * Calculate metadata completeness percentage
 *
 * @param entity - Movie or Series object
 * @param entityType - 'movie' or 'series'
 * @returns Completeness percentage (0-100)
 *
 * @example
 * // Complete movie
 * calculateCompleteness({
 *   title: "The Matrix",
 *   plot: "A hacker discovers...",
 *   tagline: "Welcome to the Real World",
 *   imdb_rating: 8.7,
 *   rotten_tomatoes_score: 88,
 *   metacritic_score: 73,
 *   release_date: "1999-03-31",
 *   runtime: 136,
 *   content_rating: "R",
 *   genres: ["Action", "Sci-Fi"],
 *   poster_url: "https://..."
 * }, 'movie') // 100
 *
 * @example
 * // Partial movie (only title and plot)
 * calculateCompleteness({
 *   title: "The Matrix",
 *   plot: "A hacker discovers..."
 * }, 'movie') // 18 (2/11 fields = 18.18%, rounded to 18)
 *
 * @example
 * // Empty movie
 * calculateCompleteness({}, 'movie') // 0
 */
export function calculateCompleteness(
  entity: Record<string, any>,
  entityType: 'movie' | 'series'
): number {
  const expectedFields = entityType === 'movie' ? EXPECTED_MOVIE_FIELDS : EXPECTED_SERIES_FIELDS;

  const filledFields = expectedFields.filter((field) => {
    const value = entity[field];

    // Check if value is non-null and non-empty
    if (value == null || value === '') {
      return false;
    }

    // Special handling for arrays (e.g., genres)
    if (Array.isArray(value)) {
      return value.length > 0;
    }

    return true;
  });

  return Math.round((filledFields.length / expectedFields.length) * 100);
}
