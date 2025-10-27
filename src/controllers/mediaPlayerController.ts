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
   * GET /api/media-player-groups
   * Get all media player groups
   */
  async getGroups(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const groups = await this.service.getAllGroups();
      res.json(groups);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/media-player-groups/with-members
   * Get all groups with their member players
   */
  async getGroupsWithMembers(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const groups = await this.service.getAllGroupsWithMembers();
      res.json(groups);
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
        httpPort,
        username,
        password,
        enabled,
        libraryGroup,
        libraryPaths,
        config,
        groupName,
        isSharedMysql,
      } = req.body;

      // Validation
      if (!name || !type || !host) {
        res.status(400).json({ error: 'Missing required fields: name, type, host' });
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
        http_port: httpPort ? parseInt(httpPort) : 8080,
        username,
        password,
        enabled: enabled !== false,
        libraryGroup,
        libraryPaths,
        config,
        groupName,
        isSharedMysql,
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
        httpPort,
        username,
        password,
        enabled,
        libraryGroup,
        libraryPaths,
        config,
      } = req.body;

      const player = await this.service.update({
        id,
        name,
        type,
        host,
        ...(httpPort !== undefined && { http_port: parseInt(httpPort) }),
        username,
        password,
        enabled,
        libraryGroup,
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
      const { host, httpPort, username, password, type } = req.body;

      if (!host) {
        res.status(400).json({ error: 'Missing required field: host' });
        return;
      }

      // Create temporary player object for testing
      const tempPlayer = {
        id: 0,
        name: 'Test',
        type: type || 'kodi',
        host,
        http_port: httpPort ? parseInt(httpPort) : 8080,
        username,
        password,
        enabled: true,
        library_paths: [],
        connection_status: 'disconnected' as const,
        config: {},
        created_at: new Date(),
        updated_at: new Date(),
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
   * GET /api/media-players/activity
   * Get all player activity states
   */
  async getAllActivityStates(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const states = this.connectionManager.getAllActivityStates();
      res.json(states);
    } catch (error) {
      logger.error('Failed to get player activity states', { error });
      next(error);
    }
  }

  /**
   * GET /api/media-players/:id/activity
   * Get activity state for a specific player
   */
  async getActivityState(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const playerId = parseInt(req.params.id, 10);
      const state = this.connectionManager.getActivityState(playerId);

      if (!state) {
        res.status(404).json({ error: 'Player not found or no activity state' });
        return;
      }

      res.json(state);
    } catch (error) {
      logger.error('Failed to get player activity state', { error });
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
