/**
 * Provider Capabilities Type Definitions
 *
 * Defines the capabilities interface that all providers must implement.
 * This allows the system to dynamically discover what each provider can do.
 */

/**
 * Unique identifier for each provider
 */
export type ProviderId =
  | 'tmdb'
  | 'tvdb'
  | 'fanart_tv'
  | 'imdb'
  | 'musicbrainz'
  | 'theaudiodb'
  | 'local';

/**
 * Types of media entities supported by providers
 */
export type EntityType =
  // Video entities
  | 'movie'
  | 'series'
  | 'season'
  | 'episode'
  | 'collection'
  // Music entities
  | 'artist'
  | 'album'
  | 'track'
  // Cross-media entities
  | 'actor';

/**
 * Types of assets (images, videos, etc.) that providers can supply
 */
export type AssetType =
  // Video assets
  | 'poster'
  | 'fanart'
  | 'banner'
  | 'clearlogo'
  | 'clearart'
  | 'thumb'
  | 'characterart'
  | 'discart'
  | 'landscape'
  | 'keyart'
  // Music assets
  | 'cdart'
  | 'albumcover'
  | 'artistthumb'
  | 'musiclogo'
  | 'hdmusiclogo'
  | 'artistbackground';

/**
 * Metadata fields that providers can supply
 */
export type MetadataField =
  // Common fields
  | 'title'
  | 'originalTitle'
  | 'sortTitle'
  | 'plot'
  | 'outline'
  | 'tagline'
  | 'releaseDate'
  | 'premiered'
  | 'runtime'
  | 'genres'
  | 'ratings'
  | 'country'
  | 'status'
  // Video-specific fields
  | 'actors'
  | 'directors'
  | 'writers'
  | 'studios'
  | 'certification'
  | 'collection'
  | 'trailer'
  // Music-specific fields
  | 'artist'
  | 'albumArtist'
  | 'label'
  | 'duration'
  | 'trackNumber'
  | 'discNumber'
  | 'biography'
  | 'formed'
  | 'disbanded'
  | 'mood'
  | 'style'
  | 'theme';

/**
 * Provider authentication configuration
 */
export interface ProviderAuthentication {
  type: 'none' | 'api_key' | 'jwt' | 'bearer' | 'oauth';
  required: boolean;
  allowsPersonalKey?: boolean;
  personalKeyBenefit?: string;
  tokenLifetime?: number; // seconds
  refreshEndpoint?: string;
}

/**
 * Provider rate limiting configuration
 */
export interface ProviderRateLimit {
  requestsPerSecond: number;
  burstCapacity: number;
  webhookReservedCapacity: number;
  enforcementType: 'client' | 'server';
}

/**
 * Provider search capabilities
 */
export interface ProviderSearchCapabilities {
  supported: boolean;
  fuzzyMatching: boolean;
  multiLanguage: boolean;
  yearFilter: boolean;
  externalIdLookup: string[]; // ['imdb_id', 'tvdb_id', etc.]
}

/**
 * Provider data quality indicators
 */
export interface ProviderDataQuality {
  metadataCompleteness: number; // 0-1 score
  imageQuality: number; // 0-1 score
  updateFrequency: 'realtime' | 'daily' | 'weekly';
  userContributed: boolean;
  curatedContent: boolean;
}

/**
 * Provider special features
 */
export interface ProviderSpecialFeatures {
  collectionSupport?: boolean;
  seasonOrdering?: 'aired' | 'dvd' | 'both';
  adultContentControl?: boolean;
  multipleLanguageImages?: boolean;
  voteSystemForImages?: boolean;
  discTypePreference?: boolean;
}

/**
 * Provider asset provision details
 */
export interface ProviderAssetProvision {
  providesUrls: boolean;
  providesDirectDownload: boolean;
  thumbnailUrls: boolean;
  multipleQualities: boolean;
  maxResultsPerType: number | null;
  qualityHints: boolean;
  languagePerAsset: boolean;
}

/**
 * Complete provider capabilities declaration
 */
export interface ProviderCapabilities {
  // Identity
  id: ProviderId;
  name: string;
  version: string;
  category: 'metadata' | 'images' | 'both';

  // Supported Operations
  supportedEntityTypes: EntityType[];
  supportedMetadataFields: Partial<Record<EntityType, MetadataField[]>>;
  supportedAssetTypes: Partial<Record<EntityType, AssetType[]>>;

  // Configuration
  authentication: ProviderAuthentication;
  rateLimit: ProviderRateLimit;
  search: ProviderSearchCapabilities;

  // Quality & Features
  dataQuality: ProviderDataQuality;
  specialFeatures?: ProviderSpecialFeatures;
  assetProvision: ProviderAssetProvision;
}
