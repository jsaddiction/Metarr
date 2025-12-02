import { DatabaseManager } from '../../database/DatabaseManager.js';
import { logger } from '../../middleware/logging.js';
import { DatabaseError, ValidationError } from '../../errors/index.js';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { randomBytes } from 'crypto';

/**
 * Video Downloader Configuration Service
 *
 * Manages YouTube cookies and yt-dlp configuration for trailer downloads.
 * Stores cookies encrypted in the database and provides temporary file
 * management for yt-dlp cookie authentication.
 */

export type DownloaderStatus = 'unconfigured' | 'valid' | 'expired' | 'error';

export interface VideoDownloaderConfig {
  id: number;
  configType: string;
  configData: string | null;
  status: DownloaderStatus;
  statusMessage: string | null;
  lastValidatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class VideoDownloaderConfigService {
  private readonly CONFIG_TYPE = 'youtube_cookies';
  private tempFiles: Set<string> = new Set();

  constructor(private readonly dbManager: DatabaseManager) {}

  /**
   * Get stored YouTube cookies (decrypted)
   * Returns null if no cookies are configured
   */
  async getCookies(): Promise<string | null> {
    try {
      const db = this.dbManager.getConnection();
      const rows = await db.query<{
        config_data: string | null;
      }>(
        'SELECT config_data FROM video_downloader_config WHERE config_type = ?',
        [this.CONFIG_TYPE]
      );

      if (rows.length === 0 || !rows[0].config_data) {
        return null;
      }

      // Decrypt cookies (base64 for now as placeholder)
      return this.decrypt(rows[0].config_data);
    } catch (error) {
      logger.error('[VideoDownloaderConfigService] Failed to get cookies', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new DatabaseError(
        'Failed to retrieve YouTube cookies',
        undefined,
        true,
        {
          service: 'VideoDownloaderConfigService',
          operation: 'getCookies',
          metadata: { error },
        }
      );
    }
  }

  /**
   * Store YouTube cookies (encrypted)
   * @param cookieText - Netscape format cookie text
   */
  async setCookies(cookieText: string): Promise<void> {
    // Validate cookie format
    if (!this.isValidNetscapeCookies(cookieText)) {
      throw new ValidationError(
        'Invalid cookie format. Expected Netscape format cookie file content.',
        {
          service: 'VideoDownloaderConfigService',
          operation: 'setCookies',
          metadata: {
            field: 'cookieText',
            constraint: 'Must be valid Netscape format',
          },
        }
      );
    }

    try {
      const db = this.dbManager.getConnection();
      const encrypted = this.encrypt(cookieText);

      // Upsert configuration
      await db.execute(
        `INSERT INTO video_downloader_config (
          config_type,
          config_data,
          status,
          status_message,
          updated_at
        ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(config_type) DO UPDATE SET
          config_data = excluded.config_data,
          status = excluded.status,
          status_message = excluded.status_message,
          updated_at = CURRENT_TIMESTAMP`,
        [this.CONFIG_TYPE, encrypted, 'valid', 'Cookies updated successfully']
      );

      logger.info('[VideoDownloaderConfigService] YouTube cookies updated');
    } catch (error) {
      logger.error('[VideoDownloaderConfigService] Failed to set cookies', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new DatabaseError(
        'Failed to store YouTube cookies',
        undefined,
        true,
        {
          service: 'VideoDownloaderConfigService',
          operation: 'setCookies',
          metadata: { error },
        }
      );
    }
  }

  /**
   * Clear stored cookies
   */
  async clearCookies(): Promise<void> {
    try {
      const db = this.dbManager.getConnection();
      await db.execute(
        'DELETE FROM video_downloader_config WHERE config_type = ?',
        [this.CONFIG_TYPE]
      );

      logger.info('[VideoDownloaderConfigService] YouTube cookies cleared');
    } catch (error) {
      logger.error('[VideoDownloaderConfigService] Failed to clear cookies', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new DatabaseError(
        'Failed to clear YouTube cookies',
        undefined,
        true,
        {
          service: 'VideoDownloaderConfigService',
          operation: 'clearCookies',
          metadata: { error },
        }
      );
    }
  }

  /**
   * Get current configuration status
   * Returns full configuration record including status
   */
  async getStatus(): Promise<VideoDownloaderConfig | null> {
    try {
      const db = this.dbManager.getConnection();
      const rows = await db.query<{
        id: number;
        config_type: string;
        config_data: string | null;
        status: string;
        status_message: string | null;
        last_validated_at: string | null;
        created_at: string;
        updated_at: string;
      }>(
        'SELECT * FROM video_downloader_config WHERE config_type = ?',
        [this.CONFIG_TYPE]
      );

      if (rows.length === 0) {
        return null;
      }

      return this.mapRowToConfig(rows[0]);
    } catch (error) {
      logger.error('[VideoDownloaderConfigService] Failed to get status', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new DatabaseError(
        'Failed to retrieve configuration status',
        undefined,
        true,
        {
          service: 'VideoDownloaderConfigService',
          operation: 'getStatus',
          metadata: { error },
        }
      );
    }
  }

  /**
   * Validate cookies by attempting a yt-dlp info fetch
   * Updates status in database based on validation result
   * @param testUrl - Optional YouTube URL to test (defaults to a known working video)
   */
  async validateCookies(testUrl?: string): Promise<{
    valid: boolean;
    message: string;
  }> {
    const cookies = await this.getCookies();
    if (!cookies) {
      await this.updateStatus('unconfigured', 'No cookies configured');
      return { valid: false, message: 'No cookies configured' };
    }

    let tempFile: string | null = null;

    try {
      // Write cookies to temp file
      tempFile = await this.writeCookiesToTempFile(cookies);

      // Test URL - use a known stable video or provided URL
      const url = testUrl || 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

      // Attempt to fetch video info using yt-dlp
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // Run yt-dlp with cookies to test authentication
      const { stdout } = await execAsync(
        `yt-dlp --cookies "${tempFile}" --skip-download --get-title "${url}"`,
        {
          timeout: 30000, // 30 second timeout
        }
      );

      if (stdout && stdout.trim()) {
        await this.updateStatus('valid', 'Cookies validated successfully');
        logger.info('[VideoDownloaderConfigService] Cookie validation successful');
        return { valid: true, message: 'Cookies validated successfully' };
      } else {
        throw new Error('No output from yt-dlp validation');
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Check for specific error types
      if (
        errorMessage.includes('HTTP Error 401') ||
        errorMessage.includes('HTTP Error 403')
      ) {
        await this.updateStatus('expired', 'Cookies expired or invalid');
        logger.warn('[VideoDownloaderConfigService] Cookie validation failed: expired');
        return { valid: false, message: 'Cookies expired or invalid' };
      } else if (errorMessage.includes('yt-dlp: not found')) {
        await this.updateStatus('error', 'yt-dlp binary not found');
        logger.error('[VideoDownloaderConfigService] yt-dlp binary not found');
        return { valid: false, message: 'yt-dlp binary not found on system' };
      } else {
        await this.updateStatus('error', `Validation failed: ${errorMessage}`);
        logger.error('[VideoDownloaderConfigService] Cookie validation error', {
          error: errorMessage,
        });
        return { valid: false, message: `Validation error: ${errorMessage}` };
      }
    } finally {
      // Clean up temp file
      if (tempFile) {
        await this.cleanupTempFile(tempFile);
      }
    }
  }

  /**
   * Write cookies to a temporary file for yt-dlp --cookies flag
   * Returns the path to the temporary file
   */
  async writeCookiesToTempFile(cookieText?: string): Promise<string> {
    const cookies = cookieText || (await this.getCookies());
    if (!cookies) {
      throw new ValidationError('No cookies available to write to file', {
        service: 'VideoDownloaderConfigService',
        operation: 'writeCookiesToTempFile',
        metadata: {
          constraint: 'Cookies must be configured',
        },
      });
    }

    try {
      // Generate unique filename
      const randomSuffix = randomBytes(8).toString('hex');
      const tempDir = os.tmpdir();
      const tempFile = path.join(tempDir, `metarr-cookies-${randomSuffix}.txt`);

      // Write cookies to file
      await fs.writeFile(tempFile, cookies, 'utf8');

      // Track temp file for cleanup
      this.tempFiles.add(tempFile);

      logger.debug('[VideoDownloaderConfigService] Cookies written to temp file', {
        path: tempFile,
      });

      return tempFile;
    } catch (error) {
      logger.error('[VideoDownloaderConfigService] Failed to write cookies to temp file', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new DatabaseError(
        'Failed to write cookies to temporary file',
        undefined,
        false,
        {
          service: 'VideoDownloaderConfigService',
          operation: 'writeCookiesToTempFile',
          metadata: { error },
        }
      );
    }
  }

  /**
   * Clean up a temporary cookie file
   * @param filePath - Path to the temporary file to remove
   */
  async cleanupTempFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
      this.tempFiles.delete(filePath);

      logger.debug('[VideoDownloaderConfigService] Temp file cleaned up', {
        path: filePath,
      });
    } catch (error) {
      // Non-critical error, just log it
      logger.warn('[VideoDownloaderConfigService] Failed to cleanup temp file', {
        path: filePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Clean up all tracked temporary files
   * Called on service shutdown
   */
  async cleanupAllTempFiles(): Promise<void> {
    const files = Array.from(this.tempFiles);
    await Promise.all(files.map((file) => this.cleanupTempFile(file)));
    logger.info('[VideoDownloaderConfigService] All temp files cleaned up', {
      count: files.length,
    });
  }

  // ============================================
  // PRIVATE HELPER METHODS
  // ============================================

  /**
   * Update status in database
   */
  private async updateStatus(
    status: DownloaderStatus,
    message: string
  ): Promise<void> {
    try {
      const db = this.dbManager.getConnection();
      await db.execute(
        `UPDATE video_downloader_config
         SET status = ?,
             status_message = ?,
             last_validated_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE config_type = ?`,
        [status, message, this.CONFIG_TYPE]
      );
    } catch (error) {
      logger.error('[VideoDownloaderConfigService] Failed to update status', {
        status,
        message,
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw - status update is not critical
    }
  }

  /**
   * Validate Netscape cookie format
   * Basic validation - checks for required header and structure
   */
  private isValidNetscapeCookies(text: string): boolean {
    if (!text || text.trim().length === 0) {
      return false;
    }

    // Netscape format should have the header comment
    const hasNetscapeHeader = text.includes('# Netscape HTTP Cookie File');

    // Should have at least one cookie line (tab-separated values)
    const lines = text.split('\n').filter((line) => {
      line = line.trim();
      return line && !line.startsWith('#');
    });

    const hasCookies = lines.length > 0;
    const hasValidStructure = lines.some((line) => {
      const parts = line.split('\t');
      // Netscape format has 7 tab-separated fields
      return parts.length === 7;
    });

    return hasNetscapeHeader && hasCookies && hasValidStructure;
  }

  /**
   * Encrypt cookie text
   * Currently uses base64 encoding as placeholder for proper encryption
   * TODO: Implement proper encryption using app secret
   */
  private encrypt(text: string): string {
    return Buffer.from(text, 'utf8').toString('base64');
  }

  /**
   * Decrypt cookie text
   * Currently uses base64 decoding as placeholder for proper decryption
   * TODO: Implement proper decryption using app secret
   */
  private decrypt(encrypted: string): string {
    return Buffer.from(encrypted, 'base64').toString('utf8');
  }

  /**
   * Map database row to VideoDownloaderConfig
   */
  private mapRowToConfig(row: {
    id: number;
    config_type: string;
    config_data: string | null;
    status: string;
    status_message: string | null;
    last_validated_at: string | null;
    created_at: string;
    updated_at: string;
  }): VideoDownloaderConfig {
    return {
      id: row.id,
      configType: row.config_type,
      configData: row.config_data,
      status: row.status as DownloaderStatus,
      statusMessage: row.status_message,
      lastValidatedAt: row.last_validated_at
        ? new Date(row.last_validated_at)
        : null,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
