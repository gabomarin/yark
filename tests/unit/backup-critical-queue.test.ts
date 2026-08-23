import { describe, expect, it, vi } from "vitest";
import {
  BackupCriticalQueue,
  type BackupCriticalQueueDependencies,
} from "@backend/domains/backups/backup-critical-queue";
import type { BackupCriticalJobExecutor } from "@backend/domains/backups/backup-critical-job-executor";
import type { BackupCriticalJob } from "@backend/domains/backups/backup-critical-jobs";
import type { ServerProfile } from "@shared/types";

const QUEUE_KEY = "backupCriticalJobsQueue.v1";

function makeProfile(): ServerProfile {
  const now = new Date().toISOString();
  return {
    id: "srv-1",
    name: "Island",
    map: "TheIsland_WP",
    installDir: "C:\\ARK",
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

function makeRestoreJob(
  status: BackupCriticalJob["status"],
  phase: string,
): BackupCriticalJob {
  const now = new Date().toISOString();
  return {
    id: `restore-${status}`,
    type: "restore",
    serverId: "srv-1",
    backupId: "backup-1",
    attempts: status === "pending" ? 0 : 1,
    maxAttempts: 3,
    status,
    phase,
    createdAt: now,
    updatedAt: now,
    lastError: status === "pending" ? null : "Interrupted while applying restore",
    recoveryReason: status === "pending" ? null : "Restore outcome is ambiguous.",
    idempotencyKey: "restore:srv-1:backup-1",
    operatorRetryAllowed: status !== "pending",
    context: {},
  };
}

function createQueue(
  job: BackupCriticalJob,
  executor: BackupCriticalJobExecutor,
): BackupCriticalQueue {
  const profile = makeProfile();
  const store = new Map<string, string | null>([[QUEUE_KEY, JSON.stringify([job])]]);
  const dependencies: BackupCriticalQueueDependencies = {
    servers: {
      get: vi.fn((serverId: string) => serverId === profile.id ? profile : null),
      addEvent: vi.fn(() => 1),
    },
    backups: {
      completeRestoreHistory: vi.fn(),
      getBackup: vi.fn(() => null),
      getRestoreHistory: vi.fn(() => null),
    },
    settings: {
      get: vi.fn((key: string) => store.get(key) ?? null),
      set: vi.fn((key: string, value: string | null) => {
        store.set(key, value);
      }),
    },
    executor,
    scheduleProcess: vi.fn(),
  };
  return new BackupCriticalQueue(dependencies);
}

describe("BackupCriticalQueue", () => {
  it("blocks a non-transient failure after restore application begins", async () => {
    const executor: BackupCriticalJobExecutor = {
      resumePreUpdateBackupJob: vi.fn(),
      resumeRestoreJob: vi.fn(async (_job, control) => {
        control.checkpoint("applying-restore");
        throw new Error("permission denied while copying SavedArks");
      }),
    };
    const queue = createQueue(makeRestoreJob("pending", "queued"), executor);

    await queue.processQueue();

    expect(queue.getCriticalJobs()[0]).toMatchObject({
      status: "blocked",
      phase: "applying-restore",
      nextActions: ["retry", "dismiss"],
    });
  });

  it.each(["blocked", "failed"] as const)(
    "adopts a nested %s retryable restore when its parent rollback is retried",
    async (status) => {
      const executor: BackupCriticalJobExecutor = {
        resumePreUpdateBackupJob: vi.fn(),
        resumeRestoreJob: vi.fn(async () => undefined),
      };
      const queue = createQueue(
        makeRestoreJob(status, status === "blocked" ? "applying-restore" : "failed"),
        executor,
      );

      const completion = queue.enqueueAndWait<void>(
        "restore",
        "srv-1",
        "backup-1",
        { adoptRetryableRestore: true },
      );
      await queue.processQueue();
      await completion;

      expect(executor.resumeRestoreJob).toHaveBeenCalledOnce();
      expect(queue.getCriticalJobs()).toEqual([]);
    },
  );
});
