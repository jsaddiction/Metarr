/**
 * Provider Fetch Phase (Phase 1)
 *
 * Fetches metadata and asset URLs from external providers:
 * 1. Query provider cache orchestrator (TMDB + Fanart.tv)
 * 2. Copy metadata to entity tables (respecting field locks)
 * 3. Copy cast/crew to actors tables
 * 4. Populate provider_assets table for downstream scoring
 */

import { DatabaseConnection } from '../../../types/database.js';
import { DatabaseManager } from '../../../database/DatabaseManager.js';
import { ProviderAssetsRepository } from '../ProviderAssetsRepository.js';
import { ProviderCacheOrchestrator } from '../../providers/ProviderCacheOrchestrator.js';
import { EnrichmentConfig, MovieDatabaseRow, MovieUpdateFields } from '../types.js';
import { CompleteMovieData } from '../../../types/providerCache.js';
import { logger } from '../../../middleware/logging.js';
import { getErrorMessage } from '../../../utils/errorHandling.js';
import { ResourceNotFoundError } from '../../../errors/index.js';
import { MovieRelationshipService } from '../../movie/MovieRelationshipService.js';
import { generateSortTitle } from '../../../utils/sortTitle.js';

export class ProviderFetchPhase {
  private readonly providerAssetsRepo: ProviderAssetsRepository;
  private readonly providerCacheOrchestrator: ProviderCacheOrchestrator;

  constructor(
    private readonly db: DatabaseConnection,
    private readonly dbManager: DatabaseManager
  ) {
    this.providerAssetsRepo = new ProviderAssetsRepository(db);
    this.providerCacheOrchestrator = new ProviderCacheOrchestrator(dbManager);
  }

  /**
   * Execute provider fetch for an entity
   *
   * @param config - Enrichment configuration
   * @returns Number of assets fetched
   */
  async execute(config: EnrichmentConfig): Promise<{ assetsFetched: number }> {
    try {
      const { entityId, entityType, manual, forceRefresh } = config;

      // Only support movies for now (TV/music later)
      if (entityType !== 'movie') {
        logger.warn('[ProviderFetchPhase] Only supports movies currently', {
          entityType,
          entityId,
        });
        return { assetsFetched: 0 };
      }

      // Get entity details
      const entity = await this.getEntity(entityId, entityType);
      if (!entity) {
        throw new ResourceNotFoundError(entityType, entityId);
      }

      // Check if entity is monitored (automated jobs only)
      if (!manual && !entity.monitored) {
        logger.info('[ProviderFetchPhase] Skipping unmonitored entity', {
          entityType,
          entityId,
        });
        return { assetsFetched: 0 };
      }

      // Step 1: Fetch from provider cache orchestrator
      logger.info('[ProviderFetchPhase] Fetching from provider cache', {
        entityId,
        tmdb_id: entity.tmdb_id,
        imdb_id: entity.imdb_id,
        forceRefresh,
      });

      // Build lookup params (only include defined IDs)
      const lookupParams: { tmdb_id?: number; imdb_id?: string; tvdb_id?: number } = {};
      if (entity.tmdb_id) lookupParams.tmdb_id = entity.tmdb_id;
      if (entity.imdb_id) lookupParams.imdb_id = entity.imdb_id;
      if (entity.tvdb_id) lookupParams.tvdb_id = entity.tvdb_id;

      const fetchResult = await this.providerCacheOrchestrator.getMovieData(lookupParams, {
        forceRefresh,
        includeImages: true,
        includeVideos: true,
        includeCast: true,
        includeCrew: true,
      });

      if (!fetchResult.data) {
        logger.warn('[ProviderFetchPhase] Provider cache returned no data', {
          entityType,
          entityId,
        });
        return { assetsFetched: 0 };
      }

      const cachedMovie = fetchResult.data;

      logger.info('[ProviderFetchPhase] Provider cache fetch complete', {
        entityId,
        source: fetchResult.metadata.source,
        providers: fetchResult.metadata.providers,
        cacheAge: fetchResult.metadata.cacheAge,
        imageCount: cachedMovie.images?.length || 0,
        videoCount: cachedMovie.videos?.length || 0,
        castCount: cachedMovie.cast?.length || 0,
      });

      // Step 2: Copy metadata to movies table
      await this.copyMetadataToMovie(entityId, cachedMovie);

      // Step 2A: Copy external IDs to movie_external_ids table
      await this.copyExternalIds(entityId, cachedMovie);

      // Step 2B: Copy cast/crew to actors tables
      await this.copyCastToActors(entityId, cachedMovie);

      // Step 3: Populate provider_assets
      const assetsFetched = await this.populateProviderAssets(
        entityId,
        entityType,
        cachedMovie,
        manual
      );

      logger.info('[ProviderFetchPhase] Phase 1 complete', {
        entityType,
        entityId,
        assetsFetched,
        source: fetchResult.metadata.source,
        providers: fetchResult.metadata.providers,
      });

      return { assetsFetched };
    } catch (error) {
      logger.error('[ProviderFetchPhase] Phase 1 failed', {
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Get entity from database
   */
  private async getEntity(
    entityId: number,
    entityType: string
  ): Promise<{
    id: number;
    title: string;
    tmdb_id: number | null;
    imdb_id: string | null;
    tvdb_id: number | null;
    monitored: number;
  } | null> {
    if (entityType === 'movie') {
      const result = await this.db.get<MovieDatabaseRow>(
        'SELECT id, title, tmdb_id, imdb_id, tvdb_id, monitored FROM movies WHERE id = ?',
        [entityId]
      );
      return result || null;
    }

    // Add support for other entity types
    return null;
  }

  /**
   * Copy metadata to movie entity (respecting field locks)
   */
  private async copyMetadataToMovie(movieId: number, cachedMovie: CompleteMovieData): Promise<void> {
    try {
      // Get current movie row to check locks
      const currentMovie = await this.db.get<MovieDatabaseRow>(
        'SELECT * FROM movies WHERE id = ?',
        [movieId]
      );

      if (!currentMovie) {
        logger.warn('[ProviderFetchPhase] Movie not found for metadata copy', { movieId });
        return;
      }

      // Build update object (only unlocked fields)
      const updates: MovieUpdateFields = {};

      if (!currentMovie.title_locked && cachedMovie.title) {
        updates.title = cachedMovie.title;
      }

      if (!currentMovie.title_locked && cachedMovie.original_title) {
        updates.original_title = cachedMovie.original_title;
      }

      // Auto-generate sort_title if not locked and not manually set
      if (!currentMovie.sort_title_locked && !currentMovie.sort_title && cachedMovie.title) {
        updates.sort_title = generateSortTitle(cachedMovie.title);
      }

      if (!currentMovie.plot_locked && cachedMovie.overview) {
        updates.plot = cachedMovie.overview;
      }

      if (cachedMovie.tagline) {
        updates.tagline = cachedMovie.tagline;
      }

      if (cachedMovie.release_date) {
        updates.release_date = cachedMovie.release_date;
        updates.year = new Date(cachedMovie.release_date).getFullYear();
      }

      if (cachedMovie.runtime) {
        updates.runtime = cachedMovie.runtime;
      }

      if (cachedMovie.content_rating) {
        updates.content_rating = cachedMovie.content_rating;
      }

      if (cachedMovie.tmdb_rating !== undefined) {
        updates.tmdb_rating = cachedMovie.tmdb_rating;
      }

      if (cachedMovie.tmdb_votes !== undefined) {
        updates.tmdb_votes = cachedMovie.tmdb_votes;
      }

      if (cachedMovie.imdb_rating !== undefined) {
        updates.imdb_rating = cachedMovie.imdb_rating;
      }

      if (cachedMovie.imdb_votes !== undefined) {
        updates.imdb_votes = cachedMovie.imdb_votes;
      }

      // Read-only metadata fields (no locks)
      if (cachedMovie.budget !== undefined) {
        updates.budget = cachedMovie.budget;
      }

      if (cachedMovie.revenue !== undefined) {
        updates.revenue = cachedMovie.revenue;
      }

      if (cachedMovie.homepage) {
        updates.homepage = cachedMovie.homepage;
      }

      if (cachedMovie.original_language) {
        updates.original_language = cachedMovie.original_language;
      }

      if (cachedMovie.popularity !== undefined) {
        updates.popularity = cachedMovie.popularity;
      }

      if (cachedMovie.status) {
        updates.status = cachedMovie.status;
      }

      // Execute update if we have changes
      if (Object.keys(updates).length > 0) {
        const setClauses = Object.keys(updates).map((key) => `${key} = ?`);
        const values = Object.values(updates);

        await this.db.execute(
          `UPDATE movies SET ${setClauses.join(', ')} WHERE id = ?`,
          [...values, movieId]
        );

        logger.info('[ProviderFetchPhase] Metadata copied to movie', {
          movieId,
          updatedFields: Object.keys(updates),
        });
      } else {
        logger.debug('[ProviderFetchPhase] No metadata updates (all fields locked)', { movieId });
      }

      // Copy related entities to normalized tables
      const relationshipService = new MovieRelationshipService(this.dbManager);

      // Sync genres
      if (cachedMovie.genres && cachedMovie.genres.length > 0) {
        await relationshipService.syncGenres(
          movieId,
          cachedMovie.genres.map((g) => g.name)
        );
      }

      // Sync production companies → studios
      if (cachedMovie.companies && cachedMovie.companies.length > 0) {
        const studioNames = cachedMovie.companies.map((c) => c.name);
        if (studioNames.length > 0) {
          await relationshipService.syncStudios(movieId, studioNames);
        }
      }

      // Sync countries
      if (cachedMovie.countries && cachedMovie.countries.length > 0) {
        const countryNames = cachedMovie.countries.map((c) => c.name);
        if (countryNames.length > 0) {
          await relationshipService.syncCountries(movieId, countryNames);
        }
      }

      // Sync keywords → tags
      if (cachedMovie.keywords && cachedMovie.keywords.length > 0) {
        const tagNames = cachedMovie.keywords.map((k) => k.name);
        if (tagNames.length > 0) {
          await relationshipService.syncTags(movieId, tagNames);
        }
      }

      // Sync crew (directors and writers)
      if (cachedMovie.crew && cachedMovie.crew.length > 0) {
        const directors = cachedMovie.crew
          .filter((c) => c.job === 'Director')
          .map((c) => c.person.name);
        const writers = cachedMovie.crew
          .filter((c) => c.job === 'Writer' || c.job === 'Screenplay' || c.job === 'Story')
          .map((c) => c.person.name);

        if (directors.length > 0) {
          await relationshipService.syncDirectors(movieId, directors);
        }
        if (writers.length > 0) {
          await relationshipService.syncWriters(movieId, writers);
        }
      }
    } catch (error) {
      logger.error('[ProviderFetchPhase] Failed to copy metadata', {
        movieId,
        error: getErrorMessage(error),
      });
      // Don't throw - metadata copy failure shouldn't fail enrichment
    }
  }

  /**
   * Copy external IDs to movie_external_ids table
   */
  private async copyExternalIds(movieId: number, cachedMovie: CompleteMovieData): Promise<void> {
    try {
      // Check if external_ids are present
      if (!cachedMovie.external_ids) {
        return;
      }

      const { facebook_id, instagram_id, twitter_id, wikidata_id } = cachedMovie.external_ids;

      // Skip if no external IDs to save
      if (!facebook_id && !instagram_id && !twitter_id && !wikidata_id) {
        return;
      }

      // Upsert to movie_external_ids table (INSERT or UPDATE if exists)
      // Use COALESCE to preserve existing non-null values
      await this.db.execute(
        `INSERT INTO movie_external_ids (movie_id, facebook_id, instagram_id, twitter_id, wikidata_id, updated_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(movie_id) DO UPDATE SET
           facebook_id = COALESCE(excluded.facebook_id, facebook_id),
           instagram_id = COALESCE(excluded.instagram_id, instagram_id),
           twitter_id = COALESCE(excluded.twitter_id, twitter_id),
           wikidata_id = COALESCE(excluded.wikidata_id, wikidata_id),
           updated_at = CURRENT_TIMESTAMP`,
        [movieId, facebook_id || null, instagram_id || null, twitter_id || null, wikidata_id || null]
      );

      logger.info('[ProviderFetchPhase] External IDs copied to movie', {
        movieId,
        externalIds: { facebook_id, instagram_id, twitter_id, wikidata_id },
      });
    } catch (error) {
      logger.error('[ProviderFetchPhase] Failed to copy external IDs', {
        movieId,
        error: getErrorMessage(error),
      });
      // Don't throw - external ID copy failure shouldn't fail enrichment
    }
  }

  /**
   * Copy cast/crew to actors tables
   */
  private async copyCastToActors(movieId: number, cachedMovie: CompleteMovieData): Promise<void> {
    try {
      if (!cachedMovie.cast || cachedMovie.cast.length === 0) {
        return;
      }

      let actorsCreated = 0;
      let linksCreated = 0;

      for (const castMember of cachedMovie.cast) {
        // Find or create actor
        let actorId: number;

        // Try to find existing actor by tmdb_id first, then by name
        let existingActor = null;
        if (castMember.person.tmdb_person_id) {
          existingActor = await this.db.get<{ id: number }>(
            'SELECT id FROM actors WHERE tmdb_id = ?',
            [castMember.person.tmdb_person_id]
          );
        }

        if (!existingActor) {
          existingActor = await this.db.get<{ id: number }>(
            'SELECT id FROM actors WHERE name = ?',
            [castMember.person.name]
          );
        }

        if (existingActor) {
          actorId = existingActor.id;

          // Update actor IDs if we have better data
          await this.db.execute(
            'UPDATE actors SET tmdb_id = COALESCE(?, tmdb_id), imdb_id = COALESCE(?, imdb_id) WHERE id = ?',
            [castMember.person.tmdb_person_id || null, castMember.person.imdb_person_id || null, actorId]
          );
        } else {
          // Create new actor
          const nameNormalized = this.normalizeActorName(castMember.person.name);
          const result = await this.db.execute(
            'INSERT INTO actors (name, name_normalized, tmdb_id, imdb_id) VALUES (?, ?, ?, ?)',
            [
              castMember.person.name,
              nameNormalized,
              castMember.person.tmdb_person_id || null,
              castMember.person.imdb_person_id || null
            ]
          );
          actorId = result.insertId!;
          actorsCreated++;
        }

        // Link actor to movie (check if exists first since table has no UNIQUE constraint)
        const existingLink = await this.db.get<{ id: number }>(
          'SELECT id FROM movie_actors WHERE movie_id = ? AND actor_id = ?',
          [movieId, actorId]
        );

        if (existingLink) {
          // Update existing link
          await this.db.execute(
            'UPDATE movie_actors SET role = ?, actor_order = ? WHERE id = ?',
            [castMember.character_name || null, castMember.cast_order || null, existingLink.id]
          );
        } else {
          // Create new link
          await this.db.execute(
            'INSERT INTO movie_actors (movie_id, actor_id, role, actor_order) VALUES (?, ?, ?, ?)',
            [movieId, actorId, castMember.character_name || null, castMember.cast_order || null]
          );
        }

        linksCreated++;
      }

      logger.info('[ProviderFetchPhase] Cast copied to actors', {
        movieId,
        actorsCreated,
        linksCreated,
        totalCast: cachedMovie.cast.length,
      });
    } catch (error) {
      logger.error('[ProviderFetchPhase] Failed to copy cast', {
        movieId,
        error: getErrorMessage(error),
      });
      // Don't throw - cast copy failure shouldn't fail enrichment
    }
  }

  /**
   * Populate provider_assets table from cached images
   */
  private async populateProviderAssets(
    entityId: number,
    entityType: string,
    cachedMovie: CompleteMovieData,
    manual: boolean
  ): Promise<number> {
    let assetsFetched = 0;

    if (!cachedMovie.images) {
      return 0;
    }

    for (const image of cachedMovie.images) {
      // Map provider image type to our asset type
      const assetType = this.mapProviderImageType(image.image_type);
      if (!assetType) {
        logger.debug('[ProviderFetchPhase] Skipping unsupported image type', {
          imageType: image.image_type,
          provider: image.provider_name,
        });
        continue;
      }

      // Build full URL
      const fullUrl = this.buildProviderImageUrl(image.provider_name, image.file_path);

      // Check if already exists
      const existing = await this.providerAssetsRepo.findByUrl(fullUrl, entityId, entityType);

      if (existing && !manual) {
        // Automated job: skip known assets
        continue;
      }

      const metadata = {
        vote_average: image.vote_average,
        vote_count: image.vote_count,
        likes: image.likes,
        language: image.iso_639_1 || null,
        iso_639_1: image.iso_639_1,
        is_hd: image.is_hd,
      };

      if (existing && manual) {
        // Manual job: update with fresh metadata
        await this.providerAssetsRepo.update(existing.id, {
          width: image.width || undefined,
          height: image.height || undefined,
          provider_metadata: JSON.stringify(metadata),
        });
      } else {
        // New asset: insert
        await this.providerAssetsRepo.create({
          entity_type: entityType,
          entity_id: entityId,
          asset_type: assetType,
          provider_name: image.provider_name,
          provider_url: fullUrl,
          width: image.width || undefined,
          height: image.height || undefined,
          provider_metadata: JSON.stringify(metadata),
        });
        assetsFetched++;
      }
    }

    return assetsFetched;
  }

  /**
   * Map provider image types to our asset types
   */
  private mapProviderImageType(providerImageType: string): string | null {
    const mapping: Record<string, string> = {
      backdrop: 'fanart',
      poster: 'poster',
      logo: 'clearlogo',
      banner: 'banner',
      clearlogo: 'clearlogo',
      clearart: 'clearart',
      discart: 'discart',
      landscape: 'landscape',
      keyart: 'keyart',
      thumb: 'thumb',
    };

    return mapping[providerImageType] || null;
  }

  /**
   * Build full provider image URL
   */
  private buildProviderImageUrl(providerName: string, filePath: string): string {
    if (providerName === 'tmdb') {
      return `https://image.tmdb.org/t/p/original${filePath}`;
    } else if (providerName === 'fanart.tv') {
      return filePath; // Fanart.tv already provides full URLs
    } else if (providerName === 'tvdb') {
      return `https://artworks.thetvdb.com${filePath}`;
    }

    // Default: assume full URL
    return filePath;
  }

  /**
   * Normalize actor name for deduplication
   * Converts to lowercase and removes extra whitespace
   */
  private normalizeActorName(name: string): string {
    return name.toLowerCase().trim().replace(/\s+/g, ' ');
  }
}
