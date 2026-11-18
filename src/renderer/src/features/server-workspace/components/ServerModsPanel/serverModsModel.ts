import { isMapCategoryLabel } from "@shared/asa/map-token-suggest";
import type { ModMetadata, ModSearchPage } from "@shared/types";

export interface ModRow {
  key: string;
  id: string | null;
  slug: string;
  name: string;
  author: string;
  summary: string;
  thumbnailUrl: string | null;
  /** CurseForge categories; the table shows one primary badge (+N). */
  categories: string[];
  downloads: string;
  /** Numeric downloads for view-sort; null when unknown. */
  downloadCount: number | null;
  updated: string;
  /** Epoch ms for view-sort; null when unknown. */
  updatedAt: number | null;
  /** 0-based position in profile load order (`-mods=`). */
  loadIndex: number;
  url: string | null;
  configured: boolean;
  enabled: boolean;
  /** Enabled + marked passive: emitted on `-passivemods=` only. */
  passive: boolean;
  /** No CurseForge metadata cache yet (#698 / import without names). */
  noPage: boolean;
}

/** Drawer / table placeholder when a Project ID has no metadata cache (#698). */
export function unresolvedProjectMetadata(id: string): ModMetadata {
  return {
    id,
    name: `Project ${id}`,
    summary: "No CurseForge page yet",
    thumbnailUrl: null,
    authors: [],
    downloadCount: 0,
    dateModified: new Date(0).toISOString(),
    curseforgeUrl: "",
    slug: id,
    categories: [],
  };
}

/**
 * True for the in-memory No page stub — not for a missing Map entry.
 * Missing entries can mean a pending or failed metadata fetch; only a stub
 * (or an operator-confirmed unverified add that seeded one) is "No page".
 */
export function isUnresolvedProjectStub(item: ModMetadata): boolean {
  return item.curseforgeUrl.trim().length === 0 && item.dateModified === new Date(0).toISOString();
}

export const NO_CURSEFORGE_PAGE_BADGE = "No page";
export const NO_CURSEFORGE_PAGE_TOOLTIP =
  "CurseForge has no page YARK can use yet. The Project ID is still sent on Start when this mod is enabled.";
export const NO_CURSEFORGE_PAGE_SUBLINE = "No CurseForge page yet";

export type ModRowSortAccessor = "name" | "downloadCount" | "updatedAt";

export interface ModRowSortStatus {
  columnAccessor: ModRowSortAccessor;
  direction: "asc" | "desc";
}

export function buildServerRows(
  configuredIds: string[],
  disabledIds: Set<string>,
  metadata: Map<string, ModMetadata>,
  passiveIds: Set<string> = new Set(),
): ModRow[] {
  return configuredIds.map((id, loadIndex) =>
    metadataRow(id, metadata.get(id), !disabledIds.has(id), !disabledIds.has(id) && passiveIds.has(id), loadIndex),
  );
}

export function buildDiscoveryRows(
  configuredIds: string[],
  disabledIds: Set<string>,
  metadata: Map<string, ModMetadata>,
  catalog: ModSearchPage | null,
  passiveIds: Set<string> = new Set(),
): ModRow[] {
  const configuredBySlug = new Map(
    configuredIds
      .map((id) => metadata.get(id))
      .filter((item): item is ModMetadata => item !== undefined)
      .map((item) => [item.slug, item]),
  );
  return (catalog?.items ?? []).map((item, loadIndex) => {
    const configuredMetadata = configuredBySlug.get(item.slug);
    return catalogRow(
      item,
      configuredMetadata,
      configuredMetadata !== undefined && !disabledIds.has(configuredMetadata.id),
      configuredMetadata !== undefined &&
        !disabledIds.has(configuredMetadata.id) &&
        passiveIds.has(configuredMetadata.id),
      loadIndex,
    );
  });
}

/** Temporary view order — does not mutate load order. */
export function sortModRows(rows: ModRow[], sort: ModRowSortStatus | null): ModRow[] {
  if (sort === null) return rows;
  const dir = sort.direction === "desc" ? -1 : 1;
  return [...rows].sort((left, right) => {
    const cmp = compareModRows(left, right, sort.columnAccessor);
    return cmp === 0 ? left.loadIndex - right.loadIndex : cmp * dir;
  });
}

export function reorderModIds(ids: string[], fromIndex: number, toIndex: number): string[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= ids.length || toIndex >= ids.length) {
    return ids;
  }
  const next = [...ids];
  const [moved] = next.splice(fromIndex, 1);
  if (moved === undefined) return ids;
  next.splice(toIndex, 0, moved);
  return next;
}

/** Copy-IDs menu variants (#634): All / Enabled (`-mods=`) / Disabled. */
export type ModIdCopyVariant = "all" | "enabled" | "disabled";

export function selectModIdsForCopy(
  configuredIds: string[],
  disabledIds: ReadonlySet<string>,
  variant: ModIdCopyVariant,
): string[] {
  if (variant === "all") return [...configuredIds];
  if (variant === "enabled") return configuredIds.filter((id) => !disabledIds.has(id));
  return configuredIds.filter((id) => disabledIds.has(id));
}

export function formatModIdsCsv(ids: string[]): string {
  return ids.join(",");
}

/**
 * Inventory search + Status combobox (#636). View-only — never mutates load
 * order. Options: Enabled / Disabled / Passive (fixed-height summary, no pills).
 */
export type ServerModsStatusFilter = "enabled" | "disabled" | "passive";

export interface ServerModsInventoryFilter {
  query: string;
  statuses: ServerModsStatusFilter[];
}

export const EMPTY_SERVER_MODS_INVENTORY_FILTER: ServerModsInventoryFilter = {
  query: "",
  statuses: [],
};

export function isServerModsInventoryFilterActive(filter: ServerModsInventoryFilter): boolean {
  return filter.query.trim().length > 0 || filter.statuses.length > 0;
}

function matchesStatusFilter(row: ModRow, statuses: ServerModsStatusFilter[]): boolean {
  if (statuses.length === 0) return true;
  return statuses.some((status) => {
    if (status === "enabled") return row.enabled;
    if (status === "disabled") return !row.enabled;
    return row.passive;
  });
}

export function filterServerModRows(rows: ModRow[], filter: ServerModsInventoryFilter): ModRow[] {
  const query = filter.query.trim().toLowerCase();

  return rows.filter((row) => {
    if (query.length > 0) {
      const nameHit = row.name.toLowerCase().includes(query);
      const idHit = (row.id ?? "").toLowerCase().includes(query);
      if (!nameHit && !idHit) return false;
    }
    return matchesStatusFilter(row, filter.statuses);
  });
}

function compareModRows(left: ModRow, right: ModRow, accessor: ModRowSortAccessor): number {
  if (accessor === "name") {
    return left.name.localeCompare(right.name, undefined, {
      sensitivity: "base",
    });
  }
  if (accessor === "downloadCount") {
    return (left.downloadCount ?? -1) - (right.downloadCount ?? -1);
  }
  return (left.updatedAt ?? 0) - (right.updatedAt ?? 0);
}

function formatModDownloadCount(count: number | undefined): string {
  return count === undefined ? "Unknown" : count.toLocaleString();
}

function metadataRow(
  id: string,
  item: ModMetadata | undefined,
  enabled: boolean,
  passive: boolean,
  loadIndex: number,
): ModRow {
  const noPage = item !== undefined && isUnresolvedProjectStub(item);
  const unknownUpdated = item === undefined || noPage || item.dateModified === new Date(0).toISOString();
  return {
    key: `id:${id}`,
    id,
    slug: item?.slug ?? id,
    name: item?.name ?? `Project ${id}`,
    author: noPage
      ? NO_CURSEFORGE_PAGE_SUBLINE
      : item === undefined
        ? "Unknown author"
        : item.authors.join(", ") || "Unknown author",
    summary: noPage ? NO_CURSEFORGE_PAGE_SUBLINE : (item?.summary ?? ""),
    thumbnailUrl: item?.thumbnailUrl ?? null,
    categories: item?.categories ?? [],
    downloads: formatModDownloadCount(noPage || item === undefined ? undefined : item.downloadCount),
    downloadCount: noPage || item === undefined ? null : (item.downloadCount ?? null),
    updated: unknownUpdated ? "Unknown update" : new Date(item.dateModified).toLocaleDateString(),
    updatedAt: unknownUpdated ? null : Date.parse(item.dateModified),
    loadIndex,
    url: item?.curseforgeUrl && item.curseforgeUrl.length > 0 ? item.curseforgeUrl : null,
    configured: true,
    enabled,
    passive,
    noPage,
  };
}

function catalogRow(
  item: ModMetadata,
  configuredMetadata: ModMetadata | undefined,
  enabled: boolean,
  passive: boolean,
  loadIndex: number,
): ModRow {
  return {
    key: `slug:${item.slug}`,
    id: configuredMetadata?.id ?? item.id,
    slug: item.slug,
    name: item.name,
    author: item.authors.join(", ") || "Unknown author",
    summary: item.summary,
    thumbnailUrl: item.thumbnailUrl,
    categories: item.categories ?? [],
    downloads: formatModDownloadCount(item.downloadCount),
    downloadCount: item.downloadCount,
    updated: new Date(item.dateModified).toLocaleDateString(),
    updatedAt: Date.parse(item.dateModified),
    loadIndex,
    url: item.curseforgeUrl,
    configured: configuredMetadata !== undefined,
    enabled,
    passive,
    noPage: false,
  };
}

/** One list badge: prefer Maps; extra CurseForge tags collapse to +N. */
export function pickModListCategory(categories: string[]): {
  label: string | null;
  extraCount: number;
  extraLabels: string[];
  isMap: boolean;
} {
  const labels = categories.filter((entry) => entry.trim().length > 0);
  if (labels.length === 0) {
    return { label: null, extraCount: 0, extraLabels: [], isMap: false };
  }
  const mapLabel = labels.find(isMapCategoryLabel) ?? null;
  const label = mapLabel ?? labels[0]!;
  const extraLabels: string[] = [];
  let skippedPrimary = false;
  for (const entry of labels) {
    if (!skippedPrimary && entry === label) {
      skippedPrimary = true;
      continue;
    }
    extraLabels.push(entry);
  }
  return {
    label,
    extraCount: extraLabels.length,
    extraLabels,
    isMap: mapLabel !== null,
  };
}

export function metadataMap(cache: Record<string, ModMetadata> | undefined): Map<string, ModMetadata> {
  return mergeMetadata(new Map(), cache ?? {});
}

function sameStringList(left: string[] | undefined, right: string[] | undefined): boolean {
  const a = left ?? [];
  const b = right ?? [];
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * True when every user-visible ModMetadata field matches, including authors and
 * categories. Used by inspect cache persistence ({@link inspectServerMod}) and
 * tests — compare full metadata only; do not use for partial field checks.
 */
export function sameModMetadata(left: ModMetadata, right: ModMetadata): boolean {
  return (
    left.id === right.id &&
    left.name === right.name &&
    left.summary === right.summary &&
    (left.description ?? null) === (right.description ?? null) &&
    left.thumbnailUrl === right.thumbnailUrl &&
    sameStringList(left.screenshots, right.screenshots) &&
    left.downloadCount === right.downloadCount &&
    left.dateModified === right.dateModified &&
    left.curseforgeUrl === right.curseforgeUrl &&
    left.slug === right.slug &&
    sameStringList(left.authors, right.authors) &&
    sameStringList(left.categories, right.categories)
  );
}

function modMetadataFingerprint(item: ModMetadata): string {
  return [
    item.id,
    item.name,
    item.summary,
    item.description ?? "",
    item.thumbnailUrl ?? "",
    (item.screenshots ?? []).join(","),
    String(item.downloadCount),
    item.dateModified,
    item.curseforgeUrl,
    item.slug,
    (item.authors ?? []).join(","),
    (item.categories ?? []).join(","),
  ].join("\0");
}

export function modsMetadataSyncKey(cache: Record<string, ModMetadata> | undefined): string {
  if (cache === undefined) return "";
  return Object.keys(cache)
    .sort()
    .map((id) => {
      const item = cache[id];
      return item === undefined ? id : modMetadataFingerprint(item);
    })
    .join("|");
}

export function sameIdList(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export function mergeMetadata(
  previous: Map<string, ModMetadata>,
  cache: Record<string, ModMetadata>,
): Map<string, ModMetadata> {
  let changed = false;
  const next = new Map(previous);
  for (const detail of Object.values(cache)) {
    const existing = next.get(detail.id);
    if (existing === undefined || !sameModMetadata(existing, detail)) {
      next.set(detail.id, detail);
      changed = true;
    }
  }
  return changed ? next : previous;
}

export function mergeMissingMetadata(
  previous: Map<string, ModMetadata>,
  fallbackItems: ModMetadata[],
): Map<string, ModMetadata> {
  let changed = false;
  const next = new Map(previous);
  for (const item of fallbackItems) {
    if (!next.has(item.id)) {
      next.set(item.id, item);
      changed = true;
    }
  }
  return changed ? next : previous;
}

/**
 * Apply a successful getModsMetadata response: merge returned rows, and seed
 * No page stubs only for requested IDs the service omitted (confirmed missing).
 * Failed fetches must not call this — missing Map entries stay pending.
 */
export function mergeConfirmedMetadataFetch(
  previous: Map<string, ModMetadata>,
  requestedIds: readonly string[],
  fetched: ModMetadata[],
): Map<string, ModMetadata> {
  const withFetched = mergeMissingMetadata(previous, fetched);
  const found = new Set(fetched.map((item) => item.id));
  const stubs = requestedIds.filter((id) => !found.has(id) && !withFetched.has(id)).map(unresolvedProjectMetadata);
  return stubs.length === 0 ? withFetched : mergeMissingMetadata(withFetched, stubs);
}

/** Whether a Check CurseForge again response may update the open drawer (#698). */
export function shouldApplyDetailRefresh(
  inspectTarget: string | null,
  requestModId: string,
  result: Pick<ModMetadata, "id" | "slug">,
): boolean {
  if (inspectTarget === null) return false;
  return inspectTarget === requestModId || inspectTarget === result.id || inspectTarget === result.slug;
}
