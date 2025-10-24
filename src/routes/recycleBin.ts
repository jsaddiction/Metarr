/**
 * Recycle Bin API Routes
 *
 * Endpoints for managing recycled files:
 * - GET /api/movies/:id/recycle-bin - List recycled files for a movie
 * - POST /api/recycle-bin/:id/restore - Restore a file from recycle bin
 * - DELETE /api/recycle-bin/:id - Permanently delete a recycled file
 */

import { Router } from 'express';
import { DatabaseManager } from '../database/DatabaseManager.js';
import { restoreFromRecycleBin, permanentlyDeleteFromRecycleBin } from '../services/files/recyclingService.js';
import { logger } from '../middleware/logging.js';

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
   * GET /api/movies/:id/recycle-bin
   * Get all recycle bin files for a movie
   */
  router.get('/api/movies/:id/recycle-bin', async (req, res) => {
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
    } catch (error: any) {
      logger.error('Failed to retrieve recycle bin files', {
        movieId: req.params.id,
        error: error.message,
      });
      return res.status(500).json({ error: 'Failed to retrieve recycle bin files' });
    }
  });

  /**
   * GET /api/episodes/:id/recycle-bin
   * Get all recycle bin files for an episode
   */
  router.get('/api/episodes/:id/recycle-bin', async (req, res) => {
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
    } catch (error: any) {
      logger.error('Failed to retrieve recycle bin files', {
        episodeId: req.params.id,
        error: error.message,
      });
      return res.status(500).json({ error: 'Failed to retrieve recycle bin files' });
    }
  });

  /**
   * POST /api/recycle-bin/:id/restore
   * Restore a file from recycle bin to its original location
   */
  router.post('/api/recycle-bin/:id/restore', async (req, res) => {
    try {
      const { id } = req.params;
      const recycleBinId = parseInt(id, 10);

      if (isNaN(recycleBinId)) {
        return res.status(400).json({ error: 'Invalid recycle bin ID' });
      }

      // Get recycle bin record
      const record = await db.get<RecycleBinRecord>(
        'SELECT * FROM recycle_bin WHERE id = ?',
        [recycleBinId]
      );

      if (!record) {
        return res.status(404).json({ error: 'Recycle bin record not found' });
      }

      // Case 1: Pending (not yet physically moved)
      if (!record.recycled_at) {
        // Just remove from recycle_bin table
        await db.execute('DELETE FROM recycle_bin WHERE id = ?', [recycleBinId]);

        logger.info('Restored file (removed from pending recycle)', {
          recycleBinId,
          originalPath: record.original_path,
        });

        return res.json({
          success: true,
          message: 'File restored (removed from recycle queue)',
          originalPath: record.original_path,
        });
      }

      // Case 2: Already recycled (physically moved)
      if (!record.recycle_path) {
        return res.status(400).json({
          error: 'File is recycled but recycle path is missing',
        });
      }

      const result = await restoreFromRecycleBin(
        record.recycle_path,
        record.original_path
      );

      if (result.success) {
        // Remove from database
        await db.execute('DELETE FROM recycle_bin WHERE id = ?', [recycleBinId]);

        logger.info('Restored file from recycle bin', {
          recycleBinId,
          recyclePath: record.recycle_path,
          originalPath: record.original_path,
        });

        return res.json({
          success: true,
          message: 'File restored to original location',
          originalPath: record.original_path,
        });
      } else {
        return res.status(500).json({
          error: result.error || 'Failed to restore file',
        });
      }
    } catch (error: any) {
      logger.error('Failed to restore from recycle bin', {
        recycleBinId: req.params.id,
        error: error.message,
      });
      return res.status(500).json({ error: 'Failed to restore file' });
    }
  });

  /**
   * DELETE /api/recycle-bin/:id
   * Permanently delete a file from recycle bin
   */
  router.delete('/api/recycle-bin/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const recycleBinId = parseInt(id, 10);

      if (isNaN(recycleBinId)) {
        return res.status(400).json({ error: 'Invalid recycle bin ID' });
      }

      // Get recycle bin record
      const record = await db.get<RecycleBinRecord>(
        'SELECT * FROM recycle_bin WHERE id = ?',
        [recycleBinId]
      );

      if (!record) {
        return res.status(404).json({ error: 'Recycle bin record not found' });
      }

      // If physically recycled, delete the file
      if (record.recycle_path) {
        const result = await permanentlyDeleteFromRecycleBin(record.recycle_path);

        if (!result.success) {
          logger.warn('Could not delete recycled file (may already be deleted)', {
            recycleBinId,
            recyclePath: record.recycle_path,
            error: result.error,
          });
          // Continue to remove database record anyway
        }
      }

      // Remove from database
      await db.execute('DELETE FROM recycle_bin WHERE id = ?', [recycleBinId]);

      logger.info('Permanently deleted from recycle bin', {
        recycleBinId,
        originalPath: record.original_path,
        recyclePath: record.recycle_path,
      });

      return res.json({
        success: true,
        message: 'File permanently deleted',
      });
    } catch (error: any) {
      logger.error('Failed to delete from recycle bin', {
        recycleBinId: req.params.id,
        error: error.message,
      });
      return res.status(500).json({ error: 'Failed to delete file' });
    }
  });

  /**
   * GET /api/recycle-bin/stats
   * Get recycle bin statistics (total files, total size)
   */
  router.get('/api/recycle-bin/stats', async (_req, res) => {
    try {
      // Get total count
      const countResult = await db.get<{ total: number }>(
        'SELECT COUNT(*) as total FROM recycle_bin'
      );

      // Get pending count
      const pendingResult = await db.get<{ pending: number }>(
        'SELECT COUNT(*) as pending FROM recycle_bin WHERE recycled_at IS NULL'
      );

      // Get total size (only recycled files)
      const sizeResult = await db.get<{ total_size: number }>(
        'SELECT SUM(file_size) as total_size FROM recycle_bin WHERE recycled_at IS NOT NULL'
      );

      return res.json({
        totalFiles: countResult?.total || 0,
        pendingFiles: pendingResult?.pending || 0,
        recycledFiles: (countResult?.total || 0) - (pendingResult?.pending || 0),
        totalSizeBytes: sizeResult?.total_size || 0,
      });
    } catch (error: any) {
      logger.error('Failed to retrieve recycle bin stats', {
        error: error.message,
      });
      return res.status(500).json({ error: 'Failed to retrieve stats' });
    }
  });

  return router;
}
