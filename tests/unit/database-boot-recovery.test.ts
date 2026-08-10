import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DATABASE_BUSY_TIMEOUT_MS,
  DatabaseBootError,
  openDatabase,
  openDatabaseApplyingMigrations,
} from "@backend/infra/db/database";
import {
  formatDatabaseQuarantineStamp,
  quarantineProfileDatabase,
} from "@backend/infra/db/database-recovery";
import {
  DatabaseRecoveryAbortedError,
  openDatabaseWithOperatorRecovery,
  operatorFacingDatabaseBootReason,
  type DatabaseRecoveryUi,
} from "../../src/main/database-boot-recovery";

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

describe("openDatabase boot hardening", () => {
  it("applies busy_timeout on a fresh database", () => {
    const db = openDatabase(":memory:");
    try {
      const row = db.prepare("PRAGMA busy_timeout").get() as { timeout: number };
      expect(row.timeout).toBe(DATABASE_BUSY_TIMEOUT_MS);
    } finally {
      db.close();
    }
  });

  it("falls back to the default busy_timeout for non-finite overrides", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const db = openDatabase(":memory:", { busyTimeoutMs: bad });
      try {
        const row = db.prepare("PRAGMA busy_timeout").get() as { timeout: number };
        expect(row.timeout).toBe(DATABASE_BUSY_TIMEOUT_MS);
      } finally {
        db.close();
      }
    }
  });

  it("wraps corrupt open failures as DatabaseBootError kind open", () => {
    const dir = tempDir("yark-db-corrupt-");
    const dbPath = join(dir, "broken.db");
    writeFileSync(dbPath, "not a sqlite database");

    expect(() => openDatabase(dbPath)).toThrow(DatabaseBootError);
    try {
      openDatabase(dbPath);
      expect.unreachable("openDatabase should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(DatabaseBootError);
      const boot = error as DatabaseBootError;
      expect(boot.kind).toBe("open");
      expect(boot.dbPath).toBe(dbPath);
    }
  });

  it("rejects an existing empty database file instead of silently recreating it", () => {
    const dir = tempDir("yark-db-empty-");
    const dbPath = join(dir, "empty.db");
    writeFileSync(dbPath, "");

    expect(() => openDatabase(dbPath)).toThrow(DatabaseBootError);
    try {
      openDatabase(dbPath);
      expect.unreachable("openDatabase should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(DatabaseBootError);
      const boot = error as DatabaseBootError;
      expect(boot.kind).toBe("open");
      expect(operatorFacingDatabaseBootReason(boot)).toMatch(/empty/i);
    }
  });

  it("wraps page-level corruption as DatabaseBootError kind open via quick_check", () => {
    const dir = tempDir("yark-db-malformed-");
    const dbPath = join(dir, "malformed.db");
    openDatabase(dbPath).close();

    const buf = Buffer.from(readFileSync(dbPath));
    for (let i = 100; i < Math.min(200, buf.length); i += 1) {
      buf[i] = buf[i]! ^ 0xff;
    }
    writeFileSync(dbPath, buf);

    expect(() => openDatabase(dbPath)).toThrow(DatabaseBootError);
    try {
      openDatabase(dbPath);
      expect.unreachable("openDatabase should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(DatabaseBootError);
      const boot = error as DatabaseBootError;
      expect(boot.kind).toBe("open");
      expect(boot.message).toMatch(/damaged|corrupt|malformed|integrity/i);
      const reason = operatorFacingDatabaseBootReason(boot);
      expect(reason).toMatch(/damaged/i);
      expect(reason.length).toBeLessThanOrEqual(180);
    }
  });

  it("wraps migration failures as DatabaseBootError kind migrate", () => {
    const dir = tempDir("yark-db-migrate-");
    const dbPath = join(dir, "migrate.db");
    openDatabaseApplyingMigrations(dbPath, [
      { version: 1, sql: "CREATE TABLE ok (id INTEGER);" },
    ]).close();

    const badMigrations = [
      { version: 1, sql: "CREATE TABLE ok (id INTEGER);" },
      { version: 2, sql: "THIS IS NOT VALID SQL;" },
    ];

    expect(() => openDatabaseApplyingMigrations(dbPath, badMigrations)).toThrow(
      DatabaseBootError,
    );
    try {
      openDatabaseApplyingMigrations(dbPath, badMigrations);
      expect.unreachable("openDatabaseApplyingMigrations should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(DatabaseBootError);
      const boot = error as DatabaseBootError;
      expect(boot.kind).toBe("migrate");
      expect(boot.dbPath).toBe(dbPath);
    }
  });
});

describe("quarantineProfileDatabase", () => {
  it("renames the DB and WAL/SHM sidecars with a corrupt stamp", () => {
    const dir = tempDir("yark-db-quarantine-");
    const dbPath = join(dir, "yark-server-manager.db");
    writeFileSync(dbPath, "main");
    writeFileSync(`${dbPath}-wal`, "wal");
    writeFileSync(`${dbPath}-shm`, "shm");

    const now = new Date("2026-08-10T19:30:00.000Z");
    const stamp = formatDatabaseQuarantineStamp(now);
    const result = quarantineProfileDatabase(dbPath, { now });

    expect(result.stamp).toBe(stamp);
    expect(result.quarantinedPaths).toEqual([
      `${dbPath}-wal.corrupt.${stamp}`,
      `${dbPath}-shm.corrupt.${stamp}`,
      `${dbPath}.corrupt.${stamp}`,
    ]);
    expect(existsSync(dbPath)).toBe(false);
    expect(existsSync(`${dbPath}.corrupt.${stamp}`)).toBe(true);
    expect(existsSync(`${dbPath}-wal.corrupt.${stamp}`)).toBe(true);
    expect(existsSync(`${dbPath}-shm.corrupt.${stamp}`)).toBe(true);
    expect(readFileSync(`${dbPath}.corrupt.${stamp}`, "utf8")).toBe("main");
  });
});

describe("openDatabaseWithOperatorRecovery", () => {
  it("returns the database when open succeeds", async () => {
    const db = { close: vi.fn() } as unknown as ReturnType<typeof openDatabase>;
    const open = vi.fn().mockReturnValue(db);
    const ui: DatabaseRecoveryUi = {
      promptRecovery: vi.fn(),
      revealDatabase: vi.fn(),
      quitApp: vi.fn(),
    };

    await expect(
      openDatabaseWithOperatorRecovery("C:\\data\\yark.db", ui, { open }),
    ).resolves.toBe(db);
    expect(ui.promptRecovery).not.toHaveBeenCalled();
  });

  it("reveals the folder then aborts when the operator quits", async () => {
    const open = vi.fn().mockImplementation(() => {
      throw new DatabaseBootError("open", "C:\\data\\yark.db", new Error("corrupt"));
    });
    const ui: DatabaseRecoveryUi = {
      promptRecovery: vi.fn().mockResolvedValueOnce("reveal").mockResolvedValueOnce("quit"),
      revealDatabase: vi.fn(),
      quitApp: vi.fn(),
    };

    await expect(
      openDatabaseWithOperatorRecovery("C:\\data\\yark.db", ui, { open }),
    ).rejects.toBeInstanceOf(DatabaseRecoveryAbortedError);
    expect(ui.revealDatabase).toHaveBeenCalledWith("C:\\data\\yark.db");
    expect(ui.quitApp).toHaveBeenCalledTimes(1);
  });

  it("quarantines and reopens after Start empty without a second confirm", async () => {
    const dir = tempDir("yark-db-recovery-");
    const dbPath = join(dir, "yark-server-manager.db");
    writeFileSync(dbPath, "not a sqlite database");

    const ui: DatabaseRecoveryUi = {
      promptRecovery: vi.fn().mockResolvedValue("reset"),
      revealDatabase: vi.fn(),
      quitApp: vi.fn(),
    };

    const db = await openDatabaseWithOperatorRecovery(dbPath, ui);
    try {
      expect(existsSync(dbPath)).toBe(true);
      const quarantined = readdirSync(dir).filter((name) => name.includes(".corrupt."));
      expect(quarantined.length).toBeGreaterThanOrEqual(1);
      expect(ui.quitApp).not.toHaveBeenCalled();
      expect(ui.promptRecovery).toHaveBeenCalledTimes(1);
    } finally {
      db.close();
    }
  });
});
