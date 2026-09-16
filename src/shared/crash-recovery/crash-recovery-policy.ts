import type { CrashRecoveryPolicy } from "../types";

/** Editable bounds for the policy fields (shared by schema + UI). */
export const CRASH_RECOVERY_LIMITS = {
  minAttempts: 1,
  maxAttempts: 10,
  minBackoffSeconds: 5,
  maxBackoffSeconds: 3600,
  minStabilitySeconds: 60,
  maxStabilitySeconds: 24 * 3600,
} as const;

/**
 * Conservative defaults: 3 attempts, 30s linear backoff (30/60/90s), and a
 * 10-minute stability window that resets the budget after a healthy run.
 */
export const DEFAULT_CRASH_RECOVERY = {
  maxAttempts: 3,
  backoffSeconds: 30,
  stabilitySeconds: 600,
} as const;

export function defaultCrashRecoveryPolicy(
  serverId: string,
  updatedAt: string,
): CrashRecoveryPolicy {
  return {
    serverId,
    enabled: false,
    maxAttempts: DEFAULT_CRASH_RECOVERY.maxAttempts,
    backoffSeconds: DEFAULT_CRASH_RECOVERY.backoffSeconds,
    stabilitySeconds: DEFAULT_CRASH_RECOVERY.stabilitySeconds,
    attempts: 0,
    paused: false,
    exhausted: false,
    lastFailureReason: null,
    updatedAt,
  };
}

export function clampCrashRecoveryInt(
  value: number,
  min: number,
  max: number,
  fallback: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Backoff before restart attempt N: linear, `N × backoffSeconds`. */
export function crashRecoveryBackoffMs(
  backoffSeconds: number,
  attempt: number,
): number {
  return Math.max(1, attempt) * backoffSeconds * 1000;
}
