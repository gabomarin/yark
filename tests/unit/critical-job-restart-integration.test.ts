import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UpdateService } from "@backend/domains/updates/update-service";
import { InstanceLockManager } from "@backend/orchestration/instance-lock-manager";
import type { AppSettingsRepository } from "@backend/infra/db/app-settings-repository";
import type { BackupService } from "@backend/domains/backups/backup-service";
import type { InstanceService } from "@backend/domains/instances/instance-service";
import type { ProcessManager } from "@backend/infra/process/process-manager";
import type { ServerRepository } from "@backend/infra/db/server-repository";
import type { ServerProfile } from "@shared/types";

const QUEUE_KEY = "criticalJobsQueue.v1";

function profile(): ServerProfile {
  const now = "2026-08-01T00:00:00.000Z";
  return {
    id: "server-1",
    name: "Restart fixture",
    map: "TheIsland_WP",
    installDir: "C:\\asa-e2e\\servers\\restart-fixture",
    sessionName: "Restart fixture",
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

function persistedJob(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "job-1",
    type: "update",
    serverId: "server-1",
    attempts: 1,
    maxAttempts: 3,
    status: "running",
    phase: "applying-files",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:01:00.000Z",
    lastError: null,
    recoveryReason: null,
    idempotencyKey: "update:server-1:",
    operatorRetryAllowed: false,
    context: { wasRunning: true },
    ...overrides,
  };
}

function createRestartedService(
  jobs: unknown,
  options: { serverExists?: boolean; active?: boolean } = {},
) {
  const values = new Map<string, string>([[QUEUE_KEY, JSON.stringify(jobs)]]);
  const settings = {
    get: vi.fn((key: string) => values.get(key) ?? null),
    set: vi.fn((key: string, value: string) => values.set(key, value)),
  } as unknown as AppSettingsRepository;
  const server = profile();
  let active = options.active ?? false;
  const servers = {
    get: vi.fn((id: string) =>
      options.serverExists === false || id !== server.id ? null : server),
    list: vi.fn(() => (options.serverExists === false ? [] : [server])),
    addEvent: vi.fn(),
  } as unknown as ServerRepository;
  const backups = {
    getCriticalJobs: vi.fn(() => []),
    retryCriticalJob: vi.fn(() => false),
    dismissCriticalJob: vi.fn(() => false),
    cancelCriticalJob: vi.fn(() => false),
    restoreBackupForRollbackRecovery: vi.fn(async () => undefined),
  } as unknown as BackupService;
  const instances = {
    isStopInProgress: vi.fn(() => false),
    startForMaintenance: vi.fn(async () => {
      active = true;
    }),
  } as unknown as InstanceService;
  const processes = {
    isActive: vi.fn(() => active),
  } as unknown as ProcessManager;
  const locks = new InstanceLockManager();
  const service = new UpdateService(
    servers,
    backups,
    instances,
    processes,
    locks,
    settings,
    "C:\\asa-e2e\\profiles\\restart-fixture\\update-logs",
    "C:\\asa-e2e\\profiles\\restart-fixture\\steamcmd",
  );
  return { service, settings, values, instances, servers, locks };
}

describe("UpdateService restart simulation at durable phase boundaries", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("preserves a job restarted immediately after enqueue", () => {
    const originalCreatedAt = "2026-07-31T23:00:00.000Z";
    const { service } = createRestartedService([
      persistedJob({
        status: "pending",
        phase: "queued",
        attempts: 0,
        createdAt: originalCreatedAt,
      }),
    ]);

    const [job] = service.getSteamCmdStatus().criticalJobs;
    expect(job).toMatchObject({
      status: "pending",
      phase: "queued",
      attempts: 0,
      createdAt: originalCreatedAt,
      nextActions: ["cancel"],
    });
  });

  it("replays a safe interrupted verify phase but blocks an ambiguous update", () => {
    const { service } = createRestartedService([
      persistedJob({
        id: "verify-1",
        type: "verify-files",
        idempotencyKey: "verify-files:server-1:",
      }),
      persistedJob({ id: "update-1" }),
    ]);

    expect(service.getSteamCmdStatus().criticalJobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "verify-1", status: "pending" }),
        expect.objectContaining({
          id: "update-1",
          status: "blocked",
          nextActions: ["retry", "dismiss"],
        }),
      ]),
    );
  });

  it("continues only the runtime transition after a files-applied checkpoint", async () => {
    const { service, instances, locks } = createRestartedService([
      persistedJob({
        type: "verify-files",
        phase: "files-applied",
        idempotencyKey: "verify-files:server-1:",
        context: { wasRunning: true, steamCmdExitCode: 0, appliedBuildId: "123" },
      }),
    ]);
    const runSteamUpdate = vi.fn();
    Object.assign(service as object, {
      runSteamUpdate,
      waitForHealthy: vi.fn(async () => true),
    });
    const withLock = vi.spyOn(locks, "withLock");

    await (service as unknown as { processQueue: () => Promise<void> }).processQueue();

    expect(instances.startForMaintenance).toHaveBeenCalledWith("server-1");
    expect(withLock).toHaveBeenCalledWith(
      "server-1",
      "verify-files-recovery",
      expect.any(Function),
    );
    expect(runSteamUpdate).not.toHaveBeenCalled();
    expect(service.getSteamCmdStatus().criticalJobs).toEqual([]);
  });

  it("reconciles a completed side effect when the requested runtime is already active", () => {
    const { service } = createRestartedService(
      [persistedJob({ phase: "restarting-server" })],
      { active: true },
    );

    expect(service.getSteamCmdStatus().criticalJobs).toEqual([]);
  });

  it("automatic update retry resumes from persisted pre-update backups", async () => {
    const { service } = createRestartedService([
      persistedJob({
        status: "pending",
        phase: "queued",
        attempts: 0,
        context: {
          wasRunning: true,
          preUpdateBackupIds: ["world-1", "players-1", "ini-1"],
        },
      }),
    ]);
    const observedPhases: string[] = [];
    const performUpdateServer = vi.fn(async (_serverId: string, input: { phase: string }) => {
      observedPhases.push(input.phase);
      if (observedPhases.length === 1) {
        input.phase = "rollback-complete";
        throw new Error("network timed out");
      }
    });
    Object.assign(service as object, { performUpdateServer });

    const processing = (
      service as unknown as { processQueue: () => Promise<void> }
    ).processQueue();
    await vi.advanceTimersByTimeAsync(5_000);
    await processing;

    expect(observedPhases).toEqual(["queued", "pre-update-backup-complete"]);
    expect(service.getSteamCmdStatus().criticalJobs).toEqual([]);
  });

  it.each([
    ["restarting-server", "restarting-server"],
    ["rollback-restoring-backups", "rollback-restoring-backups"],
  ])("operator Retry preserves the %s recovery route", (phase, expectedPhase) => {
    const { service } = createRestartedService([
      persistedJob({
        phase,
        context: {
          wasRunning: true,
          preUpdateBackupIds: ["world-1", "players-1", "ini-1"],
        },
      }),
    ]);
    const processQueue = vi.fn(async () => undefined);
    Object.assign(service as object, { processQueue });

    expect(service.retryCriticalJob("job-1")).toBe(true);

    expect(service.getSteamCmdStatus().criticalJobs[0]).toMatchObject({
      status: "pending",
      phase: expectedPhase,
    });
    expect(processQueue).toHaveBeenCalledOnce();
  });

  it("keeps rollback-complete evidence when transient retries are exhausted", async () => {
    const { service } = createRestartedService([
      persistedJob({
        status: "pending",
        phase: "queued",
        attempts: 2,
        context: {
          wasRunning: true,
          preUpdateBackupIds: ["world-1", "players-1", "ini-1"],
        },
      }),
    ]);
    Object.assign(service as object, {
      performUpdateServer: vi.fn(async (_serverId: string, input: { phase: string }) => {
        input.phase = "rollback-complete";
        throw new Error("network timed out");
      }),
    });

    await (service as unknown as { processQueue: () => Promise<void> }).processQueue();

    expect(service.getSteamCmdStatus().criticalJobs[0]).toMatchObject({
      status: "failed",
      phase: "rollback-complete",
      recoveryReason: expect.stringMatching(/rollback completed successfully/i),
      nextActions: ["retry", "dismiss"],
    });
  });

  it("blocks cancellation that is interrupted during rollback", async () => {
    const { service } = createRestartedService([
      persistedJob({
        status: "pending",
        phase: "queued",
        context: {
          wasRunning: true,
          preUpdateBackupIds: ["world-1", "players-1", "ini-1"],
        },
      }),
    ]);
    Object.assign(service as object, {
      performUpdateServer: vi.fn(async (_serverId: string, input: { phase: string }) => {
        service.cancelSteamCmd();
        input.phase = "rollback-restoring-backups";
        throw new Error("Operation cancelled during rollback");
      }),
    });

    await (service as unknown as { processQueue: () => Promise<void> }).processQueue();

    expect(service.getSteamCmdStatus().criticalJobs[0]).toMatchObject({
      status: "blocked",
      phase: "rollback-restoring-backups",
      nextActions: ["retry", "dismiss"],
    });
  });

  it("surfaces completed rollback as failed-but-retryable instead of replaying it", () => {
    const { service } = createRestartedService([
      persistedJob({ phase: "rollback-complete", lastError: "SteamCMD failed" }),
    ]);

    expect(service.getSteamCmdStatus().criticalJobs[0]).toMatchObject({
      status: "failed",
      phase: "rollback-complete",
      nextActions: ["retry", "dismiss"],
    });
  });

  it("preserves cancellation and does not offer Retry", () => {
    const { service } = createRestartedService([
      persistedJob({ status: "cancelled", phase: "cancelled" }),
    ]);

    expect(service.getSteamCmdStatus().criticalJobs[0]).toMatchObject({
      status: "cancelled",
      nextActions: ["dismiss"],
    });
  });

  it("fails a missing-profile job without offering an unsupported retry", () => {
    const { service } = createRestartedService([persistedJob()], {
      serverExists: false,
    });

    expect(service.getSteamCmdStatus().criticalJobs[0]).toMatchObject({
      status: "failed",
      nextActions: ["dismiss"],
    });
  });

  it("quarantines queue rows with unsupported persisted status or phase", () => {
    const unsupportedRows = [
      persistedJob({ id: "bad-status", status: "mystery" }),
      persistedJob({ id: "bad-phase", phase: "phase-x" }),
    ];
    const { service, settings } = createRestartedService(unsupportedRows);

    expect(service.getSteamCmdStatus().criticalJobs).toEqual([]);
    expect(settings.set).toHaveBeenCalledWith(
      expect.stringMatching(/^criticalJobsQueue\.v1\.quarantine\./),
      JSON.stringify(unsupportedRows),
    );
    expect(settings.set).toHaveBeenCalledWith(QUEUE_KEY, "[]");
  });

  it("blocks duplicate durable rows at the most conservative recovery phase", () => {
    const duplicateRows = [
      persistedJob({
        id: "rollback-copy",
        status: "blocked",
        phase: "rollback-restoring-backups",
        updatedAt: "2026-08-01T00:01:00.000Z",
        operatorRetryAllowed: true,
        context: {
          wasRunning: true,
          preUpdateBackupIds: ["world-1", "players-1", "ini-1"],
        },
      }),
      persistedJob({
        id: "stale-copy",
        status: "pending",
        phase: "validated",
        updatedAt: "2026-08-01T00:02:00.000Z",
      }),
    ];
    const { service, settings } = createRestartedService(duplicateRows);

    expect(service.getSteamCmdStatus().criticalJobs).toHaveLength(1);
    expect(service.getSteamCmdStatus().criticalJobs[0]).toMatchObject({
      status: "blocked",
      phase: "rollback-restoring-backups",
      nextActions: ["retry", "dismiss"],
    });
    expect(settings.set).toHaveBeenCalledWith(
      expect.stringMatching(/^criticalJobsQueue\.v1\.quarantine\./),
      JSON.stringify(duplicateRows),
    );
  });

  it("quarantines corrupt queue data and keeps the service usable", () => {
    const { service, settings } = createRestartedService({ unsupported: true });

    expect(service.getSteamCmdStatus().criticalJobs).toEqual([]);
    expect(settings.set).toHaveBeenCalledWith(
      expect.stringMatching(/^criticalJobsQueue\.v1\.quarantine\./),
      JSON.stringify({ unsupported: true }),
    );
    expect(settings.set).toHaveBeenCalledWith(QUEUE_KEY, "[]");
  });
});
