import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import axios from 'axios';
import { DatabaseConnection } from '../types/database.js';
import { PublishConfig as PublishPhaseConfig, DEFAULT_PHASE_CONFIG } from '../config/phaseConfig.js';
import { logger } from '../middleware/logging.js';
import { getErrorMessage } from '../utils/errorHandling.js';
import {
  InvalidStateError,
  FileNotFoundError,
  FileSystemError,
  ResourceNotFoundError,
  ErrorCode,
} from '../errors/index.js';

/**
 * Publishing Service
 *
 * Publishes entity metadata and assets to library directory:
 * 1. Copy selected assets from cache to library (using Kodi naming)
 * 2. Generate NFO file with current metadata
 * 3. Calculate NFO hash and store in published_nfo_hash
 * 4. Update last_published_at timestamp
 *
 * Publishing is idempotent - can be called multiple times safely.
 * Publishing ALWAYS runs - phase configuration controls WHAT gets published.
 */

export interface PublishJobConfig {
  entityType: 'movie' | 'series' | 'episode';
  entityId: number;
  libraryPath: string; // Directory containing media file
  mediaFilename?: string; // For naming assets (e.g., "Movie Name (2023)")
  phaseConfig?: PublishPhaseConfig; // Optional phase configuration (uses defaults if not provided)
}

export interface PublishResult {
  success: boolean;
  assetsPublished: number;
  nfoGenerated: boolean;
  errors: string[];
}

export class PublishingService {
  private db: DatabaseConnection;
  private cacheDir: string;

  constructor(db: DatabaseConnection, cacheDir?: string) {
    this.db = db;
    // Default to data/cache if not provided
    this.cacheDir = cacheDir || path.join(process.cwd(), 'data', 'cache');
  }

  /**
   * Publish entity to library directory
   *
   * Deploys selected assets and metadata from protected cache to the library directory
   * for media player scanning. Uses Kodi naming conventions for maximum compatibility.
   *
   * **Publishing Steps:**
   * 1. Copy selected image assets (poster, fanart, etc.) to library using Kodi naming
   * 2. Copy trailer files if enabled
   * 3. Generate NFO file with complete metadata (title, plot, cast, ratings, etc.)
   * 4. Update published_nfo_hash to track changes
   * 5. Set last_published_at timestamp
   *
   * @param config - Publishing configuration
   * @param config.entityType - Type of entity ('movie' | 'series' | 'episode')
   * @param config.entityId - Database ID of the entity
   * @param config.libraryPath - Library directory path (e.g., "/media/movies/Movie (2023)/")
   * @param config.mediaFilename - Base filename for assets (e.g., "Movie Name (2023)")
   * @param config.phaseConfig - Optional phase configuration. Controls what gets published:
   *   - publishAssets: Enable/disable image publishing (poster, fanart, etc.)
   *   - publishActors: Enable/disable actor thumb publishing
   *   - publishTrailers: Enable/disable trailer publishing
   *   - generateNFO: Enable/disable NFO file generation
   *
   * @returns Promise resolving to publish result with asset counts and errors
   *
   * @example
   * ```typescript
   * // Publish all assets for a movie
   * const result = await publishingService.publish({
   *   entityType: 'movie',
   *   entityId: 456,
   *   libraryPath: '/media/movies/Inception (2010)/',
   *   mediaFilename: 'Inception (2010)'
   * });
   *
   * console.log(`Published ${result.assetsPublished} assets, NFO: ${result.nfoGenerated}`);
   * ```
   *
   * @remarks
   * - **Idempotent**: Safe to run multiple times - overwrites existing files with latest
   * - **Kodi Compatible**: Uses official Kodi naming (movie-poster.jpg, movie-fanart.jpg)
   * - **NFO Generation**: Creates complete movie.nfo with all metadata
   * - **Selective Publishing**: Phase config allows publishing only specific asset types
   * - **Cache Protected**: Source files in cache remain untouched
   * - **Library Sync**: Updates library directory only, doesn't touch cache
   *
   * @see {@link https://kodi.wiki/view/NFO_files/Movies | Kodi NFO Documentation}
   */
  async publish(config: PublishJobConfig): Promise<PublishResult> {
    const result: PublishResult = {
      success: false,
      assetsPublished: 0,
      nfoGenerated: false,
      errors: []
    };

    // Use provided phase config or defaults
    const phaseConfig = config.phaseConfig || DEFAULT_PHASE_CONFIG.publish;

    logger.info('[PublishingService] Starting publish', {
      entityType: config.entityType,
      entityId: config.entityId,
      publishAssets: phaseConfig.publishAssets,
      publishActors: phaseConfig.publishActors,
      publishTrailers: phaseConfig.publishTrailers,
    });

    try {
      // Get entity data
      const entity = await this.getEntity(config.entityType, config.entityId);
      if (!entity) {
        result.errors.push('Entity not found');
        return result;
      }

      // Get selected assets (only if publishing assets is enabled)
      if (phaseConfig.publishAssets || phaseConfig.publishTrailers) {
        const selectedAssets = await this.getSelectedAssets(config.entityType, config.entityId);

        // Publish each asset (filter based on phase config)
        for (const asset of selectedAssets) {
          // Skip trailers if publishTrailers is false
          if (asset.asset_type === 'trailer' && !phaseConfig.publishTrailers) {
            logger.debug(`[PublishingService] Skipping trailer (publishTrailers=false)`);
            continue;
          }

          // Skip non-trailer assets if publishAssets is false
          if (asset.asset_type !== 'trailer' && !phaseConfig.publishAssets) {
            logger.debug(`[PublishingService] Skipping asset ${asset.asset_type} (publishAssets=false)`);
            continue;
          }

          try {
            await this.publishAsset(asset, config, asset.rank);
            result.assetsPublished++;
          } catch (error) {
            logger.error(`Error publishing asset ${asset.id}:`, error);
            result.errors.push(`Asset ${asset.asset_type}: ${getErrorMessage(error)}`);
          }
        }
      } else {
        logger.info('[PublishingService] Skipping assets (publishAssets=false, publishTrailers=false)');
      }

      // Publish actor thumbnails (only if publishing actors is enabled)
      if (phaseConfig.publishActors) {
        try {
          const actorsPublished = await this.publishActors(config);
          logger.info(`[PublishingService] Published ${actorsPublished} actor thumbnails`);
        } catch (error) {
          logger.error('Error publishing actors:', error);
          result.errors.push(`Actors: ${getErrorMessage(error)}`);
        }
      } else {
        logger.info('[PublishingService] Skipping actors (publishActors=false)');
      }

      // Generate and write NFO file
      try {
        const nfoContent = await this.generateNFO(config.entityType, config.entityId);

        // Calculate NFO hash
        const nfoHash = crypto.createHash('sha256').update(nfoContent).digest('hex');

        // Save to cache and update cache_text_files table
        const nfoCachePath = await this.saveNFOToCache(
          config.entityType,
          config.entityId,
          nfoContent,
          nfoHash
        );

        // Copy from cache to library
        const nfoLibraryPath = path.join(config.libraryPath, this.getNFOFilename(config));
        await fs.copyFile(nfoCachePath, nfoLibraryPath);

        result.nfoGenerated = true;
      } catch (error) {
        logger.error('Error generating/writing NFO:', error);
        result.errors.push(`NFO: ${getErrorMessage(error)}`);
      }

      result.success = result.errors.length === 0;

      // Update published_at timestamp and status on success
      if (result.success) {
        const table = this.getTableName(config.entityType);
        if (table) {
          await this.db.execute(
            `UPDATE ${table} SET published_at = CURRENT_TIMESTAMP, identification_status = 'published' WHERE id = ?`,
            [config.entityId]
          );
        }
      }

      logger.info(`Published ${config.entityType} ${config.entityId}`, {
        assetsPublished: result.assetsPublished,
        nfoGenerated: result.nfoGenerated,
        errors: result.errors
      });

      return result;

    } catch (error) {
      logger.error('Error during publish:', error);
      result.errors.push(getErrorMessage(error));
      return result;
    }
  }

  /**
   * Publish a single asset (copy from cache to library)
   */
  private async publishAsset(
    asset: {
      id: number;
      asset_type: string;
      content_hash: string | null;
      provider_url: string;
    },
    config: PublishJobConfig,
    rank: number = 1
  ): Promise<void> {
    // Skip trailers (YouTube URLs, not downloaded)
    if (asset.asset_type === 'trailer' && !asset.content_hash) {
      logger.debug(`Skipping trailer (YouTube URL): ${asset.provider_url}`);
      return;
    }

    if (!asset.content_hash) {
      throw new InvalidStateError(
        'Asset',
        'content_hash',
        `Asset ${asset.id} has no content hash`,
        { service: 'PublishingService', operation: 'publishAsset', metadata: { assetId: asset.id } }
      );
    }

    // Get cache path
    const cachePath = await this.getCachePath(asset.content_hash);
    if (!cachePath) {
      throw new FileNotFoundError(
        asset.content_hash,
        `Cache file not found for hash ${asset.content_hash}`,
        { service: 'PublishingService', operation: 'publishAsset', metadata: { assetId: asset.id } }
      );
    }

    // Determine library path with Kodi naming (includes rank for multiple assets)
    const libraryAssetPath = this.getLibraryAssetPath(config, asset.asset_type, cachePath, rank);
    const tempPath = `${libraryAssetPath}.tmp.${Date.now()}`;

    // Copy from cache to library with atomic write pattern
    try {
      // Copy to temp file first
      await fs.copyFile(cachePath, tempPath);

      // Atomic rename (all-or-nothing operation)
      await fs.rename(tempPath, libraryAssetPath);

      logger.debug(`Published asset: ${asset.asset_type} to ${libraryAssetPath}`);
    } catch (error) {
      // Clean up temp file on failure
      try {
        await fs.unlink(tempPath);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }

      throw new FileSystemError(
        `Failed to copy ${cachePath} to ${libraryAssetPath}: ${getErrorMessage(error)}`,
        ErrorCode.FS_WRITE_FAILED,
        libraryAssetPath,
        true,
        {
          service: 'PublishingService',
          operation: 'publishAsset',
          metadata: { cachePath, libraryAssetPath, assetId: asset.id },
        },
        error instanceof Error ? error : undefined
      );
    }

    // Note: cache_path tracking removed - provider_assets table doesn't have this column
    // The cache location is tracked in cache_image_files/cache_video_files tables instead
  }

  /**
   * Get cache file path from file hash
   * Searches across all cache file tables (images, videos, audio, text)
   */
  private async getCachePath(fileHash: string): Promise<string | null> {
    let result = await this.db.query<{ file_path: string }>(
      `SELECT file_path FROM cache_image_files WHERE file_hash = ? LIMIT 1`,
      [fileHash]
    );
    if (result.length > 0) return result[0].file_path;

    result = await this.db.query<{ file_path: string }>(
      `SELECT file_path FROM cache_video_files WHERE file_hash = ? LIMIT 1`,
      [fileHash]
    );
    if (result.length > 0) return result[0].file_path;

    result = await this.db.query<{ file_path: string }>(
      `SELECT file_path FROM cache_audio_files WHERE file_hash = ? LIMIT 1`,
      [fileHash]
    );
    if (result.length > 0) return result[0].file_path;

    result = await this.db.query<{ file_path: string }>(
      `SELECT file_path FROM cache_text_files WHERE file_hash = ? LIMIT 1`,
      [fileHash]
    );
    if (result.length > 0) return result[0].file_path;

    return null;
  }

  /**
   * Get library asset path with Kodi naming convention
   * Supports rank-based numbering for multiple assets of same type
   *
   * Examples:
   * - rank 1: "Movie (2024)-poster.jpg"
   * - rank 2: "Movie (2024)-poster1.jpg"
   * - rank 3: "Movie (2024)-poster2.jpg"
   */
  private getLibraryAssetPath(config: PublishJobConfig, assetType: string, cachePath: string, rank: number = 1): string {
    const ext = path.extname(cachePath);

    // SECURITY: Sanitize mediaFilename to prevent path traversal attacks
    // Remove any path separators and parent directory references
    let basename = config.mediaFilename || `entity_${config.entityId}`;

    // Use only the filename portion (removes any directory path)
    basename = path.basename(basename);

    // Remove dangerous characters that could be used for traversal
    // Allow only: alphanumeric, spaces, hyphens, underscores, parentheses, and periods
    basename = basename.replace(/[^a-zA-Z0-9\s\-_().]/g, '_');

    // Remove any remaining path traversal attempts
    basename = basename.replace(/\.\./g, '_');

    // Ensure basename is not empty after sanitization
    if (!basename || basename.trim() === '') {
      basename = `entity_${config.entityId}`;
    }

    // Kodi naming conventions
    const kodiSuffix: Record<string, string> = {
      poster: '-poster',
      fanart: '-fanart',
      banner: '-banner',
      clearlogo: '-clearlogo',
      clearart: '-clearart',
      discart: '-disc',
      landscape: '-landscape',
      characterart: '-characterart',
      trailer: '-trailer'
    };

    const suffix = kodiSuffix[assetType] || `-${assetType}`;

    // Rank-based naming for multiple assets
    // Rank 1: no number suffix (e.g., "Movie-poster.jpg")
    // Rank 2+: numbered starting at 1 (e.g., "Movie-poster1.jpg", "Movie-poster2.jpg")
    let filename: string;
    if (rank === 1) {
      filename = `${basename}${suffix}${ext}`;
    } else {
      filename = `${basename}${suffix}${rank - 1}${ext}`;
    }

    return path.join(config.libraryPath, filename);
  }

  /**
   * Get NFO filename for entity
   */
  private getNFOFilename(config: PublishJobConfig): string {
    // SECURITY: Sanitize mediaFilename to prevent path traversal
    let safeFilename = '';
    if (config.mediaFilename) {
      // Use only the filename portion (removes any directory path)
      safeFilename = path.basename(config.mediaFilename);
      // Remove dangerous characters
      safeFilename = safeFilename.replace(/[^a-zA-Z0-9\s\-_().]/g, '_');
      // Remove path traversal attempts
      safeFilename = safeFilename.replace(/\.\./g, '_');
    }

    if (config.entityType === 'movie') {
      // movie.nfo or {filename}.nfo
      return safeFilename ? `${safeFilename}.nfo` : 'movie.nfo';
    } else if (config.entityType === 'series') {
      return 'tvshow.nfo';
    } else {
      // Episode: {filename}.nfo
      return safeFilename ? `${safeFilename}.nfo` : 'episode.nfo';
    }
  }

  /**
   * Generate NFO content for entity
   */
  private async generateNFO(entityType: string, entityId: number): Promise<string> {
    const entity = await this.getEntity(entityType, entityId);
    if (!entity) {
      throw new ResourceNotFoundError(
        entityType,
        entityId,
        'Entity not found',
        { service: 'PublishingService', operation: 'generateNFO' }
      );
    }

    if (entityType === 'movie') {
      return await this.generateMovieNFO(entity);
    } else if (entityType === 'series') {
      return this.generateSeriesNFO(entity);
    } else {
      return this.generateEpisodeNFO(entity);
    }
  }

  /**
   * Generate movie NFO (Kodi format)
   */
  private async generateMovieNFO(movie: Record<string, unknown>): Promise<string> {
    const nfo: string[] = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'];
    nfo.push('<movie>');

    if (movie.title) nfo.push(`  <title>${this.escapeXML(movie.title)}</title>`);
    if (movie.original_title) nfo.push(`  <originaltitle>${this.escapeXML(movie.original_title)}</originaltitle>`);
    if (movie.sort_title) nfo.push(`  <sorttitle>${this.escapeXML(movie.sort_title)}</sorttitle>`);
    if (movie.rating) nfo.push(`  <rating>${movie.rating}</rating>`);
    if (movie.year) nfo.push(`  <year>${movie.year}</year>`);
    if (movie.release_date) nfo.push(`  <premiered>${movie.release_date}</premiered>`);
    if (movie.plot) nfo.push(`  <plot>${this.escapeXML(movie.plot)}</plot>`);
    if (movie.tagline) nfo.push(`  <tagline>${this.escapeXML(movie.tagline)}</tagline>`);
    if (movie.runtime) nfo.push(`  <runtime>${movie.runtime}</runtime>`);
    if (movie.imdb_id) nfo.push(`  <id>${movie.imdb_id}</id>`);
    if (movie.imdb_id) nfo.push(`  <imdbid>${movie.imdb_id}</imdbid>`);
    if (movie.tmdb_id) nfo.push(`  <tmdbid>${movie.tmdb_id}</tmdbid>`);

    // Add genres
    const movieId = Number(movie.id);
    const genres = await this.getMovieGenres(movieId);
    for (const genre of genres) {
      nfo.push(`  <genre>${this.escapeXML(genre.name)}</genre>`);
    }

    // Add actors
    const actors = await this.getMovieActors(movieId);
    for (const actor of actors) {
      nfo.push('  <actor>');
      nfo.push(`    <name>${this.escapeXML(actor.name)}</name>`);
      if (actor.character) nfo.push(`    <role>${this.escapeXML(actor.character)}</role>`);
      if (actor.order !== null) nfo.push(`    <order>${actor.order}</order>`);
      if (actor.thumb) nfo.push(`    <thumb>${this.escapeXML(actor.thumb)}</thumb>`);
      nfo.push('  </actor>');
    }

    // Add directors
    const directors = await this.getMovieDirectors(movieId);
    for (const director of directors) {
      nfo.push(`  <director>${this.escapeXML(director.name)}</director>`);
    }

    // Add writers
    const writers = await this.getMovieWriters(movieId);
    for (const writer of writers) {
      nfo.push(`  <credits>${this.escapeXML(writer.name)}</credits>`);
    }

    // Add studios
    const studios = await this.getMovieStudios(movieId);
    for (const studio of studios) {
      nfo.push(`  <studio>${this.escapeXML(studio.name)}</studio>`);
    }

    nfo.push('</movie>');
    return nfo.join('\n');
  }

  /**
   * Generate series NFO (Kodi format)
   */
  private generateSeriesNFO(series: Record<string, unknown>): string {
    const nfo: string[] = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'];
    nfo.push('<tvshow>');

    if (series.title) nfo.push(`  <title>${this.escapeXML(series.title)}</title>`);
    if (series.original_title) nfo.push(`  <originaltitle>${this.escapeXML(series.original_title)}</originaltitle>`);
    if (series.sort_title) nfo.push(`  <sorttitle>${this.escapeXML(series.sort_title)}</sorttitle>`);
    if (series.rating) nfo.push(`  <rating>${series.rating}</rating>`);
    if (series.year) nfo.push(`  <year>${series.year}</year>`);
    if (series.first_aired) nfo.push(`  <premiered>${series.first_aired}</premiered>`);
    if (series.plot) nfo.push(`  <plot>${this.escapeXML(series.plot)}</plot>`);
    if (series.imdb_id) nfo.push(`  <id>${series.imdb_id}</id>`);
    if (series.imdb_id) nfo.push(`  <imdbid>${series.imdb_id}</imdbid>`);
    if (series.tmdb_id) nfo.push(`  <tmdbid>${series.tmdb_id}</tmdbid>`);
    if (series.tvdb_id) nfo.push(`  <tvdbid>${series.tvdb_id}</tvdbid>`);

    nfo.push('</tvshow>');
    return nfo.join('\n');
  }

  /**
   * Generate episode NFO (Kodi format)
   */
  private generateEpisodeNFO(episode: Record<string, unknown>): string {
    const nfo: string[] = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'];
    nfo.push('<episodedetails>');

    if (episode.title) nfo.push(`  <title>${this.escapeXML(episode.title)}</title>`);
    if (episode.season_number) nfo.push(`  <season>${episode.season_number}</season>`);
    if (episode.episode_number) nfo.push(`  <episode>${episode.episode_number}</episode>`);
    if (episode.rating) nfo.push(`  <rating>${episode.rating}</rating>`);
    if (episode.aired_date) nfo.push(`  <aired>${episode.aired_date}</aired>`);
    if (episode.plot) nfo.push(`  <plot>${this.escapeXML(episode.plot)}</plot>`);
    if (episode.runtime) nfo.push(`  <runtime>${episode.runtime}</runtime>`);
    if (episode.imdb_id) nfo.push(`  <id>${episode.imdb_id}</id>`);
    if (episode.imdb_id) nfo.push(`  <imdbid>${episode.imdb_id}</imdbid>`);
    if (episode.tmdb_id) nfo.push(`  <tmdbid>${episode.tmdb_id}</tmdbid>`);
    if (episode.tvdb_id) nfo.push(`  <tvdbid>${episode.tvdb_id}</tvdbid>`);

    nfo.push('</episodedetails>');
    return nfo.join('\n');
  }

  /**
   * Escape XML special characters
   */
  private escapeXML(str: unknown): string {
    const strValue = String(str ?? '');
    return strValue
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Save NFO to cache and update cache_text_files with hash
   * This allows verification to detect when metadata changes and re-publish
   * Returns the cache file path
   */
  private async saveNFOToCache(
    entityType: string,
    entityId: number,
    nfoContent: string,
    nfoHash: string
  ): Promise<string> {
    // Save NFO to cache directory
    const cacheDir = path.join(this.cacheDir, 'text', entityType, entityId.toString());
    await fs.mkdir(cacheDir, { recursive: true });

    const nfoFileName = `${entityType}.nfo`;
    const nfoCachePath = path.join(cacheDir, nfoFileName);

    // Write NFO content to cache
    await fs.writeFile(nfoCachePath, nfoContent, 'utf-8');

    // Get file size
    const stats = await fs.stat(nfoCachePath);
    const fileSize = stats.size;

    // Check if NFO already exists in cache_text_files
    const existing = await this.db.query<{ id: number; file_hash: string }>(
      `SELECT id, file_hash FROM cache_text_files
       WHERE entity_type = ? AND entity_id = ? AND text_type = 'nfo'
       LIMIT 1`,
      [entityType, entityId]
    );

    if (existing.length > 0) {
      // Update existing record with new hash and file size
      await this.db.execute(
        `UPDATE cache_text_files
         SET file_hash = ?, file_size = ?, last_verified_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [nfoHash, fileSize, existing[0].id]
      );
    } else {
      // Insert new cache record
      await this.db.execute(
        `INSERT INTO cache_text_files (
          entity_type, entity_id, file_path, file_name, file_size, file_hash,
          text_type, source_type, nfo_is_valid, nfo_has_tmdb_id
        ) VALUES (?, ?, ?, ?, ?, ?, 'nfo', 'user', 1, 1)`,
        [entityType, entityId, nfoCachePath, nfoFileName, fileSize, nfoHash]
      );
    }

    return nfoCachePath;
  }

  /**
   * Get entity data from database
   */
  private async getEntity(entityType: string, entityId: number): Promise<Record<string, unknown> | null> {
    const table = this.getTableName(entityType);
    if (!table) {
      return null;
    }

    const result = await this.db.query(`SELECT * FROM ${table} WHERE id = ?`, [entityId]);
    return result.length > 0 ? result[0] : null;
  }

  /**
   * Get selected assets for entity
   */
  private async getSelectedAssets(entityType: string, entityId: number): Promise<Array<{
    id: number;
    asset_type: string;
    content_hash: string | null;
    provider_url: string;
    rank: number;
  }>> {
    // Query with rank based on score (best = rank 1, second-best = rank 2, etc.)
    return this.db.query(
      `SELECT
         id,
         asset_type,
         content_hash,
         provider_url,
         ROW_NUMBER() OVER (PARTITION BY asset_type ORDER BY score DESC) as rank
       FROM provider_assets
       WHERE entity_type = ? AND entity_id = ? AND is_selected = 1
       ORDER BY asset_type, score DESC`,
      [entityType, entityId]
    );
  }

  /**
   * Get table name for entity type
   */
  private getTableName(entityType: string): string | null {
    const mapping: Record<string, string> = {
      movie: 'movies',
      series: 'series',
      episode: 'episodes'
    };

    return mapping[entityType] || null;
  }

  /**
   * Check if entity has been published (has published_nfo_hash)
   * This can be used to determine if initial publishing is needed
   */
  async hasBeenPublished(entityType: string, entityId: number): Promise<boolean> {
    const table = this.getTableName(entityType);
    if (!table) {
      return false;
    }

    const result = await this.db.query<{ published_nfo_hash: string | null }>(
      `SELECT published_nfo_hash FROM ${table} WHERE id = ?`,
      [entityId]
    );

    return result.length > 0 && result[0].published_nfo_hash !== null;
  }

  /**
   * Get all entities that have never been published
   * Useful for initial publishing after enrichment
   */
  async getUnpublishedEntities(entityType: string): Promise<number[]> {
    const table = this.getTableName(entityType);
    if (!table) {
      return [];
    }

    const result = await this.db.query<{ id: number }>(
      `SELECT id FROM ${table} WHERE published_nfo_hash IS NULL AND monitored = 1`,
      []
    );

    return result.map(r => r.id);
  }

  /**
   * Get movie genres
   */
  private async getMovieGenres(movieId: number): Promise<Array<{ name: string }>> {
    return this.db.query(
      `SELECT g.name
       FROM genres g
       INNER JOIN movie_genres mg ON g.id = mg.genre_id
       WHERE mg.movie_id = ?
       ORDER BY g.name`,
      [movieId]
    );
  }

  /**
   * Get movie actors
   */
  private async getMovieActors(movieId: number): Promise<Array<{
    name: string;
    character: string | null;
    order: number | null;
    thumb: string | null;
  }>> {
    return this.db.query(
      `SELECT a.name, ma.role as character, ma.actor_order as 'order', a.image_cache_path as thumb
       FROM actors a
       INNER JOIN movie_actors ma ON a.id = ma.actor_id
       WHERE ma.movie_id = ?
       ORDER BY ma.actor_order, a.name`,
      [movieId]
    );
  }

  /**
   * Get movie directors
   */
  private async getMovieDirectors(movieId: number): Promise<Array<{ name: string }>> {
    return this.db.query(
      `SELECT c.name
       FROM crew c
       INNER JOIN movie_crew mc ON c.id = mc.crew_id
       WHERE mc.movie_id = ? AND mc.role = 'Director'
       ORDER BY c.name`,
      [movieId]
    );
  }

  /**
   * Get movie writers
   */
  private async getMovieWriters(movieId: number): Promise<Array<{ name: string }>> {
    return this.db.query(
      `SELECT c.name
       FROM crew c
       INNER JOIN movie_crew mc ON c.id = mc.crew_id
       WHERE mc.movie_id = ? AND mc.role IN ('Writer', 'Screenplay')
       ORDER BY c.name`,
      [movieId]
    );
  }

  /**
   * Get movie studios
   */
  private async getMovieStudios(movieId: number): Promise<Array<{ name: string }>> {
    return this.db.query(
      `SELECT s.name
       FROM studios s
       INNER JOIN movie_studios ms ON s.id = ms.studio_id
       WHERE ms.movie_id = ?
       ORDER BY s.name`,
      [movieId]
    );
  }

  // ============================================
  // Actor Publishing
  // ============================================

  /**
   * Publish actor thumbnails to library .actors/ directory
   *
   * Workflow:
   * 1. Delete entire .actors/ directory
   * 2. Get actors linked to movie
   * 3. For each actor:
   *    - Check cache for thumbnail
   *    - If not cached, download from TMDB
   *    - Copy to .actors/Actor Name.jpg
   *
   * @returns Number of actors published
   */
  private async publishActors(config: PublishJobConfig): Promise<number> {
    const actorsDir = path.join(config.libraryPath, '.actors');

    try {
      // Step 1: Delete entire .actors/ directory
      await fs.rm(actorsDir, { recursive: true, force: true });
      logger.debug('[PublishingService] Deleted .actors/ directory', { actorsDir });
    } catch (error) {
      // Ignore if directory doesn't exist
      logger.debug('[PublishingService] .actors/ directory did not exist', { actorsDir });
    }

    // Step 2: Get actors linked to this movie
    const actors = await this.db.query<{
      actor_id: number;
      name: string;
      tmdb_id: number | null;
      image_cache_path: string | null;
    }>(
      `SELECT
         a.id as actor_id,
         a.name,
         a.tmdb_id,
         a.image_cache_path
       FROM actors a
       INNER JOIN movie_actors ma ON a.id = ma.actor_id
       WHERE ma.movie_id = ?
       ORDER BY ma.actor_order`,
      [config.entityId]
    );

    if (actors.length === 0) {
      logger.debug('[PublishingService] No actors to publish', { entityId: config.entityId });
      return 0;
    }

    // Ensure .actors/ directory exists
    await fs.mkdir(actorsDir, { recursive: true });

    let publishedCount = 0;

    // Step 3: Process each actor
    for (const actor of actors) {
      try {
        let cachePath: string;

        // Check if image_cache_path is a local file (downloaded during enrichment)
        if (actor.image_cache_path && !actor.image_cache_path.startsWith('/')) {
          // Local path - already downloaded during enrichment
          cachePath = actor.image_cache_path;
        } else {
          // TMDB URL - need to download (fallback for legacy data or manual entries)
          const cachedImage = await this.db.query<{
            file_path: string;
          }>(
            `SELECT file_path
             FROM cache_image_files
             WHERE entity_type = 'actor'
               AND entity_id = ?
             LIMIT 1`,
            [actor.actor_id]
          );

          if (cachedImage.length > 0) {
            cachePath = cachedImage[0].file_path;
          } else if (actor.image_cache_path && actor.tmdb_id) {
            // Download from TMDB (fallback)
            cachePath = await this.downloadActorThumbnail(
              actor.actor_id,
              actor.tmdb_id,
              actor.image_cache_path
            );
          } else {
            logger.debug('[PublishingService] Actor has no thumbnail', {
              actorId: actor.actor_id,
              name: actor.name,
            });
            continue;
          }
        }

        // Copy to library .actors/Actor Name.jpg
        const sanitizedName = this.sanitizeActorName(actor.name);
        const libraryPath = path.join(actorsDir, `${sanitizedName}.jpg`);

        await fs.copyFile(cachePath, libraryPath);

        logger.debug('[PublishingService] Published actor thumbnail', {
          actorId: actor.actor_id,
          name: actor.name,
          libraryPath,
        });

        publishedCount++;
      } catch (error) {
        logger.error('[PublishingService] Failed to publish actor thumbnail', {
          actorId: actor.actor_id,
          name: actor.name,
          error: getErrorMessage(error),
        });
        // Continue with other actors
      }
    }

    logger.info('[PublishingService] Actor publishing complete', {
      entityId: config.entityId,
      totalActors: actors.length,
      publishedCount,
    });

    return publishedCount;
  }

  /**
   * Download actor thumbnail from TMDB to cache
   *
   * @param actorId Database actor ID
   * @param tmdbId TMDB person ID
   * @param tmdbPath TMDB image path (e.g., "/abc123.jpg")
   * @returns Cache file path
   */
  private async downloadActorThumbnail(
    actorId: number,
    tmdbId: number,
    tmdbPath: string
  ): Promise<string> {
    // Construct full TMDB URL (original size for quality)
    const tmdbUrl = `https://image.tmdb.org/t/p/original${tmdbPath}`;

    logger.debug('[PublishingService] Downloading actor thumbnail from TMDB', {
      actorId,
      tmdbId,
      tmdbUrl,
    });

    // Download image
    const response = await axios.get(tmdbUrl, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(response.data);

    // Calculate hash for deduplication
    const hash = crypto.createHash('sha256').update(imageBuffer).digest('hex');

    // Determine file extension
    const ext = path.extname(tmdbPath) || '.jpg';

    // Create cache directory
    const cacheDir = path.join(this.cacheDir, 'images', 'actor', actorId.toString());
    await fs.mkdir(cacheDir, { recursive: true });

    // Save to cache
    const cachePath = path.join(cacheDir, `${hash}${ext}`);
    await fs.writeFile(cachePath, imageBuffer);

    // Insert into cache_image_files table
    // Note: width/height default to 0 since we don't analyze the image
    // format is inferred from extension
    const format = ext.substring(1); // Remove leading dot

    await this.db.execute(
      `INSERT INTO cache_image_files (
        entity_type, entity_id, image_type, file_path, file_name,
        file_hash, file_size, width, height, format, source_type, source_url, provider_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'actor',
        actorId,
        'actor_thumb',
        cachePath,
        path.basename(cachePath),
        hash,
        imageBuffer.length,
        0, // width - unknown
        0, // height - unknown
        format,
        'provider',
        tmdbUrl,
        'tmdb',
      ]
    );

    // Update actor record with cache path for UI serving
    await this.db.execute(
      `UPDATE actors SET image_cache_path = ? WHERE id = ?`,
      [cachePath, actorId]
    );

    logger.info('[PublishingService] Downloaded actor thumbnail to cache', {
      actorId,
      tmdbId,
      cachePath,
      fileSize: imageBuffer.length,
    });

    return cachePath;
  }

  /**
   * Sanitize actor name for filesystem
   * Removes invalid characters and limits length
   */
  private sanitizeActorName(name: string): string {
    return name
      .replace(/[<>:"/\\|?*]/g, '') // Remove Windows/Linux invalid chars
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
      .substring(0, 100); // Limit length
  }
}
