import Database from 'better-sqlite3';

async function verifySchema() {
  const db = new Database('./data/metarr.sqlite');

  console.log('\n✅ Verifying Phase 1 tables exist...\n');

  const tables = [
    'asset_candidates',
    'cache_inventory',
    'publish_log',
    'job_queue',
    'library_automation_config',
    'asset_selection_config',
    'completeness_config',
    'rejected_assets',
    'unknown_files'
  ];

  for (const table of tables) {
    const result = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table);
    if (result) {
      console.log(`✓ ${table}`);
    } else {
      console.log(`✗ ${table} - MISSING!`);
    }
  }

  console.log('\n✅ Verifying new columns on movies table...\n');

  const movieColumns = db.prepare(`PRAGMA table_info(movies)`).all();
  const newColumns = ['state', 'enriched_at', 'enrichment_priority', 'has_unpublished_changes', 'last_published_at', 'published_nfo_hash', 'poster_locked', 'fanart_locked'];

  for (const col of newColumns) {
    const exists = movieColumns.find(c => c.name === col);
    if (exists) {
      console.log(`✓ movies.${col}`);
    } else {
      console.log(`✗ movies.${col} - MISSING!`);
    }
  }

  console.log('\n✅ Verifying triggers...\n');

  const triggers = db.prepare(`SELECT name FROM sqlite_master WHERE type='trigger'`).all();
  console.log(`Found ${triggers.length} trigger(s):`);
  triggers.forEach(t => console.log(`  - ${t.name}`));

  db.close();
  console.log('\n✅ Schema verification complete!\n');
}

verifySchema().catch(console.error);
