import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import { DatabaseConnection } from '../types/database.js';
import { TMDBClient } from './providers/tmdb/TMDBClient.js';
import { logger } from '../middleware/logging.js';
import crypto from 'crypto';
import sharp from 'sharp';

/**
 * Provider Asset Service
 *
 * Fetches assets (images, trailers) from metadata providers (TMDB, TVDB)
 * and adds them as asset candidates in the three-tier system.
 *
 * Works in conjunction with AssetDiscoveryService:
 * - AssetDiscoveryService: Scans filesystem for existing assets
 * - ProviderAssetService: Fetches assets from web APIs
 *
 * Both services populate the same asset_candidates table.
 */

export interface ProviderAsset {
  entityType: 'movie' | 'series' | 'episode';
  entityId: number;
  assetType: 'poster' | 'fanart' | 'banner' | 'clearlogo' | 'trailer';
  providerUrl: string;
  provider: 'tmdb' | 'tvdb';
  width?: number;
  height?: number;
  durationSeconds?: number;
  language?: string | null;
  voteAverage?: number;
  voteCount?: number;
}

export interface FetchResult {
  fetched: number;
  cached: number;
  skipped: number;
  errors: number;
}

export class ProviderAssetService {
  private db: DatabaseConnection;
  private cacheDir: string;
  private tmdbClient: TMDBClient | undefined;

  constructor(db: DatabaseConnection, cacheDir: string, tmdbClient?: TMDBClient) {
    this.db = db;
    this.cacheDir = cacheDir;
    this.tmdbClient = tmdbClient;
  }

  /**
   * Fetch all assets for a movie from TMDB
   */
  async fetchMovieAssets(movieId: number, tmdbId: number): Promise<FetchResult> {
    if (!this.tmdbClient) {
      throw new Error('TMDB client not configured');
    }

    const result: FetchResult = {
      fetched: 0,
      cached: 0,
      skipped: 0,
      errors: 0
    };

    try {
      // Fetch images (posters, backdrops/fanart, logos)
      const images = await this.tmdbClient.getMovieImages(tmdbId);

      // Process posters
      for (const poster of images.posters) {
        try {
          await this.processProviderAsset({
            entityType: 'movie',
            entityId: movieId,
            assetType: 'poster',
            providerUrl: this.tmdbClient.getImageUrl(poster.file_path, 'original'),
            provider: 'tmdb',
            width: poster.width,
            height: poster.height,
            language: poster.iso_639_1,
            voteAverage: poster.vote_average,
            voteCount: poster.vote_count
          });
          result.fetched++;
        } catch (error) {
          logger.error(`Error processing poster for movie ${movieId}:`, error);
          result.errors++;
        }
      }

      // Process backdrops (fanart)
      for (const backdrop of images.backdrops) {
        try {
          await this.processProviderAsset({
            entityType: 'movie',
            entityId: movieId,
            assetType: 'fanart',
            providerUrl: this.tmdbClient.getImageUrl(backdrop.file_path, 'original'),
            provider: 'tmdb',
            width: backdrop.width,
            height: backdrop.height,
            language: backdrop.iso_639_1,
            voteAverage: backdrop.vote_average,
            voteCount: backdrop.vote_count
          });
          result.fetched++;
        } catch (error) {
          logger.error(`Error processing backdrop for movie ${movieId}:`, error);
          result.errors++;
        }
      }

      // Process logos (clearlogo)
      for (const logo of images.logos) {
        try {
          await this.processProviderAsset({
            entityType: 'movie',
            entityId: movieId,
            assetType: 'clearlogo',
            providerUrl: this.tmdbClient.getImageUrl(logo.file_path, 'original'),
            provider: 'tmdb',
            width: logo.width,
            height: logo.height,
            language: logo.iso_639_1,
            voteAverage: logo.vote_average,
            voteCount: logo.vote_count
          });
          result.fetched++;
        } catch (error) {
          logger.error(`Error processing logo for movie ${movieId}:`, error);
          result.errors++;
        }
      }

      // Fetch videos (trailers)
      const videos = await this.tmdbClient.getMovieVideos(tmdbId);

      // Process trailers (YouTube only for now)
      const trailers = videos.results.filter(v =>
        v.type === 'Trailer' &&
        v.site === 'YouTube' &&
        v.official
      );

      for (const trailer of trailers) {
        try {
          // YouTube trailer URL
          const youtubeUrl = `https://www.youtube.com/watch?v=${trailer.key}`;

          await this.processProviderAsset({
            entityType: 'movie',
            entityId: movieId,
            assetType: 'trailer',
            providerUrl: youtubeUrl,
            provider: 'tmdb',
            language: trailer.iso_639_1
          });
          result.fetched++;
        } catch (error) {
          logger.error(`Error processing trailer for movie ${movieId}:`, error);
          result.errors++;
        }
      }

    } catch (error) {
      logger.error(`Error fetching assets for movie ${movieId}:`, error);
      result.errors++;
    }

    result.cached = result.fetched - result.errors;
    return result;
  }

  /**
   * Process a provider asset: download, hash, cache, and insert into database
   */
  private async processProviderAsset(asset: ProviderAsset): Promise<void> {
    // Check if already exists
    const exists = await this.assetCandidateExists(
      asset.entityType,
      asset.entityId,
      asset.assetType,
      asset.provider,
      asset.providerUrl
    );

    if (exists) {
      logger.debug(`Asset already exists: ${asset.assetType} for ${asset.entityType} ${asset.entityId}`);
      return;
    }

    // Download asset (images only for now, trailers stored as YouTube URLs)
    if (asset.assetType === 'trailer') {
      // Store trailer URL without downloading (YouTube link)
      await this.insertAssetCandidate(asset, null, null);
      return;
    }

    // Download image
    const buffer = await this.downloadAsset(asset.providerUrl);

    // Calculate SHA256 content hash
    const contentHash = this.calculateContentHash(buffer);

    // Check if already cached
    const alreadyCached = await this.isCached(contentHash);
    if (alreadyCached) {
      logger.debug(`Asset already cached: ${contentHash}`);
      // Still insert candidate (different entity might use same image)
      await this.insertAssetCandidate(asset, contentHash, null);
      return;
    }

    // Calculate perceptual hash for images
    let perceptualHash: string | null = null;
    if (this.isImageAsset(asset.assetType)) {
      perceptualHash = await this.calculatePerceptualHash(buffer);

      // Verify dimensions if provided
      const metadata = await sharp(buffer).metadata();
      if (metadata.width && metadata.height) {
        asset.width = metadata.width;
        asset.height = metadata.height;
      }
    }

    // Copy to cache
    await this.copyToCache(contentHash, buffer, asset.assetType);

    // Insert into database
    await this.insertAssetCandidate(asset, contentHash, perceptualHash);
  }

  /**
   * Download asset from URL
   */
  private async downloadAsset(url: string): Promise<Buffer> {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000 // 30 second timeout
    });

    return Buffer.from(response.data);
  }

  /**
   * Calculate SHA256 content hash
   */
  private calculateContentHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Calculate perceptual hash for images
   */
  private async calculatePerceptualHash(buffer: Buffer): Promise<string> {
    // Resize to 32x32, convert to grayscale
    const resized = await sharp(buffer)
      .resize(32, 32, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer();

    // Simple DCT-based hash
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
  private async copyToCache(contentHash: string, buffer: Buffer, assetType: string): Promise<string> {
    const ext = this.getExtensionForAssetType(assetType);
    const subdir = contentHash.substring(0, 2);
    const cacheSubdir = path.join(this.cacheDir, 'assets', subdir);

    // Ensure directory exists
    await fs.mkdir(cacheSubdir, { recursive: true });

    const cachePath = path.join(cacheSubdir, `${contentHash}${ext}`);

    // Check if already exists
    try {
      await fs.access(cachePath);
      return cachePath; // Already exists
    } catch {
      // Doesn't exist, write it
      await fs.writeFile(cachePath, buffer);
      return cachePath;
    }
  }

  /**
   * Check if content hash is already cached
   */
  private async isCached(contentHash: string): Promise<boolean> {
    const result = await this.db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM cache_inventory WHERE content_hash = ?`,
      [contentHash]
    );
    return (result[0]?.count ?? 0) > 0;
  }

  /**
   * Check if asset candidate already exists
   */
  private async assetCandidateExists(
    entityType: string,
    entityId: number,
    assetType: string,
    provider: string,
    providerUrl: string
  ): Promise<boolean> {
    const result = await this.db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM asset_candidates
       WHERE entity_type = ? AND entity_id = ? AND asset_type = ? AND provider = ? AND provider_url = ?`,
      [entityType, entityId, assetType, provider, providerUrl]
    );
    return (result[0]?.count ?? 0) > 0;
  }

  /**
   * Insert asset candidate into database
   */
  private async insertAssetCandidate(
    asset: ProviderAsset,
    contentHash: string | null,
    perceptualHash: string | null
  ): Promise<void> {
    const providerMetadata = JSON.stringify({
      language: asset.language,
      vote_average: asset.voteAverage,
      vote_count: asset.voteCount
    });

    await this.db.execute(
      `INSERT INTO asset_candidates (
        entity_type, entity_id, asset_type, provider, provider_url, provider_metadata,
        width, height, duration_seconds, is_downloaded,
        content_hash, perceptual_hash, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        asset.entityType,
        asset.entityId,
        asset.assetType,
        asset.provider,
        asset.providerUrl,
        providerMetadata,
        asset.width,
        asset.height,
        asset.durationSeconds,
        contentHash ? 1 : 0, // is_downloaded (1 if we have content hash, 0 for YouTube trailers)
        contentHash,
        perceptualHash
      ]
    );

    // Insert into cache_inventory if has content hash
    if (contentHash) {
      await this.insertCacheInventory(contentHash, asset.assetType);
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
      const ext = this.getExtensionForAssetType(assetType);
      const subdir = contentHash.substring(0, 2);
      const cachePath = path.join(this.cacheDir, 'assets', subdir, `${contentHash}${ext}`);

      // Get file size
      let fileSize = 0;
      try {
        const stat = await fs.stat(cachePath);
        fileSize = stat.size;
      } catch (error) {
        logger.warn(`Could not get file size for ${cachePath}`);
      }

      await this.db.execute(
        `INSERT INTO cache_inventory (
          content_hash, cache_path, file_size, reference_count, created_at
        ) VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)`,
        [contentHash, cachePath, fileSize]
      );
    }
  }

  /**
   * Check if asset type is an image
   */
  private isImageAsset(assetType: string): boolean {
    return ['poster', 'fanart', 'banner', 'clearlogo', 'clearart', 'discart', 'landscape', 'characterart'].includes(assetType);
  }

  /**
   * Get file extension for asset type
   */
  private getExtensionForAssetType(assetType: string): string {
    if (assetType === 'trailer') return '.mp4';
    if (assetType === 'subtitle') return '.srt';
    return '.jpg'; // Images default to .jpg
  }

  /**
   * Get auto-score for asset selection (used in YOLO/Hybrid modes)
   * Higher score = better asset
   */
  async calculateAutoScore(candidateId: number): Promise<number> {
    const candidate = await this.db.query<{
      asset_type: string;
      width: number | null;
      height: number | null;
      provider_metadata: string | null;
      language: string | null;
    }>(
      `SELECT asset_type, width, height, provider_metadata, language FROM asset_candidates WHERE id = ?`,
      [candidateId]
    );

    if (candidate.length === 0) return 0;

    const asset = candidate[0];
    let score = 50; // Base score

    // Resolution score (higher resolution = better)
    if (asset.width && asset.height) {
      const pixels = asset.width * asset.height;
      if (pixels >= 3840 * 2160) score += 30; // 4K
      else if (pixels >= 1920 * 1080) score += 20; // 1080p
      else if (pixels >= 1280 * 720) score += 10; // 720p
    }

    // Provider metadata (vote average)
    if (asset.provider_metadata) {
      try {
        const metadata = JSON.parse(asset.provider_metadata);
        if (metadata.vote_average) {
          score += metadata.vote_average * 2; // 0-10 scale * 2 = 0-20 points
        }
      } catch {
        // Invalid JSON, ignore
      }
    }

    // Language preference (English = bonus)
    if (asset.language === 'en' || asset.language === null) {
      score += 10;
    }

    return Math.min(score, 100); // Cap at 100
  }
}
