import { MediaPlayer } from '../types/models.js';
import { DatabaseManager } from '../database/DatabaseManager.js';
import { MediaPlayerConnectionManager } from './mediaPlayerConnectionManager.js';
import { logger } from '../middleware/logging.js';

export interface CreateMediaPlayerData {
  name: string;
  type: 'kodi' | 'jellyfin' | 'plex';
  host: string;
  port: number;
  username?: string;
  password?: string;
  enabled: boolean;
  libraryGroup?: string;
  useWebsocket?: boolean;
  libraryPaths?: string[];
  config?: Record<string, any>;
}

export interface UpdateMediaPlayerData extends Partial<CreateMediaPlayerData> {
  id: number;
}

export class MediaPlayerService {
  private dbManager: DatabaseManager;
  private connectionManager: MediaPlayerConnectionManager;

  constructor(dbManager: DatabaseManager, connectionManager: MediaPlayerConnectionManager) {
    this.dbManager = dbManager;
    this.connectionManager = connectionManager;
  }

  /**
   * Create a new media player
   */
  async create(data: CreateMediaPlayerData): Promise<MediaPlayer> {
    const db = this.dbManager.getConnection();

    try {
      const result = await db.execute(
        `INSERT INTO media_players (
          name, type, host, port, username, password, enabled,
          library_group, use_websocket, library_paths, config,
          connection_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          data.name,
          data.type,
          data.host,
          data.port,
          data.username || null,
          data.password || null,
          data.enabled ? 1 : 0,
          data.libraryGroup || null,
          data.useWebsocket !== false ? 1 : 0,
          JSON.stringify(data.libraryPaths || []),
          JSON.stringify(data.config || {}),
          'disconnected',
        ]
      );

      const playerId = (result as any).lastInsertRowid || result.insertId;
      const player = await this.getById(playerId as number);

      if (!player) {
        throw new Error('Failed to retrieve created media player');
      }

      // Auto-connect if enabled
      if (player.enabled) {
        try {
          await this.connectionManager.connectPlayer(player);
        } catch (error) {
          logger.error(`Failed to auto-connect player ${playerId}`, { error });
        }
      }

      return player;
    } catch (error: any) {
      logger.error('Failed to create media player', { error: error.message });
      throw error;
    }
  }

  /**
   * Update an existing media player
   */
  async update(data: UpdateMediaPlayerData): Promise<MediaPlayer> {
    const db = this.dbManager.getConnection();

    try {
      const updates: string[] = [];
      const values: any[] = [];

      if (data.name !== undefined) {
        updates.push('name = ?');
        values.push(data.name);
      }
      if (data.host !== undefined) {
        updates.push('host = ?');
        values.push(data.host);
      }
      if (data.port !== undefined) {
        updates.push('port = ?');
        values.push(data.port);
      }
      if (data.username !== undefined) {
        updates.push('username = ?');
        values.push(data.username);
      }
      if (data.password !== undefined) {
        updates.push('password = ?');
        values.push(data.password);
      }
      if (data.enabled !== undefined) {
        updates.push('enabled = ?');
        values.push(data.enabled ? 1 : 0);
      }
      if (data.libraryGroup !== undefined) {
        updates.push('library_group = ?');
        values.push(data.libraryGroup);
      }
      if (data.useWebsocket !== undefined) {
        updates.push('use_websocket = ?');
        values.push(data.useWebsocket ? 1 : 0);
      }
      if (data.libraryPaths !== undefined) {
        updates.push('library_paths = ?');
        values.push(JSON.stringify(data.libraryPaths));
      }
      if (data.config !== undefined) {
        updates.push('config = ?');
        values.push(JSON.stringify(data.config));
      }

      updates.push('updated_at = CURRENT_TIMESTAMP');
      values.push(data.id);

      await db.execute(`UPDATE media_players SET ${updates.join(', ')} WHERE id = ?`, values);

      const player = await this.getById(data.id);
      if (!player) {
        throw new Error('Player not found after update');
      }

      // Reconnect if connection settings changed
      const needsReconnect =
        data.host !== undefined ||
        data.port !== undefined ||
        data.username !== undefined ||
        data.password !== undefined ||
        data.useWebsocket !== undefined;

      if (needsReconnect) {
        try {
          await this.connectionManager.disconnectPlayer(data.id);
          if (player.enabled) {
            await this.connectionManager.connectPlayer(player);
          }
        } catch (error) {
          logger.error(`Failed to reconnect player ${data.id}`, { error });
        }
      } else if (data.enabled !== undefined) {
        // Handle enable/disable without reconnecting
        if (player.enabled) {
          await this.connectionManager.connectPlayer(player);
        } else {
          await this.connectionManager.disconnectPlayer(data.id);
        }
      }

      return player;
    } catch (error: any) {
      logger.error('Failed to update media player', { error: error.message });
      throw error;
    }
  }

  /**
   * Delete a media player
   */
  async delete(id: number): Promise<void> {
    const db = this.dbManager.getConnection();

    try {
      // Disconnect before deleting
      await this.connectionManager.disconnectPlayer(id);

      await db.execute('DELETE FROM media_players WHERE id = ?', [id]);
      logger.info(`Deleted media player ${id}`);
    } catch (error: any) {
      logger.error('Failed to delete media player', { error: error.message });
      throw error;
    }
  }

  /**
   * Get all media players
   */
  async getAll(): Promise<MediaPlayer[]> {
    const db = this.dbManager.getConnection();

    try {
      const result = await db.query('SELECT * FROM media_players ORDER BY created_at DESC');
      const rows = Array.isArray(result) ? result : (result as any).rows || [];
      return rows.map(this.mapRowToPlayer);
    } catch (error: any) {
      logger.error('Failed to get all media players', { error: error.message });
      throw error;
    }
  }

  /**
   * Get media player by ID
   */
  async getById(id: number): Promise<MediaPlayer | null> {
    const db = this.dbManager.getConnection();

    try {
      const result = await db.query('SELECT * FROM media_players WHERE id = ?', [id]);
      const rows = Array.isArray(result) ? result : (result as any).rows || [];
      return rows.length > 0 ? this.mapRowToPlayer(rows[0]) : null;
    } catch (error: any) {
      logger.error('Failed to get media player by ID', { error: error.message });
      throw error;
    }
  }

  /**
   * Get media players by library group
   */
  async getByLibraryGroup(group: string): Promise<MediaPlayer[]> {
    const db = this.dbManager.getConnection();

    try {
      const result = await db.query(
        'SELECT * FROM media_players WHERE library_group = ? ORDER BY name',
        [group]
      );
      const rows = Array.isArray(result) ? result : (result as any).rows || [];
      return rows.map(this.mapRowToPlayer);
    } catch (error: any) {
      logger.error('Failed to get media players by library group', { error: error.message });
      throw error;
    }
  }

  /**
   * Test connection to a media player
   */
  async testConnection(
    id: number
  ): Promise<{ success: boolean; version?: string; error?: string }> {
    try {
      const player = await this.getById(id);
      if (!player) {
        return { success: false, error: 'Player not found' };
      }

      return await this.connectionManager.testConnection(player);
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Manually connect a media player
   */
  async connect(id: number): Promise<void> {
    const player = await this.getById(id);
    if (!player) {
      throw new Error('Player not found');
    }

    await this.connectionManager.connectPlayer(player);
  }

  /**
   * Manually disconnect a media player
   */
  async disconnect(id: number): Promise<void> {
    await this.connectionManager.disconnectPlayer(id);
  }

  /**
   * Map database row to MediaPlayer object
   */
  private mapRowToPlayer(row: any): MediaPlayer {
    const player: MediaPlayer = {
      id: row.id,
      name: row.name,
      type: row.type,
      host: row.host,
      port: row.port,
      username: row.username,
      password: row.password,
      apiKey: row.api_key,
      enabled: Boolean(row.enabled),
      libraryPaths: JSON.parse(row.library_paths || '[]'),
      libraryGroup: row.library_group,
      connectionStatus: row.connection_status || 'disconnected',
      jsonRpcVersion: row.json_rpc_version,
      useWebsocket: Boolean(row.use_websocket),
      config: JSON.parse(row.config || '{}'),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };

    if (row.last_connected) {
      player.lastConnected = new Date(row.last_connected);
    }

    if (row.last_error) {
      player.lastError = row.last_error;
    }

    if (row.last_sync) {
      player.lastSync = new Date(row.last_sync);
    }

    return player;
  }
}
