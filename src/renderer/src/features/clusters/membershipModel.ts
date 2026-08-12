import { findPortConflicts } from "@shared/port-conflicts";
import type { ServerProfile, ServerProfileInput, ServerRuntimeInfo } from "@shared/types";
import type { ServerProcessRuntime } from "@shared/server-process-idle";
import { sharedClusterDir } from "./clusterModel";
import {
  buildCreateClusterInput,
  clusterProcessBusyReason,
  pruneSelectedServerIds,
  resolveSelectedCandidates,
  resolveServerRuntime,
  serverProfileToInput,
  toggleSelectedServerId,
  type CreateClusterCandidate,
} from "./createClusterModel";

export type MembershipCandidate = CreateClusterCandidate;

export {
  pruneSelectedServerIds,
  resolveSelectedCandidates,
  toggleSelectedServerId,
  buildCreateClusterInput,
  serverProfileToInput,
};

/** Add is allowed when the cluster has one shared directory (canonical ID is the report id). */
export function canAddServersToCluster(members: ServerProfile[]): boolean {
  return sharedClusterDir(members) !== null;
}

export function addIneligibilityReason(
  server: ServerProfile,
  runtime: ServerProcessRuntime,
  clusterId: string,
): string | null {
  if (server.clusterId !== null) {
    if (server.clusterId.toLowerCase() === clusterId.toLowerCase()) {
      return "Already in this cluster";
    }
    return `Already in cluster “${server.clusterId}”`;
  }
  return clusterProcessBusyReason(runtime);
}

export function listAddCandidates(
  clusterId: string,
  servers: ServerProfile[],
  statuses: Map<string, Pick<ServerRuntimeInfo, "status" | "processLive">>,
): MembershipCandidate[] {
  return [...servers]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((server) => {
      const runtime = resolveServerRuntime(statuses, server.id);
      const reason = addIneligibilityReason(server, runtime, clusterId);
      return {
        server,
        status: runtime.status,
        eligible: reason === null,
        reason,
      };
    });
}

export function removeIneligibilityReason(
  runtime: ServerProcessRuntime,
): string | null {
  return clusterProcessBusyReason(runtime);
}

export function listRemoveCandidates(
  members: ServerProfile[],
  statuses: Map<string, Pick<ServerRuntimeInfo, "status" | "processLive">>,
): MembershipCandidate[] {
  return [...members]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((server) => {
      const runtime = resolveServerRuntime(statuses, server.id);
      const reason = removeIneligibilityReason(runtime);
      return {
        server,
        status: runtime.status,
        eligible: reason === null,
        reason,
      };
    });
}

export function getJoinPortError(
  currentMembers: ServerProfile[],
  joining: ServerProfile[],
): string | null {
  if (joining.length === 0) return null;
  const conflicts = findPortConflicts([...currentMembers, ...joining]);
  if (conflicts.length === 0) return null;
  const first = conflicts[0]!;
  return `${first.serverA} and ${first.serverB} both use ${first.kind} port ${first.port}. Change ports before adding.`;
}

export function modsMayDiverge(
  currentMembers: ServerProfile[],
  joining: ServerProfile[],
): boolean {
  if (currentMembers.length === 0 || joining.length === 0) return false;
  const signature = (server: ServerProfile): string =>
    [...server.mods].map(String).sort().join(",");
  const baseline = signature(currentMembers[0]!);
  for (const member of currentMembers.slice(1)) {
    if (signature(member) !== baseline) return true;
  }
  return joining.some((server) => signature(server) !== baseline);
}

export function buildLeaveClusterInput(server: ServerProfile): ServerProfileInput {
  return {
    ...serverProfileToInput(server),
    clusterId: null,
    clusterDir: null,
  };
}

export function remainingMemberCountAfterRemove(
  memberCount: number,
  removeCount: number,
): number {
  return Math.max(0, memberCount - removeCount);
}
