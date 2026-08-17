import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { constants as fsConstants, existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
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
import type { BackupRecord, ServerProfile } from "@shared/types";
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
    enabled: true,
    autoStart: false,
    sessionName: "Island",
    maxPlayers: 70,
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

/** Active process mock with startedAt old enough for schedule grace by default. */
function mockActiveProcesses(
  startedAgoMs = 60 * 60 * 1000,
): ProcessManager {
  const startedAt = new Date(Date.now() - startedAgoMs).toISOString();
  return {
    applyRuntimePorts: vi.fn((p: ServerProfile) => p),
    isActive: vi.fn(() => true),
    getStatus: vi.fn(() => ({
      serverId: "srv-1",
      status: "running" as const,
      pid: 4242,
      startedAt,
      lastError: null,
    })),
    start: vi.fn(),
    stop: vi.fn(),
  } as unknown as ProcessManager;
}

async function seedInstall(installDir: string): Promise<void> {
  const savedArks = join(installDir, "ShooterGame", "Saved", "SavedArks");
  const mapDir = join(savedArks, "TheIsland_WP");
  const config = join(
    installDir,
    "ShooterGame",
    "Saved",
    "Config",
    "WindowsServer",
  );
  const binaries = join(installDir, "ShooterGame", "Binaries", "Win64");
  await mkdir(mapDir, { recursive: true });
  await mkdir(config, { recursive: true });
  await mkdir(binaries, { recursive: true });
  // Non-empty exe so classifyInstallHealth reports Ready.
  await writeFile(join(binaries, "ArkAscendedServer.exe"), "MZ-fake-exe", "utf8");
  await writeFile(join(mapDir, "TheIsland_WP.ark"), "WORLD", "utf8");
  await writeFile(join(mapDir, "TheIsland_WP.ark.bak"), "WORLD_BAK", "utf8");
  await writeFile(join(mapDir, "tribe.arktribe"), "TRIBE", "utf8");
  await writeFile(join(mapDir, "76561198000000000.arkprofile"), "PLAYER", "utf8");
  await writeFile(join(mapDir, "76561198000000001.arkprofile"), "PLAYER2", "utf8");
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
      applyRuntimePorts: vi.fn((p: ServerProfile) => p),
    } as unknown as ProcessManager;

    const settingsStore = new Map<string, string | null>();
    const settings = {
      get: vi.fn((key: string) => settingsStore.get(key) ?? null),
      set: vi.fn((key: string, value: string | null) => {
        settingsStore.set(key, value);
      }),
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

  it("resumes a pre-update critical job without duplicating completed kinds", async () => {
    const now = new Date().toISOString();
    const job = {
      id: "critical-pre-update-1",
      type: "pre-update-backup" as const,
      serverId: profile.id,
      backupId: null,
      attempts: 0,
      maxAttempts: 3,
      status: "running" as const,
      phase: "creating-backup:world",
      createdAt: now,
      updatedAt: now,
      lastError: null,
      recoveryReason: null,
      idempotencyKey: `pre-update-backup:${profile.id}:`,
      operatorRetryAllowed: false,
      context: {} as {
        completedBackupIds?: string[];
        nextKindIndex?: number;
      },
    };
    const recovery = service as unknown as {
      resumePreUpdateBackupJob: (input: typeof job) => Promise<unknown[]>;
    };

    const first = await recovery.resumePreUpdateBackupJob(job);
    expect(first).toHaveLength(2);
    expect(job.context).toMatchObject({ nextKindIndex: 2 });

    // Simulate a crash before the latest in-memory checkpoint was persisted.
    job.context = {};
    const resumed = await recovery.resumePreUpdateBackupJob(job);
    expect(resumed).toHaveLength(2);
    expect(repo.listBackups(profile.id, 100).filter((row) => row.type === "pre_update"))
      .toHaveLength(2);
  });

  it("rebuilds pre-update progress when persisted context is corrupt", async () => {
    const [unrelated] = await service.createManualBackup(profile.id, ["world"]);
    expect(unrelated).toBeDefined();
    if (unrelated === undefined) return;

    const now = new Date().toISOString();
    const job = {
      id: "critical-pre-update-corrupt",
      type: "pre-update-backup" as const,
      serverId: profile.id,
      backupId: null,
      attempts: 1,
      maxAttempts: 3,
      status: "running" as const,
      phase: "reconciling-backups",
      createdAt: now,
      updatedAt: now,
      lastError: null,
      recoveryReason: null,
      idempotencyKey: `pre-update-backup:${profile.id}:`,
      operatorRetryAllowed: false,
      context: {
        completedBackupIds: [unrelated.id],
        nextKindIndex: 99,
      },
    };
    const recovery = service as unknown as {
      resumePreUpdateBackupJob: (input: typeof job) => Promise<BackupRecord[]>;
    };

    const recovered = await recovery.resumePreUpdateBackupJob(job);

    expect(recovered.map((backup) => backup.kind)).toEqual([
      "world",
      "ini",
    ]);
    expect(recovered.every((backup) =>
      backup.type === "pre_update"
      && backup.serverId === profile.id
      && backup.notes?.includes(`[critical-job:${job.id}]`) === true,
    )).toBe(true);
    expect(job.context.nextKindIndex).toBe(2);
    expect(job.context.completedBackupIds).toEqual(
      recovered.map((backup) => backup.id),
    );
    expect(job.context.completedBackupIds).not.toContain(unrelated.id);
  });

  it("reconciles restore history and safeguard evidence without repeating a completed restore", async () => {
    const [source] = await service.createManualBackup(profile.id, ["world"]);
    expect(source).toBeDefined();
    if (source === undefined) return;

    const now = new Date().toISOString();
    const job = {
      id: "critical-restore-1",
      type: "restore" as const,
      serverId: profile.id,
      backupId: source.id,
      attempts: 1,
      maxAttempts: 3,
      status: "running" as const,
      phase: "restore-history-started",
      createdAt: now,
      updatedAt: now,
      lastError: null,
      recoveryReason: null,
      idempotencyKey: `restore:${profile.id}:${source.id}`,
      operatorRetryAllowed: false,
      context: {} as {
        restoreHistoryId?: number;
        safeguardBackupIds?: string[];
      },
    };
    const recovery = service as unknown as {
      resumeRestoreJob: (input: typeof job) => Promise<void>;
    };

    await recovery.resumeRestoreJob(job);
    const historyId = job.context.restoreHistoryId;
    expect(historyId).toBeTypeOf("number");
    expect(repo.getRestoreHistory(historyId!)).toMatchObject({ status: "completed" });
    expect(
      repo.listBackups(profile.id, 100).filter(
        (row) => row.type === "pre_restore" && row.notes?.includes(job.id),
      ),
    ).toHaveLength(1);

    // A restart can observe completed durable history before the queue row is
    // removed. Re-entering recovery must reconcile, not apply the restore again.
    const applyRestore = vi.spyOn(
      service as unknown as { applyRestore: () => Promise<void> },
      "applyRestore",
    );
    await recovery.resumeRestoreJob(job);
    expect(applyRestore).not.toHaveBeenCalled();
  });

  it("requires on-disk archives when reusing persisted pre-update backup evidence", async () => {
    const backups = await service.createPreUpdateBackupForJob(profile.id);
    expect(backups).toHaveLength(2);
    const removed = backups[0];
    expect(removed).toBeDefined();
    if (removed === undefined) return;
    await rm(removed.path, { force: true });

    const completed = service.getCompletedBackupsForCriticalJob(
      profile.id,
      backups.map((backup) => backup.id),
    );
    expect(completed).toHaveLength(1);
    expect(completed.every((backup) => existsSync(backup.path))).toBe(true);
  });

  it("ignores a legacy players id when collecting critical pre-update evidence (#275)", async () => {
    const critical = await service.createPreUpdateBackupForJob(profile.id);
    expect(critical.map((backup) => backup.kind)).toEqual(["world", "ini"]);

    const playersPath = join(installDir, "Backups", "legacy-players-pre-update.zip");
    await mkdir(dirname(playersPath), { recursive: true });
    await writeFile(playersPath, "players", "utf8");
    const players = repo.createBackupStart({
      serverId: profile.id,
      type: "pre_update",
      kind: "players",
      path: playersPath,
      notes: "legacy pre-update players",
    });
    repo.completeBackup(players.id, 7);

    const completed = service.getCompletedBackupsForCriticalJob(profile.id, [
      critical[0]!.id,
      players.id,
      critical[1]!.id,
    ]);
    expect(completed.map((backup) => backup.kind)).toEqual(["world", "ini"]);
    expect(completed.map((backup) => backup.id)).toEqual([
      critical[0]!.id,
      critical[1]!.id,
    ]);
  });

  it("quarantines a recovered restore job when restoreHistory points to unrelated evidence", async () => {
    const [source] = await service.createManualBackup(profile.id, ["world"]);
    expect(source).toBeDefined();
    if (source === undefined) return;

    const unrelatedHistoryId = repo.insertRestoreHistory({
      serverId: profile.id,
      backupId: source.id,
      status: "started",
      notes: "[critical-job:another-job]",
    });
    repo.completeRestoreHistory(unrelatedHistoryId, "completed", "[critical-job:another-job]");

    const now = new Date().toISOString();
    const rawQueue = JSON.stringify([
      {
        id: "restore-mismatch",
        type: "restore",
        serverId: profile.id,
        backupId: source.id,
        attempts: 1,
        maxAttempts: 3,
        status: "running",
        phase: "applying-restore",
        createdAt: now,
        updatedAt: now,
        lastError: null,
        recoveryReason: null,
        idempotencyKey: `restore:${profile.id}:${source.id}`,
        operatorRetryAllowed: false,
        context: {
          restoreHistoryId: unrelatedHistoryId,
        },
      },
    ]);
    const settings = {
      get: vi.fn((key: string) => (key === "backupCriticalJobsQueue.v1" ? rawQueue : null)),
      set: vi.fn(),
    } as unknown as AppSettingsRepository;
    const servers = {
      get: vi.fn((id: string) => (id === profile.id ? profile : null)),
      list: vi.fn(() => [profile]),
      addEvent: vi.fn(),
    } as unknown as ServerRepository;
    const processes = {
      applyRuntimePorts: vi.fn((p: ServerProfile) => p),
      isActive: vi.fn(() => false),
      start: vi.fn(),
      stop: vi.fn(),
    } as unknown as ProcessManager;

    const recovered = new BackupService(
      servers,
      repo,
      processes,
      settings,
      join(installDir, "_root"),
    );

    expect(recovered.getCriticalJobs()).toEqual([]);
    expect(settings.set).toHaveBeenCalledWith(
      expect.stringMatching(/^backupCriticalJobsQueue\.v1\.quarantine\./),
      rawQueue,
    );
  });

  it("blocks duplicate restore rows at the applying-restore phase", () => {
    const common = {
      type: "restore",
      serverId: profile.id,
      backupId: "backup-duplicate",
      attempts: 1,
      maxAttempts: 3,
      createdAt: "2026-08-01T00:00:00.000Z",
      lastError: null,
      recoveryReason: null,
      idempotencyKey: `restore:${profile.id}:backup-duplicate`,
      operatorRetryAllowed: false,
      context: {},
    };
    const duplicateRows = [
      {
        ...common,
        id: "restore-applying",
        status: "blocked",
        phase: "applying-restore",
        updatedAt: "2026-08-01T00:01:00.000Z",
      },
      {
        ...common,
        id: "restore-stale",
        status: "pending",
        phase: "queued",
        updatedAt: "2026-08-01T00:02:00.000Z",
      },
    ];
    const rawQueue = JSON.stringify(duplicateRows);
    const settings = {
      get: vi.fn((key: string) =>
        key === "backupCriticalJobsQueue.v1" ? rawQueue : null),
      set: vi.fn(),
    } as unknown as AppSettingsRepository;
    const servers = {
      get: vi.fn((id: string) => (id === profile.id ? profile : null)),
      list: vi.fn(() => [profile]),
      addEvent: vi.fn(),
    } as unknown as ServerRepository;
    const processes = {
      applyRuntimePorts: vi.fn((p: ServerProfile) => p),
      isActive: vi.fn(() => false),
    } as unknown as ProcessManager;

    const recovered = new BackupService(
      servers,
      repo,
      processes,
      settings,
      join(installDir, "_root"),
    );

    expect(recovered.getCriticalJobs()).toHaveLength(1);
    expect(recovered.getCriticalJobs()[0]).toMatchObject({
      status: "blocked",
      phase: "applying-restore",
      nextActions: ["retry", "dismiss"],
    });
    expect(settings.set).toHaveBeenCalledWith(
      expect.stringMatching(/^backupCriticalJobsQueue\.v1\.quarantine\./),
      rawQueue,
    );
  });

  it("blocks an in-process non-transient failure once restore application began", async () => {
    const now = new Date().toISOString();
    const job = {
      id: "restore-permission-failure",
      type: "restore" as const,
      serverId: profile.id,
      backupId: "backup-1",
      attempts: 0,
      maxAttempts: 3,
      status: "pending" as const,
      phase: "applying-restore",
      createdAt: now,
      updatedAt: now,
      lastError: null,
      recoveryReason: null,
      idempotencyKey: `restore:${profile.id}:backup-1`,
      operatorRetryAllowed: false,
      context: {},
    };
    const queueHarness = service as unknown as {
      queue: Array<typeof job>;
      processQueue: () => Promise<void>;
      resumeRestoreJob: (input: typeof job) => Promise<void>;
    };
    queueHarness.queue = [job];
    vi.spyOn(queueHarness, "resumeRestoreJob").mockRejectedValue(
      new Error("permission denied while copying SavedArks"),
    );

    await queueHarness.processQueue();

    expect(service.getCriticalJobs()[0]).toMatchObject({
      status: "blocked",
      phase: "applying-restore",
      nextActions: ["retry", "dismiss"],
    });
  });

  it.each(["blocked", "failed"] as const)(
    "adopts a nested %s retryable restore when its parent rollback is retried",
    async (status) => {
      const now = new Date().toISOString();
      const job = {
        id: `nested-restore-${status}`,
        type: "restore" as const,
        serverId: profile.id,
        backupId: "backup-from-update",
        attempts: 1,
        maxAttempts: 3,
        status,
        phase: status === "blocked" ? "applying-restore" : "failed",
        createdAt: now,
        updatedAt: now,
        lastError: "Interrupted while applying restore",
        recoveryReason: "Restore outcome is ambiguous.",
        idempotencyKey: `restore:${profile.id}:backup-from-update`,
        operatorRetryAllowed: true,
        context: {},
      };
      const queueHarness = service as unknown as {
        queue: Array<typeof job>;
        resumeRestoreJob: (input: typeof job) => Promise<void>;
      };
      queueHarness.queue = [job];
      const resumeRestoreJob = vi
        .spyOn(queueHarness, "resumeRestoreJob")
        .mockResolvedValue(undefined);

      await service.restoreBackupForRollbackRecovery(profile.id, job.backupId);

      expect(resumeRestoreJob).toHaveBeenCalledOnce();
      expect(service.getCriticalJobs()).toEqual([]);
    },
  );

  it("rejects create and restore when the install is not Ready", async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), "ark-backup-empty-"));
    tmpDirs.push(emptyDir);
    const emptyProfile = { ...makeProfile(emptyDir), id: "srv-empty", name: "Empty" };
    const servers = {
      get: vi.fn((id: string) => {
        if (id === profile.id) return profile;
        if (id === emptyProfile.id) return emptyProfile;
        return null;
      }),
      list: vi.fn(() => [profile, emptyProfile]),
      addEvent: vi.fn(),
    } as unknown as ServerRepository;
    const processes = {
      isActive: vi.fn(() => false),
      start: vi.fn(),
      stop: vi.fn(),
      applyRuntimePorts: vi.fn((p: ServerProfile) => p),
    } as unknown as ProcessManager;
    const settings = {
      get: vi.fn(() => null),
      set: vi.fn(),
    } as unknown as AppSettingsRepository;
    const gated = new BackupService(
      servers,
      repo,
      processes,
      settings,
      join(emptyDir, "_root"),
    );

    await expect(gated.createManualBackup(emptyProfile.id, ["world"])).rejects.toThrow(
      /Install server files/i,
    );

    const [ok] = await service.createManualBackup(profile.id, ["world"]);
    expect(ok).toBeDefined();
    if (ok === undefined) return;
    // Point restore at the empty profile by cloning the row's serverId is wrong —
    // restore uses mustServer(serverId) then apply to that install. Create a completed
    // backup row for the empty server by exporting/importing is heavy; instead assert
    // restore on empty profile with a catalogued archive copied in.
    const exportDir = await mkdtemp(join(tmpdir(), "ark-export-empty-"));
    tmpDirs.push(exportDir);
    const portable = await service.exportBackup(
      profile.id,
      ok.id,
      join(exportDir, "world.zip"),
    );
    const imported = await gated.importBackup(emptyProfile.id, "world", portable);
    await expect(gated.restoreBackup(emptyProfile.id, imported.id)).rejects.toThrow(
      /Install server files/i,
    );
  });

  it("packages world for the active map folder as a zip under World/", async () => {
    const created = await service.createManualBackup(profile.id, ["world"]);
    const record = created[0];
    expect(record).toBeDefined();
    if (record === undefined) return;
    expect(record.kind).toBe("world");
    expect(record.mapToken).toBe("TheIsland_WP");
    expect(record.path.toLowerCase().endsWith(".zip")).toBe(true);
    expect(record.path).toMatch(/[\\/]World[\\/]/i);
    expect(basename(record.path)).toMatch(
      /^island-world-manual-TheIsland_WP-\d{8}-\d{6}\.zip$/i,
    );
    await withExtractedZip(record.path, async (root) => {
      await expect(
        access(
          join(root, "SavedArks", "TheIsland_WP", "TheIsland_WP.ark"),
          fsConstants.F_OK,
        ),
      ).resolves.toBeUndefined();
      await expect(
        access(
          join(root, "SavedArks", "TheIsland_WP", "76561198000000000.arkprofile"),
          fsConstants.F_OK,
        ),
      ).resolves.toBeUndefined();
      const manifest = JSON.parse(
        await readFile(join(root, "manifest.json"), "utf8"),
      ) as { backup: { kind: string; mapToken?: string } };
      expect(manifest.backup.kind).toBe("world");
      expect(manifest.backup.mapToken).toBe("TheIsland_WP");
    });
  });

  it("resolves mod map folders without _WP and ignores leftover foreign .ark files", async () => {
    const savedArks = join(installDir, "ShooterGame", "Saved", "SavedArks");
    const svartDir = join(savedArks, "Svartalfheim");
    await mkdir(svartDir, { recursive: true });
    await writeFile(join(svartDir, "Svartalfheim_WP.ark"), "SVART", "utf8");
    await writeFile(
      join(svartDir, "Svartalfheim_WP_AntiCorruptionBackup.bak"),
      "BAK",
      "utf8",
    );
    await writeFile(join(svartDir, "Extinction_WP.ark"), "LEFTOVER", "utf8");

    const svartProfile = { ...profile, map: "Svartalfheim_WP", name: "Svart" };
    const servers = {
      get: vi.fn((id: string) => (id === svartProfile.id ? svartProfile : null)),
      list: vi.fn(() => [svartProfile]),
      addEvent,
    } as unknown as ServerRepository;
    const processes = {
      applyRuntimePorts: vi.fn((p: ServerProfile) => p),
      isActive,
      start: vi.fn(),
      stop: vi.fn(),
    } as unknown as ProcessManager;
    const settingsStore = new Map<string, string | null>();
    const settings = {
      get: vi.fn((key: string) => settingsStore.get(key) ?? null),
      set: vi.fn((key: string, value: string | null) => {
        settingsStore.set(key, value);
      }),
    } as unknown as AppSettingsRepository;
    const svartService = new BackupService(
      servers,
      repo,
      processes,
      settings,
      join(installDir, "_root"),
    );

    const created = await svartService.createManualBackup(svartProfile.id, ["world"]);
    const record = created[0];
    expect(record).toBeDefined();
    if (record === undefined) return;
    expect(record.mapToken).toBe("Svartalfheim_WP");
    expect(basename(record.path)).toMatch(
      /^svart-world-manual-Svartalfheim_WP-\d{8}-\d{6}\.zip$/i,
    );
    await withExtractedZip(record.path, async (root) => {
      await expect(
        access(
          join(root, "SavedArks", "Svartalfheim_WP", "Svartalfheim_WP.ark"),
          fsConstants.F_OK,
        ),
      ).resolves.toBeUndefined();
      await expect(
        access(
          join(root, "SavedArks", "Svartalfheim_WP", "Extinction_WP.ark"),
          fsConstants.F_OK,
        ),
      ).rejects.toThrow();
      const manifest = JSON.parse(
        await readFile(join(root, "manifest.json"), "utf8"),
      ) as { backup: { mapFolderName?: string; mapToken?: string } };
      expect(manifest.backup.mapToken).toBe("Svartalfheim_WP");
      expect(manifest.backup.mapFolderName).toBe("Svartalfheim");
    });
  });

  it("restores mod map into short SavedArks folder when live folder is empty or missing", async () => {
    const savedArks = join(installDir, "ShooterGame", "Saved", "SavedArks");
    const svartDir = join(savedArks, "Svartalfheim");
    await mkdir(svartDir, { recursive: true });
    await writeFile(join(svartDir, "Svartalfheim_WP.ark"), "SVART", "utf8");
    await writeFile(
      join(svartDir, "Svartalfheim_WP_AntiCorruptionBackup.bak"),
      "BAK",
      "utf8",
    );
    await writeFile(join(svartDir, "Extinction_WP.ark"), "LEFTOVER", "utf8");

    const svartProfile = { ...profile, map: "Svartalfheim_WP", name: "Svart" };
    const servers = {
      get: vi.fn((id: string) => (id === svartProfile.id ? svartProfile : null)),
      list: vi.fn(() => [svartProfile]),
      addEvent,
    } as unknown as ServerRepository;
    const processes = {
      applyRuntimePorts: vi.fn((p: ServerProfile) => p),
      isActive,
      start: vi.fn(),
      stop: vi.fn(),
    } as unknown as ProcessManager;
    const settingsStore = new Map<string, string | null>();
    const settings = {
      get: vi.fn((key: string) => settingsStore.get(key) ?? null),
      set: vi.fn((key: string, value: string | null) => {
        settingsStore.set(key, value);
      }),
    } as unknown as AppSettingsRepository;
    const svartService = new BackupService(
      servers,
      repo,
      processes,
      settings,
      join(installDir, "_root"),
    );

    const created = await svartService.createManualBackup(svartProfile.id, ["world"]);
    const record = created[0];
    expect(record).toBeDefined();
    if (record === undefined) return;

    await rm(svartDir, { recursive: true, force: true });
    await mkdir(svartDir, { recursive: true });
    await svartService.restoreBackup(svartProfile.id, record.id);
    expect(await readFile(join(svartDir, "Svartalfheim_WP.ark"), "utf8")).toBe(
      "SVART",
    );
    await expect(
      access(join(savedArks, "Svartalfheim_WP", "Svartalfheim_WP.ark"), fsConstants.F_OK),
    ).rejects.toThrow();

    await rm(savedArks, { recursive: true, force: true });
    await mkdir(savedArks, { recursive: true });
    await svartService.restoreBackup(svartProfile.id, record.id);
    expect(await readFile(join(svartDir, "Svartalfheim_WP.ark"), "utf8")).toBe(
      "SVART",
    );
  });

  it("rejects manual full player-profile snapshots", async () => {
    await expect(service.createManualBackup(profile.id, ["players"])).rejects.toThrow(
      /no longer supported/i,
    );
  });

  it("packages a single player session backup as flat profile files", async () => {
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
          join(root, "PlayerProfiles", "76561198000000000.arkprofile"),
          fsConstants.F_OK,
        ),
      ).resolves.toBeUndefined();
      await expect(
        access(
          join(root, "PlayerProfiles", "SavedArks", "TheIsland_WP", "76561198000000000.arkprofile"),
          fsConstants.F_OK,
        ),
      ).rejects.toThrow();
      await expect(
        access(
          join(root, "PlayerProfiles", "76561198000000001.arkprofile"),
          fsConstants.F_OK,
        ),
      ).rejects.toThrow();
    });
  });

  it("prefers the current map profile when the same player exists on another map", async () => {
    const islandDir = join(installDir, "ShooterGame", "Saved", "SavedArks", "TheIsland_WP");
    const scorchedDir = join(installDir, "ShooterGame", "Saved", "SavedArks", "ScorchedEarth_WP");
    await mkdir(scorchedDir, { recursive: true });
    await writeFile(join(scorchedDir, "ScorchedEarth_WP.ark"), "SCORCHED", "utf8");
    await writeFile(join(scorchedDir, "76561198000000000.arkprofile"), "SCORCHED_PLAYER", "utf8");
    await writeFile(join(islandDir, "76561198000000000.arkprofile"), "ISLAND_PLAYER", "utf8");

    profile.map = "ScorchedEarth_WP";
    const record = await service.createPlayerSessionBackup(
      profile.id,
      "connect",
      "76561198000000000",
      "Alice",
    );
    expect(record).not.toBeNull();
    if (record === null) return;
    await withExtractedZip(record.path, async (root) => {
      expect(
        await readFile(join(root, "PlayerProfiles", "76561198000000000.arkprofile"), "utf8"),
      ).toBe("SCORCHED_PLAYER");
    });
  });

  it("restores flat player profiles into the current map folder", async () => {
    const record = await service.createPlayerSessionBackup(
      profile.id,
      "connect",
      "76561198000000000",
      "Alice",
    );
    expect(record).not.toBeNull();
    if (record === null) return;

    const islandDir = join(installDir, "ShooterGame", "Saved", "SavedArks", "TheIsland_WP");
    const scorchedDir = join(installDir, "ShooterGame", "Saved", "SavedArks", "ScorchedEarth_WP");
    await rm(join(islandDir, "76561198000000000.arkprofile"), { force: true });
    await mkdir(scorchedDir, { recursive: true });
    await writeFile(join(scorchedDir, "ScorchedEarth_WP.ark"), "SCORCHED", "utf8");

    profile.map = "ScorchedEarth_WP";

    await service.restoreBackup(profile.id, record.id);
    expect(await readFile(join(scorchedDir, "76561198000000000.arkprofile"), "utf8")).toBe(
      "PLAYER",
    );
    await expect(
      access(join(islandDir, "76561198000000000.arkprofile"), fsConstants.F_OK),
    ).rejects.toThrow();
  });

  it("rejects nested legacy player archive layouts on restore", async () => {
    const staging = join(installDir, "_legacy-players");
    await mkdir(join(staging, "PlayerProfiles", "SavedArks", "TheIsland_WP"), {
      recursive: true,
    });
    await writeFile(
      join(staging, "PlayerProfiles", "SavedArks", "TheIsland_WP", "76561198000000000.arkprofile"),
      "LEGACY",
      "utf8",
    );
    const { zipDirectory } = await import("@backend/domains/backups/backup-archive");
    const zipPath = join(installDir, "Backups", "Player profiles", "legacy-nested.zip");
    await mkdir(dirname(zipPath), { recursive: true });
    await zipDirectory(staging, zipPath);

    const started = repo.createBackupStart({
      serverId: profile.id,
      type: "manual",
      kind: "players",
      path: zipPath,
      notes: "legacy nested",
    });
    repo.completeBackup(started.id, 100);

    await expect(service.restoreBackup(profile.id, started.id)).rejects.toThrow(
      /legacy layout/i,
    );
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
    const mapDir = join(installDir, "ShooterGame", "Saved", "SavedArks", "TheIsland_WP");
    await writeFile(join(mapDir, "765611980000000001.arkprofile"), "PREFIXED", "utf8");

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
          join(root, "PlayerProfiles", "76561198000000000.arkprofile"),
          fsConstants.F_OK,
        ),
      ).resolves.toBeUndefined();
      await expect(
        access(
          join(root, "PlayerProfiles", "765611980000000001.arkprofile"),
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
    const mapDir = join(installDir, "ShooterGame", "Saved", "SavedArks", "TheIsland_WP");
    const latePath = join(mapDir, "76561198009999999.arkprofile");
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
          join(root, "PlayerProfiles", "76561198009999999.arkprofile"),
          fsConstants.F_OK,
        ),
      ).resolves.toBeUndefined();
      expect(
        await readFile(
          join(root, "PlayerProfiles", "76561198009999999.arkprofile"),
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
      "TheIsland_WP",
      "TheIsland_WP.ark",
    );
    const liveProfile = join(
      installDir,
      "ShooterGame",
      "Saved",
      "SavedArks",
      "TheIsland_WP",
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
    // World backups include profiles, so restore replaces them too (default).
    expect(await readFile(liveProfile, "utf8")).toBe("PLAYER");
    expect(await readFile(liveIni, "utf8")).toBe("CHANGED_INI");
  });

  it("can restore world map without overwriting live profiles/tribes", async () => {
    const created = await service.createManualBackup(profile.id, ["world"]);
    const worldBackup = created[0];
    expect(worldBackup).toBeDefined();
    if (worldBackup === undefined) return;
    const liveWorld = join(
      installDir,
      "ShooterGame",
      "Saved",
      "SavedArks",
      "TheIsland_WP",
      "TheIsland_WP.ark",
    );
    const liveProfile = join(
      installDir,
      "ShooterGame",
      "Saved",
      "SavedArks",
      "TheIsland_WP",
      "76561198000000000.arkprofile",
    );

    await writeFile(liveWorld, "CHANGED_WORLD", "utf8");
    await writeFile(liveProfile, "CHANGED_PLAYER", "utf8");

    await service.restoreBackup(profile.id, worldBackup.id, {
      restoreProfilesTribes: false,
    });

    expect(await readFile(liveWorld, "utf8")).toBe("WORLD");
    expect(await readFile(liveProfile, "utf8")).toBe("CHANGED_PLAYER");
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
    const processes = mockActiveProcesses();
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

  it("skips scheduled world until intervalMinutes after process start", async () => {
    repo.setPolicy({
      serverId: profile.id,
      enabled: true,
      intervalMinutes: 5,
      retainCountWorld: 20,
      retainCountPlayers: 20,
      retainCountIni: 10,
      backupDir: null,
    });
    const processes = mockActiveProcesses(60_000); // started 1 minute ago
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
    expect(repo.listBackups(profile.id, 20)).toHaveLength(0);
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
    db.prepare(`UPDATE backups SET created_at = ?, completed_at = ?, type = ? WHERE id = ?`).run(
      new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      "scheduled",
      first.id,
    );

    const processes = mockActiveProcesses();
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

  it("skips scheduled world until intervalMinutes after a failed scheduled attempt", async () => {
    repo.setPolicy({
      serverId: profile.id,
      enabled: true,
      intervalMinutes: 60,
      retainCountWorld: 20,
      retainCountPlayers: 20,
      retainCountIni: 10,
      backupDir: null,
    });
    const started = repo.createBackupStart({
      serverId: profile.id,
      type: "scheduled",
      kind: "world",
      path: join(installDir, "Backups", "World", "failed-sched.zip"),
      notes: null,
    });
    repo.failBackup(started.id, "disk full");
    db.prepare(`UPDATE backups SET completed_at = ? WHERE id = ?`).run(
      new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      started.id,
    );

    const processes = mockActiveProcesses();
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
    expect(repo.listBackups(profile.id, 20)).toHaveLength(1);
  });

  it("pauses scheduled world creates after 3 consecutive failures this session", async () => {
    repo.setPolicy({
      serverId: profile.id,
      enabled: true,
      intervalMinutes: 5,
      retainCountWorld: 20,
      retainCountPlayers: 20,
      retainCountIni: 10,
      backupDir: null,
    });
    const processes = mockActiveProcesses();
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
    const createSpy = vi
      .spyOn(scheduled, "createScheduledBackup")
      .mockRejectedValue(new Error("disk full"));

    await scheduled.runScheduledCycle();
    await scheduled.runScheduledCycle();
    await scheduled.runScheduledCycle();
    expect(scheduled.isScheduledWorldPaused(profile.id)).toBe(true);
    expect(scheduled.getPolicy(profile.id).enabled).toBe(true);
    expect(scheduled.getPolicy(profile.id).schedulePaused).toBe(true);

    createSpy.mockClear();
    await scheduled.runScheduledCycle();
    expect(createSpy).not.toHaveBeenCalled();

    const summary = await scheduled.getFleetSummary();
    expect(
      summary.alerts.some(
        (alert) =>
          alert.kind === "schedule_paused" && alert.serverId === profile.id,
      ),
    ).toBe(true);
    expect(summary.servers[0]?.schedulePaused).toBe(true);
  });

  it("skips scheduling while a world backup is active in this process", async () => {
    repo.setPolicy({
      serverId: profile.id,
      enabled: true,
      intervalMinutes: 5,
      retainCountWorld: 20,
      retainCountPlayers: 20,
      retainCountIni: 10,
      backupDir: null,
    });
    const running = repo.createBackupStart({
      serverId: profile.id,
      type: "scheduled",
      kind: "world",
      path: join(installDir, "Backups", "World", "running.zip"),
      notes: null,
    });
    expect(repo.hasRunning(profile.id, "world")).toBe(true);

    const processes = mockActiveProcesses();
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
    (
      scheduled as unknown as { creatingBackupIds: Set<string> }
    ).creatingBackupIds.add(running.id);

    await scheduled.runScheduledCycle();
    const worlds = repo.listBackups(profile.id, 20).filter((b) => b.kind === "world");
    expect(worlds).toHaveLength(1);
    expect(worlds[0]?.id).toBe(running.id);
  });

  it("reconciles an interrupted running row before scheduling", async () => {
    repo.setPolicy({
      serverId: profile.id,
      enabled: true,
      intervalMinutes: 5,
      retainCountWorld: 20,
      retainCountPlayers: 20,
      retainCountIni: 10,
      backupDir: null,
    });
    const interrupted = repo.createBackupStart({
      serverId: profile.id,
      type: "scheduled",
      kind: "world",
      path: join(installDir, "Backups", "World", "interrupted.zip"),
      notes: null,
    });
    const processes = mockActiveProcesses();
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

    expect(repo.getBackup(interrupted.id)?.status).toBe("failed");
    // Reconcile finishes the interrupted attempt now — interval must elapse
    // before another scheduled create (same as any failed scheduled finish).
    expect(
      repo
        .listBackups(profile.id, 20)
        .filter((backup) => backup.type === "scheduled" && backup.kind === "world"),
    ).toHaveLength(1);

    db.prepare(`UPDATE backups SET completed_at = ? WHERE id = ?`).run(
      new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      interrupted.id,
    );
    await scheduled.runScheduledCycle();

    const scheduledWorlds = repo
      .listBackups(profile.id, 20)
      .filter((backup) => backup.type === "scheduled" && backup.kind === "world");
    expect(scheduledWorlds).toHaveLength(2);
    expect(scheduledWorlds.some((backup) => backup.status === "completed")).toBe(
      true,
    );
  });

  it("coalesces overlapping scheduled cycles for the same server", async () => {
    repo.setPolicy({
      serverId: profile.id,
      enabled: true,
      intervalMinutes: 5,
      retainCountWorld: 20,
      retainCountPlayers: 20,
      retainCountIni: 10,
      backupDir: null,
    });
    const processes = mockActiveProcesses();
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

    const first = scheduled.runScheduledCycle();
    const second = scheduled.runScheduledCycle();
    await Promise.all([first, second]);
    const scheduledWorlds = repo
      .listBackups(profile.id, 20)
      .filter((b) => b.type === "scheduled" && b.kind === "world");
    expect(scheduledWorlds).toHaveLength(1);
  });

  it("continues with later servers when one scheduled evaluation fails", async () => {
    const secondProfile: ServerProfile = {
      ...profile,
      id: "srv-2",
      name: "Scorched Earth",
      sessionName: "Scorched Earth",
      maxPlayers: 70,
      gamePort: 7787,
      queryPort: 27025,
      rconPort: 27030,
    };
    for (const serverId of [profile.id, secondProfile.id]) {
      repo.setPolicy({
        serverId,
        enabled: true,
        intervalMinutes: 5,
        retainCountWorld: 20,
        retainCountPlayers: 20,
        retainCountIni: 10,
        backupDir: null,
      });
    }
    const processes = mockActiveProcesses();
    const addScheduledEvent = vi.fn();
    const servers = {
      get: vi.fn((id: string) => {
        if (id === profile.id) return profile;
        if (id === secondProfile.id) return secondProfile;
        return null;
      }),
      list: vi.fn(() => [profile, secondProfile]),
      addEvent: addScheduledEvent,
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
    vi.spyOn(
      scheduled as unknown as {
        applyRetention: (serverId: string, policy: unknown) => Promise<void>;
      },
      "applyRetention",
    ).mockImplementation(async (serverId: string) => {
      if (serverId === profile.id) {
        throw new Error("retention destination unavailable");
      }
    });

    await scheduled.runScheduledCycle();

    expect(repo.listCompleted(profile.id, "world")).toHaveLength(0);
    expect(repo.listCompleted(secondProfile.id, "world")).toHaveLength(1);
    expect(addScheduledEvent).toHaveBeenCalledWith(
      profile.id,
      "error",
      "error",
      expect.stringContaining("retention destination unavailable"),
      expect.objectContaining({
        context: expect.objectContaining({ trigger: "scheduled" }),
      }),
    );
  });

  it("imports orphan zip archives from disk on list/refresh", async () => {
    const record = await service.createPlayerSessionBackup(
      profile.id,
      "connect",
      "76561198000000000",
      "Alice",
    );
    expect(record).not.toBeNull();
    if (record === null) return;

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
    const record = await service.createPlayerSessionBackup(
      profile.id,
      "connect",
      "76561198000000000",
      "Alice",
    );
    expect(record).not.toBeNull();
    if (record === null) return;

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

  it("coalesces interrupted-row reconciliation across scheduler and list", async () => {
    repo.setPolicy({
      serverId: profile.id,
      enabled: true,
      intervalMinutes: 5,
      retainCountWorld: 20,
      retainCountPlayers: 20,
      retainCountIni: 10,
      backupDir: null,
    });
    let releaseReconcile: ((value: number) => void) | undefined;
    const reconcileGate = new Promise<number>((resolve) => {
      releaseReconcile = resolve;
    });
    const internal = service as unknown as {
      reconcileInterruptedRunningBackupsUnlocked: (
        serverId: string,
      ) => Promise<number>;
    };
    const reconcileSpy = vi
      .spyOn(internal, "reconcileInterruptedRunningBackupsUnlocked")
      .mockReturnValue(reconcileGate);

    const listing = service.list(profile.id, 50);
    const scheduling = service.runScheduledCycle();
    await vi.waitFor(() => {
      expect(reconcileSpy).toHaveBeenCalledTimes(1);
    });
    releaseReconcile?.(0);
    await Promise.all([listing, scheduling]);

    expect(reconcileSpy).toHaveBeenCalledTimes(1);
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

  it("fails stuck running rows when layout scan rejects without aborting list", async () => {
    const worldDir = join(installDir, "Backups", "World");
    await mkdir(worldDir, { recursive: true });
    const src = join(installDir, "_layout-reject-src");
    await mkdir(join(src, "SavedArks"), { recursive: true });
    await writeFile(join(src, "SavedArks", "map.ark"), "WORLD", "utf8");
    const archive = await import("@backend/domains/backups/backup-archive");
    const zipPath = join(worldDir, "layout-reject.zip");
    await archive.zipDirectory(src, zipPath);

    const stuck = repo.createBackupStart({
      serverId: profile.id,
      type: "manual",
      kind: "world",
      path: zipPath,
      notes: "layout scan boom",
    });

    const layoutSpy = vi
      .spyOn(archive, "zipHasBackupLayout")
      .mockRejectedValue(new Error("corrupt central directory"));

    const listed = await service.list(profile.id, 50);
    expect(listed.find((item) => item.id === stuck.id)?.status).toBe("failed");
    expect(repo.getBackup(stuck.id)?.status).toBe("failed");
    layoutSpy.mockRestore();
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
    const created = await service.createManualBackup(profile.id, ["world", "ini"]);
    const player = await service.createPlayerSessionBackup(
      profile.id,
      "connect",
      "76561198000000000",
      "Alice",
    );
    expect(player).not.toBeNull();
    if (player === null) return;
    expect(created).toHaveLength(2);
    const ids = [...created.map((b) => b.id), player.id];
    addEvent.mockClear();
    const deleted = await service.deleteBackups(profile.id, ids);
    expect(deleted).toBe(3);
    expect(repo.listBackups(profile.id, 50)).toHaveLength(0);
    expect(addEvent).toHaveBeenCalledTimes(3);
    for (const call of addEvent.mock.calls) {
      expect(call[1]).toBe("backup_deleted");
    }
  });

  it("clears every failed row for one kind beyond the history page limit", async () => {
    for (let index = 0; index < 205; index += 1) {
      const record = repo.createBackupStart({
        serverId: profile.id,
        type: "scheduled",
        kind: "world",
        path: join(installDir, "Backups", `failed-${index}.zip`),
        notes: null,
      });
      repo.failBackup(record.id, "expected test failure");
    }
    const ini = repo.createBackupStart({
      serverId: profile.id,
      type: "manual",
      kind: "ini",
      path: join(installDir, "Backups", "failed-ini.zip"),
      notes: null,
    });
    repo.failBackup(ini.id, "keep other kind");

    await expect(service.deleteFailedBackups(profile.id, "world")).resolves.toBe(205);
    expect(repo.listFailed(profile.id, "world")).toHaveLength(0);
    expect(repo.listFailed(profile.id, "ini")).toHaveLength(1);
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

  it("emits never_backed_up fleet alerts only while the server is running", async () => {
    service.setPolicy(profile.id, {
      enabled: true,
      intervalMinutes: 60,
      retainCountWorld: 20,
      retainCountPlayers: 20,
      retainCountIni: 10,
      backupDir: null,
    });

    isActive.mockReturnValue(false);
    const stopped = await service.getFleetSummary();
    expect(stopped.alerts.some((alert) => alert.kind === "never_backed_up")).toBe(false);
    expect(stopped.servers[0]?.health).toBe("unknown");

    isActive.mockReturnValue(true);
    const running = await service.getFleetSummary();
    expect(running.alerts.some((alert) => alert.kind === "never_backed_up")).toBe(true);
    expect(running.servers[0]?.health).toBe("warning");
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
    const failedAlert = summary.alerts.find((alert) => alert.id === `failed:${profile.id}`);
    expect(failedAlert?.message).toMatch(/failed (world )?backup/i);
    expect(failedAlert?.backupId).toBe(oldStart.id);
    expect(failedAlert?.fingerprint).toBe(`${oldStart.id}:1`);
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
    // Newest finished failed (players after ini) for Logs deep-link.
    expect(failedAlert?.backupId).toBe(failedPlayers.id);
  });

  it("dismisses a fleet alert until its fingerprint changes", async () => {
    const failed = repo.createBackupStart({
      serverId: profile.id,
      type: "scheduled",
      kind: "world",
      path: join(installDir, "Backups", "World", "failed-world.zip"),
      notes: null,
    });
    repo.failBackup(failed.id, "boom");

    const before = await service.getFleetSummary();
    const alert = before.alerts.find((row) => row.id === `failed:${profile.id}`);
    expect(alert).toBeDefined();
    expect(alert?.fingerprint).toBe(`${failed.id}:1`);

    service.dismissFleetAlert(alert!.id, alert!.fingerprint);
    const hidden = await service.getFleetSummary();
    expect(hidden.alerts.find((row) => row.id === `failed:${profile.id}`)).toBeUndefined();

    const newer = repo.createBackupStart({
      serverId: profile.id,
      type: "scheduled",
      kind: "world",
      path: join(installDir, "Backups", "World", "failed-world-2.zip"),
      notes: null,
    });
    repo.failBackup(newer.id, "boom again");

    const again = await service.getFleetSummary();
    const resurfaced = again.alerts.find((row) => row.id === `failed:${profile.id}`);
    expect(resurfaced?.fingerprint).toBe(`${newer.id}:2`);
    expect(resurfaced?.backupId).toBe(newer.id);
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

  it("round-trips export then import without restoring live files", async () => {
    const [created] = await service.createManualBackup(profile.id, ["world"]);
    expect(created).toBeDefined();
    if (created === undefined) return;

    const exportDir = await mkdtemp(join(tmpdir(), "ark-export-"));
    tmpDirs.push(exportDir);
    const exportPath = join(exportDir, "portable-world.zip");
    const written = await service.exportBackup(profile.id, created.id, exportPath);
    expect(existsSync(written)).toBe(true);
    expect(existsSync(created.path)).toBe(true);

    const livePath = join(
      installDir,
      "ShooterGame",
      "Saved",
      "SavedArks",
      "TheIsland_WP.ark",
    );
    const beforeLive = existsSync(livePath) ? await readFile(livePath, "utf8") : null;

    const imported = await service.importBackup(profile.id, "world", written);
    expect(imported.status).toBe("completed");
    expect(imported.kind).toBe("world");
    expect(imported.path).not.toBe(created.path);
    expect(resolve(imported.path).toLowerCase()).not.toBe(resolve(written).toLowerCase());
    expect(existsSync(imported.path)).toBe(true);

    const listed = await service.list(profile.id, 50);
    expect(listed.some((row) => row.id === imported.id)).toBe(true);

    if (beforeLive !== null) {
      expect(await readFile(livePath, "utf8")).toBe(beforeLive);
    }
    expect(
      repo.listBackups(profile.id, 100).filter((row) => row.type === "pre_restore"),
    ).toHaveLength(0);
  });

  it("imports the same portable zip twice with distinct managed paths", async () => {
    const [created] = await service.createManualBackup(profile.id, ["ini"]);
    expect(created).toBeDefined();
    if (created === undefined) return;

    const exportDir = await mkdtemp(join(tmpdir(), "ark-export-clash-"));
    tmpDirs.push(exportDir);
    const exportPath = await service.exportBackup(
      profile.id,
      created.id,
      join(exportDir, "ini-portable.zip"),
    );

    const first = await service.importBackup(profile.id, "ini", exportPath);
    const second = await service.importBackup(profile.id, "ini", exportPath);
    expect(second.id).not.toBe(first.id);
    expect(second.path).not.toBe(first.path);
    expect(existsSync(first.path)).toBe(true);
    expect(existsSync(second.path)).toBe(true);
  });

  it("rejects re-importing a managed archive path even when casing differs", async () => {
    const [created] = await service.createManualBackup(profile.id, ["world"]);
    expect(created).toBeDefined();
    if (created === undefined) return;

    await expect(service.importBackup(profile.id, "world", created.path)).rejects.toThrow(
      /already in this server's backup catalog/i,
    );

    if (process.platform === "win32") {
      const flipped = created.path
        .split("")
        .map((ch, index) =>
          /[a-z]/i.test(ch) && index % 2 === 0 ? ch.toUpperCase() : ch.toLowerCase(),
        )
        .join("");
      await expect(service.importBackup(profile.id, "world", flipped)).rejects.toThrow(
        /already in this server's backup catalog/i,
      );
    }
  });

  it("rejects unsafe portable zips before writing into the backup root", async () => {
    const root = service.resolveBackupRootDir(profile.id);
    const before = existsSync(root) ? await readdir(root) : [];

    const evilDir = await mkdtemp(join(tmpdir(), "ark-evil-"));
    tmpDirs.push(evilDir);
    const evilZip = join(evilDir, "evil.zip");
    await writeFile(evilZip, "not-a-real-zip", "utf8");

    await expect(service.importBackup(profile.id, "world", evilZip)).rejects.toThrow(
      /corrupt|unreadable/i,
    );

    const after = existsSync(root) ? await readdir(root) : [];
    expect(after).toEqual(before);
  });
});

describe("computeBackupServerHealth", () => {
  it("marks never-backed-up as warning only while the server is running", () => {
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
    ).toBe("unknown");

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
