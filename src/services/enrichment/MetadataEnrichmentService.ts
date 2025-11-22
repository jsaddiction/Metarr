/**
 * Metadata Enrichment Service
 *
 * Fetches and aggregates metadata from multiple providers (OMDB + TMDB)
 * with intelligent field-level updates using "fill gaps, don't erase" logic.
 *
 * Features:
 * - Multi-provider metadata aggregation with provider priority (OMDB > TMDB)
 * - Respects field locks to preserve manual edits
 * - Two enrichment modes: requireComplete (bulk) vs best-effort (webhook/single)
 * - Automatic completeness calculation
 * - Rate limit detection and handling
 */

import { DatabaseConnection } from '../../types/database.js';
import { OMDBProvider } from '../providers/omdb/OMDBProvider.js';
import { TMDBClient } from '../providers/tmdb/TMDBClient.js';
import { shouldUpdateField } from '../../utils/fieldUpdate.js';
import { calculateCompleteness } from '../../utils/completeness.js';
import { logger } from '../../middleware/logging.js';
import { RateLimitError } from '../../errors/index.js';

/**
 * Result of enrichment operation
 */
export interface EnrichmentResult {
  /** Whether movie was updated */
  updated: boolean;
  /** Whether enrichment was partial due to rate limits */
  partial: boolean;
  /** List of providers that were rate limited */
  rateLimitedProviders: string[];
  /** Fields that were changed (only if updated=true) */
  changedFields?: string[];
  /** New completeness percentage (only if updated=true) */
  completeness?: number;
}

/**
 * Metadata from a single provider
 */
interface ProviderMetadata {
  provider: string;
  data: Record<string, any>;
  rateLimited: boolean;
}

/**
 * Movie row from database
 */
interface MovieRow {
  id: number;
  title: string;
  original_title?: string;
  plot?: string;
  outline?: string;
  tagline?: string;
  imdb_rating?: number;
  imdb_votes?: number;
  rotten_tomatoes_score?: number;
  metacritic_score?: number;
  awards?: string;
  release_date?: string;
  runtime?: number;
  content_rating?: string;
  director?: string;
  writer?: string;
  actors?: string;
  tmdb_id?: number;
  imdb_id?: string;
  title_locked: number;
  plot_locked: number;
  outline_locked: number;
  tagline_locked: number;
  content_rating_locked: number;
  release_date_locked: number;
  [key: string]: any; // Allow dynamic field access
}

export class MetadataEnrichmentService {
  constructor(
    private readonly db: DatabaseConnection,
    private readonly omdbProvider: OMDBProvider,
    private readonly tmdbClient: TMDBClient
  ) {}

  /**
   * Enrich a single movie with metadata from multiple providers
   *
   * @param movieId - Movie ID to enrich
   * @param requireComplete - If true, stop on ANY rate limit (bulk mode)
   *                          If false, use partial data (single/webhook mode)
   */
  async enrichMovie(movieId: number, requireComplete: boolean = false): Promise<EnrichmentResult> {
    try {
      // Step 1: Get current movie data
      const movie = await this.getMovie(movieId);
      if (!movie) {
        logger.warn('[MetadataEnrichment] Movie not found', { movieId });
        return {
          updated: false,
          partial: false,
          rateLimitedProviders: [],
        };
      }

      // Step 2: Fetch from all providers in parallel
      const responses = await this.fetchAllProviders(movie);

      // Step 3: Check for rate limits
      const rateLimited = responses.filter((r) => r.rateLimited).map((r) => r.provider);

      // BULK MODE: Stop if ANY provider rate-limited
      if (requireComplete && rateLimited.length > 0) {
        logger.info('[MetadataEnrichment] Bulk mode - skipping due to rate limit', {
          movieId,
          rateLimitedProviders: rateLimited,
        });

        return {
          updated: false,
          partial: false,
          rateLimitedProviders: rateLimited,
        };
      }

      // Step 4: Aggregate metadata with provider priority (OMDB > TMDB)
      const successful = responses.filter((r) => !r.rateLimited && r.data);

      if (successful.length === 0) {
        logger.warn('[MetadataEnrichment] All providers failed', { movieId });
        return {
          updated: false,
          partial: false,
          rateLimitedProviders: rateLimited,
        };
      }

      const aggregated = this.aggregateMetadata(successful);

      // Step 5: Apply "fill gaps, don't erase" logic
      const updates = this.buildUpdates(movie, aggregated);

      // Step 6: Update database if changes detected
      if (Object.keys(updates).length > 0) {
        await this.updateMovie(movieId, updates);

        // Update completeness
        const updatedMovie = { ...movie, ...updates };
        const completeness = calculateCompleteness(updatedMovie, 'movie');
        await this.updateCompleteness(movieId, completeness);

        logger.info('[MetadataEnrichment] Movie updated', {
          movieId,
          fieldsChanged: Object.keys(updates),
          completeness,
          rateLimited: rateLimited.length > 0,
        });

        return {
          updated: true,
          partial: rateLimited.length > 0,
          rateLimitedProviders: rateLimited,
          changedFields: Object.keys(updates),
          completeness,
        };
      }

      return {
        updated: false,
        partial: false,
        rateLimitedProviders: rateLimited,
      };
    } catch (error) {
      logger.error('[MetadataEnrichment] Enrichment failed', {
        movieId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Fetch metadata from all enabled providers in parallel
   */
  private async fetchAllProviders(movie: MovieRow): Promise<ProviderMetadata[]> {
    const results: ProviderMetadata[] = [];

    // Fetch OMDB (if IMDb ID exists)
    if (movie.imdb_id) {
      try {
        const omdbData = await this.omdbProvider.getMetadata({
          providerId: 'omdb',
          providerResultId: movie.imdb_id,
          entityType: 'movie',
        });

        // Transform OMDB metadata to our schema
        results.push({
          provider: 'omdb',
          data: this.normalizeOMDBData(omdbData.fields),
          rateLimited: false,
        });
      } catch (error) {
        if (error instanceof RateLimitError) {
          logger.warn('[MetadataEnrichment] OMDB rate limited', { movieId: movie.id });
          results.push({
            provider: 'omdb',
            data: {},
            rateLimited: true,
          });
        } else {
          logger.warn('[MetadataEnrichment] OMDB fetch failed', {
            movieId: movie.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    // Fetch TMDB (if TMDB ID exists)
    if (movie.tmdb_id) {
      try {
        const tmdbData = await this.tmdbClient.getMovie(movie.tmdb_id);

        results.push({
          provider: 'tmdb',
          data: this.normalizeTMDBData(tmdbData),
          rateLimited: false,
        });
      } catch (error) {
        if (error instanceof RateLimitError) {
          logger.warn('[MetadataEnrichment] TMDB rate limited', { movieId: movie.id });
          results.push({
            provider: 'tmdb',
            data: {},
            rateLimited: true,
          });
        } else {
          logger.warn('[MetadataEnrichment] TMDB fetch failed', {
            movieId: movie.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return results;
  }

  /**
   * Aggregate metadata with provider priority: OMDB > TMDB
   */
  private aggregateMetadata(responses: ProviderMetadata[]): Record<string, any> {
    const PROVIDER_PRIORITY = ['omdb', 'tmdb'];
    const FIELDS = [
      'title',
      'plot',
      'outline',
      'tagline',
      'imdb_rating',
      'imdb_votes',
      'rotten_tomatoes_score',
      'metacritic_score',
      'awards',
      'release_date',
      'runtime',
      'content_rating',
      'director',
      'writer',
      'actors',
    ];

    const result: Record<string, any> = {};

    for (const field of FIELDS) {
      // Try providers in priority order
      for (const providerId of PROVIDER_PRIORITY) {
        const provider = responses.find((r) => r.provider === providerId);
        const value = provider?.data?.[field];

        // Found non-empty value → use it
        if (value != null && value !== '') {
          result[field] = value;
          break; // Move to next field
        }
      }
    }

    return result;
  }

  /**
   * Build update object using shouldUpdateField logic
   */
  private buildUpdates(currentMovie: MovieRow, newMetadata: Record<string, any>): Record<string, any> {
    const updates: Record<string, any> = {};

    for (const [field, newValue] of Object.entries(newMetadata)) {
      const currentValue = currentMovie[field];
      const fieldLocked = currentMovie[`${field}_locked`] === 1;

      if (shouldUpdateField(currentValue, newValue, fieldLocked)) {
        updates[field] = newValue;
      }
    }

    return updates;
  }

  /**
   * Get movie from database
   */
  private async getMovie(movieId: number): Promise<MovieRow | null> {
    const result = await this.db.get<MovieRow>('SELECT * FROM movies WHERE id = ?', [movieId]);
    return result || null;
  }

  /**
   * Update movie fields in database
   */
  private async updateMovie(movieId: number, updates: Record<string, any>): Promise<void> {
    const fields = Object.keys(updates);
    const values = Object.values(updates);
    const placeholders = fields.map((f) => `${f} = ?`).join(', ');

    await this.db.execute(
      `UPDATE movies SET ${placeholders}, last_enrichment_date = ? WHERE id = ?`,
      [...values, new Date().toISOString(), movieId]
    );
  }

  /**
   * Update completeness percentage
   */
  private async updateCompleteness(movieId: number, completeness: number): Promise<void> {
    await this.db.execute('UPDATE movies SET completeness_pct = ? WHERE id = ?', [
      completeness,
      movieId,
    ]);
  }

  /**
   * Normalize OMDB metadata fields to our schema
   */
  private normalizeOMDBData(fields: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};

    // Title
    if (fields.title) result.title = fields.title;

    // Plot (OMDB calls it 'plot')
    if (fields.plot) result.plot = fields.plot;

    // Outline (OMDB provides this as 'outline')
    if (fields.outline) result.outline = fields.outline;

    // Tagline (not provided by OMDB)

    // Release date
    if (fields.releaseDate) result.release_date = fields.releaseDate;

    // Runtime (OMDB provides in minutes)
    if (fields.runtime) result.runtime = fields.runtime;

    // Content rating (OMDB calls it 'certification')
    if (fields.certification) result.content_rating = fields.certification;

    // Awards
    if (fields.awards) result.awards = fields.awards;

    // Directors
    if (fields.directors && Array.isArray(fields.directors)) {
      result.director = fields.directors.join(', ');
    }

    // Writers
    if (fields.writers && Array.isArray(fields.writers)) {
      result.writer = fields.writers.join(', ');
    }

    // Actors
    if (fields.actors && Array.isArray(fields.actors)) {
      result.actors = fields.actors.join(', ');
    }

    // Ratings (OMDB provides structured ratings array)
    if (fields.ratings && Array.isArray(fields.ratings)) {
      for (const rating of fields.ratings) {
        if (rating.source === 'imdb') {
          result.imdb_rating = rating.value;
          if (rating.votes) result.imdb_votes = rating.votes;
        } else if (rating.source === 'rottentomatoes') {
          result.rotten_tomatoes_score = rating.value;
        } else if (rating.source === 'metacritic') {
          result.metacritic_score = rating.value;
        }
      }
    }

    return result;
  }

  /**
   * Normalize TMDB metadata to our schema
   */
  private normalizeTMDBData(tmdbData: any): Record<string, any> {
    const result: Record<string, any> = {};

    // Title
    if (tmdbData.title) result.title = tmdbData.title;

    // Plot (TMDB calls it 'overview')
    if (tmdbData.overview) result.plot = tmdbData.overview;

    // Tagline
    if (tmdbData.tagline) result.tagline = tmdbData.tagline;

    // Release date
    if (tmdbData.release_date) result.release_date = tmdbData.release_date;

    // Runtime
    if (tmdbData.runtime) result.runtime = tmdbData.runtime;

    // Content rating (from release_dates)
    if (tmdbData.release_dates?.results) {
      // Look for US certification first
      const usRelease = tmdbData.release_dates.results.find((r: any) => r.iso_3166_1 === 'US');
      if (usRelease?.release_dates?.[0]?.certification) {
        result.content_rating = usRelease.release_dates[0].certification;
      }
    }

    // TMDB doesn't provide:
    // - outline (short plot)
    // - imdb_rating
    // - rotten_tomatoes_score
    // - metacritic_score
    // - awards
    // - director (in credits, handled separately)
    // - writer (in credits, handled separately)
    // - actors (in credits, handled separately)

    return result;
  }
}
