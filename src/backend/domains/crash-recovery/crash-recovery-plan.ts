import type { CrashRecoveryPolicy } from "@shared/types";
import { crashRecoveryBackoffMs } from "@shared/crash-recovery/crash-recovery-policy";

/** Why a crash was not auto-restarted (kept quiet — no event noise). */
export type CrashRecoverySkipReason =
  | "disabled"
  | "profile_disabled"
  | "paused"
  | "stop_in_progress"
  | "locked"
  | "maintenance";

export interface CrashRecoveryEligibilityInput {
  policy: CrashRecoveryPolicy;
  serverEnabled: boolean;
  stopInProgress: boolean;
  locked: boolean;
  maintenanceActive: boolean;
}

/**
 * Shared eligibility gate used both when a crash is observed and again when a
 * scheduled retry fires (state may have changed in the backoff window).
 */
export function crashRecoveryBlockReason(
  input: CrashRecoveryEligibilityInput,
): CrashRecoverySkipReason | null {
  if (!input.policy.enabled) return "disabled";
  if (!input.serverEnabled) return "profile_disabled";
  if (input.policy.paused) return "paused";
  if (input.stopInProgress) return "stop_in_progress";
  if (input.locked) return "locked";
  if (input.maintenanceActive) return "maintenance";
  return null;
}

export type CrashRecoveryPlan =
  | { kind: "skip"; reason: CrashRecoverySkipReason }
  | {
      kind: "restart";
      /** Attempt number within the budget (1-based). */
      attempts: number;
      maxAttempts: number;
      delayMs: number;
      /** True when the previous run was long enough to reset the budget. */
      stabilized: boolean;
    }
  | { kind: "exhausted"; attempts: number; maxAttempts: number };

/**
 * Decide what to do after an unexpected exit.
 *
 * `uptimeMs` is how long the crashed process had been managed. When it reached
 * the stability window the attempt budget resets first — a crash after a long
 * healthy run counts as attempt 1, not the next in a boot loop.
 */
export function planCrashRecovery(
  input: CrashRecoveryEligibilityInput & { uptimeMs: number | null },
): CrashRecoveryPlan {
  const blocked = crashRecoveryBlockReason(input);
  if (blocked !== null) return { kind: "skip", reason: blocked };

  const stabilized =
    input.uptimeMs !== null
    && input.uptimeMs >= input.policy.stabilitySeconds * 1000;
  const attempts = (stabilized ? 0 : input.policy.attempts) + 1;
  if (attempts > input.policy.maxAttempts) {
    return {
      kind: "exhausted",
      attempts: input.policy.maxAttempts,
      maxAttempts: input.policy.maxAttempts,
    };
  }
  return {
    kind: "restart",
    attempts,
    maxAttempts: input.policy.maxAttempts,
    delayMs: crashRecoveryBackoffMs(input.policy.backoffSeconds, attempts),
    stabilized,
  };
}
