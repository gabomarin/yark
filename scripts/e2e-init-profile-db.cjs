/**
 * Seed a profile SQLite file for E2E without launching Electron.
 *
 * SQL list matches `openDatabase` (`src/backend/infra/db/schema-migrations.json`).
 * The max-players schema version is SQL `SELECT 1`; JavaScript backfill is skipped
 * because the fleet is still empty when this runs.
 *
 * `PRAGMA user_version` is set inside the same transaction as `openDatabase`
 * (`src/backend/infra/db/database.ts`). In WAL mode a failed migration can leave
 * a sticky header version; keep this aligned with the app instead of changing
 * only the E2E path.
 */
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

/**
 * @param {string} dbPath
 */
function initProfileDatabase(dbPath) {
  const migrations = require("../src/backend/infra/db/schema-migrations.json");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  try {
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA foreign_keys = ON;");
    for (const migration of migrations) {
      db.exec("BEGIN;");
      try {
        db.exec(migration.sql);
        db.exec(`PRAGMA user_version = ${Number(migration.version)};`);
        db.exec("COMMIT;");
      } catch (error) {
        try {
          db.exec("ROLLBACK;");
        } catch {
          // Keep the original migration error.
        }
        throw error;
      }
    }
  } finally {
    db.close();
  }
}

module.exports = { initProfileDatabase };
