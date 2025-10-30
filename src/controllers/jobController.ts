import { Request, Response } from 'express';
import { JobQueueService } from '../services/jobQueue/JobQueueService.js';
import { logger } from '../middleware/logging.js';
import { getErrorMessage } from '../utils/errorHandling.js';

/**
 * Job Controller
 *
 * Handles HTTP requests for job queue management:
 * - Get job status
 * - Get queue statistics
 * - Get job history
 */

export class JobController {
  private jobQueue: JobQueueService;

  constructor(jobQueue: JobQueueService) {
    this.jobQueue = jobQueue;
  }

  /**
   * GET /api/jobs/:jobId
   * Get job by ID
   */
  getJob = async (req: Request, res: Response): Promise<void> => {
    try {
      const { jobId } = req.params;

      const job = await this.jobQueue.getJob(parseInt(jobId));

      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      res.json(job);
    } catch (error) {
      logger.error('Error getting job:', error);
      res.status(500).json({ error: getErrorMessage(error) });
    }
  };

  /**
   * GET /api/jobs/stats
   * Get queue statistics
   */
  getStats = async (_req: Request, res: Response): Promise<void> => {
    try {
      const stats = await this.jobQueue.getStats();

      // Transform stats to match frontend expectations
      const response = {
        pending: stats.pending,
        running: stats.processing, // Frontend expects 'running' instead of 'processing'
        completed: stats.completed || 0,
        failed: stats.failed || 0,
      };

      res.json(response);
    } catch (error) {
      logger.error('Error getting job stats:', error);
      res.status(500).json({ error: getErrorMessage(error) });
    }
  };

  /**
   * GET /api/jobs
   * Get recent jobs (active + recently completed/failed in last hour)
   * Returns array of jobs for frontend compatibility
   */
  getActive = async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const type = req.query.type as string | undefined;
      const status = req.query.status as 'pending' | 'processing' | undefined;

      // Use getRecentJobs instead of getActiveJobs to include recently completed/failed
      let jobs = await this.jobQueue.getRecentJobs();

      // Apply filters if provided
      if (type) {
        jobs = jobs.filter((job) => job.type === type);
      }
      if (status) {
        jobs = jobs.filter((job) => job.status === status);
      }

      // Apply limit
      jobs = jobs.slice(0, limit);

      // Return jobs array directly (frontend expects array, not { jobs: [...] })
      res.json({ jobs });
    } catch (error) {
      logger.error('Error getting jobs:', error);
      res.status(500).json({ error: getErrorMessage(error) });
    }
  };

  /**
   * GET /api/jobs/history
   * REMOVED: Job history table removed - use structured logs instead
   *
   * For job execution history, check logs/app.log with job ID filtering.
   * The getActive endpoint now returns recently completed/failed jobs (last hour).
   */
  getHistory = async (_req: Request, res: Response): Promise<void> => {
    res.status(410).json({
      error: 'Job history endpoint removed',
      message: 'Job history table has been removed. Use GET /api/jobs for recent jobs (includes completed/failed in last hour), or check logs/app.log for full execution history.',
      alternative: 'GET /api/jobs?limit=100'
    });
  };

  // Commented out methods that aren't implemented yet in JobQueueService
  // TODO: Implement these methods when needed

  // /**
  //  * GET /api/jobs/recent
  //  * Get recent jobs (default 50)
  //  */
  // getRecent = async (req: Request, res: Response): Promise<void> => {
  //   try {
  //     const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
  //     const jobs = await this.jobQueue.getRecentJobs(limit);
  //     res.json({ jobs });
  //   } catch (error) {
  //     logger.error('Error getting recent jobs:', error);
  //     res.status(500).json({ error: getErrorMessage(error) });
  //   }
  // };

  // /**
  //  * GET /api/jobs/by-type/:type
  //  * Get jobs by type
  //  */
  // getByType = async (req: Request, res: Response): Promise<void> => {
  //   try {
  //     const { type } = req.params;
  //     const { state, limit } = req.query;

  //     const jobs = await this.jobQueue.getJobsByType(
  //       type as any,
  //       state as any,
  //       limit ? parseInt(limit as string) : 50
  //     );

  //     res.json({ jobs });
  //   } catch (error) {
  //     logger.error('Error getting jobs by type:', error);
  //     res.status(500).json({ error: getErrorMessage(error) });
  //   }
  // };

  // /**
  //  * POST /api/jobs/:jobId/retry
  //  * Retry a failed job
  //  */
  // retry = async (req: Request, res: Response): Promise<void> => {
  //   try {
  //     const { jobId } = req.params;

  //     const success = await this.jobQueue.retryJob(parseInt(jobId));

  //     if (success) {
  //       res.json({ success: true, message: 'Job marked for retry' });
  //     } else {
  //       res.status(400).json({ success: false, message: 'Job not found or not failed' });
  //     }
  //   } catch (error) {
  //     logger.error('Error retrying job:', error);
  //     res.status(500).json({ error: getErrorMessage(error) });
  //   }
  // };

  // /**
  //  * DELETE /api/jobs/:jobId
  //  * Cancel a pending job
  //  */
  // cancel = async (req: Request, res: Response): Promise<void> => {
  //   try {
  //     const { jobId } = req.params;

  //     const success = await this.jobQueue.cancelJob(parseInt(jobId));

  //     if (success) {
  //       res.json({ success: true, message: 'Job cancelled' });
  //     } else {
  //       res.status(400).json({ success: false, message: 'Job not found or not pending' });
  //     }
  //   } catch (error) {
  //     logger.error('Error cancelling job:', error);
  //     res.status(500).json({ error: getErrorMessage(error) });
  //     }
  // };

  // /**
  //  * POST /api/jobs/clear-old
  //  * Clear completed jobs older than specified days
  //  * Body: { daysOld?: number }
  //  */
  // clearOld = async (req: Request, res: Response): Promise<void> => {
  //   try {
  //     const { daysOld } = req.body;
  //     const days = daysOld ? parseInt(daysOld) : 7;

  //     const cleared = await this.jobQueue.clearOldJobs(days);

  //     res.json({ success: true, cleared });
  //   } catch (error) {
  //     logger.error('Error clearing old jobs:', error);
  //     res.status(500).json({ error: getErrorMessage(error) });
  //   }
  // };
}
