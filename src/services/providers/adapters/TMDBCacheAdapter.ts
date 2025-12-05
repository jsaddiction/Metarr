/**
 * TMDB Cache Adapter
 *
 * Normalizes TMDB API responses and stores them in the provider cache.
 *
 * Responsibilities:
 * 1. Fetch complete data from TMDB (with append_to_response)
 * 2. Normalize data to our schema
 * 3. Store in provider_cache_* tables
 * 4. Return cached movie ID for hydration
 *
 * Data stored:
 * - Movie metadata (provider_cache_movies)
 * - People (provider_cache_people)
 * - Cast/Crew (provider_cache_movie_cast/crew)
 * - Genres, Companies, Countries, Keywords
 * - Images (posters, backdrops, logos)
 * - Videos (trailers, teasers, clips)
 * - Collection info
 */

import { DatabaseConnection } from '../../../types/database.js';
import { TMDBClient } from '../tmdb/TMDBClient.js';
import {
  TMDBMovie,
  TMDBImage,
  TMDBVideo,
  TMDBCastMember,
  TMDBCrewMember,
  TMDBMovieCollection,
  TMDBMovieReleaseDatesResult,
} from '../../../types/providers/tmdb.js';
import { logger } from '../../../middleware/logging.js';
import { MovieLookupParams } from '../../../types/providerCache.js';

export class TMDBCacheAdapter {
  constructor(
    private db: DatabaseConnection,
    private tmdbClient: TMDBClient
  ) {}

  /**
   * Fetch movie from TMDB and store in cache
   *
   * @param params - Lookup params (tmdb_id or imdb_id)
   * @returns Cache movie ID (provider_cache_movies.id)
   */
  async fetchAndCache(params: MovieLookupParams): Promise<number | null> {
    try {
      // Step 1: Fetch from TMDB with all appends
      const tmdbData = await this.fetchFromTMDB(params);
      if (!tmdbData) return null;

      // Step 2: Store in cache
      const movieCacheId = await this.storeMovie(tmdbData);

      logger.info('[TMDBCacheAdapter] Movie cached successfully', {
        tmdbId: tmdbData.id,
        imdbId: tmdbData.imdb_id,
        movieCacheId,
        title: tmdbData.title,
      });

      return movieCacheId;
    } catch (error) {
      logger.error('[TMDBCacheAdapter] Failed to fetch and cache movie', {
        params,
        error: error instanceof Error ? error.message : error,
      });
      return null;
    }
  }

  /**
   * Fetch complete movie data from TMDB
   */
  private async fetchFromTMDB(params: MovieLookupParams): Promise<TMDBMovie | null> {
    let tmdbId: number | undefined = params.tmdb_id;

    // If we only have IMDB ID, look it up first
    if (!tmdbId && params.imdb_id) {
      const findResult = await this.tmdbClient.findByExternalId({
        externalId: params.imdb_id,
        externalSource: 'imdb_id',
      });

      if (findResult.movie_results && findResult.movie_results.length > 0) {
        tmdbId = findResult.movie_results[0].id;
      }
    }

    if (!tmdbId) {
      logger.warn('[TMDBCacheAdapter] No TMDB ID found', params);
      return null;
    }

    // Fetch complete movie data with all appends
    const movie = await this.tmdbClient.getMovie(tmdbId, {
      appendToResponse: ['credits', 'external_ids', 'release_dates', 'keywords', 'videos', 'images'],
    });

    return movie;
  }

  /**
   * Store movie and all related data in cache
   */
  private async storeMovie(tmdbData: TMDBMovie): Promise<number> {
    // Extract content rating from release_dates
    const contentRating = this.extractContentRating(tmdbData.release_dates);

    // Extract year from release_date
    const year = tmdbData.release_date ? new Date(tmdbData.release_date).getFullYear() : null;

    // Insert/update main movie record
    const result = await this.db.execute(
      `INSERT INTO provider_cache_movies (
        tmdb_id, imdb_id, tvdb_id,
        title, original_title, overview, outline, tagline,
        release_date, year, runtime, status, content_rating,
        tmdb_rating, tmdb_votes, popularity,
        budget, revenue, homepage, adult,
        fetched_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(tmdb_id) DO UPDATE SET
        imdb_id = excluded.imdb_id,
        tvdb_id = excluded.tvdb_id,
        title = excluded.title,
        original_title = excluded.original_title,
        overview = excluded.overview,
        outline = excluded.outline,
        tagline = excluded.tagline,
        release_date = excluded.release_date,
        year = excluded.year,
        runtime = excluded.runtime,
        status = excluded.status,
        content_rating = excluded.content_rating,
        tmdb_rating = excluded.tmdb_rating,
        tmdb_votes = excluded.tmdb_votes,
        popularity = excluded.popularity,
        budget = excluded.budget,
        revenue = excluded.revenue,
        homepage = excluded.homepage,
        adult = excluded.adult,
        fetched_at = CURRENT_TIMESTAMP`,
      [
        tmdbData.id,
        tmdbData.imdb_id || tmdbData.external_ids?.imdb_id,
        tmdbData.external_ids?.tvdb_id,
        tmdbData.title,
        tmdbData.original_title,
        tmdbData.overview,
        null, // outline - TMDB doesn't provide short plot
        tmdbData.tagline,
        tmdbData.release_date,
        year,
        tmdbData.runtime,
        tmdbData.status,
        contentRating,
        tmdbData.vote_average,
        tmdbData.vote_count,
        tmdbData.popularity,
        tmdbData.budget,
        tmdbData.revenue,
        tmdbData.homepage,
        tmdbData.adult ? 1 : 0,
      ]
    );

    // Get the movie cache ID
    // IMPORTANT: For upserts, SQLite's last_insert_rowid() returns 0 or previous ID when row is updated (not inserted).
    // We must query for the actual ID using tmdb_id to get the correct value.
    let movieCacheId = result.insertId;
    if (!movieCacheId || movieCacheId === 0) {
      // Row was updated, not inserted - fetch the actual ID
      const existingRow = await this.db.get<{ id: number }>(
        'SELECT id FROM provider_cache_movies WHERE tmdb_id = ?',
        [tmdbData.id]
      );
      if (!existingRow) {
        throw new Error(`Failed to get provider_cache_movies ID for tmdb_id ${tmdbData.id}`);
      }
      movieCacheId = existingRow.id;
    }

    // Clear old relationships (for updates)
    await this.clearOldRelationships(movieCacheId);

    // Store all related data
    await Promise.all([
      this.storeGenres(movieCacheId, tmdbData.genres),
      this.storeCompanies(movieCacheId, tmdbData.production_companies),
      this.storeCountries(movieCacheId, tmdbData.production_countries),
      this.storeKeywords(movieCacheId, tmdbData.keywords?.keywords),
      this.storeCast(movieCacheId, tmdbData.credits?.cast),
      this.storeCrew(movieCacheId, tmdbData.credits?.crew),
      this.storeImages(movieCacheId, tmdbData.images),
      this.storeVideos(movieCacheId, tmdbData.videos?.results),
      this.storeCollection(movieCacheId, tmdbData.belongs_to_collection),
    ]);

    return movieCacheId;
  }

  /**
   * Clear old relationships before re-inserting
   */
  private async clearOldRelationships(movieCacheId: number): Promise<void> {
    await Promise.all([
      this.db.execute('DELETE FROM provider_cache_movie_genres WHERE movie_cache_id = ?', [movieCacheId]),
      this.db.execute('DELETE FROM provider_cache_movie_companies WHERE movie_cache_id = ?', [movieCacheId]),
      this.db.execute('DELETE FROM provider_cache_movie_countries WHERE movie_cache_id = ?', [movieCacheId]),
      this.db.execute('DELETE FROM provider_cache_movie_keywords WHERE movie_cache_id = ?', [movieCacheId]),
      this.db.execute('DELETE FROM provider_cache_movie_cast WHERE movie_cache_id = ?', [movieCacheId]),
      this.db.execute('DELETE FROM provider_cache_movie_crew WHERE movie_cache_id = ?', [movieCacheId]),
      this.db.execute('DELETE FROM provider_cache_images WHERE entity_type = ? AND entity_cache_id = ?', ['movie', movieCacheId]),
      this.db.execute('DELETE FROM provider_cache_videos WHERE entity_type = ? AND entity_cache_id = ?', ['movie', movieCacheId]),
    ]);
  }

  /**
   * Store genres and link to movie
   */
  private async storeGenres(movieCacheId: number, genres?: Array<{ id: number; name: string }>): Promise<void> {
    if (!genres || genres.length === 0) return;

    for (const genre of genres) {
      // Insert genre if not exists
      await this.db.execute(
        `INSERT OR IGNORE INTO provider_cache_genres (tmdb_genre_id, name) VALUES (?, ?)`,
        [genre.id, genre.name]
      );

      // Get genre ID
      const result = await this.db.query<{ id: number }>(
        'SELECT id FROM provider_cache_genres WHERE tmdb_genre_id = ?',
        [genre.id]
      );

      if (result.length > 0) {
        // Link to movie
        await this.db.execute(
          `INSERT OR IGNORE INTO provider_cache_movie_genres (movie_cache_id, genre_id) VALUES (?, ?)`,
          [movieCacheId, result[0].id]
        );
      }
    }
  }

  /**
   * Store companies and link to movie
   */
  private async storeCompanies(
    movieCacheId: number,
    companies?: Array<{ id: number; name: string; logo_path: string | null; origin_country: string }>
  ): Promise<void> {
    if (!companies || companies.length === 0) return;

    for (const company of companies) {
      // Insert company if not exists
      await this.db.execute(
        `INSERT OR IGNORE INTO provider_cache_companies (tmdb_company_id, name, logo_path, origin_country)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(tmdb_company_id) DO UPDATE SET
           name = excluded.name,
           logo_path = excluded.logo_path,
           origin_country = excluded.origin_country`,
        [company.id, company.name, company.logo_path, company.origin_country]
      );

      // Get company ID
      const result = await this.db.query<{ id: number }>(
        'SELECT id FROM provider_cache_companies WHERE tmdb_company_id = ?',
        [company.id]
      );

      if (result.length > 0) {
        // Link to movie
        await this.db.execute(
          `INSERT OR IGNORE INTO provider_cache_movie_companies (movie_cache_id, company_id) VALUES (?, ?)`,
          [movieCacheId, result[0].id]
        );
      }
    }
  }

  /**
   * Store countries and link to movie
   */
  private async storeCountries(
    movieCacheId: number,
    countries?: Array<{ iso_3166_1: string; name: string }>
  ): Promise<void> {
    if (!countries || countries.length === 0) return;

    for (const country of countries) {
      // Insert country if not exists
      await this.db.execute(
        `INSERT OR IGNORE INTO provider_cache_countries (iso_3166_1, name) VALUES (?, ?)`,
        [country.iso_3166_1, country.name]
      );

      // Get country ID
      const result = await this.db.query<{ id: number }>(
        'SELECT id FROM provider_cache_countries WHERE iso_3166_1 = ?',
        [country.iso_3166_1]
      );

      if (result.length > 0) {
        // Link to movie
        await this.db.execute(
          `INSERT OR IGNORE INTO provider_cache_movie_countries (movie_cache_id, country_id) VALUES (?, ?)`,
          [movieCacheId, result[0].id]
        );
      }
    }
  }

  /**
   * Store keywords and link to movie
   */
  private async storeKeywords(
    movieCacheId: number,
    keywords?: Array<{ id: number; name: string }>
  ): Promise<void> {
    if (!keywords || keywords.length === 0) return;

    for (const keyword of keywords) {
      // Insert keyword if not exists
      await this.db.execute(
        `INSERT OR IGNORE INTO provider_cache_keywords (tmdb_keyword_id, name) VALUES (?, ?)`,
        [keyword.id, keyword.name]
      );

      // Get keyword ID
      const result = await this.db.query<{ id: number }>(
        'SELECT id FROM provider_cache_keywords WHERE tmdb_keyword_id = ?',
        [keyword.id]
      );

      if (result.length > 0) {
        // Link to movie
        await this.db.execute(
          `INSERT OR IGNORE INTO provider_cache_movie_keywords (movie_cache_id, keyword_id) VALUES (?, ?)`,
          [movieCacheId, result[0].id]
        );
      }
    }
  }

  /**
   * Store cast members
   */
  private async storeCast(movieCacheId: number, cast?: TMDBCastMember[]): Promise<void> {
    if (!cast || cast.length === 0) return;

    // Limit to top 50 cast members
    const topCast = cast.slice(0, 50);

    for (const actor of topCast) {
      // Get or create person
      const personCacheId = await this.getOrCreatePerson(
        actor.id,
        actor.name,
        actor.profile_path,
        actor.popularity,
        actor.gender ?? undefined,
        actor.known_for_department
      );

      // Link to movie
      await this.db.execute(
        `INSERT INTO provider_cache_movie_cast (movie_cache_id, person_cache_id, character_name, cast_order)
         VALUES (?, ?, ?, ?)`,
        [movieCacheId, personCacheId, actor.character, actor.order]
      );
    }
  }

  /**
   * Store crew members
   */
  private async storeCrew(movieCacheId: number, crew?: TMDBCrewMember[]): Promise<void> {
    if (!crew || crew.length === 0) return;

    // Filter to key roles
    const keyCrew = crew.filter((c) =>
      ['Director', 'Writer', 'Screenplay', 'Producer', 'Executive Producer', 'Story', 'Cinematography', 'Music'].includes(c.job)
    );

    for (const crewMember of keyCrew) {
      // Get or create person
      const personCacheId = await this.getOrCreatePerson(
        crewMember.id,
        crewMember.name,
        crewMember.profile_path,
        crewMember.popularity,
        crewMember.gender ?? undefined,
        crewMember.known_for_department
      );

      // Link to movie
      await this.db.execute(
        `INSERT INTO provider_cache_movie_crew (movie_cache_id, person_cache_id, job, department)
         VALUES (?, ?, ?, ?)`,
        [movieCacheId, personCacheId, crewMember.job, crewMember.department]
      );
    }
  }

  /**
   * Get or create person in cache
   */
  private async getOrCreatePerson(
    tmdbPersonId: number,
    name: string,
    profilePath: string | null,
    popularity?: number,
    gender?: number,
    knownForDepartment?: string
  ): Promise<number> {
    // Try to find existing
    const existing = await this.db.query<{ id: number }>(
      'SELECT id FROM provider_cache_people WHERE tmdb_person_id = ?',
      [tmdbPersonId]
    );

    if (existing.length > 0) {
      return existing[0].id;
    }

    // Create new
    const result = await this.db.execute(
      `INSERT INTO provider_cache_people (
        tmdb_person_id, name, profile_path, popularity, gender, known_for_department, fetched_at
      ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [tmdbPersonId, name, profilePath, popularity, gender, knownForDepartment]
    );

    return result.insertId!;
  }

  /**
   * Store images (posters, backdrops, logos)
   */
  private async storeImages(
    movieCacheId: number,
    images?: { posters: TMDBImage[]; backdrops: TMDBImage[]; logos: TMDBImage[] }
  ): Promise<void> {
    if (!images) return;

    // Store posters
    if (images.posters) {
      for (const poster of images.posters) {
        await this.storeImage(movieCacheId, 'poster', poster);
      }
    }

    // Store backdrops
    if (images.backdrops) {
      for (const backdrop of images.backdrops) {
        await this.storeImage(movieCacheId, 'backdrop', backdrop);
      }
    }

    // Store logos
    if (images.logos) {
      for (const logo of images.logos) {
        await this.storeImage(movieCacheId, 'logo', logo);
      }
    }
  }

  /**
   * Store a single image
   */
  private async storeImage(movieCacheId: number, imageType: string, image: TMDBImage): Promise<void> {
    await this.db.execute(
      `INSERT INTO provider_cache_images (
        entity_type, entity_cache_id, image_type, provider_name,
        file_path, width, height, aspect_ratio,
        vote_average, vote_count, iso_639_1, fetched_at
      ) VALUES ('movie', ?, ?, 'tmdb', ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        movieCacheId,
        imageType,
        image.file_path,
        image.width,
        image.height,
        image.aspect_ratio,
        image.vote_average,
        image.vote_count,
        image.iso_639_1,
      ]
    );
  }

  /**
   * Store videos (trailers, teasers, clips)
   */
  private async storeVideos(movieCacheId: number, videos?: TMDBVideo[]): Promise<void> {
    if (!videos || videos.length === 0) return;

    for (const video of videos) {
      // Map and normalize TMDB video type to our schema's allowed types
      const mappedType = this.mapVideoType(video.type);

      if (!mappedType) {
        logger.warn('[TMDBCacheAdapter] Skipping video with unsupported type', {
          videoType: video.type,
          videoName: video.name,
          movieCacheId,
        });
        continue; // Skip videos with unrecognized types
      }

      await this.db.execute(
        `INSERT INTO provider_cache_videos (
          entity_type, entity_cache_id, video_type, provider_name, provider_video_id,
          name, site, key, size, published_at, official, iso_639_1, iso_3166_1, fetched_at
        ) VALUES ('movie', ?, ?, 'tmdb', ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          movieCacheId,
          mappedType,
          video.id,
          video.name,
          video.site,
          video.key,
          video.size,
          video.published_at,
          video.official ? 1 : 0,
          video.iso_639_1,
          video.iso_3166_1,
        ]
      );
    }
  }

  /**
   * Map TMDB video type to our schema's allowed types
   *
   * TMDB sends: "Trailer", "Teaser", "Clip", "Featurette", "Behind the Scenes", "Bloopers", "Opening Credits"
   * Schema expects: 'trailer', 'teaser', 'clip', 'featurette', 'behind_the_scenes', 'bloopers', 'opening_credits'
   */
  private mapVideoType(tmdbType: string): string | null {
    const normalized = tmdbType.toLowerCase().replace(/\s+/g, '_');

    const allowedTypes = [
      'trailer',
      'teaser',
      'clip',
      'featurette',
      'behind_the_scenes',
      'bloopers',
      'opening_credits',
    ];

    if (allowedTypes.includes(normalized)) {
      return normalized;
    }

    // Log unrecognized types for future schema updates
    logger.warn('[TMDBCacheAdapter] Unrecognized TMDB video type', {
      tmdbType,
      normalized,
    });

    return null; // Skip this video
  }

  /**
   * Store collection info (if movie belongs to one)
   */
  private async storeCollection(movieCacheId: number, collection: TMDBMovieCollection | null): Promise<void> {
    if (!collection) return;

    // Insert/update collection
    await this.db.execute(
      `INSERT INTO provider_cache_movie_collections (tmdb_collection_id, name, overview, fetched_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(tmdb_collection_id) DO UPDATE SET
         name = excluded.name,
         overview = excluded.overview,
         fetched_at = CURRENT_TIMESTAMP`,
      [collection.id, collection.name, null]
    );

    // Get collection ID
    const result = await this.db.query<{ id: number }>(
      'SELECT id FROM provider_cache_movie_collections WHERE tmdb_collection_id = ?',
      [collection.id]
    );

    if (result.length > 0) {
      // Link movie to collection
      await this.db.execute(
        `INSERT OR IGNORE INTO provider_cache_collection_movies (collection_id, movie_cache_id)
         VALUES (?, ?)`,
        [result[0].id, movieCacheId]
      );
    }
  }

  /**
   * Extract US content rating from release_dates
   */
  private extractContentRating(releaseDates?: { results: TMDBMovieReleaseDatesResult[] }): string | null {
    if (!releaseDates?.results) return null;

    // Find US releases
    const usRelease = releaseDates.results.find((r) => r.iso_3166_1 === 'US');
    if (!usRelease) return null;

    // Find theatrical release (type 3) or primary release (type 2)
    const theatrical = usRelease.release_dates.find((rd) => rd.type === 3 || rd.type === 2);
    return theatrical?.certification || null;
  }
}
