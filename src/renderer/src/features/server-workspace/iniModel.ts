import { defaultGameIni, defaultGameUserSettingsIni } from "@shared/ini-defaults";
import {
  lookupAsaDefaultValue,
  lookupAsaDescription,
  lookupAsaSetting,
} from "@shared/asa-server-settings";
import {
  ASA_UI_CATEGORIES,
  asaUiCategoryLabel,
  resolveAsaUiCategory,
  type AsaUiCategoryId,
} from "@shared/asa-setting-ui-categories";
import type { IniFileKey, ServerIniPayload } from "@shared/types";
import {
  INI_ROOT_SECTION,
  isClientIniKey,
  isClientIniNoise,
  parseIniTextRows,
  sanitizeServerIniPayload,
  sectionBracketLabel,
  sectionShortName,
  setIniTextValue,
  stripClientIniKeys,
  type IniTextRow,
} from "@shared/ini-text";

export interface IniSettingRow {
  section: string;
  key: string;
  value: string;
  /** Índice 0-based entre claves iguales en la misma sección. */
  occurrence: number;
  /** Cuántas veces aparece section+key en el archivo. */
  duplicateCount: number;
}

export type IniFilterId = "all" | AsaUiCategoryId;

export type IniControlKind = "boolean" | "number" | "text";

const UI_CATEGORY_LABELS_ES: Record<AsaUiCategoryId, string> = {
  general: "General",
  rates: "Multiplicadores",
  breeding: "Crianza",
  dinos: "Dinosaurios",
  structures: "Estructuras",
  pvp: "JcJ",
  pve: "JcE",
  world: "Mundo",
  players: "Jugadores",
  tribes: "Tribus",
  chat: "Chat y mensaje del día",
  mods: "Mods",
  networking: "Red",
  events: "Eventos",
  other: "Otros",
};

export interface IniUiCategoryGroup {
  category: AsaUiCategoryId;
  label: string;
  rows: IniSettingRow[];
}

export function textForFile(payload: ServerIniPayload, fileKey: IniFileKey): string {
  return fileKey === "gameUserSettings" ? payload.gameUserSettings : payload.game;
}

export function withFileText(
  payload: ServerIniPayload,
  fileKey: IniFileKey,
  next: string,
): ServerIniPayload {
  return fileKey === "gameUserSettings"
    ? { ...payload, gameUserSettings: next }
    : { ...payload, game: next };
}

export function defaultTextForFile(fileKey: IniFileKey): string {
  return fileKey === "gameUserSettings" ? defaultGameUserSettingsIni : defaultGameIni;
}

export function isClientNoiseKey(key: string, section?: string): boolean {
  if (section !== undefined) {
    return isClientIniNoise(section, key);
  }
  return isClientIniKey(key);
}

export function lookupDefaultValue(
  fileKey: IniFileKey,
  section: string,
  key: string,
): string | null {
  // Prefer shared/defaults/*.ini as source of truth; catalog is metadata only.
  const sectionLower = section.toLowerCase();
  const keyLower = key.toLowerCase();
  const match = parseIniTextRows(defaultTextForFile(fileKey)).find(
    (row) =>
      row.section.toLowerCase() === sectionLower && row.key.toLowerCase() === keyLower,
  );
  if (match !== undefined) {
    return match.value;
  }
  return lookupAsaDefaultValue(fileKey, section, key);
}

export function lookupSettingDescription(
  fileKey: IniFileKey,
  section: string,
  key: string,
): string {
  return lookupAsaDescription(fileKey, section, key) ?? humanizeKey(key);
}

/** Conserva el orden del archivo; no aplana secciones con puntos. */
export function parseIniRows(text: string): IniSettingRow[] {
  const raw = parseIniTextRows(text);
  const counts = new Map<string, number>();
  const seen = new Map<string, number>();

  for (const row of raw) {
    const id = rowIdentity(row);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return raw.map((row: IniTextRow) => {
    const id = rowIdentity(row);
    const occurrence = seen.get(id) ?? 0;
    seen.set(id, occurrence + 1);
    return {
      section: row.section,
      key: row.key,
      value: row.value,
      occurrence,
      duplicateCount: counts.get(id) ?? 1,
    };
  });
}

export function setIniValue(
  text: string,
  section: string,
  key: string,
  value: string,
  occurrence = 0,
): string {
  return setIniTextValue(text, section, key, value, occurrence);
}

export function inferControlKind(value: string): IniControlKind {
  const lower = value.trim().toLowerCase();
  if (lower === "true" || lower === "false") {
    return "boolean";
  }
  if (value.trim().length > 0 && /^-?\d+(\.\d+)?$/.test(value.trim())) {
    return "number";
  }
  return "text";
}

/**
 * Elige el control del editor. Prioriza valueType del catálogo ASA para no
 * tratar SessionName / ActiveMods / URLs / passwords como NumberInput.
 */
export function resolveControlKind(
  value: string,
  options?: { valueType?: string | null; key?: string; fileKey?: IniFileKey; section?: string },
): IniControlKind {
  const valueType =
    options?.valueType
    ?? (options?.fileKey !== undefined && options.section !== undefined && options.key !== undefined
      ? lookupAsaSetting(options.fileKey, options.section, options.key)?.valueType
      : undefined);
  const fromCatalog = controlKindFromValueType(valueType);
  if (fromCatalog !== null) {
    return fromCatalog;
  }

  const key = (options?.key ?? "").toLowerCase();
  if (isLikelyStringSettingKey(key)) {
    const lower = value.trim().toLowerCase();
    if (lower === "true" || lower === "false") {
      return "boolean";
    }
    return "text";
  }

  return inferControlKind(value);
}

function controlKindFromValueType(valueType: string | null | undefined): IniControlKind | null {
  if (valueType === null || valueType === undefined) {
    return null;
  }
  const vt = valueType.trim().toLowerCase();
  if (vt.length === 0 || vt === "(...)") {
    return null;
  }
  if (vt.startsWith("boolean")) {
    return "boolean";
  }
  if (
    vt.startsWith("string")
    || vt.includes("url")
    || vt.includes("list of")
    || vt.includes("mod id")
    || vt.includes("ip_address")
    || vt.includes("<string>")
  ) {
    return "text";
  }
  if (
    vt.startsWith("float")
    || vt.startsWith("integer")
    || vt === "seconds"
    || vt === "multiplier"
    || vt === "value"
  ) {
    return "number";
  }
  return null;
}

function isLikelyStringSettingKey(keyLower: string): boolean {
  if (keyLower.length === 0) {
    return false;
  }
  return (
    /password|sessionname|message|url|whitelist|banlist|token|hostname|ipaddress/.test(
      keyLower,
    )
    || keyLower === "activemods"
    || keyLower === "activemapmod"
    || keyLower === "totalconversionmod"
    || keyLower.endsWith("name")
  );
}

export function categorizeSetting(
  key: string,
  fileKey: IniFileKey = "gameUserSettings",
  section = "ServerSettings",
): AsaUiCategoryId {
  return resolveAsaUiCategory(fileKey, section, key);
}

export function humanizeKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function filterIniRows(
  rows: IniSettingRow[],
  search: string,
  filter: IniFilterId,
  fileKey?: IniFileKey,
): IniSettingRow[] {
  const query = search.trim().toLowerCase();
  const resolvedFile = fileKey ?? "gameUserSettings";
  return rows.filter((row) => {
    if (isClientIniNoise(row.section, row.key)) {
      return false;
    }
    if (filter !== "all") {
      const category = resolveAsaUiCategory(resolvedFile, row.section, row.key);
      if (category !== filter) {
        return false;
      }
    }
    if (query.length === 0) {
      return true;
    }
    const description = lookupSettingDescription(resolvedFile, row.section, row.key);
    const category = resolveAsaUiCategory(resolvedFile, row.section, row.key);
    return [
      row.section,
      sectionShortName(row.section),
      row.key,
      row.value,
      description,
      humanizeKey(row.key),
      asaUiCategoryLabel(category),
      UI_CATEGORY_LABELS_ES[category],
      category,
    ]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
}

export function groupRowsBySection(
  rows: IniSettingRow[],
): Array<{ section: string; rows: IniSettingRow[] }> {
  const groups: Array<{ section: string; rows: IniSettingRow[] }> = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last !== undefined && last.section === row.section) {
      last.rows.push(row);
      continue;
    }
    groups.push({ section: row.section, rows: [row] });
  }
  return groups;
}

/** Agrupa por categoría UI (JSON heurístico), en orden de taxonomía. */
export function groupRowsByUiCategory(
  rows: IniSettingRow[],
  fileKey: IniFileKey,
): IniUiCategoryGroup[] {
  const buckets = new Map<AsaUiCategoryId, IniSettingRow[]>();
  for (const row of rows) {
    const category = resolveAsaUiCategory(fileKey, row.section, row.key);
    const list = buckets.get(category);
    if (list !== undefined) {
      list.push(row);
    } else {
      buckets.set(category, [row]);
    }
  }

  const groups: IniUiCategoryGroup[] = [];
  for (const def of ASA_UI_CATEGORIES) {
    const list = buckets.get(def.id);
    if (list === undefined || list.length === 0) {
      continue;
    }
    list.sort((a, b) => a.key.localeCompare(b.key) || a.section.localeCompare(b.section));
    groups.push({
      category: def.id,
      label: UI_CATEGORY_LABELS_ES[def.id],
      rows: list,
    });
  }
  return groups;
}

function rowIdentity(row: Pick<IniTextRow, "section" | "key">): string {
  return `${row.section.toLowerCase()}\0${row.key.toLowerCase()}`;
}

export {
  INI_ROOT_SECTION,
  sanitizeServerIniPayload,
  sectionBracketLabel,
  sectionShortName,
  stripClientIniKeys,
};
