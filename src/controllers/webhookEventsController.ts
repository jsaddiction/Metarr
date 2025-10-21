import { Request, Response, NextFunction } from 'express';
import { DatabaseManager } from '../database/DatabaseManager.js';
import { logger } from '../middleware/logging.js';

/**
 * Webhook Events Controller
 *
 * Provides API endpoints for querying webhook event history.
 * Tracks all incoming webhook events from Radarr/Sonarr/Lidarr.
 */
export class WebhookEventsController {
  constructor(private db: DatabaseManager) {}

  /**
   * GET /api/webhooks/events
   * List webhook events with optional filtering and pagination
   * Query params:
   *   - limit: number (default 50, max 200)
   *   - offset: number (default 0)
   *   - source: 'radarr' | 'sonarr' | 'lidarr' (optional filter)
   *   - processed: boolean (optional filter)
   */
  getAllEvents = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const conn = this.db.getConnection();

      // Parse query parameters
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;
      const source = req.query.source as 'radarr' | 'sonarr' | 'lidarr' | undefined;
      const processedParam = req.query.processed as string | undefined;

      // Build WHERE clause
      const whereClauses: string[] = [];
      const params: any[] = [];

      if (source) {
        whereClauses.push('source = ?');
        params.push(source);
      }

      if (processedParam !== undefined) {
        const processed = processedParam === 'true' || processedParam === '1';
        whereClauses.push('processed = ?');
        params.push(processed ? 1 : 0);
      }

      const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      // Get total count
      const countResult = await conn.get<{ total: number }>(
        `SELECT COUNT(*) as total FROM webhook_events ${whereClause}`,
        params
      );
      const total = countResult?.total || 0;

      // Get paginated events
      const events = await conn.query(
        `SELECT
          id,
          source,
          event_type,
          payload,
          processed,
          job_id,
          created_at,
          processed_at
         FROM webhook_events
         ${whereClause}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );

      // Parse JSON payload for response
      const parsedEvents = events.map((event: any) => ({
        id: event.id,
        source: event.source,
        eventType: event.event_type,
        payload: JSON.parse(event.payload),
        processed: Boolean(event.processed),
        jobId: event.job_id,
        createdAt: event.created_at,
        processedAt: event.processed_at,
      }));

      res.json({
        events: parsedEvents,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      });
    } catch (error: any) {
      logger.error('Error getting webhook events:', error);
      next(error);
    }
  };

  /**
   * GET /api/webhooks/events/:id
   * Get a single webhook event by ID
   */
  getEventById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const conn = this.db.getConnection();
      const eventId = parseInt(req.params.id);

      if (isNaN(eventId)) {
        res.status(400).json({ error: 'Invalid event ID' });
        return;
      }

      const event = await conn.get(
        `SELECT
          id,
          source,
          event_type,
          payload,
          processed,
          job_id,
          created_at,
          processed_at
         FROM webhook_events
         WHERE id = ?`,
        [eventId]
      );

      if (!event) {
        res.status(404).json({ error: 'Webhook event not found' });
        return;
      }

      // Parse JSON payload
      const parsedEvent = {
        id: event.id,
        source: event.source,
        eventType: event.event_type,
        payload: JSON.parse(event.payload),
        processed: Boolean(event.processed),
        jobId: event.job_id,
        createdAt: event.created_at,
        processedAt: event.processed_at,
      };

      res.json({ event: parsedEvent });
    } catch (error: any) {
      logger.error('Error getting webhook event:', error);
      next(error);
    }
  };
}
