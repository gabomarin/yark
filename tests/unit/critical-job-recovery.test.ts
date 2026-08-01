import { describe, expect, it } from "vitest";
import {
  isTransientCriticalJobError,
  makeIdempotencyKey,
  migrateCriticalJob,
  nextActionsForStatus,
  type DurableCriticalJob,
} from "@backend/orchestration/critical-job-recovery";

function interruptedJob(
  type: DurableCriticalJob["type"],
  phase: string,
): Partial<DurableCriticalJob> {
  return {
    id: "job-1",
    type,
    serverId: "server-1",
    attempts: 1,
    maxAttempts: 3,
    status: "running",
    phase,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:01:00.000Z",
    lastError: "process exited",
    recoveryReason: null,
    idempotencyKey: makeIdempotencyKey(type, "server-1"),
    operatorRetryAllowed: false,
  };
}

describe("critical job restart recovery", () => {
  it("requeues a replay-safe interrupted phase and preserves attempts", () => {
    const recovered = migrateCriticalJob<DurableCriticalJob>(
      interruptedJob("verify-files", "applying-files"),
      {
        type: "verify-files",
        serverId: "server-1",
        defaultPhase: "queued",
        interruptedIsAmbiguous: false,
        serverExists: true,
      },
    );

    expect(recovered.status).toBe("pending");
    expect(recovered.attempts).toBe(1);
    expect(recovered.recoveryReason).toMatch(/application restart/i);
  });

  it.each([
    ["update", "applying-files"],
    ["update", "rollback-restoring-backups"],
    ["restore", "applying-restore"],
  ] as const)("blocks ambiguous %s recovery during %s", (type, phase) => {
    const recovered = migrateCriticalJob<DurableCriticalJob>(interruptedJob(type, phase), {
      type,
      serverId: "server-1",
      defaultPhase: "queued",
      interruptedIsAmbiguous: true,
      serverExists: true,
    });

    expect(recovered.status).toBe("blocked");
    expect(recovered.recoveryReason).toContain(phase);
    expect(nextActionsForStatus(recovered.status)).toEqual(["retry", "dismiss"]);
  });

  it("fails a recovered job whose server profile was deleted", () => {
    const recovered = migrateCriticalJob<DurableCriticalJob>(
      interruptedJob("install-files", "validating"),
      {
        type: "install-files",
        serverId: "server-1",
        defaultPhase: "queued",
        interruptedIsAmbiguous: false,
        serverExists: false,
      },
    );

    expect(recovered.status).toBe("failed");
    expect(recovered.recoveryReason).toMatch(/no longer exists/i);
    expect(nextActionsForStatus(recovered.status, recovered.operatorRetryAllowed))
      .toEqual(["dismiss"]);
  });

  it("does not classify validation, security, missing-profile, or cancellation errors as transient", () => {
    expect(isTransientCriticalJobError(new Error("Server does not exist"))).toBe(false);
    expect(isTransientCriticalJobError(new Error("Unsafe traversal entry"))).toBe(false);
    expect(isTransientCriticalJobError(new Error("Operation cancelled"))).toBe(false);
    expect(isTransientCriticalJobError(new Error("Steam endpoint timed out"))).toBe(true);
    expect(isTransientCriticalJobError(new Error("Unexpected parser failure"))).toBe(false);
  });

  it("uses stable operation identity to coalesce duplicate work", () => {
    expect(makeIdempotencyKey("restore", "server-1", "backup-7"))
      .toBe("restore:server-1:backup-7");
  });
});
