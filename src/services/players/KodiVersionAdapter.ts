/**
 * Kodi Version Adapter
 * Handles differences between JSON-RPC API versions v12, v13, v13.5
 */

import { DetectedVersion } from '../../types/jsonrpc.js';

export interface VersionCapabilities {
  supportsWebSocket: boolean;
  supportsNotifications: boolean;
  supportsVideoLibraryScan: boolean;
  supportsAudioLibraryScan: boolean;
  supportsPlayerNotifications: boolean;
  methodPrefix: string;
}

export class KodiVersionAdapter {
  private readonly version: DetectedVersion;

  constructor(version: DetectedVersion) {
    this.version = version;
  }

  /**
   * Get capabilities for detected version
   */
  getCapabilities(): VersionCapabilities {
    const { major } = this.version;

    // All supported versions have these capabilities
    const baseCapabilities: VersionCapabilities = {
      supportsWebSocket: true,
      supportsNotifications: true,
      supportsVideoLibraryScan: true,
      supportsAudioLibraryScan: true,
      supportsPlayerNotifications: true,
      methodPrefix: '',
    };

    // v12 specific adjustments (if any)
    if (major === 12) {
      return {
        ...baseCapabilities,
        // v12 is fully supported
      };
    }

    // v13 and v13.5 specific adjustments
    if (major === 13) {
      return {
        ...baseCapabilities,
        // v13 and v13.5 have enhanced notification support
      };
    }

    // Future versions - assume v13.5 compatibility
    return baseCapabilities;
  }

  /**
   * Check if a specific method is supported
   */
  isMethodSupported(_method: string): boolean {
    // const capabilities = this.getCapabilities();

    // All core methods are supported in v12+
    const coreMethods = [
      'JSONRPC.Ping',
      'JSONRPC.Version',
      'JSONRPC.Permission',
      'Player.GetActivePlayers',
      'Player.GetItem',
      'Player.PlayPause',
      'Player.Stop',
      'VideoLibrary.Scan',
      'VideoLibrary.Clean',
      'VideoLibrary.GetMovies',
      'AudioLibrary.Scan',
      'AudioLibrary.Clean',
    ];

    return coreMethods.includes(_method);
  }

  /**
   * Get version-specific notification methods
   */
  getSupportedNotifications(): string[] {
    const { major } = this.version;

    const baseNotifications = [
      'Player.OnPlay',
      'Player.OnPause',
      'Player.OnStop',
      'VideoLibrary.OnUpdate',
      'VideoLibrary.OnRemove',
      'VideoLibrary.OnScanStarted',
      'VideoLibrary.OnScanFinished',
      'AudioLibrary.OnUpdate',
      'AudioLibrary.OnRemove',
      'System.OnQuit',
      'System.OnRestart',
    ];

    // v13+ has additional notifications
    if (major >= 13) {
      return [
        ...baseNotifications,
        'Player.OnSeek',
        'Player.OnSpeedChanged',
        'VideoLibrary.OnCleanStarted',
        'VideoLibrary.OnCleanFinished',
        'AudioLibrary.OnScanStarted',
        'AudioLibrary.OnScanFinished',
        'System.OnSleep',
        'System.OnWake',
      ];
    }

    return baseNotifications;
  }

  /**
   * Adapt parameters for version-specific API calls
   */
  adaptParameters(_method: string, params: unknown): unknown {
    // Most parameters are compatible across versions
    // Add specific adaptations here if needed for certain methods
    return params;
  }

  /**
   * Get recommended WebSocket port for version
   */
  getDefaultWebSocketPort(): number {
    // Kodi typically uses port 9090 for WebSocket
    return 9090;
  }

  /**
   * Get recommended HTTP port for version
   */
  getDefaultHttpPort(): number {
    // Kodi typically uses port 8080 for HTTP
    return 8080;
  }

  /**
   * Get version info
   */
  getVersion(): DetectedVersion {
    return { ...this.version };
  }

  /**
   * Check if version is supported
   */
  isSupported(): boolean {
    return this.version.supported;
  }

  /**
   * Get version display string
   */
  getVersionString(): string {
    return this.version.version;
  }
}
