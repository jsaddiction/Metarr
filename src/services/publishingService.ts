import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { DatabaseConnection } from '../types/database.js';
import { logger } from '../middleware/logging.js';
import { getErrorMessage } from '../utils/errorHandling.js';

/**
 * Publishing Service
 *
 * Publishes entity metadata and assets to library directory:
 * 1. Copy selected assets from cache to library (using Kodi naming)
 * 2. Generate NFO file with current metadata
 * 3. Calculate NFO hash and store in published_nfo_hash
 * 4. Update last_published_at timestamp
 * 5. Log publication in publish_log table
 *
 * Publishing is idempotent - can be called multiple times safely.
 */

export interface PublishConfig {
  entityType: 'movie' | 'series' | 'episode';
  entityId: number;
  libraryPath: string; // Directory containing media file
  mediaFilename?: string; // For naming assets (e.g., "Movie Name (2023)")
}

export interface PublishResult {
  success: boolean;
  assetsPublished: number;
  nfoGenerated: boolean;
  errors: string[];
}

export class PublishingService {
  private db: DatabaseConnection;

  constructor(db: DatabaseConnection) {
    this.db = db;
  }

  /**
   * Publish entity to library directory
   */
  async publish(config: PublishConfig): Promise<PublishResult> {
    const result: PublishResult = {
      success: false,
      assetsPublished: 0,
      nfoGenerated: false,
      errors: []
    };

    try {
      // Get entity data
      const entity = await this.getEntity(config.entityType, config.entityId);
      if (!entity) {
        result.errors.push('Entity not found');
        return result;
      }

      // Get selected assets
      const selectedAssets = await this.getSelectedAssets(config.entityType, config.entityId);

      // Publish each asset
      for (const asset of selectedAssets) {
        try {
          await this.publishAsset(asset, config);
          result.assetsPublished++;
        } catch (error) {
          logger.error(`Error publishing asset ${asset.id}:`, error);
          result.errors.push(`Asset ${asset.asset_type}: ${getErrorMessage(error)}`);
        }
      }

      // Generate and write NFO file
      try {
        const nfoContent = await this.generateNFO(config.entityType, config.entityId);
        const nfoPath = path.join(config.libraryPath, this.getNFOFilename(config));
        await fs.writeFile(nfoPath, nfoContent, 'utf-8');

        // Calculate NFO hash
        const nfoHash = crypto.createHash('sha256').update(nfoContent).digest('hex');

        // Update entity with published metadata
        await this.updatePublishedMetadata(config.entityType, config.entityId, nfoHash);

        result.nfoGenerated = true;
      } catch (error) {
        logger.error('Error generating/writing NFO:', error);
        result.errors.push(`NFO: ${getErrorMessage(error)}`);
      }

      // Log publication
      await this.logPublication(config, result);

      result.success = result.errors.length === 0;

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
    config: PublishConfig
  ): Promise<void> {
    // Skip trailers (YouTube URLs, not downloaded)
    if (asset.asset_type === 'trailer' && !asset.content_hash) {
      logger.debug(`Skipping trailer (YouTube URL): ${asset.provider_url}`);
      return;
    }

    if (!asset.content_hash) {
      throw new Error(`Asset ${asset.id} has no content hash`);
    }

    // Get cache path
    const cachePath = await this.getCachePath(asset.content_hash);
    if (!cachePath) {
      throw new Error(`Cache file not found for hash ${asset.content_hash}`);
    }

    // Determine library path with Kodi naming
    const libraryAssetPath = this.getLibraryAssetPath(config, asset.asset_type, cachePath);
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

      throw new Error(`Failed to copy ${cachePath} to ${libraryAssetPath}: ${error}`);
    }

    // Update cache_path in asset_candidates (for tracking)
    await this.db.execute(
      `UPDATE asset_candidates SET cache_path = ? WHERE id = ?`,
      [libraryAssetPath, asset.id]
    );
  }

  /**
   * Get cache file path from content hash
   */
  private async getCachePath(contentHash: string): Promise<string | null> {
    const result = await this.db.query<{ file_path: string }>(
      `SELECT file_path FROM cache_inventory WHERE content_hash = ?`,
      [contentHash]
    );

    return result.length > 0 ? result[0].file_path : null;
  }

  /**
   * Get library asset path with Kodi naming convention
   */
  private getLibraryAssetPath(config: PublishConfig, assetType: string, cachePath: string): string {
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
    return path.join(config.libraryPath, `${basename}${suffix}${ext}`);
  }

  /**
   * Get NFO filename for entity
   */
  private getNFOFilename(config: PublishConfig): string {
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
      throw new Error('Entity not found');
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
  private async generateMovieNFO(movie: any): Promise<string> {
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
    const genres = await this.getMovieGenres(movie.id);
    for (const genre of genres) {
      nfo.push(`  <genre>${this.escapeXML(genre.name)}</genre>`);
    }

    // Add actors
    const actors = await this.getMovieActors(movie.id);
    for (const actor of actors) {
      nfo.push('  <actor>');
      nfo.push(`    <name>${this.escapeXML(actor.name)}</name>`);
      if (actor.character) nfo.push(`    <role>${this.escapeXML(actor.character)}</role>`);
      if (actor.order !== null) nfo.push(`    <order>${actor.order}</order>`);
      if (actor.thumb) nfo.push(`    <thumb>${this.escapeXML(actor.thumb)}</thumb>`);
      nfo.push('  </actor>');
    }

    // Add directors
    const directors = await this.getMovieDirectors(movie.id);
    for (const director of directors) {
      nfo.push(`  <director>${this.escapeXML(director.name)}</director>`);
    }

    // Add writers
    const writers = await this.getMovieWriters(movie.id);
    for (const writer of writers) {
      nfo.push(`  <credits>${this.escapeXML(writer.name)}</credits>`);
    }

    // Add studios
    const studios = await this.getMovieStudios(movie.id);
    for (const studio of studios) {
      nfo.push(`  <studio>${this.escapeXML(studio.name)}</studio>`);
    }

    nfo.push('</movie>');
    return nfo.join('\n');
  }

  /**
   * Generate series NFO (Kodi format)
   */
  private generateSeriesNFO(series: any): string {
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
  private generateEpisodeNFO(episode: any): string {
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
  private escapeXML(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Update entity with published metadata
   */
  private async updatePublishedMetadata(
    entityType: string,
    entityId: number,
    nfoHash: string
  ): Promise<void> {
    const table = this.getTableName(entityType);
    if (!table) {
      throw new Error(`Unknown entity type: ${entityType}`);
    }

    await this.db.execute(
      `UPDATE ${table}
       SET last_published_at = CURRENT_TIMESTAMP,
           published_nfo_hash = ?
       WHERE id = ?`,
      [nfoHash, entityId]
    );
  }

  /**
   * Log publication in publish_log table
   */
  private async logPublication(config: PublishConfig, result: PublishResult): Promise<void> {
    await this.db.execute(
      `INSERT INTO publish_log (
        entity_type, entity_id, published_at, assets_published, nfo_content, error_message
      ) VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?, ?)`,
      [
        config.entityType,
        config.entityId,
        JSON.stringify({ count: result.assetsPublished }),
        result.nfoGenerated ? 'NFO Generated' : null,
        result.errors.length > 0 ? JSON.stringify(result.errors) : null
      ]
    );
  }

  /**
   * Get entity data from database
   */
  private async getEntity(entityType: string, entityId: number): Promise<any> {
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
  }>> {
    return this.db.query(
      `SELECT id, asset_type, content_hash, provider_url
       FROM asset_candidates
       WHERE entity_type = ? AND entity_id = ? AND is_selected = 1`,
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
      `SELECT a.name, ma.character, ma.display_order as 'order', a.thumb
       FROM actors a
       INNER JOIN movie_actors ma ON a.id = ma.actor_id
       WHERE ma.movie_id = ?
       ORDER BY ma.display_order, a.name`,
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
}
