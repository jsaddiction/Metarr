/**
 * MusicBrainz Provider Tests
 */

import { jest } from '@jest/globals';
import { MusicBrainzProvider } from '../../src/services/providers/musicbrainz/MusicBrainzProvider.js';
import { MusicBrainzClient } from '../../src/services/providers/musicbrainz/MusicBrainzClient.js';
import { createMockProviderConfig } from './helpers.js';

// Mock the MusicBrainz client
const mockSearchArtists = jest.fn<() => Promise<any[]>>();
const mockGetArtist = jest.fn<() => Promise<any>>();
const mockSearchReleaseGroups = jest.fn<() => Promise<any[]>>();
const mockGetReleaseGroup = jest.fn<() => Promise<any>>();
const mockSearchRecordings = jest.fn<() => Promise<any[]>>();
const mockGetRecording = jest.fn<() => Promise<any>>();

jest.spyOn(MusicBrainzClient.prototype, 'searchArtists').mockImplementation(mockSearchArtists as any);
jest.spyOn(MusicBrainzClient.prototype, 'getArtist').mockImplementation(mockGetArtist as any);
jest.spyOn(MusicBrainzClient.prototype, 'searchReleaseGroups').mockImplementation(mockSearchReleaseGroups as any);
jest.spyOn(MusicBrainzClient.prototype, 'getReleaseGroup').mockImplementation(mockGetReleaseGroup as any);
jest.spyOn(MusicBrainzClient.prototype, 'searchRecordings').mockImplementation(mockSearchRecordings as any);
jest.spyOn(MusicBrainzClient.prototype, 'getRecording').mockImplementation(mockGetRecording as any);

describe('MusicBrainzProvider', () => {
  let provider: MusicBrainzProvider;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    const config = createMockProviderConfig('musicbrainz');

    provider = new MusicBrainzProvider(config, {
      contact: 'test@example.com',
    });
  });

  describe('Capabilities', () => {
    it('should have correct provider ID', () => {
      const capabilities = provider.getCapabilities();
      expect(capabilities.id).toBe('musicbrainz');
    });

    it('should support music entities', () => {
      const capabilities = provider.getCapabilities();
      expect(capabilities.supportedEntityTypes).toContain('artist');
      expect(capabilities.supportedEntityTypes).toContain('album');
      expect(capabilities.supportedEntityTypes).toContain('track');
    });

    it('should be metadata-only provider', () => {
      const capabilities = provider.getCapabilities();
      expect(capabilities.category).toBe('metadata');
    });

    it('should have strict rate limit of 1 req/sec', () => {
      const capabilities = provider.getCapabilities();
      expect(capabilities.rateLimit.requestsPerSecond).toBe(1);
      expect(capabilities.rateLimit.burstCapacity).toBe(1);
    });

    it('should support search with fuzzy matching', () => {
      const capabilities = provider.getCapabilities();
      expect(capabilities.search.supported).toBe(true);
      expect(capabilities.search.fuzzyMatching).toBe(true);
    });

    it('should not provide assets', () => {
      const capabilities = provider.getCapabilities();
      expect(capabilities.assetProvision.providesUrls).toBe(false);
    });
  });

  describe('Search', () => {
    it('should search for artists', async () => {
      mockSearchArtists.mockResolvedValue([
        {
          id: 'artist-mbid-123',
          name: 'Radiohead',
          score: 100,
        },
      ]);

      const searchRequest = {
        query: 'Radiohead',
        entityType: 'artist' as const,
      };

      const results = await provider.search(searchRequest);

      expect(mockSearchArtists).toHaveBeenCalledWith('Radiohead');
      expect(results).toHaveLength(1);
      expect(results[0].providerResultId).toBe('artist-mbid-123');
      expect(results[0].title).toBe('Radiohead');
    });

    it('should search for albums', async () => {
      mockSearchReleaseGroups.mockResolvedValue([
        {
          id: 'album-mbid-456',
          name: 'OK Computer',
          score: 100,
        },
      ]);

      const searchRequest = {
        query: 'OK Computer',
        entityType: 'album' as const,
      };

      const results = await provider.search(searchRequest);

      expect(mockSearchReleaseGroups).toHaveBeenCalledWith('OK Computer');
      expect(results).toHaveLength(1);
      expect(results[0].providerResultId).toBe('album-mbid-456');
      expect(results[0].title).toBe('OK Computer');
    });

    it('should search for tracks', async () => {
      mockSearchRecordings.mockResolvedValue([
        {
          id: 'track-mbid-789',
          name: 'Paranoid Android',
          score: 100,
        },
      ]);

      const searchRequest = {
        query: 'Paranoid Android',
        entityType: 'track' as const,
      };

      const results = await provider.search(searchRequest);

      expect(mockSearchRecordings).toHaveBeenCalledWith('Paranoid Android');
      expect(results).toHaveLength(1);
      expect(results[0].providerResultId).toBe('track-mbid-789');
      expect(results[0].title).toBe('Paranoid Android');
    });
  });

  describe('Metadata', () => {
    it('should retrieve artist metadata', async () => {
      mockGetArtist.mockResolvedValue({
        id: 'artist-mbid-123',
        name: 'Radiohead',
        sortName: 'Radiohead',
        country: 'GB',
        lifeSpan: { begin: '1985' },
        genres: [{ name: 'Alternative Rock' }, { name: 'Art Rock' }],
      });

      const metadataRequest = {
        providerId: 'musicbrainz' as const,
        providerResultId: 'artist-mbid-123',
        entityType: 'artist' as const,
      };

      const result = await provider.getMetadata(metadataRequest);

      expect(mockGetArtist).toHaveBeenCalledWith('artist-mbid-123');
      expect(result.fields.title).toBe('Radiohead');
      expect(result.fields.sortTitle).toBe('Radiohead');
      expect(result.fields.country).toBe('GB');
      expect(result.fields.formed).toBe('1985');
      expect(result.fields.genres).toEqual(['Alternative Rock', 'Art Rock']);
    });

    it('should retrieve album metadata', async () => {
      mockGetReleaseGroup.mockResolvedValue({
        id: 'album-mbid-456',
        title: 'OK Computer',
        firstReleaseDate: '1997-05-21',
        artistCredit: [
          {
            artist: {
              id: 'artist-mbid-123',
              name: 'Radiohead',
            },
          },
        ],
      });

      const metadataRequest = {
        providerId: 'musicbrainz' as const,
        providerResultId: 'album-mbid-456',
        entityType: 'album' as const,
      };

      const result = await provider.getMetadata(metadataRequest);

      expect(mockGetReleaseGroup).toHaveBeenCalledWith('album-mbid-456');
      expect(result.fields.title).toBe('OK Computer');
      expect(result.fields.releaseDate).toBe('1997-05-21');
      expect(result.fields.artist).toBe('Radiohead');
    });

    it('should retrieve track metadata', async () => {
      mockGetRecording.mockResolvedValue({
        id: 'track-mbid-789',
        title: 'Paranoid Android',
        length: 383000, // milliseconds
        artistCredit: [
          {
            artist: {
              id: 'artist-mbid-123',
              name: 'Radiohead',
            },
          },
        ],
      });

      const metadataRequest = {
        providerId: 'musicbrainz' as const,
        providerResultId: 'track-mbid-789',
        entityType: 'track' as const,
      };

      const result = await provider.getMetadata(metadataRequest);

      expect(mockGetRecording).toHaveBeenCalledWith('track-mbid-789');
      expect(result.fields.title).toBe('Paranoid Android');
      expect(result.fields.duration).toBe(383); // converted to seconds
      expect(result.fields.artist).toBe('Radiohead');
    });
  });

  describe('Assets', () => {
    it('should return empty array for asset requests', async () => {
      const assetRequest = {
        providerId: 'musicbrainz' as const,
        providerResultId: 'test-mbid',
        entityType: 'artist' as const,
        assetTypes: ['artistthumb' as const],
      };

      const result = await provider.getAssets(assetRequest);
      expect(result).toEqual([]);
    });
  });

  describe('Connection Test', () => {
    it('should return success when API is accessible', async () => {
      mockSearchArtists.mockResolvedValue([
        {
          id: 'test-id',
          name: 'Test Artist',
          score: 100,
        },
      ]);

      const result = await provider.testConnection();

      expect(mockSearchArtists).toHaveBeenCalledWith('test', 1);
      expect(result.success).toBe(true);
      expect(result.message).toBe('MusicBrainz API is accessible');
    });

    it('should return failure when API is not accessible', async () => {
      mockSearchArtists.mockRejectedValue(new Error('Network error'));

      const result = await provider.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toContain('MusicBrainz access failed');
      expect(result.error).toBe('Network error');
    });
  });
});
