import { DatabaseManager } from '../../database/DatabaseManager.js';
import { logger } from '../../middleware/logging.js';
import { createErrorLogContext } from '../../utils/errorHandling.js';

/**
 * MovieRelationshipService
 *
 * Manages normalized many-to-many relationships for movies:
 * - Genres (movie_genres)
 * - Directors (movie_crew with role='director')
 * - Writers (movie_crew with role='writer')
 * - Studios (movie_studios)
 * - Countries (movie_countries)
 * - Tags (movie_tags)
 *
 * Each sync method:
 * 1. Finds or creates entity records (genres, crew, studios, etc.)
 * 2. Replaces all junction table entries for the movie
 * 3. Maintains referential integrity
 */
export class MovieRelationshipService {
  constructor(private readonly db: DatabaseManager) {}

  /**
   * Sync genres for a movie
   * Replaces all existing genre associations
   *
   * @param movieId - Movie ID
   * @param genreNames - Array of genre names
   */
  async syncGenres(movieId: number, genreNames: string[]): Promise<void> {
    const conn = this.db.getConnection();

    try {
      // Delete existing associations
      await conn.execute('DELETE FROM movie_genres WHERE movie_id = ?', [movieId]);

      if (genreNames.length === 0) {
        logger.debug('Cleared genres for movie', { movieId });
        return;
      }

      // Batch find or create genre records
      const genreIds: number[] = [];
      for (const name of genreNames) {
        // Find or create genre
        let genre = await conn.get<{ id: number }>(
          `SELECT id FROM genres WHERE name = ? AND media_type = 'movie'`,
          [name]
        );

        if (!genre) {
          const result = await conn.execute(
            `INSERT INTO genres (name, media_type) VALUES (?, 'movie')`,
            [name]
          );
          genre = { id: result.insertId! };
        }

        genreIds.push(genre.id);
      }

      // Bulk insert associations
      if (genreIds.length > 0) {
        const placeholders = genreIds.map(() => '(?, ?)').join(', ');
        const values = genreIds.flatMap(genreId => [movieId, genreId]);

        await conn.execute(
          `INSERT INTO movie_genres (movie_id, genre_id) VALUES ${placeholders}`,
          values
        );
      }

      logger.debug('Synced genres for movie', { movieId, count: genreNames.length });
    } catch (error) {
      logger.error('Failed to sync genres', createErrorLogContext(error, { movieId }));
      throw error;
    }
  }

  /**
   * Sync directors for a movie
   * Replaces all existing director associations
   *
   * @param movieId - Movie ID
   * @param directorNames - Array of director names
   */
  async syncDirectors(movieId: number, directorNames: string[]): Promise<void> {
    await this.syncCrew(movieId, directorNames, 'director');
  }

  /**
   * Sync writers for a movie
   * Replaces all existing writer associations
   *
   * @param movieId - Movie ID
   * @param writerNames - Array of writer names
   */
  async syncWriters(movieId: number, writerNames: string[]): Promise<void> {
    await this.syncCrew(movieId, writerNames, 'writer');
  }

  /**
   * Sync crew members for a specific role
   * Internal method used by syncDirectors and syncWriters
   */
  private async syncCrew(
    movieId: number,
    names: string[],
    role: 'director' | 'writer'
  ): Promise<void> {
    const conn = this.db.getConnection();

    try {
      // Delete existing associations for this role
      await conn.execute(
        'DELETE FROM movie_crew WHERE movie_id = ? AND role = ?',
        [movieId, role]
      );

      if (names.length === 0) {
        logger.debug(`Cleared ${role}s for movie`, { movieId });
        return;
      }

      // Deduplicate names (keep first occurrence with its original order)
      const uniqueNames: string[] = [];
      const seenNames = new Set<string>();
      for (const name of names) {
        if (!seenNames.has(name)) {
          uniqueNames.push(name);
          seenNames.add(name);
        }
      }

      // Batch find or create crew records
      const crewData: Array<{ id: number; sortOrder: number }> = [];
      for (let i = 0; i < uniqueNames.length; i++) {
        const name = uniqueNames[i];

        // Find or create crew member
        let crew = await conn.get<{ id: number }>(
          'SELECT id FROM crew WHERE name = ?',
          [name]
        );

        if (!crew) {
          const result = await conn.execute(
            'INSERT INTO crew (name) VALUES (?)',
            [name]
          );
          crew = { id: result.insertId! };
        }

        crewData.push({ id: crew.id, sortOrder: i });
      }

      // Bulk insert associations with sort order
      if (crewData.length > 0) {
        const placeholders = crewData.map(() => '(?, ?, ?, ?)').join(', ');
        const values = crewData.flatMap(crew => [movieId, crew.id, role, crew.sortOrder]);

        await conn.execute(
          `INSERT INTO movie_crew (movie_id, crew_id, role, sort_order) VALUES ${placeholders}`,
          values
        );
      }

      logger.debug(`Synced ${role}s for movie`, { movieId, count: uniqueNames.length, duplicatesRemoved: names.length - uniqueNames.length });
    } catch (error) {
      logger.error(`Failed to sync ${role}s`, createErrorLogContext(error, { movieId }));
      throw error;
    }
  }

  /**
   * Sync studios for a movie
   * Replaces all existing studio associations
   *
   * @param movieId - Movie ID
   * @param studioNames - Array of studio names
   */
  async syncStudios(movieId: number, studioNames: string[]): Promise<void> {
    const conn = this.db.getConnection();

    try {
      // Delete existing associations
      await conn.execute('DELETE FROM movie_studios WHERE movie_id = ?', [movieId]);

      if (studioNames.length === 0) {
        logger.debug('Cleared studios for movie', { movieId });
        return;
      }

      // Batch find or create studio records
      const studioIds: number[] = [];
      for (const name of studioNames) {
        // Find or create studio
        let studio = await conn.get<{ id: number }>(
          'SELECT id FROM studios WHERE name = ?',
          [name]
        );

        if (!studio) {
          const result = await conn.execute(
            'INSERT INTO studios (name) VALUES (?)',
            [name]
          );
          studio = { id: result.insertId! };
        }

        studioIds.push(studio.id);
      }

      // Bulk insert associations
      if (studioIds.length > 0) {
        const placeholders = studioIds.map(() => '(?, ?)').join(', ');
        const values = studioIds.flatMap(studioId => [movieId, studioId]);

        await conn.execute(
          `INSERT INTO movie_studios (movie_id, studio_id) VALUES ${placeholders}`,
          values
        );
      }

      logger.debug('Synced studios for movie', { movieId, count: studioNames.length });
    } catch (error) {
      logger.error('Failed to sync studios', createErrorLogContext(error, { movieId }));
      throw error;
    }
  }

  /**
   * Sync countries for a movie
   * Replaces all existing country associations
   *
   * @param movieId - Movie ID
   * @param countryNames - Array of country names
   */
  async syncCountries(movieId: number, countryNames: string[]): Promise<void> {
    const conn = this.db.getConnection();

    try {
      // Delete existing associations
      await conn.execute('DELETE FROM movie_countries WHERE movie_id = ?', [movieId]);

      if (countryNames.length === 0) {
        logger.debug('Cleared countries for movie', { movieId });
        return;
      }

      // Batch find or create country records
      const countryIds: number[] = [];
      for (const name of countryNames) {
        // Find or create country
        let country = await conn.get<{ id: number }>(
          'SELECT id FROM countries WHERE name = ?',
          [name]
        );

        if (!country) {
          const result = await conn.execute(
            'INSERT INTO countries (name) VALUES (?)',
            [name]
          );
          country = { id: result.insertId! };
        }

        countryIds.push(country.id);
      }

      // Bulk insert associations
      if (countryIds.length > 0) {
        const placeholders = countryIds.map(() => '(?, ?)').join(', ');
        const values = countryIds.flatMap(countryId => [movieId, countryId]);

        await conn.execute(
          `INSERT INTO movie_countries (movie_id, country_id) VALUES ${placeholders}`,
          values
        );
      }

      logger.debug('Synced countries for movie', { movieId, count: countryNames.length });
    } catch (error) {
      logger.error('Failed to sync countries', createErrorLogContext(error, { movieId }));
      throw error;
    }
  }

  /**
   * Sync tags for a movie
   * Replaces all existing tag associations
   *
   * @param movieId - Movie ID
   * @param tagNames - Array of tag names
   */
  async syncTags(movieId: number, tagNames: string[]): Promise<void> {
    const conn = this.db.getConnection();

    try {
      // Delete existing associations
      await conn.execute('DELETE FROM movie_tags WHERE movie_id = ?', [movieId]);

      if (tagNames.length === 0) {
        logger.debug('Cleared tags for movie', { movieId });
        return;
      }

      // Batch find or create tag records
      const tagIds: number[] = [];
      for (const name of tagNames) {
        // Find or create tag
        let tag = await conn.get<{ id: number }>(
          'SELECT id FROM tags WHERE name = ?',
          [name]
        );

        if (!tag) {
          const result = await conn.execute(
            'INSERT INTO tags (name) VALUES (?)',
            [name]
          );
          tag = { id: result.insertId! };
        }

        tagIds.push(tag.id);
      }

      // Bulk insert associations
      if (tagIds.length > 0) {
        const placeholders = tagIds.map(() => '(?, ?)').join(', ');
        const values = tagIds.flatMap(tagId => [movieId, tagId]);

        await conn.execute(
          `INSERT INTO movie_tags (movie_id, tag_id) VALUES ${placeholders}`,
          values
        );
      }

      logger.debug('Synced tags for movie', { movieId, count: tagNames.length });
    } catch (error) {
      logger.error('Failed to sync tags', createErrorLogContext(error, { movieId }));
      throw error;
    }
  }

  /**
   * Get all genres for a movie
   *
   * @param movieId - Movie ID
   * @returns Array of genre names (empty array if no genres)
   */
  async getGenres(movieId: number): Promise<string[]> {
    const conn = this.db.getConnection();

    try {
      const rows = await conn.query<{ name: string }>(
        `SELECT g.name
         FROM genres g
         INNER JOIN movie_genres mg ON mg.genre_id = g.id
         WHERE mg.movie_id = ? AND g.media_type = 'movie'
         ORDER BY g.name`,
        [movieId]
      );

      return rows.map((row) => row.name);
    } catch (error) {
      logger.error('Failed to get genres', createErrorLogContext(error, { movieId }));
      throw error;
    }
  }

  /**
   * Get all directors for a movie
   *
   * @param movieId - Movie ID
   * @returns Array of director names (empty array if no directors)
   */
  async getDirectors(movieId: number): Promise<string[]> {
    return this.getCrew(movieId, 'director');
  }

  /**
   * Get all writers for a movie
   *
   * @param movieId - Movie ID
   * @returns Array of writer names (empty array if no writers)
   */
  async getWriters(movieId: number): Promise<string[]> {
    return this.getCrew(movieId, 'writer');
  }

  /**
   * Get crew members for a movie by role
   * Internal method used by getDirectors and getWriters
   */
  private async getCrew(movieId: number, role: 'director' | 'writer'): Promise<string[]> {
    const conn = this.db.getConnection();

    try {
      const rows = await conn.query<{ name: string }>(
        `SELECT c.name
         FROM crew c
         INNER JOIN movie_crew mc ON mc.crew_id = c.id
         WHERE mc.movie_id = ? AND mc.role = ?
         ORDER BY mc.sort_order, c.name`,
        [movieId, role]
      );

      return rows.map((row) => row.name);
    } catch (error) {
      logger.error(`Failed to get ${role}s`, createErrorLogContext(error, { movieId, role }));
      throw error;
    }
  }

  /**
   * Get all studios for a movie
   *
   * @param movieId - Movie ID
   * @returns Array of studio names (empty array if no studios)
   */
  async getStudios(movieId: number): Promise<string[]> {
    const conn = this.db.getConnection();

    try {
      const rows = await conn.query<{ name: string }>(
        `SELECT s.name
         FROM studios s
         INNER JOIN movie_studios ms ON ms.studio_id = s.id
         WHERE ms.movie_id = ?
         ORDER BY s.name`,
        [movieId]
      );

      return rows.map((row) => row.name);
    } catch (error) {
      logger.error('Failed to get studios', createErrorLogContext(error, { movieId }));
      throw error;
    }
  }

  /**
   * Get all countries for a movie
   *
   * @param movieId - Movie ID
   * @returns Array of country names (empty array if no countries)
   */
  async getCountries(movieId: number): Promise<string[]> {
    const conn = this.db.getConnection();

    try {
      const rows = await conn.query<{ name: string }>(
        `SELECT c.name
         FROM countries c
         INNER JOIN movie_countries mc ON mc.country_id = c.id
         WHERE mc.movie_id = ?
         ORDER BY c.name`,
        [movieId]
      );

      return rows.map((row) => row.name);
    } catch (error) {
      logger.error('Failed to get countries', createErrorLogContext(error, { movieId }));
      throw error;
    }
  }

  /**
   * Get all tags for a movie
   *
   * @param movieId - Movie ID
   * @returns Array of tag names (empty array if no tags)
   */
  async getTags(movieId: number): Promise<string[]> {
    const conn = this.db.getConnection();

    try {
      const rows = await conn.query<{ name: string }>(
        `SELECT t.name
         FROM tags t
         INNER JOIN movie_tags mt ON mt.tag_id = t.id
         WHERE mt.movie_id = ?
         ORDER BY t.name`,
        [movieId]
      );

      return rows.map((row) => row.name);
    } catch (error) {
      logger.error('Failed to get tags', createErrorLogContext(error, { movieId }));
      throw error;
    }
  }
}
