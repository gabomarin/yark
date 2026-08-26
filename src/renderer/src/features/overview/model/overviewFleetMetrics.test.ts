import { describe, expect, it } from "vitest";
import type {
  ServerInstallationInfo,
  ServerProfile,
  ServerRuntimeInfo,
} from "@shared/types";
import {
  computeOverviewFleetStats,
  computeOverviewProcessFleetReadouts,
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
      playerListsByServer: new Map(),
    });

    expect(stats.enabledCount).toBe(3);
    expect(stats.runningCount).toBe(1);
    expect(stats.survivorsOnlineTotal).toBeNull();
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
      playerListsByServer: new Map(),
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

  it("counts starting and stopping with Running, not Stopped (#314)", () => {
    const enabled = [
      server({ id: "a", name: "A" }),
      server({ id: "b", name: "B" }),
      server({ id: "c", name: "C" }),
      server({ id: "d", name: "D" }),
    ];
    const statuses = new Map([
      ["a", runtime("a", "running")],
      ["b", runtime("b", "starting")],
      ["c", runtime("c", "stopping")],
      ["d", runtime("d", "stopped")],
    ]);
    const { stats } = computeOverviewFleetStats({
      enabledServers: enabled,
      statuses,
      installationInfo: new Map([
        ["a", readyInstall("a")],
        ["b", readyInstall("b")],
        ["c", readyInstall("c")],
        ["d", readyInstall("d")],
      ]),
      officialSteamBuild: "build 111",
      playerListsByServer: new Map(),
    });

    expect(stats.runningCount).toBe(3);
    expect(stats.stoppedCount).toBe(1);
    expect(
      filterOverviewServersByFleet(enabled, "running", stats, statuses).map(
        (s) => s.id,
      ),
    ).toEqual(["a", "b", "c"]);
    expect(
      filterOverviewServersByFleet(enabled, "stopped", stats, statuses).map(
        (s) => s.id,
      ),
    ).toEqual(["d"]);
  });

  it("sums known online survivors for the header label (#301)", () => {
    const enabled = [
      server({ id: "a", name: "A" }),
      server({ id: "b", name: "B" }),
      server({ id: "c", name: "C" }),
    ];
    const statuses = new Map([
      ["a", runtime("a", "running")],
      ["b", runtime("b", "running")],
      ["c", runtime("c", "stopped")],
    ]);
    const playerListsByServer = new Map([
      [
        "a",
        {
          players: [{ key: "1", name: "Alpha" }],
          error: null,
          loading: false,
        },
      ],
      [
        "b",
        {
          players: [],
          error: null,
          loading: false,
        },
      ],
    ]);
    const { stats } = computeOverviewFleetStats({
      enabledServers: enabled,
      statuses,
      installationInfo: new Map([
        ["a", readyInstall("a")],
        ["b", readyInstall("b")],
        ["c", readyInstall("c")],
      ]),
      officialSteamBuild: "build 111",
      playerListsByServer,
    });

    expect(stats.survivorsOnlineTotal).toBe(1);
  });

  it("does not treat a leave-running empty list as a known survivor sample (#301)", () => {
    const enabled = [server({ id: "a", name: "A" })];
    const statuses = new Map([["a", runtime("a", "running")]]);
    // Stale empty success left in the map after stop would invent a fleet 0.
    // prunePlayerListsForNonRunning + push guard drop that row; this asserts
    // sumSurvivors still refuses a lone empty list that somehow remains.
    const { stats: withEmpty } = computeOverviewFleetStats({
      enabledServers: enabled,
      statuses,
      installationInfo: new Map([["a", readyInstall("a")]]),
      officialSteamBuild: "build 111",
      playerListsByServer: new Map([
        ["a", { players: [], error: null, loading: false }],
      ]),
    });
    // Empty while truly running is a valid 0 (server up, nobody online).
    expect(withEmpty.survivorsOnlineTotal).toBe(0);

    const { stats: noList } = computeOverviewFleetStats({
      enabledServers: enabled,
      statuses,
      installationInfo: new Map([["a", readyInstall("a")]]),
      officialSteamBuild: "build 111",
      playerListsByServer: new Map(),
    });
    expect(noList.survivorsOnlineTotal).toBeNull();
  });

  it("computes process fleet header readouts (#302)", () => {
    const enabled = [
      server({ id: "a", name: "A" }),
      server({ id: "b", name: "B" }),
      server({ id: "c", name: "C" }),
    ];
    const statuses = new Map([
      ["a", runtime("a", "running")],
      ["b", runtime("b", "starting")],
      ["c", runtime("c", "stopped")],
    ]);
    const metricsByServer = new Map([
      [
        "a",
        {
          serverId: "a",
          pid: 1,
          workingSetBytes: 1024 * 1024 * 100,
          cpuPercent: 12.5,
          sampledAt: "2026-01-01T00:00:00.000Z",
          error: null,
        },
      ],
      [
        "b",
        {
          serverId: "b",
          pid: 2,
          workingSetBytes: 1024 * 1024 * 50,
          cpuPercent: 7.5,
          sampledAt: "2026-01-01T00:00:00.000Z",
          error: null,
        },
      ],
    ]);

    expect(
      computeOverviewProcessFleetReadouts({
        enabledServers: enabled,
        statuses,
        metricsByServer,
      }),
    ).toEqual({
      showProcessFleetMetrics: true,
      fleetRamBytes: 1024 * 1024 * 150,
      fleetCpuPercent: 20,
    });

    expect(
      computeOverviewProcessFleetReadouts({
        enabledServers: [server({ id: "c", name: "C" })],
        statuses: new Map([["c", runtime("c", "stopped")]]),
        metricsByServer: new Map(),
      }),
    ).toEqual({
      showProcessFleetMetrics: false,
      fleetRamBytes: null,
      fleetCpuPercent: null,
    });
  });
});
