/**
 * Asset Discovery for Clean Schema
 *
 * Discovers local image files and stores them in cache_assets table,
 * then updates entity FK columns (poster_id, fanart_id, etc.)
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../../middleware/logging.js';
import { DatabaseConnection } from '../../types/database.js';

interface DiscoveredAssets {
  images: number;
  trailers: number;
  subtitles: number;
}

/**
 * Discover and store local assets for a movie
 */
export async function discoverAndStoreAssetsClean(
  db: DatabaseConnection,
  entityType: 'movie',
  entityId: number,
  dirPath: string,
  videoFileName: string
): Promise<DiscoveredAssets> {
  const result: DiscoveredAssets = {
    images: 0,
    trailers: 0,
    subtitles: 0,
  };

  try {
    // List all files in directory
    const files = await fs.readdir(dirPath);

    // Detect poster
    const posterFile = findAssetFile(files, videoFileName, ['poster', '-poster'], ['.jpg', '.jpeg', '.png']);
    if (posterFile) {
      const assetId = await storeImageAsset(db, path.join(dirPath, posterFile), 'local');
      if (assetId) {
        await db.execute(`UPDATE movies SET poster_id = ? WHERE id = ?`, [assetId, entityId]);
        result.images++;
        logger.debug('Discovered and stored poster', { entityId, file: posterFile });
      }
    }

    // Detect fanart
    const fanartFile = findAssetFile(files, videoFileName, ['fanart', '-fanart', 'backdrop'], ['.jpg', '.jpeg', '.png']);
    if (fanartFile) {
      const assetId = await storeImageAsset(db, path.join(dirPath, fanartFile), 'local');
      if (assetId) {
        await db.execute(`UPDATE movies SET fanart_id = ? WHERE id = ?`, [assetId, entityId]);
        result.images++;
        logger.debug('Discovered and stored fanart', { entityId, file: fanartFile });
      }
    }

    // Detect banner
    const bannerFile = findAssetFile(files, videoFileName, ['banner', '-banner'], ['.jpg', '.jpeg', '.png']);
    if (bannerFile) {
      const assetId = await storeImageAsset(db, path.join(dirPath, bannerFile), 'local');
      if (assetId) {
        await db.execute(`UPDATE movies SET banner_id = ? WHERE id = ?`, [assetId, entityId]);
        result.images++;
        logger.debug('Discovered and stored banner', { entityId, file: bannerFile });
      }
    }

    // Detect logo/clearlogo
    const logoFile = findAssetFile(files, videoFileName, ['logo', '-logo', 'clearlogo'], ['.png']);
    if (logoFile) {
      const assetId = await storeImageAsset(db, path.join(dirPath, logoFile), 'local');
      if (assetId) {
        await db.execute(`UPDATE movies SET logo_id = ? WHERE id = ?`, [assetId, entityId]);
        result.images++;
        logger.debug('Discovered and stored logo', { entityId, file: logoFile });
      }
    }

    // Detect clearart
    const clearartFile = findAssetFile(files, videoFileName, ['clearart', '-clearart'], ['.png']);
    if (clearartFile) {
      const assetId = await storeImageAsset(db, path.join(dirPath, clearartFile), 'local');
      if (assetId) {
        await db.execute(`UPDATE movies SET clearart_id = ? WHERE id = ?`, [assetId, entityId]);
        result.images++;
        logger.debug('Discovered and stored clearart', { entityId, file: clearartFile });
      }
    }

    // Detect discart
    const discartFile = findAssetFile(files, videoFileName, ['disc', '-disc', 'discart'], ['.png']);
    if (discartFile) {
      const assetId = await storeImageAsset(db, path.join(dirPath, discartFile), 'local');
      if (assetId) {
        await db.execute(`UPDATE movies SET discart_id = ? WHERE id = ?`, [assetId, entityId]);
        result.images++;
        logger.debug('Discovered and stored discart', { entityId, file: discartFile });
      }
    }

    // Detect thumb
    const thumbFile = findAssetFile(files, videoFileName, ['thumb', '-thumb', 'landscape'], ['.jpg', '.jpeg', '.png']);
    if (thumbFile) {
      const assetId = await storeImageAsset(db, path.join(dirPath, thumbFile), 'local');
      if (assetId) {
        await db.execute(`UPDATE movies SET thumb_id = ? WHERE id = ?`, [assetId, entityId]);
        result.images++;
        logger.debug('Discovered and stored thumb', { entityId, file: thumbFile});
      }
    }

    logger.info('Asset discovery completed', { entityType, entityId, ...result });
    return result;
  } catch (error: any) {
    logger.error('Failed to discover assets', { error: error.message, entityType, entityId, dirPath });
    throw error;
  }
}

/**
 * Find asset file by matching patterns
 */
function findAssetFile(files: string[], videoFileName: string, patterns: string[], extensions: string[]): string | null {
  const videoBase = path.parse(videoFileName).name;

  for (const file of files) {
    const fileLower = file.toLowerCase();
    const fileExt = path.extname(fileLower);

    // Check if extension matches
    if (!extensions.includes(fileExt)) continue;

    // Check if filename matches patterns
    for (const pattern of patterns) {
      // Match: moviename-poster.jpg, moviename poster.jpg, poster.jpg
      if (
        fileLower === `${videoBase.toLowerCase()}${pattern}${fileExt}` ||
        fileLower === `${videoBase.toLowerCase()} ${pattern}${fileExt}` ||
        fileLower === `${pattern.replace('-', '')}${fileExt}`
      ) {
        return file;
      }
    }
  }

  return null;
}

/**
 * Store image asset in cache_assets table (content-addressed)
 */
async function storeImageAsset(
  db: DatabaseConnection,
  filePath: string,
  sourceType: 'provider' | 'local' | 'user'
): Promise<number | null> {
  try {
    // Read file and calculate SHA256 hash
    const fileBuffer = await fs.readFile(filePath);
    const contentHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const fileSize = fileBuffer.length;

    // Detect mime type
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';

    // Check if asset already exists
    const existing = await db.query<any[]>(
      `SELECT id FROM cache_assets WHERE content_hash = ?`,
      [contentHash]
    );

    if (existing.length > 0) {
      // Asset already cached, just return its ID
      const assetId = (existing[0] as any).id;
      // Update reference count and last accessed
      await db.execute(
        `UPDATE cache_assets SET reference_count = reference_count + 1, last_accessed_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [assetId]
      );
      return assetId;
    }

    // Insert new cache asset
    const result = await db.execute(
      `INSERT INTO cache_assets (
        content_hash, file_path, file_size, mime_type,
        source_type, created_at, last_accessed_at, reference_count
      ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)`,
      [contentHash, filePath, fileSize, mimeType, sourceType]
    );

    logger.debug('Stored new cache asset', { assetId: result.insertId, contentHash, filePath });
    return result.insertId!;
  } catch (error: any) {
    logger.error('Failed to store image asset', { error: error.message, filePath });
    return null;
  }
}
