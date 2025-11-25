import React, { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faEyeSlash, faCircleQuestion, faXmark } from '@fortawesome/free-solid-svg-icons';
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
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [validationState, setValidationState] = useState<'valid' | 'invalid' | null>(null);

  const apiKeyInputRef = useRef<HTMLInputElement>(null);
  const updateProvider = useUpdateProvider();

  // Sync local state when provider changes from server
  useEffect(() => {
    setLocalConfig(provider.config);
    setHasUnsavedChanges(false);
    setValidationState(null);
  }, [provider.config]);

  // Check if there are unsaved changes
  useEffect(() => {
    const apiKeyField = localConfig.personalApiKey ? 'personalApiKey' : 'apiKey';
    const serverApiKey = provider.config[apiKeyField as keyof ProviderConfigType] || '';
    const localApiKey = localConfig[apiKeyField as keyof ProviderConfigType] || '';

    setHasUnsavedChanges(serverApiKey !== localApiKey);
  }, [localConfig, provider.config]);

  const handleSave = async (): Promise<{ success: boolean; message: string }> => {
    const apiKeyField = localConfig.personalApiKey || !provider.metadata.apiKeyOptional ? 'personalApiKey' : 'apiKey';
    const apiKey = localConfig[apiKeyField as keyof ProviderConfigType] as string;

    // Only test if: (1) provider requires API key AND (2) user is providing a non-empty key
    // Skip testing if field is empty (user is clearing the key)
    if (provider.metadata.requiresApiKey && apiKey && apiKey.trim() !== '') {
      setValidationState(null);

      try {
        // Test the API key
        const testResult = await handleTest();

        if (!testResult.success) {
          // Test failed - show validation error
          setValidationState('invalid');
          toast.error(`Invalid ${provider.metadata.displayName} API key`);
          apiKeyInputRef.current?.focus();
          return { success: false, message: `Invalid ${provider.metadata.displayName} API key` };
        }

        // Test succeeded - proceed with save
        setValidationState('valid');
      } catch (error: any) {
        setValidationState('invalid');
        toast.error(`Network error testing ${provider.metadata.displayName} API key`);
        apiKeyInputRef.current?.focus();
        return { success: false, message: `Network error testing ${provider.metadata.displayName} API key` };
      }
    }

    // Save the configuration (and enable if required API key provider with valid key)
    const shouldAutoEnable = provider.metadata.requiresApiKey && apiKey && apiKey.trim() !== '';

    return new Promise((resolve) => {
      updateProvider.mutate(
        {
          name: provider.metadata.name,
          data: {
            ...provider.config,
            [apiKeyField]: apiKey,
            enabled: shouldAutoEnable ? true : provider.config.enabled
          }
        },
        {
          onSuccess: () => {
            const action = shouldAutoEnable ? 'saved and enabled' : 'saved';
            const message = `${provider.metadata.displayName} configuration ${action}`;
            toast.success(message);
            setHasUnsavedChanges(false);
            setValidationState(null);
            resolve({ success: true, message });
          },
          onError: (error: any) => {
            const message = `Failed to save: ${error.message}`;
            toast.error(message);
            setValidationState('invalid');
            resolve({ success: false, message });
          }
        }
      );
    });
  };

  const handleToggle = (enabled: boolean) => {
    // Check if API key is required - use localConfig to check current state including unsaved changes
    const hasApiKey = !!(localConfig.personalApiKey || localConfig.apiKey);

    if (enabled && provider.metadata.requiresApiKey && !hasApiKey) {
      toast.error(`${provider.metadata.displayName} requires an API key. Please save your API key first.`);
      return;
    }

    // Check if there are unsaved changes
    if (hasUnsavedChanges) {
      toast.error('Please save your changes before enabling the provider');
      return;
    }

    updateProvider.mutate(
      { name: provider.metadata.name, data: { ...provider.config, enabled } },
      {
        onSuccess: () => {
          toast.success(`${provider.metadata.displayName} ${enabled ? 'enabled' : 'disabled'}`);
        },
        onError: (error: any) => {
          toast.error(`Failed to ${enabled ? 'enable' : 'disable'} provider: ${error.message}`);
        }
      }
    );
  };

  const handleFieldChange = (field: string, value: string) => {
    setLocalConfig(prev => ({ ...prev, [field]: value }));
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
  const hasApiKey = !!(provider.config.personalApiKey || provider.config.apiKey);

  // Disable switch if there are unsaved changes or API key requirements not met
  const switchDisabled = updateProvider.isPending || hasUnsavedChanges || (provider.metadata.requiresApiKey && !hasApiKey);

  return (
    <div className="card">
      <div className="card-body">
        {/* Header: Title + Info + Switch */}
        <div className="flex items-center gap-3 mb-4">
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
          <Switch
            checked={localConfig.enabled}
            onCheckedChange={handleToggle}
            disabled={switchDisabled}
          />
        </div>

        {/* API Key Field (if needed) or No API Key message */}
        {needsApiKey ? (
          <div className="mb-3">
            <label className="text-xs font-medium text-neutral-400 mb-1 block">
              API Key
              {provider.metadata.requiresApiKey && !hasApiKey && (
                <span className="text-amber-400 ml-1">(required)</span>
              )}
            </label>
            <div className={`flex items-stretch relative rounded transition-all group max-w-md ${
              validationState === 'invalid'
                ? 'ring-2 ring-red-500'
                : validationState === 'valid'
                ? 'ring-2 ring-green-500'
                : 'hover:ring-1 hover:ring-primary-500 focus-within:ring-1 focus-within:ring-primary-500'
            }`}>
              <input
                ref={apiKeyInputRef}
                type={showPassword ? 'text' : 'password'}
                value={localConfig.personalApiKey || localConfig.apiKey || ''}
                onChange={(e) => {
                  const field = localConfig.personalApiKey || !provider.metadata.apiKeyOptional ? 'personalApiKey' : 'apiKey';
                  handleFieldChange(field, e.target.value);
                  // Clear validation state when user starts typing
                  if (validationState) {
                    setValidationState(null);
                  }
                }}
                placeholder={provider.metadata.requiresApiKey ? 'API key required' : 'Optional personal key'}
                className={`flex-1 h-8 px-2.5 pr-7 py-1 text-sm bg-neutral-800 border rounded-l text-neutral-200 transition-colors placeholder:text-neutral-500 focus-visible:outline-none ${
                  validationState === 'invalid'
                    ? 'border-red-500'
                    : validationState === 'valid'
                    ? 'border-green-500'
                    : 'border-neutral-600'
                }`}
              />
              {/* Clear button - always visible, clears and disables provider */}
              <button
                type="button"
                onClick={async () => {
                  const apiKeyField = localConfig.personalApiKey || !provider.metadata.apiKeyOptional ? 'personalApiKey' : 'apiKey';

                  // Clear the API key and disable the provider
                  updateProvider.mutate(
                    {
                      name: provider.metadata.name,
                      data: {
                        ...provider.config,
                        [apiKeyField]: '',
                        enabled: false
                      }
                    },
                    {
                      onSuccess: () => {
                        toast.success(`${provider.metadata.displayName} cleared and disabled`);
                        setValidationState(null);
                      },
                      onError: (error: any) => {
                        toast.error(`Failed to clear: ${error.message}`);
                      }
                    }
                  );
                }}
                disabled={updateProvider.isPending}
                className="absolute right-[34px] top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 transition-colors bg-transparent px-1 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Clear API key and disable provider"
              >
                <FontAwesomeIcon icon={faXmark} className="text-sm" />
              </button>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className={`px-2 border-t border-b border-r rounded-r flex items-center justify-center bg-neutral-700 text-neutral-400 hover:bg-neutral-600 transition-colors ${
                  validationState === 'invalid'
                    ? 'border-red-500'
                    : validationState === 'valid'
                    ? 'border-green-500'
                    : 'border-neutral-600'
                }`}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} className="text-xs" />
              </button>
            </div>

            {/* Test and Save buttons */}
            <div className="flex items-center gap-2 mt-2">
              <TestButton
                onTest={handleTest}
                disabled={provider.metadata.requiresApiKey && !(localConfig.personalApiKey || localConfig.apiKey)}
              />
              <TestButton
                onTest={handleSave}
                disabled={!hasUnsavedChanges || updateProvider.isPending}
                label="Save"
                loadingLabel="Saving..."
              />
              {hasUnsavedChanges && (
                <span className="text-xs text-amber-400">Unsaved changes</span>
              )}
            </div>
          </div>
        ) : (
          <div className="mb-3">
            <p className="text-sm text-neutral-500 mb-2">No API Key Required</p>
            <TestButton
              onTest={handleTest}
              disabled={false}
            />
          </div>
        )}

        {/* Bottom Row: Metrics and API Key Status */}
        <div className="pt-3 border-t border-neutral-700/50">
          {stats && localConfig.enabled && (
            <div className="text-xs text-neutral-400">
              <span className="font-medium">Last 24 hours:</span> {stats.totalCalls24h} calls • Last fetch: {formatTimeAgo(stats.lastSuccessfulFetch)}
            </div>
          )}
          {needsApiKey && (
            <div className={`text-xs ${stats && localConfig.enabled ? 'mt-1' : ''}`}>
              {provider.metadata.requiresApiKey && !hasApiKey ? (
                <span className="text-red-400">API Key Required</span>
              ) : localConfig.personalApiKey ? (
                <span className="text-green-400">Using Personal API Key</span>
              ) : (
                <span className="text-amber-400">Using Default API Key</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
