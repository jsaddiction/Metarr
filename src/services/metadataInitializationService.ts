import { DatabaseManager } from '../database/DatabaseManager.js';
import { logger } from '../middleware/logging.js';
import { FullMovieNFO, FullTVShowNFO, ActorData, RatingData } from '../types/models.js';

export class MetadataInitializationService {
  constructor(private dbManager: DatabaseManager) {}

  // ========================================
  // Main Initialization Methods
  // ========================================

  /**
   * Initialize or update a movie with full NFO metadata
   */
  async initializeMovie(filePath: string, nfoData: FullMovieNFO): Promise<number> {
    const db = this.dbManager.getConnection();

    try {
      // Check if movie already exists
      const existing = await db.query<any[]>('SELECT id FROM movies WHERE file_path = ?', [
        filePath,
      ]);

      let movieId: number;
      let setId: number | null = null;

      // Handle set if provided
      if (nfoData.set) {
        setId = await this.upsertSet(nfoData.set.name, nfoData.set.overview);
      }

      if (existing.length > 0) {
        // UPDATE existing movie
        movieId = (existing[0] as any).id;
        await db.execute(
          `UPDATE movies SET
            title = ?, original_title = ?, sort_title = ?, year = ?,
            plot = ?, tagline = ?, runtime = ?, user_rating = ?,
            premiered = ?, mpaa = ?, trailer_url = ?, set_id = ?,
            tmdb_id = ?, imdb_id = ?, status = ?,
            nfo_parsed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
          [
            nfoData.title || null,
            nfoData.originalTitle || null,
            nfoData.sortTitle || null,
            nfoData.year || null,
            nfoData.plot || null,
            nfoData.tagline || null,
            nfoData.runtime || null,
            nfoData.userRating || null,
            nfoData.premiered || null,
            nfoData.mpaa || null,
            nfoData.trailerUrl || null,
            setId,
            nfoData.tmdbId || null,
            nfoData.imdbId || null,
            nfoData.ambiguous
              ? 'failed'
              : nfoData.tmdbId || nfoData.imdbId
                ? 'pending_metadata'
                : 'needs_identification',
            movieId,
          ]
        );

        logger.debug(`Updated movie ${movieId} with NFO data`, { filePath, title: nfoData.title });

        // Replace all relationships
        await this.replaceMovieActors(movieId, nfoData.actors || []);
        await this.replaceMovieGenres(movieId, nfoData.genres || []);
        await this.replaceMovieDirectors(movieId, nfoData.directors || []);
        await this.replaceMovieWriters(movieId, nfoData.credits || []);
        await this.replaceMovieStudios(movieId, nfoData.studios || []);
        await this.replaceMovieCountries(movieId, nfoData.countries || []);
        await this.replaceMovieTags(movieId, nfoData.tags || []);
        await this.replaceMovieRatings(movieId, nfoData.ratings || []);
      } else {
        // INSERT new movie
        const result = await db.execute(
          `INSERT INTO movies (
            file_path, title, original_title, sort_title, year,
            plot, tagline, runtime, user_rating, premiered, mpaa,
            trailer_url, set_id, tmdb_id, imdb_id, status, nfo_parsed_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [
            filePath,
            nfoData.title || null,
            nfoData.originalTitle || null,
            nfoData.sortTitle || null,
            nfoData.year || null,
            nfoData.plot || null,
            nfoData.tagline || null,
            nfoData.runtime || null,
            nfoData.userRating || null,
            nfoData.premiered || null,
            nfoData.mpaa || null,
            nfoData.trailerUrl || null,
            setId,
            nfoData.tmdbId || null,
            nfoData.imdbId || null,
            nfoData.ambiguous
              ? 'failed'
              : nfoData.tmdbId || nfoData.imdbId
                ? 'pending_metadata'
                : 'needs_identification',
          ]
        );

        movieId = result.insertId!;
        logger.info(`Created new movie ${movieId} from NFO`, { filePath, title: nfoData.title });

        // Create all relationships
        await this.replaceMovieActors(movieId, nfoData.actors || []);
        await this.replaceMovieGenres(movieId, nfoData.genres || []);
        await this.replaceMovieDirectors(movieId, nfoData.directors || []);
        await this.replaceMovieWriters(movieId, nfoData.credits || []);
        await this.replaceMovieStudios(movieId, nfoData.studios || []);
        await this.replaceMovieCountries(movieId, nfoData.countries || []);
        await this.replaceMovieTags(movieId, nfoData.tags || []);
        await this.replaceMovieRatings(movieId, nfoData.ratings || []);
      }

      return movieId;
    } catch (error: any) {
      logger.error('Failed to initialize movie', { error: error.message, filePath });
      throw error;
    }
  }

  /**
   * Initialize or update a TV show with full NFO metadata
   */
  async initializeTVShow(folderPath: string, nfoData: FullTVShowNFO): Promise<number> {
    const db = this.dbManager.getConnection();

    try {
      const existing = await db.query<any[]>('SELECT id FROM series WHERE directory_path = ?', [
        folderPath,
      ]);

      let tvshowId: number;

      if (existing.length > 0) {
        // UPDATE existing TV show
        tvshowId = (existing[0] as any).id;
        await db.execute(
          `UPDATE series SET
            title = ?, original_title = ?, sort_title = ?, year = ?,
            plot = ?, user_rating = ?, premiered = ?,
            mpaa = ?, status = ?, tmdb_id = ?, tvdb_id = ?, imdb_id = ?,
            nfo_parsed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
          [
            nfoData.title || null,
            nfoData.originalTitle || null,
            nfoData.sortTitle || null,
            nfoData.year || null,
            nfoData.plot || null,
            nfoData.userRating || null,
            nfoData.premiered || null,
            nfoData.mpaa || null,
            nfoData.status || null,
            nfoData.tmdbId || null,
            nfoData.tvdbId || null,
            nfoData.imdbId || null,
            tvshowId,
          ]
        );

        logger.debug(`Updated TV show ${tvshowId} with NFO data`, {
          folderPath,
          title: nfoData.title,
        });

        // Replace all relationships
        await this.replaceTVShowActors(tvshowId, nfoData.actors || []);
        await this.replaceTVShowGenres(tvshowId, nfoData.genres || []);
        await this.replaceTVShowDirectors(tvshowId, nfoData.directors || []);
        await this.replaceTVShowStudios(tvshowId, nfoData.studios || []);
        await this.replaceTVShowTags(tvshowId, nfoData.tags || []);
        await this.replaceTVShowRatings(tvshowId, nfoData.ratings || []);
      } else {
        // INSERT new TV show
        const result = await db.execute(
          `INSERT INTO series (
            directory_path, title, original_title, sort_title, year,
            plot, user_rating, premiered, mpaa, status,
            tmdb_id, tvdb_id, imdb_id, nfo_parsed_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [
            folderPath,
            nfoData.title || null,
            nfoData.originalTitle || null,
            nfoData.sortTitle || null,
            nfoData.year || null,
            nfoData.plot || null,
            nfoData.userRating || null,
            nfoData.premiered || null,
            nfoData.mpaa || null,
            nfoData.status || null,
            nfoData.tmdbId || null,
            nfoData.tvdbId || null,
            nfoData.imdbId || null,
          ]
        );

        tvshowId = result.insertId!;
        logger.info(`Created new TV show ${tvshowId} from NFO`, {
          folderPath,
          title: nfoData.title,
        });

        // Create all relationships
        await this.replaceTVShowActors(tvshowId, nfoData.actors || []);
        await this.replaceTVShowGenres(tvshowId, nfoData.genres || []);
        await this.replaceTVShowDirectors(tvshowId, nfoData.directors || []);
        await this.replaceTVShowStudios(tvshowId, nfoData.studios || []);
        await this.replaceTVShowTags(tvshowId, nfoData.tags || []);
        await this.replaceTVShowRatings(tvshowId, nfoData.ratings || []);
      }

      return tvshowId;
    } catch (error: any) {
      logger.error('Failed to initialize TV show', { error: error.message, folderPath });
      throw error;
    }
  }

  // ========================================
  // Entity Upsert Methods
  // ========================================

  /**
   * Upsert a movie set by name
   */
  async upsertSet(name: string, overview?: string): Promise<number> {
    const db = this.dbManager.getConnection();

    const existing = await db.query<any[]>('SELECT id FROM sets WHERE name = ?', [name]);

    if (existing.length > 0) {
      const setId = (existing[0] as any).id;
      // Update overview if provided
      if (overview) {
        await db.execute(
          'UPDATE sets SET overview = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [overview, setId]
        );
      }
      return setId;
    } else {
      const result = await db.execute('INSERT INTO sets (name, overview) VALUES (?, ?)', [
        name,
        overview || null,
      ]);
      return result.insertId!;
    }
  }

  /**
   * Upsert actors and return name->id mapping
   */
  async upsertActors(actorsData: ActorData[]): Promise<Map<string, number>> {
    const db = this.dbManager.getConnection();
    const actorMap = new Map<string, number>();

    for (const actor of actorsData) {
      const existing = await db.query<any[]>('SELECT id FROM actors WHERE name = ?', [actor.name]);

      if (existing.length > 0) {
        const actorId = (existing[0] as any).id;
        actorMap.set(actor.name, actorId);
        // Update thumb if provided
        if (actor.thumb) {
          await db.execute('UPDATE actors SET thumb_url = ? WHERE id = ?', [actor.thumb, actorId]);
        }
      } else {
        const result = await db.execute('INSERT INTO actors (name, thumb_url) VALUES (?, ?)', [
          actor.name,
          actor.thumb || null,
        ]);
        actorMap.set(actor.name, result.insertId!);
      }
    }

    return actorMap;
  }

  /**
   * Upsert genres and return name->id mapping
   */
  async upsertGenres(genreNames: string[]): Promise<Map<string, number>> {
    const db = this.dbManager.getConnection();
    const genreMap = new Map<string, number>();

    for (const name of genreNames) {
      const existing = await db.query<any[]>('SELECT id FROM genres WHERE name = ?', [name]);

      if (existing.length > 0) {
        genreMap.set(name, (existing[0] as any).id);
      } else {
        const result = await db.execute('INSERT INTO genres (name) VALUES (?)', [name]);
        genreMap.set(name, result.insertId!);
      }
    }

    return genreMap;
  }

  /**
   * Upsert directors and return name->id mapping
   */
  async upsertDirectors(directorNames: string[]): Promise<Map<string, number>> {
    const db = this.dbManager.getConnection();
    const directorMap = new Map<string, number>();

    for (const name of directorNames) {
      const existing = await db.query<any[]>('SELECT id FROM directors WHERE name = ?', [name]);

      if (existing.length > 0) {
        directorMap.set(name, (existing[0] as any).id);
      } else {
        const result = await db.execute('INSERT INTO directors (name) VALUES (?)', [name]);
        directorMap.set(name, result.insertId!);
      }
    }

    return directorMap;
  }

  /**
   * Upsert writers and return name->id mapping
   */
  async upsertWriters(writerNames: string[]): Promise<Map<string, number>> {
    const db = this.dbManager.getConnection();
    const writerMap = new Map<string, number>();

    for (const name of writerNames) {
      const existing = await db.query<any[]>('SELECT id FROM writers WHERE name = ?', [name]);

      if (existing.length > 0) {
        writerMap.set(name, (existing[0] as any).id);
      } else {
        const result = await db.execute('INSERT INTO writers (name) VALUES (?)', [name]);
        writerMap.set(name, result.insertId!);
      }
    }

    return writerMap;
  }

  /**
   * Upsert studios and return name->id mapping
   */
  async upsertStudios(studioNames: string[]): Promise<Map<string, number>> {
    const db = this.dbManager.getConnection();
    const studioMap = new Map<string, number>();

    for (const name of studioNames) {
      const existing = await db.query<any[]>('SELECT id FROM studios WHERE name = ?', [name]);

      if (existing.length > 0) {
        studioMap.set(name, (existing[0] as any).id);
      } else {
        const result = await db.execute('INSERT INTO studios (name) VALUES (?)', [name]);
        studioMap.set(name, result.insertId!);
      }
    }

    return studioMap;
  }

  /**
   * Upsert countries and return name->id mapping
   */
  async upsertCountries(countryNames: string[]): Promise<Map<string, number>> {
    const db = this.dbManager.getConnection();
    const countryMap = new Map<string, number>();

    for (const name of countryNames) {
      const existing = await db.query<any[]>('SELECT id FROM countries WHERE name = ?', [name]);

      if (existing.length > 0) {
        countryMap.set(name, (existing[0] as any).id);
      } else {
        const result = await db.execute('INSERT INTO countries (name) VALUES (?)', [name]);
        countryMap.set(name, result.insertId!);
      }
    }

    return countryMap;
  }

  /**
   * Upsert tags and return name->id mapping
   */
  async upsertTags(tagNames: string[]): Promise<Map<string, number>> {
    const db = this.dbManager.getConnection();
    const tagMap = new Map<string, number>();

    for (const name of tagNames) {
      const existing = await db.query<any[]>('SELECT id FROM tags WHERE name = ?', [name]);

      if (existing.length > 0) {
        tagMap.set(name, (existing[0] as any).id);
      } else {
        const result = await db.execute('INSERT INTO tags (name) VALUES (?)', [name]);
        tagMap.set(name, result.insertId!);
      }
    }

    return tagMap;
  }

  // ========================================
  // Movie Relationship Replacement Methods
  // ========================================

  async replaceMovieActors(movieId: number, actorsData: ActorData[]): Promise<void> {
    const db = this.dbManager.getConnection();

    // Delete existing links
    await db.execute('DELETE FROM movies_actors WHERE movie_id = ?', [movieId]);

    if (actorsData.length === 0) return;

    // Upsert all actors
    const actorMap = await this.upsertActors(actorsData);

    // Create new links
    for (const actor of actorsData) {
      const actorId = actorMap.get(actor.name);
      if (actorId) {
        await db.execute(
          'INSERT INTO movies_actors (movie_id, actor_id, role, `order`) VALUES (?, ?, ?, ?)',
          [movieId, actorId, actor.role || null, actor.order || null]
        );
      }
    }
  }

  async replaceMovieGenres(movieId: number, genreNames: string[]): Promise<void> {
    const db = this.dbManager.getConnection();
    await db.execute('DELETE FROM movies_genres WHERE movie_id = ?', [movieId]);

    if (genreNames.length === 0) return;

    const genreMap = await this.upsertGenres(genreNames);
    for (const [_name, genreId] of genreMap.entries()) {
      await db.execute('INSERT INTO movies_genres (movie_id, genre_id) VALUES (?, ?)', [
        movieId,
        genreId,
      ]);
    }
  }

  async replaceMovieDirectors(movieId: number, directorNames: string[]): Promise<void> {
    const db = this.dbManager.getConnection();
    await db.execute('DELETE FROM movies_directors WHERE movie_id = ?', [movieId]);

    if (directorNames.length === 0) return;

    const directorMap = await this.upsertDirectors(directorNames);
    for (const [_name, directorId] of directorMap.entries()) {
      await db.execute('INSERT INTO movies_directors (movie_id, director_id) VALUES (?, ?)', [
        movieId,
        directorId,
      ]);
    }
  }

  async replaceMovieWriters(movieId: number, writerNames: string[]): Promise<void> {
    const db = this.dbManager.getConnection();
    await db.execute('DELETE FROM movies_writers WHERE movie_id = ?', [movieId]);

    if (writerNames.length === 0) return;

    const writerMap = await this.upsertWriters(writerNames);
    for (const [_name, writerId] of writerMap.entries()) {
      await db.execute('INSERT INTO movies_writers (movie_id, writer_id) VALUES (?, ?)', [
        movieId,
        writerId,
      ]);
    }
  }

  async replaceMovieStudios(movieId: number, studioNames: string[]): Promise<void> {
    const db = this.dbManager.getConnection();
    await db.execute('DELETE FROM movies_studios WHERE movie_id = ?', [movieId]);

    if (studioNames.length === 0) return;

    const studioMap = await this.upsertStudios(studioNames);
    for (const [_name, studioId] of studioMap.entries()) {
      await db.execute('INSERT INTO movies_studios (movie_id, studio_id) VALUES (?, ?)', [
        movieId,
        studioId,
      ]);
    }
  }

  async replaceMovieCountries(movieId: number, countryNames: string[]): Promise<void> {
    const db = this.dbManager.getConnection();
    await db.execute('DELETE FROM movies_countries WHERE movie_id = ?', [movieId]);

    if (countryNames.length === 0) return;

    const countryMap = await this.upsertCountries(countryNames);
    for (const [_name, countryId] of countryMap.entries()) {
      await db.execute('INSERT INTO movies_countries (movie_id, country_id) VALUES (?, ?)', [
        movieId,
        countryId,
      ]);
    }
  }

  async replaceMovieTags(movieId: number, tagNames: string[]): Promise<void> {
    const db = this.dbManager.getConnection();
    await db.execute('DELETE FROM movies_tags WHERE movie_id = ?', [movieId]);

    if (tagNames.length === 0) return;

    const tagMap = await this.upsertTags(tagNames);
    for (const [_name, tagId] of tagMap.entries()) {
      await db.execute('INSERT INTO movies_tags (movie_id, tag_id) VALUES (?, ?)', [
        movieId,
        tagId,
      ]);
    }
  }

  async replaceMovieRatings(movieId: number, ratingsData: RatingData[]): Promise<void> {
    const db = this.dbManager.getConnection();
    await db.execute('DELETE FROM ratings WHERE entity_type = ? AND entity_id = ?', [
      'movie',
      movieId,
    ]);

    if (ratingsData.length === 0) return;

    for (const rating of ratingsData) {
      await db.execute(
        'INSERT INTO ratings (entity_type, entity_id, source, value, votes, is_default) VALUES (?, ?, ?, ?, ?, ?)',
        [
          'movie',
          movieId,
          rating.source,
          rating.value,
          rating.votes || null,
          rating.default || false,
        ]
      );
    }
  }

  // ========================================
  // TV Show Relationship Replacement Methods
  // ========================================

  async replaceTVShowActors(tvshowId: number, actorsData: ActorData[]): Promise<void> {
    const db = this.dbManager.getConnection();
    await db.execute('DELETE FROM series_actors WHERE series_id = ?', [tvshowId]);

    if (actorsData.length === 0) return;

    const actorMap = await this.upsertActors(actorsData);
    for (const actor of actorsData) {
      const actorId = actorMap.get(actor.name);
      if (actorId) {
        await db.execute(
          'INSERT INTO series_actors (series_id, actor_id, role, `order`) VALUES (?, ?, ?, ?)',
          [tvshowId, actorId, actor.role || null, actor.order || null]
        );
      }
    }
  }

  async replaceTVShowGenres(tvshowId: number, genreNames: string[]): Promise<void> {
    const db = this.dbManager.getConnection();
    await db.execute('DELETE FROM series_genres WHERE series_id = ?', [tvshowId]);

    if (genreNames.length === 0) return;

    const genreMap = await this.upsertGenres(genreNames);
    for (const [_name, genreId] of genreMap.entries()) {
      await db.execute('INSERT INTO series_genres (series_id, genre_id) VALUES (?, ?)', [
        tvshowId,
        genreId,
      ]);
    }
  }

  async replaceTVShowDirectors(tvshowId: number, directorNames: string[]): Promise<void> {
    const db = this.dbManager.getConnection();
    await db.execute('DELETE FROM series_directors WHERE series_id = ?', [tvshowId]);

    if (directorNames.length === 0) return;

    const directorMap = await this.upsertDirectors(directorNames);
    for (const [_name, directorId] of directorMap.entries()) {
      await db.execute('INSERT INTO series_directors (series_id, director_id) VALUES (?, ?)', [
        tvshowId,
        directorId,
      ]);
    }
  }

  async replaceTVShowStudios(tvshowId: number, studioNames: string[]): Promise<void> {
    const db = this.dbManager.getConnection();
    await db.execute('DELETE FROM series_studios WHERE series_id = ?', [tvshowId]);

    if (studioNames.length === 0) return;

    const studioMap = await this.upsertStudios(studioNames);
    for (const [_name, studioId] of studioMap.entries()) {
      await db.execute('INSERT INTO series_studios (series_id, studio_id) VALUES (?, ?)', [
        tvshowId,
        studioId,
      ]);
    }
  }

  async replaceTVShowTags(tvshowId: number, tagNames: string[]): Promise<void> {
    const db = this.dbManager.getConnection();
    await db.execute('DELETE FROM series_tags WHERE series_id = ?', [tvshowId]);

    if (tagNames.length === 0) return;

    const tagMap = await this.upsertTags(tagNames);
    for (const [_name, tagId] of tagMap.entries()) {
      await db.execute('INSERT INTO series_tags (series_id, tag_id) VALUES (?, ?)', [
        tvshowId,
        tagId,
      ]);
    }
  }

  async replaceTVShowRatings(tvshowId: number, ratingsData: RatingData[]): Promise<void> {
    const db = this.dbManager.getConnection();
    await db.execute('DELETE FROM ratings WHERE entity_type = ? AND entity_id = ?', [
      'tvshow',
      tvshowId,
    ]);

    if (ratingsData.length === 0) return;

    for (const rating of ratingsData) {
      await db.execute(
        'INSERT INTO ratings (entity_type, entity_id, source, value, votes, is_default) VALUES (?, ?, ?, ?, ?, ?)',
        [
          'tvshow',
          tvshowId,
          rating.source,
          rating.value,
          rating.votes || null,
          rating.default || false,
        ]
      );
    }
  }

  // ========================================
  // Orphan Cleanup Methods
  // ========================================

  async cleanupOrphanedSets(): Promise<number> {
    const db = this.dbManager.getConnection();
    const result = await db.execute(`
      DELETE FROM sets
      WHERE id NOT IN (
        SELECT DISTINCT set_id FROM movies WHERE set_id IS NOT NULL
      )
    `);
    logger.debug(`Cleaned up ${result.affectedRows} orphaned sets`);
    return result.affectedRows || 0;
  }

  async cleanupOrphanedActors(): Promise<number> {
    const db = this.dbManager.getConnection();
    const result = await db.execute(`
      DELETE FROM actors WHERE id NOT IN (
        SELECT DISTINCT actor_id FROM movies_actors
        UNION
        SELECT DISTINCT actor_id FROM series_actors
        UNION
        SELECT DISTINCT actor_id FROM episodes_actors
      )
    `);
    logger.debug(`Cleaned up ${result.affectedRows} orphaned actors`);
    return result.affectedRows || 0;
  }

  async cleanupOrphanedGenres(): Promise<number> {
    const db = this.dbManager.getConnection();
    const result = await db.execute(`
      DELETE FROM genres WHERE id NOT IN (
        SELECT DISTINCT genre_id FROM movies_genres
        UNION
        SELECT DISTINCT genre_id FROM series_genres
      )
    `);
    logger.debug(`Cleaned up ${result.affectedRows} orphaned genres`);
    return result.affectedRows || 0;
  }

  async cleanupOrphanedDirectors(): Promise<number> {
    const db = this.dbManager.getConnection();
    const result = await db.execute(`
      DELETE FROM directors WHERE id NOT IN (
        SELECT DISTINCT director_id FROM movies_directors
        UNION
        SELECT DISTINCT director_id FROM series_directors
        UNION
        SELECT DISTINCT director_id FROM episodes_directors
      )
    `);
    logger.debug(`Cleaned up ${result.affectedRows} orphaned directors`);
    return result.affectedRows || 0;
  }

  async cleanupOrphanedWriters(): Promise<number> {
    const db = this.dbManager.getConnection();
    const result = await db.execute(`
      DELETE FROM writers WHERE id NOT IN (
        SELECT DISTINCT writer_id FROM movies_writers
        UNION
        SELECT DISTINCT writer_id FROM series_writers
        UNION
        SELECT DISTINCT writer_id FROM episodes_writers
      )
    `);
    logger.debug(`Cleaned up ${result.affectedRows} orphaned writers`);
    return result.affectedRows || 0;
  }

  async cleanupOrphanedStudios(): Promise<number> {
    const db = this.dbManager.getConnection();
    const result = await db.execute(`
      DELETE FROM studios WHERE id NOT IN (
        SELECT DISTINCT studio_id FROM movies_studios
        UNION
        SELECT DISTINCT studio_id FROM series_studios
      )
    `);
    logger.debug(`Cleaned up ${result.affectedRows} orphaned studios`);
    return result.affectedRows || 0;
  }

  async cleanupOrphanedTags(): Promise<number> {
    const db = this.dbManager.getConnection();
    const result = await db.execute(`
      DELETE FROM tags WHERE id NOT IN (
        SELECT DISTINCT tag_id FROM movies_tags
        UNION
        SELECT DISTINCT tag_id FROM series_tags
      )
    `);
    logger.debug(`Cleaned up ${result.affectedRows} orphaned tags`);
    return result.affectedRows || 0;
  }

  async cleanupOrphanedCountries(): Promise<number> {
    const db = this.dbManager.getConnection();
    const result = await db.execute(`
      DELETE FROM countries WHERE id NOT IN (
        SELECT DISTINCT country_id FROM movies_countries
      )
    `);
    logger.debug(`Cleaned up ${result.affectedRows} orphaned countries`);
    return result.affectedRows || 0;
  }

  /**
   * Cleanup all orphaned entities
   */
  async cleanupAllOrphans(): Promise<void> {
    logger.info('Starting orphan cleanup...');
    await this.cleanupOrphanedSets();
    await this.cleanupOrphanedActors();
    await this.cleanupOrphanedGenres();
    await this.cleanupOrphanedDirectors();
    await this.cleanupOrphanedWriters();
    await this.cleanupOrphanedStudios();
    await this.cleanupOrphanedTags();
    await this.cleanupOrphanedCountries();
    logger.info('Orphan cleanup completed');
  }
}
