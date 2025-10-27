/**
 * Recycle Bin API Routes
 *
 * Endpoints for managing recycled files:
 * - GET /movies/:id/recycle-bin - List recycled files for a movie
 * - GET /episodes/:id/recycle-bin - List recycled files for an episode
 * - POST /recycle-bin/:id/restore - Restore a file from recycle bin
 * - DELETE /recycle-bin/:id - Permanently delete a recycled file
 * - GET /recycle-bin/stats - Get recycle bin statistics
 * - POST /recycle-bin/cleanup/expired - Cleanup expired items
 * - POST /recycle-bin/cleanup/pending - Cleanup pending items
 * - POST /recycle-bin/empty - Empty entire recycle bin
 */

import { Router } from 'express';
import { DatabaseManager } from '../database/DatabaseManager.js';
import { RecycleBinService } from '../services/recycleBinService.js';
import { logger } from '../middleware/logging.js';
import { getErrorMessage } from '../utils/errorHandling.js';

interface RecycleBinRecord {
  id: number;
  entity_type: string;
  entity_id: number;
  original_path: string;
  recycle_path: string | null;
  file_name: string;
  file_size: number;
  recycled_at: string | null;
}

export function createRecycleBinRouter(dbManager: DatabaseManager): Router {
  const router = Router();
  const db = dbManager.getConnection();

  /**
   * GET /movies/:id/recycle-bin
   * Get all recycle bin files for a movie
   */
  router.get('/movies/:id/recycle-bin', async (req, res) => {
    try {
      const { id } = req.params;
      const movieId = parseInt(id, 10);

      if (isNaN(movieId)) {
        return res.status(400).json({ error: 'Invalid movie ID' });
      }

      const files = await db.query<RecycleBinRecord>(
        `SELECT * FROM recycle_bin
         WHERE entity_type = 'movie' AND entity_id = ?
         ORDER BY recycled_at DESC NULLS FIRST`,
        [movieId]
      );

      // Format response
      const formatted = files.map((file: RecycleBinRecord) => ({
        id: file.id,
        fileName: file.file_name,
        fileSize: file.file_size,
        originalPath: file.original_path,
        recyclePath: file.recycle_path,
        status: file.recycled_at ? 'recycled' : 'pending',
        recycledAt: file.recycled_at,
      }));

      logger.debug('Retrieved recycle bin files', {
        movieId,
        count: formatted.length,
      });

      return res.json(formatted);
    } catch (error) {
      logger.error('Failed to retrieve recycle bin files', {
        movieId: req.params.id,
        error: getErrorMessage(error),
      });
      return res.status(500).json({ error: 'Failed to retrieve recycle bin files' });
    }
  });

  /**
   * GET /episodes/:id/recycle-bin
   * Get all recycle bin files for an episode
   */
  router.get('/episodes/:id/recycle-bin', async (req, res) => {
    try {
      const { id } = req.params;
      const episodeId = parseInt(id, 10);

      if (isNaN(episodeId)) {
        return res.status(400).json({ error: 'Invalid episode ID' });
      }

      const files = await db.query<RecycleBinRecord>(
        `SELECT * FROM recycle_bin
         WHERE entity_type = 'episode' AND entity_id = ?
         ORDER BY recycled_at DESC NULLS FIRST`,
        [episodeId]
      );

      const formatted = files.map((file: RecycleBinRecord) => ({
        id: file.id,
        fileName: file.file_name,
        fileSize: file.file_size,
        originalPath: file.original_path,
        recyclePath: file.recycle_path,
        status: file.recycled_at ? 'recycled' : 'pending',
        recycledAt: file.recycled_at,
      }));

      logger.debug('Retrieved recycle bin files', {
        episodeId,
        count: formatted.length,
      });

      return res.json(formatted);
    } catch (error) {
      logger.error('Failed to retrieve recycle bin files', {
        episodeId: req.params.id,
        error: getErrorMessage(error),
      });
      return res.status(500).json({ error: 'Failed to retrieve recycle bin files' });
    }
  });

  /**
   * POST /recycle-bin/:id/restore
   * Restore a file from recycle bin to its original location
   */
  router.post('/recycle-bin/:id/restore', async (req, res) => {
    try {
      const { id } = req.params;
      const recycleBinId = parseInt(id, 10);

      if (isNaN(recycleBinId)) {
        return res.status(400).json({ error: 'Invalid recycle bin ID' });
      }

      const recycleBin = new RecycleBinService(db);
      await recycleBin.restoreFile(recycleBinId);

      logger.info('Restored file from recycle bin', {
        recycleBinId,
      });

      return res.json({
        success: true,
        message: 'File restored successfully',
      });
    } catch (error) {
      logger.error('Failed to restore from recycle bin', {
        recycleBinId: req.params.id,
        error: getErrorMessage(error),
      });
      return res.status(500).json({
        success: false,
        error: getErrorMessage(error)
      });
    }
  });

  /**
   * DELETE /recycle-bin/:id
   * Permanently delete a file from recycle bin
   */
  router.delete('/recycle-bin/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const recycleBinId = parseInt(id, 10);

      if (isNaN(recycleBinId)) {
        return res.status(400).json({ error: 'Invalid recycle bin ID' });
      }

      const recycleBin = new RecycleBinService(db);
      await recycleBin.permanentlyDelete(recycleBinId);

      logger.info('Permanently deleted from recycle bin', {
        recycleBinId,
      });

      return res.json({
        success: true,
        message: 'File permanently deleted',
      });
    } catch (error) {
      logger.error('Failed to delete from recycle bin', {
        recycleBinId: req.params.id,
        error: getErrorMessage(error),
      });
      return res.status(500).json({
        success: false,
        error: getErrorMessage(error)
      });
    }
  });

  /**
   * GET /recycle-bin/stats
   * Get recycle bin statistics (total files, total size)
   */
  router.get('/recycle-bin/stats', async (_req, res) => {
    try {
      const recycleBin = new RecycleBinService(db);
      const stats = await recycleBin.getStats();

      return res.json({
        success: true,
        data: {
          totalFiles: stats.totalFiles,
          totalSizeBytes: stats.totalSizeBytes,
          totalSizeGB: (stats.totalSizeBytes / (1024 * 1024 * 1024)).toFixed(2),
          oldestEntry: stats.oldestEntry,
          pendingDeletion: stats.pendingDeletion,
        },
      });
    } catch (error) {
      logger.error('Failed to retrieve recycle bin stats', {
        error: getErrorMessage(error),
      });
      return res.status(500).json({
        success: false,
        error: getErrorMessage(error)
      });
    }
  });

  /**
   * POST /recycle-bin/cleanup/expired
   * Manually trigger cleanup of expired items
   */
  router.post('/recycle-bin/cleanup/expired', async (_req, res) => {
    try {
      const recycleBin = new RecycleBinService(db);
      const deletedCount = await recycleBin.cleanupExpired();

      logger.info('Expired recycle bin items cleaned up', {
        deletedCount,
      });

      return res.json({
        success: true,
        data: {
          deletedCount,
        },
      });
    } catch (error) {
      logger.error('Failed to cleanup expired items', {
        error: getErrorMessage(error),
      });
      return res.status(500).json({
        success: false,
        error: getErrorMessage(error)
      });
    }
  });

  /**
   * POST /recycle-bin/cleanup/pending
   * Manually trigger cleanup of pending items (failed moves)
   */
  router.post('/recycle-bin/cleanup/pending', async (_req, res) => {
    try {
      const recycleBin = new RecycleBinService(db);
      const cleanedCount = await recycleBin.cleanupPending();

      logger.info('Pending recycle bin items cleaned up', {
        cleanedCount,
      });

      return res.json({
        success: true,
        data: {
          cleanedCount,
        },
      });
    } catch (error) {
      logger.error('Failed to cleanup pending items', {
        error: getErrorMessage(error),
      });
      return res.status(500).json({
        success: false,
        error: getErrorMessage(error)
      });
    }
  });

  /**
   * POST /recycle-bin/empty
   * Empty entire recycle bin (permanent deletion of all files)
   */
  router.post('/recycle-bin/empty', async (_req, res) => {
    try {
      const recycleBin = new RecycleBinService(db);
      const deletedCount = await recycleBin.emptyRecycleBin();

      logger.warn('Recycle bin emptied', {
        deletedCount,
      });

      return res.json({
        success: true,
        data: {
          deletedCount,
        },
      });
    } catch (error) {
      logger.error('Failed to empty recycle bin', {
        error: getErrorMessage(error),
      });
      return res.status(500).json({
        success: false,
        error: getErrorMessage(error)
      });
    }
  });

  return router;
}
