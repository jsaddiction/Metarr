import { MediaPlayer } from '../types/models.js';
import { MediaPlayerRow } from '../types/database-models.js';
import { DatabaseManager } from '../database/DatabaseManager.js';
import { MediaPlayerConnectionManager } from './mediaPlayerConnectionManager.js';
import { logger } from '../middleware/logging.js';
import { getErrorMessage } from '../utils/errorHandling.js';
import { SqlParam } from '../types/database.js';
import { ResourceNotFoundError, DatabaseError, ErrorCode } from '../errors/index.js';

export interface CreateMediaPlayerData {
  name: string;
  type: 'kodi' | 'jellyfin' | 'plex';
  host: string;
  http_port: number;
  username?: string;
  password?: string;
  enabled: boolean;
  libraryGroup?: string;
  libraryPaths?: string[];
  config?: Record<string, unknown>;
  groupName?: string;
  isSharedMysql?: boolean;
}

export interface UpdateMediaPlayerData extends Partial<CreateMediaPlayerData> {
  id: number;
}

export class MediaPlayerService {
  constructor(
    private readonly dbManager: DatabaseManager,
    private readonly connectionManager: MediaPlayerConnectionManager
  ) {}

  /**
   * Create a new media player
   */
  async create(data: CreateMediaPlayerData): Promise<MediaPlayer> {
    const db = this.dbManager.getConnection();

    try {
      const result = await db.execute(
        `INSERT INTO media_players (
          name, type, host, http_port, username, password, enabled,
          library_group, library_paths, config,
          connection_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          data.name,
          data.type,
          data.host,
          data.http_port,
          data.username || null,
          data.password || null,
          data.enabled ? 1 : 0,
          data.libraryGroup || null,
          JSON.stringify(data.libraryPaths || []),
          JSON.stringify(data.config || {}),
          'disconnected',
        ]
      );

      const playerId = (result as { lastInsertRowid?: number }).lastInsertRowid || result.insertId;
      const player = await this.getById(playerId as number);

      if (!player) {
        throw new DatabaseError(
          'Failed to retrieve created media player',
          ErrorCode.DATABASE_QUERY_FAILED,
          false,
          { service: 'MediaPlayerService', operation: 'create', metadata: { playerId } }
        );
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
    } catch (error) {
      logger.error('Failed to create media player', { error: getErrorMessage(error) });
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
      const values: SqlParam[] = [];

      if (data.name !== undefined) {
        updates.push('name = ?');
        values.push(data.name);
      }
      if (data.host !== undefined) {
        updates.push('host = ?');
        values.push(data.host);
      }
      if (data.http_port !== undefined) {
        updates.push('http_port = ?');
        values.push(data.http_port);
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
        throw new ResourceNotFoundError(
          'mediaPlayer',
          data.id,
          'Player not found after update',
          { service: 'MediaPlayerService', operation: 'update' }
        );
      }

      // Reconnect if connection settings changed
      const needsReconnect =
        data.host !== undefined ||
        data.http_port !== undefined ||
        data.username !== undefined ||
        data.password !== undefined;

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
    } catch (error) {
      logger.error('Failed to update media player', { error: getErrorMessage(error) });
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
    } catch (error) {
      logger.error('Failed to delete media player', { error: getErrorMessage(error) });
      throw error;
    }
  }

  /**
   * Get all media players
   */
  async getAll(): Promise<MediaPlayer[]> {
    const db = this.dbManager.getConnection();

    try {
      const rows = await db.query<MediaPlayerRow>('SELECT * FROM media_players ORDER BY created_at DESC');
      return rows.map(row => this.mapRowToPlayer(row));
    } catch (error) {
      logger.error('Failed to get all media players', { error: getErrorMessage(error) });
      throw error;
    }
  }

  /**
   * Get media player by ID
   */
  async getById(id: number): Promise<MediaPlayer | null> {
    const db = this.dbManager.getConnection();

    try {
      const rows = await db.query<MediaPlayerRow>('SELECT * FROM media_players WHERE id = ?', [id]);
      return rows.length > 0 ? this.mapRowToPlayer(rows[0]) : null;
    } catch (error) {
      logger.error('Failed to get media player by ID', { error: getErrorMessage(error) });
      throw error;
    }
  }

  /**
   * Get media players by library group
   */
  async getByLibraryGroup(group: string): Promise<MediaPlayer[]> {
    const db = this.dbManager.getConnection();

    try {
      const rows = await db.query<MediaPlayerRow>(
        'SELECT * FROM media_players WHERE library_group = ? ORDER BY name',
        [group]
      );
      return rows.map(row => this.mapRowToPlayer(row));
    } catch (error) {
      logger.error('Failed to get media players by library group', { error: getErrorMessage(error) });
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
    } catch (error) {
      return { success: false, error: getErrorMessage(error) };
    }
  }

  /**
   * Manually connect a media player
   */
  async connect(id: number): Promise<void> {
    const player = await this.getById(id);
    if (!player) {
      throw new ResourceNotFoundError('player', id);
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
   * Get all media player groups (unique library_group values)
   */
  async getAllGroups(): Promise<string[]> {
    const db = this.dbManager.getConnection();
    const rows = await db.query<{ library_group: string }>(
      `SELECT DISTINCT library_group
       FROM media_players
       WHERE library_group IS NOT NULL
       ORDER BY library_group`
    );
    return rows.map(row => row.library_group);
  }

  /**
   * Get all groups with their member players
   */
  async getAllGroupsWithMembers(): Promise<{ groupName: string; members: MediaPlayer[] }[]> {
    const groups = await this.getAllGroups();
    const result = [];

    for (const groupName of groups) {
      const db = this.dbManager.getConnection();
      const rows = await db.query<MediaPlayerRow>(
        `SELECT * FROM media_players WHERE library_group = ? ORDER BY name`,
        [groupName]
      );
      const members = rows.map(row => this.mapRowToPlayer(row));
      result.push({ groupName, members });
    }

    return result;
  }

  /**
   * Map database row to MediaPlayer object
   */
  private mapRowToPlayer(row: MediaPlayerRow): MediaPlayer {
    const player: MediaPlayer = {
      id: row.id,
      name: row.name,
      type: row.type,
      host: row.host,
      http_port: row.http_port || row.port || 8080, // Support both column names with fallback
      enabled: Boolean(row.enabled),
      library_paths: JSON.parse(row.library_paths || '[]'),
      connection_status: row.connection_status || 'disconnected',
      config: JSON.parse(row.config || '{}'),
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };

    // Only add optional properties if they have values
    if (row.username) {
      player.username = row.username;
    }
    if (row.password) {
      player.password = row.password;
    }
    if (row.api_key) {
      player.api_key = row.api_key;
    }
    if (row.library_group) {
      player.library_group = row.library_group;
    }
    if (row.json_rpc_version) {
      player.json_rpc_version = row.json_rpc_version;
    }
    if (row.last_connected) {
      player.last_connected = new Date(row.last_connected);
    }
    if (row.last_error) {
      player.last_error = row.last_error;
    }
    if (row.last_sync) {
      player.last_sync = new Date(row.last_sync);
    }

    return player;
  }
}
