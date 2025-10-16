import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

interface MediaPlayer {
  id: number;
  name: string;
  type: string;
  host: string;
  port: number;
  enabled: boolean;
}

interface MediaPlayerStatusCardProps {
  player: MediaPlayer;
  status?: {
    connected: boolean;
    playback?: {
      title: string;
      position: number;
      duration: number;
    };
  };
}

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

export const MediaPlayerStatusCard: React.FC<MediaPlayerStatusCardProps> = ({
  player,
  status,
}) => {
  // Determine connection state
  // Kodi: "connected" = WebSocket established
  // Jellyfin/Plex: "able to connect" = REST works (no WebSocket)
  const isConnected = player.enabled && (status?.connected ?? false);
  const connectionIcon = isConnected ? '🟢' : '🔴';

  let connectionText: string;
  if (!player.enabled) {
    connectionText = 'Disabled';
  } else if (isConnected) {
    // For Kodi: connected means WebSocket is up
    // For others: means REST API is working
    connectionText = player.type === 'kodi' ? 'Connected' : 'Able to connect';
  } else {
    connectionText = 'Not connected';
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span>{connectionIcon}</span>
          <span>{player.name}</span>
        </CardTitle>
        <CardDescription>
          {player.host}:{player.port}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          <div className="text-sm">{connectionText}</div>

          {status?.playback && (
            <>
              <div className="text-sm font-medium mt-2">
                Playing: {status.playback.title}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatTime(status.playback.position)} / {formatTime(status.playback.duration)}
              </div>
            </>
          )}

          {!status?.playback && isConnected && player.type === 'kodi' && (
            <div className="text-xs text-muted-foreground mt-2">Idle</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
