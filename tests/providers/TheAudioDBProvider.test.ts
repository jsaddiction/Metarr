/**
 * TheAudioDB Provider Tests
 */

import { jest } from '@jest/globals';
import { TheAudioDBProvider } from '../../src/services/providers/theaudiodb/TheAudioDBProvider.js';
import { TheAudioDBClient } from '../../src/services/providers/theaudiodb/TheAudioDBClient.js';
import { createMockProviderConfig } from './helpers.js';

const mockSearchArtist = jest.fn<() => Promise<any>>();
const mockGetArtistByMBID = jest.fn<() => Promise<any>>();

jest.spyOn(TheAudioDBClient.prototype, 'searchArtist').mockImplementation(mockSearchArtist as any);
jest.spyOn(TheAudioDBClient.prototype, 'getArtistByMBID').mockImplementation(mockGetArtistByMBID as any);

describe('TheAudioDBProvider', () => {
  let provider: TheAudioDBProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    const config = createMockProviderConfig('theaudiodb');
    provider = new TheAudioDBProvider(config);
  });

  describe('Capabilities', () => {
    it('should have correct provider ID', () => {
      expect(provider.getCapabilities().id).toBe('theaudiodb');
    });

    it('should be images-only provider', () => {
      expect(provider.getCapabilities().category).toBe('images');
    });

    it('should support artist and album entity types', () => {
      const capabilities = provider.getCapabilities();
      expect(capabilities.supportedEntityTypes).toContain('artist');
      expect(capabilities.supportedEntityTypes).toContain('album');
    });
  });

  describe('Search', () => {
    it('should search for artists', async () => {
      mockSearchArtist.mockResolvedValue([{ idArtist: '111239', strArtist: 'Radiohead' }]);

      const results = await provider.search({ query: 'Radiohead', entityType: 'artist' });

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Radiohead');
    });
  });

  describe('Assets', () => {
    it('should handle asset requests without errors', async () => {
      mockGetArtistByMBID.mockResolvedValue({
        idArtist: '111239',
        strArtist: 'Radiohead',
        strArtistThumb: 'https://theaudiodb.com/images/media/artist/thumb/radiohead.jpg',
        strArtistLogo: 'https://theaudiodb.com/images/media/artist/logo/radiohead.png',
      });

      const results = await provider.getAssets({
        providerId: 'theaudiodb',
        providerResultId: '111239',
        entityType: 'artist',
        assetTypes: ['artistthumb', 'musiclogo'],
      });

      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('Connection Test', () => {
    it('should return success', async () => {
      const result = await provider.testConnection();
      expect(result.success).toBe(true);
    });
  });
});
