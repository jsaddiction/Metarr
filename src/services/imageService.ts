import { DatabaseManager } from '../database/DatabaseManager.js';
import fs from 'fs-extra';
import * as fsSync from 'fs'; // For createReadStream
import * as path from 'path';
import axios from 'axios';
import sharp from 'sharp';
import { logger } from '../middleware/logging.js';
import {
  cacheImageFile,
} from './files/unifiedFileService.js';
import { DatabaseConnection } from '../types/database.js';
import { getErrorMessage } from '../utils/errorHandling.js';
import { SqlParam } from '../types/database.js';

export interface Image {
  id: number;
  entity_type: 'movie' | 'series' | 'season' | 'episode';
  entity_id: number;
  image_type: string;
  url: string | null;
  file_path: string | null;
  cache_path: string | null;
  width: number | null;
  height: number | null;
  vote_average: number | null;
  locked: boolean;
  perceptual_hash: string | null;
  deleted_on: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProviderImage {
  url: string;
  width: number;
  height: number;
  vote_average: number;
  file_path: string;
  providerName?: string;
}

export class ImageService {
  private cacheDir: string;
  private tempDir: string;

  constructor(private dbManager: DatabaseManager) {
    this.cacheDir = path.join(process.cwd(), 'data', 'cache', 'images');
    this.tempDir = path.join(process.cwd(), 'data', 'temp', 'images');
  }

  async initialize(): Promise<void> {
    await fs.ensureDir(this.cacheDir);
    await fs.ensureDir(this.tempDir);
  }

  /**
   * Get all images for an entity (unified file system)
   * Returns cache files (location='cache') for the entity
   */
  async getImages(entityType: string, entityId: number, imageType?: string): Promise<any[]> {
    let query = `
      SELECT
        id, entity_type, entity_id, file_path, file_name, file_size, file_hash,
        perceptual_hash, location, image_type, width, height, format,
        source_type, source_url, provider_name, classification_score,
        is_published, library_file_id, cache_file_id, reference_count,
        discovered_at, last_accessed_at,
        is_locked as locked,
        NULL as vote_average,
        source_url as url,
        NULL as deleted_on,
        discovered_at as created_at,
        last_accessed_at as updated_at
      FROM cache_image_files
      WHERE entity_type = ? AND entity_id = ?
    `;
    const params: SqlParam[] = [entityType, entityId];

    if (imageType) {
      query += ' AND image_type = ?';
      params.push(imageType);
    }

    query += ' ORDER BY classification_score DESC, width * height DESC, discovered_at DESC';

    const rows = await this.dbManager.query<any>(query, params);
    return rows;
  }

  /**
   * Get single image by ID (unified file system)
   */
  async getImageById(imageId: number): Promise<any | null> {
    const rows = await this.dbManager.query<any>(
      `SELECT
        id, entity_type, entity_id, file_path, file_name, file_size, file_hash,
        perceptual_hash, image_type, width, height, format,
        source_type, source_url, provider_name, classification_score,
        is_locked, discovered_at, last_accessed_at,
        file_path as cache_path,
        source_url as url,
        NULL as deleted_on,
        is_locked as locked,
        NULL as vote_average,
        discovered_at as created_at,
        last_accessed_at as updated_at
      FROM cache_image_files
      WHERE id = ?`,
      [imageId]
    );
    return rows[0] || null;
  }

  /**
   * Download image from provider URL and store in unified file system
   * Returns the cache file ID
   */
  async downloadImageToCache(
    url: string,
    entityId: number,
    entityType: 'movie' | 'episode' | 'series' | 'season' | 'actor',
    imageType: string,
    providerName: string
  ): Promise<number> {
    const db = this.dbManager.getConnection() as DatabaseConnection;

    // Download to temp location
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);

    // Determine file extension from content-type or URL
    const contentType = response.headers['content-type'];
    let ext = '.jpg';
    if (contentType?.includes('png')) ext = '.png';
    else if (url.match(/\.(png|jpg|jpeg)$/i)) {
      ext = url.match(/\.(png|jpg|jpeg)$/i)![0];
    }

    // Save to temp file
    const tempPath = path.join(
      this.tempDir,
      `provider_${Date.now()}_${Math.random().toString(36).substr(2, 9)}${ext}`
    );
    await fs.writeFile(tempPath, buffer);

    try {
      // Cache using unified file service (handles deduplication)
      const cacheFileId = await cacheImageFile(
        db,
        null, // No library file ID (this is from provider)
        tempPath,
        entityType,
        entityId,
        imageType,
        'provider',
        url,
        providerName
      );

      logger.info('Downloaded and cached provider image', {
        cacheFileId,
        providerName,
        imageType,
        entityId,
        url
      });

      return cacheFileId;
    } finally {
      // Cleanup temp file
      if (await fs.pathExists(tempPath)) {
        await fs.remove(tempPath);
      }
    }
  }

  /**
   * Calculate perceptual hash for duplicate detection
   */
  async calculatePerceptualHash(imagePath: string): Promise<string> {
    const image = sharp(imagePath);

    // Resize to 8x8 grayscale for pHash
    const resized = await image.resize(8, 8, { fit: 'fill' }).grayscale().raw().toBuffer();

    // Calculate average pixel value
    let sum = 0;
    for (let i = 0; i < resized.length; i++) {
      sum += resized[i];
    }
    const avg = sum / resized.length;

    // Generate hash: 1 if pixel > avg, 0 otherwise
    let hash = '';
    for (let i = 0; i < resized.length; i++) {
      hash += resized[i] > avg ? '1' : '0';
    }

    // Convert binary string to hex
    const hex = BigInt('0b' + hash)
      .toString(16)
      .padStart(16, '0');
    return hex;
  }

  /**
   * Compare two perceptual hashes (0.0 = completely different, 1.0 = identical)
   */
  compareHashes(hash1: string, hash2: string): number {
    const bin1 = BigInt('0x' + hash1)
      .toString(2)
      .padStart(64, '0');
    const bin2 = BigInt('0x' + hash2)
      .toString(2)
      .padStart(64, '0');

    let distance = 0;
    for (let i = 0; i < bin1.length; i++) {
      if (bin1[i] !== bin2[i]) distance++;
    }

    const maxDistance = bin1.length;
    return 1 - distance / maxDistance;
  }

  /**
   * Get image dimensions
   */
  async getImageDimensions(imagePath: string): Promise<{ width: number; height: number }> {
    const metadata = await sharp(imagePath).metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;
    return { width, height };
  }

  /**
   * Select best N images from provider candidates using unified file system
   * Downloads images, stores in cache, and updates movie FK columns
   */
  async selectImages(
    entityId: number,
    entityType: 'movie' | 'episode' | 'series' | 'season' | 'actor',
    imageType: string,
    candidates: ProviderImage[],
    requiredCount: number,
    providerName: string = 'unknown'
  ): Promise<number[]> {
    const db = this.dbManager.getConnection() as DatabaseConnection;

    // Sort candidates by vote_average and resolution
    const sorted = candidates.sort((a, b) => {
      if (b.vote_average !== a.vote_average) {
        return b.vote_average - a.vote_average;
      }
      return b.width * b.height - a.width * a.height;
    });

    // Download top candidates to temp directory
    const tempDownloads = [];
    for (const candidate of sorted.slice(0, Math.min(sorted.length, requiredCount * 3))) {
      const tempPath = path.join(
        this.tempDir,
        `${entityId}_${imageType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}${path.extname(candidate.file_path)}`
      );

      try {
        const response = await axios.get(candidate.url, { responseType: 'arraybuffer' });
        await fs.writeFile(tempPath, Buffer.from(response.data));

        const pHash = await this.calculatePerceptualHash(tempPath);
        const dimensions = await this.getImageDimensions(tempPath);

        tempDownloads.push({
          ...candidate,
          tempPath,
          pHash,
          ...dimensions,
        });
      } catch (error) {
        logger.error(`Failed to download candidate image: ${candidate.url}`, error);
      }
    }

    // Select top N, filtering duplicates by perceptual hash
    const selected = [];
    const selectedHashes: string[] = [];

    for (const candidate of tempDownloads) {
      if (selected.length >= requiredCount) break;

      // Check similarity against already-selected images
      let isSimilar = false;
      for (const selectedHash of selectedHashes) {
        const similarity = this.compareHashes(candidate.pHash, selectedHash);
        if (similarity > 0.9) {
          isSimilar = true;
          break;
        }
      }

      if (!isSimilar) {
        selected.push(candidate);
        selectedHashes.push(candidate.pHash);
      }
    }

    // Cache selected images using unified file service
    const cacheFileIds: number[] = [];
    for (const candidate of selected) {
      try {
        const cacheFileId = await cacheImageFile(
          db,
          null, // No library file ID (from provider)
          candidate.tempPath,
          entityType,
          entityId,
          imageType,
          'provider',
          candidate.url,
          candidate.providerName || providerName
        );

        cacheFileIds.push(cacheFileId);

        logger.info('Selected and cached provider image', {
          cacheFileId,
          providerName: candidate.providerName || providerName,
          imageType,
          entityId,
          voteAverage: candidate.vote_average,
          dimensions: `${candidate.width}x${candidate.height}`
        });
      } catch (error) {
        logger.error('Failed to cache selected image', {
          imageType,
          entityId,
          url: candidate.url,
          error: getErrorMessage(error)
        });
      }
    }

    // Cleanup temp files
    for (const download of tempDownloads) {
      if (await fs.pathExists(download.tempPath)) {
        await fs.remove(download.tempPath);
      }
    }

    // Update movie FK column if this is a primary image type
    if (cacheFileIds.length > 0 && (entityType === 'movie' || entityType === 'series')) {
      const primaryImageTypes = ['poster', 'fanart', 'banner', 'clearlogo', 'clearart', 'landscape'];
      if (primaryImageTypes.includes(imageType)) {
        const columnName = `${imageType}_id`;
        const tableName = entityType === 'movie' ? 'movies' : 'series';

        try {
          await db.execute(
            `UPDATE ${tableName} SET ${columnName} = ? WHERE id = ?`,
            [cacheFileIds[0], entityId] // Use first (best) image
          );

          logger.debug('Updated entity FK column', {
            tableName,
            columnName,
            entityId,
            cacheFileId: cacheFileIds[0]
          });
        } catch (error) {
          // Column may not exist for this entity type, that's OK
          logger.debug('Failed to update entity FK column (may not exist)', {
            tableName,
            columnName,
            error: getErrorMessage(error)
          });
        }
      }
    }

    return cacheFileIds;
  }

  /**
   * Upload custom user image using unified file system
   * Returns cache file ID
   */
  async uploadCustomImage(
    entityType: 'movie' | 'episode' | 'series' | 'season' | 'actor',
    entityId: number,
    imageType: string,
    buffer: Buffer,
    filename: string
  ): Promise<number> {
    const db = this.dbManager.getConnection() as DatabaseConnection;

    // Save to temp first
    const ext = path.extname(filename);
    const tempPath = path.join(
      this.tempDir,
      `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}${ext}`
    );
    await fs.writeFile(tempPath, buffer);

    try {
      // Cache using unified file service
      const cacheFileId = await cacheImageFile(
        db,
        null, // No library file ID (user upload)
        tempPath,
        entityType,
        entityId,
        imageType,
        'user'
      );

      logger.info('Uploaded and cached user image', {
        cacheFileId,
        imageType,
        entityId,
        filename
      });

      // NOTE: Legacy FK columns (poster_id, fanart_id, etc.) removed from schema
      // Assets are now managed solely through cache_image_files table with entity_type/entity_id/image_type

      return cacheFileId;
    } finally {
      // Cleanup temp file
      if (await fs.pathExists(tempPath)) {
        await fs.remove(tempPath);
      }
    }
  }

  /**
   * Lock/unlock an image (unified file system)
   * Note: In unified file system, locking is not per-image but per-field at entity level
   * This method is deprecated but kept for backward compatibility
   */
  async setImageLock(imageId: number, locked: boolean): Promise<void> {
    logger.warn('setImageLock is deprecated - locking should be done at entity field level', {
      imageId,
      locked
    });
    // No-op in unified file system
    // Field locks are managed at movies.poster_locked, movies.fanart_locked, etc.
  }

  /**
   * Delete an image (unified file system)
   */
  async deleteImage(imageId: number): Promise<void> {
    const image = await this.getImageById(imageId);
    if (!image) throw new Error('Image not found');

    // Delete file from disk
    if (image.file_path && (await fs.pathExists(image.file_path))) {
      await fs.remove(image.file_path);
    }

    // Delete from cache (CASCADE will handle library entries automatically)
    await this.dbManager.execute('DELETE FROM cache_image_files WHERE id = ?', [imageId]);
    logger.info('Deleted cache image file record', { imageId });
  }

  /**
   * Copy image from cache to library directory (unified file system)
   */
  async copyToLibrary(imageId: number, libraryPath: string): Promise<void> {
    const image = await this.getImageById(imageId);
    if (!image) throw new Error('Image not found');
    if (!image.file_path) throw new Error('Image has no file path');

    await fs.ensureDir(path.dirname(libraryPath));
    await fs.copy(image.file_path, libraryPath);

    logger.info('Copied image to library', {
      imageId,
      fromPath: image.file_path,
      toPath: libraryPath
    });

    // Create library file entry linked to cache
    const db = this.dbManager.getConnection();

    // Check if library entry already exists
    const existingLibrary = await db.query(
      'SELECT id FROM library_image_files WHERE cache_file_id = ?',
      [imageId]
    );

    if (existingLibrary.length === 0) {
      await db.execute(
        `INSERT INTO library_image_files (cache_file_id, file_path) VALUES (?, ?)`,
        [imageId, libraryPath]
      );

      logger.info('Created library file entry linked to cache', {
        cacheFileId: imageId,
        libraryPath
      });
    } else {
      logger.debug('Library entry already exists', { cacheFileId: imageId });
    }
  }

  /**
   * Recover missing library images from cache (unified file system)
   * Finds cache files and creates corresponding library files
   */
  async recoverMissingImages(entityType: string, entityId: number): Promise<number> {
    const db = this.dbManager.getConnection();
    let recoveredCount = 0;

    // Get all cache images for this entity
    const cacheImages = await db.query(
      `SELECT * FROM cache_image_files WHERE entity_type = ? AND entity_id = ?`,
      [entityType, entityId]
    );

    // Get movie/entity details for library path construction
    const entity = await db.query(
      `SELECT file_path FROM movies WHERE id = ?`,
      [entityId]
    );

    if (!entity || entity.length === 0) {
      logger.warn('Entity not found for image recovery', { entityType, entityId });
      return 0;
    }

    const entityFilePath = entity[0].file_path;
    const libraryDir = path.dirname(entityFilePath);
    const baseFilename = path.basename(entityFilePath, path.extname(entityFilePath));

    for (const cacheImage of cacheImages) {
      // Check if cache file exists
      if (!(await fs.pathExists(cacheImage.file_path))) {
        continue;
      }

      // Construct library path using Kodi naming
      const ext = path.extname(cacheImage.file_path);
      let libraryPath = '';

      switch (cacheImage.image_type) {
        case 'poster':
          libraryPath = path.join(libraryDir, `${baseFilename}-poster${ext}`);
          break;
        case 'fanart':
          libraryPath = path.join(libraryDir, `${baseFilename}-fanart${ext}`);
          break;
        case 'banner':
          libraryPath = path.join(libraryDir, `${baseFilename}-banner${ext}`);
          break;
        case 'clearlogo':
          libraryPath = path.join(libraryDir, `${baseFilename}-clearlogo${ext}`);
          break;
        case 'clearart':
          libraryPath = path.join(libraryDir, `${baseFilename}-clearart${ext}`);
          break;
        default:
          libraryPath = path.join(libraryDir, `${baseFilename}-${cacheImage.image_type}${ext}`);
      }

      // Copy from cache to library
      try {
        await fs.ensureDir(path.dirname(libraryPath));
        await fs.copy(cacheImage.file_path, libraryPath);

        // Create library file entry
        await db.execute(
          `INSERT INTO library_image_files (cache_file_id, file_path) VALUES (?, ?)`,
          [cacheImage.id, libraryPath]
        );

        recoveredCount++;
        logger.info('Recovered image from cache', {
          cacheFileId: cacheImage.id,
          libraryPath,
          imageType: cacheImage.image_type
        });
      } catch (error) {
        logger.error('Failed to recover image from cache', {
          cacheFileId: cacheImage.id,
          error: getErrorMessage(error)
        });
      }
    }

    return recoveredCount;
  }

  /**
   * Serve image from file_path (unified file system)
   */
  async getImageStream(
    imageId: number
  ): Promise<{ stream: fsSync.ReadStream; contentType: string } | null> {
    const image = await this.getImageById(imageId);
    if (!image) return null;

    // In unified file system, file_path is the definitive location
    if (image.file_path && (await fs.pathExists(image.file_path))) {
      const ext = path.extname(image.file_path).toLowerCase();
      const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';
      return {
        stream: fsSync.createReadStream(image.file_path),
        contentType,
      };
    }

    logger.warn('Image file not found on disk', {
      imageId,
      file_path: image.file_path,
      location: image.location
    });

    return null;
  }
}
