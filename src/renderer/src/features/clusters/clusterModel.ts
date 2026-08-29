import type { ClusterComplianceReport, ServerProfile } from "@shared/types";

export function formatCheckedAt(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return iso;
  return date.toLocaleString();
}

export function sharedClusterDir(members: ServerProfile[]): string | null {
  const dirs = [
    ...new Set(
      members
        .map((member) => member.clusterDir)
        .filter((dir): dir is string => dir !== null && dir.length > 0),
    ),
  ];
  if (dirs.length === 1) return dirs[0] ?? null;
  return null;
}

export function buildServerById(servers: ServerProfile[]): Map<string, ServerProfile> {
  const map = new Map<string, ServerProfile>();
  for (const server of servers) {
    map.set(server.id, server);
  }
  return map;
}

export function listDirWithoutIdServers(servers: ServerProfile[]): ServerProfile[] {
  return servers.filter(
    (server) =>
      server.clusterId === null &&
      server.clusterDir !== null &&
      server.clusterDir.length > 0,
  );
}

export function groupServersByClusterDir(
  servers: ServerProfile[],
): Array<{ dir: string; members: ServerProfile[] }> {
  const groups = new Map<string, ServerProfile[]>();
  for (const server of servers) {
    const dir = server.clusterDir ?? "";
    const list = groups.get(dir) ?? [];
    list.push(server);
    groups.set(dir, list);
  }
  return [...groups.entries()].map(([dir, members]) => ({ dir, members }));
}

export function sortClusterReports(
  reports: ClusterComplianceReport[],
): ClusterComplianceReport[] {
  return [...reports].sort((a, b) => {
    if (a.ok !== b.ok) return a.ok ? 1 : -1;
    return a.clusterId.localeCompare(b.clusterId);
  });
}

export function resolveActiveClusterId(
  sortedReports: ClusterComplianceReport[],
  selectedClusterId: string | null,
): string | null {
  if (
    selectedClusterId !== null &&
    sortedReports.some((report) => report.clusterId === selectedClusterId)
  ) {
    return selectedClusterId;
  }
  return sortedReports[0]?.clusterId ?? null;
}

export function summarizeClusterReports(reports: ClusterComplianceReport[]): {
  errorCount: number;
  warningOnlyCount: number;
} {
  return {
    errorCount: reports.filter((report) => !report.ok).length,
    warningOnlyCount: reports.filter(
      (report) =>
        report.ok && report.issues.some((issue) => issue.severity === "warning"),
    ).length,
  };
}

/** One sentence for the Clusters header — not a row of count chips (#470). */
export function formatClusterSummaryLine(input: {
  clusterCount: number;
  readyCount: number;
  errorCount: number;
  warningOnlyCount: number;
  unclusteredCount: number;
  dirWithoutIdCount: number;
}): string {
  const parts = [
    `${input.clusterCount} cluster${input.clusterCount === 1 ? "" : "s"}`,
    `${input.readyCount} ready`,
  ];
  if (input.errorCount > 0) {
    parts.push(`${input.errorCount} with errors`);
  }
  if (input.warningOnlyCount > 0) {
    parts.push(`${input.warningOnlyCount} with warnings`);
  }
  if (input.unclusteredCount > 0) {
    parts.push(
      `${input.unclusteredCount} server${input.unclusteredCount === 1 ? "" : "s"} not in a cluster`,
    );
  }
  if (input.dirWithoutIdCount > 0) {
    parts.push(
      `${input.dirWithoutIdCount} with directory but no Cluster ID`,
    );
  }
  return parts.join(" · ");
}

export function resolveMembers(
  report: ClusterComplianceReport | null,
  serverById: Map<string, ServerProfile>,
): ServerProfile[] {
  if (report === null) return [];
  return report.members
    .map((id) => serverById.get(id))
    .filter((server): server is ServerProfile => server !== undefined);
}
