/**
 * Desktop shell preferences (#54 / #59): tray, Windows startup, quit policy.
 * Stored in SQLite `app_settings` (same KV as uiDensity).
 */

export const CLOSE_WINDOW_TO_TRAY_SETTING_KEY = "closeWindowToTray";
export const START_WITH_WINDOWS_SETTING_KEY = "startWithWindows";
export const TRAY_CLOSE_HINT_DISMISSED_SETTING_KEY = "trayCloseHintDismissed";
export const ON_QUIT_WITH_ACTIVE_SERVERS_SETTING_KEY = "onQuitWithActiveServers";

/** Product default: close hides to tray. */
export const DEFAULT_CLOSE_WINDOW_TO_TRAY = true;

/** Product default: do not register a Windows login item. */
export const DEFAULT_START_WITH_WINDOWS = false;

/**
 * What to do when quitting YARK while managed ASA processes are active (#59).
 * - ask: confirmation dialog (Stop / Cancel)
 * - stop: always stop servers then quit
 *
 * There is no user-facing "Leave running": closing the manager should stop
 * servers or cancel. Crash / Task Manager kill recovery uses durable process
 * checkpoints written while servers are active (reattach on next launch).
 * Legacy stored value `"leave"` maps to `"ask"`.
 */
export type OnQuitWithActiveServers = "ask" | "stop";

export const DEFAULT_ON_QUIT_WITH_ACTIVE_SERVERS: OnQuitWithActiveServers = "ask";

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

export function parseOnQuitWithActiveServers(
  raw: string | null | undefined,
  defaultValue: OnQuitWithActiveServers = DEFAULT_ON_QUIT_WITH_ACTIVE_SERVERS,
): OnQuitWithActiveServers {
  if (raw === null || raw === undefined) {
    return defaultValue;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === "ask" || normalized === "stop") {
    return normalized;
  }
  // Former "leave" policy: treat as Ask (Stop / Cancel).
  if (normalized === "leave") {
    return "ask";
  }
  return defaultValue;
}

export function isOnQuitWithActiveServers(
  value: unknown,
): value is OnQuitWithActiveServers {
  return value === "ask" || value === "stop";
}

export interface DesktopShellPreferences {
  closeWindowToTray: boolean;
  startWithWindows: boolean;
  trayCloseHintDismissed: boolean;
  onQuitWithActiveServers: OnQuitWithActiveServers;
}
