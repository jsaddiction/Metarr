/**
 * TMDB Provider
 *
 * Concrete implementation of BaseProvider for The Movie Database.
 * Wraps TMDBClient and provides standardized provider interface.
 */

import { BaseProvider } from '../BaseProvider.js';
import { TMDBClient } from './TMDBClient.js';
import { RateLimiter } from '../utils/RateLimiter.js';
import {
  ProviderCapabilities,
  ProviderOptions,
  SearchRequest,
  SearchResult,
  MetadataRequest,
  MetadataResponse,
  AssetRequest,
  AssetCandidate,
  MetadataField,
} from '../../../types/providers/index.js';
import { ProviderConfig } from '../../../types/provider.js';
import { logger } from '../../../middleware/logging.js';

export class TMDBProvider extends BaseProvider {
  private tmdbClient: TMDBClient;

  constructor(config: ProviderConfig, options?: ProviderOptions) {
    super(config, options);

    // Initialize TMDB client
    this.tmdbClient = new TMDBClient({
      apiKey: config.apiKey || '',
      baseUrl: (options?.baseUrl as string) || 'https://api.themoviedb.org/3',
      imageBaseUrl: (options?.imageBaseUrl as string) || 'https://image.tmdb.org/t/p',
      language: 'en-US',
      includeAdult: (options?.includeAdult as boolean) ?? false,
    });

    logger.info('TMDB Provider initialized', {
      providerId: this.capabilities.id,
      version: this.capabilities.version,
    });
  }

  /**
   * Create rate limiter for TMDB API
   * Note: TMDB has its own rate limiter in TMDBClient, but we create one here
   * to satisfy BaseProvider requirements and for potential future use
   */
  protected createRateLimiter(): RateLimiter {
    const capabilities = this.getCapabilities();
    return new RateLimiter({
      requestsPerSecond: capabilities.rateLimit.requestsPerSecond,
      burstCapacity: capabilities.rateLimit.burstCapacity,
      windowSeconds: 10,
    });
  }

  /**
   * Define TMDB provider capabilities
   */
  defineCapabilities(): ProviderCapabilities {
    return {
      id: 'tmdb',
      name: 'The Movie Database',
      version: '1.0.0',
      category: 'both',

      supportedEntityTypes: ['movie', 'collection'],

      supportedMetadataFields: {
        movie: [
          'title',
          'originalTitle',
          'plot',
          'tagline',
          'releaseDate',
          'runtime',
          'ratings',
          'genres',
          'studios',
          'country',
          'directors',
          'writers',
          'actors',
          'certification',
          'collection',
          'trailer',
        ],
        collection: ['title', 'plot'],
      },

      supportedAssetTypes: {
        movie: ['poster', 'fanart', 'clearlogo'],
        collection: ['poster', 'fanart'],
      },

      authentication: {
        type: 'api_key',
        required: true,
      },

      rateLimit: {
        requestsPerSecond: 4, // 50 requests per 10 seconds = ~4-5/sec conservative
        burstCapacity: 40,
        webhookReservedCapacity: 10,
        enforcementType: 'client',
      },

      search: {
        supported: true,
        fuzzyMatching: true,
        multiLanguage: true,
        yearFilter: true,
        externalIdLookup: ['imdb_id'],
      },

      dataQuality: {
        metadataCompleteness: 0.95,
        imageQuality: 0.90,
        updateFrequency: 'realtime',
        userContributed: true,
        curatedContent: true,
      },

      assetProvision: {
        providesUrls: true,
        providesDirectDownload: false,
        thumbnailUrls: true,
        multipleQualities: true,
        maxResultsPerType: null,
        qualityHints: true,
        languagePerAsset: true,
      },

      specialFeatures: {
        collectionSupport: true,
        multipleLanguageImages: true,
        voteSystemForImages: true,
      },
    };
  }

  /**
   * Search for movies/collections
   */
  async search(request: SearchRequest): Promise<SearchResult[]> {
    const { query, entityType, year, page = 1, limit = 20, externalId } = request;

    // Only support movie and collection searches
    if (entityType !== 'movie' && entityType !== 'collection') {
      return [];
    }

    try {
      // Search by external ID (IMDB) if provided
      if (externalId && externalId.type === 'imdb_id') {
        const findResult = await this.tmdbClient.findByExternalId({
          externalId: externalId.value,
          externalSource: 'imdb_id',
        });

        return findResult.movie_results.slice(0, limit).map((movie) => ({
          providerId: 'tmdb',
          providerResultId: movie.id.toString(),
          externalIds: {
            tmdb: movie.id,
          },
          title: movie.title,
          originalTitle: movie.original_title,
          releaseDate: movie.release_date ? new Date(movie.release_date) : undefined,
          overview: movie.overview,
          posterUrl: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : undefined,
          confidence: 1.0, // Exact match via IMDB ID
        }));
      }

      // Search by title
      if (entityType === 'movie') {
        const searchOptions: any = { query, page };
        if (year) searchOptions.year = year;

        const searchResult = await this.tmdbClient.searchMovies(searchOptions);

        return searchResult.results.slice(0, limit).map((movie) => ({
          providerId: 'tmdb',
          providerResultId: movie.id.toString(),
          externalIds: {
            tmdb: movie.id,
          },
          title: movie.title,
          originalTitle: movie.original_title,
          releaseDate: movie.release_date ? new Date(movie.release_date) : undefined,
          overview: movie.overview,
          posterUrl: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : undefined,
          confidence: this.calculateSearchConfidence(movie, query, year),
        }));
      }

      return [];
    } catch (error: any) {
      logger.error('TMDB search failed', {
        query,
        entityType,
        error: error.message,
      });
      throw new Error(`TMDB search failed: ${error.message}`);
    }
  }

  /**
   * Get metadata for a movie/collection
   */
  async getMetadata(request: MetadataRequest): Promise<MetadataResponse> {
    const { providerResultId, entityType, fields } = request;

    if (entityType !== 'movie' && entityType !== 'collection') {
      throw new Error(`TMDB provider does not support entity type: ${entityType}`);
    }

    try {
      if (entityType === 'movie') {
        const movie = await this.tmdbClient.getMovie(parseInt(providerResultId), {
          appendToResponse: ['credits', 'external_ids', 'release_dates'],
        });

        const transformedData = this.transformMovieMetadata(movie, fields);
        const response: MetadataResponse = {
          providerId: 'tmdb',
          providerResultId,
          fields: transformedData.fields,
          completeness: this.calculateCompleteness(transformedData.fields, fields),
          confidence: 0.95, // TMDB is highly reliable
        };

        // Only add externalIds if present
        if (transformedData.externalIds) {
          response.externalIds = transformedData.externalIds;
        }

        return response;
      }

      if (entityType === 'collection') {
        const collection = await this.tmdbClient.getCollection(parseInt(providerResultId));

        const transformedData = this.transformCollectionMetadata(collection, fields);
        return {
          providerId: 'tmdb',
          providerResultId,
          fields: transformedData.fields,
          completeness: this.calculateCompleteness(transformedData.fields, fields),
          confidence: 0.95,
        };
      }

      throw new Error(`Unsupported entity type: ${entityType}`);
    } catch (error: any) {
      logger.error('TMDB metadata fetch failed', {
        providerResultId,
        entityType,
        error: error.message,
      });
      throw new Error(`TMDB metadata fetch failed: ${error.message}`);
    }
  }

  /**
   * Get asset candidates (images) for a movie/collection
   */
  async getAssets(request: AssetRequest): Promise<AssetCandidate[]> {
    const { providerResultId, entityType, assetTypes } = request;

    if (entityType !== 'movie' && entityType !== 'collection') {
      return [];
    }

    try {
      const candidates: AssetCandidate[] = [];
      const tmdbId = parseInt(providerResultId);

      // Get images from TMDB
      const images = await this.tmdbClient.getMovieImages(tmdbId);

      // Process posters
      if (assetTypes.includes('poster') && images.posters) {
        for (const poster of images.posters) {
          candidates.push({
            providerId: 'tmdb',
            providerResultId,
            assetType: 'poster',
            url: this.tmdbClient.getImageUrl(poster.file_path, 'original'),
            thumbnailUrl: this.tmdbClient.getImageUrl(poster.file_path, 'w342'),
            width: poster.width,
            height: poster.height,
            aspectRatio: poster.aspect_ratio,
            language: poster.iso_639_1 || 'null',
            votes: poster.vote_count,
            voteAverage: poster.vote_average,
          });
        }
      }

      // Process backdrops (fanart)
      if (assetTypes.includes('fanart') && images.backdrops) {
        for (const backdrop of images.backdrops) {
          candidates.push({
            providerId: 'tmdb',
            providerResultId,
            assetType: 'fanart',
            url: this.tmdbClient.getImageUrl(backdrop.file_path, 'original'),
            thumbnailUrl: this.tmdbClient.getImageUrl(backdrop.file_path, 'w780'),
            width: backdrop.width,
            height: backdrop.height,
            aspectRatio: backdrop.aspect_ratio,
            language: backdrop.iso_639_1 || 'null',
            votes: backdrop.vote_count,
            voteAverage: backdrop.vote_average,
          });
        }
      }

      // Process logos (clearlogo)
      if (assetTypes.includes('clearlogo') && images.logos) {
        for (const logo of images.logos) {
          candidates.push({
            providerId: 'tmdb',
            providerResultId,
            assetType: 'clearlogo',
            url: this.tmdbClient.getImageUrl(logo.file_path, 'original'),
            thumbnailUrl: this.tmdbClient.getImageUrl(logo.file_path, 'w185'),
            width: logo.width,
            height: logo.height,
            aspectRatio: logo.aspect_ratio,
            language: logo.iso_639_1 || 'null',
            votes: logo.vote_count,
            voteAverage: logo.vote_average,
          });
        }
      }

      logger.debug('TMDB assets fetched', {
        providerResultId,
        entityType,
        totalCandidates: candidates.length,
      });

      return candidates;
    } catch (error: any) {
      logger.error('TMDB asset fetch failed', {
        providerResultId,
        entityType,
        error: error.message,
      });
      throw new Error(`TMDB asset fetch failed: ${error.message}`);
    }
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  /**
   * Calculate search confidence score based on title match and year
   */
  private calculateSearchConfidence(
    movie: any,
    query: string,
    year?: number
  ): number {
    let confidence = 50; // Base confidence

    // Exact title match
    if (movie.title.toLowerCase() === query.toLowerCase()) {
      confidence += 30;
    } else if (movie.title.toLowerCase().includes(query.toLowerCase())) {
      confidence += 20;
    }

    // Original title match
    if (movie.original_title?.toLowerCase() === query.toLowerCase()) {
      confidence += 20;
    }

    // Year match
    if (year && movie.release_date) {
      const movieYear = new Date(movie.release_date).getFullYear();
      if (movieYear === year) {
        confidence += 20;
      }
    }

    // Popularity boost
    if (movie.popularity > 100) {
      confidence += 10;
    }

    return Math.min(confidence, 100);
  }

  /**
   * Transform TMDB movie response to MetadataResponse format
   */
  private transformMovieMetadata(
    movie: any,
    requestedFields?: MetadataField[]
  ): { fields: Partial<Record<MetadataField, any>>; externalIds?: Record<string, any> } {
    const fields: Partial<Record<MetadataField, any>> = {};

    // Only include requested fields if specified
    const shouldInclude = (field: MetadataField) =>
      !requestedFields || requestedFields.includes(field);

    if (shouldInclude('title')) fields.title = movie.title;
    if (shouldInclude('originalTitle')) fields.originalTitle = movie.original_title;
    if (shouldInclude('plot')) fields.plot = movie.overview;
    if (shouldInclude('releaseDate')) fields.releaseDate = movie.release_date;
    if (shouldInclude('runtime')) fields.runtime = movie.runtime;
    if (shouldInclude('tagline')) fields.tagline = movie.tagline;

    if (shouldInclude('ratings')) {
      fields.ratings = [
        {
          source: 'tmdb',
          value: movie.vote_average,
          votes: movie.vote_count,
        },
      ];
    }

    if (shouldInclude('genres') && movie.genres) {
      fields.genres = movie.genres.map((g: any) => g.name);
    }

    if (shouldInclude('studios') && movie.production_companies) {
      fields.studios = movie.production_companies.map((c: any) => c.name);
    }

    if (shouldInclude('country') && movie.production_countries) {
      fields.country = movie.production_countries.map((c: any) => c.name);
    }

    if (shouldInclude('actors') && movie.credits?.cast) {
      fields.actors = movie.credits.cast.slice(0, 20).map((actor: any) => ({
        name: actor.name,
        role: (actor as { [key: string]: unknown }).character,
        thumb: (actor as { [key: string]: unknown }).profile_path
          ? this.tmdbClient.getImageUrl((actor as { [key: string]: unknown }).profile_path as string, 'w185')
          : undefined,
      }));
    }

    if (shouldInclude('directors') && movie.credits?.crew) {
      const directors = movie.credits.crew.filter((c: any) => c.job === 'Director');
      fields.directors = directors.map((d: any) => d.name);
    }

    if (shouldInclude('writers') && movie.credits?.crew) {
      const writers = movie.credits.crew.filter((c: any) =>
        ['Screenplay', 'Writer', 'Story'].includes(c.job)
      );
      fields.writers = writers.map((w: any) => w.name);
    }

    if (shouldInclude('certification') && movie.release_dates) {
      // Extract US certification
      const usRelease = movie.release_dates.results?.find((r: any) => r.iso_3166_1 === 'US');
      if (usRelease?.release_dates?.[0]?.certification) {
        fields.certification = usRelease.release_dates[0].certification;
      }
    }

    // Collection info
    if (shouldInclude('collection') && movie.belongs_to_collection) {
      fields.collection = {
        id: movie.belongs_to_collection.id,
        name: movie.belongs_to_collection.name,
      };
    }

    // External IDs
    const result: { fields: Partial<Record<MetadataField, any>>; externalIds?: Record<string, any> } = { fields };

    if (movie.external_ids) {
      const externalIds: Record<string, any> = {};
      if (movie.external_ids.imdb_id) externalIds.imdb = movie.external_ids.imdb_id;
      if (movie.external_ids.tvdb_id) externalIds.tvdb = movie.external_ids.tvdb_id;

      if (Object.keys(externalIds).length > 0) {
        result.externalIds = externalIds;
      }
    }

    return result;
  }

  /**
   * Transform TMDB collection response to MetadataResponse format
   */
  private transformCollectionMetadata(
    collection: any,
    requestedFields?: MetadataField[]
  ): { fields: Partial<Record<MetadataField, any>> } {
    const fields: Partial<Record<MetadataField, any>> = {};

    const shouldInclude = (field: MetadataField) =>
      !requestedFields || requestedFields.includes(field);

    if (shouldInclude('title')) fields.title = collection.name;
    if (shouldInclude('plot')) fields.plot = collection.overview;

    return { fields };
  }

  /**
   * Calculate metadata completeness (0-1)
   */
  private calculateCompleteness(
    fields: Partial<Record<MetadataField, any>>,
    requestedFields?: MetadataField[]
  ): number {
    if (!requestedFields || requestedFields.length === 0) {
      // No specific fields requested, just count what we got
      return Object.keys(fields).length > 0 ? 1.0 : 0.0;
    }

    // Count how many requested fields were filled
    const filled = requestedFields.filter((field) => fields[field] !== undefined).length;
    return filled / requestedFields.length;
  }
}
