/**
 * Trailer Analysis Phase
 *
 * Analyzes trailer candidates using a two-step verification:
 * 1. Query provider_cache_videos for trailers
 * 2. For each trailer, first verify via oEmbed (lightweight check)
 * 3. If oEmbed passes, extract full metadata via yt-dlp (resolution, duration, formats)
 * 4. Create/update entries in trailer_candidates table
 * 5. Handle permanent unavailability vs transient errors differently
 *
 * Proactive Verification Strategy:
 * - oEmbed check is fast and tells us if video exists at all
 * - Avoids expensive yt-dlp calls for unavailable videos
 * - Immediately marks unavailable videos (no retry guessing)
 */

import { DatabaseConnection } from '../../../types/database.js';
import { TrailerDownloadService, VideoInfo } from '../../trailers/TrailerDownloadService.js';
import { EnrichmentConfig } from '../types.js';
import { logger } from '../../../middleware/logging.js';
import { getErrorMessage } from '../../../utils/errorHandling.js';

/**
 * Video record from provider_cache_videos table
 */
interface ProviderCacheVideo {
  id: number;
  entity_type: string;
  entity_cache_id: number;
  video_type: string;
  provider_name: string;
  provider_video_id: string;
  name: string;
  site: string;
  key: string;
  size: number | null;
  duration_seconds: number | null;
  published_at: string | null;
  official: number;
  iso_639_1: string | null;
  iso_3166_1: string | null;
}

/**
 * Trailer candidate record structure
 */
interface TrailerCandidate {
  id: number;
  entity_type: string;
  entity_id: number;
  source_type: string;
  source_url: string | null;
  provider_name: string | null;
  provider_video_id: string | null;
  analyzed: number;
}

export class TrailerAnalysisPhase {
  constructor(
    private readonly db: DatabaseConnection,
    private readonly trailerDownloadService: TrailerDownloadService
  ) {}

  /**
   * Execute trailer analysis for an entity
   *
   * @param config - Enrichment configuration
   * @returns Number of trailers analyzed and skipped
   */
  async execute(
    config: EnrichmentConfig
  ): Promise<{ trailersAnalyzed: number; trailersSkipped: number }> {
    try {
      const { entityId, entityType } = config;

      // Only support movies for now (episodes later)
      if (entityType !== 'movie') {
        logger.info('[TrailerAnalysisPhase] Only supports movies currently', {
          entityType,
          entityId,
        });
        return { trailersAnalyzed: 0, trailersSkipped: 0 };
      }

      // Step 1: Get trailers from provider cache
      const trailers = await this.getTrailersFromProviderCache(entityId, entityType);

      if (trailers.length === 0) {
        logger.info('[TrailerAnalysisPhase] No trailers found in provider cache', {
          entityType,
          entityId,
        });
        return { trailersAnalyzed: 0, trailersSkipped: 0 };
      }

      logger.info('[TrailerAnalysisPhase] Analyzing trailers', {
        entityType,
        entityId,
        count: trailers.length,
      });

      // Step 2: Process each trailer with rate limiting
      let trailersAnalyzed = 0;
      let trailersSkipped = 0;

      for (const trailer of trailers) {
        try {
          const analyzed = await this.analyzeTrailer(entityId, entityType, trailer);
          if (analyzed) {
            trailersAnalyzed++;
          } else {
            trailersSkipped++;
          }

          // Rate limiting: 2-second delay between yt-dlp calls
          await this.delay(2000);
        } catch (error) {
          logger.warn('[TrailerAnalysisPhase] Failed to analyze trailer', {
            entityType,
            entityId,
            trailerKey: trailer.key,
            error: getErrorMessage(error),
          });
          trailersSkipped++;
        }
      }

      logger.info('[TrailerAnalysisPhase] Trailer analysis complete', {
        entityType,
        entityId,
        trailersAnalyzed,
        trailersSkipped,
        totalTrailers: trailers.length,
      });

      return { trailersAnalyzed, trailersSkipped };
    } catch (error) {
      logger.error('[TrailerAnalysisPhase] Trailer analysis failed', {
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Get trailers from provider_cache_videos for an entity
   *
   * Uses a robust join that handles NULL tmdb_id by also trying imdb_id and tvdb_id.
   * This ensures we find the provider cache entry regardless of which ID was set first.
   */
  private async getTrailersFromProviderCache(
    entityId: number,
    entityType: string
  ): Promise<ProviderCacheVideo[]> {
    // Query provider_cache_videos joined with provider_cache_movies
    // Use the same robust join pattern as the movie_provider_cache_view
    const query = `
      SELECT pv.*
      FROM provider_cache_videos pv
      JOIN provider_cache_movies pcm ON pv.entity_cache_id = pcm.id
      JOIN movies m ON (
        (m.tmdb_id IS NOT NULL AND pcm.tmdb_id = m.tmdb_id) OR
        (m.imdb_id IS NOT NULL AND pcm.imdb_id = m.imdb_id) OR
        (m.tvdb_id IS NOT NULL AND pcm.tvdb_id = m.tvdb_id)
      )
      WHERE m.id = ?
        AND pv.entity_type = 'movie'
        AND pv.video_type = 'trailer'
      ORDER BY pv.official DESC, pv.published_at DESC
    `;

    const trailers = await this.db.query<ProviderCacheVideo>(query, [entityId]);

    logger.debug('[TrailerAnalysisPhase] Fetched trailers from provider cache', {
      entityType,
      entityId,
      count: trailers.length,
    });

    return trailers;
  }

  /**
   * Analyze a single trailer using two-step verification
   *
   * Step 1: oEmbed check (fast, lightweight) - determines if video exists at all
   * Step 2: yt-dlp metadata extraction (slower) - only if video exists
   *
   * This proactive approach avoids expensive yt-dlp calls for unavailable videos
   * and immediately classifies unavailable videos without retry guessing.
   *
   * @returns True if analyzed, false if skipped
   */
  private async analyzeTrailer(
    entityId: number,
    entityType: string,
    trailer: ProviderCacheVideo
  ): Promise<boolean> {
    // Build video URL (supports YouTube and Vimeo)
    const sourceUrl = this.buildVideoUrl(trailer.site, trailer.key);
    if (!sourceUrl) {
      logger.warn('[TrailerAnalysisPhase] Unsupported video site', {
        entityId,
        site: trailer.site,
        key: trailer.key,
      });
      return false;
    }

    // Check if already analyzed
    const existingCandidate = await this.getExistingCandidate(
      entityId,
      entityType,
      trailer.provider_video_id
    );

    if (existingCandidate && existingCandidate.analyzed) {
      logger.debug('[TrailerAnalysisPhase] Trailer already analyzed, skipping', {
        entityId,
        candidateId: existingCandidate.id,
        providerVideoId: trailer.provider_video_id,
      });
      return false;
    }

    // STEP 1: Proactive oEmbed verification (fast check)
    // This tells us if the video exists before expensive yt-dlp call
    const verifyResult = await this.trailerDownloadService.verifyVideoExists(sourceUrl);

    if (verifyResult === 'not_found') {
      // Video is confirmed unavailable - mark permanently and skip yt-dlp
      logger.info('[TrailerAnalysisPhase] Video unavailable (oEmbed check)', {
        entityId,
        sourceUrl,
        providerVideoId: trailer.provider_video_id,
      });

      if (existingCandidate) {
        await this.updateTrailerCandidate(existingCandidate.id, null, 'unavailable', null);
      } else {
        await this.createTrailerCandidate(
          entityId,
          entityType,
          trailer,
          sourceUrl,
          null,
          'unavailable',
          null
        );
      }
      return false;
    }

    // STEP 2: yt-dlp metadata extraction (only if oEmbed passed or was unknown)
    let videoInfo: VideoInfo | null = null;
    let failureReason: string | null = null;
    let retryAfter: Date | null = null;

    try {
      videoInfo = await this.trailerDownloadService.getVideoInfo(sourceUrl);

      if (!videoInfo) {
        // yt-dlp returned null - video may be unavailable
        // Do a follow-up oEmbed check to confirm
        const recheck = await this.trailerDownloadService.verifyVideoExists(sourceUrl);
        failureReason = recheck === 'not_found' ? 'unavailable' : 'download_error';
        logger.info('[TrailerAnalysisPhase] Video info returned null', {
          entityId,
          sourceUrl,
          failureReason,
        });
      }
    } catch (error) {
      const errorMsg = getErrorMessage(error);

      if (errorMsg.includes('Rate limited') || errorMsg.includes('429')) {
        // Rate limited - retry after 1 hour
        failureReason = 'rate_limited';
        retryAfter = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
        logger.warn('[TrailerAnalysisPhase] Rate limited by yt-dlp', {
          entityId,
          sourceUrl,
          retryAfter,
        });
      } else {
        // Other error - verify with oEmbed to determine if permanent or transient
        const recheck = await this.trailerDownloadService.verifyVideoExists(sourceUrl);
        failureReason = recheck === 'not_found' ? 'unavailable' : 'download_error';
        logger.error('[TrailerAnalysisPhase] Failed to get video info', {
          entityId,
          sourceUrl,
          failureReason,
          error: errorMsg,
        });
      }
    }

    // Upsert to trailer_candidates table
    if (existingCandidate) {
      await this.updateTrailerCandidate(existingCandidate.id, videoInfo, failureReason, retryAfter);
    } else {
      await this.createTrailerCandidate(
        entityId,
        entityType,
        trailer,
        sourceUrl,
        videoInfo,
        failureReason,
        retryAfter
      );
    }

    return videoInfo !== null;
  }

  /**
   * Build video URL from site and key
   *
   * Supports:
   * - YouTube: https://www.youtube.com/watch?v={key}
   * - Vimeo: https://vimeo.com/{key}
   */
  private buildVideoUrl(site: string, key: string): string | null {
    const siteLower = site.toLowerCase();

    if (siteLower === 'youtube') {
      return `https://www.youtube.com/watch?v=${key}`;
    }

    if (siteLower === 'vimeo') {
      return `https://vimeo.com/${key}`;
    }

    logger.debug('[TrailerAnalysisPhase] Unsupported video site', { site, key });
    return null;
  }

  /**
   * Get existing trailer candidate by provider_video_id
   */
  private async getExistingCandidate(
    entityId: number,
    entityType: string,
    providerVideoId: string
  ): Promise<TrailerCandidate | null> {
    const query = `
      SELECT * FROM trailer_candidates
      WHERE entity_type = ?
        AND entity_id = ?
        AND provider_video_id = ?
      LIMIT 1
    `;

    const candidate = await this.db.get<TrailerCandidate>(query, [
      entityType,
      entityId,
      providerVideoId,
    ]);

    return candidate || null;
  }

  /**
   * Create new trailer candidate record
   */
  private async createTrailerCandidate(
    entityId: number,
    entityType: string,
    trailer: ProviderCacheVideo,
    sourceUrl: string,
    videoInfo: VideoInfo | null,
    failureReason: string | null,
    retryAfter: Date | null
  ): Promise<void> {
    const now = new Date().toISOString();

    const query = `
      INSERT INTO trailer_candidates (
        entity_type,
        entity_id,
        source_type,
        source_url,
        provider_name,
        provider_video_id,
        tmdb_name,
        tmdb_official,
        tmdb_language,
        analyzed,
        ytdlp_metadata,
        title,
        duration_seconds,
        best_width,
        best_height,
        estimated_size_bytes,
        thumbnail_url,
        failed_at,
        failure_reason,
        retry_after,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      entityType,
      entityId,
      'provider',
      sourceUrl,
      trailer.provider_name,
      trailer.provider_video_id,
      trailer.name,
      trailer.official ? 1 : 0,
      trailer.iso_639_1,
      videoInfo ? 1 : 0,
      videoInfo ? JSON.stringify(videoInfo) : null,
      videoInfo?.title || null,
      videoInfo?.duration || null,
      videoInfo?.bestWidth || null,
      videoInfo?.bestHeight || null,
      videoInfo?.estimatedSize || null,
      videoInfo?.thumbnail || null,
      failureReason ? now : null,
      failureReason,
      retryAfter ? retryAfter.toISOString() : null,
      now,
      now,
    ];

    await this.db.execute(query, values);

    logger.debug('[TrailerAnalysisPhase] Created trailer candidate', {
      entityType,
      entityId,
      providerVideoId: trailer.provider_video_id,
      analyzed: videoInfo !== null,
      failureReason,
    });
  }

  /**
   * Update existing trailer candidate with analysis results
   */
  private async updateTrailerCandidate(
    candidateId: number,
    videoInfo: VideoInfo | null,
    failureReason: string | null,
    retryAfter: Date | null
  ): Promise<void> {
    const now = new Date().toISOString();

    const query = `
      UPDATE trailer_candidates
      SET
        analyzed = ?,
        ytdlp_metadata = ?,
        title = ?,
        duration_seconds = ?,
        best_width = ?,
        best_height = ?,
        estimated_size_bytes = ?,
        thumbnail_url = ?,
        failed_at = ?,
        failure_reason = ?,
        retry_after = ?,
        updated_at = ?
      WHERE id = ?
    `;

    const values = [
      videoInfo ? 1 : 0,
      videoInfo ? JSON.stringify(videoInfo) : null,
      videoInfo?.title || null,
      videoInfo?.duration || null,
      videoInfo?.bestWidth || null,
      videoInfo?.bestHeight || null,
      videoInfo?.estimatedSize || null,
      videoInfo?.thumbnail || null,
      failureReason ? now : null,
      failureReason,
      retryAfter ? retryAfter.toISOString() : null,
      now,
      candidateId,
    ];

    await this.db.execute(query, values);

    logger.debug('[TrailerAnalysisPhase] Updated trailer candidate', {
      candidateId,
      analyzed: videoInfo !== null,
      failureReason,
    });
  }

  /**
   * Delay helper for rate limiting
   */
  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
