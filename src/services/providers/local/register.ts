/**
 * Local Provider Registration
 *
 * Self-registers LocalProvider with the ProviderRegistry on module import.
 * This ensures the provider is available to the orchestrator.
 */

import { ProviderRegistry } from '../ProviderRegistry.js';
import { LocalProvider } from './LocalProvider.js';
import { logger } from '../../../middleware/logging.js';

// Get registry instance
const registry = ProviderRegistry.getInstance();

// Register Local provider
registry.registerProvider(
  'local',
  LocalProvider as any,
  new LocalProvider(
    {
      id: 0,
      providerName: 'local',
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {}
  ).getCapabilities()
);

logger.debug('Local provider registered with ProviderRegistry');
