import { describe, expect, it } from "vitest";
import {
  buildUpdateAllOutdatedPlan,
  canOpenUpdateAllOutdated,
  classifyUpdateAllOutdatedQueueResult,
  summarizeUpdateAllOutdatedQueue,
} from "@renderer/features/overview/updateAllOutdatedModel";
import type { ServerProfile, ServerRuntimeInfo } from "@shared/types";
import { stubInstallationInfo } from "../helpers/installation-info";

function server(partial: Partial<ServerProfile> = {}): ServerProfile {
  return {
    id: "srv-a",
    name: "Island",
    map: "TheIsland_WP",
    installDir: "C:\\ark\\a",
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
    structuredLaunchArgs: {},
    mods: [],
    disabledMods: [],
    modMetadataCache: {},
    autoStart: false,
    enabled: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

function status(
  serverId: string,
  statusValue: ServerRuntimeInfo["status"],
): ServerRuntimeInfo {
  return {
    serverId,
    status: statusValue,
    processLive: statusValue === "running",
    pid: statusValue === "running" ? 1234 : null,
    startedAt: null,
    lastError: null,
  };
}

describe("buildUpdateAllOutdatedPlan", () => {
  it("queues only stopped outdated servers with ready installs", () => {
    const official = "build 999";
    const plan = buildUpdateAllOutdatedPlan({
      servers: [
        server({ id: "a", name: "Alpha" }),
        server({ id: "b", name: "Beta" }),
        server({ id: "c", name: "Current" }),
      ],
      installationInfo: new Map([
        [
          "a",
          stubInstallationInfo({
            serverId: "a",
            steamBuild: "build 111",
            health: "ready",
          }),
        ],
        [
          "b",
          stubInstallationInfo({
            serverId: "b",
            steamBuild: "build 222",
            health: "ready",
          }),
        ],
        [
          "c",
          stubInstallationInfo({
            serverId: "c",
            steamBuild: official,
            health: "ready",
          }),
        ],
      ]),
      statuses: new Map([
        ["a", status("a", "stopped")],
        ["b", status("b", "running")],
        ["c", status("c", "stopped")],
      ]),
      officialSteamBuild: official,
      criticalJobs: [],
    });

    expect(plan.rows.map((row) => row.serverName)).toEqual(["Alpha", "Beta"]);
    expect(plan.eligible.map((row) => row.serverName)).toEqual(["Alpha"]);
    expect(plan.skipped[0]).toMatchObject({
      serverName: "Beta",
      skipReason: "server-running",
    });
    expect(canOpenUpdateAllOutdated(plan)).toBe(true);
  });

  it("skips disabled, unknown, and occupied downloads jobs", () => {
    const plan = buildUpdateAllOutdatedPlan({
      servers: [
        server({ id: "disabled", name: "Disabled", enabled: false }),
        server({ id: "unknown", name: "Unknown" }),
        server({ id: "queued", name: "Queued" }),
      ],
      installationInfo: new Map([
        [
          "disabled",
          stubInstallationInfo({
            serverId: "disabled",
            steamBuild: "build 1",
            health: "ready",
          }),
        ],
        [
          "unknown",
          stubInstallationInfo({ serverId: "unknown", steamBuild: null, health: "ready" }),
        ],
        [
          "queued",
          stubInstallationInfo({ serverId: "queued", steamBuild: "build 2", health: "ready" }),
        ],
      ]),
      statuses: new Map([
        ["disabled", status("disabled", "stopped")],
        ["unknown", status("unknown", "stopped")],
        ["queued", status("queued", "stopped")],
      ]),
      officialSteamBuild: "build 9",
      criticalJobs: [
        {
          id: "job-1",
          operation: "install-files",
          serverId: "queued",
          status: "pending",
          phase: "queued",
          attempts: 0,
          maxAttempts: 3,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          lastError: null,
          recoveryReason: null,
          nextActions: ["cancel"],
        },
      ],
    });

    expect(plan.eligible).toHaveLength(0);
    expect(plan.skipped.map((row) => row.skipReason)).toEqual([
      "disabled",
      "files-job-occupied",
      "update-unknown",
    ]);
    expect(canOpenUpdateAllOutdated(plan)).toBe(false);
  });
});

describe("classifyUpdateAllOutdatedQueueResult", () => {
  it("maps duplicate and replace errors from update IPC", () => {
    expect(classifyUpdateAllOutdatedQueueResult({ ok: true })).toEqual({
      action: "queued",
    });
    expect(
      classifyUpdateAllOutdatedQueueResult({
        ok: false,
        error: "Already in Downloads",
      }).action,
    ).toBe("already-in-downloads");
    expect(
      classifyUpdateAllOutdatedQueueResult({
        ok: false,
        error: "Replaced by Update in the Downloads queue.",
      }).action,
    ).toBe("replaced-verify");
  });
});

describe("summarizeUpdateAllOutdatedQueue", () => {
  it("reports queued, replaced, skipped, and failed counts", () => {
    expect(
      summarizeUpdateAllOutdatedQueue({
        queuedCount: 2,
        replacedCount: 1,
        failedCount: 0,
        skippedCount: 1,
      }).message,
    ).toContain("2 updates queued in Downloads");
  });
});
