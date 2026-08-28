import { describe, expect, it } from "vitest";
import {
  buildModMapSuggestHaystack,
  isMapCategoryLabel,
  isMapModCandidate,
  suggestMapTokenFromMetadata,
  suggestMapTokenFromModText,
} from "@shared/map-token-suggest";
import type { ModMetadata } from "@shared/types";

/** Author-style description snippets for catalog fixtures (#65). */
const FIXTURES = {
  svartalfheimPremium: `
Welcome to Svartalfheim Premium
Map Name: Svartalfheim_WP
Mod ID: 962796
`,
  amissa: `
Welcome to Amissa!
- Map Name: Amissa_WP
- Mod ID: 965379
`,
  forglarPremium: `
Welcome to Forglar Map Premium
* Map Name: Forglar_WP
* Mod ID: 1009169
`,
  lostCity: `
Welcome to Lost City!
- Map Name: LostCity_WP
- Mod ID: 1187557
`,
  mythica: `
Mythica Premium
Map Name: Mythica_WP
Mod ID: 1313888
`,
  appalachia: `
Appalachia Early Access
Server Name: Appalachia_Official_WP
Completion: 98%
`,
  /** CurseForge stripped description often glues Map Name + Mod ID (#342 follow-up). */
  bjarnheimGlued: `
Welcome to the nordic world of Bjarnheim!
Map Name: Bjarnheim_WPMod ID: 1376189
Map Completion
`,
} as const;

function meta(
  overrides: Partial<ModMetadata> & Pick<ModMetadata, "id" | "name" | "slug">,
): ModMetadata {
  return {
    summary: "",
    thumbnailUrl: null,
    authors: [],
    downloadCount: 0,
    dateModified: "2026-01-01T00:00:00.000Z",
    curseforgeUrl: `https://www.curseforge.com/ark-survival-ascended/mods/${overrides.slug}`,
    categories: ["Maps"],
    ...overrides,
  };
}

describe("isMapModCandidate", () => {
  it("matches Maps category labels", () => {
    expect(isMapModCandidate({ categories: ["Maps"] })).toBe(true);
    expect(isMapModCandidate({ categories: ["General", "maps"] })).toBe(true);
    expect(isMapModCandidate({ categories: ["Creatures"] })).toBe(false);
    expect(isMapModCandidate({ categories: [] })).toBe(false);
    expect(isMapCategoryLabel("Maps")).toBe(true);
    expect(isMapCategoryLabel("Visuals and Sounds")).toBe(false);
  });
});

describe("suggestMapTokenFromModText", () => {
  it("extracts labeled Map Name tokens from catalog fixtures", () => {
    expect(suggestMapTokenFromModText(FIXTURES.svartalfheimPremium)?.token).toBe(
      "Svartalfheim_WP",
    );
    expect(suggestMapTokenFromModText(FIXTURES.amissa)?.token).toBe("Amissa_WP");
    expect(suggestMapTokenFromModText(FIXTURES.forglarPremium)?.token).toBe(
      "Forglar_WP",
    );
    expect(suggestMapTokenFromModText(FIXTURES.lostCity)?.token).toBe("LostCity_WP");
    expect(suggestMapTokenFromModText(FIXTURES.mythica)?.token).toBe("Mythica_WP");
  });

  it("supports Server Name: Appalachia_Official_WP", () => {
    const suggestion = suggestMapTokenFromModText(FIXTURES.appalachia);
    expect(suggestion).toEqual({
      token: "Appalachia_Official_WP",
      source: "labeled",
      matchIndex: 0,
    });
  });

  it("extracts Map Name when Mod ID is glued without whitespace (Bjarnheim)", () => {
    expect(suggestMapTokenFromModText(FIXTURES.bjarnheimGlued)).toEqual({
      token: "Bjarnheim_WP",
      source: "labeled",
      matchIndex: 0,
    });
  });

  it("ignores official KNOWN_MAPS tokens", () => {
    expect(
      suggestMapTokenFromModText("Map Name: TheIsland_WP\nMod ID: 1"),
    ).toBeNull();
  });
});

describe("suggestMapTokenFromMetadata / description (#195)", () => {
  it("fails when only slug/name/summary are present (no Map Name)", () => {
    const svart = meta({
      id: "962796",
      name: "Svartalfheim Premium [PC & Crossplay]",
      slug: "svartalfheim-premium",
      summary: "A dwarven inspired ARK: Survival Ascended modded map.",
    });
    expect(suggestMapTokenFromMetadata(svart)).toBeNull();
  });

  it("succeeds when description carries Map Name", () => {
    const svart = meta({
      id: "962796",
      name: "Svartalfheim Premium [PC & Crossplay]",
      slug: "svartalfheim-premium",
      summary: "A dwarven inspired map.",
      description: FIXTURES.svartalfheimPremium,
    });
    expect(suggestMapTokenFromMetadata(svart)).toEqual({
      token: "Svartalfheim_WP",
      source: "labeled",
      matchIndex: 0,
    });
  });

  it("builds haystack with description from metadata", () => {
    const haystack = buildModMapSuggestHaystack({
      name: "Amissa",
      summary: "Fantasy map",
      slug: "amissa",
      description: "Map Name: Amissa_WP",
    });
    expect(haystack).toContain("amissa");
    expect(haystack).toContain("Map Name: Amissa_WP");
  });
});
