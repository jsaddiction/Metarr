import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import { DatabaseConnection } from '../types/database.js';
import { logger } from '../middleware/logging.js';

/**
 * Asset Discovery Service
 *
 * Scans library directories for asset candidates (images, trailers, subtitles)
 * and populates the three-tier asset system (Candidates → Cache → Library).
 *
 * Key responsibilities:
 * - Scan directories for assets matching Kodi naming conventions
 * - Calculate SHA256 content hashes for deduplication
 * - Calculate perceptual hashes for image similarity detection
 * - Copy assets to cache storage (content-addressed)
 * - Insert asset candidates into database
 * - Track rejected assets to avoid re-processing
 */

export interface AssetCandidate {
  entityType: 'movie' | 'series' | 'episode' | 'artist' | 'album';
  entityId: number;
  assetType: 'poster' | 'fanart' | 'banner' | 'clearlogo' | 'clearart' | 'discart' | 'landscape' | 'characterart' | 'trailer' | 'subtitle';
  provider: 'filesystem'; // Will add 'tmdb', 'tvdb', etc. in Phase 3
  libraryPath: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  contentHash?: string;
  perceptualHash?: string;
}

export interface DiscoveryResult {
  discovered: number;
  cached: number;
  rejected: number;
  errors: number;
}

export class AssetDiscoveryService {
  private db: DatabaseConnection;
  private cacheDir: string;

  // Kodi naming patterns for asset discovery
  private readonly ASSET_PATTERNS = {
    poster: ['-poster', 'poster', '-cover', 'cover', 'folder'],
    fanart: ['-fanart', 'fanart', '-backdrop', 'backdrop'],
    banner: ['-banner', 'banner'],
    clearlogo: ['-clearlogo', 'clearlogo', '-logo', 'logo'],
    clearart: ['-clearart', 'clearart'],
    discart: ['-disc', 'disc', '-discart', 'discart'],
    landscape: ['-landscape', 'landscape', '-thumb', 'thumb'],
    characterart: ['-characterart', 'characterart'],
    trailer: ['-trailer', 'trailer'],
    subtitle: ['.srt', '.sub', '.ssa', '.ass']
  };

  private readonly IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.tbn'];
  private readonly VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.webm'];
  private readonly SUBTITLE_EXTENSIONS = ['.srt', '.sub', '.ssa', '.ass'];

  constructor(db: DatabaseConnection, cacheDir: string) {
    this.db = db;
    this.cacheDir = cacheDir;
  }

  /**
   * Scan a directory for asset candidates
   */
  async scanDirectory(directoryPath: string, entityType: 'movie' | 'series' | 'episode', entityId: number): Promise<DiscoveryResult> {
    const result: DiscoveryResult = {
      discovered: 0,
      cached: 0,
      rejected: 0,
      errors: 0
    };

    try {
      const files = await fs.readdir(directoryPath);

      for (const file of files) {
        const filePath = path.join(directoryPath, file);

        try {
          const stat = await fs.stat(filePath);
          if (!stat.isFile()) continue;

          const assetType = this.detectAssetType(file);
          if (!assetType) continue;

          // Check if already rejected
          const isRejected = await this.isAssetRejected(filePath);
          if (isRejected) {
            result.rejected++;
            continue;
          }

          // Check if already discovered
          const exists = await this.assetCandidateExists(entityType, entityId, assetType);
          if (exists) {
            continue;
          }

          const candidate: AssetCandidate = {
            entityType,
            entityId,
            assetType,
            provider: 'filesystem',
            libraryPath: filePath
          };

          // Process asset based on type
          if (this.isImageAsset(assetType)) {
            await this.processImageAsset(candidate);
          } else if (assetType === 'trailer') {
            await this.processVideoAsset(candidate);
          } else if (assetType === 'subtitle') {
            await this.processSubtitleAsset(candidate);
          }

          // Insert into database
          await this.insertAssetCandidate(candidate);
          result.discovered++;
          result.cached++;

        } catch (error) {
          logger.error(`Error processing asset ${filePath}:`, error);
          result.errors++;
        }
      }

    } catch (error) {
      logger.error(`Error scanning directory ${directoryPath}:`, error);
      result.errors++;
    }

    return result;
  }

  /**
   * Detect asset type from filename
   */
  private detectAssetType(filename: string): AssetCandidate['assetType'] | null {
    const lowerFilename = filename.toLowerCase();
    const ext = path.extname(lowerFilename);

    // Check subtitles first (by extension only)
    if (this.SUBTITLE_EXTENSIONS.includes(ext)) {
      return 'subtitle';
    }

    // Check trailers (by pattern + video extension)
    if (this.VIDEO_EXTENSIONS.includes(ext)) {
      for (const pattern of this.ASSET_PATTERNS.trailer) {
        if (lowerFilename.includes(pattern)) {
          return 'trailer';
        }
      }
      return null; // Video file but not a trailer
    }

    // Check image assets
    if (this.IMAGE_EXTENSIONS.includes(ext)) {
      // Check each asset type pattern
      for (const [assetType, patterns] of Object.entries(this.ASSET_PATTERNS)) {
        if (assetType === 'trailer' || assetType === 'subtitle') continue;

        for (const pattern of patterns) {
          if (lowerFilename.includes(pattern)) {
            return assetType as AssetCandidate['assetType'];
          }
        }
      }
    }

    return null;
  }

  /**
   * Check if asset type is an image
   */
  private isImageAsset(assetType: AssetCandidate['assetType']): boolean {
    return ['poster', 'fanart', 'banner', 'clearlogo', 'clearart', 'discart', 'landscape', 'characterart'].includes(assetType);
  }

  /**
   * Process image asset: extract dimensions, calculate hashes, copy to cache
   */
  private async processImageAsset(candidate: AssetCandidate): Promise<void> {
    const buffer = await fs.readFile(candidate.libraryPath);

    // Get image metadata (dimensions)
    const metadata = await sharp(buffer).metadata();
    candidate.width = metadata.width;
    candidate.height = metadata.height;

    // Calculate SHA256 content hash
    candidate.contentHash = this.calculateContentHash(buffer);

    // Calculate perceptual hash for duplicate detection
    candidate.perceptualHash = await this.calculatePerceptualHash(buffer);

    // Copy to cache storage (content-addressed by SHA256)
    await this.copyToCache(candidate.contentHash, buffer, path.extname(candidate.libraryPath));

    // Cache path is stored in cache_inventory via insertCacheInventory() call in insertAssetCandidate()
  }

  /**
   * Process video asset: extract duration, calculate hash, copy to cache
   */
  private async processVideoAsset(candidate: AssetCandidate): Promise<void> {
    const buffer = await fs.readFile(candidate.libraryPath);

    // Calculate SHA256 content hash
    candidate.contentHash = this.calculateContentHash(buffer);

    // TODO: Extract video duration using ffprobe (Phase 3)
    // For now, leave durationSeconds undefined

    // Copy to cache storage
    await this.copyToCache(candidate.contentHash, buffer, path.extname(candidate.libraryPath));
  }

  /**
   * Process subtitle asset: calculate hash, copy to cache
   */
  private async processSubtitleAsset(candidate: AssetCandidate): Promise<void> {
    const buffer = await fs.readFile(candidate.libraryPath);

    // Calculate SHA256 content hash
    candidate.contentHash = this.calculateContentHash(buffer);

    // Copy to cache storage
    await this.copyToCache(candidate.contentHash, buffer, path.extname(candidate.libraryPath));
  }

  /**
   * Calculate SHA256 content hash
   */
  private calculateContentHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Calculate perceptual hash for image similarity detection
   * Uses 8x8 DCT-based pHash algorithm
   */
  private async calculatePerceptualHash(buffer: Buffer): Promise<string> {
    // Resize to 32x32, convert to grayscale
    const resized = await sharp(buffer)
      .resize(32, 32, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer();

    // Simple DCT-based hash (simplified version)
    // TODO: Integrate full pHash library for production use
    const pixels = new Uint8Array(resized);
    let hash = '';

    for (let i = 0; i < pixels.length; i += 128) {
      const byte = pixels[i] ^ pixels[i + 1];
      hash += byte.toString(16).padStart(2, '0');
    }

    return hash.substring(0, 16); // 64-bit hash
  }

  /**
   * Copy file to content-addressed cache storage
   */
  private async copyToCache(contentHash: string, buffer: Buffer, extension: string): Promise<string> {
    // Content-addressed path: cache/{type}/{hash.substring(0,2)}/{hash}{ext}
    // For now, store in cache/assets/ (will organize by type in Phase 3)
    const subdir = contentHash.substring(0, 2);
    const cacheSubdir = path.join(this.cacheDir, 'assets', subdir);

    // Ensure directory exists
    await fs.mkdir(cacheSubdir, { recursive: true });

    const cachePath = path.join(cacheSubdir, `${contentHash}${extension}`);

    // Check if already cached
    try {
      await fs.access(cachePath);
      return cachePath; // Already exists
    } catch {
      // Doesn't exist, copy it
      await fs.writeFile(cachePath, buffer);
      return cachePath;
    }
  }

  /**
   * Check if asset candidate already exists in database
   */
  private async assetCandidateExists(entityType: string, entityId: number, assetType: string): Promise<boolean> {
    const result = await this.db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM asset_candidates
       WHERE entity_type = ? AND entity_id = ? AND asset_type = ? AND provider = 'filesystem'`,
      [entityType, entityId, assetType]
    );
    return (result[0]?.count ?? 0) > 0;
  }

  /**
   * Check if asset is in rejected list
   */
  private async isAssetRejected(filePath: string): Promise<boolean> {
    const result = await this.db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM rejected_assets WHERE file_path = ?`,
      [filePath]
    );
    return (result[0]?.count ?? 0) > 0;
  }

  /**
   * Insert asset candidate into database
   */
  private async insertAssetCandidate(candidate: AssetCandidate): Promise<void> {
    await this.db.execute(
      `INSERT INTO asset_candidates (
        entity_type, entity_id, asset_type, provider, provider_url,
        width, height, duration_seconds, is_downloaded,
        content_hash, perceptual_hash, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        candidate.entityType,
        candidate.entityId,
        candidate.assetType,
        candidate.provider,
        candidate.libraryPath, // Store library path in provider_url for filesystem assets
        candidate.width,
        candidate.height,
        candidate.durationSeconds,
        candidate.contentHash,
        candidate.perceptualHash
      ]
    );

    // Insert into cache_inventory if has content hash
    if (candidate.contentHash) {
      await this.insertCacheInventory(candidate.contentHash, candidate.assetType);
    }
  }

  /**
   * Insert or update cache inventory entry
   */
  private async insertCacheInventory(contentHash: string, assetType: string): Promise<void> {
    // Check if already exists
    const existing = await this.db.query<{ reference_count: number }>(
      `SELECT reference_count FROM cache_inventory WHERE content_hash = ?`,
      [contentHash]
    );

    if (existing.length > 0) {
      // Increment reference count
      await this.db.execute(
        `UPDATE cache_inventory SET reference_count = reference_count + 1 WHERE content_hash = ?`,
        [contentHash]
      );
    } else {
      // Insert new entry
      const ext = assetType === 'subtitle' ? '.srt' : assetType === 'trailer' ? '.mp4' : '.jpg';
      const subdir = contentHash.substring(0, 2);
      const cachePath = path.join(this.cacheDir, 'assets', subdir, `${contentHash}${ext}`);

      await this.db.execute(
        `INSERT INTO cache_inventory (
          content_hash, cache_path, file_size, reference_count, created_at
        ) VALUES (?, ?, 0, 1, CURRENT_TIMESTAMP)`,
        [contentHash, cachePath]
      );
    }
  }

  /**
   * Find duplicate images using perceptual hash similarity
   * Returns pairs of asset IDs with similarity score >= threshold
   */
  async findDuplicateImages(threshold: number = 0.9): Promise<Array<{ id1: number; id2: number; similarity: number }>> {
    // Get all image assets with perceptual hashes
    const assets = await this.db.query<{ id: number; perceptual_hash: string }>(
      `SELECT id, perceptual_hash FROM asset_candidates
       WHERE perceptual_hash IS NOT NULL
       AND asset_type IN ('poster', 'fanart', 'banner', 'clearlogo', 'clearart', 'discart', 'landscape', 'characterart')`
    );

    const duplicates: Array<{ id1: number; id2: number; similarity: number }> = [];

    // Compare all pairs
    for (let i = 0; i < assets.length; i++) {
      for (let j = i + 1; j < assets.length; j++) {
        const similarity = this.comparePerceptualHashes(assets[i].perceptual_hash, assets[j].perceptual_hash);
        if (similarity >= threshold) {
          duplicates.push({
            id1: assets[i].id,
            id2: assets[j].id,
            similarity
          });
        }
      }
    }

    return duplicates;
  }

  /**
   * Compare two perceptual hashes and return similarity score (0-1)
   */
  private comparePerceptualHashes(hash1: string, hash2: string): number {
    if (hash1.length !== hash2.length) return 0;

    let matchingBits = 0;
    const totalBits = hash1.length * 4; // Each hex char = 4 bits

    for (let i = 0; i < hash1.length; i++) {
      const xor = parseInt(hash1[i], 16) ^ parseInt(hash2[i], 16);
      // Count matching bits (0s in XOR result)
      matchingBits += 4 - this.countSetBits(xor);
    }

    return matchingBits / totalBits;
  }

  /**
   * Count number of set bits in a 4-bit value
   */
  private countSetBits(n: number): number {
    let count = 0;
    while (n > 0) {
      count += n & 1;
      n >>= 1;
    }
    return count;
  }
}
