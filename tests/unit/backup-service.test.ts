import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDatabase } from "@backend/infra/db/database";
import { BackupRepository } from "@backend/infra/db/backup-repository";
import {
  BackupService,
  formatPlayerSessionNotes,
  playersRetentionKey,
} from "@backend/domains/backups/backup-service";
import type { ProcessManager } from "@backend/infra/process/process-manager";
import type { ServerRepository } from "@backend/infra/db/server-repository";
import type { AppSettingsRepository } from "@backend/infra/db/app-settings-repository";
import type { ServerProfile } from "@shared/types";
import type { DatabaseSync } from "node:sqlite";

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0, tmpDirs.length)) {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function makeProfile(installDir: string): ServerProfile {
  const now = new Date().toISOString();
  return {
    id: "srv-1",
    name: "Island",
    map: "TheIsland_WP",
    installDir,
    sessionName: "Island",
    gamePort: 7777,
    queryPort: 27015,
    rconPort: 27020,
    serverPassword: null,
    adminPassword: "admin",
    clusterId: null,
    clusterDir: null,
    extraArgs: [],
    mods: [],
    createdAt: now,
    updatedAt: now,
  };
}

async function seedInstall(installDir: string): Promise<void> {
  const savedArks = join(installDir, "ShooterGame", "Saved", "SavedArks");
  const config = join(
    installDir,
    "ShooterGame",
    "Saved",
    "Config",
    "WindowsServer",
  );
  await mkdir(savedArks, { recursive: true });
  await mkdir(config, { recursive: true });
  await writeFile(join(savedArks, "TheIsland_WP.ark"), "WORLD", "utf8");
  await writeFile(join(savedArks, "tribe.arktribe"), "TRIBE", "utf8");
  await writeFile(join(savedArks, "76561198000000000.arkprofile"), "PLAYER", "utf8");
  await writeFile(join(savedArks, "76561198000000001.arkprofile"), "PLAYER2", "utf8");
  await writeFile(join(config, "Game.ini"), "[/Script/Engine]\nx=1\n", "utf8");
  await writeFile(
    join(config, "GameUserSettings.ini"),
    "[ServerSettings]\nServerName=Test\n",
    "utf8",
  );
  await writeFile(join(config, "Engine.ini"), "noise=1\n", "utf8");
}

describe("BackupService kinds and retention", () => {
  let db: DatabaseSync;
  let repo: BackupRepository;
  let service: BackupService;
  let installDir: string;
  let profile: ServerProfile;
  let addEvent: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    db = openDatabase(":memory:");
    repo = new BackupRepository(db);
    installDir = await mkdtemp(join(tmpdir(), "ark-backup-"));
    tmpDirs.push(installDir);
    await seedInstall(installDir);
    profile = makeProfile(installDir);

    addEvent = vi.fn();
    const servers = {
      get: vi.fn((id: string) => (id === profile.id ? profile : null)),
      list: vi.fn(() => [profile]),
      addEvent,
    } as unknown as ServerRepository;

    const processes = {
      isActive: vi.fn(() => false),
      start: vi.fn(),
      stop: vi.fn(),
    } as unknown as ProcessManager;

    const settings = {
      get: vi.fn(() => null),
      set: vi.fn(),
    } as unknown as AppSettingsRepository;

    service = new BackupService(servers, repo, processes, settings, join(installDir, "_root"));
  });

  afterEach(() => {
    db.close();
  });

  it("rejects intervals below 5 minutes", () => {
    expect(() =>
      service.setPolicy(profile.id, {
        enabled: false,
        intervalMinutes: 4,
        retainCountWorld: 20,
        retainCountPlayers: 20,
        retainCountIni: 10,
        backupDir: null,
      }),
    ).toThrow(/5 minutes/i);
  });

  it("packages world including player profiles", async () => {
    const created = await service.createManualBackup(profile.id, ["world"]);
    const record = created[0];
    expect(record).toBeDefined();
    if (record === undefined) return;
    expect(record.kind).toBe("world");
    await expect(
      access(join(record.path, "SavedArks", "TheIsland_WP.ark"), fsConstants.F_OK),
    ).resolves.toBeUndefined();
    await expect(
      access(join(record.path, "SavedArks", "76561198000000000.arkprofile"), fsConstants.F_OK),
    ).resolves.toBeUndefined();
    const manifest = JSON.parse(
      await readFile(join(record.path, "manifest.json"), "utf8"),
    ) as { backup: { kind: string } };
    expect(manifest.backup.kind).toBe("world");
  });

  it("packages players profiles only", async () => {
    const created = await service.createManualBackup(profile.id, ["players"]);
    const record = created[0];
    expect(record).toBeDefined();
    if (record === undefined) return;
    expect(record.kind).toBe("players");
    await expect(
      access(
        join(record.path, "PlayerProfiles", "SavedArks", "76561198000000000.arkprofile"),
        fsConstants.F_OK,
      ),
    ).resolves.toBeUndefined();
    await expect(
      access(join(record.path, "PlayerProfiles", "SavedArks", "TheIsland_WP.ark"), fsConstants.F_OK),
    ).rejects.toThrow();
  });

  it("packages a single player session backup", async () => {
    const record = await service.createPlayerSessionBackup(
      profile.id,
      "connect",
      "76561198000000000",
      "Alice",
    );
    expect(record).not.toBeNull();
    if (record === null) return;
    expect(record.type).toBe("player_connect");
    expect(record.kind).toBe("players");
    expect(playersRetentionKey(record)).toBe("76561198000000000");
    expect(record.notes).toContain(formatPlayerSessionNotes("connect", "76561198000000000", "Alice"));
    await expect(
      access(
        join(record.path, "PlayerProfiles", "SavedArks", "76561198000000000.arkprofile"),
        fsConstants.F_OK,
      ),
    ).resolves.toBeUndefined();
    await expect(
      access(
        join(record.path, "PlayerProfiles", "SavedArks", "76561198000000001.arkprofile"),
        fsConstants.F_OK,
      ),
    ).rejects.toThrow();
  });

  it("retries finding a profile file on disconnect flush", async () => {
    const savedArks = join(installDir, "ShooterGame", "Saved", "SavedArks");
    const latePath = join(savedArks, "76561198009999999.arkprofile");
    // Profile appears shortly after disconnect (ASA flush).
    const writeLater = (async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await writeFile(latePath, "LATE_FLUSH", "utf8");
    })();

    const pending = service.createPlayerSessionBackup(
      profile.id,
      "disconnect",
      "76561198009999999",
      "Late",
    );
    const record = await pending;
    await writeLater;

    expect(record).not.toBeNull();
    if (record === null) return;
    expect(record.type).toBe("player_disconnect");
    expect(record.kind).toBe("players");
    await expect(
      access(
        join(record.path, "PlayerProfiles", "SavedArks", "76561198009999999.arkprofile"),
        fsConstants.F_OK,
      ),
    ).resolves.toBeUndefined();
    expect(await readFile(
      join(record.path, "PlayerProfiles", "SavedArks", "76561198009999999.arkprofile"),
      "utf8",
    )).toBe("LATE_FLUSH");
  });

  it("packages only Game.ini and GameUserSettings.ini", async () => {
    const created = await service.createManualBackup(profile.id, ["ini"]);
    const record = created[0];
    expect(record).toBeDefined();
    if (record === undefined) return;
    expect(record.kind).toBe("ini");
    await expect(
      access(join(record.path, "ConfigWindowsServer", "Game.ini"), fsConstants.F_OK),
    ).resolves.toBeUndefined();
    await expect(
      access(
        join(record.path, "ConfigWindowsServer", "GameUserSettings.ini"),
        fsConstants.F_OK,
      ),
    ).resolves.toBeUndefined();
    await expect(
      access(join(record.path, "ConfigWindowsServer", "Engine.ini"), fsConstants.F_OK),
    ).rejects.toThrow();
  });

  it("creates debounced ini_save backups", async () => {
    vi.useFakeTimers();
    const pending = service.createIniSaveBackup(profile.id);
    await vi.advanceTimersByTimeAsync(2_000);
    const record = await pending;
    expect(record).not.toBeNull();
    expect(record?.type).toBe("ini_save");
    expect(record?.kind).toBe("ini");
  });

  it("restores world data (including profiles) without touching INI", async () => {
    const created = await service.createManualBackup(profile.id, ["world"]);
    const worldBackup = created[0];
    expect(worldBackup).toBeDefined();
    if (worldBackup === undefined) return;
    const liveWorld = join(
      installDir,
      "ShooterGame",
      "Saved",
      "SavedArks",
      "TheIsland_WP.ark",
    );
    const liveProfile = join(
      installDir,
      "ShooterGame",
      "Saved",
      "SavedArks",
      "76561198000000000.arkprofile",
    );
    const liveIni = join(
      installDir,
      "ShooterGame",
      "Saved",
      "Config",
      "WindowsServer",
      "Game.ini",
    );

    await writeFile(liveWorld, "CHANGED_WORLD", "utf8");
    await writeFile(liveProfile, "CHANGED_PLAYER", "utf8");
    await writeFile(liveIni, "CHANGED_INI", "utf8");

    await service.restoreBackup(profile.id, worldBackup.id);

    expect(await readFile(liveWorld, "utf8")).toBe("WORLD");
    // World backups include profiles, so restore replaces them too.
    expect(await readFile(liveProfile, "utf8")).toBe("PLAYER");
    expect(await readFile(liveIni, "utf8")).toBe("CHANGED_INI");
  });

  it("prunes by per-kind retain counts", async () => {
    repo.setPolicy({
      serverId: profile.id,
      enabled: false,
      intervalMinutes: 60,
      retainCountWorld: 2,
      retainCountPlayers: 20,
      retainCountIni: 1,
      backupDir: null,
    });

    await service.createManualBackup(profile.id, ["world"]);
    await service.createManualBackup(profile.id, ["world"]);
    await service.createManualBackup(profile.id, ["world"]);
    await service.createManualBackup(profile.id, ["ini"]);
    await service.createManualBackup(profile.id, ["ini"]);

    expect(repo.listCompleted(profile.id, "world")).toHaveLength(2);
    expect(repo.listCompleted(profile.id, "ini")).toHaveLength(1);
  });

  it("prunes player session backups per player key", async () => {
    repo.setPolicy({
      serverId: profile.id,
      enabled: false,
      intervalMinutes: 60,
      retainCountWorld: 20,
      retainCountPlayers: 1,
      retainCountIni: 10,
      backupDir: null,
    });

    await service.createPlayerSessionBackup(profile.id, "connect", "76561198000000000", "A");
    await service.createPlayerSessionBackup(profile.id, "disconnect", "76561198000000000", "A");
    await service.createPlayerSessionBackup(profile.id, "connect", "76561198000000001", "B");
    await service.createPlayerSessionBackup(profile.id, "disconnect", "76561198000000001", "B");

    const completed = repo.listCompleted(profile.id, "players");
    expect(completed).toHaveLength(2);
    const keys = new Set(completed.map((b) => playersRetentionKey(b)));
    expect(keys).toEqual(new Set(["76561198000000000", "76561198000000001"]));
  });

  it("scheduled cycle creates world only", async () => {
    repo.setPolicy({
      serverId: profile.id,
      enabled: true,
      intervalMinutes: 5,
      retainCountWorld: 20,
      retainCountPlayers: 20,
      retainCountIni: 10,
      backupDir: null,
    });
    const processes = {
      isActive: vi.fn(() => true),
      start: vi.fn(),
      stop: vi.fn(),
    } as unknown as ProcessManager;
    const servers = {
      get: vi.fn((id: string) => (id === profile.id ? profile : null)),
      list: vi.fn(() => [profile]),
      addEvent: vi.fn(),
    } as unknown as ServerRepository;
    const settings = {
      get: vi.fn(() => null),
      set: vi.fn(),
    } as unknown as AppSettingsRepository;
    const scheduled = new BackupService(
      servers,
      repo,
      processes,
      settings,
      join(installDir, "_root"),
    );

    await scheduled.runScheduledCycle();
    const list = repo.listBackups(profile.id, 20);
    expect(list.every((b) => b.kind === "world")).toBe(true);
    expect(list.some((b) => b.type === "scheduled")).toBe(true);
  });

  it("deletes a single backup from disk and db", async () => {
    const created = await service.createManualBackup(profile.id, ["ini"]);
    const record = created[0];
    expect(record).toBeDefined();
    if (record === undefined) return;
    const path = record.path;
    addEvent.mockClear();
    const deleted = await service.deleteBackups(profile.id, [record.id]);
    expect(deleted).toBe(1);
    expect(repo.getBackup(record.id)).toBeNull();
    await expect(access(path, fsConstants.F_OK)).rejects.toThrow();
    expect(addEvent).toHaveBeenCalledWith(
      profile.id,
      "backup_deleted",
      "info",
      expect.stringContaining("Backup deleted:"),
    );
    expect(addEvent).not.toHaveBeenCalledWith(
      profile.id,
      "backup_created",
      expect.anything(),
      expect.stringContaining("Backup deleted:"),
    );
  });

  it("deletes multiple selected backups", async () => {
    const created = await service.createManualBackup(profile.id, ["world", "players", "ini"]);
    expect(created).toHaveLength(3);
    const ids = created.map((b) => b.id);
    addEvent.mockClear();
    const deleted = await service.deleteBackups(profile.id, ids);
    expect(deleted).toBe(3);
    expect(repo.listBackups(profile.id, 50)).toHaveLength(0);
    expect(addEvent).toHaveBeenCalledTimes(3);
    for (const call of addEvent.mock.calls) {
      expect(call[1]).toBe("backup_deleted");
    }
  });

  it("records backup_deleted when retention prunes old backups", async () => {
    service.setPolicy(profile.id, {
      enabled: false,
      intervalMinutes: 60,
      retainCountWorld: 20,
      retainCountPlayers: 20,
      retainCountIni: 1,
      backupDir: null,
    });
    await service.createManualBackup(profile.id, ["ini"]);
    await service.createManualBackup(profile.id, ["ini"]);
    addEvent.mockClear();
    await service.createManualBackup(profile.id, ["ini"]);
    const deleteEvents = addEvent.mock.calls.filter((call) => call[1] === "backup_deleted");
    expect(deleteEvents.length).toBeGreaterThanOrEqual(1);
    expect(deleteEvents[0]?.[3]).toEqual(
      expect.stringContaining("removed by retention"),
    );
  });

  it("rejects deleting a running backup", async () => {
    const running = repo.createBackupStart({
      serverId: profile.id,
      type: "manual",
      kind: "world",
      path: join(installDir, "Backups", "running"),
      notes: null,
    });
    await expect(service.deleteBackups(profile.id, [running.id])).rejects.toThrow(
      /running/i,
    );
  });
});
