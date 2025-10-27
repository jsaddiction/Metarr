/**
 * Provider Orchestrator
 *
 * Coordinates multiple providers for data collection and merging.
 * Implements multi-provider search, metadata fetching, and asset candidate collection.
 */

import { ProviderRegistry } from './ProviderRegistry.js';
import { BaseProvider } from './BaseProvider.js';
import { AssetSelector, AssetSelectionConfig } from './AssetSelector.js';
import { ProviderConfigService } from '../providerConfigService.js';
import { ProviderConfig } from '../../types/provider.js';
import {
  SearchRequest,
  SearchResult,
  MetadataResponse,
  AssetCandidate,
  EntityType,
  AssetType,
  MetadataField,
  ProviderId,
} from '../../types/providers/index.js';
import { logger } from '../../middleware/logging.js';
import { getErrorMessage } from '../../utils/errorHandling.js';

/**
 * Orchestration strategies
 */
export type OrchestrationStrategy = 'preferred_first' | 'field_mapping' | 'aggregate_all';

export interface OrchestrationConfig {
  strategy: OrchestrationStrategy;
  preferredProvider?: ProviderId;
  fillGaps?: boolean;
  fieldMapping?: Partial<Record<MetadataField, ProviderId>>;
  mergeStrategy?: 'union' | 'intersection' | 'best_score';
}

export class ProviderOrchestrator {
  constructor(
    private registry: ProviderRegistry,
    private configService: ProviderConfigService
  ) {}

  /**
   * Search across multiple providers
   * Returns aggregated results from all enabled search providers
   */
  async searchAcrossProviders(request: SearchRequest): Promise<SearchResult[]> {
    const enabledConfigs = await this.getEnabledProviders();
    const searchProviders = enabledConfigs.filter(config => {
      const caps = this.registry.getCapabilities(config.providerName as ProviderId);
      // Check if provider supports search (use_for_search will be added in Phase 2)
      return caps?.search.supported;
    });

    logger.info(`Searching across ${searchProviders.length} providers`, {
      query: request.query,
      entityType: request.entityType,
      providers: searchProviders.map(p => p.providerName),
    });

    // Parallel search across all providers
    const results = await Promise.allSettled(
      searchProviders.map(async config => {
        try {
          const provider = await this.registry.createProvider(config);
          return await provider.search(request);
        } catch (error) {
          logger.warn(`Search failed for ${config.providerName}`, {
            error: getErrorMessage(error),
            query: request.query,
          });
          return [];
        }
      })
    );

    // Aggregate all successful results
    const allResults: SearchResult[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        allResults.push(...result.value);
      }
    }

    // Sort by confidence (highest first)
    allResults.sort((a, b) => b.confidence - a.confidence);

    logger.info(`Search complete: ${allResults.length} results`, {
      query: request.query,
      topConfidence: allResults[0]?.confidence,
    });

    return allResults;
  }

  /**
   * Fetch metadata from providers using orchestration strategy
   */
  async fetchMetadata(
    entityType: EntityType,
    externalIds: Record<string, unknown>,
    strategy: OrchestrationConfig
  ): Promise<MetadataResponse> {
    if (strategy.strategy === 'field_mapping' && strategy.fieldMapping) {
      return this.fetchMetadataWithFieldMapping(entityType, externalIds, strategy.fieldMapping);
    }

    // Fetch from all metadata providers
    const enabledConfigs = await this.getEnabledProviders();
    // For now, use all enabled providers (use_for_metadata will be added in Phase 2)
    const metadataProviders = enabledConfigs;

    logger.info(`Fetching metadata from ${metadataProviders.length} providers`, {
      entityType,
      strategy: strategy.strategy,
    });

    const responses = await Promise.allSettled(
      metadataProviders.map(async config => {
        try {
          const provider = await this.registry.createProvider(config);
          const providerId = await this.resolveProviderId(provider, externalIds);

          if (!providerId) {
            return null;
          }

          return await provider.getMetadata({
            providerId: config.providerName as ProviderId,
            providerResultId: providerId,
            entityType,
          });
        } catch (error) {
          logger.warn(`Metadata fetch failed for ${config.providerName}`, {
            error: getErrorMessage(error),
          });
          return null;
        }
      })
    );

    // Extract successful responses
    const validResponses: MetadataResponse[] = [];
    for (const result of responses) {
      if (result.status === 'fulfilled' && result.value) {
        validResponses.push(result.value);
      }
    }

    logger.info(`Collected metadata from ${validResponses.length} providers`);

    // Apply merge strategy
    if (strategy.strategy === 'preferred_first') {
      return this.mergePreferredFirst(validResponses, strategy);
    } else {
      return this.mergeAggregateAll(validResponses, strategy);
    }
  }

  /**
   * Fetch asset candidates from all enabled image providers
   */
  async fetchAssetCandidates(
    entityType: EntityType,
    externalIds: Record<string, unknown>,
    assetTypes: AssetType[]
  ): Promise<AssetCandidate[]> {
    const enabledConfigs = await this.getEnabledProviders();
    // For now, use all enabled providers (use_for_images will be added in Phase 2)
    const assetProviders = enabledConfigs;

    logger.info(`Fetching assets from ${assetProviders.length} providers`, {
      entityType,
      assetTypes,
      providers: assetProviders.map(p => p.providerName),
    });

    // Parallel fetch from all providers
    const candidateLists = await Promise.allSettled(
      assetProviders.map(async config => {
        try {
          const provider = await this.registry.createProvider(config);
          const caps = provider.getCapabilities();

          // Filter to supported asset types
          const supportedTypes = caps.supportedAssetTypes[entityType];
          const requestTypes = assetTypes.filter(type => supportedTypes?.includes(type));

          if (requestTypes.length === 0) {
            return [];
          }

          const providerId = await this.resolveProviderId(provider, externalIds);
          if (!providerId) {
            return [];
          }

          return await provider.getAssets({
            providerId: caps.id,
            providerResultId: providerId,
            entityType,
            assetTypes: requestTypes,
          });
        } catch (error) {
          logger.warn(`Asset fetch failed for ${config.providerName}`, {
            error: getErrorMessage(error),
          });
          return [];
        }
      })
    );

    // Aggregate all candidates
    const allCandidates: AssetCandidate[] = [];
    for (const result of candidateLists) {
      if (result.status === 'fulfilled') {
        allCandidates.push(...result.value);
      }
    }

    logger.info(`Collected ${allCandidates.length} asset candidates`, {
      byProvider: this.groupBy(allCandidates, 'providerId'),
      byAssetType: this.groupBy(allCandidates, 'assetType'),
    });

    return allCandidates;
  }

  /**
   * Select best N assets using AssetSelector
   */
  async selectBestAssets(
    candidates: AssetCandidate[],
    selectionConfig: AssetSelectionConfig
  ): Promise<AssetCandidate[]> {
    const selector = new AssetSelector(selectionConfig);
    return selector.selectBest(candidates);
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  /**
   * Get all enabled provider configurations
   */
  private async getEnabledProviders(): Promise<ProviderConfig[]> {
    const all = await this.configService.getAll();
    return all.filter(c => c.enabled);
  }

  /**
   * Resolve provider-specific ID from external IDs
   */
  private async resolveProviderId(
    provider: BaseProvider,
    externalIds: Record<string, unknown>
  ): Promise<string | null> {
    const caps = provider.getCapabilities();

    // Try to find matching external ID
    for (const idType of caps.search.externalIdLookup) {
      if (externalIds[idType]) {
        return String(externalIds[idType]);
      }
    }

    logger.warn(`No compatible external ID found for ${caps.id}`, {
      availableIds: Object.keys(externalIds),
      requiredIds: caps.search.externalIdLookup,
    });

    return null;
  }

  /**
   * Fetch metadata with field mapping strategy
   */
  private async fetchMetadataWithFieldMapping(
    entityType: EntityType,
    externalIds: Record<string, unknown>,
    fieldMapping: Partial<Record<MetadataField, ProviderId>>
  ): Promise<MetadataResponse> {
    const response: MetadataResponse = {
      providerId: 'custom' as ProviderId,
      providerResultId: 'aggregated',
      fields: {},
      completeness: 0,
      confidence: 1,
    };

    // Fetch each field from designated provider
    for (const [field, providerId] of Object.entries(fieldMapping)) {
      try {
        const config = await this.configService.getByName(providerId);
        if (!config || !config.enabled) {
          continue;
        }

        const provider = await this.registry.createProvider(config);
        const providerEntityId = await this.resolveProviderId(provider, externalIds);

        if (!providerEntityId) {
          continue;
        }

        const metadata = await provider.getMetadata({
          providerId,
          providerResultId: providerEntityId,
          entityType,
          fields: [field as MetadataField],
        });

        if (metadata.fields[field as MetadataField]) {
          response.fields[field as MetadataField] = metadata.fields[field as MetadataField];
        }
      } catch (error) {
        logger.warn(`Field mapping failed for ${field} from ${providerId}`, {
          error: getErrorMessage(error),
        });
      }
    }

    response.completeness = Object.keys(response.fields).length / Object.keys(fieldMapping).length;

    return response;
  }

  /**
   * Merge metadata with preferred provider first
   */
  private mergePreferredFirst(
    responses: MetadataResponse[],
    strategy: OrchestrationConfig
  ): MetadataResponse {
    const merged: MetadataResponse = {
      providerId: 'aggregated' as ProviderId,
      providerResultId: 'merged',
      fields: {},
      completeness: 0,
      confidence: 0,
    };

    // Find preferred provider response
    const preferredResponse = responses.find(
      r => r.providerId === strategy.preferredProvider
    );

    if (preferredResponse) {
      // Start with preferred provider's data
      merged.fields = { ...preferredResponse.fields };
      merged.confidence = preferredResponse.confidence;
    }

    if (strategy.fillGaps) {
      // Fill empty fields from other providers
      for (const response of responses) {
        if (response.providerId === strategy.preferredProvider) {
          continue;
        }

        for (const [field, value] of Object.entries(response.fields)) {
          if (!merged.fields[field as MetadataField]) {
            merged.fields[field as MetadataField] = value;
          }
        }
      }
    }

    // Calculate completeness based on available fields
    const totalFields = new Set<string>();
    for (const response of responses) {
      for (const field of Object.keys(response.fields)) {
        totalFields.add(field);
      }
    }

    merged.completeness = totalFields.size > 0
      ? Object.keys(merged.fields).length / totalFields.size
      : 0;

    return merged;
  }

  /**
   * Merge metadata from all providers (best score wins)
   */
  private mergeAggregateAll(
    responses: MetadataResponse[],
    _strategy: OrchestrationConfig
  ): MetadataResponse {
    const merged: MetadataResponse = {
      providerId: 'aggregated' as ProviderId,
      providerResultId: 'merged',
      fields: {},
      completeness: 0,
      confidence: 0,
    };

    // Collect all unique fields
    const allFields = new Set<MetadataField>();
    for (const response of responses) {
      for (const field of Object.keys(response.fields)) {
        allFields.add(field as MetadataField);
      }
    }

    // For each field, select value with highest confidence
    for (const field of allFields) {
      const values = responses
        .map(r => ({ value: r.fields[field], confidence: r.confidence }))
        .filter(v => v.value !== undefined);

      if (values.length > 0) {
        values.sort((a, b) => b.confidence - a.confidence);
        merged.fields[field] = values[0].value;
      }
    }

    merged.completeness = allFields.size > 0
      ? Object.keys(merged.fields).length / allFields.size
      : 0;

    merged.confidence = responses.reduce((sum, r) => sum + r.confidence, 0) / responses.length;

    return merged;
  }

  /**
   * Group items by property
   */
  private groupBy<T>(items: T[], property: keyof T): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const item of items) {
      const key = String(item[property]);
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }
}
