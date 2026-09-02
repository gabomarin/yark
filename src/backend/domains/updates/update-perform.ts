import { mkdir, writeFile } from "node:fs/promises";
import type { AppEventDetails } from "../../../shared/types";
import { CRITICAL_BACKUP_KINDS, type BackupService } from "../backups/backup-service";
import type { ServerRepository } from "../../infra/db/server-repository";
import type { InstanceService } from "../instances/instance-service";
import type { ProcessManager } from "../../infra/process/process-manager";
import type { InstanceLockManager } from "../../orchestration/instance-lock-manager";
import {
  captureWasRunningOnJob,
  computePreUpdateBackupProgressPercent,
  formatPreUpdateBackupKindLabel,
  buildUpdateLogPath,
  formatUpdateLogContent,
  isPreUpdateBackupEvidenceComplete,
  resolveUpdateWasRunning,
  shouldBlockUpdateWhileServerRunning,
  shouldRestartServerAfterPreSteamCmdAbort,
  shouldResumeFromPreUpdateBackup,
  updateInstallMayHaveChanged,
} from "./update-server-jobs";
import {
  isOperationCancelledError,
  isOperationPausedError,
  OperationCancelledError,
  OperationPausedError,
  readAsaManifestBuildId,
} from "./steamcmd-content-cache";
import type { UpdateCriticalJob } from "./update-critical-jobs";
import type { CommandResult, SteamCmdFilesOperation } from "./steamcmd-run";

export class CriticalJobRecoveryBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CriticalJobRecoveryBlockedError";
  }
}

type CriticalJob = UpdateCriticalJob;

type AddJobEvent = (
  job: CriticalJob | undefined,
  type: "update_started" | "update_completed" | "update_failed" | "update_rolled_back",
  severity: "info" | "warning" | "error",
  message: string,
  details?: AppEventDetails | null,
  options?: { osNotify?: boolean },
) => number;

export interface UpdatePerformerDependencies {
  servers: ServerRepository;
  backups: BackupService;
  instances: InstanceService;
  processes: ProcessManager;
  locks: InstanceLockManager;
  updatesLogDir: string;
  checkpointJob: (job: CriticalJob | undefined, phase: string) => void;
  addJobEvent: AddJobEvent;
  runSteamUpdate: (
    installDir: string,
    operation: SteamCmdFilesOperation,
    serverId: string,
  ) => Promise<CommandResult>;
  appendSteamCmdConsole: (line: string) => void;
  setProgress: (percent: number | null, label: string | null, line?: string) => void;
  setPausedProgress: () => void;
  isPauseRequested: () => boolean;
  isCancelRequested: () => boolean;
  waitForHealthy: (
    serverId: string,
    timeoutMs: number,
    options?: { ignoreCancellation?: boolean },
  ) => Promise<boolean>;
}

export class UpdatePerformer {
  constructor(private readonly deps: UpdatePerformerDependencies) {}

  private get servers(): ServerRepository { return this.deps.servers; }
  private get backups(): BackupService { return this.deps.backups; }
  private get instances(): InstanceService { return this.deps.instances; }
  private get processes(): ProcessManager { return this.deps.processes; }
  private get locks(): InstanceLockManager { return this.deps.locks; }
  private get updatesLogDir(): string { return this.deps.updatesLogDir; }
  private get checkpointJob(): UpdatePerformerDependencies["checkpointJob"] { return this.deps.checkpointJob; }
  private get addJobEvent(): AddJobEvent { return this.deps.addJobEvent; }
  private get runSteamUpdate(): UpdatePerformerDependencies["runSteamUpdate"] { return this.deps.runSteamUpdate; }
  private get appendSteamCmdConsole(): UpdatePerformerDependencies["appendSteamCmdConsole"] { return this.deps.appendSteamCmdConsole; }
  private get setProgress(): UpdatePerformerDependencies["setProgress"] { return this.deps.setProgress; }
  private get setPausedProgress(): UpdatePerformerDependencies["setPausedProgress"] { return this.deps.setPausedProgress; }
  private get waitForHealthy(): UpdatePerformerDependencies["waitForHealthy"] { return this.deps.waitForHealthy; }
  private isPauseRequested(): boolean { return this.deps.isPauseRequested(); }
  private isCancelRequested(): boolean { return this.deps.isCancelRequested(); }

  async performInstallServerFiles(serverId: string, job?: CriticalJob): Promise<void> {
    await this.locks.withLock(serverId, "install-files", async () => {
      this.checkpointJob(job, "validating");
      const server = this.servers.get(serverId);
      if (server === null) {
        throw new Error("Server does not exist");
      }

      await mkdir(server.installDir, { recursive: true });
      this.addJobEvent(
        job,
        "update_started",
        "info",
        `Installing base files via SteamCMD on "${server.name}"`,
      );

      this.checkpointJob(job, "applying-files");
      const cmd = await this.runSteamUpdate(server.installDir, "install-files", serverId);
      if (cmd.code !== 0) {
        this.addJobEvent(
          job,
          "update_failed",
          "error",
          `Base install failed (exit ${cmd.code})`,
        );
        throw new Error(`SteamCMD exited with code ${cmd.code}`);
      }
      if (job !== undefined) {
        job.context.steamCmdExitCode = cmd.code;
        job.context.appliedBuildId = readAsaManifestBuildId(server.installDir);
      }
      this.checkpointJob(job, "files-applied");

      this.addJobEvent(
        job,
        "update_completed",
        "info",
        `Base files installed for "${server.name}"`,
      );
    });
  }

  async performUpdateServer(serverId: string, job?: CriticalJob): Promise<void> {
    await this.locks.withLock(serverId, "update", async () => {
      const server = this.servers.get(serverId);
      if (server === null) {
        throw new Error("Server does not exist");
      }

      const isCurrentlyRunning = this.processes.isActive(serverId);
      // Every production update runs as a durable job. Recheck after acquiring
      // the instance lock because the server may have started while this job
      // waited behind another SteamCMD operation or an app restart. Preserve
      // recovery for pre-policy jobs that already recorded running intent.
      if (
        shouldBlockUpdateWhileServerRunning({
          isCurrentlyRunning,
          hasDurableJob: job !== undefined,
          jobWasRunning: job?.context.wasRunning,
        })
      ) {
        // Operator-actionable: Stop → Retry. A plain Error would mark the job
        // failed with operatorRetryAllowed=false and only offer Dismiss.
        throw new CriticalJobRecoveryBlockedError(
          "Stop the server before updating files",
        );
      }

      // Backup identity is the durable resume signal. Unlike `phase`, it
      // survives validation checkpoints and a second crash during retry.
      const resumeFromPreUpdateBackup = shouldResumeFromPreUpdateBackup(
        job?.context.preUpdateBackupIds,
      );
      if (job !== undefined) {
        // A new SteamCMD attempt creates a new rollback generation. Evidence
        // from the prior completed rollback must never suppress this attempt's
        // restores if the process crashes again.
        job.context.rollbackRestoredBackupIds = [];
      }
      this.checkpointJob(job, "validating");
      const wasRunning = resolveUpdateWasRunning(
        job?.context.wasRunning,
        isCurrentlyRunning,
      );
      if (job !== undefined) {
        captureWasRunningOnJob(job.context, isCurrentlyRunning);
      }
      this.checkpointJob(job, "validated");
      const startedAt = new Date();
      this.servers.addEvent(
        serverId,
        "update_started",
        "info",
        `Starting safe update for \"${server.name}\"`,
        {
          what: wasRunning
            ? "Legacy safe update resumed (stop if needed → pre-update backup → SteamCMD → restart if it was running)."
            : "Safe update job started (stopped server → pre-update backup → SteamCMD).",
          location: server.installDir,
          suggestion: wasRunning
            ? "The manager will stop the server for a consistent pre-update backup and SteamCMD, then restart it if the update succeeds."
            : "Watch SteamCMD progress. The server will stay stopped after a successful update.",
          context: {
            operation: "update",
            wasRunning,
            installDir: server.installDir,
          },
        },
      );

      let preUpdateBackups: Awaited<
        ReturnType<BackupService["createPreUpdateBackupForJob"]>
      > = [];
      try {
        // Stop before snapshotting — live SavedArks writes would tear rollback archives.
        if (isCurrentlyRunning) {
          this.checkpointJob(job, "stopping-server");
          await this.instances.stop(serverId, { backup: false });
        }

        if (resumeFromPreUpdateBackup) {
          const persistedIds = job?.context.preUpdateBackupIds ?? [];
          preUpdateBackups = this.backups.getCompletedBackupsForCriticalJob(
            serverId,
            persistedIds,
          );
          // Compare against required critical kinds, not persisted id count:
          // pre-#275 jobs may still list a `players` id that is intentionally ignored.
          if (
            !isPreUpdateBackupEvidenceComplete(
              persistedIds,
              preUpdateBackups.length,
              CRITICAL_BACKUP_KINDS.length,
            )
          ) {
            throw new CriticalJobRecoveryBlockedError(
              "Persisted pre-update backup evidence is incomplete; operator review is required",
            );
          }
          this.appendSteamCmdConsole(
            `Reusing ${preUpdateBackups.length} completed pre-update backup(s) from a prior attempt.`,
          );
        } else {
          this.checkpointJob(job, "creating-pre-update-backup");
          this.appendSteamCmdConsole(
            "Creating pre-update backup (world) before SteamCMD…",
          );
          this.setProgress(
            5,
            "Creating pre-update backup…",
            "A world snapshot protects rollback if SteamCMD fails",
          );
          preUpdateBackups = await this.backups.createPreUpdateBackupForJob(serverId, {
            onKindProgress: (kind, index, total) => {
              const label = formatPreUpdateBackupKindLabel(kind);
              const percent = computePreUpdateBackupProgressPercent(index, total);
              this.appendSteamCmdConsole(
                `Pre-update backup ${index + 1}/${total}: ${label}…`,
              );
              this.setProgress(
                percent,
                `Backing up ${label}…`,
                `Pre-update backup ${index + 1} of ${total}`,
              );
            },
            onProgressMessage: (message) => {
              this.appendSteamCmdConsole(message);
              this.setProgress(null, message, message);
            },
          });
          if (job !== undefined) {
            job.context.preUpdateBackupIds = preUpdateBackups.map((backup) => backup.id);
          }
        }
        this.checkpointJob(job, "pre-update-backup-complete");
        this.appendSteamCmdConsole("Pre-update backups ready; starting SteamCMD…");
        this.setProgress(25, "Starting SteamCMD…", "Pre-update backups complete");

        await mkdir(this.updatesLogDir, { recursive: true });
        const logPath = buildUpdateLogPath(this.updatesLogDir, serverId, startedAt);
        if (job !== undefined) job.context.updateLogPath = logPath;

        this.checkpointJob(job, "applying-files");
        const cmd = await this.runSteamUpdate(server.installDir, "update", serverId);
        const durationMs = Date.now() - startedAt.getTime();
        await writeFile(
          logPath,
          formatUpdateLogContent({
            serverName: server.name,
            installDir: server.installDir,
            exitCode: cmd.code,
            startedAt,
            durationMs,
            stdout: cmd.stdout,
            stderr: cmd.stderr,
          }),
          "utf8",
        );

        if (cmd.code !== 0) {
          throw new Error(
            `SteamCMD exited with code ${cmd.code}. Check log: ${logPath}`,
          );
        }

        if (job !== undefined) {
          job.context.steamCmdExitCode = cmd.code;
          job.context.appliedBuildId = readAsaManifestBuildId(server.installDir);
        }
        this.checkpointJob(job, "files-applied");

        if (wasRunning) {
          this.checkpointJob(job, "restarting-server");
          await this.instances.startForMaintenance(serverId);
          const healthy = await this.waitForHealthy(serverId, 90_000);
          if (!healthy) {
            throw new Error("Server did not reach running state after update");
          }
        }

        this.addJobEvent(
          job,
          "update_completed",
          "info",
          wasRunning
            ? `Update completed on "${server.name}" and the server was restarted`
            : `Update completed on "${server.name}" (left stopped)`,
        );
      } catch (err) {
        if (err instanceof CriticalJobRecoveryBlockedError) throw err;

        const phaseAtFailure = job?.phase ?? "";
        const paused =
          this.isPauseRequested() || isOperationPausedError(err);
        const cancelled =
          this.isCancelRequested() || isOperationCancelledError(err);
        const installMayHaveChanged = updateInstallMayHaveChanged({
          phase: phaseAtFailure,
          steamCmdExitCode: job?.context.steamCmdExitCode,
          appliedBuildId: job?.context.appliedBuildId,
        });

        if (paused) {
          this.appendSteamCmdConsole(
            installMayHaveChanged
              ? "Paused after SteamCMD began; leaving files as-is for resume."
              : "Paused before SteamCMD applied files; no rollback restore needed.",
          );
          this.setPausedProgress();
          if (
            shouldRestartServerAfterPreSteamCmdAbort({
              wasRunning,
              installMayHaveChanged,
              serverIsActive: this.processes.isActive(serverId),
            })
          ) {
            this.appendSteamCmdConsole(
              `Restarting "${server.name}" after pause (server was running before update)…`,
            );
            await this.instances.startForMaintenance(serverId);
            const healthy = await this.waitForHealthy(serverId, 90_000, {
              ignoreCancellation: true,
            });
            if (!healthy) {
              throw new Error(
                "Update was paused before SteamCMD, but the server did not return to running",
              );
            }
          }
          throw isOperationPausedError(err) ? err : new OperationPausedError();
        }

        // Cancel (or failure) before SteamCMD touched the install: do not invent a
        // restore/safeguard unwind — that was the silent multi-minute "Waiting…" hang.
        if (cancelled && !installMayHaveChanged) {
          this.appendSteamCmdConsole(
            "Cancel before SteamCMD applied files; skipping rollback restore.",
          );
          this.setProgress(
            null,
            "Cancelled",
            "Stopped before game files changed; no rollback restore needed",
          );
          if (
            shouldRestartServerAfterPreSteamCmdAbort({
              wasRunning,
              installMayHaveChanged: false,
              serverIsActive: this.processes.isActive(serverId),
            })
          ) {
            this.appendSteamCmdConsole(
              `Restarting "${server.name}" after cancel (server was running before update)…`,
            );
            await this.instances.startForMaintenance(serverId);
            const healthy = await this.waitForHealthy(serverId, 90_000, {
              ignoreCancellation: true,
            });
            if (!healthy) {
              throw new Error(
                "Update was cancelled before SteamCMD, but the server did not return to running",
              );
            }
          }
          throw isOperationCancelledError(err) ? err : new OperationCancelledError();
        }

        this.checkpointJob(job, "rollback-stopping-server");
        this.appendSteamCmdConsole(
          installMayHaveChanged
            ? "Update failed after SteamCMD began; restoring pre-update backups…"
            : "Update failed; restoring pre-update backups…",
        );
        this.setProgress(
          null,
          "Rolling back…",
          "Restoring pre-update backups",
        );
        // Persist the failure event for Logs; OS toast waits for rollback or the
        // queue's definitive terminal update_failed (#331 — one banner per job).
        this.addJobEvent(
          job,
          "update_failed",
          "error",
          `Update failed on "${server.name}": ${
            err instanceof Error ? err.message : String(err)
          }`,
          {
            what: "Safe update failed (backup and/or SteamCMD step).",
            cause: err instanceof Error ? err.message : String(err),
            location: server.installDir,
            suggestion:
              "Open the Updates tab for the SteamCMD log. A rollback may follow automatically if pre-update backups were taken.",
            context: {
              operation: "update",
              installDir: server.installDir,
              wasRunning,
            },
          },
          { osNotify: false },
        );

        if (this.processes.isActive(serverId)) {
          await this.instances.stop(serverId, { backup: false });
        }

        for (const backup of preUpdateBackups) {
          this.checkpointJob(job, "rollback-restoring-backups");
          this.appendSteamCmdConsole(
            `Restoring pre-update ${backup.kind} backup…`,
          );
          this.setProgress(
            null,
            `Restoring ${backup.kind}…`,
            `Rollback restore (${backup.kind})`,
          );
          await this.backups.restoreBackupForJob(serverId, backup.id, {
            onProgressMessage: (message) => {
              this.appendSteamCmdConsole(message);
              this.setProgress(null, message, message);
            },
          });
          if (job !== undefined) {
            const restored = new Set(job.context.rollbackRestoredBackupIds ?? []);
            restored.add(backup.id);
            job.context.rollbackRestoredBackupIds = [...restored];
            this.checkpointJob(job, "rollback-restoring-backups");
          }
        }

        if (wasRunning) {
          this.checkpointJob(job, "rollback-restarting-server");
          await this.instances.startForMaintenance(serverId);
          const rollbackHealthy = await this.waitForHealthy(
            serverId,
            90_000,
            { ignoreCancellation: true },
          );
          if (!rollbackHealthy) {
            throw new Error(
              "Rollback ran but the server did not return to running",
            );
          }
        }

        const backupIds = preUpdateBackups.map((b) => b.id).join(", ");
        this.addJobEvent(
          job,
          "update_rolled_back",
          "warning",
          `Update automatically rolled back using backups ${backupIds}`,
          {
            what: "The failed update was rolled back using pre-update backups.",
            cause: wasRunning
              ? "Update failed; manager restored the pre-update archives and restarted the server."
              : "Update failed; manager restored the pre-update archives and left the server stopped.",
            suggestion:
              "Confirm world/players look correct, inspect the update log, then retry the update when ready.",
            context: {
              backupIds,
            },
          },
        );
        this.checkpointJob(job, "rollback-complete");

        // Rollback is recovery, not success — surface failure to the job queue / UI.
        throw err instanceof Error ? err : new Error(String(err));
      }
    });
  }

  async performVerifyServerFiles(serverId: string, job?: CriticalJob): Promise<void> {
    await this.locks.withLock(serverId, "verify-files", async () => {
      this.checkpointJob(job, "validating");
      const server = this.servers.get(serverId);
      if (server === null) {
        throw new Error("Server does not exist");
      }

      const isCurrentlyRunning = this.processes.isActive(serverId);
      const wasRunning = resolveUpdateWasRunning(
        job?.context.wasRunning,
        isCurrentlyRunning,
      );
      if (job !== undefined) {
        captureWasRunningOnJob(job.context, isCurrentlyRunning);
      }
      this.checkpointJob(job, "validated");
      this.addJobEvent(
        job,
        "update_started",
        "info",
        `Verifying file integrity (SteamCMD validate) on "${server.name}"`,
        {
          what: "SteamCMD validate job started.",
          location: server.installDir,
          suggestion: wasRunning
            ? "The manager will stop the server for SteamCMD validate, then restart it if verification succeeds."
            : "Watch SteamCMD progress. The server will stay stopped after a successful verify.",
          context: {
            operation: "verify-files",
            wasRunning,
          },
        },
      );

      if (isCurrentlyRunning) {
        this.checkpointJob(job, "stopping-server");
        this.appendSteamCmdConsole(
          `Stopping "${server.name}" before integrity check…`,
        );
        await this.instances.stop(serverId, { backup: false });
      }

      try {
        await mkdir(server.installDir, { recursive: true });
        this.checkpointJob(job, "applying-files");
        const cmd = await this.runSteamUpdate(server.installDir, "verify-files", serverId);
        if (cmd.code !== 0) {
          this.addJobEvent(
            job,
            "update_failed",
            "error",
            `Integrity verification failed (exit ${cmd.code})`,
          );
          throw new Error(`SteamCMD validate exited with code ${cmd.code}`);
        }

        if (job !== undefined) {
          job.context.steamCmdExitCode = cmd.code;
          job.context.appliedBuildId = readAsaManifestBuildId(server.installDir);
        }
        this.checkpointJob(job, "files-applied");

        if (wasRunning) {
          this.checkpointJob(job, "restarting-server");
          await this.instances.startForMaintenance(serverId);
          const healthy = await this.waitForHealthy(serverId, 90_000);
          if (!healthy) {
            throw new Error(
              "Verification OK but the server did not return to running",
            );
          }
        }

        // After restart health — never toast success while the server is still down (#331).
        this.addJobEvent(
          job,
          "update_completed",
          "info",
          wasRunning
            ? `Integrity verified for "${server.name}" and the server was restarted`
            : `Integrity verified for "${server.name}"`,
        );
      } catch (error) {
        const paused =
          this.isPauseRequested() || isOperationPausedError(error);
        if (paused) {
          const phaseAtFailure = job?.phase ?? "";
          const installMayHaveChanged = updateInstallMayHaveChanged({
            phase: phaseAtFailure,
            steamCmdExitCode: job?.context.steamCmdExitCode,
            appliedBuildId: job?.context.appliedBuildId,
          });
          if (
            shouldRestartServerAfterPreSteamCmdAbort({
              wasRunning,
              installMayHaveChanged,
              serverIsActive: this.processes.isActive(serverId),
            })
          ) {
            try {
              await this.instances.startForMaintenance(serverId);
            } catch {
              // The pause error is more relevant.
            }
          }
          throw isOperationPausedError(error) ? error : new OperationPausedError();
        }
        if (wasRunning && !this.processes.isActive(serverId)) {
          try {
            await this.instances.startForMaintenance(serverId);
          } catch {
            // The original error is more relevant.
          }
        }
        throw error;
      }
    });
  }

}
