/**
 * TrailerDownloadService
 *
 * Wraps youtube-dl-exec (yt-dlp) for downloading movie trailers from YouTube and other video providers.
 * Provides high-level methods for getting video info, validating URLs, and downloading with format selection.
 *
 * Key Features:
 * - Video metadata extraction without downloading (--dump-json)
 * - Format selection based on max resolution
 * - Rate limiting and error detection (403/429 errors)
 * - Cookie file support for YouTube authentication
 * - Differentiation between "video unavailable" and "rate limited" failures
 *
 * @see docs/architecture/TRAILER_SYSTEM.md
 */

import youtubedl from 'youtube-dl-exec';
import { logger } from '../../middleware/logging.js';
import { getErrorMessage, getErrorCode } from '../../utils/errorHandling.js';
import fs from 'fs-extra';
import * as path from 'path';

/**
 * Video format information from yt-dlp
 */
export interface VideoFormat {
  /** Format ID (e.g., "137", "22") */
  formatId: string;
  /** File extension (e.g., "mp4", "webm") */
  ext: string;
  /** Video width in pixels */
  width?: number;
  /** Video height in pixels */
  height?: number;
  /** File size in bytes */
  filesize?: number;
  /** Video codec (e.g., "avc1", "vp9") */
  vcodec?: string;
  /** Audio codec (e.g., "mp4a", "opus") */
  acodec?: string;
}

/**
 * Complete video information from yt-dlp --dump-json
 */
export interface VideoInfo {
  /** Video ID from provider */
  id: string;
  /** Video title */
  title: string;
  /** Duration in seconds */
  duration: number;
  /** Thumbnail URL */
  thumbnail: string;
  /** Available formats */
  formats: VideoFormat[];
  /** Best available width */
  bestWidth: number;
  /** Best available height */
  bestHeight: number;
  /** Estimated file size in bytes */
  estimatedSize: number;
}

/**
 * Download operation result
 * Success case returns file path and size
 * Failure case returns error type and message
 */
export type DownloadResult =
  | { success: true; filePath: string; fileSize: number }
  | { success: false; error: 'removed' | 'rate_limited' | 'download_error'; message: string };

/**
 * Service options for TrailerDownloadService
 */
export interface TrailerDownloadServiceOptions {
  /** Optional path to cookies file for YouTube authentication */
  cookieFilePath?: string;
}

/**
 * TrailerDownloadService wraps yt-dlp for trailer downloads
 */
export class TrailerDownloadService {
  private readonly cookieFilePath?: string;

  /**
   * Create a new TrailerDownloadService
   * @param options - Service configuration options
   */
  constructor(options: TrailerDownloadServiceOptions = {}) {
    if (options.cookieFilePath !== undefined) {
      this.cookieFilePath = options.cookieFilePath;
    }
  }

  /**
   * Validate if a URL is supported by yt-dlp
   *
   * Tests the URL by attempting to extract info without downloading.
   * This is a quick check to see if yt-dlp recognizes the URL format.
   *
   * @param url - Video URL to validate
   * @returns True if URL is valid for yt-dlp
   */
  async validateUrl(url: string): Promise<boolean> {
    try {
      // Use --get-id to test URL without downloading
      await youtubedl(url, {
        getId: true,
        skipDownload: true,
        noWarnings: true,
        quiet: true,
      });
      return true;
    } catch (error) {
      logger.debug('URL validation failed', { url, error: getErrorMessage(error) });
      return false;
    }
  }

  /**
   * Get video metadata without downloading
   *
   * Uses yt-dlp's --dump-json to extract comprehensive video information
   * including available formats, duration, title, and thumbnails.
   *
   * @param url - Video URL to fetch metadata for
   * @returns Video information or null if unavailable
   * @throws Error if yt-dlp execution fails
   */
  async getVideoInfo(url: string): Promise<VideoInfo | null> {
    try {
      logger.debug('Fetching video info', { url });

      const args: Record<string, unknown> = {
        dumpSingleJson: true,
        skipDownload: true,
        noWarnings: true,
        quiet: true,
      };

      // Add cookie file if configured
      if (this.cookieFilePath && await fs.pathExists(this.cookieFilePath)) {
        args.cookies = this.cookieFilePath;
      }

      // Execute yt-dlp with --dump-json
      const info = await youtubedl(url, args);

      // yt-dlp returns JSON object when using dumpSingleJson
      if (!info || typeof info !== 'object') {
        logger.warn('No video info returned', { url });
        return null;
      }

      // Extract format information
      const formats: VideoFormat[] = [];
      if (Array.isArray(info.formats)) {
        for (const format of info.formats) {
          const videoFormat: VideoFormat = {
            formatId: String(format.format_id || ''),
            ext: String(format.ext || 'mp4'),
          };

          // Only add optional properties if they exist
          if (format.width) videoFormat.width = Number(format.width);
          if (format.height) videoFormat.height = Number(format.height);
          if (format.filesize) videoFormat.filesize = Number(format.filesize);
          if (format.vcodec) videoFormat.vcodec = String(format.vcodec);
          if (format.acodec) videoFormat.acodec = String(format.acodec);

          formats.push(videoFormat);
        }
      }

      // Find best resolution
      let bestWidth = 0;
      let bestHeight = 0;
      let estimatedSize = 0;

      for (const format of formats) {
        if (format.width && format.height) {
          const resolution = format.width * format.height;
          const bestResolution = bestWidth * bestHeight;

          if (resolution > bestResolution) {
            bestWidth = format.width;
            bestHeight = format.height;
            if (format.filesize) {
              estimatedSize = format.filesize;
            }
          }
        }
      }

      return {
        id: String(info.id || ''),
        title: String(info.title || 'Unknown'),
        duration: Number(info.duration || 0),
        thumbnail: String(info.thumbnail || ''),
        formats,
        bestWidth,
        bestHeight,
        estimatedSize,
      };
    } catch (error) {
      // Check for common error conditions
      const errorMsg = getErrorMessage(error);
      const errorCode = getErrorCode(error);

      // Video removed/unavailable
      if (
        errorMsg.includes('Video unavailable') ||
        errorMsg.includes('This video is not available') ||
        errorMsg.includes('Private video') ||
        errorMsg.includes('has been removed')
      ) {
        logger.info('Video is unavailable or removed', { url, error: errorMsg });
        return null;
      }

      // Rate limiting
      if (
        errorMsg.includes('429') ||
        errorMsg.includes('Too Many Requests') ||
        errorMsg.includes('rate limit')
      ) {
        logger.warn('Rate limited while fetching video info', { url, error: errorMsg });
        throw new Error('Rate limited');
      }

      // Other errors
      logger.error('Failed to get video info', { url, error: errorMsg, code: errorCode });
      throw error;
    }
  }

  /**
   * Download video with format selection
   *
   * Downloads video from URL, selecting the best format that doesn't exceed maxResolution.
   * Uses yt-dlp's format selection to prefer mp4 containers with h264 video codec.
   *
   * Format selection strategy:
   * 1. Prefer height <= maxResolution
   * 2. Prefer mp4 container
   * 3. Prefer h264 video codec
   * 4. Select best available format matching criteria
   *
   * @param url - Video URL to download
   * @param outputPath - Full path where video should be saved (including filename)
   * @param maxResolution - Maximum video height in pixels (e.g., 1080 for 1080p)
   * @returns Download result with success status and details
   */
  async downloadVideo(
    url: string,
    outputPath: string,
    maxResolution: number
  ): Promise<DownloadResult> {
    try {
      logger.info('Starting video download', { url, outputPath, maxResolution });

      // Ensure output directory exists
      const outputDir = path.dirname(outputPath);
      await fs.ensureDir(outputDir);

      // Build format selector
      // Format: "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best"
      const formatSelector = [
        // Try to get separate video+audio with max resolution
        `bestvideo[height<=${maxResolution}][ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]`,
        // Try to get separate video+audio with max resolution (any codec)
        `bestvideo[height<=${maxResolution}]+bestaudio`,
        // Try to get combined format with max resolution
        `best[height<=${maxResolution}][ext=mp4]`,
        // Fallback to best available
        'best',
      ].join('/');

      const args: Record<string, unknown> = {
        format: formatSelector,
        output: outputPath,
        noWarnings: true,
        quiet: true,
        noPlaylist: true,
        // Merge formats into single file
        mergeOutputFormat: 'mp4',
      };

      // Add cookie file if configured
      if (this.cookieFilePath && await fs.pathExists(this.cookieFilePath)) {
        args.cookies = this.cookieFilePath;
        logger.debug('Using cookie file for authentication', { cookieFilePath: this.cookieFilePath });
      }

      // Execute download
      await youtubedl(url, args);

      // Verify file was created
      if (!await fs.pathExists(outputPath)) {
        logger.error('Download completed but file not found', { url, outputPath });
        return {
          success: false,
          error: 'download_error',
          message: 'Download completed but file not found',
        };
      }

      // Get file size
      const stats = await fs.stat(outputPath);
      const fileSize = stats.size;

      logger.info('Video download successful', {
        url,
        outputPath,
        fileSize,
        fileSizeMB: (fileSize / 1024 / 1024).toFixed(2),
      });

      return {
        success: true,
        filePath: outputPath,
        fileSize,
      };
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      const errorCode = getErrorCode(error);

      logger.error('Video download failed', {
        url,
        outputPath,
        error: errorMsg,
        code: errorCode,
      });

      // Cleanup partial download if it exists
      try {
        if (await fs.pathExists(outputPath)) {
          await fs.remove(outputPath);
          logger.debug('Cleaned up partial download', { outputPath });
        }
      } catch (cleanupError) {
        logger.warn('Failed to cleanup partial download', {
          outputPath,
          error: getErrorMessage(cleanupError),
        });
      }

      // Detect error type
      // Video removed/unavailable
      if (
        errorMsg.includes('Video unavailable') ||
        errorMsg.includes('This video is not available') ||
        errorMsg.includes('Private video') ||
        errorMsg.includes('has been removed') ||
        errorMsg.includes('This video is private') ||
        errorMsg.includes('This live event will begin')
      ) {
        return {
          success: false,
          error: 'removed',
          message: 'Video is unavailable or has been removed',
        };
      }

      // Rate limiting (403, 429)
      if (
        errorMsg.includes('HTTP Error 429') ||
        errorMsg.includes('HTTP Error 403') ||
        errorMsg.includes('Too Many Requests') ||
        errorMsg.includes('rate limit') ||
        errorMsg.includes('Sign in to confirm')
      ) {
        return {
          success: false,
          error: 'rate_limited',
          message: 'Rate limited by video provider',
        };
      }

      // Generic download error
      return {
        success: false,
        error: 'download_error',
        message: errorMsg,
      };
    }
  }

  /**
   * Check if cookie file is configured and exists
   * @returns True if cookie file is available
   */
  async hasCookieFile(): Promise<boolean> {
    if (!this.cookieFilePath) return false;
    return await fs.pathExists(this.cookieFilePath);
  }

  /**
   * Get the configured cookie file path
   * @returns Cookie file path or undefined
   */
  getCookieFilePath(): string | undefined {
    return this.cookieFilePath;
  }
}
