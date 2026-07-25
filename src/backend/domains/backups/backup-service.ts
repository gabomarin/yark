import { existsSync } from "node:fs";
import { cp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { randomUUID } from "node:crypto";
import {
  formatPlayerSessionNotes,
  playersRetentionKey,
} from "@shared/backup-player-meta";
import type {
  BackupKind,
  BackupPolicy,
  BackupRecord,
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

export { formatPlayerSessionNotes, playersRetentionKey } from "@shared/backup-player-meta";

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
 * Kind-scoped: world (full SavedArks including profiles), players (.arkprofile*), INI configs.
 */
export class BackupService {
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

  constructor(
    private readonly servers: ServerRepository,
    private readonly backups: BackupRepository,
    private readonly processes: ProcessManager,
    private readonly settings: AppSettingsRepository,
    private readonly rootBackupDir: string,
  ) {
    this.queue = this.loadQueue();
    if (this.queue.length > 0) {
      setTimeout(() => {
        void this.processQueue();
      }, 250);
    }
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

  list(serverId: string, limit: number): BackupRecord[] {
    return this.backups.listBackups(serverId, Math.max(1, Math.min(limit, 100)));
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
    return backup.path;
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
        const elapsedMs = Date.now() - Date.parse(latestWorld.createdAt);
        const requiredMs = policy.intervalMinutes * 60 * 1000;
        if (elapsedMs < requiredMs) continue;
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

  private async createBackups(
    serverId: string,
    type: BackupType,
    notes: string | null,
    kinds: BackupKind[],
  ): Promise<BackupRecord[]> {
    const server = this.mustServer(serverId);
    if (this.processes.isActive(serverId)) {
      try {
        await rconExec(RCON_HOST, server.rconPort, server.adminPassword, "SaveWorld");
      } catch {
        // Hot backup can continue even if SaveWorld fails.
      }
    }

    const created: BackupRecord[] = [];
    for (const kind of kinds) {
      created.push(await this.createBackup(serverId, type, kind, notes));
    }
    return created;
  }

  private async createBackup(
    serverId: string,
    type: BackupType,
    kind: BackupKind,
    notes: string | null,
    options?: { playerKey?: string; waitForProfile?: boolean },
  ): Promise<BackupRecord> {
    const server = this.mustServer(serverId);
    const policy = this.backups.getPolicy(serverId);
    const rootDir = resolveServerBackupRoot(server.installDir, policy.backupDir);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const playerSlug =
      options?.playerKey !== undefined && options.playerKey.length > 0
        ? `-${slug(options.playerKey).slice(0, 24)}`
        : "";
    const folderName = `${timestamp}-${type}-${kind}${playerSlug}-${slug(server.name)}`;
    const targetDir = join(rootDir, folderName);
    await mkdir(targetDir, { recursive: true });

    const record = this.backups.createBackupStart({
      serverId,
      type,
      kind,
      path: targetDir,
      notes,
    });

    try {
      const packaged =
        options?.playerKey !== undefined && kind === "players"
          ? await this.packageSinglePlayer(server, targetDir, options.playerKey, {
              waitForProfile: options.waitForProfile === true,
            })
          : await this.packageKind(server, kind, targetDir);

      await writeFile(
        join(targetDir, "manifest.json"),
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

      const sizeBytes = await directorySize(targetDir);
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

      await this.applyRetention(serverId, policy);
      return completed;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.backups.failBackup(record.id, message);
      this.servers.addEvent(
        serverId,
        "error",
        "error",
        `Backup ${type}/${kind} failed for \"${server.name}\": ${message}`,
      );
      throw err;
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
          if (
            normalizedStem !== needle
            && !normalizedStem.includes(needle)
            && !needle.includes(normalizedStem)
          ) {
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
    if (backup.kind === "world") {
      await this.restoreWorld(server, backup.path);
      return;
    }
    if (backup.kind === "players") {
      await this.restorePlayers(server, backup.path);
      return;
    }
    await this.restoreIni(server, backup.path);
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
