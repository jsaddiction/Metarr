export type DatabaseType = 'sqlite3' | 'postgres' | 'mysql';

/**
 * Valid SQL parameter types
 * Includes undefined for optional parameters
 */
export type SqlParam = string | number | boolean | null | undefined | Buffer;

export interface DatabaseConfig {
  type: DatabaseType;
  host?: string;
  port?: number;
  database: string;
  username?: string;
  password?: string;
  filename?: string; // For SQLite
  ssl?: boolean;
  pool?: {
    min: number;
    max: number;
  };
}

export interface DatabaseConnection {
  connect?(): Promise<void>;
  query<T = any>(sql: string, params?: SqlParam[]): Promise<T[]>;
  get<T = any>(sql: string, params?: SqlParam[]): Promise<T | undefined>;
  execute(sql: string, params?: SqlParam[]): Promise<{ affectedRows: number; insertId?: number }>;
  close(): Promise<void>;
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface Migration {
  version: string;
  name: string;
  up(): Promise<void>;
  down(): Promise<void>;
}

export interface MigrationInterface {
  up(db: DatabaseConnection): Promise<void>;
  down(db: DatabaseConnection): Promise<void>;
}

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
  insertId?: number;
}
