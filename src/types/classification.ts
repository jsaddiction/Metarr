/**
 * Classification Result Types - Phase 2 & 3 Classification
 *
 * These types represent the results of file classification decisions
 * made after fact gathering. Classification uses gathered facts to
 * determine what each file IS with a confidence score.
 *
 * Principle: "Binary Decision Model - Either ≥80% confidence or ask user"
 */

import { FileFacts } from './fileFacts';

/**
 * Classification Status - Final processing decision
 *
 * Binary model:
 * - CAN_PROCESS (100): Main movie + TMDB ID, all files classified
 * - CAN_PROCESS_WITH_UNKNOWNS (80): Main movie + TMDB ID, some unknown files
 * - MANUAL_REQUIRED (0): Missing main movie OR TMDB ID
 */
export type ClassificationStatus =
  | 'CAN_PROCESS'
  | 'CAN_PROCESS_WITH_UNKNOWNS'
  | 'MANUAL_REQUIRED';

/**
 * Confidence Score - How certain we are about classification
 *
 * Ranges:
 * - 100: Absolute certainty (webhook hint, disc structure, single file)
 * - 90-99: Very high confidence (exact filename match)
 * - 80-89: High confidence (numbered variant, duration winner)
 * - 60-79: Medium confidence (keyword match) - BELOW THRESHOLD
 * - 0-59: Low confidence (guess) - BELOW THRESHOLD
 *
 * Threshold: ≥80 = auto-classify, <80 = ask user
 */
export type ConfidenceScore = number; // 0-100

/**
 * Classified File - A file with classification decision
 */
export interface ClassifiedFile {
  /** Original file facts */
  facts: FileFacts;
  /** Classification type assigned */
  classificationType: ClassificationType;
  /** Confidence score (0-100) */
  confidence: ConfidenceScore;
  /** Human-readable reasoning for classification decision */
  reasoning: string;
  /** Was this classification provided by user? */
  userProvided: boolean;
}

/**
 * Classification Type - What we determined the file to be
 */
export type ClassificationType =
  // Video types
  | 'main_movie'
  | 'trailer'
  | 'deleted_scene'
  | 'behind_the_scenes'
  | 'featurette'
  | 'interview'
  | 'scene'
  | 'short'
  | 'sample'
  // Image types
  | 'poster'
  | 'fanart'
  | 'banner'
  | 'clearlogo'
  | 'clearart'
  | 'disc'
  | 'landscape'
  | 'thumb'
  | 'keyart'
  // Text types
  | 'nfo'
  | 'subtitle'
  // Audio types
  | 'theme'
  // Disc structure
  | 'disc_structure'
  // Unknown
  | 'unknown';

/**
 * Video Classification Result
 * Results from classifying video files in directory
 */
export interface VideoClassification {
  /** Main movie file (null if not identified) */
  mainMovie: ClassifiedFile | null;
  /** Trailer files */
  trailers: ClassifiedFile[];
  /** Other extra video files (deleted scenes, featurettes, etc.) */
  extras: ClassifiedFile[];
  /** Unknown video files (couldn't classify) */
  unknown: ClassifiedFile[];
  /** Overall confidence in main movie selection */
  mainMovieConfidence: ConfidenceScore;
  /** Status message explaining main movie decision */
  mainMovieStatus: string;
}

/**
 * Image Classification Result
 * Results from classifying image files in directory
 * Organized by asset type
 */
export interface ImageClassification {
  /** Poster images */
  posters: ClassifiedFile[];
  /** Fanart/backdrop images */
  fanarts: ClassifiedFile[];
  /** Banner images */
  banners: ClassifiedFile[];
  /** Clear logo images */
  clearlogos: ClassifiedFile[];
  /** Clear art images */
  cleararts: ClassifiedFile[];
  /** Disc images */
  discs: ClassifiedFile[];
  /** Landscape images */
  landscapes: ClassifiedFile[];
  /** Thumbnail images */
  thumbs: ClassifiedFile[];
  /** Keyart images */
  keyarts: ClassifiedFile[];
  /** Unknown image files (couldn't classify) */
  unknown: ClassifiedFile[];
  /** Total images classified */
  totalClassified: number;
  /** Total images unknown */
  totalUnknown: number;
}

/**
 * Text Classification Result
 * Results from classifying text files in directory
 */
export interface TextClassification {
  /** NFO files */
  nfo: ClassifiedFile[];
  /** Subtitle files */
  subtitles: ClassifiedFile[];
  /** Unknown text files (couldn't classify) */
  unknown: ClassifiedFile[];
  /** TMDB ID found in NFO (if any) */
  tmdbId?: number;
  /** IMDB ID found in NFO (if any) */
  imdbId?: string;
}

/**
 * Audio Classification Result
 * Results from classifying audio files in directory
 */
export interface AudioClassification {
  /** Theme music files */
  themes: ClassifiedFile[];
  /** Unknown audio files (couldn't classify) */
  unknown: ClassifiedFile[];
}

/**
 * Legacy Directory Classification Result
 * Files found in deprecated Kodi directories
 */
export interface LegacyDirectoryClassification {
  /** Files from extrafanarts directory */
  extrafanarts: ClassifiedFile[];
  /** Files from extrathumbs directory */
  extrathumbs: ClassifiedFile[];
  /** Paths to directories for complete removal at publish time */
  directoriesToRecycle: string[];
}

/**
 * Complete Classification Result
 * All classification decisions for a directory
 */
export interface ClassificationResult {
  /** Final processing status */
  status: ClassificationStatus;
  /** Overall confidence in classification (0-100) */
  overallConfidence: ConfidenceScore;
  /** Human-readable summary of classification result */
  summary: string;
  /** Video classification results */
  videos: VideoClassification;
  /** Image classification results */
  images: ImageClassification;
  /** Text classification results */
  text: TextClassification;
  /** Audio classification results */
  audio: AudioClassification;
  /** Legacy directory classification results */
  legacy?: LegacyDirectoryClassification;
  /** Disc structure detected (BDMV/VIDEO_TS) */
  isDiscStructure: boolean;
  /** Disc structure type if detected */
  discStructureType?: 'BDMV' | 'VIDEO_TS';
  /** Total files scanned */
  totalFiles: number;
  /** Total files classified successfully */
  totalClassified: number;
  /** Total files unknown (need user input) */
  totalUnknown: number;
  /** Files that will be recycled at publish time */
  filesToRecycle: ClassifiedFile[];
  /** Timestamp of classification */
  classifiedAt: Date;
  /** Processing time in milliseconds */
  processingTimeMs: number;
}

/**
 * Manual Classification Input
 * User-provided classification for unknown files
 */
export interface ManualClassificationInput {
  /** File path being classified */
  filePath: string;
  /** User-selected classification type */
  classificationType: ClassificationType;
  /** Optional user note/reason */
  userNote?: string;
}

/**
 * Manual Classification Request
 * Request for user to manually classify files
 */
export interface ManualClassificationRequest {
  /** Directory being classified */
  directoryPath: string;
  /** Movie ID (if known) */
  movieId?: number;
  /** Files that need manual classification */
  filesNeedingClassification: FileFacts[];
  /** Suggested classifications (with low confidence) */
  suggestedClassifications: ClassifiedFile[];
  /** Reason why manual classification is needed */
  reason: string;
  /** Can processing continue without these files? */
  canProceedWithoutFiles: boolean;
}

/**
 * Processing Decision
 * Final decision on whether directory can be processed
 */
export interface ProcessingDecision {
  /** Can we process this directory? */
  canProcess: boolean;
  /** Processing status */
  status: ClassificationStatus;
  /** Confidence score */
  confidence: ConfidenceScore;
  /** Reason for decision */
  reason: string;
  /** Missing requirements (if any) */
  missingRequirements: string[];
  /** Main movie identified? */
  hasMainMovie: boolean;
  /** TMDB ID available? */
  hasTmdbId: boolean;
  /** Unknown files present? */
  hasUnknownFiles: boolean;
  /** Number of unknown files */
  unknownFileCount: number;
}

/**
 * Exclusion Keyword Match
 * Result from checking filename against exclusion patterns
 */
export interface ExclusionKeywordMatch {
  /** Does filename have exclusion keywords? */
  hasExclusionKeywords: boolean;
  /** Matched keywords */
  matchedKeywords: string[];
  /** Match type (hyphenated, underscore, etc.) */
  matchType?: string;
  /** Should file be excluded from main movie candidates? */
  shouldExclude: boolean;
}

/**
 * Expected Filename Patterns
 * Generated expected filenames for image classification
 */
export interface ExpectedFilenamePatterns {
  /** Expected poster filenames */
  posters: string[];
  /** Expected fanart filenames */
  fanarts: string[];
  /** Expected banner filenames */
  banners: string[];
  /** Expected clearlogo filenames */
  clearlogos: string[];
  /** Expected clearart filenames */
  cleararts: string[];
  /** Expected disc filenames */
  discs: string[];
  /** Expected landscape filenames */
  landscapes: string[];
  /** Expected thumb filenames */
  thumbs: string[];
  /** Expected keyart filenames */
  keyarts: string[];
  /** Using short name format (disc structures only) */
  isShortNameFormat: boolean;
}

/**
 * Image Classification Score
 * Detailed scoring for image classification decision
 */
export interface ImageClassificationScore {
  /** Classification type being evaluated */
  classificationType: ClassificationType;
  /** Base confidence from filename match */
  filenameConfidence: ConfidenceScore;
  /** Bonus confidence from dimension validation */
  dimensionBonus: ConfidenceScore;
  /** Final combined confidence */
  finalConfidence: ConfidenceScore;
  /** Filename match type (exact, numbered, keyword, etc.) */
  matchType: string;
  /** Dimension validation passed? */
  dimensionValid: boolean;
  /** Dimension validation details */
  dimensionDetails?: string;
}
