import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Switch } from '../../components/ui/switch';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { usePhaseConfig } from '../../hooks/usePhaseConfig';
import { useAssetLimits } from '../../hooks/useAssetLimits';
import { toast } from 'sonner';
import { InfoIcon, SaveIcon, RotateCcwIcon, ChevronDown, ChevronRight } from 'lucide-react';

// Language options
const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'es', name: 'Spanish' },
  { code: 'it', name: 'Italian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'zh', name: 'Chinese' },
];

/**
 * General Settings Page
 *
 * IMPORTANT: Only exposes settings that are ACTUALLY USED by backend services.
 */
export function Workflow() {
  const { config, loading, error, saving, updateConfig, resetToDefaults } = usePhaseConfig();
  const { limits: assetLimits, updateLimit, isUpdating } = useAssetLimits();

  // Local state for form values
  const [formData, setFormData] = useState<any>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Track expanded media type sections
  const [expandedMediaTypes, setExpandedMediaTypes] = useState<Set<string>>(new Set());

  // Initialize form data when config loads
  useEffect(() => {
    if (config && !formData) {
      setFormData(config);
    }
  }, [config, formData]);

  // Helper to toggle media type section
  const toggleMediaType = (mediaType: string) => {
    setExpandedMediaTypes(prev => {
      const next = new Set(prev);
      if (next.has(mediaType)) {
        next.delete(mediaType);
      } else {
        next.add(mediaType);
      }
      return next;
    });
  };

  // Group asset limits by media type
  const assetLimitsByMediaType = () => {
    const groups: Record<string, { displayName: string; limits: typeof assetLimits }> = {
      movie: { displayName: 'Movies', limits: [] },
      tvshow: { displayName: 'TV Shows', limits: [] },
      season: { displayName: 'Seasons', limits: [] },
      episode: { displayName: 'Episodes', limits: [] },
      artist: { displayName: 'Music Artists', limits: [] },
      album: { displayName: 'Albums', limits: [] },
    };

    assetLimits.forEach(limit => {
      limit.mediaTypes.forEach(mediaType => {
        if (groups[mediaType]) {
          groups[mediaType].limits.push(limit);
        }
      });
    });

    // Only return groups that have limits
    return Object.entries(groups).filter(([_, group]) => group.limits.length > 0);
  };

  // Update form field
  const updateField = (path: string, value: any) => {
    if (!formData) return;

    const keys = path.split('.');
    const newData = { ...formData };
    let current: any = newData;

    for (let i = 0; i < keys.length - 1; i++) {
      current[keys[i]] = { ...current[keys[i]] };
      current = current[keys[i]];
    }

    current[keys[keys.length - 1]] = value;
    setFormData(newData);
    setHasChanges(true);
  };

  // Auto-select helper - when enabled, both fetch and auto-select are true
  const isAutoSelect = formData?.enrichment.fetchProviderAssets && formData?.enrichment.autoSelectAssets;

  const setAutoSelect = (enabled: boolean) => {
    if (!formData) return;

    const newData = { ...formData };
    if (enabled) {
      // Auto mode: fetch and auto-select
      newData.enrichment.fetchProviderAssets = true;
      newData.enrichment.autoSelectAssets = true;
    } else {
      // Manual mode: fetch but don't auto-select
      newData.enrichment.fetchProviderAssets = true;
      newData.enrichment.autoSelectAssets = false;
    }
    setFormData(newData);
    setHasChanges(true);
  };

  // Save changes
  const handleSave = async () => {
    if (!formData) return;

    try {
      const updates: Record<string, any> = {};

      // General
      if (formData.general.autoPublish !== config?.general.autoPublish) {
        updates['general.autoPublish'] = formData.general.autoPublish;
      }

      // Enrichment
      if (formData.enrichment.fetchProviderAssets !== config?.enrichment.fetchProviderAssets) {
        updates['enrichment.fetchProviderAssets'] = formData.enrichment.fetchProviderAssets;
      }
      if (formData.enrichment.autoSelectAssets !== config?.enrichment.autoSelectAssets) {
        updates['enrichment.autoSelectAssets'] = formData.enrichment.autoSelectAssets;
      }
      if (formData.enrichment.preferredLanguage !== config?.enrichment.preferredLanguage) {
        updates['enrichment.language'] = formData.enrichment.preferredLanguage;
      }

      // Publish
      if (formData.publish.publishAssets !== config?.publish.publishAssets) {
        updates['publish.assets'] = formData.publish.publishAssets;
      }
      if (formData.publish.publishActors !== config?.publish.publishActors) {
        updates['publish.actors'] = formData.publish.publishActors;
      }
      if (formData.publish.publishTrailers !== config?.publish.publishTrailers) {
        updates['publish.trailers'] = formData.publish.publishTrailers;
      }

      await updateConfig(updates);
      setHasChanges(false);
      toast.success('Configuration saved');
    } catch (err) {
      toast.error('Failed to save configuration');
    }
  };

  // Reset to defaults
  const handleReset = async () => {
    if (!confirm('Reset all configuration to defaults?')) return;

    try {
      const defaults = await resetToDefaults();
      setFormData(defaults);
      setHasChanges(false);
      toast.success('Configuration reset to defaults');
    } catch (err) {
      toast.error('Failed to reset configuration');
    }
  };

  // Discard changes
  const handleDiscard = () => {
    if (config) {
      setFormData(config);
      setHasChanges(false);
    }
  };

  if (loading || !formData) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-neutral-400">Loading configuration...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 pb-24">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">General Settings</h1>
        <p className="text-sm text-neutral-400 mt-1">
          Configure metadata enrichment and library publishing behavior
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Two-card layout */}
      <div className="space-y-6">
        {/* Enrichment Card */}
        <Card className="bg-neutral-800/50">
          <CardHeader>
            <CardTitle>✨ Metadata & Asset Enrichment</CardTitle>
            <CardDescription>
              Control how Metarr fetches and selects assets from providers
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Auto-select Assets Toggle */}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="autoSelect">Automatic Asset Selection</Label>
                <p className="text-sm text-neutral-500">
                  When enabled, Metarr automatically selects the best assets. When disabled, you manually choose assets in the UI.
                </p>
              </div>
              <Switch
                id="autoSelect"
                checked={isAutoSelect}
                onCheckedChange={setAutoSelect}
              />
            </div>

            {/* Language */}
            <div className="space-y-2">
              <Label htmlFor="language">Preferred Language</Label>
              <select
                id="language"
                value={formData.enrichment.preferredLanguage}
                onChange={(e) => updateField('enrichment.preferredLanguage', e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {LANGUAGES.map(lang => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name} ({lang.code})
                  </option>
                ))}
              </select>
              <p className="text-xs text-neutral-500">
                Used when scoring assets - higher priority for matching language
              </p>
            </div>

            {/* Asset Download Limits Section */}
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-neutral-200 mb-1">Asset Download Limits</h3>
                <p className="text-xs text-neutral-500">
                  Maximum number of each asset type to download per media item. Set to 0 to disable that type.
                </p>
              </div>

              {/* Media Type Groups */}
              <div className="space-y-3">
                {assetLimitsByMediaType().map(([mediaType, group]) => (
                  <div key={mediaType} className="border border-neutral-700 rounded-md">
                    {/* Media Type Header */}
                    <button
                      type="button"
                      onClick={() => toggleMediaType(mediaType)}
                      className="w-full flex items-center justify-between p-3 text-left hover:bg-neutral-800/30 transition-colors rounded-md"
                    >
                      <div className="flex items-center gap-2">
                        {expandedMediaTypes.has(mediaType) ?
                          <ChevronDown className="h-3 w-3 text-neutral-400" /> :
                          <ChevronRight className="h-3 w-3 text-neutral-400" />
                        }
                        <span className="text-sm font-medium text-neutral-200">{group.displayName}</span>
                        <span className="text-xs text-neutral-500">
                          ({group.limits.length} asset {group.limits.length === 1 ? 'type' : 'types'})
                        </span>
                      </div>
                    </button>

                    {/* Asset Type Inputs */}
                    {expandedMediaTypes.has(mediaType) && (
                      <div className="border-t border-neutral-700 p-3">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {group.limits.map((limit) => (
                            <div key={limit.assetType} className="space-y-1">
                              <Label htmlFor={`limit-${limit.assetType}`} className="text-xs flex items-center gap-1">
                                {limit.displayName}
                                {!limit.isDefault && (
                                  <span className="text-primary-400" title="Custom value">*</span>
                                )}
                              </Label>
                              <Input
                                id={`limit-${limit.assetType}`}
                                type="number"
                                min={limit.minAllowed}
                                max={limit.maxAllowed}
                                value={limit.currentLimit}
                                onChange={(e) => {
                                  const value = parseInt(e.target.value, 10);
                                  if (!isNaN(value) && value >= limit.minAllowed && value <= limit.maxAllowed) {
                                    updateLimit({ assetType: limit.assetType, limit: value });
                                  }
                                }}
                                disabled={isUpdating}
                                className="h-8 text-sm"
                                title={limit.description}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="text-xs text-neutral-500 space-y-1">
                <p>* Custom value (different from default)</p>
                <p>Hover over inputs for description of each asset type</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Publishing Card */}
        <Card className="bg-neutral-800/50">
          <CardHeader>
            <CardTitle>📤 Library Publishing</CardTitle>
            <CardDescription>
              Choose what gets copied to your media library and when
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Auto-publish setting */}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="autoPublish">Automatic Publishing</Label>
                <p className="text-sm text-neutral-500">
                  When enabled, assets are automatically published after enrichment completes.
                  When disabled, you must manually review and publish from the UI.
                </p>
              </div>
              <Switch
                id="autoPublish"
                checked={formData.general.autoPublish}
                onCheckedChange={(checked) => updateField('general.autoPublish', checked)}
              />
            </div>

            <Alert>
              <InfoIcon className="h-4 w-4" />
              <AlertDescription>
                <strong>Recommended: Off</strong> - Review metadata and selected assets before publishing to your library.
                Turn on for fully automated workflow without manual review.
              </AlertDescription>
            </Alert>

            {/* Divider */}
            <div className="border-t border-neutral-700 my-6"></div>

            {/* What to publish */}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="publishAssets">Publish assets (posters, fanart, logos)</Label>
                <p className="text-sm text-neutral-500">
                  Copy selected images to your media library
                </p>
              </div>
              <Switch
                id="publishAssets"
                checked={formData.publish.publishAssets}
                onCheckedChange={(checked) => updateField('publish.publishAssets', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="publishActors">Publish actor headshots</Label>
                <p className="text-sm text-neutral-500">
                  Create .actors/ folder with cast thumbnails (Kodi/Jellyfin format)
                </p>
              </div>
              <Switch
                id="publishActors"
                checked={formData.publish.publishActors}
                onCheckedChange={(checked) => updateField('publish.publishActors', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="publishTrailers">Publish trailers</Label>
                <p className="text-sm text-neutral-500">
                  Download and save trailer files (⚠️ uses significant disk space)
                </p>
              </div>
              <Switch
                id="publishTrailers"
                checked={formData.publish.publishTrailers}
                onCheckedChange={(checked) => updateField('publish.publishTrailers', checked)}
              />
            </div>

            <Alert>
              <InfoIcon className="h-4 w-4" />
              <AlertDescription>
                <strong>NFO files are always generated</strong> regardless of these settings. They contain metadata required by media players.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>

      {/* Save Bar (Fixed at bottom) */}
      {hasChanges && (
        <div className="fixed bottom-0 left-0 right-0 bg-neutral-900 border-t border-neutral-700 shadow-lg p-4 z-50">
          <div className="container mx-auto flex items-center justify-between max-w-7xl">
            <div className="text-sm text-neutral-400">
              You have unsaved changes
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={handleDiscard} disabled={saving}>
                Discard
              </Button>
              <Button onClick={handleReset} variant="outline" disabled={saving}>
                <RotateCcwIcon className="h-4 w-4 mr-2" />
                Reset to Defaults
              </Button>
              <Button onClick={handleSave} disabled={saving} className="bg-primary-500 hover:bg-primary-600">
                <SaveIcon className="h-4 w-4 mr-2" />
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
