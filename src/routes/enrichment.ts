import { Router } from 'express';
import { EnrichmentController } from '../controllers/enrichmentController.js';
import { EnrichmentStatsService } from '../services/enrichment/EnrichmentStatsService.js';
import { JobQueueService } from '../services/jobQueue/JobQueueService.js';
import { DatabaseConnection } from '../types/database.js';
import { logger } from '../middleware/logging.js';

/**
 * Enrichment Routes
 *
 * Provides API endpoints for:
 * - Library-wide completeness statistics (GET /movies/enrichment/stats)
 * - Movie-specific enrichment status (GET /movies/:id/enrichment-status)
 * - Manual movie enrichment (POST /movies/:id/enrich)
 * - Bulk enrichment status (GET /enrichment/bulk-status)
 * - Manual bulk enrichment (POST /enrichment/bulk-run)
 */

export const createEnrichmentRoutes = (
  db: DatabaseConnection,
  jobQueueService: JobQueueService
): Router => {
  const router = Router();

  // Initialize service and controller
  const statsService = new EnrichmentStatsService(db);
  const enrichmentController = new EnrichmentController(statsService, jobQueueService, db);

  logger.debug('[Enrichment Routes] Registering enrichment routes');

  // Library-wide statistics
  router.get('/movies/enrichment/stats', (req, res) => {
    logger.debug('[Route Hit] GET /movies/enrichment/stats');
    enrichmentController.getLibraryStats(req, res);
  });

  // Movie-specific enrichment status
  router.get('/movies/:id/enrichment-status', (req, res) => {
    logger.debug('[Route Hit] GET /movies/:id/enrichment-status', { id: req.params.id });
    enrichmentController.getMovieStatus(req, res);
  });

  // Trigger manual movie enrichment
  router.post('/movies/:id/enrich', (req, res) => {
    logger.debug('[Route Hit] POST /movies/:id/enrich', { id: req.params.id });
    enrichmentController.triggerMovieEnrich(req, res);
  });

  // Bulk enrichment status
  router.get('/enrichment/bulk-status', (req, res) => {
    logger.debug('[Route Hit] GET /enrichment/bulk-status');
    enrichmentController.getBulkStatus(req, res);
  });

  // Trigger manual bulk enrichment
  router.post('/enrichment/bulk-run', (req, res) => {
    logger.debug('[Route Hit] POST /enrichment/bulk-run');
    enrichmentController.triggerBulkEnrich(req, res);
  });

  logger.debug('[Enrichment Routes] Enrichment routes registered successfully');

  return router;
};
