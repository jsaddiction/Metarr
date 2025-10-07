import { SqliteConnection } from './src/database/connections/SqliteConnection';

async function verifySchema() {
  const conn = new SqliteConnection({
    type: 'sqlite3',
    filename: './data/metarr.sqlite'
  });

  await conn.connect();

  console.log('=== MOVIES TABLE SCHEMA ===');
  const schema = await conn.query('PRAGMA table_info(movies)');

  if (Array.isArray(schema) && schema.length > 0) {
    console.log(`Total columns: ${schema.length}\n`);
    schema.forEach((col: any) => {
      console.log(`  ${col.name.padEnd(30)} ${col.type}`);
    });

    const hasDeletedOn = schema.some((col: any) => col.name === 'deleted_on');
    console.log(`\n✓ Has deleted_on column: ${hasDeletedOn ? 'YES' : 'NO'}`);
  } else {
    console.log('No columns found or table does not exist');
  }

  console.log('\n=== ALL TABLES ===');
  const tables = await conn.query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  if (Array.isArray(tables)) {
    console.log(`Total tables: ${tables.length}\n`);
    tables.forEach((t: any) => console.log(`  - ${t.name}`));
  }

  console.log('\n=== MIGRATIONS ===');
  const migrations = await conn.query('SELECT version, name, executed_at FROM migrations ORDER BY executed_at');
  if (Array.isArray(migrations)) {
    migrations.forEach((m: any) => console.log(`  ✓ ${m.version} - ${m.name} (${m.executed_at})`));
  }
}

verifySchema().catch(console.error).finally(() => process.exit(0));
