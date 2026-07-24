import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { openDatabase } from "@backend/infra/db/database";
import { BackupRepository } from "@backend/infra/db/backup-repository";

describe("BackupRepository", () => {
  let db: DatabaseSync;
  let repo: BackupRepository;

  beforeEach(() => {
    db = openDatabase(":memory:");
    repo = new BackupRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("creates, completes, and lists backups", () => {
    const started = repo.createBackupStart({
      serverId: "s1",
      type: "manual",
      path: "C:\\backups\\x",
      notes: null,
    });
    expect(started.status).toBe("running");

    const completed = repo.completeBackup(started.id, 1024);
    expect(completed?.status).toBe("completed");
    expect(completed?.sizeBytes).toBe(1024);

    const list = repo.listBackups("s1", 10);
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(started.id);
  });

  it("marks failed backups", () => {
    const started = repo.createBackupStart({
      serverId: "s1",
      type: "scheduled",
      path: "C:\\backups\\x",
      notes: null,
    });
    const failed = repo.failBackup(started.id, "copy error");
    expect(failed?.status).toBe("failed");
    expect(failed?.notes).toContain("copy error");
  });

  it("returns the default policy and allows updating it", () => {
    const initial = repo.getPolicy("s1");
    expect(initial.enabled).toBe(false);
    expect(initial.intervalMinutes).toBe(360);

    const updated = repo.setPolicy({
      serverId: "s1",
      enabled: true,
      intervalMinutes: 120,
      retainCount: 10,
      retainDays: 7,
    });
    expect(updated.enabled).toBe(true);
    expect(updated.intervalMinutes).toBe(120);
    expect(updated.retainCount).toBe(10);
    expect(updated.retainDays).toBe(7);
  });

  it("retrieves the latest completed backup", () => {
    const a = repo.createBackupStart({
      serverId: "s1",
      type: "manual",
      path: "C:\\b\\a",
      notes: null,
    });
    repo.completeBackup(a.id, 100);

    const b = repo.createBackupStart({
      serverId: "s1",
      type: "manual",
      path: "C:\\b\\b",
      notes: null,
    });
    repo.completeBackup(b.id, 200);

    const latest = repo.latestCompleted("s1");
    expect(latest?.id).toBe(b.id);
  });

  it("records restore history", () => {
    const restoreId = repo.insertRestoreHistory({
      serverId: "s1",
      backupId: "b1",
      status: "started",
      notes: null,
    });
    expect(typeof restoreId).toBe("number");

    repo.completeRestoreHistory(restoreId, "completed", "ok");

    const row = db
      .prepare("SELECT status, notes FROM restore_history WHERE id = ?")
      .get(restoreId) as unknown as { status: string; notes: string };
    expect(row.status).toBe("completed");
    expect(row.notes).toBe("ok");
  });
});
