const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH ||
    path.join(__dirname, 'database.sqlite');

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

db.pragma('foreign_keys = ON');

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS badges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid_hash TEXT NOT NULL UNIQUE,
        user_id INTEGER NOT NULL UNIQUE,
        FOREIGN KEY (user_id) REFERENCES users(id)
            ON DELETE CASCADE
    );
`);

module.exports = db;