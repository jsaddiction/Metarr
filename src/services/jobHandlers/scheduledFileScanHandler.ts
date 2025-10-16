import { DatabaseManager } from '../../database/DatabaseManager.js';
import { LibraryScanService } from '../libraryScanService.js';
import { Job } from '../jobQueueService.js';
import { JobQueueService } from '../jobQueue/JobQueueService.js';
import { logger } from '../../middleware/logging.js';

/**
 * Scheduled File Scan Job Handler
 *
 * Processes scheduled-file-scan jobs by triggering library scans
 * to detect filesystem changes (new/moved/deleted files by *arr).
 */
export function createScheduledFileScanHandler(
  dbManager: DatabaseManager,
  jobQueue: JobQueueService
): (job: Job) => Promise<void> {
  const libraryScanService = new LibraryScanService(dbManager, jobQueue);

  return async (job: Job): Promise<void> => {
    const { libraryId, manual } = job.payload;

    if (!libraryId || typeof libraryId !== 'number') {
      throw new Error('Invalid job payload: libraryId is required');
    }

    logger.info('Processing scheduled file scan job', {
      jobId: job.id,
      libraryId,
      manual: !!manual,
    });

    try {
      // Get library details
      const library = await dbManager.getConnection().get<{
        id: number;
        name: string;
        type: string;
        root_path: string;
      }>('SELECT id, name, type, root_path FROM libraries WHERE id = ?', [libraryId]);

      if (!library) {
        throw new Error(`Library not found: ${libraryId}`);
      }

      // Trigger library scan
      const scanResult = await libraryScanService.startScan(library.id);

      logger.info('Scheduled file scan completed', {
        jobId: job.id,
        libraryId,
        libraryName: library.name,
        scanJobId: scanResult.id,
      });
    } catch (error) {
      logger.error('Scheduled file scan failed', {
        jobId: job.id,
        libraryId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };
}
