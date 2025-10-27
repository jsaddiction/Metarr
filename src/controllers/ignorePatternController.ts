import { Request, Response, NextFunction } from 'express';
import { IgnorePatternService } from '../services/ignorePatternService.js';
import { getErrorMessage } from '../utils/errorHandling.js';

export class IgnorePatternController {
  constructor(private ignorePatternService: IgnorePatternService) {}

  /**
   * Get all ignore patterns
   */
  async getAll(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const patterns = await this.ignorePatternService.getAllPatterns();
      res.json(patterns);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Add a new ignore pattern
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { pattern, description } = req.body;

      if (!pattern) {
        res.status(400).json({ error: 'Pattern is required' });
        return;
      }

      const newPattern = await this.ignorePatternService.addPattern(pattern, description);
      res.status(201).json(newPattern);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Toggle pattern enabled/disabled
   */
  async toggle(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      const { enabled } = req.body;

      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid pattern ID' });
        return;
      }

      if (typeof enabled !== 'boolean') {
        res.status(400).json({ error: 'enabled must be a boolean' });
        return;
      }

      await this.ignorePatternService.togglePattern(id, enabled);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete an ignore pattern
   */
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);

      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid pattern ID' });
        return;
      }

      await this.ignorePatternService.deletePattern(id);
      res.json({ success: true });
    } catch (error) {
      if (getErrorMessage(error).includes('Cannot delete system patterns')) {
        res.status(403).json({ error: getErrorMessage(error) });
        return;
      }
      if (getErrorMessage(error).includes('Pattern not found')) {
        res.status(404).json({ error: getErrorMessage(error) });
        return;
      }
      next(error);
    }
  }

  /**
   * Generate pattern suggestion from filename
   */
  async generatePattern(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { fileName } = req.body;

      if (!fileName) {
        res.status(400).json({ error: 'fileName is required' });
        return;
      }

      const suggestedPattern = this.ignorePatternService.generatePatternFromFilename(fileName);
      res.json({ pattern: suggestedPattern });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete all unknown files matching a pattern and add the pattern to ignore list
   */
  async ignoreAndDeleteMatching(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { pattern, description } = req.body;

      if (!pattern) {
        res.status(400).json({ error: 'pattern is required' });
        return;
      }

      // Add pattern to ignore list
      const newPattern = await this.ignorePatternService.addPattern(pattern, description);

      // Delete matching unknown files
      const deletedCount = await this.ignorePatternService.deleteMatchingUnknownFiles(pattern);

      res.json({
        pattern: newPattern,
        deletedCount,
      });
    } catch (error) {
      next(error);
    }
  }
}
