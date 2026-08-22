import { describe, expect, it } from "vitest";
import type { UpdateCriticalJob } from "@backend/domains/updates/update-critical-jobs";
import {
  findNextRunnableQueueJob,
  isAmbiguousRollbackFailure,
  isIncompleteRollbackOnCancel,
  isPersistedUpdateQueueEntryInvalid,
  isRecoveredFileJobPhase,
  planQueueJobCancelDisposition,
  planQueueJobFailureDisposition,
  planQueueJobPauseDisposition,
  planSteamCmdMissingQueueBlock,
  resolveUpdateQueueJobHandler,
  shouldClearQueueIdleProgress,
  shouldStopQueueProcessing,
} from "@backend/domains/updates/update-queue";

function job(
  partial: Partial<UpdateCriticalJob> & Pick<UpdateCriticalJob, "id" | "phase" | "status">,
): UpdateCriticalJob {
  return {
    type: "update",
    serverId: "srv-1",
    attempts: 0,
    maxAttempts: 3,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastError: null,
    recoveryReason: null,
    idempotencyKey: `update:srv-1:${partial.id}`,
    operatorRetryAllowed: false,
    context: {},
    ...partial,
  };
}

describe("queue flow helpers", () => {
  it("stops on paused or restart-interrupted jobs", () => {
    expect(shouldStopQueueProcessing([job({ id: "a", status: "pending", phase: "queued" })]))
      .toBe(false);
    expect(
      shouldStopQueueProcessing([
        job({ id: "a", status: "paused", phase: "applying-files" }),
      ]),
    ).toBe(true);
    expect(
      shouldStopQueueProcessing([
        job({
          id: "a",
          status: "failed",
          phase: "applying-files",
          context: { restartInterrupted: true },
        }),
      ]),
    ).toBe(true);
  });

  it("finds the next pending or retrying job", () => {
    const queue = [
      job({ id: "a", status: "running", phase: "applying-files" }),
      job({ id: "b", status: "retrying", phase: "queued" }),
    ];
    expect(findNextRunnableQueueJob(queue)?.id).toBe("b");
  });

  it("resolves handlers from type and phase", () => {
    expect(
      resolveUpdateQueueJobHandler({ type: "install-files", phase: "queued" }),
    ).toBe("install");
    expect(
      resolveUpdateQueueJobHandler({ type: "update", phase: "files-applied" }),
    ).toBe("recover-file-job");
    expect(
      resolveUpdateQueueJobHandler({ type: "update", phase: "rollback-restoring-backups" }),
    ).toBe("recover-rollback");
  });

  it("clears idle progress only when nothing is active", () => {
    expect(
      shouldClearQueueIdleProgress({
        queueLength: 0,
        hasActiveSteamCmd: false,
        syncingServerId: null,
      }),
    ).toBe(true);
    expect(
      shouldClearQueueIdleProgress({
        queueLength: 0,
        hasActiveSteamCmd: true,
        syncingServerId: null,
      }),
    ).toBe(false);
  });
});

describe("rollback phase helpers", () => {
  it("detects recovered file and active rollback phases", () => {
    expect(isRecoveredFileJobPhase("restarting-server")).toBe(true);
    expect(isIncompleteRollbackOnCancel("update", "rollback-restoring-backups")).toBe(true);
    expect(isAmbiguousRollbackFailure("update", "rollback-restoring-backups")).toBe(true);
  });
});

describe("planQueueJobCancelDisposition", () => {
  it("blocks incomplete rollback cancels and keeps rollback-complete copy", () => {
    expect(
      planQueueJobCancelDisposition({
        jobType: "update",
        phase: "rollback-restoring-backups",
      }).status,
    ).toBe("blocked");
    expect(
      planQueueJobCancelDisposition({
        jobType: "update",
        phase: "rollback-complete",
      }).recoveryReason,
    ).toContain("rollback completed safely");
  });
});

describe("planQueueJobFailureDisposition", () => {
  it("blocks recovery and ambiguous rollback failures", () => {
    expect(
      planQueueJobFailureDisposition({
        job: job({ id: "a", status: "running", phase: "validating", attempts: 1 }),
        error: new Error("Stop the server"),
        isRecoveryBlocked: true,
      }).action,
    ).toBe("blocked");
    expect(
      planQueueJobFailureDisposition({
        job: job({
          id: "a",
          status: "running",
          phase: "rollback-restoring-backups",
          attempts: 1,
        }),
        error: new Error("disk full"),
        isRecoveryBlocked: false,
      }).action,
    ).toBe("blocked");
  });

  it("schedules retry for transient failures under the attempt cap", () => {
    const plan = planQueueJobFailureDisposition({
      job: job({ id: "a", status: "running", phase: "applying-files", attempts: 1 }),
      error: new Error("EBUSY"),
      isRecoveryBlocked: false,
      isTransient: () => true,
    });
    expect(plan.action).toBe("retry");
    expect(plan.status).toBe("retrying");
  });
});

describe("persisted queue validation", () => {
  it("rejects malformed persisted rows", () => {
    expect(isPersistedUpdateQueueEntryInvalid({ id: "x" })).toBe(true);
    expect(
      isPersistedUpdateQueueEntryInvalid({
        id: "x",
        type: "update",
        serverId: "srv-1",
        status: "bogus" as UpdateCriticalJob["status"],
      }),
    ).toBe(true);
    expect(
      isPersistedUpdateQueueEntryInvalid({
        id: "x",
        type: "update",
        serverId: "srv-1",
        status: "pending",
        phase: "queued",
      }),
    ).toBe(false);
  });
});

describe("planSteamCmdMissingQueueBlock", () => {
  it("marks jobs blocked with operator retry", () => {
    expect(planSteamCmdMissingQueueBlock("missing")).toEqual({
      status: "blocked",
      operatorRetryAllowed: true,
      recoveryReason: "missing",
    });
  });
});

describe("planQueueJobPauseDisposition", () => {
  it("returns paused without recovery reason", () => {
    expect(planQueueJobPauseDisposition()).toEqual({
      status: "paused",
      recoveryReason: null,
    });
  });
});
