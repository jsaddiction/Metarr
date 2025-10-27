/**
 * File Facts Types - Phase 1 Fact Gathering
 *
 * These interfaces represent comprehensive metadata collected during the
 * file scanning process. Facts are gathered top-down by type (filesystem,
 * video, image, text) before classification decisions are made.
 *
 * Principle: "Gather all facts upfront, classify with confidence"
 */

/**
 * Filesystem Facts - Basic file metadata (all files)
 * Collected via fs.stat and path parsing
 */
export interface FilesystemFacts {
  /** Absolute path to the file */
  absolutePath: string;
  /** Filename with extension */
  filename: string;
  /** Filename without extension */
  basename: string;
  /** File extension (including dot, e.g., ".mkv") */
  extension: string;
  /** File size in bytes */
  sizeBytes: number;
  /** Parent directory absolute path */
  directoryPath: string;
  /** Parent directory name only */
  directoryName: string;
  /** File modified timestamp */
  modifiedAt: Date;
  /** File created timestamp */
  created_at: Date;
}

/**
 * Filename Pattern Facts - Extracted metadata from filename
 * Collected via regex analysis for all files
 */
export interface FilenameFacts {
  /** Has year pattern in filename (e.g., "(2024)", "[2024]", ".2024.") */
  hasYearPattern: boolean;
  /** Extracted year value if found */
  extractedYear?: number;
  /** Has resolution tag (e.g., "1080p", "720p", "4K", "2160p") */
  hasResolution: boolean;
  /** Resolution value if found */
  resolution?: string;
  /** Has codec tag (e.g., "x264", "x265", "HEVC") */
  hasCodec: boolean;
  /** Codec value if found */
  codec?: string;
  /** Has quality tags (e.g., "BLURAY", "REMUX", "WEBRip") */
  hasQualityTags: boolean;
  /** Quality tags if found */
  qualityTags?: string[];
  /** Has audio tags (e.g., "DTS", "ATMOS", "DD5.1") */
  hasAudioTags: boolean;
  /** Audio tags if found */
  audioTags?: string[];
  /** Has edition info (e.g., "Director's Cut", "Extended", "Theatrical") */
  hasEdition: boolean;
  /** Edition value if found */
  edition?: string;
  /** Has exclusion keywords (trailer, sample, deleted, etc.) */
  hasExclusionKeywords: boolean;
  /** Matched exclusion keywords */
  exclusionKeywords?: string[];
}

/**
 * Video Stream Facts - FFprobe metadata (video files only)
 * Collected via FFprobe for .mp4, .mkv, .avi, .mov, etc.
 */
export interface VideoStreamFacts {
  /** Has at least one video stream */
  hasVideoStream: boolean;
  /** Has at least one audio stream */
  hasAudioStream: boolean;
  /** Total duration in seconds */
  durationSeconds: number;
  /** Overall bitrate (bits per second) */
  overallBitrate?: number;
  /** Video streams array */
  videoStreams: VideoStream[];
  /** Audio streams array */
  audioStreams: AudioStream[];
  /** Subtitle streams array (embedded) */
  subtitleStreams: SubtitleStream[];
}

export interface VideoStream {
  /** Video codec (e.g., "h264", "hevc") */
  codec: string;
  /** Resolution width */
  width: number;
  /** Resolution height */
  height: number;
  /** Frames per second */
  fps: number;
  /** Bitrate (bits per second) */
  bitrate?: number;
  /** Codec profile (e.g., "High", "Main") */
  profile?: string;
  /** Color space (e.g., "bt709") */
  colorSpace?: string;
  /** HDR format if applicable (e.g., "HDR10", "Dolby Vision") */
  hdrFormat?: string;
}

export interface AudioStream {
  /** Audio codec (e.g., "aac", "ac3", "dts") */
  codec: string;
  /** Number of channels */
  channels: number;
  /** Sample rate (Hz) */
  sampleRate: number;
  /** Bitrate (bits per second) */
  bitrate?: number;
  /** Language code (ISO 639-2, e.g., "eng") */
  language?: string;
  /** Stream title metadata */
  title?: string;
}

export interface SubtitleStream {
  /** Subtitle codec (e.g., "subrip", "ass") */
  codec: string;
  /** Language code (ISO 639-2) */
  language?: string;
  /** Stream title metadata */
  title?: string;
  /** Is forced subtitle */
  forced: boolean;
  /** Is default subtitle */
  default: boolean;
}

/**
 * Image Facts - Sharp metadata (image files only)
 * Collected via Sharp for .jpg, .png, .gif, etc.
 */
export interface ImageFacts {
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** Calculated aspect ratio (width / height) */
  aspectRatio: number;
  /** Image format (e.g., "jpeg", "png") */
  format: string;
  /** Has alpha channel (transparency) */
  hasAlpha: boolean;
}

/**
 * Text File Facts - Content analysis (text files only)
 * Collected via file reading for .nfo, .srt, .txt, etc.
 */
export interface TextFileFacts {
  /** Content sample (first 10KB) */
  contentSample: string;
  /** Contains TMDB ID in content */
  containsTmdbId: boolean;
  /** Extracted TMDB ID if found */
  tmdbId?: number;
  /** Contains IMDB ID in content */
  containsImdbId: boolean;
  /** Extracted IMDB ID if found */
  imdbId?: string;
  /** Looks like NFO file (XML structure or provider IDs) */
  looksLikeNfo: boolean;
  /** Looks like subtitle file (timestamp patterns) */
  looksLikeSubtitle: boolean;
  /** Detected language code (for subtitles) */
  detectedLanguage?: string;
}

/**
 * Directory Context Facts - Relative comparisons
 * Computed AFTER all individual file facts are gathered
 */
export interface DirectoryContextFacts {
  /** Total video files in directory */
  totalVideoFiles: number;
  /** Total image files in directory */
  totalImageFiles: number;
  /** Total text files in directory */
  totalTextFiles: number;
  /** Size rank (1 = largest file in directory) */
  sizeRank: number;
  /** Duration rank for videos (1 = longest video) */
  durationRank?: number;
  /** Is the largest file in directory */
  isLargestFile: boolean;
  /** Is the longest video in directory */
  isLongestVideo: boolean;
  /** Percent of largest file size (0-100) */
  percentOfLargest: number;
  /** Percent of longest duration (0-100, videos only) */
  percentOfLongest?: number;
}

/**
 * Main FileFacts Interface - Combines all fact categories
 *
 * Every file gets filesystem and filename facts.
 * Additional facts are gathered based on file type:
 * - Video files: videoFacts
 * - Image files: imageFacts
 * - Text files: textFacts
 * - All files: directoryContext (computed after all files scanned)
 */
export interface FileFacts {
  /** Filesystem metadata (ALWAYS present) */
  filesystem: FilesystemFacts;
  /** Filename pattern metadata (ALWAYS present) */
  filename: FilenameFacts;
  /** Video stream metadata (video files only) */
  video?: VideoStreamFacts;
  /** Image metadata (image files only) */
  image?: ImageFacts;
  /** Text content metadata (text files only) */
  text?: TextFileFacts;
  /** Directory context metadata (computed after all files scanned) */
  context?: DirectoryContextFacts;
}

/**
 * Disc Structure Detection Results
 * Used to identify BluRay or DVD folder structures
 */
export interface DiscStructureInfo {
  /** Disc type detected */
  type: 'BDMV' | 'VIDEO_TS' | null;
  /** Detection file path (e.g., "/movies/Movie/BDMV/index.bdmv") */
  detectionFilePath?: string;
  /** Expected NFO path for disc structure */
  expectedNfoPath?: string;
  /** Root directory of disc structure */
  rootDirectory?: string;
  /** Use short name format for images (no movie prefix) */
  useShortNameFormat: boolean;
}

/**
 * Legacy Directory Scan Results
 * Tracks deprecated Kodi directory structures
 */
export interface LegacyDirectoryInfo {
  /** Path to extrafanarts directory if found */
  extrafanartsPath?: string;
  /** Files found in extrafanarts */
  extrafanartsFiles?: string[];
  /** Path to extrathumbs directory if found */
  extrathumbsPath?: string;
  /** Files found in extrathumbs */
  extrathumbsFiles?: string[];
  /** Total legacy files found */
  totalLegacyFiles: number;
}

/**
 * Complete Directory Scan Results
 * All facts gathered for an entire directory
 */
export interface DirectoryScanFacts {
  /** Absolute path to directory being scanned */
  directoryPath: string;
  /** Disc structure information */
  discStructure: DiscStructureInfo;
  /** Legacy directory information */
  legacyDirectories: LegacyDirectoryInfo;
  /** All file facts gathered */
  files: FileFacts[];
  /** Timestamp when scan started */
  scanStartedAt: Date;
  /** Timestamp when scan completed */
  scanCompletedAt?: Date;
  /** Total processing time in milliseconds */
  processingTimeMs?: number;
}
