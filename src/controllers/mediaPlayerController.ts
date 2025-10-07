import { Request, Response, NextFunction } from 'express';
import { MediaPlayerService } from '../services/mediaPlayerService.js';
import { MediaPlayerConnectionManager } from '../services/mediaPlayerConnectionManager.js';
import { logger } from '../middleware/logging.js';

export class MediaPlayerController {
  private service: MediaPlayerService;
  private connectionManager: MediaPlayerConnectionManager;

  constructor(service: MediaPlayerService, connectionManager: MediaPlayerConnectionManager) {
    this.service = service;
    this.connectionManager = connectionManager;
  }

  /**
   * GET /api/media-players
   * Get all media players
   */
  async getAll(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const players = await this.service.getAll();
      res.json(players);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/media-players/:id
   * Get a media player by ID
   */
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid player ID' });
        return;
      }

      const player = await this.service.getById(id);
      if (!player) {
        res.status(404).json({ error: 'Player not found' });
        return;
      }

      res.json(player);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/media-players
   * Create a new media player
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        name,
        type,
        host,
        port,
        username,
        password,
        enabled,
        libraryGroup,
        useWebsocket,
        libraryPaths,
        config,
      } = req.body;

      // Validation
      if (!name || !type || !host || !port) {
        res.status(400).json({ error: 'Missing required fields: name, type, host, port' });
        return;
      }

      if (!['kodi', 'jellyfin', 'plex'].includes(type)) {
        res.status(400).json({ error: 'Invalid type. Must be one of: kodi, jellyfin, plex' });
        return;
      }

      const player = await this.service.create({
        name,
        type,
        host,
        port: parseInt(port),
        username,
        password,
        enabled: enabled !== false,
        libraryGroup,
        useWebsocket: useWebsocket !== false,
        libraryPaths,
        config,
      });

      logger.info(`Created media player: ${player.name} (${player.id})`);
      res.status(201).json(player);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/media-players/:id
   * Update a media player
   */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid player ID' });
        return;
      }

      const existingPlayer = await this.service.getById(id);
      if (!existingPlayer) {
        res.status(404).json({ error: 'Player not found' });
        return;
      }

      const {
        name,
        type,
        host,
        port,
        username,
        password,
        enabled,
        libraryGroup,
        useWebsocket,
        libraryPaths,
        config,
      } = req.body;

      const player = await this.service.update({
        id,
        name,
        type,
        host,
        ...(port !== undefined && { port: parseInt(port) }),
        username,
        password,
        enabled,
        libraryGroup,
        useWebsocket,
        libraryPaths,
        config,
      });

      logger.info(`Updated media player: ${player.name} (${player.id})`);
      res.json(player);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/media-players/:id
   * Delete a media player
   */
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid player ID' });
        return;
      }

      const existingPlayer = await this.service.getById(id);
      if (!existingPlayer) {
        res.status(404).json({ error: 'Player not found' });
        return;
      }

      await this.service.delete(id);
      logger.info(`Deleted media player: ${existingPlayer.name} (${id})`);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/media-players/:id/test
   * Test connection to a media player
   */
  async testConnection(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid player ID' });
        return;
      }

      const result = await this.service.testConnection(id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/media-players/test
   * Test connection without saving
   */
  async testConnectionUnsaved(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { host, port, username, password, useWebsocket, type } = req.body;

      if (!host || !port) {
        res.status(400).json({ error: 'Missing required fields: host, port' });
        return;
      }

      // Create temporary player object for testing
      const tempPlayer = {
        id: 0,
        name: 'Test',
        type: type || 'kodi',
        host,
        port: parseInt(port),
        username,
        password,
        enabled: true,
        useWebsocket: useWebsocket !== false,
        libraryPaths: [],
        connectionStatus: 'disconnected' as const,
        config: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await this.connectionManager.testConnection(tempPlayer);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/media-players/:id/connect
   * Manually connect a media player
   */
  async connect(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid player ID' });
        return;
      }

      await this.service.connect(id);
      res.json({ success: true, message: 'Connection initiated' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/media-players/:id/disconnect
   * Manually disconnect a media player
   */
  async disconnect(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid player ID' });
        return;
      }

      await this.service.disconnect(id);
      res.json({ success: true, message: 'Disconnection initiated' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/media-players/status
   * Server-Sent Events endpoint for real-time status updates
   */
  streamStatus(req: Request, res: Response): void {
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Send initial status
    const sendStatus = () => {
      const statuses = this.connectionManager.getAllConnectionStatuses();
      res.write(`data: ${JSON.stringify(statuses)}\n\n`);
    };

    sendStatus();

    // Send updates every 5 seconds
    const intervalId = setInterval(sendStatus, 5000);

    // Listen for connection manager events
    const onPlayerConnected = (playerId: number) => {
      const status = this.connectionManager.getConnectionStatus(playerId);
      res.write(`event: playerConnected\ndata: ${JSON.stringify(status)}\n\n`);
    };

    const onPlayerDisconnected = (playerId: number) => {
      const status = this.connectionManager.getConnectionStatus(playerId);
      res.write(`event: playerDisconnected\ndata: ${JSON.stringify(status)}\n\n`);
    };

    const onPlayerError = (playerId: number) => {
      const status = this.connectionManager.getConnectionStatus(playerId);
      res.write(`event: playerError\ndata: ${JSON.stringify(status)}\n\n`);
    };

    this.connectionManager.on('playerConnected', onPlayerConnected);
    this.connectionManager.on('playerDisconnected', onPlayerDisconnected);
    this.connectionManager.on('playerError', onPlayerError);

    // Clean up on client disconnect
    req.on('close', () => {
      clearInterval(intervalId);
      this.connectionManager.off('playerConnected', onPlayerConnected);
      this.connectionManager.off('playerDisconnected', onPlayerDisconnected);
      this.connectionManager.off('playerError', onPlayerError);
      res.end();
    });
  }
}
