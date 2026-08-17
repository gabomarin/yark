import { isMapCategoryLabel } from "@shared/map-token-suggest";
import type {
  ModMetadata,
  ModSearchPage,
  ServerProfile,
  ServerProfileInput,
} from "@shared/types";

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
}

export type ModRowSortAccessor = "name" | "downloadCount" | "updatedAt";

export interface ModRowSortStatus {
  columnAccessor: ModRowSortAccessor;
  direction: "asc" | "desc";
}

export function buildServerRows(
  configuredIds: string[],
  disabledIds: Set<string>,
  metadata: Map<string, ModMetadata>,
): ModRow[] {
  return configuredIds.map((id, loadIndex) =>
    metadataRow(id, metadata.get(id), !disabledIds.has(id), loadIndex));
}

export function buildDiscoveryRows(
  configuredIds: string[],
  disabledIds: Set<string>,
  metadata: Map<string, ModMetadata>,
  catalog: ModSearchPage | null,
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
      configuredMetadata !== undefined
        && !disabledIds.has(configuredMetadata.id),
      loadIndex,
    );
  });
}

/** Temporary view order — does not mutate load order. */
export function sortModRows(
  rows: ModRow[],
  sort: ModRowSortStatus | null,
): ModRow[] {
  if (sort === null) return rows;
  const dir = sort.direction === "desc" ? -1 : 1;
  return [...rows].sort((left, right) => {
    const cmp = compareModRows(left, right, sort.columnAccessor);
    return cmp === 0 ? left.loadIndex - right.loadIndex : cmp * dir;
  });
}

export function reorderModIds(
  ids: string[],
  fromIndex: number,
  toIndex: number,
): string[] {
  if (
    fromIndex === toIndex
    || fromIndex < 0
    || toIndex < 0
    || fromIndex >= ids.length
    || toIndex >= ids.length
  ) {
    return ids;
  }
  const next = [...ids];
  const [moved] = next.splice(fromIndex, 1);
  if (moved === undefined) return ids;
  next.splice(toIndex, 0, moved);
  return next;
}

function compareModRows(
  left: ModRow,
  right: ModRow,
  accessor: ModRowSortAccessor,
): number {
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
  loadIndex: number,
): ModRow {
  const unknownUpdated =
    item === undefined || item.dateModified === new Date(0).toISOString();
  return {
    key: `id:${id}`,
    id,
    slug: item?.slug ?? id,
    name: item?.name ?? `Mod ${id}`,
    author: item?.authors.join(", ") || "Unknown author",
    summary: item?.summary ?? "No metadata available.",
    thumbnailUrl: item?.thumbnailUrl ?? null,
    categories: item?.categories ?? [],
    downloads: formatModDownloadCount(item?.downloadCount),
    downloadCount: item?.downloadCount ?? null,
    updated: unknownUpdated
      ? "Unknown update"
      : new Date(item!.dateModified).toLocaleDateString(),
    updatedAt: unknownUpdated ? null : Date.parse(item!.dateModified),
    loadIndex,
    url: item?.curseforgeUrl ?? null,
    configured: true,
    enabled,
  };
}

function catalogRow(
  item: ModMetadata,
  configuredMetadata: ModMetadata | undefined,
  enabled: boolean,
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

export function toProfileInput(
  server: ServerProfile,
  mods: string[],
  disabledMods: string[],
  modMetadataCache: Record<string, ModMetadata>,
): ServerProfileInput {
  return {
    name: server.name,
    map: server.map,
    mapModId: server.mapModId ?? null,
    mapSaveFolder: server.mapSaveFolder ?? null,
    installDir: server.installDir,
    sessionName: server.sessionName,
    maxPlayers: server.maxPlayers,
    gamePort: server.gamePort,
    queryPort: server.queryPort,
    rconPort: server.rconPort,
    serverPassword: server.serverPassword,
    adminPassword: server.adminPassword,
    clusterId: server.clusterId,
    clusterDir: server.clusterDir,
    extraArgs: server.extraArgs,
    structuredLaunchArgs: server.structuredLaunchArgs ?? {},
    mods,
    disabledMods,
    modMetadataCache,
    autoStart: server.autoStart,
  };
}

export function metadataMap(
  cache: Record<string, ModMetadata> | undefined,
): Map<string, ModMetadata> {
  return mergeMetadata(new Map(), cache ?? {});
}

function sameStringList(left: string[] | undefined, right: string[] | undefined): boolean {
  const a = left ?? [];
  const b = right ?? [];
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** True when every user-visible ModMetadata field matches. */
export function sameModMetadata(left: ModMetadata, right: ModMetadata): boolean {
  return (
    left.id === right.id
    && left.name === right.name
    && left.summary === right.summary
    && (left.description ?? null) === (right.description ?? null)
    && left.thumbnailUrl === right.thumbnailUrl
    && left.downloadCount === right.downloadCount
    && left.dateModified === right.dateModified
    && left.curseforgeUrl === right.curseforgeUrl
    && left.slug === right.slug
    && sameStringList(left.authors, right.authors)
    && sameStringList(left.categories, right.categories)
  );
}

function modMetadataFingerprint(item: ModMetadata): string {
  return [
    item.id,
    item.name,
    item.summary,
    item.description ?? "",
    item.thumbnailUrl ?? "",
    String(item.downloadCount),
    item.dateModified,
    item.curseforgeUrl,
    item.slug,
    (item.authors ?? []).join(","),
    (item.categories ?? []).join(","),
  ].join("\0");
}

export function modsMetadataSyncKey(
  cache: Record<string, ModMetadata> | undefined,
): string {
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
