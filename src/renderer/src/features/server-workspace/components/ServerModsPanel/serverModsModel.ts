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
  category: string | null;
  downloads: string;
  updated: string;
  url: string | null;
  configured: boolean;
  enabled: boolean;
}

export function buildServerRows(
  configuredIds: string[],
  disabledIds: Set<string>,
  metadata: Map<string, ModMetadata>,
): ModRow[] {
  return configuredIds.map((id) =>
    metadataRow(id, metadata.get(id), !disabledIds.has(id)));
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
  return (catalog?.items ?? []).map((item) => {
    const configuredMetadata = configuredBySlug.get(item.slug);
    return catalogRow(
      item,
      configuredMetadata,
      configuredMetadata !== undefined
        && !disabledIds.has(configuredMetadata.id),
    );
  });
}

function metadataRow(
  id: string,
  item: ModMetadata | undefined,
  enabled: boolean,
): ModRow {
  return {
    key: `id:${id}`,
    id,
    slug: item?.slug ?? id,
    name: item?.name ?? `Mod ${id}`,
    author: item?.authors.join(", ") || "Unknown author",
    summary: item?.summary ?? "No metadata available.",
    thumbnailUrl: item?.thumbnailUrl ?? null,
    category: item?.categories?.[0] ?? null,
    downloads:
      item === undefined
        ? "Unknown downloads"
        : `${item.downloadCount.toLocaleString()} downloads`,
    updated:
      item === undefined || item.dateModified === new Date(0).toISOString()
        ? "Unknown update"
        : new Date(item.dateModified).toLocaleDateString(),
    url: item?.curseforgeUrl ?? null,
      configured: true,
    enabled,
  };
}

function catalogRow(
  item: ModMetadata,
  configuredMetadata: ModMetadata | undefined,
  enabled: boolean,
): ModRow {
  return {
    key: `slug:${item.slug}`,
    id: configuredMetadata?.id ?? item.id,
    slug: item.slug,
    name: item.name,
    author: item.authors.join(", ") || "Unknown author",
    summary: item.summary,
    thumbnailUrl: item.thumbnailUrl,
    category: item.categories?.[0] ?? null,
    downloads: `${item.downloadCount.toLocaleString()} downloads`,
    updated: new Date(item.dateModified).toLocaleDateString(),
    url: item.curseforgeUrl,
    configured: configuredMetadata !== undefined,
    enabled,
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
    installDir: server.installDir,
    sessionName: server.sessionName,
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

export function mergeMetadata(
  previous: Map<string, ModMetadata>,
  cache: Record<string, ModMetadata>,
): Map<string, ModMetadata> {
  const next = new Map(previous);
  for (const detail of Object.values(cache)) {
    next.set(detail.id, detail);
  }
  return next;
}

export function mergeMissingMetadata(
  previous: Map<string, ModMetadata>,
  fallbackItems: ModMetadata[],
): Map<string, ModMetadata> {
  const next = new Map(previous);
  for (const item of fallbackItems) {
    if (!next.has(item.id)) next.set(item.id, item);
  }
  return next;
}
