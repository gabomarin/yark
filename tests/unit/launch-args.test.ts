import { describe, expect, it } from "vitest";
import {
  buildLaunchArgs,
  serverBinaryPath,
} from "@backend/domains/instances/launch-args";
import type { ServerProfile } from "@shared/types";

function profile(overrides: Partial<ServerProfile> = {}): ServerProfile {
  return {
    id: "id-1",
    name: "Island",
    map: "TheIsland_WP",
    installDir: "C:\\asa\\island",
    sessionName: "My Island",
    gamePort: 7777,
    queryPort: 27015,
    rconPort: 27020,
    serverPassword: null,
    adminPassword: "admin1234",
    clusterId: null,
    clusterDir: null,
    extraArgs: [],
    mods: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("serverBinaryPath", () => {
  it("points to the executable inside the install", () => {
    expect(serverBinaryPath("C:\\asa\\island")).toBe(
      "C:\\asa\\island\\ShooterGame\\Binaries\\Win64\\ArkAscendedServer.exe",
    );
  });
});

describe("buildLaunchArgs", () => {
  it("builds the map URL with basic parameters", () => {
    const args = buildLaunchArgs(profile());
    expect(args[0]).toBe(
      "TheIsland_WP?listen?SessionName=My Island?Port=7777?QueryPort=27015?RCONEnabled=True?RCONPort=27020?ServerAdminPassword=admin1234",
    );
  });

  it("includes ServerPassword only when defined", () => {
    const withPass = buildLaunchArgs(profile({ serverPassword: "secret" }));
    expect(withPass[0]).toContain("?ServerPassword=secret");
    const withoutPass = buildLaunchArgs(profile());
    expect(withoutPass[0]).not.toContain("ServerPassword");
  });

  it("adds mods in load order", () => {
    const args = buildLaunchArgs(profile({ mods: ["111", "222"] }));
    expect(args).toContain("-mods=111,222");
  });

  it("adds cluster flags when clusterId and clusterDir are set", () => {
    const args = buildLaunchArgs(
      profile({ clusterId: "my-cluster", clusterDir: "C:\\asa\\cluster" }),
    );
    expect(args).toContain("-clusterid=my-cluster");
    expect(args).toContain("-ClusterDirOverride=C:\\asa\\cluster");
    expect(args).toContain("-NoTransferFromFiltering");
  });

  it("does not add cluster flags without clusterDir", () => {
    const args = buildLaunchArgs(profile({ clusterId: "x", clusterDir: null }));
    expect(args.join(" ")).not.toContain("-clusterid");
  });

  it("appends extra arguments at the end", () => {
    const args = buildLaunchArgs(profile({ extraArgs: ["-NoBattlEye"] }));
    expect(args[args.length - 1]).toBe("-NoBattlEye");
  });
});
