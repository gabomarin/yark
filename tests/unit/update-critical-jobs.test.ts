import { describe, expect, it } from "vitest";
import {
  canCancelUpdateCriticalJob,
  isKnownUpdateJobPhase,
  isKnownUpdateJobStatus,
  isUpdateJobInterruptedAmbiguous,
  isUpdatePauseBlockedByRollback,
  isUpdateQueueHeldForOperator,
  isUnpausableSteamCmdOperation,
  mergeUpdateCriticalJobs,
  planCancelUpdateCriticalJob,
  reorderPendingUpdateJobs,
  resumePhaseForUpdateRetry,
  sanitizeUpdateJobContext,
  shouldOmitInterruptedUpdateJobOnLoad,
  updateCriticalJobPhaseRank,
  type UpdateCriticalJob,
} from "@backend/domains/updates/update-critical-jobs";

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

describe("reorderPendingUpdateJobs", () => {
  it("swaps pending jobs and refuses non-pending or OOB moves", () => {
    const queue = [
      job({ id: "a", status: "pending", phase: "queued" }),
      job({ id: "b", status: "running", phase: "applying-files" }),
      job({ id: "c", status: "pending", phase: "queued" }),
    ];
    const down = reorderPendingUpdateJobs(queue, "a", "down");
    expect(down?.map((row) => row.id)).toEqual(["c", "b", "a"]);
    expect(reorderPendingUpdateJobs(queue, "b", "up")).toBeNull();
    expect(reorderPendingUpdateJobs(queue, "a", "up")).toBeNull();
  });
});

describe("cancel helpers", () => {
  it("allows cancel for pending/retrying/paused only", () => {
    expect(canCancelUpdateCriticalJob("pending")).toBe(true);
    expect(canCancelUpdateCriticalJob("paused")).toBe(true);
    expect(canCancelUpdateCriticalJob("running")).toBe(false);
  });

  it("plans cancel reasons for paused vs pending", () => {
    expect(planCancelUpdateCriticalJob(true, "2026-01-02T00:00:00.000Z")).toEqual({
      status: "cancelled",
      phase: "cancelled",
      recoveryReason: "Cancelled by the operator after pause.",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    expect(planCancelUpdateCriticalJob(false, "2026-01-02T00:00:00.000Z").recoveryReason)
      .toBe("Cancelled by the operator before execution.");
  });
});

describe("pause helpers", () => {
  it("blocks pause during active rollback", () => {
    expect(isUpdatePauseBlockedByRollback("rollback-restoring-backups")).toBe(true);
    expect(isUpdatePauseBlockedByRollback("rollback-complete")).toBe(false);
    expect(isUpdatePauseBlockedByRollback("applying-files")).toBe(false);
  });

  it("marks verify/install-steamcmd as unpausable", () => {
    expect(isUnpausableSteamCmdOperation("verify-files")).toBe(true);
    expect(isUnpausableSteamCmdOperation("install-steamcmd")).toBe(true);
    expect(isUnpausableSteamCmdOperation("update")).toBe(false);
  });
});

describe("sanitizeUpdateJobContext", () => {
  it("trims and dedupes backup ids", () => {
    expect(sanitizeUpdateJobContext(null)).toEqual({});
    expect(
      sanitizeUpdateJobContext({
        wasRunning: true,
        preUpdateBackupIds: [" a ", "a", ""],
        restartInterrupted: true,
        operatorAwaited: false,
      }),
    ).toEqual({
      wasRunning: true,
      preUpdateBackupIds: ["a"],
      restartInterrupted: true,
    });
  });
});

describe("mergeUpdateCriticalJobs", () => {
  it("prefers higher phase and unions backup ids", () => {
    const existing = job({
      id: "a",
      status: "pending",
      phase: "queued",
      attempts: 1,
      context: { preUpdateBackupIds: ["b1"] },
    });
    const incoming = job({
      id: "b",
      status: "pending",
      phase: "applying-files",
      attempts: 2,
      updatedAt: "2026-01-02T00:00:00.000Z",
      context: { preUpdateBackupIds: ["b2"], restartInterrupted: true },
    });
    const merged = mergeUpdateCriticalJobs(existing, incoming);
    expect(merged.phase).toBe("applying-files");
    expect(merged.context.preUpdateBackupIds).toEqual(["b2", "b1"]);
    expect(merged.context.restartInterrupted).toBe(true);
    expect(updateCriticalJobPhaseRank("applying-files")).toBeGreaterThan(
      updateCriticalJobPhaseRank("queued"),
    );
  });
});

describe("resumePhaseForUpdateRetry", () => {
  it("keeps restarting/rollback and jumps after pre-update backups", () => {
    expect(
      resumePhaseForUpdateRetry(
        job({ id: "1", status: "paused", phase: "restarting-server" }),
      ),
    ).toBe("restarting-server");
    expect(
      resumePhaseForUpdateRetry(
        job({
          id: "2",
          status: "paused",
          phase: "rollback-restoring-backups",
          type: "update",
        }),
      ),
    ).toBe("rollback-restoring-backups");
    expect(
      resumePhaseForUpdateRetry(
        job({
          id: "3",
          status: "cancelled",
          phase: "applying-files",
          type: "update",
          context: { preUpdateBackupIds: ["b1"] },
        }),
      ),
    ).toBe("pre-update-backup-complete");
    expect(
      resumePhaseForUpdateRetry(
        job({ id: "4", status: "cancelled", phase: "applying-files", type: "verify-files" }),
      ),
    ).toBe("queued");
  });
});

describe("load helpers", () => {
  it("detects ambiguous interrupt phases", () => {
    expect(isUpdateJobInterruptedAmbiguous("update", "applying-files")).toBe(true);
    expect(isUpdateJobInterruptedAmbiguous("update", "files-applied")).toBe(false);
    expect(isUpdateJobInterruptedAmbiguous("verify-files", "stopping-server")).toBe(true);
  });

  it("omits stale interrupted rows when runtime already matches", () => {
    expect(
      shouldOmitInterruptedUpdateJobOnLoad({
        wasInterrupted: true,
        phase: "files-applied",
        wasRunning: true,
        serverIsActive: true,
      }),
    ).toBe(true);
    expect(
      shouldOmitInterruptedUpdateJobOnLoad({
        wasInterrupted: true,
        phase: "files-applied",
        wasRunning: false,
        serverIsActive: false,
      }),
    ).toBe(true);
    expect(
      shouldOmitInterruptedUpdateJobOnLoad({
        wasInterrupted: true,
        phase: "applying-files",
        wasRunning: true,
        serverIsActive: false,
      }),
    ).toBe(false);
  });
});

describe("status/phase and queue hold", () => {
  it("knows statuses/phases and detects operator hold", () => {
    expect(isKnownUpdateJobStatus("paused")).toBe(true);
    expect(isKnownUpdateJobPhase("creating-pre-update-backup")).toBe(true);
    expect(
      isUpdateQueueHeldForOperator([
        job({ id: "1", status: "pending", phase: "queued" }),
        job({
          id: "2",
          status: "failed",
          phase: "failed",
          context: { restartInterrupted: true },
        }),
      ]),
    ).toBe(true);
  });
});
