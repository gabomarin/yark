import type { IniSettingsSort } from "./iniUiCategoryGrouping";

/** Remembered INI settings-table sort. Display only; it is not written into the INI. */
export const INI_SETTINGS_SORT_STORAGE_KEY = "yark.iniSettingsSort";

export function readStoredIniSettingsSort(): IniSettingsSort {
  if (typeof window === "undefined") {
    return "unsorted";
  }
  try {
    const raw = window.localStorage.getItem(INI_SETTINGS_SORT_STORAGE_KEY);
    if (raw === "alphabetical" || raw === "asInFile") return raw;
  } catch {
    // Storage can throw when disabled (private mode / SecurityError).
  }
  return "unsorted";
}

export function writeStoredIniSettingsSort(sort: IniSettingsSort): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(INI_SETTINGS_SORT_STORAGE_KEY, sort);
  } catch {
    // Best-effort preference; rendering must not depend on write succeeding.
  }
}
