/**
 * Selection model + helpers for one-shot config copy (#95).
 * Shared between renderer validation and backend composition.
 */

import { isYarkOwnedIniKey } from "./yark-owned-ini-keys";

export type ConfigTransferIniStrategy = "merge" | "replace";

export interface ConfigTransferIniKeyRef {
  section: string;
  key: string;
}

export interface ConfigTransferIniFileSelection {
  enabled: boolean;
  strategy: ConfigTransferIniStrategy;
  /** When true, copy every key in the file (owned GUS keys still excluded). */
  entireFile: boolean;
  /** Include all keys from these sections. */
  sections: string[];
  /**
   * Individual keys. Always applied as merge for those keys
   * (even when strategy is replace).
   */
  keys: ConfigTransferIniKeyRef[];
}

/** Mods / launch-args selection with Merge vs Replace. */
export interface ConfigTransferListSelection {
  enabled: boolean;
  strategy: ConfigTransferIniStrategy;
}

export interface ConfigTransferSelection {
  gameUserSettings: ConfigTransferIniFileSelection;
  game: ConfigTransferIniFileSelection;
  mods: ConfigTransferListSelection;
  extraArgs: ConfigTransferListSelection;
  backupPolicy: boolean;
  /** Opt-in; copies admin/server passwords from source onto target profile. */
  passwords: boolean;
}

export function emptyIniFileSelection(
  strategy: ConfigTransferIniStrategy = "merge",
): ConfigTransferIniFileSelection {
  return {
    enabled: false,
    strategy,
    entireFile: false,
    sections: [],
    keys: [],
  };
}

export function emptyListSelection(
  strategy: ConfigTransferIniStrategy = "merge",
): ConfigTransferListSelection {
  return { enabled: false, strategy };
}

export function emptyConfigTransferSelection(): ConfigTransferSelection {
  return {
    gameUserSettings: emptyIniFileSelection(),
    game: emptyIniFileSelection(),
    mods: emptyListSelection(),
    extraArgs: emptyListSelection(),
    backupPolicy: false,
    passwords: false,
  };
}

export function configTransferSelectionHasWork(
  selection: ConfigTransferSelection,
): boolean {
  return (
    iniFileSelectionHasWork(selection.gameUserSettings) ||
    iniFileSelectionHasWork(selection.game) ||
    selection.mods.enabled ||
    selection.extraArgs.enabled ||
    selection.backupPolicy ||
    selection.passwords
  );
}

export function iniFileSelectionHasWork(
  file: ConfigTransferIniFileSelection,
): boolean {
  if (!file.enabled) return false;
  return (
    file.entireFile ||
    file.sections.length > 0 ||
    file.keys.length > 0
  );
}

/** True when this GUS key must never be selected via the INI category. */
export function isConfigTransferBlockedGusKey(
  section: string,
  key: string,
): boolean {
  return isYarkOwnedIniKey(section, key);
}

/** Merge: keep target order, append missing source entries. Replace: source only. */
export function composeStringList(
  source: readonly string[],
  target: readonly string[],
  strategy: ConfigTransferIniStrategy,
): string[] {
  if (strategy === "replace") return [...source];
  const seen = new Set(target.map((item) => item.toLowerCase()));
  const next = [...target];
  for (const item of source) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(item);
  }
  return next;
}

export function composeModLists<TCache>(
  source: {
    mods: readonly string[];
    disabledMods: readonly string[];
    modMetadataCache: Record<string, TCache>;
  },
  target: {
    mods: readonly string[];
    disabledMods: readonly string[];
    modMetadataCache: Record<string, TCache>;
  },
  strategy: ConfigTransferIniStrategy,
): {
  mods: string[];
  disabledMods: string[];
  modMetadataCache: Record<string, TCache>;
} {
  if (strategy === "replace") {
    return {
      mods: [...source.mods],
      disabledMods: [...source.disabledMods],
      modMetadataCache: { ...source.modMetadataCache },
    };
  }

  const mods = composeStringList(source.mods, target.mods, "merge");
  const modSet = new Set(mods.map((id) => id.toLowerCase()));
  const disabled = new Set<string>();
  for (const id of target.disabledMods) {
    if (modSet.has(id.toLowerCase())) disabled.add(id);
  }
  for (const id of source.disabledMods) {
    if (modSet.has(id.toLowerCase())) disabled.add(id);
  }
  return {
    mods,
    disabledMods: [...disabled],
    modMetadataCache: {
      ...target.modMetadataCache,
      ...source.modMetadataCache,
    },
  };
}

export function assertConfigTransferSelection(
  selection: unknown,
): ConfigTransferSelection {
  if (selection === null || typeof selection !== "object") {
    throw new Error("Config transfer selection must be an object");
  }
  const raw = selection as Record<string, unknown>;
  return {
    gameUserSettings: assertIniFileSelection(raw.gameUserSettings, "gameUserSettings"),
    game: assertIniFileSelection(raw.game, "game"),
    mods: assertListSelection(raw.mods, "mods"),
    extraArgs: assertListSelection(raw.extraArgs, "extraArgs"),
    backupPolicy: Boolean(raw.backupPolicy),
    passwords: Boolean(raw.passwords),
  };
}

function assertListSelection(
  value: unknown,
  label: string,
): ConfigTransferListSelection {
  // Legacy boolean payloads (pre–merge/replace for lists).
  if (typeof value === "boolean") {
    return { enabled: value, strategy: "replace" };
  }
  if (value === null || typeof value !== "object") {
    throw new Error(`Config transfer ${label} selection must be an object`);
  }
  const raw = value as Record<string, unknown>;
  return {
    enabled: Boolean(raw.enabled),
    strategy: raw.strategy === "replace" ? "replace" : "merge",
  };
}

function assertIniFileSelection(
  value: unknown,
  label: string,
): ConfigTransferIniFileSelection {
  if (value === null || typeof value !== "object") {
    throw new Error(`Config transfer ${label} selection must be an object`);
  }
  const raw = value as Record<string, unknown>;
  const strategy = raw.strategy === "replace" ? "replace" : "merge";
  const sections = Array.isArray(raw.sections)
    ? raw.sections.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    : [];
  const keys: ConfigTransferIniKeyRef[] = [];
  if (Array.isArray(raw.keys)) {
    for (const entry of raw.keys) {
      if (entry === null || typeof entry !== "object") continue;
      const row = entry as Record<string, unknown>;
      if (typeof row.section !== "string" || typeof row.key !== "string") continue;
      const section = row.section.trim();
      const key = row.key.trim();
      if (section.length === 0 || key.length === 0) continue;
      if (label === "gameUserSettings" && isConfigTransferBlockedGusKey(section, key)) {
        continue;
      }
      keys.push({ section, key });
    }
  }
  return {
    enabled: Boolean(raw.enabled),
    strategy,
    entireFile: Boolean(raw.entireFile),
    sections,
    keys,
  };
}
