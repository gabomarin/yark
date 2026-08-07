import type { ServerProfile } from "@shared/types";

export type KnownClusterOption = {
  clusterId: string;
  clusterDir: string;
  label: string;
};

/**
 * Unique `{clusterId, clusterDir}` pairs from the fleet for “join existing”
 * pickers (create server). First server seen wins the label.
 */
export function listKnownClusterOptions(
  servers: ServerProfile[],
  options?: { excludeServerId?: string },
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
  return Array.from(byId.values());
}
