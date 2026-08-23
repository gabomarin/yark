import { EventEmitter } from "node:events";
import { rm } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { formatPlayerSessionNotes } from "@shared/backup-player-meta";
import type {
  BackupCleanupOptions,
  BackupCleanupPreview,
  BackupCleanupResult,
  BackupDiskAlertSettings,
  BackupFleetSummary,
  BackupKind,
  BackupPolicy,
  BackupPolicyStatus,
  BackupRecord,
  RestoreBackupOptions,
  ServerProfile,
} from "@shared/types";
import type { ServerRepository } from "../../infra/db/server-repository";
import { MIN_INTERVAL_MINUTES } from "../../infra/db/backup-repository";
import type { BackupRepository } from "../../infra/db/backup-repository";
import type { ProcessManager } from "../../infra/process/process-manager";
import type { AppSettingsRepository } from "../../infra/db/app-settings-repository";
import type { CriticalJobSummary } from "../../../shared/types";
import { isZipBackupPath } from "./backup-archive";
import { normalizePlayerKey } from "./backup-package";
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
} from "./backup-policy-helpers";
import {
  BackupCreatePipeline,
  resolveServerBackupRoot,
} from "./backup-create-pipeline";
import { BackupPortabilityOps } from "./backup-portability-ops";
import { BackupRetention } from "./backup-retention";
import { BackupScheduleRuntime } from "./backup-schedule-runtime";
import { BackupFleetOps } from "./backup-fleet-ops";

export {
  formatPlayerSessionNotes,
  playersRetentionKey,
} from "@shared/backup-player-meta";
export { computeBackupServerHealth } from "./backup-fleet";
export { CRITICAL_BACKUP_KINDS } from "./backup-critical-queue";

export interface BackupChangedPush {
  serverId: string;
}

const INI_SAVE_BACKUP_DEBOUNCE_MS = 2_000;

/** Scheduled cadence creates world saves only (not players / INI). */
const SCHEDULED_BACKUP_KINDS: readonly BackupKind[] = ["world"];

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
   * Cleared on success; at SCHEDULED_WORLD_FAIL_LIMIT the schedule pauses.
   */
  private readonly scheduledWorldFailStreak = new Map<string, number>();
  /** Session pause after repeated scheduled world failures — does not change policy.enabled. */
  private readonly scheduledWorldPaused = new Set<string>();
  private readonly criticalQueue: BackupCriticalQueue;
  private readonly createPipeline: BackupCreatePipeline;
  private readonly scheduleRuntime: BackupScheduleRuntime;
  private readonly retention: BackupRetention;
  private readonly portability: BackupPortabilityOps;
  private readonly fleetOps: BackupFleetOps;

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
    this.retention = new BackupRetention({
      servers: this.servers,
      backups: this.backups,
      emitChanged: (serverId) => this.emitChanged(serverId),
    });
    this.createPipeline = new BackupCreatePipeline({
      servers: this.servers,
      backups: this.backups,
      processes: this.processes,
      creatingBackupIds: this.creatingBackupIds,
      backupJobs: this.backupJobs,
      preStopBackupServers: this.preStopBackupServers,
      mustServer: (serverId) => this.mustServer(serverId),
      assertInstallReadyForLiveOps: (server) => this.assertInstallReadyForLiveOps(server),
      throwIfCancelled: () => this.throwIfCancelled(),
      applyRetention: (serverId, policy) => this.applyRetention(serverId, policy),
      emitChanged: (serverId) => this.emitChanged(serverId),
    });
    this.scheduleRuntime = new BackupScheduleRuntime({
      servers: this.servers,
      backups: this.backups,
      processes: this.processes,
      scheduledWorldInFlight: this.scheduledWorldInFlight,
      scheduledWorldFailStreak: this.scheduledWorldFailStreak,
      scheduledWorldPaused: this.scheduledWorldPaused,
      applyRetention: (serverId, policy) => this.applyRetention(serverId, policy),
      reconcileInterruptedRunningBackups: (serverId) =>
        this.reconcileInterruptedRunningBackups(serverId),
      emitChanged: (serverId) => this.emitChanged(serverId),
      createScheduledBackup: (serverId) => this.createScheduledBackup(serverId),
      isInstallReady: (server) => this.isInstallReady(server),
    });
    this.portability = new BackupPortabilityOps({
      servers: this.servers,
      backups: this.backups,
      mustServer: (serverId) => this.mustServer(serverId),
      emitChanged: (serverId) => this.emitChanged(serverId),
    });
    this.fleetOps = new BackupFleetOps({
      servers: this.servers,
      backups: this.backups,
      processes: this.processes,
      settings: this.settings,
      scheduledWorldPaused: this.scheduledWorldPaused,
      reconcileDiskBackups: (serverId) => this.reconcileDiskBackups(serverId),
    });
    const criticalJobExecutor = new DefaultBackupCriticalJobExecutor({
      servers: this.servers,
      backups: this.backups,
      processes: this.processes,
      createBackups: (serverId, type, notes, kinds, options) =>
        this.createPipeline.createBackups(serverId, type, notes, kinds, options),
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
    return this.createPipeline.createBackups(serverId, "manual", null, normalizeKinds(source));
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
        void this.createPipeline.createSingleBackup(
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
    await this.createPipeline.flushWorldIfActive(serverId);
    return this.createPipeline.createSingleBackup(serverId, type, "players", notes, {
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
    return this.createPipeline.createBackups(
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
      return await this.createPipeline.createBackups(
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
    return this.createPipeline.createBackups(
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
    return this.fleetOps.getDiskAlertSettings();
  }

  setDiskAlertSettings(settings: BackupDiskAlertSettings): BackupDiskAlertSettings {
    return this.fleetOps.setDiskAlertSettings(settings);
  }

  dismissFleetAlert(alertId: string, fingerprint: string): void {
    this.fleetOps.dismissFleetAlert(alertId, fingerprint);
  }

  async getFleetSummary(): Promise<BackupFleetSummary> {
    return this.fleetOps.getFleetSummary();
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

  async exportBackup(
    serverId: string,
    backupId: string,
    destinationPath: string,
  ): Promise<string> {
    return this.portability.exportBackup(serverId, backupId, destinationPath);
  }

  async importBackup(
    serverId: string,
    kind: BackupKind,
    sourcePath: string,
  ): Promise<BackupRecord> {
    return this.portability.importBackup(serverId, kind, sourcePath);
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
      await this.createPipeline.createBackups(
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
    return this.scheduleRuntime.runScheduledCycle();
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

  private throwIfCancelled(): void {
    this.criticalQueue.throwIfCancelled();
  }

  private async processQueue(): Promise<void> {
    await this.criticalQueue.processQueue();
  }

  private async applyRetention(serverId: string, policy: BackupPolicy): Promise<void> {
    return this.retention.applyRetention(serverId, policy);
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

}
