/**
 * Enrichment Orchestrator
 *
 * Coordinates the 5-phase enrichment workflow:
 * - Phase 1: Provider Fetch (metadata + asset URLs)
 * - Phase 2: Cache Matching (link existing cache to providers)
 * - Phase 3: Asset Analysis (download + analyze unanalyzed assets)
 * - Phase 4: Asset Scoring (integrated into Phase 5)
 * - Phase 5: Asset Selection (intelligent selection with dedup)
 * - Phase 5C: Actor Enrichment (download actor thumbnails)
 */

import { DatabaseConnection } from '../../types/database.js';
import { DatabaseManager } from '../../database/DatabaseManager.js';
import { ProviderFetchPhase } from './phases/ProviderFetchPhase.js';
import { CacheMatchingPhase } from './phases/CacheMatchingPhase.js';
import { AssetAnalysisPhase } from './phases/AssetAnalysisPhase.js';
import { AssetSelectionPhase } from './phases/AssetSelectionPhase.js';
import { ActorEnrichmentPhase } from './phases/ActorEnrichmentPhase.js';
import { EnrichmentConfig, EnrichmentResult } from './types.js';
import { logger } from '../../middleware/logging.js';
import { getErrorMessage } from '../../utils/errorHandling.js';
import path from 'path';

export class EnrichmentOrchestrator {
  private readonly providerFetchPhase: ProviderFetchPhase;
  private readonly cacheMatchingPhase: CacheMatchingPhase;
  private readonly assetAnalysisPhase: AssetAnalysisPhase;
  private readonly assetSelectionPhase: AssetSelectionPhase;
  private readonly actorEnrichmentPhase: ActorEnrichmentPhase;

  constructor(
    db: DatabaseConnection,
    dbManager: DatabaseManager
  ) {
    const cacheDir = path.join(process.cwd(), 'data', 'cache');
    const tempDir = path.join(process.cwd(), 'data', 'temp');

    this.providerFetchPhase = new ProviderFetchPhase(db, dbManager);
    this.cacheMatchingPhase = new CacheMatchingPhase(db);
    this.assetAnalysisPhase = new AssetAnalysisPhase(db, tempDir);
    this.assetSelectionPhase = new AssetSelectionPhase(db, dbManager, cacheDir);
    this.actorEnrichmentPhase = new ActorEnrichmentPhase(db, cacheDir);
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
      logger.info('[EnrichmentOrchestrator] Starting enrichment workflow', {
        entityType,
        entityId,
        manual: config.manual,
        forceRefresh: config.forceRefresh,
      });

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

      logger.info('[EnrichmentOrchestrator] Enrichment workflow complete', {
        entityType,
        entityId,
        assetsFetched: phase1Result.assetsFetched,
        assetsMatched: phase2Result.assetsMatched,
        assetsAnalyzed: phase3Result.assetsAnalyzed,
        assetsSelected: phase5Result.assetsSelected,
        thumbnailsDownloaded: phase5CResult.thumbnailsDownloaded,
      });

      return {
        success: true,
        assetsSelected: phase5Result.assetsSelected,
        errors,
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
        assetsSelected: 0,
        errors,
      };
    }
  }
}
