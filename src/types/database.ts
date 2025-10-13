export type DatabaseType = 'sqlite3' | 'postgres' | 'mysql';

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
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  get<T = any>(sql: string, params?: any[]): Promise<T | undefined>;
  execute(sql: string, params?: any[]): Promise<{ affectedRows: number; insertId?: number }>;
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

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
  insertId?: number;
}
