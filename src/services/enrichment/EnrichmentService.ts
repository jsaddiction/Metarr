/**
 * Enrichment Service
 *
 * Orchestrates the 5-phase enrichment workflow:
 * 1. Fetch provider metadata & save to provider_assets
 * 2. Match cache assets to providers via perceptual hash
 * 3. Download & analyze unanalyzed assets (temp files only)
 * 4. Calculate scores (0-100 algorithm)
 * 5. Intelligent selection (top N per type, auto-evict lower-ranked)
 */

import { DatabaseConnection } from '../../types/database.js';
import { ProviderAssetsRepository } from './ProviderAssetsRepository.js';
import { ProviderCacheManager } from '../providers/ProviderCacheManager.js';
import { ProviderCacheOrchestrator } from '../providers/ProviderCacheOrchestrator.js';
// import { FetchOrchestrator } from '../providers/FetchOrchestrator.js'; // Legacy - no longer used
// import { ProviderRegistry } from '../providers/ProviderRegistry.js'; // Legacy - no longer used
// import { ProviderConfigService } from '../providerConfigService.js'; // Legacy - no longer used
import { AssetConfigService } from '../assetConfigService.js';
import { DatabaseManager } from '../../database/DatabaseManager.js';
// import { AssetType } from '../../types/providers/capabilities.js'; // Unused currently
import { EnrichmentPhaseConfig, DEFAULT_PHASE_CONFIG } from '../../config/phaseConfig.js';
import { hashFile } from '../hash/hashService.js';
import { computePerceptualHash, hammingDistance } from '../../utils/imageHash.js';
import { normalizeActorName } from '../../utils/actorNameUtils.js';
import { extractMediaInfo } from '../media/ffprobeService.js';
import { websocketBroadcaster } from '../websocketBroadcaster.js';
import { logger } from '../../middleware/logging.js';
import { getErrorMessage } from '../../utils/errorHandling.js';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import pMap from 'p-map';
import axios from 'axios';
import sharp from 'sharp';

export interface EnrichmentConfig {
  entityId: number;
  entityType: 'movie' | 'episode' | 'series';
  manual: boolean; // User-triggered (true) vs automated (false)
  forceRefresh: boolean; // Bypass 7-day cache check
  phaseConfig?: EnrichmentPhaseConfig; // Optional phase configuration (uses defaults if not provided)
}

export interface EnrichmentResult {
  success: boolean;
  assetsSelected: number;
  errors: string[];
}

interface AssetMetadata {
  width: number;
  height: number;
  duration?: number | undefined;
  mimeType: string;
  size: number;
  isImage: boolean;
}

export class EnrichmentService {
  private providerAssetsRepo: ProviderAssetsRepository;
  // private providerCacheManager: ProviderCacheManager; // Legacy - keeping for backward compatibility
  private providerCacheOrchestrator: ProviderCacheOrchestrator;
  private tempDir: string;

  constructor(
    private db: DatabaseConnection,
    private dbManager: DatabaseManager,
    cacheDir: string,
    providerCacheManager?: ProviderCacheManager
  ) {
    this.providerAssetsRepo = new ProviderAssetsRepository(db);
    this.tempDir = path.join(path.dirname(cacheDir), 'temp');

    // Initialize new provider cache orchestrator (multi-provider with timeout)
    this.providerCacheOrchestrator = new ProviderCacheOrchestrator(dbManager);

    // Legacy support - ProviderCacheManager no longer used in Phase 1
    // Keeping parameter for backward compatibility
    if (providerCacheManager) {
      // Injected but not used
    }
  }

  /**
   * Main enrichment workflow - orchestrates all 5 phases
   */
  async enrich(config: EnrichmentConfig): Promise<EnrichmentResult> {
    const startTime = Date.now();
    const errors: string[] = [];

    // Use provided phase config or defaults
    const phaseConfig = config.phaseConfig || DEFAULT_PHASE_CONFIG.enrichment;

    logger.info('[EnrichmentService] Starting enrichment workflow', {
      entityType: config.entityType,
      entityId: config.entityId,
      manual: config.manual,
      forceRefresh: config.forceRefresh,
      fetchProviderAssets: phaseConfig.fetchProviderAssets,
      autoSelectAssets: phaseConfig.autoSelectAssets,
    });

    // Emit start event
    websocketBroadcaster.broadcast('enrichment.started', {
      entityType: config.entityType,
      entityId: config.entityId,
    });

    try {
      // Ensure temp directory exists
      await this.ensureTempDir();

      // Phase 1: Fetch provider metadata & save to provider_assets
      // Can be disabled via phaseConfig.fetchProviderAssets
      let phase1Result = { assetsFetched: 0 };
      if (phaseConfig.fetchProviderAssets) {
        logger.info('[EnrichmentService] Phase 1: Fetch provider metadata');
        phase1Result = await this.phase1FetchProviderAssets(config);
        websocketBroadcaster.broadcast('enrichment.phase.complete', {
          entityType: config.entityType,
          entityId: config.entityId,
          phase: 1,
          assetsFetched: phase1Result.assetsFetched,
        });
      } else {
        logger.info('[EnrichmentService] Phase 1: Skipped (fetchProviderAssets=false)');
      }

      // Phase 2: Match cache assets to providers
      logger.info('[EnrichmentService] Phase 2: Match cache assets');
      const phase2Result = await this.phase2MatchCacheAssets(config);
      websocketBroadcaster.broadcast('enrichment.phase.complete', {
        entityType: config.entityType,
        entityId: config.entityId,
        phase: 2,
        assetsMatched: phase2Result.assetsMatched,
      });

      // Phase 3: Download & analyze unanalyzed assets
      logger.info('[EnrichmentService] Phase 3: Download & analyze assets');
      const phase3Result = await this.phase3DownloadAndAnalyze(config);
      websocketBroadcaster.broadcast('enrichment.phase.complete', {
        entityType: config.entityType,
        entityId: config.entityId,
        phase: 3,
        assetsAnalyzed: phase3Result.assetsAnalyzed,
      });

      // Phase 4: Calculate scores
      logger.info('[EnrichmentService] Phase 4: Calculate scores');
      const phase4Result = await this.phase4CalculateScores(config);
      websocketBroadcaster.broadcast('enrichment.phase.complete', {
        entityType: config.entityType,
        entityId: config.entityId,
        phase: 4,
        assetsScored: phase4Result.assetsScored,
      });

      // Phase 5: Intelligent selection
      // Can be disabled via phaseConfig.autoSelectAssets (user picks manually in UI)
      let phase5Result = { assetsSelected: 0 };
      if (phaseConfig.autoSelectAssets) {
        logger.info('[EnrichmentService] Phase 5: Intelligent selection');
        phase5Result = await this.phase5IntelligentSelection(config);
        websocketBroadcaster.broadcast('enrichment.phase.complete', {
          entityType: config.entityType,
          entityId: config.entityId,
          phase: 5,
          assetsSelected: phase5Result.assetsSelected,
        });
      } else {
        logger.info('[EnrichmentService] Phase 5: Skipped (autoSelectAssets=false - user will select manually)');
      }

      // Phase 5B: Download selected assets to cache (ALWAYS runs)
      // This ensures selected assets are available for publishing
      logger.info('[EnrichmentService] Phase 5B: Download selected assets to cache');
      const phase5BResult = await this.phase5BDownloadSelectedToCache(config);
      websocketBroadcaster.broadcast('enrichment.phase.complete', {
        entityType: config.entityType,
        entityId: config.entityId,
        phase: '5B',
        assetsDownloaded: phase5BResult.assetsDownloaded,
      });

      // Phase 5C: Download actor thumbnails to cache (ALWAYS runs for movies)
      // This ensures actor images are available in UI immediately after enrichment
      if (config.entityType === 'movie') {
        logger.info('[EnrichmentService] Phase 5C: Download actor thumbnails to cache');
        const phase5CResult = await this.phase5CDownloadActorThumbnails(config);
        websocketBroadcaster.broadcast('enrichment.phase.complete', {
          entityType: config.entityType,
          entityId: config.entityId,
          phase: '5C',
          actorThumbnailsDownloaded: phase5CResult.thumbnailsDownloaded,
        });
      }

      // Update entity enrichment timestamp
      await this.updateEnrichmentTimestamp(config);

      const duration = Date.now() - startTime;
      logger.info('[EnrichmentService] Enrichment complete', {
        entityType: config.entityType,
        entityId: config.entityId,
        assetsSelected: phase5Result.assetsSelected,
        durationMs: duration,
      });

      // Emit complete event
      websocketBroadcaster.broadcast('enrichment.complete', {
        entityType: config.entityType,
        entityId: config.entityId,
        assetsSelected: phase5Result.assetsSelected,
        durationMs: duration,
      });

      return {
        success: true,
        assetsSelected: phase5Result.assetsSelected,
        errors,
      };
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      errors.push(errorMsg);

      logger.error('[EnrichmentService] Enrichment failed', {
        entityType: config.entityType,
        entityId: config.entityId,
        error: errorMsg,
      });

      // Emit failed event
      websocketBroadcaster.broadcast('enrichment.failed', {
        entityType: config.entityType,
        entityId: config.entityId,
        error: errorMsg,
      });

      return {
        success: false,
        assetsSelected: 0,
        errors,
      };
    }
  }

  /**
   * Phase 1: Fetch provider metadata using ProviderCacheOrchestrator
   *
   * NEW: Uses comprehensive provider cache (provider_cache_*) tables
   * - Fetches from ALL providers in parallel with timeout
   * - Caches complete metadata (not just URLs)
   * - Automatically merges images from TMDB + Fanart.tv
   * - Respects 7-day cache TTL
   *
   * Then populates provider_assets for downstream scoring/selection
   */
  private async phase1FetchProviderAssets(
    config: EnrichmentConfig
  ): Promise<{ assetsFetched: number }> {
    try {
      const { entityId, entityType, manual, forceRefresh } = config;

      // Only support movies for now (TV/music later)
      if (entityType !== 'movie') {
        logger.warn('[EnrichmentService] Phase 1 only supports movies currently', {
          entityType,
          entityId,
        });
        return { assetsFetched: 0 };
      }

      // Get entity details
      const entity = await this.getEntity(entityId, entityType);
      if (!entity) {
        throw new Error(`Entity not found: ${entityType} ${entityId}`);
      }

      // Check if entity is monitored (automated jobs only)
      if (!manual && !entity.monitored) {
        logger.info('[EnrichmentService] Skipping unmonitored entity', {
          entityType,
          entityId,
        });
        return { assetsFetched: 0 };
      }

      // Step 1: Fetch from provider cache orchestrator (TMDB + Fanart.tv in parallel)
      logger.info('[EnrichmentService] Fetching from provider cache', {
        entityId,
        tmdb_id: entity.tmdb_id,
        imdb_id: entity.imdb_id,
        forceRefresh,
      });

      // Build lookup params (only include defined IDs)
      const lookupParams: any = {};
      if (entity.tmdb_id) lookupParams.tmdb_id = entity.tmdb_id;
      if (entity.imdb_id) lookupParams.imdb_id = entity.imdb_id;
      if (entity.tvdb_id) lookupParams.tvdb_id = entity.tvdb_id;

      const fetchResult = await this.providerCacheOrchestrator.getMovieData(
        lookupParams,
        {
          forceRefresh,
          includeImages: true,
          includeVideos: true,
          includeCast: true,
          includeCrew: true,
        }
      );

      if (!fetchResult.data) {
        logger.warn('[EnrichmentService] Provider cache returned no data', {
          entityType,
          entityId,
        });
        return { assetsFetched: 0 };
      }

      const cachedMovie = fetchResult.data;

      logger.info('[EnrichmentService] Provider cache fetch complete', {
        entityId,
        source: fetchResult.metadata.source,
        providers: fetchResult.metadata.providers,
        cacheAge: fetchResult.metadata.cacheAge,
        imageCount: cachedMovie.images?.length || 0,
        videoCount: cachedMovie.videos?.length || 0,
        castCount: cachedMovie.cast?.length || 0,
      });

      // Step 2: Copy metadata to movies table (respecting field locks)
      await this.copyMetadataToMovie(entityId, cachedMovie);

      // Step 2B: Copy cast/crew to actors/movie_actors tables
      await this.copyCastToActors(entityId, cachedMovie);

      // Step 3: Populate provider_assets from cached images for downstream scoring
      let assetsFetched = 0;

      if (cachedMovie.images) {
        for (const image of cachedMovie.images) {
          // Map provider image type to our asset type (e.g., backdrop → fanart)
          const assetType = this.mapProviderImageType(image.image_type);
          if (!assetType) {
            // Skip unsupported types (e.g., profile - handled separately for actors)
            logger.debug('[EnrichmentService] Skipping unsupported image type', {
              imageType: image.image_type,
              provider: image.provider_name,
            });
            continue;
          }

          // Convert relative path to full URL (must be done before checking if exists)
          const fullUrl = this.buildProviderImageUrl(image.provider_name, image.file_path);

          // Check if already exists using the FULL URL
          const existing = await this.providerAssetsRepo.findByUrl(
            fullUrl,
            entityId,
            entityType
          );

          if (existing && !manual) {
            // Automated job: skip known assets
            continue;
          }

          if (existing && manual) {
            // Manual job: update with fresh metadata
            await this.providerAssetsRepo.update(existing.id, {
              width: image.width || undefined,
              height: image.height || undefined,
              provider_metadata: JSON.stringify({
                vote_average: image.vote_average,
                vote_count: image.vote_count,
                likes: image.likes,
                iso_639_1: image.iso_639_1,
                is_hd: image.is_hd,
              }),
            });
          } else {
            // New asset: insert
            await this.providerAssetsRepo.create({
              entity_type: entityType,
              entity_id: entityId,
              asset_type: assetType,
              provider_name: image.provider_name,
              provider_url: fullUrl,
              width: image.width || undefined,
              height: image.height || undefined,
              provider_metadata: JSON.stringify({
                vote_average: image.vote_average,
                vote_count: image.vote_count,
                likes: image.likes,
                iso_639_1: image.iso_639_1,
                is_hd: image.is_hd,
              }),
            });
            assetsFetched++;
          }
        }
      }

      logger.info('[EnrichmentService] Phase 1 complete', {
        entityType,
        entityId,
        assetsFetched,
        source: fetchResult.metadata.source,
        providers: fetchResult.metadata.providers,
      });

      return { assetsFetched };
    } catch (error) {
      logger.error('[EnrichmentService] Phase 1 failed', {
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Phase 2: Match cache assets to providers via perceptual hash
   */
  private async phase2MatchCacheAssets(
    config: EnrichmentConfig
  ): Promise<{ assetsMatched: number }> {
    try {
      const { entityId, entityType } = config;
      let assetsMatched = 0;

      // Get all cached image files for this entity
      const cacheFiles = await this.db.query<{
        id: number;
        file_path: string;
        image_type: string;
        file_hash: string | null;
        perceptual_hash: string | null;
      }>(
        `SELECT id, file_path, image_type, file_hash, perceptual_hash
         FROM cache_image_files
         WHERE entity_type = ? AND entity_id = ? AND file_path IS NOT NULL`,
        [entityType, entityId]
      );

      logger.debug('[EnrichmentService] Found cache files', {
        entityType,
        entityId,
        count: cacheFiles.length,
      });

      // Match each cache file to provider assets
      for (const cacheFile of cacheFiles) {
        if (!cacheFile.perceptual_hash) {
          logger.debug('[EnrichmentService] Cache file missing perceptual hash, skipping', {
            cacheFileId: cacheFile.id,
          });
          continue;
        }

        // Get all provider assets of the same type
        const candidates = await this.providerAssetsRepo.findByAssetType(
          entityId,
          entityType,
          cacheFile.image_type
        );

        // Find best match using perceptual hash
        let bestMatch: { asset: any; distance: number } | null = null;

        for (const candidate of candidates) {
          if (!candidate.perceptual_hash) continue;

          const distance = hammingDistance(cacheFile.perceptual_hash, candidate.perceptual_hash);

          if (distance < 10 && (!bestMatch || distance < bestMatch.distance)) {
            bestMatch = { asset: candidate, distance };
          }
        }

        if (bestMatch) {
          // Link cache file to provider asset
          await this.providerAssetsRepo.update(bestMatch.asset.id, {
            is_downloaded: 1,
            content_hash: cacheFile.file_hash ?? undefined,
            analyzed: 1,
            analyzed_at: new Date(),
          });

          // Update cache file with provider info
          await this.db.execute(
            `UPDATE cache_image_files
             SET provider_name = ?, source_url = ?
             WHERE id = ?`,
            [bestMatch.asset.provider_name, bestMatch.asset.provider_url, cacheFile.id]
          );

          assetsMatched++;

          logger.debug('[EnrichmentService] Matched cache file to provider asset', {
            cacheFileId: cacheFile.id,
            providerAssetId: bestMatch.asset.id,
            hammingDistance: bestMatch.distance,
          });
        }
      }

      logger.info('[EnrichmentService] Phase 2 complete', {
        entityType,
        entityId,
        assetsMatched,
      });

      return { assetsMatched };
    } catch (error) {
      logger.error('[EnrichmentService] Phase 2 failed', {
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Phase 3: Download & analyze unanalyzed assets (temp files only)
   */
  private async phase3DownloadAndAnalyze(
    config: EnrichmentConfig
  ): Promise<{ assetsAnalyzed: number }> {
    try {
      const { entityId, entityType } = config;

      // Get all unanalyzed assets
      const unanalyzed = await this.providerAssetsRepo.findUnanalyzed(entityId, entityType);

      if (unanalyzed.length === 0) {
        logger.info('[EnrichmentService] No unanalyzed assets', {
          entityType,
          entityId,
        });
        return { assetsAnalyzed: 0 };
      }

      logger.info('[EnrichmentService] Analyzing assets', {
        entityType,
        entityId,
        count: unanalyzed.length,
      });

      // Process up to 10 assets concurrently
      let assetsAnalyzed = 0;

      await pMap(
        unanalyzed,
        async (asset) => {
          const tempPath = path.join(this.tempDir, `metarr-analyze-${crypto.randomUUID()}.tmp`);

          try {
            // Download to temp
            await this.downloadFile(asset.provider_url, tempPath);

            // Analyze based on asset type
            let metadata: AssetMetadata;
            let perceptualHash: string | undefined;

            if (asset.asset_type === 'trailer' || asset.asset_type === 'sample') {
              // Video analysis
              metadata = await this.analyzeVideo(tempPath);
            } else {
              // Image analysis
              metadata = await this.analyzeImage(tempPath);
              perceptualHash = await computePerceptualHash(tempPath);
            }

            // Calculate content hash
            const hashResult = await hashFile(tempPath);

            // Check if this asset already exists in cache
            const cachedFile = await this.db.get<{ id: number }>(
              `SELECT id FROM cache_image_files WHERE file_hash = ?`,
              [hashResult.hash]
            );

            // Update provider_assets with actual metadata
            await this.providerAssetsRepo.update(asset.id, {
              width: metadata.width,
              height: metadata.height,
              duration_seconds: metadata.duration ?? undefined,
              content_hash: hashResult.hash,
              perceptual_hash: perceptualHash ?? undefined,
              mime_type: metadata.mimeType,
              file_size: metadata.size,
              analyzed: 1,
              analyzed_at: new Date(),
              is_downloaded: cachedFile ? 1 : 0,
            });

            assetsAnalyzed++;

            logger.debug('[EnrichmentService] Asset analyzed', {
              assetId: asset.id,
              assetType: asset.asset_type,
              width: metadata.width,
              height: metadata.height,
            });
          } catch (error) {
            logger.warn('[EnrichmentService] Failed to analyze asset', {
              assetId: asset.id,
              url: asset.provider_url,
              error: getErrorMessage(error),
            });
          } finally {
            // Always delete temp file
            await fs.unlink(tempPath).catch(() => {});
          }
        },
        { concurrency: 10 }
      );

      // Cleanup temp directory
      await this.cleanupTempDirectory();

      logger.info('[EnrichmentService] Phase 3 complete', {
        entityType,
        entityId,
        assetsAnalyzed,
      });

      return { assetsAnalyzed };
    } catch (error) {
      logger.error('[EnrichmentService] Phase 3 failed', {
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Phase 4: Calculate scores (0-100 algorithm)
   */
  private async phase4CalculateScores(
    config: EnrichmentConfig
  ): Promise<{ assetsScored: number }> {
    try {
      const { entityId, entityType } = config;

      // Get all analyzed assets
      const analyzedAssets = await this.providerAssetsRepo.findAnalyzed(entityId, entityType);

      if (analyzedAssets.length === 0) {
        logger.info('[EnrichmentService] No analyzed assets to score', {
          entityType,
          entityId,
        });
        return { assetsScored: 0 };
      }

      // TODO: Get user preferred language from app_settings
      const userPreferredLanguage = 'en';

      // Score each asset
      for (const asset of analyzedAssets) {
        const score = this.calculateAssetScore(asset, userPreferredLanguage);
        await this.providerAssetsRepo.update(asset.id, { score });
      }

      logger.info('[EnrichmentService] Phase 4 complete', {
        entityType,
        entityId,
        assetsScored: analyzedAssets.length,
      });

      return { assetsScored: analyzedAssets.length };
    } catch (error) {
      logger.error('[EnrichmentService] Phase 4 failed', {
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Phase 5: Unified intelligent selection (cache + provider assets)
   *
   * Algorithm:
   * 1. Gather all provider assets and cache assets
   * 2. Match cache assets to providers via phash to enrich metadata
   * 3. Deduplicate by phash similarity (keep best scored, evict provider duplicates)
   * 4. Merge lists, score all assets, select top N
   * 5. Mark is_selected in provider_assets by phash lookup
   */
  private async phase5IntelligentSelection(
    config: EnrichmentConfig
  ): Promise<{ assetsSelected: number }> {
    try {
      const { entityId, entityType } = config;

      // Get asset limits from config
      const assetConfigService = new AssetConfigService(this.dbManager);
      const assetLimits = await assetConfigService.getAllAssetLimits();

      let totalSelected = 0;
      const PHASH_SIMILARITY_THRESHOLD = 90; // 90% similarity = duplicate
      const userPreferredLanguage = 'en'; // TODO: Get from app_settings

      // Process each asset type independently
      for (const [assetType, maxAllowable] of Object.entries(assetLimits)) {
        if (maxAllowable === 0) {
          continue; // Asset type disabled
        }

        // Check if asset type is locked
        const isLocked = await this.isAssetTypeLocked(entityId, entityType, assetType);
        if (isLocked) {
          logger.debug('[EnrichmentService] Asset type locked, skipping auto-selection', {
            entityType,
            entityId,
            assetType,
          });
          continue;
        }

        // STEP 1: Gather provider assets and cache assets
        const providerAssets = await this.db.query<{
          id: number;
          asset_type: string;
          provider_name: string;
          provider_url: string;
          provider_metadata: string | null;
          width: number | null;
          height: number | null;
          perceptual_hash: string | null;
          score: number | null;
        }>(
          `SELECT id, asset_type, provider_name, provider_url, provider_metadata,
                  width, height, perceptual_hash, score
           FROM provider_assets
           WHERE entity_type = ? AND entity_id = ? AND asset_type = ? AND is_rejected = 0`,
          [entityType, entityId, assetType]
        );

        const cacheTable = this.getCacheTableForAssetType(assetType);
        const cacheAssets = cacheTable
          ? await this.db.query<{
              id: number;
              file_path: string;
              file_hash: string | null;
              perceptual_hash: string | null;
              width: number | null;
              height: number | null;
              source_type: string | null;
              source_url: string | null;
              provider_name: string | null;
              classification_score: number | null;
            }>(
              `SELECT id, file_path, file_hash, perceptual_hash, width, height,
                      source_type, source_url, provider_name, classification_score
               FROM ${cacheTable}
               WHERE entity_type = ? AND entity_id = ? AND image_type = ?`,
              [entityType, entityId, assetType]
            )
          : [];

        logger.info('[EnrichmentService] Phase 5: Gathered assets', {
          assetType,
          providerCount: providerAssets.length,
          cacheCount: cacheAssets.length,
        });

        // STEP 2: Match cache assets to providers via phash to enrich metadata
        interface EnrichedCacheAsset {
          cacheId: number;
          filePath: string;
          fileHash: string | null;
          perceptualHash: string | null;
          width: number | null;
          height: number | null;
          sourceType: string | null;
          sourceUrl: string | null;
          providerName: string | null;
          classificationScore: number | null;
          matchedMetadata: any | null; // Enriched from provider if matched
          score: number; // Calculated score
        }

        const enrichedCache: EnrichedCacheAsset[] = [];

        for (const cacheAsset of cacheAssets) {
          let matchedMetadata = null;

          // Try to match with provider assets via phash
          if (cacheAsset.perceptual_hash) {
            for (const providerAsset of providerAssets) {
              if (!providerAsset.perceptual_hash) continue;

              const distance = hammingDistance(
                cacheAsset.perceptual_hash,
                providerAsset.perceptual_hash
              );
              const similarity = ((64 - distance) / 64) * 100;

              if (similarity >= PHASH_SIMILARITY_THRESHOLD) {
                // Found match! Copy metadata
                matchedMetadata = {
                  provider_name: providerAsset.provider_name,
                  provider_metadata: providerAsset.provider_metadata,
                  provider_url: providerAsset.provider_url,
                };
                break;
              }
            }
          }

          // Build enriched cache asset
          const enriched: EnrichedCacheAsset = {
            cacheId: cacheAsset.id,
            filePath: cacheAsset.file_path,
            fileHash: cacheAsset.file_hash,
            perceptualHash: cacheAsset.perceptual_hash,
            width: cacheAsset.width,
            height: cacheAsset.height,
            sourceType: cacheAsset.source_type,
            sourceUrl: cacheAsset.source_url,
            providerName: matchedMetadata?.provider_name || cacheAsset.provider_name,
            classificationScore: cacheAsset.classification_score,
            matchedMetadata,
            score: 0, // Will be calculated in step 4
          };

          enrichedCache.push(enriched);
        }

        // STEP 3: Deduplicate by phash similarity
        // Build unified candidate list: cache assets + provider assets (minus duplicates)
        interface UnifiedCandidate {
          source: 'cache' | 'provider';
          cacheId?: number;
          providerId?: number;
          perceptualHash: string | null;
          width: number | null;
          height: number | null;
          providerName: string | null;
          providerMetadata: string | null;
          score: number;
          isDuplicate: boolean;
        }

        const candidates: UnifiedCandidate[] = [];

        // Add cache assets first (they have priority as they're already downloaded)
        for (const cacheAsset of enrichedCache) {
          candidates.push({
            source: 'cache',
            cacheId: cacheAsset.cacheId,
            perceptualHash: cacheAsset.perceptualHash,
            width: cacheAsset.width,
            height: cacheAsset.height,
            providerName: cacheAsset.providerName,
            providerMetadata: cacheAsset.matchedMetadata?.provider_metadata || null,
            score: 0, // Will be scored in step 4
            isDuplicate: false,
          });
        }

        // Add provider assets, marking duplicates
        for (const providerAsset of providerAssets) {
          let isDuplicate = false;

          // Check if this provider asset duplicates a cache asset
          if (providerAsset.perceptual_hash) {
            for (const candidate of candidates) {
              if (candidate.source === 'cache' && candidate.perceptualHash) {
                const distance = hammingDistance(
                  providerAsset.perceptual_hash,
                  candidate.perceptualHash
                );
                const similarity = ((64 - distance) / 64) * 100;

                if (similarity >= PHASH_SIMILARITY_THRESHOLD) {
                  isDuplicate = true;
                  break;
                }
              }
            }
          }

          candidates.push({
            source: 'provider',
            providerId: providerAsset.id,
            perceptualHash: providerAsset.perceptual_hash,
            width: providerAsset.width,
            height: providerAsset.height,
            providerName: providerAsset.provider_name,
            providerMetadata: providerAsset.provider_metadata,
            score: 0, // Will be scored in step 4
            isDuplicate,
          });
        }

        // STEP 4: Score all candidates and select top N unique assets
        for (const candidate of candidates) {
          // Skip duplicates (they won't be selected)
          if (candidate.isDuplicate) {
            candidate.score = -1;
            continue;
          }

          // Build asset object for scoring
          const assetForScoring = {
            asset_type: assetType,
            width: candidate.width,
            height: candidate.height,
            provider_name: candidate.providerName,
            provider_metadata: candidate.providerMetadata,
          };

          candidate.score = this.calculateAssetScore(assetForScoring, userPreferredLanguage);

          // Add source priority tiebreaker: provider assets get +0.5 to win ties
          // This ensures canonical provider assets are preferred over cache assets
          // with the same score (e.g., both have 0 votes, same dimensions)
          if (candidate.source === 'provider') {
            candidate.score += 0.5;
          }
        }

        // Sort by score descending, take top N
        const sortedCandidates = candidates
          .filter((c) => !c.isDuplicate && c.score >= 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, maxAllowable);

        logger.info('[EnrichmentService] Phase 5: Selected top N candidates', {
          assetType,
          totalCandidates: candidates.filter((c) => !c.isDuplicate).length,
          duplicatesFiltered: candidates.filter((c) => c.isDuplicate).length,
          selectedCount: sortedCandidates.length,
        });

        // STEP 5: Mark is_selected in provider_assets
        // For cache-sourced selections, find matching provider assets by phash
        const selectedProviderIds: number[] = [];

        for (const selected of sortedCandidates) {
          if (selected.source === 'provider' && selected.providerId) {
            selectedProviderIds.push(selected.providerId);
          } else if (selected.source === 'cache' && selected.perceptualHash) {
            // Find provider asset(s) matching this phash
            for (const providerAsset of providerAssets) {
              if (!providerAsset.perceptual_hash) continue;

              const distance = hammingDistance(
                selected.perceptualHash,
                providerAsset.perceptual_hash
              );
              const similarity = ((64 - distance) / 64) * 100;

              if (similarity >= PHASH_SIMILARITY_THRESHOLD) {
                selectedProviderIds.push(providerAsset.id);
              }
            }
          }
        }

        // Mark selected provider assets
        for (const providerId of selectedProviderIds) {
          await this.providerAssetsRepo.update(providerId, {
            is_selected: 1,
            selected_at: new Date(),
            selected_by: 'auto',
          });
          totalSelected++;
        }

        // Deselect all other provider assets for this type
        await this.providerAssetsRepo.deselectExcept(
          entityId,
          entityType,
          assetType,
          selectedProviderIds
        );

        // CLEANUP: Remove cache assets that were NOT selected
        // Extract selected cache IDs from sortedCandidates
        const selectedCacheIds: number[] = [];
        for (const selected of sortedCandidates) {
          if (selected.source === 'cache' && selected.cacheId) {
            selectedCacheIds.push(selected.cacheId);
          }
        }

        // If we have cache assets for this type, remove unselected ones
        if (cacheAssets.length > 0 && cacheTable) {
          const allCacheIds = cacheAssets.map((ca) => ca.id);
          const deselectedCacheIds = allCacheIds.filter((id) => !selectedCacheIds.includes(id));

          for (const cacheId of deselectedCacheIds) {
            const cacheAsset = cacheAssets.find((ca) => ca.id === cacheId);
            if (!cacheAsset) continue;

            try {
              // Delete physical file
              await fs.unlink(cacheAsset.file_path);
            } catch (error) {
              logger.warn('[EnrichmentService] Failed to delete unselected cache file', {
                filePath: cacheAsset.file_path,
                error: getErrorMessage(error),
              });
            }

            // Delete cache table entry
            await this.db.execute(`DELETE FROM ${cacheTable} WHERE id = ?`, [cacheId]);
          }

          if (deselectedCacheIds.length > 0) {
            logger.info('[EnrichmentService] Removed unselected cache assets', {
              assetType,
              removed: deselectedCacheIds.length,
            });
          }
        }

        logger.info('[EnrichmentService] Selected assets for type', {
          assetType,
          selectedCount: sortedCandidates.length,
          providerIdsMarked: selectedProviderIds.length,
          cacheAssetsSelected: selectedCacheIds.length,
          cacheAssetsRemoved: cacheAssets.length - selectedCacheIds.length,
        });
      }

      logger.info('[EnrichmentService] Phase 5 complete', {
        entityType,
        entityId,
        assetsSelected: totalSelected,
      });

      return { assetsSelected: totalSelected };
    } catch (error) {
      logger.error('[EnrichmentService] Phase 5 failed', {
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Phase 5B: Download selected assets to cache
   *
   * This phase ensures all selected assets are permanently stored in cache
   * so they can be published to the library.
   */
  private async phase5BDownloadSelectedToCache(
    config: EnrichmentConfig
  ): Promise<{ assetsDownloaded: number }> {
    try {
      const { entityId, entityType } = config;

      // Get all selected assets that haven't been downloaded yet
      const assetsToDownload = await this.db.query<{
        id: number;
        asset_type: string;
        provider_name: string;
        provider_url: string;
        content_hash: string;
        width: number;
        height: number;
        mime_type: string;
        file_size: number;
      }>(
        `SELECT id, asset_type, provider_name, provider_url, content_hash, width, height, mime_type, file_size
         FROM provider_assets
         WHERE entity_type = ? AND entity_id = ? AND is_selected = 1 AND is_downloaded = 0`,
        [entityType, entityId]
      );

      if (assetsToDownload.length === 0) {
        logger.info('[EnrichmentService] Phase 5B: No assets to download (all selected assets already in cache)');
        return { assetsDownloaded: 0 };
      }

      logger.info('[EnrichmentService] Phase 5B: Downloading selected assets to cache', {
        count: assetsToDownload.length,
      });

      let downloaded = 0;

      for (const asset of assetsToDownload) {
        try {
          // Check if asset already exists in cache by content_hash
          const cacheTable = this.getCacheTableForAssetType(asset.asset_type);
          if (!cacheTable) {
            logger.warn('[EnrichmentService] Unknown asset type, skipping', { assetType: asset.asset_type });
            continue;
          }

          // Check if already in cache
          const existing = await this.db.query<{ id: number }>(
            `SELECT id FROM ${cacheTable} WHERE file_hash = ? LIMIT 1`,
            [asset.content_hash]
          );

          if (existing.length > 0) {
            // Already in cache, just mark as downloaded
            await this.providerAssetsRepo.update(asset.id, { is_downloaded: 1 });
            downloaded++;
            continue;
          }

          // Download from provider URL to cache
          const cacheFilePath = await this.downloadAssetToCache(
            asset.provider_url,
            asset.asset_type,
            asset.content_hash,
            entityType,
            entityId
          );

          // Insert into appropriate cache table
          await this.insertIntoCacheTable(cacheTable, {
            entity_type: entityType,
            entity_id: entityId,
            file_path: cacheFilePath,
            file_name: path.basename(cacheFilePath),
            file_size: asset.file_size || 0,
            file_hash: asset.content_hash,
            image_type: asset.asset_type,
            width: asset.width || 0,
            height: asset.height || 0,
            format: asset.mime_type || 'unknown',
            source_type: 'provider',
            source_url: asset.provider_url,
            provider_name: asset.provider_name, // Use actual provider from provider_assets
          });

          // Mark as downloaded
          await this.providerAssetsRepo.update(asset.id, { is_downloaded: 1 });
          downloaded++;

          logger.debug('[EnrichmentService] Downloaded asset to cache', {
            assetId: asset.id,
            assetType: asset.asset_type,
            cacheFilePath,
          });
        } catch (error) {
          logger.error('[EnrichmentService] Failed to download asset to cache', {
            assetId: asset.id,
            assetType: asset.asset_type,
            error: getErrorMessage(error),
          });
          // Continue with other assets
        }
      }

      logger.info('[EnrichmentService] Phase 5B complete', {
        entityType,
        entityId,
        assetsDownloaded: downloaded,
      });

      return { assetsDownloaded: downloaded };
    } catch (error) {
      logger.error('[EnrichmentService] Phase 5B failed', {
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Phase 5C: Download actor thumbnails to cache
   *
   * Downloads TMDB profile images for all actors linked to the movie.
   * Updates actors.image_cache_path with local file path for UI serving.
   */
  private async phase5CDownloadActorThumbnails(
    config: EnrichmentConfig
  ): Promise<{ thumbnailsDownloaded: number }> {
    const { entityId } = config;
    let downloaded = 0;

    try {
      // Get all actors for this movie that have TMDB IDs but no cached thumbnail
      const actors = await this.db.query<{
        actor_id: number;
        name: string;
        tmdb_id: number;
        profile_path: string;
      }>(
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
           AND a.image_hash IS NULL`,  // Only download if not already in cache
        [entityId]
      );

      if (actors.length === 0) {
        logger.info('[EnrichmentService] Phase 5C: No actor thumbnails to download');
        return { thumbnailsDownloaded: 0 };
      }

      logger.info('[EnrichmentService] Phase 5C: Downloading actor thumbnails', {
        count: actors.length,
      });

      for (const actor of actors) {
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

          // Create cache directory using frontend expected structure: actors/{first2}/{next2}/
          // This matches what the frontend expects: /cache/actors/{first2}/{next2}/{hash}.jpg
          const first2 = hash.substring(0, 2);
          const next2 = hash.substring(2, 4);
          const cacheDir = path.join(path.dirname(this.tempDir), 'cache', 'actors', first2, next2);
          await fs.mkdir(cacheDir, { recursive: true });

          // Save to cache with just hash as filename
          const cachePath = path.join(cacheDir, `${hash}${ext}`);
          await fs.writeFile(cachePath, imageBuffer);

          // Insert into cache_image_files table
          const format = ext.substring(1); // Remove leading dot
          await this.db.execute(
            `INSERT INTO cache_image_files (
              entity_type, entity_id, image_type, file_path, file_name,
              file_hash, file_size, width, height, format, source_type, source_url, provider_name
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
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
            ]
          );

          // Update actor record with image hash (for frontend) and cache path
          await this.db.execute(
            `UPDATE actors SET image_hash = ?, image_cache_path = ? WHERE id = ?`,
            [hash, cachePath, actor.actor_id]
          );

          downloaded++;

          logger.debug('[EnrichmentService] Downloaded actor thumbnail', {
            actorId: actor.actor_id,
            name: actor.name,
            cachePath,
          });
        } catch (error) {
          logger.error('[EnrichmentService] Failed to download actor thumbnail', {
            actorId: actor.actor_id,
            name: actor.name,
            error: getErrorMessage(error),
          });
          // Continue with other actors
        }
      }

      logger.info('[EnrichmentService] Phase 5C complete', {
        entityId,
        actorsProcessed: actors.length,
        thumbnailsDownloaded: downloaded,
      });

      return { thumbnailsDownloaded: downloaded };
    } catch (error) {
      logger.error('[EnrichmentService] Phase 5C failed', {
        entityId: config.entityId,
        error: getErrorMessage(error),
      });
      // Don't throw - this is not critical enough to fail enrichment
      return { thumbnailsDownloaded: downloaded };
    }
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Copy metadata from provider cache to movies table
   * Respects field locks set by user
   */
  private async copyMetadataToMovie(movieId: number, cachedMovie: any): Promise<void> {
    try {
      // Get current movie to check what's locked
      const current = await this.db.query<any>(
        'SELECT * FROM movies WHERE id = ?',
        [movieId]
      );

      if (current.length === 0) {
        logger.warn('[EnrichmentService] Movie not found for metadata copy', { movieId });
        return;
      }

      // TODO: Implement field lock checking (need field_locks table)
      // For now, always update unlocked fields
      // In future: const locks = await this.getFieldLocks(movieId);

      const updates: any = {};

      // Copy basic metadata (only fields that exist in movies table)
      if (cachedMovie.title) updates.title = cachedMovie.title;
      if (cachedMovie.original_title) updates.original_title = cachedMovie.original_title;
      if (cachedMovie.overview) updates.plot = cachedMovie.overview; // TMDB calls it 'overview', we call it 'plot'
      if (cachedMovie.tagline) updates.tagline = cachedMovie.tagline;
      if (cachedMovie.release_date) updates.release_date = cachedMovie.release_date;
      if (cachedMovie.year) updates.year = cachedMovie.year;
      if (cachedMovie.runtime) updates.runtime = cachedMovie.runtime;
      if (cachedMovie.content_rating) updates.content_rating = cachedMovie.content_rating;

      // Copy ratings
      if (cachedMovie.tmdb_rating !== undefined) updates.tmdb_rating = cachedMovie.tmdb_rating;
      if (cachedMovie.tmdb_votes !== undefined) updates.tmdb_votes = cachedMovie.tmdb_votes;
      if (cachedMovie.imdb_rating !== undefined) updates.imdb_rating = cachedMovie.imdb_rating;
      if (cachedMovie.imdb_votes !== undefined) updates.imdb_votes = cachedMovie.imdb_votes;

      // Note: The following fields are in provider_cache_movies but not in movies table:
      // - status, popularity, budget, revenue, homepage, adult
      // These are available in the provider cache but not copied to the working movies table

      // Build update query
      const fields = Object.keys(updates);
      if (fields.length === 0) {
        logger.debug('[EnrichmentService] No metadata to update', { movieId });
        return;
      }

      const setClause = fields.map(f => `${f} = ?`).join(', ');
      const values = fields.map(f => updates[f]);

      await this.db.execute(
        `UPDATE movies SET ${setClause}, enriched_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [...values, movieId]
      );

      logger.info('[EnrichmentService] Metadata copied to movie', {
        movieId,
        fieldsUpdated: fields.length,
      });
    } catch (error) {
      logger.error('[EnrichmentService] Failed to copy metadata', {
        movieId,
        error: getErrorMessage(error),
      });
      // Don't throw - this is not critical enough to fail enrichment
    }
  }

  /**
   * Copy cast from provider cache to actors/movie_actors tables
   * Creates actor records and links them to the movie
   */
  private async copyCastToActors(movieId: number, cachedMovie: any): Promise<void> {
    try {
      if (!cachedMovie.cast || cachedMovie.cast.length === 0) {
        logger.debug('[EnrichmentService] No cast data to copy', { movieId });
        return;
      }

      // Clear existing movie_actors links
      await this.db.execute('DELETE FROM movie_actors WHERE movie_id = ?', [movieId]);

      let actorsCreated = 0;
      let linksCreated = 0;

      for (const castMember of cachedMovie.cast) {
        const person = castMember.person;
        if (!person || !person.tmdb_person_id) continue;

        // Find or create actor by TMDB person ID
        let actor = await this.db.query<{ id: number }>(
          'SELECT id FROM actors WHERE tmdb_id = ?',
          [person.tmdb_person_id]
        );

        let actorId: number;

        if (actor.length === 0) {
          // Create new actor
          const normalized = normalizeActorName(person.name);
          const result = await this.db.execute(
            `INSERT INTO actors (
              name, name_normalized, tmdb_id, imdb_id,
              image_cache_path, identification_status
            ) VALUES (?, ?, ?, ?, ?, 'identified')`,
            [
              person.name,
              normalized,
              person.tmdb_person_id,
              person.imdb_person_id || null,
              person.profile_path || null, // TMDB URL for now (download in publishing)
            ]
          );

          actorId = result.insertId!;
          actorsCreated++;

          logger.debug('[EnrichmentService] Created actor', {
            actorId,
            name: person.name,
            tmdb_person_id: person.tmdb_person_id,
          });
        } else {
          actorId = actor[0].id;

          // Update existing actor with latest data (if not locked)
          await this.db.execute(
            `UPDATE actors
             SET name = ?, imdb_id = ?, image_cache_path = COALESCE(image_cache_path, ?),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND name_locked = 0`,
            [person.name, person.imdb_person_id || null, person.profile_path || null, actorId]
          );
        }

        // Link actor to movie
        await this.db.execute(
          `INSERT INTO movie_actors (movie_id, actor_id, role, actor_order)
           VALUES (?, ?, ?, ?)`,
          [movieId, actorId, castMember.character_name || null, castMember.cast_order || null]
        );

        linksCreated++;
      }

      logger.info('[EnrichmentService] Cast copied to actors', {
        movieId,
        actorsCreated,
        linksCreated,
        totalCast: cachedMovie.cast.length,
      });
    } catch (error) {
      logger.error('[EnrichmentService] Failed to copy cast', {
        movieId,
        error: getErrorMessage(error),
      });
      // Don't throw - this is not critical enough to fail enrichment
    }
  }

  /**
   * Calculate asset score (0-100 points)
   */
  private calculateAssetScore(asset: any, userPreferredLanguage: string): number {
    let score = 0;

    // Parse provider metadata
    const metadata = asset.provider_metadata ? JSON.parse(asset.provider_metadata) : {};

    // ========================================
    // RESOLUTION SCORE (0-30 points)
    // ========================================
    if (asset.width && asset.height) {
      const pixels = asset.width * asset.height;
      let idealPixels: number;

      if (asset.asset_type === 'poster') {
        idealPixels = 6000000; // 2000x3000
      } else if (asset.asset_type === 'fanart') {
        idealPixels = 2073600; // 1920x1080
      } else {
        idealPixels = 1000000; // Generic
      }

      const scaleFactor = Math.min(pixels / idealPixels, 1.5);
      score += scaleFactor * 30;
    }

    // ========================================
    // ASPECT RATIO SCORE (0-20 points)
    // ========================================
    if (asset.width && asset.height) {
      const ratio = asset.width / asset.height;
      let idealRatio: number;

      if (asset.asset_type === 'poster') {
        idealRatio = 2 / 3; // 0.667
      } else if (asset.asset_type === 'fanart') {
        idealRatio = 16 / 9; // 1.778
      } else if (asset.asset_type === 'clearlogo') {
        idealRatio = 4.0; // 3:1 to 5:1 range
      } else {
        idealRatio = ratio; // Accept any ratio for unknown types
      }

      const ratioDiff = Math.abs(ratio - idealRatio);
      score += Math.max(0, 20 - ratioDiff * 100);
    }

    // ========================================
    // LANGUAGE SCORE (0-20 points)
    // ========================================
    const language = metadata.language;

    if (language === userPreferredLanguage) {
      score += 20;
    } else if (language === 'en') {
      score += 15;
    } else if (!language) {
      score += 18; // Language-neutral (e.g., logos)
    } else {
      score += 5;
    }

    // ========================================
    // COMMUNITY VOTES SCORE (0-20 points)
    // ========================================
    const voteAverage = metadata.voteAverage || 0; // 0-10 scale
    const voteCount = metadata.votes || 0;

    const normalized = voteAverage / 10; // 0-1 scale
    const weight = Math.min(voteCount / 50, 1.0); // Need 50+ votes for full weight
    score += normalized * weight * 20;

    // ========================================
    // PROVIDER PRIORITY (0-10 points)
    // ========================================
    if (asset.provider_name === 'tmdb') {
      score += 10;
    } else if (asset.provider_name === 'fanart.tv') {
      score += 9;
    } else if (asset.provider_name === 'tvdb') {
      score += 8;
    } else {
      score += 5;
    }

    return Math.round(score);
  }

  /**
   * Get entity from database
   */
  private async getEntity(
    entityId: number,
    entityType: string
  ): Promise<{
    id: number;
    title: string;
    tmdb_id: number | null;
    imdb_id: string | null;
    tvdb_id: number | null;
    monitored: number;
  } | null> {
    const table = entityType === 'movie' ? 'movies' : entityType === 'series' ? 'series' : 'episodes';

    // Movies only have tmdb_id and imdb_id (no tvdb_id)
    // Series/episodes have tvdb_id
    const columns = entityType === 'movie'
      ? 'id, title, tmdb_id, imdb_id, monitored'
      : 'id, title, tmdb_id, imdb_id, tvdb_id, monitored';

    const result = await this.db.get<{
      id: number;
      title: string;
      tmdb_id: number | null;
      imdb_id: string | null;
      tvdb_id?: number | null;
      monitored: number;
    }>(`SELECT ${columns} FROM ${table} WHERE id = ?`, [entityId]);

    if (!result) return null;

    // Ensure tvdb_id is always present (null for movies)
    return {
      ...result,
      tvdb_id: result.tvdb_id || null,
    };
  }

  /**
   * Check if asset type is locked
   */
  private async isAssetTypeLocked(
    entityId: number,
    entityType: string,
    assetType: string
  ): Promise<boolean> {
    try {
      const table = entityType === 'movie' ? 'movies' : entityType === 'series' ? 'series' : 'episodes';
      const lockField = `${assetType}_locked`;

      const result = await this.db.get<any>(
        `SELECT ${lockField} FROM ${table} WHERE id = ?`,
        [entityId]
      );

      return result?.[lockField] === 1;
    } catch (error) {
      // Column doesn't exist (e.g., actor_thumb_locked) - not locked
      // This is expected for asset types that don't have lock columns
      if (getErrorMessage(error).includes('no such column')) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Update enrichment timestamp on entity
   */
  private async updateEnrichmentTimestamp(config: EnrichmentConfig): Promise<void> {
    const { entityId, entityType } = config;
    const table = entityType === 'movie' ? 'movies' : entityType === 'series' ? 'series' : 'episodes';

    await this.db.execute(
      `UPDATE ${table} SET enriched_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [entityId]
    );
  }

  /**
   * Download file from URL
   */
  private async downloadFile(url: string, destPath: string): Promise<void> {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000,
    });

    await fs.writeFile(destPath, response.data);
  }

  /**
   * Analyze image metadata
   */
  private async analyzeImage(filePath: string): Promise<AssetMetadata> {
    const metadata = await sharp(filePath).metadata();
    const stats = await fs.stat(filePath);

    return {
      width: metadata.width || 0,
      height: metadata.height || 0,
      mimeType: `image/${metadata.format}`,
      size: stats.size,
      isImage: true,
    };
  }

  /**
   * Analyze video metadata
   */
  private async analyzeVideo(filePath: string): Promise<AssetMetadata> {
    const mediaInfo = await extractMediaInfo(filePath);
    const stats = await fs.stat(filePath);

    const videoStream = mediaInfo.videoStreams[0];

    return {
      width: videoStream?.width || 0,
      height: videoStream?.height || 0,
      duration: mediaInfo.duration ? Math.floor(mediaInfo.duration) : undefined,
      mimeType: 'video/mp4',
      size: stats.size,
      isImage: false,
    };
  }

  /**
   * Ensure temp directory exists
   */
  private async ensureTempDir(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      logger.error('[EnrichmentService] Failed to create temp directory', {
        tempDir: this.tempDir,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  /**
   * Cleanup temp directory
   */
  private async cleanupTempDirectory(): Promise<void> {
    try {
      const files = await fs.readdir(this.tempDir);

      for (const file of files) {
        if (file.startsWith('metarr-analyze-')) {
          await fs.unlink(path.join(this.tempDir, file)).catch(() => {});
        }
      }
    } catch (error) {
      logger.warn('[EnrichmentService] Failed to cleanup temp directory', {
        tempDir: this.tempDir,
        error: getErrorMessage(error),
      });
    }
  }

  /**
   * Get cache table name for asset type
   */
  private getCacheTableForAssetType(assetType: string): string | null {
    // Images (posters, fanart, etc.)
    if (['poster', 'fanart', 'banner', 'clearlogo', 'clearart', 'discart', 'landscape', 'keyart', 'thumb'].includes(assetType)) {
      return 'cache_image_files';
    }
    // Videos (trailers, samples)
    if (['trailer', 'sample'].includes(assetType)) {
      return 'cache_video_files';
    }
    return null;
  }

  /**
   * Download asset from provider URL to cache directory
   */
  private async downloadAssetToCache(
    providerUrl: string,
    assetType: string,
    contentHash: string,
    entityType: string,
    entityId: number
  ): Promise<string> {
    // Determine file extension from URL or asset type
    const urlExt = path.extname(new URL(providerUrl).pathname);
    const ext = urlExt || (assetType === 'trailer' ? '.mp4' : '.jpg');

    // Build cache path: cache/{images|videos}/{entity_type}/{entity_id}/{hash}{ext}
    const cacheSubdir = assetType === 'trailer' || assetType === 'sample' ? 'videos' : 'images';
    const cacheDir = path.join(path.dirname(this.tempDir), 'cache', cacheSubdir, entityType, entityId.toString());

    // Ensure cache directory exists
    await fs.mkdir(cacheDir, { recursive: true });

    const cacheFilePath = path.join(cacheDir, `${contentHash}${ext}`);

    // Check if already exists (deduplication)
    try {
      await fs.access(cacheFilePath);
      logger.debug('[EnrichmentService] Asset already exists in cache', { cacheFilePath });
      return cacheFilePath;
    } catch {
      // File doesn't exist, download it
    }

    // Download from provider URL
    logger.debug('[EnrichmentService] Downloading asset to cache', {
      providerUrl,
      cacheFilePath,
    });

    const response = await axios.get(providerUrl, { responseType: 'arraybuffer' });
    await fs.writeFile(cacheFilePath, response.data);

    return cacheFilePath;
  }

  /**
   * Insert record into cache table
   */
  private async insertIntoCacheTable(tableName: string, data: any): Promise<void> {
    if (tableName === 'cache_image_files') {
      await this.db.execute(
        `INSERT INTO cache_image_files (
          entity_type, entity_id, file_path, file_name, file_size, file_hash,
          image_type, width, height, format, source_type, source_url, provider_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.entity_type,
          data.entity_id,
          data.file_path,
          data.file_name,
          data.file_size,
          data.file_hash,
          data.image_type,
          data.width,
          data.height,
          data.format,
          data.source_type,
          data.source_url,
          data.provider_name,
        ]
      );
    } else if (tableName === 'cache_video_files') {
      await this.db.execute(
        `INSERT INTO cache_video_files (
          entity_type, entity_id, file_path, file_name, file_size, file_hash,
          video_type, duration_seconds, width, height, format, source_type, source_url, provider_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.entity_type,
          data.entity_id,
          data.file_path,
          data.file_name,
          data.file_size,
          data.file_hash,
          data.image_type, // video_type uses same field
          data.duration || 0,
          data.width,
          data.height,
          data.format,
          data.source_type,
          data.source_url,
          data.provider_name,
        ]
      );
    }
  }

  /**
   * Map provider image types to our asset types
   * TMDB uses 'backdrop', we use 'fanart'
   * TMDB uses 'profile', we ignore (handled separately for actors)
   */
  private mapProviderImageType(providerImageType: string): string | null {
    const mapping: Record<string, string> = {
      'backdrop': 'fanart',
      'poster': 'poster',
      'logo': 'clearlogo',
      'banner': 'banner',
      'clearlogo': 'clearlogo',
      'clearart': 'clearart',
      'discart': 'discart',
      'landscape': 'landscape',
      'keyart': 'keyart',
      'thumb': 'thumb',
    };

    return mapping[providerImageType] || null;
  }

  /**
   * Build full image URL from provider name and relative path
   * Provider cache stores relative paths, we need full URLs for downloading
   */
  private buildProviderImageUrl(providerName: string, filePath: string): string {
    // If already a full URL, return as-is
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      return filePath;
    }

    // Build full URL based on provider
    if (providerName === 'tmdb') {
      // TMDB image base URL (original size for quality)
      return `https://image.tmdb.org/t/p/original${filePath}`;
    } else if (providerName === 'fanart.tv') {
      // Fanart.tv URLs are already full URLs in provider_cache_images
      return filePath;
    }

    // Unknown provider, return as-is and let it fail with better error
    logger.warn('[EnrichmentService] Unknown provider for URL building', {
      providerName,
      filePath,
    });
    return filePath;
  }
}
