import { mkdir, rm, access } from "node:fs/promises";
import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import type {
  AppEventDetails,
  SteamCmdCacheKind,
  SteamCmdConsoleSnapshot,
  SteamCmdStatus,
} from "../../../shared/types";
import {
  shouldNotifySteamCmdJobEvent,
  type SteamCmdJobTerminalPayload,
} from "../../../shared/os-notification-events";
import {
  CRITICAL_BACKUP_KINDS,
  type BackupService,
} from "../backups/backup-service";
import type { ServerRepository } from "../../infra/db/server-repository";
import type { InstanceService } from "../instances/instance-service";
import { killChildProcessTreeAsync } from "../../infra/process/kill-win-process-tree";
import { execFileBounded } from "../../infra/process/exec-file-bounded";
import type { ProcessManager } from "../../infra/process/process-manager";
import type { InstanceLockManager } from "../../orchestration/instance-lock-manager";
import type { AppSettingsRepository } from "../../infra/db/app-settings-repository";
import {
  toCriticalJobSummary,
} from "../../orchestration/critical-job-recovery";
import {
  isUpdatePauseBlockedByRollback,
  isUnpausableSteamCmdOperation,
  type UpdateCriticalJob,
} from "./update-critical-jobs";
import {
  STEAMCMD_MISSING_MESSAGE,
  buildSteamCmdCandidatePaths,
  buildSteamCmdInstallPowerShell,
  isSteamCmdSearchIsolated,
  isSteamCmdVerifyExitAcceptable,
  normalizeSteamCmdExecutablePath,
  resolveSteamCmdExecutableCached,
  updateJobNeedsSteamCmdExecutable,
} from "./steamcmd-path";
import {
  isPreUpdateBackupEvidenceComplete,
} from "./update-server-jobs";
import {
  deriveSteamCmdStatusOperation,
  deriveSteamCmdStatusServerId,
  deriveSteamCmdStatusStartedAt,
} from "./steamcmd-operator";
import {
  STEAMCMD_ENGLISH_ARGS,
  steamCmdSpawnEnv,
  OperationCancelledError,
  OperationPausedError,
  OperationPauseUnavailableError,
  resolveAsaContentCacheDir,
  resolveDepotCacheDir,
  resolveSteamCmdCacheDir,
  resolveSteamCmdHome,
} from "./steamcmd-content-cache";
import {
  CriticalJobRecoveryBlockedError,
  UpdatePerformer,
} from "./update-perform";
import {
  SteamCmdRunner,
  type CommandResult,
  type SteamCmdFilesOperation,
} from "./steamcmd-run";
import { SteamCmdProgressRuntime } from "./steamcmd-progress-runtime";
import { UpdateQueueRuntime } from "./update-queue-runtime";

type CriticalJob = UpdateCriticalJob;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Safe per-instance update flow:
 * stop (no pre_stop) -> pre_update backup -> steamcmd update ->
 * start+health iff wasRunning -> rollback on failure.
 */
export class UpdateService extends EventEmitter {
  private cancelRequested = false;
  private pauseRequested = false;
  /** Last path confirmed by async discovery / persist — status polls must not `existsSync`. */
  private lastKnownSteamCmdPath: string | null = null;
  /** True after a launch probe found no steamcmd.exe — do not revive a stale settings path. */
  private steamCmdConfirmedMissing = false;
  private readonly progressRuntime: SteamCmdProgressRuntime;
  private readonly queueRuntime: UpdateQueueRuntime;
  private readonly steamCmdRunner: SteamCmdRunner;
  private readonly updatePerformer: UpdatePerformer;

  constructor(
    private readonly servers: ServerRepository,
    private readonly backups: BackupService,
    private readonly instances: InstanceService,
    private readonly processes: ProcessManager,
    private readonly locks: InstanceLockManager,
    private readonly settings: AppSettingsRepository,
    private readonly updatesLogDir: string,
    private readonly steamcmdDir: string,
  ) {
    super();
    this.progressRuntime = new SteamCmdProgressRuntime({
      emitProgress: () => {
        this.emit("progress", {
          status: this.getSteamCmdStatus(),
          console: this.getSteamCmdConsole(160),
        });
      },
      isCancelRequested: () => this.cancelRequested,
      isPauseRequested: () => this.pauseRequested,
    });
    this.steamCmdRunner = new SteamCmdRunner({
      resolveSteamCmdExecutable: () => this.resolveSteamCmdExecutable(),
      appendSteamCmdConsole: (line, options) => this.appendSteamCmdConsole(line, options),
      assertNotCancelled: () => this.assertNotCancelled(),
      beginFileSync: (serverId, label) => this.beginFileSync(serverId, label),
      endFileSync: () => this.endFileSync(),
      setProgress: (percent, label, line) => this.setProgress(percent, label, line),
      isCancelRequested: () => this.cancelRequested,
      isPauseRequested: () => this.pauseRequested,
      setActiveSyncChild: (child) => {
        this.progressRuntime.setActiveSyncChild(child);
      },
      beginSteamCmdProcess: (child, operation, serverId) => {
        this.beginSteamCmdProcess(child, operation, serverId);
      },
      endSteamCmdProcess: (child) => this.endSteamCmdProcess(child),
      startDiskProgressMonitor: (steamCmdHome, forceInstallDir) => {
        this.startDiskProgressMonitor(steamCmdHome, forceInstallDir);
      },
      stopDiskProgressMonitor: () => this.stopDiskProgressMonitor(),
      captureSteamCmdOutput: (chunk, source) => this.captureSteamCmdOutput(chunk, source),
    });
    this.updatePerformer = new UpdatePerformer({
      servers: this.servers,
      backups: this.backups,
      instances: this.instances,
      processes: this.processes,
      locks: this.locks,
      updatesLogDir: this.updatesLogDir,
      checkpointJob: (job, phase) => this.checkpointJob(job, phase),
      addJobEvent: (job, type, severity, message, details, options) =>
        this.addJobEvent(job, type, severity, message, details, options),
      runSteamUpdate: (installDir, operation, serverId) =>
        this.runSteamUpdate(installDir, operation, serverId),
      appendSteamCmdConsole: (line) => this.appendSteamCmdConsole(line),
      setProgress: (percent, label, line) => this.setProgress(percent, label, line),
      setPausedProgress: () => this.setPausedProgress(),
      isPauseRequested: () => this.pauseRequested,
      isCancelRequested: () => this.cancelRequested,
      waitForHealthy: (serverId, timeoutMs, options) =>
        this.waitForHealthy(serverId, timeoutMs, options),
    });
    this.queueRuntime = new UpdateQueueRuntime({
      settings: this.settings,
      servers: this.servers,
      processes: this.processes,
      ensureSteamCmdReadyForOperator: (job) => this.ensureSteamCmdReadyForOperator(job),
      appendSteamCmdConsole: (line) => this.appendSteamCmdConsole(line),
      clearSteamCmdConsole: () => this.clearSteamCmdConsole(),
      clearPausedProgressSnapshot: () => this.clearPausedProgressSnapshot(),
      setPausedProgress: () => this.setPausedProgress(),
      setProgress: (percent, label, line) => this.setProgress(percent, label, line),
      setQueuedProgress: (label, line) => this.progressRuntime.setQueuedProgress(label, line),
      emitProgress: (force) => this.emitProgress(force),
      performInstallServerFiles: (serverId, job) =>
        this.performInstallServerFiles(serverId, job),
      performUpdateServer: (serverId, job) => this.performUpdateServer(serverId, job),
      performVerifyServerFiles: (serverId, job) =>
        this.performVerifyServerFiles(serverId, job),
      finishRecoveredFileJob: (job) => this.finishRecoveredFileJob(job),
      finishRecoveredRollback: (job) => this.finishRecoveredRollback(job),
      findSteamCmdExecutableCached: () => this.findSteamCmdExecutableCached(),
      steamCmdMissingError: () => this.steamCmdMissingError(),
      getActiveSteamCmd: () => this.progressRuntime.getActiveSteamCmd() !== null,
      getSyncingServerId: () => this.progressRuntime.getSyncingServerId(),
      endFileSync: () => this.endFileSync(),
      isCancelRequested: () => this.cancelRequested,
      setCancelRequested: (requested) => {
        this.cancelRequested = requested;
      },
      isPauseRequested: () => this.pauseRequested,
      setPauseRequested: (requested) => {
        this.pauseRequested = requested;
      },
      scheduleProcess: () => {
        void this.processQueue();
      },
      addJobEvent: (job, type, severity, message) =>
        this.addJobEvent(job, type, severity, message),
    });
    const configured = this.settings.get("steamcmdPath")?.trim();
    if (configured != null && configured.length > 0) {
      this.lastKnownSteamCmdPath = configured;
    }
  }

  private get queue(): readonly CriticalJob[] {
    return this.queueRuntime.getJobs();
  }

  private set queue(jobs: CriticalJob[]) {
    this.queueRuntime.replaceJobs(jobs);
  }

  /**
   * After UI listeners are attached: start pending Downloads if steamcmd.exe
   * is on disk. Missing SteamCMD still blocks those jobs with Retry.
   * A paused job blocks the queue until the operator resumes it manually.
   */
  async resumeQueuedFileJobsOnLaunch(): Promise<void> {
    if (this.queueHeldForOperator()) {
      return;
    }

    const resumable = this.queue.filter(
      (job) => job.status === "pending" || job.status === "retrying",
    );
    if (resumable.length === 0) {
      return;
    }
    this.appendSteamCmdConsole(
      `Checking SteamCMD before resuming ${resumable.length} pending Downloads job(s)…`,
    );
    const exe = await this.findSteamCmdExecutable();
    if (exe === null) {
      this.lastKnownSteamCmdPath = null;
      this.steamCmdConfirmedMissing = true;
      this.appendSteamCmdConsole(
        "SteamCMD is not ready; pending Downloads will wait for Retry.",
      );
      await this.processQueue();
      return;
    }
    this.persistSteamCmdPath(exe);
    this.appendSteamCmdConsole(`Resuming pending Downloads (SteamCMD ready at ${exe}).`);
    // Kick the queue without awaiting the whole SteamCMD run so Auto-start
    // can continue for servers that are not occupying a files job.
    void this.processQueue();
  }

  async installSteamCmd(): Promise<string> {
    this.appendSteamCmdConsole("Starting SteamCMD verification/installation...");
    const existing = await this.findSteamCmdExecutable();
    if (existing !== null) {
      this.appendSteamCmdConsole(`SteamCMD detected at: ${existing}`);
      await this.verifySteamCmdExecutable(existing);
      this.persistSteamCmdPath(existing);
      this.appendSteamCmdConsole("SteamCMD validated successfully.");
      return existing;
    }

    await mkdir(this.steamcmdDir, { recursive: true });
    const exePath = join(this.steamcmdDir, "steamcmd.exe");
    const command = buildSteamCmdInstallPowerShell(this.steamcmdDir);

    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        "powershell.exe",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
        {
          windowsHide: true,
          shell: false,
        },
      );
      this.beginSteamCmdProcess(child, "install-steamcmd", null);

      let stderr = "";
      child.stderr.on("data", (chunk) => {
        const text = String(chunk);
        stderr += text;
        this.captureSteamCmdOutput(text, "install/stderr");
      });
      child.stdout.on("data", (chunk) => {
        this.captureSteamCmdOutput(String(chunk), "install/stdout");
      });

      child.once("error", (error) => {
        this.endSteamCmdProcess(child);
        reject(new Error(`Could not run PowerShell: ${error.message}`));
      });

      child.once("exit", (code) => {
        this.endSteamCmdProcess(child);
        if ((code ?? 1) !== 0) {
          reject(new Error(`SteamCMD installation failed (exit ${code ?? 1}): ${stderr}`));
          return;
        }
        resolve();
      });
    });

    if (!existsSync(exePath)) {
      throw new Error(`SteamCMD was not installed at ${exePath}`);
    }

    await this.verifySteamCmdExecutable(exePath);
    this.persistSteamCmdPath(exePath);
    this.appendSteamCmdConsole(`SteamCMD installed and validated at: ${exePath}`);
    return exePath;
  }

  getSteamCmdStatus(): SteamCmdStatus {
    const executablePath = this.findSteamCmdExecutableCached();
    const active = this.progressRuntime.getActiveSteamCmd();
    const queuedPending = this.queue.filter(
      (job) => job.status === "pending" || job.status === "retrying",
    );
    const runningJob = this.queue.find((job) => job.status === "running");
    const hasQueueWork = this.queue.some(
      (job) =>
        job.status === "pending"
        || job.status === "retrying"
        || job.status === "running"
        || job.status === "paused",
    );
    const steamCmdHome =
      executablePath !== null
        ? resolveSteamCmdHome(executablePath)
        : resolveSteamCmdHome(join(this.steamcmdDir, "steamcmd.exe"));
    const syncingServerId = this.progressRuntime.getSyncingServerId();
    const liveWork = active !== null || syncingServerId !== null || runningJob !== undefined;
    const hasPausedJob = this.queue.some((job) => job.status === "paused");
    const pausedProgress =
      !liveWork && hasPausedJob ? this.progressRuntime.getPausedProgressSnapshot() : null;
    const progress = this.progressRuntime.getProgressSnapshot();
    const busy = liveWork || hasQueueWork;
    const operation = deriveSteamCmdStatusOperation({
      syncingServerId,
      activeOperation: active?.operation ?? null,
      runningJobType: runningJob?.type ?? null,
    });
    const serverId = deriveSteamCmdStatusServerId({
      syncingServerId,
      activeServerId: active?.serverId ?? null,
      runningJobServerId: runningJob?.serverId ?? null,
    });

    return {
      detected: executablePath !== null,
      executablePath,
      depotCacheDir: resolveDepotCacheDir(steamCmdHome),
      contentCacheDir: resolveAsaContentCacheDir(steamCmdHome),
      busy,
      running: active !== null || syncingServerId !== null,
      operation,
      serverId,
      startedAt: deriveSteamCmdStatusStartedAt({
        syncingStartedAt: this.progressRuntime.getSyncingStartedAt(),
        activeStartedAt: active?.startedAt ?? null,
        runningJobUpdatedAt: runningJob?.updatedAt ?? null,
      }),
      pid: active?.child.pid ?? null,
      progressPercent: liveWork ? progress.percent : pausedProgress?.percent ?? null,
      progressLabel: liveWork ? progress.label : pausedProgress?.label ?? null,
      progressBytesDownloaded:
        liveWork ? progress.bytesDownloaded : pausedProgress?.bytesDownloaded ?? null,
      progressBytesTotal:
        liveWork ? progress.bytesTotal : pausedProgress?.bytesTotal ?? null,
      lastLine: this.progressRuntime.getLastProgressLine(),
      queuedCount: queuedPending.length,
      // Keep this.queue order so Downloads Move up/down matches execution order.
      // Backup leftovers append after file jobs (they are not reorderable).
      criticalJobs: [
        ...this.queue.map((job) =>
          toCriticalJobSummary(job, this.servers.get(job.serverId)?.name ?? null)),
        ...(this.backups.getCriticalJobs?.() ?? []).filter(
          (job) => job.operation !== "pre-update-backup",
        ),
      ],
      checkedAt: new Date().toISOString(),
    };
  }

  private addJobEvent(
    job: CriticalJob | undefined,
    type: "update_started" | "update_completed" | "update_failed" | "update_rolled_back",
    severity: "info" | "warning" | "error",
    message: string,
    details?: AppEventDetails | null,
    options?: { osNotify?: boolean },
  ): number {
    const eventId = this.servers.addEvent(
      job?.serverId ?? null,
      type,
      severity,
      message,
      details,
    );
    if (job !== undefined) {
      job.latestEventId = eventId;
    }
    const osNotify = options?.osNotify !== false;
    if (osNotify && shouldNotifySteamCmdJobEvent(type, severity)) {
      const server =
        job?.serverId !== undefined ? this.servers.get(job.serverId) : null;
      const payload: SteamCmdJobTerminalPayload = {
        type,
        severity,
        serverId: job?.serverId ?? null,
        serverName: server?.name ?? null,
        jobId: job?.id ?? null,
        eventId,
        message,
        operatorAwaited: job?.context.operatorAwaited === true,
      };
      this.emit("job-terminal", payload);
    }
    return eventId;
  }

  async retryCriticalJob(jobId: string): Promise<boolean> {
    const result = await this.queueRuntime.retryCriticalJob(jobId);
    return result ?? this.backups.retryCriticalJob(jobId);
  }

  dismissCriticalJob(jobId: string): boolean {
    return this.queueRuntime.dismissCriticalJob(jobId)
      ?? this.backups.dismissCriticalJob(jobId);
  }

  cancelCriticalJob(jobId: string): boolean {
    return this.queueRuntime.cancelCriticalJob(jobId)
      ?? this.backups.cancelCriticalJob(jobId);
  }

  async resumeCriticalJob(jobId: string): Promise<boolean> {
    const result = await this.queueRuntime.resumeCriticalJob(jobId);
    return result ?? this.backups.retryCriticalJob(jobId);
  }

  reorderCriticalJob(jobId: string, direction: "up" | "down"): boolean {
    return this.queueRuntime.reorderCriticalJob(jobId, direction);
  }

  async cancelSteamCmd(): Promise<boolean> {
    const runningJob = this.queue.find((job) => job.status === "running");
    const backupBusy = this.backups.getCriticalJobs().some(
      (job) =>
        job.status === "pending"
        || job.status === "retrying"
        || job.status === "running",
    );
    const hadWork =
      this.progressRuntime.getActiveSteamCmd() !== null
      || this.progressRuntime.getActiveSyncChild() !== null
      || this.progressRuntime.getSyncingServerId() !== null
      || backupBusy
      || runningJob !== undefined;

    if (!hadWork) {
      this.appendSteamCmdConsole("Cancel: no active operation");
      this.emitProgress(true);
      return false;
    }

    this.cancelRequested = true;
    this.backups.requestCancel();
    this.stopDiskProgressMonitor();
    this.appendSteamCmdConsole(
      `Cancelling operation (steamcmd=${this.progressRuntime.getActiveSteamCmd()?.child.pid ?? "n/a"}, sync=${this.progressRuntime.getActiveSyncChild()?.pid ?? "n/a"}, jobs=${this.queue.length})`,
    );
    this.setProgress(null, "Cancelling…", "Cancellation requested by the user");

    const steamCmdChild = this.progressRuntime.takeActiveSteamCmdChild();
    if (steamCmdChild !== null) {
      const child = steamCmdChild;
      await this.killProcessTree(child);
    }
    const syncChild = this.progressRuntime.takeActiveSyncChild();
    if (syncChild !== null) {
      const child = syncChild;
      await this.killProcessTree(child);
    }

    if (runningJob !== undefined) {
      // Keep the active job recoverable until unwind reaches a durable checkpoint.
      // Queued pending/retrying jobs stay in Downloads and start after this one ends.
      runningJob.recoveryReason = "Cancellation requested; completing the safe unwind.";
      runningJob.updatedAt = new Date().toISOString();
    }
    this.queueRuntime.persist();

    this.progressRuntime.clearSyncing();
    this.setProgress(null, "Cancelled", "Operation cancelled by the user");
    this.emitProgress(true);
    return true;
  }

  async pauseSteamCmd(): Promise<boolean> {
    const runningJob = this.queue.find((job) => job.status === "running");
    const backupBusy = this.backups.getCriticalJobs().some(
      (job) => job.status === "running",
    );
    const hadWork =
      this.progressRuntime.getActiveSteamCmd() !== null
      || this.progressRuntime.getActiveSyncChild() !== null
      || this.progressRuntime.getSyncingServerId() !== null
      || backupBusy
      || runningJob !== undefined;

    if (!hadWork) {
      this.appendSteamCmdConsole("Pause: no active operation");
      this.emitProgress(true);
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
      this.progressRuntime.getSyncingServerId() !== null
        ? "sync-files"
        : (this.progressRuntime.getActiveSteamCmd()?.operation ?? runningJob?.type ?? null);
    if (isUnpausableSteamCmdOperation(liveOperation)) {
      throw new OperationPauseUnavailableError(
        "This operation cannot pause (SteamCMD validate has no resume checkpoint). Use Cancel instead.",
      );
    }

    this.pauseRequested = true;
    this.backups.requestCancel();
    this.stopDiskProgressMonitor();
    this.appendSteamCmdConsole(
      `Pausing operation (steamcmd=${this.progressRuntime.getActiveSteamCmd()?.child.pid ?? "n/a"}, sync=${this.progressRuntime.getActiveSyncChild()?.pid ?? "n/a"})`,
    );
    this.setProgress(null, "Pausing…", "Pause requested by the user");

    const steamCmdChild = this.progressRuntime.takeActiveSteamCmdChild();
    if (steamCmdChild !== null) {
      const child = steamCmdChild;
      await this.killProcessTree(child);
    }
    const syncChild = this.progressRuntime.takeActiveSyncChild();
    if (syncChild !== null) {
      const child = syncChild;
      await this.killProcessTree(child);
    }

    if (runningJob !== undefined) {
      runningJob.recoveryReason = "Pause requested; stopping SteamCMD.";
      runningJob.updatedAt = new Date().toISOString();
    }
    this.queueRuntime.persist();

    this.progressRuntime.clearSyncing();
    this.setPausedProgress();
    this.emitProgress(true);
    return true;
  }

  async setSteamCmdExecutablePath(exePath: string): Promise<string> {
    const normalized = normalizeSteamCmdExecutablePath(exePath);
    if (!existsSync(normalized)) {
      throw new Error(`steamcmd.exe not found at: ${normalized}`);
    }
    await this.verifySteamCmdExecutable(normalized);
    this.persistSteamCmdPath(normalized);
    this.steamCmdRunner.resetContentCache();
    this.appendSteamCmdConsole(`Manual SteamCMD path configured: ${normalized}`);
    return normalized;
  }

  getSteamCmdConsole(limit = 200): SteamCmdConsoleSnapshot {
    return this.progressRuntime.getConsole(limit);
  }

  /** Resolves depot or ASA content cache next to the configured SteamCMD home. */
  resolveSteamCmdCachePath(kind: SteamCmdCacheKind): string {
    const executablePath = this.findSteamCmdExecutableCached();
    if (executablePath === null) {
      throw new Error("SteamCMD is not configured");
    }
    return resolveSteamCmdCacheDir(resolveSteamCmdHome(executablePath), kind);
  }

  /**
   * Deletes and recreates a SteamCMD cache folder.
   * Blocked while a SteamCMD/sync job is active.
   */
  async clearSteamCmdCache(kind: SteamCmdCacheKind): Promise<string> {
    if (
      this.progressRuntime.getActiveSteamCmd() !== null
      || this.progressRuntime.getActiveSyncChild() !== null
      || this.queue.some(
        (job) =>
          job.status === "running"
          || job.status === "pending"
          || job.status === "retrying",
      )
    ) {
      throw new Error("Stop the current SteamCMD operation before clearing a cache");
    }

    const target = this.resolveSteamCmdCachePath(kind);
    await rm(target, { recursive: true, force: true });
    await mkdir(target, { recursive: true });
    if (kind === "content") {
      this.steamCmdRunner.resetContentCache();
    }
    const label = kind === "depot" ? "Depotcache" : "ASA content cache";
    this.appendSteamCmdConsole(`${label} cleared: ${target}`);
    return target;
  }

  async installServerFiles(serverId: string): Promise<void> {
    this.assertStopBackupIdle(serverId);
    await this.enqueueAndWait("install-files", serverId);
  }

  async updateServer(serverId: string): Promise<void> {
    this.assertStopBackupIdle(serverId);
    if (this.processes.isActive(serverId)) {
      throw new Error("Stop the server before updating files");
    }
    await this.enqueueAndWait("update", serverId);
  }

  /**
   * Queue-only variant used by bulk actions:
   * enqueue the SteamCMD "update" job and return immediately.
   *
   * Files jobs processing is handled asynchronously by the Downloads queue.
   */
  async enqueueUpdate(serverId: string): Promise<void> {
    this.assertStopBackupIdle(serverId);
    if (this.processes.isActive(serverId)) {
      throw new Error("Stop the server before updating files");
    }
    await this.enqueueAndStart("update", serverId);
  }

  /** Forces app_update validate (ignores “fresh” cache) and syncs to the server. */
  async verifyServerFiles(serverId: string): Promise<void> {
    this.assertStopBackupIdle(serverId);
    // Same stop/restart contract as update — do not require a prior manual stop.
    await this.enqueueAndWait("verify-files", serverId);
  }

  private assertStopBackupIdle(serverId: string): void {
    if (this.instances.isStopInProgress(serverId)) {
      throw new Error("Server stop and backup are still in progress");
    }
  }

  private performInstallServerFiles(serverId: string, job?: CriticalJob): Promise<void> {
    return this.updatePerformer.performInstallServerFiles(serverId, job);
  }

  private performUpdateServer(serverId: string, job?: CriticalJob): Promise<void> {
    return this.updatePerformer.performUpdateServer(serverId, job);
  }

  private performVerifyServerFiles(serverId: string, job?: CriticalJob): Promise<void> {
    return this.updatePerformer.performVerifyServerFiles(serverId, job);
  }

  private async enqueueAndWait(
    type: "install-files" | "update" | "verify-files",
    serverId: string,
  ): Promise<void> {
    await this.queueRuntime.enqueueAndWait(type, serverId);
  }

  private async enqueueAndStart(
    type: "install-files" | "update" | "verify-files",
    serverId: string,
  ): Promise<void> {
    await this.queueRuntime.enqueueAndStart(type, serverId);
  }

  private async processQueue(): Promise<void> {
    await this.queueRuntime.processQueue();
  }

  private runSteamUpdate(
    installDir: string,
    operation: SteamCmdFilesOperation,
    serverId: string,
  ): Promise<CommandResult> {
    return this.steamCmdRunner.runSteamUpdate(installDir, operation, serverId);
  }

  private startDiskProgressMonitor(steamCmdHome: string, forceInstallDir: string): void {
    this.progressRuntime.startDiskProgressMonitor(steamCmdHome, forceInstallDir);
  }

  private stopDiskProgressMonitor(): void {
    this.progressRuntime.stopDiskProgressMonitor();
  }

  private assertNotCancelled(): void {
    if (this.pauseRequested) {
      throw new OperationPausedError();
    }
    if (this.cancelRequested) {
      throw new OperationCancelledError();
    }
  }

  private async resolveSteamCmdExecutable(): Promise<string> {
    const discovered = await this.findSteamCmdExecutable();
    if (discovered !== null) {
      this.persistSteamCmdPath(discovered);
      return discovered;
    }

    return "steamcmd.exe";
  }

  private steamCmdMissingError(): Error {
    return new Error(STEAMCMD_MISSING_MESSAGE);
  }

  /**
   * Operator Retry/Resume/new queue: probe disk when a launch check already
   * marked SteamCMD missing, so a later install does not stay stuck.
   * Status polls keep using the cached path (no disk I/O, #145).
   */
  private async ensureSteamCmdReadyForOperator(job?: CriticalJob): Promise<void> {
    if (job !== undefined && !updateJobNeedsSteamCmdExecutable(job)) {
      return;
    }
    if (this.steamCmdConfirmedMissing) {
      const exe = await this.findSteamCmdExecutable();
      if (exe !== null) {
        this.persistSteamCmdPath(exe);
        return;
      }
      throw this.steamCmdMissingError();
    }
    if (this.findSteamCmdExecutableCached() === null) {
      throw this.steamCmdMissingError();
    }
  }

  /**
   * Status/cache path for polls — memory + settings/env only.
   * Never probes disk (no `existsSync`) so UNC/AV stalls cannot block main (#145).
   */
  private findSteamCmdExecutableCached(): string | null {
    const configured = this.settings.get("steamcmdPath");
    const resolved = resolveSteamCmdExecutableCached({
      confirmedMissing: this.steamCmdConfirmedMissing,
      lastKnownPath: this.lastKnownSteamCmdPath,
      configured,
      envPath: process.env["STEAMCMD_PATH"],
    });
    if (
      resolved !== null
      && configured != null
      && configured.trim() === resolved
      && (
        this.lastKnownSteamCmdPath == null
        || this.lastKnownSteamCmdPath.trim().length === 0
      )
    ) {
      this.lastKnownSteamCmdPath = resolved;
    }
    return resolved;
  }

  private steamCmdCandidatePaths(): string[] {
    return buildSteamCmdCandidatePaths({
      configured: this.settings.get("steamcmdPath"),
      envPath: process.env["STEAMCMD_PATH"],
      steamcmdDir: this.steamcmdDir,
      isolated: isSteamCmdSearchIsolated(process.env["YARK_E2E_USER_DATA"]),
      programFilesX86: process.env["ProgramFiles(x86)"],
      programFiles: process.env["ProgramFiles"],
      localAppData: process.env["LOCALAPPDATA"],
    });
  }

  private async findSteamCmdExecutable(): Promise<string | null> {
    for (const candidate of this.steamCmdCandidatePaths()) {
      try {
        await access(candidate);
        this.lastKnownSteamCmdPath = candidate;
        return candidate;
      } catch {
        // try next candidate
      }
    }

    if (isSteamCmdSearchIsolated(process.env["YARK_E2E_USER_DATA"])) {
      return null;
    }

    try {
      const { stdout } = await execFileBounded(
        "where.exe",
        ["steamcmd.exe"],
        {
          timeoutMs: 2_000,
          maxBuffer: 64 * 1024,
          windowsHide: true,
        },
      );
      const lines = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      for (const line of lines) {
        try {
          await access(line);
          this.lastKnownSteamCmdPath = line;
          return line;
        } catch {
          // try next PATH hit
        }
      }
    } catch {
      // Best effort: if where.exe does not find steamcmd, continue without a detected path.
    }

    return null;
  }

  private persistSteamCmdPath(exePath: string): void {
    this.steamCmdConfirmedMissing = false;
    this.lastKnownSteamCmdPath = exePath;
    this.settings.set("steamcmdPath", exePath);
    process.env["STEAMCMD_PATH"] = exePath;
    process.env["ARK_STEAMCMD_DIR"] = dirname(exePath);
  }

  private async verifySteamCmdExecutable(exePath: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.appendSteamCmdConsole(`Validating SteamCMD: ${exePath}`);
      const child = spawn(exePath, [...STEAMCMD_ENGLISH_ARGS, "+quit"], {
        cwd: resolveSteamCmdHome(exePath),
        windowsHide: true,
        shell: false,
        env: steamCmdSpawnEnv(),
      });

      let finished = false;
      let sawOutput = false;
      let stderr = "";
      const timer = setTimeout(() => {
        if (finished) {
          return;
        }
        finished = true;
        child.kill();
        resolve();
      }, 20_000);

      child.stdout.on("data", (chunk) => {
        sawOutput = true;
        this.captureSteamCmdOutput(String(chunk), "verify/stdout");
      });
      child.stderr.on("data", (chunk) => {
        sawOutput = true;
        const text = String(chunk);
        stderr += text;
        this.captureSteamCmdOutput(text, "verify/stderr");
      });

      child.once("error", (error) => {
        if (finished) {
          return;
        }
        finished = true;
        clearTimeout(timer);
        reject(new Error(`SteamCMD exists but cannot be executed: ${error.message}`));
      });

      child.once("exit", (code) => {
        if (finished) {
          return;
        }
        finished = true;
        clearTimeout(timer);
        if (isSteamCmdVerifyExitAcceptable(code, sawOutput)) {
          resolve();
          return;
        }

        reject(
          new Error(
            `SteamCMD did not respond correctly (exit ${code ?? 1})${
              stderr.length > 0 ? `: ${stderr}` : ""
            }`,
          ),
        );
      });
    });
  }

  private async waitForHealthy(
    serverId: string,
    timeoutMs: number,
    options?: { ignoreCancellation?: boolean },
  ): Promise<boolean> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (options?.ignoreCancellation !== true) this.assertNotCancelled();
      const status = this.processes.getStatus(serverId).status;
      if (status === "running") return true;
      if (status === "error" || status === "stopped") return false;
      await delay(1000);
    }
    if (options?.ignoreCancellation !== true) this.assertNotCancelled();
    return false;
  }

  private clearSteamCmdConsole(): void {
    this.progressRuntime.clearConsole();
  }

  private appendSteamCmdConsole(line: string, options?: { forceProgressPush?: boolean }): void {
    this.progressRuntime.appendConsole(line, options);
  }

  /**
   * SteamCMD writes progress with \\r (same line) almost without \\n.
   * Must split on CR/LF or the UI sees no progress until much later.
   */
  private captureSteamCmdOutput(chunk: string, source: string): void {
    this.progressRuntime.captureOutput(chunk, source);
  }

  private clearPausedProgressSnapshot(): void {
    this.progressRuntime.clearPausedProgressSnapshot();
  }

  private setPausedProgress(): void {
    this.progressRuntime.setPausedProgress();
  }

  private setProgress(percent: number | null, label: string | null, line?: string): void {
    this.progressRuntime.setProgress(percent, label, line);
  }

  private beginFileSync(serverId: string, label: string): void {
    this.progressRuntime.beginFileSync(serverId, label);
  }

  private endFileSync(): void {
    this.progressRuntime.endFileSync();
  }

  private emitProgress(force: boolean): void {
    this.progressRuntime.emitProgress(force);
  }

  private beginSteamCmdProcess(
    child: ChildProcess,
    operation: "install-steamcmd" | "install-files" | "update" | "verify-files",
    serverId: string | null,
  ): void {
    this.progressRuntime.beginSteamCmdProcess(child, operation, serverId);
  }

  private endSteamCmdProcess(child: ChildProcess): void {
    this.progressRuntime.endSteamCmdProcess(child);
  }

  private async killProcessTree(child: ChildProcess): Promise<void> {
    await killChildProcessTreeAsync(child);
  }

  private checkpointJob(job: CriticalJob | undefined, phase: string): void {
    this.queueRuntime.checkpoint(job, phase);
  }

  private queueHeldForOperator(): boolean {
    return this.queueRuntime.isHeldForOperator();
  }

  private async finishRecoveredFileJob(job: CriticalJob): Promise<void> {
    await this.locks.withLock(
      job.serverId,
      `${job.type}-recovery`,
      () => this.finishRecoveredFileJobLocked(job),
    );
  }

  private async finishRecoveredFileJobLocked(job: CriticalJob): Promise<void> {
    const server = this.servers.get(job.serverId);
    if (server === null) throw new Error("Server does not exist");

    if (job.context.wasRunning === true && !this.processes.isActive(job.serverId)) {
      this.checkpointJob(job, "restarting-server");
      await this.instances.startForMaintenance(job.serverId);
      const healthy = await this.waitForHealthy(job.serverId, 90_000);
      if (!healthy) {
        throw new Error("Server did not reach running state while completing recovered work");
      }
    }

    this.addJobEvent(
      job,
      "update_completed",
      "info",
      `Recovered ${job.type} reconciled after the persisted files-applied checkpoint`,
    );
  }

  private async finishRecoveredRollback(job: CriticalJob): Promise<void> {
    await this.locks.withLock(
      job.serverId,
      "update-rollback-recovery",
      () => this.finishRecoveredRollbackLocked(job),
    );
  }

  private async finishRecoveredRollbackLocked(job: CriticalJob): Promise<void> {
    const server = this.servers.get(job.serverId);
    if (server === null) throw new Error("Server does not exist");
    const backupIds = job.context.preUpdateBackupIds ?? [];
    const backups = this.backups.getCompletedBackupsForCriticalJob(
      job.serverId,
      backupIds,
    );
    // Legacy jobs may persist a `players` id; evidence is complete when world+ini exist.
    if (
      !isPreUpdateBackupEvidenceComplete(
        backupIds,
        backups.length,
        CRITICAL_BACKUP_KINDS.length,
      )
    ) {
      throw new CriticalJobRecoveryBlockedError(
        "Rollback backup evidence is incomplete; operator review is required",
      );
    }

    const resumeFromRestart = job.phase === "rollback-restarting-server";
    if (!resumeFromRestart) {
      if (this.processes.isActive(job.serverId)) {
        this.checkpointJob(job, "rollback-stopping-server");
        await this.instances.stop(job.serverId, { backup: false });
      }
      const restored = new Set(job.context.rollbackRestoredBackupIds ?? []);
      for (const backup of backups) {
        if (restored.has(backup.id)) continue;
        this.checkpointJob(job, "rollback-restoring-backups");
        await this.backups.restoreBackupForRollbackRecovery(job.serverId, backup.id);
        restored.add(backup.id);
        job.context.rollbackRestoredBackupIds = [...restored];
        this.checkpointJob(job, "rollback-restoring-backups");
      }
    }

    if (job.context.wasRunning === true && !this.processes.isActive(job.serverId)) {
      this.checkpointJob(job, "rollback-restarting-server");
      await this.instances.startForMaintenance(job.serverId);
      const healthy = await this.waitForHealthy(
        job.serverId,
        90_000,
        { ignoreCancellation: true },
      );
      if (!healthy) {
        throw new Error("Rollback completed but the server did not return to running");
      }
    }

    this.checkpointJob(job, "rollback-complete");
    throw new Error(
      `Recovered rollback completed for "${server.name}"; review the original update failure before retrying`,
    );
  }

}
