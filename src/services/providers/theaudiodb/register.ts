/**
 * TheAudioDB Provider Registration
 *
 * Self-registers TheAudioDBProvider with the ProviderRegistry on module import.
 * This ensures the provider is available to the orchestrator.
 */

import { ProviderRegistry } from '../ProviderRegistry.js';
import { TheAudioDBProvider } from './TheAudioDBProvider.js';
import { logger } from '../../../middleware/logging.js';

// Get registry instance
const registry = ProviderRegistry.getInstance();

// Register TheAudioDB provider
registry.registerProvider(
  'theaudiodb',
  TheAudioDBProvider as any,
  new TheAudioDBProvider(
    {
      id: 0,
      providerName: 'theaudiodb',
      enabled: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {}
  ).getCapabilities()
);

logger.debug('TheAudioDB provider registered with ProviderRegistry');
