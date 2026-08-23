import type { ChildProcess } from "node:child_process";
import type { BackupService } from "../backups/backup-service";
import { killChildProcessTreeAsync } from "../../infra/process/kill-win-process-tree";
import {
  isUpdatePauseBlockedByRollback,
  isUnpausableSteamCmdOperation,
  type UpdateCriticalJob,
} from "./update-critical-jobs";
import { OperationPauseUnavailableError } from "./steamcmd-content-cache";
import type { SteamCmdProgressRuntime } from "./steamcmd-progress-runtime";
import type { UpdateQueueRuntime } from "./update-queue-runtime";

export interface SteamCmdControlHost {
  readonly backups: BackupService;
  readonly progressRuntime: SteamCmdProgressRuntime;
  readonly queueRuntime: UpdateQueueRuntime;
  getQueue(): readonly UpdateCriticalJob[];
  setCancelRequested(value: boolean): void;
  setPauseRequested(value: boolean): void;
  appendSteamCmdConsole(
    line: string,
    options?: { forceProgressPush?: boolean },
  ): void;
  stopDiskProgressMonitor(): void;
  setProgress(percent: number | null, label: string | null, line?: string): void;
  setPausedProgress(): void;
  emitProgress(force: boolean): void;
}

export async function cancelSteamCmd(host: SteamCmdControlHost): Promise<boolean> {
  const runningJob = host.getQueue().find((job) => job.status === "running");
  const backupBusy = host.backups.getCriticalJobs().some(
    (job) =>
      job.status === "pending"
      || job.status === "retrying"
      || job.status === "running",
  );
  const hadWork =
    host.progressRuntime.getActiveSteamCmd() !== null
    || host.progressRuntime.getActiveSyncChild() !== null
    || host.progressRuntime.getSyncingServerId() !== null
    || backupBusy
    || runningJob !== undefined;

  if (!hadWork) {
    host.appendSteamCmdConsole("Cancel: no active operation");
    host.emitProgress(true);
    return false;
  }

  host.setCancelRequested(true);
  host.backups.requestCancel();
  host.stopDiskProgressMonitor();
  host.appendSteamCmdConsole(
    `Cancelling operation (steamcmd=${host.progressRuntime.getActiveSteamCmd()?.child.pid ?? "n/a"}, sync=${host.progressRuntime.getActiveSyncChild()?.pid ?? "n/a"}, jobs=${host.getQueue().length})`,
  );
  host.setProgress(null, "Cancelling…", "Cancellation requested by the user");

  const steamCmdChild = host.progressRuntime.takeActiveSteamCmdChild();
  if (steamCmdChild !== null) {
    const child = steamCmdChild;
    await killProcessTree(child);
  }
  const syncChild = host.progressRuntime.takeActiveSyncChild();
  if (syncChild !== null) {
    const child = syncChild;
    await killProcessTree(child);
  }

  if (runningJob !== undefined) {
    // Keep the active job recoverable until unwind reaches a durable checkpoint.
    // Queued pending/retrying jobs stay in Downloads and start after this one ends.
    runningJob.recoveryReason = "Cancellation requested; completing the safe unwind.";
    runningJob.updatedAt = new Date().toISOString();
  }
  host.queueRuntime.persist();

  host.progressRuntime.clearSyncing();
  host.setProgress(null, "Cancelled", "Operation cancelled by the user");
  host.emitProgress(true);
  return true;
}

export async function pauseSteamCmd(host: SteamCmdControlHost): Promise<boolean> {
  const runningJob = host.getQueue().find((job) => job.status === "running");
  const backupBusy = host.backups.getCriticalJobs().some(
    (job) => job.status === "running",
  );
  const hadWork =
    host.progressRuntime.getActiveSteamCmd() !== null
    || host.progressRuntime.getActiveSyncChild() !== null
    || host.progressRuntime.getSyncingServerId() !== null
    || backupBusy
    || runningJob !== undefined;

  if (!hadWork) {
    host.appendSteamCmdConsole("Pause: no active operation");
    host.emitProgress(true);
    return false;
  }

  if (
    runningJob !== undefined
    && isUpdatePauseBlockedByRollback(runningJob.phase)
  ) {
    throw new OperationPauseUnavailableError(
      "Pause is not available during rollback. Wait for it to finish, or Cancel if you need to stop.",
    );
  }

  const liveOperation =
    host.progressRuntime.getSyncingServerId() !== null
      ? "sync-files"
      : (host.progressRuntime.getActiveSteamCmd()?.operation ?? runningJob?.type ?? null);
  if (isUnpausableSteamCmdOperation(liveOperation)) {
    throw new OperationPauseUnavailableError(
      "This operation cannot pause (SteamCMD validate has no resume checkpoint). Use Cancel instead.",
    );
  }

  host.setPauseRequested(true);
  host.backups.requestCancel();
  host.stopDiskProgressMonitor();
  host.appendSteamCmdConsole(
    `Pausing operation (steamcmd=${host.progressRuntime.getActiveSteamCmd()?.child.pid ?? "n/a"}, sync=${host.progressRuntime.getActiveSyncChild()?.pid ?? "n/a"})`,
  );
  host.setProgress(null, "Pausing…", "Pause requested by the user");

  const steamCmdChild = host.progressRuntime.takeActiveSteamCmdChild();
  if (steamCmdChild !== null) {
    const child = steamCmdChild;
    await killProcessTree(child);
  }
  const syncChild = host.progressRuntime.takeActiveSyncChild();
  if (syncChild !== null) {
    const child = syncChild;
    await killProcessTree(child);
  }

  if (runningJob !== undefined) {
    runningJob.recoveryReason = "Pause requested; stopping SteamCMD.";
    runningJob.updatedAt = new Date().toISOString();
  }
  host.queueRuntime.persist();

  host.progressRuntime.clearSyncing();
  host.setPausedProgress();
  host.emitProgress(true);
  return true;
}

async function killProcessTree(child: ChildProcess): Promise<void> {
  await killChildProcessTreeAsync(child);
}
