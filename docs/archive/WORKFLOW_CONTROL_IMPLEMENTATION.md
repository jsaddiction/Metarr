# Workflow Control Implementation Plan

## Overview

Implement production workflow control system that allows users to enable/disable processing stages globally. All stages disabled by default for development safety.

---

## Architecture

### Storage Layer

```sql
-- Using existing app_settings table (key-value store)
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Workflow settings
INSERT OR REPLACE INTO app_settings (key, value) VALUES
  ('workflow.scanning', 'false'),          -- Filesystem discovery
  ('workflow.identification', 'false'),     -- Provider metadata fetch
  ('workflow.enrichment', 'false'),        -- Asset selection
  ('workflow.publishing', 'false'),        -- Library publishing
  ('workflow.webhooks', 'false');          -- Webhook processing
```

### Service Layer

```typescript
// src/services/workflowControlService.ts
export class WorkflowControlService {
  private db: DatabaseConnection;
  private cache: Map<string, boolean> = new Map();
  private cacheTimeout = 60000; // 1 minute cache

  async isEnabled(stage: WorkflowStage): Promise<boolean> {
    // Check cache first
    if (this.cache.has(stage)) {
      return this.cache.get(stage)!;
    }

    // Query database
    const result = await this.db.query<{value: string}>(
      'SELECT value FROM app_settings WHERE key = ?',
      [`workflow.${stage}`]
    );

    const enabled = result[0]?.value === 'true';
    this.cache.set(stage, enabled);

    // Clear cache after timeout
    setTimeout(() => this.cache.delete(stage), this.cacheTimeout);

    return enabled;
  }

  async setEnabled(stage: WorkflowStage, enabled: boolean): Promise<void> {
    await this.db.execute(
      'INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      [`workflow.${stage}`, enabled.toString()]
    );

    // Clear cache
    this.cache.delete(stage);

    // Emit WebSocket event
    websocketBroadcaster.broadcast({
      type: 'workflow.updated',
      stage,
      enabled
    });
  }

  async getAll(): Promise<WorkflowSettings> {
    const result = await this.db.query<{key: string, value: string}>(
      "SELECT key, value FROM app_settings WHERE key LIKE 'workflow.%'"
    );

    const settings: WorkflowSettings = {
      scanning: false,
      identification: false,
      enrichment: false,
      publishing: false,
      webhooks: false
    };

    for (const row of result) {
      const stage = row.key.replace('workflow.', '') as WorkflowStage;
      settings[stage] = row.value === 'true';
    }

    return settings;
  }
}

export type WorkflowStage = 'scanning' | 'identification' | 'enrichment' | 'publishing' | 'webhooks';

export interface WorkflowSettings {
  scanning: boolean;
  identification: boolean;
  enrichment: boolean;
  publishing: boolean;
  webhooks: boolean;
}
```

---

## API Implementation

### Endpoints

```typescript
// src/routes/settingsRoutes.ts

// GET /api/settings/workflow
router.get('/workflow', async (req, res) => {
  const settings = await workflowControl.getAll();
  res.json(settings);
});

// PUT /api/settings/workflow
router.put('/workflow', async (req, res) => {
  const updates = req.body; // { scanning: true, identification: false }

  for (const [stage, enabled] of Object.entries(updates)) {
    if (isValidStage(stage) && typeof enabled === 'boolean') {
      await workflowControl.setEnabled(stage as WorkflowStage, enabled);
    }
  }

  const settings = await workflowControl.getAll();
  res.json(settings);
});

// PUT /api/settings/workflow/:stage
router.put('/workflow/:stage', async (req, res) => {
  const { stage } = req.params;
  const { enabled } = req.body;

  if (!isValidStage(stage)) {
    return res.status(400).json({ error: 'Invalid workflow stage' });
  }

  await workflowControl.setEnabled(stage as WorkflowStage, enabled);
  res.json({ stage, enabled });
});
```

---

## Frontend Implementation

### Settings Page Component

```tsx
// public/frontend/src/pages/settings/WorkflowSettings.tsx
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function WorkflowSettings() {
  const [settings, setSettings] = useState<WorkflowSettings>({
    scanning: false,
    identification: false,
    enrichment: false,
    publishing: false,
    webhooks: false
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSettings();

    // Listen for WebSocket updates
    const handler = (event: WorkflowUpdateEvent) => {
      setSettings(prev => ({
        ...prev,
        [event.stage]: event.enabled
      }));
    };

    websocket.on('workflow.updated', handler);
    return () => websocket.off('workflow.updated', handler);
  }, []);

  const fetchSettings = async () => {
    const response = await fetch('/api/settings/workflow');
    const data = await response.json();
    setSettings(data);
    setLoading(false);
  };

  const handleToggle = async (stage: WorkflowStage) => {
    const newValue = !settings[stage];

    // Optimistic update
    setSettings(prev => ({ ...prev, [stage]: newValue }));

    try {
      await fetch(`/api/settings/workflow/${stage}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newValue })
      });
    } catch (error) {
      // Revert on error
      setSettings(prev => ({ ...prev, [stage]: !newValue }));
      toast.error('Failed to update workflow setting');
    }
  };

  const stages = [
    {
      id: 'webhooks',
      name: 'Webhook Processing',
      description: 'Process webhooks from Radarr/Sonarr/Lidarr',
      icon: '🔗'
    },
    {
      id: 'scanning',
      name: 'Filesystem Scanning',
      description: 'Discover assets in media directories',
      icon: '📁'
    },
    {
      id: 'identification',
      name: 'Provider Identification',
      description: 'Fetch metadata from TMDB/TVDB',
      icon: '🔍'
    },
    {
      id: 'enrichment',
      name: 'Asset Enrichment',
      description: 'Auto-select best quality assets',
      icon: '✨'
    },
    {
      id: 'publishing',
      name: 'Library Publishing',
      description: 'Write NFO files and assets to library',
      icon: '📤'
    }
  ];

  return (
    <div className="space-y-6">
      <Alert>
        <AlertDescription>
          Workflow stages control automatic processing. All stages are disabled by default for development safety.
          Enable only the stages you want to test.
        </AlertDescription>
      </Alert>

      {stages.map(stage => (
        <Card key={stage.id}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{stage.icon}</span>
                <span>{stage.name}</span>
              </div>
              <Switch
                checked={settings[stage.id as WorkflowStage]}
                onCheckedChange={() => handleToggle(stage.id as WorkflowStage)}
                disabled={loading}
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">{stage.description}</p>
            {settings[stage.id as WorkflowStage] && (
              <p className="text-sm text-primary-500 mt-2">✓ Enabled</p>
            )}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-x-4">
          <button
            onClick={() => updateAll(true)}
            className="btn btn-primary"
          >
            Enable All
          </button>
          <button
            onClick={() => updateAll(false)}
            className="btn btn-secondary"
          >
            Disable All
          </button>
          <button
            onClick={() => setProductionMode()}
            className="btn btn-success"
          >
            Production Mode
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## Integration Points

### Job Handlers

```typescript
// In each job handler, check workflow settings
private async handleDiscoverAssets(job: Job): Promise<void> {
  // Check if this stage is enabled
  if (!await this.workflowControl.isEnabled('scanning')) {
    logger.info('Workflow scanning disabled, skipping job', { jobId: job.id });
    return;
  }

  // Process job...

  // Chain to next job if next stage is enabled
  if (await this.workflowControl.isEnabled('identification')) {
    await this.jobQueue.addJob({
      type: 'fetch-provider-assets',
      // ...
    });
  }
}
```

### Webhook Handler

```typescript
private async handleWebhookReceived(job: Job): Promise<void> {
  // Check if webhook processing is enabled
  if (!await this.workflowControl.isEnabled('webhooks')) {
    logger.info('Webhook processing disabled', { jobId: job.id });
    return;
  }

  // Process webhook...
}
```

---

## Default Configurations

### Development Mode (Default)
```json
{
  "scanning": false,
  "identification": false,
  "enrichment": false,
  "publishing": false,
  "webhooks": false
}
```

### Testing Mode
```json
{
  "scanning": true,
  "identification": true,
  "enrichment": false,
  "publishing": false,
  "webhooks": false
}
```

### Production Mode
```json
{
  "scanning": true,
  "identification": true,
  "enrichment": true,
  "publishing": true,
  "webhooks": true
}
```

---

## Migration Script

```typescript
// src/database/migrations/20251021_workflow_settings.ts
export async function up(db: DatabaseConnection): Promise<void> {
  // Insert default workflow settings (all disabled)
  const settings = [
    ['workflow.scanning', 'false'],
    ['workflow.identification', 'false'],
    ['workflow.enrichment', 'false'],
    ['workflow.publishing', 'false'],
    ['workflow.webhooks', 'false']
  ];

  for (const [key, value] of settings) {
    await db.execute(
      'INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)',
      [key, value]
    );
  }
}

export async function down(db: DatabaseConnection): Promise<void> {
  await db.execute(
    "DELETE FROM app_settings WHERE key LIKE 'workflow.%'"
  );
}
```

---

## Testing Plan

### Unit Tests
```typescript
describe('WorkflowControlService', () => {
  it('should default to disabled', async () => {
    const enabled = await service.isEnabled('scanning');
    expect(enabled).toBe(false);
  });

  it('should cache settings for performance', async () => {
    // First call hits database
    await service.isEnabled('scanning');

    // Second call uses cache
    const spy = jest.spyOn(db, 'query');
    await service.isEnabled('scanning');
    expect(spy).not.toHaveBeenCalled();
  });

  it('should clear cache on update', async () => {
    await service.setEnabled('scanning', true);
    const enabled = await service.isEnabled('scanning');
    expect(enabled).toBe(true);
  });
});
```

### Integration Tests
- Test workflow stages enable/disable correctly
- Test job handlers respect workflow settings
- Test WebSocket events on setting changes
- Test API endpoints with various payloads

---

## Monitoring & Logging

```typescript
// Log workflow state changes
logger.info('Workflow stage updated', {
  stage,
  enabled,
  updatedBy: req.user?.id || 'system'
});

// Log when jobs skip due to workflow
logger.debug('Job skipped due to workflow settings', {
  jobId: job.id,
  jobType: job.type,
  stage,
  enabled: false
});

// Metrics to track
- workflow_stage_toggles_total (counter)
- workflow_jobs_skipped_total (counter by stage)
- workflow_stage_enabled (gauge by stage)
```

---

## Documentation Updates

Update user documentation to explain:
1. What each workflow stage does
2. Safe testing progression (scanning → identification → enrichment → publishing)
3. Impact of enabling/disabling stages
4. Recommended settings for different environments
5. How to troubleshoot workflow issues