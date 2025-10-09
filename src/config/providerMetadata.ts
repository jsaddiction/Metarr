import { ProviderMetadata } from '../types/provider.js';

/**
 * Provider Metadata Definitions
 *
 * Hard-coded metadata for each supported provider including:
 * - Display names
 * - API requirements
 * - Rate limits (NOT user-configurable)
 * - Supported asset types
 */

export const PROVIDER_METADATA: Record<string, ProviderMetadata> = {
  tmdb: {
    name: 'tmdb',
    displayName: 'TMDB (The Movie Database)',
    requiresApiKey: true,
    baseUrl: 'https://api.themoviedb.org/3',
    authType: 'bearer',
    rateLimit: {
      requests: 40,
      windowSeconds: 10
    },
    supportedAssetTypes: [
      { type: 'poster', displayName: 'Posters', available: true },
      { type: 'fanart', displayName: 'Fanart (Backdrops)', available: true },
      { type: 'trailer', displayName: 'Trailers (YouTube)', available: true },
      { type: 'banner', displayName: 'Banners', available: false },
      { type: 'clearlogo', displayName: 'ClearLogo', available: false }
    ]
  },

  tvdb: {
    name: 'tvdb',
    displayName: 'TVDB (TheTVDB)',
    requiresApiKey: true,
    baseUrl: 'https://api4.thetvdb.com/v4',
    authType: 'jwt',
    rateLimit: {
      requests: 30,
      windowSeconds: 10
    },
    supportedAssetTypes: [
      { type: 'poster', displayName: 'Series Posters', available: true },
      { type: 'fanart', displayName: 'Fanart', available: true },
      { type: 'banner', displayName: 'Series Banners', available: true },
      { type: 'season_poster', displayName: 'Season Posters', available: true },
      { type: 'episode_still', displayName: 'Episode Stills', available: true }
    ]
  },

  fanart_tv: {
    name: 'fanart_tv',
    displayName: 'FanArt.tv',
    requiresApiKey: false,
    apiKeyOptional: true,
    apiKeyBenefit: 'Personal API keys get higher rate limits (20 req/sec vs 10 req/sec) and priority access to new images',
    baseUrl: 'https://webservice.fanart.tv/v3',
    rateLimit: {
      requests: 10, // Project API key limit (20 with personal key)
      windowSeconds: 1
    },
    supportedAssetTypes: [
      { type: 'hdclearlogo', displayName: 'HD ClearLogo', available: true },
      { type: 'clearlogo', displayName: 'ClearLogo', available: true },
      { type: 'clearart', displayName: 'ClearArt', available: true },
      { type: 'hdclearart', displayName: 'HD ClearArt', available: true },
      { type: 'cdart', displayName: 'CD Art', available: true },
      { type: 'characterart', displayName: 'Character Art', available: true },
      { type: 'tvthumb', displayName: 'TV Thumbnail', available: true }
    ]
  }
};

/**
 * Get metadata for a specific provider
 */
export function getProviderMetadata(providerName: string): ProviderMetadata | undefined {
  return PROVIDER_METADATA[providerName];
}

/**
 * Get all provider metadata
 */
export function getAllProviderMetadata(): ProviderMetadata[] {
  return Object.values(PROVIDER_METADATA);
}

/**
 * Check if a provider is supported
 */
export function isProviderSupported(providerName: string): boolean {
  return providerName in PROVIDER_METADATA;
}
