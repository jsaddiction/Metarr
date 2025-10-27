import React, { useState, useEffect } from 'react';
import { ProviderWithMetadata, UpdateProviderRequest } from '../../types/provider';
import { useUpdateProvider, useTestProvider, useDisableProvider } from '../../hooks/useProviders';
import { TestButton } from '../ui/TestButton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useConfirm } from '../../hooks/useConfirm';

interface ProviderConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  provider: ProviderWithMetadata;
}

// Common language options for TMDB, TVDB
const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ru', label: 'Russian' },
  { value: 'zh', label: 'Chinese' },
];

// Common region options for TMDB
const REGION_OPTIONS = [
  { value: 'US', label: 'United States' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'CA', label: 'Canada' },
  { value: 'AU', label: 'Australia' },
  { value: 'DE', label: 'Germany' },
  { value: 'FR', label: 'France' },
  { value: 'ES', label: 'Spain' },
  { value: 'IT', label: 'Italy' },
  { value: 'JP', label: 'Japan' },
  { value: 'KR', label: 'South Korea' },
];

export const ProviderConfigModal: React.FC<ProviderConfigModalProps> = ({
  isOpen,
  onClose,
  provider,
}) => {
  // Accessible confirmation dialog
  const { confirm, ConfirmDialog } = useConfirm();

  const { config, metadata } = provider;

  const [apiKey, setApiKey] = useState(config.apiKey || '');
  const [personalApiKey, setPersonalApiKey] = useState(config.personalApiKey || '');
  const [language, setLanguage] = useState(config.language || 'en');
  const [region, setRegion] = useState(config.region || 'US');
  const [showImdbWarning, setShowImdbWarning] = useState(false);

  const updateProvider = useUpdateProvider();
  const testProvider = useTestProvider();
  const disableProvider = useDisableProvider();

  // Reset form when provider changes
  useEffect(() => {
    setApiKey(config.apiKey || '');
    setPersonalApiKey(config.personalApiKey || '');
    setLanguage(config.language || 'en');
    setRegion(config.region || 'US');
  }, [config]);

  const handleSave = async () => {
    // IMDb legal warning check
    if (metadata.name === 'imdb' && !config.enabled) {
      setShowImdbWarning(true);
      return;
    }

    await saveProvider();
  };

  const saveProvider = async () => {
    // Get all available asset types for this provider
    const allAssetTypes = metadata.supportedAssetTypes
      .filter(t => t.available)
      .map(t => t.type);

    const data: UpdateProviderRequest = {
      enabled: true,  // Always enable when saving configuration
      apiKey: apiKey || undefined,
      personalApiKey: personalApiKey || undefined,
      enabledAssetTypes: allAssetTypes,  // Enable all supported asset types by default
      language: language || undefined,
      region: region || undefined,
    };

    try {
      await updateProvider.mutateAsync({ name: metadata.name, data });
      setShowImdbWarning(false);
      onClose();
    } catch (error: any) {
      console.error('Failed to save provider:', error);
    }
  };

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: 'Delete Provider',
      description: `Are you sure you want to delete ${metadata.displayName}? This will remove all configuration and disable this provider.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'destructive',
    });

    if (!confirmed) return;

    try {
      await disableProvider.mutateAsync(metadata.name);
      onClose();
    } catch (error: any) {
      console.error('Failed to delete provider:', error);
      alert(`Failed to delete provider: ${error.message}`);
    }
  };

  const requiresApiKey = metadata.requiresApiKey && !metadata.apiKeyOptional;
  const hasApiKey = !!apiKey;
  const canSave = !requiresApiKey || hasApiKey;

  return (
    <>
      {/* Main Configuration Dialog */}
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Configure {metadata.displayName}</DialogTitle>
            <DialogDescription>
              Update provider settings and API credentials
            </DialogDescription>
          </DialogHeader>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {/* API Key Field */}
          {(metadata.requiresApiKey || metadata.apiKeyOptional) && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                API Key
                {requiresApiKey && <span className="text-red-400 ml-1">*</span>}
                {metadata.apiKeyOptional && (
                  <span className="text-neutral-500 ml-1 font-normal">(optional)</span>
                )}
              </label>
              <Input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={metadata.apiKeyOptional && metadata.apiKeyBenefit ? metadata.apiKeyBenefit : 'Enter API key'}
                className="w-full"
              />

              {/* Show "get your own key" message only when field is empty */}
              {metadata.apiKeyBenefit && !apiKey && (
                <p className="text-xs text-blue-400 mt-2">
                  <svg className="inline w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Using embedded default key. {metadata.apiKeyBenefit.replace('Personal API keys', 'Get your own API key to')}{' '}
                  <a
                    href={
                      metadata.name === 'tmdb'
                        ? 'https://www.themoviedb.org/settings/api'
                        : metadata.name === 'tvdb'
                        ? 'https://thetvdb.com/api-information'
                        : metadata.name === 'fanart_tv'
                        ? 'https://fanart.tv/get-an-api-key/'
                        : '#'
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-blue-300"
                  >
                    Get your own API key →
                  </a>
                </p>
              )}
            </div>
          )}

          {/* Personal API Key (FanArt.tv) */}
          {metadata.name === 'fanart_tv' && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                Personal API Key
                <span className="text-neutral-500 ml-1 font-normal">(optional)</span>
              </label>
              <Input
                type="text"
                value={personalApiKey}
                onChange={(e) => setPersonalApiKey(e.target.value)}
                placeholder="Unlocks higher rate limits and additional features"
                className="w-full"
              />
              {metadata.apiKeyBenefit && (
                <p className="text-xs text-neutral-400 mt-2">{metadata.apiKeyBenefit}</p>
              )}
            </div>
          )}

          {/* Language and Region Selection (TMDB, TVDB) */}
          {(metadata.name === 'tmdb' || metadata.name === 'tvdb') && (
            <div className="mb-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Language */}
                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    Language
                  </label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGE_OPTIONS.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-neutral-400 mt-1">
                    Preferred language for metadata
                  </p>
                </div>

                {/* Region (TMDB only) */}
                {metadata.name === 'tmdb' && (
                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-2">
                      Region
                    </label>
                    <Select value={region} onValueChange={setRegion}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {REGION_OPTIONS.map(option => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-neutral-400 mt-1">
                      Region for release dates
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

            {/* IMDb Legal Warning (inline) */}
            {metadata.name === 'imdb' && metadata.legalWarning && !config.enabled && (
              <div className="mb-6 p-3 bg-yellow-900/20 border border-yellow-800 rounded">
                <p className="text-xs text-yellow-400">
                  <span className="font-semibold">⚠ Legal Notice:</span> {metadata.legalWarning}
                </p>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <DialogFooter className="!justify-between">
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={disableProvider.isPending}
            >
              {disableProvider.isPending ? 'Deleting...' : 'Delete'}
            </Button>
            <div className="flex gap-2">
              <TestButton
                onTest={async () => {
                  const result = await testProvider.mutateAsync({
                    name: metadata.name,
                    apiKey: apiKey || undefined,
                  });
                  // Add provider name to log messages
                  if (result.success) {
                    console.log(`✓ ${metadata.displayName} connection test successful:`, result.message);
                  } else {
                    console.error(`✗ ${metadata.displayName} connection test failed:`, result.message);
                  }
                  return result;
                }}
              />
              <Button
                onClick={handleSave}
                disabled={!canSave || updateProvider.isPending}
              >
                {updateProvider.isPending ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* IMDb Legal Warning Dialog (Nested) */}
      <Dialog open={showImdbWarning} onOpenChange={setShowImdbWarning}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-yellow-900/30 border border-yellow-800 flex items-center justify-center" aria-hidden="true">
                <span className="text-yellow-400 text-xl">⚠</span>
              </div>
              <div>
                <DialogTitle>Legal Notice</DialogTitle>
                <DialogDescription className="mt-2">
                  {metadata.legalWarning}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="p-3 bg-neutral-900/50 border border-neutral-700 rounded">
              <p className="text-xs text-neutral-400">
                By enabling this provider, you acknowledge that you understand and accept the legal risks associated with web scraping IMDb content. This may violate IMDb's Terms of Service.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setShowImdbWarning(false)}
            >
              Cancel
            </Button>
            <Button onClick={saveProvider}>
              I Understand, Enable
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Accessible Confirmation Dialog */}
      <ConfirmDialog />
    </>
  );
};
