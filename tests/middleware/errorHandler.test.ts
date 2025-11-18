/**
 * Error Handler Middleware Tests
 *
 * Validates unified error handling and response formatting
 */

import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { Request, Response, NextFunction } from 'express';
import { errorHandler, notFoundHandler } from '../../src/middleware/errorHandler.js';
import {
  ValidationError,
  ResourceNotFoundError,
  AuthenticationError,
  RateLimitError,
  DatabaseError,
} from '../../src/errors/index.js';
import { logger } from '../../src/middleware/logging.js';

// Spy on logger methods
const loggerErrorSpy = jest.spyOn(logger, 'error');

describe('errorHandler', () => {
  let mockReq: any;
  let mockRes: any;
  let mockNext: NextFunction;
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();

    const mockJson = jest.fn();
    const mockStatus = jest.fn(() => mockRes);

    mockReq = {
      method: 'GET',
      url: '/api/movies/123',
      ip: '127.0.0.1',
      get: jest.fn((header: string) =>
        header === 'User-Agent' ? 'Mozilla/5.0' : undefined
      ),
    };

    mockRes = {
      status: mockStatus,
      json: mockJson,
    };

    mockNext = jest.fn();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe('ApplicationError Handling', () => {
    it('should return correct status code for ApplicationError', () => {
      const error = new ResourceNotFoundError('movie', '123');

      errorHandler(
        error,
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    it('should return error message for operational errors', () => {
      const error = new ValidationError('Invalid email format');

      errorHandler(
        error,
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockRes.json).toHaveBeenCalledWith({
        error: expect.objectContaining({
          message: 'Invalid email format',
          status: 400,
        }),
      });
    });

    it('should return operational database errors with message', () => {
      const error = new DatabaseError('Query timeout exceeded');

      errorHandler(
        error,
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockRes.json).toHaveBeenCalledWith({
        error: expect.objectContaining({
          message: 'Query timeout exceeded',
          status: 500,
        }),
      });
    });

    it('should include error code in response', () => {
      const error = new AuthenticationError('Invalid API key');

      errorHandler(
        error,
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      const callArgs = mockRes.json.mock.calls[0][0];
      expect(callArgs.error.code).toBeDefined();
      expect(callArgs.error.message).toBe('Invalid API key');
    });
  });

  describe('Generic Error Handling', () => {
    it('should handle generic Error objects', () => {
      const error = new Error('Unexpected error');

      errorHandler(
        error,
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          message: 'Internal server error',
          status: 500,
        },
      });
    });

    it('should not include error code for generic errors', () => {
      const error = new Error('Something went wrong');

      errorHandler(
        error,
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      const response = mockRes.json.mock.calls[0][0];
      expect(response.error.code).toBeUndefined();
    });
  });

  describe('Development vs Production Mode', () => {
    it('should include stack trace in development mode', () => {
      process.env.NODE_ENV = 'development';

      const error = new ValidationError('Invalid input');
      error.stack = 'Error: Invalid input\n  at file.ts:10:5';

      errorHandler(
        error,
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      const response = mockRes.json.mock.calls[0][0];
      expect(response.error.stack).toBeDefined();
      expect(response.error.stack).toContain('Invalid input');
    });

    it('should exclude stack trace in production mode', () => {
      process.env.NODE_ENV = 'production';

      const error = new ValidationError('Invalid input');
      error.stack = 'Error: Invalid input\n  at file.ts:10:5';

      errorHandler(
        error,
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      const response = mockRes.json.mock.calls[0][0];
      expect(response.error.stack).toBeUndefined();
    });

    it('should exclude stack trace when NODE_ENV is undefined', () => {
      delete process.env.NODE_ENV;

      const error = new ValidationError('Invalid input');
      error.stack = 'Error: Invalid input\n  at file.ts:10:5';

      errorHandler(
        error,
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      const response = mockRes.json.mock.calls[0][0];
      expect(response.error.stack).toBeUndefined();
    });
  });

  describe('Logging', () => {
    it('should log ApplicationError with full context', () => {
      const error = new ResourceNotFoundError('movie', '123');

      errorHandler(
        error,
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Request error',
        expect.objectContaining({
          error: expect.objectContaining({
            name: 'ResourceNotFoundError',
            statusCode: 404,
            isOperational: true,
          }),
          request: expect.objectContaining({
            method: 'GET',
            url: '/api/movies/123',
            ip: '127.0.0.1',
            userAgent: 'Mozilla/5.0',
          }),
        })
      );
    });

    it('should log generic errors with basic context', () => {
      const error = new Error('Unexpected error');

      errorHandler(
        error,
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Request error (generic)',
        expect.objectContaining({
          error: expect.objectContaining({
            name: 'Error',
            message: 'Unexpected error',
          }),
          request: expect.objectContaining({
            method: 'GET',
            url: '/api/movies/123',
          }),
        })
      );
    });
  });

  describe('HTTP Status Codes', () => {
    it('should return 400 for ValidationError', () => {
      const error = new ValidationError('Invalid field');

      errorHandler(
        error,
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should return 401 for AuthenticationError', () => {
      const error = new AuthenticationError('Invalid credentials');

      errorHandler(
        error,
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    it('should return 404 for ResourceNotFoundError', () => {
      const error = new ResourceNotFoundError('movie', '123');

      errorHandler(
        error,
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    it('should return 429 for RateLimitError', () => {
      const error = new RateLimitError('TMDB', 60);

      errorHandler(
        error,
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockRes.status).toHaveBeenCalledWith(429);
    });

    it('should return 500 for generic errors', () => {
      const error = new Error('Something went wrong');

      errorHandler(
        error,
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('Request Context', () => {
    it('should capture request method and URL', () => {
      const error = new ValidationError('Invalid input');

      errorHandler(
        error,
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          request: expect.objectContaining({
            method: 'GET',
            url: '/api/movies/123',
          }),
        })
      );
    });

    it('should capture client IP address', () => {
      const error = new ValidationError('Invalid input');

      errorHandler(
        error,
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          request: expect.objectContaining({
            ip: '127.0.0.1',
          }),
        })
      );
    });

    it('should capture User-Agent header', () => {
      const error = new ValidationError('Invalid input');

      errorHandler(
        error,
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          request: expect.objectContaining({
            userAgent: 'Mozilla/5.0',
          }),
        })
      );
    });
  });
});

describe('notFoundHandler', () => {
  let mockReq: any;
  let mockRes: any;

  beforeEach(() => {
    const mockJson = jest.fn();
    const mockStatus = jest.fn(() => mockRes);

    mockReq = {
      method: 'POST',
      url: '/api/nonexistent',
    };

    mockRes = {
      status: mockStatus,
      json: mockJson,
    };
  });

  it('should return 404 status', () => {
    notFoundHandler(mockReq as Request, mockRes as Response);

    expect(mockRes.status).toHaveBeenCalledWith(404);
  });

  it('should include route information in response', () => {
    notFoundHandler(mockReq as Request, mockRes as Response);

    expect(mockRes.json).toHaveBeenCalledWith({
      error: {
        message: 'Route POST /api/nonexistent not found',
        status: 404,
      },
    });
  });

  it('should format GET requests correctly', () => {
    mockReq.method = 'GET';
    mockReq.url = '/api/movies/abc';

    notFoundHandler(mockReq as Request, mockRes as Response);

    expect(mockRes.json).toHaveBeenCalledWith({
      error: {
        message: 'Route GET /api/movies/abc not found',
        status: 404,
      },
    });
  });

  it('should format DELETE requests correctly', () => {
    mockReq.method = 'DELETE';
    mockReq.url = '/api/movies/123';

    notFoundHandler(mockReq as Request, mockRes as Response);

    expect(mockRes.json).toHaveBeenCalledWith({
      error: {
        message: 'Route DELETE /api/movies/123 not found',
        status: 404,
      },
    });
  });
});
