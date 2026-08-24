import { describe, expect, it } from "vitest";
import type {
  ServerInstallationInfo,
  ServerProfile,
  ServerRuntimeInfo,
} from "@shared/types";
import {
  computeOverviewFleetStats,
  filterOverviewServersByFleet,
  toggleOverviewFleetFilter,
} from "./overviewFleetMetrics";

const base: Omit<ServerProfile, "id" | "name" | "enabled"> = {
  map: "TheIsland_WP",
  installDir: "C:/ARK",
  autoStart: false,
  sessionName: "s",
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
  createdAt: "2026-07-23T00:00:00.000Z",
  updatedAt: "2026-07-23T00:00:00.000Z",
};

function server(
  partial: Partial<ServerProfile> & Pick<ServerProfile, "id" | "name">,
): ServerProfile {
  return {
    ...base,
    enabled: true,
    ...partial,
  };
}

function runtime(
  serverId: string,
  status: ServerRuntimeInfo["status"],
): ServerRuntimeInfo {
  return {
    serverId,
    status,
    processLive: status === "running",
    pid: status === "running" ? 1 : null,
    startedAt: null,
    lastError: null,
  };
}

function readyInstall(
  serverId: string,
  overrides: Partial<ServerInstallationInfo> = {},
): ServerInstallationInfo {
  return {
    serverId,
    installed: true,
    health: "ready",
    reasonCodes: ["ready"],
    guidance: "ready",
    build: "build 111",
    steamBuild: "build 111",
    arkVersion: null,
    version: null,
    binaryPath: "C:/ARK/ShooterGameServer.exe",
    checkedAt: "2026-07-24T00:00:00.000Z",
    ...overrides,
  };
}

describe("overviewFleetMetrics", () => {
  it("counts running, stopped, attention, and updates on the enabled fleet", () => {
    const enabled = [
      server({ id: "a", name: "A" }),
      server({ id: "b", name: "B" }),
      server({ id: "c", name: "C" }),
    ];
    const statuses = new Map([
      ["a", runtime("a", "running")],
      ["b", runtime("b", "stopped")],
      ["c", runtime("c", "stopped")],
    ]);
    const installationInfo = new Map([
      ["a", readyInstall("a")],
      [
        "b",
        readyInstall("b", {
          installed: false,
          health: "missing",
          reasonCodes: ["path_missing"],
          guidance: "missing",
          steamBuild: null,
          build: null,
          binaryPath: "",
        }),
      ],
      ["c", readyInstall("c", { steamBuild: "build 100", build: "build 100" })],
    ]);

    const { stats } = computeOverviewFleetStats({
      enabledServers: enabled,
      statuses,
      installationInfo,
      officialSteamBuild: "build 111",
    });

    expect(stats.enabledCount).toBe(3);
    expect(stats.runningCount).toBe(1);
    expect(stats.stoppedCount).toBe(2);
    expect(stats.attentionCount).toBe(2); // b missing + c update
    expect(stats.updatesCount).toBe(1);
    expect([...stats.updateServerIds]).toEqual(["c"]);
  });

  it("filters by fleet metric and toggles back to all", () => {
    const enabled = [
      server({ id: "a", name: "A" }),
      server({ id: "b", name: "B" }),
    ];
    const statuses = new Map([
      ["a", runtime("a", "running")],
      ["b", runtime("b", "stopped")],
    ]);
    const { stats } = computeOverviewFleetStats({
      enabledServers: enabled,
      statuses,
      installationInfo: new Map([
        ["a", readyInstall("a")],
        ["b", readyInstall("b")],
      ]),
      officialSteamBuild: "build 111",
    });

    expect(
      filterOverviewServersByFleet(enabled, "running", stats, statuses).map(
        (s) => s.id,
      ),
    ).toEqual(["a"]);
    expect(
      filterOverviewServersByFleet(enabled, "stopped", stats, statuses).map(
        (s) => s.id,
      ),
    ).toEqual(["b"]);
    expect(toggleOverviewFleetFilter("running", "running")).toBe("all");
    expect(toggleOverviewFleetFilter("all", "stopped")).toBe("stopped");
  });
});
