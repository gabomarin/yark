import type {
  ClusterComplianceIssue,
  ClusterComplianceReport,
  ServerProfile,
} from "@shared/types";
import { findPortConflicts } from "../instances/validation";

/**
 * Evalúa la consistencia de todos los clusters definidos entre perfiles.
 * Un cluster es transferible cuando: >= 2 miembros, mismo clusterDir,
 * sin conflictos de puertos entre miembros y mods consistentes.
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
        message: `El cluster "${clusterId}" tiene un solo miembro; las transferencias requieren al menos 2 mapas`,
      });
    }

    const dirs = new Set(members.map((m) => m.clusterDir ?? ""));
    if (dirs.size > 1) {
      issues.push({
        serverId: null,
        severity: "error",
        message: `Los miembros del cluster "${clusterId}" usan directorios de cluster distintos: ${[...dirs].join(" | ")}`,
      });
    }
    for (const m of members) {
      if (m.clusterDir === null || m.clusterDir.length === 0) {
        issues.push({
          serverId: m.id,
          severity: "error",
          message: `"${m.name}" no tiene directorio de cluster configurado`,
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
          message: `Hay ${names.length} servidores con el mapa ${map} en el mismo cluster (${names.join(", ")})`,
        });
      }
    }

    const portConflicts = findPortConflicts(members);
    for (const c of portConflicts) {
      issues.push({
        serverId: null,
        severity: "error",
        message: `Conflicto de puerto ${c.kind} ${c.port} entre "${c.serverA}" y "${c.serverB}"`,
      });
    }

    // Consistencia de mods: advertir si un miembro difiere del conjunto común.
    const modSignatures = new Set(
      members.map((m) => [...m.mods].sort().join(",")),
    );
    if (modSignatures.size > 1) {
      issues.push({
        serverId: null,
        severity: "warning",
        message: `Los miembros del cluster "${clusterId}" tienen listas de mods distintas; los ítems de mods pueden perderse al transferir`,
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
