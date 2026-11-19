const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH ||
    path.join(__dirname, 'database.sqlite');

// Crée le dossier de la base s'il n'existe pas
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

// Ouvre ou crée la base SQLite
const db = new Database(dbPath);

// Active les clés étrangères
db.pragma('foreign_keys = ON');

// Crée les tables si elles n'existent pas
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