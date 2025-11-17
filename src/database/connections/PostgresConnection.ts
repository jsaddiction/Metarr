import { Pool, PoolClient } from 'pg';
import { DatabaseConfig, DatabaseConnection, SqlParam } from '../../types/database.js';
import {
  DatabaseError,
  DuplicateKeyError,
  ForeignKeyViolationError,
  ErrorCode,
} from '../../errors/index.js';

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
      throw new DatabaseError(
        `Failed to connect to PostgreSQL database: ${error instanceof Error ? error.message : String(error)}`,
        ErrorCode.DATABASE_CONNECTION_FAILED,
        true,
        {
          service: 'PostgresConnection',
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
        { service: 'PostgresConnection', operation: 'query' }
      );
    }

    try {
      const result = await this.pool.query(sql, params);
      return result.rows as T[];
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
        { service: 'PostgresConnection', operation: 'get' }
      );
    }

    try {
      const result = await this.pool.query(sql, params);
      return result.rows[0] as T | undefined;
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
        { service: 'PostgresConnection', operation: 'execute' }
      );
    }

    try {
      const result = await this.pool.query(sql, params);
      return {
        affectedRows: result.rowCount || 0,
        insertId: result.rows[0]?.id, // PostgreSQL doesn't have auto-increment, usually returns id
      };
    } catch (error) {
      throw this.convertDatabaseError(error as Error, sql, 'execute');
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
      throw new DatabaseError(
        'Database not connected',
        ErrorCode.DATABASE_CONNECTION_FAILED,
        false,
        { service: 'PostgresConnection', operation: 'beginTransaction' }
      );
    }

    if (this.client) {
      throw new DatabaseError(
        'Transaction already in progress',
        ErrorCode.DATABASE_TRANSACTION_FAILED,
        false,
        { service: 'PostgresConnection', operation: 'beginTransaction' }
      );
    }

    this.client = await this.pool.connect();
    await this.client.query('BEGIN');
  }

  async commit(): Promise<void> {
    if (!this.client) {
      throw new DatabaseError(
        'No transaction in progress',
        ErrorCode.DATABASE_TRANSACTION_FAILED,
        false,
        { service: 'PostgresConnection', operation: 'commit' }
      );
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
      throw new DatabaseError(
        'No transaction in progress',
        ErrorCode.DATABASE_TRANSACTION_FAILED,
        false,
        { service: 'PostgresConnection', operation: 'rollback' }
      );
    }

    try {
      await this.client.query('ROLLBACK');
    } finally {
      this.client.release();
      this.client = null;
    }
  }

  /**
   * Convert PostgreSQL errors to ApplicationError types
   * PostgreSQL error codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
   */
  private convertDatabaseError(
    error: Error,
    sql: string,
    operation: string
  ): Error {
    const pgError = error as any; // PostgreSQL errors have a 'code' property
    const context = {
      service: 'PostgresConnection',
      operation,
      metadata: {
        sql,
        pgError: error.message,
        pgCode: pgError.code,
      },
    };

    // Check PostgreSQL error codes
    if (pgError.code) {
      switch (pgError.code) {
        case '23505': // unique_violation
          return new DuplicateKeyError(
            pgError.table || 'unknown',
            pgError.constraint || 'unknown',
            error.message,
            context
          );

        case '23503': // foreign_key_violation
          return new ForeignKeyViolationError(
            pgError.table || 'unknown',
            pgError.constraint || 'unknown',
            error.message,
            context
          );

        case '23502': // not_null_violation
        case '23514': // check_violation
        case '23P01': // exclusion_violation
          return new DatabaseError(
            `Constraint violation: ${error.message}`,
            ErrorCode.DATABASE_QUERY_FAILED,
            false, // Don't retry constraint violations
            context,
            error
          );

        case '40001': // serialization_failure
        case '40P01': // deadlock_detected
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
      true, // Most PostgreSQL errors are retryable
      context,
      error
    );
  }
}
