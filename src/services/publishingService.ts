import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { DatabaseConnection } from '../types/database.js';
import { logger } from '../middleware/logging.js';

/**
 * Publishing Service
 *
 * Publishes entity metadata and assets to library directory:
 * 1. Copy selected assets from cache to library (using Kodi naming)
 * 2. Generate NFO file with current metadata
 * 3. Calculate NFO hash and store in published_nfo_hash
 * 4. Update last_published_at timestamp
 * 5. Clear has_unpublished_changes flag
 * 6. Log publication in publish_log table
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
        } catch (error: any) {
          logger.error(`Error publishing asset ${asset.id}:`, error);
          result.errors.push(`Asset ${asset.asset_type}: ${error.message}`);
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
      } catch (error: any) {
        logger.error('Error generating/writing NFO:', error);
        result.errors.push(`NFO: ${error.message}`);
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

    } catch (error: any) {
      logger.error('Error during publish:', error);
      result.errors.push(error.message);
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

    // Copy from cache to library
    try {
      await fs.copyFile(cachePath, libraryAssetPath);
      logger.debug(`Published asset: ${asset.asset_type} to ${libraryAssetPath}`);
    } catch (error) {
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
    const result = await this.db.query<{ cache_path: string }>(
      `SELECT cache_path FROM cache_inventory WHERE content_hash = ?`,
      [contentHash]
    );

    return result.length > 0 ? result[0].cache_path : null;
  }

  /**
   * Get library asset path with Kodi naming convention
   */
  private getLibraryAssetPath(config: PublishConfig, assetType: string, cachePath: string): string {
    const ext = path.extname(cachePath);
    const basename = config.mediaFilename || `entity_${config.entityId}`;

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
    if (config.entityType === 'movie') {
      // movie.nfo or {filename}.nfo
      return config.mediaFilename ? `${config.mediaFilename}.nfo` : 'movie.nfo';
    } else if (config.entityType === 'series') {
      return 'tvshow.nfo';
    } else {
      // Episode: {filename}.nfo
      return config.mediaFilename ? `${config.mediaFilename}.nfo` : 'episode.nfo';
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
      return this.generateMovieNFO(entity);
    } else if (entityType === 'series') {
      return this.generateSeriesNFO(entity);
    } else {
      return this.generateEpisodeNFO(entity);
    }
  }

  /**
   * Generate movie NFO (Kodi format)
   */
  private generateMovieNFO(movie: any): string {
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

    // TODO: Add genres, actors, directors, studios (from joined tables)

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
       SET has_unpublished_changes = 0,
           last_published_at = CURRENT_TIMESTAMP,
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
        entity_type, entity_id, published_at, assets_published, nfo_generated, errors
      ) VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?, ?)`,
      [
        config.entityType,
        config.entityId,
        result.assetsPublished,
        result.nfoGenerated ? 1 : 0,
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
   * Check if entity needs republishing (has unpublished changes)
   */
  async needsPublishing(entityType: string, entityId: number): Promise<boolean> {
    const table = this.getTableName(entityType);
    if (!table) {
      return false;
    }

    const result = await this.db.query<{ has_unpublished_changes: number }>(
      `SELECT has_unpublished_changes FROM ${table} WHERE id = ?`,
      [entityId]
    );

    return result.length > 0 && result[0].has_unpublished_changes === 1;
  }

  /**
   * Get all entities that need publishing
   */
  async getEntitiesNeedingPublish(entityType: string): Promise<number[]> {
    const table = this.getTableName(entityType);
    if (!table) {
      return [];
    }

    const result = await this.db.query<{ id: number }>(
      `SELECT id FROM ${table} WHERE has_unpublished_changes = 1`,
      []
    );

    return result.map(r => r.id);
  }
}
