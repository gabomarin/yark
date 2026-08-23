import { mkdir, rm, access } from "node:fs/promises";
import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { dirname, join } from "node:path";
import { existsSync, statSync } from "node:fs";
import { randomUUID } from "node:crypto";
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
import { parseSteamCmdProgressLine } from "../../../shared/steamcmd-progress";
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
  makeIdempotencyKey,
  migrateCriticalJob,
  toCriticalJobSummary,
} from "../../orchestration/critical-job-recovery";
import {
  canCancelUpdateCriticalJob,
  isUpdateJobInterruptedAmbiguous,
  isUpdatePauseBlockedByRollback,
  isUpdateQueueHeldForOperator,
  isUnpausableSteamCmdOperation,
  mergeUpdateCriticalJobs,
  planCancelUpdateCriticalJob,
  reorderPendingUpdateJobs,
  resumePhaseForUpdateRetry,
  sanitizeUpdateJobContext,
  shouldOmitInterruptedUpdateJobOnLoad,
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
  STEAMCMD_CONSOLE_MAX_LINES,
  STEAMCMD_PROGRESS_CONSOLE_LOG_MIN_DELTA,
  STEAMCMD_PROGRESS_CONSOLE_LOG_MIN_MS,
  appendSteamCmdConsoleRing,
  clampSteamCmdConsoleLimit,
  formatTimestampedSteamCmdLine,
  shouldLogProgressTickToConsole,
  splitSteamCmdOutputChunk,
  steamCmdProgressPercentChanged,
  stripSteamCmdBareLine,
  stripSteamCmdProgressIngestPrefix,
} from "./steamcmd-console";
import {
  isPreUpdateBackupEvidenceComplete,
  planDuplicateRecoveredUpdateJob,
  planInterruptedUpdateJobRecovery,
  queuedFilesJobProgressLabel,
} from "./update-server-jobs";
import {
  deriveSteamCmdStatusOperation,
  deriveSteamCmdStatusServerId,
  deriveSteamCmdStatusStartedAt,
  formatDiskProgressLogPathLine,
  planSteamCmdProcessProgressStart,
  shouldPreferOfficialProgressOverDiskEstimate,
} from "./steamcmd-operator";
import {
  findNextRunnableQueueJob,
  isValidPersistedUpdateQueueEntry,
  planQueueJobCancelDisposition,
  planQueueJobFailureDisposition,
  planQueueJobPauseDisposition,
  planSteamCmdMissingQueueBlock,
  resolveUpdateQueueJobHandler,
  shouldClearQueueIdleProgress,
  shouldStopQueueProcessing,
} from "./update-queue";
import {
  STEAMCMD_ENGLISH_ARGS,
  steamCmdSpawnEnv,
  isOperationCancelledError,
  isOperationPausedError,
  OperationCancelledError,
  OperationPausedError,
  OperationPauseUnavailableError,
  resolveAsaContentCacheDir,
  resolveDepotCacheDir,
  resolveSteamCmdCacheDir,
  resolveSteamCmdHome,
} from "./steamcmd-content-cache";
import {
  estimateProgressFromDisk,
  measureInstallDownloadingBytes,
  readConsoleLogSince,
  readInstallAppManifestProgress,
  steamCmdConsoleLogPath,
} from "./steamcmd-disk-progress";
import { formatSteamCmdByteProgress } from "../../../shared/steamcmd-progress";
import { ASA_APP_ID } from "./steamcmd-content-cache";
import {
  FILES_JOB_WEIGHT,
  FilesJobSupersededError,
  decideFilesJobEnqueue,
  filesJobEnqueueCopy,
  isFilesJobOperation,
  isOccupyingFilesJobStatus,
  occupyingFilesJobForServer,
} from "../../../shared/files-job-priority";
import {
  CriticalJobRecoveryBlockedError,
  UpdatePerformer,
} from "./update-perform";
import {
  SteamCmdRunner,
  type CommandResult,
  type SteamCmdFilesOperation,
} from "./steamcmd-run";

const CRITICAL_JOBS_KEY = "criticalJobsQueue.v1";
const JOB_RETRY_DELAY_MS = 5000;
/** UI push: frequent enough for live % without saturating Electron. */
const PROGRESS_PUSH_MIN_MS = 100;

interface ActiveSteamCmdOperation {
  child: ChildProcess;
  operation: "install-steamcmd" | "install-files" | "update" | "verify-files";
  serverId: string | null;
  startedAt: string;
}

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
  private steamCmdConsoleLines: string[] = [];
  private steamCmdConsoleUpdatedAt = new Date(0).toISOString();
  private activeSteamCmd: ActiveSteamCmdOperation | null = null;
  private queue: CriticalJob[] = [];
  private processingQueue = false;
  private readonly waiters = new Map<string, { resolve: () => void; reject: (error: Error) => void }>();
  private progressPercent: number | null = null;
  private progressLabel: string | null = null;
  private progressBytesDownloaded: number | null = null;
  private progressBytesTotal: number | null = null;
  /** Last live SteamCMD progress before pause — shown in status polls while the job is paused. */
  private pausedProgressSnapshot: {
    percent: number | null;
    label: string | null;
    bytesDownloaded: number | null;
    bytesTotal: number | null;
  } | null = null;
  private lastProgressLine: string | null = null;
  private syncingServerId: string | null = null;
  private syncingStartedAt: string | null = null;
  private activeSyncChild: ChildProcess | null = null;
  private cancelRequested = false;
  private pauseRequested = false;
  private lastProgressPushAtMs = 0;
  private lastProgressConsoleLogAtMs = 0;
  private lastProgressConsoleLoggedPercent: number | null = null;
  private steamCmdOutputBuffers = new Map<string, string>();
  /** Last time SteamCMD stdout provided a real % (not estimated). */
  private lastOfficialProgressAtMs = 0;
  private diskProgressTimer: ReturnType<typeof setInterval> | null = null;
  private diskProgressInFlight = false;
  private diskProgressForceInstallDir: string | null = null;
  private diskProgressSteamCmdHome: string | null = null;
  private diskProgressBaselineBytes = 0;
  private consoleLogOffset = 0;
  private lastDiskEstimateConsoleAtMs = 0;
  /** Last path confirmed by async discovery / persist — status polls must not `existsSync`. */
  private lastKnownSteamCmdPath: string | null = null;
  /** True after a launch probe found no steamcmd.exe — do not revive a stale settings path. */
  private steamCmdConfirmedMissing = false;
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
        this.activeSyncChild = child;
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
    const configured = this.settings.get("steamcmdPath")?.trim();
    if (configured != null && configured.length > 0) {
      this.lastKnownSteamCmdPath = configured;
    }
    this.queue = this.loadQueue();
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
    const active = this.activeSteamCmd;
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
    const liveWork =
      active !== null || this.syncingServerId !== null || runningJob !== undefined;
    const hasPausedJob = this.queue.some((job) => job.status === "paused");
    const pausedProgress =
      !liveWork && hasPausedJob ? this.pausedProgressSnapshot : null;
    const busy = liveWork || hasQueueWork;
    const operation = deriveSteamCmdStatusOperation({
      syncingServerId: this.syncingServerId,
      activeOperation: active?.operation ?? null,
      runningJobType: runningJob?.type ?? null,
    });
    const serverId = deriveSteamCmdStatusServerId({
      syncingServerId: this.syncingServerId,
      activeServerId: active?.serverId ?? null,
      runningJobServerId: runningJob?.serverId ?? null,
    });

    return {
      detected: executablePath !== null,
      executablePath,
      depotCacheDir: resolveDepotCacheDir(steamCmdHome),
      contentCacheDir: resolveAsaContentCacheDir(steamCmdHome),
      busy,
      running: active !== null || this.syncingServerId !== null,
      operation,
      serverId,
      startedAt: deriveSteamCmdStatusStartedAt({
        syncingStartedAt: this.syncingStartedAt,
        activeStartedAt: active?.startedAt ?? null,
        runningJobUpdatedAt: runningJob?.updatedAt ?? null,
      }),
      pid: active?.child.pid ?? null,
      progressPercent: liveWork ? this.progressPercent : pausedProgress?.percent ?? null,
      progressLabel: liveWork ? this.progressLabel : pausedProgress?.label ?? null,
      progressBytesDownloaded:
        liveWork ? this.progressBytesDownloaded : pausedProgress?.bytesDownloaded ?? null,
      progressBytesTotal:
        liveWork ? this.progressBytesTotal : pausedProgress?.bytesTotal ?? null,
      lastLine: this.lastProgressLine,
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
    const job = this.queue.find((candidate) => candidate.id === jobId);
    if (job === undefined) return this.backups.retryCriticalJob(jobId);
    const cancelled = job.status === "cancelled";
    const retryableFailure =
      (job.status === "blocked" || job.status === "failed") && job.operatorRetryAllowed;
    if (!cancelled && !retryableFailure) return false;
    await this.ensureSteamCmdReadyForOperator(job);
    if (job.context.restartInterrupted === true) {
      job.context.restartInterrupted = false;
    }
    job.status = "pending";
    job.phase = resumePhaseForUpdateRetry(job);
    job.maxAttempts = Math.max(job.maxAttempts, job.attempts + 3);
    job.recoveryReason = cancelled
      ? "Retry requested by the operator."
      : "Retry requested by the operator after reviewing recovery state.";
    job.updatedAt = new Date().toISOString();
    if (cancelled) {
      this.queue = [job, ...this.queue.filter((candidate) => candidate.id !== job.id)];
    }
    this.persistQueue();
    this.emitProgress(true);
    void this.processQueue();
    return true;
  }

  dismissCriticalJob(jobId: string): boolean {
    const job = this.queue.find((candidate) => candidate.id === jobId);
    if (job === undefined) return this.backups.dismissCriticalJob(jobId);
    if (job.status !== "blocked" && job.status !== "failed" && job.status !== "cancelled") {
      return false;
    }
    this.removeJob(jobId);
    this.persistQueue();
    this.emitProgress(true);
    void this.processQueue();
    return true;
  }

  cancelCriticalJob(jobId: string): boolean {
    const job = this.queue.find((candidate) => candidate.id === jobId);
    if (job === undefined) return this.backups.cancelCriticalJob(jobId);
    if (!canCancelUpdateCriticalJob(job.status)) {
      return false;
    }
    const plan = planCancelUpdateCriticalJob(job.status === "paused");
    job.status = plan.status;
    job.phase = plan.phase;
    job.recoveryReason = plan.recoveryReason;
    job.updatedAt = plan.updatedAt;
    this.rejectJob(job.id, new OperationCancelledError());
    this.persistQueue();
    this.emitProgress(true);
    void this.processQueue();
    return true;
  }

  async resumeCriticalJob(jobId: string): Promise<boolean> {
    const job = this.queue.find((candidate) => candidate.id === jobId);
    if (job === undefined) return this.backups.retryCriticalJob(jobId);
    if (job.status !== "paused") return false;
    await this.ensureSteamCmdReadyForOperator(job);
    this.clearSteamCmdConsole();
    this.clearPausedProgressSnapshot();
    job.status = "pending";
    job.phase = resumePhaseForUpdateRetry(job);
    job.recoveryReason = null;
    job.updatedAt = new Date().toISOString();
    this.queue = [job, ...this.queue.filter((candidate) => candidate.id !== job.id)];
    this.persistQueue();
    this.emitProgress(true);
    void this.processQueue();
    return true;
  }

  reorderCriticalJob(jobId: string, direction: "up" | "down"): boolean {
    const reordered = reorderPendingUpdateJobs(this.queue, jobId, direction);
    if (reordered === null) {
      return false;
    }
    this.queue = reordered;
    this.persistQueue();
    this.emitProgress(true);
    return true;
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
      this.activeSteamCmd !== null
      || this.activeSyncChild !== null
      || this.syncingServerId !== null
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
      `Cancelling operation (steamcmd=${this.activeSteamCmd?.child.pid ?? "n/a"}, sync=${this.activeSyncChild?.pid ?? "n/a"}, jobs=${this.queue.length})`,
    );
    this.setProgress(null, "Cancelling…", "Cancellation requested by the user");

    if (this.activeSteamCmd !== null) {
      const child = this.activeSteamCmd.child;
      this.activeSteamCmd = null;
      await this.killProcessTree(child);
    }
    if (this.activeSyncChild !== null) {
      const child = this.activeSyncChild;
      this.activeSyncChild = null;
      await this.killProcessTree(child);
    }

    if (runningJob !== undefined) {
      // Keep the active job recoverable until unwind reaches a durable checkpoint.
      // Queued pending/retrying jobs stay in Downloads and start after this one ends.
      runningJob.recoveryReason = "Cancellation requested; completing the safe unwind.";
      runningJob.updatedAt = new Date().toISOString();
    }
    this.persistQueue();

    this.syncingServerId = null;
    this.syncingStartedAt = null;
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
      this.activeSteamCmd !== null
      || this.activeSyncChild !== null
      || this.syncingServerId !== null
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
      this.syncingServerId !== null
        ? "sync-files"
        : (this.activeSteamCmd?.operation ?? runningJob?.type ?? null);
    if (isUnpausableSteamCmdOperation(liveOperation)) {
      throw new OperationPauseUnavailableError(
        "This operation cannot pause (SteamCMD validate has no resume checkpoint). Use Cancel instead.",
      );
    }

    this.pauseRequested = true;
    this.backups.requestCancel();
    this.stopDiskProgressMonitor();
    this.appendSteamCmdConsole(
      `Pausing operation (steamcmd=${this.activeSteamCmd?.child.pid ?? "n/a"}, sync=${this.activeSyncChild?.pid ?? "n/a"})`,
    );
    this.setProgress(null, "Pausing…", "Pause requested by the user");

    if (this.activeSteamCmd !== null) {
      const child = this.activeSteamCmd.child;
      this.activeSteamCmd = null;
      await this.killProcessTree(child);
    }
    if (this.activeSyncChild !== null) {
      const child = this.activeSyncChild;
      this.activeSyncChild = null;
      await this.killProcessTree(child);
    }

    if (runningJob !== undefined) {
      runningJob.recoveryReason = "Pause requested; stopping SteamCMD.";
      runningJob.updatedAt = new Date().toISOString();
    }
    this.persistQueue();

    this.syncingServerId = null;
    this.syncingStartedAt = null;
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
    const safeLimit = clampSteamCmdConsoleLimit(limit);
    return {
      lines: this.steamCmdConsoleLines.slice(-safeLimit),
      updatedAt: this.steamCmdConsoleUpdatedAt,
    };
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
      this.activeSteamCmd !== null
      || this.activeSyncChild !== null
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
    const jobId = await this.enqueueAndReturnJobId(type, serverId);
    const job = this.queue.find((candidate) => candidate.id === jobId);
    if (job !== undefined) {
      job.context.operatorAwaited = true;
      this.persistQueue();
    }

    const completion = new Promise<void>((resolve, reject) => {
      this.waiters.set(jobId, { resolve, reject });
    });

    // Start processing but wait for completion of this specific job.
    void this.processQueue();
    await completion;
  }

  private async enqueueAndStart(
    type: "install-files" | "update" | "verify-files",
    serverId: string,
  ): Promise<void> {
    await this.enqueueAndReturnJobId(type, serverId);
    // Queue processing is async; caller intentionally does not wait.
    void this.processQueue();
  }

  /**
   * Enqueue a critical files job and return its jobId.
   * The caller decides whether to wait for completion.
   */
  private async enqueueAndReturnJobId(
    type: "install-files" | "update" | "verify-files",
    serverId: string,
  ): Promise<string> {
    await this.ensureSteamCmdReadyForOperator();

    const existing = this.queue.find(
      (job) => job.serverId === serverId && job.type === type,
    );
    if (existing !== undefined) {
      if (existing.status === "cancelled") {
        // Clicking Install/Update/Verify again is a new request; drop the leftover.
        this.appendSteamCmdConsole(
          `Replacing cancelled ${type} job; queueing a new run.`,
        );
        this.removeJob(existing.id);
      } else if (existing.status === "blocked" || existing.status === "failed") {
        throw new Error(
          `A previous ${type} job requires Retry or Dismiss before another can be queued`,
        );
      }
    }

    const occupant = occupyingFilesJobForServer(
      this.queue
        .filter((job) => isFilesJobOperation(job.type))
        .map((job) => ({
          id: job.id,
          serverId: job.serverId,
          operation: job.type,
          status: job.status,
        })),
      serverId,
    );
    const decision = decideFilesJobEnqueue(type, occupant);
    const serverName = this.servers.get(serverId)?.name ?? "this server";
    if (decision.action === "replace") {
      const toDrop = this.queue.filter(
        (job) =>
          job.serverId === serverId
          && isFilesJobOperation(job.type)
          && isOccupyingFilesJobStatus(job.status)
          && job.status !== "running"
          && FILES_JOB_WEIGHT[type] > FILES_JOB_WEIGHT[job.type],
      );
      for (const job of toDrop) {
        this.rejectJob(job.id, new FilesJobSupersededError(type));
        this.removeJob(job.id);
      }
      this.appendSteamCmdConsole(
        filesJobEnqueueCopy(type, decision, serverName).message,
      );
      this.persistQueue();
      this.emitProgress(true);
    } else if (decision.action !== "enqueue") {
      throw new Error(filesJobEnqueueCopy(type, decision, serverName).message);
    }

    const now = new Date().toISOString();
    const job: CriticalJob = {
      id: randomUUID(),
      type,
      serverId,
      attempts: 0,
      maxAttempts: 3,
      status: "pending",
      phase: "queued",
      createdAt: now,
      updatedAt: now,
      lastError: null,
      recoveryReason: null,
      idempotencyKey: makeIdempotencyKey(type, serverId),
      operatorRetryAllowed: false,
      context: {},
    };

    this.queue.push(job);
    this.persistQueue();
    this.progressLabel = queuedFilesJobProgressLabel(type);
    this.lastProgressLine = `Job queued: ${type}`;
    this.emitProgress(true);
    this.addJobEvent(
      job,
      "update_started",
      "info",
      `Job queued: ${type} (${job.id.slice(0, 8)})`,
    );

    return job.id;
  }

  private async processQueue(): Promise<void> {
    if (this.processingQueue) {
      return;
    }
    this.processingQueue = true;

    try {
      for (;;) {
        if (shouldStopQueueProcessing(this.queue)) {
          this.emitProgress(true);
          break;
        }

        const job = findNextRunnableQueueJob(this.queue);
        if (job === undefined) {
          break;
        }

        if (
          updateJobNeedsSteamCmdExecutable(job)
          && this.findSteamCmdExecutableCached() === null
        ) {
          const error = this.steamCmdMissingError();
          this.rejectJob(job.id, error);
          const blocked = planSteamCmdMissingQueueBlock(error.message);
          job.status = blocked.status;
          job.operatorRetryAllowed = blocked.operatorRetryAllowed;
          job.recoveryReason = blocked.recoveryReason;
          job.updatedAt = new Date().toISOString();
          this.persistQueue();
          this.emitProgress(true);
          continue;
        }

        job.status = "running";
        job.updatedAt = new Date().toISOString();
        this.cancelRequested = false;
        this.pauseRequested = false;
        this.persistQueue();
        this.emitProgress(true);

        try {
          switch (resolveUpdateQueueJobHandler({ type: job.type, phase: job.phase })) {
            case "install":
              await this.performInstallServerFiles(job.serverId, job);
              break;
            case "verify":
              await this.performVerifyServerFiles(job.serverId, job);
              break;
            case "recover-file-job":
              await this.finishRecoveredFileJob(job);
              break;
            case "recover-rollback":
              await this.finishRecoveredRollback(job);
              break;
            case "update":
              await this.performUpdateServer(job.serverId, job);
              break;
          }
          this.resolveJob(job.id);
          this.removeJob(job.id);
          this.persistQueue();
          if (
            shouldClearQueueIdleProgress({
              queueLength: this.queue.length,
              hasActiveSteamCmd: this.activeSteamCmd !== null,
              syncingServerId: this.syncingServerId,
            })
          ) {
            this.clearPausedProgressSnapshot();
            this.setProgress(100, "Completed", "Operation finished");
            this.emitProgress(true);
          }
        } catch (error) {
          if (this.pauseRequested || isOperationPausedError(error)) {
            this.appendSteamCmdConsole(`Job ${job.type} paused`);
            this.rejectJob(
              job.id,
              isOperationPausedError(error)
                ? (error as Error)
                : new OperationPausedError(),
            );
            const paused = planQueueJobPauseDisposition();
            job.status = paused.status;
            job.recoveryReason = paused.recoveryReason;
            job.updatedAt = new Date().toISOString();
            this.persistQueue();
            this.pauseRequested = false;
            this.endFileSync();
            this.setPausedProgress();
            this.emitProgress(true);
            break;
          }
          if (this.cancelRequested || isOperationCancelledError(error)) {
            this.appendSteamCmdConsole(
              `Job ${job.type} stopped after cancellation`,
            );
            const cancelled = planQueueJobCancelDisposition({
              jobType: job.type,
              phase: job.phase,
            });
            this.rejectJob(
              job.id,
              isOperationCancelledError(error)
                ? (error as Error)
                : new OperationCancelledError(),
            );
            job.status = cancelled.status;
            job.operatorRetryAllowed = cancelled.operatorRetryAllowed;
            if (cancelled.phase !== undefined) {
              job.phase = cancelled.phase;
            }
            job.recoveryReason = cancelled.recoveryReason;
            job.updatedAt = new Date().toISOString();
            this.persistQueue();
            this.cancelRequested = false;
            this.endFileSync();
            if (cancelled.status === "cancelled") {
              this.setProgress(null, "Cancelled", "Operation cancelled by the user");
            }
            this.emitProgress(true);
            continue;
          }

          job.attempts += 1;
          job.lastError = error instanceof Error ? error.message : String(error);
          job.updatedAt = new Date().toISOString();

          const failure = planQueueJobFailureDisposition({
            job,
            error,
            isRecoveryBlocked: error instanceof CriticalJobRecoveryBlockedError,
          });
          if (failure.clearRestartInterrupted === true) {
            job.context.restartInterrupted = false;
          }
          if (failure.action === "blocked" || failure.action === "failed") {
            this.rejectJob(job.id, new Error(job.lastError));
            job.status = failure.status;
            if (failure.phase !== undefined) {
              job.phase = failure.phase;
            }
            job.operatorRetryAllowed = failure.operatorRetryAllowed;
            job.recoveryReason = failure.recoveryReason;
            this.persistQueue();
            if (failure.emitFailedEvent) {
              this.addJobEvent(
                job,
                "update_failed",
                failure.failedEventSeverity ?? "error",
                failure.failedEventMessage ?? job.lastError,
              );
            }
            continue;
          }

          job.status = failure.status;
          job.recoveryReason = failure.recoveryReason;
          this.persistQueue();
          if (failure.emitFailedEvent) {
            this.addJobEvent(
              job,
              "update_failed",
              failure.failedEventSeverity ?? "warning",
              failure.failedEventMessage ?? job.lastError,
            );
          }
          await delay(JOB_RETRY_DELAY_MS);
          if (job.status === "retrying") {
            job.status = "pending";
            job.phase = resumePhaseForUpdateRetry(job);
            job.updatedAt = new Date().toISOString();
            this.persistQueue();
          }
        }
      }
    } finally {
      this.processingQueue = false;
    }
  }

  private runSteamUpdate(
    installDir: string,
    operation: SteamCmdFilesOperation,
    serverId: string,
  ): Promise<CommandResult> {
    return this.steamCmdRunner.runSteamUpdate(installDir, operation, serverId);
  }

  /**
   * Progress without depending on the stdout pipe:
   * - tail of logs/console_log.txt (near real-time)
   * - appmanifest BytesDownloaded for THIS install
   * - size of steamapps/downloading under force_install_dir
   */
  private startDiskProgressMonitor(steamCmdHome: string, forceInstallDir: string): void {
    this.stopDiskProgressMonitor();
    this.diskProgressForceInstallDir = forceInstallDir;
    this.diskProgressSteamCmdHome = steamCmdHome;
    this.lastOfficialProgressAtMs = 0;
    this.lastDiskEstimateConsoleAtMs = 0;

    const logPath = steamCmdConsoleLogPath(steamCmdHome);
    if (existsSync(logPath)) {
      try {
        this.consoleLogOffset = statSync(logPath).size;
      } catch {
        this.consoleLogOffset = 0;
      }
    } else {
      this.consoleLogOffset = 0;
    }

    void measureInstallDownloadingBytes(forceInstallDir).then((baseline) => {
      if (this.diskProgressForceInstallDir !== forceInstallDir) {
        return;
      }
      this.diskProgressBaselineBytes = baseline;
    });

    this.appendSteamCmdConsole(formatDiskProgressLogPathLine(logPath));

    this.diskProgressTimer = setInterval(() => {
      void this.tickDiskProgressEstimate();
    }, 400);
  }

  private stopDiskProgressMonitor(): void {
    if (this.diskProgressTimer !== null) {
      clearInterval(this.diskProgressTimer);
      this.diskProgressTimer = null;
    }
    this.diskProgressForceInstallDir = null;
    this.diskProgressSteamCmdHome = null;
    this.diskProgressInFlight = false;
  }

  private async tickDiskProgressEstimate(): Promise<void> {
    const installDir = this.diskProgressForceInstallDir;
    const steamCmdHome = this.diskProgressSteamCmdHome;
    if (installDir === null || steamCmdHome === null || this.diskProgressInFlight || this.cancelRequested || this.pauseRequested) {
      return;
    }

    this.diskProgressInFlight = true;
    try {
      // 1) Live console from console_log.txt (priority for %/MB)
      const logChunk = await readConsoleLogSince(steamCmdHome, this.consoleLogOffset);
      this.consoleLogOffset = logChunk.nextOffset;
      if (logChunk.text.length > 0) {
        this.captureSteamCmdOutput(logChunk.text, "console_log");
      }

      // If console_log/stdout already provided recent progress, do NOT overwrite with appmanifest (often behind).
      if (
        shouldPreferOfficialProgressOverDiskEstimate(
          this.lastOfficialProgressAtMs,
          Date.now(),
        )
      ) {
        return;
      }

      // 2) Fallback: appmanifest for THIS install
      const manifest = await readInstallAppManifestProgress(installDir, ASA_APP_ID);
      if (
        manifest !== null
        && manifest.bytesDownloaded !== null
        && manifest.bytesToDownload !== null
        && manifest.bytesToDownload > 0
      ) {
        this.progressBytesDownloaded = manifest.bytesDownloaded;
        this.progressBytesTotal = manifest.bytesToDownload;
        if (manifest.percent !== null) {
          this.progressPercent = manifest.percent;
        }
        this.progressLabel = `Downloading · ${formatSteamCmdByteProgress(
          manifest.bytesDownloaded,
          manifest.bytesToDownload,
        )}`;
        this.lastProgressLine = this.progressLabel;
        this.emitProgress(true);
        return;
      }

      // 3) Fallback: downloading/temp size only under force_install_dir
      const bytesOnDisk = await measureInstallDownloadingBytes(installDir);
      if (this.diskProgressForceInstallDir !== installDir || this.cancelRequested || this.pauseRequested) {
        return;
      }
      const estimate = estimateProgressFromDisk(
        bytesOnDisk,
        this.progressBytesTotal,
        this.diskProgressBaselineBytes,
      );
      if (estimate.downloaded < 1_000_000 && estimate.deltaBytes < 1_000_000) {
        return;
      }

      this.progressPercent = estimate.percent;
      this.progressBytesDownloaded = estimate.downloaded;
      this.progressBytesTotal = estimate.total;
      this.progressLabel = `Downloading (estimated) · ${formatSteamCmdByteProgress(
        estimate.downloaded,
        estimate.total,
      )}`;
      this.lastProgressLine = this.progressLabel;
      this.emitProgress(true);

      const now = Date.now();
      if (now - this.lastDiskEstimateConsoleAtMs >= 5000) {
        this.lastDiskEstimateConsoleAtMs = now;
        this.steamCmdConsoleLines = appendSteamCmdConsoleRing(
          this.steamCmdConsoleLines,
          formatTimestampedSteamCmdLine(
            new Date().toISOString(),
            `[estimated/downloading] ${estimate.percent.toFixed(1)}% — ${formatSteamCmdByteProgress(estimate.downloaded, estimate.total)}`,
          ),
          STEAMCMD_CONSOLE_MAX_LINES,
        );
        this.steamCmdConsoleUpdatedAt = new Date().toISOString();
        this.emitProgress(true);
      }
    } finally {
      this.diskProgressInFlight = false;
    }
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
    this.steamCmdConsoleLines.length = 0;
    this.steamCmdConsoleUpdatedAt = new Date().toISOString();
  }

  private appendSteamCmdConsole(line: string, options?: { forceProgressPush?: boolean }): void {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      return;
    }
    this.steamCmdConsoleLines = appendSteamCmdConsoleRing(
      this.steamCmdConsoleLines,
      formatTimestampedSteamCmdLine(new Date().toISOString(), trimmed),
      STEAMCMD_CONSOLE_MAX_LINES,
    );
    this.steamCmdConsoleUpdatedAt = new Date().toISOString();
    this.lastProgressLine = trimmed;
    const percentChanged = this.ingestProgressFromLine(trimmed);
    this.emitProgress(options?.forceProgressPush === true || percentChanged);
  }

  /**
   * SteamCMD writes progress with \\r (same line) almost without \\n.
   * Must split on CR/LF or the UI sees no progress until much later.
   */
  private captureSteamCmdOutput(chunk: string, source: string): void {
    const previous = this.steamCmdOutputBuffers.get(source) ?? "";
    const { completeLines, remainder } = splitSteamCmdOutputChunk(previous, chunk);
    this.steamCmdOutputBuffers.set(source, remainder);

    for (const line of completeLines) {
      this.handleSteamCmdOutputLine(line, source);
    }
  }

  private handleSteamCmdOutputLine(line: string, source: string): void {
    const bare = stripSteamCmdBareLine(line);
    const parsed = parseSteamCmdProgressLine(bare);
    const isProgressTick = parsed.percent !== null;

    if (isProgressTick) {
      const now = Date.now();
      const previousPercent = this.progressPercent;
      if (parsed.percent !== null) {
        this.progressPercent = parsed.percent;
      }
      if (parsed.label !== null) {
        this.progressLabel = parsed.label;
      }
      if (parsed.bytesDownloaded !== null) {
        this.progressBytesDownloaded = parsed.bytesDownloaded;
      }
      if (parsed.bytesTotal !== null) {
        this.progressBytesTotal = parsed.bytesTotal;
      }
      this.lastProgressLine = bare;
      this.lastOfficialProgressAtMs = Date.now();

      const percentChanged = steamCmdProgressPercentChanged(previousPercent, parsed.percent);
      this.emitProgress(percentChanged);

      if (
        shouldLogProgressTickToConsole({
          nowMs: now,
          lastLogAtMs: this.lastProgressConsoleLogAtMs,
          minLogIntervalMs: STEAMCMD_PROGRESS_CONSOLE_LOG_MIN_MS,
          parsedPercent: parsed.percent,
          lastLoggedPercent: this.lastProgressConsoleLoggedPercent,
          minPercentDelta: STEAMCMD_PROGRESS_CONSOLE_LOG_MIN_DELTA,
        })
      ) {
        this.lastProgressConsoleLogAtMs = now;
        this.lastProgressConsoleLoggedPercent = parsed.percent;
        this.steamCmdConsoleLines = appendSteamCmdConsoleRing(
          this.steamCmdConsoleLines,
          formatTimestampedSteamCmdLine(new Date().toISOString(), `[${source}] ${bare}`),
          STEAMCMD_CONSOLE_MAX_LINES,
        );
        this.steamCmdConsoleUpdatedAt = new Date().toISOString();
        this.emitProgress(true);
      }
      return;
    }

    this.appendSteamCmdConsole(`[${source}] ${line}`, { forceProgressPush: true });
  }

  private ingestProgressFromLine(line: string): boolean {
    const bare = stripSteamCmdProgressIngestPrefix(line);
    const parsed = parseSteamCmdProgressLine(bare);
    let percentChanged = false;
    if (parsed.percent !== null) {
      percentChanged = steamCmdProgressPercentChanged(this.progressPercent, parsed.percent);
      this.progressPercent = parsed.percent;
    }
    if (parsed.label !== null) {
      this.progressLabel = parsed.label;
    }
    if (parsed.bytesDownloaded !== null) {
      this.progressBytesDownloaded = parsed.bytesDownloaded;
    }
    if (parsed.bytesTotal !== null) {
      this.progressBytesTotal = parsed.bytesTotal;
    }
    if (parsed.percent !== null || parsed.bytesDownloaded !== null) {
      this.lastOfficialProgressAtMs = Date.now();
    }
    return percentChanged;
  }

  private freezePausedProgressSnapshot(): void {
    if (
      this.progressPercent === null
      && this.progressBytesDownloaded === null
      && this.progressBytesTotal === null
    ) {
      return;
    }
    this.pausedProgressSnapshot = {
      percent: this.progressPercent,
      label: this.progressLabel,
      bytesDownloaded: this.progressBytesDownloaded,
      bytesTotal: this.progressBytesTotal,
    };
  }

  private clearPausedProgressSnapshot(): void {
    this.pausedProgressSnapshot = null;
  }

  private setPausedProgress(): void {
    this.freezePausedProgressSnapshot();
    this.setProgress(null, "Paused", "Paused");
  }

  private setProgress(percent: number | null, label: string | null, line?: string): void {
    this.progressPercent = percent;
    if (label !== null) {
      this.progressLabel = label;
    }
    if (percent === 0 || percent === null) {
      this.progressBytesDownloaded = null;
      this.progressBytesTotal = null;
    }
    if (line !== undefined) {
      this.lastProgressLine = line;
    }
    this.emitProgress(true);
  }

  private beginFileSync(serverId: string, label: string): void {
    this.syncingServerId = serverId;
    this.syncingStartedAt = new Date().toISOString();
    // New phase after SteamCMD: robocopy has no %/bytes — indeterminate bar + label.
    this.progressBytesDownloaded = null;
    this.progressBytesTotal = null;
    this.progressPercent = null;
    this.progressLabel = label;
    this.lastProgressLine = label;
    this.emitProgress(true);
  }

  private endFileSync(): void {
    this.syncingServerId = null;
    this.syncingStartedAt = null;
    this.activeSyncChild = null;
    this.emitProgress(true);
  }

  private emitProgress(force: boolean): void {
    const now = Date.now();
    if (!force && now - this.lastProgressPushAtMs < PROGRESS_PUSH_MIN_MS) {
      return;
    }
    this.lastProgressPushAtMs = now;
    this.emit("progress", {
      status: this.getSteamCmdStatus(),
      console: this.getSteamCmdConsole(160),
    });
  }

  private beginSteamCmdProcess(
    child: ChildProcess,
    operation: "install-steamcmd" | "install-files" | "update" | "verify-files",
    serverId: string | null,
  ): void {
    if (this.activeSteamCmd !== null) {
      throw new Error("A SteamCMD operation is already in progress");
    }
    this.clearPausedProgressSnapshot();
    this.steamCmdOutputBuffers.clear();
    this.lastProgressConsoleLogAtMs = 0;
    this.lastProgressConsoleLoggedPercent = null;
    const progressStart = planSteamCmdProcessProgressStart(operation);
    this.setProgress(progressStart.percent, progressStart.label, progressStart.line);
    this.activeSteamCmd = {
      child,
      operation,
      serverId,
      startedAt: new Date().toISOString(),
    };
    this.emitProgress(true);
  }

  private endSteamCmdProcess(child: ChildProcess): void {
    if (this.activeSteamCmd?.child === child) {
      // Flush remaining buffer (\r without newline).
      for (const [source, remainder] of this.steamCmdOutputBuffers) {
        const trimmed = remainder.trim();
        if (trimmed.length > 0) {
          this.handleSteamCmdOutputLine(trimmed, source);
        }
      }
      this.steamCmdOutputBuffers.clear();
      this.activeSteamCmd = null;
      this.emitProgress(true);
    }
  }

  private async killProcessTree(child: ChildProcess): Promise<void> {
    await killChildProcessTreeAsync(child);
  }

  private loadQueue(): CriticalJob[] {
    const raw = this.settings.get(CRITICAL_JOBS_KEY);
    if (raw === null || raw.trim().length === 0) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as Array<Partial<CriticalJob>>;
      if (!Array.isArray(parsed)) {
        throw new Error("Critical job queue is not an array");
      }
      const jobs: CriticalJob[] = [];
      let invalidEntryFound = false;
      for (const job of parsed) {
        if (!isValidPersistedUpdateQueueEntry(job)) {
          invalidEntryFound = true;
          continue;
        }
        const type = job.type;
        const phase = typeof job.phase === "string" ? job.phase : "queued";
        const wasInterrupted = job.status === "running";
        const context = sanitizeUpdateJobContext(job.context);

        // A persisted post-side-effect checkpoint is durable evidence that
        // SteamCMD completed. If the requested runtime state is already present,
        // the queue row itself is stale and can be reconciled as completed.
        if (
          shouldOmitInterruptedUpdateJobOnLoad({
            wasInterrupted,
            phase,
            wasRunning: context.wasRunning,
            serverIsActive: this.processes.isActive(job.serverId),
          })
        ) {
          continue;
        }

        const interruptedIsAmbiguous = isUpdateJobInterruptedAmbiguous(type, phase);
        const migrated = migrateCriticalJob<CriticalJob>(job, {
          type,
          serverId: job.serverId,
          defaultPhase: "queued",
          interruptedIsAmbiguous,
          serverExists: this.servers.get(job.serverId) !== null,
        });
        migrated.context = context;
        const interruptedRecovery = planInterruptedUpdateJobRecovery({
          wasInterrupted,
          phase,
          interruptedIsAmbiguous,
          serverExists: this.servers.get(job.serverId) !== null,
        });
        if (interruptedRecovery !== null) {
          migrated.status = interruptedRecovery.status;
          migrated.operatorRetryAllowed = interruptedRecovery.operatorRetryAllowed;
          migrated.recoveryReason = interruptedRecovery.recoveryReason;
          if (interruptedRecovery.restartInterrupted === true) {
            migrated.context = { ...migrated.context, restartInterrupted: true };
          }
        }
        const duplicateIndex = jobs.findIndex(
          (candidate) => candidate.idempotencyKey === migrated.idempotencyKey,
        );
        if (duplicateIndex >= 0) {
          const merged = mergeUpdateCriticalJobs(jobs[duplicateIndex]!, migrated);
          const duplicateRecovery = planDuplicateRecoveredUpdateJob(
            this.servers.get(job.serverId) !== null,
          );
          if (duplicateRecovery !== null) {
            merged.status = duplicateRecovery.status;
            merged.operatorRetryAllowed = duplicateRecovery.operatorRetryAllowed;
            merged.recoveryReason = duplicateRecovery.recoveryReason;
          }
          jobs[duplicateIndex] = merged;
          invalidEntryFound = true;
          continue;
        }
        jobs.push(migrated);
      }
      if (invalidEntryFound) {
        this.settings.set(`${CRITICAL_JOBS_KEY}.quarantine.${Date.now()}`, raw);
      }
      this.settings.set(CRITICAL_JOBS_KEY, JSON.stringify(jobs));
      return jobs;
    } catch {
      this.settings.set(`${CRITICAL_JOBS_KEY}.quarantine.${Date.now()}`, raw);
      this.settings.set(CRITICAL_JOBS_KEY, "[]");
      return [];
    }
  }

  private persistQueue(): void {
    this.settings.set(CRITICAL_JOBS_KEY, JSON.stringify(this.queue));
  }

  private removeJob(jobId: string): void {
    this.queue = this.queue.filter((job) => job.id !== jobId);
  }

  private checkpointJob(job: CriticalJob | undefined, phase: string): void {
    if (job === undefined) return;
    job.phase = phase;
    job.updatedAt = new Date().toISOString();
    this.persistQueue();
    this.emitProgress(true);
  }

  private queueHeldForOperator(): boolean {
    return isUpdateQueueHeldForOperator(this.queue);
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

  private resolveJob(jobId: string): void {
    const waiter = this.waiters.get(jobId);
    if (waiter !== undefined) {
      waiter.resolve();
      this.waiters.delete(jobId);
    }
  }

  private rejectJob(jobId: string, error: Error): void {
    const waiter = this.waiters.get(jobId);
    if (waiter !== undefined) {
      waiter.reject(error);
      this.waiters.delete(jobId);
    }
  }
}
