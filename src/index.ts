import { App } from './app.js';
import { logger } from './middleware/logging.js';

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

process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  logger.error('Unhandled promise rejection detected - this indicates a bug that must be fixed', {
    reason: reason instanceof Error ? {
      name: reason.name,
      message: reason.message,
      stack: reason.stack,
    } : reason,
    promiseState: promise,
  });

  // Attempt graceful shutdown to preserve data integrity
  app.stop()
    .then(() => {
      logger.error('Server stopped after unhandled rejection');
      process.exit(1);
    })
    .catch((shutdownError) => {
      logger.error('Failed to gracefully shutdown after unhandled rejection', { shutdownError });
      process.exit(1);
    });
});

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught exception detected - this indicates a bug that must be fixed', {
    name: error.name,
    message: error.message,
    stack: error.stack,
  });

  // Attempt graceful shutdown to preserve data integrity
  app.stop()
    .then(() => {
      logger.error('Server stopped after uncaught exception');
      process.exit(1);
    })
    .catch((shutdownError) => {
      logger.error('Failed to gracefully shutdown after uncaught exception', { shutdownError });
      process.exit(1);
    });
});

// Start the application
app.start().catch(error => {
  logger.error('Failed to start application:', error);
  process.exit(1);
});
