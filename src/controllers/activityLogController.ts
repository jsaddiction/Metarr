import { Request, Response, NextFunction } from 'express';
import { DatabaseManager } from '../database/DatabaseManager.js';
import { SqlParam } from '../types/database.js';
import { logger } from '../middleware/logging.js';

/**
 * Activity Log Controller
 *
 * Provides API endpoints for querying system activity logs.
 * Tracks webhooks, scans, enrichment jobs, user actions, and system events.
 */
export class ActivityLogController {
  constructor(private db: DatabaseManager) {}

  /**
   * GET /api/system/activity
   * List activity log entries with optional filtering and pagination
   * Query params:
   *   - limit: number (default 50, max 200)
   *   - offset: number (default 0)
   *   - source: string (optional filter: 'webhook', 'scan', 'enrichment', 'user', 'system')
   *   - event_type: string (optional filter)
   *   - severity: 'info' | 'warning' | 'error' (optional filter)
   */
  getAllActivities = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const conn = this.db.getConnection();

      // Parse query parameters
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;
      const source = req.query.source as string | undefined;
      const eventType = req.query.event_type as string | undefined;
      const severity = req.query.severity as 'info' | 'warning' | 'error' | undefined;

      // Build WHERE clause
      const whereClauses: string[] = [];
      const params: SqlParam[] = [];

      if (source) {
        whereClauses.push('source = ?');
        params.push(source);
      }

      if (eventType) {
        whereClauses.push('event_type = ?');
        params.push(eventType);
      }

      if (severity) {
        whereClauses.push('severity = ?');
        params.push(severity);
      }

      const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      // Get total count
      const countResult = await conn.get<{ total: number }>(
        `SELECT COUNT(*) as total FROM activity_log ${whereClause}`,
        params
      );
      const total = countResult?.total || 0;

      // Get paginated activities
      const activities = await conn.query(
        `SELECT
          id,
          event_type,
          source,
          description,
          metadata,
          severity,
          created_at
         FROM activity_log
         ${whereClause}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );

      // Parse JSON metadata for response
      const parsedActivities = activities.map((activity: unknown) => {
        const a = activity as {
          id: number;
          event_type: string;
          source: string;
          description: string;
          metadata: string | null;
          severity: string;
          created_at: string;
        };
        return {
          id: a.id,
          eventType: a.event_type,
          source: a.source,
          description: a.description,
          metadata: a.metadata ? JSON.parse(a.metadata) : null,
          severity: a.severity,
          created_at: a.created_at,
        };
      });

      res.json({
        activities: parsedActivities,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      });
    } catch (error) {
      logger.error('Error getting activity log:', error);
      next(error);
    }
  };

  /**
   * GET /api/system/activity/:id
   * Get a single activity log entry by ID
   */
  getActivityById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const conn = this.db.getConnection();
      const activityId = parseInt(req.params.id);

      if (isNaN(activityId)) {
        res.status(400).json({ error: 'Invalid activity ID' });
        return;
      }

      const activity = await conn.get(
        `SELECT
          id,
          event_type,
          source,
          description,
          metadata,
          severity,
          created_at
         FROM activity_log
         WHERE id = ?`,
        [activityId]
      );

      if (!activity) {
        res.status(404).json({ error: 'Activity log entry not found' });
        return;
      }

      // Parse JSON metadata
      const parsedActivity = {
        id: activity.id,
        eventType: activity.event_type,
        source: activity.source,
        description: activity.description,
        metadata: activity.metadata ? JSON.parse(activity.metadata) : null,
        severity: activity.severity,
        created_at: activity.created_at,
      };

      res.json({ activity: parsedActivity });
    } catch (error) {
      logger.error('Error getting activity log entry:', error);
      next(error);
    }
  };
}
