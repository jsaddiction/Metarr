/**
 * Asset Discovery for Unified File System
 *
 * Discovers local assets (images, videos, subtitles, audio) and stores them in unified file tables.
 * Implements library → cache workflow with deduplication.
 */

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { logger } from '../../middleware/logging.js';
import { DatabaseConnection } from '../../types/database.js';
import { findAssetSpecsByFilename, validateImageDimensions, AssetTypeSpec } from './assetTypeSpecs.js';
import {
  insertImageFile,
  insertVideoFile,
  insertTextFile,
  cacheImageFile,
  calculateFileHash
} from '../files/unifiedFileService.js';
import {
  insertAudioFile,
  cacheVideoFile,
  cacheTextFile,
  cacheAudioFile
} from '../files/videoTextAudioCacheFunctions.js';

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
        try {
          // === UNIFIED FILE SYSTEM WORKFLOW ===

          // Step 1: Calculate file hash
          const fileHash = await calculateFileHash(bestCandidate.filePath);
          const stats = await fs.stat(bestCandidate.filePath);

          // Step 2: Insert library record
          const libraryFileId = await insertImageFile(db, {
            entityType,
            entityId,
            filePath: bestCandidate.filePath,
            fileName: bestCandidate.fileName,
            fileSize: stats.size,
            fileHash,
            location: 'library',
            imageType: assetType as any,
            width: bestCandidate.width!,
            height: bestCandidate.height!,
            format: path.extname(bestCandidate.fileName).slice(1).toLowerCase(),
            sourceType: 'local',
            classificationScore: calculateScore(bestCandidate, assetType)
          });

          // Step 3: Cache the image (with deduplication)
          const cacheFileId = await cacheImageFile(
            db,
            libraryFileId,
            bestCandidate.filePath,
            entityType,
            entityId,
            assetType,
            'local'
          );

          // Step 4: Update movie FK column
          const columnName = `${assetType}_id`;
          await db.execute(
            `UPDATE movies SET ${columnName} = ? WHERE id = ?`,
            [cacheFileId, entityId]
          );

          result.images++;
          logger.info('Discovered and stored asset', {
            entityId,
            assetType,
            file: bestCandidate.fileName,
            dimensions: `${bestCandidate.width}x${bestCandidate.height}`,
            libraryFileId,
            cacheFileId
          });
        } catch (error: any) {
          logger.error('Failed to store asset', {
            assetType,
            file: bestCandidate.fileName,
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
        try {
          const filePath = path.join(dirPath, file);
          const stats = await fs.stat(filePath);
          const fileHash = await calculateFileHash(filePath);

          // Insert library record
          const libraryFileId = await insertVideoFile(db, {
            entityType,
            entityId,
            filePath,
            fileName: file,
            fileSize: stats.size,
            fileHash,
            location: 'library',
            videoType: 'trailer',
            sourceType: 'local'
          });

          // Cache the video
          await cacheVideoFile(db, libraryFileId, filePath, entityType, entityId, 'trailer', 'local');

          result.trailers++;
          logger.info('Discovered trailer', { entityId, file });
        } catch (error: any) {
          logger.error('Failed to store trailer', { file, error: error.message });
        }
      }
    }

    // === SUBTITLE FILE DETECTION ===
    const subtitleExtensions = ['.srt', '.sub', '.ass', '.ssa', '.vtt', '.idx'];

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();

      if (subtitleExtensions.includes(ext)) {
        try {
          const filePath = path.join(dirPath, file);
          const stats = await fs.stat(filePath);
          const fileHash = await calculateFileHash(filePath);

          // Try to extract language from filename (e.g., "movie.en.srt" or "movie.eng.srt")
          const languageMatch = file.match(/\.([a-z]{2,3})\.[^.]+$/i);
          const language = languageMatch ? languageMatch[1].toLowerCase() : undefined;

          // Insert library record
          const libraryFileId = await insertTextFile(db, {
            entityType,
            entityId,
            filePath,
            fileName: file,
            fileSize: stats.size,
            fileHash,
            location: 'library',
            textType: 'subtitle',
            subtitleLanguage: language,
            subtitleFormat: ext.slice(1), // Remove the dot
            sourceType: 'local'
          });

          // Cache the subtitle
          await cacheTextFile(db, libraryFileId, filePath, entityType, entityId, 'subtitle', 'local');

          result.subtitles++;
          logger.info('Discovered subtitle', { entityId, file, language });
        } catch (error: any) {
          logger.error('Failed to store subtitle', { file, error: error.message });
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
        try {
          const filePath = path.join(dirPath, file);
          const stats = await fs.stat(filePath);
          const fileHash = await calculateFileHash(filePath);

          // Insert library record
          const libraryFileId = await insertAudioFile(db, {
            entityType,
            entityId,
            filePath,
            fileName: file,
            fileSize: stats.size,
            fileHash,
            location: 'library',
            audioType: 'theme',
            sourceType: 'local'
          });

          // Cache the audio
          await cacheAudioFile(db, libraryFileId, filePath, entityType, entityId, 'theme', 'local');

          result.subtitles++; // Note: We don't have a theme counter, using subtitles for now
          logger.info('Discovered theme song', { entityId, file });
        } catch (error: any) {
          logger.error('Failed to store theme song', { file, error: error.message });
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
 * Calculate classification score for an asset
 * Based on Kodi naming conventions and image quality
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
