import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { cp, copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import {
  backupFinishedAt,
  formatPlayerSessionNotes,
  playersRetentionKey,
} from "@shared/backup-player-meta";
import { formatBackupFileStamp } from "@shared/backup-file-stamp";
import type {
  BackupCleanupOptions,
  BackupCleanupPreview,
  BackupCleanupResult,
  BackupDiskAlertSettings,
  BackupFleetAlert,
  BackupFleetSummary,
  BackupHealthStatus,
  BackupKind,
  BackupPolicy,
  BackupRecord,
  BackupServerHealth,
  BackupType,
  RestoreBackupOptions,
  ServerProfile,
} from "@shared/types";
import type { ServerRepository } from "../../infra/db/server-repository";
import { MIN_INTERVAL_MINUTES } from "../../infra/db/backup-repository";
import type { BackupRepository } from "../../infra/db/backup-repository";
import type { ProcessManager } from "../../infra/process/process-manager";
import type { AppSettingsRepository } from "../../infra/db/app-settings-repository";
import {
  isTransientCriticalJobError,
  makeIdempotencyKey,
  migrateCriticalJob,
  toCriticalJobSummary,
  type DurableCriticalJob,
} from "../../orchestration/critical-job-recovery";
import type { CriticalJobSummary } from "../../../shared/types";
import { rconExec } from "../../infra/rcon/rcon-client";
import {
  collectWorldBackupCandidates,
  copySavedArksFiles,
  isAntiCorruptionWorldSaveName,
  isPrimaryWorldSaveName,
  isWorldProfileOrTribeName,
  missingEssentialWorldRels,
  resolveWorldMapSaveDir,
  selectWorldBackupSourceFiles,
} from "./world-snapshot";
import {
  backupKindSubdir,
  extractZip,
  isReadableZipArchive,
  isZipBackupPath,
  kindFromSubdirName,
  readZipTextEntry,
  validatePortableZip,
  zipDirectory,
  zipHasBackupLayout,
} from "./backup-archive";
import {
  ensureParentDir,
  isBackupDestinationReachable,
  readVolumeSpace,
  sameFsPath,
  volumeRootForPath,
} from "./backup-disk";
import { classifyInstallHealthAsync } from "../instances/server-installation";
import { serverBinaryPath } from "../instances/launch-args";
import {
  isOperationCancelledError,
  OperationCancelledError,
} from "../updates/robocopy-tree";

export {
  backupFinishedAt,
  formatPlayerSessionNotes,
  playersRetentionKey,
} from "@shared/backup-player-meta";
export { backupKindSubdir } from "./backup-archive";

export interface BackupChangedPush {
  serverId: string;
}

/** Pure fleet health badge for one server (used by getFleetSummary). */
export function computeBackupServerHealth(input: {
  destinationOk: boolean;
  stale: boolean;
  /** All failed backups in the last 24h (any kind) — warning floor when not critical. */
  failed24h: number;
  /** Failed *world* backups in the last 24h — drives critical (world = protection). */
  failedWorld24h: number;
  scheduleEnabled: boolean;
  hasWorldBackup: boolean;
  /** Scheduled world backups only run while the process is active. */
  serverRunning: boolean;
}): BackupHealthStatus {
  if (!input.destinationOk || input.failedWorld24h > 0) return "critical";
  // INI / player failures are noisy vs world protection — warn, do not mark critical.
  if (input.failed24h > 0) return "warning";
  // World schedule skips stopped servers — without a completed world archive this
  // is never "Protected" while the process is active (first cycle still pending).
  if (input.scheduleEnabled && !input.hasWorldBackup) {
    return input.serverRunning ? "warning" : "unknown";
  }
  if (input.stale) return "warning";
  if (!input.scheduleEnabled && !input.hasWorldBackup) return "unknown";
  // Keep serverRunning in the contract so callers must pass process state.
  void input.serverRunning;
  return "ok";
}

/** Newest finished (completed/failed) backup by finish time. */
export function pickLatestFinishedBackup(
  records: BackupRecord[],
): BackupRecord | null {
  let latest: BackupRecord | null = null;
  let latestStamp = "";
  for (const row of records) {
    if (row.status === "running") continue;
    const stamp = backupFinishedAt(row);
    if (latest === null || stamp > latestStamp) {
      latest = row;
      latestStamp = stamp;
    }
  }
  return latest;
}

const RCON_HOST = "127.0.0.1";
const BACKUP_CRITICAL_JOBS_KEY = "backupCriticalJobsQueue.v1";
const BACKUP_JOB_RETRY_DELAY_MS = 5000;
const INI_SAVE_BACKUP_DEBOUNCE_MS = 2_000;
const KNOWN_BACKUP_JOB_STATUSES = new Set([
  "pending",
  "running",
  "retrying",
  "blocked",
  "failed",
  "cancelled",
]);

/** Scheduled cadence creates world saves only (not players / INI). */
export const SCHEDULED_BACKUP_KINDS: readonly BackupKind[] = ["world"];

/** Kinds created for pre-update / pre-restart safety. */
export const CRITICAL_BACKUP_KINDS: readonly BackupKind[] = ["world", "players", "ini"];

const ALL_BACKUP_KINDS: readonly BackupKind[] = ["world", "players", "ini"];

const PLAYER_PROFILE_RE = /\.(arkprofile)(\.bak)?$/i;

const DISK_ALERT_SETTINGS_KEY = "backupDiskAlerts.v1";
const DEFAULT_DISK_ALERT_SETTINGS: BackupDiskAlertSettings = {
  warnUsedPercent: 85,
  criticalUsedPercent: 95,
  warnFreeBytes: 20 * 1024 * 1024 * 1024,
};
/** Dismissed fleet alerts: alertId → fingerprint that was hidden. */
const DISMISSED_FLEET_ALERTS_KEY = "backupFleetAlerts.dismissed.v1";
/** World backup is stale when older than interval × this factor. */
const STALE_INTERVAL_FACTOR = 1.5;

interface DismissedFleetAlertEntry {
  fingerprint: string;
  dismissedAt: string;
}

type BackupCriticalJobType = "pre-update-backup" | "restore";

interface BackupCriticalJobProgressHandlers {
  onKindProgress?: (kind: BackupKind, index: number, total: number) => void;
  onProgressMessage?: (message: string) => void;
}

interface BackupCriticalJob extends DurableCriticalJob {
  type: BackupCriticalJobType;
  backupId: string | null;
  context: {
    completedBackupIds?: string[];
    nextKindIndex?: number;
    restoreHistoryId?: number;
    safeguardBackupIds?: string[];
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Keep map tokens readable in filenames (`TheIsland_WP` → `TheIsland_WP`). */
function mapTokenFileSlug(mapToken: string): string {
  const trimmed = mapToken.trim();
  if (trimmed.length === 0) return "map";
  return trimmed.replace(/[^A-Za-z0-9_]+/g, "-").replace(/^-+|-+$/g, "") || "map";
}

function worldRetentionKey(backup: BackupRecord): string {
  return backup.mapToken?.trim().toLowerCase() || "__unscoped__";
}

function isPlayerProfileFile(name: string): boolean {
  return PLAYER_PROFILE_RE.test(name) || name.toLowerCase().endsWith(".profilebak");
}

function normalizePlayerKey(value: string): string {
  return value.trim().toLowerCase().replace(/^eos:/i, "");
}

function retainCountForKind(policy: BackupPolicy, kind: BackupKind): number {
  if (kind === "world") return policy.retainCountWorld;
  if (kind === "players") return policy.retainCountPlayers;
  return policy.retainCountIni;
}

function assertRetainCount(label: string, value: number): void {
  if (value < 1 || value > 500) {
    throw new Error(`${label} must be between 1 and 500`);
  }
}

function normalizeKinds(kinds: BackupKind[] | undefined): BackupKind[] {
  const source = kinds === undefined || kinds.length === 0 ? [...ALL_BACKUP_KINDS] : kinds;
  const unique: BackupKind[] = [];
  for (const kind of ALL_BACKUP_KINDS) {
    if (source.includes(kind) && !unique.includes(kind)) {
      unique.push(kind);
    }
  }
  if (unique.length === 0) {
    throw new Error("At least one backup kind is required");
  }
  return unique;
}

/** Default backup root under the server install directory. */
export function defaultServerBackupDir(installDir: string): string {
  return join(installDir, "Backups");
}

export function resolveServerBackupRoot(
  installDir: string,
  backupDir: string | null | undefined,
): string {
  if (typeof backupDir === "string" && backupDir.trim().length > 0) {
    return backupDir.trim();
  }
  return defaultServerBackupDir(installDir);
}

async function directorySize(path: string): Promise<number> {
  let total = 0;
  if (!existsSync(path)) return 0;
  const entries = await readdir(path, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(path, entry.name);
    if (entry.isDirectory()) {
      total += await directorySize(full);
    } else if (entry.isFile()) {
      total += (await stat(full)).size;
    }
  }
  return total;
}

async function listFilesRecursive(root: string): Promise<string[]> {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listFilesRecursive(full)));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

async function copyFileTo(src: string, dest: string): Promise<void> {
  await mkdir(dirname(dest), { recursive: true });
  await cp(src, dest, { force: true });
}

/**
 * Local backup and restore management for ASA instances.
 * Kind-scoped ZIP archives under World / Player profiles / INI subfolders.
 */
export class BackupService extends EventEmitter {
  private queue: BackupCriticalJob[] = [];
  private processingQueue = false;
  private readonly waiters = new Map<string, Array<{
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>>();
  private readonly iniSaveTimers = new Map<string, NodeJS.Timeout>();
  private readonly iniSaveWaiters = new Map<
    string,
    Array<{ resolve: (value: BackupRecord | null) => void; reject: (error: Error) => void }>
  >();
  /** Serialize disk↔DB reconcile per server so overlapping list/refresh cannot double-import. */
  private readonly reconcileInFlight = new Map<string, Promise<number>>();
  /** Backup ids currently inside createBackup — reconcile must not promote/fail these. */
  private readonly creatingBackupIds = new Set<string>();
  private readonly backupJobs = new Map<string, Promise<void>>();
  private readonly preStopBackupServers = new Set<string>();
  /** Serialize interrupted-row recovery shared by scheduler and disk reconciliation. */
  private readonly interruptedReconcileInFlight = new Map<
    string,
    Promise<number>
  >();
  /** Prevent stacked scheduled world backups for the same server. */
  private readonly scheduledWorldInFlight = new Set<string>();
  /** Prevent overlapping runScheduledCycle walks. */
  private scheduledCycleInFlight = false;
  /** Set by SteamCMD Cancel (and similar) so long backup/restore zips can abort between steps. */
  private cancelRequested = false;
  /** In-memory only — progress callbacks must not be persisted with the durable queue. */
  private readonly jobProgressHandlers = new Map<string, BackupCriticalJobProgressHandlers>();

  constructor(
    private readonly servers: ServerRepository,
    private readonly backups: BackupRepository,
    private readonly processes: ProcessManager,
    private readonly settings: AppSettingsRepository,
    _legacyRootBackupDir?: string,
  ) {
    super();
    this.queue = this.loadQueue();
    if (this.queue.some((job) => job.status === "pending" || job.status === "retrying")) {
      setTimeout(() => {
        void this.processQueue();
      }, 250);
    }
  }

  hasServerWork(serverId: string): boolean {
    if (this.backupJobs.has(serverId)) return true;
    if (this.iniSaveTimers.has(serverId)) return true;
    if (this.iniSaveWaiters.has(serverId)) return true;
    if (this.preStopBackupServers.has(serverId)) return true;
    if (this.scheduledWorldInFlight.has(serverId)) return true;
    if (this.creatingBackupIds.has(serverId)) return true;
    if (this.interruptedReconcileInFlight.has(serverId)) return true;
    if (this.reconcileInFlight.has(serverId)) return true;
    if (this.waiters.has(serverId)) return true;
    return this.queue.some(
      (job) =>
        job.serverId === serverId &&
        (job.status === "pending" ||
          job.status === "running" ||
          job.status === "retrying" ||
          job.status === "blocked"),
    );
  }

  private emitChanged(serverId: string): void {
    this.emit("changed", { serverId } satisfies BackupChangedPush);
  }

  async createManualBackup(
    serverId: string,
    kinds?: BackupKind[],
  ): Promise<BackupRecord[]> {
    return this.createBackups(serverId, "manual", null, normalizeKinds(kinds));
  }

  /**
   * Debounced INI snapshot after a successful user save (editor / wizard).
   * Not on the world schedule.
   */
  async createIniSaveBackup(serverId: string): Promise<BackupRecord | null> {
    this.mustServer(serverId);
    return await new Promise<BackupRecord | null>((resolve, reject) => {
      const waiters = this.iniSaveWaiters.get(serverId) ?? [];
      waiters.push({ resolve, reject });
      this.iniSaveWaiters.set(serverId, waiters);

      const existing = this.iniSaveTimers.get(serverId);
      if (existing !== undefined) {
        clearTimeout(existing);
      }
      const timer = setTimeout(() => {
        this.iniSaveTimers.delete(serverId);
        const pending = this.iniSaveWaiters.get(serverId) ?? [];
        this.iniSaveWaiters.delete(serverId);
        void this.createSingleBackup(
          serverId,
          "ini_save",
          "ini",
          "Automatic INI backup after save",
        )
          .then((record) => {
            for (const waiter of pending) waiter.resolve(record);
          })
          .catch((error: unknown) => {
            const err = error instanceof Error ? error : new Error(String(error));
            for (const waiter of pending) waiter.reject(err);
          });
      }, INI_SAVE_BACKUP_DEBOUNCE_MS);
      timer.unref?.();
      this.iniSaveTimers.set(serverId, timer);
    });
  }

  /**
   * Per-player profile archive on connect/disconnect.
   * Copies matching `.arkprofile*` files for `playerKey` only.
   * Disconnect waits briefly for ASA to flush the profile to disk.
   */
  async createPlayerSessionBackup(
    serverId: string,
    event: "connect" | "disconnect",
    playerKey: string,
    playerName: string | null = null,
  ): Promise<BackupRecord | null> {
    const key = normalizePlayerKey(playerKey);
    if (key.length === 0) {
      throw new Error("playerKey is required");
    }
    const notes = formatPlayerSessionNotes(event, key, playerName);
    const type = event === "connect" ? "player_connect" : "player_disconnect";
    // Same hot-path flush as createBackups — profiles may only exist in memory until SaveWorld.
    await this.flushWorldIfActive(serverId);
    return this.createSingleBackup(serverId, type, "players", notes, {
      playerKey: key,
      waitForProfile: event === "disconnect",
    });
  }

  async createPreRestartBackup(
    serverId: string,
    options?: {
      skipFlush?: boolean;
      onKindProgress?: (kind: BackupKind, index: number, total: number) => void;
    },
  ): Promise<BackupRecord[]> {
    return this.createBackups(
      serverId,
      "pre_restart",
      "Pre-restart backup",
      [...CRITICAL_BACKUP_KINDS],
      options,
    );
  }

  /**
   * Full snapshot for a user-initiated stop. Caller should have completed
   * SaveWorld and stopped the process before skipping the internal flush.
   */
  async createPreStopBackup(
    serverId: string,
    options?: {
      skipFlush?: boolean;
      onKindProgress?: (kind: BackupKind, index: number, total: number) => void;
    },
  ): Promise<BackupRecord[]> {
    this.preStopBackupServers.add(serverId);
    try {
      return await this.createBackups(
        serverId,
        "pre_stop",
        "Pre-stop backup",
        [...CRITICAL_BACKUP_KINDS],
        options,
      );
    } finally {
      this.preStopBackupServers.delete(serverId);
    }
  }

  async createScheduledBackup(serverId: string): Promise<BackupRecord[]> {
    if (this.preStopBackupServers.has(serverId)) return [];
    return this.createBackups(
      serverId,
      "scheduled",
      "Scheduled backup",
      [...SCHEDULED_BACKUP_KINDS],
    );
  }

  async createPreUpdateBackupForJob(
    serverId: string,
    options?: BackupCriticalJobProgressHandlers,
  ): Promise<BackupRecord[]> {
    return this.enqueueAndWait<BackupRecord[]>("pre-update-backup", serverId, null, {
      progress: options,
    });
  }

  async restoreBackupForJob(
    serverId: string,
    backupId: string,
    options?: BackupCriticalJobProgressHandlers,
  ): Promise<void> {
    await this.enqueueAndWait<void>("restore", serverId, backupId, {
      progress: options,
    });
  }

  /**
   * Abort pending backup critical jobs and signal running pre-apply work to stop
   * between kinds / packaging steps (does not interrupt `applying-restore`).
   */
  requestCancel(): boolean {
    const actionable = this.queue.filter(
      (job) =>
        job.status === "pending"
        || job.status === "retrying"
        || (
          job.status === "running"
          && job.phase !== "applying-restore"
        ),
    );
    if (actionable.length === 0 && !this.cancelRequested) {
      return false;
    }

    this.cancelRequested = true;
    for (const job of actionable) {
      if (job.status === "pending" || job.status === "retrying") {
        job.status = "cancelled";
        job.phase = "cancelled";
        job.recoveryReason = "Cancelled by the operator before execution.";
        job.updatedAt = new Date().toISOString();
        this.rejectJob(job.id, new OperationCancelledError());
        this.jobProgressHandlers.delete(job.id);
        continue;
      }
      job.recoveryReason = "Cancellation requested; stopping before restore apply.";
      job.updatedAt = new Date().toISOString();
    }
    this.persistQueue();
    return true;
  }

  async restoreBackupForRollbackRecovery(
    serverId: string,
    backupId: string,
  ): Promise<void> {
    await this.enqueueAndWait<void>("restore", serverId, backupId, {
      adoptRetryableRestore: true,
    });
  }

  getCriticalJobs(): CriticalJobSummary[] {
    return this.queue.map((job) =>
      toCriticalJobSummary(job, this.servers.get(job.serverId)?.name ?? null));
  }

  getCompletedBackupsForCriticalJob(
    serverId: string,
    backupIds: readonly string[],
  ): BackupRecord[] {
    const orderedUniqueIds = [...new Set(backupIds.filter((id) => id.trim().length > 0))];
    const byKind = new Map<BackupKind, BackupRecord>();
    for (const backupId of orderedUniqueIds) {
      const backup = this.backups.getBackup(backupId);
      if (
        backup === null
        || backup.serverId !== serverId
        || backup.status !== "completed"
        || backup.type !== "pre_update"
        || !existsSync(backup.path)
      ) {
        continue;
      }
      if (byKind.has(backup.kind)) continue;
      byKind.set(backup.kind, backup);
    }
    return CRITICAL_BACKUP_KINDS
      .map((kind) => byKind.get(kind))
      .filter((backup): backup is BackupRecord => backup !== undefined);
  }

  retryCriticalJob(jobId: string): boolean {
    const job = this.queue.find((candidate) => candidate.id === jobId);
    if (
      job === undefined
      || (job.status !== "blocked" && job.status !== "failed")
      || !job.operatorRetryAllowed
    ) {
      return false;
    }
    this.prepareCriticalJobRetry(
      job,
      "Retry requested by the operator after reviewing recovery state.",
    );
    void this.processQueue();
    return true;
  }

  dismissCriticalJob(jobId: string): boolean {
    const job = this.queue.find((candidate) => candidate.id === jobId);
    if (
      job === undefined
      || (job.status !== "blocked" && job.status !== "failed" && job.status !== "cancelled")
    ) {
      return false;
    }
    this.removeJob(jobId);
    this.persistQueue();
    return true;
  }

  cancelCriticalJob(jobId: string): boolean {
    const job = this.queue.find((candidate) => candidate.id === jobId);
    if (job === undefined || (job.status !== "pending" && job.status !== "retrying")) {
      return false;
    }
    job.status = "cancelled";
    job.phase = "cancelled";
    job.recoveryReason = "Cancelled by the operator before execution.";
    job.updatedAt = new Date().toISOString();
    this.rejectJob(job.id, new Error("Operation cancelled"));
    this.persistQueue();
    return true;
  }

  async list(serverId: string, limit: number): Promise<BackupRecord[]> {
    this.mustServer(serverId);
    await this.reconcileDiskBackups(serverId);
    return this.backups.listBackups(serverId, Math.max(1, Math.min(limit, 200)));
  }

  /** Force re-scan of disk archives into the DB, then return the list. */
  async refreshList(serverId: string, limit = 100): Promise<BackupRecord[]> {
    return this.list(serverId, limit);
  }

  getPolicy(serverId: string): BackupPolicy {
    this.mustServer(serverId);
    return this.backups.getPolicy(serverId);
  }

  setPolicy(
    serverId: string,
    policy: Omit<BackupPolicy, "serverId" | "updatedAt">,
  ): BackupPolicy {
    this.mustServer(serverId);
    if (policy.intervalMinutes < MIN_INTERVAL_MINUTES) {
      throw new Error(`Minimum backup interval is ${MIN_INTERVAL_MINUTES} minutes`);
    }
    if (policy.intervalMinutes > 10_080) {
      throw new Error("Backup interval must be at most 10080 minutes (7 days)");
    }
    assertRetainCount("retainCountWorld", policy.retainCountWorld);
    assertRetainCount("retainCountPlayers", policy.retainCountPlayers);
    assertRetainCount("retainCountIni", policy.retainCountIni);
    const backupDir =
      policy.backupDir !== null && policy.backupDir.trim().length > 0
        ? policy.backupDir.trim()
        : null;
    return this.backups.setPolicy({
      serverId,
      enabled: policy.enabled,
      intervalMinutes: policy.intervalMinutes,
      retainCountWorld: policy.retainCountWorld,
      retainCountPlayers: policy.retainCountPlayers,
      retainCountIni: policy.retainCountIni,
      backupDir,
    });
  }

  /** Effective folder for new backups (custom policy dir or `{installDir}\\Backups`). */
  resolveBackupRootDir(serverId: string): string {
    const server = this.mustServer(serverId);
    const policy = this.backups.getPolicy(serverId);
    return resolveServerBackupRoot(server.installDir, policy.backupDir);
  }

  resolveBackupPath(serverId: string, backupId: string): string {
    const backup = this.backups.getBackup(backupId);
    if (backup === null || backup.serverId !== serverId) {
      throw new Error("Backup not found");
    }
    // For ZIP archives, open the parent kind folder so Explorer stays usable.
    if (isZipBackupPath(backup.path)) {
      return dirname(backup.path);
    }
    return backup.path;
  }

  getDiskAlertSettings(): BackupDiskAlertSettings {
    return this.readDiskAlertSettings();
  }

  setDiskAlertSettings(settings: BackupDiskAlertSettings): BackupDiskAlertSettings {
    const next = this.normalizeDiskAlertSettings(settings);
    this.settings.set(DISK_ALERT_SETTINGS_KEY, JSON.stringify(next));
    return next;
  }

  /**
   * Hide a fleet alert until its fingerprint changes (new failure, recovered then
   * re-failed, disk usage moved, etc.).
   */
  dismissFleetAlert(alertId: string, fingerprint: string): void {
    const id = alertId.trim();
    const fp = fingerprint.trim();
    if (id.length === 0 || fp.length === 0) {
      throw new Error("Alert id and fingerprint are required");
    }
    const map = this.readDismissedFleetAlerts();
    map[id] = { fingerprint: fp, dismissedAt: new Date().toISOString() };
    this.writeDismissedFleetAlerts(map);
  }

  /** Fleet health overview: per-server status, disk usage, and actionable alerts. */
  async getFleetSummary(): Promise<BackupFleetSummary> {
    const servers = this.servers.list();
    const diskSettings = this.readDiskAlertSettings();
    const now = Date.now();
    const dayAgoIso = new Date(now - 24 * 60 * 60 * 1000).toISOString();

    const healthRows: BackupServerHealth[] = [];
    const alerts: BackupFleetAlert[] = [];

    for (const server of servers) {
      await this.reconcileDiskBackups(server.id);
      const policy = this.backups.getPolicy(server.id);
      const resolvedRoot = resolveServerBackupRoot(server.installDir, policy.backupDir);
      const records = this.backups.listBackups(server.id, 10_000);
      const completed = records.filter((row) => row.status === "completed");
      const failed24h = records.filter((row) => {
        if (row.status !== "failed") return false;
        return backupFinishedAt(row) >= dayAgoIso;
      });
      const failedWorld24h = failed24h.filter((row) => row.kind === "world");
      const latestWorld = this.backups.latestCompleted(server.id, "world");
      // Newest finished attempt by completedAt (not job start).
      const latest = pickLatestFinishedBackup(records);
      const usedBytes = completed.reduce((sum, row) => sum + Math.max(0, row.sizeBytes), 0);
      const destinationOk = isBackupDestinationReachable(resolvedRoot);

      // Scheduled world backups only run while the process is active — do not
      // treat stopped servers as stale just because the interval elapsed.
      let stale = false;
      if (policy.enabled && this.processes.isActive(server.id)) {
        if (latestWorld === null) {
          stale = true;
        } else {
          const stamp = backupFinishedAt(latestWorld);
          const ageMs = now - new Date(stamp).getTime();
          stale =
            Number.isFinite(ageMs) &&
            ageMs > policy.intervalMinutes * 60_000 * STALE_INTERVAL_FACTOR;
        }
      }

      const counts = {
        world: completed.filter((row) => row.kind === "world").length,
        players: completed.filter((row) => row.kind === "players").length,
        ini: completed.filter((row) => row.kind === "ini").length,
        failed24h: failed24h.length,
      };

      const health = this.computeServerHealth({
        destinationOk,
        stale,
        failed24h: counts.failed24h,
        failedWorld24h: failedWorld24h.length,
        scheduleEnabled: policy.enabled,
        hasWorldBackup: latestWorld !== null,
        serverRunning: this.processes.isActive(server.id),
      });

      healthRows.push({
        serverId: server.id,
        serverName: server.name,
        policy,
        resolvedRoot,
        health,
        latest,
        latestWorld,
        counts,
        usedBytes,
        stale,
        destinationOk,
      });

      if (!destinationOk) {
        alerts.push({
          id: `missing_destination:${server.id}`,
          kind: "missing_destination",
          severity: "error",
          serverId: server.id,
          volumePath: null,
          fingerprint: resolvedRoot,
          message: `${server.name}: backup destination is missing or unreachable (${resolvedRoot})`,
        });
      }
      if (policy.enabled && latestWorld === null && this.processes.isActive(server.id)) {
        alerts.push({
          id: `never_backed_up:${server.id}`,
          kind: "never_backed_up",
          severity: "warning",
          serverId: server.id,
          volumePath: null,
          fingerprint: "pending",
          message: `${server.name}: world schedule is on but no completed world backup exists yet (waiting for the next scheduled cycle)`,
        });
      } else if (stale && latestWorld !== null) {
        alerts.push({
          id: `stale:${server.id}`,
          kind: "stale",
          severity: "warning",
          serverId: server.id,
          volumePath: null,
          fingerprint: `${latestWorld.id}:${backupFinishedAt(latestWorld)}`,
          message: `${server.name}: last world backup is older than the scheduled interval`,
        });
      }
      if (counts.failed24h > 0) {
        const worldOnly = failedWorld24h.length === counts.failed24h;
        // Prefer newest failed world (list is finish-time DESC); else newest failed.
        const focusBackup = failedWorld24h[0] ?? failed24h[0] ?? null;
        alerts.push({
          id: `failed:${server.id}`,
          kind: "failed",
          severity: failedWorld24h.length > 0 ? "error" : "warning",
          serverId: server.id,
          volumePath: null,
          // Include count so dismiss resurfaces when more failures arrive.
          fingerprint: `${focusBackup?.id ?? "failed"}:${counts.failed24h}`,
          backupId: focusBackup?.id ?? null,
          message: worldOnly
            ? `${server.name}: ${counts.failed24h} failed world backup${counts.failed24h === 1 ? "" : "s"} in the last 24h`
            : failedWorld24h.length > 0
              ? `${server.name}: ${counts.failed24h} failed backup${counts.failed24h === 1 ? "" : "s"} in the last 24h (${failedWorld24h.length} world)`
              : `${server.name}: ${counts.failed24h} failed non-world backup${counts.failed24h === 1 ? "" : "s"} in the last 24h`,
        });
      }
    }

    const disks = await this.buildDiskUsage(healthRows);
    for (const disk of disks) {
      if (disk.usedPercent === null || disk.freeBytes === null) continue;
      const overCritical = disk.usedPercent >= diskSettings.criticalUsedPercent;
      const overWarn = disk.usedPercent >= diskSettings.warnUsedPercent;
      const lowFree = disk.freeBytes < diskSettings.warnFreeBytes;
      // Bucket free space to GiB so tiny freelist churn does not re-open dismissals.
      const diskFingerprint = [
        `u${Math.floor(disk.usedPercent)}`,
        `f${Math.floor(disk.freeBytes / (1024 ** 3))}`,
        `w${diskSettings.warnUsedPercent}`,
        `c${diskSettings.criticalUsedPercent}`,
        `fb${diskSettings.warnFreeBytes}`,
      ].join(":");
      if (overCritical) {
        alerts.push({
          id: `disk_critical:${disk.volumePath}`,
          kind: "disk_critical",
          severity: "error",
          serverId: null,
          volumePath: disk.volumePath,
          fingerprint: diskFingerprint,
          message: `${disk.volumePath} is ${disk.usedPercent.toFixed(0)}% full (critical ≥ ${diskSettings.criticalUsedPercent}%)`,
        });
      } else if (overWarn || lowFree) {
        const parts: string[] = [];
        if (overWarn) {
          parts.push(`${disk.usedPercent.toFixed(0)}% used`);
        }
        if (lowFree) {
          parts.push(`${this.humanSize(disk.freeBytes)} free`);
        }
        alerts.push({
          id: `disk_warning:${disk.volumePath}`,
          kind: "disk_warning",
          severity: "warning",
          serverId: null,
          volumePath: disk.volumePath,
          fingerprint: diskFingerprint,
          message: `${disk.volumePath}: ${parts.join(" · ")} (warning threshold)`,
        });
      }
    }

    const protectedCount = healthRows.filter((row) => row.health === "ok").length;
    const atRiskCount = healthRows.filter(
      (row) => row.health === "warning" || row.health === "critical",
    ).length;
    const failed24h = healthRows.reduce((sum, row) => sum + row.counts.failed24h, 0);
    const totalBackupBytes = healthRows.reduce((sum, row) => sum + row.usedBytes, 0);
    const visibleAlerts = this.applyDismissedFleetAlerts(alerts);

    return {
      servers: healthRows,
      stats: {
        protectedCount,
        atRiskCount,
        failed24h,
        totalBackupBytes,
      },
      disks,
      alerts: visibleAlerts,
      diskSettings,
    };
  }

  async previewCleanup(options: BackupCleanupOptions): Promise<BackupCleanupPreview> {
    await this.reconcileServersForCleanup(options);
    const plan = this.planCleanup(options);
    const byServerMap = new Map<
      string,
      { serverId: string; serverName: string; count: number; bytes: number }
    >();
    let totalBytes = 0;
    for (const item of plan) {
      const serverId = item.backup.serverId;
      const sizeBytes = Math.max(0, item.backup.sizeBytes);
      totalBytes += sizeBytes;
      const current = byServerMap.get(serverId) ?? {
        serverId,
        serverName: item.serverName,
        count: 0,
        bytes: 0,
      };
      current.count += 1;
      current.bytes += sizeBytes;
      byServerMap.set(serverId, current);
    }
    return {
      items: plan,
      totalBytes,
      byServer: [...byServerMap.values()],
    };
  }

  async runCleanup(options: BackupCleanupOptions): Promise<BackupCleanupResult> {
    await this.reconcileServersForCleanup(options);
    const confirmedIds = options.confirmedBackupIds;
    // Always recompute rules (incl. protectNewestWorld). Confirmed ids only
    // narrow the fresh plan so preview cannot delete a newly protected world.
    let plan = this.planCleanup(options);
    if (confirmedIds !== undefined && confirmedIds !== null) {
      const allowed = new Set(
        confirmedIds.filter((id) => id.trim().length > 0),
      );
      plan = plan.filter((item) => allowed.has(item.backup.id));
    }
    let deleted = 0;
    let freedBytes = 0;
    const touched = new Set<string>();

    for (const item of plan) {
      if (item.backup.status === "running") continue;
      await rm(item.backup.path, { recursive: true, force: true });
      this.backups.deleteBackupRecord(item.backup.id);
      deleted += 1;
      freedBytes += Math.max(0, item.backup.sizeBytes);
      touched.add(item.backup.serverId);
      this.servers.addEvent(
        item.backup.serverId,
        "backup_deleted",
        "info",
        `Cleanup removed ${item.backup.kind} backup (${item.reason}): ${basename(item.backup.path)}`,
      );
    }

    for (const serverId of touched) {
      this.emitChanged(serverId);
    }

    return { deleted, freedBytes };
  }

  async deleteBackups(serverId: string, backupIds: string[]): Promise<number> {
    this.mustServer(serverId);
    const uniqueIds = [...new Set(backupIds.filter((id) => id.trim().length > 0))];
    if (uniqueIds.length === 0) {
      throw new Error("No backups selected");
    }

    let deleted = 0;
    for (const backupId of uniqueIds) {
      const backup = this.backups.getBackup(backupId);
      if (backup === null || backup.serverId !== serverId) {
        throw new Error(`Backup not found: ${backupId}`);
      }
      if (backup.status === "running") {
        throw new Error(`Cannot delete a running backup: ${backupId}`);
      }
      await rm(backup.path, { recursive: true, force: true });
      this.backups.deleteBackupRecord(backupId);
      deleted += 1;
      this.servers.addEvent(
        serverId,
        "backup_deleted",
        "info",
        `Backup deleted: ${basename(backup.path)} (${backup.kind})`,
      );
    }
    if (deleted > 0) {
      this.emitChanged(serverId);
    }
    return deleted;
  }

  /**
   * Copy a completed managed archive to `destinationPath`.
   * ZIP archives are copied as-is; legacy folders are zipped into the destination.
   * Does not mutate the managed archive or live server files.
   */
  async exportBackup(
    serverId: string,
    backupId: string,
    destinationPath: string,
  ): Promise<string> {
    this.mustServer(serverId);
    const backup = this.backups.getBackup(backupId);
    if (backup === null || backup.serverId !== serverId) {
      throw new Error("Backup not found");
    }
    if (backup.status !== "completed") {
      throw new Error("Only completed backups can be exported");
    }
    const dest = destinationPath.trim();
    if (dest.length === 0) {
      throw new Error("Export destination is required");
    }
    const destZip = isZipBackupPath(dest) ? dest : `${dest}.zip`;
    if (!existsSync(backup.path)) {
      throw new Error("Backup archive is missing on disk");
    }

    await ensureParentDir(destZip);
    try {
      if (isZipBackupPath(backup.path)) {
        await copyFile(backup.path, destZip);
      } else {
        await zipDirectory(backup.path, destZip);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Could not write export destination: ${message}`);
    }

    return destZip;
  }

  /**
   * Validate a portable YARK ZIP and copy it into the managed catalog.
   * Never restores live server files.
   */
  async importBackup(
    serverId: string,
    kind: BackupKind,
    sourcePath: string,
  ): Promise<BackupRecord> {
    const server = this.mustServer(serverId);
    const source = sourcePath.trim();
    if (source.length === 0) {
      throw new Error("Import source path is required");
    }
    if (!existsSync(source)) {
      throw new Error("Import archive not found");
    }

    await validatePortableZip(source, kind);

    const sourceResolved = resolve(source);
    const alreadyCataloged = this.backups
      .listBackupPaths(serverId)
      .some((catalogPath) => sameFsPath(catalogPath, sourceResolved));
    if (alreadyCataloged) {
      throw new Error("Archive is already in this server's backup catalog");
    }

    const policy = this.backups.getPolicy(serverId);
    const rootDir = resolveServerBackupRoot(server.installDir, policy.backupDir);
    const kindDir = join(rootDir, backupKindSubdir(kind));
    await mkdir(kindDir, { recursive: true });

    const stamp = formatBackupFileStamp();
    const preferredName = `${slug(server.name)}-${kind}-imported-${stamp}.zip`;
    const destPath = this.allocateUniqueZipPath(kindDir, preferredName);

    try {
      await copyFile(sourceResolved, destPath);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Could not copy import into backup destination: ${message}`);
    }

    let record: BackupRecord;
    try {
      const info = await stat(destPath);
      const manifestRaw = await readZipTextEntry(destPath, "manifest.json");
      const parsed = this.parseManifest(manifestRaw);
      const createdAt = parsed?.createdAt ?? info.mtime.toISOString();
      const type = parsed?.type ?? "manual";
      const id =
        parsed?.id !== undefined && this.backups.getBackup(parsed.id) !== null
          ? undefined
          : parsed?.id;
      record = this.backups.insertCompletedBackup({
        id,
        serverId,
        type,
        kind: parsed?.kind ?? kind,
        path: destPath,
        sizeBytes: info.size,
        createdAt,
        completedAt: createdAt,
        notes: parsed?.notes ?? `Imported portable archive: ${basename(sourceResolved)}`,
        mapToken: parsed?.mapToken ?? null,
      });
    } catch (err) {
      await rm(destPath, { force: true }).catch(() => undefined);
      throw err instanceof Error ? err : new Error(String(err));
    }

    this.servers.addEvent(
      serverId,
      "backup_created",
      "info",
      `Imported ${kind} backup: ${basename(destPath)}`,
    );
    this.emitChanged(serverId);
    return record;
  }

  private allocateUniqueZipPath(kindDir: string, preferredName: string): string {
    const safeName = basename(preferredName);
    const candidate = join(kindDir, safeName);
    if (!existsSync(candidate)) {
      return candidate;
    }
    const stem = safeName.replace(/\.zip$/i, "");
    for (let i = 2; i < 1000; i += 1) {
      const next = join(kindDir, `${stem}-${i}.zip`);
      if (!existsSync(next)) {
        return next;
      }
    }
    throw new Error("Could not allocate a unique import archive name");
  }

  async restoreBackup(
    serverId: string,
    backupId: string,
    options?: RestoreBackupOptions,
  ): Promise<void> {
    const server = this.mustServer(serverId);
    await this.assertInstallReadyForLiveOps(server);
    if (this.processes.isActive(serverId)) {
      throw new Error("Stop the server before restoring a backup");
    }
    const backup = this.backups.getBackup(backupId);
    if (backup === null || backup.serverId !== serverId || backup.status !== "completed") {
      throw new Error("Invalid backup for restore");
    }

    const restoreHistoryId = this.backups.insertRestoreHistory({
      serverId,
      backupId,
      status: "started",
      notes: null,
    });

    try {
      // Safeguard before replacing server data (same kind only).
      await this.createBackups(
        serverId,
        "pre_restore",
        "Safeguard before restore",
        [backup.kind],
      );
      await this.applyRestore(server, backup, options);

      this.servers.addEvent(
        serverId,
        "backup_restored",
        "info",
        `Restore applied on \"${server.name}\" from ${backup.kind} backup ${backup.id}`,
      );
      this.backups.completeRestoreHistory(restoreHistoryId, "completed", null);
      this.emitChanged(serverId);
    } catch (err) {
      this.backups.completeRestoreHistory(
        restoreHistoryId,
        "failed",
        err instanceof Error ? err.message : String(err),
      );
      throw err;
    }
  }

  /** Runs policy backups and cleans retention per server. */
  async runScheduledCycle(): Promise<void> {
    if (this.scheduledCycleInFlight) return;
    this.scheduledCycleInFlight = true;
    try {
      const allServers = this.servers.list();
      for (const server of allServers) {
        try {
          await this.runScheduledServer(server);
        } catch (err) {
          this.recordScheduledCycleError(server, err);
        }
      }
    } finally {
      this.scheduledCycleInFlight = false;
    }
  }

  private async runScheduledServer(server: ServerProfile): Promise<void> {
    const policy = this.backups.getPolicy(server.id);
    await this.applyRetention(server.id, policy);
    if (!policy.enabled) return;

    const reconciled = await this.reconcileInterruptedRunningBackups(server.id);
    if (reconciled > 0) {
      this.emitChanged(server.id);
    }

    if (
      this.scheduledWorldInFlight.has(server.id)
      || this.backups.hasRunning(server.id, "world")
    ) {
      return;
    }

    const requiredMs = policy.intervalMinutes * 60 * 1000;
    const latestWorld = this.backups.latestCompleted(server.id, "world");
    if (latestWorld !== null) {
      const finishedAt = backupFinishedAt(latestWorld);
      const elapsedMs = Date.now() - Date.parse(finishedAt);
      if (Number.isFinite(elapsedMs) && elapsedMs < requiredMs) return;
    }

    if (!this.processes.isActive(server.id)) return;
    // Wait a full interval after the process became active so a fresh start
    // does not package on the first scheduler tick.
    const startedAtRaw = this.processes.getStatus(server.id).startedAt;
    const startedAtMs =
      startedAtRaw !== null && startedAtRaw.length > 0
        ? Date.parse(startedAtRaw)
        : Number.NaN;
    if (!Number.isFinite(startedAtMs)) return;
    if (Date.now() - startedAtMs < requiredMs) return;
    if (!(await this.isInstallReady(server))) return;

    this.scheduledWorldInFlight.add(server.id);
    try {
      await this.createScheduledBackup(server.id);
    } catch (err) {
      this.servers.addEvent(
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
      this.scheduledWorldInFlight.delete(server.id);
    }
  }

  private recordScheduledCycleError(
    server: ServerProfile,
    error: unknown,
  ): void {
    const message = error instanceof Error ? error.message : String(error);
    try {
      this.servers.addEvent(
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

  private mustServer(serverId: string): ServerProfile {
    const server = this.servers.get(serverId);
    if (server === null) {
      throw new Error("Server does not exist");
    }
    return server;
  }

  /** Create/restore require a Ready ASA install (exe present). Import/export do not. */
  private async assertInstallReadyForLiveOps(server: ServerProfile): Promise<void> {
    const binaryPath = serverBinaryPath(server.installDir);
    const { health } = await classifyInstallHealthAsync(
      server.installDir,
      binaryPath,
    );
    if (health !== "ready") {
      throw new Error("Install server files before creating or restoring backups");
    }
  }

  private async isInstallReady(server: ServerProfile): Promise<boolean> {
    const binaryPath = serverBinaryPath(server.installDir);
    return (
      (await classifyInstallHealthAsync(server.installDir, binaryPath)).health
      === "ready"
    );
  }

  private readDiskAlertSettings(): BackupDiskAlertSettings {
    const raw = this.settings.get(DISK_ALERT_SETTINGS_KEY);
    if (raw === null || raw.trim().length === 0) {
      return { ...DEFAULT_DISK_ALERT_SETTINGS };
    }
    try {
      const parsed = JSON.parse(raw) as Partial<BackupDiskAlertSettings>;
      return this.normalizeDiskAlertSettings({
        warnUsedPercent:
          typeof parsed.warnUsedPercent === "number"
            ? parsed.warnUsedPercent
            : DEFAULT_DISK_ALERT_SETTINGS.warnUsedPercent,
        criticalUsedPercent:
          typeof parsed.criticalUsedPercent === "number"
            ? parsed.criticalUsedPercent
            : DEFAULT_DISK_ALERT_SETTINGS.criticalUsedPercent,
        warnFreeBytes:
          typeof parsed.warnFreeBytes === "number"
            ? parsed.warnFreeBytes
            : DEFAULT_DISK_ALERT_SETTINGS.warnFreeBytes,
      });
    } catch {
      return { ...DEFAULT_DISK_ALERT_SETTINGS };
    }
  }

  private readDismissedFleetAlerts(): Record<string, DismissedFleetAlertEntry> {
    const raw = this.settings.get(DISMISSED_FLEET_ALERTS_KEY);
    if (raw === null || raw.trim().length === 0) return {};
    try {
      const parsed = JSON.parse(raw) as Record<string, Partial<DismissedFleetAlertEntry>>;
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {};
      }
      const out: Record<string, DismissedFleetAlertEntry> = {};
      for (const [id, entry] of Object.entries(parsed)) {
        if (
          typeof id === "string" &&
          id.length > 0 &&
          entry !== null &&
          typeof entry === "object" &&
          typeof entry.fingerprint === "string" &&
          entry.fingerprint.trim().length > 0
        ) {
          out[id] = {
            fingerprint: entry.fingerprint.trim(),
            dismissedAt:
              typeof entry.dismissedAt === "string" && entry.dismissedAt.length > 0
                ? entry.dismissedAt
                : new Date(0).toISOString(),
          };
        }
      }
      return out;
    } catch {
      return {};
    }
  }

  private writeDismissedFleetAlerts(
    map: Record<string, DismissedFleetAlertEntry>,
  ): void {
    this.settings.set(DISMISSED_FLEET_ALERTS_KEY, JSON.stringify(map));
  }

  /** Drop alerts whose current fingerprint was dismissed; prune stale dismiss rows. */
  private applyDismissedFleetAlerts(alerts: BackupFleetAlert[]): BackupFleetAlert[] {
    const dismissed = this.readDismissedFleetAlerts();
    if (Object.keys(dismissed).length === 0) return alerts;

    const kept: Record<string, DismissedFleetAlertEntry> = {};
    const visible: BackupFleetAlert[] = [];
    for (const alert of alerts) {
      const entry = dismissed[alert.id];
      if (entry !== undefined && entry.fingerprint === alert.fingerprint) {
        kept[alert.id] = entry;
        continue;
      }
      visible.push(alert);
    }

    const prevKeys = Object.keys(dismissed).sort().join("\0");
    const nextKeys = Object.keys(kept).sort().join("\0");
    if (prevKeys !== nextKeys) {
      this.writeDismissedFleetAlerts(kept);
    }
    return visible;
  }

  private normalizeDiskAlertSettings(
    settings: BackupDiskAlertSettings,
  ): BackupDiskAlertSettings {
    const warnUsedPercent = Math.max(
      50,
      Math.min(99, Math.floor(settings.warnUsedPercent)),
    );
    const criticalUsedPercent = Math.max(
      warnUsedPercent + 1,
      Math.min(100, Math.floor(settings.criticalUsedPercent)),
    );
    const warnFreeBytes = Math.max(
      1024 * 1024 * 1024,
      Math.floor(settings.warnFreeBytes),
    );
    return { warnUsedPercent, criticalUsedPercent, warnFreeBytes };
  }

  private computeServerHealth(input: {
    destinationOk: boolean;
    stale: boolean;
    failed24h: number;
    failedWorld24h: number;
    scheduleEnabled: boolean;
    hasWorldBackup: boolean;
    /** Scheduled world backups only run while the process is active. */
    serverRunning: boolean;
  }): BackupHealthStatus {
    return computeBackupServerHealth(input);
  }

  private async buildDiskUsage(
    rows: BackupServerHealth[],
  ): Promise<BackupFleetSummary["disks"]> {
    const byVolume = new Map<
      string,
      { roots: Set<string>; backupBytes: number; probePath: string }
    >();

    for (const row of rows) {
      const volumePath = volumeRootForPath(row.resolvedRoot);
      const current = byVolume.get(volumePath) ?? {
        roots: new Set<string>(),
        backupBytes: 0,
        probePath: row.resolvedRoot,
      };
      current.roots.add(row.resolvedRoot);
      current.backupBytes += row.usedBytes;
      byVolume.set(volumePath, current);
    }

    const disks: BackupFleetSummary["disks"] = [];
    for (const [volumePath, info] of byVolume) {
      const space = await readVolumeSpace(info.probePath);
      const freeBytes = space?.freeBytes ?? null;
      const totalBytes = space?.totalBytes ?? null;
      let usedPercent: number | null = null;
      if (freeBytes !== null && totalBytes !== null && totalBytes > 0) {
        usedPercent = ((totalBytes - freeBytes) / totalBytes) * 100;
      }
      disks.push({
        volumePath,
        roots: [...info.roots],
        backupBytes: info.backupBytes,
        freeBytes,
        totalBytes,
        usedPercent,
      });
    }

    disks.sort((a, b) => a.volumePath.localeCompare(b.volumePath));
    return disks;
  }

  private planCleanup(
    options: BackupCleanupOptions,
  ): Array<{ backup: BackupRecord; serverName: string; reason: string }> {
    const includeFailed = options.includeFailed === true;
    const enforceRetention = options.enforceRetention === true;
    const protectNewestWorld = options.protectNewestWorld !== false;
    const olderThanDays =
      typeof options.olderThanDays === "number" && options.olderThanDays > 0
        ? Math.floor(options.olderThanDays)
        : null;
    const keepLastPerKind =
      typeof options.keepLastPerKind === "number" && options.keepLastPerKind > 0
        ? Math.floor(options.keepLastPerKind)
        : null;

    if (
      !includeFailed &&
      !enforceRetention &&
      olderThanDays === null &&
      keepLastPerKind === null
    ) {
      throw new Error("Select at least one cleanup rule");
    }

    const allServers = this.servers.list();
    const selectedIds =
      options.serverIds !== null && options.serverIds.length > 0
        ? new Set(options.serverIds)
        : null;
    const servers =
      selectedIds === null
        ? allServers
        : allServers.filter((server) => selectedIds.has(server.id));

    const cutoffIso =
      olderThanDays !== null
        ? new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString()
        : null;

    const selected = new Map<
      string,
      { backup: BackupRecord; serverName: string; reason: string }
    >();

    const mark = (
      backup: BackupRecord,
      serverName: string,
      reason: string,
    ): void => {
      if (backup.status === "running") return;
      const existing = selected.get(backup.id);
      if (existing === undefined) {
        selected.set(backup.id, { backup, serverName, reason });
        return;
      }
      if (!existing.reason.includes(reason)) {
        existing.reason = `${existing.reason}; ${reason}`;
      }
    };

    for (const server of servers) {
      const policy = this.backups.getPolicy(server.id);
      const records = this.backups.listBackups(server.id, 10_000);
      const newestWorld = this.backups.latestCompleted(server.id, "world");

      if (includeFailed) {
        for (const backup of records) {
          if (backup.status === "failed") {
            mark(backup, server.name, "failed");
          }
        }
      }

      if (enforceRetention) {
        for (const kind of ALL_BACKUP_KINDS) {
          const retain = retainCountForKind(policy, kind);
          const completed = this.backups.listCompleted(server.id, kind);
          if (kind === "players") {
            const byPlayer = new Map<string, BackupRecord[]>();
            for (const backup of completed) {
              const key = playersRetentionKey(backup);
              const list = byPlayer.get(key) ?? [];
              list.push(backup);
              byPlayer.set(key, list);
            }
            for (const [, list] of byPlayer) {
              for (const backup of list.slice(retain)) {
                mark(backup, server.name, "over retain policy");
              }
            }
            continue;
          }
          for (const backup of completed.slice(retain)) {
            mark(backup, server.name, "over retain policy");
          }
        }
      }

      if (cutoffIso !== null) {
        for (const backup of records) {
          if (backup.status !== "completed") continue;
          if (backupFinishedAt(backup) < cutoffIso) {
            mark(backup, server.name, `older than ${olderThanDays}d`);
          }
        }
      }

      if (keepLastPerKind !== null) {
        for (const kind of ALL_BACKUP_KINDS) {
          const completed = this.backups.listCompleted(server.id, kind);
          // Players: keep N per player pool (same as retention / enforceRetention).
          if (kind === "players") {
            const byPlayer = new Map<string, BackupRecord[]>();
            for (const backup of completed) {
              const key = playersRetentionKey(backup);
              const list = byPlayer.get(key) ?? [];
              list.push(backup);
              byPlayer.set(key, list);
            }
            for (const [, list] of byPlayer) {
              for (const backup of list.slice(keepLastPerKind)) {
                mark(
                  backup,
                  server.name,
                  `keep last ${keepLastPerKind}/players`,
                );
              }
            }
            continue;
          }
          for (const backup of completed.slice(keepLastPerKind)) {
            mark(backup, server.name, `keep last ${keepLastPerKind}/${kind}`);
          }
        }
      }

      if (protectNewestWorld && newestWorld !== null) {
        selected.delete(newestWorld.id);
      }
    }

    return [...selected.values()].sort((a, b) =>
      backupFinishedAt(b.backup).localeCompare(backupFinishedAt(a.backup)),
    );
  }

  /** Import orphan archives before cleanup so disk-only zips are eligible. */
  private async reconcileServersForCleanup(
    options: BackupCleanupOptions,
  ): Promise<void> {
    const allServers = this.servers.list();
    const selectedIds =
      options.serverIds !== null && options.serverIds.length > 0
        ? new Set(options.serverIds)
        : null;
    const servers =
      selectedIds === null
        ? allServers
        : allServers.filter((server) => selectedIds.has(server.id));
    for (const server of servers) {
      await this.reconcileDiskBackups(server.id);
    }
  }

  private async flushWorldIfActive(serverId: string): Promise<void> {
    if (!this.processes.isActive(serverId)) return;
    const server = this.processes.applyRuntimePorts(this.mustServer(serverId));
    try {
      await rconExec(RCON_HOST, server.rconPort, server.adminPassword, "SaveWorld");
    } catch {
      // Hot backup can continue even if SaveWorld fails.
    }
  }

  private async createBackups(
    serverId: string,
    type: BackupType,
    notes: string | null,
    kinds: BackupKind[],
    options?: {
      skipFlush?: boolean;
      onKindProgress?: (kind: BackupKind, index: number, total: number) => void;
      onProgressMessage?: (message: string) => void;
      respectCancel?: boolean;
    },
  ): Promise<BackupRecord[]> {
    return this.withServerBackupJob(serverId, async () => {
      if (options?.skipFlush !== true) {
        await this.flushWorldIfActive(serverId);
      }

      const created: BackupRecord[] = [];
      const total = kinds.length;
      for (let index = 0; index < kinds.length; index += 1) {
        if (options?.respectCancel === true) {
          this.throwIfCancelled();
        }
        const kind = kinds[index]!;
        options?.onKindProgress?.(kind, index, total);
        const record = await this.createBackup(serverId, type, kind, notes, {
          onProgressMessage: options?.onProgressMessage,
          respectCancel: options?.respectCancel === true,
        });
        if (record !== null) {
          created.push(record);
        }
      }
      return created;
    });
  }

  private createSingleBackup(
    serverId: string,
    type: BackupType,
    kind: BackupKind,
    notes: string | null,
    options?: { playerKey?: string; waitForProfile?: boolean },
  ): Promise<BackupRecord | null> {
    // The full stop batch already includes players and INI; do not queue
    // automatic single-kind work behind it while the app may be waiting to quit.
    if (this.preStopBackupServers.has(serverId)) return Promise.resolve(null);
    return this.withServerBackupJob(serverId, () =>
      this.createBackup(serverId, type, kind, notes, options),
    );
  }

  private async withServerBackupJob<T>(
    serverId: string,
    work: () => Promise<T>,
  ): Promise<T> {
    const previous = this.backupJobs.get(serverId) ?? Promise.resolve();
    const result = previous.catch(() => undefined).then(work);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.backupJobs.set(serverId, tail);
    try {
      return await result;
    } finally {
      if (this.backupJobs.get(serverId) === tail) {
        this.backupJobs.delete(serverId);
      }
    }
  }

  private async createBackup(
    serverId: string,
    type: BackupType,
    kind: BackupKind,
    notes: string | null,
    options?: {
      playerKey?: string;
      waitForProfile?: boolean;
      onProgressMessage?: (message: string) => void;
      respectCancel?: boolean;
    },
  ): Promise<BackupRecord | null> {
    const server = this.mustServer(serverId);
    await this.assertInstallReadyForLiveOps(server);
    if (options?.respectCancel === true) {
      this.throwIfCancelled();
    }
    const policy = this.backups.getPolicy(serverId);
    const rootDir = resolveServerBackupRoot(server.installDir, policy.backupDir);
    const kindDir = join(rootDir, backupKindSubdir(kind));

    const stamp = formatBackupFileStamp();
    const playerSlug =
      options?.playerKey !== undefined && options.playerKey.length > 0
        ? `-${slug(options.playerKey).slice(0, 24)}`
        : "";
    const mapSlug =
      kind === "world" && server.map.trim().length > 0
        ? `-${mapTokenFileSlug(server.map)}`
        : "";
    const preferredName =
      `${slug(server.name)}-${kind}-${type}${mapSlug}${playerSlug}-${stamp}.zip`;
    await mkdir(kindDir, { recursive: true });
    const zipPath = this.allocateUniqueZipPath(kindDir, preferredName);
    const stagingDir = join(tmpdir(), `yark-backup-${randomUUID()}`);

    await mkdir(stagingDir, { recursive: true });

    const mapToken = kind === "world" ? server.map.trim() || null : null;
    const record = this.backups.createBackupStart({
      serverId,
      type,
      kind,
      path: zipPath,
      notes,
      mapToken,
    });
    this.creatingBackupIds.add(record.id);

    try {
      options?.onProgressMessage?.(`Packaging ${kind} files for backup…`);
      if (options?.respectCancel === true) {
        this.throwIfCancelled();
      }
      const packaged =
        options?.playerKey !== undefined && kind === "players"
          ? await this.packageSinglePlayer(server, stagingDir, options.playerKey, {
              waitForProfile: options.waitForProfile === true,
            })
          : await this.packageKind(server, kind, stagingDir);

      // Per-player session archives with no matching profile are not recoverable —
      // drop them so they do not consume retention slots.
      if (
        options?.playerKey !== undefined
        && kind === "players"
        && packaged.meta.empty === true
      ) {
        await rm(stagingDir, { recursive: true, force: true });
        await rm(zipPath, { force: true }).catch(() => undefined);
        this.backups.deleteBackupRecord(record.id);
        this.creatingBackupIds.delete(record.id);
        return null;
      }

      if (kind === "world" && packaged.meta.empty === true) {
        throw new Error("No world save data found to back up");
      }

      if (options?.respectCancel === true) {
        this.throwIfCancelled();
      }

      await writeFile(
        join(stagingDir, "manifest.json"),
        JSON.stringify(
          {
            server: {
              id: server.id,
              name: server.name,
              map: server.map,
              installDir: server.installDir,
              clusterId: server.clusterId,
            },
            backup: {
              id: record.id,
              type,
              kind,
              createdAt: record.createdAt,
              ...packaged.meta,
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      const lightCompressBinarySaves = kind === "world" || kind === "players";
      options?.onProgressMessage?.(
        lightCompressBinarySaves
          ? `Writing ${kind} backup archive…`
          : `Compressing ${kind} backup archive…`,
      );
      const sizeBytes = await zipDirectory(stagingDir, zipPath, {
        lightCompressBinarySaves,
      });
      if (options?.respectCancel === true) {
        this.throwIfCancelled();
      }
      await rm(stagingDir, { recursive: true, force: true });

      const completed = this.backups.completeBackup(record.id, sizeBytes);
      if (completed === null) {
        throw new Error("Could not mark backup as completed");
      }

      const missingHint = packaged.meta.empty ? ` (no ${kind} data present yet)` : "";
      this.servers.addEvent(
        serverId,
        "backup_created",
        "info",
        `Backup ${type}/${kind} completed for \"${server.name}\" (${this.humanSize(sizeBytes)})${missingHint}`,
      );

      // Retention runs after success. Failures here must not delete the new zip
      // or mark this backup failed — the archive is already durable.
      try {
        await this.applyRetention(serverId, policy);
      } catch (retentionErr) {
        const retentionMessage =
          retentionErr instanceof Error ? retentionErr.message : String(retentionErr);
        this.servers.addEvent(
          serverId,
          "error",
          "warning",
          `Backup retention failed after successful ${type}/${kind} backup for \"${server.name}\": ${retentionMessage}`,
          {
            what: "The new backup was saved, but pruning older archives failed.",
            cause: retentionMessage,
            location: zipPath,
            suggestion:
              "Check destination permissions and free disk space, then run cleanup or create another backup to retry retention.",
            context: {
              type,
              kind,
              backupId: record.id,
            },
          },
        );
      }
      this.emitChanged(serverId);
      return completed;
    } catch (err) {
      await rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
      await rm(zipPath, { force: true }).catch(() => undefined);
      const message = err instanceof Error ? err.message : String(err);
      this.backups.failBackup(record.id, message);
      this.servers.addEvent(
        serverId,
        "error",
        "error",
        `Backup ${type}/${kind} failed for \"${server.name}\": ${message}`,
        {
          what: `A ${kind} backup (${type}) failed before the archive was completed.`,
          cause: message,
          location: zipPath,
          suggestion:
            "Check destination permissions and free disk space, then create the backup again from the server Backups tab.",
          context: {
            type,
            kind,
            backupId: record.id,
          },
        },
      );
      this.emitChanged(serverId);
      throw err;
    } finally {
      this.creatingBackupIds.delete(record.id);
    }
  }

  private async packageKind(
    server: ServerProfile,
    kind: BackupKind,
    targetDir: string,
  ): Promise<{ meta: Record<string, unknown> }> {
    if (kind === "world") {
      return this.packageWorld(server, targetDir);
    }
    if (kind === "players") {
      return this.packagePlayers(server, targetDir);
    }
    return this.packageIni(server, targetDir);
  }

  private async packageWorld(
    server: ServerProfile,
    targetDir: string,
  ): Promise<{ meta: Record<string, unknown> }> {
    const mapToken = server.map.trim();
    if (mapToken.length === 0) {
      throw new Error("Server map token is required for a world backup");
    }

    const savedArks = this.savedArksDir(server);
    const resolved = await resolveWorldMapSaveDir(savedArks, mapToken);
    const dest = join(targetDir, "SavedArks", mapToken);

    if (resolved === null) {
      await mkdir(dest, { recursive: true });
      return {
        meta: {
          empty: true,
          fileCount: 0,
          savedArksPresent: existsSync(savedArks),
          mapToken,
        },
      };
    }

    const mapSourceDir = resolved.dir;

    // File-by-file copy so live Ark save rotation (e.g. .arkrbf) can be skipped
    // without failing the whole archive, while essential saves still fail loudly.
    const enumerated = await listFilesRecursive(mapSourceDir);
    const candidates = await collectWorldBackupCandidates(enumerated, stat);
    const selection = selectWorldBackupSourceFiles(candidates, { mapToken });
    const sourceFiles = selection.selected.map((candidate) => candidate.path);
    const hasPrimary = sourceFiles.some((file) => isPrimaryWorldSaveName(basename(file)));
    if (!hasPrimary) {
      throw new Error(
        `No primary world save found for map ${mapToken} (${mapToken}.ark in ${resolved.folderName})`,
      );
    }

    const copyResult = await copySavedArksFiles(
      mapSourceDir,
      dest,
      sourceFiles,
      copyFileTo,
      { mapToken },
    );
    const destFiles = await listFilesRecursive(dest);
    const missing = missingEssentialWorldRels(
      mapSourceDir,
      dest,
      sourceFiles,
      destFiles,
      { mapToken },
    );
    if (missing.length > 0) {
      throw new Error(
        `World backup incomplete; missing essential save data: ${
          missing.map((rel) => basename(rel)).slice(0, 5).join(", ")
        }`,
      );
    }

    return {
      meta: {
        empty: destFiles.length === 0,
        fileCount: destFiles.length,
        savedArksPresent: true,
        mapToken,
        mapFolderName: resolved.folderName,
        copiedFileCount: copyResult.copiedFileCount,
        skippedTransientCount:
          selection.skippedTransientCount + copyResult.skippedTransientCount,
        skippedTransient: copyResult.skippedTransient,
        skippedOlderDatedCount: selection.skippedOlderDatedCount,
        retainedDatedCount: selection.retainedDatedCount,
      },
    };
  }

  private async packagePlayers(
    server: ServerProfile,
    targetDir: string,
  ): Promise<{ meta: Record<string, unknown> }> {
    const profilesRoot = join(targetDir, "PlayerProfiles");
    await mkdir(profilesRoot, { recursive: true });
    let fileCount = 0;

    for (const root of this.playerSearchRoots(server)) {
      if (!existsSync(root.path)) continue;
      const files = await listFilesRecursive(root.path);
      for (const file of files) {
        if (!isPlayerProfileFile(basename(file))) continue;
        const rel = join(root.label, relative(root.path, file));
        await copyFileTo(file, join(profilesRoot, rel));
        fileCount += 1;
      }
    }

    return { meta: { empty: fileCount === 0, fileCount } };
  }

  private async packageSinglePlayer(
    server: ServerProfile,
    targetDir: string,
    playerKey: string,
    options?: { waitForProfile?: boolean },
  ): Promise<{ meta: Record<string, unknown> }> {
    const profilesRoot = join(targetDir, "PlayerProfiles");
    await mkdir(profilesRoot, { recursive: true });
    const needle = normalizePlayerKey(playerKey);
    const maxAttempts = options?.waitForProfile === true ? 8 : 1;
    let fileCount = 0;
    const matched: string[] = [];

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      fileCount = 0;
      matched.length = 0;

      for (const root of this.playerSearchRoots(server)) {
        if (!existsSync(root.path)) continue;
        const files = await listFilesRecursive(root.path);
        for (const file of files) {
          const name = basename(file);
          if (!isPlayerProfileFile(name)) continue;
          const stem = name
            .replace(/\.(arkprofile)(\.bak)?$/i, "")
            .replace(/\.profilebak$/i, "");
          const normalizedStem = normalizePlayerKey(stem);
          // Exact match only — substring/prefix matching can pull in other players' profiles.
          if (normalizedStem !== needle) {
            continue;
          }
          const rel = join(root.label, relative(root.path, file));
          await copyFileTo(file, join(profilesRoot, rel));
          fileCount += 1;
          matched.push(rel);
        }
      }

      if (fileCount > 0) break;
      if (attempt < maxAttempts - 1) {
        await delay(400);
      }
    }

    return {
      meta: {
        empty: fileCount === 0,
        fileCount,
        playerKey: needle,
        files: matched,
      },
    };
  }

  private playerSearchRoots(
    server: ServerProfile,
  ): Array<{ label: string; path: string }> {
    const savedRoot = this.savedRootDir(server);
    return [
      { label: "SavedArks", path: this.savedArksDir(server) },
      { label: "SaveGames", path: join(savedRoot, "SaveGames") },
    ];
  }

  private async packageIni(
    server: ServerProfile,
    targetDir: string,
  ): Promise<{ meta: Record<string, unknown> }> {
    const config = this.configDir(server);
    const dest = join(targetDir, "ConfigWindowsServer");
    await mkdir(dest, { recursive: true });
    const names = ["Game.ini", "GameUserSettings.ini"] as const;
    const copied: string[] = [];
    for (const name of names) {
      const src = join(config, name);
      if (!existsSync(src)) continue;
      await copyFileTo(src, join(dest, name));
      copied.push(name);
    }
    return {
      meta: {
        empty: copied.length === 0,
        files: copied,
        configPresent: copied.length > 0,
      },
    };
  }

  private async applyRestore(
    server: ServerProfile,
    backup: BackupRecord,
    options?: RestoreBackupOptions,
  ): Promise<void> {
    await this.withBackupContents(backup.path, async (root) => {
      if (backup.kind === "world") {
        await this.restoreWorld(server, root, backup, options);
        return;
      }
      if (backup.kind === "players") {
        await this.restorePlayers(server, root);
        return;
      }
      await this.restoreIni(server, root);
    });
  }

  /** Run `fn` against a folder snapshot (legacy) or an extracted ZIP staging dir. */
  private async withBackupContents(
    backupPath: string,
    fn: (contentRoot: string) => Promise<void>,
  ): Promise<void> {
    if (!isZipBackupPath(backupPath)) {
      await fn(backupPath);
      return;
    }
    const stagingDir = join(tmpdir(), `yark-restore-${randomUUID()}`);
    try {
      await extractZip(backupPath, stagingDir);
      await fn(stagingDir);
    } finally {
      await rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async restoreWorld(
    server: ServerProfile,
    backupPath: string,
    backup: BackupRecord,
    options?: RestoreBackupOptions,
  ): Promise<void> {
    const backupSaved = join(backupPath, "SavedArks");
    if (!existsSync(backupSaved)) {
      throw new Error("World backup is missing SavedArks data");
    }

    const mapToken = await this.resolveWorldRestoreMapToken(backupSaved, backup, server);
    const backupMapDir = join(backupSaved, mapToken);
    if (!existsSync(backupMapDir)) {
      throw new Error(`World backup is missing map folder ${mapToken}`);
    }

    const restoreProfilesTribes = options?.restoreProfilesTribes !== false;
    const liveSavedArks = this.savedArksDir(server);
    const liveResolved = await resolveWorldMapSaveDir(liveSavedArks, mapToken);
    const liveMapDir = liveResolved?.dir ?? join(liveSavedArks, mapToken);
    await mkdir(liveMapDir, { recursive: true });

    const files = await listFilesRecursive(backupMapDir);
    let copied = 0;
    for (const file of files) {
      const name = basename(file);
      if (!restoreProfilesTribes && isWorldProfileOrTribeName(name)) {
        continue;
      }
      // Always allow primary + anti-corruption; skip dated/transient if somehow present.
      if (isWorldProfileOrTribeName(name) || isPrimaryWorldSaveName(name)
        || isAntiCorruptionWorldSaveName(name, mapToken)
        || name.toLowerCase().endsWith(".ark.bak")) {
        const rel = relative(backupMapDir, file);
        await copyFileTo(file, join(liveMapDir, rel));
        copied += 1;
        continue;
      }
      // Other companions already filtered by packaging; copy remaining non-noise.
      const lower = name.toLowerCase();
      if (lower.endsWith(".arkrbf") || lower.endsWith(".tmp")) continue;
      if (lower.endsWith(".ark") && !isPrimaryWorldSaveName(name)) continue;
      const rel = relative(backupMapDir, file);
      await copyFileTo(file, join(liveMapDir, rel));
      copied += 1;
    }

    if (copied === 0) {
      throw new Error(`World restore found no files to apply for map ${mapToken}`);
    }
  }

  private async resolveWorldRestoreMapToken(
    backupSaved: string,
    backup: BackupRecord,
    server: ServerProfile,
  ): Promise<string> {
    if (backup.mapToken !== null && backup.mapToken.trim().length > 0) {
      return backup.mapToken.trim();
    }
    if (server.map.trim().length > 0 && existsSync(join(backupSaved, server.map.trim()))) {
      return server.map.trim();
    }
    let entries;
    try {
      entries = await readdir(backupSaved, { withFileTypes: true });
    } catch {
      throw new Error("World backup SavedArks folder is unreadable");
    }
    const dirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    if (dirs.length === 1) {
      return dirs[0]!;
    }
    if (server.map.trim().length > 0) {
      return server.map.trim();
    }
    throw new Error("World backup map token could not be resolved");
  }

  private async restorePlayers(server: ServerProfile, backupPath: string): Promise<void> {
    const profilesRoot = join(backupPath, "PlayerProfiles");
    const legacySaved = join(backupPath, "SavedArks");
    const savedRoot = this.savedRootDir(server);

    if (existsSync(profilesRoot)) {
      const files = await listFilesRecursive(profilesRoot);
      for (const file of files) {
        const rel = relative(profilesRoot, file);
        await copyFileTo(file, join(savedRoot, rel));
      }
      return;
    }

    // Legacy full backups stored profiles inside SavedArks.
    if (existsSync(legacySaved)) {
      const files = await listFilesRecursive(legacySaved);
      for (const file of files) {
        if (!isPlayerProfileFile(basename(file))) continue;
        const rel = relative(legacySaved, file);
        await copyFileTo(file, join(this.savedArksDir(server), rel));
      }
      return;
    }

    throw new Error("Players backup has no profile data");
  }

  private async restoreIni(server: ServerProfile, backupPath: string): Promise<void> {
    const backupConfig = join(backupPath, "ConfigWindowsServer");
    const live = this.configDir(server);
    if (!existsSync(backupConfig)) {
      throw new Error("INI backup is missing ConfigWindowsServer data");
    }
    await mkdir(live, { recursive: true });
    for (const name of ["Game.ini", "GameUserSettings.ini"] as const) {
      const src = join(backupConfig, name);
      if (!existsSync(src)) continue;
      await copyFileTo(src, join(live, name));
    }
  }

  private throwIfCancelled(): void {
    if (this.cancelRequested) {
      throw new OperationCancelledError();
    }
  }

  private async enqueueAndWait<T>(
    type: BackupCriticalJobType,
    serverId: string,
    backupId: string | null,
    options?: {
      adoptRetryableRestore?: boolean;
      progress?: BackupCriticalJobProgressHandlers;
    },
  ): Promise<T> {
    const progress = options?.progress;
    const existingPending = this.queue.find(
      (job) =>
        job.serverId === serverId
        && job.type === type
        && job.backupId === backupId,
    );
    if (existingPending !== undefined) {
      if (
        existingPending.status === "blocked"
        || existingPending.status === "failed"
        || existingPending.status === "cancelled"
      ) {
        if (
          options?.adoptRetryableRestore === true
          && existingPending.type === "restore"
          && (existingPending.status === "blocked" || existingPending.status === "failed")
          && existingPending.operatorRetryAllowed
        ) {
          if (progress !== undefined) {
            this.jobProgressHandlers.set(existingPending.id, progress);
          }
          const completion = new Promise<T>((resolve, reject) => {
            this.addWaiter(existingPending.id, {
              resolve: (value) => resolve(value as T),
              reject,
            });
          });
          this.prepareCriticalJobRetry(
            existingPending,
            "Retry adopted by the parent update rollback after operator confirmation.",
          );
          void this.processQueue();
          return await completion;
        }
        throw new Error(
          `A previous ${type} job requires Retry or Dismiss before another can be queued`,
        );
      }
      if (progress !== undefined) {
        this.jobProgressHandlers.set(existingPending.id, progress);
      }
      return await new Promise<T>((resolve, reject) => {
        this.addWaiter(existingPending.id, {
          resolve: (value) => resolve(value as T),
          reject,
        });
      });
    }

    const now = new Date().toISOString();
    const job: BackupCriticalJob = {
      id: randomUUID(),
      type,
      serverId,
      backupId,
      attempts: 0,
      maxAttempts: 3,
      status: "pending",
      phase: "queued",
      createdAt: now,
      updatedAt: now,
      lastError: null,
      recoveryReason: null,
      idempotencyKey: makeIdempotencyKey(type, serverId, backupId),
      operatorRetryAllowed: false,
      context: {},
    };

    this.queue.push(job);
    if (progress !== undefined) {
      this.jobProgressHandlers.set(job.id, progress);
    }
    this.persistQueue();
    this.servers.addEvent(
      serverId,
      "backup_created",
      "info",
      `Job queued: ${type} (${job.id.slice(0, 8)})`,
    );

    const completion = new Promise<T>((resolve, reject) => {
      this.addWaiter(job.id, {
        resolve: (value) => resolve(value as T),
        reject,
      });
    });
    void this.processQueue();
    return await completion;
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

        try {
          let result: unknown;
          if (job.type === "pre-update-backup") {
            result = await this.resumePreUpdateBackupJob(job);
          } else {
            if (job.backupId === null || job.backupId.trim().length === 0) {
              throw new Error("backupId required for restore job");
            }
            await this.resumeRestoreJob(job);
            result = undefined;
          }

          this.resolveJob(job.id, result);
          this.jobProgressHandlers.delete(job.id);
          this.removeJob(job.id);
          this.persistQueue();
        } catch (error) {
          job.attempts += 1;
          job.lastError = error instanceof Error ? error.message : String(error);
          job.updatedAt = new Date().toISOString();

          if (isOperationCancelledError(error) || this.cancelRequested) {
            this.rejectJob(
              job.id,
              isOperationCancelledError(error)
                ? (error as Error)
                : new OperationCancelledError(),
            );
            this.jobProgressHandlers.delete(job.id);
            job.status = "cancelled";
            if (job.phase !== "applying-restore") {
              job.phase = "cancelled";
            }
            job.operatorRetryAllowed = false;
            job.recoveryReason = "Cancelled by the operator during execution.";
            this.cancelRequested = false;
            this.persistQueue();
            this.servers.addEvent(
              job.serverId,
              "error",
              "warning",
              `Job ${job.type} cancelled by the operator`,
            );
            continue;
          }

          if (job.phase === "applying-restore") {
            this.rejectJob(job.id, new Error(job.lastError));
            this.jobProgressHandlers.delete(job.id);
            job.status = "blocked";
            job.operatorRetryAllowed = true;
            job.recoveryReason =
              `Failure during phase "${job.phase}" may have completed a side effect. Inspect backup and restore evidence before retrying.`;
            this.persistQueue();
            this.servers.addEvent(
              job.serverId,
              "error",
              "error",
              `Job ${job.type} blocked with an ambiguous outcome: ${job.lastError}`,
            );
            continue;
          }

          if (!isTransientCriticalJobError(error)) {
            this.rejectJob(job.id, new Error(job.lastError));
            this.jobProgressHandlers.delete(job.id);
            job.status = "failed";
            job.phase = "failed";
            job.operatorRetryAllowed = false;
            job.recoveryReason =
              "This validation, security, cancellation, or missing-resource failure is not safe to retry automatically.";
            this.persistQueue();
            this.servers.addEvent(
              job.serverId,
              "error",
              "error",
              `Job ${job.type} failed without retry: ${job.lastError}`,
            );
            continue;
          }

          if (job.attempts >= job.maxAttempts) {
            this.rejectJob(job.id, new Error(job.lastError));
            this.jobProgressHandlers.delete(job.id);
            job.status = "failed";
            job.phase = "failed";
            job.operatorRetryAllowed = true;
            job.recoveryReason = `Retry limit reached after ${job.maxAttempts} attempts.`;
            this.servers.addEvent(
              job.serverId,
              "error",
              "error",
              `Job ${job.type} exhausted retries (${job.maxAttempts}): ${job.lastError}`,
            );
            this.persistQueue();
            continue;
          }

          job.status = "retrying";
          job.recoveryReason = `Transient failure; retry ${job.attempts + 1} of ${job.maxAttempts} is scheduled.`;
          this.persistQueue();
          this.servers.addEvent(
            job.serverId,
            "error",
            "warning",
            `Job ${job.type} will retry (${job.attempts}/${job.maxAttempts})`,
          );
          await delay(BACKUP_JOB_RETRY_DELAY_MS);
          if (job.status === "retrying") {
            job.status = "pending";
            job.phase = "queued";
            job.updatedAt = new Date().toISOString();
            this.persistQueue();
          }
        }
      }
    } finally {
      this.processingQueue = false;
    }
  }

  private loadQueue(): BackupCriticalJob[] {
    const raw = this.settings.get(BACKUP_CRITICAL_JOBS_KEY);
    if (raw === null || raw.trim().length === 0) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as Array<Partial<BackupCriticalJob>>;
      if (!Array.isArray(parsed)) {
        throw new Error("Backup critical job queue is not an array");
      }
      const jobs: BackupCriticalJob[] = [];
      let invalidEntryFound = false;
      for (const job of parsed) {
        if (
          typeof job.id !== "string"
          || (job.type !== "pre-update-backup" && job.type !== "restore")
          || typeof job.serverId !== "string"
        ) {
          invalidEntryFound = true;
          continue;
        }
        if (
          typeof job.status === "string"
          && !KNOWN_BACKUP_JOB_STATUSES.has(job.status)
        ) {
          invalidEntryFound = true;
          continue;
        }
        if (
          typeof job.phase === "string"
          && !this.isKnownBackupJobPhase(job.type, job.phase)
        ) {
          invalidEntryFound = true;
          continue;
        }
        const backupId = typeof job.backupId === "string" ? job.backupId : null;
        const context = this.sanitizeBackupJobContext(job.context);
        if (job.type === "restore") {
          const historyId = context.restoreHistoryId;
          const history =
            typeof historyId === "number"
              ? this.backups.getRestoreHistory(historyId)
              : null;
          if (
            job.phase === "restore-complete"
            || (
              history?.status === "completed"
              && this.isRestoreHistoryOwnedByJob(job.id, job.serverId, backupId, history)
            )
          ) {
            continue;
          }
          if (history?.status === "completed") {
            invalidEntryFound = true;
            continue;
          }
        }
        const migrated = migrateCriticalJob<BackupCriticalJob>(job, {
          type: job.type,
          serverId: job.serverId,
          defaultPhase: "queued",
          interruptedIsAmbiguous:
            (job.type === "restore" && job.phase === "applying-restore")
            || (job.type === "pre-update-backup" && typeof job.phase !== "string"),
          idempotencyDiscriminator: backupId,
          serverExists: this.servers.get(job.serverId) !== null,
        });
        migrated.backupId = backupId;
        migrated.context = context;
        const duplicateIndex = jobs.findIndex(
          (candidate) => candidate.idempotencyKey === migrated.idempotencyKey,
        );
        if (duplicateIndex >= 0) {
          const merged = this.mergeBackupCriticalJobs(
            jobs[duplicateIndex]!,
            migrated,
          );
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
        this.settings.set(`${BACKUP_CRITICAL_JOBS_KEY}.quarantine.${Date.now()}`, raw);
      }
      this.settings.set(BACKUP_CRITICAL_JOBS_KEY, JSON.stringify(jobs));
      return jobs;
    } catch {
      this.settings.set(`${BACKUP_CRITICAL_JOBS_KEY}.quarantine.${Date.now()}`, raw);
      this.settings.set(BACKUP_CRITICAL_JOBS_KEY, "[]");
      return [];
    }
  }

  private persistQueue(): void {
    this.settings.set(BACKUP_CRITICAL_JOBS_KEY, JSON.stringify(this.queue));
  }

  private removeJob(jobId: string): void {
    this.queue = this.queue.filter((job) => job.id !== jobId);
  }

  private checkpointJob(job: BackupCriticalJob, phase: string): void {
    job.phase = phase;
    job.updatedAt = new Date().toISOString();
    this.persistQueue();
  }

  private prepareCriticalJobRetry(job: BackupCriticalJob, reason: string): void {
    job.status = "pending";
    job.phase = "queued";
    if (job.type === "restore") {
      const historyId = job.context.restoreHistoryId;
      if (typeof historyId === "number") {
        const history = this.backups.getRestoreHistory(historyId);
        if (history?.status === "started") {
          this.backups.completeRestoreHistory(
            historyId,
            "failed",
            "Superseded by an explicit operator retry after interrupted restore.",
          );
        }
      }
      job.context = {};
    }
    job.maxAttempts = Math.max(job.maxAttempts, job.attempts + 3);
    job.recoveryReason = reason;
    job.updatedAt = new Date().toISOString();
    this.persistQueue();
  }

  private async resumePreUpdateBackupJob(job: BackupCriticalJob): Promise<BackupRecord[]> {
    const progress = this.jobProgressHandlers.get(job.id);
    this.throwIfCancelled();
    progress?.onProgressMessage?.(
      "Creating pre-update backups (world, players, INI) before SteamCMD…",
    );
    this.checkpointJob(job, "reconciling-backups");
    await this.reconcileDiskBackups(job.serverId);
    this.throwIfCancelled();
    const marker = `[critical-job:${job.id}]`;
    const candidates = this.backups
      .listBackups(job.serverId, 10_000)
      .filter(
        (backup) =>
          backup.type === "pre_update"
          && backup.status === "completed"
          && existsSync(backup.path)
          && backup.notes?.includes(marker) === true,
      );
    const existing: BackupRecord[] = [];
    for (const backup of candidates) {
      try {
        const readable = await isReadableZipArchive(backup.path);
        if (readable && (await zipHasBackupLayout(backup.path))) {
          existing.push(backup);
        }
      } catch {
        // Unreadable or corrupt archive — do not count as completion evidence.
      }
    }
    const completedByKind = new Map<BackupKind, BackupRecord>();
    for (const backup of existing) {
      if (!completedByKind.has(backup.kind)) {
        completedByKind.set(backup.kind, backup);
      }
    }

    // The index and IDs in persisted context are hints, not completion
    // evidence. Rebuild progress from job-marked DB rows whose archives still
    // exist so corrupt context cannot skip a required backup kind.
    let nextKindIndex = 0;
    const total = CRITICAL_BACKUP_KINDS.length;
    while (nextKindIndex < CRITICAL_BACKUP_KINDS.length) {
      this.throwIfCancelled();
      const kind = CRITICAL_BACKUP_KINDS[nextKindIndex]!;
      if (!completedByKind.has(kind)) {
        this.checkpointJob(job, `creating-backup:${kind}`);
        progress?.onKindProgress?.(kind, nextKindIndex, total);
        const created = await this.createBackups(
          job.serverId,
          "pre_update",
          `Pre-update backup ${marker}`,
          [kind],
          {
            respectCancel: true,
            onProgressMessage: progress?.onProgressMessage,
          },
        );
        const completed = created.find(
          (backup) =>
            backup.serverId === job.serverId
            && backup.type === "pre_update"
            && backup.kind === kind
            && backup.status === "completed"
            && existsSync(backup.path)
            && backup.notes?.includes(marker) === true,
        );
        if (completed === undefined) {
          throw new Error(
            `Pre-update backup did not produce durable ${kind} evidence (server: ${job.serverId}, job: ${job.id})`,
          );
        }
        completedByKind.set(kind, completed);
      }
      nextKindIndex += 1;
      job.context.completedBackupIds = CRITICAL_BACKUP_KINDS
        .map((completedKind) => completedByKind.get(completedKind)?.id)
        .filter((backupId): backupId is string => backupId !== undefined);
      job.context.nextKindIndex = nextKindIndex;
      this.checkpointJob(job, `backup-complete:${kind}`);
    }

    progress?.onProgressMessage?.("Pre-update backups completed.");
    return CRITICAL_BACKUP_KINDS.map((kind) => completedByKind.get(kind)!);
  }

  private async resumeRestoreJob(job: BackupCriticalJob): Promise<void> {
    const server = this.mustServer(job.serverId);
    if (this.processes.isActive(job.serverId)) {
      throw new Error("Stop the server before restoring a backup");
    }
    if (job.backupId === null) throw new Error("backupId required for restore job");
    const backup = this.backups.getBackup(job.backupId);
    if (
      backup === null
      || backup.serverId !== job.serverId
      || backup.status !== "completed"
    ) {
      throw new Error("Invalid backup for restore");
    }

    const marker = `[critical-job:${job.id}]`;
    let restoreHistoryId = job.context.restoreHistoryId;
    const existingHistory =
      typeof restoreHistoryId === "number"
        ? this.backups.getRestoreHistory(restoreHistoryId)
        : null;
    if (existingHistory?.status === "completed") {
      if (!this.isRestoreHistoryOwnedByJob(job.id, job.serverId, backup.id, existingHistory)) {
        throw new Error("Restore history evidence does not belong to this recovery job");
      }
      this.checkpointJob(job, "restore-complete");
      return;
    }
    if (
      existingHistory !== null
      && !this.isRestoreHistoryOwnedByJob(job.id, job.serverId, backup.id, existingHistory)
    ) {
      throw new Error("Restore history evidence does not belong to this recovery job");
    }
    if (existingHistory === null || existingHistory.status === "failed") {
      restoreHistoryId = this.backups.insertRestoreHistory({
        serverId: job.serverId,
        backupId: backup.id,
        status: "started",
        notes: marker,
      });
      job.context.restoreHistoryId = restoreHistoryId;
      this.checkpointJob(job, "restore-history-started");
    }

    this.throwIfCancelled();
    this.checkpointJob(job, "creating-restore-safeguard");
    if (restoreHistoryId === undefined) {
      throw new Error("Restore history checkpoint was not created");
    }
    const progress = this.jobProgressHandlers.get(job.id);
    progress?.onProgressMessage?.(
      `Creating pre-restore safeguard (${backup.kind}) before applying the archive…`,
    );
    const safeguards = this.backups
      .listBackups(job.serverId, 10_000)
      .filter(
        (candidate) =>
          candidate.type === "pre_restore"
          && candidate.kind === backup.kind
          && candidate.status === "completed"
          && candidate.notes?.includes(marker) === true,
      );
    if (safeguards.length === 0) {
      progress?.onKindProgress?.(backup.kind, 0, 1);
      const created = await this.createBackups(
        job.serverId,
        "pre_restore",
        `Safeguard before restore ${marker}`,
        [backup.kind],
        {
          respectCancel: true,
          onProgressMessage: progress?.onProgressMessage,
        },
      );
      job.context.safeguardBackupIds = created.map((candidate) => candidate.id);
    } else {
      job.context.safeguardBackupIds = safeguards.map((candidate) => candidate.id);
    }
    this.throwIfCancelled();
    this.checkpointJob(job, "restore-safeguard-complete");

    this.checkpointJob(job, "applying-restore");
    progress?.onProgressMessage?.(`Applying ${backup.kind} restore…`);
    await this.applyRestore(server, backup);
    this.backups.completeRestoreHistory(restoreHistoryId, "completed", marker);
    this.checkpointJob(job, "restore-complete");
    this.servers.addEvent(
      job.serverId,
      "backup_restored",
      "info",
      `Restore applied on "${server.name}" from ${backup.kind} backup ${backup.id}`,
    );
    this.emitChanged(job.serverId);
  }

  private sanitizeBackupJobContext(raw: unknown): BackupCriticalJob["context"] {
    if (typeof raw !== "object" || raw === null) {
      return {};
    }
    const input = raw as Record<string, unknown>;
    const context: BackupCriticalJob["context"] = {};
    if (Array.isArray(input.completedBackupIds)) {
      context.completedBackupIds = input.completedBackupIds
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .map((value) => value.trim());
    }
    if (typeof input.nextKindIndex === "number" && Number.isFinite(input.nextKindIndex)) {
      context.nextKindIndex = Math.max(0, Math.floor(input.nextKindIndex));
    }
    if (typeof input.restoreHistoryId === "number" && Number.isFinite(input.restoreHistoryId)) {
      context.restoreHistoryId = Math.max(1, Math.floor(input.restoreHistoryId));
    }
    if (Array.isArray(input.safeguardBackupIds)) {
      context.safeguardBackupIds = input.safeguardBackupIds
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .map((value) => value.trim());
    }
    return context;
  }

  private isKnownBackupJobPhase(type: BackupCriticalJobType, phase: string): boolean {
    const knownStatic = new Set([
      "queued",
      "failed",
      "cancelled",
      "reconciling-backups",
      "restore-history-started",
      "creating-restore-safeguard",
      "restore-safeguard-complete",
      "applying-restore",
      "restore-complete",
    ]);
    if (knownStatic.has(phase)) return true;
    if (type !== "pre-update-backup") return false;
    if (!phase.startsWith("creating-backup:") && !phase.startsWith("backup-complete:")) {
      return false;
    }
    const kind = phase.split(":", 2)[1];
    return kind === "world" || kind === "players" || kind === "ini";
  }

  private isRestoreHistoryOwnedByJob(
    jobId: string,
    serverId: string,
    backupId: string | null,
    history: NonNullable<ReturnType<BackupRepository["getRestoreHistory"]>>,
  ): boolean {
    const marker = `[critical-job:${jobId}]`;
    if (history.serverId !== serverId) return false;
    if (backupId !== null && history.backupId !== backupId) return false;
    return history.notes?.includes(marker) === true;
  }

  private mergeBackupCriticalJobs(
    existing: BackupCriticalJob,
    incoming: BackupCriticalJob,
  ): BackupCriticalJob {
    const phaseOrder = [
      "failed",
      "cancelled",
      "queued",
      "reconciling-backups",
      "restore-history-started",
      "creating-restore-safeguard",
      "restore-safeguard-complete",
      "creating-backup:world",
      "backup-complete:world",
      "creating-backup:players",
      "backup-complete:players",
      "creating-backup:ini",
      "backup-complete:ini",
      "restore-complete",
      "applying-restore",
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
    const mergedCompleted = [
      ...(preferred.context.completedBackupIds ?? []),
      ...(secondary.context.completedBackupIds ?? []),
    ];
    const mergedSafeguards = [
      ...(preferred.context.safeguardBackupIds ?? []),
      ...(secondary.context.safeguardBackupIds ?? []),
    ];
    return {
      ...preferred,
      attempts: Math.max(existing.attempts, incoming.attempts),
      maxAttempts: Math.max(existing.maxAttempts, incoming.maxAttempts),
      operatorRetryAllowed: existing.operatorRetryAllowed || incoming.operatorRetryAllowed,
      context: {
        completedBackupIds: [...new Set(mergedCompleted)],
        nextKindIndex: Math.max(
          preferred.context.nextKindIndex ?? 0,
          secondary.context.nextKindIndex ?? 0,
        ),
        restoreHistoryId:
          preferred.context.restoreHistoryId
          ?? secondary.context.restoreHistoryId,
        safeguardBackupIds: [...new Set(mergedSafeguards)],
      },
    };
  }

  private resolveJob(jobId: string, value: unknown): void {
    const waiters = this.waiters.get(jobId);
    if (waiters !== undefined) {
      for (const waiter of waiters) {
        waiter.resolve(value);
      }
      this.waiters.delete(jobId);
    }
  }

  private rejectJob(jobId: string, error: Error): void {
    const waiters = this.waiters.get(jobId);
    if (waiters !== undefined) {
      for (const waiter of waiters) {
        waiter.reject(error);
      }
      this.waiters.delete(jobId);
    }
  }

  private addWaiter(
    jobId: string,
    waiter: { resolve: (value: unknown) => void; reject: (error: Error) => void },
  ): void {
    const current = this.waiters.get(jobId) ?? [];
    current.push(waiter);
    this.waiters.set(jobId, current);
  }

  /** Retain last N completed backups; world uses per-map pools; players use per-player pools. */
  private async applyRetention(serverId: string, policy: BackupPolicy): Promise<void> {
    for (const kind of ALL_BACKUP_KINDS) {
      const retain = retainCountForKind(policy, kind);
      const completed = this.backups.listCompleted(serverId, kind);

      if (kind === "players") {
        const byPlayer = new Map<string, BackupRecord[]>();
        for (const backup of completed) {
          const key = playersRetentionKey(backup);
          const list = byPlayer.get(key) ?? [];
          list.push(backup);
          byPlayer.set(key, list);
        }
        for (const [, list] of byPlayer) {
          if (list.length <= retain) continue;
          for (const backup of list.slice(retain)) {
            await this.removeRetainedBackup(serverId, backup);
          }
        }
        continue;
      }

      if (kind === "world") {
        const byMap = new Map<string, BackupRecord[]>();
        for (const backup of completed) {
          const key = worldRetentionKey(backup);
          const list = byMap.get(key) ?? [];
          list.push(backup);
          byMap.set(key, list);
        }
        for (const [, list] of byMap) {
          if (list.length <= retain) continue;
          for (const backup of list.slice(retain)) {
            await this.removeRetainedBackup(serverId, backup);
          }
        }
        continue;
      }

      if (completed.length <= retain) continue;
      for (const backup of completed.slice(retain)) {
        await this.removeRetainedBackup(serverId, backup);
      }
    }
  }

  private async removeRetainedBackup(serverId: string, backup: BackupRecord): Promise<void> {
    await rm(backup.path, { recursive: true, force: true });
    this.backups.deleteBackupRecord(backup.id);
    this.servers.addEvent(
      serverId,
      "backup_deleted",
      "info",
      `Old ${backup.kind} backup removed by retention: ${basename(backup.path)}`,
    );
    this.emitChanged(serverId);
  }

  /**
   * Keep SQLite aligned with disk:
   * - drop DB rows whose archive path no longer exists (Explorer deletes)
   * - import ZIP/folder archives present on disk but missing from SQLite
   *
   * Not `async`: returning an in-flight Promise must hand back the same
   * Promise instance (an async function would wrap it in a new outer Promise).
   */
  private reconcileDiskBackups(serverId: string): Promise<number> {
    const existing = this.reconcileInFlight.get(serverId);
    if (existing !== undefined) {
      return existing;
    }
    const run = this.reconcileDiskBackupsUnlocked(serverId).finally(() => {
      if (this.reconcileInFlight.get(serverId) === run) {
        this.reconcileInFlight.delete(serverId);
      }
    });
    this.reconcileInFlight.set(serverId, run);
    return run;
  }

  private async reconcileDiskBackupsUnlocked(serverId: string): Promise<number> {
    const server = this.mustServer(serverId);
    const policy = this.backups.getPolicy(serverId);
    const rootDir = resolveServerBackupRoot(server.installDir, policy.backupDir);

    // Resolve interrupted creates (zip on disk, row still "running") before
    // path-known checks would block re-import of those archives.
    let changed = await this.reconcileInterruptedRunningBackups(serverId);
    changed += this.pruneMissingDiskBackups(serverId);

    if (existsSync(rootDir)) {
      const known = new Set(
        this.backups.listBackupPaths(serverId).map((p) => resolve(p).toLowerCase()),
      );

      for (const kind of ALL_BACKUP_KINDS) {
        const kindDir = join(rootDir, backupKindSubdir(kind));
        changed += await this.importArchivesFromDir(serverId, kindDir, kind, known);
      }

      // Legacy flat layout: archives directly under the root.
      changed += await this.importArchivesFromDir(serverId, rootDir, null, known);
    }

    if (changed > 0) {
      this.emitChanged(serverId);
    }
    return changed;
  }

  /**
   * After a crash/kill, running rows may be stuck:
   * - finished readable backup-layout zip → promote to completed (restorable)
   * - missing / empty / unreadable / non-backup zip → fail so the UI can clear them
   * Live creates (creatingBackupIds) are left alone.
   */
  private reconcileInterruptedRunningBackups(serverId: string): Promise<number> {
    const existing = this.interruptedReconcileInFlight.get(serverId);
    if (existing !== undefined) {
      return existing;
    }
    const run = this.reconcileInterruptedRunningBackupsUnlocked(serverId).finally(
      () => {
        if (this.interruptedReconcileInFlight.get(serverId) === run) {
          this.interruptedReconcileInFlight.delete(serverId);
        }
      },
    );
    this.interruptedReconcileInFlight.set(serverId, run);
    return run;
  }

  private async reconcileInterruptedRunningBackupsUnlocked(
    serverId: string,
  ): Promise<number> {
    const records = this.backups.listBackups(serverId, 10_000);
    let changed = 0;
    for (const backup of records) {
      if (backup.status !== "running") continue;
      if (this.creatingBackupIds.has(backup.id)) continue;

      if (isZipBackupPath(backup.path) && existsSync(backup.path)) {
        let readable = false;
        let hasLayout = false;
        try {
          readable = await isReadableZipArchive(backup.path);
          if (readable) {
            try {
              hasLayout = await zipHasBackupLayout(backup.path);
            } catch {
              // Corrupt central directory / I/O mid-scan — treat as unreadable.
              readable = false;
              hasLayout = false;
            }
          }
        } catch {
          readable = false;
          hasLayout = false;
        }
        if (readable && hasLayout) {
          try {
            const info = await stat(backup.path);
            // Use zip mtime — not wall clock — so recovery does not reorder
            // ahead of newer completed archives and break keep-last retention.
            const completed = this.backups.completeBackup(
              backup.id,
              info.size,
              info.mtime.toISOString(),
            );
            if (completed === null) continue;
            changed += 1;
            this.servers.addEvent(
              serverId,
              "backup_created",
              "info",
              `Recovered interrupted ${backup.kind} backup: ${basename(backup.path)}`,
            );
          } catch {
            // Leave running; a later reconcile can retry.
          }
          continue;
        }

        // Partial/corrupt/non-backup zip — not restorable.
        await rm(backup.path, { force: true }).catch(() => undefined);
        const reason = readable
          ? "Interrupted backup path held a non-backup zip"
          : "Interrupted while writing archive (incomplete or unreadable zip)";
        this.backups.failBackup(backup.id, reason);
        changed += 1;
        this.servers.addEvent(
          serverId,
          "error",
          "warning",
          `Interrupted ${backup.kind} backup marked failed (${
            readable ? "non-backup zip" : "incomplete zip"
          }): ${basename(backup.path)}`,
          {
            what: "A backup was interrupted and the archive on disk is not a restorable backup.",
            cause: reason,
            location: backup.path,
            suggestion: "Create the backup again from the server Backups tab.",
            context: { kind: backup.kind, backupId: backup.id },
          },
        );
        continue;
      }

      // Crash during staging — no zip yet. Fail so the row is not stuck forever.
      this.backups.failBackup(backup.id, "Interrupted before archive was written");
      changed += 1;
      this.servers.addEvent(
        serverId,
        "error",
        "warning",
        `Interrupted ${backup.kind} backup marked failed (no archive on disk)`,
        {
          what: "A backup was interrupted before the zip archive was created.",
          cause: "App stopped or crashed during staging.",
          location: backup.path,
          suggestion: "Create the backup again from the server Backups tab.",
          context: { kind: backup.kind, backupId: backup.id },
        },
      );
    }
    return changed;
  }

  /** Remove DB rows for archives deleted outside the app (e.g. Explorer). */
  private pruneMissingDiskBackups(serverId: string): number {
    const records = this.backups.listBackups(serverId, 10_000);
    let removed = 0;
    for (const backup of records) {
      // In-progress creates may not have written the zip yet.
      if (backup.status === "running") continue;
      // Failed creates delete the partial zip on purpose — keep the row for history.
      if (backup.status === "failed") continue;
      if (existsSync(backup.path)) continue;
      this.backups.deleteBackupRecord(backup.id);
      removed += 1;
    }
    return removed;
  }

  private async importArchivesFromDir(
    serverId: string,
    dir: string,
    defaultKind: BackupKind | null,
    known: Set<string>,
  ): Promise<number> {
    if (!existsSync(dir)) return 0;
    const entries = await readdir(dir, { withFileTypes: true });
    let imported = 0;

    for (const entry of entries) {
      const full = join(dir, entry.name);
      const key = resolve(full).toLowerCase();
      if (known.has(key)) continue;

      // Skip kind subdirs when scanning the root (handled separately).
      if (entry.isDirectory() && defaultKind === null && kindFromSubdirName(entry.name) !== null) {
        continue;
      }

      if (entry.isFile() && isZipBackupPath(entry.name)) {
        const kind = defaultKind ?? this.guessKindFromName(entry.name) ?? "world";
        const ok = await this.importZipArchive(serverId, full, kind, known);
        if (ok) imported += 1;
        continue;
      }

      if (entry.isDirectory()) {
        const kind = defaultKind ?? this.guessKindFromName(entry.name) ?? "world";
        const manifestPath = join(full, "manifest.json");
        if (!existsSync(manifestPath) && !existsSync(join(full, "SavedArks"))
          && !existsSync(join(full, "PlayerProfiles"))
          && !existsSync(join(full, "ConfigWindowsServer"))) {
          continue;
        }
        const ok = await this.importFolderArchive(serverId, full, kind, known);
        if (ok) imported += 1;
      }
    }

    return imported;
  }

  private guessKindFromName(name: string): BackupKind | null {
    const lower = name.toLowerCase();
    if (lower.includes("-players-") || lower.includes("player_")) return "players";
    if (lower.includes("-ini-") || lower.includes("ini_save")) return "ini";
    if (lower.includes("-world-")) return "world";
    return null;
  }

  private async importZipArchive(
    serverId: string,
    zipPath: string,
    kind: BackupKind,
    known: Set<string>,
  ): Promise<boolean> {
    try {
      const info = await stat(zipPath);
      // Match folder import gating: require manifest or known layout roots.
      if (!(await zipHasBackupLayout(zipPath))) {
        return false;
      }
      const manifestRaw = await readZipTextEntry(zipPath, "manifest.json");
      const parsed = this.parseManifest(manifestRaw);
      const createdAt =
        parsed?.createdAt
        ?? info.mtime.toISOString();
      const type = parsed?.type ?? this.guessTypeFromName(basename(zipPath));
      const notes = parsed?.notes ?? `Imported from disk: ${basename(zipPath)}`;
      // Copies keep the original manifest id; mint a new one when that id is taken.
      const id =
        parsed?.id !== undefined && this.backups.getBackup(parsed.id) !== null
          ? undefined
          : parsed?.id;
      if (this.backups.getBackupByPath(serverId, zipPath) !== null) {
        known.add(resolve(zipPath).toLowerCase());
        return false;
      }
      this.backups.insertCompletedBackup({
        id,
        serverId,
        type,
        kind: parsed?.kind ?? kind,
        path: zipPath,
        sizeBytes: info.size,
        createdAt,
        completedAt: createdAt,
        notes,
        mapToken: parsed?.mapToken ?? null,
      });
      known.add(resolve(zipPath).toLowerCase());
      return true;
    } catch {
      return false;
    }
  }

  private async importFolderArchive(
    serverId: string,
    folderPath: string,
    kind: BackupKind,
    known: Set<string>,
  ): Promise<boolean> {
    try {
      const info = await stat(folderPath);
      let manifestRaw: string | null = null;
      const manifestPath = join(folderPath, "manifest.json");
      if (existsSync(manifestPath)) {
        manifestRaw = await readFile(manifestPath, "utf8");
      }
      const parsed = this.parseManifest(manifestRaw);
      const createdAt = parsed?.createdAt ?? info.mtime.toISOString();
      const type = parsed?.type ?? this.guessTypeFromName(basename(folderPath));
      const notes = parsed?.notes ?? `Imported from disk: ${basename(folderPath)}`;
      const sizeBytes = await directorySize(folderPath);
      // Copies keep the original manifest id; mint a new one when that id is taken.
      const id =
        parsed?.id !== undefined && this.backups.getBackup(parsed.id) !== null
          ? undefined
          : parsed?.id;
      if (this.backups.getBackupByPath(serverId, folderPath) !== null) {
        known.add(resolve(folderPath).toLowerCase());
        return false;
      }
      this.backups.insertCompletedBackup({
        id,
        serverId,
        type,
        kind: parsed?.kind ?? kind,
        path: folderPath,
        sizeBytes,
        createdAt,
        completedAt: createdAt,
        notes,
        mapToken: parsed?.mapToken ?? null,
      });
      known.add(resolve(folderPath).toLowerCase());
      return true;
    } catch {
      return false;
    }
  }

  private parseManifest(raw: string | null): {
    id?: string;
    type?: BackupType;
    kind?: BackupKind;
    createdAt?: string;
    notes?: string;
    mapToken?: string | null;
  } | null {
    if (raw === null || raw.trim().length === 0) return null;
    try {
      const data = JSON.parse(raw) as {
        server?: { map?: string };
        backup?: {
          id?: string;
          type?: string;
          kind?: string;
          createdAt?: string;
          notes?: string;
          mapToken?: string;
        };
      };
      const backup = data.backup;
      if (backup === undefined) return null;
      const type = this.asBackupType(backup.type);
      const kind = this.asBackupKind(backup.kind);
      const mapTokenRaw =
        typeof backup.mapToken === "string" && backup.mapToken.trim().length > 0
          ? backup.mapToken.trim()
          : typeof data.server?.map === "string" && data.server.map.trim().length > 0
            ? data.server.map.trim()
            : null;
      return {
        id: typeof backup.id === "string" ? backup.id : undefined,
        type,
        kind,
        createdAt: typeof backup.createdAt === "string" ? backup.createdAt : undefined,
        notes: typeof backup.notes === "string" ? backup.notes : undefined,
        mapToken: mapTokenRaw,
      };
    } catch {
      return null;
    }
  }

  private asBackupType(value: string | undefined): BackupType | undefined {
    const allowed: BackupType[] = [
      "manual",
      "scheduled",
      "pre_stop",
      "pre_restart",
      "pre_update",
      "pre_restore",
      "player_connect",
      "player_disconnect",
      "ini_save",
    ];
    if (value !== undefined && (allowed as string[]).includes(value)) {
      return value as BackupType;
    }
    return undefined;
  }

  private asBackupKind(value: string | undefined): BackupKind | undefined {
    if (value === "world" || value === "players" || value === "ini") return value;
    return undefined;
  }

  private guessTypeFromName(name: string): BackupType {
    const lower = name.toLowerCase();
    if (lower.includes("player_disconnect")) return "player_disconnect";
    if (lower.includes("player_connect")) return "player_connect";
    if (lower.includes("ini_save")) return "ini_save";
    if (lower.includes("scheduled")) return "scheduled";
    if (lower.includes("pre_update")) return "pre_update";
    if (lower.includes("pre_stop")) return "pre_stop";
    if (lower.includes("pre_restart")) return "pre_restart";
    if (lower.includes("pre_restore")) return "pre_restore";
    return "manual";
  }

  private savedRootDir(server: ServerProfile): string {
    return join(server.installDir, "ShooterGame", "Saved");
  }

  private savedArksDir(server: ServerProfile): string {
    return join(this.savedRootDir(server), "SavedArks");
  }

  private configDir(server: ServerProfile): string {
    return join(
      this.savedRootDir(server),
      "Config",
      "WindowsServer",
    );
  }

  private humanSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
}
