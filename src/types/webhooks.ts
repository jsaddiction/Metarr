export interface BaseWebhookPayload {
  eventType: string;
  applicationName: string;
  applicationUrl: string;
  instanceName: string;
}

export interface SonarrWebhookPayload extends BaseWebhookPayload {
  eventType:
    | 'Download'
    | 'Rename'
    | 'SeriesAdd'
    | 'SeriesDelete'
    | 'EpisodeFileDelete'
    | 'HealthIssue'
    | 'ApplicationUpdate'
    | 'Test';
  series?: {
    id: number;
    title: string;
    path: string;
    tvdbId: number;
    tvMazeId?: number;
    imdbId?: string;
    type: string;
  };
  episodes?: Array<{
    id: number;
    episodeNumber: number;
    seasonNumber: number;
    title: string;
    airDate?: string;
    airDateUtc?: string;
    overview?: string;
    hasFile: boolean;
  }>;
  episodeFile?: {
    id: number;
    relativePath: string;
    path: string;
    quality: string;
    qualityVersion: number;
    releaseGroup?: string;
    sceneName?: string;
    size: number;
    dateAdded: string;
  };
  isUpgrade?: boolean;
}

export interface RadarrWebhookPayload extends BaseWebhookPayload {
  eventType:
    | 'Grab'
    | 'Download'
    | 'Rename'
    | 'MovieAdded'
    | 'MovieDeleted'
    | 'MovieFileDeleted'
    | 'HealthIssue'
    | 'ApplicationUpdate'
    | 'Test';
  movie?: {
    id: number;
    title: string;
    year: number;
    releaseDate?: string;
    folderPath: string;
    tmdbId: number;
    imdbId?: string;
    overview?: string;
  };
  movieFile?: {
    id: number;
    relativePath: string;
    path: string;
    quality: string;
    qualityVersion: number;
    releaseGroup?: string;
    sceneName?: string;
    size: number;
    dateAdded: string;
  };
  remoteMovie?: {
    tmdbId: number;
    imdbId?: string;
    title: string;
    year: number;
  };
  isUpgrade?: boolean;
}

export interface LidarrWebhookPayload extends BaseWebhookPayload {
  eventType:
    | 'Download'
    | 'Rename'
    | 'ArtistAdded'
    | 'ArtistDeleted'
    | 'TrackFileDeleted'
    | 'HealthIssue'
    | 'ApplicationUpdate'
    | 'Test';
  artist?: {
    id: number;
    name: string;
    path: string;
    mbId?: string;
    foreignArtistId?: string;
    type: string;
  };
  albums?: Array<{
    id: number;
    title: string;
    releaseDate?: string;
    albumType: string;
    mbId?: string;
  }>;
  trackFiles?: Array<{
    id: number;
    relativePath: string;
    path: string;
    quality: string;
    size: number;
    dateAdded: string;
  }>;
  isUpgrade?: boolean;
}

export type WebhookPayload = SonarrWebhookPayload | RadarrWebhookPayload | LidarrWebhookPayload;
