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

      return rows.map(this.mapRowToLibrary);
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

      return this.mapRowToLibrary(rows[0]);
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
    enabled?: boolean;
  }): Promise<Library> {
    try {
      // Validate the path exists
      const isValid = await validateDirectory(data.path);
      if (!isValid) {
        throw new Error('Directory does not exist or is not accessible');
      }

      const db = this.dbManager.getConnection();
      const result = await db.execute(
        `INSERT INTO libraries (name, type, path, enabled)
         VALUES (?, ?, ?, ?)`,
        [data.name, data.type, data.path, data.enabled ?? true]
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
      enabled?: boolean;
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
      if (data.enabled !== undefined) {
        updates.push('enabled = ?');
        values.push(data.enabled);
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
      // Step 1: Delete cached files for this library
      // ========================================
      await this.deleteCachedFilesForLibrary(db, id);

      // ========================================
      // Step 2: Delete database records for assets (images, trailers, subtitles)
      // These use polymorphic associations so they don't CASCADE automatically
      // ========================================
      await this.deleteAssetRecordsForLibrary(db, id);

      // ========================================
      // Step 3: Delete the library (CASCADE will handle movies, series, and linking tables)
      // ========================================
      await db.execute('DELETE FROM libraries WHERE id = ?', [id]);
      logger.info(`Deleted library ${id} and all associated media records`, { name: library.name });

      // ========================================
      // Step 4: Clean up orphaned entities (actors, genres, etc. with no references)
      // ========================================
      await this.cleanupOrphanedEntities(db);

      logger.info(`Completed deletion of library ${id}`, { name: library.name });
    } catch (error: any) {
      logger.error(`Failed to delete library ${id}`, { error: error.message });
      throw new Error(`Failed to delete library: ${error.message}`);
    }
  }

  /**
   * Delete database records for assets (images, trailers, subtitles)
   * These use polymorphic associations so CASCADE doesn't work automatically
   */
  private async deleteAssetRecordsForLibrary(db: DatabaseConnection, libraryId: number): Promise<void> {
    try {
      // Delete images
      const imagesResult = await db.execute(
        `DELETE FROM images
         WHERE (entity_type = 'movie' AND entity_id IN (SELECT id FROM movies WHERE library_id = ?))
         OR (entity_type = 'series' AND entity_id IN (SELECT id FROM series WHERE library_id = ?))`,
        [libraryId, libraryId]
      );
      const imagesDeleted = imagesResult.affectedRows || 0;

      // Delete trailers
      const trailersResult = await db.execute(
        `DELETE FROM trailers
         WHERE (entity_type = 'movie' AND entity_id IN (SELECT id FROM movies WHERE library_id = ?))
         OR (entity_type = 'series' AND entity_id IN (SELECT id FROM series WHERE library_id = ?))`,
        [libraryId, libraryId]
      );
      const trailersDeleted = trailersResult.affectedRows || 0;

      // Delete subtitles
      const subtitlesResult = await db.execute(
        `DELETE FROM subtitles
         WHERE (entity_type = 'movie' AND entity_id IN (SELECT id FROM movies WHERE library_id = ?))
         OR (entity_type = 'series' AND entity_id IN (SELECT id FROM series WHERE library_id = ?))`,
        [libraryId, libraryId]
      );
      const subtitlesDeleted = subtitlesResult.affectedRows || 0;

      // Delete unknown files
      const unknownFilesResult = await db.execute(
        `DELETE FROM unknown_files
         WHERE entity_type = 'movie' AND entity_id IN (SELECT id FROM movies WHERE library_id = ?)`,
        [libraryId]
      );
      const unknownFilesDeleted = unknownFilesResult.affectedRows || 0;

      logger.info(`Deleted asset records for library ${libraryId}`, {
        images: imagesDeleted,
        trailers: trailersDeleted,
        subtitles: subtitlesDeleted,
        unknownFiles: unknownFilesDeleted,
      });
    } catch (error: any) {
      logger.error(`Failed to delete asset records for library ${libraryId}`, {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Delete all cached files for a library (images, trailers, subtitles, etc.)
   */
  private async deleteCachedFilesForLibrary(db: DatabaseConnection, libraryId: number): Promise<void> {
    const fs = await import('fs/promises');

    try {
      let totalDeleted = 0;

      // ========================================
      // Delete cached images
      // ========================================
      const images = (await db.query(
        `SELECT DISTINCT i.cache_path
         FROM images i
         INNER JOIN movies m ON i.entity_type = 'movie' AND i.entity_id = m.id
         WHERE m.library_id = ? AND i.cache_path IS NOT NULL
         UNION
         SELECT DISTINCT i.cache_path
         FROM images i
         INNER JOIN series s ON i.entity_type = 'series' AND i.entity_id = s.id
         WHERE s.library_id = ? AND i.cache_path IS NOT NULL`,
        [libraryId, libraryId]
      )) as Array<{ cache_path: string }>;

      for (const image of images) {
        try {
          await fs.unlink(image.cache_path);
          totalDeleted++;
          logger.debug(`Deleted cached image: ${image.cache_path}`);
        } catch (err: any) {
          // File might not exist or already deleted
          if (err.code !== 'ENOENT') {
            logger.warn(`Failed to delete cached image: ${image.cache_path}`, { error: err.message });
          }
        }
      }

      // ========================================
      // Delete cached trailers
      // ========================================
      const trailers = (await db.query(
        `SELECT DISTINCT t.cache_path
         FROM trailers t
         INNER JOIN movies m ON t.entity_type = 'movie' AND t.entity_id = m.id
         WHERE m.library_id = ? AND t.cache_path IS NOT NULL
         UNION
         SELECT DISTINCT t.cache_path
         FROM trailers t
         INNER JOIN series s ON t.entity_type = 'series' AND t.entity_id = s.id
         WHERE s.library_id = ? AND t.cache_path IS NOT NULL`,
        [libraryId, libraryId]
      )) as Array<{ cache_path: string }>;

      for (const trailer of trailers) {
        try {
          await fs.unlink(trailer.cache_path);
          totalDeleted++;
          logger.debug(`Deleted cached trailer: ${trailer.cache_path}`);
        } catch (err: any) {
          if (err.code !== 'ENOENT') {
            logger.warn(`Failed to delete cached trailer: ${trailer.cache_path}`, { error: err.message });
          }
        }
      }

      // ========================================
      // Delete cached subtitles
      // ========================================
      const subtitles = (await db.query(
        `SELECT DISTINCT s.cache_path
         FROM subtitles s
         INNER JOIN movies m ON s.entity_type = 'movie' AND s.entity_id = m.id
         WHERE m.library_id = ? AND s.cache_path IS NOT NULL
         UNION
         SELECT DISTINCT s.cache_path
         FROM subtitles sub
         INNER JOIN series ser ON sub.entity_type = 'series' AND sub.entity_id = ser.id
         WHERE ser.library_id = ? AND sub.cache_path IS NOT NULL`,
        [libraryId, libraryId]
      )) as Array<{ cache_path: string }>;

      for (const subtitle of subtitles) {
        try {
          await fs.unlink(subtitle.cache_path);
          totalDeleted++;
          logger.debug(`Deleted cached subtitle: ${subtitle.cache_path}`);
        } catch (err: any) {
          if (err.code !== 'ENOENT') {
            logger.warn(`Failed to delete cached subtitle: ${subtitle.cache_path}`, { error: err.message });
          }
        }
      }

      logger.info(`Deleted ${totalDeleted} cached files for library ${libraryId}`, {
        images: images.length,
        trailers: trailers.length,
        subtitles: subtitles.length,
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
   * Clean up orphaned entities that are no longer referenced by any media
   */
  private async cleanupOrphanedEntities(db: DatabaseConnection): Promise<void> {
    try {
      let totalCleaned = 0;

      // Clean up actors with no references
      const actorsResult = await db.execute(`
        DELETE FROM actors
        WHERE id NOT IN (
          SELECT DISTINCT actor_id FROM movies_actors
          UNION
          SELECT DISTINCT actor_id FROM series_actors
          UNION
          SELECT DISTINCT actor_id FROM episodes_actors
        )
      `);
      const actorsCleaned = actorsResult.affectedRows || 0;
      totalCleaned += actorsCleaned;

      // Clean up genres with no references
      const genresResult = await db.execute(`
        DELETE FROM genres
        WHERE id NOT IN (
          SELECT DISTINCT genre_id FROM movies_genres
          UNION
          SELECT DISTINCT genre_id FROM series_genres
        )
      `);
      const genresCleaned = genresResult.affectedRows || 0;
      totalCleaned += genresCleaned;

      // Clean up directors with no references
      const directorsResult = await db.execute(`
        DELETE FROM directors
        WHERE id NOT IN (
          SELECT DISTINCT director_id FROM movies_directors
          UNION
          SELECT DISTINCT director_id FROM series_directors
          UNION
          SELECT DISTINCT director_id FROM episodes_directors
        )
      `);
      const directorsCleaned = directorsResult.affectedRows || 0;
      totalCleaned += directorsCleaned;

      // Clean up writers with no references
      const writersResult = await db.execute(`
        DELETE FROM writers
        WHERE id NOT IN (
          SELECT DISTINCT writer_id FROM movies_writers
          UNION
          SELECT DISTINCT writer_id FROM series_writers
          UNION
          SELECT DISTINCT writer_id FROM episodes_writers
        )
      `);
      const writersCleaned = writersResult.affectedRows || 0;
      totalCleaned += writersCleaned;

      // Clean up studios with no references
      const studiosResult = await db.execute(`
        DELETE FROM studios
        WHERE id NOT IN (
          SELECT DISTINCT studio_id FROM movies_studios
          UNION
          SELECT DISTINCT studio_id FROM series_studios
        )
      `);
      const studiosCleaned = studiosResult.affectedRows || 0;
      totalCleaned += studiosCleaned;

      // Clean up countries with no references
      const countriesResult = await db.execute(`
        DELETE FROM countries
        WHERE id NOT IN (
          SELECT DISTINCT country_id FROM movies_countries
        )
      `);
      const countriesCleaned = countriesResult.affectedRows || 0;
      totalCleaned += countriesCleaned;

      // Clean up tags with no references
      const tagsResult = await db.execute(`
        DELETE FROM tags
        WHERE id NOT IN (
          SELECT DISTINCT tag_id FROM movies_tags
          UNION
          SELECT DISTINCT tag_id FROM series_tags
        )
      `);
      const tagsCleaned = tagsResult.affectedRows || 0;
      totalCleaned += tagsCleaned;

      if (totalCleaned > 0) {
        logger.info(`Cleaned up ${totalCleaned} orphaned entities`, {
          actors: actorsCleaned,
          genres: genresCleaned,
          directors: directorsCleaned,
          writers: writersCleaned,
          studios: studiosCleaned,
          countries: countriesCleaned,
          tags: tagsCleaned,
        });
      }
    } catch (error: any) {
      logger.error('Failed to cleanup orphaned entities', { error: error.message });
      // Don't throw - this is a cleanup operation
    }
  }

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
   * Map database row to Library object
   */
  private mapRowToLibrary(row: any): Library {
    return {
      id: row.id,
      name: row.name,
      type: row.type as MediaLibraryType,
      path: row.path,
      enabled: Boolean(row.enabled),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
