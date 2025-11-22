import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faEyeSlash, faCircleQuestion } from '@fortawesome/free-solid-svg-icons';
import { ProviderWithMetadata, ProviderConfig as ProviderConfigType } from '../../types/provider';
import { useUpdateProvider, useTestProvider } from '../../hooks/useProviders';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [updateTimeout, setUpdateTimeout] = useState<NodeJS.Timeout | null>(null);

  const updateProvider = useUpdateProvider();
  const testProviderMutation = useTestProvider();

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

  const handleTest = async () => {
    try {
      setTestResult(null);
      const result = await testProviderMutation.mutateAsync({
        name: provider.metadata.name,
        apiKey: localConfig.personalApiKey || localConfig.apiKey
      });
      setTestResult(result);
      if (result.success) {
        toast.success(`${provider.metadata.displayName} connection successful`);
      } else {
        toast.error(`${provider.metadata.displayName} connection failed: ${result.message}`);
      }
    } catch (error: any) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setTestResult({ success: false, message });
      toast.error(`Test failed: ${message}`);
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
    <div className="card bg-neutral-800/50 border-neutral-700">
      <div className="card-body p-3">
        {/* Single compact row */}
        <div className="grid grid-cols-[auto_minmax(200px,1fr)_auto_auto_auto] gap-3 items-center">
          {/* Provider name + info icon */}
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-white whitespace-nowrap">
              {provider.metadata.displayName}
            </h3>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0">
                    <FontAwesomeIcon icon={faCircleQuestion} className="text-xs text-neutral-400" />
                  </Button>
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

          {/* API Key field */}
          {needsApiKey ? (
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={localConfig.personalApiKey || localConfig.apiKey || ''}
                  onChange={(e) => handleFieldChange(
                    localConfig.personalApiKey || !provider.metadata.apiKeyOptional ? 'personalApiKey' : 'apiKey',
                    e.target.value
                  )}
                  placeholder={provider.metadata.requiresApiKey ? 'API key required' : 'Optional personal key'}
                  className="h-7 text-xs pr-7 bg-neutral-900/50"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-0.5 top-0.5 h-6 w-6 p-0"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} className="text-xs text-neutral-400" />
                </Button>
              </div>
              {usingEmbeddedKey && (
                <span className="text-xs text-amber-400/70 whitespace-nowrap">Shared</span>
              )}
              {localConfig.personalApiKey && (
                <span className="text-xs text-green-500/70 whitespace-nowrap">Personal</span>
              )}
            </div>
          ) : (
            <div></div>
          )}

          {/* Stats */}
          {stats && localConfig.enabled ? (
            <div className="text-xs text-neutral-400 whitespace-nowrap">
              {stats.totalCalls24h} • {formatTimeAgo(stats.lastSuccessfulFetch)}
            </div>
          ) : (
            <div></div>
          )}

          {/* Test button */}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleTest}
            disabled={testProviderMutation.isPending || !localConfig.enabled || (provider.metadata.requiresApiKey && !hasApiKey)}
            className="h-7 text-xs px-2"
          >
            {testProviderMutation.isPending ? 'Testing...' : 'Test'}
          </Button>

          {/* Toggle switch */}
          <Switch
            checked={localConfig.enabled}
            onCheckedChange={handleToggle}
            disabled={updateProvider.isPending}
          />
        </div>

        {/* Test result (compact, only if shown) */}
        {testResult && (
          <div className={cn(
            'text-xs mt-2 pl-2',
            testResult.success ? 'text-green-400' : 'text-red-400'
          )}>
            {testResult.success ? '✓' : '✗'} {testResult.message}
          </div>
        )}
      </div>
    </div>
  );
};
