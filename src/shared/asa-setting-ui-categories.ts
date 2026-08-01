import data from "./asa-setting-ui-categories-data.json";

export type AsaUiCategoryId =
  | "general"
  | "rates"
  | "breeding"
  | "dinos"
  | "structures"
  | "pvp"
  | "pve"
  | "world"
  | "players"
  | "tribes"
  | "chat"
  | "mods"
  | "networking"
  | "events"
  | "other";

export interface AsaUiCategoryDef {
  id: AsaUiCategoryId;
  label: string;
}

const categories = data.categories as AsaUiCategoryDef[];
const byId = data.byId as Record<string, AsaUiCategoryId>;

export const ASA_UI_CATEGORIES: readonly AsaUiCategoryDef[] = categories;

const labelById = new Map<AsaUiCategoryId, string>(
  categories.map((item) => [item.id, item.label]),
);

function entryId(file: string, section: string, key: string): string {
  return `${file}\0${section}\0${key}`.toLowerCase();
}

export function asaUiCategoryLabel(id: AsaUiCategoryId): string {
  return labelById.get(id) ?? id;
}

/** Lookup in the pre-generated JSON map; null if not in the catalog. */
export function lookupAsaUiCategory(
  file: string,
  section: string,
  key: string,
): AsaUiCategoryId | null {
  const hit = byId[entryId(file, section, key)];
  return hit ?? null;
}

/**
 * UI category for a setting. Uses the JSON; if missing, light heuristic.
 */
export function resolveAsaUiCategory(
  file: string,
  section: string,
  key: string,
): AsaUiCategoryId {
  const fromMap = lookupAsaUiCategory(file, section, key);
  if (fromMap !== null) {
    return fromMap;
  }
  return fallbackUiCategory(section, key);
}

function fallbackUiCategory(section: string, key: string): AsaUiCategoryId {
  const k = key.toLowerCase();
  const s = section.toLowerCase();
  if (s.includes("messageoftheday")) return "chat";
  if (s.includes("sessionsettings")) return "general";
  if (/pve/.test(k)) return "pve";
  if (/pvp/.test(k)) return "pvp";
  if (/baby|imprint|egg|mate|breed/.test(k)) return "breeding";
  if (/dino|tame|flyer|creature/.test(k)) return "dinos";
  if (/structure|building|turret|decay/.test(k)) return "structures";
  if (/xp|multiplier|harvest|spoil/.test(k)) return "rates";
  if (/day|night|difficulty|weather|world/.test(k)) return "world";
  if (/tribe|alliance/.test(k)) return "tribes";
  if (/player|engram|hud|crosshair/.test(k)) return "players";
  if (/rcon|port|network/.test(k)) return "networking";
  if (/mod/.test(k)) return "mods";
  if (/password|session|admin|maxplayers/.test(k)) return "general";
  return "other";
}
