import { DatabaseManager } from './DatabaseManager.js';
import { MigrationRunner } from './MigrationRunner.js';
import { DatabaseConfig, DatabaseType } from '../types/database.js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

async function runMigrations() {
  console.log('🔧 Starting database migration...');

  // Create database configuration
  const dbConfig: DatabaseConfig = {
    type: (process.env.DB_TYPE as DatabaseType) || 'sqlite3',
    database: process.env.DB_NAME || 'metarr',
    filename: process.env.DB_FILE || path.join(process.cwd(), 'data', 'metarr.sqlite'),
  };

  // Add optional properties only if they exist (exactOptionalPropertyTypes compliance)
  if (process.env.DB_HOST) {
    dbConfig.host = process.env.DB_HOST;
  }
  if (process.env.DB_PORT) {
    dbConfig.port = parseInt(process.env.DB_PORT, 10);
  }
  if (process.env.DB_USER) {
    dbConfig.username = process.env.DB_USER;
  }
  if (process.env.DB_PASSWORD) {
    dbConfig.password = process.env.DB_PASSWORD;
  }

  console.log(`📊 Database type: ${dbConfig.type}`);
  console.log(`📁 Database location: ${dbConfig.filename || `${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`}`);

  // Initialize database manager
  const dbManager = new DatabaseManager(dbConfig);

  try {
    // Connect to database
    await dbManager.connect();
    console.log('✅ Connected to database');

    // Get database connection
    const connection = dbManager.getConnection();

    // Create migration runner
    const migrationRunner = new MigrationRunner(connection);

    // Run migrations
    await migrationRunner.migrate();
    console.log('✅ Migrations completed successfully');

    // Show migration status
    const status = await migrationRunner.status();
    console.log('\n📋 Migration Status:');
    status.forEach(migration => {
      const icon = migration.executed ? '✅' : '⏳';
      console.log(`${icon} ${migration.version} - ${migration.name}`);
    });
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await dbManager.disconnect();
    console.log('✅ Disconnected from database');
  }
}

// Run migrations
runMigrations();
