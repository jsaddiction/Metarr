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
      { type: 'tvthumb', displayName: 'TV Thumbnail', available: true },
      { type: 'poster', displayName: 'Movie Posters', available: true },
      { type: 'fanart', displayName: 'Movie Fanart', available: true },
      { type: 'banner', displayName: 'Series Banners', available: true }
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
      { type: 'poster', displayName: 'Posters', available: true },
      { type: 'fanart', displayName: 'Fanart', available: true },
      { type: 'banner', displayName: 'Banners', available: true },
      { type: 'clearlogo', displayName: 'ClearLogo', available: true },
      { type: 'clearart', displayName: 'ClearArt', available: true },
      { type: 'discart', displayName: 'Disc Art', available: true },
      { type: 'landscape', displayName: 'Landscape', available: true },
      { type: 'thumb', displayName: 'Thumbnail', available: true },
      { type: 'characterart', displayName: 'Character Art', available: true }
    ]
  },

  imdb: {
    name: 'imdb',
    displayName: 'IMDb (Internet Movie Database)',
    requiresApiKey: false,
    baseUrl: 'https://www.imdb.com',
    legalWarning: 'Web scraping violates IMDb Terms of Service. Use at your own risk. Your IP may be banned.',
    rateLimit: {
      requests: 1, // Very conservative to avoid IP bans
      windowSeconds: 1
    },
    supportedAssetTypes: [] // Metadata only, no assets
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
 * Priority Presets
 *
 * Predefined provider ordering configurations for common use cases.
 * Users can select a preset or customize individual asset types.
 */
export interface PriorityPreset {
  id: string;
  label: string;
  description: string;
  assetTypePriorities: Record<string, string[]>;
  metadataFieldPriorities: Record<string, string[]>;
}

export const PRIORITY_PRESETS: Record<string, PriorityPreset> = {
  quality_first: {
    id: 'quality_first',
    label: 'Quality First',
    description: 'Prefer curated, high-quality artwork from FanArt.tv and TheAudioDB',
    assetTypePriorities: {
      // Video assets
      poster: ['fanart_tv', 'tmdb', 'tvdb', 'local'],
      fanart: ['fanart_tv', 'tmdb', 'tvdb', 'local'],
      banner: ['fanart_tv', 'tvdb', 'tmdb', 'local'],
      clearlogo: ['fanart_tv', 'tvdb', 'local'],
      hdclearlogo: ['fanart_tv', 'local'],
      clearart: ['fanart_tv', 'local'],
      hdclearart: ['fanart_tv', 'local'],
      discart: ['fanart_tv', 'local'],
      characterart: ['fanart_tv', 'local'],
      landscape: ['tmdb', 'tvdb', 'local'],
      thumb: ['fanart_tv', 'tvdb', 'local'],
      // TV-specific
      season_poster: ['tvdb', 'tmdb', 'local'],
      episode_still: ['tvdb', 'tmdb', 'local'],
      // Music assets
      artist_thumb: ['theaudiodb', 'local'],
      artist_logo: ['theaudiodb', 'local'],
      artist_fanart: ['theaudiodb', 'local'],
      artist_banner: ['theaudiodb', 'local'],
      album_thumb: ['theaudiodb', 'local'],
      album_cdart: ['theaudiodb', 'local']
    },
    metadataFieldPriorities: {
      // Ratings - IMDb is most trusted
      rating: ['imdb', 'tmdb', 'tvdb'],
      vote_count: ['imdb', 'tmdb', 'tvdb'],
      // General metadata - TMDB is comprehensive
      plot: ['tmdb', 'tvdb', 'imdb', 'local'],
      tagline: ['tmdb', 'tvdb', 'local'],
      genres: ['tmdb', 'tvdb', 'imdb', 'local'],
      // People
      actors: ['tmdb', 'tvdb', 'imdb', 'local'],
      directors: ['tmdb', 'imdb', 'local'],
      writers: ['tmdb', 'imdb', 'local'],
      // Dates
      release_date: ['tmdb', 'tvdb', 'imdb', 'local'],
      aired_date: ['tvdb', 'tmdb', 'local'],
      // Music metadata
      artist_biography: ['musicbrainz', 'local'],
      album_tracks: ['musicbrainz', 'local']
    }
  },

  speed_first: {
    id: 'speed_first',
    label: 'Speed First',
    description: 'Prefer faster providers with higher rate limits (TMDB, TVDB)',
    assetTypePriorities: {
      // Video assets - TMDB/TVDB first (higher rate limits)
      poster: ['tmdb', 'tvdb', 'fanart_tv', 'local'],
      fanart: ['tmdb', 'tvdb', 'fanart_tv', 'local'],
      banner: ['tvdb', 'tmdb', 'fanart_tv', 'local'],
      clearlogo: ['tvdb', 'fanart_tv', 'local'],
      hdclearlogo: ['fanart_tv', 'tvdb', 'local'],
      clearart: ['fanart_tv', 'tvdb', 'local'],
      hdclearart: ['fanart_tv', 'local'],
      discart: ['fanart_tv', 'local'],
      characterart: ['fanart_tv', 'local'],
      landscape: ['tmdb', 'tvdb', 'local'],
      thumb: ['tvdb', 'fanart_tv', 'local'],
      season_poster: ['tvdb', 'tmdb', 'local'],
      episode_still: ['tvdb', 'tmdb', 'local'],
      // Music assets
      artist_thumb: ['theaudiodb', 'local'],
      artist_logo: ['theaudiodb', 'local'],
      artist_fanart: ['theaudiodb', 'local'],
      artist_banner: ['theaudiodb', 'local'],
      album_thumb: ['theaudiodb', 'local'],
      album_cdart: ['theaudiodb', 'local']
    },
    metadataFieldPriorities: {
      rating: ['tmdb', 'imdb', 'tvdb'],
      vote_count: ['tmdb', 'imdb', 'tvdb'],
      plot: ['tmdb', 'tvdb', 'imdb', 'local'],
      tagline: ['tmdb', 'tvdb', 'local'],
      genres: ['tmdb', 'tvdb', 'imdb', 'local'],
      actors: ['tmdb', 'tvdb', 'imdb', 'local'],
      directors: ['tmdb', 'imdb', 'local'],
      writers: ['tmdb', 'imdb', 'local'],
      release_date: ['tmdb', 'tvdb', 'imdb', 'local'],
      aired_date: ['tvdb', 'tmdb', 'local'],
      artist_biography: ['musicbrainz', 'local'],
      album_tracks: ['musicbrainz', 'local']
    }
  },

  tmdb_primary: {
    id: 'tmdb_primary',
    label: 'TMDB Primary',
    description: 'Use TMDB as the primary source for all movie/TV metadata and assets',
    assetTypePriorities: {
      // TMDB first for everything it supports
      poster: ['tmdb', 'fanart_tv', 'tvdb', 'local'],
      fanart: ['tmdb', 'fanart_tv', 'tvdb', 'local'],
      banner: ['tmdb', 'tvdb', 'fanart_tv', 'local'],
      clearlogo: ['tmdb', 'tvdb', 'fanart_tv', 'local'],
      hdclearlogo: ['fanart_tv', 'tvdb', 'local'],
      clearart: ['fanart_tv', 'tmdb', 'local'],
      hdclearart: ['fanart_tv', 'local'],
      discart: ['fanart_tv', 'local'],
      characterart: ['fanart_tv', 'local'],
      landscape: ['tmdb', 'tvdb', 'local'],
      thumb: ['tmdb', 'tvdb', 'fanart_tv', 'local'],
      season_poster: ['tmdb', 'tvdb', 'local'],
      episode_still: ['tmdb', 'tvdb', 'local'],
      // Music assets (no TMDB support)
      artist_thumb: ['theaudiodb', 'local'],
      artist_logo: ['theaudiodb', 'local'],
      artist_fanart: ['theaudiodb', 'local'],
      artist_banner: ['theaudiodb', 'local'],
      album_thumb: ['theaudiodb', 'local'],
      album_cdart: ['theaudiodb', 'local']
    },
    metadataFieldPriorities: {
      rating: ['tmdb', 'imdb', 'tvdb'],
      vote_count: ['tmdb', 'imdb', 'tvdb'],
      plot: ['tmdb', 'tvdb', 'imdb', 'local'],
      tagline: ['tmdb', 'tvdb', 'local'],
      genres: ['tmdb', 'tvdb', 'imdb', 'local'],
      actors: ['tmdb', 'tvdb', 'imdb', 'local'],
      directors: ['tmdb', 'imdb', 'local'],
      writers: ['tmdb', 'imdb', 'local'],
      release_date: ['tmdb', 'tvdb', 'imdb', 'local'],
      aired_date: ['tmdb', 'tvdb', 'local'],
      artist_biography: ['musicbrainz', 'local'],
      album_tracks: ['musicbrainz', 'local']
    }
  },

  tvdb_primary: {
    id: 'tvdb_primary',
    label: 'TVDB Primary',
    description: 'Use TVDB as the primary source for all TV show metadata and assets',
    assetTypePriorities: {
      poster: ['tvdb', 'tmdb', 'fanart_tv', 'local'],
      fanart: ['tvdb', 'tmdb', 'fanart_tv', 'local'],
      banner: ['tvdb', 'fanart_tv', 'tmdb', 'local'],
      clearlogo: ['tvdb', 'fanart_tv', 'local'],
      hdclearlogo: ['fanart_tv', 'tvdb', 'local'],
      clearart: ['fanart_tv', 'tvdb', 'local'],
      hdclearart: ['fanart_tv', 'local'],
      discart: ['fanart_tv', 'local'],
      characterart: ['fanart_tv', 'local'],
      landscape: ['tvdb', 'tmdb', 'local'],
      thumb: ['tvdb', 'fanart_tv', 'local'],
      season_poster: ['tvdb', 'tmdb', 'local'],
      episode_still: ['tvdb', 'tmdb', 'local'],
      // Music assets (no TVDB support)
      artist_thumb: ['theaudiodb', 'local'],
      artist_logo: ['theaudiodb', 'local'],
      artist_fanart: ['theaudiodb', 'local'],
      artist_banner: ['theaudiodb', 'local'],
      album_thumb: ['theaudiodb', 'local'],
      album_cdart: ['theaudiodb', 'local']
    },
    metadataFieldPriorities: {
      rating: ['tvdb', 'imdb', 'tmdb'],
      vote_count: ['tvdb', 'imdb', 'tmdb'],
      plot: ['tvdb', 'tmdb', 'imdb', 'local'],
      tagline: ['tvdb', 'tmdb', 'local'],
      genres: ['tvdb', 'tmdb', 'imdb', 'local'],
      actors: ['tvdb', 'tmdb', 'imdb', 'local'],
      directors: ['tvdb', 'tmdb', 'imdb', 'local'],
      writers: ['tvdb', 'tmdb', 'imdb', 'local'],
      release_date: ['tvdb', 'tmdb', 'imdb', 'local'],
      aired_date: ['tvdb', 'tmdb', 'local'],
      artist_biography: ['musicbrainz', 'local'],
      album_tracks: ['musicbrainz', 'local']
    }
  }
};

/**
 * Fields that are always sourced from Local provider (from video/audio streams via FFprobe)
 * These cannot be overridden by user configuration
 */
export const FORCED_LOCAL_FIELDS = [
  'runtime',        // Actual file duration from video stream
  'video_codec',
  'audio_codec',
  'resolution',
  'aspect_ratio',
  'bitrate',
  'framerate',
  'audio_channels',
  'duration',
  'file_size',
  'container_format'
] as const;

/**
 * Get a priority preset by ID
 */
export function getPriorityPreset(presetId: string): PriorityPreset | undefined {
  return PRIORITY_PRESETS[presetId];
}

/**
 * Get all available priority presets
 */
export function getAllPriorityPresets(): PriorityPreset[] {
  return Object.values(PRIORITY_PRESETS);
}
