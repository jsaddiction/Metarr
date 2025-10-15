/**
 * Flexible Asset Discovery for Clean Schema
 *
 * Uses keyword-based discovery with validation constraints instead of rigid pattern matching.
 * Discovers local image files and stores them in cache_assets table.
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import { logger } from '../../middleware/logging.js';
import { DatabaseConnection } from '../../types/database.js';
import { findAssetSpecsByFilename, validateImageDimensions, AssetTypeSpec } from './assetTypeSpecs.js';

interface DiscoveredAssets {
  images: number;
  trailers: number;
  subtitles: number;
}

interface AssetCandidate {
  filePath: string;
  fileName: string;
  spec: AssetTypeSpec;
  width?: number;
  height?: number;
}

/**
 * Discover and store local assets for a movie using flexible keyword-based matching
 */
export async function discoverAndStoreAssets(
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

    // Find all potential asset candidates by filename keywords
    const candidates: Map<string, AssetCandidate[]> = new Map();

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const ext = path.extname(file).toLowerCase();

      // Find matching asset specs by keywords in filename
      const matchingSpecs = findAssetSpecsByFilename(file);

      for (const spec of matchingSpecs) {
        // Check if extension is allowed for this asset type
        if (!spec.extensions.includes(ext)) {
          continue;
        }

        // Skip the video file itself
        if (file === videoFileName) {
          continue;
        }

        // Add to candidates for this asset type
        if (!candidates.has(spec.type)) {
          candidates.set(spec.type, []);
        }

        candidates.get(spec.type)!.push({
          filePath,
          fileName: file,
          spec,
        });
      }
    }

    // Process each asset type
    for (const [assetType, assetCandidates] of candidates.entries()) {
      logger.debug('Processing asset candidates', {
        assetType,
        count: assetCandidates.length,
        files: assetCandidates.map(c => c.fileName)
      });

      // Validate dimensions for each candidate
      for (const candidate of assetCandidates) {
        try {
          const metadata = await sharp(candidate.filePath).metadata();
          candidate.width = metadata.width;
          candidate.height = metadata.height;
        } catch (error: any) {
          logger.warn('Failed to read image metadata', {
            file: candidate.fileName,
            error: error.message
          });
          continue;
        }
      }

      // Filter candidates by validation
      const validCandidates = assetCandidates.filter(candidate => {
        if (!candidate.width || !candidate.height) return false;

        const validation = validateImageDimensions(
          candidate.width,
          candidate.height,
          candidate.spec
        );

        if (!validation.valid) {
          logger.debug('Asset candidate failed validation', {
            file: candidate.fileName,
            reason: validation.reason,
            dimensions: `${candidate.width}x${candidate.height}`,
          });
          return false;
        }

        return true;
      });

      if (validCandidates.length === 0) {
        logger.debug('No valid candidates for asset type', { assetType });
        continue;
      }

      // Choose the best candidate (prefer standard Kodi naming, then highest resolution)
      const bestCandidate = chooseBestCandidate(validCandidates, assetType);

      if (bestCandidate) {
        // Store in cache and update movie FK column
        const assetId = await storeImageAsset(
          db,
          bestCandidate.filePath,
          'local'
        );

        if (assetId) {
          await db.execute(
            `UPDATE movies SET ${assetType}_id = ? WHERE id = ?`,
            [assetId, entityId]
          );
          result.images++;
          logger.info('Discovered and stored asset', {
            entityId,
            assetType,
            file: bestCandidate.fileName,
            dimensions: `${bestCandidate.width}x${bestCandidate.height}`,
          });
        }
      }
    }

    logger.info('Asset discovery completed', { entityType, entityId, ...result });
    return result;
  } catch (error: any) {
    logger.error('Failed to discover assets', {
      error: error.message,
      entityType,
      entityId,
      dirPath
    });
    throw error;
  }
}

/**
 * Choose the best candidate from multiple valid options
 * Priority: Standard Kodi naming > Higher resolution > Alphabetically first
 */
function chooseBestCandidate(candidates: AssetCandidate[], assetType: string): AssetCandidate | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // Check for standard Kodi naming (e.g., "poster.jpg", "fanart.jpg")
  const standardName = `${assetType}.jpg`;
  const standardNamePng = `${assetType}.png`;

  const standardCandidate = candidates.find(c =>
    c.fileName.toLowerCase() === standardName ||
    c.fileName.toLowerCase() === standardNamePng
  );

  if (standardCandidate) {
    return standardCandidate;
  }

  // Sort by resolution (descending) then filename (ascending)
  const sorted = [...candidates].sort((a, b) => {
    const aPixels = (a.width || 0) * (a.height || 0);
    const bPixels = (b.width || 0) * (b.height || 0);

    if (aPixels !== bPixels) {
      return bPixels - aPixels; // Higher resolution first
    }

    return a.fileName.localeCompare(b.fileName); // Alphabetical
  });

  return sorted[0];
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

    logger.debug('Stored new cache asset', {
      assetId: result.insertId,
      contentHash,
      filePath
    });
    return result.insertId!;
  } catch (error: any) {
    logger.error('Failed to store image asset', {
      error: error.message,
      filePath
    });
    return null;
  }
}
