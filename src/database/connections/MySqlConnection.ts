import mysql from 'mysql2/promise';
import { DatabaseConfig, DatabaseConnection, SqlParam } from '../../types/database.js';
import {
  DatabaseError,
  DuplicateKeyError,
  ForeignKeyViolationError,
  ErrorCode,
} from '../../errors/index.js';

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
      throw new DatabaseError(
        `Failed to connect to MySQL database: ${error instanceof Error ? error.message : String(error)}`,
        ErrorCode.DATABASE_CONNECTION_FAILED,
        true,
        {
          service: 'MySqlConnection',
          operation: 'connect',
          metadata: {
            host: this.config.host,
            database: this.config.database,
          },
        },
        error instanceof Error ? error : undefined
      );
    }
  }

  async query<T = any>(sql: string, params: SqlParam[] = []): Promise<T[]> {
    if (!this.pool) {
      throw new DatabaseError(
        'Database not connected',
        ErrorCode.DATABASE_CONNECTION_FAILED,
        false,
        { service: 'MySqlConnection', operation: 'query' }
      );
    }

    try {
      const [rows] = await this.pool.execute(sql, params);
      return rows as T[];
    } catch (error) {
      throw this.convertDatabaseError(error as Error, sql, 'query');
    }
  }

  async get<T = any>(sql: string, params: SqlParam[] = []): Promise<T | undefined> {
    if (!this.pool) {
      throw new DatabaseError(
        'Database not connected',
        ErrorCode.DATABASE_CONNECTION_FAILED,
        false,
        { service: 'MySqlConnection', operation: 'get' }
      );
    }

    try {
      const [rows] = await this.pool.execute(sql, params);
      const rowArray = rows as T[];
      return rowArray[0];
    } catch (error) {
      throw this.convertDatabaseError(error as Error, sql, 'get');
    }
  }

  async execute(
    sql: string,
    params: SqlParam[] = []
  ): Promise<{ affectedRows: number; insertId?: number }> {
    if (!this.pool) {
      throw new DatabaseError(
        'Database not connected',
        ErrorCode.DATABASE_CONNECTION_FAILED,
        false,
        { service: 'MySqlConnection', operation: 'execute' }
      );
    }

    try {
      const [result] = await this.pool.execute(sql, params);
      const execResult = result as mysql.ResultSetHeader;

      return {
        affectedRows: execResult.affectedRows,
        insertId: execResult.insertId,
      };
    } catch (error) {
      throw this.convertDatabaseError(error as Error, sql, 'execute');
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
      throw new DatabaseError(
        'Database not connected',
        ErrorCode.DATABASE_CONNECTION_FAILED,
        false,
        { service: 'MySqlConnection', operation: 'beginTransaction' }
      );
    }

    if (this.connection) {
      throw new DatabaseError(
        'Transaction already in progress',
        ErrorCode.DATABASE_TRANSACTION_FAILED,
        false,
        { service: 'MySqlConnection', operation: 'beginTransaction' }
      );
    }

    this.connection = await this.pool.getConnection();
    await this.connection.beginTransaction();
  }

  async commit(): Promise<void> {
    if (!this.connection) {
      throw new DatabaseError(
        'No transaction in progress',
        ErrorCode.DATABASE_TRANSACTION_FAILED,
        false,
        { service: 'MySqlConnection', operation: 'commit' }
      );
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
      throw new DatabaseError(
        'No transaction in progress',
        ErrorCode.DATABASE_TRANSACTION_FAILED,
        false,
        { service: 'MySqlConnection', operation: 'rollback' }
      );
    }

    try {
      await this.connection.rollback();
    } finally {
      this.connection.release();
      this.connection = null;
    }
  }

  /**
   * Convert MySQL errors to ApplicationError types
   * MySQL error codes: https://dev.mysql.com/doc/mysql-errors/8.0/en/server-error-reference.html
   */
  private convertDatabaseError(
    error: Error,
    sql: string,
    operation: string
  ): Error {
    const mysqlError = error as any; // MySQL errors have errno and code properties
    const context = {
      service: 'MySqlConnection',
      operation,
      metadata: {
        sql,
        mysqlError: error.message,
        errno: mysqlError.errno,
        code: mysqlError.code,
      },
    };

    // Check MySQL error codes
    if (mysqlError.errno) {
      switch (mysqlError.errno) {
        case 1062: {
          // ER_DUP_ENTRY
          // Extract table and key from error message if possible
          const dupMatch = error.message.match(/Duplicate entry '.*' for key '(.+)'/);
          return new DuplicateKeyError(
            mysqlError.table || 'unknown',
            dupMatch ? dupMatch[1] : 'unknown',
            error.message,
            context
          );
        }

        case 1451: // ER_ROW_IS_REFERENCED
        case 1452: // ER_NO_REFERENCED_ROW
          return new ForeignKeyViolationError(
            mysqlError.table || 'unknown',
            'foreign_key',
            error.message,
            context
          );

        case 1048: // ER_BAD_NULL_ERROR
        case 1364: // ER_NO_DEFAULT_FOR_FIELD
        case 3819: // ER_CHECK_CONSTRAINT_VIOLATED
          return new DatabaseError(
            `Constraint violation: ${error.message}`,
            ErrorCode.DATABASE_QUERY_FAILED,
            false, // Don't retry constraint violations
            context,
            error
          );

        case 1205: // ER_LOCK_WAIT_TIMEOUT
        case 1213: // ER_LOCK_DEADLOCK
          return new DatabaseError(
            `Transaction conflict: ${error.message}`,
            ErrorCode.DATABASE_TRANSACTION_FAILED,
            true, // Retryable
            context,
            error
          );
      }
    }

    // Generic database error
    return new DatabaseError(
      `Database ${operation} failed: ${error.message}`,
      ErrorCode.DATABASE_QUERY_FAILED,
      true, // Most MySQL errors are retryable
      context,
      error
    );
  }
}
