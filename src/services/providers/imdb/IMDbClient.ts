/**
 * IMDb Web Scraping Client
 *
 * LEGAL DISCLAIMER:
 * This module scrapes data from IMDb.com, which violates IMDb's Terms of Service.
 * IMDb explicitly prohibits: "data mining, robots, screen scraping, or similar data
 * gathering and extraction tools on this site, except with our express written consent."
 *
 * This implementation is provided for:
 * - Educational purposes
 * - Personal, non-commercial use only
 * - Users who accept full legal responsibility
 *
 * By using this provider, you acknowledge that:
 * - You are responsible for compliance with IMDb's ToS
 * - This may violate IMDb's legal terms
 * - IMDb may block or ban your IP address
 * - The developers of Metarr assume no liability
 *
 * Consider using official APIs or datasets where available.
 */

import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import { logger } from '../../../middleware/logging.js';
import { getErrorMessage } from '../../../utils/errorHandling.js';
import { CircuitBreaker } from '../utils/CircuitBreaker.js';
import { RetryStrategy, NETWORK_RETRY_POLICY } from '../../../errors/index.js';
import { NetworkError, ProviderError, ErrorCode } from '../../../errors/index.js';

export interface IMDbSearchResult {
  imdbId: string;
  title: string;
  year?: number;
  type: 'movie' | 'tvSeries' | 'tvEpisode';
  imageUrl?: string;
}

export interface IMDbMovieDetails {
  imdbId: string;
  title: string;
  originalTitle?: string;
  year?: number;
  rating?: number;
  voteCount?: number;
  plot?: string;
  tagline?: string;
  genres?: string[];
  directors?: string[];
  writers?: string[];
  cast?: Array<{ name: string; character?: string }>;
  runtime?: number; // minutes
  releaseDate?: string;
  countries?: string[];
  languages?: string[];
  certification?: string;
  studios?: string[];
}

export interface IMDbSeriesDetails extends Omit<IMDbMovieDetails, 'runtime'> {
  type: 'tvSeries';
  seasons?: number;
  episodes?: number;
  premiered?: string;
  status?: 'ongoing' | 'ended';
}

export class IMDbClient {
  private client: AxiosInstance;
  private circuitBreaker: CircuitBreaker;
  private retryStrategy: RetryStrategy;
  private baseUrl = 'https://www.imdb.com';

  constructor() {
    this.circuitBreaker = new CircuitBreaker({
      threshold: 5,
      resetTimeoutMs: 5 * 60 * 1000,
      providerName: 'IMDb',
    });

    this.retryStrategy = new RetryStrategy({
      ...NETWORK_RETRY_POLICY,
      onRetry: (error, attemptNumber, delayMs) => {
        logger.info('Retrying IMDb request', {
          error: error.message,
          attemptNumber,
          delayMs,
        });
      },
    });

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'max-age=0',
        Connection: 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
      },
    });

    logger.warn('IMDb scraping client initialized - this violates IMDb ToS');
  }

  /**
   * Convert Axios errors to ApplicationError types
   */
  private convertToApplicationError(
    error: unknown,
    operation: string,
    metadata: Record<string, unknown>
  ): NetworkError | ProviderError {
    if (axios.isAxiosError(error)) {
      const statusCode = error.response?.status;

      if (statusCode === 429) {
        return new ProviderError(
          `Rate limit exceeded`,
          'IMDb',
          ErrorCode.PROVIDER_RATE_LIMIT,
          429,
          true,
          { service: 'IMDbClient', operation, metadata }
        );
      }

      if (statusCode && statusCode >= 500) {
        return new ProviderError(
          `Server error: ${statusCode}`,
          'IMDb',
          ErrorCode.PROVIDER_SERVER_ERROR,
          statusCode,
          true,
          { service: 'IMDbClient', operation, metadata }
        );
      }

      return new NetworkError(
        `Request failed: ${error.message}`,
        ErrorCode.NETWORK_CONNECTION_FAILED,
        undefined,
        { service: 'IMDbClient', operation, metadata },
        error
      );
    }

    return new NetworkError(
      `Unexpected error: ${getErrorMessage(error)}`,
      ErrorCode.NETWORK_CONNECTION_FAILED,
      undefined,
      { service: 'IMDbClient', operation, metadata },
      error instanceof Error ? error : undefined
    );
  }

  /**
   * Search for movies/series by title
   */
  async search(query: string, type?: 'movie' | 'tv'): Promise<IMDbSearchResult[]> {
    return this.circuitBreaker.execute(async () => {
      return this.retryStrategy.execute(async () => {
        try {
      const params = new URLSearchParams({
        q: query,
        s: 'tt', // Search titles only
      });

      if (type === 'movie') {
        params.append('ttype', 'ft'); // Feature film
      } else if (type === 'tv') {
        params.append('ttype', 'tv'); // TV series
      }

      const response = await this.client.get(`/find?${params.toString()}`);
      const $ = cheerio.load(response.data);

      const results: IMDbSearchResult[] = [];

      // Parse search results from the find page
      $('.ipc-metadata-list-summary-item').each((_index, element) => {
        const $item = $(element);

        // Extract IMDb ID from link
        const href = $item.find('a.ipc-metadata-list-summary-item__t').attr('href');
        const idMatch = href?.match(/\/title\/(tt\d+)\//);
        if (!idMatch) return;

        const imdbId = idMatch[1];
        const title = $item.find('.ipc-metadata-list-summary-item__t').text().trim();

        // Extract year
        const metadata = $item.find('.ipc-metadata-list-summary-item__li').first().text();
        const yearMatch = metadata?.match(/(\d{4})/);
        const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

        // Determine type from metadata
        const typeText = metadata?.toLowerCase() || '';
        let itemType: 'movie' | 'tvSeries' | 'tvEpisode' = 'movie';
        if (typeText.includes('tv series')) {
          itemType = 'tvSeries';
        } else if (typeText.includes('tv episode')) {
          itemType = 'tvEpisode';
        }

        // Extract image
        const imageUrl = $item.find('img.ipc-image').attr('src');

        results.push({
          imdbId,
          title,
          ...(year !== undefined && { year }),
          type: itemType,
          ...(imageUrl && { imageUrl }),
        });
      });

          logger.debug(`IMDb search for "${query}" returned ${results.length} results`);
          return results;
        } catch (error) {
          throw this.convertToApplicationError(error, 'search', { query, type });
        }
      }, 'IMDb search');
    });
  }

  /**
   * Get detailed movie information
   */
  async getMovieDetails(imdbId: string): Promise<IMDbMovieDetails> {
    return this.circuitBreaker.execute(async () => {
      return this.retryStrategy.execute(async () => {
        try {
          const response = await this.client.get(`/title/${imdbId}/`);
      const $ = cheerio.load(response.data);

      // Extract title
      const title =
        $('[data-testid="hero__pageTitle"]').first().text().trim() ||
        $('h1[data-testid="hero-title-block__title"]').first().text().trim();

      // Extract original title (if different)
      const originalTitle = $('[data-testid="hero__pageTitle-originalTitle"]')
        .first()
        .text()
        .replace(/^Original title:\s*/, '')
        .trim();

      // Extract year
      const releaseInfo = $('[data-testid="hero-title-block__metadata"] li').first().text();
      const yearMatch = releaseInfo?.match(/(\d{4})/);
      const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

      // Extract rating and vote count
      const ratingText = $('[data-testid="hero-rating-bar__aggregate-rating__score"]')
        .first()
        .text()
        .trim();
      const ratingMatch = ratingText?.match(/([\d.]+)/);
      const rating = ratingMatch ? parseFloat(ratingMatch[1]) : undefined;

      const voteText = $('[data-testid="hero-rating-bar__aggregate-rating__count"]')
        .first()
        .text()
        .trim();
      const voteMatch = voteText?.match(/([\d.]+[KM]?)/);
      let voteCount: number | undefined;
      if (voteMatch) {
        const voteStr = voteMatch[1];
        if (voteStr.endsWith('K')) {
          voteCount = parseFloat(voteStr) * 1000;
        } else if (voteStr.endsWith('M')) {
          voteCount = parseFloat(voteStr) * 1000000;
        } else {
          voteCount = parseFloat(voteStr.replace(/,/g, ''));
        }
      }

      // Extract plot
      const plot =
        $('p[data-testid="plot"] span[data-testid="plot-xl"]').first().text().trim() ||
        $('p[data-testid="plot"]').first().text().trim();

      // Extract tagline
      const tagline = $('[data-testid="storyline-taglines"] p').first().text().trim();

      // Extract genres
      const genres: string[] = [];
      $('[data-testid="genres"] a.ipc-chip__text').each((_index, element) => {
        genres.push($(element).text().trim());
      });

      // Extract runtime
      const runtimeText = $('li[data-testid="title-techspec_runtime"] div')
        .last()
        .text()
        .trim();
      const runtimeMatch = runtimeText?.match(/(\d+)\s*(?:hour|minute)/gi);
      let runtime: number | undefined;
      if (runtimeMatch) {
        let totalMinutes = 0;
        runtimeMatch.forEach((match) => {
          const num = parseInt(match);
          if (match.toLowerCase().includes('hour')) {
            totalMinutes += num * 60;
          } else {
            totalMinutes += num;
          }
        });
        runtime = totalMinutes;
      }

      // Extract directors
      const directors: string[] = [];
      $('[data-testid="title-pc-principal-credit"]:contains("Director") a.ipc-metadata-list-item__list-content-item').each(
        (_index, element) => {
          directors.push($(element).text().trim());
        }
      );
      // Fallback for single director
      if (directors.length === 0) {
        $('[data-testid="title-pc-principal-credit"]:contains("Director") li a').each(
          (_index, element) => {
            directors.push($(element).text().trim());
          }
        );
      }

      // Extract writers
      const writers: string[] = [];
      $('[data-testid="title-pc-principal-credit"]:contains("Writer") a.ipc-metadata-list-item__list-content-item').each(
        (_index, element) => {
          writers.push($(element).text().trim());
        }
      );

      // Extract top cast
      const cast: Array<{ name: string; character?: string }> = [];
      $('[data-testid="title-cast-item"]')
        .slice(0, 10)
        .each((_index, element) => {
          const $item = $(element);
          const name = $item.find('[data-testid="title-cast-item__actor"]').text().trim();
          const character = $item
            .find('[data-testid="cast-item-characters-link"]')
            .first()
            .text()
            .trim();
          if (name) {
            cast.push({
              name,
              ...(character && { character }),
            });
          }
        });

      // Extract release date, countries, languages
      const releaseDate = $('li[data-testid="title-details-releasedate"] a').first().text().trim();
      const countries: string[] = [];
      $('li[data-testid="title-details-origin"] a').each((_index, element) => {
        countries.push($(element).text().trim());
      });

      const languages: string[] = [];
      $('li[data-testid="title-details-languages"] a').each((_index, element) => {
        languages.push($(element).text().trim());
      });

      // Extract certification
      const certification = $('li[data-testid="title-details-certificate"] a')
        .first()
        .text()
        .trim();

      // Extract studios/production companies
      const studios: string[] = [];
      $('li[data-testid="title-details-companies"] a').each((_index, element) => {
        studios.push($(element).text().trim());
      });

      const details: IMDbMovieDetails = {
        imdbId,
        title,
        ...(originalTitle && { originalTitle }),
        ...(year !== undefined && { year }),
        ...(rating !== undefined && { rating }),
        ...(voteCount !== undefined && { voteCount }),
        ...(plot && { plot }),
        ...(tagline && { tagline }),
        ...(genres.length > 0 && { genres }),
        ...(directors.length > 0 && { directors }),
        ...(writers.length > 0 && { writers }),
        ...(cast.length > 0 && { cast }),
        ...(runtime !== undefined && { runtime }),
        ...(releaseDate && { releaseDate }),
        ...(countries.length > 0 && { countries }),
        ...(languages.length > 0 && { languages }),
        ...(certification && { certification }),
        ...(studios.length > 0 && { studios }),
      };

          logger.debug(`Scraped IMDb details for ${imdbId}`, { title });
          return details;
        } catch (error) {
          throw this.convertToApplicationError(error, 'getMovieDetails', { imdbId });
        }
      }, 'IMDb movie details scraping');
    });
  }

  /**
   * Get detailed TV series information
   */
  async getSeriesDetails(imdbId: string): Promise<IMDbSeriesDetails> {
    // Reuse movie details scraper, as the page structure is similar
    const movieDetails = await this.getMovieDetails(imdbId);

    // Extract series-specific information
    try {
      const response = await this.client.get(`/title/${imdbId}/`);
      const $ = cheerio.load(response.data);

      // Extract number of seasons/episodes
      const seasonsText = $('[data-testid="episodes-header"]').first().text();
      const seasonsMatch = seasonsText?.match(/(\d+)\s*Season/i);
      const seasons = seasonsMatch ? parseInt(seasonsMatch[1], 10) : undefined;

      const episodesMatch = seasonsText?.match(/(\d+)\s*Episode/i);
      const episodes = episodesMatch ? parseInt(episodesMatch[1], 10) : undefined;

      // Series status - check if still airing
      const yearsText = $('[data-testid="hero-title-block__metadata"] li')
        .first()
        .text()
        .trim();
      const yearsMatch = yearsText?.match(/(\d{4})[-–](\d{4}|$)/);
      const status =
        yearsMatch && !yearsMatch[2] ? ('ongoing' as const) : ('ended' as const);

      return {
        ...movieDetails,
        type: 'tvSeries',
        ...(seasons !== undefined && { seasons }),
        ...(episodes !== undefined && { episodes }),
        ...(movieDetails.releaseDate && { premiered: movieDetails.releaseDate }),
        ...(status && { status }),
      };
    } catch (error) {
      logger.warn('Failed to extract series-specific details, returning movie details', {
        imdbId,
        error: getErrorMessage(error),
      });
      return {
        ...movieDetails,
        type: 'tvSeries',
      };
    }
  }
}
