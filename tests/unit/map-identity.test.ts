import { describe, expect, it } from "vitest";
import {
  isOfficialMap,
  isSafeMapToken,
  mapIdentityStartBlockers,
  persistableMapModId,
  persistableMapSaveFolder,
  resolveMapIdentity,
  resolveMapThumbnailUrl,
  validateMapIdentity,
} from "@shared/map-identity";
import { KNOWN_MAP_OPTIONS, KNOWN_MAPS } from "@shared/types";
import { buildLaunchArgs } from "@backend/domains/instances/launch-args";
import type { ServerProfile } from "@shared/types";

function profile(overrides: Partial<ServerProfile> = {}): ServerProfile {
  return {
    id: "id-1",
    name: "Svart",
    map: "TheIsland_WP",
    installDir: "C:\\asa\\svart",
    enabled: true,
    autoStart: false,
    sessionName: "Svart Home",
    maxPlayers: 70,
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

describe("isOfficialMap / resolveMapIdentity", () => {
  it("keeps hardcoded official labels on KNOWN_MAP_OPTIONS", () => {
    expect(KNOWN_MAP_OPTIONS[0]).toEqual({
      id: "TheIsland_WP",
      label: "The Island",
    });
    expect(KNOWN_MAP_OPTIONS.map((entry) => entry.id)).toEqual([...KNOWN_MAPS]);
  });

  it("classifies KNOWN_MAPS as official and clears stray mapModId", () => {
    expect(isOfficialMap("TheIsland_WP")).toBe(true);
    expect(
      resolveMapIdentity({ map: "TheIsland_WP", mapModId: "962796" }),
    ).toEqual({
      kind: "custom",
      map: "TheIsland_WP",
      mapModId: "962796",
    });
    expect(
      resolveMapIdentity({ map: "TheIsland_WP", mapModId: null }),
    ).toEqual({
      kind: "official",
      map: "TheIsland_WP",
      mapModId: null,
    });
  });

  it("classifies modded tokens as custom and keeps a valid mapModId", () => {
    expect(isOfficialMap("Svartalfheim_WP")).toBe(false);
    expect(
      resolveMapIdentity({ map: "Svartalfheim_WP", mapModId: "962796" }),
    ).toEqual({
      kind: "custom",
      map: "Svartalfheim_WP",
      mapModId: "962796",
    });
  });
});

describe("persistableMapModId", () => {
  it("returns null for bare official maps when a mod id is unset", () => {
    expect(
      persistableMapModId({ map: "TheIsland_WP", mapModId: null }),
    ).toBeNull();
  });

  it("keeps mapModId for official-token remasters", () => {
    expect(
      persistableMapModId({ map: "TheIsland_WP", mapModId: "1460513" }),
    ).toBe("1460513");
  });

  it("keeps a valid custom map mod id", () => {
    expect(
      persistableMapModId({ map: "Svartalfheim_WP", mapModId: "962796" }),
    ).toBe("962796");
  });
});

describe("validateMapIdentity", () => {
  it("errors on empty or spaced tokens", () => {
    expect(validateMapIdentity({ map: "  " })).toEqual([
      { field: "map", message: "Map required", severity: "error" },
    ]);
    expect(validateMapIdentity({ map: "Bad Map_WP" })[0]).toMatchObject({
      field: "map",
      severity: "error",
    });
  });

  it("rejects map tokens that can escape or corrupt SavedArks paths", () => {
    expect(isSafeMapToken("Svartalfheim_WP")).toBe(true);
    for (const token of ["../Config", "Map/Child", "Map\\Child", "CON", "Map."]) {
      expect(isSafeMapToken(token)).toBe(false);
      expect(validateMapIdentity({ map: token })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: "map", severity: "error" }),
        ]),
      );
    }
  });

  it("warns when mapModId is unset on a custom map", () => {
    expect(
      validateMapIdentity({
        map: "Svartalfheim_WP",
        mapModId: null,
        mods: ["962796"],
      }),
    ).toEqual([
      {
        field: "mapModId",
        message:
          "Custom map needs a linked map mod Project ID enabled on Mods (required for -mods=)",
        severity: "warning",
      },
    ]);
  });

  it("warns when mapModId is missing from mods or disabled", () => {
    expect(
      validateMapIdentity({
        map: "Svartalfheim_WP",
        mapModId: "962796",
        mods: ["947033"],
      }),
    ).toEqual([
      {
        field: "mapModId",
        message: "Map mod Project ID is not on the server mods list",
        severity: "warning",
      },
    ]);

    expect(
      validateMapIdentity({
        map: "Svartalfheim_WP",
        mapModId: "962796",
        mods: ["962796"],
        disabledMods: ["962796"],
      }),
    ).toEqual([
      {
        field: "mapModId",
        message: "Map mod Project ID is disabled and will be omitted from -mods=",
        severity: "warning",
      },
    ]);
  });

  it("exposes warnings as start blockers (#194)", () => {
    expect(
      mapIdentityStartBlockers({
        map: "Svartalfheim_WP",
        mapModId: "962796",
        mods: ["962796"],
        disabledMods: ["962796"],
      }),
    ).toHaveLength(1);
    expect(
      mapIdentityStartBlockers({
        map: "Svartalfheim_WP",
        mapModId: "962796",
        mods: ["962796"],
        disabledMods: [],
      }),
    ).toEqual([]);
  });
});

describe("resolveMapThumbnailUrl", () => {
  it("prefers mod logo for linked official-token remasters", () => {
    expect(
      resolveMapThumbnailUrl({
        map: "TheIsland_WP",
        mapModId: "1460513",
        officialArtUrl: "asset://island",
        modThumbnailUrl: "https://cdn.example/reforged.png",
      }),
    ).toBe("https://cdn.example/reforged.png");
  });

  it("prefers official art for bare KNOWN_MAPS", () => {
    expect(
      resolveMapThumbnailUrl({
        map: "TheIsland_WP",
        mapModId: null,
        officialArtUrl: "asset://island",
        modThumbnailUrl: "https://cdn.example/mod.png",
      }),
    ).toBe("asset://island");
  });

  it("uses mod logo for custom maps when present", () => {
    expect(
      resolveMapThumbnailUrl({
        map: "Svartalfheim_WP",
        mapModId: "962796",
        officialArtUrl: null,
        modThumbnailUrl: "https://cdn.example/svart.png",
      }),
    ).toBe("https://cdn.example/svart.png");
  });

  it("returns null for custom maps without a mod logo (#193)", () => {
    expect(
      resolveMapThumbnailUrl({
        map: "Svartalfheim_WP",
        mapModId: "962796",
        officialArtUrl: "asset://island",
        modThumbnailUrl: null,
      }),
    ).toBeNull();
    expect(
      resolveMapThumbnailUrl({
        map: "Svartalfheim_WP",
        mapModId: null,
        officialArtUrl: null,
        modThumbnailUrl: "  ",
      }),
    ).toBeNull();
  });

  it("ignores mod logos when mapModId is unset (#193)", () => {
    expect(
      resolveMapThumbnailUrl({
        map: "Svartalfheim_WP",
        mapModId: null,
        officialArtUrl: null,
        modThumbnailUrl: "https://cdn.example/svart.png",
      }),
    ).toBeNull();
  });
});

describe("custom map launch composition (#65)", () => {
  it("places custom map token in argv0 and map mod id on -mods=", () => {
    const args = buildLaunchArgs(
      profile({
        map: "Svartalfheim_WP",
        mods: ["962796", "947033"],
        disabledMods: [],
      }),
    );
    expect(args[0]).toBe('"Svartalfheim_WP"?SessionName="Svart Home"');
    expect(args).toContain("-mods=962796,947033");
    expect(args.join(" ")).not.toMatch(/ActiveMapMod/i);
    expect(args.join(" ")).not.toMatch(/-MapModID=/i);
  });

  it("adds -MapModID for official-token remasters (Rootservers)", () => {
    const args = buildLaunchArgs(
      profile({
        map: "TheIsland_WP",
        mapModId: "1460513",
        mods: ["1460513"],
        sessionName: "Reforged",
      }),
    );
    expect(args[0]).toBe('"TheIsland_WP"?SessionName="Reforged"');
    expect(args).toContain("-MapModID=1460513");
    expect(args).toContain("-mods=1460513");
    const mapModIdx = args.indexOf("-MapModID=1460513");
    const modsIdx = args.indexOf("-mods=1460513");
    expect(mapModIdx).toBeGreaterThan(-1);
    expect(modsIdx).toBeGreaterThan(mapModIdx);
  });
});

describe("persistableMapSaveFolder", () => {
  it("nulls folder for bare official maps", () => {
    expect(
      persistableMapSaveFolder({
        map: "TheIsland_WP",
        mapSaveFolder: "CustomIsland",
      }),
    ).toBeNull();
  });

  it("keeps folder for official-token remasters with mapModId", () => {
    expect(
      persistableMapSaveFolder({
        map: "TheIsland_WP",
        mapModId: "1460513",
        mapSaveFolder: "ReforgedIsland",
      }),
    ).toBe("ReforgedIsland");
  });
});
