import { formatCrashRecoveryCountdown } from "../hooks/useCrashRecoveryCountdown";

/**
 * Shared notice tone for the ServerCard row and the workspace-header badge (#563).
 * Keep both on this token so the two surfaces never drift apart.
 */
export const CRASH_RECOVERY_NOTICE_COLOR = "attention";

/** Lowercase fragment used by the ServerCard row (`… — restarting in 25s`). */
export function crashRecoveryWhenLabel(seconds: number): string {
  return seconds <= 0 ? "restarting now" : `restarting in ${formatCrashRecoveryCountdown(seconds)}`;
}

/** Compact label used by the workspace-header badge. */
export function crashRecoveryBadgeLabel(seconds: number): string {
  return seconds <= 0 ? "Restarting…" : `Restarting in ${formatCrashRecoveryCountdown(seconds)}`;
}

export function crashRecoveryAttemptTooltip(attempt: number, maxAttempts: number): string {
  return `The server crashed. YARK will try to start it again (attempt ${attempt} of ${maxAttempts}).`;
}
