/**
 * IMDb Provider Registration
 *
 * LEGAL DISCLAIMER:
 * This provider uses web scraping which violates IMDb's Terms of Service.
 * By enabling this provider, you accept full legal responsibility.
 *
 * Self-registers IMDbProvider with the ProviderRegistry on module import.
 * This ensures the provider is available to the orchestrator.
 */

import { ProviderRegistry } from '../ProviderRegistry.js';
import { IMDbProvider } from './IMDbProvider.js';
import { logger } from '../../../middleware/logging.js';

// Get registry instance
const registry = ProviderRegistry.getInstance();

// Register IMDb provider
registry.registerProvider(
  'imdb',
  IMDbProvider as any,
  new IMDbProvider(
    {
      id: 0,
      providerName: 'imdb',
      enabled: false, // Disabled by default due to ToS concerns
      enabledAssetTypes: [], // No assets provided
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {}
  ).getCapabilities()
);

logger.debug('IMDb provider registered with ProviderRegistry (disabled by default - ToS violation)');
