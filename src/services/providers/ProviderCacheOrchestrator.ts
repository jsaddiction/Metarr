/**
 * Provider Cache Orchestrator
 *
 * Single source of truth for all provider data.
 * Implements smart caching with multi-ID lookup.
 *
 * Key Features:
 * - Lookup by any ID (tmdb_id, imdb_id, tvdb_id)
 * - 7-day cache TTL (configurable)
 * - Force refresh support
 * - Stores ALL data from providers (metadata, images, videos, cast, crew, etc.)
 * - Independent from entity_id (cache is provider-native)
 *
 * Usage:
 *   const data = await orchestrator.getMovieData({ tmdb_id: 535292 });
 *   // → Cache hit if < 7 days old, else fetch from API and cache
 */

import { DatabaseConnection } from '../../types/database.js';
import { DatabaseManager } from '../../database/DatabaseManager.js';
import { logger } from '../../middleware/logging.js';
import {
  MovieLookupParams,
  CachedMovie,
  CachedPerson,
  CachedCast,
  CachedCrew,
  CompleteMovieData,
  FetchOptions,
  FetchResult,
  CachedImage,
  CachedVideo,
} from '../../types/providerCache.js';
import { TMDBCacheAdapter } from './adapters/TMDBCacheAdapter.js';
import { FanartCacheAdapter } from './adapters/FanartCacheAdapter.js';
import { OMDBCacheAdapter } from './adapters/OMDBCacheAdapter.js';
import { TMDBClient } from './tmdb/TMDBClient.js';
import { TMDBClientOptions } from '../../types/providers/tmdb.js';
import { FanArtClient } from './fanart/FanArtClient.js';
import { FanArtClientOptions } from '../../types/providers/fanart.js';
import { OMDBClient } from './omdb/OMDBClient.js';
import { OMDBClientOptions } from '../../types/providers/omdb.js';
import { ConfigManager } from '../../config/ConfigManager.js';
import { ProviderConfigService } from '../providerConfigService.js';

const DEFAULT_MAX_AGE = 604800; // 7 days in seconds
const PROVIDER_FETCH_TIMEOUT = 30000; // 30 seconds total timeout for all providers

// Database row interfaces
interface MovieCacheRow {
  id: number;
  tmdb_id?: number;
  imdb_id?: string;
  tvdb_id?: number;
  title: string;
  original_title?: string;
  overview?: string;
  outline?: string;
  tagline?: string;
  release_date?: string;
  year?: number;
  runtime?: number;
  status?: string;
  content_rating?: string;
  tmdb_rating?: number;
  tmdb_votes?: number;
  imdb_rating?: number;
  imdb_votes?: number;
  popularity?: number;
  budget?: number;
  revenue?: number;
  homepage?: string;
  adult: number;
  fetched_at: string;
}

interface CastJoinRow {
  id: number;
  movie_cache_id: number;
  person_cache_id: number;
  character_name?: string;
  cast_order?: number;
  tmdb_person_id?: number;
  imdb_person_id?: string;
  name: string;
  profile_path?: string;
  popularity?: number;
  gender?: number;
  known_for_department?: string;
  fetched_at: string;
}

interface CrewJoinRow {
  id: number;
  movie_cache_id: number;
  person_cache_id: number;
  job: string;
  department?: string;
  tmdb_person_id?: number;
  imdb_person_id?: string;
  name: string;
  profile_path?: string;
  popularity?: number;
  gender?: number;
  known_for_department?: string;
  fetched_at: string;
}

interface ImageRow {
  id: number;
  entity_type: string;
  entity_cache_id: number;
  image_type: string;
  provider_name: string;
  provider_image_id?: string;
  file_path: string;
  width?: number;
  height?: number;
  aspect_ratio?: number;
  vote_average?: number;
  vote_count?: number;
  likes?: number;
  iso_639_1?: string;
  disc_number?: number;
  disc_type?: string;
  season_number?: number;
  is_hd: number;
  fetched_at: string;
}

interface VideoRow {
  id: number;
  entity_type: string;
  entity_cache_id: number;
  video_type: string;
  provider_name: string;
  provider_video_id: string;
  name: string;
  site: string;
  key: string;
  size?: number;
  duration_seconds?: number;
  published_at?: string;
  official: number;
  iso_639_1?: string;
  iso_3166_1?: string;
  fetched_at: string;
}

export class ProviderCacheOrchestrator {
  private db: DatabaseConnection;
  private tmdbAdapter: TMDBCacheAdapter;
  private fanartAdapter: FanartCacheAdapter;
  private omdbAdapter: OMDBCacheAdapter | null = null;

  constructor(dbOrManager: DatabaseConnection | DatabaseManager) {
    if ('getConnection' in dbOrManager) {
      this.db = dbOrManager.getConnection();
    } else {
      this.db = dbOrManager;
    }

    // Get config
    const config = ConfigManager.getInstance();
    const appConfig = config.getConfig();

    // Initialize TMDB adapter (required)
    const tmdbConfig = appConfig.providers.tmdb;
    const tmdbClientOptions: TMDBClientOptions = {
      apiKey: tmdbConfig?.apiKey || '',
      language: tmdbConfig?.language || 'en-US',
      includeAdult: tmdbConfig?.includeAdult ?? false,
    };

    if (tmdbConfig?.baseUrl) {
      tmdbClientOptions.baseUrl = tmdbConfig.baseUrl;
    }

    const tmdbClient = new TMDBClient(tmdbClientOptions);
    this.tmdbAdapter = new TMDBCacheAdapter(this.db, tmdbClient);

    // Initialize Fanart.tv adapter (always enabled with embedded key)
    const fanartConfig = appConfig.providers.fanart_tv;
    const fanartClientOptions: FanArtClientOptions = {
      apiKey: fanartConfig?.apiKey || '',
    };

    if (fanartConfig?.baseUrl) {
      fanartClientOptions.baseUrl = fanartConfig.baseUrl;
    }

    const fanartClient = new FanArtClient(fanartClientOptions);
    this.fanartAdapter = new FanartCacheAdapter(this.db, fanartClient);

    logger.info('[ProviderCacheOrchestrator] Fanart.tv adapter initialized');

    // Note: OMDB initialization is deferred until first use via lazy loading
    logger.info('[ProviderCacheOrchestrator] OMDB adapter will be initialized on first use');
  }

  /**
   * Get or initialize OMDB adapter (lazy loading from database config)
   * This ensures adapter is created with latest database configuration
   */
  private async getOMDBAdapter(): Promise<OMDBCacheAdapter | null> {
    // If already initialized, return it
    if (this.omdbAdapter) {
      return this.omdbAdapter;
    }

    // Try to initialize from database config
    try {
      const configService = new ProviderConfigService(this.db);
      const omdbDbConfig = await configService.getByName('omdb');

      if (omdbDbConfig?.enabled && omdbDbConfig.apiKey) {
        const omdbClientOptions: OMDBClientOptions = {
          apiKey: omdbDbConfig.apiKey,
          baseUrl: 'https://www.omdbapi.com',
        };

        const omdbClient = new OMDBClient(omdbClientOptions);
        this.omdbAdapter = new OMDBCacheAdapter(this.db, omdbClient);

        logger.info('[ProviderCacheOrchestrator] OMDB adapter initialized from database config', {
          apiKeyPresent: true,
        });

        return this.omdbAdapter;
      } else {
        logger.debug('[ProviderCacheOrchestrator] OMDB adapter not initialized', {
          enabled: omdbDbConfig?.enabled || false,
          hasApiKey: !!omdbDbConfig?.apiKey,
        });
        return null;
      }
    } catch (error) {
      logger.error('[ProviderCacheOrchestrator] Failed to initialize OMDB adapter', {
        error: error instanceof Error ? error.message : error,
      });
      return null;
    }
  }

  /**
   * Get complete movie data with smart caching
   *
   * @param params - Lookup by any provider ID
   * @param options - Fetch options (maxAge, forceRefresh, includes)
   * @returns Complete movie data with all relationships
   */
  async getMovieData(
    params: MovieLookupParams,
    options: FetchOptions = {}
  ): Promise<FetchResult> {
    const {
      maxAge = DEFAULT_MAX_AGE,
      forceRefresh = false,
      includeImages = true,
      includeVideos = true,
      includeCast = true,
      includeCrew = true,
    } = options;

    // Step 1: Check cache (unless force refresh)
    if (!forceRefresh) {
      const cached = await this.findMovieInCache(params);
      if (cached && this.isFresh(cached.fetched_at, maxAge)) {
        logger.debug('[ProviderCacheOrchestrator] Cache hit', {
          movieCacheId: cached.id,
          cacheAge: this.getCacheAge(cached.fetched_at),
        });

        // Hydrate with relationships
        const complete = await this.hydrateMovie(cached, {
          includeImages,
          includeVideos,
          includeCast,
          includeCrew,
        });

        return {
          data: complete,
          metadata: {
            source: 'cache',
            cacheAge: this.getCacheAge(cached.fetched_at),
            providers: ['tmdb'], // TODO: Track which providers contributed
          },
        };
      }
    }

    // Step 2: Cache miss or stale - fetch from ALL providers in parallel
    logger.info('[ProviderCacheOrchestrator] Cache miss or stale, fetching from all providers', params);

    const fetchResult = await this.fetchFromAllProviders(params);

    if (!fetchResult.movieCacheId) {
      logger.warn('[ProviderCacheOrchestrator] All providers failed', params);
      return {
        data: null,
        metadata: {
          source: 'api',
          providers: [],
        },
      };
    }

    // Hydrate with all relationships (merged images from all providers)
    const result = await this.db.query<MovieCacheRow>(
      'SELECT * FROM provider_cache_movies WHERE id = ?',
      [fetchResult.movieCacheId]
    );

    if (result.length === 0) {
      logger.error('[ProviderCacheOrchestrator] Movie not found after caching', {
        movieCacheId: fetchResult.movieCacheId,
      });
      return {
        data: null,
        metadata: {
          source: 'api',
          providers: fetchResult.providersUsed,
        },
      };
    }

    const cached = this.mapMovie(result[0]);
    const complete = await this.hydrateMovie(cached, {
      includeImages,
      includeVideos,
      includeCast,
      includeCrew,
    });

    logger.info('[ProviderCacheOrchestrator] Successfully fetched and cached from providers', {
      movieCacheId: fetchResult.movieCacheId,
      title: complete.title,
      providersUsed: fetchResult.providersUsed,
      duration: fetchResult.duration,
    });

    return {
      data: complete,
      metadata: {
        source: 'api',
        providers: fetchResult.providersUsed,
      },
    };
  }

  /**
   * Fetch from all providers in parallel with timeout
   * Returns what we have after timeout or when all complete
   */
  private async fetchFromAllProviders(params: MovieLookupParams): Promise<{
    movieCacheId: number | null;
    providersUsed: string[];
    duration: number;
  }> {
    const startTime = Date.now();
    const providersUsed: string[] = [];

    // Create promises for all provider fetches
    const tmdbPromise = this.tmdbAdapter
      .fetchAndCache(params)
      .then((movieCacheId) => ({
        provider: 'tmdb',
        movieCacheId,
        tmdbId: null as number | null,
      }))
      .catch((error) => {
        logger.error('[ProviderCacheOrchestrator] TMDB fetch failed', {
          params,
          error: error instanceof Error ? error.message : error,
        });
        return { provider: 'tmdb', movieCacheId: null, tmdbId: null };
      });

    // Wait for TMDB first (required for Fanart.tv)
    const tmdbTimeout = this.createTimeout(PROVIDER_FETCH_TIMEOUT, { provider: 'tmdb', movieCacheId: null, tmdbId: null });
    const tmdbResult = await Promise.race([
      tmdbPromise,
      tmdbTimeout.promise,
    ]);

    // Clean up timeout to prevent lingering timer
    tmdbTimeout.cleanup();

    if (!tmdbResult.movieCacheId) {
      logger.warn('[ProviderCacheOrchestrator] TMDB failed, cannot proceed', params);
      return {
        movieCacheId: null,
        providersUsed: [],
        duration: Date.now() - startTime,
      };
    }

    providersUsed.push('tmdb');
    const movieCacheId = tmdbResult.movieCacheId;

    // Get TMDB ID for Fanart.tv
    const movieResult = await this.db.query<{ tmdb_id: number }>(
      'SELECT tmdb_id FROM provider_cache_movies WHERE id = ?',
      [movieCacheId]
    );

    if (movieResult.length === 0 || !movieResult[0].tmdb_id) {
      logger.warn('[ProviderCacheOrchestrator] No TMDB ID found for Fanart.tv', { movieCacheId });
      return {
        movieCacheId,
        providersUsed,
        duration: Date.now() - startTime,
      };
    }

    const tmdbId = movieResult[0].tmdb_id;

    // Calculate remaining timeout
    const elapsed = Date.now() - startTime;
    const remainingTimeout = PROVIDER_FETCH_TIMEOUT - elapsed;

    if (remainingTimeout <= 0) {
      logger.warn('[ProviderCacheOrchestrator] Timeout reached after TMDB, skipping Fanart.tv');
      return {
        movieCacheId,
        providersUsed,
        duration: Date.now() - startTime,
      };
    }

    // Fetch from Fanart.tv and OMDB in parallel with remaining timeout
    const fanartPromise = this.fanartAdapter
      .fetchAndCacheMovieImages(movieCacheId, tmdbId)
      .then((result) => ({ provider: 'fanart.tv', result }))
      .catch((error) => {
        logger.error('[ProviderCacheOrchestrator] Fanart.tv fetch failed', {
          movieCacheId,
          tmdbId,
          error: error instanceof Error ? error.message : error,
        });
        return { provider: 'fanart.tv', result: { imagesCached: 0, imageTypes: [] } };
      });

    // OMDB fetch (lazy load adapter from database)
    const omdbPromise = this.getOMDBAdapter().then((adapter) => {
      if (!adapter) {
        return { provider: 'omdb', movieCacheId: null };
      }
      return adapter
        .fetchAndUpdate(params)
        .then((result) => ({ provider: 'omdb', movieCacheId: result }))
        .catch((error) => {
          logger.error('[ProviderCacheOrchestrator] OMDB fetch failed', {
            params,
            error: error instanceof Error ? error.message : error,
          });
          return { provider: 'omdb', movieCacheId: null };
        });
    });

    // Wait for both in parallel
    const [fanartResult, omdbResult] = await Promise.all([
      Promise.race([
        fanartPromise,
        this.createTimeout(remainingTimeout, {
          provider: 'fanart.tv',
          result: { imagesCached: 0, imageTypes: [] },
        }).promise,
      ]),
      Promise.race([
        omdbPromise,
        this.createTimeout(remainingTimeout, {
          provider: 'omdb',
          movieCacheId: null,
        }).promise,
      ]),
    ]);

    if (fanartResult.result.imagesCached > 0) {
      providersUsed.push('fanart.tv');
      logger.info('[ProviderCacheOrchestrator] Fanart.tv enrichment complete', {
        movieCacheId,
        imagesCached: fanartResult.result.imagesCached,
        imageTypes: fanartResult.result.imageTypes,
      });
    }

    if (omdbResult.movieCacheId) {
      providersUsed.push('omdb');
      logger.info('[ProviderCacheOrchestrator] OMDB enrichment complete', {
        movieCacheId: omdbResult.movieCacheId,
      });
    }

    return {
      movieCacheId,
      providersUsed,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Create a timeout promise that resolves with a default value
   * Returns both the promise and cleanup function to prevent lingering timers
   */
  private createTimeout<T>(ms: number, defaultValue: T): { promise: Promise<T>; cleanup: () => void } {
    let timeoutId: NodeJS.Timeout;
    const promise = new Promise<T>((resolve) => {
      timeoutId = setTimeout(() => {
        logger.warn('[ProviderCacheOrchestrator] Provider fetch timeout', { timeout: ms });
        resolve(defaultValue);
      }, ms);
    });

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };

    return { promise, cleanup };
  }

  /**
   * Find movie in cache by any provider ID
   */
  private async findMovieInCache(params: MovieLookupParams): Promise<CachedMovie | null> {
    // Try TMDB ID first (most reliable)
    if (params.tmdb_id) {
      const result = await this.db.query<MovieCacheRow>(
        'SELECT * FROM provider_cache_movies WHERE tmdb_id = ?',
        [params.tmdb_id]
      );
      if (result.length > 0) return this.mapMovie(result[0]);
    }

    // Try IMDB ID
    if (params.imdb_id) {
      const result = await this.db.query<MovieCacheRow>(
        'SELECT * FROM provider_cache_movies WHERE imdb_id = ?',
        [params.imdb_id]
      );
      if (result.length > 0) return this.mapMovie(result[0]);
    }

    // Try TVDB ID
    if (params.tvdb_id) {
      const result = await this.db.query<MovieCacheRow>(
        'SELECT * FROM provider_cache_movies WHERE tvdb_id = ?',
        [params.tvdb_id]
      );
      if (result.length > 0) return this.mapMovie(result[0]);
    }

    return null;
  }

  /**
   * Hydrate movie with all relationships
   */
  private async hydrateMovie(
    movie: CachedMovie,
    includes: {
      includeImages: boolean;
      includeVideos: boolean;
      includeCast: boolean;
      includeCrew: boolean;
    }
  ): Promise<CompleteMovieData> {
    const complete: CompleteMovieData = { ...movie };

    // Load genres
    const genres = await this.db.query(
      `SELECT g.* FROM provider_cache_genres g
       JOIN provider_cache_movie_genres mg ON g.id = mg.genre_id
       WHERE mg.movie_cache_id = ?`,
      [movie.id]
    );
    complete.genres = genres;

    // Load companies
    const companies = await this.db.query(
      `SELECT c.* FROM provider_cache_companies c
       JOIN provider_cache_movie_companies mc ON c.id = mc.company_id
       WHERE mc.movie_cache_id = ?`,
      [movie.id]
    );
    complete.companies = companies;

    // Load countries
    const countries = await this.db.query(
      `SELECT c.* FROM provider_cache_countries c
       JOIN provider_cache_movie_countries mc ON c.id = mc.country_id
       WHERE mc.movie_cache_id = ?`,
      [movie.id]
    );
    complete.countries = countries;

    // Load keywords
    const keywords = await this.db.query(
      `SELECT k.* FROM provider_cache_keywords k
       JOIN provider_cache_movie_keywords mk ON k.id = mk.keyword_id
       WHERE mk.movie_cache_id = ?`,
      [movie.id]
    );
    complete.keywords = keywords;

    // Load cast (if requested)
    if (includes.includeCast) {
      const cast = await this.db.query<CastJoinRow>(
        `SELECT mc.*, p.* FROM provider_cache_movie_cast mc
         JOIN provider_cache_people p ON mc.person_cache_id = p.id
         WHERE mc.movie_cache_id = ?
         ORDER BY mc.cast_order`,
        [movie.id]
      );
      complete.cast = cast.map((row) => {
        const person: CachedPerson = {
          id: row.person_cache_id,
          name: row.name,
          fetched_at: new Date(row.fetched_at),
        };
        if (row.tmdb_person_id !== undefined) person.tmdb_person_id = row.tmdb_person_id;
        if (row.imdb_person_id !== undefined) person.imdb_person_id = row.imdb_person_id;
        if (row.profile_path !== undefined) person.profile_path = row.profile_path;
        if (row.popularity !== undefined) person.popularity = row.popularity;
        if (row.gender !== undefined) person.gender = row.gender;
        if (row.known_for_department !== undefined) person.known_for_department = row.known_for_department;

        const castMember: CachedCast = {
          id: row.id,
          movie_cache_id: row.movie_cache_id,
          person,
        };
        if (row.character_name !== undefined) castMember.character_name = row.character_name;
        if (row.cast_order !== undefined) castMember.cast_order = row.cast_order;

        return castMember;
      });
    }

    // Load crew (if requested)
    if (includes.includeCrew) {
      const crew = await this.db.query<CrewJoinRow>(
        `SELECT mc.*, p.* FROM provider_cache_movie_crew mc
         JOIN provider_cache_people p ON mc.person_cache_id = p.id
         WHERE mc.movie_cache_id = ?`,
        [movie.id]
      );
      complete.crew = crew.map((row) => {
        const person: CachedPerson = {
          id: row.person_cache_id,
          name: row.name,
          fetched_at: new Date(row.fetched_at),
        };
        if (row.tmdb_person_id !== undefined) person.tmdb_person_id = row.tmdb_person_id;
        if (row.imdb_person_id !== undefined) person.imdb_person_id = row.imdb_person_id;
        if (row.profile_path !== undefined) person.profile_path = row.profile_path;
        if (row.popularity !== undefined) person.popularity = row.popularity;
        if (row.gender !== undefined) person.gender = row.gender;
        if (row.known_for_department !== undefined) person.known_for_department = row.known_for_department;

        const crewMember: CachedCrew = {
          id: row.id,
          movie_cache_id: row.movie_cache_id,
          job: row.job,
          person,
        };
        if (row.department !== undefined) crewMember.department = row.department;

        return crewMember;
      });
    }

    // Load images (if requested)
    if (includes.includeImages) {
      const images = await this.db.query<ImageRow>(
        `SELECT * FROM provider_cache_images
         WHERE entity_type = 'movie' AND entity_cache_id = ?
         ORDER BY image_type, vote_average DESC, vote_count DESC`,
        [movie.id]
      );
      complete.images = images.map((row) => this.mapImage(row));
    }

    // Load videos (if requested)
    if (includes.includeVideos) {
      const videos = await this.db.query<VideoRow>(
        `SELECT * FROM provider_cache_videos
         WHERE entity_type = 'movie' AND entity_cache_id = ?
         ORDER BY video_type, official DESC, published_at DESC`,
        [movie.id]
      );
      complete.videos = videos.map((row) => this.mapVideo(row));
    }

    // Load collection (if movie belongs to one)
    // TODO: Implement collection lookup

    return complete;
  }

  /**
   * Check if cached data is still fresh
   */
  private isFresh(fetchedAt: Date, maxAge: number): boolean {
    const ageSeconds = this.getCacheAge(fetchedAt);
    return ageSeconds < maxAge;
  }

  /**
   * Get cache age in seconds
   */
  private getCacheAge(fetchedAt: Date): number {
    return Math.floor((Date.now() - fetchedAt.getTime()) / 1000);
  }

  /**
   * Map database row to CachedMovie
   */
  private mapMovie(row: MovieCacheRow): CachedMovie {
    const movie: CachedMovie = {
      id: row.id,
      title: row.title,
      adult: Boolean(row.adult),
      fetched_at: new Date(row.fetched_at),
    };

    // Add optional fields only if defined
    if (row.tmdb_id !== undefined) movie.tmdb_id = row.tmdb_id;
    if (row.imdb_id !== undefined) movie.imdb_id = row.imdb_id;
    if (row.tvdb_id !== undefined) movie.tvdb_id = row.tvdb_id;
    if (row.original_title !== undefined) movie.original_title = row.original_title;
    if (row.overview !== undefined) movie.overview = row.overview;
    if (row.outline !== undefined) movie.outline = row.outline;
    if (row.tagline !== undefined) movie.tagline = row.tagline;
    if (row.release_date !== undefined) movie.release_date = row.release_date;
    if (row.year !== undefined) movie.year = row.year;
    if (row.runtime !== undefined) movie.runtime = row.runtime;
    if (row.status !== undefined) movie.status = row.status;
    if (row.content_rating !== undefined) movie.content_rating = row.content_rating;
    if (row.tmdb_rating !== undefined) movie.tmdb_rating = row.tmdb_rating;
    if (row.tmdb_votes !== undefined) movie.tmdb_votes = row.tmdb_votes;
    if (row.imdb_rating !== undefined) movie.imdb_rating = row.imdb_rating;
    if (row.imdb_votes !== undefined) movie.imdb_votes = row.imdb_votes;
    if (row.popularity !== undefined) movie.popularity = row.popularity;
    if (row.budget !== undefined) movie.budget = row.budget;
    if (row.revenue !== undefined) movie.revenue = row.revenue;
    if (row.homepage !== undefined) movie.homepage = row.homepage;

    return movie;
  }

  /**
   * Map database row to CachedImage
   */
  private mapImage(row: ImageRow): CachedImage {
    const image: CachedImage = {
      id: row.id,
      entity_type: row.entity_type as CachedImage['entity_type'],
      entity_cache_id: row.entity_cache_id,
      image_type: row.image_type,
      provider_name: row.provider_name,
      file_path: row.file_path,
      is_hd: Boolean(row.is_hd),
      fetched_at: new Date(row.fetched_at),
    };

    // Add optional fields only if defined
    if (row.provider_image_id !== undefined) image.provider_image_id = row.provider_image_id;
    if (row.width !== undefined) image.width = row.width;
    if (row.height !== undefined) image.height = row.height;
    if (row.aspect_ratio !== undefined) image.aspect_ratio = row.aspect_ratio;
    if (row.vote_average !== undefined) image.vote_average = row.vote_average;
    if (row.vote_count !== undefined) image.vote_count = row.vote_count;
    if (row.likes !== undefined) image.likes = row.likes;
    if (row.iso_639_1 !== undefined) image.iso_639_1 = row.iso_639_1;
    if (row.disc_number !== undefined) image.disc_number = row.disc_number;
    if (row.disc_type !== undefined) image.disc_type = row.disc_type;
    if (row.season_number !== undefined) image.season_number = row.season_number;

    return image;
  }

  /**
   * Map database row to CachedVideo
   */
  private mapVideo(row: VideoRow): CachedVideo {
    const video: CachedVideo = {
      id: row.id,
      entity_type: row.entity_type as CachedVideo['entity_type'],
      entity_cache_id: row.entity_cache_id,
      video_type: row.video_type,
      provider_name: row.provider_name,
      provider_video_id: row.provider_video_id,
      name: row.name,
      site: row.site,
      key: row.key,
      official: Boolean(row.official),
      fetched_at: new Date(row.fetched_at),
    };

    // Add optional fields only if defined
    if (row.size !== undefined) video.size = row.size;
    if (row.duration_seconds !== undefined) video.duration_seconds = row.duration_seconds;
    if (row.published_at !== undefined) video.published_at = row.published_at;
    if (row.iso_639_1 !== undefined) video.iso_639_1 = row.iso_639_1;
    if (row.iso_3166_1 !== undefined) video.iso_3166_1 = row.iso_3166_1;

    return video;
  }
}
