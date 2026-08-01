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
    sessionName: "Session",
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
  return (["world", "players", "ini"] as const).map((kind, index) => ({
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
  }));
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
        makePreUpdateBackups(profile.id).filter((backup) => backupIds.includes(backup.id)),
    ),
    restoreBackupForJob: vi.fn(async () => {
      order.push("restore");
    }),
    restoreBackupForRollbackRecovery: vi.fn(async () => {
      order.push("restore");
    }),
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

  const settings = {
    get: vi.fn(() => null),
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
    const backups = makePreUpdateBackups(h.profile.id);
    h.backups.getCompletedBackupsForCriticalJob.mockReturnValue([backups[0]!, backups[1]!]);
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
        preUpdateBackupIds: backups.map((backup) => backup.id),
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
        rollbackRestoredBackupIds: [backups[0]!.id],
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
    expect(h.backups.restoreBackupForRollbackRecovery).toHaveBeenCalledTimes(2);
    expect(h.instances.startForMaintenance).toHaveBeenCalledWith(h.profile.id);
    expect(job.phase).toBe("rollback-complete");
    expect(h.order).toEqual(["restore", "restore", "start"]);
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

  it("keeps a running update recoverable while cancellation unwinds", () => {
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

    expect(h.service.cancelSteamCmd()).toBe(true);

    expect(job).toMatchObject({
      status: "running",
      phase: "applying-files",
      recoveryReason: expect.stringMatching(/safe unwind/i),
    });
  });

  it("rolls back pre_update backups and restarts when SteamCMD fails while wasRunning", async () => {
    const h = createHarness({
      wasRunning: true,
      steam: { code: 1, stderr: "boom" },
    });
    dirs.push(h.logDir);

    await expect(h.performUpdate()).rejects.toThrow(/SteamCMD exited with code 1/);

    expect(h.backups.restoreBackupForJob).toHaveBeenCalledTimes(3);
    expect(h.backups.restoreBackupForJob).toHaveBeenCalledWith(
      h.profile.id,
      "bu-world",
    );
    expect(h.backups.restoreBackupForJob).toHaveBeenCalledWith(
      h.profile.id,
      "bu-players",
    );
    expect(h.backups.restoreBackupForJob).toHaveBeenCalledWith(
      h.profile.id,
      "bu-ini",
    );
    expect(h.order).toEqual([
      "stop",
      "pre_update",
      "steam",
      "restore",
      "restore",
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
});
