const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'tuition.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS batches (
    id INTEGER PRIMARY KEY,
    class INTEGER NOT NULL,
    division TEXT NOT NULL,
    monthly_fee INTEGER NOT NULL,
    UNIQUE (class, division)
  );

  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    roll_no TEXT,
    batch_id INTEGER NOT NULL REFERENCES batches(id),
    parent_name TEXT,
    phone TEXT,
    address TEXT,
    join_date TEXT NOT NULL,          -- YYYY-MM-DD
    fees_from TEXT NOT NULL,          -- YYYY-MM, first month dues are generated for
    monthly_fee INTEGER,              -- optional per-student override (discount)
    active INTEGER NOT NULL DEFAULT 1,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- One row per student per month. Amount is frozen when generated so later fee
  -- changes never rewrite history.
  CREATE TABLE IF NOT EXISTS fee_dues (
    id INTEGER PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    month TEXT NOT NULL,              -- YYYY-MM
    amount INTEGER NOT NULL,
    waived INTEGER NOT NULL DEFAULT 0,
    UNIQUE (student_id, month)
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY,
    receipt_no TEXT UNIQUE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL CHECK (amount > 0),
    mode TEXT NOT NULL,               -- cash | upi | bank
    paid_on TEXT NOT NULL,            -- YYYY-MM-DD
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS attendance (
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    date TEXT NOT NULL,               -- YYYY-MM-DD
    status TEXT NOT NULL CHECK (status IN ('P', 'A')),
    PRIMARY KEY (student_id, date)
  );

  CREATE INDEX IF NOT EXISTS idx_students_batch ON students(batch_id);
  CREATE INDEX IF NOT EXISTS idx_payments_student ON payments(student_id);
  CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(paid_on);
  CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
`);

// Seed the 12 batches: classes 8-10, divisions A-D.
const insertBatch = db.prepare('INSERT OR IGNORE INTO batches (class, division, monthly_fee) VALUES (?, ?, ?)');
for (const cls of [8, 9, 10]) {
  for (const div of ['A', 'B', 'C', 'D']) insertBatch.run(cls, div, 2500);
}

const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
insertSetting.run('center_name', 'My Tuition Center');
insertSetting.run('center_address', '');
insertSetting.run('center_phone', '');
insertSetting.run('session_secret', crypto.randomBytes(32).toString('hex'));

if (!db.prepare('SELECT 1 FROM users LIMIT 1').get()) {
  const username = process.env.ADMIN_USER || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, bcrypt.hashSync(password, 10));
  console.log(`Created admin user "${username}". Change the password from Settings after logging in.`);
}

db.getSettings = () => Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map((r) => [r.key, r.value]));

module.exports = db;
