import { useState, useEffect, useCallback } from 'react';
import { PhaseConfiguration } from './types';

/**
 * Hook for managing phase configuration
 *
 * All phases ALWAYS run. Configuration controls BEHAVIOR, not ENABLEMENT.
 * Provides methods to fetch, update, and subscribe to phase config changes.
 */
export function usePhaseConfig() {
  const [config, setConfig] = useState<PhaseConfiguration | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Fetch current configuration
  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/settings/phase-config');
      if (!response.ok) {
        throw new Error(`Failed to fetch phase configuration: ${response.statusText}`);
      }

      const data = await response.json();
      setConfig(data);
    } catch (err: any) {
      setError(err.message);
      console.error('Error fetching phase configuration:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Update multiple settings at once
  const updateConfig = useCallback(async (updates: Record<string, any>) => {
    try {
      setSaving(true);
      setError(null);

      const response = await fetch('/api/settings/phase-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        throw new Error(`Failed to update phase configuration: ${response.statusText}`);
      }

      const data = await response.json();
      setConfig(data);
      return data;
    } catch (err: any) {
      setError(err.message);
      console.error('Error updating phase configuration:', err);
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  // Update a single setting
  const updateSetting = useCallback(async (key: string, value: any) => {
    try {
      setError(null);

      const response = await fetch(`/api/settings/phase-config/${key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value })
      });

      if (!response.ok) {
        throw new Error(`Failed to update ${key}: ${response.statusText}`);
      }

      // Refetch to get updated config
      await fetchConfig();
    } catch (err: any) {
      setError(err.message);
      console.error(`Error updating setting '${key}':`, err);
      throw err;
    }
  }, [fetchConfig]);

  // Reset to default configuration
  const resetToDefaults = useCallback(async () => {
    try {
      setSaving(true);
      setError(null);

      const response = await fetch('/api/settings/phase-config/reset', {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error(`Failed to reset configuration: ${response.statusText}`);
      }

      const data = await response.json();
      setConfig(data);
      return data;
    } catch (err: any) {
      setError(err.message);
      console.error('Error resetting configuration:', err);
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  // Fetch config on mount
  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // TODO: Add WebSocket listener for real-time updates
  // useEffect(() => {
  //   const handleConfigUpdate = (event: { key: string; value: any }) => {
  //     setConfig(prev => {
  //       if (!prev) return prev;
  //       // Update nested config based on key path
  //       const [phase, setting] = event.key.split('.');
  //       return {
  //         ...prev,
  //         [phase]: { ...prev[phase], [setting]: event.value }
  //       };
  //     });
  //   };
  //
  //   websocket.on('phase.config-updated', handleConfigUpdate);
  //   return () => websocket.off('phase.config-updated', handleConfigUpdate);
  // }, []);

  return {
    config,
    loading,
    error,
    saving,
    updateConfig,
    updateSetting,
    resetToDefaults,
    refetch: fetchConfig
  };
}
