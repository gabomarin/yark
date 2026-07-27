export const OPEN_NATIVE_TERMINAL_PREF_KEY = "overview.openNativeTerminalOnStart";
export const DEFAULT_BASE_FOLDER_PREF_KEY = "settings.defaultServerBaseFolder";

export function readOpenNativeTerminalPref(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(OPEN_NATIVE_TERMINAL_PREF_KEY) === "1";
}

export function writeOpenNativeTerminalPref(enabled: boolean): void {
  window.localStorage.setItem(OPEN_NATIVE_TERMINAL_PREF_KEY, enabled ? "1" : "0");
}

export function readDefaultBaseFolderPref(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const value = window.localStorage.getItem(DEFAULT_BASE_FOLDER_PREF_KEY)?.trim() ?? "";
  return value.length > 0 ? value : null;
}

export function writeDefaultBaseFolderPref(path: string | null): void {
  if (path === null || path.trim().length === 0) {
    window.localStorage.removeItem(DEFAULT_BASE_FOLDER_PREF_KEY);
    return;
  }
  window.localStorage.setItem(DEFAULT_BASE_FOLDER_PREF_KEY, path.trim());
}
