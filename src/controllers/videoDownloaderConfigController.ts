import { Request, Response } from 'express';
import { VideoDownloaderConfigService } from '../services/trailers/VideoDownloaderConfigService.js';
import { logger } from '../middleware/logging.js';
import { getErrorMessage } from '../utils/errorHandling.js';
import { ValidationError } from '../errors/index.js';

/**
 * Video Downloader Configuration Controller
 *
 * Handles HTTP requests for YouTube cookie management and yt-dlp configuration.
 * Provides endpoints for storing, validating, and clearing YouTube cookies
 * used for trailer downloads.
 */
export class VideoDownloaderConfigController {
  constructor(private configService: VideoDownloaderConfigService) {}

  /**
   * GET /api/settings/video-downloader
   * Get current configuration status
   *
   * Returns the current status of YouTube cookies:
   * - unconfigured: No cookies stored
   * - valid: Cookies validated and working
   * - expired: Cookies exist but failed validation
   * - error: Configuration error occurred
   */
  getStatus = async (_req: Request, res: Response): Promise<void> => {
    try {
      const status = await this.configService.getStatus();

      if (!status) {
        // No configuration exists yet
        res.json({
          status: 'unconfigured',
          statusMessage: 'No YouTube cookies configured',
          lastValidatedAt: null,
          createdAt: null,
          updatedAt: null
        });
        return;
      }

      // Return status without exposing cookie data
      res.json({
        status: status.status,
        statusMessage: status.statusMessage,
        lastValidatedAt: status.lastValidatedAt,
        createdAt: status.createdAt,
        updatedAt: status.updatedAt
      });
    } catch (error) {
      logger.error('Error fetching video downloader status:', error);
      res.status(500).json({
        error: 'Failed to fetch video downloader status',
        message: getErrorMessage(error)
      });
    }
  };

  /**
   * POST /api/settings/video-downloader/cookies
   * Store YouTube cookies
   *
   * Body: { cookies: string } (Netscape format cookie text)
   *
   * Validates and stores YouTube cookies for use with yt-dlp.
   * Cookies should be in Netscape format exported from browser.
   */
  setCookies = async (req: Request, res: Response): Promise<void> => {
    try {
      const { cookies } = req.body;

      // Validate request body
      if (!cookies || typeof cookies !== 'string') {
        res.status(400).json({
          error: 'Invalid request',
          message: 'cookies field is required and must be a string'
        });
        return;
      }

      if (cookies.trim().length === 0) {
        res.status(400).json({
          error: 'Invalid request',
          message: 'cookies field cannot be empty'
        });
        return;
      }

      // Store cookies (validation happens in service)
      await this.configService.setCookies(cookies);

      // Get updated status
      const status = await this.configService.getStatus();

      logger.info('YouTube cookies updated', {
        controller: 'VideoDownloaderConfigController'
      });

      res.json({
        success: true,
        message: 'Cookies stored successfully',
        status: status?.status || 'valid',
        statusMessage: status?.statusMessage || 'Cookies updated successfully'
      });
    } catch (error) {
      if (error instanceof ValidationError) {
        logger.warn('Invalid cookie format provided:', error);
        res.status(400).json({
          error: 'Invalid cookie format',
          message: getErrorMessage(error)
        });
        return;
      }

      logger.error('Error storing YouTube cookies:', error);
      res.status(500).json({
        error: 'Failed to store cookies',
        message: getErrorMessage(error)
      });
    }
  };

  /**
   * DELETE /api/settings/video-downloader/cookies
   * Clear stored cookies
   *
   * Removes all stored YouTube cookies from the system.
   */
  clearCookies = async (_req: Request, res: Response): Promise<void> => {
    try {
      await this.configService.clearCookies();

      logger.info('YouTube cookies cleared', {
        controller: 'VideoDownloaderConfigController'
      });

      res.json({
        success: true,
        message: 'Cookies cleared successfully',
        status: 'unconfigured',
        statusMessage: 'No cookies configured'
      });
    } catch (error) {
      logger.error('Error clearing YouTube cookies:', error);
      res.status(500).json({
        error: 'Failed to clear cookies',
        message: getErrorMessage(error)
      });
    }
  };

  /**
   * POST /api/settings/video-downloader/validate
   * Validate stored cookies
   *
   * Tests the current cookies by attempting to fetch video info from YouTube
   * using yt-dlp. Updates the status in the database based on the result.
   *
   * Optional body: { testUrl?: string }
   */
  validateCookies = async (req: Request, res: Response): Promise<void> => {
    try {
      const { testUrl } = req.body || {};

      // Validate testUrl if provided
      if (testUrl && typeof testUrl !== 'string') {
        res.status(400).json({
          error: 'Invalid request',
          message: 'testUrl must be a string'
        });
        return;
      }

      // Validate URL format if provided
      if (testUrl) {
        try {
          new URL(testUrl);
        } catch {
          res.status(400).json({
            error: 'Invalid request',
            message: 'testUrl must be a valid URL'
          });
          return;
        }
      }

      // Perform validation
      const result = await this.configService.validateCookies(testUrl);

      logger.info('Cookie validation completed', {
        controller: 'VideoDownloaderConfigController',
        valid: result.valid
      });

      res.json({
        valid: result.valid,
        message: result.message
      });
    } catch (error) {
      logger.error('Error validating YouTube cookies:', error);
      res.status(500).json({
        error: 'Failed to validate cookies',
        message: getErrorMessage(error)
      });
    }
  };
}
