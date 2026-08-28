import { describe, expect, it } from "vitest";
import type { ModCategory, ModMetadata } from "@shared/types";
import {
  MAPS_CATEGORY_UNAVAILABLE_COPY,
  applyMapsSearchToProfileFields,
  buildMapsSearchOptions,
  buildMapsSearchRows,
  hasMapsCategoryFilter,
  isValidMapLaunchToken,
  resolveMapsCategoryFilter,
} from "../../src/renderer/src/features/servers/components/ServerForm/mapsSearchModel";

const sampleMod: ModMetadata = {
  id: "962796",
  name: "Svartalfheim Premium",
  summary: "Map pack",
  description: "Map Name: Svartalfheim_WP",
  thumbnailUrl: null,
  authors: ["Team"],
  downloadCount: 1000,
  dateModified: "2026-01-01T00:00:00.000Z",
  curseforgeUrl: "https://www.curseforge.com/ark-survival-ascended/mods/svart",
  slug: "svart",
  categories: ["Maps"],
};

describe("resolveMapsCategoryFilter", () => {
  it("prefers Maps class id", () => {
    const categories: ModCategory[] = [
      {
        id: 10,
        name: "Maps",
        slug: "maps",
        isClass: true,
        classId: null,
        parentCategoryId: null,
        displayIndex: 0,
      },
      {
        id: 11,
        name: "Map",
        slug: "map",
        isClass: false,
        classId: 10,
        parentCategoryId: 10,
        displayIndex: 1,
      },
    ];
    expect(resolveMapsCategoryFilter(categories)).toEqual({ classId: 10 });
  });

  it("falls back to Maps leaf category", () => {
    const categories: ModCategory[] = [
      {
        id: 11,
        name: "Map",
        slug: "map",
        isClass: false,
        classId: 10,
        parentCategoryId: 10,
        displayIndex: 0,
      },
    ];
    expect(resolveMapsCategoryFilter(categories)).toEqual({ categoryId: 11 });
  });

  it("returns empty filter when Maps category is missing", () => {
    const categories: ModCategory[] = [
      {
        id: 20,
        name: "Structures",
        slug: "structures",
        isClass: true,
        classId: null,
        parentCategoryId: null,
        displayIndex: 0,
      },
    ];
    expect(resolveMapsCategoryFilter(categories)).toEqual({});
    expect(hasMapsCategoryFilter(resolveMapsCategoryFilter(categories))).toBe(false);
  });
});

describe("maps search helpers", () => {
  it("builds popularity-sorted search options", () => {
    expect(buildMapsSearchOptions({ classId: 10 }, 2)).toEqual({
      index: 12,
      pageSize: 12,
      sortField: 2,
      sortOrder: "desc",
      classId: 10,
    });
  });

  it("infers launch tokens for grid rows", () => {
    const rows = buildMapsSearchRows([sampleMod]);
    expect(rows[0]?.token?.token).toBe("Svartalfheim_WP");
  });

  it("validates launch tokens", () => {
    expect(isValidMapLaunchToken("Svartalfheim_WP")).toBe(true);
    expect(isValidMapLaunchToken("bad token")).toBe(false);
  });

  it("exposes operator copy when Maps category filter is unavailable", () => {
    expect(MAPS_CATEGORY_UNAVAILABLE_COPY).toMatch(/Maps category unavailable/i);
  });

  it("apply enables the map mod on the profile", () => {
    const next = applyMapsSearchToProfileFields({
      mods: [],
      disabledMods: ["962796"],
      modMetadataCache: {},
      payload: {
        map: "Svartalfheim_WP",
        mapModId: "962796",
        mapSaveFolder: null,
        mod: sampleMod,
      },
    });
    expect(next.mods).toEqual(["962796"]);
    expect(next.disabledMods).toEqual([]);
    expect(next.mapModId).toBe("962796");
  });
});
