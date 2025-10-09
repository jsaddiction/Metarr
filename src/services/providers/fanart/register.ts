/**
 * FanArt.tv Provider Registration
 *
 * Self-registers FanArtProvider with the ProviderRegistry on module import.
 * This ensures the provider is available to the orchestrator.
 */

import { ProviderRegistry } from '../ProviderRegistry.js';
import { FanArtProvider } from './FanArtProvider.js';
import { logger } from '../../../middleware/logging.js';

// Get registry instance
const registry = ProviderRegistry.getInstance();

// Register FanArt.tv provider
registry.registerProvider(
  'fanart_tv',
  FanArtProvider as any, // Cast needed due to constructor signature
  new FanArtProvider(
    {
      id: 0,
      providerName: 'fanart_tv',
      enabled: true,
      apiKey: '', // Temporary for capabilities only
      enabledAssetTypes: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {}
  ).getCapabilities()
);

logger.debug('FanArt.tv provider registered with ProviderRegistry');
