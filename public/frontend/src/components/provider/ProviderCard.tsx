import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ProviderWithMetadata, ProviderConfig as ProviderConfigType } from '../../types/provider';
import { useUpdateProvider, useTestProvider } from '../../hooks/useProviders';
import { ProviderHeader } from './ProviderHeader';
import { ProviderCapabilities } from './ProviderCapabilities';
import { ProviderKeyStatus } from './ProviderKeyStatus';
import { ProviderConfig } from './ProviderConfig';
import { ProviderStats } from './ProviderStats';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ProviderCardProps {
  provider: ProviderWithMetadata;
  enabled: boolean;
}

export const ProviderCard: React.FC<ProviderCardProps> = ({
  provider,
  enabled,
}) => {
  const [localConfig, setLocalConfig] = useState<ProviderConfigType>(provider.config);
  const [showPassword, setShowPassword] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const updateProvider = useUpdateProvider();
  const testProviderMutation = useTestProvider();

  // Sync local state when provider data changes
  useEffect(() => {
    setLocalConfig(provider.config);
  }, [provider.config]);

  // Auto-disable if API key required but missing
  const isAutoDisabled = provider.metadata.requiresApiKey &&
                         !localConfig.apiKey &&
                         !localConfig.personalApiKey &&
                         enabled;

  useEffect(() => {
    if (isAutoDisabled) {
      updateProvider.mutate({
        name: provider.metadata.name,
        data: {
          enabled: false,
          apiKey: localConfig.apiKey,
          personalApiKey: localConfig.personalApiKey,
          language: localConfig.language,
          region: localConfig.region,
          options: localConfig.options,
        }
      });
      toast.error(`${provider.metadata.displayName} requires an API key`);
    }
  }, [isAutoDisabled]);

  // Debounced update handler
  const [updateTimeout, setUpdateTimeout] = useState<NodeJS.Timeout | null>(null);

  const debouncedUpdate = useCallback((field: string, value: any) => {
    if (updateTimeout) {
      clearTimeout(updateTimeout);
    }

    const timeout = setTimeout(() => {
      updateProvider.mutate({
        name: provider.metadata.name,
        data: {
          enabled: localConfig.enabled,
          apiKey: field === 'apiKey' ? value : localConfig.apiKey,
          personalApiKey: field === 'personalApiKey' ? value : localConfig.personalApiKey,
          language: field === 'language' ? value : localConfig.language,
          region: field === 'region' ? value : localConfig.region,
          options: field === 'options' ? value : localConfig.options,
        }
      });
    }, 500);

    setUpdateTimeout(timeout);
  }, [localConfig, provider.metadata.name, updateProvider, updateTimeout]);

  const handleConfigChange = (field: string, value: any) => {
    setLocalConfig(prev => ({ ...prev, [field]: value }));
    debouncedUpdate(field, value);
  };

  const handleToggle = (newEnabled: boolean) => {
    // Check if trying to enable without required API key
    if (newEnabled && provider.metadata.requiresApiKey && !localConfig.apiKey && !localConfig.personalApiKey) {
      toast.error(`${provider.metadata.displayName} requires an API key`);
      return;
    }

    setLocalConfig(prev => ({ ...prev, enabled: newEnabled }));
    updateProvider.mutate({
      name: provider.metadata.name,
      data: {
        enabled: newEnabled,
        apiKey: localConfig.apiKey,
        personalApiKey: localConfig.personalApiKey,
        language: localConfig.language,
        region: localConfig.region,
        options: localConfig.options,
      }
    });
  };

  const handleTest = async () => {
    try {
      setTestResult(null);
      const result = await testProviderMutation.mutateAsync({
        name: provider.metadata.name,
        apiKey: localConfig.personalApiKey || localConfig.apiKey,
      });
      setTestResult(result);

      if (result.success) {
        toast.success(`${provider.metadata.displayName} connection successful`);
      } else {
        toast.error(`${provider.metadata.displayName} connection failed: ${result.message}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setTestResult({ success: false, message });
      toast.error(`Failed to test ${provider.metadata.displayName}: ${message}`);
    }
  };

  return (
    <Card className={cn(
      "transition-all",
      !enabled && "opacity-60 border-dashed"
    )}>
      <CardContent className="p-6 space-y-3">
        {/* Header Row */}
        <ProviderHeader
          provider={provider}
          enabled={enabled}
          onToggle={handleToggle}
          testResult={testResult}
          onTest={handleTest}
          isTestLoading={testProviderMutation.isPending}
        />

        {/* Capabilities Row */}
        <ProviderCapabilities provider={provider} />

        {/* API Key Status */}
        <ProviderKeyStatus
          provider={provider}
          config={localConfig}
          enabled={enabled}
        />

        {/* Configuration (only if enabled) */}
        {enabled && (
          <ProviderConfig
            provider={provider}
            config={localConfig}
            onChange={handleConfigChange}
            showPassword={showPassword}
            onTogglePassword={() => setShowPassword(!showPassword)}
          />
        )}

        {/* Stats (placeholder - only if enabled) */}
        {enabled && (
          <ProviderStats />
        )}
      </CardContent>
    </Card>
  );
};
