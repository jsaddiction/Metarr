import { DatabaseManager } from '../database/DatabaseManager.js';
import { ConfigManager } from '../config/ConfigManager.js';
import { logger } from '../middleware/logging.js';
import fs from 'fs-extra';
import { getErrorMessage, getErrorStack } from './errorHandling.js';
import { imageProcessor } from './ImageProcessor.js';

/**
 * Backfill missing image dimensions for all images in the database
 * This utility reads images from disk and updates the database with their dimensions
 */
export async function backfillImageDimensions(): Promise<void> {
  const config = ConfigManager.getInstance().getConfig();
  const dbManager = new DatabaseManager(config.database);
  await dbManager.connect();

  try {
    // Find all images with missing dimensions
    const images = await dbManager.query<{
      id: number;
      cache_path: string | null;
      library_path: string | null;
      width: number | null;
      height: number | null;
    }>(
      `SELECT id, cache_path, library_path, width, height
       FROM images
       WHERE width IS NULL OR height IS NULL OR width = 0 OR height = 0`
    );

    logger.info(`Found ${images.length} images with missing dimensions`);

    let updated = 0;
    let failed = 0;

    for (const image of images) {
      try {
        // Try cache_path first, then library_path
        const filePath = image.cache_path || image.library_path;

        if (!filePath) {
          logger.warn(`Image ${image.id} has no file paths`);
          failed++;
          continue;
        }

        // Check if file exists
        if (!(await fs.pathExists(filePath))) {
          logger.warn(`File not found for image ${image.id}: ${filePath}`);
          failed++;
          continue;
        }

        // Read dimensions using centralized ImageProcessor
        const analysis = await imageProcessor.analyzeImage(filePath);
        const width = analysis.width;
        const height = analysis.height;

        if (!width || !height) {
          logger.warn(`Could not read dimensions for image ${image.id}: ${filePath}`);
          failed++;
          continue;
        }

        // Update database
        await dbManager.execute(
          `UPDATE images SET width = ?, height = ? WHERE id = ?`,
          [width, height, image.id]
        );

        logger.debug(`Updated dimensions for image ${image.id}: ${width}×${height}`);
        updated++;
      } catch (error) {
        logger.error(`Failed to process image ${image.id}`, {
          error: getErrorMessage(error),
          stack: getErrorStack(error),
        });
        failed++;
      }
    }

    logger.info('Backfill complete', {
      total: images.length,
      updated,
      failed,
    });
  } catch (error) {
    logger.error('Backfill failed', {
      error: getErrorMessage(error),
      stack: getErrorStack(error),
    });
    throw error;
  }
}

// Allow running directly
if (require.main === module) {
  backfillImageDimensions()
    .then(() => {
      logger.info('Backfill script completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Backfill script failed', error);
      process.exit(1);
    });
}
