import { DatabaseConnection } from '../types/database.js';
import { TMDBClient } from './providers/tmdb/TMDBClient.js';
import { logger } from '../middleware/logging.js';
import { EnrichmentConfig } from '../config/types.js';

/**
 * Enrichment Decision Service
 *
 * Determines whether an entity needs to be re-enriched by checking:
 * 1. Has it ever been scraped?
 * 2. How old is the data?
 * 3. Have there been changes on TMDB since last scrape?
 *
 * This service optimizes API usage by avoiding unnecessary re-scrapes.
 */

export interface EnrichmentDecision {
  shouldEnrich: boolean;
  reason: string;
  changedFields?: string[];
}

export class EnrichmentDecisionService {
  private db: DatabaseConnection;
  private config: EnrichmentConfig;

  constructor(db: DatabaseConnection, config: EnrichmentConfig) {
    this.db = db;
    this.config = config;
  }

  /**
   * Determine if a movie should be enriched
   */
  async shouldEnrichMovie(
    movieId: number,
    tmdbClient?: TMDBClient
  ): Promise<EnrichmentDecision> {
    try {
      // Get movie data
      const movies = await this.db.query<{
        id: number;
        tmdb_id: number | null;
        last_scraped_at: string | null;
        enriched_at: string | null;
      }>(
        `SELECT id, tmdb_id, last_scraped_at, enriched_at
         FROM movies
         WHERE id = ?`,
        [movieId]
      );

      if (movies.length === 0) {
        return {
          shouldEnrich: false,
          reason: 'movie_not_found',
        };
      }

      const movie = movies[0];

      // No TMDB ID? Can't check for changes
      if (!movie.tmdb_id) {
        return {
          shouldEnrich: true,
          reason: 'no_tmdb_id_available',
        };
      }

      // Never scraped? Always enrich
      if (!movie.last_scraped_at) {
        return {
          shouldEnrich: true,
          reason: 'never_scraped',
        };
      }

      const lastScrapedDate = new Date(movie.last_scraped_at);
      const now = new Date();
      const daysSinceLastScrape = this.daysBetween(lastScrapedDate, now);

      // Very old data? Force re-scrape regardless of changes
      if (daysSinceLastScrape >= this.config.forceRescrapeAfterDays) {
        logger.info('Data is stale, forcing re-scrape', {
          movieId,
          daysSinceLastScrape,
          threshold: this.config.forceRescrapeAfterDays,
        });
        return {
          shouldEnrich: true,
          reason: `data_stale_${daysSinceLastScrape}_days`,
        };
      }

      // Recent data? Check for changes if enabled
      if (
        this.config.enableChangeDetection &&
        this.config.checkForChanges &&
        tmdbClient &&
        daysSinceLastScrape < this.config.staleDataThresholdDays
      ) {
        try {
          logger.debug('Checking TMDB for changes', {
            movieId,
            tmdbId: movie.tmdb_id,
            lastScrapedAt: movie.last_scraped_at,
          });

          const changes = await tmdbClient.getMovieChanges(
            movie.tmdb_id,
            lastScrapedDate
          );

          if (!changes.hasChanges) {
            logger.info('No changes detected on TMDB, skipping enrichment', {
              movieId,
              tmdbId: movie.tmdb_id,
              daysSinceLastScrape,
            });
            return {
              shouldEnrich: false,
              reason: 'no_changes_since_last_scrape',
            };
          }

          logger.info('Changes detected on TMDB', {
            movieId,
            tmdbId: movie.tmdb_id,
            changedFields: changes.changedFields,
            lastChangeDate: changes.lastChangeDate,
          });

          return {
            shouldEnrich: true,
            reason: `changes_detected: ${changes.changedFields.join(', ')}`,
            changedFields: changes.changedFields,
          };
        } catch (error: any) {
          // If change detection fails, scrape anyway to be safe
          logger.warn('Change detection failed, defaulting to re-scrape', {
            movieId,
            tmdbId: movie.tmdb_id,
            error: error.message,
          });
          return {
            shouldEnrich: true,
            reason: 'change_detection_failed',
          };
        }
      }

      // Data is somewhat old but not stale yet, scrape it
      if (daysSinceLastScrape >= this.config.staleDataThresholdDays) {
        return {
          shouldEnrich: true,
          reason: `data_aged_${daysSinceLastScrape}_days`,
        };
      }

      // Data is recent and change detection disabled, skip
      return {
        shouldEnrich: false,
        reason: `recently_scraped_${daysSinceLastScrape}_days_ago`,
      };
    } catch (error: any) {
      logger.error('Error in shouldEnrichMovie', {
        movieId,
        error: error.message,
      });
      // On error, default to enriching
      return {
        shouldEnrich: true,
        reason: 'error_checking_status',
      };
    }
  }

  /**
   * Calculate days between two dates
   */
  private daysBetween(date1: Date, date2: Date): number {
    const msPerDay = 1000 * 60 * 60 * 24;
    const diff = date2.getTime() - date1.getTime();
    return Math.floor(diff / msPerDay);
  }

  /**
   * Update last_scraped_at timestamp for a movie
   */
  async updateLastScrapedAt(movieId: number): Promise<void> {
    try {
      await this.db.execute(
        `UPDATE movies SET last_scraped_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [movieId]
      );
      logger.debug('Updated last_scraped_at for movie', { movieId });
    } catch (error: any) {
      logger.error('Error updating last_scraped_at', {
        movieId,
        error: error.message,
      });
    }
  }

  /**
   * Similar methods for series and episodes can be added here
   */
  async shouldEnrichSeries(
    seriesId: number,
    _tmdbClient?: TMDBClient
  ): Promise<EnrichmentDecision> {
    // TODO: Implement series change detection
    // For now, use simple time-based logic
    try {
      const series = await this.db.query<{
        id: number;
        tmdb_id: number | null;
        last_scraped_at: string | null;
      }>(
        `SELECT id, tmdb_id, last_scraped_at
         FROM series
         WHERE id = ?`,
        [seriesId]
      );

      if (series.length === 0) {
        return { shouldEnrich: false, reason: 'series_not_found' };
      }

      const s = series[0];

      if (!s.last_scraped_at) {
        return { shouldEnrich: true, reason: 'never_scraped' };
      }

      const daysSince = this.daysBetween(new Date(s.last_scraped_at), new Date());

      if (daysSince >= this.config.forceRescrapeAfterDays) {
        return { shouldEnrich: true, reason: `data_stale_${daysSince}_days` };
      }

      return { shouldEnrich: false, reason: `recently_scraped_${daysSince}_days_ago` };
    } catch (error: any) {
      return { shouldEnrich: true, reason: 'error_checking_status' };
    }
  }

  async updateSeriesLastScrapedAt(seriesId: number): Promise<void> {
    try {
      await this.db.execute(
        `UPDATE series SET last_scraped_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [seriesId]
      );
    } catch (error: any) {
      logger.error('Error updating last_scraped_at for series', {
        seriesId,
        error: error.message,
      });
    }
  }
}
