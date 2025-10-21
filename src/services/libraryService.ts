import { DatabaseManager } from '../database/DatabaseManager.js';
import { DatabaseConnection } from '../types/database.js';
import { Library, MediaLibraryType, DirectoryEntry } from '../types/models.js';
import { logger } from '../middleware/logging.js';
import { validateDirectory, browseDirectory, getAvailableDrives } from './nfo/nfoDiscovery.js';
import { cleanupEmptyCacheDirectories } from './files/cacheCleanup.js';

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
      // Step 1: Delete the library from database
      // CASCADE automatically deletes:
      // - movies → (via trigger) → library_image_files, library_video_files, etc.
      // - movies → (via FK) → movie_actors, movie_crews, movie_genres, etc.
      // - series → (via FK) → seasons → episodes → episode files
      //
      // NOTE: CASCADE does NOT delete cache files - those are shared across libraries!
      // Cache files are only deleted when ALL references are gone (handled by triggers)
      // ========================================
      await db.execute('DELETE FROM libraries WHERE id = ?', [id]);
      logger.info(`Deleted library ${id} (cascaded all entities and library file records)`, { name: library.name });

      // ========================================
      // Step 2: Clean up orphaned metadata entities
      // After cascade deletion, some actors/crew/genres may be orphaned (no remaining references)
      // Delete these entities + their cache images
      // ========================================
      await this.cleanupOrphanedEntities(db);

      // ========================================
      // Step 3: Clean up orphaned cache files
      // After deleting library files and entities, some cache files may now have zero references
      // Delete these orphaned cache files from both database AND disk
      // ========================================
      await this.cleanupOrphanedCacheFiles(db);

      // ========================================
      // Step 4: Clean up empty cache directories
      // Recursively remove any empty directories in cache (after file deletion)
      // This is a simple filesystem cleanup - never deletes files, only empty dirs
      // ========================================
      await cleanupEmptyCacheDirectories();

      logger.info(`Completed deletion of library ${id}`, { name: library.name });
    } catch (error: any) {
      logger.error(`Failed to delete library ${id}`, { error: error.message });
      throw new Error(`Failed to delete library: ${error.message}`);
    }
  }

  /**
   * Clean up orphaned cache files that are no longer referenced by any library files
   *
   * Cache files are shared across libraries. When a library is deleted, the library_*_files
   * records are deleted by CASCADE, but cache_*_files remain. We need to find cache files
   * that have NO remaining references in library_*_files tables and delete them.
   *
   * This handles the scenario:
   * 1. Library A scans movie.mkv → creates library_image_files + cache_image_files
   * 2. Library B scans same movie.mkv → creates another library_image_files, reuses cache_image_files
   * 3. Delete Library A → deletes Library A's library_image_files, cache_image_files still has ref from Library B
   * 4. Delete Library B → deletes Library B's library_image_files, cache_image_files now orphaned
   * 5. This function deletes the orphaned cache_image_files record + physical file
   */
  private async cleanupOrphanedCacheFiles(db: DatabaseConnection): Promise<void> {
    const fs = await import('fs/promises');

    try {
      let totalDeleted = 0;

      // Helper function to delete orphaned cache files
      const deleteOrphanedFiles = async (
        cacheTable: string,
        libraryTable: string
      ): Promise<number> => {
        // Find cache files with no library file references
        const orphanedFiles = (await db.query(
          `SELECT id, file_path
           FROM ${cacheTable}
           WHERE id NOT IN (
             SELECT DISTINCT cache_file_id
             FROM ${libraryTable}
             WHERE cache_file_id IS NOT NULL
           )`,
          []
        )) as Array<{ id: number; file_path: string }>;

        let deleted = 0;

        for (const file of orphanedFiles) {
          try {
            // Delete physical file from disk
            if (file.file_path) {
              await fs.unlink(file.file_path);
              logger.debug(`Deleted orphaned cache file: ${file.file_path}`);
            }

            // Delete cache record from database
            await db.execute(`DELETE FROM ${cacheTable} WHERE id = ?`, [file.id]);
            deleted++;
          } catch (err: any) {
            // File might not exist - that's okay, still delete the record
            if (err.code !== 'ENOENT') {
              logger.warn(`Failed to delete orphaned cache file: ${file.file_path}`, {
                error: err.message,
              });
            }
            // Still delete the database record even if file deletion failed
            await db.execute(`DELETE FROM ${cacheTable} WHERE id = ?`, [file.id]);
            deleted++;
          }
        }

        return deleted;
      };

      // Clean up each cache file type
      const imagesDeleted = await deleteOrphanedFiles('cache_image_files', 'library_image_files');
      const videosDeleted = await deleteOrphanedFiles('cache_video_files', 'library_video_files');
      const textDeleted = await deleteOrphanedFiles('cache_text_files', 'library_text_files');
      const audioDeleted = await deleteOrphanedFiles('cache_audio_files', 'library_audio_files');

      totalDeleted = imagesDeleted + videosDeleted + textDeleted + audioDeleted;

      if (totalDeleted > 0) {
        logger.info(`Deleted ${totalDeleted} orphaned cache files`, {
          images: imagesDeleted,
          videos: videosDeleted,
          text: textDeleted,
          audio: audioDeleted,
        });
      }
    } catch (error: any) {
      logger.error(`Failed to clean up orphaned cache files`, {
        error: error.message,
      });
      // Don't throw - cache cleanup is not critical
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
      // Step 1: Get orphaned actor IDs BEFORE deletion (to delete their cached images)
      // ========================================
      const orphanedActors = (await db.query(
        `SELECT id, image_cache_path FROM actors
         WHERE id NOT IN (
           SELECT DISTINCT actor_id FROM movie_actors
           UNION
           SELECT DISTINCT actor_id FROM episode_actors
         )`
      )) as Array<{ id: number; image_cache_path: string | null }>;

      // Delete actor cached images from filesystem
      for (const actor of orphanedActors) {
        if (actor.image_cache_path) {
          try {
            await fs.unlink(actor.image_cache_path).catch((err) => {
              if (err.code !== 'ENOENT') {
                logger.warn(`Failed to delete actor image: ${actor.image_cache_path}`, { error: err.message });
              }
            });
          } catch (err: any) {
            logger.warn(`Failed to delete actor image for actor ${actor.id}`, { error: err.message });
          }
        }
      }

      // Delete orphaned actors
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
              `SELECT file_path FROM cache_image_files
               WHERE id = ?`,
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
