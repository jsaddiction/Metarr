import { DatabaseConfig, DatabaseConnection, DatabaseType } from '../types/database.js';
import { SqliteConnection } from './connections/SqliteConnection.js';
import { PostgresConnection } from './connections/PostgresConnection.js';
import { MySqlConnection } from './connections/MySqlConnection.js';

export class DatabaseManager {
  private connection: DatabaseConnection | null = null;
  private config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.connection) {
      return;
    }

    switch (this.config.type) {
      case 'sqlite3':
        this.connection = new SqliteConnection(this.config);
        break;
      case 'postgres':
        this.connection = new PostgresConnection(this.config);
        break;
      case 'mysql':
        this.connection = new MySqlConnection(this.config);
        break;
      default:
        throw new Error(`Unsupported database type: ${this.config.type}`);
    }

    await this.connection.connect?.();
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.close();
      this.connection = null;
    }
  }

  getConnection(): DatabaseConnection {
    if (!this.connection) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this.connection;
  }

  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    const connection = this.getConnection();
    return connection.query<T>(sql, params);
  }

  async execute(sql: string, params?: any[]): Promise<{ affectedRows: number; insertId?: number }> {
    const connection = this.getConnection();
    return connection.execute(sql, params);
  }

  async transaction<T>(callback: (connection: DatabaseConnection) => Promise<T>): Promise<T> {
    const connection = this.getConnection();

    try {
      await connection.beginTransaction();
      const result = await callback(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  }

  getDatabaseType(): DatabaseType {
    return this.config.type;
  }

  isConnected(): boolean {
    return this.connection !== null;
  }
}
