import type {
  ServerProfile,
  ServerStopProgress,
  ServerStopProgressReason,
} from "@shared/types";
import type { BackupService } from "../backups/backup-service";
import type { InstanceLockManager } from "../../orchestration/instance-lock-manager";
import type { ServerRepository } from "../../infra/db/server-repository";
import type { ProcessManager } from "../../infra/process/process-manager";
import {
  backupKindLabel,
  backingUpPercent,
  buildServerStopProgress,
  buildServerStoppedEventMessage,
  type StopJobOutcome,
} from "./instance-lifecycle";

export interface StopServerOptions {
  /** When true (default), create a stable stop backup after process exit. */
  backup?: boolean;
  /** Progress reason for UI (quit shows the blocking overlay). Default `"user"`. */
  reason?: ServerStopProgressReason;
}

interface InstanceStopDependencies {
  repo: ServerRepository;
  processes: ProcessManager;
  backups: BackupService;
  locks: InstanceLockManager;
  emitProgress: (payload: ServerStopProgress) => void;
}

/**
 * Owns stop/restart critical-job tracking and the graceful stop + backup pipeline.
 * InstanceService keeps the stable lifecycle facade.
 */
export class InstanceStop {
  private readonly stopJobs = new Map<string, Promise<StopJobOutcome>>();
  /** Covers restart after stopJobs clears (pre_restart ZIP only; not start). */
  private readonly criticalJobs = new Map<string, Promise<unknown>>();

  constructor(private readonly dependencies: InstanceStopDependencies) {}

  stop(id: string, options?: StopServerOptions): Promise<void> {
    if (this.criticalJobs.has(id)) {
      return Promise.reject(
        new Error("Cannot stop while a restart is in progress"),
      );
    }
    const existing = this.stopJobs.get(id);
    if (existing !== undefined) return existing.then(() => undefined);
    const reason = options?.reason ?? "user";

    if (options?.backup === false) {
      return this.enqueue(id, false, reason).then(() => undefined);
    }
    return this.dependencies.locks
      .withLock(id, "stop-and-backup", () => this.enqueue(id, true, reason))
      .then(() => undefined);
  }

  isInProgress(serverId?: string): boolean {
    if (serverId === undefined) {
      return this.stopJobs.size > 0 || this.criticalJobs.size > 0;
    }
    return this.stopJobs.has(serverId) || this.criticalJobs.has(serverId);
  }

  async waitForJobs(): Promise<void> {
    const failures: unknown[] = [];
    while (this.stopJobs.size > 0 || this.criticalJobs.size > 0) {
      const results = await Promise.allSettled([
        ...this.stopJobs.values(),
        ...this.criticalJobs.values(),
      ]);
      for (const result of results) {
        if (result.status === "rejected") failures.push(result.reason);
      }
    }
    if (failures.length > 0) {
      throw failures[0];
    }
  }

  async stopAllForAppQuit(): Promise<void> {
    const activeIds = this.dependencies.repo
      .list()
      .filter((profile) => this.dependencies.processes.isActive(profile.id))
      .map((profile) => profile.id);
    if (activeIds.length === 0) {
      return;
    }
    const results = await Promise.allSettled(
      activeIds.map((id) => this.stop(id, { reason: "quit" })),
    );
    const firstFailure = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (firstFailure !== undefined) {
      throw firstFailure.reason;
    }
  }

  async withCriticalJob<T>(
    id: string,
    work: () => Promise<T>,
  ): Promise<T> {
    if (this.criticalJobs.has(id)) {
      throw new Error("Another server operation is already in progress");
    }
    const job = Promise.resolve()
      .then(() => work())
      .finally(() => {
        if (this.criticalJobs.get(id) === job) {
          this.criticalJobs.delete(id);
        }
      });
    this.criticalJobs.set(id, job);
    return job;
  }

  enqueue(
    id: string,
    wantBackup: boolean,
    reason: ServerStopProgressReason = "user",
  ): Promise<StopJobOutcome> {
    const existing = this.stopJobs.get(id);
    if (existing !== undefined) return existing;
    const job = this.run(id, wantBackup, reason).finally(() => {
      if (this.stopJobs.get(id) === job) {
        this.stopJobs.delete(id);
      }
    });
    this.stopJobs.set(id, job);
    return job;
  }

  private async run(
    id: string,
    wantBackup: boolean,
    reason: ServerStopProgressReason,
  ): Promise<StopJobOutcome> {
    const profile = this.mustGet(id);
    let didBackup = false;
    let exitedExternally = false;

    if (!this.dependencies.processes.isActive(id)) {
      return "noop";
    }

    const progress = (
      partial: Omit<ServerStopProgress, "serverId" | "reason">,
    ): ServerStopProgress => buildServerStopProgress(id, reason, partial);

    try {
      if (this.dependencies.processes.getStatus(id).status === "starting") {
        this.emitProgress(
          progress({
            active: true,
            phase: "waiting",
            label: "Waiting for server to finish starting…",
            percent: 5,
          }),
        );
        await this.dependencies.processes.waitWhileStarting(id);
        if (!this.dependencies.processes.isActive(id)) {
          return "absent";
        }
      }

      this.emitProgress(
        progress({
          active: true,
          phase: "saving",
          label: "Saving world…",
          percent: 10,
        }),
      );

      const runtimeProfile = this.dependencies.processes.applyRuntimePorts(profile);
      const preparation =
        await this.dependencies.processes.beginGracefulStop(runtimeProfile);
      if (preparation.phase === "absent") {
        return "absent";
      }

      if (preparation.phase === "killed") {
        this.dependencies.repo.addEvent(
          id,
          "server_stopped",
          "warning",
          `Server "${profile.name}" force-killed because RCON SaveWorld failed`,
        );
        return "killed";
      }

      this.emitProgress(
        progress({
          active: true,
          phase: "stopping",
          label: "Stopping server before backup…",
          percent: 25,
        }),
      );
      const finishResult =
        await this.dependencies.processes.finishGracefulStop(
          runtimeProfile,
          preparation.handle,
        );
      if (finishResult === "replaced") {
        throw new Error(
          "The original process was replaced during stop; the new process was left running",
        );
      }
      exitedExternally = finishResult === "already_exited";

      if (wantBackup) {
        try {
          await this.dependencies.backups.createPreStopBackup(id, {
            skipFlush: true,
            onKindProgress: (kind, index, total) => {
              this.emitProgress(
                progress({
                  active: true,
                  phase: "backing_up",
                  label: `Backing up ${backupKindLabel(kind)}…`,
                  percent: backingUpPercent(index, total),
                }),
              );
            },
          });
          didBackup = true;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.dependencies.repo.addEvent(
            id,
            "error",
            "warning",
            `Pre-stop backup failed for "${profile.name}": ${message}`,
          );
          this.emitProgress(
            progress({
              active: true,
              phase: "backing_up",
              label: "Backup failed — server remains stopped",
              percent: 70,
            }),
          );
        }
      }

      this.dependencies.repo.addEvent(
        id,
        "server_stopped",
        exitedExternally ? "warning" : "info",
        buildServerStoppedEventMessage({
          serverName: profile.name,
          exitedExternally,
          didBackup,
        }),
      );
      return exitedExternally ? "already_exited" : "stopped";
    } finally {
      this.emitProgress(
        progress({
          active: false,
          phase: null,
          label: "",
          percent: null,
        }),
      );
    }
  }

  private emitProgress(payload: ServerStopProgress): void {
    this.dependencies.emitProgress(payload);
  }

  private mustGet(id: string): ServerProfile {
    const profile = this.dependencies.repo.get(id);
    if (profile === null) {
      throw new Error("Server does not exist");
    }
    return profile;
  }
}
