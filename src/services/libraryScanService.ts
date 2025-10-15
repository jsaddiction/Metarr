import { EventEmitter } from 'events';
import { DatabaseManager } from '../database/DatabaseManager.js';
import { Library, ScanJob } from '../types/models.js';
import { logger } from '../middleware/logging.js';
import { getSubdirectories } from './nfo/nfoDiscovery.js';
import { scanMovieDirectory } from './scan/unifiedScanService.js';
import { websocketBroadcaster } from './websocketBroadcaster.js';
import path from 'path';

export class LibraryScanService extends EventEmitter {
  private activeScansCancellationFlags: Map<number, boolean> = new Map();

  constructor(private dbManager: DatabaseManager) {
    super();
  }

  /**
   * Start a library scan
   * Creates a scan job and processes it asynchronously
   */
  async startScan(libraryId: number): Promise<ScanJob> {
    try {
      const db = this.dbManager.getConnection();

      // Check if library exists
      const libraryRows = await db.query<any[]>('SELECT * FROM libraries WHERE id = ?', [
        libraryId,
      ]);

      if (libraryRows.length === 0) {
        throw new Error('Library not found');
      }

      const row = libraryRows[0] as any;
      const library: Library = {
        id: row.id,
        name: row.name,
        type: row.type,
        path: row.path,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      };

      // Check for existing running scan
      const existingScans = await db.query<any[]>(
        'SELECT * FROM scan_jobs WHERE library_id = ? AND status = ?',
        [libraryId, 'running']
      );

      if (existingScans.length > 0) {
        throw new Error('A scan is already running for this library');
      }

      // Create scan job
      const result = await db.execute(
        `INSERT INTO scan_jobs (library_id, status, started_at, progress_current, progress_total, errors_count)
         VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?, ?)`,
        [libraryId, 'running', 0, 0, 0]
      );

      const scanJobId = result.insertId!;

      // Get the created scan job
      const scanJob = await this.getScanJob(scanJobId);
      if (!scanJob) {
        throw new Error('Failed to create scan job');
      }

      logger.info(`Started scan for library ${library.name}`, { libraryId, scanJobId });

      // Broadcast initial scan status via WebSocket
      websocketBroadcaster.broadcastScanStatus(
        scanJobId,
        libraryId,
        'running',
        { current: 0, total: 0 }
      );

      // Initialize cancellation flag
      this.activeScansCancellationFlags.set(scanJobId, false);

      // Process scan asynchronously
      this.processScan(scanJob, library).catch(error => {
        logger.error(`Scan process failed for library ${libraryId}`, { error: error.message });
      });

      return scanJob;
    } catch (error: any) {
      logger.error(`Failed to start scan for library ${libraryId}`, { error: error.message });
      throw new Error(`Failed to start scan: ${error.message}`);
    }
  }

  /**
   * Get scan job by ID
   */
  async getScanJob(scanJobId: number): Promise<ScanJob | null> {
    try {
      const db = this.dbManager.getConnection();
      const rows = await db.query<any[]>('SELECT * FROM scan_jobs WHERE id = ?', [scanJobId]);

      if (rows.length === 0) {
        return null;
      }

      return this.mapRowToScanJob(rows[0]);
    } catch (error: any) {
      logger.error(`Failed to get scan job ${scanJobId}`, { error: error.message });
      return null;
    }
  }

  /**
   * Get all active scan jobs
   */
  async getActiveScanJobs(): Promise<ScanJob[]> {
    try {
      const db = this.dbManager.getConnection();
      const rows = await db.query<any[]>(
        'SELECT * FROM scan_jobs WHERE status = ? ORDER BY started_at DESC',
        ['running']
      );

      return rows.map(this.mapRowToScanJob);
    } catch (error: any) {
      logger.error('Failed to get active scan jobs', { error: error.message });
      return [];
    }
  }

  /**
   * Cancel a running scan job
   */
  async cancelScan(scanJobId: number): Promise<boolean> {
    try {
      // Check if scan exists and is running
      const scanJob = await this.getScanJob(scanJobId);
      if (!scanJob) {
        logger.warn(`Cannot cancel scan: Scan job ${scanJobId} not found`);
        return false;
      }

      if (scanJob.status !== 'running') {
        logger.warn(`Cannot cancel scan: Scan job ${scanJobId} is not running (status: ${scanJob.status})`);
        return false;
      }

      // Set cancellation flag
      this.activeScansCancellationFlags.set(scanJobId, true);

      logger.info(`Cancellation requested for scan job ${scanJobId}`, {
        libraryId: scanJob.libraryId
      });

      // The actual cancellation will be handled in processScan/scanMovieLibrary
      // when they check the cancellation flag between file processing

      return true;
    } catch (error: any) {
      logger.error(`Failed to cancel scan ${scanJobId}`, { error: error.message });
      return false;
    }
  }

  /**
   * Check if a scan has been cancelled
   */
  private isScanCancelled(scanJobId: number): boolean {
    return this.activeScansCancellationFlags.get(scanJobId) === true;
  }

  /**
   * Process a library scan
   */
  private async processScan(scanJob: ScanJob, library: Library): Promise<void> {
    const db = this.dbManager.getConnection();

    try {
      logger.info(`Processing scan for ${library.name}`, {
        type: library.type,
        path: library.path,
      });

      // Execute the scan and capture statistics
      let stats = { added: 0, updated: 0, deleted: 0, failed: 0 };

      if (library.type === 'movie') {
        stats = await this.scanMovieLibrary(scanJob, library);
      } else if (library.type === 'tv') {
        await this.scanTVShowLibrary(scanJob, library);
        // TV shows don't return stats yet
      } else {
        throw new Error(`Unsupported library type: ${library.type}`);
      }

      // Check if scan was cancelled during processing
      if (this.isScanCancelled(scanJob.id)) {
        // Mark scan as cancelled
        await db.execute(
          'UPDATE scan_jobs SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?',
          ['cancelled', scanJob.id]
        );

        logger.info(`Scan cancelled for ${library.name}`, { scanJobId: scanJob.id });

        // Broadcast scan cancellation via WebSocket
        websocketBroadcaster.broadcastScanCancelled(scanJob.id, library.id);

        // Emit cancellation event
        this.emit('scanCancelled', { scanJobId: scanJob.id, libraryId: library.id });

        return;
      }

      // Mark scan as completed
      await db.execute(
        'UPDATE scan_jobs SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['completed', scanJob.id]
      );

      logger.info(`Completed scan for ${library.name}`, {
        scanJobId: scanJob.id,
        stats
      });

      // Broadcast scan completion via WebSocket with actual statistics
      websocketBroadcaster.broadcastScanCompleted(scanJob.id, library.id, stats);

      // Emit completion event
      this.emit('scanCompleted', { scanJobId: scanJob.id, libraryId: library.id, stats });
    } catch (error: any) {
      logger.error(`Scan failed for ${library.name}`, {
        error: error.message,
        scanJobId: scanJob.id,
      });

      // Mark scan as failed
      await db.execute(
        'UPDATE scan_jobs SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['failed', scanJob.id]
      );

      // Broadcast scan failure via WebSocket
      websocketBroadcaster.broadcastScanFailed(
        scanJob.id,
        library.id,
        scanJob.progressCurrent || 0,
        scanJob.progressTotal || 0,
        scanJob.errorsCount || 0
      );

      // Emit error event
      this.emit('scanFailed', {
        scanJobId: scanJob.id,
        libraryId: library.id,
        error: error.message,
      });
    } finally {
      // Clean up cancellation flag
      this.activeScansCancellationFlags.delete(scanJob.id);
    }
  }

  /**
   * Scan a movie library
   */
  private async scanMovieLibrary(scanJob: ScanJob, library: Library): Promise<{
    added: number;
    updated: number;
    deleted: number;
    failed: number;
  }> {
    const db = this.dbManager.getConnection();
    const movieDirs = await getSubdirectories(library.path);

    // Update total count
    await db.execute('UPDATE scan_jobs SET progress_total = ? WHERE id = ?', [
      movieDirs.length,
      scanJob.id,
    ]);

    this.emitProgress(scanJob.id, library.id, 0, movieDirs.length, '');

    // Statistics tracking
    let addedCount = 0;
    let updatedCount = 0;
    let totalErrors = 0;

    // Process all movie directories found on filesystem using unified scan
    for (let i = 0; i < movieDirs.length; i++) {
      // Check for cancellation before processing each directory
      if (this.isScanCancelled(scanJob.id)) {
        logger.info(`Scan cancelled, stopping directory processing`, {
          scanJobId: scanJob.id,
          processed: i,
          total: movieDirs.length
        });
        break;
      }

      const movieDir = movieDirs[i];
      const movieName = path.basename(movieDir);

      try {
        // Update progress
        await db.execute(
          'UPDATE scan_jobs SET progress_current = ?, current_file = ? WHERE id = ?',
          [i + 1, movieDir, scanJob.id]
        );

        this.emitProgress(scanJob.id, library.id, i + 1, movieDirs.length, movieDir);

        // Use unified scan service with scheduled_scan trigger
        const scanResult = await scanMovieDirectory(this.dbManager, library.id, movieDir, {
          trigger: 'scheduled_scan',
        });

        // Log result and broadcast WebSocket updates for real-time UI updates
        if (scanResult.isNewMovie && scanResult.movieId !== undefined) {
          addedCount++;
          logger.info(`Added new movie: ${movieName}`, {
            movieId: scanResult.movieId,
            assetsFound: scanResult.assetsFound,
            unknownFiles: scanResult.unknownFilesFound,
          });
          // Broadcast movie added immediately
          websocketBroadcaster.broadcastMoviesAdded([scanResult.movieId]);
        } else if (scanResult.directoryChanged && scanResult.movieId !== undefined) {
          updatedCount++;
          logger.info(`Updated movie: ${movieName}`, {
            movieId: scanResult.movieId,
            nfoRegenerated: scanResult.nfoRegenerated,
            streamsExtracted: scanResult.streamsExtracted,
            unknownFiles: scanResult.unknownFilesFound,
          });
          // Broadcast movie updated immediately
          websocketBroadcaster.broadcastMoviesUpdated([scanResult.movieId]);
        } else {
          logger.debug(`Movie unchanged: ${movieName}`, {
            movieId: scanResult.movieId,
          });
        }

        // Count errors
        if (scanResult.errors.length > 0) {
          totalErrors += scanResult.errors.length;
          logger.warn(`Scan errors for ${movieName}`, {
            errors: scanResult.errors,
          });
        }
      } catch (error: any) {
        logger.error(`Failed to scan movie directory: ${movieDir}`, { error: error.message });
        totalErrors++;
        await this.incrementErrorCount(scanJob.id);
      }
    }

    // Note: Soft delete functionality removed in clean schema
    // Movies that no longer exist on filesystem will remain in database
    // Future enhancement: Implement hard delete or status flag for missing files
    let markedForDeletionCount = 0;

    // Update final error count
    if (totalErrors > 0) {
      await db.execute('UPDATE scan_jobs SET errors_count = ? WHERE id = ?', [
        totalErrors,
        scanJob.id,
      ]);
    }

    logger.info(`Completed movie library scan`, {
      libraryId: library.id,
      scanned: movieDirs.length,
      added: addedCount,
      updated: updatedCount,
      deleted: markedForDeletionCount,
      errors: totalErrors,
    });

    return {
      added: addedCount,
      updated: updatedCount,
      deleted: markedForDeletionCount,
      failed: totalErrors,
    };
  }

  /**
   * Scan a TV show library
   * TODO: Implement TV show scanning with unified scan service
   */
  private async scanTVShowLibrary(scanJob: ScanJob, library: Library): Promise<void> {
    const db = this.dbManager.getConnection();

    logger.warn('TV show library scanning not yet implemented with unified scan service', {
      libraryId: library.id,
      scanJobId: scanJob.id,
    });

    // Mark as completed for now
    await db.execute('UPDATE scan_jobs SET progress_total = 0, progress_current = 0 WHERE id = ?', [
      scanJob.id,
    ]);

    this.emitProgress(scanJob.id, library.id, 0, 0, 'TV show scanning not yet implemented');
  }

  /**
   * Increment error count for a scan job
   */
  private async incrementErrorCount(scanJobId: number): Promise<void> {
    const db = this.dbManager.getConnection();
    await db.execute('UPDATE scan_jobs SET errors_count = errors_count + 1 WHERE id = ?', [
      scanJobId,
    ]);
  }

  /**
   * Emit progress event via EventEmitter and WebSocket
   */
  private emitProgress(
    scanJobId: number,
    libraryId: number,
    current: number,
    total: number,
    currentFile: string
  ): void {
    // Emit via EventEmitter (legacy)
    this.emit('scanProgress', {
      scanJobId,
      libraryId,
      progressCurrent: current,
      progressTotal: total,
      currentFile,
    });

    // Broadcast via WebSocket for real-time updates
    websocketBroadcaster.broadcastScanProgress(scanJobId, libraryId, current, total, currentFile);
  }

  /**
   * Map database row to ScanJob object
   */
  private mapRowToScanJob(row: any): ScanJob {
    const scanJob: ScanJob = {
      id: row.id,
      libraryId: row.library_id,
      status: row.status,
      progressCurrent: row.progress_current,
      progressTotal: row.progress_total,
      currentFile: row.current_file || undefined,
      errorsCount: row.errors_count,
      startedAt: new Date(row.started_at),
    };

    if (row.completed_at) {
      scanJob.completedAt = new Date(row.completed_at);
    }

    return scanJob;
  }
}
