import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../middleware/logging.js';
import { DatabaseConnection } from '../../types/database.js';
import { IgnorePatternService } from '../ignorePatternService.js';
import { getErrorMessage } from '../../utils/errorHandling.js';

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
  } catch (error) {
    logger.error('Failed to detect unknown files', {
      dirPath,
      error: getErrorMessage(error),
    });
    throw new Error(`Unknown file detection failed: ${getErrorMessage(error)}`);
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

    // Add standard Kodi asset filenames (these are valid even if not stored in DB)
    // Asset discovery may have chosen the media-file-named variant, but both are valid
    if (entityType === 'movie') {
      const standardAssets = [
        'poster.jpg',
        'fanart.jpg',
        'banner.jpg',
        'clearlogo.png',
        'clearart.png',
        'disc.png',
        'discart.png',
        'landscape.jpg',
        'thumb.jpg',
      ];
      for (const assetName of standardAssets) {
        knownFiles.add(path.join(mediaDir, assetName));
      }

      // Also add media-file-named variants (e.g., "Movie Name (tt1234)-poster.jpg")
      // These are Kodi-valid and commonly created by tools, but get cached with UUID names
      const mediaFileAssetBases = ['poster', 'fanart', 'banner', 'clearlogo', 'clearart', 'disc', 'discart', 'landscape', 'thumb', 'keyart'];
      const imageExtensions = ['.jpg', '.jpeg', '.png'];
      for (const baseName of mediaFileAssetBases) {
        for (const ext of imageExtensions) {
          const assetPath = path.join(mediaDir, `${mediaBaseName}-${baseName}${ext}`);
          knownFiles.add(assetPath);
          // Also add numbered variants (e.g., "Movie-fanart1.jpg", "Movie-fanart2.jpg")
          for (let i = 1; i <= 20; i++) {
            knownFiles.add(path.join(mediaDir, `${mediaBaseName}-${baseName}${i}${ext}`));
          }
        }
      }

      // Add media-file-named trailer (e.g., "Movie Name (tt1234)-trailer.mp4")
      const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v'];
      for (const ext of videoExtensions) {
        knownFiles.add(path.join(mediaDir, `${mediaBaseName}-trailer${ext}`));
      }
    }

    // Add images from cache file system (both cache and library)
    if (entityType === 'movie') {
      const [cacheImages, libraryImages] = await Promise.all([
        db.query<any[]>(
          `SELECT file_path FROM cache_image_files WHERE entity_type = ? AND entity_id = ? AND file_path IS NOT NULL`,
          [entityType, entityId]
        ),
        db.query<any[]>(
          `SELECT l.file_path FROM library_image_files l
           JOIN cache_image_files c ON l.cache_file_id = c.id
           WHERE c.entity_type = ? AND c.entity_id = ? AND l.file_path IS NOT NULL`,
          [entityType, entityId]
        )
      ]);

      for (const image of [...cacheImages, ...libraryImages]) {
        if ((image as any).file_path) {
          knownFiles.add((image as any).file_path);
        }
      }
    }

    // Add trailers from cache file system (both cache and library)
    if (entityType === 'movie') {
      const [cacheTrailers, libraryTrailers] = await Promise.all([
        db.query<any[]>(
          `SELECT file_path FROM cache_video_files WHERE entity_type = ? AND entity_id = ? AND video_type = 'trailer' AND file_path IS NOT NULL`,
          [entityType, entityId]
        ),
        db.query<any[]>(
          `SELECT l.file_path FROM library_video_files l
           JOIN cache_video_files c ON l.cache_file_id = c.id
           WHERE c.entity_type = ? AND c.entity_id = ? AND c.video_type = 'trailer' AND l.file_path IS NOT NULL`,
          [entityType, entityId]
        )
      ]);

      for (const trailer of [...cacheTrailers, ...libraryTrailers]) {
        if ((trailer as any).file_path) {
          knownFiles.add((trailer as any).file_path);
        }
      }
    }

    // Add external subtitles from cache file system (both cache and library)
    const [cacheSubtitles, librarySubtitles] = await Promise.all([
      db.query<any[]>(
        `SELECT file_path FROM cache_text_files WHERE entity_type = ? AND entity_id = ? AND text_type = 'subtitle' AND file_path IS NOT NULL`,
        [entityType, entityId]
      ),
      db.query<any[]>(
        `SELECT l.file_path FROM library_text_files l
         JOIN cache_text_files c ON l.cache_file_id = c.id
         WHERE c.entity_type = ? AND c.entity_id = ? AND c.text_type = 'subtitle' AND l.file_path IS NOT NULL`,
        [entityType, entityId]
      )
    ]);

    for (const subtitle of [...cacheSubtitles, ...librarySubtitles]) {
      if ((subtitle as any).file_path) {
        knownFiles.add((subtitle as any).file_path);
      }
    }

    // Add audio files from cache file system (both cache and library)
    if (entityType === 'movie') {
      const [cacheAudio, libraryAudio] = await Promise.all([
        db.query<any[]>(
          `SELECT file_path FROM cache_audio_files WHERE entity_type = ? AND entity_id = ? AND file_path IS NOT NULL`,
          [entityType, entityId]
        ),
        db.query<any[]>(
          `SELECT l.file_path FROM library_audio_files l
           JOIN cache_audio_files c ON l.cache_file_id = c.id
           WHERE c.entity_type = ? AND c.entity_id = ? AND l.file_path IS NOT NULL`,
          [entityType, entityId]
        )
      ]);

      for (const audioFile of [...cacheAudio, ...libraryAudio]) {
        if ((audioFile as any).file_path) {
          knownFiles.add((audioFile as any).file_path);
        }
      }
    }

    logger.info('Built known files set', {
      entityType,
      entityId,
      count: knownFiles.size,
      files: Array.from(knownFiles),
    });

    return knownFiles;
  } catch (error) {
    logger.error('Failed to build known files set', {
      entityType,
      entityId,
      error: getErrorMessage(error),
    });
    throw new Error(`Failed to build known files set: ${getErrorMessage(error)}`);
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

    // Insert new unknown files (no hashing for now - simplified)
    for (const file of unknownFiles) {
      await db.execute(
        `INSERT INTO unknown_files (
          entity_type, entity_id, file_path, file_name, file_size,
          extension, category
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          entityType,
          entityId,
          file.filePath,
          file.fileName,
          file.fileSize,
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
  } catch (error) {
    logger.error('Failed to store unknown files', {
      entityType,
      entityId,
      error: getErrorMessage(error),
    });
    throw new Error(`Failed to store unknown files: ${getErrorMessage(error)}`);
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
  } catch (error) {
    logger.error('Failed to detect and store unknown files', {
      entityType,
      entityId,
      dirPath,
      error: getErrorMessage(error),
    });
    throw new Error(`Failed to detect and store unknown files: ${getErrorMessage(error)}`);
  }
}
