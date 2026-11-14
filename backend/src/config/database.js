const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const backendRoot = path.resolve(__dirname, '../../');
const dbRelativePath = process.env.DB_PATH || 'database/expense-tracker.db';
const dbPath = path.resolve(backendRoot, dbRelativePath);

// Ensure the directory for the database file exists
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

// Initialize SQLite database
const db = new Database(dbPath);

// Performance & data integrity pragmas
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Read and execute schema
const schemaPath = path.resolve(__dirname, '../../database/schema.sql');
if (fs.existsSync(schemaPath)) {
  const schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema);
}

module.exports = db;
