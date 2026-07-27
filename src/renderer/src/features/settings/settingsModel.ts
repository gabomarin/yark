export const OPEN_NATIVE_TERMINAL_PREF_KEY = "overview.openNativeTerminalOnStart";

export function readOpenNativeTerminalPref(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(OPEN_NATIVE_TERMINAL_PREF_KEY) === "1";
}

export function writeOpenNativeTerminalPref(enabled: boolean): void {
  window.localStorage.setItem(OPEN_NATIVE_TERMINAL_PREF_KEY, enabled ? "1" : "0");
}
