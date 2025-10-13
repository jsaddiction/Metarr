/**
 * MusicBrainz Provider Registration
 *
 * Self-registers MusicBrainzProvider with the ProviderRegistry on module import.
 * This ensures the provider is available to the orchestrator.
 */

import { ProviderRegistry } from '../ProviderRegistry.js';
import { MusicBrainzProvider } from './MusicBrainzProvider.js';
import { logger } from '../../../middleware/logging.js';

// Get registry instance
const registry = ProviderRegistry.getInstance();

// Register MusicBrainz provider
registry.registerProvider(
  'musicbrainz',
  MusicBrainzProvider as any,
  new MusicBrainzProvider(
    {
      id: 0,
      providerName: 'musicbrainz',
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      contact: 'https://github.com/metarr',
    }
  ).getCapabilities()
);

logger.debug('MusicBrainz provider registered with ProviderRegistry');
