import { getWindowsPathError, normalizeWindowsPath } from "@shared/server/server-install-path";
import { findPortConflicts } from "@shared/server/port-conflicts";
import {
  clusterProcessBusyReason as sharedClusterProcessBusyReason,
  type ServerProcessRuntime,
} from "@shared/server/server-process-idle";
import type { ServerProfile, ServerProfileInput, ServerRuntimeInfo, ServerStatus } from "@shared/types";
import { listDirWithoutIdServers, groupServersByClusterDir } from "./clusterModel";

/** Absolute Windows path (drive letter or UNC) — mirrors backend validation. */
const WINDOWS_ABS_PATH = /^(?:[a-zA-Z]:[\\/]|\\\\)/;

/** Cluster IDs already used on profiles (case-insensitive uniqueness). */
export function listKnownClusterIds(servers: ServerProfile[]): string[] {
  return [
    ...new Set(
      servers
        .map((server) => server.clusterId)
        .filter((id): id is string => id !== null && id.trim().length > 0)
        .map((id) => id.trim()),
    ),
  ];
}

/**
 * Short default Cluster ID (`yark-cluster-1`, then `yark-cluster-2`, …).
 * Pass current IDs so Generate bumps instead of repeating the slug.
 */
export function suggestClusterId(taken: Iterable<string> = []): string {
  const takenSet = new Set([...taken].map((id) => id.trim().toLowerCase()).filter((id) => id.length > 0));
  const prefix = "yark-cluster-";
  let n = 1;
  while (takenSet.has(`${prefix}${n}`)) {
    n += 1;
  }
  return `${prefix}${n}`;
}

export type CreateClusterStep = 1 | 2 | 3;

export interface CreateClusterCandidate {
  server: ServerProfile;
  status: ServerStatus;
  eligible: boolean;
  reason: string | null;
}

export function resolveServerRuntime(
  statuses: Map<string, Pick<ServerRuntimeInfo, "status" | "processLive">>,
  serverId: string,
): ServerProcessRuntime {
  const info = statuses.get(serverId);
  if (info === undefined) {
    return { status: "stopped", processLive: false };
  }
  return {
    status: info.status,
    processLive: info.processLive ?? false,
  };
}

/**
 * Cluster membership / template apply is safe when the ASA child is not live.
 * Idle `error` (process exited) is allowed (#276).
 */
export function clusterProcessBusyReason(runtime: ServerProcessRuntime): string | null {
  return sharedClusterProcessBusyReason(runtime);
}

export function ineligibilityReason(server: ServerProfile, runtime: ServerProcessRuntime): string | null {
  if (server.clusterId !== null) {
    return `Already in cluster “${server.clusterId}”`;
  }
  return clusterProcessBusyReason(runtime);
}

export function listCreateClusterCandidates(
  servers: ServerProfile[],
  statuses: Map<string, Pick<ServerRuntimeInfo, "status" | "processLive">>,
): CreateClusterCandidate[] {
  return [...servers]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((server) => {
      const runtime = resolveServerRuntime(statuses, server.id);
      const reason = ineligibilityReason(server, runtime);
      return {
        server,
        status: runtime.status,
        eligible: reason === null,
        reason,
      };
    });
}

export function toggleSelectedServerId(selectedIds: string[], serverId: string): string[] {
  return selectedIds.includes(serverId) ? selectedIds.filter((id) => id !== serverId) : [...selectedIds, serverId];
}

/** Drop ids that are no longer eligible (e.g. server started while the modal is open). */
export function pruneSelectedServerIds(selectedIds: string[], candidates: CreateClusterCandidate[]): string[] {
  const eligibleIds = new Set(
    candidates.filter((candidate) => candidate.eligible).map((candidate) => candidate.server.id),
  );
  return selectedIds.filter((id) => eligibleIds.has(id));
}

export function resolveSelectedCandidates(
  candidates: CreateClusterCandidate[],
  selectedIds: string[],
): CreateClusterCandidate[] {
  const selected = new Set(selectedIds);
  return candidates.filter((candidate) => selected.has(candidate.server.id) && candidate.eligible);
}

/** Prefill when every selected member already shares one cluster directory. */
export function sharedPrefillClusterDir(servers: ServerProfile[]): string | null {
  const dirs = [
    ...new Set(
      servers.map((server) => server.clusterDir).filter((dir): dir is string => dir !== null && dir.length > 0),
    ),
  ];
  return dirs.length === 1 ? (dirs[0] ?? null) : null;
}

export function getSelectedMembersPortError(servers: ServerProfile[]): string | null {
  if (servers.length < 2) return null;
  const conflicts = findPortConflicts(servers);
  if (conflicts.length === 0) return null;
  const first = conflicts[0]!;
  return `${first.serverA} and ${first.serverB} both use ${first.kind} port ${first.port}. Change ports before creating the cluster.`;
}

export function getClusterIdFormError(clusterId: string, clusterDir: string, servers: ServerProfile[]): string | null {
  const value = clusterId.trim();
  if (value.length === 0) {
    return "Cluster ID is required.";
  }

  const members = servers.filter(
    (server) => server.clusterId !== null && server.clusterId.toLowerCase() === value.toLowerCase(),
  );
  if (members.length === 0) {
    return null;
  }

  const existingDirs = [
    ...new Set(
      members
        .map((member) => member.clusterDir)
        .filter((dir): dir is string => dir !== null && dir.length > 0)
        .map((dir) => normalizeWindowsPath(dir)),
    ),
  ];
  const proposed = normalizeWindowsPath(clusterDir);
  const mismatch = existingDirs.find((dir) => dir.toLowerCase() !== proposed.toLowerCase());
  if (mismatch !== undefined) {
    return `ID already used with a different directory (${mismatch}).`;
  }
  return "A cluster with this ID already exists (case-insensitive).";
}

export function getClusterDirFormError(clusterDir: string): string | null {
  const trimmed = clusterDir.trim();
  if (trimmed.length === 0) {
    return "Cluster directory is required.";
  }
  const normalized = normalizeWindowsPath(trimmed);
  if (!WINDOWS_ABS_PATH.test(normalized)) {
    return "Use a Windows absolute path (e.g. D:\\ASA\\Clusters\\Ember).";
  }
  return getWindowsPathError(normalized, "Cluster directory");
}

export function listIncompleteClusterGroups(
  servers: ServerProfile[],
): Array<{ dir: string; members: ServerProfile[] }> {
  return groupServersByClusterDir(listDirWithoutIdServers(servers));
}

export function serverProfileToInput(server: ServerProfile): ServerProfileInput {
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
    mods: server.mods,
    disabledMods: server.disabledMods ?? [],
    modMetadataCache: server.modMetadataCache ?? {},
    autoStart: server.autoStart,
    useAsaApi: server.useAsaApi === true,
    useAsaApiLoader: server.useAsaApiLoader === true,
  };
}

export function buildCreateClusterInput(
  server: ServerProfile,
  clusterId: string,
  clusterDir: string,
): ServerProfileInput {
  return {
    ...serverProfileToInput(server),
    clusterId: clusterId.trim(),
    clusterDir: normalizeWindowsPath(clusterDir),
  };
}
