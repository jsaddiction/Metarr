import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { DatabaseConfig, DatabaseConnection, SqlParam } from '../../types/database.js';
import {
  DatabaseError,
  DuplicateKeyError,
  ForeignKeyViolationError,
  FileSystemError,
  ErrorCode,
} from '../../errors/index.js';

export class SqliteConnection implements DatabaseConnection {
  private db: sqlite3.Database | null = null;
  private config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const dbPath = this.config.filename || './data/metarr.sqlite';

      // Ensure directory exists
      const dir = path.dirname(dbPath);
      try {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      } catch (err) {
        reject(new FileSystemError(
          `Failed to create database directory: ${dir}`,
          ErrorCode.FS_PERMISSION_DENIED,
          dir,
          false,
          { service: 'SqliteConnection', operation: 'connect' },
          err instanceof Error ? err : undefined
        ));
        return;
      }

      this.db = new sqlite3.Database(dbPath, err => {
        if (err) {
          reject(new DatabaseError(
            `Failed to connect to SQLite database: ${err.message}`,
            ErrorCode.DATABASE_CONNECTION_FAILED,
            true,
            {
              service: 'SqliteConnection',
              operation: 'connect',
              metadata: { dbPath },
            },
            err
          ));
        } else {
          // Enable foreign keys
          this.db!.run('PRAGMA foreign_keys = ON');
          resolve();
        }
      });
    });
  }

  async query<T = any>(sql: string, params: SqlParam[] = []): Promise<T[]> {
    if (!this.db) {
      throw new DatabaseError(
        'Database not connected',
        ErrorCode.DATABASE_CONNECTION_FAILED,
        false,
        { service: 'SqliteConnection', operation: 'query' }
      );
    }

    return new Promise((resolve, reject) => {
      this.db!.all(sql, params, (err, rows) => {
        if (err) {
          reject(this.convertDatabaseError(err, sql, 'query'));
        } else {
          resolve(rows as T[]);
        }
      });
    });
  }

  async get<T = any>(sql: string, params: SqlParam[] = []): Promise<T | undefined> {
    if (!this.db) {
      throw new DatabaseError(
        'Database not connected',
        ErrorCode.DATABASE_CONNECTION_FAILED,
        false,
        { service: 'SqliteConnection', operation: 'get' }
      );
    }

    return new Promise((resolve, reject) => {
      this.db!.get(sql, params, (err, row) => {
        if (err) {
          reject(this.convertDatabaseError(err, sql, 'get'));
        } else {
          resolve(row as T | undefined);
        }
      });
    });
  }

  async execute(
    sql: string,
    params: SqlParam[] = []
  ): Promise<{ affectedRows: number; insertId?: number }> {
    if (!this.db) {
      throw new DatabaseError(
        'Database not connected',
        ErrorCode.DATABASE_CONNECTION_FAILED,
        false,
        { service: 'SqliteConnection', operation: 'execute' }
      );
    }

    return new Promise((resolve, reject) => {
      // Store reference to class instance for error conversion
      const self = this;
      this.db!.run(sql, params, function (err) {
        if (err) {
          reject(self.convertDatabaseError(err, sql, 'execute'));
        } else {
          // 'this' refers to the statement context, providing changes and lastID
          resolve({
            affectedRows: this.changes,
            insertId: this.lastID,
          });
        }
      });
    });
  }

  async close(): Promise<void> {
    if (!this.db) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.db!.close(err => {
        if (err) {
          reject(new DatabaseError(
            `Failed to close database: ${err.message}`,
            ErrorCode.DATABASE_CONNECTION_FAILED,
            false,
            { service: 'SqliteConnection', operation: 'close' },
            err
          ));
        } else {
          this.db = null;
          resolve();
        }
      });
    });
  }

  async beginTransaction(): Promise<void> {
    await this.execute('BEGIN TRANSACTION');
  }

  async commit(): Promise<void> {
    await this.execute('COMMIT');
  }

  async rollback(): Promise<void> {
    await this.execute('ROLLBACK');
  }

  /**
   * Convert SQLite errors to ApplicationError types
   */
  private convertDatabaseError(
    error: Error,
    sql: string,
    operation: string
  ): Error {
    const errorMessage = error.message.toLowerCase();
    const context = {
      service: 'SqliteConnection',
      operation,
      metadata: { sql, sqliteError: error.message },
    };

    // UNIQUE constraint violation
    if (errorMessage.includes('unique constraint')) {
      const match = errorMessage.match(/unique constraint failed: (\w+)\.(\w+)/i);
      return new DuplicateKeyError(
        match ? match[1] : 'unknown', // table
        match ? match[2] : 'unknown', // key
        error.message,
        context
      );
    }

    // FOREIGN KEY constraint violation
    if (errorMessage.includes('foreign key constraint')) {
      return new ForeignKeyViolationError(
        'unknown', // table - SQLite doesn't provide this in error
        'foreign_key', // constraint name
        error.message,
        context
      );
    }

    // Generic database error
    return new DatabaseError(
      `Database ${operation} failed: ${error.message}`,
      ErrorCode.DATABASE_QUERY_FAILED,
      true, // Most SQLite errors are retryable
      context,
      error
    );
  }
}
