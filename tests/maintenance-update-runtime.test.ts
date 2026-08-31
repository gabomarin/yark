import { describe, expect, it, vi } from "vitest";
import { defaultMaintenancePolicy } from "../src/shared/maintenance-policy";
import { MaintenanceUpdateRuntime } from "../src/backend/domains/maintenance/maintenance-update-runtime";
import type { MaintenancePolicy } from "../src/shared/types";
import { stubInstallationInfo } from "./helpers/installation-info";

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
      status: "running" as "running" | "stopping" | "stopped" | "error" | "starting",
      processLive: true,
      pid: 1,
      startedAt: null,
      lastError: null,
    })),
  };
  const instances = {
    execRcon: vi.fn(async () => "ok"),
    stop: vi.fn(async () => undefined),
    isStopInProgress: vi.fn(() => false),
    installationInfo: vi.fn(async () => ({
      officialVersion: "1.0",
      officialNetworkStatus: "ok" as const,
      officialSteamBuild: "build 999",
      servers: [
        stubInstallationInfo({
          serverId: policy.serverId,
          health: "ready",
          steamBuild: "build 100",
        }),
      ],
    })),
  };
  const updates = {
    enqueueUpdateForMaintenance: vi.fn(async () => undefined),
    updateServer: vi.fn(async () => undefined),
    hasOccupyingFilesJob: vi.fn(() => false),
    isQueueHeldForOperator: vi.fn(() => false),
  };
  const restarts = {
    hasActiveCountdown: vi.fn(() => false),
    enrichStatus: vi.fn((p: MaintenancePolicy) => ({
      ...p,
      schedulePaused: false,
      nextRestartAt: null,
      countdownRemainingMs: null,
      countdownPhase: "idle" as const,
      countdownKind: null,
      cancelable: false,
      lastRestartAt: null,
      lastRestartOk: null,
      lastWipeAt: null,
      lastWipeOk: null,
      lastUpdateAt: null,
      lastUpdateOk: null,
      steamUpdateAvailable: false,
    })),
  };
  const runtime = new MaintenanceUpdateRuntime(
    repo as never,
    servers as never,
    processes as never,
    instances as never,
    updates as never,
    restarts as never,
  );
  return { runtime, instances, updates, servers, processes };
}

describe("MaintenanceUpdateRuntime T0 stop-before-queue (#489)", () => {
  it("stops a running server before enqueueUpdateForMaintenance with wasRunning true", async () => {
    vi.useFakeTimers();
    try {
      const policy = {
        ...defaultMaintenancePolicy("s1", "2026-01-01T00:00:00.000Z"),
        updateEnabled: true,
      };
      const { runtime, instances, updates } = makeRuntime(policy);

      await runtime.runUpdateNow("s1");
      await vi.advanceTimersByTimeAsync(12_000);

      expect(instances.stop).toHaveBeenCalledWith("s1", { backup: false });
      expect(updates.enqueueUpdateForMaintenance).toHaveBeenCalledWith("s1", {
        wasRunning: true,
      });
      expect(instances.stop.mock.invocationCallOrder[0]!).toBeLessThan(
        updates.enqueueUpdateForMaintenance.mock.invocationCallOrder[0]!,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not stop or enqueue when the process is already gone at T0", async () => {
    vi.useFakeTimers();
    try {
      const policy = {
        ...defaultMaintenancePolicy("s1", "2026-01-01T00:00:00.000Z"),
        updateEnabled: true,
      };
      const { runtime, instances, updates, processes } = makeRuntime(policy);

      await runtime.runUpdateNow("s1");
      // Still "running" status so isIntentionalStop is false, but process is gone.
      processes.isActive.mockReturnValue(false);

      await vi.advanceTimersByTimeAsync(12_000);

      expect(instances.stop).not.toHaveBeenCalled();
      expect(updates.enqueueUpdateForMaintenance).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not enqueue when cancelled during stop", async () => {
    vi.useFakeTimers();
    try {
      const policy = {
        ...defaultMaintenancePolicy("s1", "2026-01-01T00:00:00.000Z"),
        updateEnabled: true,
      };
      const { runtime, instances, updates } = makeRuntime(policy);
      instances.stop.mockImplementation(async () => {
        runtime.cancelUpcoming("s1");
      });

      await runtime.runUpdateNow("s1");
      await vi.advanceTimersByTimeAsync(12_000);

      expect(instances.stop).toHaveBeenCalled();
      expect(updates.enqueueUpdateForMaintenance).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("records a clear stop-failed cause when stop throws", async () => {
    vi.useFakeTimers();
    try {
      const policy = {
        ...defaultMaintenancePolicy("s1", "2026-01-01T00:00:00.000Z"),
        updateEnabled: true,
      };
      const { runtime, instances, updates, servers } = makeRuntime(policy);
      instances.stop.mockRejectedValue(new Error("SaveWorld hung"));

      await runtime.runUpdateNow("s1");
      await vi.advanceTimersByTimeAsync(12_000);

      expect(updates.enqueueUpdateForMaintenance).not.toHaveBeenCalled();
      expect(servers.addEvent).toHaveBeenCalledWith(
        "s1",
        "error",
        "error",
        "Maintenance auto-update failed",
        expect.objectContaining({
          cause: expect.stringMatching(
            /Tried to stop the server before maintenance update.*wasRunning=true.*SaveWorld hung/s,
          ),
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects runUpdateNow while Downloads is held for the operator", async () => {
    const policy = {
      ...defaultMaintenancePolicy("s1", "2026-01-01T00:00:00.000Z"),
      updateEnabled: true,
    };
    const { runtime, updates } = makeRuntime(policy);
    updates.isQueueHeldForOperator.mockReturnValue(true);
    await expect(runtime.runUpdateNow("s1")).rejects.toThrow(
      /on hold for the operator.*before triggering an update/i,
    );
  });

  it("skips runScheduledCycle while Downloads is held for the operator", async () => {
    const policy = {
      ...defaultMaintenancePolicy("s1", "2026-01-01T00:00:00.000Z"),
      updateEnabled: true,
    };
    const { runtime, instances, updates } = makeRuntime(policy);
    updates.isQueueHeldForOperator.mockReturnValue(true);
    await expect(runtime.runScheduledCycle()).resolves.toBeUndefined();
    expect(instances.installationInfo).not.toHaveBeenCalled();
  });

  // Covers executeUpdate T0 stop guard only — tickCountdown does not abort mid-window on pause.
  it("does not stop at T0 when Downloads becomes paused during the countdown", async () => {
    vi.useFakeTimers();
    try {
      const policy = {
        ...defaultMaintenancePolicy("s1", "2026-01-01T00:00:00.000Z"),
        updateEnabled: true,
      };
      const { runtime, instances, updates } = makeRuntime(policy);

      await runtime.runUpdateNow("s1");
      updates.isQueueHeldForOperator.mockReturnValue(true);
      await vi.advanceTimersByTimeAsync(12_000);

      expect(instances.stop).not.toHaveBeenCalled();
      expect(updates.enqueueUpdateForMaintenance).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
