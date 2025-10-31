/**
 * Fact Gathering Service - Phase 1 of File Classification
 *
 * Gathers comprehensive metadata about files in a directory BEFORE making
 * classification decisions. Follows the principle: "We need the data anyway,
 * so gather it all upfront."
 *
 * Performance targets:
 * - Typical directory (1 video + 10 assets): <10 seconds
 * - Large directory (5 videos + 50 assets): <60 seconds
 */

import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../middleware/logging.js';
import { extractMediaInfo } from '../media/ffprobeService.js';
import { getErrorMessage } from '../../utils/errorHandling.js';
import { calculateQuickHash } from '../../utils/fileHash.js';
import { DatabaseManager } from '../../database/DatabaseManager.js';
import { imageProcessor } from '../../utils/ImageProcessor.js';
import {
  FileFacts,
  FilesystemFacts,
  FilenameFacts,
  VideoStreamFacts,
  ImageFacts,
  TextFileFacts,
  DiscStructureInfo,
  LegacyDirectoryInfo,
  DirectoryScanFacts,
} from '../../types/fileFacts.js';

/**
 * Supported file extensions by type
 */
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

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff'];

const TEXT_EXTENSIONS = ['.nfo', '.srt', '.ass', '.ssa', '.vtt', '.sub', '.idx', '.txt'];

const AUDIO_EXTENSIONS = ['.mp3', '.flac', '.m4a', '.aac', '.ogg', '.wav', '.wma'];

/**
 * Exclusion keywords for video classification
 * Based on MediaElch patterns
 */
const EXCLUSION_KEYWORDS = [
  'trailer',
  'sample',
  'behindthescenes',
  'deleted',
  'featurette',
  'interview',
  'scene',
  'short',
];

/**
 * Gather filesystem facts for a single file
 */
export async function gatherFilesystemFacts(filePath: string): Promise<FilesystemFacts> {
  try {
    const stats = await fs.stat(filePath);
    const parsedPath = path.parse(filePath);

    return {
      absolutePath: path.resolve(filePath),
      filename: parsedPath.base,
      basename: parsedPath.name,
      extension: parsedPath.ext,
      sizeBytes: stats.size,
      directoryPath: parsedPath.dir,
      directoryName: path.basename(parsedPath.dir),
      modifiedAt: stats.mtime,
      created_at: stats.birthtime,
    };
  } catch (error) {
    logger.error('Failed to gather filesystem facts', {
      filePath,
      error: getErrorMessage(error),
    });
    throw new Error(`Failed to gather filesystem facts: ${getErrorMessage(error)}`);
  }
}

/**
 * Gather filename pattern facts from filename
 * Extracts year, resolution, codec, quality tags, exclusion keywords
 */
export async function gatherFilenameFacts(filename: string): Promise<FilenameFacts> {
  const facts: FilenameFacts = {
    hasYearPattern: false,
    hasResolution: false,
    hasCodec: false,
    hasQualityTags: false,
    hasAudioTags: false,
    hasEdition: false,
    hasExclusionKeywords: false,
  };

  // Year pattern: (2024), [2024], .2024.
  const yearMatch = filename.match(/[(\[.](\d{4})[)\].]/);
  if (yearMatch) {
    facts.hasYearPattern = true;
    facts.extractedYear = parseInt(yearMatch[1], 10);
  }

  // Resolution: 1080p, 720p, 4K, 2160p
  const resolutionMatch = filename.match(
    /\b(2160p|1080p|720p|480p|4K|UHD|HD)\b/i
  );
  if (resolutionMatch) {
    facts.hasResolution = true;
    facts.resolution = resolutionMatch[1].toUpperCase();
  }

  // Codec: x264, x265, HEVC, AVC
  const codecMatch = filename.match(/\b(x264|x265|h\.?264|h\.?265|HEVC|AVC)\b/i);
  if (codecMatch) {
    facts.hasCodec = true;
    facts.codec = codecMatch[1].toUpperCase();
  }

  // Quality tags: BLURAY, REMUX, WEBRip, HDTV, etc.
  const qualityPatterns = /\b(BLURAY|REMUX|WEBRip|WEB-DL|HDTV|DVDRip|BRRip)\b/gi;
  const qualityMatches = filename.match(qualityPatterns);
  if (qualityMatches) {
    facts.hasQualityTags = true;
    facts.qualityTags = qualityMatches.map((tag) => tag.toUpperCase());
  }

  // Audio tags: DTS, ATMOS, DD5.1, TrueHD
  const audioPatterns = /\b(DTS|ATMOS|TrueHD|DD5\.1|DD\+|AAC|AC3)\b/gi;
  const audioMatches = filename.match(audioPatterns);
  if (audioMatches) {
    facts.hasAudioTags = true;
    facts.audioTags = audioMatches.map((tag) => tag.toUpperCase());
  }

  // Edition: Director's Cut, Extended, Theatrical, etc.
  const editionMatch = filename.match(
    /\b(Director'?s? Cut|Extended|Theatrical|Unrated|Remastered)\b/i
  );
  if (editionMatch) {
    facts.hasEdition = true;
    facts.edition = editionMatch[1];
  }

  // Exclusion keywords (critical for video classification)
  const exclusionMatches: string[] = [];
  const lowerFilename = filename.toLowerCase();

  for (const keyword of EXCLUSION_KEYWORDS) {
    // Check for hyphenated patterns: -trailer, -sample, etc.
    if (lowerFilename.includes(`-${keyword}`)) {
      exclusionMatches.push(keyword);
      continue;
    }

    // Check for underscore-separated patterns: _trailer, _sample
    if (lowerFilename.includes(`_${keyword}`)) {
      exclusionMatches.push(keyword);
      continue;
    }

    // Special case: "sample" anywhere in filename
    if (keyword === 'sample' && lowerFilename.includes('sample')) {
      exclusionMatches.push(keyword);
    }
  }

  if (exclusionMatches.length > 0) {
    facts.hasExclusionKeywords = true;
    facts.exclusionKeywords = exclusionMatches;
  }

  return facts;
}

/**
 * Detect disc structure in directory (BDMV or VIDEO_TS)
 * Checks for BluRay or DVD folder structures
 */
export async function detectDiscStructure(
  directoryPath: string
): Promise<DiscStructureInfo> {
  const discInfo: DiscStructureInfo = {
    type: null,
    useShortNameFormat: false,
  };

  try {
    // Check for BluRay structure: BDMV/index.bdmv
    const bdmvPath = path.join(directoryPath, 'BDMV', 'index.bdmv');
    try {
      await fs.access(bdmvPath);
      discInfo.type = 'BDMV';
      discInfo.detectionFilePath = bdmvPath;
      discInfo.rootDirectory = path.join(directoryPath, 'BDMV');
      discInfo.expectedNfoPath = path.join(directoryPath, 'BDMV', 'index.nfo');
      discInfo.useShortNameFormat = true;

      logger.debug('Detected BluRay disc structure', { directoryPath, bdmvPath });
      return discInfo;
    } catch {
      // Not a BluRay structure, continue
    }

    // Check for DVD structure: VIDEO_TS/VIDEO_TS.IFO
    const videoTsPath = path.join(directoryPath, 'VIDEO_TS', 'VIDEO_TS.IFO');
    try {
      await fs.access(videoTsPath);
      discInfo.type = 'VIDEO_TS';
      discInfo.detectionFilePath = videoTsPath;
      discInfo.rootDirectory = path.join(directoryPath, 'VIDEO_TS');
      discInfo.expectedNfoPath = path.join(directoryPath, 'VIDEO_TS', 'VIDEO_TS.nfo');
      discInfo.useShortNameFormat = true;

      logger.debug('Detected DVD disc structure', { directoryPath, videoTsPath });
      return discInfo;
    } catch {
      // Not a DVD structure
    }

    return discInfo;
  } catch (error) {
    logger.error('Error detecting disc structure', {
      directoryPath,
      error: getErrorMessage(error),
    });
    return discInfo;
  }
}

/**
 * Scan legacy Kodi directories (extrafanarts, extrathumbs)
 * These directories will be completely removed at publish time
 */
export async function scanLegacyDirectories(
  directoryPath: string
): Promise<LegacyDirectoryInfo> {
  const legacyInfo: LegacyDirectoryInfo = {
    totalLegacyFiles: 0,
  };

  try {
    // Check for extrafanarts directory
    const extrafanartsPath = path.join(directoryPath, 'extrafanarts');
    try {
      const extrafanartsFiles = await fs.readdir(extrafanartsPath);
      legacyInfo.extrafanartsPath = extrafanartsPath;
      legacyInfo.extrafanartsFiles = extrafanartsFiles.map((file) =>
        path.join(extrafanartsPath, file)
      );
      legacyInfo.totalLegacyFiles += extrafanartsFiles.length;

      logger.debug('Found extrafanarts legacy directory', {
        path: extrafanartsPath,
        fileCount: extrafanartsFiles.length,
      });
    } catch {
      // Directory doesn't exist, that's fine
    }

    // Check for extrathumbs directory
    const extrathumbsPath = path.join(directoryPath, 'extrathumbs');
    try {
      const extrathumbsFiles = await fs.readdir(extrathumbsPath);
      legacyInfo.extrathumbsPath = extrathumbsPath;
      legacyInfo.extrathumbsFiles = extrathumbsFiles.map((file) =>
        path.join(extrathumbsPath, file)
      );
      legacyInfo.totalLegacyFiles += extrathumbsFiles.length;

      logger.debug('Found extrathumbs legacy directory', {
        path: extrathumbsPath,
        fileCount: extrathumbsFiles.length,
      });
    } catch {
      // Directory doesn't exist, that's fine
    }

    return legacyInfo;
  } catch (error) {
    logger.error('Error scanning legacy directories', {
      directoryPath,
      error: getErrorMessage(error),
    });
    return legacyInfo;
  }
}

/**
 * Gather video stream facts using FFprobe with hash-based caching
 *
 * Performance optimization (Audit Finding 2.3):
 * - Calculates quick file hash (first/last 64KB + size)
 * - Queries cache_video_files by hash
 * - If hash matches → returns cached facts (skips FFprobe)
 * - If hash misses → runs FFprobe and returns facts
 *
 * Expected improvement: 50-100x faster rescans
 * - First scan: 1000 movies × 30sec = 8.3 hours
 * - Rescan (cache hit): 1000 movies × 0.05sec = 50 seconds
 *
 * @param filePath - Absolute path to video file
 * @param db - Database manager (optional, caching disabled if not provided)
 * @returns Video stream facts or null on error
 */
export async function gatherVideoFacts(
  filePath: string,
  db?: DatabaseManager
): Promise<VideoStreamFacts | null> {
  try {
    // Hash-based caching optimization
    if (db) {
      try {
        const fileHash = await calculateQuickHash(filePath);

        // Query cache by hash (content-addressed lookup)
        const cached = await db.query<any>(
          'SELECT * FROM cache_video_files WHERE file_hash = ? LIMIT 1',
          [fileHash]
        );

        if (cached && cached.length > 0) {
          const row = cached[0];
          logger.debug('FFprobe cache hit - reusing stored facts', {
            filePath,
            cachedPath: row.file_path,
            hash: fileHash,
          });

          // Convert cached database row to VideoStreamFacts
          return convertCachedRowToVideoFacts(row);
        }

        logger.debug('FFprobe cache miss - running analysis', {
          filePath,
          hash: fileHash,
        });
      } catch (cacheError) {
        // Cache lookup failed, fall through to FFprobe
        logger.warn('FFprobe cache lookup failed, falling back to direct analysis', {
          filePath,
          error: getErrorMessage(cacheError),
        });
      }
    }

    // Cache miss or disabled - run FFprobe
    const mediaInfo = await extractMediaInfo(filePath);

    const videoStreamsData = mediaInfo.videoStreams.map((stream) => {
      const videoStream: any = {
        codec: stream.codecName || 'unknown',
        width: stream.width || 0,
        height: stream.height || 0,
        fps: stream.fps || 0,
      };
      if (stream.bitRate !== undefined) videoStream.bitrate = stream.bitRate;
      if (stream.profile) videoStream.profile = stream.profile;
      if (stream.colorSpace) videoStream.colorSpace = stream.colorSpace;
      const hdr = detectHdrFormat(stream);
      if (hdr) videoStream.hdrFormat = hdr;
      return videoStream;
    });

    const audioStreamsData = mediaInfo.audioStreams.map((stream) => {
      const audioStream: any = {
        codec: stream.codecName || 'unknown',
        channels: stream.channels || 0,
        sampleRate: stream.sampleRate || 0,
      };
      if (stream.bitRate !== undefined) audioStream.bitrate = stream.bitRate;
      if (stream.language) audioStream.language = stream.language;
      if (stream.title) audioStream.title = stream.title;
      return audioStream;
    });

    const subtitleStreamsData = mediaInfo.subtitleStreams.map((stream) => {
      const subtitleStream: any = {
        codec: stream.codecName || 'unknown',
        forced: stream.isForced || false,
        default: stream.isDefault || false,
      };
      if (stream.language) subtitleStream.language = stream.language;
      if (stream.title) subtitleStream.title = stream.title;
      return subtitleStream;
    });

    const videoFacts: any = {
      hasVideoStream: mediaInfo.videoStreams.length > 0,
      hasAudioStream: mediaInfo.audioStreams.length > 0,
      durationSeconds: mediaInfo.duration || 0,
      videoStreams: videoStreamsData,
      audioStreams: audioStreamsData,
      subtitleStreams: subtitleStreamsData,
    };

    return videoFacts;
  } catch (error) {
    logger.error('Failed to gather video facts', {
      filePath,
      error: getErrorMessage(error),
    });
    return null; // Return null on failure, don't block entire scan
  }
}

/**
 * Convert cached database row to VideoStreamFacts structure
 *
 * Note: cache_video_files stores the primary stream data, not all streams.
 * This returns basic facts indicating the file has been processed before.
 * The full stream data is stored in video_streams/audio_streams/subtitle_streams tables
 * and will be queried separately if needed.
 */
function convertCachedRowToVideoFacts(row: any): VideoStreamFacts {
  // Build minimal facts from cache row
  // The presence of codec indicates video stream exists
  const hasVideoStream = !!row.codec;
  const hasAudioStream = !!row.audio_codec;

  return {
    hasVideoStream,
    hasAudioStream,
    durationSeconds: row.duration_seconds || 0,
    videoStreams: hasVideoStream
      ? [
          {
            codec: row.codec || 'unknown',
            width: row.width || 0,
            height: row.height || 0,
            fps: row.framerate || 0,
            ...(row.bitrate && { bitrate: row.bitrate }),
            ...(row.hdr_type && { hdrFormat: row.hdr_type }),
          },
        ]
      : [],
    audioStreams: hasAudioStream
      ? [
          {
            codec: row.audio_codec || 'unknown',
            channels: row.audio_channels || 0,
            sampleRate: 0, // Not stored in cache_video_files
            ...(row.audio_language && { language: row.audio_language }),
          },
        ]
      : [],
    subtitleStreams: [], // Subtitles are in separate cache_text_files table
  };
}

/**
 * Detect HDR format from video stream metadata
 */
function detectHdrFormat(stream: any): string | undefined {
  if (!stream.colorTransfer) return undefined;

  const transfer = stream.colorTransfer.toLowerCase();
  if (transfer.includes('smpte2084') || transfer.includes('pq')) {
    return 'HDR10';
  }
  if (transfer.includes('arib-std-b67') || transfer.includes('hlg')) {
    return 'HLG';
  }
  if (transfer.includes('bt2020')) {
    return 'HDR';
  }

  return undefined;
}

/**
 * Gather image facts using ImageProcessor
 * Extracts metadata without computing hashes (for performance during scan)
 */
export async function gatherImageFacts(filePath: string): Promise<ImageFacts | null> {
  try {
    // Use ImageProcessor for centralized image handling
    // Note: This will compute hashes which we may not need during initial scan
    // but ensures consistency across the codebase
    const analysis = await imageProcessor.analyzeImage(filePath);

    const imageFacts: ImageFacts = {
      width: analysis.width,
      height: analysis.height,
      aspectRatio: analysis.aspectRatio,
      format: analysis.format,
      hasAlpha: analysis.hasAlpha,
    };

    return imageFacts;
  } catch (error) {
    logger.error('Failed to gather image facts', {
      filePath,
      error: getErrorMessage(error),
    });
    return null; // Return null on failure, don't block entire scan
  }
}

/**
 * Gather text file facts (NFO, subtitles, etc.)
 * Reads first 10KB and analyzes content
 * For NFO files: Try XML parsing first, then fall back to regex extraction
 */
export async function gatherTextFacts(filePath: string): Promise<TextFileFacts | null> {
  try {
    // Read first 10KB of file
    const fileHandle = await fs.open(filePath, 'r');
    const buffer = Buffer.alloc(10240); // 10KB
    await fileHandle.read(buffer, 0, 10240, 0);
    await fileHandle.close();

    const contentSample = buffer.toString('utf-8');

    const textFacts: TextFileFacts = {
      contentSample,
      containsTmdbId: false,
      containsImdbId: false,
      looksLikeNfo: false,
      looksLikeSubtitle: false,
    };

    // Check if looks like XML NFO
    const isXml = contentSample.includes('<?xml') ||
                  contentSample.includes('<movie>') ||
                  contentSample.includes('<tvshow>');

    if (isXml) {
      textFacts.looksLikeNfo = true;

      // Try to parse as XML to extract IDs (modern Kodi format)
      try {
        // Extract TMDB ID from <uniqueid type="tmdb">603</uniqueid>
        const tmdbUniqueIdMatch = contentSample.match(/<uniqueid[^>]*type="tmdb"[^>]*>(\d+)<\/uniqueid>/i);
        if (tmdbUniqueIdMatch) {
          textFacts.containsTmdbId = true;
          textFacts.tmdbId = parseInt(tmdbUniqueIdMatch[1], 10);
        }

        // Extract IMDB ID from <uniqueid type="imdb">tt0133093</uniqueid>
        const imdbUniqueIdMatch = contentSample.match(/<uniqueid[^>]*type="imdb"[^>]*>(tt\d+)<\/uniqueid>/i);
        if (imdbUniqueIdMatch) {
          textFacts.containsImdbId = true;
          textFacts.imdbId = imdbUniqueIdMatch[1];
        }

        // Fallback: Try old-style XML tags
        if (!textFacts.containsTmdbId) {
          const tmdbTagMatch = contentSample.match(/<tmdb>(\d+)<\/tmdb>/i);
          if (tmdbTagMatch) {
            textFacts.containsTmdbId = true;
            textFacts.tmdbId = parseInt(tmdbTagMatch[1], 10);
          }
        }

        if (!textFacts.containsImdbId) {
          const imdbTagMatch = contentSample.match(/<imdb>(tt\d+)<\/imdb>/i);
          if (imdbTagMatch) {
            textFacts.containsImdbId = true;
            textFacts.imdbId = imdbTagMatch[1];
          }
        }
      } catch (xmlError: unknown) {
        logger.debug('XML parsing failed, using regex fallback', {
          filePath,
          error: (xmlError as { message?: string }).message,
        });
      }
    }

    // Fallback: URL extraction for Radarr/Sonarr-style NFO files
    // These contain just URLs like: https://www.themoviedb.org/movie/535292
    if (!textFacts.containsTmdbId) {
      const tmdbUrlMatch = contentSample.match(/themoviedb\.org\/movie\/(\d+)/i);
      if (tmdbUrlMatch) {
        textFacts.containsTmdbId = true;
        textFacts.tmdbId = parseInt(tmdbUrlMatch[1], 10);
        textFacts.looksLikeNfo = true;
      }
    }

    if (!textFacts.containsImdbId) {
      const imdbUrlMatch = contentSample.match(/imdb\.com\/title\/(tt\d+)/i);
      if (imdbUrlMatch) {
        textFacts.containsImdbId = true;
        textFacts.imdbId = imdbUrlMatch[1];
        textFacts.looksLikeNfo = true;
      }
    }

    // Fallback: Regex extraction for malformed/non-XML NFOs
    if (!textFacts.containsTmdbId) {
      // Try various formats: tmdb:603, tmdb/603, tmdb=603
      const tmdbRegexMatch = contentSample.match(/tmdb[\/:\s=]+(\d+)/i);
      if (tmdbRegexMatch) {
        textFacts.containsTmdbId = true;
        textFacts.tmdbId = parseInt(tmdbRegexMatch[1], 10);
        textFacts.looksLikeNfo = true;
      }
    }

    if (!textFacts.containsImdbId) {
      // IMDB IDs always start with 'tt' followed by 7+ digits
      const imdbRegexMatch = contentSample.match(/\b(tt\d{7,})\b/i);
      if (imdbRegexMatch) {
        textFacts.containsImdbId = true;
        textFacts.imdbId = imdbRegexMatch[1];
        textFacts.looksLikeNfo = true;
      }
    }

    // Check if looks like subtitle (timestamp patterns)
    // SRT: 00:00:00,000 --> 00:00:00,000
    // ASS: Dialogue: 0,0:00:00.00,0:00:00.00
    if (
      contentSample.includes('-->') ||
      contentSample.includes('Dialogue:') ||
      /\d{2}:\d{2}:\d{2}/.test(contentSample)
    ) {
      textFacts.looksLikeSubtitle = true;

      // Try to detect language from filename
      const baseFilename = path.basename(filePath);
      const langMatch = baseFilename.match(/\.(en|eng|fr|de|es|it|pt|ja|zh)\.srt$/i);
      if (langMatch) {
        textFacts.detectedLanguage = langMatch[1].toLowerCase();
      }
    }

    return textFacts;
  } catch (error) {
    logger.error('Failed to gather text facts', {
      filePath,
      error: getErrorMessage(error),
    });
    return null; // Return null on failure, don't block entire scan
  }
}

/**
 * Gather directory context facts (relative comparisons)
 * Computed AFTER all individual file facts are gathered
 */
export async function gatherDirectoryContextFacts(
  allFiles: FileFacts[]
): Promise<void> {
  // Count files by type
  const videoFiles = allFiles.filter((f) => f.video);
  const imageFiles = allFiles.filter((f) => f.image);
  const textFiles = allFiles.filter((f) => f.text);

  // Sort by size (largest first)
  const sortedBySize = [...allFiles].sort(
    (a, b) => b.filesystem.sizeBytes - a.filesystem.sizeBytes
  );

  // Sort videos by duration (longest first)
  const sortedByDuration = [...videoFiles].sort((a, b) => {
    const aDuration = a.video?.durationSeconds || 0;
    const bDuration = b.video?.durationSeconds || 0;
    return bDuration - aDuration;
  });

  const largestSize = sortedBySize[0]?.filesystem.sizeBytes || 1;
  const longestDuration = sortedByDuration[0]?.video?.durationSeconds || 1;

  // Add context facts to each file
  for (const file of allFiles) {
    const sizeRank = sortedBySize.findIndex((f) => f === file) + 1;
    const isLargestFile = sizeRank === 1;
    const percentOfLargest = (file.filesystem.sizeBytes / largestSize) * 100;

    const contextFacts: any = {
      totalVideoFiles: videoFiles.length,
      totalImageFiles: imageFiles.length,
      totalTextFiles: textFiles.length,
      sizeRank,
      isLargestFile,
      percentOfLargest,
      isLongestVideo: false,
    };

    if (file.video) {
      const durationRank = sortedByDuration.findIndex((f) => f === file) + 1;
      contextFacts.durationRank = durationRank;
      contextFacts.isLongestVideo = durationRank === 1;
      contextFacts.percentOfLongest = ((file.video.durationSeconds || 0) / longestDuration) * 100;
    }

    file.context = contextFacts;
  }
}

/**
 * Main orchestrator: Gather all facts for a directory
 * Returns complete directory scan with all file facts
 *
 * @param directoryPath - Absolute path to directory to scan
 * @param db - Database manager (optional, enables FFprobe caching)
 */
export async function gatherAllFacts(
  directoryPath: string,
  db?: DatabaseManager
): Promise<DirectoryScanFacts> {
  const scanStartedAt = new Date();
  logger.info('Starting fact gathering for directory', { directoryPath });

  try {
    // Step 1: Detect disc structure
    const discStructure = await detectDiscStructure(directoryPath);

    // Step 2: Scan legacy directories
    const legacyDirectories = await scanLegacyDirectories(directoryPath);

    // Step 3: Get all files in directory (recursively for legacy dirs)
    const allFilePaths: string[] = [];

    // Main directory files
    const mainDirEntries = await fs.readdir(directoryPath, { withFileTypes: true });
    for (const entry of mainDirEntries) {
      if (entry.isFile()) {
        allFilePaths.push(path.join(directoryPath, entry.name));
      }
    }

    // Legacy directory files
    if (legacyDirectories.extrafanartsFiles) {
      allFilePaths.push(...legacyDirectories.extrafanartsFiles);
    }
    if (legacyDirectories.extrathumbsFiles) {
      allFilePaths.push(...legacyDirectories.extrathumbsFiles);
    }

    // Step 4: Gather facts for each file
    const allFileFacts: FileFacts[] = [];

    for (const filePath of allFilePaths) {
      const filesystem = await gatherFilesystemFacts(filePath);
      const filename = await gatherFilenameFacts(filesystem.filename);

      const fileFacts: FileFacts = {
        filesystem,
        filename,
      };

      // Gather type-specific facts based on extension
      const ext = filesystem.extension.toLowerCase();

      if (VIDEO_EXTENSIONS.includes(ext)) {
        const videoFacts = await gatherVideoFacts(filePath, db);
        if (videoFacts) {
          fileFacts.video = videoFacts;
        }
      } else if (IMAGE_EXTENSIONS.includes(ext)) {
        const imageFacts = await gatherImageFacts(filePath);
        if (imageFacts) {
          fileFacts.image = imageFacts;
        }
      } else if (TEXT_EXTENSIONS.includes(ext)) {
        const textFacts = await gatherTextFacts(filePath);
        if (textFacts) {
          fileFacts.text = textFacts;
        }
      } else if (AUDIO_EXTENSIONS.includes(ext)) {
        // Audio files (theme.mp3, etc.) - no special facts needed
        // Filename matching is sufficient for classification
      }

      allFileFacts.push(fileFacts);
    }

    // Step 5: Compute directory context facts (relative comparisons)
    await gatherDirectoryContextFacts(allFileFacts);

    const scanCompletedAt = new Date();
    const processingTimeMs = scanCompletedAt.getTime() - scanStartedAt.getTime();

    logger.info('Completed fact gathering for directory', {
      directoryPath,
      totalFiles: allFileFacts.length,
      processingTimeMs,
      discStructure: discStructure.type,
      legacyFiles: legacyDirectories.totalLegacyFiles,
    });

    return {
      directoryPath,
      discStructure,
      legacyDirectories,
      files: allFileFacts,
      scanStartedAt,
      scanCompletedAt,
      processingTimeMs,
    };
  } catch (error) {
    logger.error('Failed to gather facts for directory', {
      directoryPath,
      error: getErrorMessage(error),
    });
    throw new Error(`Failed to gather facts: ${getErrorMessage(error)}`);
  }
}
