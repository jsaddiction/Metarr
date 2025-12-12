/**
 * Actor Enrichment Phase (Phase 5C)
 *
 * Downloads TMDB profile images for actors:
 * 1. Query actors linked to entity with TMDB IDs
 * 2. Download profile images from TMDB
 * 3. Store in cache with SHA256-sharded structure
 * 4. Insert to cache_image_files table
 * 5. Update actors.image_hash and image_cache_path
 */

import path from 'path';
import crypto from 'crypto';
import fs from 'fs/promises';
import pMap from 'p-map';
import axios from 'axios';
import { DatabaseConnection } from '../../../types/database.js';
import { EnrichmentConfig } from '../types.js';
import { logger } from '../../../middleware/logging.js';
import { getErrorMessage } from '../../../utils/errorHandling.js';

interface ActorToEnrich {
  actor_id: number;
  name: string;
  tmdb_id: number;
  profile_path: string;
}

export class ActorEnrichmentPhase {
  private readonly cacheDir: string;

  constructor(
    private readonly db: DatabaseConnection,
    cacheDir?: string
  ) {
    this.cacheDir = cacheDir || path.join(process.cwd(), 'data', 'cache');
  }

  /**
   * Execute actor enrichment for an entity
   *
   * @param config - Enrichment configuration
   * @returns Number of thumbnails downloaded
   */
  async execute(config: EnrichmentConfig): Promise<{ thumbnailsDownloaded: number }> {
    const { entityId } = config;
    let downloaded = 0;

    try {
      // Step 1: Get all actors for this entity that need thumbnails
      const actors = await this.db.query<ActorToEnrich>(
        `SELECT
           a.id as actor_id,
           a.name,
           a.tmdb_id,
           pcp.profile_path
         FROM actors a
         INNER JOIN movie_actors ma ON a.id = ma.actor_id
         LEFT JOIN provider_cache_people pcp ON a.tmdb_id = pcp.tmdb_person_id
         WHERE ma.movie_id = ?
           AND a.tmdb_id IS NOT NULL
           AND pcp.profile_path IS NOT NULL
           AND a.image_hash IS NULL`,
        [entityId]
      );

      if (actors.length === 0) {
        logger.info('[ActorEnrichmentPhase] No actor thumbnails to download');
        return { thumbnailsDownloaded: 0 };
      }

      logger.info('[ActorEnrichmentPhase] Downloading actor thumbnails', {
        count: actors.length,
      });

      // Step 2: Batch database operations to prevent N+1 pattern
      const cacheInserts: Array<[string, number, string, string, string, string, number, number, number, string, string, string, string] | null> = [];
      const actorUpdates: { hash: string; cachePath: string; actorId: number }[] = [];

      // Step 3: Process downloads in parallel with concurrency limit
      await pMap(
        actors,
        async (actor) => {
          const result = await this.downloadActorThumbnail(actor);
          if (result) {
            cacheInserts.push(result.cacheInsert);
            actorUpdates.push(result.actorUpdate);
            downloaded++;
          }
        },
        { concurrency: 5 }
      );

      // Step 4: Batch insert cache records for new files only
      // Filter out null entries (files that already existed)
      const validInserts = cacheInserts.filter((insert): insert is NonNullable<typeof insert> => insert !== null);
      if (validInserts.length > 0) {
        const placeholders = validInserts.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
        const values = validInserts.flat();
        await this.db.execute(
          `INSERT INTO cache_image_files (
            entity_type, entity_id, image_type, file_path, file_name,
            file_hash, file_size, width, height, format, source_type, source_url, provider_name
          ) VALUES ${placeholders}`,
          values
        );
      }

      // Step 5: Batch update all actor records
      if (actorUpdates.length > 0) {
        for (const update of actorUpdates) {
          await this.db.execute(
            `UPDATE actors SET image_hash = ?, image_cache_path = ? WHERE id = ?`,
            [update.hash, update.cachePath, update.actorId]
          );
        }
      }

      logger.info('[ActorEnrichmentPhase] Phase 5C complete', {
        entityId,
        actorsProcessed: actors.length,
        thumbnailsDownloaded: downloaded,
      });

      return { thumbnailsDownloaded: downloaded };
    } catch (error) {
      logger.error('[ActorEnrichmentPhase] Phase 5C failed', {
        entityId,
        error: getErrorMessage(error),
      });
      // Don't throw - this is not critical enough to fail enrichment
      return { thumbnailsDownloaded: downloaded };
    }
  }

  /**
   * Download a single actor thumbnail
   */
  private async downloadActorThumbnail(actor: ActorToEnrich): Promise<{
    cacheInsert: [string, number, string, string, string, string, number, number, number, string, string, string, string] | null;
    actorUpdate: { hash: string; cachePath: string; actorId: number };
  } | null> {
    try {
      // Build full TMDB URL
      const tmdbUrl = `https://image.tmdb.org/t/p/original${actor.profile_path}`;

      // Download image
      const response = await axios.get(tmdbUrl, { responseType: 'arraybuffer' });
      const imageBuffer = Buffer.from(response.data);

      // Calculate hash
      const hash = crypto.createHash('sha256').update(imageBuffer).digest('hex');

      // Determine extension
      const ext = path.extname(actor.profile_path) || '.jpg';

      // Create cache directory using SHA256 sharding: actors/{first2}/{next2}/
      const first2 = hash.substring(0, 2);
      const next2 = hash.substring(2, 4);
      const actorCacheDir = path.join(this.cacheDir, 'actors', first2, next2);
      await fs.mkdir(actorCacheDir, { recursive: true });

      // Save to cache with just hash as filename
      const cachePath = path.join(actorCacheDir, `${hash}${ext}`);

      // Check if file already exists (actor might be in multiple movies)
      let fileExists = false;
      try {
        await fs.access(cachePath);
        fileExists = true;
        logger.debug('[ActorEnrichmentPhase] Actor thumbnail already cached', {
          actorId: actor.actor_id,
          name: actor.name,
          cachePath,
        });
      } catch {
        // File doesn't exist, need to write it
        await fs.writeFile(cachePath, imageBuffer);
      }

      // Prepare database operations
      const format = ext.substring(1); // Remove leading dot

      // Only need cache insert if file didn't exist (avoids duplicate constraint)
      const cacheInsert: [string, number, string, string, string, string, number, number, number, string, string, string, string] | null = fileExists
        ? null
        : [
            'actor',
            actor.actor_id,
            'actor_thumb',
            cachePath,
            path.basename(cachePath),
            hash,
            imageBuffer.length,
            0, // width - unknown
            0, // height - unknown
            format,
            'provider',
            tmdbUrl,
            'tmdb',
          ];

      const actorUpdate = { hash, cachePath, actorId: actor.actor_id };

      logger.debug('[ActorEnrichmentPhase] Downloaded actor thumbnail', {
        actorId: actor.actor_id,
        name: actor.name,
        cachePath,
      });

      return { cacheInsert, actorUpdate };
    } catch (error) {
      logger.error('[ActorEnrichmentPhase] Failed to download actor thumbnail', {
        actorId: actor.actor_id,
        name: actor.name,
        error: getErrorMessage(error),
      });
      return null;
    }
  }
}
