import { KNOWN_MAPS } from "./types";

/** Official ASA map launch tokens shipped in `KNOWN_MAPS`. */
export type OfficialMapId = (typeof KNOWN_MAPS)[number];

/** Profile fields that define map identity for launch (#65). */
export interface MapIdentityFields {
  map: string;
  /** CurseForge Project ID for a custom map pack when `map` is not official. */
  mapModId?: string | null;
  mods?: string[];
  disabledMods?: string[];
}

export type MapIdentityKind = "official" | "custom";

export interface ResolvedMapIdentity {
  kind: MapIdentityKind;
  map: string;
  mapModId: string | null;
}

const OFFICIAL_MAP_SET = new Set<string>(KNOWN_MAPS);

/** True when `map` is an official `KNOWN_MAPS` token. */
export function isOfficialMap(map: string): map is OfficialMapId {
  return OFFICIAL_MAP_SET.has(map.trim());
}

/**
 * Normalize a launch map token for storage/validation.
 * Rejects empty / whitespace-only values; does not rewrite casing.
 */
export function normalizeMapToken(map: string): string {
  return map.trim();
}

/** Digits-only CurseForge Project ID (no leading zeros). */
export function isValidMapModId(id: string | null | undefined): boolean {
  if (id === null || id === undefined) {
    return false;
  }
  return /^[1-9]\d*$/.test(id.trim());
}

export function resolveMapIdentity(fields: MapIdentityFields): ResolvedMapIdentity {
  const map = normalizeMapToken(fields.map);
  const rawModId = fields.mapModId?.trim() ?? "";
  const mapModId = isValidMapModId(rawModId) ? rawModId : null;

  if (isOfficialMap(map)) {
    return { kind: "official", map, mapModId: null };
  }
  return { kind: "custom", map, mapModId };
}

/** Value to persist for `mapModId` (null for official maps or unset/invalid). */
export function persistableMapModId(fields: MapIdentityFields): string | null {
  return resolveMapIdentity(fields).mapModId;
}

export interface MapIdentityIssue {
  field: "map" | "mapModId";
  message: string;
  severity: "error" | "warning";
}

/**
 * Validate official vs custom map identity without changing launch composition.
 * Official maps clear/ignore `mapModId`. Custom maps require a non-empty token.
 */
export function validateMapIdentity(fields: MapIdentityFields): MapIdentityIssue[] {
  const issues: MapIdentityIssue[] = [];
  const map = normalizeMapToken(fields.map);

  if (map.length === 0) {
    issues.push({ field: "map", message: "Map required", severity: "error" });
    return issues;
  }

  if (/\s/.test(map)) {
    issues.push({
      field: "map",
      message: "Map token must not contain spaces",
      severity: "error",
    });
  }

  if (map.length > 128) {
    issues.push({
      field: "map",
      message: "Map token is too long",
      severity: "error",
    });
  }

  const identity = resolveMapIdentity({ ...fields, map });
  if (identity.kind === "official") {
    return issues;
  }

  const rawModId = fields.mapModId?.trim() ?? "";
  if (rawModId.length === 0) {
    issues.push({
      field: "mapModId",
      message:
        "Custom map needs a linked map mod Project ID enabled on Mods (required for -mods=)",
      severity: "warning",
    });
    return issues;
  }

  if (!isValidMapModId(rawModId)) {
    issues.push({
      field: "mapModId",
      message: "Map mod Project ID must be digits only",
      severity: "error",
    });
    return issues;
  }

  const modId = rawModId;
  const mods = fields.mods ?? [];
  const disabled = new Set(fields.disabledMods ?? []);
  if (!mods.includes(modId)) {
    issues.push({
      field: "mapModId",
      message: "Map mod Project ID is not on the server mods list",
      severity: "warning",
    });
  } else if (disabled.has(modId)) {
    issues.push({
      field: "mapModId",
      message: "Map mod Project ID is disabled and will be omitted from -mods=",
      severity: "warning",
    });
  }

  return issues;
}

/** Warnings that should block dedicated start until the operator fixes Mods / map link (#194). */
export function mapIdentityStartBlockers(
  fields: MapIdentityFields,
): MapIdentityIssue[] {
  return validateMapIdentity(fields).filter((issue) => issue.severity === "warning");
}

/**
 * Resolve a thumbnail URL for a map: callers supply official art first;
 * custom maps fall back to the linked mod's CurseForge logo.
 */
export function resolveMapThumbnailUrl(options: {
  map: string;
  mapModId?: string | null;
  officialArtUrl: string | null;
  modThumbnailUrl: string | null | undefined;
}): string | null {
  if (isOfficialMap(options.map)) {
    return options.officialArtUrl;
  }
  const modThumb = options.modThumbnailUrl?.trim() ?? "";
  return modThumb.length > 0 ? modThumb : null;
}
