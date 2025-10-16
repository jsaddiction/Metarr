import { EventEmitter } from 'events';
import { DatabaseManager } from '../database/DatabaseManager.js';
import { Library, ScanJob } from '../types/models.js';
import { logger } from '../middleware/logging.js';
import { getSubdirectories } from './nfo/nfoDiscovery.js';
import { websocketBroadcaster } from './websocketBroadcaster.js';
import { JobQueueService } from './jobQueue/JobQueueService.js';

export class LibraryScanService extends EventEmitter {
  private activeScansCancellationFlags: Map<number, boolean> = new Map();

  constructor(
    private dbManager: DatabaseManager,
    private jobQueue: JobQueueService
  ) {
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

      // Create scan job with new schema
      const result = await db.execute(
        `INSERT INTO scan_jobs (library_id, status, started_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)`,
        [libraryId, 'scanning'] // Start in 'scanning' status (we skip 'discovering' for now)
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

      if (scanJob.status === 'completed' || scanJob.status === 'failed' || scanJob.status === 'cancelled') {
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
        scanJob.directoriesScanned,
        scanJob.directoriesTotal,
        scanJob.errorsCount
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
   * Phase 1: Discovery - Find all directories and emit directory-scan jobs
   */
  private async scanMovieLibrary(scanJob: ScanJob, library: Library): Promise<{
    added: number;
    updated: number;
    deleted: number;
    failed: number;
  }> {
    const db = this.dbManager.getConnection();

    logger.info(`Phase 1: Directory Discovery started`, {
      scanJobId: scanJob.id,
      libraryPath: library.path
    });

    // Phase 1: Discover all movie directories
    const movieDirs = await getSubdirectories(library.path);

    // Update total count and mark discovery complete
    await db.execute(
      `UPDATE scan_jobs
       SET directories_total = ?,
           status = 'scanning',
           discovery_completed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [movieDirs.length, scanJob.id]
    );

    this.emitProgress(scanJob.id, library.id, 0, movieDirs.length, 'Discovery complete, queuing directory scans...');

    logger.info(`Phase 1: Discovery complete. Found ${movieDirs.length} directories`, {
      scanJobId: scanJob.id,
      directoriesFound: movieDirs.length
    });

    // Phase 2: Emit directory-scan jobs for each directory (job queue pattern)
    let queuedCount = 0;
    for (const movieDir of movieDirs) {
      // Check for cancellation before queueing
      if (this.isScanCancelled(scanJob.id)) {
        logger.info(`Scan cancelled during job queuing`, {
          scanJobId: scanJob.id,
          queued: queuedCount,
          total: movieDirs.length
        });
        break;
      }

      try {
        // Emit directory-scan job with NORMAL priority (5)
        await this.jobQueue.addJob({
          type: 'directory-scan',
          priority: 5,
          payload: {
            scanJobId: scanJob.id,
            libraryId: library.id,
            directoryPath: movieDir,
          },
          retry_count: 0,
          max_retries: 3,
        });

        queuedCount++;

        // Update queued count periodically (every 10 directories)
        if (queuedCount % 10 === 0) {
          await db.execute(
            'UPDATE scan_jobs SET directories_queued = ?, current_operation = ? WHERE id = ?',
            [queuedCount, `Queued ${queuedCount}/${movieDirs.length} directories`, scanJob.id]
          );
        }
      } catch (error: any) {
        logger.error(`Failed to queue directory-scan job for ${movieDir}`, {
          error: error.message,
          scanJobId: scanJob.id
        });
        await this.incrementErrorCount(scanJob.id);
      }
    }

    // Update final queued count
    await db.execute(
      'UPDATE scan_jobs SET directories_queued = ?, current_operation = ? WHERE id = ?',
      [queuedCount, `All ${queuedCount} directories queued for scanning`, scanJob.id]
    );

    logger.info(`Phase 2: Directory scan jobs queued`, {
      scanJobId: scanJob.id,
      queuedJobs: queuedCount,
      totalDirectories: movieDirs.length
    });

    this.emitProgress(
      scanJob.id,
      library.id,
      0,
      queuedCount,
      `${queuedCount} directory scan jobs queued`
    );

    // Return placeholder stats (actual stats will be calculated by job handlers)
    // The scan_jobs table will track real-time progress as jobs complete
    return {
      added: 0,
      updated: 0,
      deleted: 0,
      failed: 0,
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
    await db.execute('UPDATE scan_jobs SET directories_total = 0, directories_scanned = 0 WHERE id = ?', [
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

      // Phase 1: Directory Discovery
      directoriesTotal: row.directories_total || 0,
      directoriesQueued: row.directories_queued || 0,

      // Phase 2: Directory Scanning
      directoriesScanned: row.directories_scanned || 0,
      moviesFound: row.movies_found || 0,
      moviesNew: row.movies_new || 0,
      moviesUpdated: row.movies_updated || 0,

      // Phase 3: Asset Caching
      assetsQueued: row.assets_queued || 0,
      assetsCached: row.assets_cached || 0,

      // Phase 4: Enrichment
      enrichmentQueued: row.enrichment_queued || 0,
      enrichmentCompleted: row.enrichment_completed || 0,

      // Timing
      startedAt: new Date(row.started_at),

      // Errors
      errorsCount: row.errors_count || 0,
    };

    // Add optional fields only if they exist
    if (row.discovery_completed_at) {
      scanJob.discoveryCompletedAt = new Date(row.discovery_completed_at);
    }
    if (row.scanning_completed_at) {
      scanJob.scanningCompletedAt = new Date(row.scanning_completed_at);
    }
    if (row.caching_completed_at) {
      scanJob.cachingCompletedAt = new Date(row.caching_completed_at);
    }
    if (row.completed_at) {
      scanJob.completedAt = new Date(row.completed_at);
    }
    if (row.last_error) {
      scanJob.lastError = row.last_error;
    }
    if (row.current_operation) {
      scanJob.currentOperation = row.current_operation;
    }
    if (row.options) {
      scanJob.options = JSON.parse(row.options);
    }

    return scanJob;
  }
}
