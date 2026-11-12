import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { openDatabase } from "@backend/infra/db/database";
import { BackupRepository } from "@backend/infra/db/backup-repository";
import { BackupRetention } from "@backend/domains/backups/backup-retention";

describe("BackupRetention protected archives (#701)", () => {
  let db: DatabaseSync;
  let repo: BackupRepository;
  let root: string;
  const addEvent = vi.fn();
  const emitChanged = vi.fn();

  beforeEach(() => {
    db = openDatabase(":memory:");
    repo = new BackupRepository(db);
    root = mkdtempSync(join(tmpdir(), "yark-retention-"));
    addEvent.mockReset();
    emitChanged.mockReset();
  });

  afterEach(() => {
    db.close();
    rmSync(root, { recursive: true, force: true });
  });

  async function seedWorld(id: string, stamp: string, isProtected: boolean): Promise<void> {
    const path = join(root, `${id}.zip`);
    await mkdir(root, { recursive: true });
    await writeFile(path, "zip");
    const started = repo.createBackupStart({
      serverId: "s1",
      type: "manual",
      kind: "world",
      path,
      notes: null,
      mapToken: "TheIsland_WP",
    });
    // Force ids stable for assertions by rewriting after insert is awkward —
    // use completed list order (newest first by completed_at).
    repo.completeBackup(started.id, 10, stamp);
    if (isProtected) {
      repo.setBackupProtection({ id: started.id, isProtected: true, operatorNote: "keep" });
    }
  }

  it("does not prune when only protected rows exceed keep last", async () => {
    for (let i = 0; i < 3; i += 1) {
      await seedWorld(`p${i}`, `2026-01-0${i + 1}T00:00:00.000Z`, true);
    }
    const retention = new BackupRetention({
      backups: repo,
      servers: { addEvent } as never,
      emitChanged,
    });
    await retention.applyRetention("s1", {
      ...repo.getPolicy("s1"),
      retainCountWorld: 2,
    });
    expect(repo.listCompleted("s1", "world")).toHaveLength(3);
    expect(addEvent).not.toHaveBeenCalled();
  });

  it("prunes oldest unprotected while keeping protected outside the keep-last pool", async () => {
    await seedWorld("old-u", "2026-01-01T00:00:00.000Z", false);
    await seedWorld("prot", "2026-01-02T00:00:00.000Z", true);
    await seedWorld("mid-u", "2026-01-03T00:00:00.000Z", false);
    await seedWorld("new-u", "2026-01-04T00:00:00.000Z", false);

    const retention = new BackupRetention({
      backups: repo,
      servers: { addEvent } as never,
      emitChanged,
    });
    await retention.applyRetention("s1", {
      ...repo.getPolicy("s1"),
      retainCountWorld: 2,
    });

    const remaining = repo.listCompleted("s1", "world");
    expect(remaining).toHaveLength(3);
    expect(remaining.every((row) => row.path.includes("old-u") === false)).toBe(true);
    expect(remaining.some((row) => row.isProtected)).toBe(true);
  });
});
