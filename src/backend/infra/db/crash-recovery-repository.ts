import type { DatabaseSync } from "node:sqlite";
import {
  clampCrashRecoveryInt,
  CRASH_RECOVERY_LIMITS,
  DEFAULT_CRASH_RECOVERY,
  defaultCrashRecoveryPolicy,
} from "@shared/crash-recovery/crash-recovery-policy";
import type { CrashRecoveryPolicy } from "@shared/types";

interface PolicyRow {
  server_id: string;
  enabled: number;
  max_attempts: number;
  backoff_seconds: number;
  stability_seconds: number;
  attempts: number;
  paused: number;
  last_failure_reason: string | null;
  updated_at: string;
}

/** Editable policy fields (attempt budget + outcome live server-side). */
export type CrashRecoveryPolicyWrite = Omit<
  CrashRecoveryPolicy,
  "serverId" | "updatedAt" | "attempts" | "exhausted" | "lastFailureReason"
>;

function rowToPolicy(row: PolicyRow): CrashRecoveryPolicy {
  const maxAttempts = clampCrashRecoveryInt(
    row.max_attempts,
    CRASH_RECOVERY_LIMITS.minAttempts,
    CRASH_RECOVERY_LIMITS.maxAttempts,
    DEFAULT_CRASH_RECOVERY.maxAttempts,
  );
  const attempts = Math.max(0, Math.trunc(row.attempts));
  return {
    serverId: row.server_id,
    enabled: row.enabled === 1,
    maxAttempts,
    backoffSeconds: clampCrashRecoveryInt(
      row.backoff_seconds,
      CRASH_RECOVERY_LIMITS.minBackoffSeconds,
      CRASH_RECOVERY_LIMITS.maxBackoffSeconds,
      DEFAULT_CRASH_RECOVERY.backoffSeconds,
    ),
    stabilitySeconds: clampCrashRecoveryInt(
      row.stability_seconds,
      CRASH_RECOVERY_LIMITS.minStabilitySeconds,
      CRASH_RECOVERY_LIMITS.maxStabilitySeconds,
      DEFAULT_CRASH_RECOVERY.stabilitySeconds,
    ),
    attempts,
    paused: row.paused === 1,
    exhausted: attempts >= maxAttempts,
    lastFailureReason: row.last_failure_reason,
    updatedAt: row.updated_at,
  };
}

/**
 * Per-server crash-recovery policy + persisted attempt budget (#563).
 * Attempt/pause state survives relaunch so quitting cannot reset the budget.
 */
export class CrashRecoveryRepository {
  constructor(private readonly db: DatabaseSync) {}

  /** Read-only: returns defaults when no row exists (does not INSERT). */
  getPolicy(serverId: string): CrashRecoveryPolicy {
    const row = this.db
      .prepare("SELECT * FROM crash_recovery_policies WHERE server_id = ?")
      .get(serverId) as unknown as PolicyRow | undefined;
    if (row !== undefined) return rowToPolicy(row);
    return defaultCrashRecoveryPolicy(serverId, new Date().toISOString());
  }

  /** Idempotent seed with conservative default-off values. */
  ensurePolicy(serverId: string): void {
    const now = new Date().toISOString();
    const defaults = defaultCrashRecoveryPolicy(serverId, now);
    this.db
      .prepare(
        `INSERT OR IGNORE INTO crash_recovery_policies (
          server_id, enabled, max_attempts, backoff_seconds, stability_seconds,
          attempts, paused, last_failure_reason, updated_at
        ) VALUES (?, 0, ?, ?, ?, 0, 0, NULL, ?)`,
      )
      .run(
        serverId,
        defaults.maxAttempts,
        defaults.backoffSeconds,
        defaults.stabilitySeconds,
        now,
      );
  }

  ensurePoliciesForServers(serverIds: readonly string[]): void {
    for (const serverId of serverIds) {
      this.ensurePolicy(serverId);
    }
  }

  /** Upsert policy knobs; never touches the persisted attempt budget. */
  setPolicy(
    serverId: string,
    input: CrashRecoveryPolicyWrite,
  ): CrashRecoveryPolicy {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO crash_recovery_policies (
          server_id, enabled, max_attempts, backoff_seconds, stability_seconds,
          attempts, paused, last_failure_reason, updated_at
        ) VALUES (?, ?, ?, ?, ?, 0, ?, NULL, ?)
        ON CONFLICT(server_id) DO UPDATE SET
          enabled = excluded.enabled,
          max_attempts = excluded.max_attempts,
          backoff_seconds = excluded.backoff_seconds,
          stability_seconds = excluded.stability_seconds,
          paused = excluded.paused,
          updated_at = excluded.updated_at`,
      )
      .run(
        serverId,
        input.enabled ? 1 : 0,
        clampCrashRecoveryInt(
          input.maxAttempts,
          CRASH_RECOVERY_LIMITS.minAttempts,
          CRASH_RECOVERY_LIMITS.maxAttempts,
          DEFAULT_CRASH_RECOVERY.maxAttempts,
        ),
        clampCrashRecoveryInt(
          input.backoffSeconds,
          CRASH_RECOVERY_LIMITS.minBackoffSeconds,
          CRASH_RECOVERY_LIMITS.maxBackoffSeconds,
          DEFAULT_CRASH_RECOVERY.backoffSeconds,
        ),
        clampCrashRecoveryInt(
          input.stabilitySeconds,
          CRASH_RECOVERY_LIMITS.minStabilitySeconds,
          CRASH_RECOVERY_LIMITS.maxStabilitySeconds,
          DEFAULT_CRASH_RECOVERY.stabilitySeconds,
        ),
        input.paused ? 1 : 0,
        now,
      );
    return this.getPolicy(serverId);
  }

  /** Persist the consumed budget after an unexpected exit. */
  recordAttempt(
    serverId: string,
    attempts: number,
    lastFailureReason: string | null,
  ): void {
    this.db
      .prepare(
        `UPDATE crash_recovery_policies
         SET attempts = ?, last_failure_reason = ?, updated_at = ?
         WHERE server_id = ?`,
      )
      .run(
        Math.max(0, Math.trunc(attempts)),
        lastFailureReason,
        new Date().toISOString(),
        serverId,
      );
  }

  /** Clear the attempt budget (operator reset or stable run). */
  reset(serverId: string): void {
    this.db
      .prepare(
        `UPDATE crash_recovery_policies
         SET attempts = 0, last_failure_reason = NULL, updated_at = ?
         WHERE server_id = ?`,
      )
      .run(new Date().toISOString(), serverId);
  }
}
