export interface ServerConfig {
  port: number;
  host: string;
  env: 'development' | 'production' | 'test';
}

export interface DatabaseConfig {
  type: 'sqlite3' | 'postgres' | 'mysql';
  host?: string;
  port?: number;
  database: string;
  username?: string;
  password?: string;
  filename?: string;
  ssl?: boolean;
  pool?: {
    min: number;
    max: number;
  };
}

export interface ProviderConfig {
  tmdb?: {
    apiKey?: string | undefined;
    baseUrl: string;
    rateLimit: number;
    rateLimitWindow: number;
    language?: string;
    includeAdult?: boolean;
  };
  tvdb?: {
    apiKey?: string | undefined;
    baseUrl: string;
    rateLimit: number;
    rateLimitWindow: number;
  };
  fanart_tv?: {
    apiKey?: string | undefined;
    baseUrl: string;
    rateLimit: number;
    rateLimitWindow: number;
  };
  omdb?: {
    apiKey?: string | undefined;
    baseUrl: string;
    rateLimit: number;
    rateLimitWindow: number;
  };
  hdtrailers?: {
    baseUrl: string;
    rateLimit: number;
    rateLimitWindow: number;
  };
}

export interface MediaPlayerConfig {
  kodi?: {
    host?: string | undefined;
    port?: number;
    username?: string | undefined;
    password?: string | undefined;
    libraryPaths?: string[];
  };
  jellyfin?: {
    host?: string | undefined;
    port?: number;
    apiKey?: string | undefined;
    libraryPaths?: string[];
  };
  plex?: {
    host?: string | undefined;
    port?: number;
    token?: string | undefined;
    libraryPaths?: string[];
  };
}

export interface LoggingConfig {
  level: 'error' | 'warn' | 'info' | 'debug';
  file: {
    enabled: boolean;
    path: string;
    maxSize: string;
    maxFiles: number;
  };
  console: {
    enabled: boolean;
    colorize: boolean;
  };
}

export interface JobConfig {
  maxAttempts: number;
  retryDelays: number[]; // milliseconds
  batchSize: number;
  processingTimeout: number; // milliseconds
}

export interface EnrichmentConfig {
  checkForChanges: boolean; // Use TMDB changes API to avoid unnecessary re-scraping
  staleDataThresholdDays: number; // Days before data is considered stale (always check changes)
  forceRescrapeAfterDays: number; // Days before forcing a full re-scrape regardless of changes
  enableChangeDetection: boolean; // Master switch for change detection optimization
}

export interface AppConfig {
  server: ServerConfig;
  database: DatabaseConfig;
  providers: ProviderConfig;
  mediaPlayers: MediaPlayerConfig;
  logging: LoggingConfig;
  jobs: JobConfig;
  enrichment: EnrichmentConfig;
}
