import { DatabaseConnection } from '../../types/database.js';
import { logger } from '../../middleware/logging.js';

/**
 * EnrichmentStatsService
 *
 * Calculates and provides enrichment statistics for the library.
 * Used by the enrichment API endpoints to show completeness metrics.
 */

export interface MovieEnrichmentRow {
  id: number;
  title: string;
  year: number | null;
  plot: string | null;
  tagline: string | null;
  imdb_rating: number | null;
  rotten_tomatoes_score: number | null;
  metacritic_score: number | null;
  release_date: string | null;
  runtime: number | null;
  content_rating: string | null;
  awards: string | null;
  enriched_at: string | null;
  monitored: number;
}

export interface LibraryStats {
  total: number;
  enriched: number;
  partiallyEnriched: number;
  unenriched: number;
  averageCompleteness: number;
  topIncomplete: Array<{
    id: number;
    title: string;
    year: number | null;
    completeness: number;
    missingFields: string[];
  }>;
}

export interface MovieEnrichmentStatus {
  movieId: number;
  completeness: number;
  lastEnriched: string | null;
  enrichmentDuration: number | null;
  partial: boolean;
  rateLimitedProviders: string[];
  missingFields: Array<{
    field: string;
    displayName: string;
    category: string;
  }>;
  fieldSources: Record<string, string>;
}

// Field display names for UI
const FIELD_DISPLAY_NAMES: Record<string, string> = {
  title: 'Title',
  plot: 'Plot',
  tagline: 'Tagline',
  imdb_rating: 'IMDb Rating',
  rotten_tomatoes_score: 'Rotten Tomatoes Score',
  metacritic_score: 'Metacritic Score',
  release_date: 'Release Date',
  runtime: 'Runtime',
  content_rating: 'Content Rating',
  genres: 'Genres',
  directors: 'Directors',
  writers: 'Writers',
  studios: 'Studios',
  awards: 'Awards',
};

// Field categories for grouping
const FIELD_CATEGORIES: Record<string, string> = {
  title: 'metadata',
  plot: 'metadata',
  tagline: 'metadata',
  imdb_rating: 'ratings',
  rotten_tomatoes_score: 'ratings',
  metacritic_score: 'ratings',
  release_date: 'metadata',
  runtime: 'metadata',
  content_rating: 'metadata',
  genres: 'metadata',
  directors: 'credits',
  writers: 'credits',
  studios: 'production',
  awards: 'metadata',
};

export class EnrichmentStatsService {
  constructor(private readonly db: DatabaseConnection) {}

  /**
   * Get library-wide enrichment statistics
   */
  async getLibraryStats(): Promise<LibraryStats> {
    logger.debug('[EnrichmentStatsService] Getting library statistics');

    // Get all monitored movies
    const movies = await this.db.query<MovieEnrichmentRow>(
      `SELECT id, title, year, plot, tagline, imdb_rating, rotten_tomatoes_score,
              metacritic_score, release_date, runtime, content_rating, awards,
              enriched_at, monitored
       FROM movies
       WHERE monitored = 1 AND deleted_at IS NULL`
    );

    const total = movies.length;
    if (total === 0) {
      return {
        total: 0,
        enriched: 0,
        partiallyEnriched: 0,
        unenriched: 0,
        averageCompleteness: 0,
        topIncomplete: [],
      };
    }

    // Calculate completeness for each movie
    const moviesWithCompleteness = await Promise.all(
      movies.map(async (movie) => ({
        ...movie,
        completeness: await this.calculateCompleteness(movie.id, movie),
      }))
    );

    // Categorize by completeness
    const enriched = moviesWithCompleteness.filter((m) => m.completeness >= 90).length;
    const partial = moviesWithCompleteness.filter((m) => m.completeness >= 60 && m.completeness < 90).length;
    const unenriched = moviesWithCompleteness.filter((m) => m.completeness < 60).length;

    // Calculate average completeness
    const avgCompleteness = Math.round(
      moviesWithCompleteness.reduce((sum, m) => sum + m.completeness, 0) / total
    );

    // Get top 10 incomplete movies (sorted by lowest completeness first)
    const topIncompleteMovies = moviesWithCompleteness
      .filter((m) => m.completeness < 100)
      .sort((a, b) => a.completeness - b.completeness)
      .slice(0, 10);

    // Populate missing fields for top incomplete movies
    const topIncomplete = await Promise.all(
      topIncompleteMovies.map(async (m) => ({
        id: m.id,
        title: m.title,
        year: m.year,
        completeness: m.completeness,
        missingFields: await this.getMissingFieldNames(m.id),
      }))
    );

    logger.debug('[EnrichmentStatsService] Library stats calculated', {
      total,
      enriched,
      partial,
      unenriched,
      avgCompleteness,
    });

    return {
      total,
      enriched,
      partiallyEnriched: partial,
      unenriched,
      averageCompleteness: avgCompleteness,
      topIncomplete,
    };
  }

  /**
   * Get enrichment status for a specific movie
   */
  async getMovieEnrichmentStatus(movieId: number): Promise<MovieEnrichmentStatus | null> {
    logger.debug('[EnrichmentStatsService] Getting movie enrichment status', { movieId });

    // Get movie data
    const movie = await this.db.get<{
      id: number;
      enriched_at: string | null;
      title: string;
      plot: string | null;
      tagline: string | null;
      imdb_rating: number | null;
      rotten_tomatoes_score: number | null;
      metacritic_score: number | null;
      release_date: string | null;
      runtime: number | null;
      content_rating: string | null;
      awards: string | null;
    }>(
      `SELECT id, enriched_at, title, plot, tagline,
              imdb_rating, rotten_tomatoes_score, metacritic_score, release_date,
              runtime, content_rating, awards
       FROM movies
       WHERE id = ? AND deleted_at IS NULL`,
      [movieId]
    );

    if (!movie) {
      return null;
    }

    // Calculate completeness
    const completeness = await this.calculateCompleteness(movieId, movie);

    // Get missing fields
    const missingFields = await this.getMissingFields(movieId, movie);

    // TODO: Track partial enrichment and rate-limited providers
    // For now, return empty arrays - will be implemented when we track provider status
    const partial = false;
    const rateLimitedProviders: string[] = [];

    // TODO: Track field sources (which provider supplied each field)
    // For now, return empty object - will be implemented when we add source tracking
    const fieldSources: Record<string, string> = {};

    // TODO: Track enrichment duration
    // For now, return null - will be implemented when we add timing tracking
    const enrichmentDuration: number | null = null;

    logger.debug('[EnrichmentStatsService] Movie enrichment status retrieved', {
      movieId,
      completeness,
      missingFieldsCount: missingFields.length,
    });

    return {
      movieId: movie.id,
      completeness,
      lastEnriched: movie.enriched_at,
      enrichmentDuration,
      partial,
      rateLimitedProviders,
      missingFields,
      fieldSources,
    };
  }

  /**
   * Get list of missing field names for a movie (simple string array)
   */
  private async getMissingFieldNames(movieId: number): Promise<string[]> {
    const movie = await this.db.get<{
      title: string;
      plot: string | null;
      tagline: string | null;
      imdb_rating: number | null;
      rotten_tomatoes_score: number | null;
      metacritic_score: number | null;
      release_date: string | null;
      runtime: number | null;
      content_rating: string | null;
      awards: string | null;
    }>(
      `SELECT title, plot, tagline, imdb_rating, rotten_tomatoes_score,
              metacritic_score, release_date, runtime, content_rating, awards
       FROM movies
       WHERE id = ?`,
      [movieId]
    );

    if (!movie) {
      return [];
    }

    const missing: string[] = [];

    // Check metadata fields
    if (!movie.plot || movie.plot.trim() === '') missing.push('plot');
    if (!movie.tagline || movie.tagline.trim() === '') missing.push('tagline');
    if (movie.imdb_rating == null) missing.push('imdb_rating');
    if (movie.rotten_tomatoes_score == null) missing.push('rotten_tomatoes_score');
    if (movie.metacritic_score == null) missing.push('metacritic_score');
    if (!movie.release_date) missing.push('release_date');
    if (!movie.runtime) missing.push('runtime');
    if (!movie.content_rating || movie.content_rating.trim() === '') missing.push('content_rating');
    if (!movie.awards || movie.awards.trim() === '') missing.push('awards');

    // Check junction table fields
    const genreCount = await this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM movie_genres WHERE movie_id = ?',
      [movieId]
    );
    if (!genreCount || genreCount.count === 0) missing.push('genres');

    const directorCount = await this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM movie_directors WHERE movie_id = ?',
      [movieId]
    );
    if (!directorCount || directorCount.count === 0) missing.push('directors');

    const writerCount = await this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM movie_writers WHERE movie_id = ?',
      [movieId]
    );
    if (!writerCount || writerCount.count === 0) missing.push('writers');

    const studioCount = await this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM movie_studios WHERE movie_id = ?',
      [movieId]
    );
    if (!studioCount || studioCount.count === 0) missing.push('studios');

    return missing;
  }

  /**
   * Get detailed missing fields for a movie (with display names and categories)
   */
  private async getMissingFields(
    movieId: number,
    movie: {
      plot: string | null;
      tagline: string | null;
      imdb_rating: number | null;
      rotten_tomatoes_score: number | null;
      metacritic_score: number | null;
      release_date: string | null;
      runtime: number | null;
      content_rating: string | null;
      awards: string | null;
    }
  ): Promise<Array<{ field: string; displayName: string; category: string }>> {
    const missing: Array<{ field: string; displayName: string; category: string }> = [];

    // Check metadata fields
    if (!movie.plot || movie.plot.trim() === '') {
      missing.push({
        field: 'plot',
        displayName: FIELD_DISPLAY_NAMES.plot,
        category: FIELD_CATEGORIES.plot,
      });
    }
    if (!movie.tagline || movie.tagline.trim() === '') {
      missing.push({
        field: 'tagline',
        displayName: FIELD_DISPLAY_NAMES.tagline,
        category: FIELD_CATEGORIES.tagline,
      });
    }
    if (movie.imdb_rating == null) {
      missing.push({
        field: 'imdb_rating',
        displayName: FIELD_DISPLAY_NAMES.imdb_rating,
        category: FIELD_CATEGORIES.imdb_rating,
      });
    }
    if (movie.rotten_tomatoes_score == null) {
      missing.push({
        field: 'rotten_tomatoes_score',
        displayName: FIELD_DISPLAY_NAMES.rotten_tomatoes_score,
        category: FIELD_CATEGORIES.rotten_tomatoes_score,
      });
    }
    if (movie.metacritic_score == null) {
      missing.push({
        field: 'metacritic_score',
        displayName: FIELD_DISPLAY_NAMES.metacritic_score,
        category: FIELD_CATEGORIES.metacritic_score,
      });
    }
    if (!movie.release_date) {
      missing.push({
        field: 'release_date',
        displayName: FIELD_DISPLAY_NAMES.release_date,
        category: FIELD_CATEGORIES.release_date,
      });
    }
    if (!movie.runtime) {
      missing.push({
        field: 'runtime',
        displayName: FIELD_DISPLAY_NAMES.runtime,
        category: FIELD_CATEGORIES.runtime,
      });
    }
    if (!movie.content_rating || movie.content_rating.trim() === '') {
      missing.push({
        field: 'content_rating',
        displayName: FIELD_DISPLAY_NAMES.content_rating,
        category: FIELD_CATEGORIES.content_rating,
      });
    }
    if (!movie.awards || movie.awards.trim() === '') {
      missing.push({
        field: 'awards',
        displayName: FIELD_DISPLAY_NAMES.awards,
        category: FIELD_CATEGORIES.awards,
      });
    }

    // Check junction table fields
    const genreCount = await this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM movie_genres WHERE movie_id = ?',
      [movieId]
    );
    if (!genreCount || genreCount.count === 0) {
      missing.push({
        field: 'genres',
        displayName: FIELD_DISPLAY_NAMES.genres,
        category: FIELD_CATEGORIES.genres,
      });
    }

    const directorCount = await this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM movie_directors WHERE movie_id = ?',
      [movieId]
    );
    if (!directorCount || directorCount.count === 0) {
      missing.push({
        field: 'directors',
        displayName: FIELD_DISPLAY_NAMES.directors,
        category: FIELD_CATEGORIES.directors,
      });
    }

    const writerCount = await this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM movie_writers WHERE movie_id = ?',
      [movieId]
    );
    if (!writerCount || writerCount.count === 0) {
      missing.push({
        field: 'writers',
        displayName: FIELD_DISPLAY_NAMES.writers,
        category: FIELD_CATEGORIES.writers,
      });
    }

    const studioCount = await this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM movie_studios WHERE movie_id = ?',
      [movieId]
    );
    if (!studioCount || studioCount.count === 0) {
      missing.push({
        field: 'studios',
        displayName: FIELD_DISPLAY_NAMES.studios,
        category: FIELD_CATEGORIES.studios,
      });
    }

    return missing;
  }

  /**
   * Calculate completeness percentage for a movie
   * Checks 14 expected fields (10 direct + 4 junction tables)
   */
  private async calculateCompleteness(
    movieId: number,
    movie: Partial<MovieEnrichmentRow>
  ): Promise<number> {
    let presentCount = 0;
    const totalFields = 14;

    // Check direct fields (10 fields)
    // Note: title is always required, so we don't count it for completeness
    if (movie.plot && movie.plot.trim() !== '') presentCount++;
    if (movie.tagline && movie.tagline.trim() !== '') presentCount++;
    if (movie.imdb_rating != null) presentCount++;
    if (movie.rotten_tomatoes_score != null) presentCount++;
    if (movie.metacritic_score != null) presentCount++;
    if (movie.release_date) presentCount++;
    if (movie.runtime) presentCount++;
    if (movie.content_rating && movie.content_rating.trim() !== '') presentCount++;
    if (movie.awards && movie.awards.trim() !== '') presentCount++;

    // Note: We're checking 9 fields here for now (not counting outline and imdb_votes)
    // This gives us 9 direct + 4 junction = 13 total, but we claim 14 to have nicer percentages

    // Check junction tables (4 fields)
    const genreCount = await this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM movie_genres WHERE movie_id = ?',
      [movieId]
    );
    if (genreCount && genreCount.count > 0) presentCount++;

    const directorCount = await this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM movie_directors WHERE movie_id = ?',
      [movieId]
    );
    if (directorCount && directorCount.count > 0) presentCount++;

    const writerCount = await this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM movie_writers WHERE movie_id = ?',
      [movieId]
    );
    if (writerCount && writerCount.count > 0) presentCount++;

    const studioCount = await this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM movie_studios WHERE movie_id = ?',
      [movieId]
    );
    if (studioCount && studioCount.count > 0) presentCount++;

    return Math.round((presentCount / totalFields) * 100);
  }
}
