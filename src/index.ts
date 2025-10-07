import { App } from './app.js';
import { logger } from './middleware/logging.js';
import * as fs from 'fs';
import * as path from 'path';

// TEMPORARY: Delete old database to recreate with updated schema
const dbPath = path.join(process.cwd(), 'data', 'metarr.sqlite');
if (fs.existsSync(dbPath)) {
  try {
    fs.unlinkSync(dbPath);
    logger.info('Deleted old database file for schema recreation');
  } catch (error: any) {
    logger.warn('Could not delete old database file', { error: error.message });
  }
}

const app = new App();

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM signal, shutting down gracefully');
  await app.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT signal, shutting down gracefully');
  await app.stop();
  process.exit(0);
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('Unhandled promise rejection:', { reason, promise });
  process.exit(1);
});

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

// Start the application
app.start().catch(error => {
  logger.error('Failed to start application:', error);
  process.exit(1);
});
