import { Request, Response, NextFunction } from 'express';
import morgan from 'morgan';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { ConfigManager } from '../config/ConfigManager.js';

// Create logger with default config first to avoid circular dependency
// Will be configured properly during initializeLogger()
export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    // Default console transport for early initialization logs
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize({ all: true }),
        winston.format.simple()
      ),
    }),
  ],
});

// Flag to track if logger has been initialized
let isInitialized = false;

/**
 * Initialize logger with configuration from ConfigManager
 * Must be called after ConfigManager is fully initialized
 */
export function initializeLogger(): void {
  if (isInitialized) {
    return;
  }

  const config = ConfigManager.getInstance().getConfig();

  // Update log level
  logger.level = config.logging.level;

  // Clear default transports
  logger.clear();

  // Add file transport with daily rotation if enabled
  if (config.logging.file.enabled) {
    // Error log with daily rotation
    logger.add(
      new DailyRotateFile({
        filename: `${config.logging.file.path}/error-%DATE%.log`,
        datePattern: 'YYYY-MM-DD',
        level: 'error',
        maxSize: `${config.logging.file.maxSize}m`,
        maxFiles: `${config.logging.file.maxFiles}d`, // Keep logs for N days
        zippedArchive: true, // Compress old logs
        auditFile: `${config.logging.file.path}/.audit-error.json`, // Track rotated files
      })
    );

    // Application log with daily rotation
    logger.add(
      new DailyRotateFile({
        filename: `${config.logging.file.path}/app-%DATE%.log`,
        datePattern: 'YYYY-MM-DD',
        maxSize: `${config.logging.file.maxSize}m`,
        maxFiles: `${config.logging.file.maxFiles}d`, // Keep logs for N days
        zippedArchive: true, // Compress old logs
        auditFile: `${config.logging.file.path}/.audit-app.json`, // Track rotated files
      })
    );
  }

  // Add console transport if enabled
  if (config.logging.console.enabled) {
    logger.add(
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize({ all: config.logging.console.colorize }),
          winston.format.simple()
        ),
      })
    );
  }

  isInitialized = true;
  logger.info('Logger initialized with configuration');
}

// Morgan middleware for HTTP request logging
export const requestLoggingMiddleware = morgan('combined', {
  stream: {
    write: (message: string) => {
      logger.info(message.trim());
    },
  },
});

// Error logging middleware
export const errorLoggingMiddleware = (
  error: Error,
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  logger.error({
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });

  next(error);
};
