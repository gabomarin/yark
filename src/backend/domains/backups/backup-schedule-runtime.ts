/**
 * Scheduled world-backup cycle orchestration for BackupService.
 */

import { backupFinishedAt } from "@shared/backup-player-meta";
import type { ServerProfile } from "@shared/types";
import type { BackupRepository } from "../../infra/db/backup-repository";
import type { ServerRepository } from "../../infra/db/server-repository";
import type { ProcessManager } from "../../infra/process/process-manager";
import type { BackupPolicy } from "@shared/types";
import { SCHEDULED_WORLD_FAIL_LIMIT } from "./backup-fleet";

export interface BackupScheduleHost {
  servers: ServerRepository;
  backups: BackupRepository;
  processes: ProcessManager;
  scheduledWorldInFlight: Set<string>;
  scheduledWorldFailStreak: Map<string, number>;
  scheduledWorldPaused: Set<string>;
  applyRetention: (serverId: string, policy: BackupPolicy) => Promise<void>;
  reconcileInterruptedRunningBackups: (serverId: string) => Promise<number>;
  emitChanged: (serverId: string) => void;
  createScheduledBackup: (serverId: string) => Promise<unknown>;
  isInstallReady: (server: ServerProfile) => Promise<boolean>;
}

/**
 * Walks policies on short intervals; overlapping ticks coalesce on the host flag.
 */
export class BackupScheduleRuntime {
  private cycleInFlight = false;

  constructor(private readonly host: BackupScheduleHost) {}

  get isCycleInFlight(): boolean {
    return this.cycleInFlight;
  }

  /** Runs policy backups and cleans retention per server. */
  async runScheduledCycle(): Promise<void> {
    if (this.cycleInFlight) return;
    this.cycleInFlight = true;
    try {
      const allServers = this.host.servers.list();
      for (const server of allServers) {
        try {
          await this.runScheduledServer(server);
        } catch (err) {
          this.recordScheduledCycleError(server, err);
        }
      }
    } finally {
      this.cycleInFlight = false;
    }
  }

  async runScheduledServer(server: ServerProfile): Promise<void> {
    const policy = this.host.backups.getPolicy(server.id);
    // Start interrupted-row reconcile as soon as the schedule will need it so a
    // concurrent list()/reconcileDiskBackups shares the same in-flight Promise.
    const interruptedPromise = policy.enabled
      ? this.host.reconcileInterruptedRunningBackups(server.id)
      : null;
    await this.host.applyRetention(server.id, policy);
    if (!policy.enabled) return;

    // Reconcile even when creates are session-paused so interrupted running
    // rows / temp artifacts are not stranded for the rest of the process.
    const reconciled = await interruptedPromise!;
    if (reconciled > 0) {
      this.host.emitChanged(server.id);
    }
    if (this.host.scheduledWorldPaused.has(server.id)) return;

    if (
      this.host.scheduledWorldInFlight.has(server.id)
      || this.host.backups.hasRunning(server.id, "world")
    ) {
      return;
    }

    const requiredMs = policy.intervalMinutes * 60 * 1000;
    // Gate on last finished scheduled world (completed or failed) so failures
    // do not retry every ~60s scheduler tick.
    const latestScheduledWorld = this.host.backups.latestFinished(
      server.id,
      "world",
      "scheduled",
    );
    if (latestScheduledWorld !== null) {
      const finishedAt = backupFinishedAt(latestScheduledWorld);
      const elapsedMs = Date.now() - Date.parse(finishedAt);
      if (Number.isFinite(elapsedMs) && elapsedMs < requiredMs) return;
    }

    if (!this.host.processes.isActive(server.id)) return;
    // Wait a full interval after the process became active so a fresh start
    // does not package on the first scheduler tick.
    const startedAtRaw = this.host.processes.getStatus(server.id).startedAt;
    const startedAtMs =
      startedAtRaw !== null && startedAtRaw.length > 0
        ? Date.parse(startedAtRaw)
        : Number.NaN;
    if (!Number.isFinite(startedAtMs)) return;
    if (Date.now() - startedAtMs < requiredMs) return;
    if (!(await this.host.isInstallReady(server))) return;

    this.host.scheduledWorldInFlight.add(server.id);
    try {
      await this.host.createScheduledBackup(server.id);
      this.host.scheduledWorldFailStreak.delete(server.id);
    } catch (err) {
      const streak = (this.host.scheduledWorldFailStreak.get(server.id) ?? 0) + 1;
      this.host.scheduledWorldFailStreak.set(server.id, streak);
      if (streak >= SCHEDULED_WORLD_FAIL_LIMIT) {
        this.host.scheduledWorldPaused.add(server.id);
        this.host.servers.addEvent(
          server.id,
          "error",
          "error",
          `World schedule paused for \"${server.name}\" after ${SCHEDULED_WORLD_FAIL_LIMIT} consecutive scheduled failures (this YARK session only)`,
          {
            what: "Scheduled world backups are paused until YARK restarts.",
            cause: err instanceof Error ? err.message : String(err),
            suggestion:
              "Fix the failure cause (destination, map folder, disk space), then restart YARK to resume the schedule. Policy.enabled is unchanged.",
            context: {
              trigger: "scheduled",
              kind: "world",
              failStreak: streak,
            },
          },
        );
      }
      this.host.servers.addEvent(
        server.id,
        "error",
        "error",
        `Scheduled backup failed for \"${server.name}\": ${
          err instanceof Error ? err.message : String(err)
        }`,
        {
          what: "A scheduled world backup did not complete.",
          cause: err instanceof Error ? err.message : String(err),
          suggestion:
            "Confirm the server is reachable for save flush, destination disk has space, and retry from the Backups tab.",
          context: {
            trigger: "scheduled",
            kind: "world",
          },
        },
      );
    } finally {
      this.host.scheduledWorldInFlight.delete(server.id);
    }
  }

  recordScheduledCycleError(
    server: ServerProfile,
    error: unknown,
  ): void {
    const message = error instanceof Error ? error.message : String(error);
    try {
      this.host.servers.addEvent(
        server.id,
        "error",
        "error",
        `Scheduled backup cycle failed for \"${server.name}\": ${message}`,
        {
          what: "The scheduler could not evaluate or maintain this server's backup policy.",
          cause: message,
          suggestion:
            "Check the backup destination and app logs. Other servers will continue to be evaluated.",
          context: {
            trigger: "scheduled",
            phase: "policy-retention-or-reconciliation",
          },
        },
      );
    } catch (eventError) {
      console.error(
        `Scheduled backup cycle failed for "${server.name}"`,
        error,
        eventError,
      );
    }
  }
}
