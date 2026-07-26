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

export function resolveMembers(
  report: ClusterComplianceReport | null,
  serverById: Map<string, ServerProfile>,
): ServerProfile[] {
  if (report === null) return [];
  return report.members
    .map((id) => serverById.get(id))
    .filter((server): server is ServerProfile => server !== undefined);
}
