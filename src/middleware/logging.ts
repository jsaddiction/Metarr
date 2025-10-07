import { Request, Response, NextFunction } from 'express';
import morgan from 'morgan';
import winston from 'winston';
import { ConfigManager } from '../config/ConfigManager.js';

const config = ConfigManager.getInstance().getConfig();

// Custom winston logger
export const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [],
});

// Add file transport if enabled
if (config.logging.file.enabled) {
  logger.add(
    new winston.transports.File({
      filename: `${config.logging.file.path}/error.log`,
      level: 'error',
      maxsize: parseInt(config.logging.file.maxSize) * 1024 * 1024,
      maxFiles: config.logging.file.maxFiles,
    })
  );

  logger.add(
    new winston.transports.File({
      filename: `${config.logging.file.path}/app.log`,
      maxsize: parseInt(config.logging.file.maxSize) * 1024 * 1024,
      maxFiles: config.logging.file.maxFiles,
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
