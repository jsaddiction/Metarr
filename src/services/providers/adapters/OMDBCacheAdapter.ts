/**
 * OMDB Cache Adapter
 *
 * Normalizes OMDB API responses and stores them in the provider cache.
 *
 * Responsibilities:
 * 1. Fetch data from OMDB (by IMDb ID)
 * 2. Normalize data to our schema
 * 3. UPDATE existing cache records with OMDB-specific fields
 * 4. Return movie cache ID
 *
 * OMDB-specific fields:
 * - outline (short plot)
 * - IMDb ratings (authoritative)
 * - Rotten Tomatoes scores
 * - Metacritic scores
 * - Awards information
 *
 * Note: OMDB updates existing cache records rather than creating new ones.
 * It enriches data created by TMDB adapter with additional metadata.
 */

import { DatabaseConnection } from '../../../types/database.js';
import { OMDBClient } from '../omdb/OMDBClient.js';
import { OMDBMovieData } from '../../../types/providers/omdb.js';
import { logger } from '../../../middleware/logging.js';
import { MovieLookupParams } from '../../../types/providerCache.js';

export class OMDBCacheAdapter {
  constructor(
    private db: DatabaseConnection,
    private omdbClient: OMDBClient
  ) {}

  /**
   * Fetch movie from OMDB and update cache
   *
   * @param params - Lookup params (must have imdb_id)
   * @returns Cache movie ID (provider_cache_movies.id) or null if not found
   */
  async fetchAndUpdate(params: MovieLookupParams): Promise<number | null> {
    try {
      // OMDB requires IMDb ID
      if (!params.imdb_id) {
        logger.debug('[OMDBCacheAdapter] No IMDb ID provided, skipping OMDB fetch');
        return null;
      }

      // Step 1: Fetch from OMDB
      const omdbData = await this.fetchFromOMDB(params.imdb_id);
      if (!omdbData) return null;

      // Step 2: Find or create cache record
      const movieCacheId = await this.findOrCreateCacheRecord(params);
      if (!movieCacheId) {
        logger.warn('[OMDBCacheAdapter] No cache record found to update', {
          imdbId: params.imdb_id,
        });
        return null;
      }

      // Step 3: Update cache with OMDB data
      await this.updateMovieCache(movieCacheId, omdbData);

      logger.info('[OMDBCacheAdapter] Movie cache updated with OMDB data', {
        imdbId: params.imdb_id,
        movieCacheId,
        title: omdbData.Title,
      });

      return movieCacheId;
    } catch (error) {
      logger.error('[OMDBCacheAdapter] Failed to fetch and update movie', {
        params,
        error: error instanceof Error ? error.message : error,
      });
      return null;
    }
  }

  /**
   * Fetch complete movie data from OMDB
   */
  private async fetchFromOMDB(imdbId: string): Promise<OMDBMovieData | null> {
    try {
      const movie = await this.omdbClient.getById(imdbId);
      return movie;
    } catch (error) {
      logger.warn('[OMDBCacheAdapter] Failed to fetch from OMDB', {
        imdbId,
        error: error instanceof Error ? error.message : error,
      });
      return null;
    }
  }

  /**
   * Find existing cache record or create one if TMDB hasn't cached it yet
   */
  private async findOrCreateCacheRecord(params: MovieLookupParams): Promise<number | null> {
    // Try to find by IMDb ID
    if (params.imdb_id) {
      const rows = await this.db.query<{ id: number }>(
        'SELECT id FROM provider_cache_movies WHERE imdb_id = ?',
        [params.imdb_id]
      );
      if (rows.length > 0) {
        return rows[0].id;
      }
    }

    // Try to find by TMDB ID
    if (params.tmdb_id) {
      const rows = await this.db.query<{ id: number }>(
        'SELECT id FROM provider_cache_movies WHERE tmdb_id = ?',
        [params.tmdb_id]
      );
      if (rows.length > 0) {
        return rows[0].id;
      }
    }

    // No existing record found
    return null;
  }

  /**
   * Update cache record with OMDB-specific data
   */
  private async updateMovieCache(movieCacheId: number, omdbData: OMDBMovieData): Promise<void> {
    // Extract IMDb rating and votes
    const imdbRating = omdbData.imdbRating && omdbData.imdbRating !== 'N/A'
      ? parseFloat(omdbData.imdbRating)
      : null;

    const imdbVotes = omdbData.imdbVotes && omdbData.imdbVotes !== 'N/A'
      ? parseInt(omdbData.imdbVotes.replace(/,/g, ''), 10)
      : null;

    // Extract outline (short plot)
    const outline = omdbData.Outline && omdbData.Outline !== 'N/A'
      ? omdbData.Outline
      : null;

    // Update the cache record
    await this.db.execute(
      `UPDATE provider_cache_movies
       SET
         outline = COALESCE(?, outline),
         imdb_rating = COALESCE(?, imdb_rating),
         imdb_votes = COALESCE(?, imdb_votes),
         fetched_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [outline, imdbRating, imdbVotes, movieCacheId]
    );

    logger.debug('[OMDBCacheAdapter] Updated cache record', {
      movieCacheId,
      outline: outline ? 'yes' : 'no',
      imdbRating,
      imdbVotes,
    });
  }
}
