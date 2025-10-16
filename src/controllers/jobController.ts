import { Request, Response } from 'express';
import { JobQueueService } from '../services/jobQueue/JobQueueService.js';
import { logger } from '../middleware/logging.js';

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
    } catch (error: any) {
      logger.error('Error getting job:', error);
      res.status(500).json({ error: error.message });
    }
  };

  /**
   * GET /api/jobs/stats
   * Get queue statistics
   */
  getStats = async (_req: Request, res: Response): Promise<void> => {
    try {
      const stats = await this.jobQueue.getStats();
      res.json(stats);
    } catch (error: any) {
      logger.error('Error getting job stats:', error);
      res.status(500).json({ error: error.message });
    }
  };

  /**
   * GET /api/jobs
   * Get active jobs (pending or processing)
   */
  getActive = async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const type = req.query.type as string | undefined;
      const status = req.query.status as 'pending' | 'processing' | undefined;

      const jobs = await this.jobQueue.getActiveJobs({
        ...(type && { type: type as any }),
        ...(status && { status }),
        limit,
      });

      res.json({ jobs });
    } catch (error: any) {
      logger.error('Error getting active jobs:', error);
      res.status(500).json({ error: error.message });
    }
  };

  /**
   * GET /api/jobs/history
   * Get job history (completed/failed jobs)
   */
  getHistory = async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const type = req.query.type as string | undefined;
      const status = req.query.status as 'completed' | 'failed' | undefined;

      const history = await this.jobQueue.getJobHistory({
        ...(type && { type: type as any }),
        ...(status && { status }),
        limit,
      });

      res.json({ history });
    } catch (error: any) {
      logger.error('Error getting job history:', error);
      res.status(500).json({ error: error.message });
    }
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
  //   } catch (error: any) {
  //     logger.error('Error getting recent jobs:', error);
  //     res.status(500).json({ error: error.message });
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
  //   } catch (error: any) {
  //     logger.error('Error getting jobs by type:', error);
  //     res.status(500).json({ error: error.message });
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
  //   } catch (error: any) {
  //     logger.error('Error retrying job:', error);
  //     res.status(500).json({ error: error.message });
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
  //   } catch (error: any) {
  //     logger.error('Error cancelling job:', error);
  //     res.status(500).json({ error: error.message });
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
  //   } catch (error: any) {
  //     logger.error('Error clearing old jobs:', error);
  //     res.status(500).json({ error: error.message });
  //   }
  // };
}
