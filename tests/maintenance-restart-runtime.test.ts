import { describe, expect, it, vi } from "vitest";
import {
  defaultMaintenancePolicy,
  normalizeManualRestartWarnings,
} from "../src/shared/maintenance/maintenance-policy";
import { MAINTENANCE_RCON_SOFT_FAIL_LIMIT } from "../src/shared/maintenance/maintenance-schedule";
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
      status: "running" as "running" | "stopping" | "stopped" | "error" | "starting",
      processLive: true,
      pid: 1,
      startedAt: null,
      lastError: null,
    })),
  };
  const instances = {
    execRcon: vi.fn(async () => "ok"),
    restart: vi.fn(async () => undefined),
    retryRconConnection: vi.fn(async () => undefined),
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
  it("uses the manual restart warning cadence instead of the weekly schedule cadence", async () => {
    const policy = {
      ...defaultMaintenancePolicy("s1", "2026-01-01T00:00:00.000Z"),
      manualRestartWarningsEnabled: true,
    };
    const { runtime } = makeRuntime(policy);
    const armed = await runtime.runManualRestartWarning("s1");
    expect(armed.nextRestartAt).not.toBeNull();
    expect(Date.parse(armed.nextRestartAt!) - Date.now()).toBeGreaterThan(4 * 60_000);
    expect(Date.parse(armed.nextRestartAt!) - Date.now()).toBeLessThan(6 * 60_000);
  });

  it("keeps a manual countdown running when the renderer notification throws", async () => {
    const policy = {
      ...defaultMaintenancePolicy("s1", "2026-01-01T00:00:00.000Z"),
      manualRestartWarningsEnabled: true,
    };
    const { runtime, instances } = makeRuntime(policy);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    runtime.setRuntimeChangeNotify(() => {
      throw new Error("renderer unavailable");
    });

    try {
      const armed = await runtime.runManualRestartWarning("s1");
      expect(armed.countdownKind).toBe("manual");
      await vi.waitFor(() => {
        expect(instances.execRcon).toHaveBeenCalledWith(
          "s1",
          "ServerChat Server restart in 5 minutes",
          { recordEvent: false },
        );
      });
      expect(errorSpy).toHaveBeenCalled();
      runtime.cancelUpcoming("s1");
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("normalizes legacy custom manual warnings to the Standard cadence", async () => {
    const policy = {
      ...defaultMaintenancePolicy("s1", "2026-01-01T00:00:00.000Z"),
      manualRestartWarningsEnabled: true,
      manualRestartWarnings: {
        ...defaultMaintenancePolicy("s1", "t").manualRestartWarnings,
        preset: "custom" as const,
        customOffsets: ["30m"],
        lastMinuteChat: false,
      },
    };
    const { runtime, instances } = makeRuntime(policy);
    const armed = await runtime.runManualRestartWarning("s1");
    expect(Date.parse(armed.nextRestartAt!) - Date.now()).toBeGreaterThan(4 * 60_000);
    expect(Date.parse(armed.nextRestartAt!) - Date.now()).toBeLessThan(6 * 60_000);
    expect(normalizeManualRestartWarnings(policy.manualRestartWarnings)).toMatchObject({
      preset: "standard",
      customOffsets: ["5m", "1m"],
      lastMinuteChat: false,
    });
    expect(instances.execRcon).toHaveBeenCalledWith(
      "s1",
      "ServerChat Server restart in 5 minutes",
      { recordEvent: false },
    );
    runtime.cancelUpcoming("s1");
  });

  it("cancels a queued manual restart before it reaches the target", async () => {
    const policy = {
      ...defaultMaintenancePolicy("s1", "2026-01-01T00:00:00.000Z"),
      manualRestartWarningsEnabled: true,
    };
    const { runtime, instances } = makeRuntime(policy);
    const armed = await runtime.runManualRestartWarning("s1");
    expect(armed.countdownKind).toBe("manual");
    await vi.waitFor(() => {
      expect(instances.execRcon).toHaveBeenCalledWith(
        "s1",
        "ServerChat Server restart in 5 minutes",
        { recordEvent: false },
      );
    });
    const cancelled = runtime.cancelUpcoming("s1");
    expect(cancelled.countdownKind).toBeNull();
    expect(cancelled.cancelable).toBe(false);
    expect(instances.restart).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(instances.execRcon).toHaveBeenCalledWith(
        "s1",
        "ServerChat Server restart canceled. The server will remain online.",
        { recordEvent: false },
      );
    });
  });

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

      // Still "active" while stopping — intentional abort must catch this path.
      processes.isActive.mockReturnValue(true);
      processes.getStatus.mockReturnValue({
        serverId: "s1",
        status: "stopping",
        processLive: true,
        pid: 1,
        startedAt: null,
        lastError: null,
      });
      instances.isStopInProgress.mockReturnValue(true);

      await vi.advanceTimersByTimeAsync(1_100);

      expect(runtime.enrichStatus(policy).countdownPhase).toBe("idle");
      expect(servers.addEvent).not.toHaveBeenCalled();
      expect(runtime.isSchedulePaused("s1")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the countdown after a transient Broadcast failure", async () => {
    vi.useFakeTimers();
    try {
      const policy = {
        ...defaultMaintenancePolicy("s1", "2026-01-01T00:00:00.000Z"),
        restartEnabled: true,
      };
      const { runtime, instances, servers } = makeRuntime(policy);
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

  it("hard-fails after consecutive RCON Broadcast failures", async () => {
    vi.useFakeTimers();
    try {
      const policy = {
        ...defaultMaintenancePolicy("s1", "2026-01-01T00:00:00.000Z"),
        restartEnabled: true,
      };
      const { runtime, instances, servers } = makeRuntime(policy);
      instances.execRcon.mockRejectedValue(new Error("RCON permanently down"));
      await runtime.runRestartNow("s1");

      for (let i = 0; i < MAINTENANCE_RCON_SOFT_FAIL_LIMIT; i++) {
        await vi.advanceTimersByTimeAsync(1_100);
      }

      expect(runtime.enrichStatus(policy).countdownPhase).toBe("idle");
      expect(servers.addEvent).toHaveBeenCalled();
      expect(String(servers.addEvent.mock.calls[0]?.[3] ?? "")).toMatch(
        /Maintenance restart failed/,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("runs SaveWorld + DestroyWildDinos after a successful restart when wipe is On", async () => {
    vi.useFakeTimers();
    try {
      const policy = {
        ...defaultMaintenancePolicy("s1", "2026-01-01T00:00:00.000Z"),
        restartEnabled: true,
        wipeEnabled: true,
        wipeSaveWorldFirst: true,
      };
      const { runtime, instances, processes } = makeRuntime(policy);
      instances.restart.mockImplementation(async () => {
        processes.getStatus.mockReturnValue({
          serverId: "s1",
          status: "running",
          processLive: true,
          pid: 1,
          startedAt: null,
          lastError: null,
        });
      });

      await runtime.runRestartNow("s1");
      // Drain last-minute ticks through T0 + wipe settle (20s) + RCON probes.
      await vi.advanceTimersByTimeAsync(12_000);
      await vi.advanceTimersByTimeAsync(25_000);

      expect(instances.restart).toHaveBeenCalled();
      const cmds = instances.execRcon.mock.calls.map(
        (c: unknown[]) => String(c[1] ?? ""),
      );
      expect(cmds.some((c: string) => c === "SaveWorld")).toBe(true);
      expect(cmds.some((c: string) => c === "DestroyWildDinos")).toBe(true);
      const status = runtime.enrichStatus(policy);
      expect(status.lastRestartOk).toBe(true);
      expect(status.lastWipeOk).toBe(true);
      expect(status.countdownPhase).toBe("idle");
    } finally {
      vi.useRealTimers();
    }
  });

  it("arms a scheduled restart when player warnings are Off", async () => {
    vi.useFakeTimers();
    try {
      // 30s before local noon so nextLocalRestartAt (second=0) is still today.
      const now = new Date(2026, 5, 1, 11, 59, 30, 0);
      vi.setSystemTime(now);
      const policy = {
        ...defaultMaintenancePolicy("s1", "t"),
        restartEnabled: true,
        restartDaysOfWeek: [now.getDay()],
        restartTimeLocal: "12:00",
        restartWarnings: {
          preset: "none" as const,
          customOffsets: [],
          lastMinuteChat: true,
          template: "Server restart in {time}",
        },
      };
      const { runtime } = makeRuntime(policy);
      await runtime.runScheduledCycle();
      const status = runtime.enrichStatus(policy);
      expect(status.countdownPhase).not.toBe("idle");
      expect(status.cancelable).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("notifies the peer runtime when fail-streak pauses schedules", async () => {
    vi.useFakeTimers();
    try {
      const policy = {
        ...defaultMaintenancePolicy("s1", "2026-01-01T00:00:00.000Z"),
        restartEnabled: true,
      };
      const { runtime, instances } = makeRuntime(policy);
      const peer = vi.fn();
      runtime.setPeerPauseNotify(peer);
      instances.restart.mockRejectedValue(new Error("restart boom"));

      for (let i = 0; i < 3; i++) {
        await runtime.runRestartNow("s1");
        await vi.advanceTimersByTimeAsync(12_000);
      }

      expect(runtime.isSchedulePaused("s1")).toBe(true);
      expect(peer).toHaveBeenCalledWith("s1");
    } finally {
      vi.useRealTimers();
    }
  });
});
