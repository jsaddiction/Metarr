import {
  PROVIDER_METADATA,
  getProviderMetadata,
  getAllProviderMetadata,
  isProviderSupported
} from '../../src/config/providerMetadata.js';

describe('Provider Metadata', () => {
  describe('PROVIDER_METADATA constant', () => {
    it('should contain TMDB metadata', () => {
      expect(PROVIDER_METADATA.tmdb).toBeDefined();
      expect(PROVIDER_METADATA.tmdb.name).toBe('tmdb');
      expect(PROVIDER_METADATA.tmdb.displayName).toBe('TMDB (The Movie Database)');
    });

    it('should contain TVDB metadata', () => {
      expect(PROVIDER_METADATA.tvdb).toBeDefined();
      expect(PROVIDER_METADATA.tvdb.name).toBe('tvdb');
      expect(PROVIDER_METADATA.tvdb.displayName).toBe('TVDB (TheTVDB)');
    });

    it('should contain FanArt.tv metadata', () => {
      expect(PROVIDER_METADATA.fanart_tv).toBeDefined();
      expect(PROVIDER_METADATA.fanart_tv.name).toBe('fanart_tv');
      expect(PROVIDER_METADATA.fanart_tv.displayName).toBe('FanArt.tv');
    });

    it('should have at least 3 providers', () => {
      const providerCount = Object.keys(PROVIDER_METADATA).length;
      expect(providerCount).toBeGreaterThanOrEqual(3);
    });
  });

  describe('TMDB metadata', () => {
    const tmdb = PROVIDER_METADATA.tmdb;

    it('should require API key', () => {
      expect(tmdb.requiresApiKey).toBe(true);
    });

    it('should have correct base URL', () => {
      expect(tmdb.baseUrl).toBe('https://api.themoviedb.org/3');
    });

    it('should use bearer auth', () => {
      expect(tmdb.authType).toBe('bearer');
    });

    it('should have rate limit of 40 requests per 10 seconds', () => {
      expect(tmdb.rateLimit.requests).toBe(40);
      expect(tmdb.rateLimit.windowSeconds).toBe(10);
    });

    it('should support posters', () => {
      const poster = tmdb.supportedAssetTypes.find(t => t.type === 'poster');
      expect(poster).toBeDefined();
      expect(poster?.available).toBe(true);
      expect(poster?.displayName).toBe('Posters');
    });

    it('should support fanart', () => {
      const fanart = tmdb.supportedAssetTypes.find(t => t.type === 'fanart');
      expect(fanart).toBeDefined();
      expect(fanart?.available).toBe(true);
      expect(fanart?.displayName).toBe('Fanart (Backdrops)');
    });

    it('should support trailers', () => {
      const trailer = tmdb.supportedAssetTypes.find(t => t.type === 'trailer');
      expect(trailer).toBeDefined();
      expect(trailer?.available).toBe(true);
      expect(trailer?.displayName).toBe('Trailers (YouTube)');
    });

    it('should not support banners', () => {
      const banner = tmdb.supportedAssetTypes.find(t => t.type === 'banner');
      expect(banner).toBeDefined();
      expect(banner?.available).toBe(false);
    });

    it('should not support clearlogo', () => {
      const clearlogo = tmdb.supportedAssetTypes.find(t => t.type === 'clearlogo');
      expect(clearlogo).toBeDefined();
      expect(clearlogo?.available).toBe(false);
    });

    it('should have all required metadata fields', () => {
      expect(tmdb).toHaveProperty('name');
      expect(tmdb).toHaveProperty('displayName');
      expect(tmdb).toHaveProperty('requiresApiKey');
      expect(tmdb).toHaveProperty('baseUrl');
      expect(tmdb).toHaveProperty('rateLimit');
      expect(tmdb).toHaveProperty('supportedAssetTypes');
    });
  });

  describe('TVDB metadata', () => {
    const tvdb = PROVIDER_METADATA.tvdb;

    it('should require API key', () => {
      expect(tvdb.requiresApiKey).toBe(true);
    });

    it('should have correct base URL', () => {
      expect(tvdb.baseUrl).toBe('https://api4.thetvdb.com/v4');
    });

    it('should use JWT auth', () => {
      expect(tvdb.authType).toBe('jwt');
    });

    it('should have rate limit of 30 requests per 10 seconds', () => {
      expect(tvdb.rateLimit.requests).toBe(30);
      expect(tvdb.rateLimit.windowSeconds).toBe(10);
    });

    it('should support series posters', () => {
      const poster = tvdb.supportedAssetTypes.find(t => t.type === 'poster');
      expect(poster).toBeDefined();
      expect(poster?.available).toBe(true);
    });

    it('should support banners', () => {
      const banner = tvdb.supportedAssetTypes.find(t => t.type === 'banner');
      expect(banner).toBeDefined();
      expect(banner?.available).toBe(true);
    });

    it('should support season posters', () => {
      const seasonPoster = tvdb.supportedAssetTypes.find(t => t.type === 'season_poster');
      expect(seasonPoster).toBeDefined();
      expect(seasonPoster?.available).toBe(true);
    });
  });

  describe('FanArt.tv metadata', () => {
    const fanart = PROVIDER_METADATA.fanart_tv;

    it('should not require API key (but is optional)', () => {
      expect(fanart.requiresApiKey).toBe(false);
      expect(fanart.apiKeyOptional).toBe(true);
    });

    it('should have API key benefit explanation', () => {
      expect(fanart.apiKeyBenefit).toBeDefined();
      expect(fanart.apiKeyBenefit).toContain('higher rate limits');
    });

    it('should have correct base URL', () => {
      expect(fanart.baseUrl).toBe('https://webservice.fanart.tv/v3');
    });

    it('should have rate limit of 10 requests per second', () => {
      expect(fanart.rateLimit.requests).toBe(10);
      expect(fanart.rateLimit.windowSeconds).toBe(1);
    });

    it('should support HD ClearLogo', () => {
      const hdclearlogo = fanart.supportedAssetTypes.find(t => t.type === 'hdclearlogo');
      expect(hdclearlogo).toBeDefined();
      expect(hdclearlogo?.available).toBe(true);
    });

    it('should support ClearArt', () => {
      const clearart = fanart.supportedAssetTypes.find(t => t.type === 'clearart');
      expect(clearart).toBeDefined();
      expect(clearart?.available).toBe(true);
    });

    it('should support character art', () => {
      const characterart = fanart.supportedAssetTypes.find(t => t.type === 'characterart');
      expect(characterart).toBeDefined();
      expect(characterart?.available).toBe(true);
    });
  });

  describe('getProviderMetadata', () => {
    it('should return metadata for TMDB', () => {
      const result = getProviderMetadata('tmdb');
      expect(result).toBeDefined();
      expect(result?.name).toBe('tmdb');
    });

    it('should return metadata for TVDB', () => {
      const result = getProviderMetadata('tvdb');
      expect(result).toBeDefined();
      expect(result?.name).toBe('tvdb');
    });

    it('should return metadata for FanArt.tv', () => {
      const result = getProviderMetadata('fanart_tv');
      expect(result).toBeDefined();
      expect(result?.name).toBe('fanart_tv');
    });

    it('should return undefined for unknown provider', () => {
      const result = getProviderMetadata('unknown_provider');
      expect(result).toBeUndefined();
    });

    it('should return undefined for empty string', () => {
      const result = getProviderMetadata('');
      expect(result).toBeUndefined();
    });

    it('should be case-sensitive', () => {
      const result = getProviderMetadata('TMDB'); // uppercase
      expect(result).toBeUndefined();
    });
  });

  describe('getAllProviderMetadata', () => {
    it('should return array of all provider metadata', () => {
      const result = getAllProviderMetadata();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThanOrEqual(3);
    });

    it('should include TMDB in results', () => {
      const result = getAllProviderMetadata();
      const tmdb = result.find(p => p.name === 'tmdb');
      expect(tmdb).toBeDefined();
    });

    it('should include TVDB in results', () => {
      const result = getAllProviderMetadata();
      const tvdb = result.find(p => p.name === 'tvdb');
      expect(tvdb).toBeDefined();
    });

    it('should include FanArt.tv in results', () => {
      const result = getAllProviderMetadata();
      const fanart = result.find(p => p.name === 'fanart_tv');
      expect(fanart).toBeDefined();
    });

    it('should return complete metadata objects', () => {
      const result = getAllProviderMetadata();
      result.forEach(metadata => {
        expect(metadata).toHaveProperty('name');
        expect(metadata).toHaveProperty('displayName');
        expect(metadata).toHaveProperty('requiresApiKey');
        expect(metadata).toHaveProperty('baseUrl');
        expect(metadata).toHaveProperty('rateLimit');
        expect(metadata).toHaveProperty('supportedAssetTypes');
      });
    });

    it('should return new array instance each call', () => {
      const result1 = getAllProviderMetadata();
      const result2 = getAllProviderMetadata();
      expect(result1).not.toBe(result2); // Different array instances
      expect(result1).toEqual(result2); // Same content
    });
  });

  describe('isProviderSupported', () => {
    it('should return true for TMDB', () => {
      expect(isProviderSupported('tmdb')).toBe(true);
    });

    it('should return true for TVDB', () => {
      expect(isProviderSupported('tvdb')).toBe(true);
    });

    it('should return true for FanArt.tv', () => {
      expect(isProviderSupported('fanart_tv')).toBe(true);
    });

    it('should return false for unknown provider', () => {
      expect(isProviderSupported('unknown_provider')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isProviderSupported('')).toBe(false);
    });

    it('should be case-sensitive', () => {
      expect(isProviderSupported('TMDB')).toBe(false);
      expect(isProviderSupported('Tmdb')).toBe(false);
    });

    it('should return false for partial matches', () => {
      expect(isProviderSupported('tm')).toBe(false);
      expect(isProviderSupported('tmdb_extra')).toBe(false);
    });
  });

  describe('Rate limits', () => {
    it('should have unique rate limits per provider', () => {
      const tmdb = PROVIDER_METADATA.tmdb.rateLimit;
      const tvdb = PROVIDER_METADATA.tvdb.rateLimit;
      const fanart = PROVIDER_METADATA.fanart_tv.rateLimit;

      // At least one should be different
      const allSame =
        tmdb.requests === tvdb.requests &&
        tvdb.requests === fanart.requests &&
        tmdb.windowSeconds === tvdb.windowSeconds &&
        tvdb.windowSeconds === fanart.windowSeconds;

      expect(allSame).toBe(false);
    });

    it('should have positive rate limit values', () => {
      const all = getAllProviderMetadata();
      all.forEach(provider => {
        expect(provider.rateLimit.requests).toBeGreaterThan(0);
        expect(provider.rateLimit.windowSeconds).toBeGreaterThan(0);
      });
    });

    it('should have reasonable rate limit values', () => {
      const all = getAllProviderMetadata();
      all.forEach(provider => {
        // Reasonable limits: 1-1000 requests
        expect(provider.rateLimit.requests).toBeGreaterThanOrEqual(1);
        expect(provider.rateLimit.requests).toBeLessThanOrEqual(1000);

        // Reasonable window: 1-3600 seconds
        expect(provider.rateLimit.windowSeconds).toBeGreaterThanOrEqual(1);
        expect(provider.rateLimit.windowSeconds).toBeLessThanOrEqual(3600);
      });
    });
  });

  describe('Asset types', () => {
    it('should have at least one supported asset type per provider', () => {
      const all = getAllProviderMetadata();
      all.forEach(provider => {
        const availableTypes = provider.supportedAssetTypes.filter(t => t.available);
        expect(availableTypes.length).toBeGreaterThan(0);
      });
    });

    it('should have display names for all asset types', () => {
      const all = getAllProviderMetadata();
      all.forEach(provider => {
        provider.supportedAssetTypes.forEach(assetType => {
          expect(assetType.displayName).toBeDefined();
          expect(assetType.displayName.length).toBeGreaterThan(0);
        });
      });
    });

    it('should have unique asset type names within a provider', () => {
      const all = getAllProviderMetadata();
      all.forEach(provider => {
        const types = provider.supportedAssetTypes.map(t => t.type);
        const uniqueTypes = new Set(types);
        expect(types.length).toBe(uniqueTypes.size);
      });
    });

    it('should use lowercase asset type identifiers', () => {
      const all = getAllProviderMetadata();
      all.forEach(provider => {
        provider.supportedAssetTypes.forEach(assetType => {
          expect(assetType.type).toBe(assetType.type.toLowerCase());
        });
      });
    });
  });

  describe('Provider metadata consistency', () => {
    it('should have matching name and metadata key', () => {
      Object.entries(PROVIDER_METADATA).forEach(([key, metadata]) => {
        expect(metadata.name).toBe(key);
      });
    });

    it('should use lowercase provider names', () => {
      const all = getAllProviderMetadata();
      all.forEach(provider => {
        expect(provider.name).toBe(provider.name.toLowerCase());
      });
    });

    it('should have non-empty display names', () => {
      const all = getAllProviderMetadata();
      all.forEach(provider => {
        expect(provider.displayName).toBeDefined();
        expect(provider.displayName.length).toBeGreaterThan(0);
      });
    });

    it('should have valid base URLs', () => {
      const all = getAllProviderMetadata();
      all.forEach(provider => {
        expect(provider.baseUrl).toMatch(/^https?:\/\//);
      });
    });
  });
});
