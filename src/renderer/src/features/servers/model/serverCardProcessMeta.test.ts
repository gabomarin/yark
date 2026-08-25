import { describe, expect, it } from "vitest";
import {
  formatCpuPercent,
  formatServerRamCpuMeta,
  formatWorkingSet,
  hasLiveProcessFleet,
  sumFleetCpuPercent,
  sumFleetWorkingSetBytes,
} from "./serverCardProcessMeta";

describe("serverCardProcessMeta", () => {
  it("formats working set and CPU for the merged meta cell", () => {
    expect(formatWorkingSet(14.2 * 1024 ** 3)).toBe("14.2 GB");
    expect(formatCpuPercent(38)).toBe("38%");
    expect(
      formatServerRamCpuMeta({
        status: "running",
        metrics: {
          serverId: "s1",
          pid: 1,
          workingSetBytes: 14.2 * 1024 ** 3,
          cpuPercent: 38,
          sampledAt: "2026-08-24T00:00:00.000Z",
          error: null,
        },
      }),
    ).toBe("14.2 GB · 38%");
  });

  it("shows em dash until a usable running sample exists", () => {
    expect(
      formatServerRamCpuMeta({ status: "stopped", metrics: null }),
    ).toBe("–");
    expect(
      formatServerRamCpuMeta({
        status: "running",
        metrics: {
          serverId: "s1",
          pid: 1,
          workingSetBytes: 100 * 1024 * 1024,
          cpuPercent: null,
          sampledAt: "2026-08-24T00:00:00.000Z",
          error: null,
        },
      }),
    ).toBe("100 MB · –");
    expect(
      formatServerRamCpuMeta({
        status: "running",
        metrics: {
          serverId: "s1",
          pid: 1,
          workingSetBytes: null,
          cpuPercent: null,
          sampledAt: "2026-08-24T00:00:00.000Z",
          error: null,
        },
      }),
    ).toBe("–");
  });

  it("sums fleet RAM and CPU across starting/running servers", () => {
    const enabledServers = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const statuses = new Map([
      ["a", { status: "running" as const }],
      ["b", { status: "running" as const }],
      ["c", { status: "stopped" as const }],
    ]);
    const metricsByServer = new Map([
      [
        "a",
        {
          serverId: "a",
          pid: 1,
          workingSetBytes: 1_000_000_000,
          cpuPercent: 20,
          sampledAt: "t",
          error: null,
        },
      ],
      [
        "b",
        {
          serverId: "b",
          pid: 2,
          workingSetBytes: 500_000_000,
          cpuPercent: 55.5,
          sampledAt: "t",
          error: null,
        },
      ],
      [
        "c",
        {
          serverId: "c",
          pid: 3,
          workingSetBytes: 9_000_000_000,
          cpuPercent: 90,
          sampledAt: "t",
          error: null,
        },
      ],
    ]);

    expect(
      sumFleetWorkingSetBytes({ enabledServers, statuses, metricsByServer }),
    ).toBe(1_500_000_000);
    expect(
      sumFleetCpuPercent({ enabledServers, statuses, metricsByServer }),
    ).toBe(75.5);
    expect(
      hasLiveProcessFleet({ enabledServers, statuses }),
    ).toBe(true);
  });

  it("includes starting servers in fleet RAM / CPU sum (#302)", () => {
    const enabledServers = [{ id: "boot" }, { id: "idle" }];
    const statuses = new Map([
      ["boot", { status: "starting" as const }],
      ["idle", { status: "running" as const }],
    ]);
    const metricsByServer = new Map([
      [
        "boot",
        {
          serverId: "boot",
          pid: 1,
          workingSetBytes: 5_790_000_000,
          cpuPercent: 53,
          sampledAt: "t",
          error: null,
        },
      ],
      [
        "idle",
        {
          serverId: "idle",
          pid: 2,
          workingSetBytes: 1_000_000_000,
          cpuPercent: 4.3,
          sampledAt: "t",
          error: null,
        },
      ],
    ]);

    expect(
      sumFleetCpuPercent({ enabledServers, statuses, metricsByServer }),
    ).toBe(57.3);
    expect(
      sumFleetWorkingSetBytes({ enabledServers, statuses, metricsByServer }),
    ).toBe(6_790_000_000);
  });

  it("hides process fleet metrics when every server is stopped", () => {
    expect(
      hasLiveProcessFleet({
        enabledServers: [{ id: "a" }],
        statuses: new Map([["a", { status: "stopped" }]]),
      }),
    ).toBe(false);
  });
});
