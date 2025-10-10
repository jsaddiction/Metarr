import React, { useState } from 'react';
import { ProviderWithMetadata, UpdateProviderRequest } from '../../types/provider';
import { useUpdateProvider, useTestProvider } from '../../hooks/useProviders';

interface ProviderCardProps {
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

export const ProviderCard: React.FC<ProviderCardProps> = ({ provider }) => {
  const { config, metadata } = provider;

  const [isEditing, setIsEditing] = useState(false);
  const [enabled, setEnabled] = useState(config.enabled);
  const [apiKey, setApiKey] = useState(config.apiKey || '');
  const [personalApiKey, setPersonalApiKey] = useState(config.personalApiKey || '');
  const [language, setLanguage] = useState(config.language || 'en');
  const [region, setRegion] = useState(config.region || 'US');
  const [enabledAssetTypes, setEnabledAssetTypes] = useState<string[]>(config.enabledAssetTypes);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showImdbWarning, setShowImdbWarning] = useState(false);

  const updateProvider = useUpdateProvider();
  const testProvider = useTestProvider();

  const handleAssetTypeToggle = (assetType: string) => {
    setEnabledAssetTypes(prev => {
      if (prev.includes(assetType)) {
        return prev.filter(t => t !== assetType);
      } else {
        return [...prev, assetType];
      }
    });
  };

  const handleTest = async () => {
    setTestResult(null);
    try {
      const result = await testProvider.mutateAsync({
        name: metadata.name,
        apiKey: apiKey || undefined,
      });
      setTestResult({ success: result.success, message: result.message });
    } catch (error: any) {
      setTestResult({ success: false, message: error.message || 'Test failed' });
    }
  };

  const handleSave = async () => {
    // IMDb legal warning check
    if (metadata.name === 'imdb' && !config.enabled && enabled) {
      setShowImdbWarning(true);
      return;
    }

    await saveProvider();
  };

  const saveProvider = async () => {
    const data: UpdateProviderRequest = {
      enabled,
      apiKey: apiKey || undefined,
      personalApiKey: personalApiKey || undefined,
      enabledAssetTypes,
      language: language || undefined,
      region: region || undefined,
    };

    try {
      await updateProvider.mutateAsync({ name: metadata.name, data });
      setIsEditing(false);
      setTestResult(null);
      setShowImdbWarning(false);
    } catch (error: any) {
      console.error('Failed to save provider:', error);
    }
  };

  const handleCancel = () => {
    setEnabled(config.enabled);
    setApiKey(config.apiKey || '');
    setPersonalApiKey(config.personalApiKey || '');
    setLanguage(config.language || 'en');
    setRegion(config.region || 'US');
    setEnabledAssetTypes(config.enabledAssetTypes);
    setIsEditing(false);
    setTestResult(null);
    setShowImdbWarning(false);
  };

  const availableAssetTypes = metadata.supportedAssetTypes.filter(t => t.available);
  const requiresApiKey = metadata.requiresApiKey && !metadata.apiKeyOptional;
  const hasApiKey = !!apiKey;
  const canSave = !requiresApiKey || hasApiKey;

  return (
    <div className="card">
      <div className="card-body">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white">{metadata.displayName}</h3>
            <p className="text-sm text-neutral-400">{metadata.baseUrl}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Overall Enable Toggle */}
            <label className="flex items-center gap-2">
              <span className="text-sm text-neutral-300">Enable</span>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => {
                  setEnabled(e.target.checked);
                  setIsEditing(true);
                }}
                className="w-5 h-5 rounded border-neutral-600 bg-neutral-700 text-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-offset-0"
              />
            </label>
          </div>
        </div>

        {/* Status Badge */}
        <div className="mb-4">
          {config.lastTestStatus === 'success' && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-900/30 text-green-400 border border-green-800">
              ✓ Connection Successful
            </span>
          )}
          {config.lastTestStatus === 'error' && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-900/30 text-red-400 border border-red-800">
              ✗ Connection Failed
            </span>
          )}
          {config.lastTestStatus === 'never_tested' && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-800 text-neutral-400 border border-neutral-700">
              Not Tested
            </span>
          )}
          {config.lastTestError && (
            <p className="text-sm text-red-400 mt-1">{config.lastTestError}</p>
          )}
        </div>

        {/* API Key Field */}
        {(metadata.requiresApiKey || metadata.apiKeyOptional) && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              API Key
              {requiresApiKey && <span className="text-red-400 ml-1">*</span>}
              {metadata.apiKeyOptional && (
                <span className="text-neutral-500 ml-1 font-normal">(optional)</span>
              )}
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setIsEditing(true);
              }}
              placeholder={metadata.apiKeyOptional && metadata.apiKeyBenefit ? metadata.apiKeyBenefit : 'Enter API key'}
              className="input w-full"
            />
          </div>
        )}

        {/* Personal API Key (FanArt.tv) */}
        {metadata.name === 'fanart_tv' && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              Personal API Key
              <span className="text-neutral-500 ml-1 font-normal">(optional)</span>
            </label>
            <input
              type="password"
              value={personalApiKey}
              onChange={(e) => {
                setPersonalApiKey(e.target.value);
                setIsEditing(true);
              }}
              placeholder="Unlocks higher rate limits and additional features"
              className="input w-full"
            />
            {metadata.apiKeyBenefit && (
              <p className="text-xs text-neutral-400 mt-1">{metadata.apiKeyBenefit}</p>
            )}
          </div>
        )}

        {/* Language Selection (TMDB, TVDB) */}
        {(metadata.name === 'tmdb' || metadata.name === 'tvdb') && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              Language
            </label>
            <select
              value={language}
              onChange={(e) => {
                setLanguage(e.target.value);
                setIsEditing(true);
              }}
              className="input w-full"
            >
              {LANGUAGE_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-neutral-400 mt-1">
              Preferred language for metadata and asset titles
            </p>
          </div>
        )}

        {/* Region Selection (TMDB) */}
        {metadata.name === 'tmdb' && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              Region
            </label>
            <select
              value={region}
              onChange={(e) => {
                setRegion(e.target.value);
                setIsEditing(true);
              }}
              className="input w-full"
            >
              {REGION_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-neutral-400 mt-1">
              Region for release dates and content availability
            </p>
          </div>
        )}

        {/* IMDb Legal Warning (inline, shown when disabled) */}
        {metadata.name === 'imdb' && metadata.legalWarning && !enabled && (
          <div className="mb-4 p-3 bg-yellow-900/20 border border-yellow-800 rounded">
            <p className="text-xs text-yellow-400">
              <span className="font-semibold">⚠ Legal Notice:</span> {metadata.legalWarning}
            </p>
          </div>
        )}

        {/* Asset Types */}
        {availableAssetTypes.length > 0 && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              Enabled Asset Types
            </label>
            <div className="space-y-2">
              {availableAssetTypes.map((assetType) => (
                <label key={assetType.type} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={enabledAssetTypes.includes(assetType.type)}
                    onChange={() => {
                      handleAssetTypeToggle(assetType.type);
                      setIsEditing(true);
                    }}
                    disabled={!enabled}
                    className="w-4 h-4 rounded border-neutral-600 bg-neutral-700 text-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-offset-0 disabled:opacity-50"
                  />
                  <span className={`text-sm ${enabled ? 'text-neutral-300' : 'text-neutral-500'}`}>
                    {assetType.displayName}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Rate Limit Info */}
        <div className="mb-4 p-3 bg-neutral-800/50 rounded border border-neutral-700">
          <p className="text-xs text-neutral-400">
            <span className="font-medium">Rate Limit:</span> {metadata.rateLimit.requests} requests per {metadata.rateLimit.windowSeconds} second{metadata.rateLimit.windowSeconds !== 1 ? 's' : ''}
          </p>
          {metadata.authType && (
            <p className="text-xs text-neutral-400 mt-1">
              <span className="font-medium">Auth Type:</span> {metadata.authType.toUpperCase()}
            </p>
          )}
        </div>

        {/* Test Result */}
        {testResult && (
          <div className={`mb-4 p-3 rounded border ${testResult.success ? 'bg-green-900/20 border-green-800 text-green-400' : 'bg-red-900/20 border-red-800 text-red-400'}`}>
            <p className="text-sm">{testResult.message}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <button
                onClick={handleSave}
                disabled={!canSave || updateProvider.isPending}
                className="btn btn-primary flex-1"
              >
                {updateProvider.isPending ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={handleCancel}
                disabled={updateProvider.isPending}
                className="btn btn-secondary flex-1"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={handleTest}
              disabled={!hasApiKey || testProvider.isPending}
              className="btn btn-secondary w-full"
            >
              {testProvider.isPending ? 'Testing...' : 'Test Connection'}
            </button>
          )}
        </div>
      </div>

      {/* IMDb Legal Warning Modal */}
      {showImdbWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-yellow-900/30 border border-yellow-800 flex items-center justify-center">
                  <span className="text-yellow-400 text-xl">⚠</span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white mb-2">Legal Notice</h3>
                  <p className="text-sm text-neutral-300">
                    {metadata.legalWarning}
                  </p>
                </div>
              </div>

              <div className="mb-4 p-3 bg-neutral-900/50 border border-neutral-700 rounded">
                <p className="text-xs text-neutral-400">
                  By enabling this provider, you acknowledge that you understand and accept the legal risks associated with web scraping IMDb content. This may violate IMDb's Terms of Service.
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    saveProvider();
                  }}
                  className="btn btn-primary flex-1"
                >
                  I Understand, Enable
                </button>
                <button
                  onClick={() => {
                    setEnabled(false);
                    setShowImdbWarning(false);
                    setIsEditing(false);
                  }}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
