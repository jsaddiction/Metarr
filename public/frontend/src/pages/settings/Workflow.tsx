import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Switch } from '../../components/ui/switch';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { useWorkflowSettings } from '../../hooks/useWorkflowSettings';
import { WorkflowStageConfig } from '../../types/workflow';

/**
 * Workflow Settings Page
 *
 * Allows users to enable/disable workflow stages globally.
 * All stages are disabled by default for development safety.
 */
export function Workflow() {
  const { settings, loading, error, updateStage, enableAll, disableAll } = useWorkflowSettings();
  const [updating, setUpdating] = useState(false);

  // Workflow stage configurations
  const stages: WorkflowStageConfig[] = [
    {
      id: 'webhooks',
      name: 'Webhook Processing',
      description: 'Process webhooks from Radarr/Sonarr/Lidarr when new media is downloaded',
      icon: '🔗',
      dependencies: []
    },
    {
      id: 'scanning',
      name: 'Filesystem Scanning',
      description: 'Discover assets (images, videos, subtitles) in media directories',
      icon: '📁',
      dependencies: ['webhooks']
    },
    {
      id: 'identification',
      name: 'Provider Identification',
      description: 'Fetch metadata and assets from TMDB/TVDB',
      icon: '🔍',
      dependencies: ['scanning']
    },
    {
      id: 'enrichment',
      name: 'Asset Enrichment',
      description: 'Automatically select best quality assets based on scoring',
      icon: '✨',
      dependencies: ['identification']
    },
    {
      id: 'publishing',
      name: 'Library Publishing',
      description: 'Write NFO files and assets to library for media players',
      icon: '📤',
      dependencies: ['enrichment']
    }
  ];

  const handleToggle = async (stageId: string) => {
    setUpdating(true);
    try {
      await updateStage(stageId as any, !settings[stageId as keyof typeof settings]);
    } catch (err) {
      // Error handled by hook
    } finally {
      setUpdating(false);
    }
  };

  const handleEnableAll = async () => {
    setUpdating(true);
    try {
      await enableAll();
    } catch (err) {
      // Error handled by hook
    } finally {
      setUpdating(false);
    }
  };

  const handleDisableAll = async () => {
    setUpdating(true);
    try {
      await disableAll();
    } catch (err) {
      // Error handled by hook
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Loading workflow settings...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-primary-500">Workflow Control</h1>
        <p className="text-gray-600 mt-2">
          Manage global workflow stages to control automated processing
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Info Alert */}
      <Alert>
        <AlertDescription>
          Workflow stages control automatic processing. All stages are disabled by default for development safety.
          Enable only the stages you want to test. Each stage depends on the previous stages being enabled.
        </AlertDescription>
      </Alert>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>
            Quickly enable or disable all workflow stages
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-4">
          <Button
            onClick={handleEnableAll}
            disabled={updating}
            variant="default"
            className="bg-primary-500 hover:bg-primary-600"
          >
            Enable All (Production Mode)
          </Button>
          <Button
            onClick={handleDisableAll}
            disabled={updating}
            variant="outline"
          >
            Disable All (Development Mode)
          </Button>
        </CardContent>
      </Card>

      {/* Workflow Stages */}
      <div className="space-y-4">
        {stages.map((stage, index) => {
          const isEnabled = settings[stage.id];
          const isDependencyMet = stage.dependencies?.every(dep => settings[dep]) ?? true;

          return (
            <Card key={stage.id} className={!isDependencyMet ? 'opacity-60' : ''}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{stage.icon}</span>
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {stage.name}
                        {isEnabled && (
                          <span className="text-sm font-normal text-primary-500">● Enabled</span>
                        )}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {stage.description}
                      </CardDescription>
                    </div>
                  </div>
                  <Switch
                    checked={isEnabled}
                    onCheckedChange={() => handleToggle(stage.id)}
                    disabled={updating || !isDependencyMet}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span>Stage {index + 1} of {stages.length}</span>
                  {stage.dependencies && stage.dependencies.length > 0 && (
                    <>
                      <span>•</span>
                      <span>
                        Requires: {stage.dependencies.map(dep =>
                          stages.find(s => s.id === dep)?.name
                        ).join(', ')}
                      </span>
                    </>
                  )}
                </div>
                {!isDependencyMet && (
                  <div className="mt-2 text-sm text-yellow-600">
                    ⚠️ Enable required dependencies first
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Workflow Flow Visualization */}
      <Card>
        <CardHeader>
          <CardTitle>Workflow Flow</CardTitle>
          <CardDescription>
            Visual representation of the complete workflow chain
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2 font-mono text-sm">
            <div className={settings.webhooks ? 'text-primary-500' : 'text-gray-400'}>
              Radarr Webhook → handleWebhookReceived
            </div>
            <div className="ml-4 text-gray-500">↓</div>
            <div className={settings.scanning ? 'text-primary-500' : 'text-gray-400'}>
              handleScanMovie → Insert/Update Database
            </div>
            <div className="ml-4 text-gray-500">↓</div>
            <div className={settings.scanning ? 'text-primary-500' : 'text-gray-400'}>
              handleDiscoverAssets → Scan Filesystem
            </div>
            <div className="ml-4 text-gray-500">↓</div>
            <div className={settings.identification ? 'text-primary-500' : 'text-gray-400'}>
              handleFetchProviderAssets → Fetch from TMDB
            </div>
            <div className="ml-4 text-gray-500">↓</div>
            <div className={settings.enrichment ? 'text-primary-500' : 'text-gray-400'}>
              handleSelectAssets → Auto-Select Best Assets
            </div>
            <div className="ml-4 text-gray-500">↓</div>
            <div className={settings.publishing ? 'text-primary-500' : 'text-gray-400'}>
              handlePublish → Write NFO + Assets
            </div>
            <div className="ml-4 text-primary-500">✓ Complete</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
