import type { CriticalJobStatus } from "@shared/types";
import { isTransientCriticalJobError } from "../../orchestration/critical-job-recovery";
import {
  isKnownUpdateJobPhase,
  isKnownUpdateJobStatus,
  isUpdateQueueHeldForOperator,
  type UpdateCriticalJob,
  type UpdateCriticalJobType,
} from "./update-critical-jobs";

export type UpdateQueueJobHandler =
  | "install"
  | "verify"
  | "update"
  | "recover-file-job"
  | "recover-rollback";

export function shouldStopQueueProcessing(
  queue: ReadonlyArray<Pick<UpdateCriticalJob, "status" | "context">>,
): boolean {
  return isUpdateQueueHeldForOperator(queue);
}

export function findNextRunnableQueueJob<T extends Pick<UpdateCriticalJob, "status">>(
  queue: readonly T[],
): T | undefined {
  return queue.find((job) => job.status === "pending" || job.status === "retrying");
}

export function isRecoveredFileJobPhase(phase: string): boolean {
  return phase === "files-applied" || phase === "restarting-server";
}

function isActiveRollbackPhase(phase: string): boolean {
  return phase.startsWith("rollback-") && phase !== "rollback-complete";
}

export function isIncompleteRollbackOnCancel(
  jobType: UpdateCriticalJobType,
  phase: string,
): boolean {
  return jobType === "update" && isActiveRollbackPhase(phase);
}

export function isAmbiguousRollbackFailure(
  jobType: UpdateCriticalJobType,
  phase: string,
): boolean {
  return jobType === "update" && isActiveRollbackPhase(phase);
}

export function resolveUpdateQueueJobHandler(input: {
  type: UpdateCriticalJobType;
  phase: string;
}): UpdateQueueJobHandler {
  if (input.type === "install-files") {
    return isRecoveredFileJobPhase(input.phase) ? "recover-file-job" : "install";
  }
  if (input.type === "verify-files") {
    return isRecoveredFileJobPhase(input.phase) ? "recover-file-job" : "verify";
  }
  if (isRecoveredFileJobPhase(input.phase)) {
    return "recover-file-job";
  }
  if (isActiveRollbackPhase(input.phase)) {
    return "recover-rollback";
  }
  return "update";
}

export function shouldClearQueueIdleProgress(input: {
  queueLength: number;
  hasActiveSteamCmd: boolean;
  syncingServerId: string | null;
}): boolean {
  return (
    input.queueLength === 0
    && !input.hasActiveSteamCmd
    && input.syncingServerId === null
  );
}

export interface QueueJobPausePlan {
  status: "paused";
  recoveryReason: null;
}

export function planQueueJobPauseDisposition(): QueueJobPausePlan {
  return {
    status: "paused",
    recoveryReason: null,
  };
}

export interface QueueJobCancelPlan {
  status: "blocked" | "cancelled";
  phase?: string;
  recoveryReason: string;
  operatorRetryAllowed: boolean;
  continueQueue: true;
}

export function planQueueJobCancelDisposition(input: {
  jobType: UpdateCriticalJobType;
  phase: string;
}): QueueJobCancelPlan {
  if (isIncompleteRollbackOnCancel(input.jobType, input.phase)) {
    return {
      status: "blocked",
      recoveryReason:
        `Cancellation interrupted phase "${input.phase}". Inspect backups and runtime state before retrying.`,
      operatorRetryAllowed: true,
      continueQueue: true,
    };
  }
  const rollbackCompleted = input.phase === "rollback-complete";
  return {
    status: "cancelled",
    phase: rollbackCompleted ? undefined : "cancelled",
    recoveryReason: rollbackCompleted
      ? "Cancelled by the operator after rollback completed safely."
      : "Cancelled by the operator during execution.",
    operatorRetryAllowed: false,
    continueQueue: true,
  };
}

type QueueJobFailureAction = "blocked" | "failed" | "retry";

export interface QueueJobFailurePlan {
  action: QueueJobFailureAction;
  status: CriticalJobStatus;
  phase?: string;
  operatorRetryAllowed: boolean;
  recoveryReason: string;
  clearRestartInterrupted?: true;
  emitFailedEvent: boolean;
  failedEventSeverity?: "error" | "warning";
  failedEventMessage?: string;
}

export function planQueueJobFailureDisposition(input: {
  job: Pick<
    UpdateCriticalJob,
    "type" | "phase" | "attempts" | "maxAttempts" | "lastError"
  >;
  error: unknown;
  isRecoveryBlocked: boolean;
  isTransient?: (error: unknown) => boolean;
}): QueueJobFailurePlan {
  const isTransient = input.isTransient ?? isTransientCriticalJobError;
  const errorMessage =
    input.error instanceof Error ? input.error.message : String(input.error);
  const { job } = input;

  if (input.isRecoveryBlocked) {
    return {
      action: "blocked",
      status: "blocked",
      operatorRetryAllowed: true,
      recoveryReason: errorMessage,
      clearRestartInterrupted: true,
      emitFailedEvent: false,
    };
  }

  if (isAmbiguousRollbackFailure(job.type, job.phase)) {
    return {
      action: "blocked",
      status: "blocked",
      operatorRetryAllowed: true,
      recoveryReason:
        `Failure during phase "${job.phase}" left rollback state ambiguous. Inspect backups and runtime state before retrying.`,
      clearRestartInterrupted: true,
      emitFailedEvent: true,
      failedEventSeverity: "error",
      failedEventMessage:
        `Job ${job.type} blocked during ambiguous rollback: ${errorMessage}`,
    };
  }

  if (
    job.type === "update"
    && job.phase === "rollback-complete"
    && !isTransient(input.error)
  ) {
    return {
      action: "failed",
      status: "failed",
      operatorRetryAllowed: true,
      recoveryReason:
        "The update failed, but rollback completed. Review the update log before retrying.",
      emitFailedEvent: false,
    };
  }

  const rollbackCompleted = job.type === "update" && job.phase === "rollback-complete";
  const transient = isTransient(input.error);

  if (job.attempts >= job.maxAttempts || !transient) {
    return {
      action: "failed",
      status: "failed",
      phase: rollbackCompleted ? "rollback-complete" : "failed",
      operatorRetryAllowed: transient,
      recoveryReason: transient
        ? rollbackCompleted
          ? `Retry limit reached after ${job.maxAttempts} attempts; rollback completed successfully.`
          : `Retry limit reached after ${job.maxAttempts} attempts.`
        : "This validation, security, cancellation, or missing-resource failure is not safe to retry automatically.",
      emitFailedEvent: true,
      failedEventSeverity: "error",
      failedEventMessage:
        `Job ${job.type} failed (${job.attempts}/${job.maxAttempts}): ${errorMessage}`,
    };
  }

  return {
    action: "retry",
    status: "retrying",
    operatorRetryAllowed: false,
    recoveryReason:
      `Transient failure; retry ${job.attempts + 1} of ${job.maxAttempts} is scheduled.`,
    emitFailedEvent: true,
    failedEventSeverity: "warning",
    failedEventMessage:
      `Job ${job.type} will retry (${job.attempts}/${job.maxAttempts})`,
  };
}

export function planSteamCmdMissingQueueBlock(recoveryReason: string): {
  status: "blocked";
  operatorRetryAllowed: true;
  recoveryReason: string;
} {
  return {
    status: "blocked",
    operatorRetryAllowed: true,
    recoveryReason,
  };
}

export function isPersistedUpdateQueueEntryInvalid(
  job: Partial<UpdateCriticalJob>,
): boolean {
  if (
    typeof job.id !== "string"
    || (job.type !== "install-files" && job.type !== "update" && job.type !== "verify-files")
    || typeof job.serverId !== "string"
  ) {
    return true;
  }
  if (
    typeof job.status === "string"
    && !isKnownUpdateJobStatus(job.status)
  ) {
    return true;
  }
  if (
    typeof job.phase === "string"
    && !isKnownUpdateJobPhase(job.phase)
  ) {
    return true;
  }
  return false;
}

export function isValidPersistedUpdateQueueEntry(
  job: Partial<UpdateCriticalJob>,
): job is Partial<UpdateCriticalJob> & {
  id: string;
  type: UpdateCriticalJobType;
  serverId: string;
} {
  return !isPersistedUpdateQueueEntryInvalid(job);
}
