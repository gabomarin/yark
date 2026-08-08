import { describe, expect, it } from "vitest";
import {
  isOfficialMap,
  mapIdentityStartBlockers,
  persistableMapModId,
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

  it("classifies KNOWN_MAPS as official and clears mapModId", () => {
    expect(isOfficialMap("TheIsland_WP")).toBe(true);
    expect(
      resolveMapIdentity({ map: "TheIsland_WP", mapModId: "962796" }),
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
  it("returns null for official maps even when a mod id is supplied", () => {
    expect(
      persistableMapModId({ map: "TheIsland_WP", mapModId: "962796" }),
    ).toBeNull();
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
  it("prefers official art for KNOWN_MAPS", () => {
    expect(
      resolveMapThumbnailUrl({
        map: "TheIsland_WP",
        mapModId: "962796",
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
});
