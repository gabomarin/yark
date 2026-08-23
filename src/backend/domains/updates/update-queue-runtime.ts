import { randomUUID } from "node:crypto";
import type { AppSettingsRepository } from "../../infra/db/app-settings-repository";
import type { ProcessManager } from "../../infra/process/process-manager";
import type { ServerRepository } from "../../infra/db/server-repository";
import { makeIdempotencyKey, migrateCriticalJob } from "../../orchestration/critical-job-recovery";
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
  canCancelUpdateCriticalJob,
  isUpdateJobInterruptedAmbiguous,
  isUpdateQueueHeldForOperator,
  mergeUpdateCriticalJobs,
  planCancelUpdateCriticalJob,
  reorderPendingUpdateJobs,
  resumePhaseForUpdateRetry,
  sanitizeUpdateJobContext,
  shouldOmitInterruptedUpdateJobOnLoad,
  type UpdateCriticalJob,
  type UpdateCriticalJobType,
} from "./update-critical-jobs";
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
  planDuplicateRecoveredUpdateJob,
  planInterruptedUpdateJobRecovery,
  queuedFilesJobProgressLabel,
} from "./update-server-jobs";
import { updateJobNeedsSteamCmdExecutable } from "./steamcmd-path";
import {
  isOperationCancelledError,
  isOperationPausedError,
  OperationCancelledError,
  OperationPausedError,
} from "./steamcmd-content-cache";
import { CriticalJobRecoveryBlockedError } from "./update-perform";

const CRITICAL_JOBS_KEY = "criticalJobsQueue.v1";
const JOB_RETRY_DELAY_MS = 5000;

type JobEventType =
  | "update_started"
  | "update_completed"
  | "update_failed"
  | "update_rolled_back";

interface UpdateQueueRuntimeDependencies {
  settings: AppSettingsRepository;
  servers: ServerRepository;
  processes: ProcessManager;
  ensureSteamCmdReadyForOperator: (job?: UpdateCriticalJob) => Promise<void>;
  appendSteamCmdConsole: (line: string) => void;
  clearSteamCmdConsole: () => void;
  clearPausedProgressSnapshot: () => void;
  setPausedProgress: () => void;
  setProgress: (percent: number | null, label: string | null, line?: string) => void;
  setQueuedProgress: (label: string, line: string) => void;
  emitProgress: (force: boolean) => void;
  performInstallServerFiles: (serverId: string, job: UpdateCriticalJob) => Promise<void>;
  performUpdateServer: (serverId: string, job: UpdateCriticalJob) => Promise<void>;
  performVerifyServerFiles: (serverId: string, job: UpdateCriticalJob) => Promise<void>;
  finishRecoveredFileJob: (job: UpdateCriticalJob) => Promise<void>;
  finishRecoveredRollback: (job: UpdateCriticalJob) => Promise<void>;
  findSteamCmdExecutableCached: () => string | null;
  steamCmdMissingError: () => Error;
  getActiveSteamCmd: () => boolean;
  getSyncingServerId: () => string | null;
  endFileSync: () => void;
  isCancelRequested: () => boolean;
  setCancelRequested: (requested: boolean) => void;
  isPauseRequested: () => boolean;
  setPauseRequested: (requested: boolean) => void;
  scheduleProcess: () => void;
  addJobEvent: (
    job: UpdateCriticalJob,
    type: JobEventType,
    severity: "info" | "warning" | "error",
    message: string,
  ) => number;
}

interface JobWaiter {
  resolve: () => void;
  reject: (error: Error) => void;
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export class UpdateQueueRuntime {
  private queue: UpdateCriticalJob[];
  private processingQueue = false;
  private readonly waiters = new Map<string, JobWaiter>();

  constructor(private readonly deps: UpdateQueueRuntimeDependencies) {
    this.queue = this.loadQueue();
  }

  getJobs(): readonly UpdateCriticalJob[] {
    return this.queue;
  }

  replaceJobs(jobs: UpdateCriticalJob[]): void {
    this.queue = jobs;
  }

  getRunningJob(): UpdateCriticalJob | undefined {
    return this.queue.find((job) => job.status === "running");
  }

  hasPendingWork(): boolean {
    return this.queue.some(
      (job) =>
        job.status === "running"
        || job.status === "pending"
        || job.status === "retrying",
    );
  }

  isHeldForOperator(): boolean {
    return isUpdateQueueHeldForOperator(this.queue);
  }

  persist(): void {
    this.deps.settings.set(CRITICAL_JOBS_KEY, JSON.stringify(this.queue));
  }

  checkpoint(job: UpdateCriticalJob | undefined, phase: string): void {
    if (job === undefined) return;
    job.phase = phase;
    job.updatedAt = new Date().toISOString();
    this.persist();
    this.deps.emitProgress(true);
  }

  async retryCriticalJob(jobId: string): Promise<boolean | undefined> {
    const job = this.queue.find((candidate) => candidate.id === jobId);
    if (job === undefined) return undefined;
    const cancelled = job.status === "cancelled";
    const retryableFailure =
      (job.status === "blocked" || job.status === "failed") && job.operatorRetryAllowed;
    if (!cancelled && !retryableFailure) return false;
    await this.deps.ensureSteamCmdReadyForOperator(job);
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
    this.persist();
    this.deps.emitProgress(true);
    this.deps.scheduleProcess();
    return true;
  }

  dismissCriticalJob(jobId: string): boolean | undefined {
    const job = this.queue.find((candidate) => candidate.id === jobId);
    if (job === undefined) return undefined;
    if (job.status !== "blocked" && job.status !== "failed" && job.status !== "cancelled") {
      return false;
    }
    this.removeJob(jobId);
    this.persist();
    this.deps.emitProgress(true);
    this.deps.scheduleProcess();
    return true;
  }

  cancelCriticalJob(jobId: string): boolean | undefined {
    const job = this.queue.find((candidate) => candidate.id === jobId);
    if (job === undefined) return undefined;
    if (!canCancelUpdateCriticalJob(job.status)) return false;
    const plan = planCancelUpdateCriticalJob(job.status === "paused");
    job.status = plan.status;
    job.phase = plan.phase;
    job.recoveryReason = plan.recoveryReason;
    job.updatedAt = plan.updatedAt;
    this.rejectJob(job.id, new OperationCancelledError());
    this.persist();
    this.deps.emitProgress(true);
    this.deps.scheduleProcess();
    return true;
  }

  async resumeCriticalJob(jobId: string): Promise<boolean | undefined> {
    const job = this.queue.find((candidate) => candidate.id === jobId);
    if (job === undefined) return undefined;
    if (job.status !== "paused") return false;
    await this.deps.ensureSteamCmdReadyForOperator(job);
    this.deps.clearSteamCmdConsole();
    this.deps.clearPausedProgressSnapshot();
    job.status = "pending";
    job.phase = resumePhaseForUpdateRetry(job);
    job.recoveryReason = null;
    job.updatedAt = new Date().toISOString();
    this.queue = [job, ...this.queue.filter((candidate) => candidate.id !== job.id)];
    this.persist();
    this.deps.emitProgress(true);
    this.deps.scheduleProcess();
    return true;
  }

  reorderCriticalJob(jobId: string, direction: "up" | "down"): boolean {
    const reordered = reorderPendingUpdateJobs(this.queue, jobId, direction);
    if (reordered === null) return false;
    this.queue = reordered;
    this.persist();
    this.deps.emitProgress(true);
    return true;
  }

  async enqueueAndWait(type: UpdateCriticalJobType, serverId: string): Promise<void> {
    const jobId = await this.enqueueAndReturnJobId(type, serverId);
    const job = this.queue.find((candidate) => candidate.id === jobId);
    if (job !== undefined) {
      job.context.operatorAwaited = true;
      this.persist();
    }
    const completion = new Promise<void>((resolve, reject) => {
      this.waiters.set(jobId, { resolve, reject });
    });
    this.deps.scheduleProcess();
    await completion;
  }

  async enqueueAndStart(type: UpdateCriticalJobType, serverId: string): Promise<void> {
    await this.enqueueAndReturnJobId(type, serverId);
    this.deps.scheduleProcess();
  }

  async processQueue(): Promise<void> {
    if (this.processingQueue) return;
    this.processingQueue = true;
    try {
      for (;;) {
        if (shouldStopQueueProcessing(this.queue)) {
          this.deps.emitProgress(true);
          break;
        }
        const job = findNextRunnableQueueJob(this.queue);
        if (job === undefined) break;

        if (
          updateJobNeedsSteamCmdExecutable(job)
          && this.deps.findSteamCmdExecutableCached() === null
        ) {
          const error = this.deps.steamCmdMissingError();
          this.rejectJob(job.id, error);
          const blocked = planSteamCmdMissingQueueBlock(error.message);
          job.status = blocked.status;
          job.operatorRetryAllowed = blocked.operatorRetryAllowed;
          job.recoveryReason = blocked.recoveryReason;
          job.updatedAt = new Date().toISOString();
          this.persist();
          this.deps.emitProgress(true);
          continue;
        }

        job.status = "running";
        job.updatedAt = new Date().toISOString();
        this.deps.setCancelRequested(false);
        this.deps.setPauseRequested(false);
        this.persist();
        this.deps.emitProgress(true);

        try {
          await this.runJob(job);
          this.resolveJob(job.id);
          this.removeJob(job.id);
          this.persist();
          if (
            shouldClearQueueIdleProgress({
              queueLength: this.queue.length,
              hasActiveSteamCmd: this.deps.getActiveSteamCmd(),
              syncingServerId: this.deps.getSyncingServerId(),
            })
          ) {
            this.deps.clearPausedProgressSnapshot();
            this.deps.setProgress(100, "Completed", "Operation finished");
            this.deps.emitProgress(true);
          }
        } catch (error) {
          const shouldBreak = await this.handleJobError(job, error);
          if (shouldBreak) break;
        }
      }
    } finally {
      this.processingQueue = false;
    }
  }

  private async enqueueAndReturnJobId(
    type: UpdateCriticalJobType,
    serverId: string,
  ): Promise<string> {
    await this.deps.ensureSteamCmdReadyForOperator();
    const existing = this.queue.find(
      (job) => job.serverId === serverId && job.type === type,
    );
    if (existing !== undefined) {
      if (existing.status === "cancelled") {
        this.deps.appendSteamCmdConsole(
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
    const serverName = this.deps.servers.get(serverId)?.name ?? "this server";
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
      this.deps.appendSteamCmdConsole(filesJobEnqueueCopy(type, decision, serverName).message);
      this.persist();
      this.deps.emitProgress(true);
    } else if (decision.action !== "enqueue") {
      throw new Error(filesJobEnqueueCopy(type, decision, serverName).message);
    }

    const now = new Date().toISOString();
    const job: UpdateCriticalJob = {
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
    this.persist();
    this.deps.setQueuedProgress(queuedFilesJobProgressLabel(type), `Job queued: ${type}`);
    this.deps.emitProgress(true);
    this.deps.addJobEvent(
      job,
      "update_started",
      "info",
      `Job queued: ${type} (${job.id.slice(0, 8)})`,
    );
    return job.id;
  }

  private async runJob(job: UpdateCriticalJob): Promise<void> {
    switch (resolveUpdateQueueJobHandler({ type: job.type, phase: job.phase })) {
      case "install":
        await this.deps.performInstallServerFiles(job.serverId, job);
        break;
      case "verify":
        await this.deps.performVerifyServerFiles(job.serverId, job);
        break;
      case "recover-file-job":
        await this.deps.finishRecoveredFileJob(job);
        break;
      case "recover-rollback":
        await this.deps.finishRecoveredRollback(job);
        break;
      case "update":
        await this.deps.performUpdateServer(job.serverId, job);
        break;
    }
  }

  private async handleJobError(job: UpdateCriticalJob, error: unknown): Promise<boolean> {
    if (this.deps.isPauseRequested() || isOperationPausedError(error)) {
      this.deps.appendSteamCmdConsole(`Job ${job.type} paused`);
      this.rejectJob(
        job.id,
        isOperationPausedError(error) ? (error as Error) : new OperationPausedError(),
      );
      const paused = planQueueJobPauseDisposition();
      job.status = paused.status;
      job.recoveryReason = paused.recoveryReason;
      job.updatedAt = new Date().toISOString();
      this.persist();
      this.deps.setPauseRequested(false);
      this.deps.endFileSync();
      this.deps.setPausedProgress();
      this.deps.emitProgress(true);
      return true;
    }
    if (this.deps.isCancelRequested() || isOperationCancelledError(error)) {
      this.deps.appendSteamCmdConsole(`Job ${job.type} stopped after cancellation`);
      const cancelled = planQueueJobCancelDisposition({
        jobType: job.type,
        phase: job.phase,
      });
      this.rejectJob(
        job.id,
        isOperationCancelledError(error) ? (error as Error) : new OperationCancelledError(),
      );
      job.status = cancelled.status;
      job.operatorRetryAllowed = cancelled.operatorRetryAllowed;
      if (cancelled.phase !== undefined) job.phase = cancelled.phase;
      job.recoveryReason = cancelled.recoveryReason;
      job.updatedAt = new Date().toISOString();
      this.persist();
      this.deps.setCancelRequested(false);
      this.deps.endFileSync();
      if (cancelled.status === "cancelled") {
        this.deps.setProgress(null, "Cancelled", "Operation cancelled by the user");
      }
      this.deps.emitProgress(true);
      return false;
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
      if (failure.phase !== undefined) job.phase = failure.phase;
      job.operatorRetryAllowed = failure.operatorRetryAllowed;
      job.recoveryReason = failure.recoveryReason;
      this.persist();
      if (failure.emitFailedEvent) {
        this.deps.addJobEvent(
          job,
          "update_failed",
          failure.failedEventSeverity ?? "error",
          failure.failedEventMessage ?? job.lastError,
        );
      }
      return false;
    }

    job.status = failure.status;
    job.recoveryReason = failure.recoveryReason;
    this.persist();
    if (failure.emitFailedEvent) {
      this.deps.addJobEvent(
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
      this.persist();
    }
    return false;
  }

  private loadQueue(): UpdateCriticalJob[] {
    const raw = this.deps.settings.get(CRITICAL_JOBS_KEY);
    if (raw === null || raw.trim().length === 0) return [];
    try {
      const parsed = JSON.parse(raw) as Array<Partial<UpdateCriticalJob>>;
      if (!Array.isArray(parsed)) throw new Error("Critical job queue is not an array");
      const jobs: UpdateCriticalJob[] = [];
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
        if (
          shouldOmitInterruptedUpdateJobOnLoad({
            wasInterrupted,
            phase,
            wasRunning: context.wasRunning,
            serverIsActive: this.deps.processes.isActive(job.serverId),
          })
        ) {
          continue;
        }
        const interruptedIsAmbiguous = isUpdateJobInterruptedAmbiguous(type, phase);
        const serverExists = this.deps.servers.get(job.serverId) !== null;
        const migrated = migrateCriticalJob<UpdateCriticalJob>(job, {
          type,
          serverId: job.serverId,
          defaultPhase: "queued",
          interruptedIsAmbiguous,
          serverExists,
        });
        migrated.context = context;
        const interruptedRecovery = planInterruptedUpdateJobRecovery({
          wasInterrupted,
          phase,
          interruptedIsAmbiguous,
          serverExists,
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
          const duplicateRecovery = planDuplicateRecoveredUpdateJob(serverExists);
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
        this.deps.settings.set(`${CRITICAL_JOBS_KEY}.quarantine.${Date.now()}`, raw);
      }
      this.deps.settings.set(CRITICAL_JOBS_KEY, JSON.stringify(jobs));
      return jobs;
    } catch {
      this.deps.settings.set(`${CRITICAL_JOBS_KEY}.quarantine.${Date.now()}`, raw);
      this.deps.settings.set(CRITICAL_JOBS_KEY, "[]");
      return [];
    }
  }

  private removeJob(jobId: string): void {
    this.queue = this.queue.filter((job) => job.id !== jobId);
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
