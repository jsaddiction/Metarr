/**
 * Local Provider Tests
 */

import { jest } from '@jest/globals';
import { LocalProvider } from '../../src/services/providers/local/LocalProvider.js';
import { createMockProviderConfig } from './helpers.js';

describe('LocalProvider', () => {
  let provider: LocalProvider;

  beforeEach(() => {
    const config = createMockProviderConfig('local');
    provider = new LocalProvider(config);
  });

  describe('Capabilities', () => {
    it('should have correct provider ID', () => {
      expect(provider.getCapabilities().id).toBe('local');
    });

    it('should support both metadata and images', () => {
      expect(provider.getCapabilities().category).toBe('both');
    });

    it('should support movie, series, season, and episode', () => {
      const capabilities = provider.getCapabilities();
      expect(capabilities.supportedEntityTypes).toContain('movie');
      expect(capabilities.supportedEntityTypes).toContain('series');
      expect(capabilities.supportedEntityTypes).toContain('season');
      expect(capabilities.supportedEntityTypes).toContain('episode');
    });

    it('should have unlimited rate limit', () => {
      const capabilities = provider.getCapabilities();
      expect(capabilities.rateLimit.requestsPerSecond).toBe(1000);
    });
  });

  describe('Search', () => {
    it('should throw error when directoryPath is not provided', async () => {
      await expect(provider.search({ query: 'test', entityType: 'movie' })).rejects.toThrow(
        'Local provider requires directoryPath for search'
      );
    });
  });

  describe('Connection Test', () => {
    it('should return success', async () => {
      const result = await provider.testConnection();
      expect(result.success).toBe(true);
    });
  });
});
