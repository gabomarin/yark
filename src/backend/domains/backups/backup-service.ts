import { cp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { BackupPolicy, BackupRecord, ServerProfile } from "@shared/types";
import type { ServerRepository } from "../../infra/db/server-repository";
import type { BackupRepository } from "../../infra/db/backup-repository";
import type { ProcessManager } from "../../infra/process/process-manager";
import type { AppSettingsRepository } from "../../infra/db/app-settings-repository";
import { rconExec } from "../../infra/rcon/rcon-client";

const RCON_HOST = "127.0.0.1";
const BACKUP_CRITICAL_JOBS_KEY = "backupCriticalJobsQueue.v1";
const BACKUP_JOB_RETRY_DELAY_MS = 5000;

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

async function directorySize(path: string): Promise<number> {
  let total = 0;
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

/**
 * Gestión de backups y restore local para instancias ASA.
 * Copia carpeta SavedArks + configuración WindowsServer.
 */
export class BackupService {
  private queue: BackupCriticalJob[] = [];
  private processingQueue = false;
  private readonly waiters = new Map<string, Array<{
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>>();

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

  async createManualBackup(serverId: string): Promise<BackupRecord> {
    return this.createBackup(serverId, "manual", null);
  }

  async createPreRestartBackup(serverId: string): Promise<BackupRecord> {
    return this.createBackup(serverId, "pre_restart", null);
  }

  async createScheduledBackup(serverId: string): Promise<BackupRecord> {
    return this.createBackup(serverId, "scheduled", "Backup programado");
  }

  async createPreUpdateBackupForJob(serverId: string): Promise<BackupRecord> {
    return this.enqueueAndWait<BackupRecord>("pre-update-backup", serverId, null);
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
    if (policy.intervalMinutes < 15) {
      throw new Error("El intervalo mínimo de backup es 15 minutos");
    }
    if (policy.retainCount < 1 || policy.retainCount > 500) {
      throw new Error("retainCount debe estar entre 1 y 500");
    }
    if (policy.retainDays < 1 || policy.retainDays > 365) {
      throw new Error("retainDays debe estar entre 1 y 365");
    }
    return this.backups.setPolicy({
      serverId,
      enabled: policy.enabled,
      intervalMinutes: policy.intervalMinutes,
      retainCount: policy.retainCount,
      retainDays: policy.retainDays,
    });
  }

  async restoreBackup(serverId: string, backupId: string): Promise<void> {
    const server = this.mustServer(serverId);
    if (this.processes.isActive(serverId)) {
      throw new Error("Detén el servidor antes de restaurar un backup");
    }
    const backup = this.backups.getBackup(backupId);
    if (backup === null || backup.serverId !== serverId || backup.status !== "completed") {
      throw new Error("Backup no válido para restauración");
    }

    const restoreHistoryId = this.backups.insertRestoreHistory({
      serverId,
      backupId,
      status: "started",
      notes: null,
    });

    try {
      // Salvaguarda antes de reemplazar datos del servidor.
      await this.createBackup(serverId, "pre_restore", "Salvaguarda antes de restore");
      const savedArksDir = this.savedArksDir(server);
      const configDir = this.configDir(server);
      const backupSaved = join(backup.path, "SavedArks");
      const backupConfig = join(backup.path, "ConfigWindowsServer");

      await rm(savedArksDir, { recursive: true, force: true });
      await rm(configDir, { recursive: true, force: true });
      await mkdir(savedArksDir, { recursive: true });
      await mkdir(configDir, { recursive: true });
      await cp(backupSaved, savedArksDir, { recursive: true, force: true });
      await cp(backupConfig, configDir, { recursive: true, force: true });

      this.servers.addEvent(
        serverId,
        "backup_restored",
        "info",
        `Restore aplicado en \"${server.name}\" desde backup ${backup.id}`,
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
      `Servidor \"${server.name}\" detenido para restart seguro`,
    );
    this.processes.start(server);
    this.servers.addEvent(
      serverId,
      "server_started",
      "info",
      `Servidor \"${server.name}\" reiniciado con backup previo`,
    );
  }

  /** Ejecuta backups por política y limpia retención por servidor. */
  async runScheduledCycle(): Promise<void> {
    const allServers = this.servers.list();
    for (const server of allServers) {
      const policy = this.backups.getPolicy(server.id);
      await this.applyRetention(server.id, policy);
      if (!policy.enabled) continue;

      const latest = this.backups.latestCompleted(server.id);
      if (latest !== null) {
        const elapsedMs = Date.now() - Date.parse(latest.createdAt);
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
          `Fallo backup programado de \"${server.name}\": ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  private mustServer(serverId: string): ServerProfile {
    const server = this.servers.get(serverId);
    if (server === null) {
      throw new Error("El servidor no existe");
    }
    return server;
  }

  private async createBackup(
    serverId: string,
    type: BackupRecord["type"],
    notes: string | null,
  ): Promise<BackupRecord> {
    const server = this.mustServer(serverId);
    const policy = this.backups.getPolicy(serverId);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const folderName = `${timestamp}-${type}-${slug(server.name)}`;
    const targetDir = join(this.rootBackupDir, serverId, folderName);
    await mkdir(targetDir, { recursive: true });

    const record = this.backups.createBackupStart({
      serverId,
      type,
      path: targetDir,
      notes,
    });

    try {
      if (this.processes.isActive(serverId)) {
        try {
          await rconExec(RCON_HOST, server.rconPort, server.adminPassword, "SaveWorld");
        } catch {
          // Un backup en caliente puede continuar aunque falle SaveWorld.
        }
      }

      const savedArks = this.savedArksDir(server);
      const config = this.configDir(server);
      await cp(savedArks, join(targetDir, "SavedArks"), {
        recursive: true,
        force: true,
      });
      await cp(config, join(targetDir, "ConfigWindowsServer"), {
        recursive: true,
        force: true,
      });

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
              createdAt: record.createdAt,
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
        throw new Error("No se pudo marcar el backup como completado");
      }

      this.servers.addEvent(
        serverId,
        "backup_created",
        "info",
        `Backup ${type} completado para \"${server.name}\" (${this.humanSize(sizeBytes)})`,
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
        `Fallo backup ${type} de \"${server.name}\": ${message}`,
      );
      throw err;
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
      `Job encolado: ${type} (${job.id.slice(0, 8)})`,
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
            result = await this.createBackup(
              job.serverId,
              "pre_update",
              "Backup previo a update",
            );
          } else {
            if (job.backupId === null || job.backupId.trim().length === 0) {
              throw new Error("backupId requerido para job restore");
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
              `Job ${job.type} agotó reintentos (${job.maxAttempts}): ${job.lastError}`,
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
            `Job ${job.type} reintentará (${job.attempts}/${job.maxAttempts})`,
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
          status: "pending",
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

  private async applyRetention(serverId: string, policy: BackupPolicy): Promise<void> {
    const completed = this.backups.listCompleted(serverId);
    const now = Date.now();
    const toDelete = new Set<string>();

    for (const backup of completed) {
      const ageDays = (now - Date.parse(backup.createdAt)) / (24 * 60 * 60 * 1000);
      if (ageDays > policy.retainDays) {
        toDelete.add(backup.id);
      }
    }

    const countKept = completed.filter((b) => !toDelete.has(b.id));
    if (countKept.length > policy.retainCount) {
      for (const backup of countKept.slice(policy.retainCount)) {
        toDelete.add(backup.id);
      }
    }

    for (const backupId of toDelete) {
      const backup = this.backups.getBackup(backupId);
      if (backup === null) continue;
      await rm(backup.path, { recursive: true, force: true });
      this.backups.deleteBackupRecord(backupId);
      this.servers.addEvent(
        serverId,
        "backup_created",
        "info",
        `Backup antiguo eliminado por retención: ${basename(backup.path)}`,
      );
    }
  }

  private savedArksDir(server: ServerProfile): string {
    return join(server.installDir, "ShooterGame", "Saved", "SavedArks");
  }

  private configDir(server: ServerProfile): string {
    return join(
      server.installDir,
      "ShooterGame",
      "Saved",
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
