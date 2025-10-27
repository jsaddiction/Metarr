/**
 * TVDB Provider Registration
 *
 * Self-registers TVDBProvider with the ProviderRegistry on module import.
 */

import { ProviderRegistry } from '../ProviderRegistry.js';
import { TVDBProvider } from './TVDBProvider.js';
import { logger } from '../../../middleware/logging.js';

// Get registry instance
const registry = ProviderRegistry.getInstance();

// Register TVDB provider
registry.registerProvider(
  'tvdb',
  TVDBProvider as any,
  new TVDBProvider(
    {
      id: 0,
      providerName: 'tvdb',
      enabled: true,
      apiKey: '',
      created_at: new Date(),
      updated_at: new Date(),
    },
    {}
  ).getCapabilities()
);

logger.debug('TVDB provider registered with ProviderRegistry');
