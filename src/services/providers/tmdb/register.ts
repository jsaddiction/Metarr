/**
 * TMDB Provider Registration
 *
 * Self-registers TMDBProvider with the ProviderRegistry on module import.
 * This ensures the provider is available to the orchestrator.
 */

import { ProviderRegistry } from '../ProviderRegistry.js';
import { TMDBProvider } from './TMDBProvider.js';
import { logger } from '../../../middleware/logging.js';

// Get registry instance
const registry = ProviderRegistry.getInstance();

// Register TMDB provider
registry.registerProvider(
  'tmdb',
  TMDBProvider as any, // Cast needed due to constructor signature
  new TMDBProvider(
    {
      id: 0,
      providerName: 'tmdb',
      enabled: true,
      apiKey: '', // Temporary for capabilities only
      created_at: new Date(),
      updated_at: new Date(),
    },
    {}
  ).getCapabilities()
);

logger.debug('TMDB provider registered with ProviderRegistry');
