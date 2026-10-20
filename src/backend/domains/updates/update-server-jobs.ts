import { basename, isAbsolute, join, relative, resolve } from "node:path";
import type { CriticalJobStatus } from "@shared/types";
import type { BackupKind } from "@shared/types";
import type { UpdateCriticalJobContext, UpdateCriticalJobType } from "./update-critical-jobs";

const PRE_UPDATE_BACKUP_PROGRESS_BASE_PERCENT = 5;
const PRE_UPDATE_BACKUP_PROGRESS_SPAN_PERCENT = 20;

export function shouldBlockUpdateWhileServerRunning(input: {
  isCurrentlyRunning: boolean;
  hasDurableJob: boolean;
  jobWasRunning: boolean | undefined;
}): boolean {
  return input.isCurrentlyRunning && input.hasDurableJob && input.jobWasRunning !== true;
}

export function shouldResumeFromPreUpdateBackup(preUpdateBackupIds: readonly string[] | undefined): boolean {
  return (preUpdateBackupIds?.length ?? 0) > 0;
}

export function isPreUpdateBackupEvidenceComplete(
  persistedIds: readonly string[],
  completedBackupsCount: number,
  requiredKindCount: number,
): boolean {
  return persistedIds.length > 0 && completedBackupsCount === requiredKindCount;
}

export function resolveUpdateWasRunning(jobWasRunning: boolean | undefined, isCurrentlyRunning: boolean): boolean {
  return jobWasRunning ?? isCurrentlyRunning;
}

export function captureWasRunningOnJob(context: UpdateCriticalJobContext, isCurrentlyRunning: boolean): void {
  if (context.wasRunning === undefined) {
    context.wasRunning = isCurrentlyRunning;
  }
}

export function updateInstallMayHaveChanged(input: {
  phase: string;
  steamCmdExitCode?: number;
  appliedBuildId?: string | null;
}): boolean {
  return (
    input.phase === "applying-files" ||
    input.phase === "files-applied" ||
    input.phase === "restarting-server" ||
    typeof input.steamCmdExitCode === "number" ||
    input.appliedBuildId != null
  );
}

export function shouldRestartServerAfterPreSteamCmdAbort(input: {
  wasRunning: boolean;
  installMayHaveChanged: boolean;
  serverIsActive: boolean;
}): boolean {
  return input.wasRunning && !input.installMayHaveChanged && !input.serverIsActive;
}

export function formatPreUpdateBackupKindLabel(kind: BackupKind | string): string {
  if (kind === "world") return "world save";
  if (kind === "ini") return "INI files";
  return "player profiles";
}

export function computePreUpdateBackupProgressPercent(index: number, total: number): number {
  return Math.round(
    PRE_UPDATE_BACKUP_PROGRESS_BASE_PERCENT +
      ((index + 0.5) / Math.max(total, 1)) * PRE_UPDATE_BACKUP_PROGRESS_SPAN_PERCENT,
  );
}

export function buildUpdateLogPath(updatesLogDir: string, serverId: string, startedAt: Date): string {
  const timestamp = startedAt.toISOString().replace(/[:.]/g, "-");
  return join(updatesLogDir, `${serverId}-${timestamp}.log`);
}

/** Keep a persisted job path inside this server's update-logs folder. Otherwise mint a new file. */
export function resolveCancelledUpdateLogPath(
  updatesLogDir: string,
  serverId: string,
  startedAt: Date,
  candidate: string | null,
): string {
  const fallback = buildUpdateLogPath(updatesLogDir, serverId, startedAt);
  if (candidate === null || candidate.trim().length === 0) return fallback;
  const root = resolve(updatesLogDir);
  const resolved = resolve(candidate);
  const rel = relative(root, resolved);
  const fileName = basename(resolved);
  if (
    rel.length === 0 ||
    rel.startsWith("..") ||
    isAbsolute(rel) ||
    !fileName.startsWith(`${serverId}-`) ||
    !fileName.toLowerCase().endsWith(".log")
  ) {
    return fallback;
  }
  return resolved;
}

export function formatUpdateLogContent(input: {
  serverName: string;
  installDir: string;
  /** Omit when the process never returned a code (operator cancel). */
  exitCode: number | null;
  /** Wins over `exitCode` when Logs classifies the file (#86). */
  outcome?: "cancelled";
  startedAt: Date;
  durationMs: number;
  stdout: string;
  stderr: string;
}): string {
  const lines = [`time=${new Date().toISOString()}`, `server=${input.serverName}`, `installDir=${input.installDir}`];
  if (input.exitCode !== null) {
    lines.push(`exitCode=${input.exitCode}`);
  }
  if (input.outcome === "cancelled") {
    lines.push("outcome=cancelled");
  }
  lines.push(
    `startedAt=${input.startedAt.toISOString()}`,
    `durationMs=${input.durationMs}`,
    "--- stdout ---",
    input.stdout,
    "--- stderr ---",
    input.stderr,
  );
  return lines.join("\n");
}

export function queuedFilesJobProgressLabel(type: UpdateCriticalJobType): string {
  if (type === "install-files") return "Queued: install files…";
  if (type === "verify-files") return "Queued: verify integrity…";
  return "Queued: update…";
}

export interface InterruptedUpdateJobRecovery {
  status: CriticalJobStatus;
  operatorRetryAllowed: boolean;
  recoveryReason: string;
  restartInterrupted?: true;
}

export function planInterruptedUpdateJobRecovery(input: {
  wasInterrupted: boolean;
  phase: string;
  interruptedIsAmbiguous: boolean;
  serverExists: boolean;
}): InterruptedUpdateJobRecovery | null {
  if (!input.wasInterrupted) {
    return null;
  }
  if (input.interruptedIsAmbiguous && input.serverExists) {
    return {
      status: "failed",
      operatorRetryAllowed: true,
      recoveryReason: `YARK closed during phase "${input.phase}". Retry to continue.`,
      restartInterrupted: true,
    };
  }
  if (input.phase === "files-applied") {
    return {
      status: "pending",
      operatorRetryAllowed: false,
      recoveryReason:
        "SteamCMD completion was checkpointed before restart; resuming only the remaining runtime transition.",
    };
  }
  if (input.phase === "rollback-complete") {
    return {
      status: "failed",
      operatorRetryAllowed: true,
      recoveryReason:
        "The update failed and its rollback was checkpointed as complete. Review the update log before retrying.",
    };
  }
  return null;
}

export function planDuplicateRecoveredUpdateJob(
  serverExists: boolean,
): Pick<InterruptedUpdateJobRecovery, "status" | "operatorRetryAllowed" | "recoveryReason"> | null {
  if (!serverExists) {
    return null;
  }
  return {
    status: "blocked",
    operatorRetryAllowed: true,
    recoveryReason: "Duplicate durable job records were recovered. Review the preserved phase before retrying.",
  };
}
