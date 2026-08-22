import type { CriticalJobStatus } from "@shared/types";
import type { DurableCriticalJob } from "../../orchestration/critical-job-recovery";

export type UpdateCriticalJobType = "install-files" | "update" | "verify-files";

export interface UpdateCriticalJobContext {
  wasRunning?: boolean;
  preUpdateBackupIds?: string[];
  rollbackRestoredBackupIds?: string[];
  appliedBuildId?: string | null;
  updateLogPath?: string;
  steamCmdExitCode?: number;
  /** Set when YARK closed mid-job; queue waits for Retry/Dismiss before other servers run. */
  restartInterrupted?: boolean;
  /**
   * Renderer awaited Install/Update/Verify and will show an in-app toast.
   * OS toasts skip while YARK is focused for these jobs (#331).
   */
  operatorAwaited?: boolean;
}

export interface UpdateCriticalJob extends DurableCriticalJob {
  type: UpdateCriticalJobType;
  context: UpdateCriticalJobContext;
}

const UPDATE_CRITICAL_JOB_PHASE_ORDER: readonly string[] = [
  "failed",
  "cancelled",
  "paused",
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

const KNOWN_UPDATE_JOB_STATUSES: ReadonlySet<string> = new Set([
  "pending",
  "running",
  "retrying",
  "paused",
  "blocked",
  "failed",
  "cancelled",
]);

const KNOWN_UPDATE_JOB_PHASES: ReadonlySet<string> = new Set([
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

export function isKnownUpdateJobStatus(status: string): boolean {
  return KNOWN_UPDATE_JOB_STATUSES.has(status);
}

export function isKnownUpdateJobPhase(phase: string): boolean {
  return KNOWN_UPDATE_JOB_PHASES.has(phase);
}

export function updateCriticalJobPhaseRank(phase: string): number {
  const index = UPDATE_CRITICAL_JOB_PHASE_ORDER.indexOf(phase);
  return index >= 0 ? index : -1;
}

export function sanitizeUpdateJobContext(raw: unknown): UpdateCriticalJobContext {
  if (typeof raw !== "object" || raw === null) {
    return {};
  }
  const input = raw as Record<string, unknown>;
  const context: UpdateCriticalJobContext = {};
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
  if (input.restartInterrupted === true) {
    context.restartInterrupted = true;
  }
  if (input.operatorAwaited === true) {
    context.operatorAwaited = true;
  }
  return context;
}

export function mergeUpdateCriticalJobs(
  existing: UpdateCriticalJob,
  incoming: UpdateCriticalJob,
): UpdateCriticalJob {
  const incomingPhaseRank = updateCriticalJobPhaseRank(incoming.phase);
  const existingPhaseRank = updateCriticalJobPhaseRank(existing.phase);
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
      ...(preferred.context.restartInterrupted === true
        || secondary.context.restartInterrupted === true
        ? { restartInterrupted: true as const }
        : {}),
      ...(preferred.context.operatorAwaited === true
        || secondary.context.operatorAwaited === true
        ? { operatorAwaited: true as const }
        : {}),
    },
  };
}

export function isUpdateJobInterruptedAmbiguous(
  type: UpdateCriticalJobType,
  phase: string,
): boolean {
  return (
    (type === "update" && phase !== "validating" && phase !== "validated"
      && phase !== "files-applied")
    || ((type === "verify-files" || type === "install-files")
      && (phase === "stopping-server" || phase === "restarting-server"))
  );
}

export function shouldOmitInterruptedUpdateJobOnLoad(input: {
  wasInterrupted: boolean;
  phase: string;
  wasRunning: boolean | undefined;
  serverIsActive: boolean;
}): boolean {
  if (!input.wasInterrupted) return false;
  if (
    (input.phase === "files-applied" || input.phase === "restarting-server")
    && input.wasRunning === true
    && input.serverIsActive
  ) {
    return true;
  }
  if (input.phase === "files-applied" && input.wasRunning !== true) {
    return true;
  }
  return false;
}

export function resumePhaseForUpdateRetry(
  job: Pick<UpdateCriticalJob, "type" | "phase" | "context">,
): string {
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

export function isUpdateQueueHeldForOperator(
  queue: ReadonlyArray<Pick<UpdateCriticalJob, "status" | "context">>,
): boolean {
  return queue.some(
    (job) => job.status === "paused" || job.context.restartInterrupted === true,
  );
}

export function reorderPendingUpdateJobs(
  queue: readonly UpdateCriticalJob[],
  jobId: string,
  direction: "up" | "down",
): UpdateCriticalJob[] | null {
  const pendingIndices: number[] = [];
  for (let index = 0; index < queue.length; index += 1) {
    const status = queue[index]?.status;
    if (status === "pending" || status === "retrying") {
      pendingIndices.push(index);
    }
  }
  const position = pendingIndices.findIndex((index) => queue[index]?.id === jobId);
  if (position === -1) {
    return null;
  }
  const swapPosition = direction === "up" ? position - 1 : position + 1;
  if (swapPosition < 0 || swapPosition >= pendingIndices.length) {
    return null;
  }
  const indexA = pendingIndices[position]!;
  const indexB = pendingIndices[swapPosition]!;
  const jobA = queue[indexA];
  const jobB = queue[indexB];
  if (jobA === undefined || jobB === undefined) {
    return null;
  }
  const next = [...queue];
  next[indexA] = jobB;
  next[indexB] = jobA;
  return next;
}

export function canCancelUpdateCriticalJob(status: CriticalJobStatus): boolean {
  return status === "pending" || status === "retrying" || status === "paused";
}

export interface UpdateCriticalJobCancelPlan {
  status: "cancelled";
  phase: "cancelled";
  recoveryReason: string;
  updatedAt: string;
}

export function planCancelUpdateCriticalJob(
  wasPaused: boolean,
  nowIso?: string,
): UpdateCriticalJobCancelPlan {
  return {
    status: "cancelled",
    phase: "cancelled",
    recoveryReason: wasPaused
      ? "Cancelled by the operator after pause."
      : "Cancelled by the operator before execution.",
    updatedAt: nowIso ?? new Date().toISOString(),
  };
}

export function isUpdatePauseBlockedByRollback(phase: string): boolean {
  return phase.startsWith("rollback-") && phase !== "rollback-complete";
}

export function isUnpausableSteamCmdOperation(
  operation:
    | "install-steamcmd"
    | "install-files"
    | "update"
    | "verify-files"
    | "sync-files"
    | null,
): boolean {
  return operation === "verify-files" || operation === "install-steamcmd";
}
