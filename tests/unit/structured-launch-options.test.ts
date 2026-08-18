import { describe, expect, it } from "vitest";
import {
  assertStructuredCurationCatalogCoverage,
  argsIncludeServerPlatform,
  buildStructuredLaunchArgList,
  decodeServerPlatformSelection,
  encodeServerPlatformSelection,
  findLaunchArgConflicts,
  listStructuredLaunchUiOptions,
  parseWinLiveMaxPlayersValue,
  takeLegacyWinLiveMaxPlayers,
  STRUCTURED_LAUNCH_GROUP_ORDER,
} from "@shared/structured-launch-options";

describe("structured-launch-options", () => {
  it("curation ids resolve to supported catalog entries", () => {
    expect(assertStructuredCurationCatalogCoverage()).toEqual([]);
    expect(listStructuredLaunchUiOptions().length).toBeGreaterThan(10);
  });

  it("builds tokens for flags and valued options", () => {
    expect(
      buildStructuredLaunchArgList({
        nobattleye: { enabled: true },
        "culture-lang_code": { enabled: true, value: "en" },
        forcerespawndinos: { enabled: false },
      }),
    ).toEqual(["-NoBattlEye", "-culture=en"]);
  });

  it("flags conflicts between structured and raw / YARK-owned", () => {
    const issues = findLaunchArgConflicts({
      structured: { nobattleye: { enabled: true } },
      extraArgs: ["-NoBattlEye", "-mods=1", "-port=7777"],
    });
    expect(issues.some((i) => /duplicates a structured/i.test(i.message))).toBe(
      true,
    );
    expect(issues.some((i) => /YARK-owned/i.test(i.message))).toBe(true);
  });

  it("detects ?Option aliases as the same stem as structured flags", () => {
    const issues = findLaunchArgConflicts({
      structured: {
        usedynamicconfig: { enabled: true },
        "customdynamicconfigurl-url": {
          enabled: true,
          value: "http://example.com/dynamicconfig.ini",
        },
      },
      extraArgs: ['?CustomDynamicConfigUrl="http://other.example/x.ini"'],
    });
    expect(issues.some((i) => /duplicates a structured/i.test(i.message))).toBe(
      true,
    );
  });

  it("only treats real ServerPlatform tokens as platform overrides", () => {
    expect(
      argsIncludeServerPlatform([
        '-CustomNotificationURL="http://example.com/ServerPlatform.html"',
      ]),
    ).toBe(false);
    expect(argsIncludeServerPlatform(["-ServerPlatform=PC"])).toBe(true);
    expect(argsIncludeServerPlatform(["?ServerPlatform=ALL"])).toBe(true);
  });

  it("encodes ServerPlatform multi-select as ALL when every code is selected", () => {
    expect(encodeServerPlatformSelection(["PC", "PS5", "XSX", "WINGDK"])).toBe(
      "ALL",
    );
    expect(encodeServerPlatformSelection(["PC", "XSX"])).toBe("PC+XSX");
    expect(encodeServerPlatformSelection([])).toBe("");
    expect(decodeServerPlatformSelection("ALL")).toEqual([
      "PC",
      "PS5",
      "XSX",
      "WINGDK",
    ]);
    expect(decodeServerPlatformSelection("")).toEqual([]);
    expect(decodeServerPlatformSelection("PC+PS5")).toEqual(["PC", "PS5"]);
    expect(
      buildStructuredLaunchArgList({
        "server-platform": { enabled: true, value: "ALL" },
      }),
    ).toEqual(["-ServerPlatform=ALL"]);
    expect(
      buildStructuredLaunchArgList({
        "server-platform": { enabled: true, value: "PC+XSX" },
      }),
    ).toEqual(["-ServerPlatform=PC+XSX"]);
  });

  it("does not emit valued options with empty values and flags the gap", () => {
    expect(
      buildStructuredLaunchArgList({
        usedynamicconfig: { enabled: true },
        "customdynamicconfigurl-url": { enabled: true, value: "" },
      }),
    ).toEqual(["-UseDynamicConfig"]);
    expect(
      findLaunchArgConflicts({
        structured: {
          usedynamicconfig: { enabled: true },
          "customdynamicconfigurl-url": { enabled: true, value: "" },
        },
        extraArgs: [],
      }).some((i) => /CustomDynamicConfigUrl/i.test(i.message)),
    ).toBe(true);
  });

  it("emits CustomDynamicConfigUrl only when UseDynamicConfig and the URL option are on", () => {
    expect(
      buildStructuredLaunchArgList({
        usedynamicconfig: { enabled: true },
        "customdynamicconfigurl-url": {
          enabled: true,
          value: "http://example.com/dynamicconfig.ini",
        },
      }),
    ).toEqual([
      "-UseDynamicConfig",
      '-CustomDynamicConfigUrl="http://example.com/dynamicconfig.ini"',
    ]);
    expect(
      buildStructuredLaunchArgList({
        usedynamicconfig: { enabled: false },
        "customdynamicconfigurl-url": {
          enabled: true,
          value: "http://example.com/dynamicconfig.ini",
        },
      }),
    ).toEqual([]);
    expect(
      buildStructuredLaunchArgList({
        usedynamicconfig: { enabled: true },
        "customdynamicconfigurl-url": {
          enabled: false,
          value: "http://example.com/dynamicconfig.ini",
        },
      }),
    ).toEqual(["-UseDynamicConfig"]);
  });

  it("requires the full game-log → tribe → RCON tribe chain (#93)", () => {
    expect(
      buildStructuredLaunchArgList({
        servergamelog: { enabled: true },
        servergamelogincludetribelogs: { enabled: true },
        serverrconoutputtribelogs: { enabled: true },
      }),
    ).toEqual([
      "-servergamelog",
      "-servergamelogincludetribelogs",
      "-ServerRCONOutputTribeLogs",
    ]);
    expect(
      buildStructuredLaunchArgList({
        servergamelog: { enabled: false },
        servergamelogincludetribelogs: { enabled: true },
        serverrconoutputtribelogs: { enabled: true },
      }),
    ).toEqual([]);
    expect(
      buildStructuredLaunchArgList({
        servergamelog: { enabled: true },
        servergamelogincludetribelogs: { enabled: false },
        serverrconoutputtribelogs: { enabled: true },
      }),
    ).toEqual(["-servergamelog"]);
  });

  it("has no Cluster edge group; passivemods is curated under world", () => {
    expect(STRUCTURED_LAUNCH_GROUP_ORDER).not.toContain("cluster");
    const passive = listStructuredLaunchUiOptions().find(
      (o) => o.curation.id === "passivemods-modid1-[-modid2-[...]]",
    );
    expect(passive?.curation.group).toBe("world");
  });

  it("parses leftover 0.12 WinLiveMaxPlayers tokens; extra args win", () => {
    expect(parseWinLiveMaxPlayersValue("-WinLiveMaxPlayers=40")).toBe(40);
    expect(parseWinLiveMaxPlayersValue("?WinLiveMaxPlayers=9")).toBe(9);
    expect(parseWinLiveMaxPlayersValue("-WinLiveMaxPlayers=0")).toBe(0);
    expect(parseWinLiveMaxPlayersValue("-WinLiveMaxPlayers=256")).toBeNull();
    expect(parseWinLiveMaxPlayersValue("-NoBattlEye")).toBeNull();

    const taken = takeLegacyWinLiveMaxPlayers({
      structuredLaunchArgs: {
        nobattleye: { enabled: true },
        "winlivemaxplayers-integer": { enabled: true, value: "20" },
      },
      extraArgs: ["-NoBattlEye", "-WinLiveMaxPlayers=40"],
    });
    expect(taken.maxPlayers).toBe(40);
    expect(taken.extraArgs).toEqual(["-NoBattlEye"]);
    expect(taken.structuredLaunchArgs).toEqual({
      nobattleye: { enabled: true },
    });

    const omit = takeLegacyWinLiveMaxPlayers({
      structuredLaunchArgs: {
        "winlivemaxplayers-integer": { enabled: true, value: "20" },
      },
      extraArgs: ["-NoBattlEye", "-WinLiveMaxPlayers=0"],
    });
    expect(omit.maxPlayers).toBe(0);
    expect(omit.extraArgs).toEqual(["-NoBattlEye"]);
    expect(omit.structuredLaunchArgs).toEqual({});
  });
});
