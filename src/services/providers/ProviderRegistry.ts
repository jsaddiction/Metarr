/**
 * Provider Registry
 *
 * Singleton that manages all available providers.
 * Handles provider registration, capability discovery, and instance creation.
 */

import { BaseProvider } from './BaseProvider.js';
import { ProviderConfig } from '../../types/provider.js';
import {
  ProviderCapabilities,
  ProviderId,
  EntityType,
  AssetType,
  MetadataField,
  ProviderOptions,
} from '../../types/providers/index.js';
import { logger } from '../../middleware/logging.js';
import { ValidationError } from '../../errors/index.js';

/**
 * Type for constructable provider classes (excludes abstract BaseProvider)
 */
type ProviderConstructor = new (config: ProviderConfig, options?: ProviderOptions) => BaseProvider;

export class ProviderRegistry {
  private static instance: ProviderRegistry;
  private providerClasses: Map<ProviderId, ProviderConstructor> = new Map();
  private capabilities: Map<ProviderId, ProviderCapabilities> = new Map();
  private instances: Map<string, BaseProvider> = new Map(); // Cache provider instances

  private constructor() {
    // Private constructor for singleton
    // Providers will register themselves via registerProvider()
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ProviderRegistry {
    if (!ProviderRegistry.instance) {
      ProviderRegistry.instance = new ProviderRegistry();
    }
    return ProviderRegistry.instance;
  }

  /**
   * Register a provider with its capabilities
   * Should be called by concrete provider classes (not BaseProvider)
   */
  registerProvider(
    providerId: ProviderId,
    providerClass: ProviderConstructor,
    capabilities: ProviderCapabilities
  ): void {
    this.providerClasses.set(providerId, providerClass);
    this.capabilities.set(providerId, capabilities);
    logger.info(`Registered provider: ${capabilities.name} (${providerId})`);
  }

  /**
   * Get all cached provider instances
   * Returns empty array if no providers have been instantiated
   */
  getAllProviders(): BaseProvider[] {
    return Array.from(this.instances.values());
  }

  /**
   * Get a specific provider instance by ID
   * Returns null if provider not found or not yet instantiated
   */
  getProvider(providerId: string): BaseProvider | null {
    // Check if it's a provider name (tmdb, tvdb, etc.)
    for (const [key, instance] of this.instances.entries()) {
      if (key.startsWith(providerId)) {
        return instance;
      }
    }
    return null;
  }

  /**
   * Create provider instance from configuration
   * Returns cached instance if available
   */
  async createProvider(config: ProviderConfig, options?: unknown): Promise<BaseProvider> {
    // For default configs (id=0), use a special cache key to avoid confusion
    const cacheKey = config.id === 0
      ? `${config.providerName}_default`
      : `${config.providerName}_${config.id}`;

    // Return cached instance if exists
    if (this.instances.has(cacheKey)) {
      const cachedInstance = this.instances.get(cacheKey)!;
      // Update config if it changed (updateConfig checks internally)
      cachedInstance.updateConfig(config);
      if (options) {
        cachedInstance.updateOptions(options);
      }
      return cachedInstance;
    }

    const ProviderClass = this.providerClasses.get(config.providerName as ProviderId);
    if (!ProviderClass) {
      throw new ValidationError(`Unknown provider: ${config.providerName}`);
    }

    // Create instance of concrete provider class
    // ProviderClass is guaranteed to be constructable (not abstract) via ProviderConstructor type
    const instance = new ProviderClass(config, options as ProviderOptions | undefined);
    this.instances.set(cacheKey, instance);

    // Cache capabilities if not already cached
    if (!this.capabilities.has(config.providerName as ProviderId)) {
      this.capabilities.set(config.providerName as ProviderId, instance.getCapabilities());
    }

    logger.debug(`Created provider instance: ${config.providerName}`, {
      configId: config.id,
    });

    return instance;
  }

  /**
   * Invalidate cached instance (e.g., after config change)
   */
  invalidateCache(providerId: ProviderId): void {
    let invalidatedCount = 0;
    for (const [key] of this.instances.entries()) {
      if (key.startsWith(providerId)) {
        this.instances.delete(key);
        invalidatedCount++;
      }
    }

    if (invalidatedCount > 0) {
      logger.debug(`Invalidated ${invalidatedCount} cached instances for ${providerId}`);
    }
  }

  /**
   * Clear all cached instances
   */
  clearCache(): void {
    const count = this.instances.size;
    this.instances.clear();
    logger.debug(`Cleared ${count} cached provider instances`);
  }

  /**
   * Get all registered provider capabilities
   */
  getAllCapabilities(): ProviderCapabilities[] {
    return Array.from(this.capabilities.values());
  }

  /**
   * Get capabilities for specific provider
   */
  getCapabilities(providerId: ProviderId): ProviderCapabilities | null {
    return this.capabilities.get(providerId) || null;
  }

  /**
   * Check if provider is registered
   */
  isRegistered(providerId: ProviderId): boolean {
    return this.providerClasses.has(providerId);
  }

  /**
   * Get all registered provider IDs
   */
  getRegisteredProviderIds(): ProviderId[] {
    return Array.from(this.providerClasses.keys());
  }

  /**
   * Find providers that support specific entity type
   */
  getProvidersForEntityType(entityType: EntityType): ProviderCapabilities[] {
    const results: ProviderCapabilities[] = [];

    for (const caps of this.capabilities.values()) {
      if (caps.supportedEntityTypes.includes(entityType)) {
        results.push(caps);
      }
    }

    return results;
  }

  /**
   * Find providers that support specific asset type for entity
   */
  getProvidersForAssetType(
    entityType: EntityType,
    assetType: AssetType
  ): ProviderCapabilities[] {
    const results: ProviderCapabilities[] = [];

    for (const caps of this.capabilities.values()) {
      const supportedTypes = caps.supportedAssetTypes[entityType];
      if (supportedTypes?.includes(assetType)) {
        results.push(caps);
      }
    }

    return results;
  }

  /**
   * Find providers that support specific metadata field for entity
   */
  getProvidersForMetadataField(
    entityType: EntityType,
    field: MetadataField
  ): ProviderCapabilities[] {
    const results: ProviderCapabilities[] = [];

    for (const caps of this.capabilities.values()) {
      const supportedFields = caps.supportedMetadataFields[entityType];
      if (supportedFields?.includes(field)) {
        results.push(caps);
      }
    }

    return results;
  }

  /**
   * Find providers that support search for entity type
   */
  getSearchProviders(entityType: EntityType): ProviderCapabilities[] {
    const results: ProviderCapabilities[] = [];

    for (const caps of this.capabilities.values()) {
      if (
        caps.search.supported &&
        caps.supportedEntityTypes.includes(entityType)
      ) {
        results.push(caps);
      }
    }

    return results;
  }

  /**
   * Find providers that support external ID lookup
   */
  getProvidersForExternalId(externalIdType: string): ProviderCapabilities[] {
    const results: ProviderCapabilities[] = [];

    for (const caps of this.capabilities.values()) {
      if (caps.search.externalIdLookup.includes(externalIdType)) {
        results.push(caps);
      }
    }

    return results;
  }

  /**
   * Get provider capability summary
   */
  getCapabilitySummary() {
    const summary = {
      totalProviders: this.providerClasses.size,
      providers: [] as any[],
    };

    for (const caps of this.capabilities.values()) {
      summary.providers.push({
        id: caps.id,
        name: caps.name,
        category: caps.category,
        entityTypes: caps.supportedEntityTypes,
        search: caps.search.supported,
        requiresAuth: caps.authentication.required,
        rateLimit: `${caps.rateLimit.requestsPerSecond}/sec`,
        quality: {
          metadata: caps.dataQuality.metadataCompleteness,
          images: caps.dataQuality.imageQuality,
        },
      });
    }

    return summary;
  }
}

/**
 * Get singleton instance (convenience export)
 */
export const providerRegistry = ProviderRegistry.getInstance();
