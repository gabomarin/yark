import { defaultGameIni, defaultGameUserSettingsIni } from "@shared/ini-defaults";
import {
  lookupAsaDefaultValue,
  lookupAsaDescription,
} from "@shared/asa-server-settings";
import type { IniFileKey, ServerIniPayload } from "@shared/types";
import {
  INI_ROOT_SECTION,
  isClientIniKey,
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

export type IniFilterId =
  | "all"
  | "general"
  | "world"
  | "pve"
  | "pvp"
  | "dinos"
  | "structure"
  | "other";

export type IniControlKind = "boolean" | "number" | "text";

export const INI_FILTERS: Array<{ id: IniFilterId; label: string }> = [
  { id: "all", label: "All" },
  { id: "general", label: "General" },
  { id: "world", label: "World" },
  { id: "pve", label: "PvE" },
  { id: "pvp", label: "PvP" },
  { id: "dinos", label: "Dinos" },
  { id: "structure", label: "Structure" },
  { id: "other", label: "Other" },
];

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

export function isClientNoiseKey(key: string): boolean {
  return isClientIniKey(key);
}

export function lookupDefaultValue(
  fileKey: IniFileKey,
  section: string,
  key: string,
): string | null {
  const fromCatalog = lookupAsaDefaultValue(fileKey, section, key);
  if (fromCatalog !== null) {
    return fromCatalog;
  }
  const sectionLower = section.toLowerCase();
  const keyLower = key.toLowerCase();
  const match = parseIniTextRows(defaultTextForFile(fileKey)).find(
    (row) =>
      row.section.toLowerCase() === sectionLower && row.key.toLowerCase() === keyLower,
  );
  return match?.value ?? null;
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

export function categorizeSetting(key: string): Exclude<IniFilterId, "all"> {
  const k = key.toLowerCase();
  if (k.includes("pve")) return "pve";
  if (k.includes("pvp")) return "pvp";
  if (
    /dino|tame|egg|mate|imprint|baby|torpor|harvestxp|killxp|flyer/.test(k)
  ) {
    return "dinos";
  }
  if (/structure|building|turret|crop|platform|raft/.test(k)) {
    return "structure";
  }
  if (/day|night|weather|fog|harvest|resource|world|difficulty/.test(k)) {
    return "world";
  }
  if (
    /player|server|session|password|admin|map|crosshair|hud|chat|kick|ban|maxplayers/.test(
      k,
    )
  ) {
    return "general";
  }
  return "other";
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
  return rows.filter((row) => {
    if (isClientIniKey(row.key)) {
      return false;
    }
    if (filter !== "all" && categorizeSetting(row.key) !== filter) {
      return false;
    }
    if (query.length === 0) {
      return true;
    }
    const description =
      fileKey !== undefined
        ? lookupSettingDescription(fileKey, row.section, row.key)
        : humanizeKey(row.key);
    return [
      row.section,
      sectionShortName(row.section),
      row.key,
      row.value,
      description,
      humanizeKey(row.key),
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

