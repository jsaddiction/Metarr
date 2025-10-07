import { Router } from 'express';
import { WebhookController } from '../controllers/webhookController.js';
import { DatabaseManager } from '../database/DatabaseManager.js';
import { rateLimitByIp } from '../middleware/security.js';

export function createWebhookRouter(dbManager: DatabaseManager): Router {
  const router = Router();
  const webhookController = new WebhookController(dbManager);

  // Rate limiting for webhooks - 60 requests per minute
  router.use(rateLimitByIp(60000, 60));

  // Sonarr webhook endpoint
  router.post('/sonarr', async (req, res, next) => {
    await webhookController.handleSonarr(req, res, next);
  });

  // Radarr webhook endpoint
  router.post('/radarr', async (req, res, next) => {
    await webhookController.handleRadarr(req, res, next);
  });

  // Lidarr webhook endpoint
  router.post('/lidarr', async (req, res, next) => {
    await webhookController.handleLidarr(req, res, next);
  });

  // Test endpoint for webhook configuration
  router.get('/test', (_req, res) => {
    res.json({
      status: 'success',
      message: 'Webhook endpoints are operational',
      endpoints: {
        sonarr: '/webhooks/sonarr',
        radarr: '/webhooks/radarr',
        lidarr: '/webhooks/lidarr',
      },
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
