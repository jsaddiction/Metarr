import { DatabaseConnection } from '../types/database.js';
import { InitialSchemaMigration } from './migrations/20251003_001_initial_schema.js';

interface MigrationRecord {
  version: string;
  name: string;
  executed_at: Date;
}

export class MigrationRunner {
  private db: DatabaseConnection;
  private migrations: Array<{
    version: string;
    name: string;
    up: (db: DatabaseConnection) => Promise<void>;
    down: (db: DatabaseConnection) => Promise<void>;
  }>;

  constructor(db: DatabaseConnection) {
    this.db = db;
    this.migrations = [
      {
        version: InitialSchemaMigration.version,
        name: InitialSchemaMigration.migrationName,
        up: InitialSchemaMigration.up,
        down: InitialSchemaMigration.down,
      },
    ];
  }

  async ensureMigrationTable(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS migrations (
        version VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        executed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  async getExecutedMigrations(): Promise<string[]> {
    try {
      const results = await this.db.query<MigrationRecord>(
        'SELECT version FROM migrations ORDER BY version'
      );
      return results.map(row => row.version);
    } catch (error) {
      // Table might not exist yet
      return [];
    }
  }

  async migrate(): Promise<void> {
    await this.ensureMigrationTable();
    const executedMigrations = await this.getExecutedMigrations();

    for (const migration of this.migrations) {
      if (!executedMigrations.includes(migration.version)) {
        console.log(`Running migration: ${migration.version} - ${migration.name}`);

        try {
          await this.db.beginTransaction();
          await migration.up(this.db);
          await this.db.execute('INSERT INTO migrations (version, name) VALUES (?, ?)', [
            migration.version,
            migration.name,
          ]);
          await this.db.commit();

          console.log(`Migration completed: ${migration.version}`);
        } catch (error) {
          await this.db.rollback();
          throw new Error(`Migration failed: ${migration.version} - ${error}`);
        }
      }
    }
  }

  async rollback(targetVersion?: string): Promise<void> {
    await this.ensureMigrationTable();
    const executedMigrations = await this.getExecutedMigrations();

    // Find migrations to rollback (in reverse order)
    const migrationsToRollback = this.migrations
      .filter(migration => executedMigrations.includes(migration.version))
      .reverse();

    for (const migration of migrationsToRollback) {
      if (targetVersion && migration.version <= targetVersion) {
        break;
      }

      console.log(`Rolling back migration: ${migration.version} - ${migration.name}`);

      try {
        await this.db.beginTransaction();
        await migration.down(this.db);
        await this.db.execute('DELETE FROM migrations WHERE version = ?', [migration.version]);
        await this.db.commit();

        console.log(`Rollback completed: ${migration.version}`);
      } catch (error) {
        await this.db.rollback();
        throw new Error(`Rollback failed: ${migration.version} - ${error}`);
      }
    }
  }

  async status(): Promise<Array<{ version: string; name: string; executed: boolean }>> {
    await this.ensureMigrationTable();
    const executedMigrations = await this.getExecutedMigrations();

    return this.migrations.map(migration => ({
      version: migration.version,
      name: migration.name,
      executed: executedMigrations.includes(migration.version),
    }));
  }
}
