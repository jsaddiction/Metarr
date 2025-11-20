import { Request, Response, NextFunction } from 'express';
import { DatabaseManager } from '../../database/DatabaseManager.js';
import { logger } from '../../middleware/logging.js';

/**
 * MovieSuggestionsController
 *
 * Provides autocomplete suggestions for movie metadata fields.
 * Fetches unique values from existing movies to populate TagInput dropdowns.
 *
 * All endpoints return sorted arrays of unique strings.
 */
export class MovieSuggestionsController {
  constructor(private dbManager: DatabaseManager) {}

  /**
   * GET /api/movies/suggestions/genres
   * Returns all unique genre names from existing movies
   */
  async getGenres(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const db = this.dbManager.getConnection();
      const results = await db.query<{ name: string }>(
        `SELECT DISTINCT g.name
         FROM genres g
         INNER JOIN movie_genres mg ON g.id = mg.genre_id
         WHERE g.media_type = 'movie'
         ORDER BY g.name ASC`
      );

      const genres = results.map((row) => row.name).filter((name) => name != null);
      res.json(genres);
    } catch (error) {
      logger.error('Error fetching genre suggestions:', error);
      next(error);
    }
  }

  /**
   * GET /api/movies/suggestions/directors
   * Returns all unique director names from existing movies
   */
  async getDirectors(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const db = this.dbManager.getConnection();
      const results = await db.query<{ name: string }>(
        `SELECT DISTINCT c.name
         FROM crew c
         INNER JOIN movie_crew mc ON c.id = mc.crew_id
         WHERE mc.role = 'director'
         ORDER BY c.name ASC`
      );

      const directors = results.map((row) => row.name).filter((name) => name != null);
      res.json(directors);
    } catch (error) {
      logger.error('Error fetching director suggestions:', error);
      next(error);
    }
  }

  /**
   * GET /api/movies/suggestions/writers
   * Returns all unique writer names from existing movies
   */
  async getWriters(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const db = this.dbManager.getConnection();
      const results = await db.query<{ name: string }>(
        `SELECT DISTINCT c.name
         FROM crew c
         INNER JOIN movie_crew mc ON c.id = mc.crew_id
         WHERE mc.role = 'writer'
         ORDER BY c.name ASC`
      );

      const writers = results.map((row) => row.name).filter((name) => name != null);
      res.json(writers);
    } catch (error) {
      logger.error('Error fetching writer suggestions:', error);
      next(error);
    }
  }

  /**
   * GET /api/movies/suggestions/studios
   * Returns all unique studio names from existing movies
   */
  async getStudios(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const db = this.dbManager.getConnection();
      const results = await db.query<{ name: string }>(
        `SELECT DISTINCT s.name
         FROM studios s
         INNER JOIN movie_studios ms ON s.id = ms.studio_id
         ORDER BY s.name ASC`
      );

      const studios = results.map((row) => row.name).filter((name) => name != null);
      res.json(studios);
    } catch (error) {
      logger.error('Error fetching studio suggestions:', error);
      next(error);
    }
  }

  /**
   * GET /api/movies/suggestions/countries
   * Returns all unique country names from existing movies
   */
  async getCountries(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const db = this.dbManager.getConnection();
      const results = await db.query<{ name: string }>(
        `SELECT DISTINCT c.name
         FROM countries c
         INNER JOIN movie_countries mc ON c.id = mc.country_id
         ORDER BY c.name ASC`
      );

      const countries = results.map((row) => row.name).filter((name) => name != null);
      res.json(countries);
    } catch (error) {
      logger.error('Error fetching country suggestions:', error);
      next(error);
    }
  }

  /**
   * GET /api/movies/suggestions/tags
   * Returns all unique tag names from existing movies
   */
  async getTags(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const db = this.dbManager.getConnection();
      const results = await db.query<{ name: string }>(
        `SELECT DISTINCT t.name
         FROM tags t
         INNER JOIN movie_tags mt ON t.id = mt.tag_id
         ORDER BY t.name ASC`
      );

      const tags = results.map((row) => row.name).filter((name) => name != null);
      res.json(tags);
    } catch (error) {
      logger.error('Error fetching tag suggestions:', error);
      next(error);
    }
  }
}
