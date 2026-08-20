import type { Route } from "@layout/Sidebar/Sidebar";

export const SPOTLIGHT_RECENT_STORAGE_KEY = "yark.spotlightRecent.v1";
const SPOTLIGHT_RECENT_MAX = 5;

export type SpotlightRecentEntry =
  | { kind: "nav"; route: Route }
  | { kind: "server"; serverId: string };

const NAV_ROUTES = new Set<Route>([
  "overview",
  "downloads",
  "clusters",
  "backups",
  "logs",
  "settings",
]);

function isRoute(value: unknown): value is Route {
  return typeof value === "string" && NAV_ROUTES.has(value as Route);
}

function isRecentEntry(value: unknown): value is SpotlightRecentEntry {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const row = value as Record<string, unknown>;
  if (row.kind === "nav") {
    return isRoute(row.route);
  }
  if (row.kind === "server") {
    return typeof row.serverId === "string" && row.serverId.trim().length > 0;
  }
  return false;
}

function entryKey(entry: SpotlightRecentEntry): string {
  return entry.kind === "nav"
    ? `nav:${entry.route}`
    : `server:${entry.serverId}`;
}

/** Parse and normalize a stored recent list (MRU first, capped). */
export function normalizeSpotlightRecent(
  raw: unknown,
  max = SPOTLIGHT_RECENT_MAX,
): SpotlightRecentEntry[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set<string>();
  const out: SpotlightRecentEntry[] = [];
  for (const item of raw) {
    if (!isRecentEntry(item)) {
      continue;
    }
    const key = entryKey(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(
      item.kind === "nav"
        ? { kind: "nav", route: item.route }
        : { kind: "server", serverId: item.serverId.trim() },
    );
    if (out.length >= max) {
      break;
    }
  }
  return out;
}

export function readSpotlightRecent(): SpotlightRecentEntry[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(SPOTLIGHT_RECENT_STORAGE_KEY);
    if (raw === null || raw.trim().length === 0) {
      return [];
    }
    return normalizeSpotlightRecent(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

export function writeSpotlightRecent(entries: SpotlightRecentEntry[]): void {
  if (typeof window === "undefined") {
    return;
  }
  const next = normalizeSpotlightRecent(entries);
  window.localStorage.setItem(SPOTLIGHT_RECENT_STORAGE_KEY, JSON.stringify(next));
  emitSpotlightRecentChange();
}

/** Prepend an entry (dedupe + cap) and persist. */
export function pushSpotlightRecent(
  entry: SpotlightRecentEntry,
): SpotlightRecentEntry[] {
  const next = normalizeSpotlightRecent([entry, ...readSpotlightRecent()]);
  writeSpotlightRecent(next);
  return next;
}

type Listener = () => void;
const listeners = new Set<Listener>();
let snapshot: SpotlightRecentEntry[] | null = null;

function emitSpotlightRecentChange(): void {
  snapshot = null;
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeSpotlightRecent(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSpotlightRecentSnapshot(): SpotlightRecentEntry[] {
  if (snapshot === null) {
    snapshot = readSpotlightRecent();
  }
  return snapshot;
}

/** Test helper — clear in-memory cache after mutating localStorage directly. */
export function resetSpotlightRecentCacheForTests(): void {
  snapshot = null;
  emitSpotlightRecentChange();
}
