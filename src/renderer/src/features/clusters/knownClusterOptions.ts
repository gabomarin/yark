import type { ServerProfile } from "@shared/types";

export type KnownClusterOption = {
  clusterId: string;
  clusterDir: string;
  label: string;
};

/**
 * Unique cluster IDs from the fleet for “join existing” pickers (create server).
 * Dedupes by `clusterId` only; when the same ID appears more than once, the first
 * seen `clusterDir` and label win.
 */
export function listKnownClusterOptions(
  servers: ServerProfile[],
  options?: { excludeServerId?: string; extra?: KnownClusterOption[] },
): KnownClusterOption[] {
  const excludeId = options?.excludeServerId;
  const byId = new Map<string, KnownClusterOption>();
  for (const candidate of servers) {
    if (excludeId !== undefined && candidate.id === excludeId) continue;
    if (candidate.clusterId === null || candidate.clusterDir === null) continue;
    if (byId.has(candidate.clusterId)) continue;
    byId.set(candidate.clusterId, {
      clusterId: candidate.clusterId,
      clusterDir: candidate.clusterDir,
      label: `${candidate.clusterId} · via ${candidate.name}`,
    });
  }
  for (const extra of options?.extra ?? []) {
    if (byId.has(extra.clusterId)) continue;
    byId.set(extra.clusterId, extra);
  }
  return Array.from(byId.values());
}
