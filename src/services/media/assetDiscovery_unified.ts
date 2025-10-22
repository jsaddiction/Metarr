/**
 * Asset Discovery for Unified File System
 *
 * Discovers local assets (images, videos, subtitles, audio) during library scanning.
 * Discovered files are stored ONLY in cache_*_files tables (source of truth).
 * Library tables (library_*_files) are reserved for published files written by Metarr during publishing phase.
 */

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { logger } from '../../middleware/logging.js';
import { DatabaseConnection } from '../../types/database.js';
import { findAssetSpecsByFilename, validateImageDimensions, AssetTypeSpec } from './assetTypeSpecs.js';
import {
  cacheImageFile
} from '../files/unifiedFileService.js';
import {
  cacheVideoFile,
  cacheTextFile,
  cacheAudioFile
} from '../files/videoTextAudioCacheFunctions.js';

export interface DiscoveredAssets {
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
 * UNIFIED FILE SYSTEM VERSION
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
    subtitles: 0
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
            assetType,
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

      // Store ALL valid candidates (not just the best one)
      logger.info('Storing all valid candidates for asset type', {
        assetType,
        count: validCandidates.length,
        entityId
      });

      for (const candidate of validCandidates) {
        try {
          // === CACHE-ONLY WORKFLOW FOR DISCOVERY ===
          // Discovery phase: Files found in library → Store in cache as source of truth
          // Library tables are ONLY for published files (written by Metarr during publishing)

          // Cache the discovered image (no library file ID during discovery)
          const cacheFileId = await cacheImageFile(
            db,
            null, // No library file ID for discovered files
            candidate.filePath,
            entityType,
            entityId,
            assetType,
            'local'
          );

          // NOTE: FK column updates (movies.poster_id, etc.) happen during selection phase, not discovery
          // All discovered assets are candidates until selection algorithm chooses the best

          result.images++;
          logger.info('Discovered and cached asset', {
            entityId,
            assetType,
            file: candidate.fileName,
            dimensions: `${candidate.width}x${candidate.height}`,
            score: calculateScore(candidate, assetType),
            cacheFileId
          });
        } catch (error: any) {
          logger.error('Failed to cache discovered asset', {
            assetType,
            file: candidate.fileName,
            error: error.message
          });
        }
      }
    }

    // === VIDEO FILE DETECTION (Trailers) ===
    const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v'];
    const trailerKeywords = ['trailer', 'preview'];

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      const lowerName = file.toLowerCase();

      // Skip the main video file
      if (file === videoFileName) continue;

      // Check if it's a video file with trailer keyword
      if (videoExtensions.includes(ext) && trailerKeywords.some(k => lowerName.includes(k))) {
        const filePath = path.join(dirPath, file);

        try {
          // Cache the discovered trailer (no library file ID for discovered files)
          const cacheFileId = await cacheVideoFile(db, null, filePath, entityType, entityId, 'trailer', 'local');

          result.trailers++;
          logger.info('Discovered and cached trailer', { entityId, file, cacheFileId });
        } catch (error: any) {
          logger.error('Failed to cache discovered trailer', { file, error: error.message });
        }
      }
    }

    // === SUBTITLE FILE DETECTION ===
    const subtitleExtensions = ['.srt', '.sub', '.ass', '.ssa', '.vtt', '.idx'];

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();

      if (subtitleExtensions.includes(ext)) {
        const filePath = path.join(dirPath, file);

        try {
          // Cache the discovered subtitle (no library file ID for discovered files)
          const cacheFileId = await cacheTextFile(db, null, filePath, entityType, entityId, 'subtitle', 'local');

          result.subtitles++;
          logger.info('Discovered and cached subtitle', { entityId, file, cacheFileId });
        } catch (error: any) {
          logger.error('Failed to cache discovered subtitle', { file, error: error.message });
        }
      }
    }

    // === AUDIO FILE DETECTION (Theme songs) ===
    const audioExtensions = ['.mp3', '.flac', '.ogg', '.m4a', '.aac'];
    const themeKeywords = ['theme'];

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      const lowerName = file.toLowerCase();

      if (audioExtensions.includes(ext) && themeKeywords.some(k => lowerName.includes(k))) {
        const filePath = path.join(dirPath, file);

        try {
          // Cache the discovered theme song (no library file ID for discovered files)
          const cacheFileId = await cacheAudioFile(db, null, filePath, entityType, entityId, 'theme', 'local');

          result.subtitles++; // Note: We don't have a theme counter, using subtitles for now
          logger.info('Discovered and cached theme song', { entityId, file, cacheFileId });
        } catch (error: any) {
          logger.error('Failed to cache discovered theme song', { file, error: error.message });
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
 * Calculate classification score for an asset
 * Based on Kodi naming conventions and image quality
 *
 * This score is used later during the selection phase to choose the best assets.
 * During discovery, we store ALL valid candidates with their scores.
 */
function calculateScore(candidate: AssetCandidate, assetType: string): number {
  let score = 0;

  // Kodi naming (50 points)
  const lowerName = candidate.fileName.toLowerCase();
  if (lowerName === `${assetType}.jpg` || lowerName === `${assetType}.png`) {
    score += 50;
  } else if (lowerName.includes(assetType)) {
    score += 30;
  }

  // Resolution (25 points max)
  const pixels = (candidate.width || 0) * (candidate.height || 0);
  if (pixels > 4000000) score += 25; // > 4MP
  else if (pixels > 2000000) score += 20; // > 2MP
  else if (pixels > 1000000) score += 15; // > 1MP
  else score += 10;

  // Format (10 points)
  const ext = path.extname(candidate.fileName).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') score += 10;
  else if (ext === '.png') score += 8;

  return score;
}
