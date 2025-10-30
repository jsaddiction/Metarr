/**
 * Fanart.tv Cache Adapter
 *
 * Normalizes Fanart.tv API responses and stores them in the provider cache.
 *
 * Responsibilities:
 * 1. Fetch images from Fanart.tv (movies and TV shows)
 * 2. Normalize data to our schema
 * 3. Store in provider_cache_images table
 * 4. Return count of images cached
 *
 * Image types stored:
 * - clearlogo, clearlogo_hd (HD transparent logos)
 * - clearart, clearart_hd (HD clearart)
 * - discart (disc images with disc number/type)
 * - banner
 * - landscape (moviethumb/tvthumb)
 * - characterart
 *
 * Note: Fanart.tv uses TMDB ID for movies and TVDB ID for TV shows
 */

import { DatabaseConnection } from '../../../types/database.js';
import { FanArtClient } from '../fanart/FanArtClient.js';
import { FanArtImage, FanArtImageWithDisc } from '../../../types/providers/fanart.js';
import { logger } from '../../../middleware/logging.js';

export interface FanartCacheResult {
  imagesCached: number;
  imageTypes: string[];
}

export class FanartCacheAdapter {
  constructor(
    private db: DatabaseConnection,
    private fanartClient: FanArtClient
  ) {}

  /**
   * Fetch movie images from Fanart.tv and add to cache
   *
   * @param movieCacheId - provider_cache_movies.id
   * @param tmdbId - TMDB movie ID (required by Fanart.tv)
   * @returns Count of images cached
   */
  async fetchAndCacheMovieImages(
    movieCacheId: number,
    tmdbId: number
  ): Promise<FanartCacheResult> {
    try {
      const fanartData = await this.fanartClient.getMovieImages(tmdbId);

      if (!fanartData) {
        logger.debug('[FanartCacheAdapter] No Fanart.tv images found for movie', { tmdbId });
        return { imagesCached: 0, imageTypes: [] };
      }

      // Store all image types
      let imagesCached = 0;
      const imageTypes: Set<string> = new Set();

      // HD Movie Logo (clearlogo_hd)
      if (fanartData.hdmovielogo) {
        for (const img of fanartData.hdmovielogo) {
          await this.storeImage(movieCacheId, 'movie', 'clearlogo_hd', img, { is_hd: true });
          imagesCached++;
          imageTypes.add('clearlogo_hd');
        }
      }

      // Movie Logo (clearlogo)
      if (fanartData.movielogo) {
        for (const img of fanartData.movielogo) {
          await this.storeImage(movieCacheId, 'movie', 'clearlogo', img);
          imagesCached++;
          imageTypes.add('clearlogo');
        }
      }

      // HD Movie Clearart (clearart_hd)
      if (fanartData.hdmovieclearart) {
        for (const img of fanartData.hdmovieclearart) {
          await this.storeImage(movieCacheId, 'movie', 'clearart_hd', img, { is_hd: true });
          imagesCached++;
          imageTypes.add('clearart_hd');
        }
      }

      // Movie Clearart (clearart)
      if (fanartData.movieart) {
        for (const img of fanartData.movieart) {
          await this.storeImage(movieCacheId, 'movie', 'clearart', img);
          imagesCached++;
          imageTypes.add('clearart');
        }
      }

      // Movie Disc (discart)
      if (fanartData.moviedisc) {
        for (const img of fanartData.moviedisc) {
          await this.storeDiscImage(movieCacheId, 'movie', img);
          imagesCached++;
          imageTypes.add('discart');
        }
      }

      // Movie Banner
      if (fanartData.moviebanner) {
        for (const img of fanartData.moviebanner) {
          await this.storeImage(movieCacheId, 'movie', 'banner', img);
          imagesCached++;
          imageTypes.add('banner');
        }
      }

      // Movie Thumb (landscape)
      if (fanartData.moviethumb) {
        for (const img of fanartData.moviethumb) {
          await this.storeImage(movieCacheId, 'movie', 'landscape', img);
          imagesCached++;
          imageTypes.add('landscape');
        }
      }

      logger.info('[FanartCacheAdapter] Movie images cached from Fanart.tv', {
        movieCacheId,
        tmdbId,
        imagesCached,
        imageTypes: Array.from(imageTypes),
      });

      return { imagesCached, imageTypes: Array.from(imageTypes) };
    } catch (error) {
      logger.error('[FanartCacheAdapter] Failed to fetch/cache movie images', {
        movieCacheId,
        tmdbId,
        error: error instanceof Error ? error.message : error,
      });
      return { imagesCached: 0, imageTypes: [] };
    }
  }

  /**
   * Fetch TV show images from Fanart.tv and add to cache
   *
   * @param tvshowCacheId - provider_cache_tvshows.id (when implemented)
   * @param tvdbId - TVDB show ID (required by Fanart.tv)
   * @returns Count of images cached
   */
  async fetchAndCacheTVImages(
    tvshowCacheId: number,
    tvdbId: number
  ): Promise<FanartCacheResult> {
    try {
      const fanartData = await this.fanartClient.getTVImages(tvdbId);

      if (!fanartData) {
        logger.debug('[FanartCacheAdapter] No Fanart.tv images found for TV show', { tvdbId });
        return { imagesCached: 0, imageTypes: [] };
      }

      let imagesCached = 0;
      const imageTypes: Set<string> = new Set();

      // HD TV Logo (clearlogo_hd)
      if (fanartData.hdtvlogo) {
        for (const img of fanartData.hdtvlogo) {
          await this.storeImage(tvshowCacheId, 'tvshow', 'clearlogo_hd', img, { is_hd: true });
          imagesCached++;
          imageTypes.add('clearlogo_hd');
        }
      }

      // Clearlogo
      if (fanartData.clearlogo) {
        for (const img of fanartData.clearlogo) {
          await this.storeImage(tvshowCacheId, 'tvshow', 'clearlogo', img);
          imagesCached++;
          imageTypes.add('clearlogo');
        }
      }

      // HD Clearart
      if (fanartData.hdclearart) {
        for (const img of fanartData.hdclearart) {
          await this.storeImage(tvshowCacheId, 'tvshow', 'clearart_hd', img, { is_hd: true });
          imagesCached++;
          imageTypes.add('clearart_hd');
        }
      }

      // Clearart
      if (fanartData.clearart) {
        for (const img of fanartData.clearart) {
          await this.storeImage(tvshowCacheId, 'tvshow', 'clearart', img);
          imagesCached++;
          imageTypes.add('clearart');
        }
      }

      // Character Art
      if (fanartData.characterart) {
        for (const img of fanartData.characterart) {
          await this.storeImage(tvshowCacheId, 'tvshow', 'characterart', img);
          imagesCached++;
          imageTypes.add('characterart');
        }
      }

      // TV Banner
      if (fanartData.tvbanner) {
        for (const img of fanartData.tvbanner) {
          await this.storeImage(tvshowCacheId, 'tvshow', 'banner', img);
          imagesCached++;
          imageTypes.add('banner');
        }
      }

      // TV Thumb (landscape)
      if (fanartData.tvthumb) {
        for (const img of fanartData.tvthumb) {
          await this.storeImage(tvshowCacheId, 'tvshow', 'landscape', img);
          imagesCached++;
          imageTypes.add('landscape');
        }
      }

      logger.info('[FanartCacheAdapter] TV show images cached from Fanart.tv', {
        tvshowCacheId,
        tvdbId,
        imagesCached,
        imageTypes: Array.from(imageTypes),
      });

      return { imagesCached, imageTypes: Array.from(imageTypes) };
    } catch (error) {
      logger.error('[FanartCacheAdapter] Failed to fetch/cache TV images', {
        tvshowCacheId,
        tvdbId,
        error: error instanceof Error ? error.message : error,
      });
      return { imagesCached: 0, imageTypes: [] };
    }
  }

  /**
   * Store a standard Fanart.tv image
   */
  private async storeImage(
    entityCacheId: number,
    entityType: 'movie' | 'tvshow' | 'season' | 'collection' | 'person',
    imageType: string,
    image: FanArtImage,
    extras: { is_hd?: boolean } = {}
  ): Promise<void> {
    // Parse likes (comes as string)
    const likes = parseInt(image.likes, 10) || 0;

    // Extract language (use null if "00" which means no language)
    const language = image.lang === '00' ? null : image.lang;

    // Check if this image already exists (by provider + provider_image_id)
    const existing = await this.db.query(
      `SELECT id FROM provider_cache_images
       WHERE provider_name = 'fanart.tv' AND provider_image_id = ?`,
      [image.id]
    );

    if (existing.length > 0) {
      // Update existing record
      await this.db.execute(
        `UPDATE provider_cache_images SET
          entity_type = ?, entity_cache_id = ?, image_type = ?, file_path = ?,
          likes = ?, iso_639_1 = ?, is_hd = ?, fetched_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          entityType,
          entityCacheId,
          imageType,
          image.url,
          likes,
          language,
          extras.is_hd ? 1 : 0,
          existing[0].id,
        ]
      );
    } else {
      // Insert new record
      await this.db.execute(
        `INSERT INTO provider_cache_images (
          entity_type, entity_cache_id, image_type, provider_name,
          provider_image_id, file_path, likes, iso_639_1, is_hd, fetched_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          entityType,
          entityCacheId,
          imageType,
          'fanart.tv',
          image.id,
          image.url,
          likes,
          language,
          extras.is_hd ? 1 : 0,
        ]
      );
    }
  }

  /**
   * Store a disc image (includes disc number and type)
   */
  private async storeDiscImage(
    entityCacheId: number,
    entityType: 'movie' | 'tvshow',
    image: FanArtImageWithDisc
  ): Promise<void> {
    const likes = parseInt(image.likes, 10) || 0;
    const language = image.lang === '00' ? null : image.lang;
    const discNumber = parseInt(image.disc, 10) || null;

    // Check if this image already exists (by provider + provider_image_id)
    const existing = await this.db.query(
      `SELECT id FROM provider_cache_images
       WHERE provider_name = 'fanart.tv' AND provider_image_id = ?`,
      [image.id]
    );

    if (existing.length > 0) {
      // Update existing record
      await this.db.execute(
        `UPDATE provider_cache_images SET
          entity_type = ?, entity_cache_id = ?, image_type = ?, file_path = ?,
          likes = ?, iso_639_1 = ?, disc_number = ?, disc_type = ?, fetched_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          entityType,
          entityCacheId,
          'discart',
          image.url,
          likes,
          language,
          discNumber,
          image.disc_type,
          existing[0].id,
        ]
      );
    } else {
      // Insert new record
      await this.db.execute(
        `INSERT INTO provider_cache_images (
          entity_type, entity_cache_id, image_type, provider_name,
          provider_image_id, file_path, likes, iso_639_1,
          disc_number, disc_type, fetched_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          entityType,
          entityCacheId,
          'discart',
          'fanart.tv',
          image.id,
          image.url,
          likes,
          language,
          discNumber,
          image.disc_type,
        ]
      );
    }
  }
}
