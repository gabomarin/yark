import type { IniFileKey, ServerIniPayload } from "@shared/types";
import { resolveAsaUiCategory, type AsaUiCategoryId } from "@shared/asa/asa-setting-ui-categories";
import { isVisuallyEditableIniSetting } from "@shared/ini/ini-setting-decisions";
import { isNamedEngramEntriesKey } from "@shared/ini/engram-named-entries";
import { isPlayerLevelEngramPointsKey } from "@shared/ini/player-level-engram-points";
import { isSupplyCrateEntriesKey } from "@shared/ini/supply-crate-entries";
import {
  parseIniRows,
  removeIniValue,
  setIniValue,
  textForFile,
  withFileText,
  type IniSettingReference,
} from "../../iniModel";

/** localStorage: operator dismissed the GameUserSettings Server-tab override hint. */
export const INI_GUS_OVERRIDE_HINT_STORAGE_KEY = "yark.ini.gusOverrideHint.dismissed.v1";

export function iniPayloadsDirty(payload: ServerIniPayload | null, baseline: ServerIniPayload | null): boolean {
  return (
    payload !== null &&
    baseline !== null &&
    (payload.game !== baseline.game || payload.gameUserSettings !== baseline.gameUserSettings)
  );
}

/**
 * Draft-row identity (file + section + key + occurrence).
 * Occurrence is draft order for set/remove; matching to baseline uses {@link buildIniRowMatchIndex}.
 */
export function iniRowIdentity(fileKey: IniFileKey, section: string, key: string, occurrence: number): string {
  return `${fileKey}\u001f${section}\u001f${key}\u001f${occurrence}`.toLowerCase();
}

function iniGroupKey(section: string, key: string): string {
  return `${section.trim().toLowerCase()}\u001f${key.trim().toLowerCase()}`;
}

/**
 * Per draft-row matched baseline value.
 * `null` means the draft occurrence is absent from the saved file (discard on revert).
 */
export type IniRowMatchIndex = ReadonlyMap<string, string | null>;

/**
 * Align draft duplicate values to baseline values within one section+key group.
 * Prefers equal values (including after insert/reorder), then pairs remaining by order.
 */
export function alignIniDuplicateValues(
  draftValues: readonly string[],
  baselineValues: readonly string[],
): (string | null)[] {
  const result: (string | null)[] = Array.from({ length: draftValues.length }, () => null);
  const usedBaseline = new Set<number>();

  for (let i = 0; i < draftValues.length; i++) {
    if (i < baselineValues.length && draftValues[i] === baselineValues[i]) {
      result[i] = baselineValues[i] ?? null;
      usedBaseline.add(i);
    }
  }

  for (let i = 0; i < draftValues.length; i++) {
    if (result[i] !== null) continue;
    const j = baselineValues.findIndex((value, idx) => !usedBaseline.has(idx) && value === draftValues[i]);
    if (j >= 0) {
      result[i] = baselineValues[j] ?? null;
      usedBaseline.add(j);
    }
  }

  const remainingBaseline = baselineValues
    .map((value, idx) => ({ value, idx }))
    .filter((entry) => !usedBaseline.has(entry.idx));
  let remainingCursor = 0;
  for (let i = 0; i < draftValues.length; i++) {
    if (result[i] !== null) continue;
    if (remainingCursor < remainingBaseline.length) {
      result[i] = remainingBaseline[remainingCursor]?.value ?? null;
      remainingCursor += 1;
    }
  }

  return result;
}

/** Build a draft→baseline match index for one file (parse each side once). */
export function buildIniRowMatchIndex(
  payload: ServerIniPayload | null,
  baseline: ServerIniPayload | null,
  fileKey: IniFileKey,
): IniRowMatchIndex | null {
  if (payload === null || baseline === null) return null;

  const draftRows = parseIniRows(textForFile(payload, fileKey));
  const baselineRows = parseIniRows(textForFile(baseline, fileKey));

  const baselineByGroup = new Map<string, string[]>();
  for (const row of baselineRows) {
    const group = iniGroupKey(row.section, row.key);
    const values = baselineByGroup.get(group) ?? [];
    values.push(row.value);
    baselineByGroup.set(group, values);
  }

  const draftByGroup = new Map<string, Array<{ section: string; key: string; value: string }>>();
  for (const row of draftRows) {
    const group = iniGroupKey(row.section, row.key);
    const entries = draftByGroup.get(group) ?? [];
    entries.push({ section: row.section, key: row.key, value: row.value });
    draftByGroup.set(group, entries);
  }

  const index = new Map<string, string | null>();
  for (const [group, draftEntries] of draftByGroup) {
    const aligned = alignIniDuplicateValues(
      draftEntries.map((entry) => entry.value),
      baselineByGroup.get(group) ?? [],
    );
    for (let occurrence = 0; occurrence < draftEntries.length; occurrence++) {
      const entry = draftEntries[occurrence];
      if (entry === undefined) continue;
      index.set(iniRowIdentity(fileKey, entry.section, entry.key, occurrence), aligned[occurrence] ?? null);
    }
  }
  return index;
}

export function lookupMatchedBaselineValue(
  matchIndex: IniRowMatchIndex,
  fileKey: IniFileKey,
  section: string,
  key: string,
  occurrence: number,
): string | null {
  return matchIndex.get(iniRowIdentity(fileKey, section, key, occurrence)) ?? null;
}

/**
 * @param matchIndex `null` when no baseline/payload pair is loaded (never unsaved).
 *   Pass a memoized {@link buildIniRowMatchIndex} result in render paths.
 */
export function isIniRowUnsaved(
  row: Pick<IniSettingReference, "fileKey" | "section" | "key" | "occurrence" | "value">,
  matchIndex: IniRowMatchIndex | null,
): boolean {
  if (matchIndex === null) return false;
  const id = iniRowIdentity(row.fileKey, row.section, row.key, row.occurrence);
  if (!matchIndex.has(id)) {
    // Draft-only key group not present in the index build path — treat as unsaved.
    return true;
  }
  const saved = matchIndex.get(id) ?? null;
  if (saved === null) return true;
  return saved !== row.value;
}

export interface IniUnsavedCounts {
  /** Dirty visual rows in the active file (unfiltered). */
  file: number;
  /** Dirty visual rows per ASA UI category for the active file. */
  byCategory: ReadonlyMap<AsaUiCategoryId, number>;
}

/**
 * Apply per-row revert: restore the matched baseline value, or remove the assignment when
 * the occurrence is draft-only.
 */
export function applyIniRowRevertToPayload(
  payload: ServerIniPayload,
  matchIndex: IniRowMatchIndex,
  row: Pick<IniSettingReference, "fileKey" | "section" | "key" | "occurrence">,
): { nextPayload: ServerIniPayload; outcome: "reverted" | "discarded"; savedValue: string | null } {
  const saved = lookupMatchedBaselineValue(matchIndex, row.fileKey, row.section, row.key, row.occurrence);
  if (saved === null) {
    return {
      nextPayload: withFileText(
        payload,
        row.fileKey,
        removeIniValue(textForFile(payload, row.fileKey), row.section, row.key, row.occurrence),
      ),
      outcome: "discarded",
      savedValue: null,
    };
  }
  return {
    nextPayload: withFileText(
      payload,
      row.fileKey,
      setIniValue(textForFile(payload, row.fileKey), row.section, row.key, saved, row.occurrence),
    ),
    outcome: "reverted",
    savedValue: saved,
  };
}

/** Hides engram, points-per-level, and loot lines from the Game.ini Settings table. */
export function isGameIniEngramEditorKey(fileKey: IniFileKey, key: string): boolean {
  return (
    fileKey === "game" &&
    (isPlayerLevelEngramPointsKey(key) || isNamedEngramEntriesKey(key) || isSupplyCrateEntriesKey(key))
  );
}

/** Count unsaved visual rows using a memoized match index (no baseline re-parse). */
export function countUnsavedIniRowsForFile(
  payload: ServerIniPayload | null,
  matchIndex: IniRowMatchIndex | null,
  fileKey: IniFileKey,
): IniUnsavedCounts {
  const byCategory = new Map<AsaUiCategoryId, number>();
  if (payload === null || matchIndex === null) {
    return { file: 0, byCategory };
  }
  const rows = parseIniRows(textForFile(payload, fileKey)).filter((row) =>
    isVisuallyEditableIniSetting(fileKey, row.section, row.key),
  );
  let file = 0;
  for (const row of rows) {
    const ref: IniSettingReference = { ...row, fileKey };
    if (isGameIniEngramEditorKey(fileKey, row.key)) continue;
    if (!isIniRowUnsaved(ref, matchIndex)) continue;
    file += 1;
    const category = resolveAsaUiCategory(fileKey, row.section, row.key);
    byCategory.set(category, (byCategory.get(category) ?? 0) + 1);
  }
  return { file, byCategory };
}
