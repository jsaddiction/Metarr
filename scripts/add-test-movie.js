/**
 * Add test movie data to the database
 * This script adds a sample movie with external IDs for testing provider scraping
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'data', 'metarr.sqlite');
console.log(`Opening database: ${dbPath}`);

const db = new Database(dbPath);

try {
  // Check if library exists, create if not
  const library = db.prepare('SELECT * FROM libraries WHERE id = ?').get(1);

  if (!library) {
    console.log('Creating test library...');
    db.prepare(`
      INSERT INTO libraries (id, name, path, media_type, enabled)
      VALUES (?, ?, ?, ?, ?)
    `).run(1, 'Test Movies', 'C:\\movies', 'movies', 1);
    console.log('✓ Library created');
  } else {
    console.log('✓ Library already exists');
  }

  // Check if movie exists
  const existingMovie = db.prepare('SELECT * FROM movies WHERE id = ?').get(1);

  if (existingMovie) {
    console.log('Movie already exists, updating...');
    db.prepare(`
      UPDATE movies
      SET title = ?, year = ?, tmdb_id = ?, imdb_id = ?
      WHERE id = ?
    `).run('21 Bridges', 2019, 507569, 'tt1711192', 1);
    console.log('✓ Movie updated');
  } else {
    console.log('Creating test movie...');
    db.prepare(`
      INSERT INTO movies (
        id, library_id, file_path, title, year, tmdb_id, imdb_id,
        plot, tagline, user_rating, mpaa
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      1,
      1,
      'C:\\movies\\21 Bridges\\21 Bridges (2019).mkv',
      '21 Bridges',
      2019,
      507569,
      'tt1711192',
      'An embattled NYPD detective is thrust into a citywide manhunt for a pair of cop killers after uncovering a massive and unexpected conspiracy.',
      'The only way out is through him',
      6.6,
      'R'
    );
    console.log('✓ Movie created');
  }

  // Verify the data
  const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(1);
  console.log('\nMovie data:');
  console.log('  ID:', movie.id);
  console.log('  Title:', movie.title);
  console.log('  Year:', movie.year);
  console.log('  TMDB ID:', movie.tmdb_id);
  console.log('  IMDb ID:', movie.imdb_id);
  console.log('\n✓ Test movie ready for provider scraping!');

} catch (error) {
  console.error('Error:', error);
  process.exit(1);
} finally {
  db.close();
}
