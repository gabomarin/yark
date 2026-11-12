import type { DatabaseSync } from "node:sqlite";

/** Schema version that idempotently ensures #701 protection columns exist. */
export const BACKUP_PROTECTION_ENSURE_SCHEMA_VERSION = 31;

function tableColumnNames(db: DatabaseSync, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return new Set(rows.map((row) => row.name));
}

/**
 * Add #701 Protected-backup columns when missing.
 * Needed when `user_version` was already bumped to 30 without applying migration 30 SQL
 * (skipped pending migrate — see docs/profile-database.md).
 */
export function ensureBackupProtectionColumns(db: DatabaseSync): void {
  const backupCols = tableColumnNames(db, "backups");
  if (!backupCols.has("is_protected")) {
    db.exec("ALTER TABLE backups ADD COLUMN is_protected INTEGER NOT NULL DEFAULT 0;");
  }
  if (!backupCols.has("operator_note")) {
    db.exec("ALTER TABLE backups ADD COLUMN operator_note TEXT NOT NULL DEFAULT '';");
  }

  const policyCols = tableColumnNames(db, "backup_policies");
  if (!policyCols.has("protect_new_manual_world")) {
    db.exec("ALTER TABLE backup_policies ADD COLUMN protect_new_manual_world INTEGER NOT NULL DEFAULT 0;");
  }
  if (!policyCols.has("protect_new_manual_ini")) {
    db.exec("ALTER TABLE backup_policies ADD COLUMN protect_new_manual_ini INTEGER NOT NULL DEFAULT 0;");
  }
}
