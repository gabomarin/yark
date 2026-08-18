/** App-wide native ASA console on start. Stored in `app_settings`. */

/** SQLite `app_settings.key` for Show server console on start. */
export const OPEN_NATIVE_CONSOLE_SETTING_KEY = "openNativeConsoleOnStart";

/** Product default — piped / hidden spawn. */
export const DEFAULT_OPEN_NATIVE_CONSOLE = false;

/** Legacy renderer localStorage key (migrated once into `app_settings`). */
export const OPEN_NATIVE_CONSOLE_LEGACY_LOCAL_STORAGE_KEY =
  "overview.openNativeTerminalOnStart";

export function parseStoredOpenNativeConsole(
  value: string | null | undefined,
): boolean | null {
  if (value === "1" || value === "true") {
    return true;
  }
  if (value === "0" || value === "false") {
    return false;
  }
  return null;
}

export function encodeOpenNativeConsolePref(enabled: boolean): string {
  return enabled ? "1" : "0";
}

export function parseOpenNativeConsolePref(
  value: string | null | undefined,
): boolean {
  return parseStoredOpenNativeConsole(value) ?? DEFAULT_OPEN_NATIVE_CONSOLE;
}
