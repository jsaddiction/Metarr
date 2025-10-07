/**
 * Kodi JSON-RPC 2.0 Types
 * Supports API versions: v12, v13, v13.5
 * Documentation:
 * - v12: https://kodi.wiki/view/JSON-RPC_API/v12
 * - v13: https://kodi.wiki/view/JSON-RPC_API/v13
 */

// Base JSON-RPC 2.0 Types
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, any> | any[];
  id: string | number;
}

export interface JsonRpcResponse<T = any> {
  jsonrpc: '2.0';
  result?: T;
  error?: JsonRpcError;
  id: string | number;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: any;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, any>;
}

// Kodi-Specific Types

export interface KodiVersion {
  major: number;
  minor: number;
  patch?: number;
  tag?: string;
}

export interface KodiVersionResponse {
  version: KodiVersion;
}

// JSONRPC Methods
export namespace JSONRPC {
  export interface PingResponse {
    result: 'pong';
  }

  export interface VersionResponse {
    version: {
      major: number;
      minor: number;
      patch: number;
    };
  }

  export interface PermissionResponse {
    ControlGUI: boolean;
    ControlNotify: boolean;
    ControlPVR: boolean;
    ControlPlayback: boolean;
    ControlPower: boolean;
    ControlSystem: boolean;
    ExecuteAddon: boolean;
    ManageAddon: boolean;
    Navigate: boolean;
    ReadData: boolean;
    RemoveData: boolean;
    UpdateData: boolean;
    WriteFile: boolean;
  }
}

// Player Methods
export namespace Player {
  export interface GetActivePlayersResponse {
    playerid: number;
    type: 'video' | 'audio' | 'picture';
    playertype: string;
  }

  export interface PlayerItem {
    id: number;
    type: string;
    label: string;
    title?: string;
  }

  export interface GetItemParams {
    playerid: number;
    properties?: string[];
  }

  export interface GetItemResponse {
    item: PlayerItem;
  }

  export interface GetPropertiesParams {
    playerid: number;
    properties: string[];
  }

  export interface PlayerProperties {
    type?: string;
    partymode?: boolean;
    speed?: number;
    time?: Time;
    percentage?: number;
    totaltime?: Time;
    playlistid?: number;
    position?: number;
    repeat?: string;
    shuffled?: boolean;
    canseek?: boolean;
    canchangespeed?: boolean;
    canmove?: boolean;
    canzoom?: boolean;
    canrotate?: boolean;
    canshuffle?: boolean;
    canrepeat?: boolean;
    currentaudiostream?: any;
    audiostreams?: any[];
    subtitleenabled?: boolean;
    currentsubtitle?: any;
    subtitles?: any[];
    live?: boolean;
    currentvideostream?: any;
    videostreams?: any[];
    cachepercentage?: number;
  }

  export interface PlayPauseParams {
    playerid: number;
    play?: boolean | 'toggle';
  }

  export interface PlayerSpeed {
    speed: number;
  }

  export interface StopParams {
    playerid: number;
  }

  export interface SeekParams {
    playerid: number;
    value: number | { percentage: number } | { time: Time };
  }

  // Notifications
  export interface OnPlayData {
    player: {
      playerid: number;
      speed: number;
    };
    item: PlayerItem;
  }

  export interface OnPauseData {
    player: {
      playerid: number;
      speed: number;
    };
    item: PlayerItem;
  }

  export interface OnStopData {
    item: PlayerItem;
    end: boolean;
  }

  export interface OnSeekData {
    player: {
      playerid: number;
      speed: number;
      time: Time;
      seekoffset: Time;
    };
    item: PlayerItem;
  }

  export interface Time {
    hours: number;
    minutes: number;
    seconds: number;
    milliseconds: number;
  }
}

// VideoLibrary Methods
export namespace VideoLibrary {
  export interface ScanParams {
    directory?: string;
    showdialogs?: boolean;
  }

  export interface CleanParams {
    showdialogs?: boolean;
    content?: string;
    directory?: string;
  }

  export interface GetMoviesParams {
    properties?: string[];
    limits?: {
      start: number;
      end: number;
    };
    sort?: {
      method: string;
      order: 'ascending' | 'descending';
    };
    filter?: Record<string, any>;
  }

  export interface GetMovieDetailsParams {
    movieid: number;
    properties?: string[];
  }

  export interface SetMovieDetailsParams {
    movieid: number;
    title?: string;
    originaltitle?: string;
    sorttitle?: string;
    playcount?: number;
    runtime?: number;
    director?: string[];
    studio?: string[];
    year?: number;
    plot?: string;
    plotoutline?: string;
    genre?: string[];
    rating?: number;
    mpaa?: string;
    imdbnumber?: string;
    votes?: number;
    lastplayed?: string;
    trailer?: string;
    tagline?: string;
    writer?: string[];
    country?: string[];
    top250?: number;
    set?: string;
    showlink?: string[];
    thumbnail?: string;
    fanart?: string;
    tag?: string[];
    art?: Record<string, string>;
    resume?: VideoResume;
    userrating?: number;
    ratings?: Record<string, Rating>;
    dateadded?: string;
    premiered?: string;
    uniqueid?: Record<string, string>;
  }

  export interface Rating {
    default: boolean;
    rating: number;
    votes: number;
  }

  export interface VideoResume {
    position: number;
    total: number;
  }

  export interface Cast {
    name: string;
    role: string;
    order: number;
    thumbnail?: string;
  }

  export interface StreamDetails {
    video?: VideoStream[];
    audio?: AudioStream[];
    subtitle?: SubtitleStream[];
  }

  export interface VideoStream {
    codec: string;
    width: number;
    height: number;
    duration?: number;
    aspect?: number;
  }

  export interface AudioStream {
    codec: string;
    language: string;
    channels: number;
  }

  export interface SubtitleStream {
    language: string;
  }

  // Complete Movie type with all 37 properties from introspect
  export interface Movie {
    movieid: number;
    label: string;
    title: string;
    originaltitle?: string;
    sorttitle?: string;
    year?: number;
    rating?: number;
    ratings?: Record<string, Rating>;
    userrating?: number;
    votes?: number;
    playcount?: number;
    lastplayed?: string;
    dateadded?: string;
    premiered?: string;
    runtime?: number;
    mpaa?: string;
    plot?: string;
    plotoutline?: string;
    tagline?: string;
    file?: string;
    imdbnumber?: string;
    uniqueid?: Record<string, string>;
    genre?: string[];
    director?: string[];
    writer?: string[];
    studio?: string[];
    country?: string[];
    tag?: string[];
    cast?: Cast[];
    set?: string;
    setid?: number;
    showlink?: string[];
    top250?: number;
    trailer?: string;
    art?: Record<string, string>;
    thumbnail?: string;
    fanart?: string;
    resume?: VideoResume;
    streamdetails?: StreamDetails;
  }

  export interface GetMoviesResponse {
    movies: Movie[];
    limits: {
      start: number;
      end: number;
      total: number;
    };
  }

  export interface GetMovieDetailsResponse {
    moviedetails: Movie;
  }
}

// AudioLibrary Methods
export namespace AudioLibrary {
  export interface ScanResponse {
    result: string;
  }

  export interface CleanResponse {
    result: string;
  }
}

// Files Methods
export namespace Files {
  export interface GetSourcesParams {
    media?: 'video' | 'music' | 'pictures' | 'files' | 'programs';
  }

  export interface Source {
    file: string;
    label: string;
  }

  export interface GetSourcesResponse {
    sources: Source[];
    limits: {
      start: number;
      end: number;
      total: number;
    };
  }

  export interface GetDirectoryParams {
    directory: string;
    media?: 'video' | 'music' | 'pictures' | 'files' | 'programs';
    properties?: string[];
    sort?: {
      method: string;
      order: 'ascending' | 'descending';
    };
    limits?: {
      start: number;
      end: number;
    };
  }

  export interface FileItem {
    file: string;
    filetype: 'file' | 'directory';
    label: string;
    type?: string;
    title?: string;
  }

  export interface GetDirectoryResponse {
    files: FileItem[];
    limits: {
      start: number;
      end: number;
      total: number;
    };
  }
}

// System Methods
export namespace System {
  export interface GetPropertiesResponse {
    canhibernate: boolean;
    canreboot: boolean;
    canshutdown: boolean;
    cansuspend: boolean;
  }
}

// Application Methods
export namespace Application {
  export interface GetPropertiesResponse {
    name: string;
    version: KodiVersion;
    volume: number;
    muted: boolean;
  }

  export interface SetVolumeResponse {
    volume: number;
  }
}

// Notification Event Types
export type KodiNotificationMethod =
  | 'Player.OnPlay'
  | 'Player.OnPause'
  | 'Player.OnStop'
  | 'Player.OnSeek'
  | 'Player.OnSpeedChanged'
  | 'Player.OnPropertyChanged'
  | 'VideoLibrary.OnUpdate'
  | 'VideoLibrary.OnRemove'
  | 'VideoLibrary.OnScanStarted'
  | 'VideoLibrary.OnScanFinished'
  | 'VideoLibrary.OnCleanStarted'
  | 'VideoLibrary.OnCleanFinished'
  | 'AudioLibrary.OnUpdate'
  | 'AudioLibrary.OnRemove'
  | 'AudioLibrary.OnScanStarted'
  | 'AudioLibrary.OnScanFinished'
  | 'AudioLibrary.OnCleanStarted'
  | 'AudioLibrary.OnCleanFinished'
  | 'System.OnQuit'
  | 'System.OnRestart'
  | 'System.OnSleep'
  | 'System.OnWake'
  | 'Application.OnVolumeChanged';

// Helper type for creating requests
export type KodiMethod =
  | 'JSONRPC.Ping'
  | 'JSONRPC.Version'
  | 'JSONRPC.Permission'
  | 'Player.GetActivePlayers'
  | 'Player.GetItem'
  | 'Player.GetProperties'
  | 'Player.PlayPause'
  | 'Player.Stop'
  | 'Player.Seek'
  | 'VideoLibrary.Scan'
  | 'VideoLibrary.Clean'
  | 'VideoLibrary.GetMovies'
  | 'VideoLibrary.GetMovieDetails'
  | 'VideoLibrary.SetMovieDetails'
  | 'VideoLibrary.GetTVShows'
  | 'VideoLibrary.GetEpisodes'
  | 'Files.GetSources'
  | 'Files.GetDirectory'
  | 'AudioLibrary.Scan'
  | 'AudioLibrary.Clean'
  | 'System.GetProperties'
  | 'Application.GetProperties'
  | 'Application.SetVolume';

// Version Detection Response
export interface DetectedVersion {
  version: string; // e.g., "v12", "v13", "v13.5"
  major: number;
  minor: number;
  patch?: number;
  supported: boolean;
}
