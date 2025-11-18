import { Request, Response, NextFunction } from 'express';
import { logger } from './logging.js';
import { ApplicationError } from '../errors/ApplicationError.js';

/**
 * Unified error handler for ApplicationError
 * Provides consistent error responses with rich logging context
 */
export const errorHandler = (
  error: Error | ApplicationError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const isDevelopment = process.env.NODE_ENV === 'development';

  // Extract error properties
  let statusCode: number;
  let message: string;
  let errorCode: string | undefined;

  if (error instanceof ApplicationError) {
    // Unified ApplicationError system with rich context
    statusCode = error.statusCode;
    message = error.isOperational ? error.message : 'Internal server error';
    errorCode = error.code;

    // Log with full context for debugging and monitoring
    logger.error('Request error', {
      error: {
        name: error.name,
        message: error.message,
        code: error.code,
        statusCode: error.statusCode,
        isOperational: error.isOperational,
        retryable: error.retryable,
        context: error.context,
        timestamp: error.timestamp.toISOString(),
        stack: error.stack,
        cause: error.cause ? {
          name: error.cause.name,
          message: error.cause.message,
          stack: error.cause.stack,
        } : undefined,
      },
      request: {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      },
    });
  } else {
    // Generic Error (fallback for unexpected errors)
    statusCode = 500;
    message = 'Internal server error';

    // Log generic error
    logger.error('Request error (generic)', {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      request: {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      },
    });
  }

  // Build error response
  const errorResponse: {
    error: {
      message: string;
      status: number;
      code?: string;
      stack?: string;
    };
  } = {
    error: {
      message,
      status: statusCode,
      ...(errorCode && { code: errorCode }),
    },
  };

  // Include stack trace in development
  if (isDevelopment && error.stack) {
    errorResponse.error.stack = error.stack;
  }

  res.status(statusCode).json(errorResponse);
};

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    error: {
      message: `Route ${req.method} ${req.url} not found`,
      status: 404,
    },
  });
};
