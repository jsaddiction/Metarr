/**
 * File Classification Service - "Coin Sorter" Scanner
 *
 * Deterministic, two-pass file classification system:
 * PASS 1: Classify all files (read-only)
 * PASS 2: Process files by priority (write operations)
 *
 * Files fall through slots based on strict specifications.
 * Any file that doesn't match a spec is marked as "unknown".
 */

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { logger } from '../../middleware/logging.js';
import { DatabaseConnection } from '../../types/database.js';
import { IgnorePatternService } from '../ignorePatternService.js';
import { MOVIE_ASSET_SPECS, validateImageDimensions } from '../media/assetTypeSpecs.js';

// Video extensions for main video file detection
const VIDEO_EXTENSIONS = [
  '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm',
  '.m4v', '.mpg', '.mpeg', '.m2ts', '.ts', '.vob', '.ogv', '.3gp',
];

// Trailer video extensions (same as main, but smaller files)
const TRAILER_EXTENSIONS = VIDEO_EXTENSIONS;

// Subtitle extensions
const SUBTITLE_EXTENSIONS = ['.srt', '.sub', '.ass', '.ssa', '.vtt', '.idx'];

// NFO extensions
const NFO_EXTENSIONS = ['.nfo', '.txt', '.xml'];

export interface FileInfo {
  path: string;
  name: string;
  ext: string;
  size: number;
  isDirectory: boolean;
}

export interface ClassifiedFile extends FileInfo {
  classification: string;  // 'main_video' | 'nfo' | 'poster' | 'fanart' | ... | 'unknown' | 'ignored'
  reason?: string;         // Why this classification
  metadata?: any;          // Additional info (dimensions, etc.)
}

export interface ClassificationResult {
  mainVideo: ClassifiedFile | null;
  nfo: ClassifiedFile[];
  images: Map<string, ClassifiedFile[]>;  // assetType -> files
  trailers: ClassifiedFile[];
  subtitles: ClassifiedFile[];
  ignored: ClassifiedFile[];
  unknown: ClassifiedFile[];
}

/**
 * PASS 1: Classify all files in directory
 * Read-only, no database writes, deterministic
 */
export async function classifyFilesInDirectory(
  dirPath: string,
  ignorePatternService: IgnorePatternService
): Promise<ClassificationResult> {
  logger.info('Starting file classification', { dirPath });

  const result: ClassificationResult = {
    mainVideo: null,
    nfo: [],
    images: new Map(),
    trailers: [],
    subtitles: [],
    ignored: [],
    unknown: [],
  };

  try {
    // Read all files
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files: FileInfo[] = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;

      const filePath = path.join(dirPath, entry.name);
      const stats = await fs.stat(filePath);

      files.push({
        path: filePath,
        name: entry.name,
        ext: path.extname(entry.name).toLowerCase(),
        size: stats.size,
        isDirectory: false,
      });
    }

    logger.debug('Found files in directory', { count: files.length, dirPath });

    // SLOT 1: Ignore patterns (check first, skip these entirely)
    for (const file of files) {
      const shouldIgnore = await ignorePatternService.matchesAnyPattern(file.name);
      if (shouldIgnore) {
        result.ignored.push({
          ...file,
          classification: 'ignored',
          reason: 'Matches ignore pattern',
        });
      }
    }

    // Remove ignored files from processing
    const filesToProcess = files.filter(f =>
      !result.ignored.some(ignored => ignored.path === f.path)
    );

    // SLOT 2: Main video file (largest video file, skip trailer/sample)
    const videoFiles = filesToProcess.filter(f => VIDEO_EXTENSIONS.includes(f.ext));

    if (videoFiles.length > 0) {
      // Find largest non-sample, non-trailer video file
      const mainVideoCandidates = videoFiles.filter(f => {
        const lower = f.name.toLowerCase();
        return !lower.includes('sample') && !lower.includes('trailer');
      });

      if (mainVideoCandidates.length > 0) {
        const largest = mainVideoCandidates.reduce((a, b) => (a.size > b.size ? a : b));
        result.mainVideo = {
          ...largest,
          classification: 'main_video',
          reason: 'Largest video file in directory',
        };
      } else {
        // All video files are samples/trailers
        logger.warn('No valid main video file found (only samples/trailers)', { dirPath });
      }
    }

    // Remove main video from further processing
    const remainingFiles = result.mainVideo
      ? filesToProcess.filter(f => f.path !== result.mainVideo!.path)
      : filesToProcess;

    // SLOT 3: NFO files (must contain tmdbid or imdbid)
    for (const file of remainingFiles) {
      if (NFO_EXTENSIONS.includes(file.ext)) {
        // Check if contains IDs
        const isValidNFO = await validateNFOFile(file.path);
        if (isValidNFO) {
          result.nfo.push({
            ...file,
            classification: 'nfo',
            reason: 'Contains TMDB/IMDB ID',
          });
        } else {
          // NFO without IDs -> unknown
          logger.debug('NFO file lacks provider IDs', { file: file.name });
        }
      }
    }

    // Remove NFO files from further processing
    const remainingAfterNFO = remainingFiles.filter(f =>
      !result.nfo.some(nfo => nfo.path === f.path)
    );

    // SLOT 4: Image assets (strict validation)
    for (const file of remainingAfterNFO) {
      const imageExt = ['.jpg', '.jpeg', '.png'];
      if (!imageExt.includes(file.ext)) continue;

      // Try to match against each asset spec
      for (const spec of MOVIE_ASSET_SPECS) {
        if (!spec.extensions.includes(file.ext)) continue;

        // Check keyword match
        const hasKeyword = spec.keywords.some(keyword =>
          file.name.toLowerCase().includes(keyword)
        );

        if (!hasKeyword) continue;

        // Extract dimensions
        try {
          const metadata = await sharp(file.path).metadata();
          const width = metadata.width || 0;
          const height = metadata.height || 0;

          // Validate dimensions
          const validation = validateImageDimensions(width, height, spec);

          if (validation.valid) {
            // Valid asset!
            if (!result.images.has(spec.type)) {
              result.images.set(spec.type, []);
            }

            result.images.get(spec.type)!.push({
              ...file,
              classification: spec.type,
              reason: `Valid ${spec.type} (${width}x${height})`,
              metadata: { width, height },
            });

            break; // Stop checking other specs
          } else {
            logger.debug('Image failed validation', {
              file: file.name,
              spec: spec.type,
              reason: validation.reason,
            });
          }
        } catch (error: any) {
          logger.error('Failed to read image dimensions', {
            file: file.name,
            error: error.message,
          });
        }
      }
    }

    // Remove matched images from further processing
    const allMatchedImages = Array.from(result.images.values()).flat();
    const remainingAfterImages = remainingAfterNFO.filter(f =>
      !allMatchedImages.some(img => img.path === f.path)
    );

    // SLOT 5: Trailers (video files with "trailer" keyword, reasonable size)
    for (const file of remainingAfterImages) {
      if (!TRAILER_EXTENSIONS.includes(file.ext)) continue;

      const hasTrailerKeyword = file.name.toLowerCase().includes('trailer');
      const reasonableSize = file.size < 500 * 1024 * 1024; // < 500MB

      if (hasTrailerKeyword && reasonableSize) {
        result.trailers.push({
          ...file,
          classification: 'trailer',
          reason: 'Video with trailer keyword',
        });
      }
    }

    // Remove trailers from further processing
    const remainingAfterTrailers = remainingAfterImages.filter(f =>
      !result.trailers.some(t => t.path === f.path)
    );

    // SLOT 6: Subtitles
    for (const file of remainingAfterTrailers) {
      if (SUBTITLE_EXTENSIONS.includes(file.ext)) {
        result.subtitles.push({
          ...file,
          classification: 'subtitle',
          reason: 'Subtitle file extension',
        });
      }
    }

    // Remove subtitles from further processing
    const remainingAfterSubtitles = remainingAfterTrailers.filter(f =>
      !result.subtitles.some(s => s.path === f.path)
    );

    // SLOT 7: Unknown (everything that didn't match a spec)
    for (const file of remainingAfterSubtitles) {
      result.unknown.push({
        ...file,
        classification: 'unknown',
        reason: 'No matching specification',
      });
    }

    // Log summary
    logger.info('File classification complete', {
      dirPath,
      mainVideo: result.mainVideo ? 1 : 0,
      nfo: result.nfo.length,
      images: Array.from(result.images.entries()).map(([type, files]) => ({
        type,
        count: files.length,
      })),
      trailers: result.trailers.length,
      subtitles: result.subtitles.length,
      ignored: result.ignored.length,
      unknown: result.unknown.length,
    });

    return result;
  } catch (error: any) {
    logger.error('File classification failed', {
      dirPath,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Validate NFO file contains TMDB or IMDB ID
 */
async function validateNFOFile(filePath: string): Promise<boolean> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');

    // Check for TMDB ID patterns
    const hasTmdbId =
      /<tmdbid>(\d+)<\/tmdbid>/i.test(content) ||
      /<id>(\d+)<\/id>/i.test(content) ||
      /themoviedb\.org\/movie\/(\d+)/i.test(content);

    // Check for IMDB ID patterns
    const hasImdbId =
      /<imdbid>(tt\d+)<\/imdbid>/i.test(content) ||
      /<id>(tt\d+)<\/id>/i.test(content) ||
      /imdb\.com\/title\/(tt\d+)/i.test(content);

    return hasTmdbId || hasImdbId;
  } catch (error: any) {
    logger.error('Failed to validate NFO file', {
      filePath,
      error: error.message,
    });
    return false;
  }
}

/**
 * Verify existing cached files still match specifications
 * Used during rescans to detect files that have been modified
 */
export async function verifyCachedFiles(
  db: DatabaseConnection,
  entityType: 'movie',
  entityId: number
): Promise<{
  valid: string[];
  invalid: string[];
  missing: string[];
}> {
  const result = {
    valid: [] as string[],
    invalid: [] as string[],
    missing: [] as string[],
  };

  try {
    // Get all cached image files
    const cachedImages = await db.query<any>(
      `SELECT id, file_path, image_type FROM cache_image_files
       WHERE entity_type = ? AND entity_id = ?`,
      [entityType, entityId]
    );

    for (const cached of cachedImages) {
      // Check if file still exists
      try {
        await fs.access(cached.file_path);

        // Re-validate dimensions
        const spec = MOVIE_ASSET_SPECS.find(s => s.type === cached.image_type);
        if (!spec) {
          result.invalid.push(cached.file_path);
          continue;
        }

        const metadata = await sharp(cached.file_path).metadata();
        const width = metadata.width || 0;
        const height = metadata.height || 0;

        const validation = validateImageDimensions(width, height, spec);

        if (validation.valid) {
          result.valid.push(cached.file_path);
        } else {
          result.invalid.push(cached.file_path);
          logger.warn('Cached file no longer matches spec', {
            file: cached.file_path,
            reason: validation.reason,
          });
        }
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          result.missing.push(cached.file_path);
        } else {
          result.invalid.push(cached.file_path);
        }
      }
    }

    // Get all cached video files (trailers)
    const cachedVideos = await db.query<any>(
      `SELECT id, file_path FROM cache_video_files
       WHERE entity_type = ? AND entity_id = ? AND video_type = 'trailer'`,
      [entityType, entityId]
    );

    for (const cached of cachedVideos) {
      try {
        await fs.access(cached.file_path);
        result.valid.push(cached.file_path);
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          result.missing.push(cached.file_path);
        }
      }
    }

    // Get all cached text files (NFO, subtitles)
    const cachedText = await db.query<any>(
      `SELECT id, file_path, text_type FROM cache_text_files
       WHERE entity_type = ? AND entity_id = ?`,
      [entityType, entityId]
    );

    for (const cached of cachedText) {
      try {
        await fs.access(cached.file_path);

        // Re-validate NFO files
        if (cached.text_type === 'nfo') {
          const isValid = await validateNFOFile(cached.file_path);
          if (isValid) {
            result.valid.push(cached.file_path);
          } else {
            result.invalid.push(cached.file_path);
            logger.warn('NFO file no longer contains provider IDs', {
              file: cached.file_path,
            });
          }
        } else {
          result.valid.push(cached.file_path);
        }
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          result.missing.push(cached.file_path);
        }
      }
    }

    logger.info('Cached file verification complete', {
      entityType,
      entityId,
      valid: result.valid.length,
      invalid: result.invalid.length,
      missing: result.missing.length,
    });

    return result;
  } catch (error: any) {
    logger.error('Failed to verify cached files', {
      entityType,
      entityId,
      error: error.message,
    });
    throw error;
  }
}
