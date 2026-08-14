import {
  DEFAULT_UI_DENSITY,
  UI_DENSITY_LEGACY_LOCAL_STORAGE_KEY,
  isUiDensity,
  parseUiDensity,
  type UiDensity,
} from "@shared/ui-density";

export type { UiDensity };

export type SettingsCategory =
  | "general"
  | "servers"
  | "steamcmd"
  | "logs"
  | "about";

export const SETTINGS_CATEGORIES: ReadonlyArray<{
  id: SettingsCategory;
  label: string;
}> = [
  { id: "general", label: "General" },
  { id: "servers", label: "Servers" },
  { id: "steamcmd", label: "SteamCMD" },
  { id: "logs", label: "Logs" },
  { id: "about", label: "About" },
];

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

function readLegacyUiDensityLocalStorage(): UiDensity | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(UI_DENSITY_LEGACY_LOCAL_STORAGE_KEY);
  return isUiDensity(raw) ? raw : null;
}

function clearLegacyUiDensityLocalStorage(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(UI_DENSITY_LEGACY_LOCAL_STORAGE_KEY);
}

/**
 * Load density from `app_settings` (via IPC) before the theme mounts.
 * Migrates a one-shot legacy localStorage value when SQLite has no row yet.
 * Never clears the legacy key unless SQLite successfully owns the value.
 * Does not write the product default on read — persist only from user changes.
 */
export async function loadUiDensityPref(): Promise<UiDensity> {
  try {
    if (typeof window === "undefined" || typeof window.api?.getUiDensity !== "function") {
      return parseUiDensity(readLegacyUiDensityLocalStorage());
    }

    const result = await window.api.getUiDensity();
    if (!result.ok) {
      return parseUiDensity(readLegacyUiDensityLocalStorage());
    }

    if (result.data !== null) {
      clearLegacyUiDensityLocalStorage();
      return result.data;
    }

    const legacy = readLegacyUiDensityLocalStorage();
    if (legacy !== null) {
      const migrated = await window.api.setUiDensity(legacy);
      if (migrated.ok) {
        clearLegacyUiDensityLocalStorage();
        return migrated.data;
      }
      return legacy;
    }

    return DEFAULT_UI_DENSITY;
  } catch {
    return parseUiDensity(readLegacyUiDensityLocalStorage());
  }
}

/** @returns true when SQLite accepted the value. */
export async function writeUiDensityPref(density: UiDensity): Promise<boolean> {
  if (typeof window === "undefined" || typeof window.api?.setUiDensity !== "function") {
    return false;
  }
  try {
    const result = await window.api.setUiDensity(density);
    if (!result.ok) {
      return false;
    }
    clearLegacyUiDensityLocalStorage();
    return true;
  } catch {
    return false;
  }
}

/** True when `child` is `parent` or nested under it (Windows, case-insensitive). */
export function isPathUnderParent(parent: string, child: string | null): boolean {
  if (child == null) {
    return false;
  }
  const p = parent.trim().replace(/[/\\]+$/, "").toLowerCase();
  const c = child.trim().replace(/[/\\]+$/, "").toLowerCase();
  if (p.length === 0 || c.length === 0) {
    return false;
  }
  return c === p || c.startsWith(`${p}\\`) || c.startsWith(`${p}/`);
}

/**
 * Note for About → Bundled SteamCMD when YARK is not using that folder.
 * Null when the active steamcmd.exe lives there.
 */
export function bundledSteamCmdUnusedNote(
  bundledDir: string,
  steamCmdExePath: string | null,
): string | null {
  if (isPathUnderParent(bundledDir, steamCmdExePath)) {
    return null;
  }
  if (steamCmdExePath != null && steamCmdExePath.trim().length > 0) {
    return "Not in use. YARK is using the SteamCMD you chose in Settings → SteamCMD.";
  }
  return "Empty until you use Install SteamCMD.";
}
