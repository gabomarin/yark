/**
 * Desktop shell preferences (#54): close-to-tray and start-with-Windows.
 * Stored in SQLite `app_settings` (same KV as uiDensity).
 */

export const CLOSE_WINDOW_TO_TRAY_SETTING_KEY = "closeWindowToTray";
export const START_WITH_WINDOWS_SETTING_KEY = "startWithWindows";
export const TRAY_CLOSE_HINT_DISMISSED_SETTING_KEY = "trayCloseHintDismissed";

/** Product default: close hides to tray. */
export const DEFAULT_CLOSE_WINDOW_TO_TRAY = true;

/** Product default: do not register a Windows login item. */
export const DEFAULT_START_WITH_WINDOWS = false;

export function parseStoredBoolean(
  raw: string | null | undefined,
  defaultValue: boolean,
): boolean {
  if (raw === null || raw === undefined || raw.trim() === "") {
    return defaultValue;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }
  return defaultValue;
}

export function serializeStoredBoolean(value: boolean): string {
  return value ? "true" : "false";
}

export interface DesktopShellPreferences {
  closeWindowToTray: boolean;
  startWithWindows: boolean;
  trayCloseHintDismissed: boolean;
}
