import { mkdir, rm, writeFile, access } from "node:fs/promises";
import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { dirname, join } from "node:path";
import { existsSync, statSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type {
  SteamCmdCacheKind,
  SteamCmdConsoleSnapshot,
  SteamCmdStatus,
} from "../../../shared/types";
import { parseSteamCmdProgressLine } from "../../../shared/steamcmd-progress";
import type { BackupService } from "../backups/backup-service";
import type { ServerRepository } from "../../infra/db/server-repository";
import type { InstanceService } from "../instances/instance-service";
import { killChildProcessTreeAsync } from "../../infra/process/kill-win-process-tree";
import { execFileBounded } from "../../infra/process/exec-file-bounded";
import type { ProcessManager } from "../../infra/process/process-manager";
import type { InstanceLockManager } from "../../orchestration/instance-lock-manager";
import type { AppSettingsRepository } from "../../infra/db/app-settings-repository";
import {
  isTransientCriticalJobError,
  makeIdempotencyKey,
  migrateCriticalJob,
  toCriticalJobSummary,
  type DurableCriticalJob,
} from "../../orchestration/critical-job-recovery";
import {
  buildSteamCmdAppUpdateArgs,
  STEAMCMD_ENGLISH_ARGS,
  steamCmdSpawnEnv,
  canSkipAsaContentSync,
  isOperationCancelledError,
  OperationCancelledError,
  resolveAsaContentCacheDir,
  resolveDepotCacheDir,
  resolveSteamCmdCacheDir,
  resolveSteamCmdHome,
  shouldReuseAsaContentCache,
  syncAsaContentCacheToInstallDir,
  readAsaManifestBuildId,
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

const MAX_STEAMCMD_LINES = 500;
const CRITICAL_JOBS_KEY = "criticalJobsQueue.v1";
const JOB_RETRY_DELAY_MS = 5000;
const KNOWN_CRITICAL_JOB_STATUSES = new Set([
  "pending",
  "running",
  "retrying",
  "blocked",
  "failed",
  "cancelled",
]);
const KNOWN_CRITICAL_JOB_PHASES = new Set([
  "queued",
  "validating",
  "validated",
  "stopping-server",
  "creating-pre-update-backup",
  "pre-update-backup-complete",
  "applying-files",
  "files-applied",
  "restarting-server",
  "rollback-stopping-server",
  "rollback-restoring-backups",
  "rollback-restarting-server",
  "rollback-complete",
  "failed",
  "cancelled",
]);
/** UI push: frequent enough for live % without saturating Electron. */
const PROGRESS_PUSH_MIN_MS = 100;
/** Do not spam the console on every SteamCMD \r tick; do update the bar. */
const PROGRESS_CONSOLE_LOG_MIN_MS = 1500;
const PROGRESS_CONSOLE_LOG_MIN_DELTA = 2;

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface ActiveSteamCmdOperation {
  child: ChildProcess;
  operation: "install-steamcmd" | "install-files" | "update" | "verify-files";
  serverId: string | null;
  startedAt: string;
}

class CriticalJobRecoveryBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CriticalJobRecoveryBlockedError";
  }
}

interface CriticalJob extends DurableCriticalJob {
  type: "install-files" | "update" | "verify-files";
  context: {
    wasRunning?: boolean;
    preUpdateBackupIds?: string[];
    rollbackRestoredBackupIds?: string[];
    appliedBuildId?: string | null;
    updateLogPath?: string;
    steamCmdExitCode?: number;
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Safe per-instance update flow:
 * stop (no pre_stop) -> pre_update backup -> steamcmd update ->
 * start+health iff wasRunning -> rollback on failure.
 */
export class UpdateService extends EventEmitter {
  private readonly steamCmdConsoleLines: string[] = [];
  private steamCmdConsoleUpdatedAt = new Date(0).toISOString();
  private activeSteamCmd: ActiveSteamCmdOperation | null = null;
  private queue: CriticalJob[] = [];
  private processingQueue = false;
  private readonly waiters = new Map<string, { resolve: () => void; reject: (error: Error) => void }>();
  /** Timestamp of the last successful asa_content_cache update in this session. */
  private contentCacheUpdatedAtMs = 0;
  private progressPercent: number | null = null;
  private progressLabel: string | null = null;
  private progressBytesDownloaded: number | null = null;
  private progressBytesTotal: number | null = null;
  private lastProgressLine: string | null = null;
  private syncingServerId: string | null = null;
  private syncingStartedAt: string | null = null;
  private activeSyncChild: ChildProcess | null = null;
  private cancelRequested = false;
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
    const configured = this.settings.get("steamcmdPath")?.trim();
    if (configured != null && configured.length > 0) {
      this.lastKnownSteamCmdPath = configured;
    }
    this.queue = this.loadQueue();
    const resumableJobs = this.queue.filter(
      (job) => job.status === "pending" || job.status === "retrying",
    );
    if (resumableJobs.length > 0) {
      this.appendSteamCmdConsole(`Resuming ${resumableJobs.length} pending critical job(s)`);
      setTimeout(() => {
        void this.processQueue();
      }, 250);
    }
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
    const zipPath = join(this.steamcmdDir, "steamcmd.zip");
    const extractDir = join(this.steamcmdDir, "_extract");
    const exePath = join(this.steamcmdDir, "steamcmd.exe");

    const command = [
      "$ErrorActionPreference='Stop'",
      `$target='${this.steamcmdDir.replace(/'/g, "''")}'`,
      `$zip='${zipPath.replace(/'/g, "''")}'`,
      `$extract='${extractDir.replace(/'/g, "''")}'`,
      "$url='https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip'",
      "if (Test-Path -LiteralPath $extract) { Remove-Item -LiteralPath $extract -Recurse -Force }",
      "if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }",
      "Invoke-WebRequest -Uri $url -OutFile $zip",
      "Expand-Archive -LiteralPath $zip -DestinationPath $extract -Force",
      "$candidateExe = Join-Path $target 'steamcmd.exe'",
      "if (Test-Path -LiteralPath $candidateExe) {",
      "  $backupExe = Join-Path $target 'steamcmd.exe.bak'",
      "  if (Test-Path -LiteralPath $backupExe) { Remove-Item -LiteralPath $backupExe -Force -ErrorAction SilentlyContinue }",
      "  try { Rename-Item -LiteralPath $candidateExe -NewName 'steamcmd.exe.bak' -Force -ErrorAction Stop } catch {}",
      "}",
      "Copy-Item -Path (Join-Path $extract '*') -Destination $target -Recurse -Force",
      "if (Test-Path -LiteralPath $extract) { Remove-Item -LiteralPath $extract -Recurse -Force }",
      "if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }",
      "$backupExe = Join-Path $target 'steamcmd.exe.bak'",
      "if (Test-Path -LiteralPath $backupExe) { Remove-Item -LiteralPath $backupExe -Force -ErrorAction SilentlyContinue }",
    ].join("; ");

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
    const queued = this.queue.find(
      (job) => job.status === "pending" || job.status === "retrying" || job.status === "running",
    );
    const steamCmdHome =
      executablePath !== null
        ? resolveSteamCmdHome(executablePath)
        : resolveSteamCmdHome(join(this.steamcmdDir, "steamcmd.exe"));
    const busy =
      active !== null || this.syncingServerId !== null || queued !== undefined;
    const operation: SteamCmdStatus["operation"] =
      this.syncingServerId !== null
        ? "sync-files"
        : (active?.operation ?? queued?.type ?? null);
    const serverId =
      this.syncingServerId
      ?? active?.serverId
      ?? queued?.serverId
      ?? null;

    return {
      detected: executablePath !== null,
      executablePath,
      depotCacheDir: resolveDepotCacheDir(steamCmdHome),
      contentCacheDir: resolveAsaContentCacheDir(steamCmdHome),
      busy,
      running: active !== null || this.syncingServerId !== null,
      operation,
      serverId,
      startedAt: this.syncingStartedAt ?? active?.startedAt ?? queued?.updatedAt ?? null,
      pid: active?.child.pid ?? null,
      progressPercent: this.progressPercent,
      progressLabel: this.progressLabel,
      progressBytesDownloaded: this.progressBytesDownloaded,
      progressBytesTotal: this.progressBytesTotal,
      lastLine: this.lastProgressLine,
      queuedCount: queuedPending.length,
      criticalJobs: [
        ...this.queue.map((job) =>
          toCriticalJobSummary(job, this.servers.get(job.serverId)?.name ?? null)),
        ...(this.backups.getCriticalJobs?.() ?? []),
      ].sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
      checkedAt: new Date().toISOString(),
    };
  }

  retryCriticalJob(jobId: string): boolean {
    const job = this.queue.find((candidate) => candidate.id === jobId);
    if (job === undefined) return this.backups.retryCriticalJob(jobId);
    if (
      (job.status !== "blocked" && job.status !== "failed")
      || !job.operatorRetryAllowed
    ) return false;
    job.status = "pending";
    job.phase = this.resumePhaseForRetry(job);
    job.maxAttempts = Math.max(job.maxAttempts, job.attempts + 3);
    job.recoveryReason = "Retry requested by the operator after reviewing recovery state.";
    job.updatedAt = new Date().toISOString();
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
    return true;
  }

  cancelCriticalJob(jobId: string): boolean {
    const job = this.queue.find((candidate) => candidate.id === jobId);
    if (job === undefined) return this.backups.cancelCriticalJob(jobId);
    if (job.status !== "pending" && job.status !== "retrying") return false;
    job.status = "cancelled";
    job.phase = "cancelled";
    job.recoveryReason = "Cancelled by the operator before execution.";
    job.updatedAt = new Date().toISOString();
    this.rejectJob(job.id, new OperationCancelledError());
    this.persistQueue();
    this.emitProgress(true);
    return true;
  }

  async cancelSteamCmd(): Promise<boolean> {
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
      || this.queue.some(
        (job) => job.status === "pending" || job.status === "retrying" || job.status === "running",
      );

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

    const jobs = this.queue.filter(
      (job) => job.status === "pending" || job.status === "retrying" || job.status === "running",
    );
    for (const job of jobs) {
      if (job.status === "running") {
        // The active operation may still need to restore backups or return the
        // server to its original runtime state. Keep it recoverable until that
        // unwind reaches a durable terminal checkpoint.
        job.recoveryReason = "Cancellation requested; completing the safe unwind.";
        job.updatedAt = new Date().toISOString();
        continue;
      }
      job.status = "cancelled";
      job.phase = "cancelled";
      job.recoveryReason = "Cancelled by the operator.";
      job.updatedAt = new Date().toISOString();
      this.servers.addEvent(
        job.serverId,
        "update_failed",
        "warning",
        `Operation ${job.type} cancelled by the user`,
      );
      this.rejectJob(job.id, new OperationCancelledError());
    }
    this.persistQueue();

    this.syncingServerId = null;
    this.syncingStartedAt = null;
    this.setProgress(null, "Cancelled", "Operation cancelled by the user");
    this.emitProgress(true);
    return true;
  }

  async setSteamCmdExecutablePath(exePath: string): Promise<string> {
    const normalized = exePath.trim();
    if (normalized.length === 0) {
      throw new Error("SteamCMD path is empty");
    }
    if (!existsSync(normalized)) {
      throw new Error(`steamcmd.exe not found at: ${normalized}`);
    }
    await this.verifySteamCmdExecutable(normalized);
    this.persistSteamCmdPath(normalized);
    this.contentCacheUpdatedAtMs = 0;
    this.appendSteamCmdConsole(`Manual SteamCMD path configured: ${normalized}`);
    return normalized;
  }

  getSteamCmdConsole(limit = 200): SteamCmdConsoleSnapshot {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 200;
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
      this.contentCacheUpdatedAtMs = 0;
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
    // May run while the server is active: performUpdateServer captures wasRunning,
    // stops for SteamCMD, then restarts on success (or after rollback).
    await this.enqueueAndWait("update", serverId);
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

  private async performInstallServerFiles(serverId: string, job?: CriticalJob): Promise<void> {
    await this.locks.withLock(serverId, "install-files", async () => {
      this.checkpointJob(job, "validating");
      const server = this.servers.get(serverId);
      if (server === null) {
        throw new Error("Server does not exist");
      }

      await mkdir(server.installDir, { recursive: true });
      this.servers.addEvent(
        serverId,
        "update_started",
        "info",
        `Installing base files via SteamCMD on "${server.name}"`,
      );

      this.checkpointJob(job, "applying-files");
      const cmd = await this.runSteamUpdate(server.installDir, "install-files", serverId);
      if (cmd.code !== 0) {
        this.servers.addEvent(
          serverId,
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

      this.servers.addEvent(
        serverId,
        "update_completed",
        "info",
        `Base files installed for "${server.name}"`,
      );
    });
  }

  private async performUpdateServer(serverId: string, job?: CriticalJob): Promise<void> {
    await this.locks.withLock(serverId, "update", async () => {
      // Backup identity is the durable resume signal. Unlike `phase`, it
      // survives validation checkpoints and a second crash during retry.
      const resumeFromPreUpdateBackup =
        (job?.context.preUpdateBackupIds?.length ?? 0) > 0;
      if (job !== undefined) {
        // A new SteamCMD attempt creates a new rollback generation. Evidence
        // from the prior completed rollback must never suppress this attempt's
        // restores if the process crashes again.
        job.context.rollbackRestoredBackupIds = [];
      }
      this.checkpointJob(job, "validating");
      const server = this.servers.get(serverId);
      if (server === null) {
        throw new Error("Server does not exist");
      }

      const isCurrentlyRunning = this.processes.isActive(serverId);
      const wasRunning = job?.context.wasRunning ?? isCurrentlyRunning;
      if (job !== undefined && job.context.wasRunning === undefined) {
        job.context.wasRunning = isCurrentlyRunning;
      }
      this.checkpointJob(job, "validated");
      const startedAt = new Date();
      this.servers.addEvent(
        serverId,
        "update_started",
        "info",
        `Starting safe update for \"${server.name}\"`,
        {
          what: "Safe update job started (stop if needed → pre-update backup → SteamCMD → restart if it was running).",
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
          if (preUpdateBackups.length !== persistedIds.length || persistedIds.length === 0) {
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
            "Creating pre-update backups (world, INI) before SteamCMD…",
          );
          this.setProgress(
            5,
            "Creating pre-update backups…",
            "World / INI snapshots protect rollback if SteamCMD fails",
          );
          preUpdateBackups = await this.backups.createPreUpdateBackupForJob(serverId, {
            onKindProgress: (kind, index, total) => {
              const label =
                kind === "world"
                  ? "world save"
                  : kind === "ini"
                    ? "INI files"
                    : "player profiles";
              const percent = Math.round(5 + ((index + 0.5) / Math.max(total, 1)) * 20);
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

        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        await mkdir(this.updatesLogDir, { recursive: true });
        const logPath = join(this.updatesLogDir, `${serverId}-${timestamp}.log`);
        if (job !== undefined) job.context.updateLogPath = logPath;

        this.checkpointJob(job, "applying-files");
        const cmd = await this.runSteamUpdate(server.installDir, "update", serverId);
        const durationMs = Date.now() - startedAt.getTime();
        await writeFile(
          logPath,
          [
            `time=${new Date().toISOString()}`,
            `server=${server.name}`,
            `installDir=${server.installDir}`,
            `exitCode=${cmd.code}`,
            `startedAt=${startedAt.toISOString()}`,
            `durationMs=${durationMs}`,
            "--- stdout ---",
            cmd.stdout,
            "--- stderr ---",
            cmd.stderr,
          ].join("\n"),
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

        this.servers.addEvent(
          serverId,
          "update_completed",
          "info",
          wasRunning
            ? `Update completed on \"${server.name}\" and the server was restarted`
            : `Update completed on \"${server.name}\" (left stopped)`,
        );
      } catch (err) {
        if (err instanceof CriticalJobRecoveryBlockedError) throw err;

        const phaseAtFailure = job?.phase ?? "";
        const cancelled =
          this.cancelRequested || isOperationCancelledError(err);
        const installMayHaveChanged =
          phaseAtFailure === "applying-files"
          || phaseAtFailure === "files-applied"
          || phaseAtFailure === "restarting-server"
          || typeof job?.context.steamCmdExitCode === "number"
          || job?.context.appliedBuildId != null;

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
          if (wasRunning && !this.processes.isActive(serverId)) {
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
        this.servers.addEvent(
          serverId,
          "update_failed",
          "error",
          `Update failed on \"${server.name}\": ${
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
        this.servers.addEvent(
          serverId,
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

  private async performVerifyServerFiles(serverId: string, job?: CriticalJob): Promise<void> {
    await this.locks.withLock(serverId, "verify-files", async () => {
      this.checkpointJob(job, "validating");
      const server = this.servers.get(serverId);
      if (server === null) {
        throw new Error("Server does not exist");
      }

      const isCurrentlyRunning = this.processes.isActive(serverId);
      const wasRunning = job?.context.wasRunning ?? isCurrentlyRunning;
      if (job !== undefined && job.context.wasRunning === undefined) {
        job.context.wasRunning = isCurrentlyRunning;
      }
      this.checkpointJob(job, "validated");
      this.servers.addEvent(
        serverId,
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
          this.servers.addEvent(
            serverId,
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

        this.servers.addEvent(
          serverId,
          "update_completed",
          "info",
          `Integrity verified for "${server.name}"`,
        );

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
      } catch (error) {
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

  private async enqueueAndWait(
    type: "install-files" | "update" | "verify-files",
    serverId: string,
  ): Promise<void> {
    const existingPending = this.queue.find(
      (job) =>
        job.serverId === serverId
        && job.type === type,
    );
    if (existingPending !== undefined) {
      if (
        existingPending.status === "blocked"
        || existingPending.status === "failed"
        || existingPending.status === "cancelled"
      ) {
        throw new Error(
          `A previous ${type} job requires Retry or Dismiss before another can be queued`,
        );
      }
      await new Promise<void>((resolve, reject) => {
        this.waiters.set(existingPending.id, { resolve, reject });
      });
      return;
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
    this.progressLabel =
      type === "install-files"
        ? "Queued: install files…"
        : type === "verify-files"
          ? "Queued: verify integrity…"
          : "Queued: update…";
    this.lastProgressLine = `Job queued: ${type}`;
    this.emitProgress(true);
    this.servers.addEvent(
      serverId,
      "update_started",
      "info",
      `Job queued: ${type} (${job.id.slice(0, 8)})`,
    );

    const completion = new Promise<void>((resolve, reject) => {
      this.waiters.set(job.id, { resolve, reject });
    });
    void this.processQueue();
    await completion;
  }

  private async processQueue(): Promise<void> {
    if (this.processingQueue) {
      return;
    }
    this.processingQueue = true;

    try {
      for (;;) {
        const job = this.queue.find(
          (candidate) => candidate.status === "pending" || candidate.status === "retrying",
        );
        if (job === undefined) {
          break;
        }

        job.status = "running";
        job.updatedAt = new Date().toISOString();
        this.cancelRequested = false;
        this.persistQueue();
        this.emitProgress(true);

        try {
          if (job.type === "install-files") {
            if (job.phase === "files-applied" || job.phase === "restarting-server") {
              await this.finishRecoveredFileJob(job);
            } else {
              await this.performInstallServerFiles(job.serverId, job);
            }
          } else if (job.type === "verify-files") {
            if (job.phase === "files-applied" || job.phase === "restarting-server") {
              await this.finishRecoveredFileJob(job);
            } else {
              await this.performVerifyServerFiles(job.serverId, job);
            }
          } else {
            if (job.phase === "files-applied" || job.phase === "restarting-server") {
              await this.finishRecoveredFileJob(job);
            } else if (
              job.phase.startsWith("rollback-")
              && job.phase !== "rollback-complete"
            ) {
              await this.finishRecoveredRollback(job);
            } else {
              await this.performUpdateServer(job.serverId, job);
            }
          }
          this.resolveJob(job.id);
          this.removeJob(job.id);
          this.persistQueue();
          if (this.queue.length === 0 && this.activeSteamCmd === null && this.syncingServerId === null) {
            this.setProgress(100, "Completed", "Operation finished");
            this.emitProgress(true);
          }
        } catch (error) {
          if (this.cancelRequested || isOperationCancelledError(error)) {
            this.appendSteamCmdConsole(
              `Job ${job.type} stopped after cancellation`,
            );
            const incompleteRollback =
              job.type === "update"
              && job.phase.startsWith("rollback-")
              && job.phase !== "rollback-complete";
            if (incompleteRollback) {
              this.rejectJob(
                job.id,
                error instanceof Error ? error : new OperationCancelledError(),
              );
              job.status = "blocked";
              job.operatorRetryAllowed = true;
              job.recoveryReason =
                `Cancellation interrupted phase "${job.phase}". Inspect backups and runtime state before retrying.`;
              job.updatedAt = new Date().toISOString();
              this.persistQueue();
              this.cancelRequested = false;
              this.endFileSync();
              this.emitProgress(true);
              continue;
            }
            this.rejectJob(
              job.id,
              isOperationCancelledError(error)
                ? (error as Error)
                : new OperationCancelledError(),
            );
            job.status = "cancelled";
            if (job.phase !== "rollback-complete") {
              job.phase = "cancelled";
            }
            job.recoveryReason =
              job.phase === "rollback-complete"
                ? "Cancelled by the operator after rollback completed safely."
                : "Cancelled by the operator during execution.";
            job.updatedAt = new Date().toISOString();
            this.persistQueue();
            this.cancelRequested = false;
            this.endFileSync();
            this.setProgress(null, "Cancelled", "Operation cancelled by the user");
            this.emitProgress(true);
            break;
          }

          job.attempts += 1;
          job.lastError = error instanceof Error ? error.message : String(error);
          job.updatedAt = new Date().toISOString();

          const ambiguousRollback =
            job.type === "update"
            && job.phase.startsWith("rollback-")
            && job.phase !== "rollback-complete";
          if (error instanceof CriticalJobRecoveryBlockedError) {
            this.rejectJob(job.id, error);
            job.status = "blocked";
            job.operatorRetryAllowed = true;
            job.recoveryReason = error.message;
            this.persistQueue();
            continue;
          }
          if (ambiguousRollback) {
            this.rejectJob(job.id, new Error(job.lastError));
            job.status = "blocked";
            job.operatorRetryAllowed = true;
            job.recoveryReason =
              `Failure during phase "${job.phase}" left rollback state ambiguous. Inspect backups and runtime state before retrying.`;
            this.persistQueue();
            this.servers.addEvent(
              job.serverId,
              "update_failed",
              "error",
              `Job ${job.type} blocked during ambiguous rollback: ${job.lastError}`,
            );
            continue;
          }

          if (
            job.type === "update"
            && job.phase === "rollback-complete"
            && !isTransientCriticalJobError(error)
          ) {
            this.rejectJob(job.id, new Error(job.lastError));
            job.status = "failed";
            job.operatorRetryAllowed = true;
            job.recoveryReason =
              "The update failed, but rollback completed. Review the update log before retrying.";
            this.persistQueue();
            continue;
          }

          if (job.attempts >= job.maxAttempts || !isTransientCriticalJobError(error)) {
            this.rejectJob(job.id, new Error(job.lastError));
            job.status = "failed";
            const rollbackCompleted =
              job.type === "update" && job.phase === "rollback-complete";
            job.phase = rollbackCompleted ? "rollback-complete" : "failed";
            job.operatorRetryAllowed = isTransientCriticalJobError(error);
            job.recoveryReason = isTransientCriticalJobError(error)
              ? rollbackCompleted
                ? `Retry limit reached after ${job.maxAttempts} attempts; rollback completed successfully.`
                : `Retry limit reached after ${job.maxAttempts} attempts.`
              : "This validation, security, cancellation, or missing-resource failure is not safe to retry automatically.";
            this.servers.addEvent(
              job.serverId,
              "update_failed",
              "error",
              `Job ${job.type} failed (${job.attempts}/${job.maxAttempts}): ${job.lastError}`,
            );
            this.persistQueue();
            continue;
          }

          job.status = "retrying";
          job.recoveryReason = `Transient failure; retry ${job.attempts + 1} of ${job.maxAttempts} is scheduled.`;
          this.persistQueue();
          this.servers.addEvent(
            job.serverId,
            "update_failed",
            "warning",
            `Job ${job.type} will retry (${job.attempts}/${job.maxAttempts})`,
          );
          await delay(JOB_RETRY_DELAY_MS);
          if (job.status === "retrying") {
            job.status = "pending";
            job.phase = this.resumePhaseForRetry(job);
            job.updatedAt = new Date().toISOString();
            this.persistQueue();
          }
        }
      }
    } finally {
      this.processingQueue = false;
    }
  }

  private async runSteamUpdate(
    installDir: string,
    operation: "install-files" | "update" | "verify-files",
    serverId: string,
  ): Promise<CommandResult> {
    this.assertNotCancelled();
    const steamcmdExe = await this.resolveSteamCmdExecutable();
    const steamCmdHome = resolveSteamCmdHome(steamcmdExe);
    const depotCacheDir = resolveDepotCacheDir(steamCmdHome);
    const contentCacheDir = resolveAsaContentCacheDir(steamCmdHome);

    await mkdir(contentCacheDir, { recursive: true });
    await mkdir(depotCacheDir, { recursive: true });

    this.appendSteamCmdConsole(
      `SteamCMD cache: depot=${depotCacheDir} | ASA content=${contentCacheDir}`,
    );

    const cacheResult = await this.ensureAsaContentCache(
      steamcmdExe,
      steamCmdHome,
      contentCacheDir,
      operation,
      serverId,
    );
    this.assertNotCancelled();
    if (cacheResult.code !== 0) {
      return cacheResult;
    }

    this.appendSteamCmdConsole(
      `Syncing ASA cache → ${installDir} (preserves ShooterGame\\Saved)`,
    );
    const syncLabel =
      operation === "verify-files"
        ? "Applying verified files to server…"
        : operation === "install-files"
          ? "Copying files to server…"
          : "Copying update to server…";
    this.beginFileSync(serverId, syncLabel);
    let syncHeartbeat: ReturnType<typeof setInterval> | null = null;
    try {
      if (canSkipAsaContentSync(contentCacheDir, installDir)) {
        this.appendSteamCmdConsole(
          "ASA cache sync skipped (install dir is the content cache)",
        );
        this.setProgress(
          100,
          operation === "verify-files" ? "Integrity OK" : "Files already in sync",
          "No copy needed",
        );
      } else {
        const syncStartedAt = Date.now();
        syncHeartbeat = setInterval(() => {
          if (this.cancelRequested) {
            return;
          }
          const elapsedSec = Math.max(1, Math.round((Date.now() - syncStartedAt) / 1000));
          this.appendSteamCmdConsole(`Still copying files… (${elapsedSec}s elapsed)`, {
            forceProgressPush: true,
          });
        }, 5_000);
        const robocopyCode = await syncAsaContentCacheToInstallDir(contentCacheDir, installDir, {
          onSpawn: (child) => {
            this.activeSyncChild = child;
          },
          isCancelled: () => this.cancelRequested,
        });
        this.activeSyncChild = null;
        this.appendSteamCmdConsole(
          `ASA cache sync completed (robocopy=${robocopyCode})`,
        );
        this.setProgress(
          100,
          operation === "verify-files" ? "Integrity OK" : "Files synced",
          operation === "verify-files" ? "Verification complete" : "Sync complete",
        );
      }
    } catch (error) {
      this.activeSyncChild = null;
      this.endFileSync();
      if (isOperationCancelledError(error) || this.cancelRequested) {
        throw isOperationCancelledError(error) ? error : new OperationCancelledError();
      }
      const message = error instanceof Error ? error.message : String(error);
      this.appendSteamCmdConsole(`Cache sync failed; installing directly on the server: ${message}`);
      return await this.invokeSteamCmdAppUpdate(
        steamcmdExe,
        steamCmdHome,
        installDir,
        operation,
        serverId,
      );
    } finally {
      if (syncHeartbeat !== null) {
        clearInterval(syncHeartbeat);
      }
    }
    this.endFileSync();

    return { code: 0, stdout: cacheResult.stdout, stderr: cacheResult.stderr };
  }

  private async ensureAsaContentCache(
    steamcmdExe: string,
    steamCmdHome: string,
    contentCacheDir: string,
    operation: "install-files" | "update" | "verify-files",
    serverId: string,
  ): Promise<CommandResult> {
    if (shouldReuseAsaContentCache(operation, contentCacheDir, this.contentCacheUpdatedAtMs)) {
      const ageSec = Math.round((Date.now() - this.contentCacheUpdatedAtMs) / 1000);
      this.appendSteamCmdConsole(
        `Reusing ASA content cache (updated ${ageSec}s ago; no re-download)`,
      );
      return { code: 0, stdout: "", stderr: "" };
    }

    this.appendSteamCmdConsole(
      operation === "verify-files"
        ? `Verifying ASA cache integrity via SteamCMD validate (depotcache at ${steamCmdHome})`
        : `Updating shared ASA cache via SteamCMD (reuses depotcache at ${steamCmdHome})`,
    );
    const result = await this.invokeSteamCmdAppUpdate(
      steamcmdExe,
      steamCmdHome,
      contentCacheDir,
      operation,
      serverId,
    );
    if (result.code === 0) {
      this.contentCacheUpdatedAtMs = Date.now();
    } else {
      this.contentCacheUpdatedAtMs = 0;
    }
    return result;
  }

  private async invokeSteamCmdAppUpdate(
    steamcmdExe: string,
    steamCmdHome: string,
    forceInstallDir: string,
    operation: "install-files" | "update" | "verify-files",
    serverId: string,
  ): Promise<CommandResult> {
    const args = buildSteamCmdAppUpdateArgs(forceInstallDir);

    this.appendSteamCmdConsole(
      `[invoke] op=${operation} server=${serverId} cwd=${steamCmdHome} cmd=${steamcmdExe} args=${args.join(" ")}`,
    );
    this.appendSteamCmdConsole(
      "Live progress: reading logs/console_log.txt + appmanifest/downloading for this install (SteamCMD stdout is often buffered).",
    );

    return await new Promise<CommandResult>((resolve, reject) => {
      const child = spawn(steamcmdExe, args, {
        cwd: steamCmdHome,
        windowsHide: true,
        shell: false,
        env: steamCmdSpawnEnv(),
      });
      this.beginSteamCmdProcess(child, operation, serverId);
      this.startDiskProgressMonitor(steamCmdHome, forceInstallDir);

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        const text = String(chunk);
        stdout += text;
        this.captureSteamCmdOutput(text, "update/stdout");
      });
      child.stderr.on("data", (chunk) => {
        const text = String(chunk);
        stderr += text;
        this.captureSteamCmdOutput(text, "update/stderr");
      });

      child.once("error", (error) => {
        this.stopDiskProgressMonitor();
        this.endSteamCmdProcess(child);
        reject(
          new Error(
            `Could not run SteamCMD (${steamcmdExe}). Install or configure it. Detail: ${error.message}`,
          ),
        );
      });

      child.once("exit", (code) => {
        this.stopDiskProgressMonitor();
        this.endSteamCmdProcess(child);
        if (this.cancelRequested) {
          reject(new OperationCancelledError());
          return;
        }
        resolve({
          code: code ?? 1,
          stdout,
          stderr,
        });
      });
    });
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

    this.appendSteamCmdConsole(`Following live log: ${logPath}`);

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
    if (installDir === null || steamCmdHome === null || this.diskProgressInFlight || this.cancelRequested) {
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
        this.lastOfficialProgressAtMs > 0
        && Date.now() - this.lastOfficialProgressAtMs < 5_000
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
      if (this.diskProgressForceInstallDir !== installDir || this.cancelRequested) {
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
        this.steamCmdConsoleLines.push(
          `[${new Date().toISOString()}] [estimated/downloading] ${estimate.percent.toFixed(1)}% — ${formatSteamCmdByteProgress(estimate.downloaded, estimate.total)}`,
        );
        if (this.steamCmdConsoleLines.length > MAX_STEAMCMD_LINES) {
          this.steamCmdConsoleLines.splice(
            0,
            this.steamCmdConsoleLines.length - MAX_STEAMCMD_LINES,
          );
        }
        this.steamCmdConsoleUpdatedAt = new Date().toISOString();
        this.emitProgress(true);
      }
    } finally {
      this.diskProgressInFlight = false;
    }
  }

  private assertNotCancelled(): void {
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

  /**
   * Status/cache path for polls — memory + settings/env only.
   * Never probes disk (no `existsSync`) so UNC/AV stalls cannot block main (#145).
   */
  private findSteamCmdExecutableCached(): string | null {
    if (
      this.lastKnownSteamCmdPath != null
      && this.lastKnownSteamCmdPath.trim().length > 0
    ) {
      return this.lastKnownSteamCmdPath;
    }
    const configured = this.settings.get("steamcmdPath");
    if (configured != null && configured.trim().length > 0) {
      this.lastKnownSteamCmdPath = configured.trim();
      return this.lastKnownSteamCmdPath;
    }
    const envPath = process.env["STEAMCMD_PATH"];
    if (envPath != null && envPath.trim().length > 0) {
      return envPath.trim();
    }
    return null;
  }

  private steamCmdCandidatePaths(): Array<string | null | undefined> {
    const configured = this.settings.get("steamcmdPath");
    const envPath = process.env["STEAMCMD_PATH"];
    const programFilesX86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
    const programFiles = process.env["ProgramFiles"] ?? "C:\\Program Files";
    const localAppData = process.env["LOCALAPPDATA"];

    return [
      configured,
      envPath,
      join(this.steamcmdDir, "steamcmd.exe"),
      "C:\\steamcmd\\steamcmd.exe",
      "D:\\steamcmd\\steamcmd.exe",
      join(programFilesX86, "SteamCMD", "steamcmd.exe"),
      join(programFiles, "SteamCMD", "steamcmd.exe"),
      join(programFilesX86, "Steam", "steamcmd.exe"),
      localAppData !== undefined
        ? join(localAppData, "Programs", "steamcmd", "steamcmd.exe")
        : null,
    ];
  }

  private async findSteamCmdExecutable(): Promise<string | null> {
    for (const candidate of this.steamCmdCandidatePaths()) {
      if (candidate == null || candidate.trim().length === 0) {
        continue;
      }
      try {
        await access(candidate);
        this.lastKnownSteamCmdPath = candidate;
        return candidate;
      } catch {
        // try next candidate
      }
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
        if ((code ?? 1) === 0 || sawOutput) {
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

  private appendSteamCmdConsole(line: string, options?: { forceProgressPush?: boolean }): void {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      return;
    }
    this.steamCmdConsoleLines.push(`[${new Date().toISOString()}] ${trimmed}`);
    if (this.steamCmdConsoleLines.length > MAX_STEAMCMD_LINES) {
      this.steamCmdConsoleLines.splice(0, this.steamCmdConsoleLines.length - MAX_STEAMCMD_LINES);
    }
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
    const combined = previous + String(chunk);
    const parts = combined.split(/\r\n|\n|\r/);
    const remainder = parts.pop() ?? "";
    this.steamCmdOutputBuffers.set(source, remainder);

    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.length === 0) {
        continue;
      }
      this.handleSteamCmdOutputLine(trimmed, source);
    }
  }

  private handleSteamCmdOutputLine(line: string, source: string): void {
    // Strip source prefixes and console_log.txt timestamps
    const bare = line
      .replace(/^\[(?:(?:update|verify)\/(?:stdout|stderr)|console_log)\]\s*/i, "")
      .replace(/^\[\d{4}-\d{2}-\d{2}[^\]]*\]\s*/, "")
      .trim();
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

      const percentChanged =
        previousPercent === null
        || parsed.percent === null
        || Math.abs(parsed.percent - previousPercent) >= 0.05;
      this.emitProgress(percentChanged);

      const shouldLogToConsole =
        this.lastProgressConsoleLoggedPercent === null
        || parsed.percent === null
        || Math.abs(parsed.percent - this.lastProgressConsoleLoggedPercent) >= PROGRESS_CONSOLE_LOG_MIN_DELTA
        || now - this.lastProgressConsoleLogAtMs >= PROGRESS_CONSOLE_LOG_MIN_MS;

      if (shouldLogToConsole) {
        this.lastProgressConsoleLogAtMs = now;
        this.lastProgressConsoleLoggedPercent = parsed.percent;
        this.steamCmdConsoleLines.push(`[${new Date().toISOString()}] [${source}] ${bare}`);
        if (this.steamCmdConsoleLines.length > MAX_STEAMCMD_LINES) {
          this.steamCmdConsoleLines.splice(0, this.steamCmdConsoleLines.length - MAX_STEAMCMD_LINES);
        }
        this.steamCmdConsoleUpdatedAt = new Date().toISOString();
        this.emitProgress(true);
      }
      return;
    }

    this.appendSteamCmdConsole(`[${source}] ${line}`, { forceProgressPush: true });
  }

  private ingestProgressFromLine(line: string): boolean {
    const bare = line.replace(/^\[(?:update|verify)\/(?:stdout|stderr)\]\s*/i, "");
    const parsed = parseSteamCmdProgressLine(bare);
    let percentChanged = false;
    if (parsed.percent !== null) {
      percentChanged =
        this.progressPercent === null
        || Math.abs(parsed.percent - this.progressPercent) >= 0.05;
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

  private setProgress(percent: number | null, label: string | null, line?: string): void {
    if (percent !== null) {
      this.progressPercent = percent;
    }
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
    this.steamCmdOutputBuffers.clear();
    this.lastProgressConsoleLogAtMs = 0;
    this.lastProgressConsoleLoggedPercent = null;
    if (operation === "install-files") {
      this.setProgress(0, "Downloading server files…", "Starting SteamCMD");
    } else if (operation === "update") {
      this.setProgress(0, "Updating server files…", "Starting SteamCMD");
    } else if (operation === "verify-files") {
      this.setProgress(0, "Verifying integrity…", "Starting SteamCMD validate");
    } else {
      this.setProgress(null, "Installing SteamCMD…", "Starting SteamCMD installation");
    }
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
        if (
          typeof job.id !== "string"
          || (job.type !== "install-files" && job.type !== "update" && job.type !== "verify-files")
          || typeof job.serverId !== "string"
        ) {
          invalidEntryFound = true;
          continue;
        }
        if (
          typeof job.status === "string"
          && !KNOWN_CRITICAL_JOB_STATUSES.has(job.status)
        ) {
          invalidEntryFound = true;
          continue;
        }
        if (
          typeof job.phase === "string"
          && !KNOWN_CRITICAL_JOB_PHASES.has(job.phase)
        ) {
          invalidEntryFound = true;
          continue;
        }
        const type = job.type;
        const phase = typeof job.phase === "string" ? job.phase : "queued";
        const wasInterrupted = job.status === "running";
        const context = this.sanitizeCriticalJobContext(job.context);

        // A persisted post-side-effect checkpoint is durable evidence that
        // SteamCMD completed. If the requested runtime state is already present,
        // the queue row itself is stale and can be reconciled as completed.
        if (
          wasInterrupted
          && (phase === "files-applied" || phase === "restarting-server")
          && context.wasRunning === true
          && this.processes.isActive(job.serverId)
        ) {
          continue;
        }
        if (
          wasInterrupted
          && phase === "files-applied"
          && context.wasRunning !== true
        ) {
          continue;
        }

        const interruptedIsAmbiguous =
          (type === "update" && phase !== "validating" && phase !== "validated"
            && phase !== "files-applied")
          || ((type === "verify-files" || type === "install-files")
            && (phase === "stopping-server" || phase === "restarting-server"));
        const migrated = migrateCriticalJob<CriticalJob>(job, {
          type,
          serverId: job.serverId,
          defaultPhase: "queued",
          interruptedIsAmbiguous,
          serverExists: this.servers.get(job.serverId) !== null,
        });
        migrated.context = context;
        if (wasInterrupted && phase === "files-applied") {
          migrated.status = "pending";
          migrated.operatorRetryAllowed = false;
          migrated.recoveryReason =
            "SteamCMD completion was checkpointed before restart; resuming only the remaining runtime transition.";
        } else if (wasInterrupted && phase === "rollback-complete") {
          migrated.status = "failed";
          migrated.operatorRetryAllowed = true;
          migrated.recoveryReason =
            "The update failed and its rollback was checkpointed as complete. Review the update log before retrying.";
        }
        const duplicateIndex = jobs.findIndex(
          (candidate) => candidate.idempotencyKey === migrated.idempotencyKey,
        );
        if (duplicateIndex >= 0) {
          const merged = this.mergeCriticalJobs(jobs[duplicateIndex]!, migrated);
          if (this.servers.get(job.serverId) !== null) {
            merged.status = "blocked";
            merged.operatorRetryAllowed = true;
            merged.recoveryReason =
              "Duplicate durable job records were recovered. Review the preserved phase before retrying.";
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

  private resumePhaseForRetry(job: CriticalJob): string {
    if (job.phase === "restarting-server") return job.phase;
    if (
      job.type === "update"
      && job.phase.startsWith("rollback-")
      && job.phase !== "rollback-complete"
    ) {
      return job.phase;
    }
    if (
      job.type === "update"
      && (job.context.preUpdateBackupIds?.length ?? 0) > 0
    ) {
      return "pre-update-backup-complete";
    }
    return "queued";
  }

  private sanitizeCriticalJobContext(raw: unknown): CriticalJob["context"] {
    if (typeof raw !== "object" || raw === null) {
      return {};
    }
    const input = raw as Record<string, unknown>;
    const context: CriticalJob["context"] = {};
    if (typeof input.wasRunning === "boolean") {
      context.wasRunning = input.wasRunning;
    }
    if (Array.isArray(input.preUpdateBackupIds)) {
      context.preUpdateBackupIds = [
        ...new Set(
          input.preUpdateBackupIds
            .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
            .map((value) => value.trim()),
        ),
      ];
    }
    if (Array.isArray(input.rollbackRestoredBackupIds)) {
      context.rollbackRestoredBackupIds = [
        ...new Set(
          input.rollbackRestoredBackupIds
            .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
            .map((value) => value.trim()),
        ),
      ];
    }
    if (typeof input.appliedBuildId === "string" || input.appliedBuildId === null) {
      context.appliedBuildId = input.appliedBuildId;
    }
    if (typeof input.updateLogPath === "string" && input.updateLogPath.trim().length > 0) {
      context.updateLogPath = input.updateLogPath.trim();
    }
    if (typeof input.steamCmdExitCode === "number" && Number.isFinite(input.steamCmdExitCode)) {
      context.steamCmdExitCode = Math.floor(input.steamCmdExitCode);
    }
    return context;
  }

  private mergeCriticalJobs(existing: CriticalJob, incoming: CriticalJob): CriticalJob {
    const phaseOrder = [
      "failed",
      "cancelled",
      "queued",
      "validating",
      "validated",
      "rollback-complete",
      "stopping-server",
      "creating-pre-update-backup",
      "pre-update-backup-complete",
      "applying-files",
      "files-applied",
      "restarting-server",
      "rollback-stopping-server",
      "rollback-restoring-backups",
      "rollback-restarting-server",
    ];
    const phaseRank = (phase: string): number => {
      const index = phaseOrder.indexOf(phase);
      return index >= 0 ? index : -1;
    };
    const incomingPhaseRank = phaseRank(incoming.phase);
    const existingPhaseRank = phaseRank(existing.phase);
    const preferIncoming =
      incomingPhaseRank > existingPhaseRank
      || (
        incomingPhaseRank === existingPhaseRank
        && (
          incoming.attempts > existing.attempts
          || (
            incoming.attempts === existing.attempts
            && incoming.updatedAt > existing.updatedAt
          )
        )
      );
    const preferred = preferIncoming ? incoming : existing;
    const secondary = preferIncoming ? existing : incoming;
    return {
      ...preferred,
      attempts: Math.max(existing.attempts, incoming.attempts),
      maxAttempts: Math.max(existing.maxAttempts, incoming.maxAttempts),
      operatorRetryAllowed: existing.operatorRetryAllowed || incoming.operatorRetryAllowed,
      context: {
        wasRunning:
          preferred.context.wasRunning
          ?? secondary.context.wasRunning,
        preUpdateBackupIds: [
          ...new Set([
            ...(preferred.context.preUpdateBackupIds ?? []),
            ...(secondary.context.preUpdateBackupIds ?? []),
          ]),
        ],
        rollbackRestoredBackupIds: [
          ...new Set([
            ...(preferred.context.rollbackRestoredBackupIds ?? []),
            ...(secondary.context.rollbackRestoredBackupIds ?? []),
          ]),
        ],
        appliedBuildId:
          preferred.context.appliedBuildId
          ?? secondary.context.appliedBuildId
          ?? null,
        updateLogPath:
          preferred.context.updateLogPath
          ?? secondary.context.updateLogPath,
        steamCmdExitCode:
          preferred.context.steamCmdExitCode
          ?? secondary.context.steamCmdExitCode,
      },
    };
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

    this.servers.addEvent(
      job.serverId,
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
    if (backupIds.length === 0 || backups.length !== backupIds.length) {
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
