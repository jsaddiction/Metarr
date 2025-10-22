# Workflow Control Settings

This document defines the workflow control system that allows users to enable/disable specific parts of the processing pipeline based on their needs.

---

## Core Concept

Users can customize Metarr's behavior by enabling/disabling workflow stages globally. This is a **production feature**, not a developer tool.

**Use Cases**:
- **Notification Only**: User disables everything except webhooks and notifications
- **No Publishing**: User wants metadata management but not library updates
- **No Trailers**: User doesn't want trailer downloads
- **Manual Assets**: User disables automatic asset selection

---

## Workflow Settings Quick Reference

### Settings Table

| Setting Key | Description | Category | Default | Resource Impact |
|-------------|-------------|----------|---------|-----------------|
| `workflow.scanning` | Filesystem scanning and discovery | Core | `false` | Low |
| `workflow.identification` | TMDB/IMDB ID matching | Core | `false` | API calls |
| `workflow.enrichment` | Metadata fetching from providers | Core | `false` | API calls |
| `workflow.asset_discovery` | Find local assets in filesystem | Assets | `false` | Disk I/O |
| `workflow.asset_fetching` | Download assets from providers | Assets | `false` | Bandwidth |
| `workflow.asset_selection` | Automatic best asset selection | Assets | `false` | CPU |
| `workflow.thumbnail_generation` | Generate thumbnails from videos | Assets | `false` | High CPU |
| `workflow.subtitle_extraction` | Extract subtitles from containers | Media | `false` | CPU |
| `workflow.subtitle_download` | Download from OpenSubtitles | Media | `false` | API calls |
| `workflow.trailer_download` | Download trailers from YouTube | Media | `false` | High bandwidth |
| `workflow.nfo_generation` | Generate NFO files | Media | `false` | Low |
| `workflow.publishing` | Publish assets to library | Publishing | `false` | Disk I/O |
| `workflow.library_notification` | Notify media players | Publishing | `false` | Network |
| `workflow.webhook_processing` | Process Radarr/Sonarr webhooks | Integration | `false` | Low |
| `workflow.notifications` | Send notifications (Discord, etc.) | Integration | `false` | Network |

### Default Configuration (Development)

**ALL DISABLED BY DEFAULT** - Enable only what you're testing during development.

```typescript
// src/config/workflowDefaults.ts
export const DEFAULT_WORKFLOW_SETTINGS = {
  // Everything disabled for development
  'workflow.scanning': false,
  'workflow.identification': false,
  'workflow.enrichment': false,
  'workflow.asset_discovery': false,
  'workflow.asset_fetching': false,
  'workflow.asset_selection': false,
  'workflow.thumbnail_generation': false,
  'workflow.subtitle_extraction': false,
  'workflow.subtitle_download': false,
  'workflow.trailer_download': false,
  'workflow.nfo_generation': false,
  'workflow.publishing': false,
  'workflow.library_notification': false,
  'workflow.webhook_processing': false,
  'workflow.notifications': false
};

// Production defaults (to be configured before v1.0)
export const PRODUCTION_WORKFLOW_DEFAULTS = {
  // Core - Usually enabled
  'workflow.scanning': true,
  'workflow.identification': true,
  'workflow.enrichment': true,

  // Assets - Commonly enabled
  'workflow.asset_discovery': true,
  'workflow.asset_fetching': true,
  'workflow.asset_selection': true,
  'workflow.thumbnail_generation': false,  // CPU intensive

  // Media - User preference
  'workflow.subtitle_extraction': true,
  'workflow.subtitle_download': false,     // Requires API key
  'workflow.trailer_download': false,      // Bandwidth intensive
  'workflow.nfo_generation': true,

  // Publishing - Usually enabled
  'workflow.publishing': true,
  'workflow.library_notification': true,

  // Integration - User preference
  'workflow.webhook_processing': true,
  'workflow.notifications': false          // Requires configuration
};
```

---

## Implementation

### Database Schema

Using the existing `app_settings` table with key-value pairs:

```sql
-- Workflow settings stored in existing app_settings table
-- Table already exists in schema:
-- CREATE TABLE app_settings (
--   key TEXT PRIMARY KEY,
--   value TEXT NOT NULL,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );

-- Insert default workflow settings (ALL DISABLED for development)
INSERT OR REPLACE INTO app_settings (key, value) VALUES
  ('workflow.scanning', 'false'),
  ('workflow.identification', 'false'),
  ('workflow.enrichment', 'false'),
  ('workflow.asset_discovery', 'false'),
  ('workflow.asset_fetching', 'false'),
  ('workflow.asset_selection', 'false'),
  ('workflow.thumbnail_generation', 'false'),
  ('workflow.subtitle_extraction', 'false'),
  ('workflow.subtitle_download', 'false'),
  ('workflow.trailer_download', 'false'),
  ('workflow.nfo_generation', 'false'),
  ('workflow.publishing', 'false'),
  ('workflow.library_notification', 'false'),
  ('workflow.webhook_processing', 'false'),
  ('workflow.notifications', 'false');
```

### Job Handler Integration

```typescript
// src/services/jobHandlers.ts
export class JobHandlers {
  private workflowSettings: Map<string, boolean> = new Map();

  constructor(
    private jobQueue: JobQueueService,
    private db: DatabaseManager
  ) {
    this.loadWorkflowSettings();
  }

  private async loadWorkflowSettings(): Promise<void> {
    // Load all workflow settings from app_settings table
    const results = await this.db.query(
      `SELECT key, value FROM app_settings WHERE key LIKE 'workflow.%'`
    );

    // Parse boolean values and store in map
    results.forEach(row => {
      this.workflowSettings.set(row.key, row.value === 'true');
    });

    // Apply defaults for any missing settings
    for (const [key, defaultValue] of Object.entries(DEFAULT_WORKFLOW_SETTINGS)) {
      if (!this.workflowSettings.has(key)) {
        this.workflowSettings.set(key, defaultValue);
        // Insert missing setting into database
        await this.db.execute(
          'INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)',
          [key, String(defaultValue)]
        );
      }
    }

    logger.info('Workflow settings loaded:', Object.fromEntries(this.workflowSettings));
  }

  private isWorkflowEnabled(settingKey: string): boolean {
    return this.workflowSettings.get(settingKey) === true;
  }

  // Helper method to update a setting
  async updateWorkflowSetting(key: string, value: boolean): Promise<void> {
    await this.db.execute(
      'INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)',
      [key, String(value)]
    );
    this.workflowSettings.set(key, value);
    logger.info(`Workflow setting updated: ${key} = ${value}`);
  }

  // Example: After identification, check if enrichment is enabled
  private async handleIdentifyMovie(job: Job): Promise<void> {
    const { movieId } = job.payload;

    // Do identification work
    const tmdbId = await this.identifyMovie(movieId);

    if (!tmdbId) {
      logger.warn(`Could not identify movie ${movieId}`);
      return;
    }

    // Check if enrichment is enabled before queuing next job
    if (this.isWorkflowEnabled('workflow.enrichment')) {
      await this.jobQueue.add('enrich-metadata', {
        movieId,
        tmdbId
      });
    } else {
      logger.info('Enrichment disabled in workflow settings, stopping chain');
    }
  }

  private async handleEnrichMetadata(job: Job): Promise<void> {
    const { movieId } = job.payload;

    // Do enrichment work
    await this.enrichMovie(movieId);

    // Queue multiple conditional jobs based on settings
    const nextJobs = [];

    if (this.isWorkflowEnabled('workflow.asset_fetching')) {
      nextJobs.push(this.jobQueue.add('fetch-assets', { movieId }));
    }

    if (this.isWorkflowEnabled('workflow.subtitle_extraction')) {
      nextJobs.push(this.jobQueue.add('extract-subtitles', { movieId }));
    }

    if (this.isWorkflowEnabled('workflow.trailer_download')) {
      nextJobs.push(this.jobQueue.add('download-trailer', { movieId }));
    }

    if (this.isWorkflowEnabled('workflow.nfo_generation')) {
      nextJobs.push(this.jobQueue.add('generate-nfo', { movieId }));
    }

    await Promise.all(nextJobs);

    if (nextJobs.length === 0) {
      logger.info('All post-enrichment workflows disabled, stopping chain');
    }
  }

  private async handlePublishAssets(job: Job): Promise<void> {
    // Check if publishing is enabled
    if (!this.isWorkflowEnabled('workflow.publishing')) {
      logger.info('Publishing disabled in workflow settings, skipping');
      return;
    }

    const { movieId } = job.payload;

    // Do publishing work
    await this.publishAssets(movieId);

    // Check if library notification is enabled
    if (this.isWorkflowEnabled('workflow.library_notification')) {
      await this.jobQueue.add('notify-library', { movieId });
    }
  }

  private async handleWebhookReceived(job: Job): Promise<void> {
    // Check if webhook processing is enabled
    if (!this.isWorkflowEnabled('workflow.webhook_processing')) {
      logger.info('Webhook processing disabled, ignoring webhook');
      return;
    }

    // Process webhook and start appropriate chain
    const { event, movie } = job.payload;

    // Start the chain based on webhook type
    if (event === 'Download') {
      await this.jobQueue.add('scan-movie', {
        moviePath: movie.path
      });
    }

    // Check if notifications are enabled
    if (this.isWorkflowEnabled('workflow.notifications')) {
      await this.jobQueue.add('send-notification', {
        type: 'webhook',
        message: `Received ${event} webhook for ${movie.title}`
      });
    }
  }
}
```

---

## UI Implementation

### Settings Page - Workflow Control

```tsx
// pages/settings/WorkflowSettings.tsx
export function WorkflowSettings() {
  const { settings, updateSettings, resetToDefaults } = useWorkflowSettings();
  const [hasChanges, setHasChanges] = useState(false);

  const handleToggle = (key: keyof WorkflowSettings, value: boolean) => {
    updateSettings({ [key]: value });
    setHasChanges(true);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Workflow Control</CardTitle>
          <CardDescription>
            Enable or disable specific processing stages globally.
            Disabled stages will be skipped for all items.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Core Processing */}
          <div>
            <h3 className="font-semibold mb-3">Core Processing</h3>
            <div className="space-y-2">
              <SettingToggle
                label="Scanning"
                description="Discover media files in library folders"
                checked={settings.scanning}
                onCheckedChange={(checked) => handleToggle('scanning', checked)}
              />
              <SettingToggle
                label="Identification"
                description="Match media files with TMDB/IMDB"
                checked={settings.identification}
                onCheckedChange={(checked) => handleToggle('identification', checked)}
              />
              <SettingToggle
                label="Enrichment"
                description="Fetch metadata from online providers"
                checked={settings.enrichment}
                onCheckedChange={(checked) => handleToggle('enrichment', checked)}
              />
            </div>
          </div>

          {/* Assets */}
          <div>
            <h3 className="font-semibold mb-3">Asset Management</h3>
            <div className="space-y-2">
              <SettingToggle
                label="Asset Discovery"
                description="Find existing images in media folders"
                checked={settings.assetDiscovery}
                onCheckedChange={(checked) => handleToggle('assetDiscovery', checked)}
              />
              <SettingToggle
                label="Asset Fetching"
                description="Download artwork from providers"
                checked={settings.assetFetching}
                onCheckedChange={(checked) => handleToggle('assetFetching', checked)}
              />
              <SettingToggle
                label="Automatic Selection"
                description="Automatically select best quality assets"
                checked={settings.assetSelection}
                onCheckedChange={(checked) => handleToggle('assetSelection', checked)}
              />
              <SettingToggle
                label="Thumbnail Generation"
                description="Generate video thumbnails (CPU intensive)"
                checked={settings.thumbnailGeneration}
                onCheckedChange={(checked) => handleToggle('thumbnailGeneration', checked)}
              />
            </div>
          </div>

          {/* Media Processing */}
          <div>
            <h3 className="font-semibold mb-3">Media Processing</h3>
            <div className="space-y-2">
              <SettingToggle
                label="Subtitle Extraction"
                description="Extract embedded subtitles from video files"
                checked={settings.subtitleExtraction}
                onCheckedChange={(checked) => handleToggle('subtitleExtraction', checked)}
              />
              <SettingToggle
                label="Subtitle Download"
                description="Download subtitles from OpenSubtitles"
                checked={settings.subtitleDownload}
                onCheckedChange={(checked) => handleToggle('subtitleDownload', checked)}
              />
              <SettingToggle
                label="Trailer Download"
                description="Download trailers from YouTube"
                checked={settings.trailerDownload}
                onCheckedChange={(checked) => handleToggle('trailerDownload', checked)}
              />
              <SettingToggle
                label="NFO Generation"
                description="Create NFO files for media players"
                checked={settings.nfoGeneration}
                onCheckedChange={(checked) => handleToggle('nfoGeneration', checked)}
              />
            </div>
          </div>

          {/* Publishing */}
          <div>
            <h3 className="font-semibold mb-3">Publishing</h3>
            <div className="space-y-2">
              <SettingToggle
                label="Publishing"
                description="Copy assets to library folders"
                checked={settings.publishing}
                onCheckedChange={(checked) => handleToggle('publishing', checked)}
                warning={!checked && "Assets will remain in cache only"}
              />
              <SettingToggle
                label="Library Notification"
                description="Notify media players of changes"
                checked={settings.libraryNotification}
                onCheckedChange={(checked) => handleToggle('libraryNotification', checked)}
                disabled={!settings.publishing}
              />
            </div>
          </div>

          {/* Integration */}
          <div>
            <h3 className="font-semibold mb-3">Integration</h3>
            <div className="space-y-2">
              <SettingToggle
                label="Webhook Processing"
                description="Process webhooks from Radarr/Sonarr"
                checked={settings.webhookProcessing}
                onCheckedChange={(checked) => handleToggle('webhookProcessing', checked)}
                warning={!checked && "Webhooks will be ignored"}
              />
              <SettingToggle
                label="Notifications"
                description="Send notifications (Discord, email, etc.)"
                checked={settings.notifications}
                onCheckedChange={(checked) => handleToggle('notifications', checked)}
              />
            </div>
          </div>

        </CardContent>
        <CardFooter className="flex justify-between">
          <Button
            variant="outline"
            onClick={resetToDefaults}
          >
            Reset to Defaults
          </Button>
          <Button
            onClick={() => {
              updateSettings(settings);
              setHasChanges(false);
            }}
            disabled={!hasChanges}
          >
            Save Changes
          </Button>
        </CardFooter>
      </Card>

      {/* Preset Configurations */}
      <Card>
        <CardHeader>
          <CardTitle>Workflow Presets</CardTitle>
          <CardDescription>
            Quick configurations for common use cases
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <Button
              variant="outline"
              onClick={() => applyPreset('full')}
            >
              <div className="text-left">
                <div className="font-semibold">Full Automation</div>
                <div className="text-sm text-muted-foreground">
                  Everything enabled
                </div>
              </div>
            </Button>

            <Button
              variant="outline"
              onClick={() => applyPreset('notificationOnly')}
            >
              <div className="text-left">
                <div className="font-semibold">Notification Only</div>
                <div className="text-sm text-muted-foreground">
                  Just webhooks and alerts
                </div>
              </div>
            </Button>

            <Button
              variant="outline"
              onClick={() => applyPreset('metadataOnly')}
            >
              <div className="text-left">
                <div className="font-semibold">Metadata Only</div>
                <div className="text-sm text-muted-foreground">
                  No publishing or notifications
                </div>
              </div>
            </Button>

            <Button
              variant="outline"
              onClick={() => applyPreset('minimal')}
            >
              <div className="text-left">
                <div className="font-semibold">Minimal</div>
                <div className="text-sm text-muted-foreground">
                  Basic scanning and identification
                </div>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

### Workflow Presets

```typescript
// src/config/workflowPresets.ts
export const WORKFLOW_PRESETS = {
  full: {
    name: 'Full Automation',
    description: 'All features enabled',
    settings: {
      scanning: true,
      identification: true,
      enrichment: true,
      assetDiscovery: true,
      assetFetching: true,
      assetSelection: true,
      thumbnailGeneration: true,
      subtitleExtraction: true,
      subtitleDownload: true,
      trailerDownload: true,
      nfoGeneration: true,
      publishing: true,
      libraryNotification: true,
      webhookProcessing: true,
      notifications: true
    }
  },

  notificationOnly: {
    name: 'Notification Only',
    description: 'Monitor activity without processing',
    settings: {
      scanning: false,
      identification: false,
      enrichment: false,
      assetDiscovery: false,
      assetFetching: false,
      assetSelection: false,
      thumbnailGeneration: false,
      subtitleExtraction: false,
      subtitleDownload: false,
      trailerDownload: false,
      nfoGeneration: false,
      publishing: false,
      libraryNotification: false,
      webhookProcessing: true,
      notifications: true
    }
  },

  metadataOnly: {
    name: 'Metadata Only',
    description: 'Enrich metadata without publishing',
    settings: {
      scanning: true,
      identification: true,
      enrichment: true,
      assetDiscovery: true,
      assetFetching: true,
      assetSelection: true,
      thumbnailGeneration: false,
      subtitleExtraction: true,
      subtitleDownload: false,
      trailerDownload: false,
      nfoGeneration: true,
      publishing: false,
      libraryNotification: false,
      webhookProcessing: true,
      notifications: false
    }
  },

  minimal: {
    name: 'Minimal Processing',
    description: 'Basic identification only',
    settings: {
      scanning: true,
      identification: true,
      enrichment: false,
      assetDiscovery: true,
      assetFetching: false,
      assetSelection: false,
      thumbnailGeneration: false,
      subtitleExtraction: false,
      subtitleDownload: false,
      trailerDownload: false,
      nfoGeneration: false,
      publishing: false,
      libraryNotification: false,
      webhookProcessing: false,
      notifications: false
    }
  }
};
```

---

## API Endpoints

```typescript
// src/routes/workflowSettings.ts
router.get('/api/settings/workflow', async (req, res) => {
  const settings = await workflowService.getSettings();
  res.json(settings);
});

router.put('/api/settings/workflow', async (req, res) => {
  const settings = await workflowService.updateSettings(req.body);

  // Reload settings in job handlers
  await jobHandlers.reloadWorkflowSettings();

  res.json(settings);
});

router.post('/api/settings/workflow/preset/:name', async (req, res) => {
  const preset = WORKFLOW_PRESETS[req.params.name];
  if (!preset) {
    return res.status(404).json({ error: 'Preset not found' });
  }

  const settings = await workflowService.updateSettings(preset.settings);
  await jobHandlers.reloadWorkflowSettings();

  res.json(settings);
});

router.post('/api/settings/workflow/reset', async (req, res) => {
  const settings = await workflowService.resetToDefaults();
  await jobHandlers.reloadWorkflowSettings();

  res.json(settings);
});
```

---

## Use Cases

### 1. Notification Only Mode
User wants to monitor Radarr/Sonarr activity without any processing:
- ✅ Webhook Processing
- ✅ Notifications
- ❌ Everything else

### 2. Metadata Management Only
User wants enriched metadata but handles publishing manually:
- ✅ Scanning, Identification, Enrichment
- ✅ Asset Discovery, Fetching, Selection
- ✅ NFO Generation
- ❌ Publishing, Library Notification

### 3. Minimal Resource Usage
User on low-power device wants basic functionality:
- ✅ Scanning, Identification
- ✅ Asset Discovery
- ❌ Enrichment, Asset Fetching
- ❌ Thumbnail Generation
- ❌ Trailer Downloads

### 4. Full Automation
Power user wants everything automated:
- ✅ All features enabled

---

## Benefits

1. **Flexible Deployment**: Users can customize based on their needs
2. **Resource Control**: Disable CPU/bandwidth intensive features
3. **Gradual Adoption**: Start minimal, enable features as needed
4. **Clear User Control**: Simple toggles, not complex configuration
5. **Preset Support**: Quick switching between common configurations
6. **Production Ready**: This is a user feature, not developer-only

This workflow control system gives users complete control over what Metarr does, making it adaptable to many different use cases and system capabilities.