import type { ServerProfile } from "@shared/types";

/** Oldest-first by profile `createdAt`, or A→Z by name. */
export type ServerListSortMode = "created" | "name";

/** Flat card/list rows vs cluster headings (Unclustered last when grouped). */
export type ServerListViewMode = "ungrouped" | "grouped";

export type ServerListSurface = "overview" | "workspace";

export const SERVER_LIST_SORT_STORAGE_KEY = "yark.serverListSort";
export const SERVER_LIST_VIEW_STORAGE_KEY = "yark.serverListView";

function isServerListViewMode(value: string): value is ServerListViewMode {
  return value === "ungrouped" || value === "grouped";
}

export function readStoredSortMode(): ServerListSortMode {
  if (typeof window === "undefined") {
    return "created";
  }
  const raw = window.localStorage.getItem(SERVER_LIST_SORT_STORAGE_KEY);
  return raw === "name" ? "name" : "created";
}

export function writeStoredSortMode(mode: ServerListSortMode): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(SERVER_LIST_SORT_STORAGE_KEY, mode);
}

/** Shared view pref; surface picks the default only when nothing is stored yet (#351). */
export function readStoredViewMode(surface: ServerListSurface): ServerListViewMode {
  if (typeof window === "undefined") {
    return surface === "workspace" ? "grouped" : "ungrouped";
  }
  const raw = window.localStorage.getItem(SERVER_LIST_VIEW_STORAGE_KEY);
  if (raw !== null && isServerListViewMode(raw)) {
    return raw;
  }
  return surface === "workspace" ? "grouped" : "ungrouped";
}

export function writeStoredViewMode(mode: ServerListViewMode): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(SERVER_LIST_VIEW_STORAGE_KEY, mode);
}

export function sortServers(
  servers: ServerProfile[],
  sort: ServerListSortMode,
): ServerProfile[] {
  return [...servers].sort((a, b) => {
    if (sort === "name") {
      const byName = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      return byName !== 0 ? byName : a.id.localeCompare(b.id);
    }
    const byDate = a.createdAt.localeCompare(b.createdAt);
    return byDate !== 0 ? byDate : a.id.localeCompare(b.id);
  });
}

export function sortControlLabel(sort: ServerListSortMode): string {
  return sort === "created" ? "Order" : "A–Z";
}

export function sortMenuOptionLabel(sort: ServerListSortMode): string {
  return sort === "created" ? "Order added" : "Alphabetical (A–Z)";
}
