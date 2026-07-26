import { DatabaseSync } from "node:sqlite";

interface Migration {
  version: number;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        map TEXT NOT NULL,
        install_dir TEXT NOT NULL,
        session_name TEXT NOT NULL,
        game_port INTEGER NOT NULL,
        query_port INTEGER NOT NULL,
        rcon_port INTEGER NOT NULL,
        server_password TEXT,
        admin_password TEXT NOT NULL,
        cluster_id TEXT,
        cluster_dir TEXT,
        extra_args TEXT NOT NULL DEFAULT '[]',
        mods TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id TEXT,
        type TEXT NOT NULL,
        severity TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX idx_events_created_at ON events (created_at DESC);

      CREATE TABLE backups (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL,
        type TEXT NOT NULL,
        path TEXT NOT NULL,
        size_bytes INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT,
        notes TEXT
      );

      CREATE INDEX idx_backups_server_created ON backups (server_id, created_at DESC);

      CREATE TABLE backup_policies (
        server_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL,
        interval_minutes INTEGER NOT NULL,
        retain_count INTEGER NOT NULL,
        retain_days INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE restore_history (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL,
        backup_id TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        notes TEXT
      );

      CREATE TABLE app_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT NOT NULL
      );
    `,
  },
  {
    version: 2,
    sql: `
      CREATE TABLE restore_history_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id TEXT NOT NULL,
        backup_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        status TEXT NOT NULL,
        notes TEXT
      );

      INSERT INTO restore_history_new (
        server_id,
        backup_id,
        started_at,
        completed_at,
        status,
        notes
      )
      SELECT
        server_id,
        backup_id,
        COALESCE(created_at, datetime('now')),
        NULL,
        status,
        notes
      FROM restore_history;

      DROP TABLE restore_history;
      ALTER TABLE restore_history_new RENAME TO restore_history;
    `,
  },
  {
    version: 3,
    sql: `
      ALTER TABLE backup_policies ADD COLUMN backup_dir TEXT;
    `,
  },
  {
    version: 4,
    sql: `
      ALTER TABLE backups ADD COLUMN kind TEXT NOT NULL DEFAULT 'world';
      UPDATE backup_policies SET interval_minutes = 60 WHERE interval_minutes = 360;
    `,
  },
  {
    version: 5,
    sql: `
      ALTER TABLE backup_policies ADD COLUMN retain_count_players INTEGER NOT NULL DEFAULT 20;
      ALTER TABLE backup_policies ADD COLUMN retain_count_ini INTEGER NOT NULL DEFAULT 10;
      UPDATE backup_policies SET retain_count_players = 20 WHERE retain_count_players IS NULL OR retain_count_players < 1;
      UPDATE backup_policies SET retain_count_ini = 10 WHERE retain_count_ini IS NULL OR retain_count_ini < 1;
    `,
  },
  {
    version: 6,
    sql: `
      ALTER TABLE events ADD COLUMN details TEXT;
    `,
  },
];

/**
 * Opens (or creates) the database and applies pending migrations
 * transactionally using PRAGMA user_version.
 */
export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");

  const currentRow = db.prepare("PRAGMA user_version").get() as { user_version: number };
  const current = currentRow.user_version;
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    db.exec("BEGIN;");
    try {
      db.exec(migration.sql);
      db.exec(`PRAGMA user_version = ${migration.version};`);
      db.exec("COMMIT;");
    } catch (error) {
      db.exec("ROLLBACK;");
      throw error;
    }
  }
  return db;
}
