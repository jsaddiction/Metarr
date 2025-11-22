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
    displayName: 'TMDB',
    requiresApiKey: false,
    apiKeyOptional: true,
    apiKeyBenefit: 'Personal API keys allow usage tracking and support the TMDB community. Get yours at https://www.themoviedb.org/settings/api',
    baseUrl: 'https://api.themoviedb.org/3',
    authType: 'bearer',
    rateLimit: {
      requests: 40,
      windowSeconds: 10
    },
    supportedAssetTypes: [
      { type: 'movie_poster', displayName: 'Movie Posters', available: true },
      { type: 'movie_fanart', displayName: 'Movie Fanart (Backdrops)', available: true },
      { type: 'movie_trailer', displayName: 'Movie Trailers (YouTube)', available: true },
      { type: 'tv_poster', displayName: 'TV Posters', available: true },
      { type: 'tv_fanart', displayName: 'TV Fanart (Backdrops)', available: true },
      { type: 'movie_banner', displayName: 'Movie Banners', available: false },
      { type: 'tv_banner', displayName: 'TV Banners', available: false },
      { type: 'movie_clearlogo', displayName: 'Movie ClearLogo', available: false },
      { type: 'tv_clearlogo', displayName: 'TV ClearLogo', available: false }
    ]
  },

  tvdb: {
    name: 'tvdb',
    displayName: 'TVDB',
    requiresApiKey: false,
    apiKeyOptional: true,
    apiKeyBenefit: 'Personal API keys allow usage tracking and support the TVDB community. Get yours at https://thetvdb.com/api-information',
    baseUrl: 'https://api4.thetvdb.com/v4',
    authType: 'jwt',
    rateLimit: {
      requests: 30,
      windowSeconds: 10
    },
    supportedAssetTypes: [
      { type: 'tv_poster', displayName: 'Series Posters', available: true },
      { type: 'tv_fanart', displayName: 'TV Fanart', available: true },
      { type: 'tv_banner', displayName: 'Series Banners', available: true },
      { type: 'tv_season_poster', displayName: 'Season Posters', available: true },
      { type: 'tv_episode_still', displayName: 'Episode Stills', available: true }
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
      { type: 'movie_poster', displayName: 'Movie Posters', available: true },
      { type: 'movie_fanart', displayName: 'Movie Fanart', available: true },
      { type: 'movie_banner', displayName: 'Movie Banners', available: true },
      { type: 'movie_clearlogo', displayName: 'Movie ClearLogo', available: true },
      { type: 'movie_clearart', displayName: 'Movie ClearArt', available: true },
      { type: 'movie_landscape', displayName: 'Movie Landscape', available: true },
      { type: 'movie_discart', displayName: 'Movie Disc Art', available: true },
      { type: 'tv_poster', displayName: 'TV Posters', available: true },
      { type: 'tv_fanart', displayName: 'TV Fanart', available: true },
      { type: 'tv_banner', displayName: 'TV Banners', available: true },
      { type: 'tv_clearlogo', displayName: 'TV ClearLogo', available: true },
      { type: 'tv_clearart', displayName: 'TV ClearArt', available: true },
      { type: 'tv_characterart', displayName: 'TV Character Art', available: true },
      { type: 'tv_landscape', displayName: 'TV Landscape', available: true }
    ]
  },

  local: {
    name: 'local',
    displayName: 'Local Files',
    requiresApiKey: false,
    baseUrl: 'file://local',
    rateLimit: {
      requests: 1000, // Effectively unlimited for filesystem operations
      windowSeconds: 1
    },
    supportedAssetTypes: [
      { type: 'movie_poster', displayName: 'Movie Posters', available: true },
      { type: 'movie_fanart', displayName: 'Movie Fanart', available: true },
      { type: 'movie_banner', displayName: 'Movie Banners', available: true },
      { type: 'movie_clearlogo', displayName: 'Movie ClearLogo', available: true },
      { type: 'movie_clearart', displayName: 'Movie ClearArt', available: true },
      { type: 'movie_discart', displayName: 'Movie Disc Art', available: true },
      { type: 'tv_poster', displayName: 'TV Posters', available: true },
      { type: 'tv_fanart', displayName: 'TV Fanart', available: true },
      { type: 'tv_banner', displayName: 'TV Banners', available: true },
      { type: 'tv_landscape', displayName: 'TV Landscape', available: true },
      { type: 'tv_thumb', displayName: 'TV Thumbnail', available: true },
      { type: 'tv_characterart', displayName: 'TV Character Art', available: true }
    ]
  },

  musicbrainz: {
    name: 'musicbrainz',
    displayName: 'MusicBrainz',
    requiresApiKey: false,
    baseUrl: 'https://musicbrainz.org/ws/2',
    rateLimit: {
      requests: 1, // Strict requirement from MusicBrainz
      windowSeconds: 1
    },
    supportedAssetTypes: [] // Metadata only, no assets
  },

  theaudiodb: {
    name: 'theaudiodb',
    displayName: 'TheAudioDB',
    requiresApiKey: true,
    apiKeyOptional: false,
    baseUrl: 'https://www.theaudiodb.com/api/v1/json',
    rateLimit: {
      requests: 30, // Free tier limit
      windowSeconds: 60
    },
    supportedAssetTypes: [
      { type: 'artist_thumb', displayName: 'Artist Thumbnail', available: true },
      { type: 'artist_logo', displayName: 'Artist Logo', available: true },
      { type: 'artist_fanart', displayName: 'Artist Fanart', available: true },
      { type: 'artist_banner', displayName: 'Artist Banner', available: true },
      { type: 'album_thumb', displayName: 'Album Cover', available: true },
      { type: 'album_cdart', displayName: 'Album CD Art', available: true },
      { type: 'album_spine', displayName: 'Album Spine', available: true }
    ]
  },

  omdb: {
    name: 'omdb',
    displayName: 'OMDb API',
    requiresApiKey: true,
    apiKeyOptional: false,
    apiKeyBenefit: 'Required for OMDb API access. Get your free API key at https://www.omdbapi.com/apikey.aspx',
    baseUrl: 'https://www.omdbapi.com',
    rateLimit: {
      requests: 11, // 1000 requests per day ≈ 0.011 per second, burst to 11 for practical use
      windowSeconds: 1
    },
    supportedAssetTypes: [
      { type: 'movie_poster', displayName: 'Movie Posters', available: true },
      { type: 'tv_poster', displayName: 'TV Posters', available: true }
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

/**
 * Check if a provider supports a specific asset type
 */
export function providerSupportsAssetType(providerName: string, assetType: string): boolean {
  const metadata = getProviderMetadata(providerName);
  if (!metadata) return false;

  return metadata.supportedAssetTypes.some(
    asset => asset.type === assetType && asset.available
  );
}

/**
 * Get all providers that support a specific asset type
 */
export function getProvidersForAssetType(assetType: string): string[] {
  return Object.values(PROVIDER_METADATA)
    .filter(provider =>
      provider.supportedAssetTypes.some(
        asset => asset.type === assetType && asset.available
      )
    )
    .map(provider => provider.name);
}

