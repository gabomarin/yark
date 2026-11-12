import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabaseApplyingMigrations } from "@backend/infra/db/database";
import {
  BACKUP_PROTECTION_ENSURE_SCHEMA_VERSION,
  ensureBackupCatalogColumns,
  ensureBackupProtectionColumns,
} from "@backend/infra/db/ensure-backup-protection-columns";
import schemaMigrations from "@backend/infra/db/schema-migrations.json";

describe("ensureBackupProtectionColumns", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("adds missing protection columns when user_version already skipped v30 SQL", () => {
    const dir = mkdtempSync(join(tmpdir(), "yark-protect-ensure-"));
    dirs.push(dir);
    const path = join(dir, "profile.db");

    // Migrate through v29 only, then fake the stuck #701 profile (version 30, no columns).
    const through29 = schemaMigrations.filter((migration) => migration.version <= 29);
    let db = openDatabaseApplyingMigrations(path, through29, { takeSnapshots: false });
    db.exec("PRAGMA user_version = 30;");
    db.close();

    db = openDatabaseApplyingMigrations(path, schemaMigrations, { takeSnapshots: false });
    const version = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
    const latestVersion = Math.max(...schemaMigrations.map((migration) => migration.version));
    expect(version).toBe(latestVersion);
    expect(version).toBeGreaterThanOrEqual(BACKUP_PROTECTION_ENSURE_SCHEMA_VERSION);

    const backupCols = (db.prepare("PRAGMA table_info(backups)").all() as Array<{ name: string }>).map(
      (row) => row.name,
    );
    expect(backupCols).toContain("is_protected");
    expect(backupCols).toContain("operator_note");
    expect(backupCols).toContain("disk_missing");

    const policyCols = (db.prepare("PRAGMA table_info(backup_policies)").all() as Array<{ name: string }>).map(
      (row) => row.name,
    );
    expect(policyCols).toContain("protect_new_manual_world");
    expect(policyCols).toContain("protect_new_manual_ini");
    db.close();
  });

  it("repairs columns when user_version is already ahead without the ALTERs", () => {
    const dir = mkdtempSync(join(tmpdir(), "yark-protect-ensure-ahead-"));
    dirs.push(dir);
    const path = join(dir, "profile.db");
    const through29 = schemaMigrations.filter((migration) => migration.version <= 29);
    let db = openDatabaseApplyingMigrations(path, through29, { takeSnapshots: false });
    db.exec("PRAGMA user_version = 32;");
    db.close();

    db = openDatabaseApplyingMigrations(path, schemaMigrations, { takeSnapshots: false });
    const backupCols = (db.prepare("PRAGMA table_info(backups)").all() as Array<{ name: string }>).map(
      (row) => row.name,
    );
    expect(backupCols).toContain("is_protected");
    expect(backupCols).toContain("disk_missing");
    expect(() => ensureBackupCatalogColumns(db)).not.toThrow();
    db.close();
  });

  it("is safe to run when columns already exist", () => {
    const dir = mkdtempSync(join(tmpdir(), "yark-protect-ensure-idem-"));
    dirs.push(dir);
    const path = join(dir, "profile.db");
    const db = openDatabaseApplyingMigrations(path, schemaMigrations, { takeSnapshots: false });
    expect(() => ensureBackupProtectionColumns(db)).not.toThrow();
    expect(() => ensureBackupCatalogColumns(db)).not.toThrow();
    db.close();
  });
});
