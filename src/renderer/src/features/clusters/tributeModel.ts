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
const SERVER_SETTINGS_SECTION = "serversettings";

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
  const rows = parseIniTextRows(text).filter((row) => row.section.trim().toLowerCase() === SERVER_SETTINGS_SECTION);
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

export function normalizeClusterWideTributeValue(
  key: ClusterWideTributeKey,
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined || value.trim() === "") return null;
  if (expirationKeys.has(key) || slotKeys.has(key)) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && Number.isInteger(parsed) ? String(parsed) : null;
  }
  return value.trim().toLowerCase();
}

export function clusterWideTributeValuesEqual(
  key: ClusterWideTributeKey,
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const normalizedLeft = normalizeClusterWideTributeValue(key, left);
  const normalizedRight = normalizeClusterWideTributeValue(key, right);
  return normalizedLeft !== null && normalizedRight !== null && normalizedLeft === normalizedRight;
}

export function summarizeClusterWideValues(
  members: Array<Partial<Record<ClusterWideTributeKey, string | null>>>,
): Record<ClusterWideTributeKey, "missing" | "matching" | "different"> {
  return Object.fromEntries(
    CLUSTER_WIDE_TRIBUTE_KEYS.map((key) => {
      const values = members.map((member) => member[key]);
      if (values.length === 0) return [key, "missing"];
      const normalized = values.map((value) => normalizeClusterWideTributeValue(key, value));
      if (normalized.some((value) => value === null)) return [key, "missing"];
      return [key, normalized.every((value) => value === normalized[0]) ? "matching" : "different"];
    }),
  ) as Record<ClusterWideTributeKey, "missing" | "matching" | "different">;
}

export function validateClusterWideValues(values: ClusterWideTributeValues): string | null {
  return CLUSTER_WIDE_TRIBUTE_KEYS.map((key) => validateClusterWideValue(key, values[key])).find(Boolean) ?? null;
}

export function validateClusterWideValue(key: ClusterWideTributeKey, value: number): string | null {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    return expirationKeys.has(key)
      ? `${tributeSettingMeta(key).key} must be a whole number of seconds.`
      : `${key} must be a whole number.`;
  }
  if (expirationKeys.has(key)) {
    if (value < 0 && key !== "TributeCharacterExpirationSeconds") {
      return `${tributeSettingMeta(key).key} must be 0 or more seconds.`;
    }
    if (value > MAX_TRIBUTE_EXPIRATION_SECONDS) {
      return "Expiration timers cannot exceed one year (31,536,000 seconds).";
    }
    return null;
  }

  const meta = tributeSettingMeta(key);
  const input = meta.input.type === "number" || meta.input.type === "range" ? meta.input : null;
  const minimum = input?.min ?? Number(meta.defaultValue);
  if (value < minimum) return `${key} cannot be below the catalog default of ${minimum}.`;
  if (input?.max !== undefined && value > input.max) return `${key} cannot exceed ${input.max}.`;
  return null;
}

/**
 * True when GameUserSettings is empty or only contains the six cluster-wide
 * tribute keys under ServerSettings. Keys with the same names in other sections
 * are real content, not a tribute-only template.
 */
export function isSparseClusterIniGameUserSettings(text: string): boolean {
  if (text.trim().length === 0) return true;
  const rows = parseIniTextRows(text).filter((row) => row.key.trim().length > 0);
  if (rows.length === 0) return true;
  const tributeKeys = new Set(CLUSTER_WIDE_TRIBUTE_KEYS.map((key) => key.toLowerCase()));
  return rows.every(
    (row) => row.section.trim().toLowerCase() === SERVER_SETTINGS_SECTION && tributeKeys.has(row.key.toLowerCase()),
  );
}

/**
 * Member INI payloads needed to seed a missing or tribute-only cluster template.
 * Skips member reads when the existing template already has real GUS content.
 * Always re-reads members when seeding — Transfer panel snapshots can be stale
 * while the server workspace overlay edits INI without remounting Clusters.
 */
export async function collectClusterIniTemplateSeedPayloads(
  existing: ServerIniPayload | null | undefined,
  members: ReadonlyArray<{ id: string }>,
  readMemberIni: (serverId: string) => Promise<ServerIniPayload | null>,
): Promise<ServerIniPayload[]> {
  if (!isSparseClusterIniGameUserSettings(existing?.gameUserSettings ?? "")) {
    return [];
  }

  const fetched = await Promise.all(members.map((member) => readMemberIni(member.id)));
  return fetched.filter((payload): payload is ServerIniPayload => payload !== null);
}

/**
 * Base payload for Transfer Save: keep a real template, otherwise seed from a
 * member so the saved cluster template is not tribute-only.
 */
export function seedClusterIniTemplateBase(
  existing: ServerIniPayload | null | undefined,
  memberPayloads: readonly ServerIniPayload[],
): ServerIniPayload {
  const current = existing ?? { gameUserSettings: "", game: "" };
  if (!isSparseClusterIniGameUserSettings(current.gameUserSettings)) {
    return current;
  }
  for (const member of memberPayloads) {
    if (isSparseClusterIniGameUserSettings(member.gameUserSettings)) continue;
    return {
      gameUserSettings: member.gameUserSettings,
      game: current.game.trim().length > 0 ? current.game : member.game,
    };
  }
  throw new Error(
    "Cannot save transfer settings into an empty cluster INI template. Promote a member to the template first, or create an INI template with shared settings.",
  );
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

export function readMapTributeValues(values: TributeSettingValues): Record<MapTributeKey, boolean> {
  return Object.fromEntries(
    MAP_TRIBUTE_KEYS.map((key) => [key, values[key]?.trim().toLowerCase() === "true"]),
  ) as Record<MapTributeKey, boolean>;
}

export function formatTributeDuration(seconds: number, key: ClusterWideTributeKey): string {
  if (key === "TributeCharacterExpirationSeconds" && seconds <= 0) return "does not expire";
  if (seconds === 0) return "game default";
  if (seconds < 0) return "game default";

  let remaining = Math.trunc(seconds);
  const parts: string[] = [];
  for (const [unit, size] of [
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
    ["second", 1],
  ] as const) {
    const count = Math.floor(remaining / size);
    if (count > 0) {
      parts.push(`${count} ${unit}${count === 1 ? "" : "s"}`);
      remaining %= size;
    }
  }
  return parts.join(", ");
}

export function formatTributeExpiration(seconds: string | null, fallback: string, key: ClusterWideTributeKey): string {
  const value = Number(seconds ?? fallback);
  if (!Number.isFinite(value)) return seconds ?? "Missing";
  const savedValue = `${value.toLocaleString()} second${Math.abs(value) === 1 ? "" : "s"}`;
  return `${savedValue} (${formatTributeDuration(value, key)})`;
}
