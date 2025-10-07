import { DatabaseManager } from '../database/DatabaseManager.js';
import * as fs from 'fs-extra';
import * as fsSync from 'fs'; // For createReadStream
import * as path from 'path';
import * as crypto from 'crypto';
import axios from 'axios';
import sharp from 'sharp';

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
   * Get all images for an entity
   */
  async getImages(entityType: string, entityId: number, imageType?: string): Promise<Image[]> {
    let query = `
      SELECT * FROM images
      WHERE entity_type = ? AND entity_id = ? AND deleted_on IS NULL
    `;
    const params: any[] = [entityType, entityId];

    if (imageType) {
      query += ' AND image_type = ?';
      params.push(imageType);
    }

    query += ' ORDER BY locked DESC, vote_average DESC, width * height DESC';

    const rows = await this.dbManager.query<Image>(query, params);
    return rows;
  }

  /**
   * Get single image by ID
   */
  async getImageById(imageId: number): Promise<Image | null> {
    const rows = await this.dbManager.query<Image>(
      'SELECT * FROM images WHERE id = ? AND deleted_on IS NULL',
      [imageId]
    );
    return rows[0] || null;
  }

  /**
   * Download image from URL to cache directory
   */
  async downloadImageToCache(url: string, entityId: number, imageType: string): Promise<string> {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);

    // Determine file extension from content-type or URL
    const contentType = response.headers['content-type'];
    let ext = '.jpg';
    if (contentType?.includes('png')) ext = '.png';
    else if (url.match(/\.(png|jpg|jpeg)$/i)) {
      ext = url.match(/\.(png|jpg|jpeg)$/i)![0];
    }

    // Generate unique filename using hash
    const hash = crypto.randomBytes(8).toString('hex');
    const filename = `${imageType}_${hash}${ext}`;
    const entityDir = path.join(this.cacheDir, entityId.toString());
    await fs.ensureDir(entityDir);

    const cachePath = path.join(entityDir, filename);
    await fs.writeFile(cachePath, buffer);

    return cachePath;
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
   * Select best N images from provider candidates
   */
  async selectImages(
    entityId: number,
    entityType: string,
    imageType: string,
    candidates: ProviderImage[],
    requiredCount: number
  ): Promise<Image[]> {
    // Get already-locked images
    const lockedImages = await this.dbManager.query<Image>(
      `SELECT * FROM images
       WHERE entity_type = ? AND entity_id = ? AND image_type = ? AND locked = 1 AND deleted_on IS NULL`,
      [entityType, entityId, imageType]
    );

    const lockedCount = lockedImages.length;
    const neededCount = requiredCount - lockedCount;

    if (neededCount <= 0) {
      return lockedImages;
    }

    // Sort candidates by vote_average and resolution
    const sorted = candidates.sort((a, b) => {
      if (b.vote_average !== a.vote_average) {
        return b.vote_average - a.vote_average;
      }
      return b.width * b.height - a.width * a.height;
    });

    // Download top candidates to temp directory
    const tempDownloads = [];
    for (const candidate of sorted.slice(0, Math.min(sorted.length, neededCount * 3))) {
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
        console.error(`Failed to download candidate image: ${candidate.url}`, error);
      }
    }

    // Select top N, filtering duplicates
    const selected = [];
    const selectedHashes: string[] = [];

    for (const candidate of tempDownloads) {
      if (selected.length >= neededCount) break;

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

    // Move selected to cache and insert into database
    const images: Image[] = [];
    for (const candidate of selected) {
      const hash = crypto.randomBytes(8).toString('hex');
      const ext = path.extname(candidate.file_path);
      const filename = `${imageType}_${hash}${ext}`;
      const entityDir = path.join(this.cacheDir, entityId.toString());
      await fs.ensureDir(entityDir);

      const cachePath = path.join(entityDir, filename);
      await fs.move(candidate.tempPath, cachePath);

      const result = await this.dbManager.execute(
        `INSERT INTO images (
          entity_type, entity_id, image_type, url, cache_path,
          width, height, vote_average, perceptual_hash, locked
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          entityType,
          entityId,
          imageType,
          candidate.url,
          cachePath,
          candidate.width,
          candidate.height,
          candidate.vote_average,
          candidate.pHash,
        ]
      );

      const image = await this.getImageById(result.insertId!);
      if (image) images.push(image);
    }

    // Cleanup temp files
    for (const download of tempDownloads) {
      if (await fs.pathExists(download.tempPath)) {
        await fs.remove(download.tempPath);
      }
    }

    return [...lockedImages, ...images];
  }

  /**
   * Upload custom user image
   */
  async uploadCustomImage(
    entityType: string,
    entityId: number,
    imageType: string,
    buffer: Buffer,
    filename: string
  ): Promise<Image> {
    // Save to temp first to calculate hash
    const ext = path.extname(filename);
    const tempPath = path.join(
      this.tempDir,
      `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}${ext}`
    );
    await fs.writeFile(tempPath, buffer);

    // Calculate perceptual hash
    const pHash = await this.calculatePerceptualHash(tempPath);
    const dimensions = await this.getImageDimensions(tempPath);

    // Move to cache
    const hash = crypto.randomBytes(8).toString('hex');
    const cacheFilename = `${imageType}_custom_${hash}${ext}`;
    const entityDir = path.join(this.cacheDir, entityId.toString());
    await fs.ensureDir(entityDir);

    const cachePath = path.join(entityDir, cacheFilename);
    await fs.move(tempPath, cachePath);

    // Insert into database with locked=1
    const result = await this.dbManager.execute(
      `INSERT INTO images (
        entity_type, entity_id, image_type, cache_path,
        width, height, perceptual_hash, locked
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [entityType, entityId, imageType, cachePath, dimensions.width, dimensions.height, pHash]
    );

    const image = await this.getImageById(result.insertId!);
    if (!image) throw new Error('Failed to retrieve uploaded image');

    return image;
  }

  /**
   * Lock/unlock an image
   */
  async setImageLock(imageId: number, locked: boolean): Promise<void> {
    await this.dbManager.execute('UPDATE images SET locked = ? WHERE id = ?', [
      locked ? 1 : 0,
      imageId,
    ]);
  }

  /**
   * Delete an image
   */
  async deleteImage(imageId: number): Promise<void> {
    const image = await this.getImageById(imageId);
    if (!image) throw new Error('Image not found');

    // Delete cache file if exists
    if (image.cache_path && (await fs.pathExists(image.cache_path))) {
      await fs.remove(image.cache_path);
    }

    // Delete library file if exists
    if (image.file_path && (await fs.pathExists(image.file_path))) {
      await fs.remove(image.file_path);
    }

    // Delete from database
    await this.dbManager.execute('DELETE FROM images WHERE id = ?', [imageId]);
  }

  /**
   * Copy image from cache to library directory
   */
  async copyToLibrary(imageId: number, libraryPath: string): Promise<void> {
    const image = await this.getImageById(imageId);
    if (!image) throw new Error('Image not found');
    if (!image.cache_path) throw new Error('Image has no cache path');

    await fs.ensureDir(path.dirname(libraryPath));
    await fs.copy(image.cache_path, libraryPath);

    await this.dbManager.execute('UPDATE images SET file_path = ? WHERE id = ?', [
      libraryPath,
      imageId,
    ]);
  }

  /**
   * Recover missing library images from cache
   */
  async recoverMissingImages(entityType: string, entityId: number): Promise<number> {
    const images = await this.getImages(entityType, entityId);
    let recoveredCount = 0;

    for (const image of images) {
      if (image.file_path && !(await fs.pathExists(image.file_path))) {
        if (image.cache_path && (await fs.pathExists(image.cache_path))) {
          await fs.ensureDir(path.dirname(image.file_path));
          await fs.copy(image.cache_path, image.file_path);
          recoveredCount++;
        }
      }
    }

    return recoveredCount;
  }

  /**
   * Serve image from cache or library path
   * Priority: cache_path -> library_path -> file_path
   */
  async getImageStream(
    imageId: number
  ): Promise<{ stream: fsSync.ReadStream; contentType: string } | null> {
    const image = await this.getImageById(imageId);
    if (!image) return null;

    // Try to serve from cache_path first
    if (image.cache_path && (await fs.pathExists(image.cache_path))) {
      const ext = path.extname(image.cache_path).toLowerCase();
      const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';
      return {
        stream: fsSync.createReadStream(image.cache_path),
        contentType,
      };
    }

    // Fall back to library_path (for images discovered in library)
    const libraryPath = (image as any).library_path;
    if (libraryPath && (await fs.pathExists(libraryPath))) {
      const ext = path.extname(libraryPath).toLowerCase();
      const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';
      return {
        stream: fsSync.createReadStream(libraryPath),
        contentType,
      };
    }

    // Fall back to file_path (legacy)
    if (image.file_path && (await fs.pathExists(image.file_path))) {
      const ext = path.extname(image.file_path).toLowerCase();
      const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';
      return {
        stream: fsSync.createReadStream(image.file_path),
        contentType,
      };
    }

    return null;
  }
}
