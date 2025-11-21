/**
 * OMDB Provider Registration
 *
 * Self-registers OMDBProvider with the ProviderRegistry on module import.
 */

import { ProviderRegistry } from '../ProviderRegistry.js';
import { OMDBProvider } from './OMDBProvider.js';
import { logger } from '../../../middleware/logging.js';

// Get registry instance
const registry = ProviderRegistry.getInstance();

// Register OMDB provider
registry.registerProvider(
  'omdb',
  OMDBProvider as any, // Cast needed due to constructor signature
  new OMDBProvider(
    {
      id: 0,
      providerName: 'omdb',
      enabled: false, // Disabled until user adds API key
      apiKey: '',
      created_at: new Date(),
      updated_at: new Date(),
    },
    {}
  ).getCapabilities()
);

logger.debug('OMDB provider registered with ProviderRegistry');
