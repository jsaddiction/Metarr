/**
 * TanStack Query hooks for Priority Configuration
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { priorityApi } from '../utils/api';
import {
  PriorityPreset,
  PriorityPresetSelection,
  AssetTypePriority,
  MetadataFieldPriority,
} from '../types/provider';

/**
 * Fetch all available priority presets
 */
export const usePriorityPresets = () => {
  return useQuery<PriorityPreset[], Error>({
    queryKey: ['priority-presets'],
    queryFn: () => priorityApi.getPresets(),
  });
};

/**
 * Fetch the currently active preset
 */
export const useActivePreset = () => {
  return useQuery<PriorityPresetSelection | null, Error>({
    queryKey: ['active-preset'],
    queryFn: () => priorityApi.getActivePreset(),
  });
};

/**
 * Apply a priority preset
 */
export const useApplyPreset = () => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (presetId: string) => priorityApi.applyPreset(presetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-preset'] });
      queryClient.invalidateQueries({ queryKey: ['asset-type-priorities'] });
      queryClient.invalidateQueries({ queryKey: ['metadata-field-priorities'] });
    },
  });
};

/**
 * Fetch all asset type priorities
 */
export const useAssetTypePriorities = () => {
  return useQuery<AssetTypePriority[], Error>({
    queryKey: ['asset-type-priorities'],
    queryFn: () => priorityApi.getAssetTypePriorities(),
  });
};

/**
 * Fetch priority for a specific asset type
 */
export const useAssetTypePriority = (assetType: string) => {
  return useQuery<AssetTypePriority, Error>({
    queryKey: ['asset-type-priority', assetType],
    queryFn: () => priorityApi.getAssetTypePriority(assetType),
    enabled: !!assetType,
  });
};

/**
 * Update asset type priority
 */
export const useUpdateAssetTypePriority = () => {
  const queryClient = useQueryClient();

  return useMutation<
    AssetTypePriority,
    Error,
    { assetType: string; providerOrder: string[] }
  >({
    mutationFn: ({ assetType, providerOrder }) =>
      priorityApi.updateAssetTypePriority(assetType, providerOrder),
    onSuccess: (data, { assetType }) => {
      queryClient.invalidateQueries({ queryKey: ['asset-type-priorities'] });
      queryClient.invalidateQueries({ queryKey: ['asset-type-priority', assetType] });
      queryClient.invalidateQueries({ queryKey: ['active-preset'] });
    },
  });
};

/**
 * Fetch all metadata field priorities
 */
export const useMetadataFieldPriorities = () => {
  return useQuery<MetadataFieldPriority[], Error>({
    queryKey: ['metadata-field-priorities'],
    queryFn: () => priorityApi.getMetadataFieldPriorities(),
  });
};

/**
 * Fetch priority for a specific metadata field
 */
export const useMetadataFieldPriority = (fieldName: string) => {
  return useQuery<MetadataFieldPriority, Error>({
    queryKey: ['metadata-field-priority', fieldName],
    queryFn: () => priorityApi.getMetadataFieldPriority(fieldName),
    enabled: !!fieldName,
  });
};

/**
 * Update metadata field priority
 */
export const useUpdateMetadataFieldPriority = () => {
  const queryClient = useQueryClient();

  return useMutation<
    MetadataFieldPriority,
    Error,
    { fieldName: string; providerOrder: string[] }
  >({
    mutationFn: ({ fieldName, providerOrder }) =>
      priorityApi.updateMetadataFieldPriority(fieldName, providerOrder),
    onSuccess: (data, { fieldName }) => {
      queryClient.invalidateQueries({ queryKey: ['metadata-field-priorities'] });
      queryClient.invalidateQueries({ queryKey: ['metadata-field-priority', fieldName] });
      queryClient.invalidateQueries({ queryKey: ['active-preset'] });
    },
  });
};
