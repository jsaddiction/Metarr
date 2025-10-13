import { DatabaseManager } from './DatabaseManager.js';
import { MigrationRunner } from './migrationRunner.js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

async function runMigrations() {
  console.log('🔧 Starting database migration...');

  // Create database configuration
  const dbConfig = {
    type: (process.env.DB_TYPE as 'sqlite3' | 'postgres' | 'mysql') || 'sqlite3',
    host: process.env.DB_HOST,
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : undefined,
    database: process.env.DB_NAME || 'metarr',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    filename: process.env.DB_FILE || path.join(process.cwd(), 'data', 'metarr.sqlite'),
  };

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
