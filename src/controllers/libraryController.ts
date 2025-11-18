import { Request, Response, NextFunction } from 'express';
import { LibraryService } from '../services/libraryService.js';
import { LibraryScanService } from '../services/libraryScanService.js';
import { logger } from '../middleware/logging.js';
import { getErrorMessage } from '../utils/errorHandling.js';

export class LibraryController {
  constructor(
    private libraryService: LibraryService,
    private scanService: LibraryScanService
  ) {
    // Subscribe to scan events for SSE
    this.scanService.on('scanProgress', this.handleScanProgress.bind(this));
    this.scanService.on('scanCompleted', this.handleScanCompleted.bind(this));
    this.scanService.on('scanFailed', this.handleScanFailed.bind(this));
  }

  private sseClients: Set<Response> = new Set();
  private heartbeatIntervals: Map<Response, NodeJS.Timeout> = new Map();

  /**
   * Get all libraries
   */
  async getAll(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const libraries = await this.libraryService.getAll();
      res.json(libraries);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get library by ID
   */
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // ID validation handled by middleware
      const id = req.params.id as unknown as number;

      const library = await this.libraryService.getById(id);

      if (!library) {
        res.status(404).json({ error: 'Library not found' });
        return;
      }

      res.json(library);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create a new library
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Validation handled by middleware
      const { name, type, path } = req.body;

      const library = await this.libraryService.create({
        name,
        type,
        path,
      });

      res.status(201).json(library);
    } catch (error) {
      if (getErrorMessage(error).includes('not exist') || getErrorMessage(error).includes('not accessible')) {
        res.status(400).json({ error: getErrorMessage(error) });
        return;
      }
      next(error);
    }
  }

  /**
   * Update a library
   */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);

      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid library ID' });
        return;
      }

      const { name, type, path } = req.body;

      const library = await this.libraryService.update(id, {
        name,
        type,
        path,
      });

      res.json(library);
    } catch (error) {
      if (getErrorMessage(error).includes('not found')) {
        res.status(404).json({ error: 'Library not found' });
        return;
      }
      if (getErrorMessage(error).includes('not exist') || getErrorMessage(error).includes('not accessible')) {
        res.status(400).json({ error: getErrorMessage(error) });
        return;
      }
      next(error);
    }
  }

  /**
   * Get available drives
   */
  async getDrives(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const drives = await this.libraryService.getAvailableDrives();
      res.json(drives);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get server platform info (OS type)
   */
  async getPlatform(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const platform = process.platform; // 'win32', 'darwin', 'linux', etc.
      const isWindows = platform === 'win32';
      const separator = isWindows ? '\\' : '/';

      res.json({
        platform,
        isWindows,
        separator,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete a library
   */
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);

      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid library ID' });
        return;
      }

      await this.libraryService.delete(id);

      res.status(204).send();
    } catch (error) {
      if (getErrorMessage(error).includes('not found')) {
        res.status(404).json({ error: 'Library not found' });
        return;
      }
      next(error);
    }
  }

  /**
   * Validate a directory path
   */
  async validatePath(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { path } = req.body;

      if (!path) {
        res.status(400).json({ error: 'Missing required field: path' });
        return;
      }

      const result = await this.libraryService.validatePath(path);

      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Browse a directory
   */
  async browsePath(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { path } = req.query;

      if (!path || typeof path !== 'string') {
        res.status(400).json({ error: 'Missing or invalid query parameter: path' });
        return;
      }

      // Path traversal protection: Reject paths with suspicious patterns
      if (path.includes('..') || path.includes('\0')) {
        res.status(400).json({ error: 'Invalid path: path traversal attempts are not allowed' });
        return;
      }

      // Additional validation: must be absolute path (starts with / or drive letter on Windows)
      if (!path.startsWith('/') && !/^[a-zA-Z]:[\\/]/.test(path)) {
        res.status(400).json({ error: 'Invalid path: must be an absolute path' });
        return;
      }

      const directories = await this.libraryService.browsePath(path);

      res.json(directories);
    } catch (error) {
      if (getErrorMessage(error).includes('Cannot read directory')) {
        res.status(400).json({ error: getErrorMessage(error) });
        return;
      }
      next(error);
    }
  }

  /**
   * Start a library scan
   */
  async startScan(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);

      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid library ID' });
        return;
      }

      const scanJob = await this.scanService.startScan(id);

      res.status(201).json(scanJob);
    } catch (error) {
      if (getErrorMessage(error).includes('not found')) {
        res.status(404).json({ error: 'Library not found' });
        return;
      }
      if (getErrorMessage(error).includes('already running')) {
        res.status(409).json({ error: getErrorMessage(error) });
        return;
      }
      if (getErrorMessage(error).includes('disabled')) {
        res.status(400).json({ error: getErrorMessage(error) });
        return;
      }
      next(error);
    }
  }

  /**
   * SSE endpoint for scan progress
   * Streams real-time updates for all active scans
   */
  streamScanStatus(req: Request, res: Response): void {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders(); // Flush headers immediately

    // Add client to set
    this.sseClients.add(res);

    logger.info('SSE client connected for library scan status', {
      clientCount: this.sseClients.size
    });

    // Send initial keepalive
    res.write(':keepalive\n\n');

    // Send initial active scans
    this.scanService
      .getActiveScanJobs()
      .then(activeScans => {
        logger.info('Sending initial active scans via SSE', {
          scanCount: activeScans.length
        });
        this.sendSSE(res, 'activeScans', activeScans);
      })
      .catch(error => {
        logger.error('Failed to get active scans for SSE', { error: getErrorMessage(error) });
      });

    // Setup heartbeat to keep connection alive
    const heartbeatInterval = setInterval(() => {
      try {
        res.write(':heartbeat\n\n');
      } catch (error) {
        logger.error('Failed to send heartbeat', { error: getErrorMessage(error) });
        clearInterval(heartbeatInterval);
        this.heartbeatIntervals.delete(res);
        this.sseClients.delete(res);
      }
    }, 15000); // Send heartbeat every 15 seconds

    this.heartbeatIntervals.set(res, heartbeatInterval);

    // Cleanup on client disconnect
    req.on('close', () => {
      const interval = this.heartbeatIntervals.get(res);
      if (interval) {
        clearInterval(interval);
        this.heartbeatIntervals.delete(res);
      }
      this.sseClients.delete(res);
      logger.info('SSE client disconnected from library scan status', {
        remainingClients: this.sseClients.size
      });
    });
  }

  /**
   * Handle scan progress events
   */
  private handleScanProgress(payload: unknown): void {
    this.broadcastSSE('scanProgress', payload);
  }

  /**
   * Handle scan completed events
   */
  private handleScanCompleted(payload: unknown): void {
    this.broadcastSSE('scanCompleted', payload);
  }

  /**
   * Handle scan failed events
   */
  private handleScanFailed(payload: unknown): void {
    this.broadcastSSE('scanFailed', payload);
  }

  /**
   * Broadcast SSE event to all connected clients
   */
  private broadcastSSE(event: string, data: unknown): void {
    this.sseClients.forEach(client => {
      this.sendSSE(client, event, data);
    });
  }

  /**
   * Send SSE message to a specific client
   */
  private sendSSE(res: Response, event: string, data: unknown): void {
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (error) {
      logger.error('Failed to send SSE message', { error: getErrorMessage(error) });
    }
  }
}
