/**
 * Enrichment Orchestrator
 *
 * Coordinates the unified enrichment workflow:
 * - Phase 0: Metadata Enrichment (NEW - OMDB + TMDB metadata fetch)
 * - Phase 1: Provider Fetch (metadata + asset URLs)
 * - Phase 2: Cache Matching (link existing cache to providers)
 * - Phase 3: Asset Analysis (download + analyze unanalyzed assets)
 * - Phase 4: Asset Scoring (integrated into Phase 5)
 * - Phase 5: Asset Selection (intelligent selection with dedup)
 * - Phase 5C: Actor Enrichment (download actor thumbnails)
 */

import { DatabaseConnection } from '../../types/database.js';
import { DatabaseManager } from '../../database/DatabaseManager.js';
import { MetadataEnrichmentService } from './MetadataEnrichmentService.js';
import { ProviderFetchPhase } from './phases/ProviderFetchPhase.js';
import { CacheMatchingPhase } from './phases/CacheMatchingPhase.js';
import { AssetAnalysisPhase } from './phases/AssetAnalysisPhase.js';
import { AssetSelectionPhase } from './phases/AssetSelectionPhase.js';
import { ActorEnrichmentPhase } from './phases/ActorEnrichmentPhase.js';
import { TrailerAnalysisPhase } from './phases/TrailerAnalysisPhase.js';
import { TrailerSelectionPhase } from './phases/TrailerSelectionPhase.js';
import { TrailerDownloadService } from '../trailers/TrailerDownloadService.js';
import { TrailerSelectionService } from '../trailers/TrailerSelectionService.js';
import { EnrichmentConfig, EnrichmentResult } from './types.js';
import { logger } from '../../middleware/logging.js';
import { getErrorMessage } from '../../utils/errorHandling.js';
import path from 'path';

export class EnrichmentOrchestrator {
  private readonly metadataEnrichmentService: MetadataEnrichmentService | null = null;
  private readonly providerFetchPhase: ProviderFetchPhase;
  private readonly cacheMatchingPhase: CacheMatchingPhase;
  private readonly assetAnalysisPhase: AssetAnalysisPhase;
  private readonly assetSelectionPhase: AssetSelectionPhase;
  private readonly actorEnrichmentPhase: ActorEnrichmentPhase;
  private readonly trailerAnalysisPhase: TrailerAnalysisPhase;
  private readonly trailerSelectionPhase: TrailerSelectionPhase;
  private readonly db: DatabaseConnection;

  constructor(
    db: DatabaseConnection,
    dbManager: DatabaseManager,
    metadataEnrichmentService?: MetadataEnrichmentService // OPTIONAL for now (OMDB not configured yet)
  ) {
    this.db = db;
    this.metadataEnrichmentService = metadataEnrichmentService || null;
    const cacheDir = path.join(process.cwd(), 'data', 'cache');
    const tempDir = path.join(process.cwd(), 'data', 'temp');

    this.providerFetchPhase = new ProviderFetchPhase(db, dbManager);
    this.cacheMatchingPhase = new CacheMatchingPhase(db);
    this.assetAnalysisPhase = new AssetAnalysisPhase(db, tempDir);
    this.assetSelectionPhase = new AssetSelectionPhase(db, dbManager, cacheDir);
    this.actorEnrichmentPhase = new ActorEnrichmentPhase(db, cacheDir);

    // Initialize trailer phases
    const trailerDownloadService = new TrailerDownloadService();
    const trailerSelectionService = new TrailerSelectionService();
    this.trailerAnalysisPhase = new TrailerAnalysisPhase(db, trailerDownloadService);
    this.trailerSelectionPhase = new TrailerSelectionPhase(db, trailerSelectionService);
  }

  /**
   * Execute full enrichment workflow
   *
   * @param config - Enrichment configuration
   * @returns Enrichment result
   */
  async enrich(config: EnrichmentConfig): Promise<EnrichmentResult> {
    const { entityId, entityType, requireComplete = false } = config;
    const errors: string[] = [];
    let metadataResult: any = null;

    try {
      logger.info('[EnrichmentOrchestrator] Starting unified enrichment', {
        entityType,
        entityId,
        requireComplete,
        manual: config.manual,
        forceRefresh: config.forceRefresh,
      });

      // PHASE 0: Metadata Enrichment (NEW)
      if (this.metadataEnrichmentService && entityType === 'movie') {
        logger.info('[EnrichmentOrchestrator] Phase 0: Metadata Enrichment');

        try {
          metadataResult = await this.metadataEnrichmentService.enrichMovie(
            entityId,
            requireComplete
          );

          logger.info('[EnrichmentOrchestrator] Metadata enrichment complete', {
            updated: metadataResult.updated,
            partial: metadataResult.partial,
            rateLimitedProviders: metadataResult.rateLimitedProviders,
            changedFields: metadataResult.changedFields,
            completeness: metadataResult.completeness,
          });

          // If requireComplete=true and rate limited without update → STOP
          if (
            requireComplete &&
            metadataResult.rateLimitedProviders.length > 0 &&
            !metadataResult.updated
          ) {
            logger.warn('[EnrichmentOrchestrator] Bulk mode - stopping due to metadata rate limit', {
              entityId,
              rateLimitedProviders: metadataResult.rateLimitedProviders,
            });

            return {
              success: false,
              partial: false,
              rateLimitedProviders: metadataResult.rateLimitedProviders,
              metadataChanged: [],
              assetsChanged: [],
              assetsFetched: 0,
              assetsSelected: 0,
              message: `Rate limited: ${metadataResult.rateLimitedProviders.join(', ')}`,
            };
          }
        } catch (error) {
          logger.error('[EnrichmentOrchestrator] Metadata enrichment failed', {
            error: getErrorMessage(error),
          });
          errors.push(`Metadata enrichment failed: ${getErrorMessage(error)}`);
          // Continue to asset enrichment even if metadata fails
        }
      }

      // Phase 1: Fetch provider metadata and asset URLs
      logger.info('[EnrichmentOrchestrator] Phase 1: Provider Fetch');
      const phase1Result = await this.providerFetchPhase.execute(config);
      logger.info('[EnrichmentOrchestrator] Phase 1 complete', {
        assetsFetched: phase1Result.assetsFetched,
      });

      // Phase 2: Match existing cache files to provider assets
      logger.info('[EnrichmentOrchestrator] Phase 2: Cache Matching');
      const phase2Result = await this.cacheMatchingPhase.execute(config);
      logger.info('[EnrichmentOrchestrator] Phase 2 complete', {
        assetsMatched: phase2Result.assetsMatched,
      });

      // Phase 3: Download and analyze unanalyzed assets
      logger.info('[EnrichmentOrchestrator] Phase 3: Asset Analysis');
      const phase3Result = await this.assetAnalysisPhase.execute(config);
      logger.info('[EnrichmentOrchestrator] Phase 3 complete', {
        assetsAnalyzed: phase3Result.assetsAnalyzed,
      });

      // Phase 5: Intelligent asset selection (includes scoring)
      logger.info('[EnrichmentOrchestrator] Phase 5: Asset Selection');
      const phase5Result = await this.assetSelectionPhase.execute(config);
      logger.info('[EnrichmentOrchestrator] Phase 5 complete', {
        assetsSelected: phase5Result.assetsSelected,
      });

      // Phase 5C: Download actor thumbnails
      logger.info('[EnrichmentOrchestrator] Phase 5C: Actor Enrichment');
      const phase5CResult = await this.actorEnrichmentPhase.execute(config);
      logger.info('[EnrichmentOrchestrator] Phase 5C complete', {
        thumbnailsDownloaded: phase5CResult.thumbnailsDownloaded,
      });

      // Phase 6: Trailer Analysis (analyze trailers from provider cache via yt-dlp)
      let phase6Result = { trailersAnalyzed: 0, trailersSkipped: 0 };
      let phase7Result = { selected: false, candidateId: null as number | null, score: null as number | null };

      // Check if trailers are enabled before running trailer phases
      const trailersEnabled = await this.isTrailersEnabled();
      if (trailersEnabled && entityType === 'movie') {
        logger.info('[EnrichmentOrchestrator] Phase 6: Trailer Analysis');
        try {
          phase6Result = await this.trailerAnalysisPhase.execute(config);
          logger.info('[EnrichmentOrchestrator] Phase 6 complete', {
            trailersAnalyzed: phase6Result.trailersAnalyzed,
            trailersSkipped: phase6Result.trailersSkipped,
          });
        } catch (error) {
          logger.error('[EnrichmentOrchestrator] Phase 6 failed (non-fatal)', {
            error: getErrorMessage(error),
          });
          errors.push(`Trailer analysis failed: ${getErrorMessage(error)}`);
        }

        // Phase 7: Trailer Selection (score and select best trailer)
        logger.info('[EnrichmentOrchestrator] Phase 7: Trailer Selection');
        try {
          phase7Result = await this.trailerSelectionPhase.execute(config);
          logger.info('[EnrichmentOrchestrator] Phase 7 complete', {
            selected: phase7Result.selected,
            candidateId: phase7Result.candidateId,
            score: phase7Result.score,
          });
        } catch (error) {
          logger.error('[EnrichmentOrchestrator] Phase 7 failed (non-fatal)', {
            error: getErrorMessage(error),
          });
          errors.push(`Trailer selection failed: ${getErrorMessage(error)}`);
        }
      } else if (!trailersEnabled) {
        logger.debug('[EnrichmentOrchestrator] Trailer phases skipped (trailers disabled)');
      }

      // Update entity enrichment status
      await this.updateEnrichmentStatus(entityType, entityId);

      logger.info('[EnrichmentOrchestrator] Enrichment workflow complete', {
        entityType,
        entityId,
        metadataChanged: metadataResult?.changedFields?.length || 0,
        assetsFetched: phase1Result.assetsFetched,
        assetsMatched: phase2Result.assetsMatched,
        assetsAnalyzed: phase3Result.assetsAnalyzed,
        assetsSelected: phase5Result.assetsSelected,
        thumbnailsDownloaded: phase5CResult.thumbnailsDownloaded,
        trailersAnalyzed: phase6Result.trailersAnalyzed,
        trailerSelected: phase7Result.selected,
      });

      return {
        success: true,
        partial: metadataResult?.partial || false,
        rateLimitedProviders: metadataResult?.rateLimitedProviders || [],
        metadataChanged: metadataResult?.changedFields || [],
        assetsChanged: [], // TODO: Track asset changes in future
        completeness: metadataResult?.completeness,
        assetsFetched: phase1Result.assetsFetched,
        assetsSelected: phase5Result.assetsSelected,
        thumbnailsDownloaded: phase5CResult.thumbnailsDownloaded,
        trailersAnalyzed: phase6Result.trailersAnalyzed,
        trailerSelected: phase7Result.selected,
        ...(errors.length > 0 && { errors }),
      };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.error('[EnrichmentOrchestrator] Enrichment workflow failed', {
        entityType,
        entityId,
        error: errorMessage,
      });
      errors.push(errorMessage);

      return {
        success: false,
        partial: false,
        rateLimitedProviders: [],
        assetsFetched: 0,
        assetsSelected: 0,
        errors,
      };
    }
  }

  /**
   * Update entity enrichment status to 'enriched'
   */
  private async updateEnrichmentStatus(entityType: string, entityId: number): Promise<void> {
    try {
      const table = this.getTableForEntityType(entityType);
      if (!table) {
        logger.warn('[EnrichmentOrchestrator] Unknown entity type, cannot update status', {
          entityType,
        });
        return;
      }

      await this.db.execute(
        `UPDATE ${table} SET identification_status = 'enriched', enriched_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [entityId]
      );

      logger.info('[EnrichmentOrchestrator] Updated enrichment status', {
        entityType,
        entityId,
        status: 'enriched',
      });
    } catch (error) {
      logger.error('[EnrichmentOrchestrator] Failed to update enrichment status', {
        entityType,
        entityId,
        error: getErrorMessage(error),
      });
      // Don't throw - status update failure shouldn't fail enrichment
    }
  }

  /**
   * Get database table name for entity type
   */
  private getTableForEntityType(entityType: string): string | null {
    const tableMap: Record<string, string> = {
      movie: 'movies',
      series: 'series',
      season: 'seasons',
      episode: 'episodes',
      artist: 'artists',
      album: 'albums',
      actor: 'actors',
    };
    return tableMap[entityType] || null;
  }

  /**
   * Check if trailers are enabled in settings
   * Defaults to true if setting doesn't exist
   */
  private async isTrailersEnabled(): Promise<boolean> {
    try {
      const result = await this.db.get<{ value: string }>(
        `SELECT value FROM app_settings WHERE key = 'movies.trailers.enabled'`
      );
      // Default to true if setting doesn't exist
      if (!result) return true;
      return result.value === 'true';
    } catch (error) {
      logger.warn('[EnrichmentOrchestrator] Failed to check trailers enabled setting, defaulting to true', {
        error: getErrorMessage(error),
      });
      return true;
    }
  }
}
