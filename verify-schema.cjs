const sqlite3 = require('sqlite3').verbose();

function verifySchema() {
  const db = new sqlite3.Database('./data/metarr.sqlite', (err) => {
    if (err) {
      console.error('Error opening database:', err.message);
      process.exit(1);
    }
  });

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

  let tableIndex = 0;
  function checkTable() {
    if (tableIndex >= tables.length) {
      checkMovieColumns();
      return;
    }

    const table = tables[tableIndex];
    db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [table], (err, result) => {
      if (err) {
        console.error(`Error checking ${table}:`, err.message);
      } else if (result) {
        console.log(`✓ ${table}`);
      } else {
        console.log(`✗ ${table} - MISSING!`);
      }
      tableIndex++;
      checkTable();
    });
  }

  function checkMovieColumns() {
    console.log('\n✅ Verifying new columns on movies table...\n');

    db.all(`PRAGMA table_info(movies)`, (err, movieColumns) => {
      if (err) {
        console.error('Error checking movie columns:', err.message);
        db.close();
        return;
      }

      const newColumns = [
        'state', 'enriched_at', 'enrichment_priority',
        'has_unpublished_changes', 'last_published_at', 'published_nfo_hash',
        'poster_locked', 'fanart_locked'
      ];

      for (const col of newColumns) {
        const exists = movieColumns.find(c => c.name === col);
        if (exists) {
          console.log(`✓ movies.${col}`);
        } else {
          console.log(`✗ movies.${col} - MISSING!`);
        }
      }

      checkTriggers();
    });
  }

  function checkTriggers() {
    console.log('\n✅ Verifying triggers...\n');

    db.all(`SELECT name FROM sqlite_master WHERE type='trigger'`, (err, triggers) => {
      if (err) {
        console.error('Error checking triggers:', err.message);
      } else {
        console.log(`Found ${triggers.length} trigger(s):`);
        triggers.forEach(t => console.log(`  - ${t.name}`));
      }

      db.close((err) => {
        if (err) {
          console.error('Error closing database:', err.message);
        }
        console.log('\n✅ Schema verification complete!\n');
      });
    });
  }

  checkTable();
}

verifySchema();
