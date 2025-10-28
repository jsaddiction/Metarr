/**
 * Intelligent Publishing Service - Hash-based smart library sync
 *
 * Publishes entity metadata and assets to library directory with intelligent change detection:
 * 1. Inventory library directory (calculate hashes)
 * 2. Sync assets using hash comparison (skip unchanged, copy new, rename mis-named)
 * 3. Cleanup unauthorized files (delete directly, no recycle bin)
 * 4. Update library_*_files records (DELETE + INSERT to prevent orphans)
 * 5. Conditional job chaining (only trigger media player update if changes detected)
 *
 * Core principle: "Only copy what's changed, only delete what's unauthorized"
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import type { DatabaseConnection } from '../../types/database.js';
import { logger } from '../../middleware/logging.js';
import { getErrorMessage, getErrorCode } from '../../utils/errorHandling.js';

interface LibraryInventory {
  filesByHash: Map<string, string>;      // hash → filepath
  filesByPath: Map<string, string>;      // filepath → hash
  mainMovieFile: string;                 // Never touch this!
}

interface SelectedAsset {
  cacheId: number;
  cacheFilePath: string;
  cacheFileHash: string;
  assetType: string;                     // 'poster', 'fanart', 'trailer', etc.
  expectedFilename: string;              // Kodi naming
}

interface PublishChanges {
  copied: string[];
  renamed: Array<{ from: string; to: string }>;
  recycled: string[];
  skipped: string[];
  nfoChanged: boolean;
}

interface PublishConfig {
  entityType: 'movie' | 'episode';
  entityId: number;
  libraryPath: string;                   // Directory containing media file
  mediaFilename: string;                 // For Kodi naming (e.g., "Movie Name (2023)")
  mainMovieFile: string;                 // Absolute path to main movie file
}

interface PublishResult {
  success: boolean;
  changes: PublishChanges;
  errors: string[];
}

/**
 * Calculate SHA256 hash of a file
 */
async function calculateSHA256(filePath: string): Promise<string> {
  const fileBuffer = await fs.readFile(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

/**
 * Atomic file copy (copy to temp, then rename)
 */
async function atomicCopy(sourcePath: string, destPath: string): Promise<void> {
  const tempPath = `${destPath}.tmp.${Date.now()}`;

  try {
    await fs.copyFile(sourcePath, tempPath);
    await fs.rename(tempPath, destPath);
  } catch (error) {
    // Clean up temp file on failure
    try {
      await fs.unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Atomic file rename
 */
async function atomicRename(oldPath: string, newPath: string): Promise<void> {
  await fs.rename(oldPath, newPath);
}

/**
 * PHASE 1: Inventory library directory
 */
async function inventoryLibraryDirectory(
  libraryPath: string,
  mainMovieFile: string
): Promise<LibraryInventory> {
  const inventory: LibraryInventory = {
    filesByHash: new Map(),
    filesByPath: new Map(),
    mainMovieFile: path.resolve(mainMovieFile),
  };

  try {
    const files = await fs.readdir(libraryPath, { withFileTypes: true });

    for (const file of files) {
      if (!file.isFile()) continue;

      const filePath = path.join(libraryPath, file.name);
      const absolutePath = path.resolve(filePath);

      // CRITICAL: Skip main movie file
      if (absolutePath === inventory.mainMovieFile) {
        continue;
      }

      // Skip temp files
      if (file.name.endsWith('.tmp')) {
        continue;
      }

      // Calculate hash
      const hash = await calculateSHA256(filePath);
      inventory.filesByHash.set(hash, filePath);
      inventory.filesByPath.set(filePath, hash);
    }

    logger.debug('Library inventory complete', {
      libraryPath,
      filesFound: inventory.filesByHash.size,
    });

    return inventory;
  } catch (error) {
    logger.error('Failed to inventory library directory', {
      libraryPath,
      error: getErrorMessage(error),
    });
    throw error;
  }
}

/**
 * PHASE 2: Sync single asset using hash-based change detection
 */
async function syncAsset(
  asset: SelectedAsset,
  inventory: LibraryInventory,
  libraryPath: string,
  changes: PublishChanges
): Promise<void> {
  const expectedPath = path.join(libraryPath, asset.expectedFilename);

  // Check if this hash already exists in library
  const existingPath = inventory.filesByHash.get(asset.cacheFileHash);

  if (existingPath) {
    // File exists with correct hash
    if (existingPath === expectedPath) {
      // Already published correctly - SKIP
      changes.skipped.push(asset.expectedFilename);
      logger.debug('Asset already correct, skipping', {
        assetType: asset.assetType,
        path: expectedPath,
      });
      return;
    } else {
      // Hash matches but wrong filename - RENAME
      await atomicRename(existingPath, expectedPath);
      changes.renamed.push({ from: existingPath, to: expectedPath });

      // Update inventory
      inventory.filesByHash.set(asset.cacheFileHash, expectedPath);
      inventory.filesByPath.delete(existingPath);
      inventory.filesByPath.set(expectedPath, asset.cacheFileHash);

      logger.info('Renamed asset to correct filename', {
        assetType: asset.assetType,
        from: existingPath,
        to: expectedPath,
      });
      return;
    }
  }

  // File doesn't exist or hash differs - COPY from cache
  await atomicCopy(asset.cacheFilePath, expectedPath);
  changes.copied.push(asset.expectedFilename);

  // Update inventory
  inventory.filesByHash.set(asset.cacheFileHash, expectedPath);
  inventory.filesByPath.set(expectedPath, asset.cacheFileHash);

  logger.info('Copied asset from cache', {
    assetType: asset.assetType,
    cachePath: asset.cacheFilePath,
    libraryPath: expectedPath,
  });
}

/**
 * PHASE 3: Cleanup unauthorized files (direct deletion, no recycle bin)
 */
async function cleanupUnauthorizedFiles(
  db: DatabaseConnection,
  entityType: 'movie' | 'episode',
  entityId: number,
  inventory: LibraryInventory,
  authorizedHashes: Set<string>,
  mainMovieFile: string,
  changes: PublishChanges
): Promise<void> {
  // Get entity to check monitored status
  const entity = await db.query(
    `SELECT monitored FROM ${entityType === 'movie' ? 'movies' : 'episodes'} WHERE id = ?`,
    [entityId]
  );

  // Find unauthorized files
  for (const [filePath, hash] of inventory.filesByPath) {
    // Skip if authorized
    if (authorizedHashes.has(hash)) {
      continue;
    }

    // CRITICAL: Double-check not main movie
    const absolutePath = path.resolve(filePath);
    if (absolutePath === inventory.mainMovieFile) {
      logger.error('CRITICAL: Main movie file in unauthorized list!', {
        filePath: absolutePath,
      });
      continue;
    }

    // Check if file should be protected (locked asset in unmonitored mode)
    let isProtected = false;
    if (entity.length > 0 && !entity[0].monitored) {
      // Check if this file corresponds to a locked cache asset
      const cacheFile = await db.query(
        `SELECT is_locked FROM cache_image_files WHERE file_hash = ? AND entity_id = ?`,
        [hash, entityId]
      );
      isProtected = cacheFile.length > 0 && cacheFile[0].is_locked;
    }

    if (isProtected) {
      logger.info('Skipping deletion (unmonitored and locked)', {
        filePath,
        fileHash: hash,
      });
      continue;
    }

    // Delete unauthorized file directly
    try {
      await fs.unlink(filePath);
      changes.recycled.push(filePath); // Keep property name for backward compatibility
      logger.info('Deleted unauthorized file', {
        filePath,
        reason: entity.length > 0 && entity[0].monitored ? 'monitored' : 'unlocked',
      });
    } catch (error) {
      const errorCode = getErrorCode(error);
      if (errorCode === 'ENOENT') {
        logger.warn('File already deleted', { filePath });
      } else {
        logger.error('Failed to delete unauthorized file', {
          filePath,
          error: getErrorMessage(error),
        });
      }
    }
  }
}

/**
 * PHASE 4: Update library_*_files records (DELETE + INSERT to prevent orphans)
 */
async function updateLibraryRecords(
  db: DatabaseConnection,
  entityType: 'movie' | 'episode',
  entityId: number,
  publishedAssets: Array<{ cacheId: number; libraryPath: string; fileType: string }>
): Promise<void> {
  // Delete ALL existing library records for this entity (prevents orphans)
  await db.execute(
    `DELETE FROM library_image_files
     WHERE cache_file_id IN (
       SELECT id FROM cache_image_files
       WHERE entity_type = ? AND entity_id = ?
     )`,
    [entityType, entityId]
  );

  await db.execute(
    `DELETE FROM library_video_files
     WHERE cache_file_id IN (
       SELECT id FROM cache_video_files
       WHERE entity_type = ? AND entity_id = ?
     )`,
    [entityType, entityId]
  );

  await db.execute(
    `DELETE FROM library_audio_files
     WHERE cache_file_id IN (
       SELECT id FROM cache_audio_files
       WHERE entity_type = ? AND entity_id = ?
     )`,
    [entityType, entityId]
  );

  await db.execute(
    `DELETE FROM library_text_files
     WHERE cache_file_id IN (
       SELECT id FROM cache_text_files
       WHERE entity_type = ? AND entity_id = ?
     )`,
    [entityType, entityId]
  );

  // Insert fresh records for currently published assets
  for (const asset of publishedAssets) {
    const tableName = `library_${asset.fileType}_files`;

    await db.execute(
      `INSERT INTO ${tableName} (cache_file_id, file_path, published_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)`,
      [asset.cacheId, asset.libraryPath]
    );
  }

  logger.info('Updated library records', {
    entityType,
    entityId,
    recordsCreated: publishedAssets.length,
  });
}

/**
 * Get Kodi filename for asset type
 */
function getKodiFilename(basename: string, assetType: string, extension: string): string {
  const kodiSuffix: Record<string, string> = {
    poster: '-poster',
    fanart: '-fanart',
    banner: '-banner',
    clearlogo: '-clearlogo',
    clearart: '-clearart',
    discart: '-disc',
    landscape: '-landscape',
    keyart: '-keyart',
    trailer: '-trailer',
    nfo: '',
  };

  const suffix = kodiSuffix[assetType] || `-${assetType}`;
  return `${basename}${suffix}${extension}`;
}

/**
 * Main publish function
 */
export async function publishMovie(
  db: DatabaseConnection,
  config: PublishConfig
): Promise<PublishResult> {
  const result: PublishResult = {
    success: false,
    changes: {
      copied: [],
      renamed: [],
      recycled: [],
      skipped: [],
      nfoChanged: false,
    },
    errors: [],
  };

  try {
    logger.info('Starting publish', {
      entityType: config.entityType,
      entityId: config.entityId,
      libraryPath: config.libraryPath,
    });

    // PHASE 1: Inventory library directory
    const inventory = await inventoryLibraryDirectory(
      config.libraryPath,
      config.mainMovieFile
    );

    // Get selected assets from cache
    const selectedAssets = await getSelectedAssets(db, config);

    // Track authorized hashes (so we don't delete them)
    const authorizedHashes = new Set<string>();
    const publishedAssets: Array<{ cacheId: number; libraryPath: string; fileType: string }> = [];

    // PHASE 2: Sync each asset
    for (const asset of selectedAssets) {
      await syncAsset(asset, inventory, config.libraryPath, result.changes);
      authorizedHashes.add(asset.cacheFileHash);

      publishedAssets.push({
        cacheId: asset.cacheId,
        libraryPath: path.join(config.libraryPath, asset.expectedFilename),
        fileType: getFileTypeFromAssetType(asset.assetType),
      });
    }

    // PHASE 3: Cleanup unauthorized files
    await cleanupUnauthorizedFiles(
      db,
      config.entityType,
      config.entityId,
      inventory,
      authorizedHashes,
      config.mainMovieFile,
      result.changes
    );

    // PHASE 4: Update library records (DELETE + INSERT)
    await updateLibraryRecords(db, config.entityType, config.entityId, publishedAssets);

    // Update last_published_at
    await db.execute(
      `UPDATE movies SET last_published_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [config.entityId]
    );

    // PHASE 7: Conditional job chaining
    const hasChanges =
      result.changes.copied.length > 0 ||
      result.changes.renamed.length > 0 ||
      result.changes.recycled.length > 0 ||
      result.changes.nfoChanged;

    if (hasChanges) {
      logger.info('Changes detected, will trigger media player update', {
        copied: result.changes.copied.length,
        renamed: result.changes.renamed.length,
        recycled: result.changes.recycled.length,
        nfoChanged: result.changes.nfoChanged,
      });
      // Job queue integration happens in caller
    } else {
      logger.info('No changes detected, skipping media player update');
    }

    result.success = true;

    logger.info('Publish complete', {
      entityType: config.entityType,
      entityId: config.entityId,
      changes: result.changes,
    });

    return result;
  } catch (error) {
    logger.error('Publish failed', {
      entityType: config.entityType,
      entityId: config.entityId,
      error: getErrorMessage(error),
    });
    result.errors.push(getErrorMessage(error));
    return result;
  }
}

/**
 * Get selected assets from cache tables
 */
async function getSelectedAssets(
  db: DatabaseConnection,
  config: PublishConfig
): Promise<SelectedAsset[]> {
  const assets: SelectedAsset[] = [];

  // Get NFO cache reference (still uses FK column)
  const movie = await db.get<{
    nfo_cache_id: number | null;
  }>('SELECT nfo_cache_id FROM movies WHERE id = ?', [config.entityId]);

  if (!movie) {
    return assets;
  }

  // Get all image assets from cache_image_files table
  // NOTE: Legacy FK columns (poster_id, fanart_id, etc.) removed from schema
  // Assets are now managed solely through cache_image_files with entity_type/entity_id/image_type
  const imageAssets = await db.query<{
    id: number;
    file_path: string;
    file_hash: string;
    image_type: string;
  }>(
    `SELECT id, file_path, file_hash, image_type
     FROM cache_image_files
     WHERE entity_type = ? AND entity_id = ?
     ORDER BY image_type, id`,
    [config.entityType, config.entityId]
  );

  // Add all image assets (multiple per type supported)
  for (const imageAsset of imageAssets) {
    const ext = path.extname(imageAsset.file_path);
    const assetType = imageAsset.image_type;

    // For multiple assets of same type, Kodi needs different filenames
    // We'll handle this in getKodiFilename or add index suffix later if needed
    assets.push({
      cacheId: imageAsset.id,
      cacheFilePath: imageAsset.file_path,
      cacheFileHash: imageAsset.file_hash,
      assetType,
      expectedFilename: getKodiFilename(config.mediaFilename, assetType, ext),
    });
  }

  // Add NFO (from cache_text_files)
  if (movie.nfo_cache_id) {
    const nfoFile = await db.get<{ file_path: string; file_hash: string }>(
      'SELECT file_path, file_hash FROM cache_text_files WHERE id = ?',
      [movie.nfo_cache_id]
    );

    if (nfoFile) {
      assets.push({
        cacheId: movie.nfo_cache_id,
        cacheFilePath: nfoFile.file_path,
        cacheFileHash: nfoFile.file_hash,
        assetType: 'nfo',
        expectedFilename: `${config.mediaFilename}.nfo`,
      });
    }
  }

  // TODO: Add trailers, subtitles, audio when movie table has those references

  return assets;
}

/**
 * Map asset type to file type for library tables
 */
function getFileTypeFromAssetType(assetType: string): string {
  if (['poster', 'fanart', 'banner', 'clearlogo', 'clearart', 'discart', 'landscape', 'keyart'].includes(assetType)) {
    return 'image';
  }
  if (assetType === 'trailer') {
    return 'video';
  }
  if (assetType === 'nfo') {
    return 'text';
  }
  return 'text';
}
