import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../middleware/logging.js';
import { DatabaseConnection } from '../../types/database.js';
import { hashSmallFile, hashFile } from '../hash/hashService.js';
import { IgnorePatternService } from '../ignorePatternService.js';

/**
 * Unknown Files Detection Service
 *
 * Identifies files in media directories that are not recognized as:
 * - Video files (movie/episode)
 * - NFO files
 * - Images (posters, fanart, etc.)
 * - Trailers
 * - Subtitles
 * - Known system files (.DS_Store, Thumbs.db, etc.)
 *
 * Helps users identify:
 * - Sample files left by downloaders
 * - Unwanted extras
 * - Metadata files from other tools
 * - Forgotten downloads
 */

// Known video extensions
const VIDEO_EXTENSIONS = [
  '.mp4',
  '.mkv',
  '.avi',
  '.mov',
  '.wmv',
  '.flv',
  '.webm',
  '.m4v',
  '.mpg',
  '.mpeg',
  '.m2ts',
  '.ts',
  '.vob',
  '.ogv',
  '.3gp',
];

// Known image extensions
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif'];

// Known subtitle extensions (unused but kept for potential future use)
// const SUBTITLE_EXTENSIONS = [
//   '.srt', '.sub', '.ass', '.ssa', '.vtt', '.idx',
// ];

// Known metadata/info file extensions (unused but kept for potential future use)
// const METADATA_EXTENSIONS = [
//   '.nfo', '.xml', '.txt', '.nzb', '.torrent',
// ];

export interface UnknownFile {
  filePath: string;
  fileName: string;
  fileSize: number;
  extension: string;
  category: 'video' | 'image' | 'archive' | 'text' | 'other';
}

export interface UnknownFilesResult {
  unknownFiles: UnknownFile[];
  totalSize: number;
}

/**
 * Detect unknown files in a media directory
 */
export async function detectUnknownFiles(
  dirPath: string,
  knownFiles: Set<string>,
  ignorePatternService: IgnorePatternService
): Promise<UnknownFilesResult> {
  try {
    const files = await fs.readdir(dirPath, { withFileTypes: true });
    const unknownFiles: UnknownFile[] = [];
    let totalSize = 0;

    for (const file of files) {
      if (!file.isFile()) continue;

      const filePath = path.join(dirPath, file.name);
      const fileName = file.name;
      const ext = path.extname(fileName).toLowerCase();

      // Skip if this is a known file
      if (knownFiles.has(filePath)) {
        continue;
      }

      // Check if file matches any ignore pattern
      const shouldIgnore = await ignorePatternService.matchesAnyPattern(fileName);
      if (shouldIgnore) {
        logger.debug('Skipping file matching ignore pattern', { fileName });
        continue;
      }

      // Get file stats
      const stats = await fs.stat(filePath);

      // Categorize the file
      const category = categorizeFile(ext, fileName);

      const unknownFile: UnknownFile = {
        filePath,
        fileName,
        fileSize: stats.size,
        extension: ext,
        category,
      };

      unknownFiles.push(unknownFile);
      totalSize += stats.size;
    }

    logger.debug('Detected unknown files in directory', {
      dirPath,
      count: unknownFiles.length,
      totalSize,
    });

    return { unknownFiles, totalSize };
  } catch (error: any) {
    logger.error('Failed to detect unknown files', {
      dirPath,
      error: error.message,
    });
    throw new Error(`Unknown file detection failed: ${error.message}`);
  }
}

/**
 * Categorize unknown file by type
 */
function categorizeFile(
  ext: string,
  _fileName: string
): 'video' | 'image' | 'archive' | 'text' | 'other' {
  // Video files
  if (VIDEO_EXTENSIONS.includes(ext)) {
    return 'video';
  }

  // Image files
  if (IMAGE_EXTENSIONS.includes(ext)) {
    return 'image';
  }

  // Archive files
  if (['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2'].includes(ext)) {
    return 'archive';
  }

  // Text/metadata files
  if (['.txt', '.md', '.nfo', '.xml', '.json'].includes(ext)) {
    return 'text';
  }

  return 'other';
}

/**
 * Build set of known files from database records
 */
export async function buildKnownFilesSet(
  db: DatabaseConnection,
  entityType: 'movie' | 'episode',
  entityId: number,
  mediaFilePath: string
): Promise<Set<string>> {
  const knownFiles = new Set<string>();

  try {
    // Add the media file itself
    knownFiles.add(mediaFilePath);

    // Add NFO files (both standard and media-file-named variants)
    const mediaDir = path.dirname(mediaFilePath);
    const mediaBaseName = path.parse(mediaFilePath).name;

    // Standard NFO naming (e.g., movie.nfo for movies, tvshow.nfo for series)
    if (entityType === 'movie') {
      const standardNfoPath = path.join(mediaDir, 'movie.nfo');
      knownFiles.add(standardNfoPath);
    }

    // Media file-named NFO (e.g., "Movie Name.nfo" matching "Movie Name.mkv")
    const mediaFileNfoPath = path.join(mediaDir, `${mediaBaseName}.nfo`);
    knownFiles.add(mediaFileNfoPath);

    // For episodes, standard naming is also supported
    if (entityType === 'episode') {
      const standardNfoPath = path.join(mediaDir, 'tvshow.nfo');
      knownFiles.add(standardNfoPath);
    }

    // Add images from database (stored in images table)
    const images = await db.query(
      `SELECT library_path FROM images WHERE entity_type = ? AND entity_id = ? AND library_path IS NOT NULL`,
      [entityType, entityId]
    );

    for (const image of images) {
      if (image.library_path) {
        knownFiles.add(image.library_path);
      }
    }

    // Add trailers from database
    if (entityType === 'movie') {
      const trailers = await db.query(
        `SELECT local_path FROM trailers WHERE entity_type = ? AND entity_id = ? AND source_type = 'local'`,
        [entityType, entityId]
      );

      for (const trailer of trailers) {
        if (trailer.local_path) {
          knownFiles.add(trailer.local_path);
        }
      }
    }

    // Add external subtitles from database
    const subtitles = await db.query(
      `SELECT file_path FROM subtitle_streams WHERE entity_type = ? AND entity_id = ? AND source_type = 'external'`,
      [entityType, entityId]
    );

    for (const subtitle of subtitles) {
      if (subtitle.file_path) {
        knownFiles.add(subtitle.file_path);
      }
    }

    logger.debug('Built known files set', {
      entityType,
      entityId,
      count: knownFiles.size,
    });

    return knownFiles;
  } catch (error: any) {
    logger.error('Failed to build known files set', {
      entityType,
      entityId,
      error: error.message,
    });
    throw new Error(`Failed to build known files set: ${error.message}`);
  }
}

/**
 * Store unknown files in database
 */
export async function storeUnknownFiles(
  db: DatabaseConnection,
  entityType: 'movie' | 'episode',
  entityId: number,
  unknownFiles: UnknownFile[]
): Promise<void> {
  try {
    // Delete existing unknown files for this entity
    await db.execute(`DELETE FROM unknown_files WHERE entity_type = ? AND entity_id = ?`, [
      entityType,
      entityId,
    ]);

    // Insert new unknown files
    for (const file of unknownFiles) {
      // Hash the file for duplicate detection
      let fileHash: string | undefined;
      try {
        if (file.fileSize < 10 * 1024 * 1024) {
          // Small file - use full hash
          const hashResult = await hashSmallFile(file.filePath);
          fileHash = hashResult.hash;
        } else {
          // Large file - use size-based hash
          const hashResult = await hashFile(file.filePath);
          fileHash = hashResult.hash;
        }
      } catch (error: any) {
        logger.warn('Failed to hash unknown file', {
          filePath: file.filePath,
          error: error.message,
        });
      }

      await db.execute(
        `INSERT INTO unknown_files (
          entity_type, entity_id, file_path, file_name, file_size, file_hash,
          extension, category
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entityType,
          entityId,
          file.filePath,
          file.fileName,
          file.fileSize,
          fileHash,
          file.extension,
          file.category,
        ]
      );
    }

    logger.debug('Stored unknown files in database', {
      entityType,
      entityId,
      count: unknownFiles.length,
    });
  } catch (error: any) {
    logger.error('Failed to store unknown files', {
      entityType,
      entityId,
      error: error.message,
    });
    throw new Error(`Failed to store unknown files: ${error.message}`);
  }
}

/**
 * Detect and store unknown files for a media directory
 */
export async function detectAndStoreUnknownFiles(
  db: DatabaseConnection,
  entityType: 'movie' | 'episode',
  entityId: number,
  dirPath: string,
  mediaFilePath: string,
  ignorePatternService: IgnorePatternService
): Promise<UnknownFilesResult> {
  try {
    // Build set of known files
    const knownFiles = await buildKnownFilesSet(db, entityType, entityId, mediaFilePath);

    // Detect unknown files
    const result = await detectUnknownFiles(dirPath, knownFiles, ignorePatternService);

    // Store in database
    await storeUnknownFiles(db, entityType, entityId, result.unknownFiles);

    logger.info('Detected and stored unknown files', {
      entityType,
      entityId,
      dirPath,
      count: result.unknownFiles.length,
      totalSize: result.totalSize,
    });

    return result;
  } catch (error: any) {
    logger.error('Failed to detect and store unknown files', {
      entityType,
      entityId,
      dirPath,
      error: error.message,
    });
    throw new Error(`Failed to detect and store unknown files: ${error.message}`);
  }
}
