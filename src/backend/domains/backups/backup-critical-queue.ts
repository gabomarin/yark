import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import type { BackupKind, BackupRecord, BackupType, ServerProfile } from "@shared/types";
import type { CriticalJobSummary } from "../../../shared/types";
import type { AppSettingsRepository } from "../../infra/db/app-settings-repository";
import type { BackupRepository } from "../../infra/db/backup-repository";
import type { ServerRepository } from "../../infra/db/server-repository";
import type { ProcessManager } from "../../infra/process/process-manager";
import { isTransientCriticalJobError, makeIdempotencyKey, migrateCriticalJob, toCriticalJobSummary } from "../../orchestration/critical-job-recovery";
import { isOperationCancelledError, OperationCancelledError } from "../updates/robocopy-tree";
import { isReadableZipArchive, zipHasBackupLayout } from "./backup-archive";
import {
  isBackupJobInterruptedAmbiguous, isKnownBackupJobPhase, isKnownBackupJobStatus,
  mergeBackupCriticalJobs, planBackupCriticalJobRetry, restoreJobLoadDisposition,
  sanitizeBackupJobContext, shouldDropTerminalPreUpdateOnLoad,
  type BackupCriticalJob, type BackupCriticalJobType,
} from "./backup-critical-jobs";
import { isRestoreHistoryOwnedByJob as restoreHistoryOwnedByJob } from "./backup-restore";

const BACKUP_CRITICAL_JOBS_KEY = "backupCriticalJobsQueue.v1";
const BACKUP_JOB_RETRY_DELAY_MS = 5000;
export const CRITICAL_BACKUP_KINDS: readonly BackupKind[] = ["world", "ini"];
export interface BackupCriticalJobProgressHandlers {
  onKindProgress?: (kind: BackupKind, index: number, total: number) => void;
  onProgressMessage?: (message: string) => void;
}

interface BackupCriticalQueueDependencies {
  servers: ServerRepository;
  backups: BackupRepository;
  processes: ProcessManager;
  settings: AppSettingsRepository;
  createBackups: (
    serverId: string,
    type: BackupType,
    notes: string | null,
    kinds: BackupKind[],
    options?: CriticalBackupCreateOptions,
  ) => Promise<BackupRecord[]>;
  reconcileDiskBackups: (serverId: string) => Promise<number>;
  mustServer: (serverId: string) => ServerProfile;
  applyRestore: (server: ServerProfile, backup: BackupRecord) => Promise<void>;
  emitChanged: (serverId: string) => void;
  scheduleProcess: () => void;
}

interface CriticalBackupCreateOptions {
  respectCancel?: boolean;
  onProgressMessage?: (message: string) => void;
}
interface JobWaiter {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}
const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export class BackupCriticalQueue {
  private queue: BackupCriticalJob[];
  private processingQueue = false;
  private readonly waiters = new Map<string, JobWaiter[]>();
  private cancelRequested = false;
  private readonly jobProgressHandlers = new Map<string, BackupCriticalJobProgressHandlers>();

  constructor(private readonly deps: BackupCriticalQueueDependencies) {
    this.queue = this.loadQueue();
    if (this.queue.some((job) => job.status === "pending" || job.status === "retrying")) {
      setTimeout(() => this.deps.scheduleProcess(), 250);
    }
  }
  hasServerWork(serverId: string): boolean {
    if (this.waiters.has(serverId)) return true;
    return this.queue.some(
      (job) =>
        job.serverId === serverId
        && (
          job.status === "pending"
          || job.status === "running"
          || job.status === "retrying"
          || job.status === "blocked"
        ),
    );
  }
  async enqueueAndWait<T>(
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
          this.deps.scheduleProcess();
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
    this.deps.servers.addEvent(
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
    this.deps.scheduleProcess();
    return await completion;
  }
  requestCancel(): boolean {
    const actionable = this.queue.filter(
      (job) =>
        job.status === "pending"
        || job.status === "retrying"
        || (job.status === "running" && job.phase !== "applying-restore"),
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
        if (job.type === "pre-update-backup") {
          this.removeJob(job.id);
        }
        continue;
      }
      job.recoveryReason = "Cancellation requested; stopping before restore apply.";
      job.updatedAt = new Date().toISOString();
    }
    this.persistQueue();
    return true;
  }

  getCriticalJobs(): CriticalJobSummary[] {
    return this.queue.map((job) =>
      toCriticalJobSummary(job, this.deps.servers.get(job.serverId)?.name ?? null));
  }

  getCompletedBackups(serverId: string, backupIds: readonly string[]): BackupRecord[] {
    const orderedUniqueIds = [...new Set(backupIds.filter((id) => id.trim().length > 0))];
    const byKind = new Map<BackupKind, BackupRecord>();
    for (const backupId of orderedUniqueIds) {
      const backup = this.deps.backups.getBackup(backupId);
      if (
        backup === null
        || backup.serverId !== serverId
        || backup.status !== "completed"
        || backup.type !== "pre_update"
        || !existsSync(backup.path)
        || byKind.has(backup.kind)
      ) {
        continue;
      }
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
    this.deps.scheduleProcess();
    return true;
  }

  dismissCriticalJob(jobId: string): boolean {
    const job = this.queue.find((candidate) => candidate.id === jobId);
    if (
      job === undefined
      || (
        job.status !== "blocked"
        && job.status !== "failed"
        && job.status !== "cancelled"
      )
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
    this.jobProgressHandlers.delete(job.id);
    if (job.type === "pre-update-backup") {
      this.removeJob(job.id);
    }
    this.persistQueue();
    return true;
  }

  throwIfCancelled(): void {
    if (this.cancelRequested) {
      throw new OperationCancelledError();
    }
  }

  async processQueue(): Promise<void> {
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
            if (job.type === "pre-update-backup") {
              this.removeJob(job.id);
            }
            this.persistQueue();
            this.deps.servers.addEvent(
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
            if (job.type === "pre-update-backup") {
              this.removeJob(job.id);
            }
            this.persistQueue();
            this.deps.servers.addEvent(
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
            if (job.type === "pre-update-backup") {
              this.removeJob(job.id);
            }
            this.persistQueue();
            this.deps.servers.addEvent(
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
            if (job.type === "pre-update-backup") {
              this.removeJob(job.id);
            }
            this.deps.servers.addEvent(
              job.serverId,
              "error",
              "error",
              `Job ${job.type} exhausted retries (${job.maxAttempts}): ${job.lastError}`,
            );
            this.persistQueue();
            continue;
          }

          job.status = "retrying";
          job.recoveryReason =
            `Transient failure; retry ${job.attempts + 1} of ${job.maxAttempts} is scheduled.`;
          this.persistQueue();
          this.deps.servers.addEvent(
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
    const raw = this.deps.settings.get(BACKUP_CRITICAL_JOBS_KEY);
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
          && !isKnownBackupJobStatus(job.status)
        ) {
          invalidEntryFound = true;
          continue;
        }
        if (
          typeof job.phase === "string"
          && !isKnownBackupJobPhase(job.type, job.phase)
        ) {
          invalidEntryFound = true;
          continue;
        }
        const backupId = typeof job.backupId === "string" ? job.backupId : null;
        const context = sanitizeBackupJobContext(job.context);
        if (job.type === "restore") {
          const historyId = context.restoreHistoryId;
          const history =
            typeof historyId === "number"
              ? this.deps.backups.getRestoreHistory(historyId)
              : null;
          const disposition = restoreJobLoadDisposition({
            phase: job.phase,
            jobId: job.id,
            serverId: job.serverId,
            backupId,
            history,
          });
          if (disposition === "omit") continue;
          if (disposition === "invalid") {
            invalidEntryFound = true;
            continue;
          }
        }
        const migrated = migrateCriticalJob<BackupCriticalJob>(job, {
          type: job.type,
          serverId: job.serverId,
          defaultPhase: "queued",
          interruptedIsAmbiguous: isBackupJobInterruptedAmbiguous(job.type, job.phase),
          idempotencyDiscriminator: backupId,
          serverExists: this.deps.servers.get(job.serverId) !== null,
        });
        migrated.backupId = backupId;
        migrated.context = context;
        const duplicateIndex = jobs.findIndex(
          (candidate) => candidate.idempotencyKey === migrated.idempotencyKey,
        );
        if (duplicateIndex >= 0) {
          const merged = mergeBackupCriticalJobs(jobs[duplicateIndex]!, migrated);
          if (this.deps.servers.get(job.serverId) !== null) {
            merged.status = "blocked";
            merged.operatorRetryAllowed = true;
            merged.recoveryReason =
              "Duplicate durable job records were recovered. Review the preserved phase before retrying.";
          }
          jobs[duplicateIndex] = merged;
          invalidEntryFound = true;
          continue;
        }
        if (
          migrated.type === "pre-update-backup"
          && shouldDropTerminalPreUpdateOnLoad(migrated.status)
        ) {
          invalidEntryFound = true;
          continue;
        }
        jobs.push(migrated);
      }
      if (invalidEntryFound) {
        this.deps.settings.set(`${BACKUP_CRITICAL_JOBS_KEY}.quarantine.${Date.now()}`, raw);
      }
      this.deps.settings.set(BACKUP_CRITICAL_JOBS_KEY, JSON.stringify(jobs));
      return jobs;
    } catch {
      this.deps.settings.set(`${BACKUP_CRITICAL_JOBS_KEY}.quarantine.${Date.now()}`, raw);
      this.deps.settings.set(BACKUP_CRITICAL_JOBS_KEY, "[]");
      return [];
    }
  }

  private persistQueue(): void {
    this.deps.settings.set(BACKUP_CRITICAL_JOBS_KEY, JSON.stringify(this.queue));
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
    const plan = planBackupCriticalJobRetry(job, reason);
    if (plan.restoreHistoryIdToSupersede !== null) {
      const history =
        this.deps.backups.getRestoreHistory(plan.restoreHistoryIdToSupersede);
      if (history?.status === "started") {
        this.deps.backups.completeRestoreHistory(
          plan.restoreHistoryIdToSupersede,
          "failed",
          "Superseded by an explicit operator retry after interrupted restore.",
        );
      }
    }
    job.status = plan.status;
    job.phase = plan.phase;
    if (plan.clearContext) {
      job.context = {};
    }
    job.maxAttempts = plan.maxAttempts;
    job.recoveryReason = plan.recoveryReason;
    job.updatedAt = plan.updatedAt;
    this.persistQueue();
  }

  private async resumePreUpdateBackupJob(job: BackupCriticalJob): Promise<BackupRecord[]> {
    const progress = this.jobProgressHandlers.get(job.id);
    this.throwIfCancelled();
    progress?.onProgressMessage?.(
      "Creating pre-update backups (world, INI) before SteamCMD…",
    );
    this.checkpointJob(job, "reconciling-backups");
    await this.deps.reconcileDiskBackups(job.serverId);
    this.throwIfCancelled();
    const marker = `[critical-job:${job.id}]`;
    const candidates = this.deps.backups
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

    let nextKindIndex = 0;
    const total = CRITICAL_BACKUP_KINDS.length;
    while (nextKindIndex < CRITICAL_BACKUP_KINDS.length) {
      this.throwIfCancelled();
      const kind = CRITICAL_BACKUP_KINDS[nextKindIndex]!;
      if (!completedByKind.has(kind)) {
        this.checkpointJob(job, `creating-backup:${kind}`);
        progress?.onKindProgress?.(kind, nextKindIndex, total);
        const created = await this.deps.createBackups(
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
    const server = this.deps.mustServer(job.serverId);
    if (this.deps.processes.isActive(job.serverId)) {
      throw new Error("Stop the server before restoring a backup");
    }
    if (job.backupId === null) throw new Error("backupId required for restore job");
    const backup = this.deps.backups.getBackup(job.backupId);
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
        ? this.deps.backups.getRestoreHistory(restoreHistoryId)
        : null;
    if (existingHistory?.status === "completed") {
      if (!restoreHistoryOwnedByJob(job.id, job.serverId, backup.id, existingHistory)) {
        throw new Error("Restore history evidence does not belong to this recovery job");
      }
      this.checkpointJob(job, "restore-complete");
      return;
    }
    if (
      existingHistory !== null
      && !restoreHistoryOwnedByJob(job.id, job.serverId, backup.id, existingHistory)
    ) {
      throw new Error("Restore history evidence does not belong to this recovery job");
    }
    if (existingHistory === null || existingHistory.status === "failed") {
      restoreHistoryId = this.deps.backups.insertRestoreHistory({
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
    const safeguards = this.deps.backups
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
      const created = await this.deps.createBackups(
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
    await this.deps.applyRestore(server, backup);
    this.deps.backups.completeRestoreHistory(restoreHistoryId, "completed", marker);
    this.checkpointJob(job, "restore-complete");
    this.deps.servers.addEvent(
      job.serverId,
      "backup_restored",
      "info",
      `Restore applied on "${server.name}" from ${backup.kind} backup ${backup.id}`,
    );
    this.deps.emitChanged(job.serverId);
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

  private addWaiter(jobId: string, waiter: JobWaiter): void {
    const current = this.waiters.get(jobId) ?? [];
    current.push(waiter);
    this.waiters.set(jobId, current);
  }
}
