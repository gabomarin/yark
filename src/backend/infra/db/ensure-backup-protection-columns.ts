import type { DatabaseSync } from "node:sqlite";

/** Schema version that idempotently ensures #701 protection columns exist. */
export const BACKUP_PROTECTION_ENSURE_SCHEMA_VERSION = 31;

/** Schema version that idempotently ensures disk_missing exists. */
export const BACKUP_DISK_MISSING_ENSURE_SCHEMA_VERSION = 32;

function tableExists(db: DatabaseSync, table: string): boolean {
  const row = db
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(table) as { ok: number } | undefined;
  return row !== undefined;
}

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
  if (!tableExists(db, "backups")) return;

  const backupCols = tableColumnNames(db, "backups");
  if (!backupCols.has("is_protected")) {
    db.exec("ALTER TABLE backups ADD COLUMN is_protected INTEGER NOT NULL DEFAULT 0;");
  }
  if (!backupCols.has("operator_note")) {
    db.exec("ALTER TABLE backups ADD COLUMN operator_note TEXT NOT NULL DEFAULT '';");
  }

  if (!tableExists(db, "backup_policies")) return;
  const policyCols = tableColumnNames(db, "backup_policies");
  if (!policyCols.has("protect_new_manual_world")) {
    db.exec("ALTER TABLE backup_policies ADD COLUMN protect_new_manual_world INTEGER NOT NULL DEFAULT 0;");
  }
  if (!policyCols.has("protect_new_manual_ini")) {
    db.exec("ALTER TABLE backup_policies ADD COLUMN protect_new_manual_ini INTEGER NOT NULL DEFAULT 0;");
  }
}

/** Add disk_missing when absent (safe if migration 32 SQL was skipped or already applied). */
export function ensureBackupDiskMissingColumn(db: DatabaseSync): void {
  if (!tableExists(db, "backups")) return;
  const backupCols = tableColumnNames(db, "backups");
  if (!backupCols.has("disk_missing")) {
    db.exec("ALTER TABLE backups ADD COLUMN disk_missing INTEGER NOT NULL DEFAULT 0;");
  }
}

/** Idempotent repair for Protected + disk_missing columns (safe on every open). */
export function ensureBackupCatalogColumns(db: DatabaseSync): void {
  ensureBackupProtectionColumns(db);
  ensureBackupDiskMissingColumn(db);
}
