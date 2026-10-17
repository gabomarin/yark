import type { IniFileKey, ServerIniPayload } from "@shared/types";
import { resolveAsaUiCategory, type AsaUiCategoryId } from "@shared/asa/asa-setting-ui-categories";
import { isVisuallyEditableIniSetting } from "@shared/ini/ini-setting-decisions";
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
 * Stable identity for a visual INI row (file + section + key + occurrence).
 * Occurrence matches `setIniTextValue` / `removeIniTextValue` indexing in draft order.
 */
export function iniRowIdentity(fileKey: IniFileKey, section: string, key: string, occurrence: number): string {
  return `${fileKey}\u001f${section}\u001f${key}\u001f${occurrence}`.toLowerCase();
}

/** Parsed baseline values keyed by {@link iniRowIdentity} for one file. */
export type IniBaselineValueIndex = ReadonlyMap<string, string>;

/** Build a one-file baseline index (parse once; reuse for row props and counts). */
export function buildIniBaselineValueIndex(
  baseline: ServerIniPayload | null,
  fileKey: IniFileKey,
): IniBaselineValueIndex {
  const index = new Map<string, string>();
  if (baseline === null) return index;
  for (const row of parseIniRows(textForFile(baseline, fileKey))) {
    index.set(iniRowIdentity(fileKey, row.section, row.key, row.occurrence), row.value);
  }
  return index;
}

export function lookupBaselineIniValueFromIndex(
  index: IniBaselineValueIndex,
  fileKey: IniFileKey,
  section: string,
  key: string,
  occurrence: number,
): string | null {
  return index.get(iniRowIdentity(fileKey, section, key, occurrence)) ?? null;
}

/** Baseline value for an occurrence, or null when that occurrence is absent from the saved file. */
export function lookupBaselineIniValue(
  baseline: ServerIniPayload | null,
  fileKey: IniFileKey,
  section: string,
  key: string,
  occurrence: number,
): string | null {
  if (baseline === null) return null;
  return lookupBaselineIniValueFromIndex(
    buildIniBaselineValueIndex(baseline, fileKey),
    fileKey,
    section,
    key,
    occurrence,
  );
}

/**
 * @param baselineIndex `null` when no baseline is loaded (never unsaved).
 *   Pass a memoized {@link buildIniBaselineValueIndex} result in render paths.
 */
export function isIniRowUnsaved(
  row: Pick<IniSettingReference, "fileKey" | "section" | "key" | "occurrence" | "value">,
  baselineIndex: IniBaselineValueIndex | null,
): boolean {
  if (baselineIndex === null) return false;
  const saved = lookupBaselineIniValueFromIndex(baselineIndex, row.fileKey, row.section, row.key, row.occurrence);
  if (saved === null) {
    // Occurrence only exists in the draft (e.g. text-mode insert then switch to visual).
    return true;
  }
  return saved !== row.value;
}

export interface IniUnsavedCounts {
  /** Dirty visual rows in the active file (unfiltered). */
  file: number;
  /** Dirty visual rows per ASA UI category for the active file. */
  byCategory: ReadonlyMap<AsaUiCategoryId, number>;
}

/**
 * Apply per-row revert: restore the baseline value, or remove the assignment when
 * the occurrence exists only in the draft.
 */
export function applyIniRowRevertToPayload(
  payload: ServerIniPayload,
  baselineIndex: IniBaselineValueIndex,
  row: Pick<IniSettingReference, "fileKey" | "section" | "key" | "occurrence">,
): { nextPayload: ServerIniPayload; outcome: "reverted" | "discarded"; savedValue: string | null } {
  const saved = lookupBaselineIniValueFromIndex(baselineIndex, row.fileKey, row.section, row.key, row.occurrence);
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

/** Count unsaved visual rows for one file against the baseline payload. */
export function countUnsavedIniRowsForFile(
  payload: ServerIniPayload | null,
  baseline: ServerIniPayload | null,
  fileKey: IniFileKey,
): IniUnsavedCounts {
  const byCategory = new Map<AsaUiCategoryId, number>();
  if (payload === null || baseline === null) {
    return { file: 0, byCategory };
  }
  const baselineIndex = buildIniBaselineValueIndex(baseline, fileKey);
  const rows = parseIniRows(textForFile(payload, fileKey)).filter((row) =>
    isVisuallyEditableIniSetting(fileKey, row.section, row.key),
  );
  let file = 0;
  for (const row of rows) {
    const ref: IniSettingReference = { ...row, fileKey };
    if (!isIniRowUnsaved(ref, baselineIndex)) continue;
    file += 1;
    const category = resolveAsaUiCategory(fileKey, row.section, row.key);
    byCategory.set(category, (byCategory.get(category) ?? 0) + 1);
  }
  return { file, byCategory };
}
