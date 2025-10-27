import { Router } from 'express';
import { RecycleBinController } from '../controllers/recycleBinController.js';
import { DatabaseManager } from '../database/DatabaseManager.js';

/**
 * Recycle Bin Routes
 *
 * Endpoints for managing recycled files
 */

export function createRecycleBinRoutes(dbManager: DatabaseManager): Router {
  const router = Router();
  const controller = new RecycleBinController(dbManager);

  // Get recycle bin statistics
  router.get('/stats', (req, res) => controller.getStats(req, res));

  // List recycled files for an entity
  router.get('/:entityType/:entityId', (req, res) => controller.listForEntity(req, res));

  // Restore a file from recycle bin
  router.post('/:recycleId/restore', (req, res) => controller.restoreFile(req, res));

  // Permanently delete a recycled file
  router.delete('/:recycleId', (req, res) => controller.permanentlyDelete(req, res));

  // Manual cleanup endpoints
  router.post('/cleanup/expired', (req, res) => controller.cleanupExpired(req, res));
  router.post('/cleanup/pending', (req, res) => controller.cleanupPending(req, res));

  // Empty entire recycle bin (dangerous operation)
  router.post('/empty', (req, res) => controller.emptyRecycleBin(req, res));

  return router;
}
