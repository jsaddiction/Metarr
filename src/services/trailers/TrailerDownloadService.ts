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
 *
 * Error types:
 * - 'unavailable': Video confirmed gone via oEmbed - permanent, never retry automatically
 * - 'rate_limited': Provider rate limit - transient, retry on next enrichment cycle
 * - 'download_error': Network/unknown issue (video still exists) - transient, retry on next enrichment cycle
 */
export type DownloadResult =
  | { success: true; filePath: string; fileSize: number }
  | { success: false; error: 'unavailable' | 'rate_limited' | 'download_error'; message: string };

/**
 * Simulate download result
 * Tests if a video can be downloaded without actually downloading it
 */
export type SimulateResult =
  | { success: true }
  | { success: false; error: 'unavailable' | 'rate_limited' | 'region_blocked' | 'format_error'; message: string };

/**
 * Download progress callback
 * Called periodically during download with progress information
 */
export interface DownloadProgress {
  /** Percentage complete (0-100) */
  percentage: number;
  /** Bytes downloaded so far */
  downloadedBytes: number;
  /** Total bytes (may be 0 if unknown) */
  totalBytes: number;
  /** Download speed (e.g., "2.5MiB/s") */
  speed: string;
  /** Estimated time remaining in seconds */
  eta: number;
}

export type DownloadProgressCallback = (progress: DownloadProgress) => void;

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
   * Error handling with immediate verification:
   * - If download fails, we verify via oEmbed to determine if permanent or transient
   * - 'unavailable': Video confirmed gone via oEmbed - permanent failure
   * - 'rate_limited': Provider rate limit detected - transient, retry later
   * - 'download_error': Other failure, video still exists - transient, retry later
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

      // Rate limiting (403, 429) - detected by yt-dlp error message
      // This is transient, retry later
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

      // For all other errors, verify via oEmbed to determine if permanent or transient
      // This proactive check tells us immediately WHY it failed
      const verifyResult = await this.verifyVideoExists(url);

      if (verifyResult === 'not_found') {
        // Video confirmed unavailable via oEmbed - permanent failure
        logger.info('Video confirmed unavailable via oEmbed after download failure', { url });
        return {
          success: false,
          error: 'unavailable',
          message: 'Video is unavailable or has been removed',
        };
      }

      // Video still exists (or unknown) - transient failure
      // Could be network issue, yt-dlp bug, temporary server issue, etc.
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

  /**
   * Extract YouTube video ID from URL
   *
   * Handles various YouTube URL formats:
   * - https://www.youtube.com/watch?v=VIDEO_ID
   * - https://youtu.be/VIDEO_ID
   * - https://www.youtube.com/embed/VIDEO_ID
   *
   * @param url - YouTube URL
   * @returns Video ID or null if not a YouTube URL
   */
  extractYouTubeVideoId(url: string): string | null {
    try {
      const urlObj = new URL(url);

      // youtube.com/watch?v=VIDEO_ID
      if (urlObj.hostname.includes('youtube.com') && urlObj.pathname === '/watch') {
        return urlObj.searchParams.get('v');
      }

      // youtu.be/VIDEO_ID
      if (urlObj.hostname === 'youtu.be') {
        return urlObj.pathname.slice(1) || null;
      }

      // youtube.com/embed/VIDEO_ID
      if (urlObj.hostname.includes('youtube.com') && urlObj.pathname.startsWith('/embed/')) {
        return urlObj.pathname.replace('/embed/', '') || null;
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Extract Vimeo video ID from URL
   *
   * Handles various Vimeo URL formats:
   * - https://vimeo.com/VIDEO_ID
   * - https://player.vimeo.com/video/VIDEO_ID
   * - https://vimeo.com/channels/CHANNEL/VIDEO_ID
   * - https://vimeo.com/groups/GROUP/videos/VIDEO_ID
   *
   * @param url - Vimeo URL
   * @returns Video ID or null if not a Vimeo URL
   */
  extractVimeoVideoId(url: string): string | null {
    try {
      const urlObj = new URL(url);

      // Must be a Vimeo domain
      if (!urlObj.hostname.includes('vimeo.com')) {
        return null;
      }

      // player.vimeo.com/video/VIDEO_ID
      if (urlObj.hostname === 'player.vimeo.com' && urlObj.pathname.startsWith('/video/')) {
        return urlObj.pathname.replace('/video/', '').split('/')[0] || null;
      }

      // vimeo.com/VIDEO_ID (direct video URL)
      // vimeo.com/channels/CHANNEL/VIDEO_ID
      // vimeo.com/groups/GROUP/videos/VIDEO_ID
      const pathParts = urlObj.pathname.split('/').filter(Boolean);

      // Look for numeric video ID in path
      for (let i = pathParts.length - 1; i >= 0; i--) {
        if (/^\d+$/.test(pathParts[i])) {
          return pathParts[i];
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Detect provider from URL
   *
   * @param url - Video URL
   * @returns 'youtube' | 'vimeo' | 'unknown'
   */
  detectProvider(url: string): 'youtube' | 'vimeo' | 'unknown' {
    if (this.extractYouTubeVideoId(url)) {
      return 'youtube';
    }
    if (this.extractVimeoVideoId(url)) {
      return 'vimeo';
    }
    return 'unknown';
  }

  /**
   * Verify if a video exists using the provider's oEmbed API
   *
   * Supports YouTube and Vimeo. Both providers return:
   * - 200 for existing, embeddable videos
   * - 404/401 for unavailable, private, or deleted videos
   *
   * This is a lightweight check (HEAD request) that doesn't require authentication.
   * Used to:
   * 1. Pre-verify candidates during analysis phase (proactive)
   * 2. Confirm unavailability when download fails (reactive)
   *
   * @param url - Video URL to verify
   * @returns 'exists' | 'not_found' | 'unknown'
   *   - 'exists': Video confirmed to exist (oEmbed 200)
   *   - 'not_found': Video confirmed gone (oEmbed 404/401)
   *   - 'unknown': Couldn't determine (network error, unsupported provider, etc.)
   */
  async verifyVideoExists(url: string): Promise<'exists' | 'not_found' | 'unknown'> {
    const provider = this.detectProvider(url);

    let oEmbedUrl: string;
    let videoId: string | null;

    if (provider === 'youtube') {
      videoId = this.extractYouTubeVideoId(url);
      if (!videoId) return 'unknown';
      oEmbedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    } else if (provider === 'vimeo') {
      videoId = this.extractVimeoVideoId(url);
      if (!videoId) return 'unknown';
      oEmbedUrl = `https://vimeo.com/api/oembed.json?url=https://vimeo.com/${videoId}`;
    } else {
      // Unsupported provider - can't verify via oEmbed
      logger.debug('Cannot verify URL via oEmbed - unsupported provider', { url });
      return 'unknown';
    }

    try {
      const response = await fetch(oEmbedUrl, {
        method: 'HEAD', // Just check status, don't need body
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (response.ok) {
        logger.debug('Video verified to exist via oEmbed', { provider, videoId, status: response.status });
        return 'exists';
      }

      if (response.status === 404 || response.status === 401) {
        // 404 = not found, 401 = private/unavailable
        logger.info('Video confirmed unavailable via oEmbed', { provider, videoId, status: response.status });
        return 'not_found';
      }

      // Other status codes (rate limit, server error, etc.)
      logger.warn('Unexpected oEmbed response', { provider, videoId, status: response.status });
      return 'unknown';
    } catch (error) {
      logger.warn('oEmbed verification failed', {
        provider,
        videoId,
        error: getErrorMessage(error),
      });
      return 'unknown';
    }
  }

  /**
   * Simulate a download to test if it would succeed
   *
   * Uses yt-dlp's --simulate flag to test the entire download chain without
   * actually downloading. This catches:
   * - Unavailable/deleted videos
   * - Region-blocked videos
   * - Format/codec issues
   * - Authentication requirements
   *
   * @param url - Video URL to test
   * @param maxResolution - Maximum video height in pixels
   * @returns SimulateResult indicating if download would succeed
   */
  async simulateDownload(url: string, maxResolution: number = 1080): Promise<SimulateResult> {
    try {
      logger.debug('Simulating video download', { url, maxResolution });

      // Build format selector (same as real download)
      const formatSelector = [
        `bestvideo[height<=${maxResolution}][ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]`,
        `bestvideo[height<=${maxResolution}]+bestaudio`,
        `best[height<=${maxResolution}][ext=mp4]`,
        'best',
      ].join('/');

      const args: Record<string, unknown> = {
        format: formatSelector,
        simulate: true, // Key flag - don't actually download
        noWarnings: true,
        quiet: true,
        noPlaylist: true,
      };

      // Add cookie file if configured
      if (this.cookieFilePath && await fs.pathExists(this.cookieFilePath)) {
        args.cookies = this.cookieFilePath;
      }

      // Execute simulation
      await youtubedl(url, args);

      logger.debug('Download simulation successful', { url });
      return { success: true };
    } catch (error) {
      const errorMsg = getErrorMessage(error);

      logger.debug('Download simulation failed', { url, error: errorMsg });

      // Rate limiting
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

      // Video unavailable/deleted
      if (
        errorMsg.includes('Video unavailable') ||
        errorMsg.includes('This video is not available') ||
        errorMsg.includes('Private video') ||
        errorMsg.includes('has been removed') ||
        errorMsg.includes('This video has been removed')
      ) {
        return {
          success: false,
          error: 'unavailable',
          message: 'Video is unavailable or has been removed',
        };
      }

      // Region/geo-blocking
      if (
        errorMsg.includes('not available in your country') ||
        errorMsg.includes('geo') ||
        errorMsg.includes('blocked') ||
        errorMsg.includes('uploader has not made this video available')
      ) {
        return {
          success: false,
          error: 'region_blocked',
          message: 'Video is not available in your region',
        };
      }

      // Format/codec issues
      if (
        errorMsg.includes('No video formats') ||
        errorMsg.includes('Requested format is not available') ||
        errorMsg.includes('format')
      ) {
        return {
          success: false,
          error: 'format_error',
          message: 'No compatible video format available',
        };
      }

      // Default to unavailable for other errors
      // Verify with oEmbed to be sure
      const verifyResult = await this.verifyVideoExists(url);
      if (verifyResult === 'not_found') {
        return {
          success: false,
          error: 'unavailable',
          message: 'Video is unavailable or has been removed',
        };
      }

      // Unknown error but video may exist
      return {
        success: false,
        error: 'format_error',
        message: errorMsg,
      };
    }
  }

  /**
   * Download video with progress reporting
   *
   * Uses yt-dlp's subprocess interface to stream progress events.
   * Parses stdout for progress lines like:
   * [download]  45.2% of 125.00MiB at 2.50MiB/s ETA 00:23
   *
   * @param url - Video URL to download
   * @param outputPath - Full path where video should be saved
   * @param maxResolution - Maximum video height in pixels
   * @param onProgress - Callback function called with progress updates
   * @returns Download result with success status and details
   */
  async downloadVideoWithProgress(
    url: string,
    outputPath: string,
    maxResolution: number,
    onProgress?: DownloadProgressCallback
  ): Promise<DownloadResult> {
    try {
      logger.info('Starting video download with progress', { url, outputPath, maxResolution });

      // Ensure output directory exists
      const outputDir = path.dirname(outputPath);
      await fs.ensureDir(outputDir);

      // Build format selector
      const formatSelector = [
        `bestvideo[height<=${maxResolution}][ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]`,
        `bestvideo[height<=${maxResolution}]+bestaudio`,
        `best[height<=${maxResolution}][ext=mp4]`,
        'best',
      ].join('/');

      const args: Record<string, unknown> = {
        format: formatSelector,
        output: outputPath,
        noWarnings: true,
        noPlaylist: true,
        mergeOutputFormat: 'mp4',
        newline: true, // Output progress on new lines (important for parsing)
      };

      // Add cookie file if configured
      if (this.cookieFilePath && await fs.pathExists(this.cookieFilePath)) {
        args.cookies = this.cookieFilePath;
      }

      // Use exec to get subprocess for progress streaming
      const subprocess = youtubedl.exec(url, args);

      // Parse progress from stdout
      if (onProgress && subprocess.stdout) {
        subprocess.stdout.on('data', (chunk: Buffer) => {
          const lines = chunk.toString().split('\n');
          for (const line of lines) {
            const progress = this.parseProgressLine(line);
            if (progress) {
              onProgress(progress);
            }
          }
        });
      }

      // Wait for completion
      await subprocess;

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

      // Send final 100% progress
      if (onProgress) {
        onProgress({
          percentage: 100,
          downloadedBytes: fileSize,
          totalBytes: fileSize,
          speed: '0B/s',
          eta: 0,
        });
      }

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

      logger.error('Video download failed', { url, outputPath, error: errorMsg });

      // Cleanup partial download
      try {
        if (await fs.pathExists(outputPath)) {
          await fs.remove(outputPath);
        }
      } catch (cleanupError) {
        logger.warn('Failed to cleanup partial download', {
          outputPath,
          error: getErrorMessage(cleanupError),
        });
      }

      // Rate limiting
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

      // Verify via oEmbed
      const verifyResult = await this.verifyVideoExists(url);
      if (verifyResult === 'not_found') {
        return {
          success: false,
          error: 'unavailable',
          message: 'Video is unavailable or has been removed',
        };
      }

      return {
        success: false,
        error: 'download_error',
        message: errorMsg,
      };
    }
  }

  /**
   * Parse a yt-dlp progress line
   *
   * Example formats:
   * [download]  45.2% of 125.00MiB at 2.50MiB/s ETA 00:23
   * [download] 100% of 125.00MiB in 00:50 at 2.50MiB/s
   * [download] Destination: /path/to/file.mp4
   *
   * @param line - Raw stdout line from yt-dlp
   * @returns Parsed progress or null if not a progress line
   */
  private parseProgressLine(line: string): DownloadProgress | null {
    // Match: [download]  45.2% of 125.00MiB at 2.50MiB/s ETA 00:23
    const progressMatch = line.match(
      /\[download\]\s+(\d+\.?\d*)%\s+of\s+~?(\d+\.?\d*)(Ki?B|Mi?B|Gi?B|B)\s+at\s+(\d+\.?\d*)(Ki?B|Mi?B|Gi?B|B)\/s(?:\s+ETA\s+(\d+:\d+))?/i
    );

    if (progressMatch) {
      const percentage = parseFloat(progressMatch[1]);
      const totalSize = this.parseSize(progressMatch[2], progressMatch[3]);
      const speed = `${progressMatch[4]}${progressMatch[5]}/s`;
      const eta = progressMatch[6] ? this.parseEta(progressMatch[6]) : 0;
      const downloadedBytes = Math.round((percentage / 100) * totalSize);

      return {
        percentage,
        downloadedBytes,
        totalBytes: totalSize,
        speed,
        eta,
      };
    }

    return null;
  }

  /**
   * Parse size string to bytes
   * @param value - Numeric value
   * @param unit - Unit (B, KB, KiB, MB, MiB, GB, GiB)
   * @returns Size in bytes
   */
  private parseSize(value: string, unit: string): number {
    const num = parseFloat(value);
    const unitLower = unit.toLowerCase();

    if (unitLower === 'b') return num;
    if (unitLower === 'kb' || unitLower === 'kib') return num * 1024;
    if (unitLower === 'mb' || unitLower === 'mib') return num * 1024 * 1024;
    if (unitLower === 'gb' || unitLower === 'gib') return num * 1024 * 1024 * 1024;

    return num;
  }

  /**
   * Parse ETA string to seconds
   * @param eta - ETA string (e.g., "00:23" or "01:23:45")
   * @returns Seconds remaining
   */
  private parseEta(eta: string): number {
    const parts = eta.split(':').map(Number);
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
  }
}
