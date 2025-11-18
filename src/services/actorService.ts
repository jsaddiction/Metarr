import { DatabaseManager } from '../database/DatabaseManager.js';
import { logger } from '../middleware/logging.js';
import { getErrorMessage } from '../utils/errorHandling.js';
import { SqlParam } from '../types/database.js';
import { ResourceNotFoundError } from '../errors/index.js';

export interface Actor {
  id: number;
  name: string;
  name_normalized: string;
  tmdb_id?: number;
  imdb_id?: string;
  image_cache_path?: string;
  image_hash?: string; // SHA256 hash used by frontend to construct /cache/actors/{first2}/{next2}/{hash}.jpg
  image_ctime?: number;
  identification_status: 'identified' | 'enriched';
  enrichment_priority: number;
  name_locked: boolean;
  image_locked: boolean;
  movie_count: number; // Number of movies this actor appears in
  created_at: string;
  updated_at: string;
}

export interface ActorFilters {
  search?: string;
  movieId?: number;
  limit?: number;
  offset?: number;
}

export interface ActorListResult {
  actors: Actor[];
  total: number;
}

/**
 * Database row type for actor queries
 */
interface ActorDatabaseRow {
  id: number;
  name: string;
  name_normalized: string;
  tmdb_id: number | null;
  imdb_id: string | null;
  image_cache_path: string | null;
  image_hash: string | null;
  image_ctime: number | null;
  identification_status: 'identified' | 'enriched' | null;
  enrichment_priority: number | null;
  name_locked: number;
  image_locked: number;
  movie_count: number | null;
  created_at: string;
  updated_at: string;
}

/**
 * Database row type for actor movies query
 */
interface ActorMovieRow {
  id: number;
  title: string;
  year: number | null;
  role: string;
  actor_order: number;
}

export class ActorService {
  constructor(private readonly db: DatabaseManager) {}

  /**
   * Get all actors with optional filters
   */
  async getAll(filters?: ActorFilters): Promise<ActorListResult> {
    const whereClauses: string[] = ['1=1'];
    const params: SqlParam[] = [];

    // Search filter (name contains)
    if (filters?.search) {
      whereClauses.push('(a.name LIKE ? OR a.name_normalized LIKE ?)');
      const searchPattern = `%${filters.search}%`;
      params.push(searchPattern, searchPattern);
    }

    // Filter by movie ID
    if (filters?.movieId) {
      whereClauses.push('EXISTS (SELECT 1 FROM movie_actors WHERE actor_id = a.id AND movie_id = ?)');
      params.push(filters.movieId);
    }

    const limit = filters?.limit || 1000;
    const offset = filters?.offset || 0;

    // Query with movie count
    const query = `
      SELECT
        a.*,
        (SELECT COUNT(*) FROM movie_actors WHERE actor_id = a.id) as movie_count
      FROM actors a
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY a.name ASC
      LIMIT ? OFFSET ?
    `;

    params.push(limit, offset);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM actors a
      WHERE ${whereClauses.join(' AND ')}
    `;

    const [rows, countResult] = await Promise.all([
      this.db.query<ActorDatabaseRow>(query, params),
      this.db.query<{ total: number }>(countQuery, params.slice(0, -2)), // Exclude limit/offset from count
    ]);

    return {
      actors: rows.map(row => this.mapActor(row)),
      total: countResult[0]?.total || 0,
    };
  }

  /**
   * Get actor by ID
   */
  async getById(actorId: number): Promise<Actor | null> {
    const query = `
      SELECT
        a.*,
        (SELECT COUNT(*) FROM movie_actors WHERE actor_id = a.id) as movie_count
      FROM actors a
      WHERE a.id = ?
    `;

    const rows = await this.db.query<ActorDatabaseRow>(query, [actorId]);

    if (!rows || rows.length === 0) {
      return null;
    }

    return this.mapActor(rows[0]);
  }

  /**
   * Get movies for an actor
   */
  async getMoviesForActor(actorId: number): Promise<ActorMovieRow[]> {
    const query = `
      SELECT
        m.id,
        m.title,
        m.year,
        ma.role,
        ma.actor_order
      FROM movies m
      INNER JOIN movie_actors ma ON m.id = ma.movie_id
      WHERE ma.actor_id = ?
      ORDER BY m.year DESC, m.title ASC
    `;

    return this.db.query<ActorMovieRow>(query, [actorId]);
  }

  /**
   * Update actor information
   */
  async updateActor(actorId: number, data: Partial<Actor>): Promise<Actor | null> {
    const conn = this.db.getConnection();

    try {
      const updateFields: string[] = [];
      const updateValues: SqlParam[] = [];

      // Fields that can be updated
      const allowedFields = ['name', 'tmdb_id', 'imdb_id', 'identification_status', 'enrichment_priority'];

      for (const field of allowedFields) {
        if (data.hasOwnProperty(field)) {
          updateFields.push(`${field} = ?`);
          updateValues.push((data as any)[field]);
        }
      }

      if (data.name !== undefined) {
        updateFields.push('name_locked = 1');
      }

      if (updateFields.length === 0) {
        return await this.getById(actorId);
      }

      // Add updated_at
      updateFields.push('updated_at = CURRENT_TIMESTAMP');

      // Add actorId to the end
      updateValues.push(actorId);

      const query = `UPDATE actors SET ${updateFields.join(', ')} WHERE id = ?`;

      await conn.execute(query, updateValues);

      logger.info('Actor updated', { actorId, updatedFields: Object.keys(data) });

      return await this.getById(actorId);
    } catch (error) {
      logger.error('Failed to update actor', {
        actorId,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Delete actor (only if not linked to any movies)
   */
  async deleteActor(actorId: number): Promise<{ success: boolean; message: string }> {
    const conn = this.db.getConnection();

    try {
      // Check if actor is linked to any movies
      const movieLinks = await conn.query(
        'SELECT COUNT(*) as count FROM movie_actors WHERE actor_id = ?',
        [actorId]
      );

      if (movieLinks && movieLinks.length > 0 && movieLinks[0].count > 0) {
        return {
          success: false,
          message: `Cannot delete actor - linked to ${movieLinks[0].count} movie(s)`,
        };
      }

      // Delete actor
      await conn.execute('DELETE FROM actors WHERE id = ?', [actorId]);

      logger.info('Actor deleted', { actorId });

      return {
        success: true,
        message: 'Actor deleted successfully',
      };
    } catch (error) {
      logger.error('Failed to delete actor', {
        actorId,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Merge two actors (combine all movie links into target actor, delete source)
   */
  async mergeActors(sourceActorId: number, targetActorId: number): Promise<{ success: boolean; message: string }> {
    const conn = this.db.getConnection();

    try {
      // Get both actors to verify they exist
      const [sourceActor, targetActor] = await Promise.all([
        this.getById(sourceActorId),
        this.getById(targetActorId),
      ]);

      if (!sourceActor || !targetActor) {
        throw new ResourceNotFoundError(
          'actor',
          !sourceActor ? sourceActorId : targetActorId,
          'One or both actors not found',
          {
            service: 'ActorService',
            operation: 'mergeActors',
            metadata: { sourceActorId, targetActorId }
          }
        );
      }

      // Move all movie_actors links from source to target
      // Handle duplicates by deleting the source link if target already linked
      const sourceLinks = await conn.query(
        'SELECT movie_id, role, actor_order FROM movie_actors WHERE actor_id = ?',
        [sourceActorId]
      );

      for (const link of sourceLinks) {
        // Check if target already linked to this movie
        const existing = await conn.query(
          'SELECT id FROM movie_actors WHERE actor_id = ? AND movie_id = ?',
          [targetActorId, link.movie_id]
        );

        if (existing && existing.length > 0) {
          // Target already linked - just delete source link
          await conn.execute(
            'DELETE FROM movie_actors WHERE actor_id = ? AND movie_id = ?',
            [sourceActorId, link.movie_id]
          );
        } else {
          // Target not linked - update source link to target
          await conn.execute(
            'UPDATE movie_actors SET actor_id = ? WHERE actor_id = ? AND movie_id = ?',
            [targetActorId, sourceActorId, link.movie_id]
          );
        }
      }

      // Delete source actor
      await conn.execute('DELETE FROM actors WHERE id = ?', [sourceActorId]);

      logger.info('Actors merged', {
        sourceActorId,
        sourceName: sourceActor.name,
        targetActorId,
        targetName: targetActor.name,
      });

      return {
        success: true,
        message: `Merged "${sourceActor.name}" into "${targetActor.name}"`,
      };
    } catch (error) {
      logger.error('Failed to merge actors', {
        sourceActorId,
        targetActorId,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Set lock status for actor fields
   */
  async setFieldLock(
    actorId: number,
    field: 'name' | 'image',
    locked: boolean
  ): Promise<void> {
    const conn = this.db.getConnection();
    const lockField = field === 'name' ? 'name_locked' : 'image_locked';

    await conn.execute(
      `UPDATE actors SET ${lockField} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [locked ? 1 : 0, actorId]
    );

    logger.info('Actor field lock updated', { actorId, field, locked });
  }

  /**
   * Get actors that need enrichment (identified but not enriched)
   */
  async getActorsForEnrichment(limit: number = 10): Promise<Actor[]> {
    const query = `
      SELECT
        a.*,
        (SELECT COUNT(*) FROM movie_actors WHERE actor_id = a.id) as movie_count
      FROM actors a
      WHERE a.identification_status = 'identified'
      ORDER BY a.enrichment_priority ASC, a.created_at ASC
      LIMIT ?
    `;

    const rows = await this.db.query<ActorDatabaseRow>(query, [limit]);
    return rows.map(row => this.mapActor(row));
  }

  /**
   * Map database row to Actor interface
   */
  private mapActor(row: ActorDatabaseRow): Actor {
    const actor: Actor = {
      id: row.id,
      name: row.name,
      name_normalized: row.name_normalized,
      identification_status: row.identification_status || 'identified',
      enrichment_priority: row.enrichment_priority || 5,
      name_locked: Boolean(row.name_locked),
      image_locked: Boolean(row.image_locked),
      movie_count: row.movie_count || 0,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };

    // Add optional properties explicitly
    if (row.tmdb_id !== null && row.tmdb_id !== undefined) {
      actor.tmdb_id = row.tmdb_id;
    }
    if (row.imdb_id !== null && row.imdb_id !== undefined) {
      actor.imdb_id = row.imdb_id;
    }
    if (row.image_cache_path !== null && row.image_cache_path !== undefined) {
      actor.image_cache_path = row.image_cache_path;
    }
    if (row.image_hash !== null && row.image_hash !== undefined) {
      actor.image_hash = row.image_hash;
    }
    if (row.image_ctime !== null && row.image_ctime !== undefined) {
      actor.image_ctime = row.image_ctime;
    }

    return actor;
  }
}
