import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { constants as fsConstants, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDatabase } from "@backend/infra/db/database";
import { BackupRepository } from "@backend/infra/db/backup-repository";
import {
  BackupService,
  computeBackupServerHealth,
  formatPlayerSessionNotes,
  playersRetentionKey,
} from "@backend/domains/backups/backup-service";
import { extractZip } from "@backend/domains/backups/backup-archive";
import { rconExec } from "@backend/infra/rcon/rcon-client";
import type { ProcessManager } from "@backend/infra/process/process-manager";
import type { ServerRepository } from "@backend/infra/db/server-repository";
import type { AppSettingsRepository } from "@backend/infra/db/app-settings-repository";
import type { ServerProfile } from "@shared/types";
import type { DatabaseSync } from "node:sqlite";

vi.mock("@backend/infra/rcon/rcon-client", () => ({
  rconExec: vi.fn(async () => "ok"),
}));

const tmpDirs: string[] = [];

async function withExtractedZip(
  zipPath: string,
  fn: (root: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "ark-bak-extract-"));
  tmpDirs.push(root);
  await extractZip(zipPath, root);
  await fn(root);
}

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
  let isActive: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    db = openDatabase(":memory:");
    repo = new BackupRepository(db);
    installDir = await mkdtemp(join(tmpdir(), "ark-backup-"));
    tmpDirs.push(installDir);
    await seedInstall(installDir);
    profile = makeProfile(installDir);

    addEvent = vi.fn();
    isActive = vi.fn(() => false);
    vi.mocked(rconExec).mockClear();
    vi.mocked(rconExec).mockResolvedValue("ok");
    const servers = {
      get: vi.fn((id: string) => (id === profile.id ? profile : null)),
      list: vi.fn(() => [profile]),
      addEvent,
    } as unknown as ServerRepository;

    const processes = {
      isActive,
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

  it("packages world including player profiles as a zip under World/", async () => {
    const created = await service.createManualBackup(profile.id, ["world"]);
    const record = created[0];
    expect(record).toBeDefined();
    if (record === undefined) return;
    expect(record.kind).toBe("world");
    expect(record.path.toLowerCase().endsWith(".zip")).toBe(true);
    expect(record.path).toMatch(/[\\/]World[\\/]/i);
    await withExtractedZip(record.path, async (root) => {
      await expect(
        access(join(root, "SavedArks", "TheIsland_WP.ark"), fsConstants.F_OK),
      ).resolves.toBeUndefined();
      await expect(
        access(join(root, "SavedArks", "76561198000000000.arkprofile"), fsConstants.F_OK),
      ).resolves.toBeUndefined();
      const manifest = JSON.parse(
        await readFile(join(root, "manifest.json"), "utf8"),
      ) as { backup: { kind: string } };
      expect(manifest.backup.kind).toBe("world");
    });
  });

  it("packages players profiles only", async () => {
    const created = await service.createManualBackup(profile.id, ["players"]);
    const record = created[0];
    expect(record).toBeDefined();
    if (record === undefined) return;
    expect(record.kind).toBe("players");
    expect(record.path).toMatch(/[\\/]Player profiles[\\/]/i);
    expect(record.path.toLowerCase().endsWith(".zip")).toBe(true);
    await withExtractedZip(record.path, async (root) => {
      await expect(
        access(
          join(root, "PlayerProfiles", "SavedArks", "76561198000000000.arkprofile"),
          fsConstants.F_OK,
        ),
      ).resolves.toBeUndefined();
      await expect(
        access(join(root, "PlayerProfiles", "SavedArks", "TheIsland_WP.ark"), fsConstants.F_OK),
      ).rejects.toThrow();
    });
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
    expect(rconExec).not.toHaveBeenCalled();
    await withExtractedZip(record.path, async (root) => {
      await expect(
        access(
          join(root, "PlayerProfiles", "SavedArks", "76561198000000000.arkprofile"),
          fsConstants.F_OK,
        ),
      ).resolves.toBeUndefined();
      await expect(
        access(
          join(root, "PlayerProfiles", "SavedArks", "76561198000000001.arkprofile"),
          fsConstants.F_OK,
        ),
      ).rejects.toThrow();
    });
  });

  it("flushes SaveWorld before player session backup when server is running", async () => {
    isActive.mockReturnValue(true);
    const record = await service.createPlayerSessionBackup(
      profile.id,
      "disconnect",
      "76561198000000000",
      "Alice",
    );
    expect(record).not.toBeNull();
    expect(rconExec).toHaveBeenCalledWith(
      "127.0.0.1",
      profile.rconPort,
      profile.adminPassword,
      "SaveWorld",
    );
  });

  it("does not match other player profiles that share an id prefix", async () => {
    const savedArks = join(installDir, "ShooterGame", "Saved", "SavedArks");
    await writeFile(join(savedArks, "765611980000000001.arkprofile"), "PREFIXED", "utf8");

    const record = await service.createPlayerSessionBackup(
      profile.id,
      "connect",
      "76561198000000000",
      "Alice",
    );
    expect(record).not.toBeNull();
    if (record === null) return;
    await withExtractedZip(record.path, async (root) => {
      await expect(
        access(
          join(root, "PlayerProfiles", "SavedArks", "76561198000000000.arkprofile"),
          fsConstants.F_OK,
        ),
      ).resolves.toBeUndefined();
      await expect(
        access(
          join(root, "PlayerProfiles", "SavedArks", "765611980000000001.arkprofile"),
          fsConstants.F_OK,
        ),
      ).rejects.toThrow();
    });
  });

  it("discards empty player session backups without retaining them", async () => {
    repo.setPolicy({
      serverId: profile.id,
      enabled: false,
      intervalMinutes: 60,
      retainCountWorld: 20,
      retainCountPlayers: 1,
      retainCountIni: 10,
      backupDir: null,
    });

    const empty = await service.createPlayerSessionBackup(
      profile.id,
      "connect",
      "76561198001111111",
      "Ghost",
    );
    expect(empty).toBeNull();
    expect(repo.listCompleted(profile.id, "players")).toHaveLength(0);
    expect(addEvent).not.toHaveBeenCalledWith(
      profile.id,
      "backup_created",
      expect.anything(),
      expect.anything(),
    );

    const kept = await service.createPlayerSessionBackup(
      profile.id,
      "connect",
      "76561198000000000",
      "Alice",
    );
    expect(kept).not.toBeNull();
    expect(repo.listCompleted(profile.id, "players")).toHaveLength(1);
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
    await withExtractedZip(record.path, async (root) => {
      await expect(
        access(
          join(root, "PlayerProfiles", "SavedArks", "76561198009999999.arkprofile"),
          fsConstants.F_OK,
        ),
      ).resolves.toBeUndefined();
      expect(
        await readFile(
          join(root, "PlayerProfiles", "SavedArks", "76561198009999999.arkprofile"),
          "utf8",
        ),
      ).toBe("LATE_FLUSH");
    });
  });

  it("packages only Game.ini and GameUserSettings.ini", async () => {
    const created = await service.createManualBackup(profile.id, ["ini"]);
    const record = created[0];
    expect(record).toBeDefined();
    if (record === undefined) return;
    expect(record.kind).toBe("ini");
    expect(record.path).toMatch(/[\\/]INI[\\/]/);
    expect(record.path.toLowerCase().endsWith(".zip")).toBe(true);
    await withExtractedZip(record.path, async (root) => {
      await expect(
        access(join(root, "ConfigWindowsServer", "Game.ini"), fsConstants.F_OK),
      ).resolves.toBeUndefined();
      await expect(
        access(
          join(root, "ConfigWindowsServer", "GameUserSettings.ini"),
          fsConstants.F_OK,
        ),
      ).resolves.toBeUndefined();
      await expect(
        access(join(root, "ConfigWindowsServer", "Engine.ini"), fsConstants.F_OK),
      ).rejects.toThrow();
    });
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

  it("scheduled cycle measures interval from completedAt, not createdAt", async () => {
    repo.setPolicy({
      serverId: profile.id,
      enabled: true,
      intervalMinutes: 60,
      retainCountWorld: 20,
      retainCountPlayers: 20,
      retainCountIni: 10,
      backupDir: null,
    });
    const first = (await service.createManualBackup(profile.id, ["world"]))[0]!;
    // Started long ago, but finished recently — must not schedule again yet.
    db.prepare(`UPDATE backups SET created_at = ?, completed_at = ? WHERE id = ?`).run(
      new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      first.id,
    );

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
    expect(repo.listCompleted(profile.id, "world")).toHaveLength(1);
    expect(repo.listCompleted(profile.id, "world")[0]?.id).toBe(first.id);
  });

  it("imports orphan zip archives from disk on list/refresh", async () => {
    const created = await service.createManualBackup(profile.id, ["players"]);
    const record = created[0];
    expect(record).toBeDefined();
    if (record === undefined) return;

    // Simulate DB loss while the zip remains on disk.
    repo.deleteBackupRecord(record.id);
    expect(repo.listBackups(profile.id, 50)).toHaveLength(0);

    const listed = await service.list(profile.id, 50);
    expect(listed.some((b) => b.path === record.path)).toBe(true);
    expect(listed.find((b) => b.path === record.path)?.kind).toBe("players");
  });

  it("does not import unrelated zips that lack backup layout", async () => {
    const worldDir = join(installDir, "Backups", "World");
    await mkdir(worldDir, { recursive: true });
    const noiseSrc = join(installDir, "_noise-src");
    await mkdir(noiseSrc, { recursive: true });
    await writeFile(join(noiseSrc, "notes.txt"), "random archive", "utf8");
    const { zipDirectory } = await import("@backend/domains/backups/backup-archive");
    const noiseZip = join(worldDir, "random-notes.zip");
    await zipDirectory(noiseSrc, noiseZip);

    const listed = await service.list(profile.id, 50);
    expect(listed.some((row) => row.path === noiseZip)).toBe(false);
    expect(repo.getBackupByPath(profile.id, noiseZip)).toBeNull();
  });

  it("drops DB rows when the archive was deleted from disk", async () => {
    const created = await service.createManualBackup(profile.id, ["ini"]);
    const record = created[0];
    expect(record).toBeDefined();
    if (record === undefined) return;
    expect(existsSync(record.path)).toBe(true);

    await rm(record.path, { force: true });
    expect(existsSync(record.path)).toBe(false);
    expect(repo.getBackup(record.id)).not.toBeNull();

    const listed = await service.list(profile.id, 50);
    expect(listed.some((b) => b.id === record.id)).toBe(false);
    expect(repo.getBackup(record.id)).toBeNull();
  });

  it("keeps failed backup rows even when the zip was cleaned up", async () => {
    const started = repo.createBackupStart({
      serverId: profile.id,
      type: "manual",
      kind: "world",
      path: join(installDir, "Backups", "World", "missing-failed.zip"),
      notes: null,
    });
    const failed = repo.failBackup(started.id, "zip write failed");
    expect(failed?.status).toBe("failed");
    expect(existsSync(started.path)).toBe(false);

    const listed = await service.list(profile.id, 50);
    expect(listed.some((b) => b.id === started.id && b.status === "failed")).toBe(true);
    expect(repo.getBackup(started.id)?.notes).toContain("zip write failed");
  });

  it("does not double-import the same orphan zip under concurrent list calls", async () => {
    const created = await service.createManualBackup(profile.id, ["players"]);
    const record = created[0];
    expect(record).toBeDefined();
    if (record === undefined) return;

    repo.deleteBackupRecord(record.id);
    expect(repo.listBackups(profile.id, 50)).toHaveLength(0);

    const [a, b] = await Promise.all([
      service.list(profile.id, 50),
      service.list(profile.id, 50),
    ]);
    const matchesA = a.filter((row) => row.path === record.path);
    const matchesB = b.filter((row) => row.path === record.path);
    expect(matchesA).toHaveLength(1);
    expect(matchesB).toHaveLength(1);
    expect(repo.listBackups(profile.id, 50).filter((row) => row.path === record.path)).toHaveLength(
      1,
    );
  });

  it("recovers interrupted running backups that already have a zip on disk", async () => {
    const created = await service.createManualBackup(profile.id, ["world"]);
    const record = created[0];
    expect(record).toBeDefined();
    if (record === undefined) return;
    expect(existsSync(record.path)).toBe(true);

    // Crash after zip write, before completeBackup — row stays running.
    db.prepare(
      `UPDATE backups SET status = 'running', completed_at = NULL, size_bytes = 0 WHERE id = ?`,
    ).run(record.id);
    expect(repo.getBackup(record.id)?.status).toBe("running");

    const listed = await service.list(profile.id, 50);
    const recovered = listed.find((row) => row.id === record.id);
    expect(recovered?.status).toBe("completed");
    expect(recovered?.sizeBytes).toBeGreaterThan(0);
    expect(repo.getBackup(record.id)?.status).toBe("completed");
  });

  it("promotes interrupted running zips with archive mtime, not wall-clock now", async () => {
    const { utimes, stat } = await import("node:fs/promises");
    const created = await service.createManualBackup(profile.id, ["world"]);
    const older = created[0];
    expect(older).toBeDefined();
    if (older === undefined) return;

    // Crash after zip write — leave row running.
    db.prepare(
      `UPDATE backups SET status = 'running', completed_at = NULL, size_bytes = 0 WHERE id = ?`,
    ).run(older.id);

    // Archive finished in the past (before a newer completed backup).
    const finishedAt = new Date("2026-07-20T12:00:00.000Z");
    await utimes(older.path, finishedAt, finishedAt);

    const newer = await service.createManualBackup(profile.id, ["world"]);
    const newerRecord = newer[0];
    expect(newerRecord).toBeDefined();
    if (newerRecord === undefined) return;
    // Force a finish time after the recovered archive but before "now".
    db.prepare(`UPDATE backups SET completed_at = ? WHERE id = ?`).run(
      "2026-07-24T12:00:00.000Z",
      newerRecord.id,
    );

    const listed = await service.list(profile.id, 50);
    const recovered = listed.find((row) => row.id === older.id);
    expect(recovered?.status).toBe("completed");
    const info = await stat(older.path);
    expect(recovered?.completedAt).toBe(info.mtime.toISOString());
    // Recovered older archive must sort after the newer completed one.
    expect(listed.map((row) => row.id).slice(0, 2)).toEqual([
      newerRecord.id,
      older.id,
    ]);
  });

  it("fails stuck running backups with no zip on reconcile", async () => {
    const stuck = repo.createBackupStart({
      serverId: profile.id,
      type: "manual",
      kind: "world",
      path: join(installDir, "Backups", "World", "never-written.zip"),
      notes: "staging crash",
    });
    expect(existsSync(stuck.path)).toBe(false);
    expect(stuck.status).toBe("running");

    const listed = await service.list(profile.id, 50);
    const row = listed.find((item) => item.id === stuck.id);
    expect(row?.status).toBe("failed");
    expect(repo.getBackup(stuck.id)?.status).toBe("failed");
    expect(repo.getBackup(stuck.id)?.notes).toMatch(/before archive was written/i);
  });

  it("does not promote an unreadable partial zip to completed", async () => {
    const zipPath = join(installDir, "Backups", "World", "partial-write.zip");
    await mkdir(join(installDir, "Backups", "World"), { recursive: true });
    await writeFile(zipPath, "not-a-real-zip-but-nonempty", "utf8");

    const stuck = repo.createBackupStart({
      serverId: profile.id,
      type: "manual",
      kind: "world",
      path: zipPath,
      notes: "killed mid-write",
    });

    const listed = await service.list(profile.id, 50);
    const row = listed.find((item) => item.id === stuck.id);
    expect(row?.status).toBe("failed");
    expect(repo.getBackup(stuck.id)?.status).toBe("failed");
    expect(existsSync(zipPath)).toBe(false);
  });

  it("does not promote a readable non-backup zip left on a running path", async () => {
    const worldDir = join(installDir, "Backups", "World");
    await mkdir(worldDir, { recursive: true });
    const noiseSrc = join(installDir, "_noise-running");
    await mkdir(noiseSrc, { recursive: true });
    await writeFile(join(noiseSrc, "notes.txt"), "not a backup layout", "utf8");
    const { zipDirectory } = await import("@backend/domains/backups/backup-archive");
    const zipPath = join(worldDir, "running-noise.zip");
    await zipDirectory(noiseSrc, zipPath);

    const stuck = repo.createBackupStart({
      serverId: profile.id,
      type: "manual",
      kind: "world",
      path: zipPath,
      notes: "path reused by unrelated zip",
    });

    const listed = await service.list(profile.id, 50);
    expect(listed.find((item) => item.id === stuck.id)?.status).toBe("failed");
    expect(repo.getBackup(stuck.id)?.status).toBe("failed");
    expect(existsSync(zipPath)).toBe(false);
  });

  it("keeps a completed backup when retention pruning fails", async () => {
    vi.spyOn(
      service as unknown as { applyRetention: (serverId: string, policy: unknown) => Promise<void> },
      "applyRetention",
    ).mockRejectedValue(new Error("disk full while pruning"));

    const created = await service.createManualBackup(profile.id, ["world"]);
    const record = created[0];
    expect(record).toBeDefined();
    if (record === undefined) return;

    expect(record.status).toBe("completed");
    expect(existsSync(record.path)).toBe(true);
    expect(repo.getBackup(record.id)?.status).toBe("completed");
    expect(addEvent).toHaveBeenCalledWith(
      profile.id,
      "error",
      "warning",
      expect.stringMatching(/retention failed/i),
      expect.objectContaining({
        what: expect.stringContaining("new backup was saved"),
      }),
    );
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

  it("builds a fleet summary with health and disk settings", async () => {
    await service.createManualBackup(profile.id, ["world"]);
    const summary = await service.getFleetSummary();
    expect(summary.servers).toHaveLength(1);
    expect(summary.servers[0]?.serverId).toBe(profile.id);
    expect(summary.stats.totalBackupBytes).toBeGreaterThan(0);
    expect(summary.diskSettings.warnUsedPercent).toBe(85);
    expect(summary.disks.length).toBeGreaterThanOrEqual(1);
  });

  it("shows the newest failed attempt as fleet latest, not an older success", async () => {
    const success = (await service.createManualBackup(profile.id, ["world"]))[0]!;
    const failed = repo.createBackupStart({
      serverId: profile.id,
      type: "scheduled",
      kind: "world",
      path: join(installDir, "Backups", "World", "newer-failed.zip"),
      notes: null,
    });
    repo.failBackup(failed.id, "disk full");
    // Order by finish time (completed_at), not job start.
    db.prepare(`UPDATE backups SET created_at = ?, completed_at = ? WHERE id = ?`).run(
      new Date(Date.now() - 120_000).toISOString(),
      new Date(Date.now() - 60_000).toISOString(),
      success.id,
    );
    db.prepare(`UPDATE backups SET created_at = ?, completed_at = ? WHERE id = ?`).run(
      new Date(Date.now() - 30_000).toISOString(),
      new Date().toISOString(),
      failed.id,
    );

    const summary = await service.getFleetSummary();
    expect(summary.servers[0]?.latest?.id).toBe(failed.id);
    expect(summary.servers[0]?.latest?.status).toBe("failed");
    expect(summary.servers[0]?.latestWorld?.id).toBe(success.id);
  });

  it("counts failed24h by failure time (completedAt), not job start", async () => {
    const oldStart = repo.createBackupStart({
      serverId: profile.id,
      type: "scheduled",
      kind: "world",
      path: join(installDir, "Backups", "World", "old-start-recent-fail.zip"),
      notes: null,
    });
    // Job started 2 days ago…
    db.prepare(`UPDATE backups SET created_at = ? WHERE id = ?`).run(
      new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      oldStart.id,
    );
    // …but failed just now.
    repo.failBackup(oldStart.id, "late failure");

    const ancient = repo.createBackupStart({
      serverId: profile.id,
      type: "scheduled",
      kind: "world",
      path: join(installDir, "Backups", "World", "ancient-fail.zip"),
      notes: null,
    });
    repo.failBackup(ancient.id, "old failure");
    db.prepare(
      `UPDATE backups SET created_at = ?, completed_at = ? WHERE id = ?`,
    ).run(
      new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      ancient.id,
    );

    const summary = await service.getFleetSummary();
    expect(summary.servers[0]?.counts.failed24h).toBe(1);
    expect(summary.stats.failed24h).toBe(1);
    expect(summary.alerts.some((alert) => /failed (world )?backup/i.test(alert.message))).toBe(
      true,
    );
  });

  it("does not mark fleet health critical for failed INI/player when world is healthy", async () => {
    await service.createManualBackup(profile.id, ["world"]);
    const failedIni = repo.createBackupStart({
      serverId: profile.id,
      type: "ini_save",
      kind: "ini",
      path: join(installDir, "Backups", "INI", "failed-ini.zip"),
      notes: null,
    });
    repo.failBackup(failedIni.id, "ini boom");
    const failedPlayers = repo.createBackupStart({
      serverId: profile.id,
      type: "manual",
      kind: "players",
      path: join(installDir, "Backups", "Player profiles", "failed-players.zip"),
      notes: null,
    });
    repo.failBackup(failedPlayers.id, "players boom");

    const summary = await service.getFleetSummary();
    expect(summary.servers[0]?.counts.failed24h).toBe(2);
    expect(summary.servers[0]?.health).toBe("warning");
    expect(summary.servers[0]?.latestWorld?.status).toBe("completed");
    const failedAlert = summary.alerts.find((alert) => alert.id === `failed:${profile.id}`);
    expect(failedAlert?.severity).toBe("warning");
    expect(failedAlert?.message).toMatch(/non-world/i);
  });

  it("previews and runs cleanup for failed backups while protecting newest world", async () => {
    const created = await service.createManualBackup(profile.id, ["world"]);
    const world = created[0]!;
    const failed = repo.createBackupStart({
      serverId: profile.id,
      type: "manual",
      kind: "world",
      path: join(installDir, "Backups", "World", "failed-world.zip"),
      notes: "boom",
    });
    repo.failBackup(failed.id, "boom");

    const preview = await service.previewCleanup({
      serverIds: null,
      includeFailed: true,
      enforceRetention: false,
      olderThanDays: null,
      keepLastPerKind: null,
      protectNewestWorld: true,
    });
    expect(preview.items.some((item) => item.backup.id === failed.id)).toBe(true);
    expect(preview.items.some((item) => item.backup.id === world.id)).toBe(false);

    const result = await service.runCleanup({
      serverIds: null,
      includeFailed: true,
      enforceRetention: false,
      olderThanDays: null,
      keepLastPerKind: null,
      protectNewestWorld: true,
      confirmedBackupIds: preview.items.map((item) => item.backup.id),
    });
    expect(result.deleted).toBe(1);
    expect(repo.getBackup(failed.id)).toBeNull();
    expect(repo.getBackup(world.id)).not.toBeNull();
  });

  it("runCleanup with confirmed ids does not delete newly created backups outside the preview", async () => {
    const failed = repo.createBackupStart({
      serverId: profile.id,
      type: "manual",
      kind: "world",
      path: join(installDir, "Backups", "World", "failed-old.zip"),
      notes: "boom",
    });
    repo.failBackup(failed.id, "boom");

    const preview = await service.previewCleanup({
      serverIds: null,
      includeFailed: true,
      enforceRetention: false,
      olderThanDays: null,
      keepLastPerKind: null,
      protectNewestWorld: true,
    });
    expect(preview.items.map((item) => item.backup.id)).toEqual([failed.id]);

    const newerFailed = repo.createBackupStart({
      serverId: profile.id,
      type: "manual",
      kind: "world",
      path: join(installDir, "Backups", "World", "failed-new.zip"),
      notes: "later",
    });
    repo.failBackup(newerFailed.id, "later");

    const result = await service.runCleanup({
      serverIds: null,
      includeFailed: true,
      enforceRetention: false,
      olderThanDays: null,
      keepLastPerKind: null,
      protectNewestWorld: true,
      confirmedBackupIds: preview.items.map((item) => item.backup.id),
    });
    expect(result.deleted).toBe(1);
    expect(repo.getBackup(failed.id)).toBeNull();
    expect(repo.getBackup(newerFailed.id)).not.toBeNull();
  });

  it("cleanup preview imports orphan backup zips before planning deletes", async () => {
    const first = (await service.createManualBackup(profile.id, ["world"]))[0]!;
    const second = (await service.createManualBackup(profile.id, ["world"]))[0]!;
    // DB lost both rows; zips remain — cleanup must reconcile then apply keep-last.
    repo.deleteBackupRecord(first.id);
    repo.deleteBackupRecord(second.id);
    expect(repo.listBackups(profile.id, 50)).toHaveLength(0);

    const preview = await service.previewCleanup({
      serverIds: [profile.id],
      includeFailed: false,
      enforceRetention: false,
      olderThanDays: null,
      keepLastPerKind: 1,
      protectNewestWorld: false,
    });
    expect(repo.listCompleted(profile.id, "world").length).toBeGreaterThanOrEqual(2);
    expect(preview.items).toHaveLength(1);
    expect(
      preview.items.every(
        (item) => item.backup.path === first.path || item.backup.path === second.path,
      ),
    ).toBe(true);
  });

  it("runCleanup re-applies protectNewestWorld when confirming preview ids", async () => {
    const older = (await service.createManualBackup(profile.id, ["world"]))[0]!;
    const middle = (await service.createManualBackup(profile.id, ["world"]))[0]!;
    const newest = (await service.createManualBackup(profile.id, ["world"]))[0]!;

    const ageDays = (id: string, days: number) => {
      const iso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      db.prepare(`UPDATE backups SET created_at = ?, completed_at = ? WHERE id = ?`).run(
        iso,
        iso,
        id,
      );
    };
    ageDays(older.id, 5);
    ageDays(middle.id, 3);
    ageDays(newest.id, 0);

    const preview = await service.previewCleanup({
      serverIds: [profile.id],
      includeFailed: false,
      enforceRetention: false,
      olderThanDays: 1,
      keepLastPerKind: null,
      protectNewestWorld: true,
    });
    const previewIds = preview.items.map((item) => item.backup.id);
    expect(previewIds).toEqual(expect.arrayContaining([older.id, middle.id]));
    expect(previewIds).not.toContain(newest.id);

    // Newest world disappears after preview — middle becomes the protected world.
    await rm(newest.path, { force: true });
    repo.deleteBackupRecord(newest.id);

    const result = await service.runCleanup({
      serverIds: [profile.id],
      includeFailed: false,
      enforceRetention: false,
      olderThanDays: 1,
      keepLastPerKind: null,
      protectNewestWorld: true,
      confirmedBackupIds: previewIds,
    });
    expect(result.deleted).toBe(1);
    expect(repo.getBackup(older.id)).toBeNull();
    expect(repo.getBackup(middle.id)).not.toBeNull();
  });

  it("keepLastPerKind cleanup retains N archives per player, not globally", async () => {
    const playerA = "76561198000000000";
    const playerB = "76561198000000001";
    const playersDir = join(installDir, "Backups", "Player profiles");
    await mkdir(playersDir, { recursive: true });
    const mkPlayer = async (eos: string, stamp: string) => {
      const path = join(playersDir, `${eos}-${stamp}.zip`);
      // Reconcile during cleanup prunes completed rows whose archive is missing.
      await writeFile(path, "placeholder-zip", "utf8");
      const record = repo.createBackupStart({
        serverId: profile.id,
        type: "player_disconnect",
        kind: "players",
        path,
        notes: formatPlayerSessionNotes("disconnect", eos, eos),
      });
      return repo.completeBackup(record.id, 100)!;
    };

    const a1 = await mkPlayer(playerA, "a1");
    const a2 = await mkPlayer(playerA, "a2");
    const a3 = await mkPlayer(playerA, "a3");
    const b1 = await mkPlayer(playerB, "b1");
    const b2 = await mkPlayer(playerB, "b2");

    // Newest-first by finish time: a3, a2, a1 and b2, b1.
    const ordered = [a3, a2, a1, b2, b1];
    for (let i = 0; i < ordered.length; i += 1) {
      const backup = ordered[i]!;
      const iso = new Date(Date.now() - i * 60_000).toISOString();
      db.prepare(`UPDATE backups SET created_at = ?, completed_at = ? WHERE id = ?`).run(
        iso,
        iso,
        backup.id,
      );
    }

    const preview = await service.previewCleanup({
      serverIds: [profile.id],
      includeFailed: false,
      enforceRetention: false,
      olderThanDays: null,
      keepLastPerKind: 2,
      protectNewestWorld: false,
    });
    const markedIds = new Set(preview.items.map((item) => item.backup.id));
    // Keep 2 newest for A (a3, a2) and 2 for B (b2, b1) → only a1 is excess.
    expect(markedIds.has(a1.id)).toBe(true);
    expect(markedIds.has(a2.id)).toBe(false);
    expect(markedIds.has(a3.id)).toBe(false);
    expect(markedIds.has(b1.id)).toBe(false);
    expect(markedIds.has(b2.id)).toBe(false);
    expect(
      preview.items.every((item) => item.reason.includes("keep last 2/players")),
    ).toBe(true);
  });
});

describe("computeBackupServerHealth", () => {
  it("does not mark schedule-on servers without a world backup as protected", () => {
    expect(
      computeBackupServerHealth({
        destinationOk: true,
        stale: true,
        failed24h: 0,
        failedWorld24h: 0,
        scheduleEnabled: true,
        hasWorldBackup: false,
        serverRunning: false,
      }),
    ).toBe("warning");

    expect(
      computeBackupServerHealth({
        destinationOk: true,
        stale: false,
        failed24h: 0,
        failedWorld24h: 0,
        scheduleEnabled: true,
        hasWorldBackup: false,
        serverRunning: true,
      }),
    ).toBe("warning");
  });

  it("returns ok only when destination is fine and world coverage exists", () => {
    expect(
      computeBackupServerHealth({
        destinationOk: true,
        stale: false,
        failed24h: 0,
        failedWorld24h: 0,
        scheduleEnabled: true,
        hasWorldBackup: true,
        serverRunning: false,
      }),
    ).toBe("ok");
  });

  it("treats failed world backups as critical, but INI/player failures as warning", () => {
    expect(
      computeBackupServerHealth({
        destinationOk: true,
        stale: false,
        failed24h: 1,
        failedWorld24h: 1,
        scheduleEnabled: true,
        hasWorldBackup: true,
        serverRunning: true,
      }),
    ).toBe("critical");

    expect(
      computeBackupServerHealth({
        destinationOk: true,
        stale: false,
        failed24h: 2,
        failedWorld24h: 0,
        scheduleEnabled: true,
        hasWorldBackup: true,
        serverRunning: true,
      }),
    ).toBe("warning");
  });
});
