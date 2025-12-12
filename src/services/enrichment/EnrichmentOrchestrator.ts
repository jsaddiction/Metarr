/**
 * Enrichment Orchestrator
 *
 * Coordinates the enrichment workflow per docs/concepts/Enrichment/:
 * - Phase 1: Provider Fetch (SCRAPING - metadata + asset URLs from ProviderCacheOrchestrator)
 * - Phase 2: Asset Selection (DOWNLOADING + CACHING - score, download, dedupe, cache)
 * - Phase 3: Actor Enrichment (download actor thumbnails)
 * - Phase 4: Trailer Analysis (analyze trailer candidates via yt-dlp)
 * - Phase 5: Trailer Selection (score and select best trailer)
 */

import { DatabaseConnection } from '../../types/database.js';
import { DatabaseManager } from '../../database/DatabaseManager.js';
import { ProviderFetchPhase } from './phases/ProviderFetchPhase.js';
import { AssetSelectionPhase } from './phases/AssetSelectionPhase.js';
import { ActorEnrichmentPhase } from './phases/ActorEnrichmentPhase.js';
import { TrailerAnalysisPhase } from './phases/TrailerAnalysisPhase.js';
import { TrailerSelectionPhase } from './phases/TrailerSelectionPhase.js';
import { TrailerDownloadService } from '../trailers/TrailerDownloadService.js';
import { TrailerSelectionService } from '../trailers/TrailerSelectionService.js';
import { AssetConfigService } from '../assetConfigService.js';
import { EnrichmentConfig, EnrichmentResult } from './types.js';
import { logger } from '../../middleware/logging.js';
import { getErrorMessage } from '../../utils/errorHandling.js';
import path from 'path';

export class EnrichmentOrchestrator {
  private readonly providerFetchPhase: ProviderFetchPhase;
  private readonly assetSelectionPhase: AssetSelectionPhase;
  private readonly actorEnrichmentPhase: ActorEnrichmentPhase;
  private readonly trailerAnalysisPhase: TrailerAnalysisPhase;
  private readonly trailerSelectionPhase: TrailerSelectionPhase;
  private readonly assetConfigService: AssetConfigService;
  private readonly db: DatabaseConnection;

  constructor(db: DatabaseConnection, dbManager: DatabaseManager) {
    this.db = db;
    this.assetConfigService = new AssetConfigService(dbManager);
    const cacheDir = path.join(process.cwd(), 'data', 'cache');
    const tempDir = path.join(process.cwd(), 'data', 'temp');

    this.providerFetchPhase = new ProviderFetchPhase(db, dbManager);
    this.assetSelectionPhase = new AssetSelectionPhase(db, dbManager, cacheDir, tempDir);
    this.actorEnrichmentPhase = new ActorEnrichmentPhase(db, cacheDir);

    // Initialize trailer phases
    const trailerDownloadService = new TrailerDownloadService();
    const trailerSelectionService = new TrailerSelectionService();
    this.trailerAnalysisPhase = new TrailerAnalysisPhase(db, trailerDownloadService);
    this.trailerSelectionPhase = new TrailerSelectionPhase(db, trailerSelectionService, trailerDownloadService);
  }

  /**
   * Execute full enrichment workflow
   *
   * @param config - Enrichment configuration
   * @returns Enrichment result
   */
  async enrich(config: EnrichmentConfig): Promise<EnrichmentResult> {
    const { entityId, entityType } = config;
    const errors: string[] = [];

    try {
      logger.info('[EnrichmentOrchestrator] Starting enrichment', {
        entityType,
        entityId,
        manual: config.manual,
        forceRefresh: config.forceRefresh,
      });

      // Phase 1: SCRAPING - Fetch provider metadata and asset URLs
      logger.info('[EnrichmentOrchestrator] Phase 1: Provider Fetch (SCRAPING)');
      const phase1Result = await this.providerFetchPhase.execute(config);
      logger.info('[EnrichmentOrchestrator] Phase 1 complete', {
        assetsFetched: phase1Result.assetsFetched,
      });

      // Phase 2: DOWNLOADING + CACHING - Score, download in ranked order, dedupe, cache
      logger.info('[EnrichmentOrchestrator] Phase 2: Asset Selection (DOWNLOADING + CACHING)');
      const phase2Result = await this.assetSelectionPhase.execute(config);
      logger.info('[EnrichmentOrchestrator] Phase 2 complete', {
        assetsSelected: phase2Result.assetsSelected,
      });

      // Phase 3: Download actor thumbnails
      logger.info('[EnrichmentOrchestrator] Phase 3: Actor Enrichment');
      const phase3Result = await this.actorEnrichmentPhase.execute(config);
      logger.info('[EnrichmentOrchestrator] Phase 3 complete', {
        thumbnailsDownloaded: phase3Result.thumbnailsDownloaded,
      });

      // Phase 4: Trailer Analysis (analyze trailers from provider cache via yt-dlp)
      let phase4Result = { trailersAnalyzed: 0, trailersSkipped: 0 };
      let phase5Result = {
        selected: false,
        candidateId: null as number | null,
        score: null as number | null,
      };

      // Check if trailers are enabled before running trailer phases
      const trailersEnabled = await this.isTrailersEnabled();
      if (trailersEnabled && entityType === 'movie') {
        logger.info('[EnrichmentOrchestrator] Phase 4: Trailer Analysis');
        try {
          phase4Result = await this.trailerAnalysisPhase.execute(config);
          logger.info('[EnrichmentOrchestrator] Phase 4 complete', {
            trailersAnalyzed: phase4Result.trailersAnalyzed,
            trailersSkipped: phase4Result.trailersSkipped,
          });
        } catch (error) {
          logger.error('[EnrichmentOrchestrator] Phase 4 failed (non-fatal)', {
            error: getErrorMessage(error),
          });
          errors.push(`Trailer analysis failed: ${getErrorMessage(error)}`);
        }

        // Phase 5: Trailer Selection (score and select best trailer)
        logger.info('[EnrichmentOrchestrator] Phase 5: Trailer Selection');
        try {
          phase5Result = await this.trailerSelectionPhase.execute(config);
          logger.info('[EnrichmentOrchestrator] Phase 5 complete', {
            selected: phase5Result.selected,
            candidateId: phase5Result.candidateId,
            score: phase5Result.score,
          });
        } catch (error) {
          logger.error('[EnrichmentOrchestrator] Phase 5 failed (non-fatal)', {
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
        assetsFetched: phase1Result.assetsFetched,
        assetsSelected: phase2Result.assetsSelected,
        thumbnailsDownloaded: phase3Result.thumbnailsDownloaded,
        trailersAnalyzed: phase4Result.trailersAnalyzed,
        trailerSelected: phase5Result.selected,
      });

      return {
        success: true,
        partial: false,
        rateLimitedProviders: [],
        assetsFetched: phase1Result.assetsFetched,
        assetsSelected: phase2Result.assetsSelected,
        thumbnailsDownloaded: phase3Result.thumbnailsDownloaded,
        trailersAnalyzed: phase4Result.trailersAnalyzed,
        trailerSelected: phase5Result.selected,
        selectedTrailerCandidateId: phase5Result.candidateId,
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
   * Check if trailers are enabled via asset limit
   * Trailers are enabled if their asset limit > 0
   */
  private async isTrailersEnabled(): Promise<boolean> {
    try {
      return await this.assetConfigService.isAssetTypeEnabled('trailer');
    } catch (error) {
      logger.warn('[EnrichmentOrchestrator] Failed to check trailer asset limit, defaulting to true', {
        error: getErrorMessage(error),
      });
      return true;
    }
  }
}
