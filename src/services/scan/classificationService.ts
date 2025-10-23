/**
 * Classification Service - Phase 2 of File Classification
 *
 * Makes classification decisions based on gathered facts.
 * Follows the principle: "Binary Decision Model - Either ≥80% confidence or ask user"
 *
 * Priority order: Disc detection → Text files → Video files → Image files
 */

import { logger } from '../../middleware/logging.js';
import { DirectoryScanFacts, FileFacts } from '../../types/fileFacts.js';
import {
  ClassificationResult,
  ClassificationStatus,
  ClassifiedFile,
  VideoClassification,
  ImageClassification,
  TextClassification,
  AudioClassification,
  LegacyDirectoryClassification,
  ExclusionKeywordMatch,
  ExpectedFilenamePatterns,
  ConfidenceScore,
} from '../../types/classification.js';

/**
 * Asset type specifications for dimension validation
 * Based on Kodi/MediaElch standards
 */
const ASSET_SPECS = {
  poster: {
    aspectRatio: { min: 0.65, max: 0.72 }, // ~2:3 ratio
    minWidth: 500,
    minHeight: 700,
  },
  fanart: {
    aspectRatio: { min: 1.7, max: 1.85 }, // ~16:9 ratio
    minWidth: 1280,
    minHeight: 720,
  },
  banner: {
    aspectRatio: { min: 4.5, max: 6.0 }, // Wide banner
    minWidth: 758,
    minHeight: 140,
  },
  clearlogo: {
    aspectRatio: { min: 1.5, max: 4.0 }, // Very flexible
    minWidth: 400,
    minHeight: 100,
  },
  clearart: {
    aspectRatio: { min: 1.5, max: 3.0 }, // Flexible
    minWidth: 500,
    minHeight: 200,
  },
  disc: {
    aspectRatio: { min: 0.95, max: 1.05 }, // ~1:1 square
    minWidth: 500,
    minHeight: 500,
  },
  landscape: {
    aspectRatio: { min: 1.7, max: 1.85 }, // ~16:9 ratio
    minWidth: 1280,
    minHeight: 720,
  },
  thumb: {
    aspectRatio: { min: 1.3, max: 1.5 }, // ~4:3 ratio
    minWidth: 400,
    minHeight: 300,
  },
  keyart: {
    aspectRatio: { min: 0.65, max: 0.72 }, // ~2:3 ratio (same as poster)
    minWidth: 500,
    minHeight: 700,
  },
};

/**
 * Check if filename has exclusion keywords
 * Returns detailed match information
 */
export function checkExclusionKeywords(filename: string): ExclusionKeywordMatch {
  const lowerFilename = filename.toLowerCase();

  const exclusionKeywords = [
    'trailer',
    'sample',
    'behindthescenes',
    'deleted',
    'featurette',
    'interview',
    'scene',
    'short',
  ];

  const matchedKeywords: string[] = [];
  let matchType = '';

  for (const keyword of exclusionKeywords) {
    // Check for hyphenated patterns: -trailer, -sample, etc.
    if (lowerFilename.includes(`-${keyword}`)) {
      matchedKeywords.push(keyword);
      matchType = 'hyphenated';
      continue;
    }

    // Check for underscore-separated patterns: _trailer, _sample
    if (lowerFilename.includes(`_${keyword}`)) {
      matchedKeywords.push(keyword);
      matchType = 'underscore';
      continue;
    }

    // Special case: "sample" anywhere in filename
    if (keyword === 'sample' && lowerFilename.includes('sample')) {
      matchedKeywords.push(keyword);
      matchType = 'anywhere';
    }
  }

  const result: ExclusionKeywordMatch = {
    hasExclusionKeywords: matchedKeywords.length > 0,
    matchedKeywords,
    shouldExclude: matchedKeywords.length > 0,
  };

  if (matchedKeywords.length > 0 && matchType) {
    result.matchType = matchType;
  }

  return result;
}

/**
 * Classify text files (NFO, subtitles)
 * Strategy: Extension-first classification → Content verification
 */
export function classifyTextFiles(
  textFiles: FileFacts[],
  isDiscStructure: boolean,
  expectedDiscNfoPath?: string
): TextClassification {
  const nfo: ClassifiedFile[] = [];
  const subtitles: ClassifiedFile[] = [];
  const unknown: ClassifiedFile[] = [];
  let tmdbId: number | undefined;
  let imdbId: string | undefined;

  for (const file of textFiles) {
    if (!file.text) {
      unknown.push({
        facts: file,
        classificationType: 'unknown',
        confidence: 0,
        reasoning: 'No text facts gathered',
        userProvided: false,
      });
      continue;
    }

    const ext = file.filesystem.extension.toLowerCase();

    // NFO file detection
    if (ext === '.nfo') {
      // Check content verification
      if (file.text.looksLikeNfo) {
        // For disc structures, check if it's in the expected location
        let confidence: ConfidenceScore = 90;
        let reasoning = 'NFO extension with verified content (XML or provider IDs)';

        if (isDiscStructure && expectedDiscNfoPath) {
          if (file.filesystem.absolutePath === expectedDiscNfoPath) {
            confidence = 100;
            reasoning = 'Disc structure NFO in expected location';
          }
        }

        nfo.push({
          facts: file,
          classificationType: 'nfo',
          confidence,
          reasoning,
          userProvided: false,
        });

        // Extract IDs
        if (file.text.tmdbId) tmdbId = file.text.tmdbId;
        if (file.text.imdbId) imdbId = file.text.imdbId;
      } else {
        unknown.push({
          facts: file,
          classificationType: 'unknown',
          confidence: 0,
          reasoning: 'NFO extension but content verification failed',
          userProvided: false,
        });
      }
      continue;
    }

    // Subtitle file detection
    const subtitleExtensions = ['.srt', '.ass', '.ssa', '.vtt', '.sub', '.idx'];
    if (subtitleExtensions.includes(ext)) {
      if (file.text.looksLikeSubtitle) {
        subtitles.push({
          facts: file,
          classificationType: 'subtitle',
          confidence: 90,
          reasoning: `Subtitle extension (${ext}) with verified content (timestamp patterns)`,
          userProvided: false,
        });
      } else {
        unknown.push({
          facts: file,
          classificationType: 'unknown',
          confidence: 0,
          reasoning: `Subtitle extension (${ext}) but content verification failed`,
          userProvided: false,
        });
      }
      continue;
    }

    // Unknown text file
    unknown.push({
      facts: file,
      classificationType: 'unknown',
      confidence: 0,
      reasoning: `Unknown text file extension: ${ext}`,
      userProvided: false,
    });
  }

  const result: TextClassification = {
    nfo,
    subtitles,
    unknown,
  };

  if (tmdbId !== undefined) {
    result.tmdbId = tmdbId;
  }
  if (imdbId !== undefined) {
    result.imdbId = imdbId;
  }

  return result;
}

/**
 * Classify audio files (theme.mp3, etc.)
 */
export function classifyAudioFiles(audioFiles: FileFacts[]): AudioClassification {
  const themes: ClassifiedFile[] = [];
  const unknown: ClassifiedFile[] = [];

  for (const file of audioFiles) {
    const filename = file.filesystem.filename.toLowerCase();
    const basename = file.filesystem.basename.toLowerCase();

    // Theme music detection
    if (basename === 'theme' || filename === 'theme.mp3') {
      themes.push({
        facts: file,
        classificationType: 'theme',
        confidence: 100,
        reasoning: 'Exact match for theme music filename',
        userProvided: false,
      });
      continue;
    }

    // Unknown audio file
    unknown.push({
      facts: file,
      classificationType: 'unknown',
      confidence: 0,
      reasoning: `Unknown audio file: ${filename}`,
      userProvided: false,
    });
  }

  return {
    themes,
    unknown,
  };
}

/**
 * Classify main movie using duration-only heuristic
 * Decision tree from FILE_SCANNER.md
 */
export function classifyMainMovie(
  videoFiles: FileFacts[],
  webhookFilename?: string
): VideoClassification {
  const trailers: ClassifiedFile[] = [];
  const extras: ClassifiedFile[] = [];
  const unknown: ClassifiedFile[] = [];

  // Filter out videos with exclusion keywords
  const candidates: FileFacts[] = [];

  for (const file of videoFiles) {
    const exclusionCheck = checkExclusionKeywords(file.filesystem.filename);

    if (exclusionCheck.shouldExclude) {
      // Classify as trailer/extra based on keyword
      const keyword = exclusionCheck.matchedKeywords[0];
      const classificationType =
        keyword === 'trailer' ? 'trailer' : keyword === 'deleted' ? 'deleted_scene' : 'trailer';

      trailers.push({
        facts: file,
        classificationType: classificationType as any,
        confidence: 100,
        reasoning: `Exclusion keyword detected: ${exclusionCheck.matchedKeywords.join(', ')}`,
        userProvided: false,
      });
    } else {
      candidates.push(file);
    }
  }

  // CASE 1: Webhook provided exact filename
  if (webhookFilename) {
    const webhookMatch = candidates.find(
      (f) => f.filesystem.filename === webhookFilename
    );
    if (webhookMatch) {
      return {
        mainMovie: {
          facts: webhookMatch,
          classificationType: 'main_movie',
          confidence: 100,
          reasoning: 'Webhook provided exact filename',
          userProvided: false,
        },
        trailers,
        extras,
        unknown,
        mainMovieConfidence: 100,
        mainMovieStatus: 'Identified via webhook hint',
      };
    }
  }

  // CASE 2: No video files
  if (videoFiles.length === 0) {
    return {
      mainMovie: null,
      trailers,
      extras,
      unknown,
      mainMovieConfidence: 0,
      mainMovieStatus: 'FAIL: No video files found',
    };
  }

  // CASE 3: Single video file
  if (videoFiles.length === 1) {
    const onlyFile = videoFiles[0];
    const exclusionCheck = checkExclusionKeywords(onlyFile.filesystem.filename);

    if (exclusionCheck.shouldExclude) {
      return {
        mainMovie: null,
        trailers,
        extras,
        unknown,
        mainMovieConfidence: 0,
        mainMovieStatus: 'FAIL: Only video file has exclusion keywords',
      };
    }

    return {
      mainMovie: {
        facts: onlyFile,
        classificationType: 'main_movie',
        confidence: 100,
        reasoning: 'Only video file in directory',
        userProvided: false,
      },
      trailers,
      extras,
      unknown,
      mainMovieConfidence: 100,
      mainMovieStatus: 'Single video file (no alternatives)',
    };
  }

  // CASE 4: Single candidate after exclusion
  if (candidates.length === 1) {
    return {
      mainMovie: {
        facts: candidates[0],
        classificationType: 'main_movie',
        confidence: 95,
        reasoning: 'Only remaining candidate after excluding trailers/extras',
        userProvided: false,
      },
      trailers,
      extras,
      unknown,
      mainMovieConfidence: 95,
      mainMovieStatus: 'Single candidate after exclusion',
    };
  }

  // CASE 5: Multiple candidates → Use duration only (longest wins)
  if (candidates.length > 1) {
    // Sort by duration (longest first)
    const sortedByDuration = [...candidates].sort((a, b) => {
      const aDuration = a.video?.durationSeconds || 0;
      const bDuration = b.video?.durationSeconds || 0;
      return bDuration - aDuration;
    });

    const longest = sortedByDuration[0];
    const secondLongest = sortedByDuration[1];

    const longestDuration = longest.video?.durationSeconds || 0;
    const secondLongestDuration = secondLongest?.video?.durationSeconds || 0;

    // Edge case: Identical durations (within 1 second)
    if (Math.abs(longestDuration - secondLongestDuration) <= 1) {
      return {
        mainMovie: null,
        trailers,
        extras,
        unknown,
        mainMovieConfidence: 0,
        mainMovieStatus: 'FAIL: Multiple candidates with identical duration',
      };
    }

    return {
      mainMovie: {
        facts: longest,
        classificationType: 'main_movie',
        confidence: 90,
        reasoning: `Longest duration (${Math.round(longestDuration / 60)} min) among ${candidates.length} candidates`,
        userProvided: false,
      },
      trailers,
      extras,
      unknown,
      mainMovieConfidence: 90,
      mainMovieStatus: 'Longest duration among candidates',
    };
  }

  // CASE 6: All videos are trailers
  return {
    mainMovie: null,
    trailers,
    extras,
    unknown,
    mainMovieConfidence: 0,
    mainMovieStatus: 'FAIL: All video files contain exclusion keywords',
  };
}

/**
 * Generate expected filename patterns for image classification
 */
export function generateExpectedFilenames(
  mainMovieBasename: string | null,
  isDiscStructure: boolean
): ExpectedFilenamePatterns {
  const patterns: ExpectedFilenamePatterns = {
    posters: [],
    fanarts: [],
    banners: [],
    clearlogos: [],
    cleararts: [],
    discs: [],
    landscapes: [],
    thumbs: [],
    keyarts: [],
    isShortNameFormat: isDiscStructure,
  };

  if (isDiscStructure) {
    // Short name format for disc structures (no movie prefix)
    patterns.posters = ['poster.jpg', 'poster.png', 'folder.jpg'];
    patterns.fanarts = ['fanart.jpg', 'fanart.png', 'backdrop.jpg'];
    patterns.banners = ['banner.jpg', 'banner.png'];
    patterns.clearlogos = ['clearlogo.png', 'logo.png'];
    patterns.cleararts = ['clearart.png'];
    patterns.discs = ['disc.png'];
    patterns.landscapes = ['landscape.jpg', 'landscape.png'];
    patterns.thumbs = ['thumb.jpg', 'thumb.png'];
    patterns.keyarts = ['keyart.jpg', 'keyart.png'];

    // Add numbered variants
    for (let i = 1; i <= 10; i++) {
      patterns.fanarts.push(`fanart${i}.jpg`, `fanart${i}.png`);
      patterns.posters.push(`poster${i}.jpg`, `poster${i}.png`);
    }
  } else if (mainMovieBasename) {
    // Movie-based naming (standard Kodi format)
    patterns.posters = [
      `${mainMovieBasename}-poster.jpg`,
      `${mainMovieBasename}-poster.png`,
      'poster.jpg',
      'poster.png',
      'folder.jpg',
    ];

    patterns.fanarts = [
      `${mainMovieBasename}-fanart.jpg`,
      `${mainMovieBasename}-fanart.png`,
      'fanart.jpg',
      'fanart.png',
      'backdrop.jpg',
    ];

    patterns.banners = [
      `${mainMovieBasename}-banner.jpg`,
      `${mainMovieBasename}-banner.png`,
      'banner.jpg',
      'banner.png',
    ];

    patterns.clearlogos = [
      `${mainMovieBasename}-clearlogo.png`,
      `${mainMovieBasename}-logo.png`,
      'clearlogo.png',
      'logo.png',
    ];

    patterns.cleararts = [
      `${mainMovieBasename}-clearart.png`,
      'clearart.png',
    ];

    patterns.discs = [`${mainMovieBasename}-disc.png`, 'disc.png'];

    patterns.landscapes = [
      `${mainMovieBasename}-landscape.jpg`,
      `${mainMovieBasename}-landscape.png`,
      'landscape.jpg',
      'landscape.png',
    ];

    patterns.thumbs = [
      `${mainMovieBasename}-thumb.jpg`,
      `${mainMovieBasename}-thumb.png`,
      'thumb.jpg',
      'thumb.png',
    ];

    patterns.keyarts = [
      `${mainMovieBasename}-keyart.jpg`,
      `${mainMovieBasename}-keyart.png`,
      'keyart.jpg',
      'keyart.png',
    ];

    // Add numbered variants
    for (let i = 1; i <= 10; i++) {
      patterns.fanarts.push(
        `${mainMovieBasename}-fanart${i}.jpg`,
        `${mainMovieBasename}-fanart${i}.png`
      );
      patterns.posters.push(
        `${mainMovieBasename}-poster${i}.jpg`,
        `${mainMovieBasename}-poster${i}.png`
      );
    }
  }

  return patterns;
}

/**
 * Validate image dimensions against asset type specs
 */
function validateDimensions(
  imageFile: FileFacts,
  assetType: string
): { valid: boolean; details: string } {
  if (!imageFile.image) {
    return { valid: false, details: 'No image facts available' };
  }

  const spec = ASSET_SPECS[assetType as keyof typeof ASSET_SPECS];
  if (!spec) {
    return { valid: true, details: 'No spec for this asset type' };
  }

  const { width, height, aspectRatio } = imageFile.image;

  // Check aspect ratio (with tolerance)
  const aspectRatioValid =
    aspectRatio >= spec.aspectRatio.min && aspectRatio <= spec.aspectRatio.max;

  // Check minimum dimensions (with 10% tolerance)
  const minWidthWithTolerance = spec.minWidth * 0.9;
  const minHeightWithTolerance = spec.minHeight * 0.9;
  const dimensionsValid = width >= minWidthWithTolerance && height >= minHeightWithTolerance;

  if (aspectRatioValid && dimensionsValid) {
    return {
      valid: true,
      details: `Valid ${assetType}: ${width}x${height}, ratio ${aspectRatio.toFixed(2)}`,
    };
  }

  return {
    valid: false,
    details: `Invalid ${assetType}: ${width}x${height}, ratio ${aspectRatio.toFixed(2)} (expected ratio ${spec.aspectRatio.min}-${spec.aspectRatio.max})`,
  };
}

/**
 * Classify image files using expected patterns and dimension validation
 */
export function classifyImageFiles(
  imageFiles: FileFacts[],
  expectedPatterns: ExpectedFilenamePatterns
): ImageClassification {
  const result: ImageClassification = {
    posters: [],
    fanarts: [],
    banners: [],
    clearlogos: [],
    cleararts: [],
    discs: [],
    landscapes: [],
    thumbs: [],
    keyarts: [],
    unknown: [],
    totalClassified: 0,
    totalUnknown: 0,
  };

  for (const imageFile of imageFiles) {
    const filename = imageFile.filesystem.filename;
    const lowerFilename = filename.toLowerCase();
    let classified = false;

    // Try to match against each asset type
    const assetTypes = [
      { type: 'poster', patterns: expectedPatterns.posters, arrayKey: 'posters' },
      { type: 'fanart', patterns: expectedPatterns.fanarts, arrayKey: 'fanarts' },
      { type: 'banner', patterns: expectedPatterns.banners, arrayKey: 'banners' },
      { type: 'clearlogo', patterns: expectedPatterns.clearlogos, arrayKey: 'clearlogos' },
      { type: 'clearart', patterns: expectedPatterns.cleararts, arrayKey: 'cleararts' },
      { type: 'disc', patterns: expectedPatterns.discs, arrayKey: 'discs' },
      { type: 'landscape', patterns: expectedPatterns.landscapes, arrayKey: 'landscapes' },
      { type: 'thumb', patterns: expectedPatterns.thumbs, arrayKey: 'thumbs' },
      { type: 'keyart', patterns: expectedPatterns.keyarts, arrayKey: 'keyarts' },
    ];

    for (const assetType of assetTypes) {
      if (classified) break;

      // Check for exact filename match
      for (const pattern of assetType.patterns) {
        if (lowerFilename === pattern.toLowerCase()) {
          const dimensionCheck = validateDimensions(imageFile, assetType.type);
          const confidence: ConfidenceScore = dimensionCheck.valid ? 100 : 85;

          const classifiedFile: ClassifiedFile = {
            facts: imageFile,
            classificationType: assetType.type as any,
            confidence,
            reasoning: `Exact filename match: ${pattern}${dimensionCheck.valid ? ' (dimensions validated)' : ''}`,
            userProvided: false,
          };

          (result[assetType.arrayKey as keyof ImageClassification] as ClassifiedFile[]).push(classifiedFile);

          classified = true;
          result.totalClassified++;
          break;
        }
      }

      // Check for keyword in filename (lower confidence)
      if (!classified && lowerFilename.includes(assetType.type)) {
        const dimensionCheck = validateDimensions(imageFile, assetType.type);
        const baseConfidence = 60;
        const confidence: ConfidenceScore = dimensionCheck.valid
          ? baseConfidence + 20
          : baseConfidence;

        if (confidence >= 80) {
          const classifiedFile: ClassifiedFile = {
            facts: imageFile,
            classificationType: assetType.type as any,
            confidence,
            reasoning: `Keyword match: "${assetType.type}" in filename${dimensionCheck.valid ? ' (dimensions validated)' : ''}`,
            userProvided: false,
          };

          (result[assetType.arrayKey as keyof ImageClassification] as ClassifiedFile[]).push(classifiedFile);

          classified = true;
          result.totalClassified++;
        }
      }
    }

    // If not classified, mark as unknown
    if (!classified) {
      result.unknown.push({
        facts: imageFile,
        classificationType: 'unknown',
        confidence: 0,
        reasoning: 'No matching pattern found',
        userProvided: false,
      });
      result.totalUnknown++;
    }
  }

  return result;
}

/**
 * Classify legacy directory files
 */
export function classifyLegacyDirectoryFiles(
  scanFacts: DirectoryScanFacts
): LegacyDirectoryClassification | undefined {
  const { legacyDirectories } = scanFacts;

  if (legacyDirectories.totalLegacyFiles === 0) {
    return undefined;
  }

  const extrafanarts: ClassifiedFile[] = [];
  const extrathumbs: ClassifiedFile[] = [];
  const directoriesToRecycle: string[] = [];

  // Classify extrafanarts files
  if (legacyDirectories.extrafanartsFiles) {
    for (const filePath of legacyDirectories.extrafanartsFiles) {
      const file = scanFacts.files.find((f) => f.filesystem.absolutePath === filePath);
      if (file) {
        extrafanarts.push({
          facts: file,
          classificationType: 'fanart',
          confidence: 80,
          reasoning: 'From legacy extrafanarts directory',
          userProvided: false,
        });
      }
    }
    if (legacyDirectories.extrafanartsPath) {
      directoriesToRecycle.push(legacyDirectories.extrafanartsPath);
    }
  }

  // Classify extrathumbs files
  if (legacyDirectories.extrathumbsFiles) {
    for (const filePath of legacyDirectories.extrathumbsFiles) {
      const file = scanFacts.files.find((f) => f.filesystem.absolutePath === filePath);
      if (file) {
        extrathumbs.push({
          facts: file,
          classificationType: 'thumb',
          confidence: 80,
          reasoning: 'From legacy extrathumbs directory',
          userProvided: false,
        });
      }
    }
    if (legacyDirectories.extrathumbsPath) {
      directoriesToRecycle.push(legacyDirectories.extrathumbsPath);
    }
  }

  return {
    extrafanarts,
    extrathumbs,
    directoriesToRecycle,
  };
}

/**
 * Main orchestrator: Classify all files in directory
 */
export async function classifyDirectory(
  scanFacts: DirectoryScanFacts,
  webhookFilename?: string
): Promise<ClassificationResult> {
  const startTime = Date.now();
  logger.info('Starting classification for directory', {
    directoryPath: scanFacts.directoryPath,
    totalFiles: scanFacts.files.length,
  });

  // Separate files by type
  const videoFiles = scanFacts.files.filter((f) => f.video);
  const imageFiles = scanFacts.files.filter((f) => f.image);
  const textFiles = scanFacts.files.filter((f) => f.text);
  const audioFiles = scanFacts.files.filter(
    (f) =>
      !f.video &&
      !f.image &&
      !f.text &&
      ['.mp3', '.flac', '.m4a', '.aac', '.ogg', '.wav', '.wma'].includes(
        f.filesystem.extension.toLowerCase()
      )
  );

  // Step 1: Classify text files
  const textClassification = classifyTextFiles(
    textFiles,
    scanFacts.discStructure.type !== null,
    scanFacts.discStructure.expectedNfoPath
  );

  // Step 2: Classify audio files
  const audioClassification = classifyAudioFiles(audioFiles);

  // Step 3: Classify video files (main movie detection)
  const videoClassification = classifyMainMovie(videoFiles, webhookFilename);

  // Step 4: Generate expected image filenames
  const mainMovieBasename = videoClassification.mainMovie?.facts.filesystem.basename || null;
  const expectedPatterns = generateExpectedFilenames(
    mainMovieBasename,
    scanFacts.discStructure.type !== null
  );

  // Step 5: Classify image files
  const imageClassification = classifyImageFiles(imageFiles, expectedPatterns);

  // Step 6: Classify legacy directory files
  const legacyClassification = classifyLegacyDirectoryFiles(scanFacts);

  // Calculate totals
  const totalFiles = scanFacts.files.length;
  const totalClassified =
    (videoClassification.mainMovie ? 1 : 0) +
    videoClassification.trailers.length +
    textClassification.nfo.length +
    textClassification.subtitles.length +
    audioClassification.themes.length +
    imageClassification.totalClassified +
    (legacyClassification?.extrafanarts.length || 0) +
    (legacyClassification?.extrathumbs.length || 0);

  const totalUnknown =
    videoClassification.unknown.length +
    textClassification.unknown.length +
    audioClassification.unknown.length +
    imageClassification.totalUnknown;

  // Determine overall status
  let status: ClassificationStatus;
  let overallConfidence: ConfidenceScore;
  let summary: string;

  const hasMainMovie = videoClassification.mainMovie !== null;
  const hasTmdbId = textClassification.tmdbId !== undefined;

  if (hasMainMovie && hasTmdbId && totalUnknown === 0) {
    status = 'CAN_PROCESS';
    overallConfidence = 100;
    summary = 'All files classified successfully. Ready to process.';
  } else if (hasMainMovie && hasTmdbId) {
    status = 'CAN_PROCESS_WITH_UNKNOWNS';
    overallConfidence = 80;
    summary = `Main movie and TMDB ID found. ${totalUnknown} unknown file(s) will be flagged for recycling.`;
  } else {
    status = 'MANUAL_REQUIRED';
    overallConfidence = 0;
    const missing = [];
    if (!hasMainMovie) missing.push('main movie');
    if (!hasTmdbId) missing.push('TMDB ID');
    summary = `Cannot process automatically. Missing: ${missing.join(', ')}`;
  }

  // Collect files to recycle
  const filesToRecycle: ClassifiedFile[] = [
    ...videoClassification.unknown,
    ...textClassification.unknown,
    ...audioClassification.unknown,
    ...imageClassification.unknown,
  ];

  const processingTimeMs = Date.now() - startTime;

  logger.info('Completed classification for directory', {
    directoryPath: scanFacts.directoryPath,
    status,
    totalFiles,
    totalClassified,
    totalUnknown,
    processingTimeMs,
  });

  const result: ClassificationResult = {
    status,
    overallConfidence,
    summary,
    videos: videoClassification,
    images: imageClassification,
    text: textClassification,
    audio: audioClassification,
    isDiscStructure: scanFacts.discStructure.type !== null,
    totalFiles,
    totalClassified,
    totalUnknown,
    filesToRecycle,
    classifiedAt: new Date(),
    processingTimeMs,
  };

  if (legacyClassification) {
    result.legacy = legacyClassification;
  }

  if (scanFacts.discStructure.type) {
    result.discStructureType = scanFacts.discStructure.type;
  }

  return result;
}
