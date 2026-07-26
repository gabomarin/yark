import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import {
  formatPlayerSessionNotes,
  playersRetentionKey,
} from "@shared/backup-player-meta";
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
  ServerProfile,
} from "@shared/types";
import type { ServerRepository } from "../../infra/db/server-repository";
import { MIN_INTERVAL_MINUTES } from "../../infra/db/backup-repository";
import type { BackupRepository } from "../../infra/db/backup-repository";
import type { ProcessManager } from "../../infra/process/process-manager";
import type { AppSettingsRepository } from "../../infra/db/app-settings-repository";
import { rconExec } from "../../infra/rcon/rcon-client";
import { syncProfileSettingsToIni } from "../instances/sync-profile-ini";
import {
  backupKindSubdir,
  extractZip,
  isReadableZipArchive,
  isZipBackupPath,
  kindFromSubdirName,
  readZipTextEntry,
  zipDirectory,
  zipHasBackupLayout,
} from "./backup-archive";
import {
  isBackupDestinationReachable,
  readVolumeSpace,
  volumeRootForPath,
} from "./backup-disk";

export { formatPlayerSessionNotes, playersRetentionKey } from "@shared/backup-player-meta";
export { backupKindSubdir } from "./backup-archive";

export interface BackupChangedPush {
  serverId: string;
}

/** Pure fleet health badge for one server (used by getFleetSummary). */
export function computeBackupServerHealth(input: {
  destinationOk: boolean;
  stale: boolean;
  failed24h: number;
  scheduleEnabled: boolean;
  hasWorldBackup: boolean;
  /** Scheduled world backups only run while the process is active. */
  serverRunning: boolean;
}): BackupHealthStatus {
  if (!input.destinationOk || input.failed24h > 0) return "critical";
  // World schedule skips stopped servers — without a completed world archive this
  // is never "Protected", whether the process is running or not.
  if (input.scheduleEnabled && !input.hasWorldBackup) {
    return "warning";
  }
  if (input.stale) return "warning";
  if (!input.scheduleEnabled && !input.hasWorldBackup) return "unknown";
  // Keep serverRunning in the contract so callers must pass process state.
  void input.serverRunning;
  return "ok";
}

/** Prefer finish time for age/ordering; fall back to start if incomplete. */
export function backupFinishedAt(backup: BackupRecord): string {
  return backup.completedAt ?? backup.createdAt;
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
/** World backup is stale when older than interval × this factor. */
const STALE_INTERVAL_FACTOR = 1.5;

type BackupCriticalJobType = "pre-update-backup" | "restore";

interface BackupCriticalJob {
  id: string;
  type: BackupCriticalJobType;
  serverId: string;
  backupId: string | null;
  attempts: number;
  maxAttempts: number;
  status: "pending" | "running";
  createdAt: string;
  updatedAt: string;
  lastError: string | null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
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

  constructor(
    private readonly servers: ServerRepository,
    private readonly backups: BackupRepository,
    private readonly processes: ProcessManager,
    private readonly settings: AppSettingsRepository,
    _legacyRootBackupDir?: string,
  ) {
    super();
    this.queue = this.loadQueue();
    if (this.queue.length > 0) {
      setTimeout(() => {
        void this.processQueue();
      }, 250);
    }
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
        void this.createBackup(
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
    return this.createBackup(serverId, type, "players", notes, {
      playerKey: key,
      waitForProfile: event === "disconnect",
    });
  }

  async createPreRestartBackup(serverId: string): Promise<BackupRecord[]> {
    return this.createBackups(
      serverId,
      "pre_restart",
      null,
      [...CRITICAL_BACKUP_KINDS],
    );
  }

  async createScheduledBackup(serverId: string): Promise<BackupRecord[]> {
    return this.createBackups(
      serverId,
      "scheduled",
      "Scheduled backup",
      [...SCHEDULED_BACKUP_KINDS],
    );
  }

  async createPreUpdateBackupForJob(serverId: string): Promise<BackupRecord[]> {
    return this.enqueueAndWait<BackupRecord[]>("pre-update-backup", serverId, null);
  }

  async restoreBackupForJob(serverId: string, backupId: string): Promise<void> {
    await this.enqueueAndWait<void>("restore", serverId, backupId);
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
          message: `${server.name}: backup destination is missing or unreachable (${resolvedRoot})`,
        });
      }
      if (policy.enabled && latestWorld === null) {
        const runningHint = this.processes.isActive(server.id)
          ? "waiting for the next scheduled cycle"
          : "start the server so the world schedule can run";
        alerts.push({
          id: `never_backed_up:${server.id}`,
          kind: "never_backed_up",
          severity: "warning",
          serverId: server.id,
          volumePath: null,
          message: `${server.name}: world schedule is on but no completed world backup exists yet (${runningHint})`,
        });
      } else if (stale && latestWorld !== null) {
        alerts.push({
          id: `stale:${server.id}`,
          kind: "stale",
          severity: "warning",
          serverId: server.id,
          volumePath: null,
          message: `${server.name}: last world backup is older than the scheduled interval`,
        });
      }
      if (counts.failed24h > 0) {
        alerts.push({
          id: `failed:${server.id}`,
          kind: "failed",
          severity: "error",
          serverId: server.id,
          volumePath: null,
          message: `${server.name}: ${counts.failed24h} failed backup${counts.failed24h === 1 ? "" : "s"} in the last 24h`,
        });
      }
    }

    const disks = await this.buildDiskUsage(healthRows);
    for (const disk of disks) {
      if (disk.usedPercent === null || disk.freeBytes === null) continue;
      const overCritical = disk.usedPercent >= diskSettings.criticalUsedPercent;
      const overWarn = disk.usedPercent >= diskSettings.warnUsedPercent;
      const lowFree = disk.freeBytes < diskSettings.warnFreeBytes;
      if (overCritical) {
        alerts.push({
          id: `disk_critical:${disk.volumePath}`,
          kind: "disk_critical",
          severity: "error",
          serverId: null,
          volumePath: disk.volumePath,
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

    return {
      servers: healthRows,
      stats: {
        protectedCount,
        atRiskCount,
        failed24h,
        totalBackupBytes,
      },
      disks,
      alerts,
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
      totalBytes += Math.max(0, item.backup.sizeBytes);
      const current = byServerMap.get(item.backup.serverId) ?? {
        serverId: item.backup.serverId,
        serverName: item.serverName,
        count: 0,
        bytes: 0,
      };
      current.count += 1;
      current.bytes += Math.max(0, item.backup.sizeBytes);
      byServerMap.set(item.backup.serverId, current);
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

  async restoreBackup(serverId: string, backupId: string): Promise<void> {
    const server = this.mustServer(serverId);
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
      await this.applyRestore(server, backup);

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

  async backupThenRestart(serverId: string): Promise<void> {
    const server = this.mustServer(serverId);
    await this.createPreRestartBackup(serverId);
    await this.processes.stop(server);
    this.servers.addEvent(
      serverId,
      "server_stopped",
      "info",
      `Server \"${server.name}\" stopped for safe restart`,
    );
    await syncProfileSettingsToIni(server);
    this.processes.start(server);
    this.servers.addEvent(
      serverId,
      "server_started",
      "info",
      `Server \"${server.name}\" restarted with prior backup`,
    );
  }

  /** Runs policy backups and cleans retention per server. */
  async runScheduledCycle(): Promise<void> {
    const allServers = this.servers.list();
    for (const server of allServers) {
      const policy = this.backups.getPolicy(server.id);
      await this.applyRetention(server.id, policy);
      if (!policy.enabled) continue;

      const latestWorld = this.backups.latestCompleted(server.id, "world");
      if (latestWorld !== null) {
        const finishedAt = backupFinishedAt(latestWorld);
        const elapsedMs = Date.now() - Date.parse(finishedAt);
        const requiredMs = policy.intervalMinutes * 60 * 1000;
        if (Number.isFinite(elapsedMs) && elapsedMs < requiredMs) continue;
      }

      if (!this.processes.isActive(server.id)) continue;
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
      }
    }
  }

  private mustServer(serverId: string): ServerProfile {
    const server = this.servers.get(serverId);
    if (server === null) {
      throw new Error("Server does not exist");
    }
    return server;
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
    const server = this.mustServer(serverId);
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
  ): Promise<BackupRecord[]> {
    await this.flushWorldIfActive(serverId);

    const created: BackupRecord[] = [];
    for (const kind of kinds) {
      const record = await this.createBackup(serverId, type, kind, notes);
      if (record !== null) {
        created.push(record);
      }
    }
    return created;
  }

  private async createBackup(
    serverId: string,
    type: BackupType,
    kind: BackupKind,
    notes: string | null,
    options?: { playerKey?: string; waitForProfile?: boolean },
  ): Promise<BackupRecord | null> {
    const server = this.mustServer(serverId);
    const policy = this.backups.getPolicy(serverId);
    const rootDir = resolveServerBackupRoot(server.installDir, policy.backupDir);
    const kindDir = join(rootDir, backupKindSubdir(kind));

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const playerSlug =
      options?.playerKey !== undefined && options.playerKey.length > 0
        ? `-${slug(options.playerKey).slice(0, 24)}`
        : "";
    const baseName = `${timestamp}-${type}-${kind}${playerSlug}-${slug(server.name)}`;
    const zipPath = join(kindDir, `${baseName}.zip`);
    const stagingDir = join(tmpdir(), `yark-backup-${randomUUID()}`);

    await mkdir(kindDir, { recursive: true });
    await mkdir(stagingDir, { recursive: true });

    const record = this.backups.createBackupStart({
      serverId,
      type,
      kind,
      path: zipPath,
      notes,
    });
    this.creatingBackupIds.add(record.id);

    try {
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
        this.backups.deleteBackupRecord(record.id);
        return null;
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

      const sizeBytes = await zipDirectory(stagingDir, zipPath);
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
    const savedArks = this.savedArksDir(server);
    const dest = join(targetDir, "SavedArks");

    if (!existsSync(savedArks)) {
      await mkdir(dest, { recursive: true });
      return { meta: { empty: true, fileCount: 0, savedArksPresent: false } };
    }

    // Full SavedArks snapshot (world + tribes + player profiles).
    await cp(savedArks, dest, { recursive: true, force: true });
    const fileCount = (await listFilesRecursive(dest)).length;
    return { meta: { empty: fileCount === 0, fileCount, savedArksPresent: true } };
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

  private async applyRestore(server: ServerProfile, backup: BackupRecord): Promise<void> {
    await this.withBackupContents(backup.path, async (root) => {
      if (backup.kind === "world") {
        await this.restoreWorld(server, root);
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

  private async restoreWorld(server: ServerProfile, backupPath: string): Promise<void> {
    const backupSaved = join(backupPath, "SavedArks");
    const live = this.savedArksDir(server);
    if (!existsSync(backupSaved)) {
      throw new Error("World backup is missing SavedArks data");
    }
    // Replace semantics: remove old artifacts that are not present in the backup.
    await rm(live, { recursive: true, force: true });
    await mkdir(dirname(live), { recursive: true });
    // Full SavedArks restore (includes profiles present in the world backup).
    await cp(backupSaved, live, { recursive: true, force: true });
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

  private async enqueueAndWait<T>(
    type: BackupCriticalJobType,
    serverId: string,
    backupId: string | null,
  ): Promise<T> {
    const existingPending = this.queue.find(
      (job) =>
        job.serverId === serverId
        && job.type === type
        && job.backupId === backupId,
    );
    if (existingPending !== undefined) {
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
      createdAt: now,
      updatedAt: now,
      lastError: null,
    };

    this.queue.push(job);
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
        const job = this.queue.find((candidate) => candidate.status === "pending");
        if (job === undefined) {
          break;
        }

        job.status = "running";
        job.updatedAt = new Date().toISOString();
        this.persistQueue();

        try {
          let result: unknown;
          if (job.type === "pre-update-backup") {
            result = await this.createBackups(
              job.serverId,
              "pre_update",
              "Pre-update backup",
              [...CRITICAL_BACKUP_KINDS],
            );
          } else {
            if (job.backupId === null || job.backupId.trim().length === 0) {
              throw new Error("backupId required for restore job");
            }
            await this.restoreBackup(job.serverId, job.backupId);
            result = undefined;
          }

          this.resolveJob(job.id, result);
          this.removeJob(job.id);
          this.persistQueue();
        } catch (error) {
          job.attempts += 1;
          job.lastError = error instanceof Error ? error.message : String(error);
          job.updatedAt = new Date().toISOString();

          if (job.attempts >= job.maxAttempts) {
            this.rejectJob(job.id, new Error(job.lastError));
            this.servers.addEvent(
              job.serverId,
              "error",
              "error",
              `Job ${job.type} exhausted retries (${job.maxAttempts}): ${job.lastError}`,
            );
            this.removeJob(job.id);
            this.persistQueue();
            continue;
          }

          job.status = "pending";
          this.persistQueue();
          this.servers.addEvent(
            job.serverId,
            "error",
            "warning",
            `Job ${job.type} will retry (${job.attempts}/${job.maxAttempts})`,
          );
          await delay(BACKUP_JOB_RETRY_DELAY_MS);
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
      const parsed = JSON.parse(raw) as BackupCriticalJob[];
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .filter((job) =>
          typeof job.id === "string"
          && (job.type === "pre-update-backup" || job.type === "restore")
          && typeof job.serverId === "string",
        )
        .map((job) => ({
          ...job,
          backupId: typeof job.backupId === "string" ? job.backupId : null,
          status: "pending" as const,
          attempts: Number.isFinite(job.attempts) ? Math.max(0, Math.floor(job.attempts)) : 0,
          maxAttempts: Number.isFinite(job.maxAttempts)
            ? Math.max(1, Math.floor(job.maxAttempts))
            : 3,
          updatedAt: new Date().toISOString(),
        }));
    } catch {
      return [];
    }
  }

  private persistQueue(): void {
    this.settings.set(BACKUP_CRITICAL_JOBS_KEY, JSON.stringify(this.queue));
  }

  private removeJob(jobId: string): void {
    this.queue = this.queue.filter((job) => job.id !== jobId);
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

  /** Retain last N completed backups; players use per-player pools when annotated. */
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
  private async reconcileInterruptedRunningBackups(serverId: string): Promise<number> {
    const records = this.backups.listBackups(serverId, 10_000);
    let changed = 0;
    for (const backup of records) {
      if (backup.status !== "running") continue;
      if (this.creatingBackupIds.has(backup.id)) continue;

      if (isZipBackupPath(backup.path) && existsSync(backup.path)) {
        const readable = await isReadableZipArchive(backup.path);
        const hasLayout = readable ? await zipHasBackupLayout(backup.path) : false;
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
  } | null {
    if (raw === null || raw.trim().length === 0) return null;
    try {
      const data = JSON.parse(raw) as {
        backup?: {
          id?: string;
          type?: string;
          kind?: string;
          createdAt?: string;
          notes?: string;
        };
      };
      const backup = data.backup;
      if (backup === undefined) return null;
      const type = this.asBackupType(backup.type);
      const kind = this.asBackupKind(backup.kind);
      return {
        id: typeof backup.id === "string" ? backup.id : undefined,
        type,
        kind,
        createdAt: typeof backup.createdAt === "string" ? backup.createdAt : undefined,
        notes: typeof backup.notes === "string" ? backup.notes : undefined,
      };
    } catch {
      return null;
    }
  }

  private asBackupType(value: string | undefined): BackupType | undefined {
    const allowed: BackupType[] = [
      "manual",
      "scheduled",
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
