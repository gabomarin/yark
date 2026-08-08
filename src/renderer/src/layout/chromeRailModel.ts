/**
 * Shared chrome icon-rail recipe (app Sidebar + workspace server list).
 * Explicit Full ↔ Rail only — no free-drag mid widths.
 */

export const CHROME_ICON_RAIL_PX = 72;

export type ChromeRailMode = "full" | "rail";

export const SIDEBAR_RAIL_STORAGE_KEY = "yark.appSidebarRail";

export function readStoredSidebarRailMode(): ChromeRailMode {
  if (typeof window === "undefined") {
    return "full";
  }
  const raw = window.localStorage.getItem(SIDEBAR_RAIL_STORAGE_KEY);
  if (raw === "1" || raw === "true") {
    return "rail";
  }
  if (raw === "0" || raw === "false") {
    return "full";
  }
  return "full";
}

export function writeStoredSidebarRailMode(mode: ChromeRailMode): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(SIDEBAR_RAIL_STORAGE_KEY, mode === "rail" ? "1" : "0");
}
