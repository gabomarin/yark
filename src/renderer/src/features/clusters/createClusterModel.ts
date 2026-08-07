import {
  getWindowsPathError,
  normalizeWindowsPath,
} from "@shared/server-install-path";
import { findPortConflicts } from "@shared/port-conflicts";
import type {
  ServerProfile,
  ServerProfileInput,
  ServerStatus,
} from "@shared/types";
import { listDirWithoutIdServers, groupServersByClusterDir } from "./clusterModel";

/** Absolute Windows path (drive letter or UNC) — mirrors backend validation. */
const WINDOWS_ABS_PATH = /^(?:[a-zA-Z]:[\\/]|\\\\)/;

/** Unique default Cluster ID (operator can still type a human-readable name). */
export function suggestClusterId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  );
}

export type CreateClusterStep = 1 | 2 | 3;

export interface CreateClusterCandidate {
  server: ServerProfile;
  status: ServerStatus;
  eligible: boolean;
  reason: string | null;
}

export function resolveServerStatus(
  statuses: Map<string, { status: ServerStatus }>,
  serverId: string,
): ServerStatus {
  return statuses.get(serverId)?.status ?? "stopped";
}

export function ineligibilityReason(
  server: ServerProfile,
  status: ServerStatus,
): string | null {
  if (server.clusterId !== null) {
    return `Already in cluster “${server.clusterId}”`;
  }
  if (status !== "stopped") {
    return "Server must be stopped";
  }
  return null;
}

export function listCreateClusterCandidates(
  servers: ServerProfile[],
  statuses: Map<string, { status: ServerStatus }>,
): CreateClusterCandidate[] {
  return [...servers]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((server) => {
      const status = resolveServerStatus(statuses, server.id);
      const reason = ineligibilityReason(server, status);
      return {
        server,
        status,
        eligible: reason === null,
        reason,
      };
    });
}

export function toggleSelectedServerId(
  selectedIds: string[],
  serverId: string,
): string[] {
  return selectedIds.includes(serverId)
    ? selectedIds.filter((id) => id !== serverId)
    : [...selectedIds, serverId];
}

/** Drop ids that are no longer eligible (e.g. server started while the modal is open). */
export function pruneSelectedServerIds(
  selectedIds: string[],
  candidates: CreateClusterCandidate[],
): string[] {
  const eligibleIds = new Set(
    candidates
      .filter((candidate) => candidate.eligible)
      .map((candidate) => candidate.server.id),
  );
  return selectedIds.filter((id) => eligibleIds.has(id));
}

export function resolveSelectedCandidates(
  candidates: CreateClusterCandidate[],
  selectedIds: string[],
): CreateClusterCandidate[] {
  const selected = new Set(selectedIds);
  return candidates.filter(
    (candidate) => selected.has(candidate.server.id) && candidate.eligible,
  );
}

/** Prefill when every selected member already shares one cluster directory. */
export function sharedPrefillClusterDir(servers: ServerProfile[]): string | null {
  const dirs = [
    ...new Set(
      servers
        .map((server) => server.clusterDir)
        .filter((dir): dir is string => dir !== null && dir.length > 0),
    ),
  ];
  return dirs.length === 1 ? (dirs[0] ?? null) : null;
}

export function getSelectedMembersPortError(
  servers: ServerProfile[],
): string | null {
  if (servers.length < 2) return null;
  const conflicts = findPortConflicts(servers);
  if (conflicts.length === 0) return null;
  const first = conflicts[0]!;
  return `${first.serverA} and ${first.serverB} both use ${first.kind} port ${first.port}. Change ports before creating the cluster.`;
}

export function getClusterIdFormError(
  clusterId: string,
  clusterDir: string,
  servers: ServerProfile[],
): string | null {
  const value = clusterId.trim();
  if (value.length === 0) {
    return "Cluster ID is required.";
  }

  const members = servers.filter(
    (server) =>
      server.clusterId !== null &&
      server.clusterId.toLowerCase() === value.toLowerCase(),
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
  const mismatch = existingDirs.find(
    (dir) => dir.toLowerCase() !== proposed.toLowerCase(),
  );
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
    mods: server.mods,
    disabledMods: server.disabledMods ?? [],
    modMetadataCache: server.modMetadataCache ?? {},
    autoStart: server.autoStart,
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
