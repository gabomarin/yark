import { describe, expect, it } from "vitest";
import {
  buildLaunchArgs,
  buildMapUrlArg,
  buildWindowsCreateProcessCommandLine,
  buildWindowsVerbatimSpawnArgs,
  formatLaunchCommandLine,
  isUnrealMapUrlArg,
  quoteWindowsArg,
  serverBinaryPath,
} from "@backend/domains/instances/launch-args";
import type { ServerProfile } from "@shared/types";

function profile(overrides: Partial<ServerProfile> = {}): ServerProfile {
  return {
    id: "id-1",
    name: "Island",
    map: "TheIsland_WP",
    installDir: "C:\\asa\\island",
    enabled: true,
    autoStart: false,
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
  it("builds map URL with quoted map/session and game port only (no listen)", () => {
    const args = buildLaunchArgs(profile());
    expect(args[0]).toBe('"TheIsland_WP"?SessionName="My Island"');
    expect(args[0]).not.toContain("listen");
    expect(args[0]).not.toMatch(/\?[Pp]ort=/);
    expect(args[0]).not.toContain("RCON");
    expect(args[0]).not.toContain("ServerPassword");
    expect(args[0]).not.toContain("ServerAdminPassword");
    expect(args).toEqual([
      '"TheIsland_WP"?SessionName="My Island"',
      "-port=7777",
      "-ServerPlatform=ALL",
    ]);
    expect(args).not.toContain("-QueryPort=27015");
    expect(args.some((a) => /^-QueryPort=/i.test(a))).toBe(false);
  });

  it("quotes SessionName and escapes inner quotes", () => {
    const args = buildLaunchArgs(profile({ sessionName: 'Gabo "server"' }));
    expect(args[0]).toBe('"TheIsland_WP"?SessionName="Gabo \\"server\\""');
  });

  it("does not put passwords or RCON on the command line", () => {
    const args = buildLaunchArgs(
      profile({ serverPassword: "secret", adminPassword: "admin1234" }),
    );
    const joined = args.join(" ");
    expect(joined).not.toContain("ServerPassword");
    expect(joined).not.toContain("ServerAdminPassword");
    expect(joined).not.toContain("RCONEnabled");
    expect(joined).not.toContain("RCONPort");
  });

  it("defaults -ServerPlatform=ALL without duplicating extraArgs", () => {
    const plain = buildLaunchArgs(profile());
    expect(plain.filter((a) => /ServerPlatform/i.test(a))).toEqual([
      "-ServerPlatform=ALL",
    ]);

    const custom = buildLaunchArgs(
      profile({ extraArgs: ["-serverplatform=PS5"] }),
    );
    expect(custom).toContain("-serverplatform=PS5");
    expect(custom.filter((a) => /ServerPlatform/i.test(a))).toHaveLength(1);
    expect(custom).not.toContain("-ServerPlatform=ALL");
  });

  it("adds mods in load order", () => {
    const args = buildLaunchArgs(profile({ mods: ["111", "222"] }));
    expect(args).toContain("-mods=111,222");
  });

  it("omits disabled mods from -mods=", () => {
    const args = buildLaunchArgs(
      profile({ mods: ["111", "222", "333"], disabledMods: ["222"] }),
    );
    expect(args).toContain("-mods=111,333");
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
    expect(args).toContain("-ServerPlatform=ALL");
  });
});

describe("buildMapUrlArg / buildWindowsVerbatimSpawnArgs", () => {
  it("builds separate quotes for map and SessionName", () => {
    expect(buildMapUrlArg("TheIsland_WP", "gabo")).toBe(
      '"TheIsland_WP"?SessionName="gabo"',
    );
    expect(isUnrealMapUrlArg('"TheIsland_WP"?SessionName="gabo"')).toBe(true);
    expect(isUnrealMapUrlArg("-port=7777")).toBe(false);
  });

  it("keeps the map URL literal and quotes other spaced arguments", () => {
    const args = buildWindowsVerbatimSpawnArgs([
      ...buildLaunchArgs(profile({ sessionName: "Yark Aberration" })),
      "-ClusterDirOverride=C:\\ARK Cluster",
    ]);

    expect(args[0]).toBe(
      '"TheIsland_WP"?SessionName="Yark Aberration"',
    );
    expect(args.at(-1)).toBe(
      '"-ClusterDirOverride=C:\\ARK Cluster"',
    );
  });
});

describe("buildWindowsCreateProcessCommandLine", () => {
  it("puts literal map quotes on the CreateProcess line without an outer pair", () => {
    const binary =
      "C:\\asa\\island\\ShooterGame\\Binaries\\Win64\\ArkAscendedServer.exe";
    const args = buildLaunchArgs(profile({
      map: "Aberration_WP",
      sessionName: "Yark Aberration",
      clusterId: "yark",
      clusterDir: "C:\\ARK\\Cluster",
    }));
    const line = buildWindowsCreateProcessCommandLine(binary, args);

    expect(line).toBe(
      'C:\\asa\\island\\ShooterGame\\Binaries\\Win64\\ArkAscendedServer.exe "Aberration_WP"?SessionName="Yark Aberration" -port=7777 -ServerPlatform=ALL -clusterid=yark -ClusterDirOverride=C:\\ARK\\Cluster -NoTransferFromFiltering',
    );
    expect(line).not.toContain(
      '""Aberration_WP"?SessionName="Yark Aberration""',
    );
  });

  it("quotes exe paths that contain spaces without wrapping the map token", () => {
    const binary =
      "C:\\Program Files\\asa\\ShooterGame\\Binaries\\Win64\\ArkAscendedServer.exe";
    const args = buildLaunchArgs(profile({ sessionName: "gabo" }));
    const line = buildWindowsCreateProcessCommandLine(binary, args);
    expect(line).toBe(
      '"C:\\Program Files\\asa\\ShooterGame\\Binaries\\Win64\\ArkAscendedServer.exe" "TheIsland_WP"?SessionName="gabo" -port=7777 -ServerPlatform=ALL',
    );
  });

  it("quotes other args with spaces but leaves the map URL literal", () => {
    const binary = "C:\\asa\\ArkAscendedServer.exe";
    const line = buildWindowsCreateProcessCommandLine(binary, [
      buildMapUrlArg("TheIsland_WP", "gabo"),
      "-port=7777",
      "-ClusterDirOverride=C:\\path with spaces\\cluster",
    ]);
    expect(line).toBe(
      'C:\\asa\\ArkAscendedServer.exe "TheIsland_WP"?SessionName="gabo" -port=7777 "-ClusterDirOverride=C:\\path with spaces\\cluster"',
    );
  });

  it("quoteWindowsArg uses Windows escaping for embedded quotes", () => {
    expect(quoteWindowsArg("a b")).toBe('"a b"');
    expect(quoteWindowsArg('say "hi"')).toBe('"say \\"hi\\""');
    expect(quoteWindowsArg("-port=7777")).toBe("-port=7777");
  });
});

describe("formatLaunchCommandLine", () => {
  it("joins logical builder args for display (real quotes, not \\\")", () => {
    const line = formatLaunchCommandLine(profile({ sessionName: "gabo" }));
    expect(line).toBe(
      '"TheIsland_WP"?SessionName="gabo" -port=7777 -ServerPlatform=ALL',
    );
    expect(line).not.toContain('\\"');
  });

  it("keeps map and SessionName quotes separate (not one wrap around map+query)", () => {
    const args = buildLaunchArgs(profile({ sessionName: "gabo" }));
    const line = args.join(" ");
    expect(line).toMatch(/"TheIsland_WP"\?SessionName="gabo"/);
    expect(line).not.toMatch(/^"TheIsland_WP\?SessionName=/);
    expect(args[0]).toBe('"TheIsland_WP"?SessionName="gabo"');
    expect(args[0]).not.toBe('"TheIsland_WP?SessionName=gabo"');
  });

  it("optionally prefixes the binary path using Windows path quoting", () => {
    const binary = serverBinaryPath("C:\\Program Files\\asa");
    const line = formatLaunchCommandLine(
      profile({ sessionName: "gabo" }),
      binary,
    );
    expect(line).toBe(
      `"${binary}" "TheIsland_WP"?SessionName="gabo" -port=7777 -ServerPlatform=ALL`,
    );
  });
});
