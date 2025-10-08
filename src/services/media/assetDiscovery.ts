import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import { logger } from '../../middleware/logging.js';
import { DatabaseConnection } from '../../types/database.js';
import { hashSmallFile, hashFile } from '../hash/hashService.js';

/**
 * Asset Discovery Service
 *
 * Discovers and catalogs media assets in directories:
 * - Images: poster, fanart, banner, thumb, clearart, clearlogo, landscape, etc.
 * - Trailers: Local trailer files
 * - External Subtitles: .srt, .sub, .ass files
 *
 * Implements three-tier image storage:
 * - provider_url: URL from metadata provider
 * - cache_path: Downloaded to cache directory
 * - library_path: Local image files in media directory
 */

// Image file extensions
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff'];

// Video file extensions (for trailers)
const VIDEO_EXTENSIONS = [
  '.mp4',
  '.mkv',
  '.avi',
  '.mov',
  '.webm',
  '.m4v',
  '.mpg',
  '.mpeg',
  '.wmv',
  '.flv',
];

// Subtitle file extensions
const SUBTITLE_EXTENSIONS = ['.srt', '.sub', '.ass', '.ssa', '.vtt', '.idx'];

// Kodi image naming conventions
const IMAGE_TYPES = {
  poster: ['poster', 'folder', 'cover'],
  fanart: ['fanart', 'backdrop', 'background'],
  banner: ['banner'],
  thumb: ['thumb', 'landscape'],
  clearart: ['clearart'],
  clearlogo: ['clearlogo', 'logo'],
  discart: ['discart', 'disc'],
  characterart: ['characterart'],
  keyart: ['keyart'],
};

export interface DiscoveredImage {
  type: string;
  filePath: string;
  fileSize?: number;
  fileHash?: string;
  width?: number;
  height?: number;
}

export interface DiscoveredTrailer {
  filePath: string;
  fileSize?: number;
  fileHash?: string;
  quality?: string;
}

export interface DiscoveredSubtitle {
  filePath: string;
  language?: string;
  isForced?: boolean;
  isSdh?: boolean;
}

export interface DiscoveredAssets {
  images: DiscoveredImage[];
  trailers: DiscoveredTrailer[];
  subtitles: DiscoveredSubtitle[];
}

/**
 * Discover all assets in a media directory
 */
export async function discoverAssets(
  dirPath: string,
  mediaFileName?: string
): Promise<DiscoveredAssets> {
  try {
    const files = await fs.readdir(dirPath, { withFileTypes: true });

    const images: DiscoveredImage[] = [];
    const trailers: DiscoveredTrailer[] = [];
    const subtitles: DiscoveredSubtitle[] = [];

    for (const file of files) {
      if (!file.isFile()) continue;

      const filePath = path.join(dirPath, file.name);
      const ext = path.extname(file.name).toLowerCase();
      const baseName = path.basename(file.name, ext);

      // Image files
      if (IMAGE_EXTENSIONS.includes(ext)) {
        const imageType = detectImageType(baseName, mediaFileName);
        if (imageType) {
          const stats = await fs.stat(filePath);
          images.push({
            type: imageType,
            filePath,
            fileSize: stats.size,
          });
        }
      }

      // Trailer files
      if (VIDEO_EXTENSIONS.includes(ext)) {
        if (isTrailerFile(baseName, mediaFileName)) {
          const stats = await fs.stat(filePath);
          const quality = detectTrailerQuality(baseName);
          trailers.push({
            filePath,
            fileSize: stats.size,
            ...(quality && { quality }),
          });
        }
      }

      // External subtitle files
      if (SUBTITLE_EXTENSIONS.includes(ext)) {
        if (isSubtitleFile(baseName, mediaFileName)) {
          const subtitleInfo = parseSubtitleFileName(baseName);
          subtitles.push({
            filePath,
            ...(subtitleInfo.language && { language: subtitleInfo.language }),
            isForced: subtitleInfo.isForced,
            isSdh: subtitleInfo.isSdh,
          });
        }
      }
    }

    logger.debug('Discovered assets in directory', {
      dirPath,
      images: images.length,
      trailers: trailers.length,
      subtitles: subtitles.length,
    });

    return { images, trailers, subtitles };
  } catch (error: any) {
    logger.error('Failed to discover assets', {
      dirPath,
      error: error.message,
    });
    throw new Error(`Asset discovery failed: ${error.message}`);
  }
}

/**
 * Detect image type from file name
 */
function detectImageType(baseName: string, mediaFileName?: string): string | null {
  const lowerBaseName = baseName.toLowerCase();

  // Check for exact media file name match (e.g., "Movie Name-poster.jpg")
  if (mediaFileName) {
    const mediaBase = path.parse(mediaFileName).name.toLowerCase();
    for (const [type, patterns] of Object.entries(IMAGE_TYPES)) {
      for (const pattern of patterns) {
        if (lowerBaseName === `${mediaBase}-${pattern}`) {
          return type;
        }
      }
    }
  }

  // Check for standard naming patterns (including numbered variants)
  for (const [type, patterns] of Object.entries(IMAGE_TYPES)) {
    for (const pattern of patterns) {
      // Exact match (e.g., "poster", "fanart")
      if (lowerBaseName === pattern) {
        return type;
      }

      // Hyphenated match (e.g., "moviename-poster")
      if (lowerBaseName.endsWith(`-${pattern}`)) {
        return type;
      }

      // Numbered variant (e.g., "poster1", "fanart2", "fanart19")
      // Match pattern followed by 1-2 digits (poster1-poster19, fanart1-fanart19)
      const numberedMatch = lowerBaseName.match(new RegExp(`^${pattern}(\\d{1,2})$`));
      if (numberedMatch) {
        return type;
      }

      // Hyphenated numbered variant (e.g., "moviename-poster1", "moviename-fanart2")
      const hyphenatedNumberedMatch = lowerBaseName.match(new RegExp(`-${pattern}(\\d{1,2})$`));
      if (hyphenatedNumberedMatch) {
        return type;
      }
    }
  }

  return null;
}

/**
 * Check if file is a trailer
 */
function isTrailerFile(baseName: string, mediaFileName?: string): boolean {
  const lowerBaseName = baseName.toLowerCase();

  // Common trailer naming patterns
  if (lowerBaseName.includes('trailer')) {
    return true;
  }

  // Media file name + "-trailer" suffix
  if (mediaFileName) {
    const mediaBase = path.parse(mediaFileName).name.toLowerCase();
    if (lowerBaseName === `${mediaBase}-trailer`) {
      return true;
    }
  }

  return false;
}

/**
 * Detect trailer quality from filename
 */
function detectTrailerQuality(baseName: string): string | undefined {
  const lowerBaseName = baseName.toLowerCase();

  if (lowerBaseName.includes('2160p') || lowerBaseName.includes('4k')) {
    return '2160p';
  }
  if (lowerBaseName.includes('1080p')) {
    return '1080p';
  }
  if (lowerBaseName.includes('720p')) {
    return '720p';
  }
  if (lowerBaseName.includes('480p')) {
    return '480p';
  }

  return undefined;
}

/**
 * Check if file is an external subtitle
 */
function isSubtitleFile(baseName: string, mediaFileName?: string): boolean {
  if (!mediaFileName) {
    // Without media file name, accept any subtitle file
    return true;
  }

  // Check if subtitle file matches media file name
  const mediaBase = path.parse(mediaFileName).name.toLowerCase();
  const lowerBaseName = baseName.toLowerCase();

  return lowerBaseName.startsWith(mediaBase);
}

/**
 * Parse subtitle file name for language and flags
 * Examples:
 * - movie.en.srt → English
 * - movie.en.forced.srt → English, forced
 * - movie.en.sdh.srt → English, SDH
 * - movie.eng.srt → English
 */
function parseSubtitleFileName(baseName: string): {
  language?: string;
  isForced: boolean;
  isSdh: boolean;
} {
  const lowerBaseName = baseName.toLowerCase();
  const parts = lowerBaseName.split('.');

  let language: string | undefined;
  let isForced = false;
  let isSdh = false;

  // Common language code mapping
  const languageMap: Record<string, string> = {
    en: 'eng',
    eng: 'eng',
    english: 'eng',
    es: 'spa',
    spa: 'spa',
    spanish: 'spa',
    fr: 'fra',
    fra: 'fra',
    french: 'fra',
    de: 'deu',
    deu: 'deu',
    ger: 'deu',
    german: 'deu',
    it: 'ita',
    ita: 'ita',
    italian: 'ita',
    pt: 'por',
    por: 'por',
    portuguese: 'por',
    ja: 'jpn',
    jpn: 'jpn',
    japanese: 'jpn',
    zh: 'chi',
    chi: 'chi',
    chinese: 'chi',
    ko: 'kor',
    kor: 'kor',
    korean: 'kor',
    ru: 'rus',
    rus: 'rus',
    russian: 'rus',
  };

  // Check each part for language codes and flags
  for (const part of parts) {
    // Language code
    if (languageMap[part]) {
      language = languageMap[part];
    }

    // Flags
    if (part === 'forced') {
      isForced = true;
    }
    if (part === 'sdh' || part === 'cc') {
      isSdh = true;
    }
  }

  return { ...(language && { language }), isForced, isSdh };
}

/**
 * Store discovered images in database (TWO-COPY ARCHITECTURE)
 * Copy files from library to cache (keep both copies)
 * - Library copy: For media player scans (Kodi/Jellyfin/Plex)
 * - Cache copy: Source of truth for rebuilding library if deleted
 */
export async function storeDiscoveredImages(
  db: DatabaseConnection,
  entityType: 'movie' | 'series' | 'episode',
  entityId: number,
  images: DiscoveredImage[]
): Promise<void> {
  try {
    // Delete existing images for this entity (we'll replace with new discoveries)
    await db.execute(
      `DELETE FROM images WHERE entity_type = ? AND entity_id = ?`,
      [entityType, entityId]
    );

    // Create cache directory for this entity
    const cacheDir = path.join(process.cwd(), 'data', 'cache', 'images', entityId.toString());
    await fs.mkdir(cacheDir, { recursive: true });

    // Process each discovered image
    for (const image of images) {
      // Hash the image file for duplicate detection
      let fileHash: string | undefined;
      try {
        const hashResult = await hashSmallFile(image.filePath);
        fileHash = hashResult.hash;
      } catch (error: any) {
        logger.warn('Failed to hash image file', {
          filePath: image.filePath,
          error: error.message,
        });
      }

      // Get image dimensions if available
      let width: number | undefined = image.width;
      let height: number | undefined = image.height;

      if (!width || !height) {
        try {
          const metadata = await sharp(image.filePath).metadata();
          width = metadata.width;
          height = metadata.height;
        } catch (error: any) {
          logger.warn('Failed to get image dimensions', {
            filePath: image.filePath,
            error: error.message,
          });
        }
      }

      // Generate unique cache filename
      const ext = path.extname(image.filePath);
      const hash = crypto.randomBytes(8).toString('hex');
      const cacheFileName = `${image.type}_${hash}${ext}`;
      const cachePath = path.join(cacheDir, cacheFileName);

      // Get file size
      const stats = await fs.stat(image.filePath);

      // TWO-COPY: Copy to cache (keep library copy for media player scans)
      await fs.copyFile(image.filePath, cachePath);
      logger.debug('Copied image to cache (two-copy architecture)', {
        library: image.filePath,
        cache: cachePath,
      });

      // Store in database with BOTH cache_path and library_path
      await db.execute(
        `INSERT INTO images (
          entity_type, entity_id, type, cache_path, library_path, file_size, file_hash, width, height
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [entityType, entityId, image.type, cachePath, image.filePath, stats.size, fileHash, width, height]
      );
    }

    logger.debug('Stored discovered images (two-copy architecture)', {
      entityType,
      entityId,
      count: images.length,
    });
  } catch (error: any) {
    logger.error('Failed to store discovered images', {
      entityType,
      entityId,
      error: error.message,
    });
    throw new Error(`Failed to store images: ${error.message}`);
  }
}

/**
 * Store discovered trailers in database (TWO-COPY ARCHITECTURE)
 * Copy trailer files from library to cache (keep both copies)
 * - Library copy: For media player scans (Kodi/Jellyfin/Plex)
 * - Cache copy: Source of truth for rebuilding library if deleted
 */
export async function storeDiscoveredTrailers(
  db: DatabaseConnection,
  entityType: 'movie' | 'series',
  entityId: number,
  trailers: DiscoveredTrailer[]
): Promise<void> {
  try {
    // Delete existing trailers
    await db.execute(
      `DELETE FROM trailers WHERE entity_type = ? AND entity_id = ? AND source_type = 'local'`,
      [entityType, entityId]
    );

    // Create cache directory for trailers
    const cacheDir = path.join(process.cwd(), 'data', 'cache', 'trailers', entityId.toString());
    await fs.mkdir(cacheDir, { recursive: true });

    // Process each trailer
    for (const trailer of trailers) {
      // Hash the trailer file (auto-detects strategy based on size)
      let fileHash: string | undefined;
      try {
        const hashResult = await hashFile(trailer.filePath);
        fileHash = hashResult.hash;
      } catch (error: any) {
        logger.warn('Failed to hash trailer file', {
          filePath: trailer.filePath,
          error: error.message,
        });
      }

      // Get file size
      const stats = await fs.stat(trailer.filePath);

      // Generate unique cache filename
      const ext = path.extname(trailer.filePath);
      const hash = crypto.randomBytes(8).toString('hex');
      const cacheFileName = `trailer_${hash}${ext}`;
      const cachePath = path.join(cacheDir, cacheFileName);

      // TWO-COPY: Copy to cache (keep library copy for media player scans)
      await fs.copyFile(trailer.filePath, cachePath);
      logger.debug('Copied trailer to cache (two-copy architecture)', {
        library: trailer.filePath,
        cache: cachePath,
      });

      // Store with BOTH cache_path and local_path
      await db.execute(
        `INSERT INTO trailers (
          entity_type, entity_id, source_type, cache_path, local_path, file_size, file_hash, resolution
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entityType,
          entityId,
          'local',
          cachePath,
          trailer.filePath,
          stats.size,
          fileHash,
          trailer.quality,
        ]
      );
    }

    logger.debug('Stored discovered trailers (two-copy architecture)', {
      entityType,
      entityId,
      count: trailers.length,
    });
  } catch (error: any) {
    logger.error('Failed to store discovered trailers', {
      entityType,
      entityId,
      error: error.message,
    });
    throw new Error(`Failed to store trailers: ${error.message}`);
  }
}

/**
 * Store discovered external subtitles in database (TWO-COPY ARCHITECTURE)
 * Copy subtitle files from library to cache (keep both copies)
 * - Library copy: For media player scans (Kodi/Jellyfin/Plex)
 * - Cache copy: Source of truth for rebuilding library if deleted
 */
export async function storeDiscoveredSubtitles(
  db: DatabaseConnection,
  entityType: 'movie' | 'episode',
  entityId: number,
  subtitles: DiscoveredSubtitle[]
): Promise<void> {
  try {
    // Delete existing subtitles
    await db.execute(
      `DELETE FROM subtitle_streams WHERE entity_type = ? AND entity_id = ? AND source_type = 'external'`,
      [entityType, entityId]
    );

    // Create cache directory for subtitles
    const cacheDir = path.join(process.cwd(), 'data', 'cache', 'subtitles', entityId.toString());
    await fs.mkdir(cacheDir, { recursive: true });

    // Process each subtitle
    for (const subtitle of subtitles) {
      // Generate unique cache filename
      const ext = path.extname(subtitle.filePath);
      const hash = crypto.randomBytes(8).toString('hex');
      const cacheFileName = `subtitle_${subtitle.language || 'unknown'}_${hash}${ext}`;
      const cachePath = path.join(cacheDir, cacheFileName);

      // TWO-COPY: Copy to cache (keep library copy for media player scans)
      await fs.copyFile(subtitle.filePath, cachePath);
      logger.debug('Copied subtitle to cache (two-copy architecture)', {
        library: subtitle.filePath,
        cache: cachePath,
      });

      // Store with BOTH cache_path and file_path
      await db.execute(
        `INSERT INTO subtitle_streams (
          entity_type, entity_id, source_type, cache_path, file_path, language, is_forced, is_sdh
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entityType,
          entityId,
          'external',
          cachePath,
          subtitle.filePath,
          subtitle.language,
          subtitle.isForced ? 1 : 0,
          subtitle.isSdh ? 1 : 0,
        ]
      );
    }

    logger.debug('Stored discovered subtitles (two-copy architecture)', {
      entityType,
      entityId,
      count: subtitles.length,
    });
  } catch (error: any) {
    logger.error('Failed to store discovered subtitles', {
      entityType,
      entityId,
      error: error.message,
    });
    throw new Error(`Failed to store subtitles: ${error.message}`);
  }
}

/**
 * Discover and store all assets for a media directory
 */
export async function discoverAndStoreAssets(
  db: DatabaseConnection,
  entityType: 'movie' | 'episode',
  entityId: number,
  dirPath: string,
  mediaFileName?: string
): Promise<DiscoveredAssets> {
  try {
    const assets = await discoverAssets(dirPath, mediaFileName);

    // Store in database
    await storeDiscoveredImages(db, entityType, entityId, assets.images);
    await storeDiscoveredSubtitles(db, entityType, entityId, assets.subtitles);

    // Trailers only for movies (not episodes)
    if (entityType === 'movie') {
      await storeDiscoveredTrailers(db, 'movie', entityId, assets.trailers);
    }

    logger.info('Discovered and stored assets', {
      entityType,
      entityId,
      dirPath,
      images: assets.images.length,
      trailers: assets.trailers.length,
      subtitles: assets.subtitles.length,
    });

    return assets;
  } catch (error: any) {
    logger.error('Failed to discover and store assets', {
      entityType,
      entityId,
      dirPath,
      error: error.message,
    });
    throw new Error(`Failed to discover and store assets: ${error.message}`);
  }
}
