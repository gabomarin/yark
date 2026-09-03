import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UpdateService } from "@backend/domains/updates/update-service";
import type { BackupService } from "@backend/domains/backups/backup-service";
import type { InstanceService } from "@backend/domains/instances/instance-service";
import type { ProcessManager } from "@backend/infra/process/process-manager";
import type { ServerRepository } from "@backend/infra/db/server-repository";
import type { AppSettingsRepository } from "@backend/infra/db/app-settings-repository";
import { InstanceLockManager } from "@backend/orchestration/instance-lock-manager";
import type { BackupRecord, ServerProfile } from "@shared/types";

function makeProfile(id = "srv-update-1"): ServerProfile {
  const now = new Date().toISOString();
  return {
    id,
    name: "Safe Update Test",
    map: "TheIsland_WP",
    installDir: "C:/ARK/SafeUpdateTest",
    enabled: true,
    autoStart: false,
    sessionName: "Session",
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

function makePreUpdateBackups(serverId: string): BackupRecord[] {
  const now = new Date().toISOString();
  return (["world"] as const).map((kind, index) => ({
    id: `bu-${kind}`,
    serverId,
    type: "pre_update",
    kind,
    path: `C:/backups/${kind}.zip`,
    sizeBytes: 100 + index,
    status: "completed",
    createdAt: now,
    completedAt: now,
    notes: null,
    mapToken: kind === "world" ? "TheIsland_WP" : null,
  }));
}

/** Legacy pre-#275 / pre-#518 evidence that still lists extra archive ids. */
function makeLegacyPreUpdateBackupIds(serverId: string): {
  ids: string[];
  critical: BackupRecord[];
} {
  const critical = makePreUpdateBackups(serverId);
  const now = new Date().toISOString();
  const players: BackupRecord = {
    id: "bu-players",
    serverId,
    type: "pre_update",
    kind: "players",
    path: "C:/backups/players.zip",
    sizeBytes: 50,
    status: "completed",
    createdAt: now,
    completedAt: now,
    notes: null,
    mapToken: null,
  };
  return {
    ids: [critical[0]!.id, players.id, "bu-ini"],
    critical,
  };
}

type SteamStub = {
  code: number;
  stdout?: string;
  stderr?: string;
};

type Harness = {
  profile: ServerProfile;
  service: UpdateService;
  locks: InstanceLockManager;
  order: string[];
  instances: {
    stop: ReturnType<typeof vi.fn>;
    startForMaintenance: ReturnType<typeof vi.fn>;
    isStopInProgress: ReturnType<typeof vi.fn>;
  };
  backups: {
    createPreUpdateBackupForJob: ReturnType<typeof vi.fn>;
    getCompletedBackupsForCriticalJob: ReturnType<typeof vi.fn>;
    createPreStopBackup: ReturnType<typeof vi.fn>;
    restoreBackupForJob: ReturnType<typeof vi.fn>;
    restoreBackupForRollbackRecovery: ReturnType<typeof vi.fn>;
    requestCancel: ReturnType<typeof vi.fn>;
    getCriticalJobs: ReturnType<typeof vi.fn>;
  };
  runSteamUpdate: ReturnType<typeof vi.fn>;
  waitForHealthy: ReturnType<typeof vi.fn>;
  performUpdate: () => Promise<void>;
  performVerify: () => Promise<void>;
  logDir: string;
};

function createHarness(options?: {
  wasRunning?: boolean;
  steam?: SteamStub | (() => SteamStub | Promise<SteamStub>);
  healthy?: boolean;
  stubWaitForHealthy?: boolean;
  steamCmdPath?: string | null;
}): Harness {
  const profile = makeProfile();
  const wasRunning = options?.wasRunning ?? true;
  let active = wasRunning;
  const logDir = mkdtempSync(join(tmpdir(), "yark-update-"));
  const order: string[] = [];

  const repo = {
    get: vi.fn((id: string) => (id === profile.id ? profile : null)),
    list: vi.fn(() => [profile]),
    addEvent: vi.fn(),
  } as unknown as ServerRepository;

  const backups = {
    createPreUpdateBackupForJob: vi.fn(async () => {
      order.push("pre_update");
      return makePreUpdateBackups(profile.id);
    }),
    createPreStopBackup: vi.fn(),
    getCompletedBackupsForCriticalJob: vi.fn(
      (_serverId: string, backupIds: readonly string[]) =>
        makePreUpdateBackups(profile.id).filter(
          (backup) =>
            backupIds.includes(backup.id) && backup.kind === "world",
        ),
    ),
    restoreBackupForJob: vi.fn(async () => {
      order.push("restore");
    }),
    restoreBackupForRollbackRecovery: vi.fn(async () => {
      order.push("restore");
    }),
    requestCancel: vi.fn(() => false),
    getCriticalJobs: vi.fn(() => []),
  };

  const instances = {
    stop: vi.fn(async () => {
      order.push("stop");
      active = false;
    }),
    startForMaintenance: vi.fn(async () => {
      order.push("start");
      active = true;
    }),
    isStopInProgress: vi.fn(() => false),
  };

  const processes = {
    isActive: vi.fn(() => active),
    getStatus: vi.fn(() => ({
      status: active ? ("running" as const) : ("stopped" as const),
    })),
  };

  const steamCmdPath =
    options !== undefined && "steamCmdPath" in options
      ? options.steamCmdPath
      : "C:\\steamcmd\\steamcmd.exe";
  const settings = {
    get: vi.fn((key: string) => (key === "steamcmdPath" ? steamCmdPath : null)),
    set: vi.fn(),
  } as unknown as AppSettingsRepository;

  const locks = new InstanceLockManager();
  const service = new UpdateService(
    repo,
    backups as unknown as BackupService,
    instances as unknown as InstanceService,
    processes as unknown as ProcessManager,
    locks,
    settings,
    logDir,
    join(logDir, "steamcmd"),
  );

  const steamFactory =
    options?.steam ??
    ((): SteamStub => ({ code: 0, stdout: "ok", stderr: "" }));

  const runSteamUpdate = vi.fn(async () => {
    order.push("steam");
    const result =
      typeof steamFactory === "function" ? await steamFactory() : steamFactory;
    return {
      code: result.code,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  });
  const waitForHealthy = vi.fn(async () => options?.healthy ?? true);

  // Private orchestration seams — stub so no real SteamCMD/spawn runs.
  Object.assign(service as object, {
    runSteamUpdate,
  });
  if (options?.stubWaitForHealthy !== false) {
    Object.assign(service as object, {
      waitForHealthy,
    });
  }

  return {
    profile,
    service,
    locks,
    order,
    instances,
    backups,
    runSteamUpdate,
    waitForHealthy,
    performUpdate: () =>
      (service as unknown as { performUpdateServer: (id: string) => Promise<void> })
        .performUpdateServer(profile.id),
    performVerify: () =>
      (
        service as unknown as {
          performVerifyServerFiles: (id: string) => Promise<void>;
        }
      ).performVerifyServerFiles(profile.id),
    logDir,
  };
}

describe("UpdateService safe update orchestration", () => {
  const dirs: string[] = [];

  afterEach(() => {
    while (dirs.length > 0) {
      const dir = dirs.pop();
      if (dir !== undefined) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it("stops without pre_stop, takes pre_update, then restarts when it was running", async () => {
    const h = createHarness({ wasRunning: true });
    dirs.push(h.logDir);

    await h.performUpdate();

    expect(h.instances.stop).toHaveBeenCalledWith(h.profile.id, {
      backup: false,
    });
    expect(h.backups.createPreStopBackup).not.toHaveBeenCalled();
    expect(h.order).toEqual(["stop", "pre_update", "steam", "start"]);
  });

  it("leaves an already-stopped server stopped after a successful update", async () => {
    const h = createHarness({ wasRunning: false });
    dirs.push(h.logDir);

    await h.performUpdate();

    expect(h.instances.stop).not.toHaveBeenCalled();
    expect(h.backups.createPreUpdateBackupForJob).toHaveBeenCalled();
    expect(h.instances.startForMaintenance).not.toHaveBeenCalled();
    expect(h.waitForHealthy).not.toHaveBeenCalled();
    expect(h.order).toEqual(["pre_update", "steam"]);
  });

  it("rejects updateServer while the server process is active", async () => {
    const h = createHarness({ wasRunning: true });
    dirs.push(h.logDir);

    await expect(h.service.updateServer(h.profile.id)).rejects.toThrow(
      /stop the server before updating files/i,
    );
    expect(h.runSteamUpdate).not.toHaveBeenCalled();
  });

  it("allows updateServer when the server is stopped", async () => {
    const h = createHarness({ wasRunning: false });
    dirs.push(h.logDir);

    await h.service.updateServer(h.profile.id);

    expect(h.backups.createPreUpdateBackupForJob).toHaveBeenCalled();
    expect(h.runSteamUpdate).toHaveBeenCalled();
  });

  it("refuses to queue a files job when SteamCMD is not installed", async () => {
    const h = createHarness({ wasRunning: false, steamCmdPath: null });
    dirs.push(h.logDir);

    await expect(h.service.updateServer(h.profile.id)).rejects.toThrow(
      /SteamCMD is not installed/i,
    );
    expect(h.service.getSteamCmdStatus().criticalJobs).toEqual([]);
    expect(h.runSteamUpdate).not.toHaveBeenCalled();
    expect(h.backups.createPreUpdateBackupForJob).not.toHaveBeenCalled();
  });

  it("rejects a queued update if the server starts before execution", async () => {
    const h = createHarness({ wasRunning: true });
    dirs.push(h.logDir);
    const now = new Date().toISOString();
    const job = {
      id: "queued-update-active",
      type: "update" as const,
      serverId: h.profile.id,
      attempts: 0,
      maxAttempts: 3,
      status: "running" as const,
      phase: "queued",
      createdAt: now,
      updatedAt: now,
      lastError: null,
      recoveryReason: null,
      idempotencyKey: `update:${h.profile.id}:`,
      operatorRetryAllowed: false,
      context: {},
    };

    await expect(
      (
        h.service as unknown as {
          performUpdateServer: (serverId: string, input: typeof job) => Promise<void>;
        }
      ).performUpdateServer(h.profile.id, job),
    ).rejects.toMatchObject({
      name: "CriticalJobRecoveryBlockedError",
      message: expect.stringMatching(/stop the server before updating files/i),
    });

    expect(h.instances.stop).not.toHaveBeenCalled();
    expect(h.backups.createPreUpdateBackupForJob).not.toHaveBeenCalled();
    expect(h.runSteamUpdate).not.toHaveBeenCalled();
  });

  it("marks an active-server queue race as blocked so Stop → Retry is offered", async () => {
    const h = createHarness({ wasRunning: true });
    dirs.push(h.logDir);
    const now = new Date().toISOString();
    const job = {
      id: "queued-update-active-retryable",
      type: "update" as const,
      serverId: h.profile.id,
      attempts: 0,
      maxAttempts: 3,
      status: "pending" as const,
      phase: "queued",
      createdAt: now,
      updatedAt: now,
      lastError: null,
      recoveryReason: null,
      idempotencyKey: `update:${h.profile.id}:`,
      operatorRetryAllowed: false,
      context: {},
    };
    (h.service as unknown as { queue: Array<typeof job> }).queue = [job];

    await (
      h.service as unknown as { processQueue: () => Promise<void> }
    ).processQueue();

    expect(job.status).toBe("blocked");
    expect(job.operatorRetryAllowed).toBe(true);
    expect(job.recoveryReason).toMatch(/stop the server before updating files/i);
    expect(h.runSteamUpdate).not.toHaveBeenCalled();
  });

  it("rejects a resumed stopped-server update if the server started meanwhile", async () => {
    const h = createHarness({ wasRunning: true });
    dirs.push(h.logDir);
    const now = new Date().toISOString();
    const job = {
      id: "resumed-stopped-update-active",
      type: "update" as const,
      serverId: h.profile.id,
      attempts: 1,
      maxAttempts: 3,
      status: "running" as const,
      phase: "validated",
      createdAt: now,
      updatedAt: now,
      lastError: "network timed out",
      recoveryReason: null,
      idempotencyKey: `update:${h.profile.id}:`,
      operatorRetryAllowed: false,
      context: { wasRunning: false },
    };

    await expect(
      (
        h.service as unknown as {
          performUpdateServer: (serverId: string, input: typeof job) => Promise<void>;
        }
      ).performUpdateServer(h.profile.id, job),
    ).rejects.toMatchObject({
      name: "CriticalJobRecoveryBlockedError",
      message: expect.stringMatching(/stop the server before updating files/i),
    });

    expect(h.instances.stop).not.toHaveBeenCalled();
    expect(h.backups.createPreUpdateBackupForJob).not.toHaveBeenCalled();
    expect(h.runSteamUpdate).not.toHaveBeenCalled();
  });

  it("preserves original running intent when verify replays after the server was stopped", async () => {
    const h = createHarness({ wasRunning: false });
    dirs.push(h.logDir);
    const now = new Date().toISOString();
    const job = {
      id: "verify-replay",
      type: "verify-files" as const,
      serverId: h.profile.id,
      attempts: 1,
      maxAttempts: 3,
      status: "running" as const,
      phase: "applying-files",
      createdAt: now,
      updatedAt: now,
      lastError: null,
      recoveryReason: null,
      idempotencyKey: `verify-files:${h.profile.id}:`,
      operatorRetryAllowed: false,
      context: { wasRunning: true },
    };

    await (
      h.service as unknown as {
        performVerifyServerFiles: (serverId: string, input: typeof job) => Promise<void>;
      }
    ).performVerifyServerFiles(h.profile.id, job);

    expect(h.instances.stop).not.toHaveBeenCalled();
    expect(h.instances.startForMaintenance).toHaveBeenCalledWith(h.profile.id);
    expect(job.context.wasRunning).toBe(true);
    expect(h.order).toEqual(["steam", "start"]);
  });

  it("reuses persisted pre-update backups after a second crash at validated", async () => {
    const h = createHarness({ wasRunning: false });
    dirs.push(h.logDir);
    const backups = makePreUpdateBackups(h.profile.id);
    const now = new Date().toISOString();
    const job = {
      id: "update-retry",
      type: "update" as const,
      serverId: h.profile.id,
      attempts: 1,
      maxAttempts: 3,
      status: "running" as const,
      phase: "validated",
      createdAt: now,
      updatedAt: now,
      lastError: "network timed out",
      recoveryReason: null,
      idempotencyKey: `update:${h.profile.id}:`,
      operatorRetryAllowed: false,
      context: {
        wasRunning: true,
        preUpdateBackupIds: backups.map((backup) => backup.id),
        rollbackRestoredBackupIds: backups.map((backup) => backup.id),
      },
    };

    await (
      h.service as unknown as {
        performUpdateServer: (serverId: string, input: typeof job) => Promise<void>;
      }
    ).performUpdateServer(h.profile.id, job);

    expect(h.backups.getCompletedBackupsForCriticalJob).toHaveBeenCalledWith(
      h.profile.id,
      job.context.preUpdateBackupIds,
    );
    expect(h.backups.createPreUpdateBackupForJob).not.toHaveBeenCalled();
    expect(h.instances.stop).not.toHaveBeenCalled();
    expect(h.instances.startForMaintenance).toHaveBeenCalledWith(h.profile.id);
    expect(job.context.rollbackRestoredBackupIds).toEqual([]);
    expect(h.order).toEqual(["steam", "start"]);
  });

  it("blocks resumed update when persisted pre-update backup evidence is incomplete", async () => {
    const h = createHarness({ wasRunning: false });
    dirs.push(h.logDir);
    // World id was persisted, but the archive is missing on disk.
    h.backups.getCompletedBackupsForCriticalJob.mockReturnValue([]);
    const now = new Date().toISOString();
    const job = {
      id: "update-missing-evidence",
      type: "update" as const,
      serverId: h.profile.id,
      attempts: 1,
      maxAttempts: 3,
      status: "running" as const,
      phase: "validated",
      createdAt: now,
      updatedAt: now,
      lastError: "network timed out",
      recoveryReason: null,
      idempotencyKey: `update:${h.profile.id}:`,
      operatorRetryAllowed: false,
      context: {
        wasRunning: false,
        preUpdateBackupIds: ["bu-world"],
      },
    };

    await expect(
      (
        h.service as unknown as {
          performUpdateServer: (serverId: string, input: typeof job) => Promise<void>;
        }
      ).performUpdateServer(h.profile.id, job),
    ).rejects.toThrow(/backup evidence is incomplete/i);
    expect(h.runSteamUpdate).not.toHaveBeenCalled();
  });

  it("resumes update when legacy jobs still list a players pre-update id", async () => {
    const h = createHarness({ wasRunning: false });
    dirs.push(h.logDir);
    const legacy = makeLegacyPreUpdateBackupIds(h.profile.id);
    h.backups.getCompletedBackupsForCriticalJob.mockReturnValue(legacy.critical);
    const now = new Date().toISOString();
    const job = {
      id: "update-legacy-players-id",
      type: "update" as const,
      serverId: h.profile.id,
      attempts: 1,
      maxAttempts: 3,
      status: "running" as const,
      phase: "validated",
      createdAt: now,
      updatedAt: now,
      lastError: "network timed out",
      recoveryReason: null,
      idempotencyKey: `update:${h.profile.id}:`,
      operatorRetryAllowed: false,
      context: {
        wasRunning: true,
        preUpdateBackupIds: legacy.ids,
        rollbackRestoredBackupIds: legacy.ids,
      },
    };

    await (
      h.service as unknown as {
        performUpdateServer: (serverId: string, input: typeof job) => Promise<void>;
      }
    ).performUpdateServer(h.profile.id, job);

    expect(h.backups.getCompletedBackupsForCriticalJob).toHaveBeenCalledWith(
      h.profile.id,
      legacy.ids,
    );
    expect(h.backups.createPreUpdateBackupForJob).not.toHaveBeenCalled();
    expect(h.runSteamUpdate).toHaveBeenCalled();
    expect(job.context.rollbackRestoredBackupIds).toEqual([]);
  });

  it("finishes an interrupted rollback under the instance lock without launching SteamCMD", async () => {
    const h = createHarness({ wasRunning: false });
    dirs.push(h.logDir);
    const backups = makePreUpdateBackups(h.profile.id);
    const now = new Date().toISOString();
    const job = {
      id: "rollback-resume",
      type: "update" as const,
      serverId: h.profile.id,
      attempts: 2,
      maxAttempts: 3,
      status: "running" as const,
      phase: "rollback-restoring-backups",
      createdAt: now,
      updatedAt: now,
      lastError: "network timed out",
      recoveryReason: null,
      idempotencyKey: `update:${h.profile.id}:`,
      operatorRetryAllowed: true,
      context: {
        wasRunning: true,
        preUpdateBackupIds: backups.map((backup) => backup.id),
        // Interrupted before any restore completed — still need world.
        rollbackRestoredBackupIds: [],
      },
    };

    const withLock = vi.spyOn(h.locks, "withLock");
    await expect(
      (
        h.service as unknown as {
          finishRecoveredRollback: (input: typeof job) => Promise<void>;
        }
      ).finishRecoveredRollback(job),
    ).rejects.toThrow(/recovered rollback completed/i);

    expect(h.runSteamUpdate).not.toHaveBeenCalled();
    expect(withLock).toHaveBeenCalledWith(
      h.profile.id,
      "update-rollback-recovery",
      expect.any(Function),
    );
    expect(h.backups.restoreBackupForRollbackRecovery).toHaveBeenCalledTimes(1);
    expect(h.instances.startForMaintenance).toHaveBeenCalledWith(h.profile.id);
    expect(job.phase).toBe("rollback-complete");
    expect(h.order).toEqual(["restore", "start"]);
  });

  it("blocks cache clearing while a critical job is retrying", async () => {
    const h = createHarness({ wasRunning: false });
    dirs.push(h.logDir);
    const now = new Date().toISOString();
    const retryingJob = {
      id: "retrying-verify",
      type: "verify-files" as const,
      serverId: h.profile.id,
      attempts: 1,
      maxAttempts: 3,
      status: "retrying" as const,
      phase: "applying-files",
      createdAt: now,
      updatedAt: now,
      lastError: "network timed out",
      recoveryReason: "Retry scheduled",
      idempotencyKey: `verify-files:${h.profile.id}:`,
      operatorRetryAllowed: false,
      context: { wasRunning: false },
    };
    (h.service as unknown as { queue: Array<typeof retryingJob> }).queue = [retryingJob];

    await expect(h.service.clearSteamCmdCache("content")).rejects.toThrow(
      /stop the current SteamCMD operation/i,
    );
  });

  it("aborts healthy wait when the operation was cancelled", async () => {
    const h = createHarness({ wasRunning: true, stubWaitForHealthy: false });
    dirs.push(h.logDir);
    const internal = h.service as unknown as {
      cancelRequested: boolean;
      waitForHealthy: (
        serverId: string,
        timeoutMs: number,
        options?: { ignoreCancellation?: boolean },
      ) => Promise<boolean>;
    };
    internal.cancelRequested = true;

    await expect(internal.waitForHealthy(h.profile.id, 5_000)).rejects.toThrow(
      /operation cancelled/i,
    );
    await expect(
      internal.waitForHealthy(h.profile.id, 5_000, { ignoreCancellation: true }),
    ).resolves.toBe(true);
  });

  it("keeps a running update recoverable while cancellation unwinds", async () => {
    const h = createHarness({ wasRunning: true });
    dirs.push(h.logDir);
    const now = new Date().toISOString();
    const job = {
      id: "running-update",
      type: "update" as const,
      serverId: h.profile.id,
      attempts: 1,
      maxAttempts: 3,
      status: "running" as const,
      phase: "applying-files",
      createdAt: now,
      updatedAt: now,
      lastError: null,
      recoveryReason: null as string | null,
      idempotencyKey: `update:${h.profile.id}:`,
      operatorRetryAllowed: false,
      context: {
        wasRunning: true,
        preUpdateBackupIds: ["bu-world", "bu-players", "bu-ini"],
      },
    };
    (h.service as unknown as { queue: Array<typeof job> }).queue = [job];

    expect(await h.service.cancelSteamCmd()).toBe(true);
    expect(h.backups.requestCancel).toHaveBeenCalled();

    expect(job).toMatchObject({
      status: "running",
      phase: "applying-files",
      recoveryReason: expect.stringMatching(/safe unwind/i),
    });
  });

  it("cancels only the running SteamCMD job and leaves queued work", async () => {
    const h = createHarness({ wasRunning: false });
    dirs.push(h.logDir);
    const now = new Date().toISOString();
    const running = {
      id: "running-install",
      type: "install-files" as const,
      serverId: h.profile.id,
      attempts: 1,
      maxAttempts: 3,
      status: "running" as const,
      phase: "applying-files",
      createdAt: now,
      updatedAt: now,
      lastError: null,
      recoveryReason: null as string | null,
      idempotencyKey: `install-files:${h.profile.id}:`,
      operatorRetryAllowed: false,
      context: {},
    };
    const pending = {
      ...running,
      id: "queued-update",
      type: "update" as const,
      status: "pending" as const,
      phase: "queued",
      attempts: 0,
      idempotencyKey: `update:${h.profile.id}:`,
    };
    (h.service as unknown as { queue: Array<typeof running | typeof pending> }).queue = [
      running,
      pending,
    ];

    expect(await h.service.cancelSteamCmd()).toBe(true);
    expect(running.status).toBe("running");
    expect(pending).toMatchObject({
      status: "pending",
      phase: "queued",
    });
  });

  it("does not drain queued jobs when SteamCMD is idle", async () => {
    const h = createHarness({ wasRunning: false });
    dirs.push(h.logDir);
    const now = new Date().toISOString();
    const pending = {
      id: "queued-install",
      type: "install-files" as const,
      serverId: h.profile.id,
      attempts: 0,
      maxAttempts: 3,
      status: "pending" as const,
      phase: "queued",
      createdAt: now,
      updatedAt: now,
      lastError: null,
      recoveryReason: null as string | null,
      idempotencyKey: `install-files:${h.profile.id}:`,
      operatorRetryAllowed: false,
      context: {},
    };
    (h.service as unknown as { queue: Array<typeof pending> }).queue = [pending];

    expect(await h.service.cancelSteamCmd()).toBe(false);
    expect(pending.status).toBe("pending");
  });

  it("skips rollback restore when cancelled during pre-update backup", async () => {
    const h = createHarness({ wasRunning: true });
    dirs.push(h.logDir);
    const { OperationCancelledError } = await import(
      "@backend/domains/updates/robocopy-tree"
    );
    h.backups.createPreUpdateBackupForJob.mockImplementation(async () => {
      h.order.push("pre_update");
      (h.service as unknown as { cancelRequested: boolean }).cancelRequested = true;
      throw new OperationCancelledError();
    });

    await expect(h.performUpdate()).rejects.toThrow(/cancelled/i);

    expect(h.backups.restoreBackupForJob).not.toHaveBeenCalled();
    expect(h.order).toEqual(["stop", "pre_update", "start"]);
  });

  it("rolls back pre_update backups and restarts when SteamCMD fails while wasRunning", async () => {
    const h = createHarness({
      wasRunning: true,
      steam: { code: 1, stderr: "boom" },
    });
    dirs.push(h.logDir);

    await expect(h.performUpdate()).rejects.toThrow(/SteamCMD exited with code 1/);

    expect(h.backups.restoreBackupForJob).toHaveBeenCalledTimes(1);
    expect(h.backups.restoreBackupForJob).toHaveBeenCalledWith(
      h.profile.id,
      "bu-world",
      expect.objectContaining({ onProgressMessage: expect.any(Function) }),
    );
    expect(h.order).toEqual([
      "stop",
      "pre_update",
      "steam",
      "restore",
      "start",
    ]);
  });

  it("verify stops and restarts when running, without pre_update or rollback", async () => {
    const h = createHarness({ wasRunning: true });
    dirs.push(h.logDir);

    await h.performVerify();

    expect(h.instances.stop).toHaveBeenCalledWith(h.profile.id, {
      backup: false,
    });
    expect(h.backups.createPreUpdateBackupForJob).not.toHaveBeenCalled();
    expect(h.backups.restoreBackupForJob).not.toHaveBeenCalled();
    expect(h.order).toEqual(["stop", "steam", "start"]);
  });

  it("rejects update while a stop+backup is in progress", async () => {
    const h = createHarness({ wasRunning: true });
    dirs.push(h.logDir);
    h.instances.isStopInProgress.mockReturnValue(true);

    await expect(h.service.updateServer(h.profile.id)).rejects.toThrow(
      /still in progress/i,
    );
    expect(h.runSteamUpdate).not.toHaveBeenCalled();
    expect(h.backups.createPreUpdateBackupForJob).not.toHaveBeenCalled();
  });

  it("replaces a cancelled leftover when the same files job is queued again", async () => {
    const h = createHarness({ wasRunning: false });
    dirs.push(h.logDir);
    const now = new Date().toISOString();
    const cancelled = {
      id: "cancelled-verify",
      type: "verify-files" as const,
      serverId: h.profile.id,
      attempts: 1,
      maxAttempts: 3,
      status: "cancelled" as const,
      phase: "cancelled",
      createdAt: now,
      updatedAt: now,
      lastError: null,
      recoveryReason: "Cancelled by the operator during execution.",
      idempotencyKey: `verify-files:${h.profile.id}:`,
      operatorRetryAllowed: false,
      context: {},
    };
    (h.service as unknown as { queue: Array<typeof cancelled> }).queue = [cancelled];

    await h.service.verifyServerFiles(h.profile.id);

    expect(h.runSteamUpdate).toHaveBeenCalled();
    expect(
      h.service.getSteamCmdStatus().criticalJobs.find((job) => job.id === "cancelled-verify"),
    ).toBeUndefined();
  });

  it("still requires Retry or Dismiss for a failed leftover", async () => {
    const h = createHarness({ wasRunning: false });
    dirs.push(h.logDir);
    const now = new Date().toISOString();
    const failed = {
      id: "failed-verify",
      type: "verify-files" as const,
      serverId: h.profile.id,
      attempts: 3,
      maxAttempts: 3,
      status: "failed" as const,
      phase: "failed",
      createdAt: now,
      updatedAt: now,
      lastError: "SteamCMD exited with code 1",
      recoveryReason: "SteamCMD failed.",
      idempotencyKey: `verify-files:${h.profile.id}:`,
      operatorRetryAllowed: true,
      context: {},
    };
    (h.service as unknown as { queue: Array<typeof failed> }).queue = [failed];

    await expect(h.service.verifyServerFiles(h.profile.id)).rejects.toThrow(
      /Retry or Dismiss/i,
    );
    expect(h.runSteamUpdate).not.toHaveBeenCalled();
    expect(h.service.getSteamCmdStatus().criticalJobs[0]).toMatchObject({
      id: "failed-verify",
      status: "failed",
    });
  });

  it("replaces a queued Verify with Update and does not leave Needs attention", async () => {
    const h = createHarness({ wasRunning: false });
    dirs.push(h.logDir);
    const now = new Date().toISOString();
    const pendingVerify = {
      id: "pending-verify",
      type: "verify-files" as const,
      serverId: h.profile.id,
      attempts: 0,
      maxAttempts: 3,
      status: "pending" as const,
      phase: "queued",
      createdAt: now,
      updatedAt: now,
      lastError: null,
      recoveryReason: null,
      idempotencyKey: `verify-files:${h.profile.id}:`,
      operatorRetryAllowed: false,
      context: {},
    };
    (h.service as unknown as { queue: Array<typeof pendingVerify> }).queue = [
      pendingVerify,
    ];

    await h.service.updateServer(h.profile.id);

    expect(h.runSteamUpdate).toHaveBeenCalled();
    const leftover = h.service
      .getSteamCmdStatus()
      .criticalJobs.find((job) => job.id === "pending-verify");
    expect(leftover).toBeUndefined();
  });

  it("does not queue Verify while Update is already pending", async () => {
    const h = createHarness({ wasRunning: false });
    dirs.push(h.logDir);
    const now = new Date().toISOString();
    const pendingUpdate = {
      id: "pending-update",
      type: "update" as const,
      serverId: h.profile.id,
      attempts: 0,
      maxAttempts: 3,
      status: "pending" as const,
      phase: "queued",
      createdAt: now,
      updatedAt: now,
      lastError: null,
      recoveryReason: null,
      idempotencyKey: `update:${h.profile.id}:`,
      operatorRetryAllowed: false,
      context: {},
    };
    (h.service as unknown as { queue: Array<typeof pendingUpdate> }).queue = [
      pendingUpdate,
    ];

    await expect(h.service.verifyServerFiles(h.profile.id)).rejects.toThrow(
      /already in Downloads/i,
    );
    expect(h.runSteamUpdate).not.toHaveBeenCalled();
    expect(h.service.getSteamCmdStatus().criticalJobs[0]).toMatchObject({
      id: "pending-update",
      status: "pending",
    });
  });

  it("does not interrupt a running Verify when Update is requested", async () => {
    let releaseSteam: ((result: SteamStub) => void) | undefined;
    const h = createHarness({
      wasRunning: false,
      steam: () =>
        new Promise<SteamStub>((resolve) => {
          releaseSteam = resolve;
        }),
    });
    dirs.push(h.logDir);

    const verifyPromise = h.service.verifyServerFiles(h.profile.id);
    await vi.waitFor(() => {
      expect(releaseSteam).toEqual(expect.any(Function));
    });

    await expect(h.service.updateServer(h.profile.id)).rejects.toThrow(
      /running/i,
    );
    releaseSteam!({ code: 0, stdout: "ok" });
    await verifyPromise;
  });
});
