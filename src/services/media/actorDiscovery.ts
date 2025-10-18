import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../../middleware/logging.js';
import { DatabaseConnection } from '../../types/database.js';
import {
  normalizeActorName,
  extractActorNameFromFilename,
  sanitizeActorDisplayName,
} from '../../utils/actorNameUtils.js';
import { getReliableFileTime } from '../../utils/fileTimeUtils.js';
import { ActorData } from '../../types/models.js';

/**
 * Actor Discovery Service
 *
 * IMPORTANT ARCHITECTURAL DECISION:
 * Actors are NO LONGER discovered from local NFO or .actors directories during initial scan.
 * Instead, actors are discovered during enrichment phase via TMDB API.
 *
 * Rationale:
 * - NFO files don't contain TMDB/IMDb IDs for actors (only names)
 * - Name-based matching is unreliable (e.g., "Chris Evans" ambiguity)
 * - TMDB is the authoritative source with proper IDs, roles, and official images
 * - Simpler workflow: no need to match/merge local and provider data
 *
 * New workflow (during enrichment):
 * 1. Call TMDB API for movie credits
 * 2. Get official actor list with IDs, roles, and headshot images
 * 3. Match/create actors in database by TMDB ID
 * 4. Download official headshot images to cache
 * 5. Link actors to movies with proper roles and order
 *
 * Legacy functions below are kept for backward compatibility but are no longer called during scanning.
 * They will be removed once TMDB enrichment is fully implemented.
 */

interface DiscoveredActor {
  name: string; // Display name (original capitalization)
  nameNormalized: string; // Normalized for matching
  role?: string; // Character name
  order?: number; // Billing order from NFO
  imagePath?: string; // Path to local image file
  imageCtime?: number; // File creation time
}

/**
 * Discover actors for a movie from NFO and .actors directory
 *
 * @param movieDirectory - Movie directory path
 * @param nfoActors - Actors extracted from NFO (optional)
 * @returns Array of discovered actors with images and metadata
 */
export async function discoverActors(
  movieDirectory: string,
  nfoActors?: ActorData[]
): Promise<DiscoveredActor[]> {
  const actorsMap = new Map<string, DiscoveredActor>();

  // Phase 1: Collect actors from NFO
  if (nfoActors && nfoActors.length > 0) {
    for (const nfoActor of nfoActors) {
      const normalized = normalizeActorName(nfoActor.name);

      if (!normalized) {
        logger.warn('Skipping actor with invalid name', { name: nfoActor.name });
        continue;
      }

      const actor: DiscoveredActor = {
        name: sanitizeActorDisplayName(nfoActor.name), // Sanitize display name
        nameNormalized: normalized,
      };

      if (nfoActor.role !== undefined) actor.role = nfoActor.role;
      if (nfoActor.order !== undefined) actor.order = nfoActor.order;

      actorsMap.set(normalized, actor);
    }

    logger.debug('Collected actors from NFO', { count: actorsMap.size });
  }

  // Phase 2: Scan .actors directory for images
  const actorsDir = path.join(movieDirectory, '.actors');

  try {
    await fs.access(actorsDir);
    const files = await fs.readdir(actorsDir);

    for (const file of files) {
      const filePath = path.join(actorsDir, file);
      const ext = path.extname(file).toLowerCase();

      // Only process image files
      if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
        logger.debug('Skipping non-image file in .actors', { file });
        continue;
      }

      try {
        const stats = await fs.stat(filePath);

        if (!stats.isFile()) {
          continue;
        }

        // Extract actor name from filename
        const actorName = extractActorNameFromFilename(file);
        const normalized = normalizeActorName(actorName);

        if (!normalized) {
          logger.warn('Skipping actor image with invalid filename', { file });
          continue;
        }

        // Get reliable file time (newest wins for deduplication)
        const ctime = getReliableFileTime(stats);

        if (ctime === null) {
          logger.warn('Could not determine file time for actor image', { file });
          continue;
        }

        // Check if actor already exists (from NFO or previous image)
        const existing = actorsMap.get(normalized);

        if (existing) {
          // Actor exists - update image if this one is newer
          if (!existing.imagePath || !existing.imageCtime || ctime > existing.imageCtime) {
            existing.imagePath = filePath;
            existing.imageCtime = ctime;
            logger.debug('Updated actor image to newer version', {
              actor: actorName,
              file,
              ctime,
            });
          }
        } else {
          // New actor from .actors directory (not in NFO)
          actorsMap.set(normalized, {
            name: actorName, // Use filename capitalization
            nameNormalized: normalized,
            imagePath: filePath,
            imageCtime: ctime,
          });

          logger.debug('Discovered new actor from .actors directory', {
            actor: actorName,
            file,
          });
        }
      } catch (error: any) {
        logger.warn('Failed to process actor image', {
          file,
          error: error.message,
        });
      }
    }

    logger.debug('Scanned .actors directory', {
      totalActors: actorsMap.size,
    });
  } catch (error: any) {
    // .actors directory doesn't exist - not an error
    logger.debug('.actors directory not found', {
      path: actorsDir,
    });
  }

  // Return as array, sorted by NFO order (actors without order go last)
  return Array.from(actorsMap.values()).sort((a, b) => {
    const orderA = a.order ?? 999;
    const orderB = b.order ?? 999;
    return orderA - orderB;
  });
}

/**
 * Insert or update actor in database
 *
 * @param db - Database connection
 * @param actor - Discovered actor data
 * @returns Actor ID
 */
export async function upsertActor(
  db: DatabaseConnection,
  actor: DiscoveredActor
): Promise<number> {
  // Check if actor already exists
  const existing = await db.query<{
    id: number;
    image_ctime: number | null;
    image_cache_path: string | null;
  }>(
    'SELECT id, image_ctime, image_cache_path FROM actors WHERE name_normalized = ?',
    [actor.nameNormalized]
  );

  let actorId: number;
  let shouldUpdateImage = false;

  if (existing && existing.length > 0) {
    actorId = existing[0].id;

    // Check if we should update the image (newer ctime wins)
    if (actor.imagePath && actor.imageCtime) {
      const existingCtime = existing[0].image_ctime;

      if (!existingCtime || actor.imageCtime > existingCtime) {
        shouldUpdateImage = true;
        logger.debug('Actor image will be updated (newer version found)', {
          actor: actor.name,
          existingCtime,
          newCtime: actor.imageCtime,
        });
      }
    }

    // Update name if NFO provides better capitalization
    await db.execute('UPDATE actors SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
      actor.name,
      actorId,
    ]);
  } else {
    // Insert new actor
    const result = await db.execute(
      `INSERT INTO actors (name, name_normalized, created_at, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [actor.name, actor.nameNormalized]
    );

    actorId = result.insertId || 0;
    shouldUpdateImage = actor.imagePath !== undefined;

    logger.debug('Inserted new actor', {
      actorId,
      name: actor.name,
      nameNormalized: actor.nameNormalized,
    });
  }

  // Cache actor image if needed
  if (shouldUpdateImage && actor.imagePath && actor.imageCtime) {
    const cachedImagePath = await cacheActorImage(db, actorId, actor.imagePath, actor.imageCtime);

    await db.execute(
      `UPDATE actors
       SET image_cache_path = ?, image_ctime = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [cachedImagePath, actor.imageCtime, actorId]
    );

    logger.debug('Cached actor image', {
      actorId,
      actor: actor.name,
      cachedPath: cachedImagePath,
    });
  }

  return actorId;
}

/**
 * Cache actor image to content-addressed storage
 *
 * @param db - Database connection
 * @param actorId - Actor ID
 * @param imagePath - Path to source image
 * @param imageCtime - Image creation time
 * @returns Path to cached image
 */
async function cacheActorImage(
  db: DatabaseConnection,
  actorId: number,
  imagePath: string,
  _imageCtime: number
): Promise<string> {
  const imageBuffer = await fs.readFile(imagePath);

  // Calculate SHA256 hash for content-addressed storage
  const hash = crypto.createHash('sha256').update(imageBuffer).digest('hex');

  // Cache path: data/cache/actors/{first2}/{next2}/{hash}.{ext}
  const ext = path.extname(imagePath);
  const cacheDir = path.join(process.cwd(), 'data', 'cache', 'actors', hash.slice(0, 2), hash.slice(2, 4));
  const cachePath = path.join(cacheDir, `${hash}${ext}`);

  // Create cache directory
  await fs.mkdir(cacheDir, { recursive: true });

  // Copy file to cache (if not already cached)
  try {
    await fs.access(cachePath);
    logger.debug('Actor image already in cache', { cachePath });
  } catch {
    await fs.copyFile(imagePath, cachePath);
    logger.debug('Copied actor image to cache', {
      from: imagePath,
      to: cachePath,
    });
  }

  // Store hash in database for deduplication
  await db.execute('UPDATE actors SET image_hash = ? WHERE id = ?', [hash, actorId]);

  return cachePath;
}

/**
 * Link actor to movie
 *
 * @param db - Database connection
 * @param movieId - Movie ID
 * @param actorId - Actor ID
 * @param role - Character name (optional)
 * @param order - Billing order (optional)
 */
export async function linkActorToMovie(
  db: DatabaseConnection,
  movieId: number,
  actorId: number,
  role?: string,
  order?: number
): Promise<void> {
  // Check if link already exists
  const existing = await db.query(
    'SELECT id FROM movie_actors WHERE movie_id = ? AND actor_id = ?',
    [movieId, actorId]
  );

  if (existing && existing.length > 0) {
    // Update existing link
    await db.execute(
      `UPDATE movie_actors
       SET role = ?, actor_order = ?
       WHERE movie_id = ? AND actor_id = ?`,
      [role || null, order || null, movieId, actorId]
    );

    logger.debug('Updated movie-actor link', { movieId, actorId, role, order });
  } else {
    // Insert new link
    await db.execute(
      `INSERT INTO movie_actors (movie_id, actor_id, role, actor_order, created_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [movieId, actorId, role || null, order || null]
    );

    logger.debug('Inserted movie-actor link', { movieId, actorId, role, order });
  }
}

/**
 * Full actor discovery and linking workflow
 *
 * @param db - Database connection
 * @param movieId - Movie ID
 * @param movieDirectory - Movie directory path
 * @param nfoActors - Actors from NFO (optional)
 */
export async function processActorsForMovie(
  db: DatabaseConnection,
  movieId: number,
  movieDirectory: string,
  nfoActors?: ActorData[]
): Promise<void> {
  try {
    logger.debug('Starting actor discovery', { movieId, movieDirectory });

    // Discover actors from NFO and .actors directory
    const actors = await discoverActors(movieDirectory, nfoActors);

    if (actors.length === 0) {
      logger.debug('No actors found for movie', { movieId });
      return;
    }

    logger.info('Discovered actors for movie', {
      movieId,
      actorCount: actors.length,
    });

    // Upsert actors and link to movie
    for (const actor of actors) {
      const actorId = await upsertActor(db, actor);
      await linkActorToMovie(db, movieId, actorId, actor.role, actor.order);
    }

    logger.info('Processed actors for movie', {
      movieId,
      actorCount: actors.length,
    });
  } catch (error: any) {
    logger.error('Failed to process actors for movie', {
      movieId,
      movieDirectory,
      error: error.message,
    });
    throw error;
  }
}
