/**
 * Asset Configuration Types
 *
 * For managing asset download limits per asset type
 */

export type MediaType = 'movie' | 'tvshow' | 'season' | 'episode' | 'artist' | 'album' | 'song';

export interface AssetLimit {
  assetType: string;
  displayName: string;
  currentLimit: number;
  defaultLimit: number;
  minAllowed: number;
  maxAllowed: number;
  description: string;
  isDefault: boolean;
  mediaTypes: MediaType[];
}

export interface AssetLimitsMap {
  [assetType: string]: number;
}

export interface SetAssetLimitRequest {
  limit: number;
}

export interface SetAssetLimitResponse {
  message: string;
  assetType: string;
  limit: number;
}

export interface ResetAssetLimitResponse {
  message: string;
  assetType: string;
  limit: number;
}

export interface ResetAllLimitsResponse {
  message: string;
  limits: AssetLimitsMap;
}
