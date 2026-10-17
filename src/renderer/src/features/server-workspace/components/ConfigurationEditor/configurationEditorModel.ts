import type { IniFileKey, ServerIniPayload } from "@shared/types";
import { resolveAsaUiCategory, type AsaUiCategoryId } from "@shared/asa/asa-setting-ui-categories";
import { isVisuallyEditableIniSetting } from "@shared/ini/ini-setting-decisions";
import { parseIniRows, textForFile, type IniSettingReference } from "../../iniModel";

/** localStorage: operator dismissed the GameUserSettings Server-tab override hint. */
export const INI_GUS_OVERRIDE_HINT_STORAGE_KEY = "yark.ini.gusOverrideHint.dismissed.v1";

export function iniPayloadsDirty(payload: ServerIniPayload | null, baseline: ServerIniPayload | null): boolean {
  return (
    payload !== null &&
    baseline !== null &&
    (payload.game !== baseline.game || payload.gameUserSettings !== baseline.gameUserSettings)
  );
}

/** Stable identity for a visual INI row (file + section + key + occurrence). */
export function iniRowIdentity(fileKey: IniFileKey, section: string, key: string, occurrence: number): string {
  return `${fileKey}\u001f${section}\u001f${key}\u001f${occurrence}`.toLowerCase();
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
  const rows = parseIniRows(textForFile(baseline, fileKey));
  const sectionKey = section.trim().toLowerCase();
  const keyKey = key.trim().toLowerCase();
  const match = rows.find(
    (row) =>
      row.section.trim().toLowerCase() === sectionKey &&
      row.key.trim().toLowerCase() === keyKey &&
      row.occurrence === occurrence,
  );
  return match?.value ?? null;
}

export function isIniRowUnsaved(
  row: Pick<IniSettingReference, "fileKey" | "section" | "key" | "occurrence" | "value">,
  baseline: ServerIniPayload | null,
): boolean {
  if (baseline === null) return false;
  const saved = lookupBaselineIniValue(baseline, row.fileKey, row.section, row.key, row.occurrence);
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
  const rows = parseIniRows(textForFile(payload, fileKey)).filter((row) =>
    isVisuallyEditableIniSetting(fileKey, row.section, row.key),
  );
  let file = 0;
  for (const row of rows) {
    const ref: IniSettingReference = { ...row, fileKey };
    if (!isIniRowUnsaved(ref, baseline)) continue;
    file += 1;
    const category = resolveAsaUiCategory(fileKey, row.section, row.key);
    byCategory.set(category, (byCategory.get(category) ?? 0) + 1);
  }
  return { file, byCategory };
}
