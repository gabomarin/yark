import { describe, expect, it } from "vitest";
import type { ServerProfile } from "../src/shared/types";
import { reconcileServerList } from "../src/renderer/src/shared/reconcileServerList";

function profile(
  partial: Pick<ServerProfile, "id" | "updatedAt"> & Partial<ServerProfile>,
): ServerProfile {
  return {
    name: "Server",
    map: "TheIsland_WP",
    installDir: "C:\\ARK",
    enabled: true,
    autoStart: false,
    sessionName: "YARK",
    gamePort: 7777,
    queryPort: 27015,
    rconPort: 27020,
    serverPassword: null,
    adminPassword: "admin",
    clusterId: null,
    clusterDir: null,
    extraArgs: [],
    mods: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("reconcileServerList", () => {
  it("returns the previous array when id/updatedAt sequence matches", () => {
    const previous = [
      profile({ id: "a", updatedAt: "t1" }),
      profile({ id: "b", updatedAt: "t1" }),
    ];
    const next = [
      profile({ id: "a", updatedAt: "t1", name: "Different ref" }),
      profile({ id: "b", updatedAt: "t1" }),
    ];
    expect(reconcileServerList(previous, next)).toBe(previous);
  });

  it("reuses unchanged profiles when another server updates", () => {
    const kept = profile({ id: "a", updatedAt: "t1" });
    const previous = [kept, profile({ id: "b", updatedAt: "t1" })];
    const next = [
      profile({ id: "a", updatedAt: "t1" }),
      profile({ id: "b", updatedAt: "t2", name: "Renamed" }),
    ];
    const reconciled = reconcileServerList(previous, next);
    expect(reconciled[0]).toBe(kept);
    expect(reconciled[1]?.name).toBe("Renamed");
    expect(reconciled[1]?.updatedAt).toBe("t2");
  });
});
