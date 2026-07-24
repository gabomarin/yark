import { findPortConflicts } from "@shared/port-conflicts";
import type {
  ClusterComplianceIssue,
  ClusterComplianceReport,
  ServerProfile,
} from "@shared/types";

/**
 * Evaluates consistency of all clusters defined across profiles.
 * A cluster is transferable when: >= 2 members, same clusterDir,
 * no port conflicts between members, and consistent mods.
 */
export function checkClusterCompliance(
  profiles: ServerProfile[],
): ClusterComplianceReport[] {
  const clusters = new Map<string, ServerProfile[]>();
  for (const p of profiles) {
    if (p.clusterId === null) continue;
    const members = clusters.get(p.clusterId) ?? [];
    members.push(p);
    clusters.set(p.clusterId, members);
  }

  const reports: ClusterComplianceReport[] = [];
  for (const [clusterId, members] of clusters) {
    const issues: ClusterComplianceIssue[] = [];

    if (members.length < 2) {
      issues.push({
        serverId: members[0]?.id ?? null,
        severity: "warning",
        message: `Cluster "${clusterId}" has only one member; transfers require at least 2 maps`,
      });
    }

    const dirs = new Set(members.map((m) => m.clusterDir ?? ""));
    if (dirs.size > 1) {
      issues.push({
        serverId: null,
        severity: "error",
        message: `Members of cluster "${clusterId}" use different cluster directories: ${[...dirs].join(" | ")}`,
      });
    }
    for (const m of members) {
      if (m.clusterDir === null || m.clusterDir.length === 0) {
        issues.push({
          serverId: m.id,
          severity: "error",
          message: `"${m.name}" has no cluster directory configured`,
        });
      }
    }

    const maps = new Map<string, string[]>();
    for (const m of members) {
      const list = maps.get(m.map) ?? [];
      list.push(m.name);
      maps.set(m.map, list);
    }
    for (const [map, names] of maps) {
      if (names.length > 1) {
        issues.push({
          serverId: null,
          severity: "warning",
          message: `There are ${names.length} servers with map ${map} in the same cluster (${names.join(", ")})`,
        });
      }
    }

    const portConflicts = findPortConflicts(members);
    for (const c of portConflicts) {
      issues.push({
        serverId: null,
        severity: "error",
        message: `${c.kind} port conflict ${c.port} between "${c.serverA}" and "${c.serverB}"`,
      });
    }

    // Mod consistency: warn if a member differs from the common set.
    const modSignatures = new Set(
      members.map((m) => [...m.mods].sort().join(",")),
    );
    if (modSignatures.size > 1) {
      issues.push({
        serverId: null,
        severity: "warning",
        message: `Members of cluster "${clusterId}" have different mod lists; mod items may be lost on transfer`,
      });
    }

    reports.push({
      clusterId,
      ok: !issues.some((i) => i.severity === "error"),
      members: members.map((m) => m.id),
      issues,
      checkedAt: new Date().toISOString(),
    });
  }
  return reports;
}
