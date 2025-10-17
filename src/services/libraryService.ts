import { DatabaseManager } from '../database/DatabaseManager.js';
import { DatabaseConnection } from '../types/database.js';
import { Library, MediaLibraryType, DirectoryEntry } from '../types/models.js';
import { logger } from '../middleware/logging.js';
import { validateDirectory, browseDirectory, getAvailableDrives } from './nfo/nfoDiscovery.js';

export class LibraryService {
  constructor(private dbManager: DatabaseManager) {}

  /**
   * Get all libraries
   */
  async getAll(): Promise<Library[]> {
    try {
      const db = this.dbManager.getConnection();
      const rows = await db.query<any[]>('SELECT * FROM libraries ORDER BY name ASC');

      // Add stats to each library
      const libraries = await Promise.all(
        rows.map(async (row) => {
          const library = this.mapRowToLibrary(row);
          library.stats = await this.getLibraryStats(library.id, library.type);
          return library;
        })
      );

      return libraries;
    } catch (error: any) {
      logger.error('Failed to get libraries', { error: error.message });
      throw new Error(`Failed to retrieve libraries: ${error.message}`);
    }
  }

  /**
   * Get library by ID
   */
  async getById(id: number): Promise<Library | null> {
    try {
      const db = this.dbManager.getConnection();
      const rows = await db.query<any[]>('SELECT * FROM libraries WHERE id = ?', [id]);

      if (rows.length === 0) {
        return null;
      }

      const library = this.mapRowToLibrary(rows[0]);

      // Add stats
      library.stats = await this.getLibraryStats(id, library.type);

      return library;
    } catch (error: any) {
      logger.error(`Failed to get library ${id}`, { error: error.message });
      throw new Error(`Failed to retrieve library: ${error.message}`);
    }
  }

  /**
   * Create a new library
   */
  async create(data: {
    name: string;
    type: MediaLibraryType;
    path: string;
  }): Promise<Library> {
    try {
      // Validate the path exists
      const isValid = await validateDirectory(data.path);
      if (!isValid) {
        throw new Error('Directory does not exist or is not accessible');
      }

      const db = this.dbManager.getConnection();
      const result = await db.execute(
        `INSERT INTO libraries (name, type, path)
         VALUES (?, ?, ?)`,
        [data.name, data.type, data.path]
      );

      const insertId = result.insertId;
      if (!insertId) {
        throw new Error('Failed to create library: no insert ID');
      }

      const created = await this.getById(insertId);
      if (!created) {
        throw new Error('Failed to retrieve created library');
      }

      logger.info(`Created library: ${data.name}`, { id: insertId, type: data.type });
      return created;
    } catch (error: any) {
      logger.error('Failed to create library', { error: error.message, data });
      throw new Error(`Failed to create library: ${error.message}`);
    }
  }

  /**
   * Update a library
   */
  async update(
    id: number,
    data: {
      name?: string;
      type?: MediaLibraryType;
      path?: string;
    }
  ): Promise<Library> {
    try {
      // If path is being updated, validate it
      if (data.path) {
        const isValid = await validateDirectory(data.path);
        if (!isValid) {
          throw new Error('Directory does not exist or is not accessible');
        }
      }

      const db = this.dbManager.getConnection();

      // Build dynamic update query
      const updates: string[] = [];
      const values: any[] = [];

      if (data.name !== undefined) {
        updates.push('name = ?');
        values.push(data.name);
      }
      if (data.type !== undefined) {
        updates.push('type = ?');
        values.push(data.type);
      }
      if (data.path !== undefined) {
        updates.push('path = ?');
        values.push(data.path);
      }

      if (updates.length === 0) {
        throw new Error('No fields to update');
      }

      updates.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id);

      await db.execute(`UPDATE libraries SET ${updates.join(', ')} WHERE id = ?`, values);

      const updated = await this.getById(id);
      if (!updated) {
        throw new Error('Library not found after update');
      }

      logger.info(`Updated library ${id}`, { data });
      return updated;
    } catch (error: any) {
      logger.error(`Failed to update library ${id}`, { error: error.message, data });
      throw new Error(`Failed to update library: ${error.message}`);
    }
  }

  /**
   * Delete a library and all associated media records
   * Deletes cached files first, then database records, then orphaned entities
   */
  async delete(id: number): Promise<void> {
    try {
      const db = this.dbManager.getConnection();

      // Check if library exists
      const library = await this.getById(id);
      if (!library) {
        throw new Error('Library not found');
      }

      logger.info(`Starting deletion of library ${library.name}`, { libraryId: id });

      // ========================================
      // Step 1: Delete cached physical files FIRST (while we can still query DB)
      // Query file paths while movies/file records still exist, then delete from disk
      // CRITICAL: Only delete CACHE files, NEVER library files (user's data)
      // ========================================
      await this.deleteCachedPhysicalFiles(db, id);

      // ========================================
      // Step 2: Delete the library
      // CASCADE automatically deletes:
      // - movies → (via trigger) → image_files, video_files, audio_files, text_files, unknown_files
      // - movies → (via FK) → movie_actors, movie_crew, movie_genres, movie_studios, movie_collection_members
      // - series → (via FK) → seasons → (via FK) → episodes → (via trigger) → episode files
      // - series → (via FK) → series_genres, series_studios
      // - artists → (via FK) → albums → (via FK) → tracks
      // ========================================
      await db.execute('DELETE FROM libraries WHERE id = ?', [id]);
      logger.info(`Deleted library ${id} (cascaded all entities and files)`, { name: library.name });

      // ========================================
      // Step 3: Clean up orphaned metadata entities
      // After cascade deletion, some actors/crew/genres may be orphaned (no remaining references)
      // Delete these + their thumbnails from cache
      // ========================================
      await this.cleanupOrphanedEntities(db);

      logger.info(`Completed deletion of library ${id}`, { name: library.name });
    } catch (error: any) {
      logger.error(`Failed to delete library ${id}`, { error: error.message });
      throw new Error(`Failed to delete library: ${error.message}`);
    }
  }

  /**
   * NOTE: File record deletion is now handled by CASCADE DELETE TRIGGERS
   * See migration 20251015_001_clean_schema.ts for trigger definitions
   *
   * Triggers automatically delete file records when parent entities are deleted:
   * - delete_movie_files: movies → image_files, video_files, audio_files, text_files, unknown_files
   * - delete_episode_files: episodes → (same)
   * - delete_series_files: series → image_files, audio_files
   * - delete_season_files: seasons → image_files
   * - delete_actor_files: actors → image_files
   * - delete_artist_files: artists → image_files, audio_files
   */

  /**
   * Delete all cached physical files from disk (unified file system)
   * Note: This queries orphaned file records that were just deleted, so it won't find anything
   * TODO: Query BEFORE deletion to get file paths, or keep file paths list
   */
  private async deleteCachedPhysicalFiles(db: DatabaseConnection, libraryId: number): Promise<void> {
    const fs = await import('fs/promises');

    try {
      let totalDeleted = 0;
      const deletedPaths: string[] = [];

      // Helper function to delete files from cache
      const deleteFiles = async (files: Array<{ file_path: string }>) => {
        for (const file of files) {
          if (!file.file_path) continue;
          try {
            await fs.unlink(file.file_path);
            totalDeleted++;
            deletedPaths.push(file.file_path);
            logger.debug(`Deleted cached file: ${file.file_path}`);
          } catch (err: any) {
            // File might not exist or already deleted
            if (err.code !== 'ENOENT') {
              logger.warn(`Failed to delete cached file: ${file.file_path}`, { error: err.message });
            }
          }
        }
      };

      // ========================================
      // Delete cached image files
      // ========================================
      const images = (await db.query(
        `SELECT DISTINCT file_path
         FROM image_files
         WHERE location = 'cache'
           AND (
             (entity_type = 'movie' AND entity_id IN (SELECT id FROM movies WHERE library_id = ?))
             OR (entity_type = 'episode' AND entity_id IN (
               SELECT e.id FROM episodes e
               INNER JOIN series s ON e.series_id = s.id
               WHERE s.library_id = ?
             ))
           )`,
        [libraryId, libraryId]
      )) as Array<{ file_path: string }>;
      await deleteFiles(images);

      // ========================================
      // Delete cached video files (trailers)
      // ========================================
      const videos = (await db.query(
        `SELECT DISTINCT file_path
         FROM video_files
         WHERE location = 'cache'
           AND (
             (entity_type = 'movie' AND entity_id IN (SELECT id FROM movies WHERE library_id = ?))
             OR (entity_type = 'episode' AND entity_id IN (
               SELECT e.id FROM episodes e
               INNER JOIN series s ON e.series_id = s.id
               WHERE s.library_id = ?
             ))
           )`,
        [libraryId, libraryId]
      )) as Array<{ file_path: string }>;
      await deleteFiles(videos);

      // ========================================
      // Delete cached text files (subtitles, NFOs)
      // ========================================
      const textFiles = (await db.query(
        `SELECT DISTINCT file_path
         FROM text_files
         WHERE location = 'cache'
           AND (
             (entity_type = 'movie' AND entity_id IN (SELECT id FROM movies WHERE library_id = ?))
             OR (entity_type = 'episode' AND entity_id IN (
               SELECT e.id FROM episodes e
               INNER JOIN series s ON e.series_id = s.id
               WHERE s.library_id = ?
             ))
           )`,
        [libraryId, libraryId]
      )) as Array<{ file_path: string }>;
      await deleteFiles(textFiles);

      // ========================================
      // Delete cached audio files (theme songs)
      // ========================================
      const audioFiles = (await db.query(
        `SELECT DISTINCT file_path
         FROM audio_files
         WHERE location = 'cache'
           AND (
             (entity_type = 'movie' AND entity_id IN (SELECT id FROM movies WHERE library_id = ?))
             OR (entity_type = 'episode' AND entity_id IN (
               SELECT e.id FROM episodes e
               INNER JOIN series s ON e.series_id = s.id
               WHERE s.library_id = ?
             ))
           )`,
        [libraryId, libraryId]
      )) as Array<{ file_path: string }>;
      await deleteFiles(audioFiles);

      logger.info(`Deleted ${totalDeleted} cached files for library ${libraryId}`, {
        images: images.length,
        videos: videos.length,
        textFiles: textFiles.length,
        audioFiles: audioFiles.length,
      });

      // ========================================
      // Clean up empty cache directories
      // ========================================
      await this.cleanupEmptyCacheDirectories(libraryId);
    } catch (error: any) {
      logger.error(`Failed to delete cached files for library ${libraryId}`, {
        error: error.message,
      });
      // Don't throw - continue with database deletion even if file deletion fails
    }
  }

  /**
   * Clean up empty cache directories for a deleted library
   * Removes empty movie/series/episode subdirectories from cache
   */
  private async cleanupEmptyCacheDirectories(libraryId: number): Promise<void> {
    const path = await import('path');

    try {
      const cacheBaseDir = path.join(process.cwd(), 'data', 'cache');

      // Check images cache directories
      const imagesCacheDir = path.join(cacheBaseDir, 'images');
      await this.removeEmptyDirectories(imagesCacheDir);

      // Check trailers cache directories
      const trailersCacheDir = path.join(cacheBaseDir, 'trailers');
      await this.removeEmptyDirectories(trailersCacheDir);

      // Check subtitles cache directories
      const subtitlesCacheDir = path.join(cacheBaseDir, 'subtitles');
      await this.removeEmptyDirectories(subtitlesCacheDir);

      logger.debug(`Cleaned up empty cache directories for library ${libraryId}`);
    } catch (error: any) {
      logger.warn(`Failed to clean up empty cache directories for library ${libraryId}`, {
        error: error.message,
      });
    }
  }

  /**
   * Recursively remove empty directories
   */
  private async removeEmptyDirectories(dirPath: string): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');

    try {
      const exists = await fs
        .access(dirPath)
        .then(() => true)
        .catch(() => false);
      if (!exists) return;

      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      // Recursively check subdirectories
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const fullPath = path.join(dirPath, entry.name);
          await this.removeEmptyDirectories(fullPath);
        }
      }

      // After processing subdirectories, check if this directory is now empty
      const updatedEntries = await fs.readdir(dirPath);
      if (updatedEntries.length === 0) {
        await fs.rmdir(dirPath);
        logger.debug(`Removed empty cache directory: ${dirPath}`);
      }
    } catch (error: any) {
      // Ignore errors - directory might be in use or not empty
      logger.debug(`Could not remove directory ${dirPath}: ${error.message}`);
    }
  }

  /**
   * Clean up orphaned metadata entities that are no longer referenced by any media
   * Also deletes their thumbnails from cache via CASCADE trigger (delete_actor_files)
   */
  private async cleanupOrphanedEntities(db: DatabaseConnection): Promise<void> {
    const fs = await import('fs/promises');

    try {
      let totalCleaned = 0;

      // ========================================
      // Step 1: Get orphaned actor IDs BEFORE deletion (to delete their thumbnails)
      // ========================================
      const orphanedActors = (await db.query(
        `SELECT id, thumb_id FROM actors
         WHERE id NOT IN (
           SELECT DISTINCT actor_id FROM movie_actors
           UNION
           SELECT DISTINCT actor_id FROM episode_actors
         )`
      )) as Array<{ id: number; thumb_id: number | null }>;

      // Delete actor thumbnails from cache
      for (const actor of orphanedActors) {
        if (actor.thumb_id) {
          try {
            const thumbs = (await db.query(
              `SELECT file_path FROM image_files
               WHERE id = ? AND location = 'cache'`,
              [actor.thumb_id]
            )) as Array<{ file_path: string }>;

            for (const thumb of thumbs) {
              await fs.unlink(thumb.file_path).catch((err) => {
                if (err.code !== 'ENOENT') {
                  logger.warn(`Failed to delete actor thumbnail: ${thumb.file_path}`, { error: err.message });
                }
              });
            }
          } catch (err: any) {
            logger.warn(`Failed to query actor thumbnail for actor ${actor.id}`, { error: err.message });
          }
        }
      }

      // Delete orphaned actors (trigger will delete their image_files records)
      const actorsResult = await db.execute(`
        DELETE FROM actors
        WHERE id NOT IN (
          SELECT DISTINCT actor_id FROM movie_actors
          UNION
          SELECT DISTINCT actor_id FROM episode_actors
        )
      `);
      const actorsCleaned = actorsResult.affectedRows || 0;
      totalCleaned += actorsCleaned;

      // ========================================
      // Step 2: Get orphaned crew IDs BEFORE deletion (to delete their thumbnails)
      // ========================================
      const orphanedCrew = (await db.query(
        `SELECT id, thumb_id FROM crew
         WHERE id NOT IN (
           SELECT DISTINCT crew_id FROM movie_crew
           UNION
           SELECT DISTINCT crew_id FROM episode_crew
         )`
      )) as Array<{ id: number; thumb_id: number | null }>;

      // Delete crew thumbnails from cache
      for (const crewMember of orphanedCrew) {
        if (crewMember.thumb_id) {
          try {
            const thumbs = (await db.query(
              `SELECT file_path FROM image_files
               WHERE id = ? AND location = 'cache'`,
              [crewMember.thumb_id]
            )) as Array<{ file_path: string }>;

            for (const thumb of thumbs) {
              await fs.unlink(thumb.file_path).catch((err) => {
                if (err.code !== 'ENOENT') {
                  logger.warn(`Failed to delete crew thumbnail: ${thumb.file_path}`, { error: err.message });
                }
              });
            }
          } catch (err: any) {
            logger.warn(`Failed to query crew thumbnail for crew ${crewMember.id}`, { error: err.message });
          }
        }
      }

      // Delete orphaned crew
      const crewResult = await db.execute(`
        DELETE FROM crew
        WHERE id NOT IN (
          SELECT DISTINCT crew_id FROM movie_crew
          UNION
          SELECT DISTINCT crew_id FROM episode_crew
        )
      `);
      const crewCleaned = crewResult.affectedRows || 0;
      totalCleaned += crewCleaned;

      // ========================================
      // Step 3: Clean up genres (no thumbnails)
      // ========================================
      const genresResult = await db.execute(`
        DELETE FROM genres
        WHERE id NOT IN (
          SELECT DISTINCT genre_id FROM movie_genres
          UNION
          SELECT DISTINCT genre_id FROM series_genres
          UNION
          SELECT DISTINCT genre_id FROM music_genres
        )
      `);
      const genresCleaned = genresResult.affectedRows || 0;
      totalCleaned += genresCleaned;

      // ========================================
      // Step 4: Clean up studios (no thumbnails)
      // ========================================
      const studiosResult = await db.execute(`
        DELETE FROM studios
        WHERE id NOT IN (
          SELECT DISTINCT studio_id FROM movie_studios
          UNION
          SELECT DISTINCT studio_id FROM series_studios
        )
      `);
      const studiosCleaned = studiosResult.affectedRows || 0;
      totalCleaned += studiosCleaned;

      logger.info('Cleaned up orphaned entities', {
        actors: actorsCleaned,
        crew: crewCleaned,
        genres: genresCleaned,
        studios: studiosCleaned,
        total: totalCleaned,
      });
    } catch (error: any) {
      logger.error('Failed to clean up orphaned entities', { error: error.message });
      // Don't throw - orphan cleanup is nice-to-have, not critical
    }
  }

  /**
   * NOTE: Old cleanup code removed - countries and tags tables don't exist in current schema
   * If they are added in future, cleanup should follow the same pattern as above:
   * 1. Query orphaned entities
   * 2. Delete their thumbnails (if they have any)
   * 3. Delete the entity records (triggers handle file_records)
   */


  /**
   * Get available drives (Windows only)
   */
  async getAvailableDrives(): Promise<string[]> {
    try {
      return await getAvailableDrives();
    } catch (error: any) {
      logger.error('Failed to get available drives', { error: error.message });
      return [];
    }
  }

  /**
   * Validate a directory path
   */
  async validatePath(path: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const isValid = await validateDirectory(path);

      if (!isValid) {
        return {
          valid: false,
          error: 'Directory does not exist or is not accessible',
        };
      }

      return { valid: true };
    } catch (error: any) {
      logger.error('Failed to validate path', { path, error: error.message });
      return {
        valid: false,
        error: error.message,
      };
    }
  }

  /**
   * Browse a directory (for UI directory picker)
   */
  async browsePath(path: string): Promise<DirectoryEntry[]> {
    try {
      const directories = await browseDirectory(path);

      return directories.map(dir => ({
        name: dir.name,
        path: dir.path,
        isDirectory: true,
      }));
    } catch (error: any) {
      logger.error('Failed to browse path', { path, error: error.message });
      throw new Error(`Failed to browse directory: ${error.message}`);
    }
  }

  /**
   * Get library statistics (total items, counts by identification_status)
   */
  private async getLibraryStats(
    libraryId: number,
    type: MediaLibraryType
  ): Promise<{
    total: number;
    unidentified: number;
    identified: number;
    enriched: number;
    lastScan: string | null;
  }> {
    const db = this.dbManager.getConnection();

    // Determine table name based on library type
    let tableName: string;
    switch (type) {
      case 'movie':
        tableName = 'movies';
        break;
      case 'tv':
        tableName = 'series';
        break;
      case 'music':
        tableName = 'artists';
        break;
      default:
        return {
          total: 0,
          unidentified: 0,
          identified: 0,
          enriched: 0,
          lastScan: null,
        };
    }

    try {
      // Get counts by identification_status
      const statsQuery = `
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN identification_status = 'unidentified' THEN 1 ELSE 0 END) as unidentified,
          SUM(CASE WHEN identification_status = 'identified' THEN 1 ELSE 0 END) as identified,
          SUM(CASE WHEN identification_status = 'enriched' THEN 1 ELSE 0 END) as enriched
        FROM ${tableName}
        WHERE library_id = ?
          AND deleted_at IS NULL
      `;

      const statsRows = await db.query<any>(statsQuery, [libraryId]);
      const stats = (Array.isArray(statsRows) ? statsRows[0] : statsRows) || {
        total: 0,
        unidentified: 0,
        identified: 0,
        enriched: 0,
      };

      // Get last scan time from scan_jobs
      const scanQuery = `
        SELECT completed_at
        FROM scan_jobs
        WHERE library_id = ?
          AND status = 'completed'
        ORDER BY completed_at DESC
        LIMIT 1
      `;

      const scanRows = await db.query<any>(scanQuery, [libraryId]);
      const scanResult = Array.isArray(scanRows) ? scanRows[0] : scanRows;
      const lastScan = scanResult?.completed_at || null;

      return {
        total: Number(stats.total) || 0,
        unidentified: Number(stats.unidentified) || 0,
        identified: Number(stats.identified) || 0,
        enriched: Number(stats.enriched) || 0,
        lastScan,
      };
    } catch (error: any) {
      logger.error(`Failed to get stats for library ${libraryId}`, {
        error: error.message,
      });
      // Return empty stats on error
      return {
        total: 0,
        unidentified: 0,
        identified: 0,
        enriched: 0,
        lastScan: null,
      };
    }
  }

  /**
   * Map database row to Library object
   */
  private mapRowToLibrary(row: any): Library {
    return {
      id: row.id,
      name: row.name,
      type: row.type as MediaLibraryType,
      path: row.path,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
