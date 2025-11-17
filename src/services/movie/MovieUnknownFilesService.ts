import { DatabaseManager } from '../../database/DatabaseManager.js';
import { logger } from '../../middleware/logging.js';
import fs from 'fs/promises';
import path from 'path';
import { hashSmallFile } from '../hash/hashService.js';
import { WebSocketBroadcaster } from '../websocketBroadcaster.js';
import { createErrorLogContext } from '../../utils/errorHandling.js';
import { imageProcessor } from '../../utils/ImageProcessor.js';
import { DatabaseConnection } from '../../types/database.js';
import {
  ResourceNotFoundError,
  ValidationError
} from '../../errors/index.js';

/**
 * MovieUnknownFilesService
 *
 * Handles files in movie directories that don't match known patterns.
 * Unknown files are discovered during scanning and can be:
 * - Assigned to a specific asset type (images, trailers, subtitles, themes)
 * - Ignored (remain in library but hidden from unknown files list)
 * - Deleted (removed from filesystem)
 *
 * Assignment Flow:
 * 1. User selects unknown file and chooses asset type
 * 2. File is processed according to two-copy architecture
 * 3. Cache copy created (source of truth)
 * 4. Library copy renamed to Kodi convention if needed
 * 5. Removed from unknown_files table
 *
 * Two-Copy Architecture (Images):
 * - CACHE: Protected storage in data/cache/images/{movieId}/
 * - LIBRARY: Working copy in movie directory with Kodi naming
 *
 * Dependencies:
 * - DatabaseManager: Database operations
 * - WebSocketBroadcaster: Real-time UI updates
 * - hashSmallFile: File content hashing
 * - sharp: Image dimension extraction
 */
export class MovieUnknownFilesService {
  constructor(private readonly db: DatabaseManager) {}

  /**
   * Assign an unknown file to a specific asset type
   * This processes the file as if it were discovered during scanning
   *
   * @param movieId - Movie ID
   * @param fileId - Unknown file ID
   * @param fileType - Asset type (poster, fanart, trailer, subtitle, theme, etc.)
   * @returns Result with success status and message
   */
  async assignUnknownFile(
    movieId: number,
    fileId: number,
    fileType: string
  ): Promise<{ success: boolean; message: string; fileType: string }> {
    const conn = this.db.getConnection();

    try {
      const unknownFileResults = await conn.query(
        'SELECT * FROM unknown_files WHERE id = ? AND entity_id = ? AND entity_type = ?',
        [fileId, movieId, 'movie']
      );

      if (!unknownFileResults || unknownFileResults.length === 0) {
        throw new ResourceNotFoundError(
          'unknown_file',
          fileId,
          'Unknown file not found',
          {
            service: 'MovieUnknownFilesService',
            operation: 'assignUnknownFile',
            metadata: { movieId, fileType }
          }
        );
      }

      const unknownFile = unknownFileResults[0];
      const originalFilePath = unknownFile.file_path;

      // Get movie details
      const movieResults = await conn.query(
        'SELECT id, file_path, title, year FROM movies WHERE id = ?',
        [movieId]
      );

      if (!movieResults || movieResults.length === 0) {
        throw new ResourceNotFoundError(
          'movie',
          movieId,
          'Movie not found',
          {
            service: 'MovieUnknownFilesService',
            operation: 'assignUnknownFile'
          }
        );
      }

      const movie = movieResults[0];
      const movieDir = path.dirname(movie.file_path);
      const movieFileName = path.parse(movie.file_path).name;

      // Validate file type for images
      const imageTypes = [
        'poster',
        'fanart',
        'landscape',
        'keyart',
        'banner',
        'clearart',
        'clearlogo',
        'discart',
      ];

      if (imageTypes.includes(fileType)) {
        await this.assignImageFile(
          movieId,
          fileId,
          originalFilePath,
          fileType,
          movieDir,
          movieFileName,
          conn
        );
      } else if (fileType === 'trailer') {
        await this.assignTrailerFile(
          movieId,
          fileId,
          originalFilePath,
          movieDir,
          movieFileName,
          conn
        );
      } else if (fileType === 'subtitle') {
        await this.assignSubtitleFile(movieId, fileId, originalFilePath, conn);
      } else if (fileType === 'theme') {
        await this.assignThemeFile(
          movieId,
          fileId,
          originalFilePath,
          movieDir,
          movieFileName
        );
      } else {
        throw new ValidationError(
          `Unsupported file type: ${fileType}`,
          {
            service: 'MovieUnknownFilesService',
            operation: 'assignUnknownFile',
            metadata: { movieId, fileId, fileType }
          }
        );
      }

      // Delete from unknown_files table
      await conn.execute('DELETE FROM unknown_files WHERE id = ?', [fileId]);

      // Broadcast update to connected clients
      const broadcaster = WebSocketBroadcaster.getInstance();
      broadcaster.broadcastMoviesUpdated([movieId]);

      return {
        success: true,
        message: `Successfully assigned file as ${fileType}`,
        fileType,
      };
    } catch (error) {
      logger.error('Failed to assign unknown file', createErrorLogContext(error, {
        movieId,
        fileId,
        fileType
      }));
      throw error;
    }
  }

  /**
   * Assign unknown file as image asset
   * Implements two-copy architecture with cache and library copies
   */
  private async assignImageFile(
    movieId: number,
    fileId: number,
    originalFilePath: string,
    fileType: string,
    movieDir: string,
    movieFileName: string,
    conn: DatabaseConnection
  ): Promise<void> {
    const ext = path.extname(originalFilePath);

    // TWO-COPY ARCHITECTURE:
    // 1. Discovered in library → Copy to cache (keep library copy)
    // 2. Library copy must follow Kodi naming convention for media player scans
    // 3. Cache is source of truth for rebuild operations

    let fileHash: string | undefined;
    try {
      const hashResult = await hashSmallFile(originalFilePath);
      fileHash = hashResult.hash;
    } catch (error) {
      logger.warn('Failed to hash image file', createErrorLogContext(error, {
        filePath: originalFilePath
      }));
    }

    // Get image dimensions and file stats
    const stats = await fs.stat(originalFilePath);
    let width: number | undefined;
    let height: number | undefined;

    try {
      const analysis = await imageProcessor.analyzeImage(originalFilePath);
      width = analysis.width;
      height = analysis.height;
    } catch (error) {
      logger.warn('Failed to get image dimensions', createErrorLogContext(error, {
        filePath: originalFilePath
      }));
    }

    // Step 1: Copy to cache (source of truth)
    const cacheDir = path.join(
      process.cwd(),
      'data',
      'cache',
      'images',
      movieId.toString()
    );
    await fs.mkdir(cacheDir, { recursive: true });

    const crypto = await import('crypto');
    const hash = crypto.randomBytes(8).toString('hex');
    const cacheFileName = `${fileType}_${hash}${ext}`;
    const cachePath = path.join(cacheDir, cacheFileName);

    await fs.copyFile(originalFilePath, cachePath);
    logger.debug('Copied image to cache', {
      from: originalFilePath,
      to: cachePath,
    });

    // Step 2: Ensure library file follows Kodi naming convention
    const properFileName = `${movieFileName}-${fileType}${ext}`;
    const properLibraryPath = path.join(movieDir, properFileName);

    let finalLibraryPath = originalFilePath;
    if (originalFilePath !== properLibraryPath) {
      // Check if properly named file already exists
      try {
        await fs.access(properLibraryPath);
        // Properly named file exists - check if it's the same content
        if (await this.areFilesSame(originalFilePath, properLibraryPath)) {
          // Same file, delete the incorrectly named duplicate
          await fs.unlink(originalFilePath);
          finalLibraryPath = properLibraryPath;
          logger.info('Deleted duplicate, using existing Kodi-compliant file', {
            deleted: originalFilePath,
            keeping: properLibraryPath,
          });
        } else {
          // Different content - replace the old one with new assignment
          await fs.unlink(properLibraryPath);
          await fs.rename(originalFilePath, properLibraryPath);
          finalLibraryPath = properLibraryPath;
          logger.info('Replaced existing file with newly assigned image', {
            from: originalFilePath,
            to: properLibraryPath,
          });
        }
      } catch (error) {
        // Properly named file doesn't exist - rename to Kodi convention
        await fs.rename(originalFilePath, properLibraryPath);
        finalLibraryPath = properLibraryPath;
        logger.info('Renamed to Kodi naming convention', {
          from: originalFilePath,
          to: properLibraryPath,
        });
      }
    }

    // Insert cache copy into cache_image_files table
    const cacheResult = await conn.execute(
      `INSERT INTO cache_image_files (
        entity_type, entity_id, image_type, file_path, file_name,
        file_size, file_hash, width, height, format, source_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'movie',
        movieId,
        fileType,
        cachePath,
        path.basename(cachePath),
        stats.size,
        fileHash,
        width,
        height,
        ext.substring(1), // Remove leading dot
        'local',
      ]
    );

    // Insert library copy into library_image_files table
    await conn.execute(
      `INSERT INTO library_image_files (cache_file_id, file_path)
       VALUES (?, ?)`,
      [cacheResult.insertId, finalLibraryPath]
    );

    logger.info('Assigned unknown file as image (two-copy architecture)', {
      movieId,
      fileId,
      fileType,
      cachePath,
      libraryPath: finalLibraryPath,
    });
  }

  /**
   * Assign unknown file as trailer
   */
  private async assignTrailerFile(
    movieId: number,
    fileId: number,
    originalFilePath: string,
    movieDir: string,
    movieFileName: string,
    conn: DatabaseConnection
  ): Promise<void> {
    const ext = path.extname(originalFilePath);
    const newFileName = `${movieFileName}-trailer${ext}`;
    const newFilePath = path.join(movieDir, newFileName);

    let finalFilePath = originalFilePath;
    if (originalFilePath !== newFilePath) {
      try {
        await fs.access(newFilePath);
        if (await this.areFilesSame(originalFilePath, newFilePath)) {
          finalFilePath = newFilePath;
          await fs.unlink(originalFilePath);
        }
      } catch (error) {
        await fs.rename(originalFilePath, newFilePath);
        finalFilePath = newFilePath;
      }
    }

    const stats = await fs.stat(finalFilePath);
    let fileHash: string | undefined;
    try {
      const hashResult = await hashSmallFile(finalFilePath);
      fileHash = hashResult.hash;
    } catch (error) {
      logger.warn('Failed to hash trailer file', createErrorLogContext(error, {
        filePath: finalFilePath
      }));
    }

    // Insert trailer into cache_video_files table (discovered in library)
    const cacheResult = await conn.execute(
      `INSERT INTO cache_video_files (
        entity_type, entity_id, video_type, file_path, file_size, file_hash, source_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['movie', movieId, 'trailer', finalFilePath, stats.size, fileHash, 'local']
    );

    // Also insert into library_video_files
    await conn.execute(
      `INSERT INTO library_video_files (cache_file_id, file_path) VALUES (?, ?)`,
      [cacheResult.insertId, finalFilePath]
    );

    logger.info('Assigned unknown file as trailer', {
      movieId,
      fileId,
      originalPath: originalFilePath,
      finalPath: finalFilePath,
    });
  }

  /**
   * Assign unknown file as subtitle
   */
  private async assignSubtitleFile(
    movieId: number,
    fileId: number,
    originalFilePath: string,
    conn: DatabaseConnection
  ): Promise<void> {
    // Handle subtitle assignment
    await conn.execute(
      `INSERT INTO subtitle_streams (
        entity_type, entity_id, source_type, file_path
      ) VALUES (?, ?, ?, ?)`,
      ['movie', movieId, 'external', originalFilePath]
    );

    logger.info('Assigned unknown file as subtitle', {
      movieId,
      fileId,
      filePath: originalFilePath,
    });
  }

  /**
   * Assign unknown file as theme song
   *
   * NOTE: Theme song implementation is incomplete.
   * Currently renames file to Kodi convention but doesn't store in database.
   */
  private async assignThemeFile(
    movieId: number,
    fileId: number,
    originalFilePath: string,
    movieDir: string,
    movieFileName: string
  ): Promise<void> {
    const ext = path.extname(originalFilePath);
    const newFileName = `${movieFileName}-theme${ext}`;
    const newFilePath = path.join(movieDir, newFileName);

    let finalFilePath = originalFilePath;
    if (originalFilePath !== newFilePath) {
      try {
        await fs.access(newFilePath);
        if (await this.areFilesSame(originalFilePath, newFilePath)) {
          finalFilePath = newFilePath;
          await fs.unlink(originalFilePath);
        }
      } catch (error) {
        await fs.rename(originalFilePath, newFilePath);
        finalFilePath = newFilePath;
      }
    }

    // Store theme in assets table or a dedicated theme table if it exists
    // For now, we'll log it as unhandled
    logger.warn('Theme song assignment not yet fully implemented', {
      movieId,
      fileId,
      filePath: finalFilePath,
    });
  }

  /**
   * Mark an unknown file as ignored
   * File will remain in library but won't appear in unknown files list
   *
   * NOTE: Ignore functionality not yet implemented in schema.
   * The unknown_files table doesn't have an 'ignored' column yet.
   * For now, this is a no-op that returns success.
   *
   * @param movieId - Movie ID
   * @param fileId - Unknown file ID
   * @returns Result with success status and message
   */
  async ignoreUnknownFile(
    movieId: number,
    fileId: number
  ): Promise<{ success: boolean; message: string }> {
    logger.info('Ignore unknown file requested (not implemented)', {
      movieId,
      fileId,
    });

    return {
      success: true,
      message: 'Ignore functionality not yet implemented',
    };
  }

  /**
   * Delete an unknown file from the filesystem
   *
   * @param movieId - Movie ID
   * @param fileId - Unknown file ID
   * @returns Result with success status and message
   */
  async deleteUnknownFile(
    movieId: number,
    fileId: number
  ): Promise<{ success: boolean; message: string }> {
    const conn = this.db.getConnection();

    try {
      const results = await conn.query(
        'SELECT file_path FROM unknown_files WHERE id = ? AND entity_id = ? AND entity_type = ?',
        [fileId, movieId, 'movie']
      );

      if (!results || results.length === 0) {
        throw new ResourceNotFoundError(
          'unknown_file',
          fileId,
          'Unknown file not found',
          {
            service: 'MovieUnknownFilesService',
            operation: 'deleteUnknownFile',
            metadata: { movieId }
          }
        );
      }

      const filePath = results[0].file_path;

      try {
        await fs.unlink(filePath);
        logger.info('Deleted unknown file from filesystem', {
          movieId,
          fileId,
          filePath,
        });
      } catch (error) {
        logger.warn(
          'Failed to delete file from filesystem (may already be deleted)',
          createErrorLogContext(error, {
            movieId,
            fileId,
            filePath
          })
        );
      }

      // Remove from database
      await conn.execute(
        'DELETE FROM unknown_files WHERE id = ? AND entity_id = ? AND entity_type = ?',
        [fileId, movieId, 'movie']
      );

      // Broadcast update to connected clients
      const broadcaster = WebSocketBroadcaster.getInstance();
      broadcaster.broadcastMoviesUpdated([movieId]);

      return {
        success: true,
        message: 'File deleted successfully',
      };
    } catch (error) {
      logger.error('Failed to delete unknown file', createErrorLogContext(error, {
        movieId,
        fileId
      }));
      throw error;
    }
  }

  /**
   * Check if two files have the same content by comparing their hashes
   *
   * @param file1 - First file path
   * @param file2 - Second file path
   * @returns True if files have the same content hash
   */
  private async areFilesSame(file1: string, file2: string): Promise<boolean> {
    try {
      const hash1Result = await hashSmallFile(file1);
      const hash2Result = await hashSmallFile(file2);
      return hash1Result.hash === hash2Result.hash;
    } catch (error) {
      return false;
    }
  }
}
