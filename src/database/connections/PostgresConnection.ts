import { Pool, PoolClient } from 'pg';
import { DatabaseConfig, DatabaseConnection } from '../../types/database.js';

export class PostgresConnection implements DatabaseConnection {
  private pool: Pool | null = null;
  private client: PoolClient | null = null;
  private config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    this.pool = new Pool({
      host: this.config.host || 'localhost',
      port: this.config.port || 5432,
      database: this.config.database,
      user: this.config.username,
      password: this.config.password,
      ssl: this.config.ssl || false,
      min: this.config.pool?.min || 2,
      max: this.config.pool?.max || 10,
    });

    // Test connection
    try {
      const client = await this.pool.connect();
      client.release();
    } catch (error) {
      throw new Error(`Failed to connect to PostgreSQL database: ${error}`);
    }
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    if (!this.pool) {
      throw new Error('Database not connected');
    }

    try {
      const result = await this.pool.query(sql, params);
      return result.rows as T[];
    } catch (error) {
      throw new Error(`Query failed: ${error}`);
    }
  }

  async get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    if (!this.pool) {
      throw new Error('Database not connected');
    }

    try {
      const result = await this.pool.query(sql, params);
      return result.rows[0] as T | undefined;
    } catch (error) {
      throw new Error(`Get query failed: ${error}`);
    }
  }

  async execute(
    sql: string,
    params: any[] = []
  ): Promise<{ affectedRows: number; insertId?: number }> {
    if (!this.pool) {
      throw new Error('Database not connected');
    }

    try {
      const result = await this.pool.query(sql, params);
      return {
        affectedRows: result.rowCount || 0,
        insertId: result.rows[0]?.id, // PostgreSQL doesn't have auto-increment, usually returns id
      };
    } catch (error) {
      throw new Error(`Execute failed: ${error}`);
    }
  }

  async close(): Promise<void> {
    if (this.client) {
      this.client.release();
      this.client = null;
    }
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  async beginTransaction(): Promise<void> {
    if (!this.pool) {
      throw new Error('Database not connected');
    }

    if (this.client) {
      throw new Error('Transaction already in progress');
    }

    this.client = await this.pool.connect();
    await this.client.query('BEGIN');
  }

  async commit(): Promise<void> {
    if (!this.client) {
      throw new Error('No transaction in progress');
    }

    try {
      await this.client.query('COMMIT');
    } finally {
      this.client.release();
      this.client = null;
    }
  }

  async rollback(): Promise<void> {
    if (!this.client) {
      throw new Error('No transaction in progress');
    }

    try {
      await this.client.query('ROLLBACK');
    } finally {
      this.client.release();
      this.client = null;
    }
  }
}
