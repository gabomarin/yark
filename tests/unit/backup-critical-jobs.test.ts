import { describe, expect, it } from "vitest";
import {
  backupCriticalJobPhaseRank,
  isBackupJobInterruptedAmbiguous,
  isKnownBackupJobPhase,
  isKnownBackupJobStatus,
  mergeBackupCriticalJobs,
  planBackupCriticalJobRetry,
  restoreJobLoadDisposition,
  sanitizeBackupJobContext,
  shouldDropTerminalPreUpdateOnLoad,
  type BackupCriticalJob,
} from "@backend/domains/backups/backup-critical-jobs";

function job(partial: Partial<BackupCriticalJob> & Pick<BackupCriticalJob, "id" | "phase">): BackupCriticalJob {
  return {
    type: "restore",
    serverId: "srv-1",
    backupId: "bak-1",
    attempts: 0,
    maxAttempts: 3,
    status: "pending",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastError: null,
    recoveryReason: null,
    idempotencyKey: "restore:srv-1:bak-1",
    operatorRetryAllowed: false,
    context: {},
    ...partial,
  };
}

describe("isKnownBackupJobPhase", () => {
  it("accepts static phases for both types", () => {
    expect(isKnownBackupJobPhase("restore", "applying-restore")).toBe(true);
    expect(isKnownBackupJobPhase("pre-update-backup", "queued")).toBe(true);
  });

  it("accepts pre-update kind phases only for pre-update jobs", () => {
    expect(isKnownBackupJobPhase("pre-update-backup", "creating-backup:world")).toBe(true);
    expect(isKnownBackupJobPhase("pre-update-backup", "backup-complete:ini")).toBe(true);
    expect(isKnownBackupJobPhase("restore", "creating-backup:world")).toBe(false);
    expect(isKnownBackupJobPhase("pre-update-backup", "creating-backup:mods")).toBe(false);
  });
});

describe("sanitizeBackupJobContext", () => {
  it("returns empty for non-objects and trims ids", () => {
    expect(sanitizeBackupJobContext(null)).toEqual({});
    expect(
      sanitizeBackupJobContext({
        completedBackupIds: [" a ", "", 1],
        nextKindIndex: 2.9,
        restoreHistoryId: 3.2,
        safeguardBackupIds: [" s1 "],
      }),
    ).toEqual({
      completedBackupIds: ["a"],
      nextKindIndex: 2,
      restoreHistoryId: 3,
      safeguardBackupIds: ["s1"],
    });
  });
});

describe("mergeBackupCriticalJobs", () => {
  it("prefers the higher phase and unions context ids", () => {
    const existing = job({
      id: "a",
      phase: "queued",
      attempts: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
      context: { completedBackupIds: ["c1"], nextKindIndex: 0 },
    });
    const incoming = job({
      id: "b",
      phase: "applying-restore",
      attempts: 2,
      updatedAt: "2026-01-02T00:00:00.000Z",
      operatorRetryAllowed: true,
      context: {
        completedBackupIds: ["c2"],
        nextKindIndex: 1,
        restoreHistoryId: 9,
        safeguardBackupIds: ["s1"],
      },
    });
    const merged = mergeBackupCriticalJobs(existing, incoming);
    expect(merged.phase).toBe("applying-restore");
    expect(merged.attempts).toBe(2);
    expect(merged.operatorRetryAllowed).toBe(true);
    expect(merged.context.completedBackupIds).toEqual(["c2", "c1"]);
    expect(merged.context.nextKindIndex).toBe(1);
    expect(merged.context.restoreHistoryId).toBe(9);
  });

  it("ranks applying-restore above restore-complete", () => {
    expect(backupCriticalJobPhaseRank("applying-restore")).toBeGreaterThan(
      backupCriticalJobPhaseRank("restore-complete"),
    );
  });
});

describe("isBackupJobInterruptedAmbiguous", () => {
  it("flags restore apply and missing pre-update phase", () => {
    expect(isBackupJobInterruptedAmbiguous("restore", "applying-restore")).toBe(true);
    expect(isBackupJobInterruptedAmbiguous("pre-update-backup", undefined)).toBe(true);
    expect(isBackupJobInterruptedAmbiguous("restore", "queued")).toBe(false);
  });
});

describe("planBackupCriticalJobRetry", () => {
  it("clears restore context and returns history id to supersede", () => {
    const plan = planBackupCriticalJobRetry(
      {
        type: "restore",
        attempts: 2,
        maxAttempts: 3,
        context: { restoreHistoryId: 44 },
      },
      "operator retry",
      "2026-01-03T00:00:00.000Z",
    );
    expect(plan).toEqual({
      status: "pending",
      phase: "queued",
      maxAttempts: 5,
      recoveryReason: "operator retry",
      updatedAt: "2026-01-03T00:00:00.000Z",
      clearContext: true,
      restoreHistoryIdToSupersede: 44,
    });
  });

  it("does not clear pre-update context", () => {
    const plan = planBackupCriticalJobRetry(
      {
        type: "pre-update-backup",
        attempts: 0,
        maxAttempts: 3,
        context: { completedBackupIds: ["x"] },
      },
      "retry",
      "2026-01-03T00:00:00.000Z",
    );
    expect(plan.clearContext).toBe(false);
    expect(plan.restoreHistoryIdToSupersede).toBeNull();
  });
});

describe("restoreJobLoadDisposition", () => {
  it("omits completed owned history and invalidates unrelated completed history", () => {
    expect(
      restoreJobLoadDisposition({
        phase: "restore-complete",
        jobId: "job-1",
        serverId: "srv-1",
        backupId: "bak-1",
        history: null,
      }),
    ).toBe("omit");
    expect(
      restoreJobLoadDisposition({
        phase: "applying-restore",
        jobId: "job-1",
        serverId: "srv-1",
        backupId: "bak-1",
        history: {
          serverId: "srv-1",
          backupId: "bak-1",
          status: "completed",
          notes: "[critical-job:job-1]",
        },
      }),
    ).toBe("omit");
    expect(
      restoreJobLoadDisposition({
        phase: "applying-restore",
        jobId: "job-1",
        serverId: "srv-1",
        backupId: "bak-1",
        history: {
          serverId: "srv-1",
          backupId: "bak-other",
          status: "completed",
          notes: "[critical-job:job-1]",
        },
      }),
    ).toBe("invalid");
  });
});

describe("status helpers", () => {
  it("knows statuses and drops terminal pre-update rows", () => {
    expect(isKnownBackupJobStatus("pending")).toBe(true);
    expect(isKnownBackupJobStatus("paused")).toBe(false);
    expect(shouldDropTerminalPreUpdateOnLoad("failed")).toBe(true);
    expect(shouldDropTerminalPreUpdateOnLoad("running")).toBe(false);
  });
});
