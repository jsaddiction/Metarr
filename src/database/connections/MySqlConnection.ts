import mysql from 'mysql2/promise';
import { DatabaseConfig, DatabaseConnection } from '../../types/database.js';

export class MySqlConnection implements DatabaseConnection {
  private pool: mysql.Pool | null = null;
  private connection: mysql.PoolConnection | null = null;
  private config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    const poolConfig: mysql.PoolOptions = {
      host: this.config.host || 'localhost',
      port: this.config.port || 3306,
      database: this.config.database,
      connectionLimit: this.config.pool?.max || 10,
    };

    if (this.config.username) {
      poolConfig.user = this.config.username;
    }

    if (this.config.password) {
      poolConfig.password = this.config.password;
    }

    if (this.config.ssl) {
      poolConfig.ssl = {};
    }

    this.pool = mysql.createPool(poolConfig);

    // Test connection
    try {
      const connection = await this.pool.getConnection();
      connection.release();
    } catch (error) {
      throw new Error(`Failed to connect to MySQL database: ${error}`);
    }
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    if (!this.pool) {
      throw new Error('Database not connected');
    }

    try {
      const [rows] = await this.pool.execute(sql, params);
      return rows as T[];
    } catch (error) {
      throw new Error(`Query failed: ${error}`);
    }
  }

  async get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    if (!this.pool) {
      throw new Error('Database not connected');
    }

    try {
      const [rows] = await this.pool.execute(sql, params);
      const rowArray = rows as T[];
      return rowArray[0];
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
      const [result] = await this.pool.execute(sql, params);
      const execResult = result as mysql.ResultSetHeader;

      return {
        affectedRows: execResult.affectedRows,
        insertId: execResult.insertId,
      };
    } catch (error) {
      throw new Error(`Execute failed: ${error}`);
    }
  }

  async close(): Promise<void> {
    if (this.connection) {
      this.connection.release();
      this.connection = null;
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

    if (this.connection) {
      throw new Error('Transaction already in progress');
    }

    this.connection = await this.pool.getConnection();
    await this.connection.beginTransaction();
  }

  async commit(): Promise<void> {
    if (!this.connection) {
      throw new Error('No transaction in progress');
    }

    try {
      await this.connection.commit();
    } finally {
      this.connection.release();
      this.connection = null;
    }
  }

  async rollback(): Promise<void> {
    if (!this.connection) {
      throw new Error('No transaction in progress');
    }

    try {
      await this.connection.rollback();
    } finally {
      this.connection.release();
      this.connection = null;
    }
  }
}
