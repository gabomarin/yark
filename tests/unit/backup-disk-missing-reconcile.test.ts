import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BackupReconciler } from "@backend/domains/backups/backup-reconcile";
import { openDatabase } from "@backend/infra/db/database";
import { BackupRepository } from "@backend/infra/db/backup-repository";
import { ServerRepository } from "@backend/infra/db/server-repository";

describe("backup missing-on-disk reconcile", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("marks completed archives missing instead of deleting the catalog row", async () => {
    const dir = mkdtempSync(join(tmpdir(), "yark-missing-disk-"));
    dirs.push(dir);
    const dbPath = join(dir, "profile.db");
    const installDir = join(dir, "install");
    const worldDir = join(installDir, "Backups", "World");
    mkdirSync(worldDir, { recursive: true });

    const db = openDatabase(dbPath, { takeSnapshots: false });
    const servers = new ServerRepository(db);
    const backups = new BackupRepository(db);
    const profile = servers.create({
      name: "Island",
      map: "TheIsland_WP",
      installDir,
      sessionName: "Test",
      maxPlayers: 70,
      gamePort: 7777,
      queryPort: 27015,
      rconPort: 27020,
      serverPassword: null,
      adminPassword: "admin1234",
      clusterId: null,
      clusterDir: null,
      extraArgs: [],
      mods: [],
      autoStart: false,
      useAsaApi: false,
      useAsaApiLoader: false,
    });

    const zipPath = join(worldDir, "keep-me.zip");
    writeFileSync(zipPath, "zip-bytes");
    const started = backups.createBackupStart({
      serverId: profile.id,
      type: "manual",
      kind: "world",
      path: zipPath,
      notes: null,
      mapToken: "TheIsland_WP",
    });
    const completed = backups.completeBackup(started.id, 9)!;
    backups.setBackupProtection({ id: completed.id, isProtected: true, operatorNote: "keep" });

    const emitChanged = vi.fn();
    const reconciler = new BackupReconciler({
      servers,
      backups,
      creatingBackupIds: new Set(),
      emitChanged,
    });

    await reconciler.reconcileDiskBackups(profile.id);
    expect(backups.getBackup(completed.id)?.diskMissing).toBe(false);

    rmSync(zipPath, { force: true });
    await reconciler.reconcileDiskBackups(profile.id);

    const missing = backups.getBackup(completed.id);
    expect(missing).not.toBeNull();
    expect(missing?.diskMissing).toBe(true);
    expect(missing?.isProtected).toBe(true);
    expect(emitChanged).toHaveBeenCalledWith(
      profile.id,
      expect.objectContaining({ newlyMissingOnDisk: 1, newlyMissingProtected: 1 }),
    );

    writeFileSync(zipPath, "zip-bytes-again");
    await reconciler.reconcileDiskBackups(profile.id);
    expect(backups.getBackup(completed.id)?.diskMissing).toBe(false);

    db.close();
  });
});
