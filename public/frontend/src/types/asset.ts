/**
 * Asset Selection Types
 * For selecting assets from multiple metadata providers
 */

export type AssetType =
  | 'poster'
  | 'fanart'
  | 'banner'
  | 'clearlogo'
  | 'clearart'
  | 'landscape'
  | 'keyart'
  | 'discart';

export type AssetQuality = 'sd' | 'hd' | '4k';

export type ProviderId = 'tmdb' | 'fanart_tv' | 'tvdb' | 'omdb' | 'imdb';

/**
 * Asset candidate from a provider
 */
export interface AssetCandidate {
  providerId: ProviderId;
  providerResultId: string;

  // Asset Details
  assetType: AssetType;
  url: string;
  thumbnailUrl?: string;

  // Dimensions
  width?: number;
  height?: number;
  aspectRatio?: number;

  // Quality Hints
  quality?: AssetQuality;
  fileSize?: number;

  // Language
  language?: string;

  // Voting/Quality (if available)
  votes?: number;
  voteAverage?: number;

  // Provider Recommendations
  isPreferredByProvider?: boolean;

  // Perceptual Hash (for deduplication)
  perceptualHash?: string;

  // Additional Context
  metadata?: Record<string, any>;
}

/**
 * Provider result for an asset type
 */
export interface ProviderAssetResult {
  images?: {
    [key in AssetType]?: AssetCandidate[];
  };
  success: boolean;
  error?: string;
  timing?: {
    startTime: string;
    endTime: string;
    durationMs: number;
  };
}

/**
 * Recommendation for an asset type
 */
export interface AssetRecommendation {
  asset: AssetCandidate;
  provider: string;
  score: number;
  reason: string;
}

/**
 * Provider results response
 */
export interface ProviderResultsResponse {
  movieId: number;
  movie: {
    id: number;
    title: string;
    year?: number;
    imdbId?: string;
    tmdbId?: number;
  };
  providers: {
    [providerName: string]: ProviderAssetResult;
  };
  recommendations: {
    [assetType: string]: AssetRecommendation;
  };
  metadata: {
    fetchedAt: string;
    completedProviders: string[];
    failedProviders: Array<{ name: string; error: string }>;
    timedOutProviders: string[];
    totalProviders: number;
    totalAssets: number;
    durationMs: number;
  };
}

/**
 * Current asset selection (from database)
 */
export interface CurrentAsset {
  id: number;
  entity_type: string;
  entity_id: number;
  image_type: string;
  url: string | null;
  cache_path: string | null;
  library_path: string | null;
  file_path: string | null;
  width: number | null;
  height: number | null;
  vote_average: number | null;
  locked: boolean;
  cache_url: string;
  provider?: string;
}

/**
 * Entity type for asset selection
 */
export type EntityType = 'movie' | 'series' | 'episode' | 'season' | 'album' | 'track';

/**
 * Asset selection dialog props (pure display component)
 */
export interface AssetSelectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (asset: AssetCandidate, provider: string) => void;
  assetType: AssetType;
  currentAsset?: CurrentAsset;
  selectedAssets?: CurrentAsset[]; // Already selected assets to filter out
  providerResults?: ProviderResultsResponse;
  isLoading?: boolean;
  error?: Error | null;
}

/**
 * Filter and sort options
 */
export type SortOption = 'score' | 'resolution' | 'votes' | 'provider';

export interface FilterOptions {
  provider: string; // 'all' or specific provider name
  quality: string; // 'all', 'sd', 'hd', '4k'
  sortBy: SortOption;
}
