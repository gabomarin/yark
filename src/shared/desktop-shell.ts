/**
 * Desktop shell preferences (#54 / #59): tray and Windows startup.
 * Stored in SQLite `app_settings` (same KV as uiDensity).
 *
 * Quit with active servers always prompts (Stop / Cancel); there is no
 * Ask/Stop preference. Prefer Close window to tray to keep servers running.
 */

export const CLOSE_WINDOW_TO_TRAY_SETTING_KEY = "closeWindowToTray";
export const START_WITH_WINDOWS_SETTING_KEY = "startWithWindows";
export const TRAY_CLOSE_HINT_DISMISSED_SETTING_KEY = "trayCloseHintDismissed";
export const OS_NOTIFY_ENABLED_SETTING_KEY = "osNotifyEnabled";
export const OS_NOTIFY_CRASH_SETTING_KEY = "osNotifyCrash";
export const OS_NOTIFY_STEAMCMD_SETTING_KEY = "osNotifySteamCmd";

/** Product default: close hides to tray. */
export const DEFAULT_CLOSE_WINDOW_TO_TRAY = true;

/** Product default: do not register a Windows login item. */
export const DEFAULT_START_WITH_WINDOWS = false;

/** Product default: Windows toasts for crash and SteamCMD job finish (#331). */
export const DEFAULT_OS_NOTIFY_ENABLED = true;
export const DEFAULT_OS_NOTIFY_CRASH = true;
export const DEFAULT_OS_NOTIFY_STEAMCMD = true;

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
  osNotifyEnabled: boolean;
  osNotifyCrash: boolean;
  osNotifySteamCmd: boolean;
}
