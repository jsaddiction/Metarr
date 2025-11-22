import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faEyeSlash, faCircleQuestion } from '@fortawesome/free-solid-svg-icons';
import { ProviderWithMetadata, ProviderConfig as ProviderConfigType } from '../../types/provider';
import { useUpdateProvider } from '../../hooks/useProviders';
import { Switch } from '@/components/ui/switch';
import { TestButton } from '@/components/ui/TestButton';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { toast } from 'sonner';

interface ProviderCardProps {
  provider: ProviderWithMetadata;
  stats?: {
    totalCalls24h: number;
    lastSuccessfulFetch?: string;
  };
}

export const ProviderCard: React.FC<ProviderCardProps> = ({ provider, stats }) => {
  const [showPassword, setShowPassword] = useState(false);
  const [localConfig, setLocalConfig] = useState<ProviderConfigType>(provider.config);
  const [updateTimeout, setUpdateTimeout] = useState<NodeJS.Timeout | null>(null);

  const updateProvider = useUpdateProvider();

  // Sync local state when provider changes
  useEffect(() => {
    setLocalConfig(provider.config);
  }, [provider.config]);

  // Debounced save
  const debouncedSave = (field: string, value: any) => {
    if (updateTimeout) clearTimeout(updateTimeout);

    const timeout = setTimeout(() => {
      updateProvider.mutate(
        {
          name: provider.metadata.name,
          data: { ...localConfig, [field]: value }
        },
        {
          onError: (error: any) => {
            toast.error(`Failed to update ${provider.metadata.displayName}: ${error.message}`);
          }
        }
      );
    }, 500);

    setUpdateTimeout(timeout);
  };

  const handleToggle = (enabled: boolean) => {
    // Check if API key required but missing
    if (enabled && provider.metadata.requiresApiKey && !localConfig.apiKey && !localConfig.personalApiKey) {
      toast.error(`${provider.metadata.displayName} requires an API key`);
      return;
    }

    setLocalConfig(prev => ({ ...prev, enabled }));
    updateProvider.mutate(
      { name: provider.metadata.name, data: { ...localConfig, enabled } },
      {
        onSuccess: () => {
          toast.success(`${provider.metadata.displayName} ${enabled ? 'enabled' : 'disabled'}`);
        },
        onError: (error: any) => {
          toast.error(`Failed to ${enabled ? 'enable' : 'disable'} provider: ${error.message}`);
          setLocalConfig(prev => ({ ...prev, enabled: !enabled }));
        }
      }
    );
  };

  const handleFieldChange = (field: string, value: string) => {
    setLocalConfig(prev => ({ ...prev, [field]: value }));
    debouncedSave(field, value);
  };

  const handleTest = async (): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await fetch(`/api/providers/${provider.metadata.name}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: localConfig.personalApiKey || localConfig.apiKey })
      });

      const result = await response.json();
      return result;
    } catch (error: any) {
      return { success: false, message: error.message || 'Test failed' };
    }
  };

  const formatTimeAgo = (timestamp?: string) => {
    if (!timestamp) return 'Never';
    const now = new Date();
    const then = new Date(timestamp);
    const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);

    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  // Get media types for display
  const getMediaTypes = () => {
    const types = new Set<string>();
    provider.metadata.supportedAssetTypes?.forEach(asset => {
      if (asset.type.startsWith('movie_')) types.add('Movies');
      if (asset.type.startsWith('tv_')) types.add('TV');
      if (asset.type.startsWith('artist_') || asset.type.startsWith('album_')) types.add('Music');
    });
    return Array.from(types).join(' • ');
  };

  const needsApiKey = provider.metadata.requiresApiKey || provider.metadata.apiKeyOptional;
  const hasApiKey = !!(localConfig.personalApiKey || localConfig.apiKey);
  const usingEmbeddedKey = hasApiKey && !localConfig.personalApiKey && provider.metadata.apiKeyOptional;

  return (
    <div className="card">
      <div className="card-body">
        {/* Header: Enable switch + Title on left, Info + Test button on right */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Switch
              checked={localConfig.enabled}
              onCheckedChange={handleToggle}
              disabled={updateProvider.isPending}
            />
            <h3 className="text-lg font-semibold text-white">
              {provider.metadata.displayName}
            </h3>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="text-neutral-400 hover:text-neutral-200 transition-colors">
                    <FontAwesomeIcon icon={faCircleQuestion} className="text-sm" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-sm p-3">
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">{provider.metadata.displayName}</p>
                    <p className="text-xs text-neutral-400">{getMediaTypes()}</p>
                    <p className="text-xs text-neutral-500">{provider.metadata.baseUrl}</p>
                    {provider.metadata.supportedAssetTypes && (
                      <div className="text-xs space-y-1">
                        <p className="font-semibold text-neutral-300">Provides:</p>
                        <ul className="list-disc list-inside text-neutral-400">
                          {provider.metadata.supportedAssetTypes.slice(0, 8).map(asset => (
                            <li key={asset.type}>{asset.displayName}</li>
                          ))}
                          {provider.metadata.supportedAssetTypes.length > 8 && (
                            <li>...and {provider.metadata.supportedAssetTypes.length - 8} more</li>
                          )}
                        </ul>
                      </div>
                    )}
                    <p className="text-xs text-neutral-500">
                      Rate Limit: {provider.metadata.rateLimit.requests} req/{provider.metadata.rateLimit.windowSeconds}s
                    </p>
                    {provider.metadata.apiKeyBenefit && (
                      <p className="text-xs text-amber-400/90">{provider.metadata.apiKeyBenefit}</p>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <TestButton
            onTest={handleTest}
            disabled={!localConfig.enabled || (provider.metadata.requiresApiKey && !hasApiKey)}
          />
        </div>

        {/* API Key Field (if needed) */}
        {needsApiKey && (
          <div className="mb-3">
            <label className="text-xs font-medium text-neutral-400 mb-1 block">
              API Key
            </label>
            <div className="flex items-stretch relative rounded transition-all group hover:ring-1 hover:ring-primary-500 focus-within:ring-1 focus-within:ring-primary-500 max-w-md">
              <input
                type={showPassword ? 'text' : 'password'}
                value={localConfig.personalApiKey || localConfig.apiKey || ''}
                onChange={(e) => handleFieldChange(
                  localConfig.personalApiKey || !provider.metadata.apiKeyOptional ? 'personalApiKey' : 'apiKey',
                  e.target.value
                )}
                placeholder={provider.metadata.requiresApiKey ? 'API key required' : 'Optional personal key'}
                className="flex-1 h-8 px-2.5 py-1 text-sm bg-neutral-800 border border-neutral-600 rounded-l text-neutral-200 transition-colors placeholder:text-neutral-500 focus-visible:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="px-2 border-t border-b border-r border-neutral-600 rounded-r flex items-center justify-center bg-neutral-700 text-neutral-400 hover:bg-neutral-600 transition-colors"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} className="text-xs" />
              </button>
            </div>
            {usingEmbeddedKey && (
              <p className="text-xs text-amber-400/70 mt-1">Using shared embedded key</p>
            )}
            {localConfig.personalApiKey && (
              <p className="text-xs text-green-500/70 mt-1">Using personal API key</p>
            )}
          </div>
        )}

        {/* Metrics Row (bottom) */}
        {stats && localConfig.enabled && (
          <div className="text-xs text-neutral-400 pt-2 border-t border-neutral-700/50">
            <span className="font-medium">Last 24 hours:</span> {stats.totalCalls24h} calls • Last fetch: {formatTimeAgo(stats.lastSuccessfulFetch)}
          </div>
        )}
      </div>
    </div>
  );
};
