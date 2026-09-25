import { lookupIniSettingMeta } from "@shared/ini/ini-setting-meta";
import { parseIniTextRows, setIniTextValue } from "@shared/ini/ini-text";
import type { ServerIniPayload } from "@shared/types";

export const TRIBUTE_EXPIRATION_KEYS = [
  "TributeItemExpirationSeconds",
  "TributeDinoExpirationSeconds",
  "TributeCharacterExpirationSeconds",
] as const;

export const TRIBUTE_SLOT_KEYS = ["MaxTributeItems", "MaxTributeDinos", "MaxTributeCharacters"] as const;

export const CLUSTER_WIDE_TRIBUTE_KEYS = [...TRIBUTE_EXPIRATION_KEYS, ...TRIBUTE_SLOT_KEYS] as const;

export const MAP_TRIBUTE_KEYS = [
  "PreventUploadItems",
  "PreventDownloadItems",
  "PreventUploadDinos",
  "PreventDownloadDinos",
  "PreventUploadSurvivors",
  "PreventDownloadSurvivors",
  "noTributeDownloads",
  "CrossARKAllowForeignDinoDownloads",
] as const;

export type ClusterWideTributeKey = (typeof CLUSTER_WIDE_TRIBUTE_KEYS)[number];
export type MapTributeKey = (typeof MAP_TRIBUTE_KEYS)[number];
export type ClusterWideTributeValues = Record<ClusterWideTributeKey, number>;
export type TributeSettingValues = Record<ClusterWideTributeKey | MapTributeKey, string | null>;

export const MAX_TRIBUTE_EXPIRATION_SECONDS = 31_536_000;

const expirationKeys = new Set<string>(TRIBUTE_EXPIRATION_KEYS);
const slotKeys = new Set<string>(TRIBUTE_SLOT_KEYS);

export function tributeSettingMeta(key: ClusterWideTributeKey | MapTributeKey) {
  const meta = lookupIniSettingMeta("gameUserSettings", "ServerSettings", key);
  if (meta === undefined) throw new Error(`Missing INI catalog entry for ${key}`);
  return meta;
}

export function defaultClusterWideValues(): ClusterWideTributeValues {
  return Object.fromEntries(
    CLUSTER_WIDE_TRIBUTE_KEYS.map((key) => [key, Number(tributeSettingMeta(key).defaultValue)]),
  ) as ClusterWideTributeValues;
}

export function readTributeValues(text: string): TributeSettingValues {
  const rows = parseIniTextRows(text).filter((row) => row.section.trim().toLowerCase() === "serversettings");
  const latest = rows.reduce<Record<string, string>>((values, row) => {
    values[row.key.toLowerCase()] = row.value;
    return values;
  }, {});
  return Object.fromEntries(
    [...CLUSTER_WIDE_TRIBUTE_KEYS, ...MAP_TRIBUTE_KEYS].map((key) => {
      return [key, latest[key.toLowerCase()] ?? null];
    }),
  ) as TributeSettingValues;
}

function comparableValue(key: ClusterWideTributeKey, value: string): string {
  return expirationKeys.has(key) || slotKeys.has(key)
    ? String(Number(value))
    : value.trim().toLowerCase();
}

export function summarizeClusterWideValues(
  members: Array<Partial<Record<ClusterWideTributeKey, string | null>>>,
): Record<ClusterWideTributeKey, "missing" | "matching" | "different"> {
  return Object.fromEntries(
    CLUSTER_WIDE_TRIBUTE_KEYS.map((key) => {
      const values = members.map((member) => member[key]);
      if (values.length === 0 || values.some((value) => value === null || value === undefined || value === "")) {
        return [key, "missing"];
      }
      const normalized = values.map((value) => comparableValue(key, value!));
      return [key, normalized.every((value) => value === normalized[0]) ? "matching" : "different"];
    }),
  ) as Record<ClusterWideTributeKey, "missing" | "matching" | "different">;
}

export function validateClusterWideValues(values: ClusterWideTributeValues): string | null {
  for (const key of TRIBUTE_EXPIRATION_KEYS) {
    const value = values[key];
    if (!Number.isInteger(value) || value < 0) return `${tributeSettingMeta(key).key} must be a non-negative whole number of seconds.`;
    if (value > MAX_TRIBUTE_EXPIRATION_SECONDS) return "Expiration timers cannot exceed one year (31,536,000 seconds).";
  }
  for (const key of TRIBUTE_SLOT_KEYS) {
    const value = values[key];
    const minimum = Number(tributeSettingMeta(key).defaultValue);
    if (!Number.isInteger(value)) return `${key} must be a whole number.`;
    if (value < minimum) return `${key} cannot be below the catalog default of ${minimum}.`;
  }
  return null;
}

export function withClusterWideTributeValues(
  payload: ServerIniPayload,
  values: ClusterWideTributeValues,
): ServerIniPayload {
  return {
    ...payload,
    gameUserSettings: CLUSTER_WIDE_TRIBUTE_KEYS.reduce(
      (text, key) => setIniTextValue(text, "ServerSettings", key, String(values[key])),
      payload.gameUserSettings,
    ),
  };
}

export function withMapTributeValues(
  payload: ServerIniPayload,
  values: Record<MapTributeKey, boolean>,
  keys: readonly MapTributeKey[] = MAP_TRIBUTE_KEYS,
): ServerIniPayload {
  return {
    ...payload,
    gameUserSettings: keys.reduce(
      (text, key) => setIniTextValue(text, "ServerSettings", key, values[key] ? "True" : "False"),
      payload.gameUserSettings,
    ),
  };
}

export function readMapTributeValues(values: TributeSettingValues): Record<MapTributeKey, boolean> {
  return Object.fromEntries(
    MAP_TRIBUTE_KEYS.map((key) => [key, values[key]?.trim().toLowerCase() === "true"]),
  ) as Record<MapTributeKey, boolean>;
}

export function formatTributeExpiration(seconds: string | null, fallback: string): string {
  const value = Number(seconds ?? fallback);
  if (!Number.isFinite(value)) return seconds ?? "Missing";
  if (value === 0) return "0 (game default)";
  if (value % 86_400 === 0) return `${value / 86_400} ${value === 86_400 ? "day" : "days"}`;
  if (value % 3_600 === 0) return `${value / 3_600} ${value === 3_600 ? "hour" : "hours"}`;
  return `${value.toLocaleString()} seconds`;
}
