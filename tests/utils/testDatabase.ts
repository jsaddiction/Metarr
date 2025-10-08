import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { DatabaseConnection } from '../../src/types/database.js';
import { InitialSchemaMigration } from '../../src/database/migrations/20251003_001_initial_schema.js';

/**
 * Test Database Utilities
 *
 * Provides utilities for creating and managing test databases:
 * - In-memory SQLite database for fast tests
 * - Schema migration
 * - Cleanup between tests
 */

export class TestDatabase {
  private db: Database | null = null;
  private connection: DatabaseConnection | null = null;

  /**
   * Create a new in-memory test database with full schema
   */
  async create(): Promise<DatabaseConnection> {
    // Create in-memory database
    this.db = await open({
      filename: ':memory:',
      driver: sqlite3.Database
    });

    // Create connection wrapper
    this.connection = {
      query: async <T = any>(sql: string, params?: any[]): Promise<T[]> => {
        const result = await this.db!.all(sql, params);
        return result as T[];
      },

      execute: async (sql: string, params?: any[]): Promise<{ affectedRows: number; insertId?: number }> => {
        const result = await this.db!.run(sql, params);
        const response: { affectedRows: number; insertId?: number } = {
          affectedRows: result.changes || 0
        };
        if (result.lastID !== undefined) {
          response.insertId = result.lastID;
        }
        return response;
      },

      close: async (): Promise<void> => {
        if (this.db) {
          await this.db.close();
          this.db = null;
        }
      },

      beginTransaction: async (): Promise<void> => {
        await this.db!.exec('BEGIN TRANSACTION');
      },

      commit: async (): Promise<void> => {
        await this.db!.exec('COMMIT');
      },

      rollback: async (): Promise<void> => {
        await this.db!.exec('ROLLBACK');
      }
    };

    // Run migrations
    await InitialSchemaMigration.up(this.connection);

    return this.connection;
  }

  /**
   * Close and destroy the test database
   */
  async destroy(): Promise<void> {
    if (this.connection) {
      await this.connection.close();
      this.connection = null;
    }
  }

  /**
   * Clear all data from tables (but keep schema)
   */
  async clear(): Promise<void> {
    if (!this.connection) {
      throw new Error('Database not created');
    }

    // Get all table names
    const tables = await this.connection.query<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
    );

    // Disable foreign keys temporarily
    await this.connection.execute('PRAGMA foreign_keys = OFF');

    // Clear all tables
    for (const table of tables) {
      await this.connection.execute(`DELETE FROM ${table.name}`);
    }

    // Re-enable foreign keys
    await this.connection.execute('PRAGMA foreign_keys = ON');
  }

  /**
   * Insert test data
   */
  async seed(data: {
    movies?: Array<{ title: string; year?: number; tmdb_id?: number; imdb_id?: string; library_id?: number }>;
    libraries?: Array<{ name: string; type: string; path: string }>;
    assetCandidates?: Array<{ entity_type: string; entity_id: number; asset_type: string; provider: string; provider_url: string }>;
  }): Promise<void> {
    if (!this.connection) {
      throw new Error('Database not created');
    }

    // Seed libraries first (must exist before movies due to foreign key)
    if (data.libraries) {
      for (const library of data.libraries) {
        await this.connection.execute(
          `INSERT INTO libraries (name, type, path, enabled)
           VALUES (?, ?, ?, 1)`,
          [library.name, library.type, library.path]
        );
      }
    }

    // Seed default library if movies are provided but no libraries
    if (data.movies && !data.libraries) {
      await this.connection.execute(
        `INSERT INTO libraries (id, name, type, path, enabled)
         VALUES (1, 'Test Library', 'movie', '/movies', 1)`
      );
    }

    // Seed movies
    if (data.movies) {
      for (const movie of data.movies) {
        const library_id = movie.library_id || 1;
        await this.connection.execute(
          `INSERT INTO movies (title, year, tmdb_id, imdb_id, library_id, file_path, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, '/movies/test', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [movie.title, movie.year, movie.tmdb_id, movie.imdb_id, library_id]
        );
      }
    }

    // Seed asset candidates
    if (data.assetCandidates) {
      for (const candidate of data.assetCandidates) {
        await this.connection.execute(
          `INSERT INTO asset_candidates (entity_type, entity_id, asset_type, provider, provider_url, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [candidate.entity_type, candidate.entity_id, candidate.asset_type, candidate.provider, candidate.provider_url]
        );
      }
    }
  }
}

/**
 * Create a test database instance
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const testDb = new TestDatabase();
  await testDb.create();
  return testDb;
}
