import type { ModMetadata } from "@shared/types";

/**
 * Catálogo de prueba hasta tener CURSEFORGE_API_KEY.
 * IDs reales de ASA; al conectar la API oficial se sustituye este mapa.
 */
export const MOCK_MOD_CATALOG: Readonly<Record<string, ModMetadata>> = {
  "928793": {
    id: "928793",
    name: "Pelayori's Cryo Storage",
    summary: "Cryopods y almacenamiento de criaturas para servidores ASA.",
    thumbnailUrl: null,
    authors: ["Pelayori"],
    downloadCount: 1_250_000,
    dateModified: "2026-06-01T12:00:00.000Z",
    curseforgeUrl:
      "https://www.curseforge.com/ark-survival-ascended/mods/cryopods",
    slug: "cryopods",
  },
  "929420": {
    id: "929420",
    name: "Super Spyglass Plus",
    summary: "Spyglass con información avanzada de lo que apuntas.",
    thumbnailUrl: null,
    authors: ["kavan87"],
    downloadCount: 890_000,
    dateModified: "2026-05-20T12:00:00.000Z",
    curseforgeUrl:
      "https://www.curseforge.com/ark-survival-ascended/mods/super-spyglass-plus",
    slug: "super-spyglass-plus",
  },
  "940975": {
    id: "940975",
    name: "Cyber's Structures",
    summary: "Quality of life para estructuras y objetos esenciales.",
    thumbnailUrl: null,
    authors: ["CyberAngel"],
    downloadCount: 420_000,
    dateModified: "2026-04-10T12:00:00.000Z",
    curseforgeUrl:
      "https://www.curseforge.com/ark-survival-ascended/mods/cybers-structures",
    slug: "cybers-structures",
  },
  "947033": {
    id: "947033",
    name: "Awesome Spyglass",
    summary: "Spyglass mejorado con datos de criaturas y jugadores.",
    thumbnailUrl: null,
    authors: ["ChrisMods"],
    downloadCount: 610_000,
    dateModified: "2026-03-15T12:00:00.000Z",
    curseforgeUrl:
      "https://www.curseforge.com/ark-survival-ascended/mods/awesomespyglass",
    slug: "awesomespyglass",
  },
  "961285": {
    id: "961285",
    name: "Ultra Stacks",
    summary: "Aumenta los stacks de recursos (datos de prueba).",
    thumbnailUrl: null,
    authors: ["DemoAuthor"],
    downloadCount: 150_000,
    dateModified: "2026-02-01T12:00:00.000Z",
    curseforgeUrl:
      "https://www.curseforge.com/ark-survival-ascended/mods/ultra-stacks",
    slug: "ultra-stacks",
  },
};

export function buildPlaceholderMetadata(modId: string): ModMetadata {
  return {
    id: modId,
    name: `Mod ${modId}`,
    summary: "Sin metadata local. Cuando haya API key de CurseForge se completará automáticamente.",
    thumbnailUrl: null,
    authors: [],
    downloadCount: 0,
    dateModified: new Date(0).toISOString(),
    curseforgeUrl: `https://www.curseforge.com/ark-survival-ascended/search?search=${encodeURIComponent(modId)}`,
    slug: modId,
  };
}
