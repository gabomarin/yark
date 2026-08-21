import type { ModCategory, ModMetadata } from "@shared/types";

/**
 * Offline / unit-test catalog for `ModsService({ useMockCatalog: true })`.
 * Production resolves metadata via the CurseForge proxy Worker.
 */
export const MOCK_MOD_CATALOG: Readonly<Record<string, ModMetadata>> = {
  "928793": {
    id: "928793",
    name: "Pelayori's Cryo Storage",
    summary: "Cryopods and creature storage for ASA servers.",
    thumbnailUrl: null,
    authors: ["Pelayori"],
    downloadCount: 1_250_000,
    dateModified: "2026-06-01T12:00:00.000Z",
    curseforgeUrl:
      "https://www.curseforge.com/ark-survival-ascended/mods/cryopods",
    slug: "cryopods",
    categories: ["Structures"],
  },
  "929420": {
    id: "929420",
    name: "Super Spyglass Plus",
    summary: "Spyglass with advanced info for whatever you aim at.",
    thumbnailUrl: null,
    authors: ["kavan87"],
    downloadCount: 890_000,
    dateModified: "2026-05-20T12:00:00.000Z",
    curseforgeUrl:
      "https://www.curseforge.com/ark-survival-ascended/mods/super-spyglass-plus",
    slug: "super-spyglass-plus",
    categories: ["Visuals"],
  },
  "940975": {
    id: "940975",
    name: "Cyber's Structures",
    summary: "Quality of life for essential structures and items.",
    thumbnailUrl: null,
    authors: ["CyberAngel"],
    downloadCount: 420_000,
    dateModified: "2026-04-10T12:00:00.000Z",
    curseforgeUrl:
      "https://www.curseforge.com/ark-survival-ascended/mods/cybers-structures",
    slug: "cybers-structures",
    categories: ["Structures"],
  },
  "947033": {
    id: "947033",
    name: "Awesome Spyglass",
    summary: "Improved spyglass with creature and player data.",
    thumbnailUrl: null,
    authors: ["ChrisMods"],
    downloadCount: 610_000,
    dateModified: "2026-03-15T12:00:00.000Z",
    curseforgeUrl:
      "https://www.curseforge.com/ark-survival-ascended/mods/awesomespyglass",
    slug: "awesomespyglass",
    categories: ["Visuals"],
  },
  "961285": {
    id: "961285",
    name: "Ultra Stacks",
    summary: "Increases resource stack sizes (test data).",
    thumbnailUrl: null,
    authors: ["DemoAuthor"],
    downloadCount: 150_000,
    dateModified: "2026-02-01T12:00:00.000Z",
    curseforgeUrl:
      "https://www.curseforge.com/ark-survival-ascended/mods/ultra-stacks",
    slug: "ultra-stacks",
    categories: ["General"],
  },
};

/**
 * Mock ASA classes/categories for unit tests (#297).
 * IDs are **synthetic** (900xxx) — not CurseForge live IDs. Production uses
 * Worker `GET /v1/categories` and must never invent real category IDs.
 */
export const MOCK_MOD_CATEGORIES: readonly ModCategory[] = [
  {
    id: 900_001,
    name: "Mods",
    slug: "mods",
    isClass: true,
    classId: null,
    parentCategoryId: null,
    displayIndex: 0,
  },
  {
    id: 900_101,
    name: "Structures",
    slug: "structures",
    isClass: false,
    classId: 900_001,
    parentCategoryId: 900_001,
    displayIndex: 1,
  },
  {
    id: 900_102,
    name: "Visuals",
    slug: "visuals",
    isClass: false,
    classId: 900_001,
    parentCategoryId: 900_001,
    displayIndex: 2,
  },
  {
    id: 900_103,
    name: "General",
    slug: "general",
    isClass: false,
    classId: 900_001,
    parentCategoryId: 900_001,
    displayIndex: 3,
  },
  {
    id: 900_104,
    name: "Maps",
    slug: "maps",
    isClass: false,
    classId: 900_001,
    parentCategoryId: 900_001,
    displayIndex: 4,
  },
];

export function buildPlaceholderMetadata(modId: string): ModMetadata {
  return {
    id: modId,
    name: `Mod ${modId}`,
    summary: "No local metadata. Will fill automatically once a CurseForge API key is available.",
    thumbnailUrl: null,
    authors: [],
    downloadCount: 0,
    dateModified: new Date(0).toISOString(),
    curseforgeUrl: `https://www.curseforge.com/ark-survival-ascended/search?search=${encodeURIComponent(modId)}`,
    slug: modId,
  };
}
