import type { IniSettingsSort } from "./iniUiCategoryGrouping";

/** Remembered INI settings-table sort. Display only; it is not written into the INI. */
export const INI_SETTINGS_SORT_STORAGE_KEY = "yark.iniSettingsSort";

export function readStoredIniSettingsSort(): IniSettingsSort {
  if (typeof window === "undefined") {
    return "unsorted";
  }
  const raw = window.localStorage.getItem(INI_SETTINGS_SORT_STORAGE_KEY);
  if (raw === "alphabetical" || raw === "asInFile") return raw;
  return "unsorted";
}

export function writeStoredIniSettingsSort(sort: IniSettingsSort): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(INI_SETTINGS_SORT_STORAGE_KEY, sort);
}
