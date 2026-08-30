import { describe, expect, it, vi } from "vitest";
import { defaultMaintenancePolicy } from "../src/shared/maintenance-policy";
import { MaintenanceRestartRuntime } from "../src/backend/domains/maintenance/maintenance-restart-runtime";
import type { MaintenancePolicy } from "../src/shared/types";

function makeRuntime(policy: MaintenancePolicy) {
  const repo = {
    getPolicy: vi.fn(() => policy),
    listPolicies: vi.fn(() => [policy]),
    setPolicy: vi.fn(),
  };
  const servers = {
    get: vi.fn(() => ({
      id: policy.serverId,
      name: "Test",
      enabled: true,
    })),
    addEvent: vi.fn(),
  };
  const processes = {
    isActive: vi.fn(() => true),
    getStatus: vi.fn(() => ({
      serverId: policy.serverId,
      status: "running",
      processLive: true,
      pid: 1,
      startedAt: null,
      lastError: null,
    })),
  };
  const instances = {
    execRcon: vi.fn(async () => "ok"),
    restart: vi.fn(async () => undefined),
    isStopInProgress: vi.fn(() => false),
  };
  const runtime = new MaintenanceRestartRuntime(
    repo as never,
    servers as never,
    processes as never,
    instances as never,
  );
  return { runtime, instances, servers, processes };
}

describe("MaintenanceRestartRuntime", () => {
  it("runRestartNow arms a short countdown and cancel clears it", async () => {
    const policy = {
      ...defaultMaintenancePolicy("s1", "2026-01-01T00:00:00.000Z"),
      restartEnabled: true,
    };
    const { runtime, instances } = makeRuntime(policy);

    const armed = await runtime.runRestartNow("s1");
    expect(armed.countdownPhase).toBe("last_minute");
    expect(armed.cancelable).toBe(true);
    expect(armed.countdownRemainingMs).not.toBeNull();
    expect(armed.countdownRemainingMs!).toBeLessThanOrEqual(10_000);

    const cancelled = runtime.cancelUpcoming("s1");
    expect(cancelled.countdownPhase).toBe("idle");
    expect(cancelled.cancelable).toBe(false);
    expect(instances.restart).not.toHaveBeenCalled();
  });

  it("rejects runRestartNow when the server is not running", async () => {
    const policy = defaultMaintenancePolicy("s1", "t");
    const { runtime, processes } = makeRuntime(policy);
    processes.isActive.mockReturnValue(false);
    await expect(runtime.runRestartNow("s1")).rejects.toThrow(
      /not running/i,
    );
  });

  it("does not fail-streak when the operator stops during countdown", async () => {
    vi.useFakeTimers();
    try {
      const policy = {
        ...defaultMaintenancePolicy("s1", "2026-01-01T00:00:00.000Z"),
        restartEnabled: true,
      };
      const { runtime, processes, instances, servers } = makeRuntime(policy);
      await runtime.runRestartNow("s1");

      processes.isActive.mockReturnValue(false);
      instances.isStopInProgress.mockReturnValue(true);

      await vi.advanceTimersByTimeAsync(1_100);

      expect(runtime.enrichStatus(policy).countdownPhase).toBe("idle");
      expect(servers.addEvent).not.toHaveBeenCalled();
      expect(runtime.isSchedulePaused("s1")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the countdown after a transient warning Broadcast failure", async () => {
    vi.useFakeTimers();
    try {
      const policy = {
        ...defaultMaintenancePolicy("s1", "2026-01-01T00:00:00.000Z"),
        restartEnabled: true,
        restartWarnings: {
          preset: "quiet" as const,
          customOffsets: ["5m"],
          template: "Server restart in {time}",
        },
      };
      const { runtime, instances, servers } = makeRuntime(policy);
      // Arm via private path: long window by patching runRestartNow lead — use schedule cycle.
      // Direct: start with runRestartNow then we need longer window — call consider via list.
      // Use runRestartNow and override execRcon to fail; last_minute soft-fails too.
      instances.execRcon.mockRejectedValueOnce(new Error("RCON down"));
      await runtime.runRestartNow("s1");
      await vi.advanceTimersByTimeAsync(50);

      const status = runtime.enrichStatus(policy);
      expect(status.countdownPhase).toBe("last_minute");
      expect(status.cancelable).toBe(true);
      expect(servers.addEvent).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
