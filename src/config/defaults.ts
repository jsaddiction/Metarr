import { AppConfig } from './types.js';

export const defaultConfig: AppConfig = {
  server: {
    port: 3000,
    host: '0.0.0.0',
    env: 'development',
  },
  database: {
    type: 'sqlite3',
    database: 'metarr',
    filename: './data/metarr.sqlite',
    pool: {
      min: 2,
      max: 10,
    },
  },
  providers: {
    tmdb: {
      baseUrl: 'https://api.themoviedb.org/3',
      rateLimit: 40,
      rateLimitWindow: 10, // 40 requests per 10 seconds
      language: 'en-US',
      includeAdult: false,
    },
    tvdb: {
      baseUrl: 'https://api4.thetvdb.com/v4',
      rateLimit: 30,
      rateLimitWindow: 10, // 30 requests per 10 seconds
    },
    fanart_tv: {
      baseUrl: 'https://webservice.fanart.tv/v3',
      rateLimit: 10,
      rateLimitWindow: 1, // 10 requests per second (20 with personal key)
    },
    imdb: {
      baseUrl: 'https://imdb-api.com/en/API',
      rateLimit: 100,
      rateLimitWindow: 60, // 100 requests per minute
    },
    hdtrailers: {
      baseUrl: 'https://www.hdtrailers.net',
      rateLimit: 30,
      rateLimitWindow: 60, // 30 requests per minute
    },
  },
  mediaPlayers: {
    kodi: {
      port: 8080,
      libraryPaths: [],
    },
    jellyfin: {
      port: 8096,
      libraryPaths: [],
    },
    plex: {
      port: 32400,
      libraryPaths: [],
    },
  },
  logging: {
    level: 'info',
    file: {
      enabled: true,
      path: './logs',
      maxSize: '10m',
      maxFiles: 5,
    },
    console: {
      enabled: true,
      colorize: true,
    },
  },
  jobs: {
    maxAttempts: 3,
    retryDelays: [1000, 5000, 30000], // 1s, 5s, 30s
    batchSize: 10,
    processingTimeout: 300000, // 5 minutes
  },
  enrichment: {
    checkForChanges: true, // Use TMDB changes API
    staleDataThresholdDays: 7, // Check for changes if data is less than 7 days old
    forceRescrapeAfterDays: 30, // Force re-scrape after 30 days regardless
    enableChangeDetection: true, // Master switch
  },
};
