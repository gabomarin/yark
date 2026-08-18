import { describe, expect, it, vi } from "vitest";
import { runAutoStartOnLaunch } from "@backend/domains/instances/auto-start";
import type { ServerProfile } from "@shared/types";

function profile(overrides: Partial<ServerProfile> = {}): ServerProfile {
  return {
    id: "srv-1",
    name: "Island",
    map: "TheIsland_WP",
    installDir: "C:\\ARK\\Island",
    enabled: true,
    autoStart: true,
    sessionName: "Island",
    maxPlayers: 70,
    gamePort: 7777,
    queryPort: 27015,
    rconPort: 27020,
    serverPassword: null,
    adminPassword: "admin",
    clusterId: null,
    clusterDir: null,
    extraArgs: [],
    mods: [],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("runAutoStartOnLaunch", () => {
  it("starts opted-in enabled servers sequentially and isolates failures", async () => {
    const start = vi
      .fn()
      .mockRejectedValueOnce(new Error("Port conflict"))
      .mockResolvedValueOnce(undefined);
    const addEvent = vi.fn();
    const a = profile({ id: "a", name: "A" });
    const b = profile({ id: "b", name: "B" });

    const results = await runAutoStartOnLaunch({
      profiles: [a, b],
      processes: { isActive: () => false },
      repo: { addEvent },
      start,
    });

    expect(start).toHaveBeenCalledTimes(2);
    expect(start.mock.calls[0]?.[0]).toBe("a");
    expect(start.mock.calls[1]?.[0]).toBe("b");
    expect(results).toEqual([
      expect.objectContaining({ serverId: "a", outcome: "failed" }),
      expect.objectContaining({ serverId: "b", outcome: "started" }),
    ]);
    expect(addEvent).toHaveBeenCalledWith(
      "a",
      "auto_start_failed",
      "error",
      expect.stringContaining("Port conflict"),
      expect.any(Object),
    );
    expect(addEvent).toHaveBeenCalledWith(
      "b",
      "auto_start_succeeded",
      "info",
      expect.stringContaining("Auto-start launched"),
      expect.any(Object),
    );
  });

  it("skips inactive, already-running, and uncertain reattach profiles", async () => {
    const start = vi.fn();
    const addEvent = vi.fn();
    const inactive = profile({ id: "off", enabled: false });
    const running = profile({ id: "run" });
    const uncertain = profile({ id: "unc" });
    const silent = profile({ id: "quiet", autoStart: false });

    const results = await runAutoStartOnLaunch({
      profiles: [inactive, running, uncertain, silent],
      reattachOutcomes: [
        {
          serverId: "unc",
          classification: "inaccessible",
          reattached: false,
        },
      ],
      processes: {
        isActive: (id: string) => id === "run",
      },
      repo: { addEvent },
      start,
    });

    expect(start).not.toHaveBeenCalled();
    expect(results.map((row) => row.outcome)).toEqual([
      "skipped",
      "skipped",
      "skipped",
    ]);
    expect(addEvent).toHaveBeenCalledTimes(3);
    expect(addEvent.mock.calls.every((call) => call[1] === "auto_start_skipped")).toBe(
      true,
    );
  });

  it("forwards openNativeConsole true to start (#350)", async () => {
    const start = vi.fn().mockResolvedValue(undefined);
    await runAutoStartOnLaunch({
      profiles: [profile()],
      processes: { isActive: () => false },
      repo: { addEvent: vi.fn() },
      start,
      openNativeConsole: true,
    });
    expect(start).toHaveBeenCalledWith("srv-1", { openNativeConsole: true });
  });

  it("forwards openNativeConsole false when the pref is off or unset (#350)", async () => {
    const start = vi.fn().mockResolvedValue(undefined);
    await runAutoStartOnLaunch({
      profiles: [profile()],
      processes: { isActive: () => false },
      repo: { addEvent: vi.fn() },
      start,
    });
    expect(start).toHaveBeenCalledWith("srv-1", { openNativeConsole: false });
  });

  it("ignores profiles without autoStart (no events)", async () => {
    const addEvent = vi.fn();
    const results = await runAutoStartOnLaunch({
      profiles: [profile({ autoStart: false })],
      processes: { isActive: () => false },
      repo: { addEvent },
      start: vi.fn(),
    });
    expect(results).toEqual([]);
    expect(addEvent).not.toHaveBeenCalled();
  });
});
