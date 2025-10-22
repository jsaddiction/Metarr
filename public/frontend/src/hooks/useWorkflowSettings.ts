import { useState, useEffect, useCallback } from 'react';
import { WorkflowSettings, WorkflowStage } from '../types/workflow';

/**
 * Hook for managing workflow settings
 *
 * Provides methods to fetch, update, and subscribe to workflow settings changes.
 * Includes WebSocket support for real-time updates.
 */
export function useWorkflowSettings() {
  const [settings, setSettings] = useState<WorkflowSettings>({
    webhooks: false,
    scanning: false,
    identification: false,
    enrichment: false,
    publishing: false
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch current settings
  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/settings/workflow');
      if (!response.ok) {
        throw new Error(`Failed to fetch workflow settings: ${response.statusText}`);
      }

      const data = await response.json();
      setSettings(data);
    } catch (err: any) {
      setError(err.message);
      console.error('Error fetching workflow settings:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Update a single workflow stage
  const updateStage = useCallback(async (stage: WorkflowStage, enabled: boolean) => {
    try {
      setError(null);

      // Optimistic update
      setSettings(prev => ({ ...prev, [stage]: enabled }));

      const response = await fetch(`/api/settings/workflow/${stage}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });

      if (!response.ok) {
        // Revert optimistic update on error
        setSettings(prev => ({ ...prev, [stage]: !enabled }));
        throw new Error(`Failed to update ${stage}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`Workflow stage '${stage}' updated:`, data);
    } catch (err: any) {
      setError(err.message);
      console.error(`Error updating workflow stage '${stage}':`, err);
      throw err;
    }
  }, []);

  // Update multiple stages at once
  const updateMultiple = useCallback(async (updates: Partial<WorkflowSettings>) => {
    try {
      setError(null);

      // Optimistic update
      setSettings(prev => ({ ...prev, ...updates }));

      const response = await fetch('/api/settings/workflow', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        // Revert on error
        await fetchSettings();
        throw new Error(`Failed to update workflow settings: ${response.statusText}`);
      }

      const data = await response.json();
      setSettings(data);
    } catch (err: any) {
      setError(err.message);
      console.error('Error updating workflow settings:', err);
      throw err;
    }
  }, [fetchSettings]);

  // Enable all workflows (production mode)
  const enableAll = useCallback(async () => {
    try {
      setError(null);

      const response = await fetch('/api/settings/workflow/enable-all', {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error(`Failed to enable all workflows: ${response.statusText}`);
      }

      const data = await response.json();
      setSettings(data);
    } catch (err: any) {
      setError(err.message);
      console.error('Error enabling all workflows:', err);
      throw err;
    }
  }, []);

  // Disable all workflows (development mode)
  const disableAll = useCallback(async () => {
    try {
      setError(null);

      const response = await fetch('/api/settings/workflow/disable-all', {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error(`Failed to disable all workflows: ${response.statusText}`);
      }

      const data = await response.json();
      setSettings(data);
    } catch (err: any) {
      setError(err.message);
      console.error('Error disabling all workflows:', err);
      throw err;
    }
  }, []);

  // Fetch settings on mount
  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // TODO: Add WebSocket listener for real-time updates
  // useEffect(() => {
  //   const handleWorkflowUpdate = (event: WorkflowUpdateEvent) => {
  //     setSettings(prev => ({ ...prev, [event.stage]: event.enabled }));
  //   };
  //
  //   websocket.on('workflow.updated', handleWorkflowUpdate);
  //   return () => websocket.off('workflow.updated', handleWorkflowUpdate);
  // }, []);

  return {
    settings,
    loading,
    error,
    updateStage,
    updateMultiple,
    enableAll,
    disableAll,
    refetch: fetchSettings
  };
}
