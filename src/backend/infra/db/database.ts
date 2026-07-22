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
    `,
  },
];

/**
 * Abre (o crea) la base de datos y aplica migraciones pendientes
 * de forma transaccional usando PRAGMA user_version.
 */
export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  const row = db.prepare("PRAGMA user_version").get() as {
    user_version: number;
  };
  const current = row.user_version;
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    db.exec("BEGIN");
    try {
      db.exec(migration.sql);
      db.exec(`PRAGMA user_version = ${migration.version}`);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
  return db;
}
