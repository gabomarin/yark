import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { copyFile, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
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
  BackupKind,
  BackupPolicy,
  BackupPolicyStatus,
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
import type { CriticalJobSummary } from "../../../shared/types";
import { rconExec } from "../../infra/rcon/rcon-client";
import {
  backupKindSubdir,
  isZipBackupPath,
  parseBackupManifest,
  readZipTextEntry,
  validatePortableZip,
  zipDirectory,
} from "./backup-archive";
import {
  buildImportedZipFileName,
  portableImportNotes,
  resolveExportZipDestination,
  resolveImportedBackupId,
  slugBackupFilePart,
} from "./backup-portability";
import {
  ensureParentDir,
  isBackupDestinationReachable,
  sameFsPath,
} from "./backup-disk";
import {
  normalizePlayerKey,
  packageKind,
  packageSinglePlayer,
} from "./backup-package";
import { BackupReconciler } from "./backup-reconcile";
import { applyRestore } from "./backup-restore-apply";
import { classifyInstallHealthAsync } from "../instances/server-installation";
import { serverBinaryPath } from "../instances/launch-args";
import {
  BackupCriticalQueue,
  CRITICAL_BACKUP_KINDS,
  type BackupCriticalJobProgressHandlers,
} from "./backup-critical-queue";
import { DefaultBackupCriticalJobExecutor } from "./backup-critical-job-executor";
import {
  planBackupCleanup,
  summarizeCleanupPlan,
  type BackupCleanupPlanItem,
} from "./backup-cleanup-plan";
import {
  ALL_BACKUP_KINDS,
  assertRetainCount,
  retainCountForKind,
} from "./backup-policy-helpers";
import {
  buildBackupServerHealthRow,
  buildDiskUsageFromHealthRows,
  buildDiskVolumeAlerts,
  buildFleetAlertsForServer,
  computeFleetSummaryStats,
  filterDismissedFleetAlerts,
  listFailedBackupsSince,
  normalizeDiskAlertSettings,
  SCHEDULED_WORLD_FAIL_LIMIT,
  type DismissedFleetAlertEntry,
} from "./backup-fleet";

export {
  formatPlayerSessionNotes,
  playersRetentionKey,
} from "@shared/backup-player-meta";
export { computeBackupServerHealth } from "./backup-fleet";
export { CRITICAL_BACKUP_KINDS } from "./backup-critical-queue";

export interface BackupChangedPush {
  serverId: string;
}

const RCON_HOST = "127.0.0.1";
const INI_SAVE_BACKUP_DEBOUNCE_MS = 2_000;

/** Scheduled cadence creates world saves only (not players / INI). */
const SCHEDULED_BACKUP_KINDS: readonly BackupKind[] = ["world"];

/**
 * Kinds created for pre-update / pre-stop / pre-restart safety.
 * World already includes profiles/tribes in the active map folder, so a full
 * `players` snapshot is not duplicated on the critical path (#275).
 */
const DISK_ALERT_SETTINGS_KEY = "backupDiskAlerts.v1";
const DEFAULT_DISK_ALERT_SETTINGS: BackupDiskAlertSettings = {
  warnUsedPercent: 85,
  criticalUsedPercent: 95,
  warnFreeBytes: 20 * 1024 * 1024 * 1024,
};
/** Dismissed fleet alerts: alertId → fingerprint that was hidden. */
const DISMISSED_FLEET_ALERTS_KEY = "backupFleetAlerts.dismissed.v1";

/** Keep map tokens readable in filenames (`TheIsland_WP` → `TheIsland_WP`). */
function mapTokenFileSlug(mapToken: string): string {
  const trimmed = mapToken.trim();
  if (trimmed.length === 0) return "map";
  return trimmed.replace(/[^A-Za-z0-9_]+/g, "-").replace(/^-+|-+$/g, "") || "map";
}

function worldRetentionKey(backup: BackupRecord): string {
  return backup.mapToken?.trim().toLowerCase() || "__unscoped__";
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
function defaultServerBackupDir(installDir: string): string {
  return join(installDir, "Backups");
}

function resolveServerBackupRoot(
  installDir: string,
  backupDir: string | null | undefined,
): string {
  if (typeof backupDir === "string" && backupDir.trim().length > 0) {
    return backupDir.trim();
  }
  return defaultServerBackupDir(installDir);
}

/**
 * Local backup and restore management for ASA instances.
 * Kind-scoped ZIP archives under World / Player profiles / INI subfolders.
 */
export class BackupService extends EventEmitter {
  private readonly iniSaveTimers = new Map<string, NodeJS.Timeout>();
  private readonly iniSaveWaiters = new Map<
    string,
    Array<{ resolve: (value: BackupRecord | null) => void; reject: (error: Error) => void }>
  >();
  /** Backup ids currently inside createBackup — reconcile must not promote/fail these. */
  private readonly creatingBackupIds = new Set<string>();
  private readonly backupJobs = new Map<string, Promise<void>>();
  private readonly preStopBackupServers = new Set<string>();
  private readonly reconciler: BackupReconciler;
  /** Prevent stacked scheduled world backups for the same server. */
  private readonly scheduledWorldInFlight = new Set<string>();
  /**
   * Consecutive scheduled world failures per server (this YARK process only).
   * Cleared on success; at {@link SCHEDULED_WORLD_FAIL_LIMIT} the schedule pauses.
   */
  private readonly scheduledWorldFailStreak = new Map<string, number>();
  /** Session pause after repeated scheduled world failures — does not change policy.enabled. */
  private readonly scheduledWorldPaused = new Set<string>();
  /** Prevent overlapping runScheduledCycle walks. */
  private scheduledCycleInFlight = false;
  private readonly criticalQueue: BackupCriticalQueue;

  constructor(
    private readonly servers: ServerRepository,
    private readonly backups: BackupRepository,
    private readonly processes: ProcessManager,
    private readonly settings: AppSettingsRepository,
    _legacyRootBackupDir?: string,
  ) {
    super();
    this.reconciler = new BackupReconciler({
      servers: this.servers,
      backups: this.backups,
      creatingBackupIds: this.creatingBackupIds,
      emitChanged: (serverId) => this.emitChanged(serverId),
    });
    const criticalJobExecutor = new DefaultBackupCriticalJobExecutor({
      servers: this.servers,
      backups: this.backups,
      processes: this.processes,
      createBackups: (serverId, type, notes, kinds, options) =>
        this.createBackups(serverId, type, notes, kinds, options),
      reconcileDiskBackups: (serverId) => this.reconcileDiskBackups(serverId),
      mustServer: (serverId) => this.mustServer(serverId),
      applyRestore: (server, backup) => this.applyRestore(server, backup),
      emitChanged: (serverId) => this.emitChanged(serverId),
    });
    this.criticalQueue = new BackupCriticalQueue({
      servers: this.servers,
      backups: this.backups,
      settings: this.settings,
      executor: criticalJobExecutor,
      scheduleProcess: () => {
        void this.processQueue();
      },
    });
  }

  hasServerWork(serverId: string): boolean {
    if (this.backupJobs.has(serverId)) return true;
    if (this.iniSaveTimers.has(serverId)) return true;
    if (this.iniSaveWaiters.has(serverId)) return true;
    if (this.preStopBackupServers.has(serverId)) return true;
    if (this.scheduledWorldInFlight.has(serverId)) return true;
    if (this.creatingBackupIds.has(serverId)) return true;
    if (this.reconciler.hasWork(serverId)) return true;
    return this.criticalQueue.hasServerWork(serverId);
  }

  /** True when scheduled world creates are paused for this YARK session (#262). */
  isScheduledWorldPaused(serverId: string): boolean {
    return this.scheduledWorldPaused.has(serverId);
  }

  private emitChanged(serverId: string): void {
    this.emit("changed", { serverId } satisfies BackupChangedPush);
  }

  async createManualBackup(
    serverId: string,
    kinds?: BackupKind[],
  ): Promise<BackupRecord[]> {
    const source =
      kinds === undefined || kinds.length === 0
        ? (["world", "ini"] as BackupKind[])
        : kinds;
    if (source.includes("players")) {
      throw new Error(
        "Full player-profile snapshots are no longer supported. Use a World backup for everyone, or rely on automatic join/leave player archives.",
      );
    }
    return this.createBackups(serverId, "manual", null, normalizeKinds(source));
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
    return this.criticalQueue.enqueueAndWait<BackupRecord[]>(
      "pre-update-backup",
      serverId,
      null,
      {
      progress: options,
      },
    );
  }

  async restoreBackupForJob(
    serverId: string,
    backupId: string,
    options?: BackupCriticalJobProgressHandlers,
  ): Promise<void> {
    await this.criticalQueue.enqueueAndWait<void>("restore", serverId, backupId, {
      progress: options,
    });
  }

  /**
   * Abort pending backup critical jobs and signal running pre-apply work to stop
   * between kinds / packaging steps (does not interrupt `applying-restore`).
   */
  requestCancel(): boolean {
    return this.criticalQueue.requestCancel();
  }

  async restoreBackupForRollbackRecovery(
    serverId: string,
    backupId: string,
  ): Promise<void> {
    await this.criticalQueue.enqueueAndWait<void>("restore", serverId, backupId, {
      adoptRetryableRestore: true,
    });
  }

  getCriticalJobs(): CriticalJobSummary[] {
    return this.criticalQueue.getCriticalJobs();
  }

  /**
   * Resolve on-disk completed pre-update backups for resume/rollback.
   * Returns only {@link CRITICAL_BACKUP_KINDS} (world + ini), in that order.
   * Extra persisted ids (e.g. legacy `players` from before #275) are ignored.
   */
  getCompletedBackupsForCriticalJob(
    serverId: string,
    backupIds: readonly string[],
  ): BackupRecord[] {
    return this.criticalQueue.getCompletedBackups(serverId, backupIds);
  }

  retryCriticalJob(jobId: string): boolean {
    return this.criticalQueue.retryCriticalJob(jobId);
  }

  dismissCriticalJob(jobId: string): boolean {
    return this.criticalQueue.dismissCriticalJob(jobId);
  }

  cancelCriticalJob(jobId: string): boolean {
    return this.criticalQueue.cancelCriticalJob(jobId);
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

  getPolicy(serverId: string): BackupPolicyStatus {
    this.mustServer(serverId);
    return {
      ...this.backups.getPolicy(serverId),
      schedulePaused: this.scheduledWorldPaused.has(serverId),
    };
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
    const next = normalizeDiskAlertSettings(settings);
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
      const serverRunning = this.processes.isActive(server.id);
      const latestWorld = this.backups.latestCompleted(server.id, "world");
      const failed24h = listFailedBackupsSince(records, dayAgoIso);
      const failedWorld24h = failed24h.filter((row) => row.kind === "world");

      const row = buildBackupServerHealthRow({
        serverId: server.id,
        serverName: server.name,
        policy,
        resolvedRoot,
        records,
        latestWorld,
        destinationOk: isBackupDestinationReachable(resolvedRoot),
        serverRunning,
        schedulePaused: this.scheduledWorldPaused.has(server.id),
        nowMs: now,
      });
      healthRows.push(row);
      alerts.push(
        ...buildFleetAlertsForServer({
          row,
          failed24h,
          failedWorld24h,
          serverRunning,
        }),
      );
    }

    const disks = await buildDiskUsageFromHealthRows(healthRows);
    alerts.push(...buildDiskVolumeAlerts(disks, diskSettings));

    const visibleAlerts = this.applyDismissedFleetAlerts(alerts);

    return {
      servers: healthRows,
      stats: computeFleetSummaryStats(healthRows),
      disks,
      alerts: visibleAlerts,
      diskSettings,
    };
  }

  async previewCleanup(options: BackupCleanupOptions): Promise<BackupCleanupPreview> {
    await this.reconcileServersForCleanup(options);
    return summarizeCleanupPlan(this.buildCleanupPlan(options));
  }

  async runCleanup(options: BackupCleanupOptions): Promise<BackupCleanupResult> {
    await this.reconcileServersForCleanup(options);
    const confirmedIds = options.confirmedBackupIds;
    // Always recompute rules (incl. protectNewestWorld). Confirmed ids only
    // narrow the fresh plan so preview cannot delete a newly protected world.
    let plan = this.buildCleanupPlan(options);
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

  /** Remove every failed catalog row for one kind, including disk-less attempts. */
  async deleteFailedBackups(serverId: string, kind: BackupKind): Promise<number> {
    this.mustServer(serverId);
    const failed = this.backups.listFailed(serverId, kind);
    if (failed.length === 0) return 0;
    for (const backup of failed) {
      await rm(backup.path, { recursive: true, force: true });
      this.backups.deleteBackupRecord(backup.id);
      this.servers.addEvent(
        serverId,
        "backup_deleted",
        "info",
        `Failed backup record cleared: ${basename(backup.path)} (${backup.kind})`,
      );
    }
    this.emitChanged(serverId);
    return failed.length;
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
    const destZip = resolveExportZipDestination(dest);
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
    const preferredName = buildImportedZipFileName({
      serverName: server.name,
      kind,
      stamp,
    });
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
      const parsed = parseBackupManifest(manifestRaw);
      const createdAt = parsed?.createdAt ?? info.mtime.toISOString();
      const type = parsed?.type ?? "manual";
      const id = resolveImportedBackupId(
        parsed?.id,
        parsed?.id !== undefined && this.backups.getBackup(parsed.id) !== null,
      );
      record = this.backups.insertCompletedBackup({
        id,
        serverId,
        type,
        kind: parsed?.kind ?? kind,
        path: destPath,
        sizeBytes: info.size,
        createdAt,
        completedAt: createdAt,
        notes: parsed?.notes ?? portableImportNotes(basename(sourceResolved)),
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

    // Reconcile even when creates are session-paused so interrupted running
    // rows / temp artifacts are not stranded for the rest of the process.
    const reconciled = await this.reconcileInterruptedRunningBackups(server.id);
    if (reconciled > 0) {
      this.emitChanged(server.id);
    }
    if (this.scheduledWorldPaused.has(server.id)) return;

    if (
      this.scheduledWorldInFlight.has(server.id)
      || this.backups.hasRunning(server.id, "world")
    ) {
      return;
    }

    const requiredMs = policy.intervalMinutes * 60 * 1000;
    // Gate on last finished scheduled world (completed or failed) so failures
    // do not retry every ~60s scheduler tick.
    const latestScheduledWorld = this.backups.latestFinished(
      server.id,
      "world",
      "scheduled",
    );
    if (latestScheduledWorld !== null) {
      const finishedAt = backupFinishedAt(latestScheduledWorld);
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
      this.scheduledWorldFailStreak.delete(server.id);
    } catch (err) {
      const streak = (this.scheduledWorldFailStreak.get(server.id) ?? 0) + 1;
      this.scheduledWorldFailStreak.set(server.id, streak);
      if (streak >= SCHEDULED_WORLD_FAIL_LIMIT) {
        this.scheduledWorldPaused.add(server.id);
        this.servers.addEvent(
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
      return normalizeDiskAlertSettings({
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
    const { visible, prunedDismissed } = filterDismissedFleetAlerts(alerts, dismissed);
    const prevKeys = Object.keys(dismissed).sort().join("\0");
    const nextKeys = Object.keys(prunedDismissed).sort().join("\0");
    if (prevKeys !== nextKeys) {
      this.writeDismissedFleetAlerts(prunedDismissed);
    }
    return visible;
  }

  private resolveCleanupServers(options: BackupCleanupOptions): ServerProfile[] {
    const allServers = this.servers.list();
    const selectedIds =
      options.serverIds !== null && options.serverIds.length > 0
        ? new Set(options.serverIds)
        : null;
    return selectedIds === null
      ? allServers
      : allServers.filter((server) => selectedIds.has(server.id));
  }

  private buildCleanupPlan(options: BackupCleanupOptions): BackupCleanupPlanItem[] {
    const servers = this.resolveCleanupServers(options);
    return planBackupCleanup({
      options,
      servers: servers.map((server) => ({ id: server.id, name: server.name })),
      catalog: {
        getPolicy: (serverId) => this.backups.getPolicy(serverId),
        listBackups: (serverId, limit) => this.backups.listBackups(serverId, limit),
        listCompleted: (serverId, kind) => this.backups.listCompleted(serverId, kind),
        latestCompleted: (serverId, kind) => this.backups.latestCompleted(serverId, kind),
      },
    });
  }

  /** Import orphan archives before cleanup so disk-only zips are eligible. */
  private async reconcileServersForCleanup(
    options: BackupCleanupOptions,
  ): Promise<void> {
    for (const server of this.resolveCleanupServers(options)) {
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
    // The full stop batch already includes world + INI; do not queue
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
        ? `-${slugBackupFilePart(options.playerKey).slice(0, 24)}`
        : "";
    const mapSlug =
      kind === "world" && server.map.trim().length > 0
        ? `-${mapTokenFileSlug(server.map)}`
        : "";
    const preferredName =
      `${slugBackupFilePart(server.name)}-${kind}-${type}${mapSlug}${playerSlug}-${stamp}.zip`;
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
          ? await packageSinglePlayer(server, stagingDir, options.playerKey, {
              waitForProfile: options.waitForProfile === true,
            })
          : await packageKind(server, kind, stagingDir);

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
        // Disaster recovery: live map folder may already be gone. Skip the
        // empty pre_restore safeguard so restore can recreate it.
        if (type === "pre_restore") {
          await rm(stagingDir, { recursive: true, force: true });
          await rm(zipPath, { force: true }).catch(() => undefined);
          this.backups.deleteBackupRecord(record.id);
          this.creatingBackupIds.delete(record.id);
          return null;
        }
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

  private throwIfCancelled(): void {
    this.criticalQueue.throwIfCancelled();
  }

  private async processQueue(): Promise<void> {
    await this.criticalQueue.processQueue();
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
    return this.reconciler.reconcileDiskBackups(serverId);
  }

  private reconcileInterruptedRunningBackups(serverId: string): Promise<number> {
    return this.reconciler.reconcileInterruptedRunningBackups(serverId);
  }

  private applyRestore(
    server: ServerProfile,
    backup: BackupRecord,
    options?: RestoreBackupOptions,
  ): Promise<void> {
    return applyRestore(server, backup, options);
  }

  private humanSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
}
