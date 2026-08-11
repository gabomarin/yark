import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DatabaseBootError,
  openDatabase,
  openDatabaseApplyingMigrations,
} from "@backend/infra/db/database";
import {
  PROFILE_DB_SNAPSHOT_DIR_NAME,
  PROFILE_DB_SNAPSHOT_RETAIN_PER_KIND,
  formatProfileDatabaseSnapshotFileName,
  isProfileDatabaseSnapshotFileName,
  resolveProfileDatabaseSnapshotDir,
  rotateProfileDatabaseSnapshots,
  writeProfileDatabaseSnapshot,
} from "@backend/infra/db/database-snapshots";

const tempRoots: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempRoots.push(dir);
  return dir;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (!root) continue;
    rmSync(root, { recursive: true, force: true });
  }
});

describe("profile database snapshots (#252)", () => {
  it("formats snapshot names with kind + quarantine-style stamp", () => {
    const name = formatProfileDatabaseSnapshotFileName(
      "pre-migrate",
      new Date("2026-08-10T19:30:00.000Z"),
    );
    expect(name).toBe("yark-profile.pre-migrate.2026-08-10T19-30-00-000Z.db");
    expect(isProfileDatabaseSnapshotFileName(name)).toBe(true);
  });

  it("writes a VACUUM INTO snapshot that can be opened as a profile DB", () => {
    const dir = tempDir("yark-db-snap-write-");
    const dbPath = join(dir, "yark-server-manager.db");
    const db = openDatabase(dbPath, { takeSnapshots: false });
    try {
      db.prepare(
        "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)",
      ).run("snap_probe", "1", new Date().toISOString());

      const { snapshotPath } = writeProfileDatabaseSnapshot(db, dbPath, "healthy-boot", {
        now: new Date("2026-08-10T12:00:00.000Z"),
      });
      expect(snapshotPath).toContain(PROFILE_DB_SNAPSHOT_DIR_NAME);
      expect(existsSync(snapshotPath)).toBe(true);
    } finally {
      db.close();
    }

    const snapDir = resolveProfileDatabaseSnapshotDir(dbPath);
    const snaps = readdirSync(snapDir);
    expect(snaps).toHaveLength(1);

    const restored = openDatabase(join(snapDir, snaps[0]!), { takeSnapshots: false });
    try {
      const row = restored
        .prepare("SELECT value FROM app_settings WHERE key = ?")
        .get("snap_probe") as { value: string };
      expect(row.value).toBe("1");
    } finally {
      restored.close();
    }
  });

  it("rotates oldest snapshots per kind", () => {
    const dir = tempDir("yark-db-snap-rotate-");
    const snapDir = join(dir, PROFILE_DB_SNAPSHOT_DIR_NAME);
    const dbPath = join(dir, "profile.db");
    const db = openDatabase(dbPath, { takeSnapshots: false });
    try {
      for (let i = 0; i < PROFILE_DB_SNAPSHOT_RETAIN_PER_KIND + 2; i += 1) {
        writeProfileDatabaseSnapshot(db, dbPath, "healthy-boot", {
          now: new Date(Date.UTC(2026, 7, 10, 12, i, 0)),
          retainPerKind: PROFILE_DB_SNAPSHOT_RETAIN_PER_KIND,
        });
      }
    } finally {
      db.close();
    }

    const remaining = readdirSync(snapDir).filter(isProfileDatabaseSnapshotFileName);
    expect(remaining).toHaveLength(PROFILE_DB_SNAPSHOT_RETAIN_PER_KIND);
    expect(remaining.every((name) => name.includes("healthy-boot"))).toBe(true);

    const deleted = rotateProfileDatabaseSnapshots(snapDir, { retainPerKind: 1 });
    expect(deleted.length).toBe(PROFILE_DB_SNAPSHOT_RETAIN_PER_KIND - 1);
    expect(readdirSync(snapDir).filter(isProfileDatabaseSnapshotFileName)).toHaveLength(1);
  });

  it("takes pre-migrate then healthy-boot snapshots when migrating an existing DB", () => {
    const dir = tempDir("yark-db-snap-migrate-");
    const dbPath = join(dir, "migrate.db");
    openDatabaseApplyingMigrations(
      dbPath,
      [{ version: 1, sql: "CREATE TABLE ok (id INTEGER PRIMARY KEY); INSERT INTO ok (id) VALUES (1);" }],
      { takeSnapshots: false },
    ).close();

    openDatabaseApplyingMigrations(dbPath, [
      { version: 1, sql: "CREATE TABLE ok (id INTEGER PRIMARY KEY);" },
      {
        version: 2,
        sql: "ALTER TABLE ok ADD COLUMN note TEXT NOT NULL DEFAULT '';",
      },
    ]).close();

    const snapDir = resolveProfileDatabaseSnapshotDir(dbPath);
    const names = readdirSync(snapDir).filter(isProfileDatabaseSnapshotFileName).sort();
    expect(names.some((name) => name.includes("pre-migrate"))).toBe(true);
    expect(names.some((name) => name.includes("healthy-boot"))).toBe(true);

    const preMigrate = names.find((name) => name.includes("pre-migrate"))!;
    const preDb = openDatabaseApplyingMigrations(
      join(snapDir, preMigrate),
      [{ version: 1, sql: "CREATE TABLE ok (id INTEGER PRIMARY KEY);" }],
      { takeSnapshots: false },
    );
    try {
      const version = (
        preDb.prepare("PRAGMA user_version").get() as { user_version: number }
      ).user_version;
      expect(version).toBe(1);
      const cols = preDb.prepare("PRAGMA table_info(ok)").all() as Array<{ name: string }>;
      expect(cols.map((col) => col.name)).toEqual(["id"]);
    } finally {
      preDb.close();
    }
  });

  it("skips snapshots for a brand-new database file", () => {
    const dir = tempDir("yark-db-snap-new-");
    const dbPath = join(dir, "fresh.db");
    openDatabase(dbPath).close();
    const snapDir = resolveProfileDatabaseSnapshotDir(dbPath);
    expect(existsSync(snapDir)).toBe(false);
  });

  it("snapshots on healthy re-open without pending migrations", () => {
    const dir = tempDir("yark-db-snap-reopen-");
    const dbPath = join(dir, "reopen.db");
    openDatabase(dbPath, { takeSnapshots: false }).close();
    openDatabase(dbPath).close();

    const snapDir = resolveProfileDatabaseSnapshotDir(dbPath);
    const names = readdirSync(snapDir).filter(isProfileDatabaseSnapshotFileName);
    expect(names).toHaveLength(1);
    expect(names[0]).toContain("healthy-boot");
    expect(names.some((name) => name.includes("pre-migrate"))).toBe(false);
  });

  it("fails migration when a required pre-migrate snapshot cannot be written", () => {
    const dir = tempDir("yark-db-snap-fail-");
    const dbPath = join(dir, "migrate.db");
    openDatabaseApplyingMigrations(
      dbPath,
      [{ version: 1, sql: "CREATE TABLE ok (id INTEGER);" }],
      { takeSnapshots: false },
    ).close();

    // Occupy the snapshot path as a file so mkdir for the directory fails.
    writeFileSync(resolveProfileDatabaseSnapshotDir(dbPath), "not-a-directory");

    expect(() =>
      openDatabaseApplyingMigrations(dbPath, [
        { version: 1, sql: "CREATE TABLE ok (id INTEGER);" },
        { version: 2, sql: "ALTER TABLE ok ADD COLUMN note TEXT;" },
      ]),
    ).toThrow(DatabaseBootError);

    try {
      openDatabaseApplyingMigrations(dbPath, [
        { version: 1, sql: "CREATE TABLE ok (id INTEGER);" },
        { version: 2, sql: "ALTER TABLE ok ADD COLUMN note TEXT;" },
      ]);
      expect.unreachable("expected migrate snapshot failure");
    } catch (error) {
      expect(error).toBeInstanceOf(DatabaseBootError);
      expect((error as DatabaseBootError).kind).toBe("migrate");
    }

    // Schema must remain at v1 — migrations did not run without a snapshot.
    const db = openDatabaseApplyingMigrations(
      dbPath,
      [{ version: 1, sql: "CREATE TABLE ok (id INTEGER);" }],
      { takeSnapshots: false },
    );
    try {
      const version = (db.prepare("PRAGMA user_version").get() as { user_version: number })
        .user_version;
      expect(version).toBe(1);
    } finally {
      db.close();
    }
  });
});
