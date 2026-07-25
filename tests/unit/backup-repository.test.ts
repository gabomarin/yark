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

  it("creates, completes, and lists backups with kind", () => {
    const started = repo.createBackupStart({
      serverId: "s1",
      type: "manual",
      kind: "world",
      path: "C:\\backups\\x",
      notes: null,
    });
    expect(started.status).toBe("running");
    expect(started.kind).toBe("world");

    const completed = repo.completeBackup(started.id, 1024);
    expect(completed?.status).toBe("completed");
    expect(completed?.sizeBytes).toBe(1024);
    expect(completed?.kind).toBe("world");

    const list = repo.listBackups("s1", 10);
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(started.id);
  });

  it("marks failed backups", () => {
    const started = repo.createBackupStart({
      serverId: "s1",
      type: "scheduled",
      kind: "players",
      path: "C:\\backups\\x",
      notes: null,
    });
    const failed = repo.failBackup(started.id, "copy error");
    expect(failed?.status).toBe("failed");
    expect(failed?.notes).toContain("copy error");
    expect(failed?.kind).toBe("players");
  });

  it("returns the default policy and allows updating it", () => {
    const initial = repo.getPolicy("s1");
    expect(initial.enabled).toBe(false);
    expect(initial.intervalMinutes).toBe(60);
    expect(initial.retainCountWorld).toBe(20);
    expect(initial.retainCountPlayers).toBe(20);
    expect(initial.retainCountIni).toBe(10);
    expect(initial.backupDir).toBeNull();
    expect("retainCount" in initial).toBe(false);
    expect("retainDays" in initial).toBe(false);

    const updated = repo.setPolicy({
      serverId: "s1",
      enabled: true,
      intervalMinutes: 30,
      retainCountWorld: 10,
      retainCountPlayers: 15,
      retainCountIni: 8,
      backupDir: "D:\\ASA\\MyServer\\Backups",
    });
    expect(updated.enabled).toBe(true);
    expect(updated.intervalMinutes).toBe(30);
    expect(updated.retainCountWorld).toBe(10);
    expect(updated.retainCountPlayers).toBe(15);
    expect(updated.retainCountIni).toBe(8);
    expect(updated.backupDir).toBe("D:\\ASA\\MyServer\\Backups");
    expect(repo.getPolicy("s1").backupDir).toBe("D:\\ASA\\MyServer\\Backups");
  });

  it("retrieves the latest completed backup per kind", () => {
    const worldA = repo.createBackupStart({
      serverId: "s1",
      type: "manual",
      kind: "world",
      path: "C:\\b\\world-a",
      notes: null,
    });
    repo.completeBackup(worldA.id, 100);

    const players = repo.createBackupStart({
      serverId: "s1",
      type: "manual",
      kind: "players",
      path: "C:\\b\\players",
      notes: null,
    });
    repo.completeBackup(players.id, 50);

    const worldB = repo.createBackupStart({
      serverId: "s1",
      type: "manual",
      kind: "world",
      path: "C:\\b\\world-b",
      notes: null,
    });
    repo.completeBackup(worldB.id, 200);

    expect(repo.latestCompleted("s1", "world")?.id).toBe(worldB.id);
    expect(repo.latestCompleted("s1", "players")?.id).toBe(players.id);
    expect(repo.listCompleted("s1", "world")).toHaveLength(2);
  });

  it("deletes backup records", () => {
    const started = repo.createBackupStart({
      serverId: "s1",
      type: "manual",
      kind: "ini",
      path: "C:\\b\\ini",
      notes: null,
    });
    repo.completeBackup(started.id, 10);
    repo.deleteBackupRecord(started.id);
    expect(repo.getBackup(started.id)).toBeNull();
    expect(repo.listBackups("s1", 10)).toHaveLength(0);
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
