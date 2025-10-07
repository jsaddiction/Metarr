import Database from 'better-sqlite3';

const db = new Database('datametarr.sqlite');

const schema = db.prepare("PRAGMA table_info(movies)").all();
console.log('Movies table schema:');
console.log(JSON.stringify(schema, null, 2));

db.close();
