import dotenv from 'dotenv';
import { AppConfig, DatabaseConfig, ServerConfig } from './types.js';
import { defaultConfig } from './defaults.js';

export class ConfigManager {
  private static instance: ConfigManager;
  private config: AppConfig;

  private constructor() {
    dotenv.config();
    this.config = this.loadConfig();
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  private loadConfig(): AppConfig {
    const config: AppConfig = JSON.parse(JSON.stringify(defaultConfig));

    // Server configuration
    config.server.port = this.getNumber('PORT', config.server.port);
    config.server.host = this.getString('HOST', config.server.host);
    config.server.env = this.getEnum('NODE_ENV', config.server.env, [
      'development',
      'production',
      'test',
    ]);

    // Database configuration
    config.database.type = this.getEnum('DB_TYPE', config.database.type, [
      'sqlite3',
      'postgres',
      'mysql',
    ]);

    if (config.database.type === 'sqlite3') {
      config.database.filename = this.getString('DB_FILE', config.database.filename!);
    } else {
      config.database.host = this.getString('DB_HOST', 'localhost');
      config.database.port = this.getNumber(
        'DB_PORT',
        config.database.type === 'postgres' ? 5432 : 3306
      );
      config.database.database = this.getString('DB_NAME', config.database.database);
      config.database.username = this.getString('DB_USER');
      config.database.password = this.getString('DB_PASSWORD');
      config.database.ssl = this.getBoolean('DB_SSL', false);
    }

    // Provider API keys (optional)
    if (config.providers.tmdb) {
      config.providers.tmdb.apiKey = process.env.TMDB_API_KEY;
    }
    if (config.providers.imdb) {
      config.providers.imdb.apiKey = process.env.IMDB_API_KEY;
    }

    // Media players configuration (optional)
    if (config.mediaPlayers.kodi) {
      config.mediaPlayers.kodi.host = process.env.KODI_HOST;
      config.mediaPlayers.kodi.port = this.getNumber('KODI_PORT', config.mediaPlayers.kodi.port);
      config.mediaPlayers.kodi.username = process.env.KODI_USERNAME;
      config.mediaPlayers.kodi.password = process.env.KODI_PASSWORD;
      config.mediaPlayers.kodi.libraryPaths = this.getStringArray(
        'KODI_LIBRARY_PATHS',
        config.mediaPlayers.kodi.libraryPaths
      );
    }

    if (config.mediaPlayers.jellyfin) {
      config.mediaPlayers.jellyfin.host = process.env.JELLYFIN_HOST;
      config.mediaPlayers.jellyfin.port = this.getNumber(
        'JELLYFIN_PORT',
        config.mediaPlayers.jellyfin.port
      );
      config.mediaPlayers.jellyfin.apiKey = process.env.JELLYFIN_API_KEY;
      config.mediaPlayers.jellyfin.libraryPaths = this.getStringArray(
        'JELLYFIN_LIBRARY_PATHS',
        config.mediaPlayers.jellyfin.libraryPaths
      );
    }

    if (config.mediaPlayers.plex) {
      config.mediaPlayers.plex.host = process.env.PLEX_HOST;
      config.mediaPlayers.plex.port = this.getNumber('PLEX_PORT', config.mediaPlayers.plex.port);
      config.mediaPlayers.plex.token = process.env.PLEX_TOKEN;
      config.mediaPlayers.plex.libraryPaths = this.getStringArray(
        'PLEX_LIBRARY_PATHS',
        config.mediaPlayers.plex.libraryPaths
      );
    }

    // Logging configuration
    config.logging.level = this.getEnum('LOG_LEVEL', config.logging.level, [
      'error',
      'warn',
      'info',
      'debug',
    ]);
    config.logging.file.enabled = this.getBoolean('LOG_FILE_ENABLED', config.logging.file.enabled);
    config.logging.file.path = this.getString('LOG_FILE_PATH', config.logging.file.path);
    config.logging.console.enabled = this.getBoolean(
      'LOG_CONSOLE_ENABLED',
      config.logging.console.enabled
    );

    return config;
  }

  private getString(key: string, defaultValue?: string): string {
    const value = process.env[key];
    if (!value && !defaultValue) {
      throw new Error(`Required environment variable ${key} is not set`);
    }
    return value || defaultValue!;
  }

  private getNumber(key: string, defaultValue?: number): number {
    const value = process.env[key];
    if (!value) {
      if (defaultValue === undefined) {
        throw new Error(`Required environment variable ${key} is not set`);
      }
      return defaultValue;
    }
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
      throw new Error(`Environment variable ${key} must be a valid number`);
    }
    return parsed;
  }

  private getBoolean(key: string, defaultValue?: boolean): boolean {
    const value = process.env[key];
    if (!value) {
      if (defaultValue === undefined) {
        throw new Error(`Required environment variable ${key} is not set`);
      }
      return defaultValue;
    }
    return value.toLowerCase() === 'true' || value === '1';
  }

  private getStringArray(key: string, defaultValue?: string[]): string[] {
    const value = process.env[key];
    if (!value) {
      return defaultValue || [];
    }
    return value
      .split(',')
      .map(item => item.trim())
      .filter(item => item.length > 0);
  }

  private getEnum<T extends string>(key: string, defaultValue: T, validValues: T[]): T {
    const value = process.env[key] as T;
    if (!value) {
      return defaultValue;
    }
    if (!validValues.includes(value)) {
      throw new Error(`Environment variable ${key} must be one of: ${validValues.join(', ')}`);
    }
    return value;
  }

  getConfig(): AppConfig {
    return this.config;
  }

  getServerConfig(): ServerConfig {
    return this.config.server;
  }

  getDatabaseConfig(): DatabaseConfig {
    return this.config.database;
  }

  reload(): void {
    dotenv.config();
    this.config = this.loadConfig();
  }

  validate(): void {
    // Validate required configurations
    const errors: string[] = [];

    // Check database configuration
    if (this.config.database.type !== 'sqlite3') {
      if (!this.config.database.username) {
        errors.push('Database username is required for PostgreSQL/MySQL');
      }
      if (!this.config.database.password) {
        errors.push('Database password is required for PostgreSQL/MySQL');
      }
    }

    // Check provider API keys if enabled
    if (this.config.providers.tmdb && !this.config.providers.tmdb.apiKey) {
      console.warn('TMDB API key not provided - TMDB provider will be disabled');
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }
  }
}
