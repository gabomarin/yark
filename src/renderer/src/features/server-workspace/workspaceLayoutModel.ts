/**
 * Workspace server-list chrome (#107).
 *
 * Wide layout only (≥1600px). Compact windows keep Drawers.
 * Explicit Full (280) ↔ Rail — no free-drag mid widths (same recipe as app Sidebar icon-rail).
 *
 * | Constant | Value | Role |
 * | --- | --- | --- |
 * | LIST_FULL_PX | 280 | Default labeled list column |
 * | ICON_RAIL_PX | CHROME_ICON_RAIL_PX | Icon-only rail width |
 * | SIDE_PANEL_PX | 260 | Fixed side column |
 */

import type { ServerProfile } from "@shared/types";
import { CHROME_ICON_RAIL_PX } from "@layout/chromeRailModel";

export const LIST_FULL_PX = 280;
export const ICON_RAIL_PX = CHROME_ICON_RAIL_PX;
export const SIDE_PANEL_PX = 260;

/** @deprecated Prefer LIST_FULL_PX — kept for any leftover imports during transition. */
export const LIST_DEFAULT_PX = LIST_FULL_PX;

export const LIST_RAIL_STORAGE_KEY = "yark.workspaceServerListRail";
/** Legacy continuum width key — migrated once to rail boolean. */
export const LIST_WIDTH_STORAGE_KEY = "yark.workspaceServerListWidthPx";

export type WorkspaceListMode = "full" | "rail";

export function listWidthForMode(mode: WorkspaceListMode): number {
  return mode === "rail" ? ICON_RAIL_PX : LIST_FULL_PX;
}

export function readStoredListMode(): WorkspaceListMode {
  if (typeof window === "undefined") {
    return "full";
  }
  const railRaw = window.localStorage.getItem(LIST_RAIL_STORAGE_KEY);
  if (railRaw === "1" || railRaw === "true") {
    return "rail";
  }
  if (railRaw === "0" || railRaw === "false") {
    return "full";
  }
  // One-shot migrate from continuum width preference.
  const legacy = window.localStorage.getItem(LIST_WIDTH_STORAGE_KEY);
  if (legacy !== null && legacy.trim() !== "") {
    const parsed = Number(legacy);
    if (Number.isFinite(parsed) && parsed <= ICON_RAIL_PX + 24) {
      writeStoredListMode("rail");
      window.localStorage.removeItem(LIST_WIDTH_STORAGE_KEY);
      return "rail";
    }
    window.localStorage.removeItem(LIST_WIDTH_STORAGE_KEY);
  }
  return "full";
}

export function writeStoredListMode(mode: WorkspaceListMode): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(LIST_RAIL_STORAGE_KEY, mode === "rail" ? "1" : "0");
}

export interface ServerClusterGroup {
  key: string;
  label: string;
  servers: ServerProfile[];
}

/** Group servers by `clusterId`; null/empty → Unclustered (key `""`, never collides with a real id). */
export function groupServersByCluster(servers: ServerProfile[]): ServerClusterGroup[] {
  const map = new Map<string, ServerProfile[]>();
  for (const server of servers) {
    const key = server.clusterId?.trim() ?? "";
    const list = map.get(key) ?? [];
    list.push(server);
    map.set(key, list);
  }
  const groups: ServerClusterGroup[] = [...map.entries()].map(([key, groupServers]) => ({
    key,
    label: key.length === 0 ? "Unclustered" : key,
    servers: groupServers,
  }));
  groups.sort((a, b) => {
    if (a.key.length === 0) return 1;
    if (b.key.length === 0) return -1;
    return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
  });
  return groups;
}
