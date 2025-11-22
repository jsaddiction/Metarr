/**
 * EnrichmentController Tests
 *
 * Tests REST API endpoints for enrichment statistics and manual enrichment triggers.
 * Covers HTTP status codes, error responses, and job queue integration.
 */

// @ts-nocheck - Test file with mock types
import { jest } from '@jest/globals';
import { Request, Response } from 'express';
import { EnrichmentController } from '../../src/controllers/enrichmentController.js';
import { EnrichmentStatsService } from '../../src/services/enrichment/EnrichmentStatsService.js';
import { JobQueueService } from '../../src/services/jobQueue/JobQueueService.js';
import { DatabaseConnection } from '../../src/types/database.js';

describe('EnrichmentController', () => {
  let controller: EnrichmentController;
  let mockStatsService: EnrichmentStatsService;
  let mockJobQueue: JobQueueService;
  let mockDb: DatabaseConnection;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  const mockLibraryStats = {
    total: 1542,
    enriched: 1245,
    partiallyEnriched: 198,
    unenriched: 99,
    averageCompleteness: 86,
    topIncomplete: [
      { id: 123, title: 'Incomplete Movie', completeness: 45, missingFieldCount: 8 },
    ],
  };

  const mockMovieStatus = {
    movieId: 123,
    completeness: 78,
    lastEnriched: '2025-01-24T10:30:00Z',
    enrichmentDuration: 4200,
    partial: true,
    rateLimitedProviders: ['tmdb'],
    missingFields: [
      { field: 'plot', displayName: 'Plot' },
      { field: 'directors', displayName: 'Directors' },
    ],
    fieldSources: { title: 'tmdb' },
  };

  beforeEach(() => {
    // Mock services
    mockStatsService = {
      getLibraryStats: jest.fn(),
      getMovieEnrichmentStatus: jest.fn(),
    } as any;

    mockJobQueue = {
      addJob: jest.fn(),
      getJobs: jest.fn(),
      getRecentJobs: jest.fn().mockResolvedValue([]), // Default: no recent jobs
    } as any;

    mockDb = {
      get: jest.fn(),
      query: jest.fn(),
      execute: jest.fn(),
      close: jest.fn(),
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
    } as any;

    // Mock request/response
    mockRequest = {
      params: {},
      body: {},
      query: {},
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    controller = new EnrichmentController(mockStatsService, mockJobQueue, mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/movies/enrichment/stats', () => {
    it('should return library statistics with 200 OK', async () => {
      mockStatsService.getLibraryStats.mockResolvedValue(mockLibraryStats);

      await controller.getLibraryStats(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockLibraryStats,
      });
      expect(mockResponse.status).not.toHaveBeenCalled(); // Default 200
    });

    it('should handle service errors with 500 status', async () => {
      mockStatsService.getLibraryStats.mockRejectedValue(new Error('Database error'));

      await controller.getLibraryStats(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to get library statistics',
      });
    });
  });

  describe('GET /api/movies/:id/enrichment-status', () => {
    it('should return movie status with 200 OK', async () => {
      mockRequest.params = { id: '123' };
      mockStatsService.getMovieEnrichmentStatus.mockResolvedValue(mockMovieStatus);

      await controller.getMovieStatus(mockRequest as Request, mockResponse as Response);

      expect(mockStatsService.getMovieEnrichmentStatus).toHaveBeenCalledWith(123);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockMovieStatus,
      });
    });

    it('should return 404 for non-existent movie', async () => {
      mockRequest.params = { id: '999' };
      mockStatsService.getMovieEnrichmentStatus.mockResolvedValue(null);

      await controller.getMovieStatus(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Movie not found',
      });
    });

    it('should handle invalid movie ID', async () => {
      mockRequest.params = { id: 'invalid' };

      await controller.getMovieStatus(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid movie ID',
      });
    });
  });

  describe('POST /api/movies/:id/enrich', () => {
    it('should create enrichment job with 202 Accepted', async () => {
      mockRequest.params = { id: '123' };
      mockRequest.body = { force: false };

      // Mock movie exists
      mockDb.get.mockResolvedValueOnce({ id: 123, title: 'Test Movie' });

      // Mock no pending jobs (no duplicates)
      mockJobQueue.getRecentJobs.mockResolvedValueOnce([]);

      // Mock job creation
      mockJobQueue.addJob.mockResolvedValue(5432);

      await controller.triggerMovieEnrich(mockRequest as Request, mockResponse as Response);

      expect(mockJobQueue.addJob).toHaveBeenCalledWith({
        type: 'enrich-metadata',
        priority: 3,
        payload: {
          entityType: 'movie',
          entityId: 123,
          requireComplete: false,
        },
        retry_count: 0,
        max_retries: 3,
      });

      expect(mockResponse.status).toHaveBeenCalledWith(202);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          jobId: 5432,
          message: 'Enrichment job queued',
          estimatedDuration: 3,
        },
      });
    });

    it('should return 409 Conflict if enrichment already in progress', async () => {
      mockRequest.params = { id: '123' };
      mockRequest.body = {};

      // Mock movie exists
      mockDb.get.mockResolvedValueOnce({ id: 123, title: 'Test Movie' });

      // Mock existing pending job
      mockJobQueue.getRecentJobs.mockResolvedValueOnce([
        {
          id: 1234,
          type: 'enrich-metadata',
          status: 'processing',
          payload: { entityType: 'movie', entityId: 123 },
        },
      ]);

      await controller.triggerMovieEnrich(mockRequest as Request, mockResponse as Response);

      expect(mockJobQueue.addJob).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(409);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Enrichment already in progress for this movie',
      });
    });

    it('should use requireComplete: false for manual enrichment', async () => {
      mockRequest.params = { id: '123' };
      mockRequest.body = {};

      // Mock movie exists
      mockDb.get.mockResolvedValueOnce({ id: 123, title: 'Test Movie' });

      mockJobQueue.getRecentJobs.mockResolvedValueOnce([]);
      mockJobQueue.addJob.mockResolvedValue(5433);

      await controller.triggerMovieEnrich(mockRequest as Request, mockResponse as Response);

      const jobCall = mockJobQueue.addJob.mock.calls[0][0];
      expect(jobCall.payload.requireComplete).toBe(false); // Best effort mode
      expect(jobCall.priority).toBe(3); // HIGH priority
    });

    it('should handle invalid movie ID', async () => {
      mockRequest.params = { id: 'abc' };

      await controller.triggerMovieEnrich(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid movie ID',
      });
    });
  });

  describe('GET /api/enrichment/bulk-status', () => {
    it('should return bulk enrichment status', async () => {
      // Mock job queue query for recent jobs
      mockJobQueue.getRecentJobs.mockResolvedValueOnce([
        {
          id: 5431,
          type: 'bulk-enrich',
          status: 'pending',
          created_at: '2025-01-23T02:00:00Z',
          started_at: '2025-01-23T03:12:00Z',
          result: JSON.stringify({
            processed: 1542,
            updated: 234,
            skipped: 1308,
            stopped: false,
          }),
        },
      ]);

      await controller.getBulkStatus(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          lastRun: expect.any(Object),
        }),
      });
    });

    it('should show current run if job is processing', async () => {
      // Mock processing bulk job
      mockJobQueue.getRecentJobs.mockResolvedValueOnce([
        {
          id: 5432,
          type: 'bulk-enrich',
          status: 'processing',
          created_at: '2025-01-24T10:00:00Z',
          progress: 234,
          payload: JSON.stringify({ total: 1542 }),
        },
      ]);

      await controller.getBulkStatus(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          currentRun: expect.objectContaining({
            jobId: 5432,
          }),
        }),
      });
    });
  });

  describe('POST /api/enrichment/bulk-run', () => {
    it('should trigger bulk enrichment with 202 Accepted', async () => {
      // Mock no current bulk job running
      mockJobQueue.getRecentJobs.mockResolvedValueOnce([]);

      // Mock monitored movies count for duration estimation
      mockDb.get.mockResolvedValueOnce({ count: 1542 });

      // Mock job creation
      mockJobQueue.addJob.mockResolvedValue(5432);

      await controller.triggerBulkEnrich(mockRequest as Request, mockResponse as Response);

      expect(mockJobQueue.addJob).toHaveBeenCalledWith({
        type: 'bulk-enrich',
        priority: 4, // NORMAL priority (background job, even if user-initiated)
        payload: {
          taskId: 'bulk-enrich',
          manual: true,
        },
        retry_count: 0,
        max_retries: 1,
      });

      expect(mockResponse.status).toHaveBeenCalledWith(202);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          jobId: 5432,
          message: 'Bulk enrichment job started',
          estimatedDuration: 1542 * 2, // 2 seconds per movie
        },
      });
    });

    it('should return 409 Conflict if bulk job already running', async () => {
      // Mock existing bulk job
      mockJobQueue.getRecentJobs.mockResolvedValueOnce([
        {
          id: 5431,
          type: 'bulk-enrich',
          status: 'processing',
        },
      ]);

      await controller.triggerBulkEnrich(mockRequest as Request, mockResponse as Response);

      expect(mockJobQueue.addJob).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(409);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Bulk enrichment already running',
      });
    });

    it('should use correct payload for bulk enrichment', async () => {
      mockJobQueue.getRecentJobs.mockResolvedValueOnce([]);
      mockDb.get.mockResolvedValueOnce({ count: 100 });
      mockJobQueue.addJob.mockResolvedValue(5433);

      await controller.triggerBulkEnrich(mockRequest as Request, mockResponse as Response);

      const jobCall = mockJobQueue.addJob.mock.calls[0][0];
      expect(jobCall.payload.taskId).toBe('bulk-enrich');
      expect(jobCall.payload.manual).toBe(true);
      expect(jobCall.priority).toBe(4); // NORMAL priority
    });

    it('should calculate duration estimation correctly', async () => {
      mockJobQueue.getRecentJobs.mockResolvedValueOnce([]);
      mockDb.get.mockResolvedValueOnce({ count: 500 });
      mockJobQueue.addJob.mockResolvedValue(5434);

      await controller.triggerBulkEnrich(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          jobId: 5434,
          message: 'Bulk enrichment job started',
          estimatedDuration: 1000, // 500 movies * 2 seconds
        },
      });
    });
  });

  describe('error handling', () => {
    it('should handle job queue errors gracefully', async () => {
      mockRequest.params = { id: '123' };
      mockDb.get.mockResolvedValueOnce({ id: 123, title: 'Test' });
      mockJobQueue.getRecentJobs.mockRejectedValue(new Error('Queue connection failed'));

      await controller.triggerMovieEnrich(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to queue enrichment job',
      });
    });

    it('should handle database errors when checking movie count', async () => {
      mockJobQueue.getRecentJobs.mockResolvedValueOnce([]);
      mockDb.get.mockRejectedValue(new Error('Database error'));

      await controller.triggerBulkEnrich(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to start bulk enrichment job',
      });
    });
  });

  describe('input validation', () => {
    it('should validate numeric movie IDs', async () => {
      // Only truly invalid IDs that parseInt cannot parse return 400
      const invalidIds = ['abc', 'xyz', 'not-a-number'];

      for (const id of invalidIds) {
        mockRequest.params = { id };
        jest.clearAllMocks();

        // Reset mocks to ensure clean state
        mockDb.get = jest.fn();
        mockJobQueue.getRecentJobs = jest.fn().mockResolvedValue([]);

        await controller.triggerMovieEnrich(mockRequest as Request, mockResponse as Response);

        expect(mockResponse.status).toHaveBeenCalledWith(400);
        expect(mockResponse.json).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid movie ID',
        });
      }
    });

    it('should accept valid numeric movie IDs', async () => {
      mockRequest.params = { id: '123' };
      mockRequest.body = {};
      mockDb.get.mockResolvedValueOnce({ id: 123, title: 'Test' });
      mockJobQueue.getRecentJobs.mockResolvedValueOnce([]);
      mockJobQueue.addJob.mockResolvedValue(5432);

      await controller.triggerMovieEnrich(mockRequest as Request, mockResponse as Response);

      expect(mockStatsService.getMovieEnrichmentStatus).not.toHaveBeenCalled();
      expect(mockJobQueue.addJob).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(202);
    });
  });
});
