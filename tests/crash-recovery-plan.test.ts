import { describe, expect, it } from "vitest";
import { crashRecoveryBlockReason, planCrashRecovery } from "@backend/domains/crash-recovery/crash-recovery-plan";
import { defaultCrashRecoveryPolicy } from "@shared/crash-recovery/crash-recovery-policy";
import type { CrashRecoveryPolicy } from "@shared/types";

function policy(partial: Partial<CrashRecoveryPolicy> = {}): CrashRecoveryPolicy {
  return {
    ...defaultCrashRecoveryPolicy("s1", "2026-01-01T00:00:00.000Z"),
    enabled: true,
    ...partial,
  };
}

function input(
  overrides: Partial<{
    policy: CrashRecoveryPolicy;
    serverEnabled: boolean;
    uptimeMs: number | null;
    stopInProgress: boolean;
    locked: boolean;
    maintenanceActive: boolean;
  }> = {},
) {
  return {
    policy: policy(),
    serverEnabled: true,
    uptimeMs: 0,
    stopInProgress: false,
    locked: false,
    maintenanceActive: false,
    ...overrides,
  };
}

describe("planCrashRecovery", () => {
  it("skips when disabled, profile disabled, paused, stopping, locked, or maintenance", () => {
    expect(planCrashRecovery(input({ policy: policy({ enabled: false }) }))).toEqual({
      kind: "skip",
      reason: "disabled",
    });
    expect(planCrashRecovery(input({ serverEnabled: false }))).toEqual({
      kind: "skip",
      reason: "profile_disabled",
    });
    expect(planCrashRecovery(input({ policy: policy({ paused: true }) }))).toEqual({
      kind: "skip",
      reason: "paused",
    });
    expect(planCrashRecovery(input({ stopInProgress: true }))).toEqual({
      kind: "skip",
      reason: "stop_in_progress",
    });
    expect(planCrashRecovery(input({ locked: true }))).toEqual({
      kind: "skip",
      reason: "locked",
    });
    expect(planCrashRecovery(input({ maintenanceActive: true }))).toEqual({
      kind: "skip",
      reason: "maintenance",
    });
  });

  it("schedules attempt N with linear backoff", () => {
    const first = planCrashRecovery(input({ uptimeMs: 1_000 }));
    expect(first).toMatchObject({ kind: "restart", attempts: 1, delayMs: 30_000 });
    const second = planCrashRecovery(input({ policy: policy({ attempts: 1 }), uptimeMs: 1_000 }));
    expect(second).toMatchObject({ kind: "restart", attempts: 2, delayMs: 60_000 });
  });

  it("exhausts once the budget is spent", () => {
    const plan = planCrashRecovery(input({ policy: policy({ attempts: 3 }), uptimeMs: 1_000 }));
    expect(plan).toEqual({ kind: "exhausted", attempts: 3, maxAttempts: 3 });
  });

  it("resets the budget when the crashed run was stable", () => {
    const plan = planCrashRecovery(input({ policy: policy({ attempts: 3 }), uptimeMs: 600_000 }));
    expect(plan).toMatchObject({
      kind: "restart",
      attempts: 1,
      stabilized: true,
    });
  });

  it("block reason ignores uptime and reports first gate hit", () => {
    expect(
      crashRecoveryBlockReason({
        policy: policy({ enabled: false, paused: true }),
        serverEnabled: false,
        stopInProgress: true,
        locked: true,
        maintenanceActive: true,
      }),
    ).toBe("disabled");
  });
});
