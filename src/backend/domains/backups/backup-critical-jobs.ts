import type { CriticalJobStatus } from "@shared/types";
import type { DurableCriticalJob } from "../../orchestration/critical-job-recovery";
import {
  isRestoreHistoryOwnedByJob,
  type RestoreHistoryOwnershipEvidence,
} from "./backup-restore";

export type BackupCriticalJobType = "pre-update-backup" | "restore";

export interface BackupCriticalJobContext {
  completedBackupIds?: string[];
  nextKindIndex?: number;
  restoreHistoryId?: number;
  safeguardBackupIds?: string[];
}

export interface BackupCriticalJob extends DurableCriticalJob {
  type: BackupCriticalJobType;
  backupId: string | null;
  context: BackupCriticalJobContext;
}

/** Phase preference order when merging duplicate durable records. */
export const BACKUP_CRITICAL_JOB_PHASE_ORDER: readonly string[] = [
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

export const KNOWN_BACKUP_JOB_STATUSES: ReadonlySet<string> = new Set([
  "pending",
  "running",
  "retrying",
  "blocked",
  "failed",
  "cancelled",
]);

export function isKnownBackupJobStatus(status: string): boolean {
  return KNOWN_BACKUP_JOB_STATUSES.has(status);
}

export function backupCriticalJobPhaseRank(phase: string): number {
  const index = BACKUP_CRITICAL_JOB_PHASE_ORDER.indexOf(phase);
  return index >= 0 ? index : -1;
}

export function isKnownBackupJobPhase(
  type: BackupCriticalJobType,
  phase: string,
): boolean {
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

export function sanitizeBackupJobContext(raw: unknown): BackupCriticalJobContext {
  if (typeof raw !== "object" || raw === null) {
    return {};
  }
  const input = raw as Record<string, unknown>;
  const context: BackupCriticalJobContext = {};
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

export function mergeBackupCriticalJobs(
  existing: BackupCriticalJob,
  incoming: BackupCriticalJob,
): BackupCriticalJob {
  const incomingPhaseRank = backupCriticalJobPhaseRank(incoming.phase);
  const existingPhaseRank = backupCriticalJobPhaseRank(existing.phase);
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

export function isBackupJobInterruptedAmbiguous(
  type: BackupCriticalJobType,
  phase: string | undefined,
): boolean {
  return (
    (type === "restore" && phase === "applying-restore")
    || (type === "pre-update-backup" && typeof phase !== "string")
  );
}

export function shouldDropTerminalPreUpdateOnLoad(status: CriticalJobStatus): boolean {
  return status === "cancelled" || status === "failed" || status === "blocked";
}

export type RestoreJobLoadDisposition = "omit" | "invalid" | "keep";

export function restoreJobLoadDisposition(input: {
  phase: string | undefined;
  jobId: string;
  serverId: string;
  backupId: string | null;
  history: (RestoreHistoryOwnershipEvidence & { status: string }) | null;
}): RestoreJobLoadDisposition {
  if (
    input.phase === "restore-complete"
    || (
      input.history?.status === "completed"
      && isRestoreHistoryOwnedByJob(
        input.jobId,
        input.serverId,
        input.backupId,
        input.history,
      )
    )
  ) {
    return "omit";
  }
  if (input.history?.status === "completed") {
    return "invalid";
  }
  return "keep";
}

export interface BackupCriticalJobRetryPlan {
  status: "pending";
  phase: "queued";
  maxAttempts: number;
  recoveryReason: string;
  updatedAt: string;
  clearContext: boolean;
  restoreHistoryIdToSupersede: number | null;
}

export function planBackupCriticalJobRetry(
  job: Pick<BackupCriticalJob, "type" | "attempts" | "maxAttempts" | "context">,
  reason: string,
  nowIso?: string,
): BackupCriticalJobRetryPlan {
  return {
    status: "pending",
    phase: "queued",
    maxAttempts: Math.max(job.maxAttempts, job.attempts + 3),
    recoveryReason: reason,
    updatedAt: nowIso ?? new Date().toISOString(),
    clearContext: job.type === "restore",
    restoreHistoryIdToSupersede:
      job.type === "restore" && typeof job.context.restoreHistoryId === "number"
        ? job.context.restoreHistoryId
        : null,
  };
}
