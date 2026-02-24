import Database from "better-sqlite3";
import path from "path";

// Vercel's project directory is read-only; use /tmp for the writable ephemeral volume.
const DB_PATH = process.env.VERCEL
  ? "/tmp/data.db"
  : path.join(process.cwd(), "data.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mrn TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      dob TEXT NOT NULL,
      gender TEXT NOT NULL,
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      address TEXT DEFAULT '',
      insurance TEXT DEFAULT '',
      blood_type TEXT DEFAULT '',
      allergies TEXT DEFAULT '',
      tropicalia_project_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS patient_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      record_type TEXT NOT NULL CHECK(record_type IN ('vital','diagnosis','medication','lab','procedure')),
      title TEXT NOT NULL,
      data TEXT NOT NULL DEFAULT '{}',
      recorded_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      note_type TEXT NOT NULL DEFAULT 'general' CHECK(note_type IN ('progress','consultation','discharge','admission','general')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user','assistant')),
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Runtime migration: add tropicalia_project_id to patients if it doesn't exist yet
  const cols = db
    .prepare("PRAGMA table_info(patients)")
    .all() as Array<{ name: string }>;
  if (!cols.find((c) => c.name === "tropicalia_project_id")) {
    db.exec("ALTER TABLE patients ADD COLUMN tropicalia_project_id TEXT");
  }
}
